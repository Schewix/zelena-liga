import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import QRScanner from '../../../components/QRScanner';
import { supabase } from '../../../supabaseClient';
import { slugify } from '../admin/helpers';
import { loadEventSetup } from '../data';
import { unique } from '../draw';
import { EventSetup,MatchEntry } from '../pageTypes';
import { parseBoardQrPayload } from '../qr';
import { buildInitialMatchEntries,getScoringInputs,parseNumeric } from '../scoring';
import type {
BoardJudgeContext,
BoardMatch,
BoardPlayer,
BoardScoringType
} from '../types';

export function NewMatchPage({
  judgeId,
  context,
  selectedEventId,
  onSelectEventId,
  isMobile,
}: {
  judgeId: string;
  context: BoardJudgeContext;
  selectedEventId: string | null;
  onSelectEventId: (eventId: string) => void;
  isMobile: boolean;
}) {
  const AUTO_CLOSE_SCANNER_AFTER_SCAN = true;
  const [setup, setSetup] = useState<EventSetup | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedBlockId, setSelectedBlockId] = useState<string>('');
  const [roundNumber, setRoundNumber] = useState('');

  const [entries, setEntries] = useState<MatchEntry[]>(() => buildInitialMatchEntries());
  const [manualCode, setManualCode] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [activeSeat, setActiveSeat] = useState(1);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const scanLockRef = useRef(false);
  const slotRefs = useRef<Record<number, HTMLElement | null>>({});
  const slotInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const event = useMemo(
    () => context.events.find((item) => item.id === selectedEventId) ?? null,
    [context.events, selectedEventId],
  );

  const eventAssignments = useMemo(
    () => context.assignments.filter((assignment) => assignment.event_id === selectedEventId),
    [context.assignments, selectedEventId],
  );

  useEffect(() => {
    if (!selectedEventId) {
      setSetup(null);
      setSetupError(null);
      return;
    }

    let cancelled = false;
    setSetupLoading(true);
    setSetupError(null);

    void (async () => {
      try {
        const loaded = await loadEventSetup(selectedEventId);
        if (cancelled) return;
        setSetup(loaded);
      } catch (loadError) {
        console.error('Failed to load board setup', loadError);
        if (cancelled) return;
        setSetup(null);
        setSetupError('Nepodařilo se načíst konfiguraci eventu.');
      } finally {
        if (!cancelled) {
          setSetupLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedEventId]);

  const categories = setup?.categories ?? [];
  const games = setup?.games ?? [];
  const blocks = setup?.blocks ?? [];

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const gameMap = useMemo(
    () => new Map(games.map((game) => [game.id, game])),
    [games],
  );

  const allowedBlocks = useMemo(() => {
    if (!blocks.length) {
      return [];
    }

    return blocks.filter((block) =>
      eventAssignments.some(
        (assignment) =>
          assignment.game_id === block.game_id &&
          (assignment.category_id === null || assignment.category_id === block.category_id),
      ),
    );
  }, [blocks, eventAssignments]);

  const allowedCategoryIds = useMemo(
    () => unique(allowedBlocks.map((block) => block.category_id)),
    [allowedBlocks],
  );

  const visibleBlocks = useMemo(() => {
    if (!selectedCategoryId) {
      return allowedBlocks;
    }
    return allowedBlocks.filter((block) => block.category_id === selectedCategoryId);
  }, [allowedBlocks, selectedCategoryId]);

  const selectedBlock = useMemo(
    () => visibleBlocks.find((block) => block.id === selectedBlockId) ?? null,
    [visibleBlocks, selectedBlockId],
  );

  const selectedGame = useMemo(
    () => (selectedBlock ? gameMap.get(selectedBlock.game_id) ?? null : null),
    [selectedBlock, gameMap],
  );

  const scoringType: BoardScoringType = selectedGame?.scoring_type ?? 'both';
  const scoringInputs = getScoringInputs(scoringType);
  const seatValidation = useMemo(
    () =>
      entries.map((entry) => {
        const errors: string[] = [];
        let pointsMissing = false;
        let placementMissing = false;

        if (!entry.player) {
          return {
            seat: entry.seat,
            missingPlayer: true,
            pointsMissing: false,
            placementMissing: false,
            errors: ['Načti hráče.'],
          };
        }

        const parsedPoints = parseNumeric(entry.points);
        const parsedPlacement = parseNumeric(entry.placement);

        if (scoringType === 'points' && parsedPoints === null) {
          pointsMissing = true;
          errors.push('Doplň body.');
        }

        if (scoringType === 'placement' && parsedPlacement === null) {
          placementMissing = true;
          errors.push('Doplň umístění.');
        }

        if (scoringType === 'both' && parsedPoints === null && parsedPlacement === null) {
          pointsMissing = true;
          placementMissing = true;
          errors.push('Zadej body nebo umístění.');
        }

        return {
          seat: entry.seat,
          missingPlayer: false,
          pointsMissing,
          placementMissing,
          errors,
        };
      }),
    [entries, scoringType],
  );
  const seatValidationMap = useMemo(() => new Map(seatValidation.map((item) => [item.seat, item])), [seatValidation]);
  const allSlotsFilled = useMemo(() => entries.every((entry) => entry.player !== null), [entries]);
  const hasDuplicatePlayers = useMemo(() => {
    const ids = entries
      .map((entry) => entry.player?.id)
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    return new Set(ids).size !== ids.length;
  }, [entries]);

  const roundError = useMemo(() => {
    if (!roundNumber.trim()) {
      return null;
    }
    const parsed = Number(roundNumber.trim());
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return 'Kolo musí být kladné celé číslo.';
    }
    return null;
  }, [roundNumber]);

  const submitDisabledReason = useMemo(() => {
    if (!selectedEventId) {
      return 'Vyber event.';
    }
    if (!selectedCategoryId) {
      return 'Vyber kategorii.';
    }
    if (!selectedBlockId) {
      return 'Vyber blok.';
    }
    if (hasDuplicatePlayers) {
      return 'Hráč je v zápase zadaný vícekrát.';
    }
    if (!allSlotsFilled) {
      return 'Načti 4 hráče do všech slotů.';
    }
    const invalidSeat = seatValidation.find((item) => item.errors.length > 0);
    if (invalidSeat) {
      return `Slot ${invalidSeat.seat}: ${invalidSeat.errors[0]}`;
    }
    if (roundError) {
      return roundError;
    }
    return null;
  }, [
    allSlotsFilled,
    hasDuplicatePlayers,
    roundError,
    seatValidation,
    selectedBlockId,
    selectedCategoryId,
    selectedEventId,
  ]);

  const canSubmit = submitDisabledReason === null && !saving;
  const mobileSubmitHelperText = useMemo(() => {
    if (saving) {
      return 'Ukládám zápas…';
    }
    if (!canSubmit) {
      return submitAttempted ? submitDisabledReason : 'Doplň 4 hráče a výsledky pro odeslání.';
    }
    return 'Vše připraveno k odeslání.';
  }, [canSubmit, saving, submitAttempted, submitDisabledReason]);

  useEffect(() => {
    if (!allowedCategoryIds.length) {
      setSelectedCategoryId('');
      return;
    }
    if (!selectedCategoryId || !allowedCategoryIds.includes(selectedCategoryId)) {
      setSelectedCategoryId(allowedCategoryIds[0]);
    }
  }, [allowedCategoryIds, selectedCategoryId]);

  useEffect(() => {
    if (!visibleBlocks.length) {
      setSelectedBlockId('');
      return;
    }
    if (!selectedBlockId || !visibleBlocks.some((block) => block.id === selectedBlockId)) {
      setSelectedBlockId(visibleBlocks[0].id);
    }
  }, [visibleBlocks, selectedBlockId]);

  useEffect(() => {
    if (!isMobile) {
      return;
    }
    const currentSeat = entries.find((entry) => entry.seat === activeSeat);
    if (currentSeat && !currentSeat.player) {
      return;
    }
    const nextEmpty = entries.find((entry) => !entry.player)?.seat;
    if (nextEmpty) {
      setActiveSeat(nextEmpty);
    }
  }, [activeSeat, entries, isMobile]);

  useEffect(() => {
    if (typeof document === 'undefined' || !scannerOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [scannerOpen]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 1600);
  }, []);

  const scrollToSeat = useCallback(
    (seat: number) => {
      if (!isMobile) {
        return;
      }
      const slot = slotRefs.current[seat];
      if (!slot) {
        return;
      }
      slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    [isMobile],
  );

  const focusSeatInput = useCallback(
    (seat: number) => {
      if (!isMobile) {
        return;
      }
      const input = slotInputRefs.current[seat];
      if (!input) {
        return;
      }
      input.focus({ preventScroll: true });
    },
    [isMobile],
  );

  const resetEntries = useCallback(() => {
    setEntries(buildInitialMatchEntries());
    setManualCode('');
    setScannerOpen(false);
    setScannerError(null);
    setActiveSeat(1);
    setSubmitAttempted(false);
    setError(null);
    setMessage(null);
  }, []);

  const loadPlayer = useCallback(
    async (rawCode: string, source: 'manual' | 'scan' = 'manual') => {
      if (!selectedEventId) {
        setError('Nejdřív vyber event.');
        return false;
      }

      const shortCode = rawCode.trim().toUpperCase();
      if (!shortCode) {
        setError('Zadej kód hráče.');
        return false;
      }

      const { data, error: playerError } = await supabase
        .from('board_player')
        .select('id, event_id, short_code, team_name, display_name, category_id, disqualified, created_at')
        .eq('event_id', selectedEventId)
        .eq('short_code', shortCode)
        .maybeSingle();

      if (playerError) {
        console.error('Failed to load board player', playerError);
        setError('Nepodařilo se načíst hráče.');
        return false;
      }

      if (!data) {
        setError(`Hráč s kódem ${shortCode} nebyl nalezen.`);
        return false;
      }

      const player = data as BoardPlayer;
      if (selectedCategoryId && player.category_id !== selectedCategoryId) {
        const categoryName = categoryMap.get(selectedCategoryId)?.name ?? 'vybrané kategorie';
        setError(`Hráč ${shortCode} nepatří do ${categoryName}.`);
        return false;
      }

      let duplicate = false;
      let full = false;
      let addedSeat: number | null = null;
      let nextSeat: number | null = null;

      setEntries((current) => {
        if (current.some((entry) => entry.player?.id === player.id)) {
          duplicate = true;
          return current;
        }

        const firstEmptyIndex = current.findIndex((entry) => entry.player === null);
        if (firstEmptyIndex < 0) {
          full = true;
          return current;
        }

        const next = [...current];
        next[firstEmptyIndex] = {
          ...next[firstEmptyIndex],
          player,
        };
        addedSeat = next[firstEmptyIndex].seat;
        nextSeat = next.find((entry) => entry.player === null)?.seat ?? null;
        return next;
      });

      if (duplicate) {
        setError(`Hráč ${shortCode} už je v zápase přidaný.`);
        showToast('Hráč už je v zápase');
        return false;
      }

      if (full || addedSeat === null) {
        setError('Všechny 4 sloty jsou obsazené.');
        return false;
      }

      const targetSeat = nextSeat ?? addedSeat;
      setActiveSeat(targetSeat);
      scrollToSeat(targetSeat);
      window.setTimeout(() => focusSeatInput(targetSeat), 180);
      setSubmitAttempted(false);
      setManualCode('');
      setError(null);
      setMessage(null);
      if (source === 'scan') {
        showToast('Hráč načten');
      }
      return true;
    },
    [categoryMap, focusSeatInput, scrollToSeat, selectedCategoryId, selectedEventId, showToast],
  );

  const handleManualAdd = useCallback(async () => {
    await loadPlayer(manualCode, 'manual');
  }, [loadPlayer, manualCode]);

  const handleQrResult = useCallback(
    (raw: string) => {
      if (scanLockRef.current) {
        return;
      }
      scanLockRef.current = true;

      void (async () => {
        try {
          const parsed = parseBoardQrPayload(raw);
          if (!parsed) {
            setError('QR kód není ve formátu Deskovek.');
            return;
          }

          if (parsed.eventSlug && event && slugify(event.slug) !== slugify(parsed.eventSlug)) {
            setMessage(`QR je z eventu ${parsed.eventSlug}, ale aktuálně je vybraný ${event.slug}.`);
          }

          setScannerError(null);
          const added = await loadPlayer(parsed.shortCode, 'scan');
          if (added && AUTO_CLOSE_SCANNER_AFTER_SCAN) {
            setScannerOpen(false);
          }
        } finally {
          window.setTimeout(() => {
            scanLockRef.current = false;
          }, 180);
        }
      })();
    },
    [event, loadPlayer],
  );

  const handleScannerError = useCallback(
    (scanError: Error) => {
      const raw = (scanError.message || '').toLowerCase();
      const permissionDenied =
        raw.includes('notallowederror') ||
        raw.includes('permission') ||
        raw.includes('denied') ||
        raw.includes('insecure context');
      const reason = permissionDenied
        ? 'Přístup ke kameře byl zamítnut. Povol kameru v prohlížeči.'
        : 'Skener nelze spustit. Zkontroluj kameru a oprávnění.';
      setScannerError(reason);
      showToast(reason);
    },
    [showToast],
  );

  const handleEntryChange = useCallback((seat: number, field: 'points' | 'placement', value: string) => {
    setEntries((current) =>
      current.map((entry) =>
        entry.seat === seat
          ? {
            ...entry,
            [field]: value,
          }
          : entry,
      ),
    );
  }, []);

  const handleRemovePlayer = useCallback((seat: number) => {
    setEntries((current) =>
      current.map((entry) =>
        entry.seat === seat
          ? {
            seat: entry.seat,
            player: null,
            points: '',
            placement: '',
          }
          : entry,
      ),
    );
    setActiveSeat(seat);
    setSubmitAttempted(false);
    scrollToSeat(seat);
  }, [scrollToSeat]);

  const handleSubmit = useCallback(async () => {
    setSubmitAttempted(true);
    setError(null);
    setMessage(null);

    if (submitDisabledReason) {
      setError(submitDisabledReason);
      return;
    }
    if (!selectedEventId || !selectedCategoryId || !selectedBlockId) {
      setError('Vyber event, kategorii a blok.');
      return;
    }

    const parsedRound = roundNumber.trim() ? Number(roundNumber.trim()) : null;
    setSaving(true);

    const { data: insertedMatch, error: insertMatchError } = await supabase
      .from('board_match')
      .insert({
        event_id: selectedEventId,
        category_id: selectedCategoryId,
        block_id: selectedBlockId,
        round_number: parsedRound,
        created_by: judgeId,
      })
      .select('id, event_id, category_id, block_id, round_number, table_number, created_by, created_at, status')
      .single();

    if (insertMatchError || !insertedMatch) {
      console.error('Failed to insert board match', insertMatchError);
      setSaving(false);
      setError('Uložení zápasu selhalo (hlavička).');
      return;
    }

    const match = insertedMatch as BoardMatch;

    const playerRows = entries.map((entry) => {
      const points = parseNumeric(entry.points);
      const placement = parseNumeric(entry.placement);
      return {
        match_id: match.id,
        player_id: entry.player!.id,
        seat: entry.seat,
        points,
        placement,
      };
    });

    const { error: insertPlayersError } = await supabase.from('board_match_player').insert(playerRows);

    if (insertPlayersError) {
      console.error('Failed to insert board match players', insertPlayersError);
      void supabase.from('board_match').update({ status: 'void' }).eq('id', match.id);
      setSaving(false);
      setError('Uložení zápasu selhalo (hráči).');
      return;
    }

    setSaving(false);
    setMessage('Zápas byl úspěšně uložen.');
    showToast('Zápas odeslán');
    setEntries(buildInitialMatchEntries());
    setSubmitAttempted(false);
    setActiveSeat(1);
    setScannerOpen(false);
    setError(null);

    if (parsedRound !== null) {
      setRoundNumber(String(parsedRound + 1));
    }
  }, [
    entries,
    judgeId,
    roundNumber,
    selectedBlockId,
    selectedCategoryId,
    selectedEventId,
    showToast,
    submitDisabledReason,
  ]);

  if (!selectedEventId) {
    return (
      <section className="admin-card">
        <h2>Nový zápas</h2>
        <p className="admin-card-subtitle">Nejdřív vyber event na úvodní stránce.</p>
      </section>
    );
  }

  return (
    <>
      <section className="admin-card deskovky-new-match-card">
        <header className="admin-card-header">
          <div>
            <h2>Nový zápas</h2>
            <p className="admin-card-subtitle">
              {event?.name ?? 'Event'} · načti 4 hráče a zapiš výsledek.
            </p>
          </div>
          <div className="admin-card-actions">
            {context.events.length > 1 ? (
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
            ) : null}
            <button type="button" className="admin-button admin-button--secondary" onClick={resetEntries}>
              Vyčistit formulář
            </button>
          </div>
        </header>

        {setupError ? <p className="admin-error">{setupError}</p> : null}
        {setupLoading ? <p className="admin-card-subtitle">Načítám konfiguraci…</p> : null}

        <div className="deskovky-new-match-grid">
          <label className="admin-field">
            <span>Kategorie</span>
            <select
              value={selectedCategoryId}
              onChange={(eventTarget) => setSelectedCategoryId(eventTarget.target.value)}
              disabled={!allowedCategoryIds.length}
            >
              {allowedCategoryIds.map((categoryId) => (
                <option key={categoryId} value={categoryId}>
                  {categoryMap.get(categoryId)?.name ?? categoryId}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-field">
            <span>Blok</span>
            <select
              value={selectedBlockId}
              onChange={(eventTarget) => setSelectedBlockId(eventTarget.target.value)}
              disabled={!visibleBlocks.length}
            >
              {visibleBlocks.map((block) => (
                <option key={block.id} value={block.id}>
                  Blok {block.block_number} · {gameMap.get(block.game_id)?.name ?? block.game_id}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-field">
            <span>Kolo / stůl (volitelné)</span>
            <input
              type="number"
              min={1}
              step={1}
              value={roundNumber}
              onChange={(eventTarget) => setRoundNumber(eventTarget.target.value)}
              placeholder="např. 3"
            />
          </label>
        </div>

        <div className="deskovky-scoring-hint">
          <strong>Typ bodování:</strong> {selectedGame?.name ?? '—'} ({scoringType})
        </div>

        <div className="deskovky-scanner-panel">
          <div className="deskovky-scanner-controls">
            <button
              type="button"
              className="admin-button admin-button--secondary"
              onClick={() => {
                setScannerError(null);
                setScannerOpen(true);
              }}
              aria-label="Spustit QR skener"
            >
              Spustit skener
            </button>
            <div className="deskovky-manual-input">
              <input
                type="text"
                value={manualCode}
                onChange={(eventTarget) => setManualCode(eventTarget.target.value.toUpperCase())}
                placeholder="Short code hráče"
                aria-label="Kód hráče pro ruční přidání"
              />
              <button
                type="button"
                className="admin-button admin-button--primary"
                onClick={() => void handleManualAdd()}
                aria-label="Přidat hráče podle kódu"
              >
                Přidat
              </button>
            </div>
          </div>
          {error ? <p className="admin-error deskovky-inline-error">{error}</p> : null}
        </div>

        {/* Scanner je modal: fullscreen na mobile, kompaktnější dialog na desktopu. */}
        {scannerOpen ? (
          <div className={`deskovky-scanner-modal ${isMobile ? 'deskovky-scanner-modal--mobile' : ''}`}>
            <button
              type="button"
              className="deskovky-scanner-backdrop"
              onClick={() => setScannerOpen(false)}
              aria-label="Zavřít QR skener"
            />
            <section className="deskovky-scanner-dialog" role="dialog" aria-modal="true" aria-label="QR skener">
              <header className="deskovky-scanner-dialog-header">
                <h3>QR skener hráčů</h3>
                <button
                  type="button"
                  className="admin-button admin-button--secondary"
                  onClick={() => setScannerOpen(false)}
                  aria-label="Zavřít QR skener"
                >
                  Zavřít
                </button>
              </header>
              {scannerError ? <p className="admin-error deskovky-inline-error">{scannerError}</p> : null}
              <QRScanner active={scannerOpen} onResult={handleQrResult} onError={handleScannerError} />
            </section>
          </div>
        ) : null}

        <div className={`deskovky-slots-grid ${isMobile ? 'deskovky-slots-grid--mobile' : ''}`}>
          {entries.map((entry) => {
            const code = entry.player?.short_code ?? 'Prázdný slot';
            const title = entry.player?.display_name || entry.player?.team_name || 'Nenačteno';
            const statusLabel = entry.player ? 'Načteno' : 'Chybí';
            const validation = seatValidationMap.get(entry.seat);
            const expanded = !isMobile || activeSeat === entry.seat;
            const invalid = submitAttempted && Boolean(validation?.errors.length);
            return (
              <article
                key={entry.seat}
                className={`deskovky-slot-card ${invalid ? 'deskovky-slot-card--invalid' : ''}`}
                ref={(node) => {
                  slotRefs.current[entry.seat] = node;
                }}
              >
                {/* Mobile: akordeon po slotech; desktop: všechny sloty otevřené ve 4 sloupcích. */}
                {isMobile ? (
                  <button
                    type="button"
                    className="deskovky-slot-toggle"
                    onClick={() => setActiveSeat(entry.seat)}
                    aria-expanded={expanded}
                    aria-controls={`deskovky-slot-content-${entry.seat}`}
                    aria-label={`Slot ${entry.seat} ${statusLabel}`}
                  >
                    <span className="deskovky-slot-toggle-meta">
                      <span>Slot {entry.seat}</span>
                      <span
                        className={`deskovky-slot-status ${entry.player ? 'deskovky-slot-status--loaded' : 'deskovky-slot-status--missing'
                          }`}
                      >
                        {statusLabel}
                      </span>
                    </span>
                    <strong>{title}</strong>
                    <span className="deskovky-slot-summary">{entry.player ? code : 'Nenačteno'}</span>
                  </button>
                ) : (
                  <header>
                    <span>Slot {entry.seat}</span>
                    {entry.player ? (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => handleRemovePlayer(entry.seat)}
                        aria-label={`Odebrat hráče ze slotu ${entry.seat}`}
                      >
                        Odebrat
                      </button>
                    ) : null}
                  </header>
                )}

                <div id={`deskovky-slot-content-${entry.seat}`} hidden={!expanded}>
                  {isMobile ? (
                    <div className="deskovky-slot-mobile-head">
                      <strong>{code}</strong>
                      {entry.player ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => handleRemovePlayer(entry.seat)}
                          aria-label={`Odebrat hráče ze slotu ${entry.seat}`}
                        >
                          Odebrat
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <strong>{code}</strong>
                  )}
                  <p className="admin-card-subtitle">{title}</p>

                  {scoringInputs.showPoints ? (
                    <label className="admin-field">
                      <span>Body</span>
                      <input
                        ref={(node) => {
                          slotInputRefs.current[entry.seat] = node;
                        }}
                        type="number"
                        step="0.5"
                        value={entry.points}
                        className={submitAttempted && validation?.pointsMissing ? 'deskovky-field-invalid' : ''}
                        onChange={(eventTarget) => handleEntryChange(entry.seat, 'points', eventTarget.target.value)}
                      />
                    </label>
                  ) : null}

                  {scoringInputs.showPlacement ? (
                    <label className="admin-field">
                      <span>Umístění</span>
                      <input
                        ref={
                          !scoringInputs.showPoints
                            ? (node) => {
                              slotInputRefs.current[entry.seat] = node;
                            }
                            : undefined
                        }
                        type="number"
                        step="0.5"
                        min="1"
                        value={entry.placement}
                        className={submitAttempted && validation?.placementMissing ? 'deskovky-field-invalid' : ''}
                        onChange={(eventTarget) => handleEntryChange(entry.seat, 'placement', eventTarget.target.value)}
                      />
                    </label>
                  ) : null}

                  {submitAttempted && validation?.errors.length ? (
                    <p className="admin-error deskovky-slot-error">{validation.errors[0]}</p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        {!isMobile ? (
          <div className="admin-card-actions admin-card-actions--end deskovky-submit-row">
            <button
              type="button"
              className="admin-button admin-button--primary"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
            >
              {saving ? 'Ukládám…' : 'Odeslat zápas'}
            </button>
          </div>
        ) : null}

        {message ? <p className="admin-success">{message}</p> : null}
        {error ? <p className="admin-error deskovky-form-error">{error}</p> : null}

        {isMobile ? (
          <div className="deskovky-mobile-submitbar" role="region" aria-label="Odeslání zápasu">
            <p className="deskovky-mobile-submit-note" title={mobileSubmitHelperText ?? undefined}>
              {mobileSubmitHelperText}
            </p>
            <button
              type="button"
              className="admin-button admin-button--primary"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
            >
              {saving ? 'Ukládám…' : 'Odeslat zápas'}
            </button>
          </div>
        ) : null}
      </section>

      {toast ? (
        <div className="deskovky-toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </>
  );
}
