import { useCallback,useEffect,useMemo,useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { slugify } from '../admin/helpers';
import { assignmentMatchesBlockAndTable,loadEventSetup } from '../data';
import { unique } from '../draw';
import { EventSetup } from '../pageTypes';
import { buildPlacementsFromPoints,getScoringInputs,parseNumeric,resolvePlacementForSave } from '../scoring';
import type {
BoardJudgeContext,
BoardMatch,
BoardMatchPlayer,
BoardPlayer
} from '../types';

export function AssignedTableMatchesPage({
  judgeId,
  context,
  selectedEventId,
  isMobile,
}: {
  judgeId: string;
  context: BoardJudgeContext;
  selectedEventId: string | null;
  isMobile: boolean;
}) {
  const [setup, setSetup] = useState<EventSetup | null>(null);
  const [players, setPlayers] = useState<BoardPlayer[]>([]);
  const [matches, setMatches] = useState<BoardMatch[]>([]);
  const [matchPlayers, setMatchPlayers] = useState<BoardMatchPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedStationKey, setSelectedStationKey] = useState('');
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [entries, setEntries] = useState<Array<{ id: string; seat: number; playerId: string; points: string; placement: string }>>([]);

  const eventAssignments = useMemo(
    () =>
      context.assignments.filter(
        (assignment) => assignment.event_id === selectedEventId && assignment.user_id === judgeId,
      ),
    [context.assignments, judgeId, selectedEventId],
  );

  useEffect(() => {
    if (!selectedEventId) {
      setSetup(null);
      setPlayers([]);
      setMatches([]);
      setMatchPlayers([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessage(null);

    void (async () => {
      try {
        const loadedSetup = await loadEventSetup(selectedEventId);
        const { data: playersData, error: playersError } = await supabase
          .from('board_player')
          .select('id, event_id, short_code, team_name, display_name, category_id, disqualified, created_at')
          .eq('event_id', selectedEventId);
        if (playersError) {
          throw playersError;
        }

        const { data: matchesData, error: matchesError } = await supabase
          .from('board_match')
          .select('id, event_id, category_id, block_id, round_number, table_number, created_by, created_at, status')
          .eq('event_id', selectedEventId)
          .eq('created_by', judgeId)
          .neq('status', 'void')
          .order('block_id', { ascending: true })
          .order('round_number', { ascending: true })
          .order('table_number', { ascending: true });
        if (matchesError) {
          throw matchesError;
        }

        const loadedMatches = (matchesData ?? []) as BoardMatch[];
        const matchIds = loadedMatches.map((match) => match.id);

        let loadedMatchPlayers: BoardMatchPlayer[] = [];
        if (matchIds.length > 0) {
          const { data: rowsData, error: rowsError } = await supabase
            .from('board_match_player')
            .select('id, match_id, player_id, seat, placement, points, created_at')
            .in('match_id', matchIds)
            .order('seat', { ascending: true });
          if (rowsError) {
            throw rowsError;
          }
          loadedMatchPlayers = (rowsData ?? []) as BoardMatchPlayer[];
        }

        if (cancelled) {
          return;
        }

        setSetup(loadedSetup);
        setPlayers((playersData ?? []) as BoardPlayer[]);
        setMatches(loadedMatches);
        setMatchPlayers(loadedMatchPlayers);
      } catch (loadError) {
        console.error('Failed to load assigned board matches', loadError);
        if (!cancelled) {
          setError('Nepodařilo se načíst rozpis partií.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [judgeId, selectedEventId]);

  const categories = setup?.categories ?? [];
  const games = setup?.games ?? [];
  const blocks = setup?.blocks ?? [];

  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const gameMap = useMemo(() => new Map(games.map((game) => [game.id, game])), [games]);
  const blockMap = useMemo(() => new Map(blocks.map((block) => [block.id, block])), [blocks]);
  const playerMap = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);

  const filteredMatchGroups = useMemo(() => {
    const grouped = new Map<string, BoardMatch[]>();
    const mismatched: BoardMatch[] = [];

    for (const match of matches) {
      const block = blockMap.get(match.block_id);
      if (!block) {
        continue;
      }

      const isAssigned = eventAssignments.some((assignment) =>
        assignmentMatchesBlockAndTable(assignment, block, match.table_number),
      );

      if (!isAssigned) {
        mismatched.push(match);
        continue;
      }

      const key = `${match.block_id}|${match.table_number ?? 0}`;
      const bucket = grouped.get(key) ?? [];
      bucket.push(match);
      grouped.set(key, bucket);
    }

    for (const bucket of grouped.values()) {
      bucket.sort((a, b) => (a.round_number ?? 0) - (b.round_number ?? 0));
    }

    return { grouped, mismatched };
  }, [blockMap, eventAssignments, matches]);

  const stationMatches = filteredMatchGroups.grouped;
  const mismatchedMatches = filteredMatchGroups.mismatched;

  const stationOptions = useMemo(
    () =>
      Array.from(stationMatches.entries())
        .map(([key, stationRows]) => {
          const firstMatch = stationRows[0];
          const block = blockMap.get(firstMatch.block_id);
          const category = block ? categoryMap.get(block.category_id) : null;
          const game = block ? gameMap.get(block.game_id) : null;
          return {
            key,
            blockNumber: block?.block_number ?? Number.MAX_SAFE_INTEGER,
            tableNumber: firstMatch.table_number ?? Number.MAX_SAFE_INTEGER,
            label: `${category?.name ?? firstMatch.category_id} · blok ${block?.block_number ?? '—'} · ${game?.name ?? 'Hra'} · stůl ${firstMatch.table_number ?? '—'}`,
          };
        })
        .sort(
          (a, b) =>
            a.blockNumber - b.blockNumber
            || a.tableNumber - b.tableNumber
            || a.label.localeCompare(b.label, 'cs'),
        )
        .map(({ key, label }) => ({ key, label })),
    [blockMap, categoryMap, gameMap, stationMatches],
  );

  const mismatchedStationLabels = useMemo(
    () =>
      unique(
        mismatchedMatches.map((match) => {
          const block = blockMap.get(match.block_id);
          const category = block ? categoryMap.get(block.category_id) : null;
          const game = block ? gameMap.get(block.game_id) : null;
          return `${category?.name ?? match.category_id} · blok ${block?.block_number ?? '—'} · ${game?.name ?? 'Hra'} · stůl ${match.table_number ?? '—'}`;
        }),
      ),
    [blockMap, categoryMap, gameMap, mismatchedMatches],
  );
  useEffect(() => {
    if (!stationOptions.length) {
      setSelectedStationKey('');
      return;
    }
    if (!selectedStationKey || !stationOptions.some((option) => option.key === selectedStationKey)) {
      setSelectedStationKey(stationOptions[0].key);
    }
  }, [selectedStationKey, stationOptions]);

  const selectedStationMatches = selectedStationKey ? stationMatches.get(selectedStationKey) ?? [] : [];
  const availableRounds = useMemo(
    () =>
      selectedStationMatches
        .map((match) => match.round_number ?? 0)
        .filter((round) => round > 0)
        .sort((a, b) => a - b),
    [selectedStationMatches],
  );

  useEffect(() => {
    if (!availableRounds.length) {
      setSelectedRound(null);
      return;
    }
    if (!selectedRound || !availableRounds.includes(selectedRound)) {
      setSelectedRound(availableRounds[0]);
    }
  }, [availableRounds, selectedRound]);

  const selectedMatch = useMemo(() => {
    if (!selectedRound) {
      return null;
    }
    return selectedStationMatches.find((match) => match.round_number === selectedRound) ?? null;
  }, [selectedRound, selectedStationMatches]);

  useEffect(() => {
    if (!selectedMatch) {
      setEntries([]);
      return;
    }
    const rows = matchPlayers
      .filter((row) => row.match_id === selectedMatch.id)
      .sort((a, b) => a.seat - b.seat)
      .map((row) => ({
        id: row.id,
        seat: row.seat,
        playerId: row.player_id,
        points: row.points === null ? '' : String(row.points),
        placement: row.placement === null ? '' : String(row.placement),
      }));
    setEntries(rows);
  }, [matchPlayers, selectedMatch]);

  const selectedBlock = selectedMatch ? blockMap.get(selectedMatch.block_id) ?? null : null;
  const selectedGame = selectedBlock ? gameMap.get(selectedBlock.game_id) ?? null : null;
  const selectedCategory = selectedBlock ? categoryMap.get(selectedBlock.category_id) ?? null : null;

  const scoringType = selectedGame?.scoring_type ?? 'both';
  const pointsOrder = selectedGame?.points_order ?? 'desc';
  const scoringInputs = getScoringInputs(scoringType);
  const placementsFromPoints = useMemo(
    () => buildPlacementsFromPoints(entries, pointsOrder),
    [entries, pointsOrder],
  );
  const gameKey = useMemo(
    () => slugify(selectedGame?.name ?? ''),
    [selectedGame?.name],
  );
  const gameRequiresManualTieBreak = gameKey === 'dobble' || gameKey === 'hop' || gameKey === 'ubongo';
  const hasTiedPoints = useMemo(() => {
    const frequencies = new Map<number, number>();
    for (const entry of entries) {
      const points = parseNumeric(entry.points);
      if (points === null) {
        continue;
      }
      frequencies.set(points, (frequencies.get(points) ?? 0) + 1);
    }
    return Array.from(frequencies.values()).some((count) => count > 1);
  }, [entries]);

  const validationError = useMemo(() => {
    if (!entries.length) {
      return 'Partie nemá načtené hráče.';
    }
    for (const entry of entries) {
      const points = parseNumeric(entry.points);
      const placement = parseNumeric(entry.placement);
      if (scoringType === 'points' && points === null) {
        return `Doplň body pro slot ${entry.seat}.`;
      }
      if (scoringType === 'placement' && placement === null) {
        return `Doplň umístění pro slot ${entry.seat}.`;
      }
      if (scoringType === 'both' && points === null) {
        return `Doplň body pro slot ${entry.seat}.`;
      }
    }
    return null;
  }, [entries, scoringType]);

  const handleChangeEntry = useCallback((rowId: string, field: 'points' | 'placement', value: string) => {
    setEntries((current) =>
      current.map((entry) =>
        entry.id === rowId
          ? {
            ...entry,
            [field]: value,
          }
          : entry,
      ),
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedMatch) {
      setError('Vyber partii.');
      return;
    }
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      for (const entry of entries) {
        const parsedPoints = parseNumeric(entry.points);
        const parsedPlacement = parseNumeric(entry.placement);
        const autoPlacement = placementsFromPoints.get(entry.id) ?? null;

        const { error: updateError } = await supabase
          .from('board_match_player')
          .update({
            points: parsedPoints,
            placement: resolvePlacementForSave({
              scoringType,
              parsedPoints,
              parsedPlacement,
              autoPlacement,
            }),
          })
          .eq('id', entry.id);
        if (updateError) {
          throw updateError;
        }
      }

      setMatchPlayers((current) =>
        current.map((row) => {
          const updated = entries.find((entry) => entry.id === row.id);
          if (!updated) {
            return row;
          }
          const parsedPoints = parseNumeric(updated.points);
          const parsedPlacement = parseNumeric(updated.placement);
          const autoPlacement = placementsFromPoints.get(updated.id) ?? null;
          return {
            ...row,
            points: parsedPoints,
            placement: resolvePlacementForSave({
              scoringType,
              parsedPoints,
              parsedPlacement,
              autoPlacement,
            }),
          };
        }),
      );
      setMessage('Výsledky partie byly uloženy.');
    } catch (saveError) {
      console.error('Failed to save board match results', saveError);
      setError('Nepodařilo se uložit výsledky partie.');
    } finally {
      setSaving(false);
    }
  }, [entries, placementsFromPoints, scoringType, selectedMatch, validationError]);

  const event = useMemo(
    () => context.events.find((item) => item.id === selectedEventId) ?? null,
    [context.events, selectedEventId],
  );

  if (!selectedEventId) {
    return (
      <section className="admin-card">
        <h2>Partie u stolu</h2>
        <p className="admin-card-subtitle">K tomuto účtu zatím není přiřazený žádný event.</p>
      </section>
    );
  }

  return (
    <section className="admin-card">
      <header className="admin-card-header">
        <div>
          <h2>Partie u stolu</h2>
          <p className="admin-card-subtitle">{event?.name ?? 'Event'} · vyber blok/stůl a kolo.</p>
        </div>
      </header>

      {loading ? <p className="admin-card-subtitle">Načítám partie…</p> : null}
      {error ? <p className="admin-error">{error}</p> : null}
      {message ? <p className="admin-success">{message}</p> : null}

      {!loading && stationOptions.length ? (
        <>
          <div className="deskovky-admin-grid">
            <label className="admin-field">
              <span>Blok / hra / stůl</span>
              <select value={selectedStationKey} onChange={(eventTarget) => setSelectedStationKey(eventTarget.target.value)}>
                {stationOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>Kolo</span>
              <div className="admin-card-actions deskovky-round-buttons">
                {availableRounds.map((round) => (
                  <button
                    key={round}
                    type="button"
                    className={`admin-button ${selectedRound === round ? 'admin-button--primary' : 'admin-button--secondary'}`}
                    onClick={() => setSelectedRound(round)}
                  >
                    {round}. partie
                  </button>
                ))}
              </div>
            </label>
          </div>

          {selectedMatch ? (
            <>
              <p className="admin-card-subtitle">
                Kategorie: <strong>{selectedCategory?.name ?? selectedMatch.category_id}</strong> · hra:{' '}
                <strong>{selectedGame?.name ?? selectedBlock?.game_id ?? '—'}</strong> · blok{' '}
                <strong>{selectedBlock?.block_number ?? '—'}</strong> · stůl{' '}
                <strong>{selectedMatch.table_number ?? '—'}</strong>
              </p>
              {scoringType !== 'placement' ? (
                <p className="admin-card-subtitle">
                  Pořadí se dopočítává automaticky z bodů ({pointsOrder === 'asc' ? 'nižší body jsou lepší' : 'vyšší body jsou lepší'}).
                </p>
              ) : null}
              {scoringType === 'both' && gameRequiresManualTieBreak && hasTiedPoints ? (
                <p className="admin-card-subtitle">
                  U této hry je při shodě bodů potřeba pořadí ručně upravit podle pravidel partie.
                </p>
              ) : null}

              {isMobile ? (
                <div className="deskovky-match-mobile-list">
                  {entries.map((entry) => {
                    const player = playerMap.get(entry.playerId);
                    return (
                      <article key={entry.id} className="deskovky-admin-mobile-card deskovky-match-mobile-card">
                        <h3>
                          Slot {entry.seat}: {player?.display_name || player?.short_code || entry.playerId}
                        </h3>
                        <p className="deskovky-admin-mobile-meta">
                          Oddíl: <strong>{player?.team_name ?? '—'}</strong>
                        </p>
                        <p className="deskovky-admin-mobile-meta">
                          Kód: <strong>{player?.short_code ?? '—'}</strong>
                        </p>
                        <div className="deskovky-match-mobile-inputs">
                          {scoringInputs.showPoints ? (
                            <label className="admin-field">
                              <span>Body</span>
                              <input
                                type="number"
                                step="0.5"
                                value={entry.points}
                                onChange={(eventTarget) => handleChangeEntry(entry.id, 'points', eventTarget.target.value)}
                              />
                            </label>
                          ) : null}
                          {scoringInputs.showPlacement ? (
                            <label className="admin-field">
                              <span>Pořadí</span>
                              {scoringType === 'placement' ? (
                                <input
                                  type="number"
                                  step="0.5"
                                  min={1}
                                  value={entry.placement}
                                  onChange={(eventTarget) => handleChangeEntry(entry.id, 'placement', eventTarget.target.value)}
                                />
                              ) : (
                                <input
                                  type="number"
                                  step="0.5"
                                  min={1}
                                  value={entry.placement !== '' ? entry.placement : (placementsFromPoints.get(entry.id) ?? '')}
                                  onChange={(eventTarget) => handleChangeEntry(entry.id, 'placement', eventTarget.target.value)}
                                  placeholder="auto"
                                  aria-label={`Pořadí pro slot ${entry.seat}`}
                                />
                              )}
                            </label>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="deskovky-table-wrap">
                  <table className="deskovky-table">
                    <thead>
                      <tr>
                        <th>Slot</th>
                        <th>Hráč</th>
                        <th>Oddíl</th>
                        <th>Kód</th>
                        {scoringInputs.showPoints ? <th>Body</th> : null}
                        {scoringInputs.showPlacement ? <th>Pořadí</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => {
                        const player = playerMap.get(entry.playerId);
                        return (
                          <tr key={entry.id}>
                            <td>{entry.seat}</td>
                            <td>{player?.display_name || player?.short_code || entry.playerId}</td>
                            <td>{player?.team_name ?? '—'}</td>
                            <td>{player?.short_code ?? '—'}</td>
                            {scoringInputs.showPoints ? (
                              <td>
                                <input
                                  type="number"
                                  step="0.5"
                                  value={entry.points}
                                  onChange={(eventTarget) => handleChangeEntry(entry.id, 'points', eventTarget.target.value)}
                                />
                              </td>
                            ) : null}
                            {scoringInputs.showPlacement ? (
                              <td>
                                {scoringType === 'placement' ? (
                                  <input
                                    type="number"
                                    step="0.5"
                                    min={1}
                                    value={entry.placement}
                                    onChange={(eventTarget) => handleChangeEntry(entry.id, 'placement', eventTarget.target.value)}
                                  />
                                ) : (
                                  <input
                                    type="number"
                                    step="0.5"
                                    min={1}
                                    value={
                                      entry.placement !== ''
                                        ? entry.placement
                                        : (placementsFromPoints.get(entry.id) ?? '')
                                    }
                                    onChange={(eventTarget) => handleChangeEntry(entry.id, 'placement', eventTarget.target.value)}
                                    placeholder="auto"
                                    aria-label={`Pořadí pro slot ${entry.seat}`}
                                  />
                                )}
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="admin-card-actions admin-card-actions--end">
                <button type="button" className="admin-button admin-button--primary" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? 'Ukládám…' : 'Uložit výsledky partie'}
                </button>
              </div>
            </>
          ) : (
            <p className="admin-card-subtitle">Pro vybrané kolo není dostupná partie.</p>
          )}
        </>
      ) : null}

      {!loading && !stationOptions.length ? (
        <>
          <p className="admin-card-subtitle">
            Nemáš přiřazené žádné vylosované partie. Požádej administrátora o losování a přiřazení stolu.
          </p>
          {mismatchedStationLabels.length ? (
            <p className="admin-error">
              Pozor: jsou nalezené partie s tvým účtem, ale mimo tvoje přiřazené stoly/kategorie (
              {mismatchedStationLabels.slice(0, 3).join('; ')}
              {mismatchedStationLabels.length > 3 ? '…' : ''}). Zkontroluj přiřazení stolu a spusť losování znovu.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
