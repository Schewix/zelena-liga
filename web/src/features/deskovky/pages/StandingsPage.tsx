import { useEffect,useMemo,useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { loadEventSetup } from '../data';
import { EventSetup } from '../pageTypes';
import type {
BoardGameStanding,
BoardJudgeContext,
BoardMatch,
BoardOverallStanding,
BoardPlayer,
BoardScoringType
} from '../types';

export function StandingsPage({
  context,
  selectedEventId,
  onSelectEventId,
  isMobile,
}: {
  context: BoardJudgeContext;
  selectedEventId: string | null;
  onSelectEventId: (eventId: string) => void;
  isMobile: boolean;
}) {
  const [setup, setSetup] = useState<EventSetup | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [gameStandings, setGameStandings] = useState<BoardGameStanding[]>([]);
  const [overallStandings, setOverallStandings] = useState<BoardOverallStanding[]>([]);
  const [players, setPlayers] = useState<BoardPlayer[]>([]);
  const [playedMatchesByGamePlayer, setPlayedMatchesByGamePlayer] = useState<Record<string, number>>({});
  const [totalMatchesByGame, setTotalMatchesByGame] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const event = useMemo(
    () => context.events.find((item) => item.id === selectedEventId) ?? null,
    [context.events, selectedEventId],
  );

  useEffect(() => {
    if (!selectedEventId) {
      setSetup(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadEventSetup(selectedEventId);
        if (!cancelled) {
          setSetup(loaded);
        }
      } catch (loadError) {
        console.error('Failed to load standings setup', loadError);
        if (!cancelled) {
          setSetup(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedEventId]);

  const categories = setup?.categories ?? [];
  const games = setup?.games ?? [];

  const gameMap = useMemo(
    () => new Map(games.map((game) => [game.id, game])),
    [games],
  );
  const blockGameMap = useMemo(
    () => new Map((setup?.blocks ?? []).map((block) => [block.id, block.game_id])),
    [setup?.blocks],
  );
  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
  );
  const primaryGameLabel = useMemo(() => {
    if (!selectedCategory?.primary_game_id) {
      return null;
    }
    return gameMap.get(selectedCategory.primary_game_id)?.name ?? selectedCategory.primary_game_id;
  }, [gameMap, selectedCategory]);

  const playerMap = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  );

  useEffect(() => {
    if (!categories.length) {
      setSelectedCategoryId('');
      return;
    }
    if (!selectedCategoryId || !categories.some((category) => category.id === selectedCategoryId)) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  useEffect(() => {
    if (!selectedEventId || !selectedCategoryId) {
      setGameStandings([]);
      setOverallStandings([]);
      setPlayers([]);
      setPlayedMatchesByGamePlayer({});
      setTotalMatchesByGame({});
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      const [gameRes, overallRes, playerRes, matchRes] = await Promise.all([
        supabase
          .from('board_game_standings')
          .select('event_id, category_id, game_id, player_id, matches_played, total_points, avg_placement, best_placement, placement_sum, game_rank')
          .eq('event_id', selectedEventId)
          .eq('category_id', selectedCategoryId)
          .order('game_id', { ascending: true }),
        supabase
          .from('board_overall_standings')
          .select('event_id, category_id, player_id, primary_game_id, games_counted, overall_score, game_breakdown, overall_rank')
          .eq('event_id', selectedEventId)
          .eq('category_id', selectedCategoryId)
          .order('overall_rank', { ascending: true }),
        supabase
          .from('board_player')
          .select('id, event_id, short_code, team_name, display_name, category_id, disqualified, created_at')
          .eq('event_id', selectedEventId)
          .eq('category_id', selectedCategoryId)
          .order('short_code', { ascending: true }),
        supabase
          .from('board_match')
          .select('id, block_id, round_number, status')
          .eq('event_id', selectedEventId)
          .eq('category_id', selectedCategoryId)
          .neq('status', 'void'),
      ]);

      if (cancelled) {
        return;
      }

      setLoading(false);

      if (gameRes.error || overallRes.error || playerRes.error || matchRes.error) {
        console.error('Failed to load standings', gameRes.error, overallRes.error, playerRes.error, matchRes.error);
        setError('Nepodařilo se načíst průběžné pořadí.');
        setPlayedMatchesByGamePlayer({});
        setTotalMatchesByGame({});
        return;
      }

      const matches = (matchRes.data ?? []) as Array<Pick<BoardMatch, 'id' | 'block_id' | 'round_number' | 'status'>>;
      const roundsByGame = new Map<string, Set<number>>();
      const matchMetaById = new Map<string, { gameId: string; scoringType: BoardScoringType }>();
      for (const match of matches) {
        const gameId = blockGameMap.get(match.block_id);
        if (!gameId) {
          continue;
        }
        const game = gameMap.get(gameId);
        if (!game) {
          continue;
        }
        matchMetaById.set(match.id, { gameId, scoringType: game.scoring_type });
        if (typeof match.round_number === 'number') {
          const currentRounds = roundsByGame.get(gameId) ?? new Set<number>();
          currentRounds.add(match.round_number);
          roundsByGame.set(gameId, currentRounds);
        }
      }

      const totalByGame: Record<string, number> = {};
      roundsByGame.forEach((rounds, gameId) => {
        totalByGame[gameId] = rounds.size;
      });

      const playedByGamePlayer: Record<string, number> = {};
      if (matchMetaById.size) {
        const { data: matchPlayerData, error: matchPlayerError } = await supabase
          .from('board_match_player')
          .select('match_id, player_id, points, placement')
          .in('match_id', Array.from(matchMetaById.keys()));

        if (cancelled) {
          return;
        }

        if (matchPlayerError) {
          console.error('Failed to load match rows for standings', matchPlayerError);
          setError('Nepodařilo se načíst průběžné pořadí.');
          setPlayedMatchesByGamePlayer({});
          setTotalMatchesByGame({});
          return;
        }

        for (const row of (matchPlayerData ?? []) as Array<{
          match_id: string;
          player_id: string;
          points: number | null;
          placement: number | null;
        }>) {
          const matchMeta = matchMetaById.get(row.match_id);
          if (!matchMeta) {
            continue;
          }

          const hasPoints = row.points !== null;
          const hasPlacement = row.placement !== null;
          const isCompleted = matchMeta.scoringType === 'points'
            ? hasPoints
            : matchMeta.scoringType === 'placement'
              ? hasPlacement
              : hasPoints || hasPlacement;

          if (!isCompleted) {
            continue;
          }

          const key = `${matchMeta.gameId}:${row.player_id}`;
          playedByGamePlayer[key] = (playedByGamePlayer[key] ?? 0) + 1;
        }
      }

      setGameStandings((gameRes.data ?? []) as BoardGameStanding[]);
      setOverallStandings((overallRes.data ?? []) as BoardOverallStanding[]);
      setPlayers((playerRes.data ?? []) as BoardPlayer[]);
      setPlayedMatchesByGamePlayer(playedByGamePlayer);
      setTotalMatchesByGame(totalByGame);
    })();

    return () => {
      cancelled = true;
    };
  }, [blockGameMap, gameMap, selectedCategoryId, selectedEventId]);

  const perGame = useMemo(() => {
    const grouped = new Map<string, BoardGameStanding[]>();
    gameStandings.forEach((standing) => {
      const current = grouped.get(standing.game_id) ?? [];
      current.push(standing);
      grouped.set(standing.game_id, current);
    });

    const toPlacementSum = (row: BoardGameStanding): number => {
      if (row.placement_sum !== null) {
        return Number(row.placement_sum);
      }
      if (row.avg_placement !== null) {
        return Number(row.avg_placement) * Number(row.matches_played);
      }
      return Number.POSITIVE_INFINITY;
    };

    grouped.forEach((rows, gameId) => {
      const game = gameMap.get(gameId);
      const pointsOrder = game?.points_order ?? 'desc';
      rows.sort((left, right) => {
        const leftPlacementSum = toPlacementSum(left);
        const rightPlacementSum = toPlacementSum(right);
        if (leftPlacementSum !== rightPlacementSum) {
          return leftPlacementSum - rightPlacementSum;
        }

        const leftPoints = left.total_points;
        const rightPoints = right.total_points;
        if (leftPoints !== null && rightPoints !== null && leftPoints !== rightPoints) {
          return pointsOrder === 'asc' ? leftPoints - rightPoints : rightPoints - leftPoints;
        }
        if (leftPoints === null && rightPoints !== null) {
          return 1;
        }
        if (leftPoints !== null && rightPoints === null) {
          return -1;
        }

        const leftPlayer = playerMap.get(left.player_id);
        const rightPlayer = playerMap.get(right.player_id);
        const leftLabel = leftPlayer?.display_name || leftPlayer?.team_name || left.player_id;
        const rightLabel = rightPlayer?.display_name || rightPlayer?.team_name || right.player_id;
        return leftLabel.localeCompare(rightLabel, 'cs');
      });
    });

    return grouped;
  }, [gameMap, gameStandings, playerMap]);

  const completedGamesByPlayer = useMemo(() => {
    const counts = new Map<string, number>();
    for (const gameId of perGame.keys()) {
      for (const player of players) {
        const played = playedMatchesByGamePlayer[`${gameId}:${player.id}`] ?? 0;
        if (played > 0) {
          counts.set(player.id, (counts.get(player.id) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [perGame, playedMatchesByGamePlayer, players]);

  if (!context.events.length) {
    return (
      <section className="admin-card">
        <h2>Průběžné pořadí</h2>
        <p className="admin-card-subtitle">Nejsou dostupné žádné eventy.</p>
      </section>
    );
  }

  return (
    <>
      <section className="admin-card deskovky-toolbar deskovky-toolbar--sticky-mobile deskovky-toolbar--standings">
        <div className="deskovky-toolbar-left">
          <h2>Průběžné pořadí</h2>
          <p className="admin-card-subtitle">Přehled po hrách a celkové pořadí kategorie.</p>
        </div>
        <div className="deskovky-toolbar-actions">
          <label className="admin-field deskovky-event-select">
            <span>Event</span>
            <select
              value={selectedEventId ?? ''}
              onChange={(eventTarget) => onSelectEventId(eventTarget.target.value)}
            >
              {context.events.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field deskovky-event-select">
            <span>Kategorie</span>
            <select
              value={selectedCategoryId}
              onChange={(eventTarget) => setSelectedCategoryId(eventTarget.target.value)}
              disabled={!categories.length}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="admin-card">
        <h2>Celkové pořadí</h2>
        <p className="admin-card-subtitle">
          {event?.name ?? 'Event'} · součet pořadí všech her v kategorii (nižší součet je lepší)
          {primaryGameLabel ? ` · hlavní hra: ${primaryGameLabel}` : ''}.
        </p>

        {loading ? <p className="admin-card-subtitle">Načítám pořadí…</p> : null}
        {error ? <p className="admin-error">{error}</p> : null}

        {overallStandings.length ? (
          // Mobile používá karty místo široké tabulky kvůli čitelnosti bez horizontálního scrollu.
          isMobile ? (
            <div className="deskovky-standings-cards">
              {overallStandings.map((row) => {
                const player = playerMap.get(row.player_id);
                const label = player?.display_name || player?.team_name || row.player_id;
                const hasAnyResults = (completedGamesByPlayer.get(row.player_id) ?? 0) > 0;
                const breakdown = (row.game_breakdown ?? [])
                  .map((item) => {
                    const gameName = item.game_name || gameMap.get(item.game_id)?.name || item.game_id;
                    return `${item.is_primary ? '★ ' : ''}${gameName}: ${item.game_rank}`;
                  })
                  .join(' · ');
                const totalGames = perGame.size || row.games_counted;
                return (
                  <article key={`overall-${row.player_id}`} className="deskovky-standings-card">
                    <h3>
                      {hasAnyResults ? `${row.overall_rank}.` : '—'} {label}
                    </h3>
                    <p>
                      <strong>Součet pořadí:</strong> {hasAnyResults ? row.overall_score : '—'}
                    </p>
                    <p>
                      <strong>Odehráno:</strong> {row.games_counted}/{totalGames}
                    </p>
                    <p>
                      <strong>Oddíl:</strong> {player?.team_name ?? '—'}
                    </p>
                    <p>
                      <strong>Hry:</strong> {breakdown || '—'}
                    </p>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="deskovky-table-wrap">
              <table className="deskovky-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Hráč</th>
                    <th>Oddíl</th>
                    <th>Součet umístění</th>
                    <th>Hry</th>
                  </tr>
                </thead>
                <tbody>
                  {overallStandings.map((row) => {
                    const player = playerMap.get(row.player_id);
                    const label = player?.display_name || player?.team_name || row.player_id;
                    const hasAnyResults = (completedGamesByPlayer.get(row.player_id) ?? 0) > 0;
                    const breakdown = (row.game_breakdown ?? [])
                      .map((item) => {
                        const gameName = item.game_name || gameMap.get(item.game_id)?.name || item.game_id;
                        return `${item.is_primary ? '★ ' : ''}${gameName}: ${item.game_rank}`;
                      })
                      .join(' · ');
                    return (
                      <tr key={`overall-${row.player_id}`}>
                        <td>{hasAnyResults ? row.overall_rank : '—'}</td>
                        <td>{label}</td>
                        <td>{player?.team_name ?? '—'}</td>
                        <td>{hasAnyResults ? row.overall_score : '—'}</td>
                        <td>{breakdown || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <p className="admin-card-subtitle">Zatím nejsou k dispozici žádná data.</p>
        )}
      </section>

      {[...perGame.entries()].map(([gameId, standings]) => {
        const game = gameMap.get(gameId);
        return (
          <section key={gameId} className="admin-card">
            <h2>{game?.name ?? gameId}</h2>
            <p className="admin-card-subtitle">Typ bodování: {game?.scoring_type ?? '—'}</p>
            {isMobile ? (
              <div className="deskovky-standings-cards">
                {standings.map((row, index) => {
                  const player = playerMap.get(row.player_id);
                  const label = player?.display_name || player?.team_name || row.player_id;
                  const placementSum = row.placement_sum !== null
                    ? Number(row.placement_sum)
                    : row.avg_placement !== null
                      ? Number(row.avg_placement) * Number(row.matches_played)
                      : null;
                  const playedMatches = playedMatchesByGamePlayer[`${gameId}:${row.player_id}`] ?? 0;
                  const totalMatches = totalMatchesByGame[gameId] ?? row.matches_played;
                  return (
                    <article key={`${gameId}-${row.player_id}`} className="deskovky-standings-card">
                      <h3>
                        {index + 1}. {label}
                      </h3>
                      <p>
                        <strong>Součet pořadí:</strong> {placementSum ?? '—'}
                      </p>
                      <p>
                        <strong>Odehráno:</strong> {playedMatches}/{totalMatches}
                      </p>
                      <p>
                        <strong>Body:</strong> {row.total_points ?? '—'}
                      </p>
                      <p>
                        <strong>Oddíl:</strong> {player?.team_name ?? '—'}
                      </p>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="deskovky-table-wrap">
                <table className="deskovky-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Hráč</th>
                      <th>Oddíl</th>
                      <th>Body</th>
                      <th>Součet pořadí</th>
                      <th>Počet partií</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((row, index) => {
                      const player = playerMap.get(row.player_id);
                      const label = player?.display_name || player?.team_name || row.player_id;
                      const placementSum = row.placement_sum !== null
                        ? Number(row.placement_sum)
                        : row.avg_placement !== null
                          ? Number(row.avg_placement) * Number(row.matches_played)
                          : null;
                      const playedMatches = playedMatchesByGamePlayer[`${gameId}:${row.player_id}`] ?? 0;
                      const totalMatches = totalMatchesByGame[gameId] ?? row.matches_played;
                      return (
                        <tr key={`${gameId}-${row.player_id}`}>
                          <td>{index + 1}</td>
                          <td>{label}</td>
                          <td>{player?.team_name ?? '—'}</td>
                          <td>{row.total_points ?? '—'}</td>
                          <td>{placementSum ?? '—'}</td>
                          <td>{playedMatches}/{totalMatches}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
