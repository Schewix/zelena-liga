import { useCallback,useEffect,useMemo,useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { BOARD_DRAW_MAX_PLAYERS_PER_BLOCK,BOARD_DRAW_MAX_TABLES_PER_GAME,buildSameTeamPairStats,planCategoryDraw,yieldToBrowser } from '../draw';
import { AdminSectionHeaderConfig,AdminSectionKey } from '../pageTypes';
import { escapeCsv,parseCsv,randomShortCode } from '../playerImport';
import { buildBoardQrPayload } from '../qr';
import type {
BoardAdminJudge,
BoardBlock,
BoardCategory,
BoardEvent,
BoardGame,
BoardJudgeAssignment,
BoardMatch,
BoardPlayer,
BoardPointsOrder,
BoardScoringType
} from '../types';
import { useIsMobileBreakpoint } from '../useIsMobileBreakpoint';
import { boardEventMutationErrorMessage,slugify } from './helpers';
import { ADMIN_SECTION_ITEMS,adminSectionHash,resolveAdminSectionFromHash } from './navigation';

export function AdminPage({
  selectedEventId,
  onSelectEventId,
  isMobile,
}: {
  selectedEventId: string | null;
  onSelectEventId: (eventId: string) => void;
  isMobile: boolean;
}) {
  const isTabletOrMobile = useIsMobileBreakpoint(1024);
  const isCompactAdminNav = isMobile || isTabletOrMobile;
  const [activeSection, setActiveSection] = useState<AdminSectionKey>(() => {
    if (typeof window === 'undefined') {
      return 'overview';
    }
    return resolveAdminSectionFromHash(window.location.hash);
  });

  const [events, setEvents] = useState<BoardEvent[]>([]);
  const [categories, setCategories] = useState<BoardCategory[]>([]);
  const [games, setGames] = useState<BoardGame[]>([]);
  const [blocks, setBlocks] = useState<BoardBlock[]>([]);
  const [players, setPlayers] = useState<BoardPlayer[]>([]);
  const [assignments, setAssignments] = useState<BoardJudgeAssignment[]>([]);
  const [judges, setJudges] = useState<BoardAdminJudge[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [eventName, setEventName] = useState('');
  const [eventSlug, setEventSlug] = useState('');
  const [eventStartDate, setEventStartDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryPrimaryGameId, setNewCategoryPrimaryGameId] = useState('');
  const [newGameName, setNewGameName] = useState('');
  const [newGameScoringType, setNewGameScoringType] = useState<BoardScoringType>('points');
  const [newGamePointsOrder, setNewGamePointsOrder] = useState<BoardPointsOrder>('desc');
  const [newGameThreePlayerAdjustment, setNewGameThreePlayerAdjustment] = useState(false);
  const [newGameNotes, setNewGameNotes] = useState('');

  const [newBlockCategoryId, setNewBlockCategoryId] = useState('');
  const [newBlockGameId, setNewBlockGameId] = useState('');
  const [newBlockNumber, setNewBlockNumber] = useState('1');

  const [csvInput, setCsvInput] = useState('');
  const [autoGenerateCodes, setAutoGenerateCodes] = useState(true);

  const [newAssignmentUserId, setNewAssignmentUserId] = useState('');
  const [newAssignmentGameId, setNewAssignmentGameId] = useState('');
  const [newAssignmentCategoryId, setNewAssignmentCategoryId] = useState('');
  const [newAssignmentTableNumber, setNewAssignmentTableNumber] = useState('1');

  const [playerSearch, setPlayerSearch] = useState('');
  const [playerCategoryFilter, setPlayerCategoryFilter] = useState('');
  const [selectedDisqualifyPlayerId, setSelectedDisqualifyPlayerId] = useState('');
  const [playerPage, setPlayerPage] = useState(1);
  const [playerPageSize, setPlayerPageSize] = useState(50);
  const [gameSearch, setGameSearch] = useState('');
  const [gameScoringFilter, setGameScoringFilter] = useState<'all' | BoardScoringType>('all');
  const [assignmentJudgeFilter, setAssignmentJudgeFilter] = useState('');
  const [assignmentGameFilter, setAssignmentGameFilter] = useState('');
  const [drawSummary, setDrawSummary] = useState<string | null>(null);
  const [drawRunning, setDrawRunning] = useState(false);
  const [drawProgress, setDrawProgress] = useState<{ label: string; current: number; total: number } | null>(null);

  const activeSectionLabel = useMemo(
    () => ADMIN_SECTION_ITEMS.find((item) => item.key === activeSection)?.label ?? 'Přehled',
    [activeSection],
  );

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const gameMap = useMemo(
    () => new Map(games.map((game) => [game.id, game])),
    [games],
  );

  const judgesMap = useMemo(
    () => new Map(judges.map((judge) => [judge.id, judge])),
    [judges],
  );

  const loadEvents = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('board_event')
      .select('id, slug, name, start_date, end_date, created_at')
      .order('start_date', { ascending: false, nullsFirst: false });

    if (loadError) {
      throw loadError;
    }

    const list = (data ?? []) as BoardEvent[];
    setEvents(list);

    if (!selectedEventId && list.length > 0) {
      onSelectEventId(list[0].id);
    }
  }, [onSelectEventId, selectedEventId]);

  const loadEventDetail = useCallback(async () => {
    if (!selectedEventId) {
      setCategories([]);
      setGames([]);
      setBlocks([]);
      setPlayers([]);
      setAssignments([]);
      return;
    }

    const [categoryRes, gameRes, blockRes, playerRes, assignmentRes, judgesRes] = await Promise.all([
      supabase
        .from('board_category')
        .select('id, event_id, name, primary_game_id, created_at')
        .eq('event_id', selectedEventId)
        .order('name', { ascending: true }),
      supabase
        .from('board_game')
        .select('id, event_id, name, scoring_type, points_order, three_player_adjustment, notes, created_at')
        .eq('event_id', selectedEventId)
        .order('name', { ascending: true }),
      supabase
        .from('board_block')
        .select('id, event_id, category_id, block_number, game_id, created_at')
        .eq('event_id', selectedEventId)
        .order('block_number', { ascending: true }),
      supabase
        .from('board_player')
        .select('id, event_id, short_code, team_name, display_name, category_id, disqualified, created_at')
        .eq('event_id', selectedEventId)
        .order('short_code', { ascending: true }),
      supabase
        .from('board_judge_assignment')
        .select('id, event_id, user_id, game_id, category_id, table_number, created_at')
        .eq('event_id', selectedEventId)
        .order('created_at', { ascending: false }),
      supabase
        .from('judges')
        .select('id, email, display_name')
        .order('display_name', { ascending: true }),
    ]);

    if (categoryRes.error || gameRes.error || blockRes.error || playerRes.error || assignmentRes.error) {
      console.error(
        'Failed to load board admin data',
        categoryRes.error,
        gameRes.error,
        blockRes.error,
        playerRes.error,
        assignmentRes.error,
      );
      throw new Error('Nepodařilo se načíst data administrace.');
    }

    if (judgesRes.error) {
      console.warn('Failed to load judges list, switching to manual user id input', judgesRes.error);
      setJudges([]);
    } else {
      setJudges((judgesRes.data ?? []) as BoardAdminJudge[]);
    }

    setCategories((categoryRes.data ?? []) as BoardCategory[]);
    setGames((gameRes.data ?? []) as BoardGame[]);
    setBlocks((blockRes.data ?? []) as BoardBlock[]);
    setPlayers((playerRes.data ?? []) as BoardPlayer[]);
    setAssignments(
      ((assignmentRes.data ?? []) as BoardJudgeAssignment[]).map((assignment) => ({
        ...assignment,
        category_id: assignment.category_id ?? null,
        table_number: assignment.table_number ?? null,
      })),
    );
  }, [selectedEventId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        await loadEvents();
      } catch (loadError) {
        console.error('Failed to load board events', loadError);
        if (!cancelled) {
          setError('Nepodařilo se načíst eventy.');
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
  }, [loadEvents]);

  useEffect(() => {
    if (!selectedEventId) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        await loadEventDetail();
      } catch (loadError) {
        console.error('Failed to load board event detail', loadError);
        if (!cancelled) {
          setError('Nepodařilo se načíst detail eventu.');
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
  }, [loadEventDetail, selectedEventId]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  useEffect(() => {
    const handleHashChange = () => {
      setActiveSection(resolveAdminSectionFromHash(window.location.hash));
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const navigateAdminSection = useCallback((nextSection: AdminSectionKey) => {
    setActiveSection(nextSection);
    const hash = adminSectionHash(nextSection);
    const nextUrl = `${window.location.pathname}${window.location.search}#${hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, []);

  useEffect(() => {
    if (!selectedEvent) {
      setEventName('');
      setEventSlug('');
      setEventStartDate('');
      setEventEndDate('');
      return;
    }

    setEventName(selectedEvent.name);
    setEventSlug(selectedEvent.slug);
    setEventStartDate(selectedEvent.start_date ?? '');
    setEventEndDate(selectedEvent.end_date ?? '');
  }, [selectedEvent]);

  useEffect(() => {
    if (!categories.length) {
      setNewBlockCategoryId('');
      return;
    }
    if (!newBlockCategoryId || !categories.some((category) => category.id === newBlockCategoryId)) {
      setNewBlockCategoryId(categories[0].id);
    }
  }, [categories, newBlockCategoryId]);

  useEffect(() => {
    if (!games.length) {
      setNewCategoryPrimaryGameId('');
      return;
    }
    if (newCategoryPrimaryGameId && !games.some((game) => game.id === newCategoryPrimaryGameId)) {
      setNewCategoryPrimaryGameId('');
    }
  }, [games, newCategoryPrimaryGameId]);

  useEffect(() => {
    if (!games.length) {
      setNewBlockGameId('');
      return;
    }
    if (!newBlockGameId || !games.some((game) => game.id === newBlockGameId)) {
      setNewBlockGameId(games[0].id);
    }
  }, [games, newBlockGameId]);

  useEffect(() => {
    if (newGameScoringType === 'placement') {
      setNewGamePointsOrder('asc');
    }
  }, [newGameScoringType]);

  const handleCreateEvent = useCallback(async () => {
    const name = eventName.trim();
    const slug = slugify(eventSlug || name);

    if (!name || !slug) {
      setError('Vyplň název i slug eventu.');
      return;
    }

    const duplicateEvent = events.find((event) => event.slug === slug);
    if (duplicateEvent) {
      setError(`Slug „${slug}“ už používá event „${duplicateEvent.name}“.`);
      return;
    }

    setError(null);
    setMessage(null);

    const { data, error: createError } = await supabase
      .from('board_event')
      .insert({
        name,
        slug,
        start_date: eventStartDate || null,
        end_date: eventEndDate || null,
      })
      .select('id, slug, name, start_date, end_date, created_at')
      .single();

    if (createError || !data) {
      console.error('Failed to create board event', createError);
      setError(boardEventMutationErrorMessage(createError, 'Vytvoření eventu selhalo.'));
      return;
    }

    const next = data as BoardEvent;
    setEvents((current) => [next, ...current]);
    onSelectEventId(next.id);
    setMessage('Event byl vytvořen.');
  }, [eventEndDate, eventName, eventSlug, eventStartDate, events, onSelectEventId]);

  const handleUpdateEvent = useCallback(async () => {
    if (!selectedEventId) {
      setError('Vyber event.');
      return;
    }

    const name = eventName.trim();
    const slug = slugify(eventSlug || name);

    if (!name || !slug) {
      setError('Vyplň název i slug eventu.');
      return;
    }

    const duplicateEvent = events.find((event) => event.id !== selectedEventId && event.slug === slug);
    if (duplicateEvent) {
      setError(`Slug „${slug}“ už používá event „${duplicateEvent.name}“.`);
      return;
    }

    setError(null);
    setMessage(null);

    const { error: updateError } = await supabase
      .from('board_event')
      .update({
        name,
        slug,
        start_date: eventStartDate || null,
        end_date: eventEndDate || null,
      })
      .eq('id', selectedEventId);

    if (updateError) {
      console.error('Failed to update board event', updateError);
      setError(boardEventMutationErrorMessage(updateError, 'Uložení eventu selhalo.'));
      return;
    }

    setEvents((current) =>
      current.map((event) =>
        event.id === selectedEventId
          ? {
            ...event,
            name,
            slug,
            start_date: eventStartDate || null,
            end_date: eventEndDate || null,
          }
          : event,
      ),
    );
    setMessage('Event byl uložen.');
  }, [eventEndDate, eventName, eventSlug, eventStartDate, events, selectedEventId]);

  const handleCreateCategory = useCallback(async () => {
    if (!selectedEventId) {
      setError('Vyber event.');
      return;
    }

    const name = newCategoryName.trim();
    if (!name) {
      setError('Vyplň název kategorie.');
      return;
    }

    const { data, error: createError } = await supabase
      .from('board_category')
      .insert({ event_id: selectedEventId, name, primary_game_id: newCategoryPrimaryGameId || null })
      .select('id, event_id, name, primary_game_id, created_at')
      .single();

    if (createError || !data) {
      console.error('Failed to create board category', createError);
      setError('Vytvoření kategorie selhalo.');
      return;
    }

    setCategories((current) => [...current, data as BoardCategory].sort((a, b) => a.name.localeCompare(b.name, 'cs')));
    setNewCategoryName('');
    setMessage('Kategorie byla vytvořena.');
  }, [newCategoryName, newCategoryPrimaryGameId, selectedEventId]);

  const handleDeleteCategory = useCallback(async (categoryId: string) => {
    const confirmed = window.confirm('Smazat kategorii?');
    if (!confirmed) {
      return;
    }

    const { error: deleteError } = await supabase.from('board_category').delete().eq('id', categoryId);
    if (deleteError) {
      console.error('Failed to delete board category', deleteError);
      setError('Smazání kategorie selhalo.');
      return;
    }

    setCategories((current) => current.filter((category) => category.id !== categoryId));
    setMessage('Kategorie byla smazána.');
  }, []);

  const handleSetCategoryPrimaryGame = useCallback(async (categoryId: string, primaryGameId: string) => {
    const { error: updateError } = await supabase
      .from('board_category')
      .update({ primary_game_id: primaryGameId || null })
      .eq('id', categoryId);

    if (updateError) {
      console.error('Failed to update category primary game', updateError);
      setError('Uložení hlavní hry kategorie selhalo.');
      return;
    }

    setCategories((current) =>
      current.map((category) =>
        category.id === categoryId
          ? {
            ...category,
            primary_game_id: primaryGameId || null,
          }
          : category,
      ),
    );
    setMessage('Hlavní hra kategorie byla uložena.');
  }, []);

  const handleCreateGame = useCallback(async () => {
    if (!selectedEventId) {
      setError('Vyber event.');
      return;
    }

    const name = newGameName.trim();
    if (!name) {
      setError('Vyplň název hry.');
      return;
    }

    const { data, error: createError } = await supabase
      .from('board_game')
      .insert({
        event_id: selectedEventId,
        name,
        scoring_type: newGameScoringType,
        points_order: newGamePointsOrder,
        three_player_adjustment: newGameThreePlayerAdjustment,
        notes: newGameNotes.trim() || null,
      })
      .select('id, event_id, name, scoring_type, points_order, three_player_adjustment, notes, created_at')
      .single();

    if (createError || !data) {
      console.error('Failed to create board game', createError);
      setError('Vytvoření hry selhalo.');
      return;
    }

    setGames((current) => [...current, data as BoardGame].sort((a, b) => a.name.localeCompare(b.name, 'cs')));
    setNewGameName('');
    setNewGameNotes('');
    setNewGameScoringType('points');
    setNewGamePointsOrder('desc');
    setNewGameThreePlayerAdjustment(false);
    setMessage('Hra byla vytvořena.');
  }, [
    newGameName,
    newGameNotes,
    newGamePointsOrder,
    newGameScoringType,
    newGameThreePlayerAdjustment,
    selectedEventId,
  ]);

  const handleDeleteGame = useCallback(async (gameId: string) => {
    const confirmed = window.confirm('Smazat hru?');
    if (!confirmed) {
      return;
    }

    const { error: deleteError } = await supabase.from('board_game').delete().eq('id', gameId);
    if (deleteError) {
      console.error('Failed to delete board game', deleteError);
      setError('Smazání hry selhalo.');
      return;
    }

    setGames((current) => current.filter((game) => game.id !== gameId));
    setMessage('Hra byla smazána.');
  }, []);

  const handleCreateBlock = useCallback(async () => {
    if (!selectedEventId) {
      setError('Vyber event.');
      return;
    }

    const blockNumber = Number(newBlockNumber);
    if (!Number.isInteger(blockNumber) || blockNumber <= 0) {
      setError('Číslo bloku musí být kladné celé číslo.');
      return;
    }
    if (!newBlockCategoryId || !newBlockGameId) {
      setError('Vyber kategorii i hru.');
      return;
    }

    const { data, error: createError } = await supabase
      .from('board_block')
      .insert({
        event_id: selectedEventId,
        category_id: newBlockCategoryId,
        game_id: newBlockGameId,
        block_number: blockNumber,
      })
      .select('id, event_id, category_id, block_number, game_id, created_at')
      .single();

    if (createError || !data) {
      console.error('Failed to create board block', createError);
      setError('Vytvoření bloku selhalo.');
      return;
    }

    setBlocks((current) =>
      [...current, data as BoardBlock].sort((a, b) =>
        a.block_number === b.block_number
          ? (categoryMap.get(a.category_id)?.name ?? '').localeCompare(categoryMap.get(b.category_id)?.name ?? '', 'cs')
          : a.block_number - b.block_number,
      ),
    );
    setMessage('Blok byl vytvořen.');
  }, [categoryMap, newBlockCategoryId, newBlockGameId, newBlockNumber, selectedEventId]);

  const handleDeleteBlock = useCallback(async (blockId: string) => {
    const confirmed = window.confirm('Smazat blok?');
    if (!confirmed) {
      return;
    }

    const { error: deleteError } = await supabase.from('board_block').delete().eq('id', blockId);
    if (deleteError) {
      console.error('Failed to delete board block', deleteError);
      setError('Smazání bloku selhalo.');
      return;
    }

    setBlocks((current) => current.filter((block) => block.id !== blockId));
    setMessage('Blok byl smazán.');
  }, []);

  const handleImportPlayers = useCallback(async () => {
    if (!selectedEventId) {
      setError('Vyber event.');
      return;
    }

    const rows = parseCsv(csvInput);
    if (!rows.length) {
      setError('CSV je prázdné nebo má neplatnou hlavičku.');
      return;
    }

    const existingCodes = new Set(players.map((player) => player.short_code.toUpperCase()));
    const categoryByName = new Map(categories.map((category) => [slugify(category.name), category.id]));

    const payload: Array<{
      event_id: string;
      short_code: string;
      team_name: string | null;
      display_name: string | null;
      category_id: string;
    }> = [];

    const skipped: string[] = [];

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const categoryKey = slugify(row.category);
      const categoryId = categoryByName.get(categoryKey);
      if (!categoryId) {
        skipped.push(`řádek ${rowNumber}: neznámá kategorie "${row.category}"`);
        return;
      }

      let shortCode = row.short_code;
      if (!shortCode) {
        if (!autoGenerateCodes) {
          skipped.push(`řádek ${rowNumber}: chybí short_code`);
          return;
        }
        shortCode = randomShortCode(existingCodes);
      }

      shortCode = shortCode.toUpperCase();
      existingCodes.add(shortCode);

      payload.push({
        event_id: selectedEventId,
        short_code: shortCode,
        team_name: row.team_name || null,
        display_name: row.display_name || null,
        category_id: categoryId,
      });
    });

    if (!payload.length) {
      setError(`Import nic nevložil (${skipped.join('; ') || 'bez validních řádků'}).`);
      return;
    }

    const { error: upsertError } = await supabase
      .from('board_player')
      .upsert(payload, { onConflict: 'event_id,short_code' });

    if (upsertError) {
      console.error('Failed to import players', upsertError);
      setError('Import hráčů selhal.');
      return;
    }

    setCsvInput('');
    setMessage(
      skipped.length
        ? `Import hotov: ${payload.length} řádků, přeskočeno ${skipped.length} (${skipped.join('; ')}).`
        : `Import hotov: ${payload.length} řádků.`,
    );

    await loadEventDetail();
  }, [autoGenerateCodes, categories, csvInput, loadEventDetail, players, selectedEventId]);

  const handleExportBadges = useCallback(async () => {
    if (!selectedEventId) {
      setError('Vyber event.');
      return;
    }

    const badgeRows = players.map((player) => ({
      event_id: selectedEventId,
      player_id: player.id,
      qr_payload: buildBoardQrPayload(player.short_code),
    }));

    if (badgeRows.length) {
      const { error: badgeError } = await supabase
        .from('board_badge')
        .upsert(badgeRows, { onConflict: 'event_id,player_id' });
      if (badgeError) {
        console.error('Failed to sync board badges', badgeError);
      }
    }

    const lines = [
      'short_code,team_name,display_name,category,qr_payload',
      ...players.map((player) => {
        const category = categoryMap.get(player.category_id)?.name ?? '';
        return [
          escapeCsv(player.short_code),
          escapeCsv(player.team_name),
          escapeCsv(player.display_name),
          escapeCsv(category),
          escapeCsv(buildBoardQrPayload(player.short_code)),
        ].join(',');
      }),
    ];

    const csv = `${lines.join('\n')}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    const fileSlug = selectedEvent ? slugify(selectedEvent.slug || selectedEvent.name) : 'deskovky';
    link.href = URL.createObjectURL(blob);
    link.download = `${fileSlug}-badges.csv`;
    link.click();
    URL.revokeObjectURL(link.href);

    setMessage('CSV s visačkami bylo exportováno.');
  }, [categoryMap, players, selectedEvent, selectedEventId]);

  const handleCreateAssignment = useCallback(async () => {
    if (!selectedEventId) {
      setError('Vyber event.');
      return;
    }

    const userId = newAssignmentUserId.trim();
    const tableNumber = Number(newAssignmentTableNumber);
    if (!userId || !newAssignmentGameId || !newAssignmentCategoryId) {
      setError('Vyber rozhodčího, hru i kategorii.');
      return;
    }
    if (!Number.isInteger(tableNumber) || tableNumber <= 0) {
      setError('Číslo stolu musí být kladné celé číslo.');
      return;
    }

    const { data, error: createError } = await supabase
      .from('board_judge_assignment')
      .insert({
        event_id: selectedEventId,
        user_id: userId,
        game_id: newAssignmentGameId,
        category_id: newAssignmentCategoryId,
        table_number: tableNumber,
      })
      .select('id, event_id, user_id, game_id, category_id, table_number, created_at')
      .single();

    if (createError || !data) {
      console.error('Failed to create assignment', createError);
      setError('Vytvoření přiřazení selhalo.');
      return;
    }

    setAssignments((current) => [data as BoardJudgeAssignment, ...current]);
    setNewAssignmentCategoryId('');
    setNewAssignmentGameId('');
    setNewAssignmentUserId('');
    setNewAssignmentTableNumber('1');
    setMessage('Přiřazení bylo vytvořeno.');
  }, [newAssignmentCategoryId, newAssignmentGameId, newAssignmentTableNumber, newAssignmentUserId, selectedEventId]);

  const handleDeleteAssignment = useCallback(async (assignmentId: string) => {
    const confirmed = window.confirm('Smazat přiřazení?');
    if (!confirmed) {
      return;
    }

    const { error: deleteError } = await supabase
      .from('board_judge_assignment')
      .delete()
      .eq('id', assignmentId);

    if (deleteError) {
      console.error('Failed to delete assignment', deleteError);
      setError('Smazání přiřazení selhalo.');
      return;
    }

    setAssignments((current) => current.filter((assignment) => assignment.id !== assignmentId));
    setMessage('Přiřazení bylo smazáno.');
  }, []);

  const handleSetPlayerDisqualified = useCallback(async (playerId: string, disqualified: boolean) => {
    const { error: updateError } = await supabase
      .from('board_player')
      .update({ disqualified })
      .eq('id', playerId);

    if (updateError) {
      console.error('Failed to update board player disqualification', updateError);
      setError('Nepodařilo se uložit diskvalifikaci hráče.');
      return;
    }

    setPlayers((current) =>
      current.map((player) =>
        player.id === playerId
          ? {
            ...player,
            disqualified,
          }
          : player,
      ),
    );
    setMessage(disqualified ? 'Hráč byl diskvalifikován.' : 'Diskvalifikace hráče byla zrušena.');
  }, []);

  const handleGenerateDraw = useCallback(async (mode: 'strict' | 'test' = 'strict') => {
    if (!selectedEventId) {
      setError('Vyber event.');
      return;
    }

    const isTestMode = mode === 'test';
    const confirmed = window.confirm(
      isTestMode
        ? 'Test losování: chybějící stoly se doplní podle dostupných rozhodčích v DB. Pokračovat?'
        : 'Tímto smažeš dosavadní partie deskovek v tomto eventu a vylosuješ nové. Pokračovat?',
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    setMessage(null);
    setDrawSummary(null);
    setDrawProgress({ label: 'Příprava losování…', current: 0, total: 1 });
    setDrawRunning(true);
    await yieldToBrowser();

    try {
      const playersByCategory = new Map<string, BoardPlayer[]>();
      for (const player of players) {
        const list = playersByCategory.get(player.category_id) ?? [];
        list.push(player);
        playersByCategory.set(player.category_id, list);
      }

      const blocksByCategory = new Map<string, BoardBlock[]>();
      for (const block of blocks) {
        const list = blocksByCategory.get(block.category_id) ?? [];
        list.push(block);
        blocksByCategory.set(block.category_id, list);
      }

      const orderedAssignments = assignments
        .filter((assignment) => assignment.event_id === selectedEventId)
        .sort((left, right) => left.created_at.localeCompare(right.created_at));
      const assignmentScopeKey = (assignment: BoardJudgeAssignment) =>
        `${assignment.game_id}|${assignment.category_id ?? '*'}`;

      const explicitTableAssignments = orderedAssignments.filter(
        (assignment) => assignment.table_number !== null && assignment.table_number !== undefined,
      );
      const implicitTableAssignmentsByScope = new Map<string, BoardJudgeAssignment[]>();
      for (const assignment of orderedAssignments) {
        if (assignment.table_number !== null && assignment.table_number !== undefined) {
          continue;
        }
        const scope = assignmentScopeKey(assignment);
        const list = implicitTableAssignmentsByScope.get(scope) ?? [];
        list.push(assignment);
        implicitTableAssignmentsByScope.set(scope, list);
      }

      const synthesizedAssignments: BoardJudgeAssignment[] = [];
      let synthesizedTableAssignments = 0;
      let droppedImplicitAssignments = 0;
      for (const [scope, implicitAssignments] of implicitTableAssignmentsByScope.entries()) {
        const [scopeGameId, scopeCategoryIdOrWildcard] = scope.split('|');
        const usedTables = new Set<number>(
          explicitTableAssignments
            .filter((assignment) =>
              assignment.game_id === scopeGameId
              && (scopeCategoryIdOrWildcard === '*'
                ? assignment.category_id === null
                : assignment.category_id === scopeCategoryIdOrWildcard),
            )
            .map((assignment) => assignment.table_number!)
            .filter((value) => Number.isFinite(value)),
        );

        let candidateTable = 1;
        for (const assignment of implicitAssignments) {
          while (usedTables.has(candidateTable) && candidateTable <= BOARD_DRAW_MAX_TABLES_PER_GAME) {
            candidateTable += 1;
          }
          if (candidateTable > BOARD_DRAW_MAX_TABLES_PER_GAME) {
            droppedImplicitAssignments += 1;
            continue;
          }

          usedTables.add(candidateTable);
          synthesizedAssignments.push({
            ...assignment,
            table_number: candidateTable,
          });
          synthesizedTableAssignments += 1;
          candidateTable += 1;
        }
      }

      const assignmentsForTables = [...explicitTableAssignments, ...synthesizedAssignments];
      const assignmentByKey = new Map<string, BoardJudgeAssignment>();
      const fallbackPoolsByKey = new Map<string, BoardJudgeAssignment[]>();
      const fallbackRotationByKey = new Map<string, number>();

      const pushFallbackPool = (key: string, assignment: BoardJudgeAssignment) => {
        const list = fallbackPoolsByKey.get(key) ?? [];
        list.push(assignment);
        fallbackPoolsByKey.set(key, list);
      };

      const takeFallbackAssignment = (key: string): BoardJudgeAssignment | null => {
        const list = fallbackPoolsByKey.get(key);
        if (!list?.length) {
          return null;
        }
        const index = fallbackRotationByKey.get(key) ?? 0;
        const assignment = list[index % list.length];
        fallbackRotationByKey.set(key, index + 1);
        return assignment;
      };

      const resolveFallbackAssignment = (
        gameId: string,
        categoryId: string,
        options?: { includeGlobalPool?: boolean },
      ): BoardJudgeAssignment | null =>
        takeFallbackAssignment(`${gameId}|${categoryId}`)
        ?? takeFallbackAssignment(`${gameId}|*`)
        ?? (options?.includeGlobalPool ? takeFallbackAssignment(`*|*`) : null);

      for (const assignment of orderedAssignments) {
        pushFallbackPool(`*|*`, assignment);
        pushFallbackPool(`${assignment.game_id}|*`, assignment);
        if (assignment.category_id) {
          pushFallbackPool(`${assignment.game_id}|${assignment.category_id}`, assignment);
        }
      }

      for (const assignment of assignmentsForTables) {
        if (!assignment.table_number) {
          continue;
        }
        if (assignment.category_id) {
          assignmentByKey.set(
            `${assignment.event_id}|${assignment.game_id}|${assignment.category_id}|${assignment.table_number}`,
            assignment,
          );
        } else {
          assignmentByKey.set(
            `${assignment.event_id}|${assignment.game_id}|*|${assignment.table_number}`,
            assignment,
          );
        }
      }

      const missingAssignments: string[] = [];
      const relaxedSameTeamBlocks: string[] = [];
      const fallbackJudgeIds = new Set<string>();
      let fallbackAssignmentsUsed = 0;
      const plannedRows: Array<{
        match: Omit<BoardMatch, 'id' | 'created_at' | 'status'>;
        players: string[];
      }> = [];
      const oversizedCategories = categories
        .map((category) => {
          const activePlayers = (playersByCategory.get(category.id) ?? []).filter((player) => !player.disqualified).length;
          return {
            name: category.name,
            activePlayers,
          };
        })
        .filter((item) => item.activePlayers > BOARD_DRAW_MAX_PLAYERS_PER_BLOCK);

      if (oversizedCategories.length) {
        const first = oversizedCategories[0];
        setError(
          `Kategorie ${first.name} má ${first.activePlayers} aktivních hráčů. Pro jednu deskovku je limit ${BOARD_DRAW_MAX_TABLES_PER_GAME} stolů (${BOARD_DRAW_MAX_PLAYERS_PER_BLOCK} hráčů po 4).`,
        );
        return;
      }

      const categoryTotal = Math.max(1, categories.length);
      for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex += 1) {
        const category = categories[categoryIndex];
        setDrawProgress({
          label: `Losuji kategorie… (${categoryIndex + 1}/${categoryTotal})`,
          current: categoryIndex + 1,
          total: categoryTotal,
        });
        await yieldToBrowser();

        const categoryPlayers = playersByCategory.get(category.id) ?? [];
        const categoryBlocks = blocksByCategory.get(category.id) ?? [];
        const blockPlans = planCategoryDraw(categoryPlayers, categoryBlocks);

        for (const blockPlan of blockPlans) {
          if (blockPlan.usedRelaxedSameTeamRule) {
            relaxedSameTeamBlocks.push(`${category.name} · blok ${blockPlan.block.block_number}`);
          }
          for (const round of blockPlan.rounds) {
            for (const table of round.tables) {
              const assignmentKey = `${selectedEventId}|${blockPlan.block.game_id}|${blockPlan.block.category_id}|${table.tableNumber}`;
              const assignmentWildcardKey = `${selectedEventId}|${blockPlan.block.game_id}|*|${table.tableNumber}`;
              let assignment = assignmentByKey.get(assignmentKey) ?? assignmentByKey.get(assignmentWildcardKey);
              if (!assignment) {
                assignment = resolveFallbackAssignment(
                  blockPlan.block.game_id,
                  blockPlan.block.category_id,
                  { includeGlobalPool: isTestMode },
                ) ?? undefined;
                if (assignment) {
                  fallbackAssignmentsUsed += 1;
                  fallbackJudgeIds.add(assignment.user_id);
                }
              }
              if (!assignment) {
                missingAssignments.push(
                  `${category.name} · blok ${blockPlan.block.block_number} · stůl ${table.tableNumber}`,
                );
                continue;
              }

              plannedRows.push({
                match: {
                  event_id: selectedEventId,
                  category_id: blockPlan.block.category_id,
                  block_id: blockPlan.block.id,
                  round_number: round.roundNumber,
                  table_number: table.tableNumber,
                  created_by: assignment.user_id,
                },
                players: table.playerIds,
              });
            }
          }
        }
      }

      if (missingAssignments.length) {
        if (isTestMode) {
          setError(
            `Ani test losování nenašlo dost rozhodčích. Chybí: ${missingAssignments.slice(0, 6).join('; ')}${missingAssignments.length > 6 ? '…' : ''}`,
          );
        } else {
          setError(
            `Chybí přiřazení rozhodčího ke stolu: ${missingAssignments.slice(0, 6).join('; ')}${missingAssignments.length > 6 ? '…' : ''}`,
          );
        }
        return;
      }

      if (!plannedRows.length) {
        setError('Nebylo co vylosovat. Zkontroluj hráče, bloky a diskvalifikace.');
        return;
      }

      const playersById = new Map(players.map((player) => [player.id, player]));
      const categoryNamesById = new Map(categories.map((category) => [category.id, category.name]));
      const sameTeamPairStats = buildSameTeamPairStats(plannedRows, playersById, categoryNamesById);

      setDrawProgress({ label: 'Mažu předchozí partie…', current: 0, total: 1 });
      await yieldToBrowser();

      const { error: deleteMatchesError } = await supabase
        .from('board_match')
        .delete()
        .eq('event_id', selectedEventId);

      if (deleteMatchesError) {
        console.error('Failed to clear previous board matches', deleteMatchesError);
        setError('Nepodařilo se smazat původní partie.');
        return;
      }

      let insertedMatches = 0;
      let insertedRows = 0;
      const totalRows = plannedRows.length;

      for (let index = 0; index < plannedRows.length; index += 1) {
        const planned = plannedRows[index];
        if (index === 0 || index === totalRows - 1 || (index + 1) % 12 === 0) {
          setDrawProgress({
            label: `Ukládám partie… (${index + 1}/${totalRows})`,
            current: index + 1,
            total: totalRows,
          });
          await yieldToBrowser();
        }

        const { data: insertedMatch, error: insertMatchError } = await supabase
          .from('board_match')
          .insert({
            event_id: planned.match.event_id,
            category_id: planned.match.category_id,
            block_id: planned.match.block_id,
            round_number: planned.match.round_number,
            table_number: planned.match.table_number ?? null,
            created_by: planned.match.created_by,
          })
          .select('id')
          .single();

        if (insertMatchError || !insertedMatch) {
          console.error('Failed to insert drawn board match', insertMatchError);
          setError('Nepodařilo se uložit vylosované partie.');
          return;
        }

        const participantRows = planned.players.map((playerId, index) => ({
          match_id: insertedMatch.id as string,
          player_id: playerId,
          seat: index + 1,
          points: null,
          placement: null,
        }));

        const { error: insertPlayersError } = await supabase
          .from('board_match_player')
          .insert(participantRows);

        if (insertPlayersError) {
          console.error('Failed to insert drawn board match players', insertPlayersError);
          setError('Nepodařilo se uložit hráče do vylosovaných partií.');
          return;
        }

        insertedMatches += 1;
        insertedRows += participantRows.length;
      }

      setMessage('Losování bylo úspěšně vytvořeno.');
      const relaxedSuffix = relaxedSameTeamBlocks.length
        ? ` Uvolněné pravidlo stejný oddíl (max 1× na hráče/hru): ${relaxedSameTeamBlocks.slice(0, 6).join('; ')}${relaxedSameTeamBlocks.length > 6 ? '…' : ''}.`
        : '';
      const testSuffix = isTestMode
        ? ` Test losování: doplněno ${fallbackAssignmentsUsed} stolů podle dostupných rozhodčích (${fallbackJudgeIds.size} rozhodčích).`
        : '';
      const fallbackSuffix = !isTestMode && fallbackAssignmentsUsed > 0
        ? ` Doplňeno ${fallbackAssignmentsUsed} stolů pomocí náhradního přiřazení ve stejné deskovce.`
        : '';
      const synthesizedSuffix = synthesizedTableAssignments
        ? ` Automaticky doplněno ${synthesizedTableAssignments} přiřazení bez zadaného stolu.`
        : '';
      const droppedSuffix = droppedImplicitAssignments
        ? ` ${droppedImplicitAssignments} přiřazení bez stolu se nevešlo do limitu ${BOARD_DRAW_MAX_TABLES_PER_GAME} stolů.`
        : '';
      const sameTeamTotalSuffix = ` Interní souboje ve stejném oddílu: ${sameTeamPairStats.totalPairs}.`;
      const sameTeamCategorySuffix = sameTeamPairStats.byCategory.length
        ? ` Kategorie: ${sameTeamPairStats.byCategory
          .map((item) => `${item.categoryLabel} (${item.count})`)
          .join('; ')}.`
        : '';
      const sameTeamTopTeamsSuffix = sameTeamPairStats.topTeams.length
        ? ` Oddíly: ${sameTeamPairStats.topTeams
          .slice(0, 6)
          .map((item) => `${item.teamLabel} (${item.count})`)
          .join(', ')}${sameTeamPairStats.topTeams.length > 6 ? '…' : ''}.`
        : '';
      setDrawSummary(
        `Partie: ${insertedMatches} · účasti hráčů: ${insertedRows}.${synthesizedSuffix}${droppedSuffix}${fallbackSuffix}${relaxedSuffix}${testSuffix}${sameTeamTotalSuffix}${sameTeamCategorySuffix}${sameTeamTopTeamsSuffix}`,
      );
      setDrawProgress({ label: 'Dokončeno', current: 1, total: 1 });
      await loadEventDetail();
    } finally {
      setDrawRunning(false);
      setDrawProgress(null);
    }
  }, [assignments, blocks, categories, loadEventDetail, players, selectedEventId]);

  const selectedEventLabel = selectedEvent?.name ?? 'Nevybraný event';
  const sectionStats = useMemo(
    () => [
      { label: 'Kategorie', value: categories.length },
      { label: 'Hry', value: games.length },
      { label: 'Bloky', value: blocks.length },
      { label: 'Hráči', value: players.length },
      { label: 'Diskvalifikace', value: players.filter((player) => player.disqualified).length },
      { label: 'Stoly rozhodčích', value: assignments.filter((assignment) => assignment.table_number).length },
    ],
    [assignments, blocks.length, categories.length, games.length, players],
  );

  const filteredGames = useMemo(() => {
    const term = gameSearch.trim().toLowerCase();
    return games.filter((game) => {
      if (gameScoringFilter !== 'all' && game.scoring_type !== gameScoringFilter) {
        return false;
      }
      if (!term) {
        return true;
      }
      return [game.name, game.notes ?? ''].join(' ').toLowerCase().includes(term);
    });
  }, [gameScoringFilter, gameSearch, games]);

  const filteredPlayers = useMemo(() => {
    const term = playerSearch.trim().toLowerCase();
    return players.filter((player) => {
      if (playerCategoryFilter && player.category_id !== playerCategoryFilter) {
        return false;
      }
      if (!term) {
        return true;
      }
      return [player.short_code, player.display_name ?? '', player.team_name ?? ''].join(' ').toLowerCase().includes(term);
    });
  }, [playerCategoryFilter, playerSearch, players]);

  const selectedDisqualifyPlayer = useMemo(
    () => players.find((player) => player.id === selectedDisqualifyPlayerId) ?? null,
    [players, selectedDisqualifyPlayerId],
  );

  useEffect(() => {
    setPlayerPage(1);
  }, [playerCategoryFilter, playerPageSize, playerSearch, selectedEventId]);

  useEffect(() => {
    if (!selectedDisqualifyPlayerId) {
      return;
    }
    if (!players.some((player) => player.id === selectedDisqualifyPlayerId)) {
      setSelectedDisqualifyPlayerId('');
    }
  }, [players, selectedDisqualifyPlayerId]);

  const playerTotalPages = Math.max(1, Math.ceil(filteredPlayers.length / playerPageSize));
  const safePlayerPage = Math.min(playerPage, playerTotalPages);

  useEffect(() => {
    if (playerPage !== safePlayerPage) {
      setPlayerPage(safePlayerPage);
    }
  }, [playerPage, safePlayerPage]);

  const pagedPlayers = useMemo(() => {
    const start = (safePlayerPage - 1) * playerPageSize;
    return filteredPlayers.slice(start, start + playerPageSize);
  }, [filteredPlayers, playerPageSize, safePlayerPage]);

  const assignmentJudgeOptions = useMemo(() => {
    const values = new Set(assignments.map((assignment) => assignment.user_id));
    return Array.from(values)
      .map((userId) => {
        const judge = judgesMap.get(userId);
        return {
          value: userId,
          label: judge ? `${judge.display_name} (${judge.email})` : userId,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'cs'));
  }, [assignments, judgesMap]);

  const filteredAssignments = useMemo(
    () =>
      assignments.filter((assignment) => {
        if (assignmentJudgeFilter && assignment.user_id !== assignmentJudgeFilter) {
          return false;
        }
        if (assignmentGameFilter && assignment.game_id !== assignmentGameFilter) {
          return false;
        }
        return true;
      }),
    [assignmentGameFilter, assignmentJudgeFilter, assignments],
  );

  const drawOverview = useMemo(() => {
    const activePlayersTotal = players.filter((player) => !player.disqualified).length;
    const oversizedCategories = categories
      .map((category) => {
        const activePlayers = players.filter((player) => player.category_id === category.id && !player.disqualified).length;
        return activePlayers > BOARD_DRAW_MAX_PLAYERS_PER_BLOCK ? `${category.name} (${activePlayers})` : null;
      })
      .filter((value): value is string => Boolean(value));
    const readyCategories = categories.filter((category) => {
      const categoryPlayers = players.filter((player) => player.category_id === category.id && !player.disqualified);
      const categoryBlocks = blocks.filter((block) => block.category_id === category.id);
      return categoryPlayers.length >= 2 && categoryBlocks.length > 0;
    }).length;
    return {
      activePlayersTotal,
      readyCategories,
      oversizedCategories,
    };
  }, [blocks, categories, players]);

  const drawDisabledReason = useMemo(() => {
    if (!selectedEventId) {
      return 'Nejdřív vyber event.';
    }
    if (drawRunning) {
      return 'Losování právě běží.';
    }
    if (loading) {
      return 'Počkej na načtení administrace.';
    }
    if (drawOverview.activePlayersTotal === 0) {
      return 'V databázi zatím nejsou načtení aktivní účastníci.';
    }
    if (drawOverview.oversizedCategories.length) {
      return `Překročen limit ${BOARD_DRAW_MAX_TABLES_PER_GAME} stolů (${BOARD_DRAW_MAX_PLAYERS_PER_BLOCK} hráčů) v: ${drawOverview.oversizedCategories.slice(0, 2).join(', ')}${drawOverview.oversizedCategories.length > 2 ? '…' : ''}.`;
    }
    if (drawOverview.readyCategories === 0) {
      return 'Žádná kategorie nemá současně hráče a bloky.';
    }
    return null;
  }, [drawOverview.activePlayersTotal, drawOverview.oversizedCategories, drawOverview.readyCategories, drawRunning, loading, selectedEventId]);

  const canGenerateDraw = drawDisabledReason === null;

  const sectionHeaderConfig = useMemo<AdminSectionHeaderConfig>(() => {
    switch (activeSection) {
      case 'event':
        return {
          description: 'Nastavení názvu, slugu a termínu eventu.',
          action: {
            label: 'Uložit event',
            kind: 'primary',
            disabled: !selectedEventId,
            onClick: () => {
              void handleUpdateEvent();
            },
          },
        };
      case 'draw':
        return {
          description: 'Automatické rozlosování partií na 3 kola v každém bloku a přidělení ke stolům.',
          action: {
            label: 'Vylosovat partie',
            kind: 'primary',
            disabled: !canGenerateDraw,
            onClick: () => {
              void handleGenerateDraw();
            },
          },
        };
      case 'disqualify':
        return {
          description: 'Vyhledej hráče a nastav jeho diskvalifikaci. Diskvalifikovaní se neberou do nového losování.',
          action: selectedDisqualifyPlayer
            ? {
              label: selectedDisqualifyPlayer.disqualified ? 'Zrušit diskvalifikaci' : 'Diskvalifikovat',
              kind: selectedDisqualifyPlayer.disqualified ? 'secondary' : 'primary',
              onClick: () => {
                void handleSetPlayerDisqualified(
                  selectedDisqualifyPlayer.id,
                  !Boolean(selectedDisqualifyPlayer.disqualified),
                );
              },
            }
            : undefined,
        };
      case 'assignments':
        return {
          description: 'Přiřazení rozhodčích podle hry, kategorie a čísla stolu.',
          action: {
            label: 'Přidat přiřazení',
            kind: 'primary',
            disabled: !selectedEventId,
            onClick: () => {
              void handleCreateAssignment();
            },
          },
        };
      case 'categories':
        return {
          description: 'Správa kategorií a hlavních her pro tie-break.',
          action: {
            label: 'Přidat kategorii',
            kind: 'primary',
            disabled: !selectedEventId,
            onClick: () => {
              void handleCreateCategory();
            },
          },
        };
      case 'games':
        return {
          description: 'Konfigurace her a jejich bodování.',
          action: {
            label: 'Přidat hru',
            kind: 'primary',
            disabled: !selectedEventId,
            onClick: () => {
              void handleCreateGame();
            },
          },
        };
      case 'blocks':
        return {
          description: 'Mapování kategorií na bloky a hry.',
          action: {
            label: 'Přidat blok',
            kind: 'primary',
            disabled: !selectedEventId,
            onClick: () => {
              void handleCreateBlock();
            },
          },
        };
      case 'players':
        return {
          description: 'Hráči aktivního eventu a jejich rozřazení do kategorií.',
          action: {
            label: 'Import / export',
            kind: 'secondary',
            onClick: () => {
              navigateAdminSection('import-export');
            },
          },
        };
      case 'judges':
        return {
          description: 'Přiřazení rozhodčích na hry a kategorie.',
          action: {
            label: 'Přidat přiřazení',
            kind: 'primary',
            disabled: !selectedEventId,
            onClick: () => {
              void handleCreateAssignment();
            },
          },
        };
      case 'import-export':
        return {
          description: 'Import a export hráčů a visaček.',
          action: {
            label: 'Importovat CSV',
            kind: 'primary',
            disabled: !selectedEventId,
            onClick: () => {
              void handleImportPlayers();
            },
          },
        };
      default:
        return {
          description: `Rychlý přehled administrace pro event ${selectedEventLabel}.`,
        };
    }
  }, [
    activeSection,
    canGenerateDraw,
    handleCreateAssignment,
    handleCreateBlock,
    handleCreateCategory,
    handleCreateGame,
    handleGenerateDraw,
    handleImportPlayers,
    handleSetPlayerDisqualified,
    handleUpdateEvent,
    navigateAdminSection,
    selectedDisqualifyPlayer,
    selectedEventId,
    selectedEventLabel,
    loading,
  ]);

  return (
    <>
      <section className="admin-card">
        <header className="admin-card-header">
          <div>
            <h2>Administrace Deskovek</h2>
            <p className="admin-card-subtitle">Event, losování, diskvalifikace a přiřazení rozhodčích ke stolům.</p>
          </div>
          <div className="deskovky-toolbar-actions">
            <span className="deskovky-admin-current-section">Sekce: {activeSectionLabel}</span>
          </div>
        </header>

        {loading ? <p className="admin-card-subtitle">Načítám data administrace…</p> : null}
        {error ? <p className="admin-error">{error}</p> : null}
        {message ? <p className="admin-success">{message}</p> : null}
      </section>

      <div className="deskovky-admin-sections-layout">
        {isCompactAdminNav ? (
          <section className="admin-card deskovky-admin-mobile-nav">
            <label className="admin-field deskovky-event-select">
              <span>Vyber sekci</span>
              <select
                value={activeSection}
                onChange={(eventTarget) => navigateAdminSection(eventTarget.target.value as AdminSectionKey)}
                aria-label="Výběr sekce administrace"
              >
                {ADMIN_SECTION_ITEMS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </section>
        ) : (
          <aside className="admin-card deskovky-admin-sidebar" aria-label="Sekce administrace">
            <h3>Sekce</h3>
            <nav className="deskovky-admin-sidebar-nav" role="navigation">
              {ADMIN_SECTION_ITEMS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`admin-button ${activeSection === item.key ? 'admin-button--primary' : 'admin-button--secondary'
                    }`}
                  onClick={() => navigateAdminSection(item.key)}
                  aria-current={activeSection === item.key ? 'page' : undefined}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </aside>
        )}

        <div className="deskovky-admin-section-panel">
          {activeSection !== 'draw' ? (
            <section className="admin-card deskovky-admin-section-sticky">
              <header className="deskovky-admin-section-sticky-head">
                <div>
                  <h3>{activeSectionLabel}</h3>
                  <p className="admin-card-subtitle">{sectionHeaderConfig.description}</p>
                </div>
                {sectionHeaderConfig.action ? (
                  <button
                    type="button"
                    className={`admin-button ${sectionHeaderConfig.action.kind === 'primary' ? 'admin-button--primary' : 'admin-button--secondary'
                      }`}
                    onClick={sectionHeaderConfig.action.onClick}
                    disabled={sectionHeaderConfig.action.disabled}
                  >
                    {sectionHeaderConfig.action.label}
                  </button>
                ) : null}
              </header>

              {activeSection === 'games' ? (
                <div className="deskovky-admin-filters deskovky-admin-filters--sticky">
                  <label className="admin-field">
                    <span>Hledat hru</span>
                    <input
                      value={gameSearch}
                      onChange={(eventTarget) => setGameSearch(eventTarget.target.value)}
                      placeholder="Název nebo poznámka…"
                      aria-label="Hledat hru podle názvu nebo poznámky"
                    />
                  </label>
                  <label className="admin-field">
                    <span>Typ bodování</span>
                    <select
                      value={gameScoringFilter}
                      onChange={(eventTarget) => setGameScoringFilter(eventTarget.target.value as 'all' | BoardScoringType)}
                      aria-label="Filtrovat hry podle typu bodování"
                    >
                      <option value="all">Všechny</option>
                      <option value="points">points</option>
                      <option value="placement">placement</option>
                      <option value="both">both</option>
                    </select>
                  </label>
                </div>
              ) : null}

              {activeSection === 'assignments' ? (
                <div className="deskovky-admin-filters deskovky-admin-filters--sticky">
                  <label className="admin-field">
                    <span>Rozhodčí</span>
                    <select
                      value={assignmentJudgeFilter}
                      onChange={(eventTarget) => setAssignmentJudgeFilter(eventTarget.target.value)}
                      aria-label="Filtrovat přiřazení podle rozhodčího"
                    >
                      <option value="">Všichni</option>
                      {assignmentJudgeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-field">
                    <span>Hra</span>
                    <select
                      value={assignmentGameFilter}
                      onChange={(eventTarget) => setAssignmentGameFilter(eventTarget.target.value)}
                      aria-label="Filtrovat přiřazení podle hry"
                    >
                      <option value="">Všechny</option>
                      {games.map((game) => (
                        <option key={game.id} value={game.id}>
                          {game.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </section>
          ) : null}

          {activeSection === 'overview' ? (
            <section className="admin-card">
              <h2>Přehled administrace</h2>
              <p className="admin-card-subtitle">Aktivní event: {selectedEventLabel}</p>
              <label className="admin-field deskovky-event-select">
                <span>Aktivní event</span>
                <select
                  value={selectedEventId ?? ''}
                  onChange={(eventTarget) => onSelectEventId(eventTarget.target.value)}
                  aria-label="Aktivní event Deskovek"
                >
                  {!events.length ? <option value="">Bez dostupného eventu</option> : null}
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="deskovky-admin-overview-stats">
                {sectionStats.map((item) => (
                  <article key={item.label} className="deskovky-admin-overview-stat">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </article>
                ))}
              </div>

              <div className="admin-card-actions">
                <button
                  type="button"
                  className="admin-button admin-button--primary"
                  onClick={() => navigateAdminSection('draw')}
                  aria-label="Přejít na sekci Losování"
                >
                  Losování
                </button>
                <button
                  type="button"
                  className="admin-button admin-button--secondary"
                  onClick={() => navigateAdminSection('disqualify')}
                  aria-label="Přejít na sekci Diskvalifikace"
                >
                  Diskvalifikace
                </button>
                <button
                  type="button"
                  className="admin-button admin-button--secondary"
                  onClick={() => navigateAdminSection('assignments')}
                  aria-label="Přejít na sekci Rozhodčí a stoly"
                >
                  Rozhodčí a stoly
                </button>
              </div>
            </section>
          ) : null}

          {activeSection === 'event' ? (
            <section className="admin-card">
              <h2>Event</h2>
              <div className="deskovky-admin-grid">
                <label className="admin-field">
                  <span>Název</span>
                  <input value={eventName} onChange={(eventTarget) => setEventName(eventTarget.target.value)} />
                </label>
                <label className="admin-field">
                  <span>Slug</span>
                  <input value={eventSlug} onChange={(eventTarget) => setEventSlug(eventTarget.target.value)} />
                </label>
                <label className="admin-field">
                  <span>Začátek</span>
                  <input
                    type="date"
                    value={eventStartDate}
                    onChange={(eventTarget) => setEventStartDate(eventTarget.target.value)}
                  />
                </label>
                <label className="admin-field">
                  <span>Konec</span>
                  <input
                    type="date"
                    value={eventEndDate}
                    onChange={(eventTarget) => setEventEndDate(eventTarget.target.value)}
                  />
                </label>
              </div>
              <div className="admin-card-actions">
                <button type="button" className="admin-button admin-button--secondary" onClick={() => void handleCreateEvent()}>
                  Vytvořit event
                </button>
                <button
                  type="button"
                  className="admin-button admin-button--primary"
                  onClick={() => void handleUpdateEvent()}
                  disabled={!selectedEventId}
                >
                  Uložit event
                </button>
              </div>
            </section>
          ) : null}

          {activeSection === 'draw' ? (
            <section className="admin-card">
              <h2>Losování partií</h2>
              <p className="admin-card-subtitle">
                V každém bloku se vylosují 3 partie na stolech (max. {BOARD_DRAW_MAX_TABLES_PER_GAME} stolů na jednu deskovku). Losování respektuje oddíly a opakování soupeřů.
              </p>
              <p className="admin-card-subtitle">
                Losování spusť až ve chvíli, kdy jsou všichni účastníci nahraní v databázi.
              </p>
              <div className="admin-card-actions">
                <button
                  type="button"
                  className="admin-button admin-button--primary"
                  onClick={() => void handleGenerateDraw()}
                  disabled={!canGenerateDraw}
                  title={drawDisabledReason ?? undefined}
                >
                  {drawRunning ? 'Losuji…' : 'Spustit losování'}
                </button>
                <button
                  type="button"
                  className="admin-button admin-button--secondary"
                  onClick={() => void handleGenerateDraw('test')}
                  disabled={!canGenerateDraw}
                  title={drawDisabledReason ?? undefined}
                >
                  Test losování
                </button>
              </div>
              {drawProgress ? (
                <div className="deskovky-draw-progress" role="status" aria-live="polite">
                  <p className="admin-card-subtitle">{drawProgress.label}</p>
                  <progress max={drawProgress.total || 1} value={Math.min(drawProgress.current, drawProgress.total || 1)} />
                  <p className="admin-card-subtitle">
                    {Math.round((Math.min(drawProgress.current, drawProgress.total || 1) / (drawProgress.total || 1)) * 100)} %
                  </p>
                </div>
              ) : null}
              {drawDisabledReason ? <p className="admin-card-subtitle">{drawDisabledReason}</p> : null}
              {drawSummary ? <p className="admin-success">{drawSummary}</p> : null}
              {isMobile ? (
                <div className="deskovky-admin-mobile-list">
                  {categories.map((category) => {
                    const categoryPlayers = players.filter((player) => player.category_id === category.id);
                    const activePlayers = categoryPlayers.filter((player) => !player.disqualified);
                    const categoryBlocks = blocks.filter((block) => block.category_id === category.id);
                    return (
                      <article key={category.id} className="deskovky-admin-mobile-card">
                        <h3>{category.name}</h3>
                        <p className="deskovky-admin-mobile-meta">
                          Hráči celkem: <strong>{categoryPlayers.length}</strong>
                        </p>
                        <p className="deskovky-admin-mobile-meta">
                          Aktivní pro los: <strong>{activePlayers.length}</strong>
                        </p>
                        <p className="deskovky-admin-mobile-meta">
                          Bloky: <strong>{categoryBlocks.length}</strong>
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
                        <th>Kategorie</th>
                        <th>Hráči celkem</th>
                        <th>Aktivní pro los</th>
                        <th>Bloky</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((category) => {
                        const categoryPlayers = players.filter((player) => player.category_id === category.id);
                        const activePlayers = categoryPlayers.filter((player) => !player.disqualified);
                        const categoryBlocks = blocks.filter((block) => block.category_id === category.id);
                        return (
                          <tr key={category.id}>
                            <td>{category.name}</td>
                            <td>{categoryPlayers.length}</td>
                            <td>{activePlayers.length}</td>
                            <td>{categoryBlocks.length}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          {activeSection === 'disqualify' ? (
            <section className="admin-card">
              <h2>Diskvalifikace hráčů</h2>
              <div className="deskovky-admin-filters">
                <label className="admin-field">
                  <span>Hledat hráče</span>
                  <input
                    value={playerSearch}
                    onChange={(eventTarget) => setPlayerSearch(eventTarget.target.value)}
                    placeholder="Kód, jméno nebo oddíl…"
                  />
                </label>
                <label className="admin-field">
                  <span>Kategorie</span>
                  <select
                    value={playerCategoryFilter}
                    onChange={(eventTarget) => setPlayerCategoryFilter(eventTarget.target.value)}
                  >
                    <option value="">Všechny</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field">
                  <span>Vybraný hráč</span>
                  <select
                    value={selectedDisqualifyPlayerId}
                    onChange={(eventTarget) => setSelectedDisqualifyPlayerId(eventTarget.target.value)}
                  >
                    <option value="">Vyber hráče</option>
                    {filteredPlayers.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.short_code} · {player.display_name || player.team_name || 'Bez jména'}
                        {player.disqualified ? ' · DSQ' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {selectedDisqualifyPlayer ? (
                <div className="deskovky-admin-grid">
                  <article className="deskovky-assignment-card">
                    <h3>{selectedDisqualifyPlayer.display_name || selectedDisqualifyPlayer.short_code}</h3>
                    <p>
                      <strong>Oddíl:</strong> {selectedDisqualifyPlayer.team_name || '—'}
                    </p>
                    <p>
                      <strong>Kategorie:</strong>{' '}
                      {categoryMap.get(selectedDisqualifyPlayer.category_id)?.name ?? selectedDisqualifyPlayer.category_id}
                    </p>
                    <p>
                      <strong>Stav:</strong> {selectedDisqualifyPlayer.disqualified ? 'Diskvalifikován' : 'Aktivní'}
                    </p>
                    <div className="admin-card-actions">
                      <button
                        type="button"
                        className={`admin-button ${selectedDisqualifyPlayer.disqualified ? 'admin-button--secondary' : 'admin-button--primary'}`}
                        onClick={() =>
                          void handleSetPlayerDisqualified(
                            selectedDisqualifyPlayer.id,
                            !Boolean(selectedDisqualifyPlayer.disqualified),
                          )
                        }
                      >
                        {selectedDisqualifyPlayer.disqualified ? 'Zrušit diskvalifikaci' : 'Diskvalifikovat'}
                      </button>
                    </div>
                  </article>
                </div>
              ) : (
                <p className="admin-card-subtitle">Vyber hráče ze seznamu.</p>
              )}
            </section>
          ) : null}

          {activeSection === 'assignments' ? (
            <section className="admin-card">
              <h2>Přiřazení rozhodčích ke stolům</h2>
              <div className="deskovky-admin-grid">
                {judges.length ? (
                  <label className="admin-field">
                    <span>Rozhodčí</span>
                    <select
                      value={newAssignmentUserId}
                      onChange={(eventTarget) => setNewAssignmentUserId(eventTarget.target.value)}
                    >
                      <option value="">Vyber rozhodčího</option>
                      {judges.map((judge) => (
                        <option key={judge.id} value={judge.id}>
                          {judge.display_name} ({judge.email})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="admin-field">
                    <span>User ID rozhodčího (UUID)</span>
                    <input
                      value={newAssignmentUserId}
                      onChange={(eventTarget) => setNewAssignmentUserId(eventTarget.target.value)}
                      placeholder="uuid"
                    />
                  </label>
                )}

                <label className="admin-field">
                  <span>Hra</span>
                  <select value={newAssignmentGameId} onChange={(eventTarget) => setNewAssignmentGameId(eventTarget.target.value)}>
                    <option value="">Vyber hru</option>
                    {games.map((game) => (
                      <option key={game.id} value={game.id}>
                        {game.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="admin-field">
                  <span>Kategorie</span>
                  <select
                    value={newAssignmentCategoryId}
                    onChange={(eventTarget) => setNewAssignmentCategoryId(eventTarget.target.value)}
                  >
                    <option value="">Vyber kategorii</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="admin-field">
                  <span>Stůl</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={newAssignmentTableNumber}
                    onChange={(eventTarget) => setNewAssignmentTableNumber(eventTarget.target.value)}
                  />
                </label>
              </div>

              <p className="admin-card-subtitle">
                Zobrazeno {filteredAssignments.length} z {assignments.length} přiřazení.
              </p>

              {isMobile ? (
                <div className="deskovky-admin-mobile-list">
                  {filteredAssignments.map((assignment) => {
                    const judge = judgesMap.get(assignment.user_id);
                    return (
                      <article key={assignment.id} className="deskovky-admin-mobile-card">
                        <h3>{judge ? judge.display_name : assignment.user_id}</h3>
                        <p className="deskovky-admin-mobile-meta">{judge ? judge.email : 'Bez e-mailu v seznamu'}</p>
                        <p className="deskovky-admin-mobile-meta">
                          Hra: <strong>{gameMap.get(assignment.game_id)?.name ?? assignment.game_id}</strong>
                        </p>
                        <p className="deskovky-admin-mobile-meta">
                          Kategorie:{' '}
                          <strong>
                            {assignment.category_id
                              ? categoryMap.get(assignment.category_id)?.name ?? assignment.category_id
                              : '—'}
                          </strong>
                        </p>
                        <p className="deskovky-admin-mobile-meta">
                          Stůl: <strong>{assignment.table_number ?? '—'}</strong>
                        </p>
                        <div className="deskovky-admin-mobile-card-actions">
                          <button type="button" className="ghost" onClick={() => void handleDeleteAssignment(assignment.id)}>
                            Smazat
                          </button>
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
                        <th>Rozhodčí</th>
                        <th>Hra</th>
                        <th>Kategorie</th>
                        <th>Stůl</th>
                        <th>Akce</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAssignments.map((assignment) => {
                        const judge = judgesMap.get(assignment.user_id);
                        return (
                          <tr key={assignment.id}>
                            <td>{judge ? `${judge.display_name} (${judge.email})` : assignment.user_id}</td>
                            <td>{gameMap.get(assignment.game_id)?.name ?? assignment.game_id}</td>
                            <td>
                              {assignment.category_id
                                ? categoryMap.get(assignment.category_id)?.name ?? assignment.category_id
                                : '—'}
                            </td>
                            <td>{assignment.table_number ?? '—'}</td>
                            <td>
                              <button type="button" className="ghost" onClick={() => void handleDeleteAssignment(assignment.id)}>
                                Smazat
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          {activeSection === 'categories' ? (
            <section className="admin-card">
              <h2>Kategorie</h2>
              <div className="deskovky-admin-grid">
                <label className="admin-field">
                  <span>Název kategorie</span>
                  <input
                    value={newCategoryName}
                    onChange={(eventTarget) => setNewCategoryName(eventTarget.target.value)}
                    placeholder="Např. Kategorie I"
                  />
                </label>
                <label className="admin-field">
                  <span>Hlavní hra (tie-break)</span>
                  <select
                    value={newCategoryPrimaryGameId}
                    onChange={(eventTarget) => setNewCategoryPrimaryGameId(eventTarget.target.value)}
                    disabled={!games.length}
                  >
                    <option value="">Bez nastavení</option>
                    {games.map((game) => (
                      <option key={game.id} value={game.id}>
                        {game.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="admin-card-actions">
                <button type="button" className="admin-button admin-button--primary" onClick={() => void handleCreateCategory()}>
                  Přidat kategorii
                </button>
              </div>
              <div className="deskovky-table-wrap">
                <table className="deskovky-table">
                  <thead>
                    <tr>
                      <th>Kategorie</th>
                      <th>Hlavní hra</th>
                      <th>Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((category) => (
                      <tr key={category.id}>
                        <td>{category.name}</td>
                        <td>
                          <select
                            value={category.primary_game_id ?? ''}
                            onChange={(eventTarget) =>
                              void handleSetCategoryPrimaryGame(category.id, eventTarget.target.value)
                            }
                          >
                            <option value="">Bez nastavení</option>
                            {games.map((game) => (
                              <option key={game.id} value={game.id}>
                                {game.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button type="button" className="ghost" onClick={() => void handleDeleteCategory(category.id)}>
                            Smazat
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeSection === 'games' ? (
            <section className="admin-card">
              <h2>Hry</h2>
              <div className="deskovky-admin-grid">
                <label className="admin-field">
                  <span>Název hry</span>
                  <input value={newGameName} onChange={(eventTarget) => setNewGameName(eventTarget.target.value)} />
                </label>
                <label className="admin-field">
                  <span>Typ bodování</span>
                  <select
                    value={newGameScoringType}
                    onChange={(eventTarget) => setNewGameScoringType(eventTarget.target.value as BoardScoringType)}
                  >
                    <option value="points">points</option>
                    <option value="placement">placement</option>
                    <option value="both">both</option>
                  </select>
                </label>
                <label className="admin-field">
                  <span>Směr bodů</span>
                  <select
                    value={newGamePointsOrder}
                    onChange={(eventTarget) => setNewGamePointsOrder(eventTarget.target.value as BoardPointsOrder)}
                    disabled={newGameScoringType === 'placement'}
                  >
                    <option value="desc">Vyšší body = lepší</option>
                    <option value="asc">Nižší body = lepší</option>
                  </select>
                </label>
                <label className="deskovky-checkbox">
                  <input
                    type="checkbox"
                    checked={newGameThreePlayerAdjustment}
                    onChange={(eventTarget) => setNewGameThreePlayerAdjustment(eventTarget.target.checked)}
                  />
                  <span>Zapnout 3‑hráčovou úpravu (0.75 bodů + 1/2.5/4 pořadí)</span>
                </label>
                <label className="admin-field deskovky-field-full">
                  <span>Poznámka</span>
                  <input value={newGameNotes} onChange={(eventTarget) => setNewGameNotes(eventTarget.target.value)} />
                </label>
              </div>
              <div className="admin-card-actions">
                <button type="button" className="admin-button admin-button--primary" onClick={() => void handleCreateGame()}>
                  Přidat hru
                </button>
              </div>
              <p className="deskovky-admin-pagination-status">
                Zobrazeno <strong>{filteredGames.length}</strong> z <strong>{games.length}</strong> her{games.length > 0 ? '.' : '.'}
              </p>
              {isMobile ? (
                <div className="deskovky-admin-mobile-list">
                  {filteredGames.map((game) => (
                    <article key={game.id} className="deskovky-admin-mobile-card">
                      <h3>{game.name}</h3>
                      <p className="deskovky-admin-mobile-meta">
                        {game.scoring_type} · {game.points_order === 'asc' ? 'nižší body lepší' : 'vyšší body lepší'}
                      </p>
                      <p className="deskovky-admin-mobile-meta">
                        3P úprava: <strong>{game.three_player_adjustment ? 'Zapnuto' : 'Vypnuto'}</strong>
                      </p>
                      {game.notes ? <p className="deskovky-admin-mobile-note">{game.notes}</p> : null}
                      <div className="deskovky-admin-mobile-card-actions">
                        <button type="button" className="ghost" onClick={() => void handleDeleteGame(game.id)}>
                          Smazat
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="deskovky-table-wrap">
                  <table className="deskovky-table">
                    <thead>
                      <tr>
                        <th>Hra</th>
                        <th>Typ bodování</th>
                        <th>Směr bodů</th>
                        <th>3P úprava</th>
                        <th>Poznámka</th>
                        <th>Akce</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGames.map((game) => (
                        <tr key={game.id}>
                          <td>{game.name}</td>
                          <td>{game.scoring_type}</td>
                          <td>{game.points_order === 'asc' ? 'nižší body lepší' : 'vyšší body lepší'}</td>
                          <td>{game.three_player_adjustment ? 'Ano' : 'Ne'}</td>
                          <td>{game.notes || '—'}</td>
                          <td>
                            <button type="button" className="ghost" onClick={() => void handleDeleteGame(game.id)}>
                              Smazat
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          {activeSection === 'blocks' ? (
            <section className="admin-card">
              <h2>Bloky</h2>
              <div className="deskovky-admin-grid">
                <label className="admin-field">
                  <span>Kategorie</span>
                  <select value={newBlockCategoryId} onChange={(eventTarget) => setNewBlockCategoryId(eventTarget.target.value)}>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field">
                  <span>Hra</span>
                  <select value={newBlockGameId} onChange={(eventTarget) => setNewBlockGameId(eventTarget.target.value)}>
                    {games.map((game) => (
                      <option key={game.id} value={game.id}>
                        {game.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field">
                  <span>Číslo bloku</span>
                  <input
                    type="number"
                    min={1}
                    value={newBlockNumber}
                    onChange={(eventTarget) => setNewBlockNumber(eventTarget.target.value)}
                  />
                </label>
              </div>
              <div className="admin-card-actions">
                <button type="button" className="admin-button admin-button--primary" onClick={() => void handleCreateBlock()}>
                  Přidat blok
                </button>
              </div>

              {isMobile ? (
                <div className="deskovky-admin-mobile-list">
                  {blocks.map((block) => (
                    <article key={block.id} className="deskovky-admin-mobile-card">
                      <h3>Blok {block.block_number}</h3>
                      <p className="deskovky-admin-mobile-meta">
                        Kategorie: <strong>{categoryMap.get(block.category_id)?.name ?? block.category_id}</strong>
                      </p>
                      <p className="deskovky-admin-mobile-meta">
                        Hra: <strong>{gameMap.get(block.game_id)?.name ?? block.game_id}</strong>
                      </p>
                      <div className="deskovky-admin-mobile-card-actions">
                        <button type="button" className="ghost" onClick={() => void handleDeleteBlock(block.id)}>
                          Smazat
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="deskovky-table-wrap">
                  <table className="deskovky-table">
                    <thead>
                      <tr>
                        <th>Blok</th>
                        <th>Kategorie</th>
                        <th>Hra</th>
                        <th>Akce</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blocks.map((block) => (
                        <tr key={block.id}>
                          <td>{block.block_number}</td>
                          <td>{categoryMap.get(block.category_id)?.name ?? block.category_id}</td>
                          <td>{gameMap.get(block.game_id)?.name ?? block.game_id}</td>
                          <td>
                            <button type="button" className="ghost" onClick={() => void handleDeleteBlock(block.id)}>
                              Smazat
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          {activeSection === 'players' ? (
            <section className="admin-card">
              <h2>Hráči</h2>
              <p className="admin-card-subtitle">Správa hráčů načtených v aktivním eventu.</p>
              {isMobile ? (
                <div className="deskovky-admin-mobile-list">
                  {pagedPlayers.map((player) => (
                    <article key={player.id} className="deskovky-admin-mobile-card">
                      <h3>{player.display_name || player.team_name || player.short_code}</h3>
                      <p className="deskovky-admin-mobile-meta">
                        Kód: <strong>{player.short_code}</strong>
                      </p>
                      <p className="deskovky-admin-mobile-meta">
                        Kategorie: <strong>{categoryMap.get(player.category_id)?.name ?? player.category_id}</strong>
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="deskovky-table-wrap">
                  <table className="deskovky-table">
                    <thead>
                      <tr>
                        <th>Kód</th>
                        <th>Jméno / tým</th>
                        <th>Kategorie</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedPlayers.map((player) => (
                        <tr key={player.id}>
                          <td>{player.short_code}</td>
                          <td>{player.display_name || player.team_name || '—'}</td>
                          <td>{categoryMap.get(player.category_id)?.name ?? player.category_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="deskovky-admin-pagination">
                <p className="deskovky-admin-pagination-status">
                  Zobrazeno {pagedPlayers.length} z {filteredPlayers.length} hráčů (strana {safePlayerPage}/{playerTotalPages}).
                </p>
                <div className="admin-card-actions">
                  <button
                    type="button"
                    className="admin-button admin-button--secondary"
                    onClick={() => setPlayerPage((current) => Math.max(1, current - 1))}
                    disabled={safePlayerPage <= 1}
                    aria-label={`Předchozí strana hráčů (strana ${Math.max(1, safePlayerPage - 1)})`}
                  >
                    Předchozí
                  </button>
                  <button
                    type="button"
                    className="admin-button admin-button--secondary"
                    onClick={() => setPlayerPage((current) => Math.min(playerTotalPages, current + 1))}
                    disabled={safePlayerPage >= playerTotalPages}
                    aria-label={`Další strana hráčů (strana ${Math.min(playerTotalPages, safePlayerPage + 1)})`}
                  >
                    Další
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {activeSection === 'judges' ? (
            <section className="admin-card">
              <h2>Přiřazení rozhodčích</h2>
              <div className="deskovky-admin-grid">
                {judges.length ? (
                  <label className="admin-field">
                    <span>Rozhodčí</span>
                    <select
                      value={newAssignmentUserId}
                      onChange={(eventTarget) => setNewAssignmentUserId(eventTarget.target.value)}
                    >
                      <option value="">Vyber rozhodčího</option>
                      {judges.map((judge) => (
                        <option key={judge.id} value={judge.id}>
                          {judge.display_name} ({judge.email})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="admin-field">
                    <span>User ID rozhodčího (UUID)</span>
                    <input
                      value={newAssignmentUserId}
                      onChange={(eventTarget) => setNewAssignmentUserId(eventTarget.target.value)}
                      placeholder="uuid"
                    />
                  </label>
                )}

                <label className="admin-field">
                  <span>Hra</span>
                  <select value={newAssignmentGameId} onChange={(eventTarget) => setNewAssignmentGameId(eventTarget.target.value)}>
                    <option value="">Vyber hru</option>
                    {games.map((game) => (
                      <option key={game.id} value={game.id}>
                        {game.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="admin-field">
                  <span>Kategorie (volitelné)</span>
                  <select
                    value={newAssignmentCategoryId}
                    onChange={(eventTarget) => setNewAssignmentCategoryId(eventTarget.target.value)}
                  >
                    <option value="">Všechny</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <p className="admin-card-subtitle">
                Zobrazeno {filteredAssignments.length} z {assignments.length} přiřazení.
              </p>

              {isMobile ? (
                <div className="deskovky-admin-mobile-list">
                  {filteredAssignments.map((assignment) => {
                    const judge = judgesMap.get(assignment.user_id);
                    return (
                      <article key={assignment.id} className="deskovky-admin-mobile-card">
                        <h3>{judge ? judge.display_name : assignment.user_id}</h3>
                        <p className="deskovky-admin-mobile-meta">{judge ? judge.email : 'Bez e-mailu v seznamu'}</p>
                        <p className="deskovky-admin-mobile-meta">
                          Hra: <strong>{gameMap.get(assignment.game_id)?.name ?? assignment.game_id}</strong>
                        </p>
                        <p className="deskovky-admin-mobile-meta">
                          Kategorie:{' '}
                          <strong>
                            {assignment.category_id
                              ? categoryMap.get(assignment.category_id)?.name ?? assignment.category_id
                              : 'Všechny'}
                          </strong>
                        </p>
                        <div className="deskovky-admin-mobile-card-actions">
                          <button type="button" className="ghost" onClick={() => void handleDeleteAssignment(assignment.id)}>
                            Smazat
                          </button>
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
                        <th>Rozhodčí</th>
                        <th>Hra</th>
                        <th>Kategorie</th>
                        <th>Akce</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAssignments.map((assignment) => {
                        const judge = judgesMap.get(assignment.user_id);
                        return (
                          <tr key={assignment.id}>
                            <td>{judge ? `${judge.display_name} (${judge.email})` : assignment.user_id}</td>
                            <td>{gameMap.get(assignment.game_id)?.name ?? assignment.game_id}</td>
                            <td>
                              {assignment.category_id
                                ? categoryMap.get(assignment.category_id)?.name ?? assignment.category_id
                                : 'Všechny'}
                            </td>
                            <td>
                              <button type="button" className="ghost" onClick={() => void handleDeleteAssignment(assignment.id)}>
                                Smazat
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          {activeSection === 'import-export' ? (
            <section className="admin-card">
              <h2>Import / export hráčů</h2>
              <p className="admin-card-subtitle">CSV hlavička: short_code,team_name,display_name,category</p>
              <label className="admin-field deskovky-field-full">
                <span>CSV import</span>
                <textarea value={csvInput} onChange={(eventTarget) => setCsvInput(eventTarget.target.value)} rows={8} />
              </label>
              <label className="deskovky-checkbox">
                <input
                  type="checkbox"
                  checked={autoGenerateCodes}
                  onChange={(eventTarget) => setAutoGenerateCodes(eventTarget.target.checked)}
                />
                <span>Automaticky generovat short_code, pokud chybí</span>
              </label>
              <div className="admin-card-actions">
                <button type="button" className="admin-button admin-button--primary" onClick={() => void handleImportPlayers()}>
                  Importovat CSV
                </button>
                <button
                  type="button"
                  className="admin-button admin-button--secondary"
                  onClick={() => void handleExportBadges()}
                >
                  Export visaček (CSV)
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
