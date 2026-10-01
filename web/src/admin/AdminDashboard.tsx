import { CollapsibleSetupSection } from './components/CollapsibleSetupSection';
import ExcelJS from 'exceljs';
import { useCallback,useEffect,useMemo,useState } from 'react';
import AppFooter from '../components/AppFooter';
import {
ADMIN_ROUTE_PREFIX,
MAPA_PROCHODU_ROUTE,
} from '../routing';
import { supabase } from '../supabaseClient';
import {
STATION_PASSAGE_CATEGORIES,
StationCategoryKey,
toStationCategoryKey
} from '../utils/stationCategories';
import {
ANSWER_CATEGORIES,
CategoryKey,
isCategoryKey,
normalizeAnswersInput,
parseAnswerLetters,
type TargetAnswerOptionCount,
} from '../utils/targetAnswers';
import {
buildAdminRoutePath,
detectAdminRoutePrefix,
parseAdminRoute,
type AdminPageKey,
} from './adminRoutes';
import {
EMPTY_RACE_DASHBOARD_SUMMARY,
toAdminSectionId,
type RaceDashboardSummary,
} from './adminSections';
import { ADMIN_PAGE_TITLE } from './adminTitles';
import { createEmptyAnswers,createEmptySummary } from './answers/model';
import { API_BASE_URL } from './apiConfig';
import {
AdminLiveMapSection,
AdminLiveOverviewSection,
AdminPatrolsOverviewSection,
AdminQueuesSection,
AdminResultsSection,
AdminStartsSection,
AdminStatsSection,
} from './components/AdminOverviewSections';
import AdminSectionNav from './components/AdminSectionNav';
import AdminStationHealthPanel,{
type AdminStationHealthCard
} from './components/AdminStationHealthPanel';
import { buildPatrolCodeVariants,comparePatrolOrder,downloadWorkbook,extractPatrolMembers,parsePatrolCodeParts,toExportFileName,toUniqueWorksheetName,toWorksheetBaseName } from './exports/patrolWorkbook';
import { BASE_CATEGORY_ORDER,MAYBE_LOST_PATROL_THRESHOLD_MS } from './overview/constants';
import { SETUP_SELECTED_EVENT_STORAGE_KEY } from './setup/config';
import { DEFAULT_JUDGE_TASK_PRESET,JUDGE_TASK_PRESETS,createBaseCategoryRecord,createDefaultCategoryToggleState,createDefaultOrderTextState,createDefaultPatrolCounts,createDefaultPatrolStarts,createDefaultSeparatorState,createDefaultSetupEventScoringConfig,getConfiguredStationBaseCategories,getJudgeTasksForPreset,normalizeSetupEventScoringConfig,normalizeSetupStationOrder,normalizeStationSplitCategories,toJudgeTaskPresetKey } from './setup/model';
import { DEFAULT_SETUP_TROOP_OPTIONS,compareTroopSheetOrder,normalizeTroopList,normalizeTroopName,parseTroopNumber,pickCanonicalTroopName,splitMixedTroopNames } from './setup/troops';
import { DEFAULT_TARGET_ANSWER_OPTION_COUNT,formatMinutesAsTimeInput,parseTimeInputToMinutes,toPositiveInt,toTargetAnswerOptionCount } from './setup/validation';
import { normalizeText } from './shared/text';
import { AnswersFormState,AnswersSummary,AuthenticatedState,CategoryToggleState,DisqualifyPatrol,EventState,JudgeTaskPresetKey,MissingDialogState,PatrolCountsState,PatrolStartsState,PatrolSummary,SelectedSetupAssignmentSummary,SetupAssignmentRow,SetupEventRow,SetupEventScoringConfig,SetupJudgeRow,SetupStationOrderPayload,SetupStationOrderRow,SetupStationRow,StationPassageRow } from './types';
import { TargetAnswersSection } from './answers/TargetAnswersSection';
import { EventScoringSettings } from './setup/EventScoringSettings';
import { StationPassagesSection } from './overview/StationPassagesSection';

export function AdminDashboard({
  auth,
  refreshManifest,
  logout,
}: {
  auth: AuthenticatedState;
  refreshManifest: () => Promise<void>;
  logout: () => Promise<void>;
}) {
  const manifest = auth.manifest;
  const stationCode = manifest.station.code?.trim().toUpperCase() ?? '';
  const isCalcStation = stationCode === 'T';
  const eventId = manifest.event.id;
  const stationId = manifest.station.id;
  const accessToken = auth.tokens.accessToken;

  const [answersForm, setAnswersForm] = useState<AnswersFormState>(() => createEmptyAnswers());
  const [answersSummary, setAnswersSummary] = useState<AnswersSummary>(() => createEmptySummary());
  const [answersLoading, setAnswersLoading] = useState(false);
  const [answersSaving, setAnswersSaving] = useState(false);
  const [answersError, setAnswersError] = useState<string | null>(null);
  const [answersSuccess, setAnswersSuccess] = useState<string | null>(null);

  const [stationRows, setStationRows] = useState<StationPassageRow[]>([]);
  const [waitingSinceMs, setWaitingSinceMs] = useState<number[]>([]);
  const [stationQueues, setStationQueues] = useState<Map<string, { waiting: number; serving: number }>>(new Map());
  const [stationLoading, setStationLoading] = useState(false);
  const [stationError, setStationError] = useState<string | null>(null);
  const [missingDialog, setMissingDialog] = useState<MissingDialogState | null>(null);

  const [eventState, setEventState] = useState<EventState>({
    name: manifest.event.name,
    scoringLocked: manifest.event.scoringLocked,
    resultsConfirmedAt: null,
  });
  const [eventLoading, setEventLoading] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [lockUpdating, setLockUpdating] = useState(false);
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const [confirmingResults, setConfirmingResults] = useState(false);
  const [resultsConfirmationMessage, setResultsConfirmationMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [disqualifyCode, setDisqualifyCode] = useState('');
  const [disqualifyTarget, setDisqualifyTarget] = useState<DisqualifyPatrol | null>(null);
  const [disqualifyLoading, setDisqualifyLoading] = useState(false);
  const [disqualifySaving, setDisqualifySaving] = useState(false);
  const [disqualifyError, setDisqualifyError] = useState<string | null>(null);
  const [disqualifySuccess, setDisqualifySuccess] = useState<string | null>(null);
  const [exportingNames, setExportingNames] = useState(false);

  const [setupLoading, setSetupLoading] = useState(false);
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupSuccess, setSetupSuccess] = useState<string | null>(null);
  const [setupEvents, setSetupEvents] = useState<SetupEventRow[]>([]);
  const [setupStations, setSetupStations] = useState<SetupStationRow[]>([]);
  const [setupJudges, setSetupJudges] = useState<SetupJudgeRow[]>([]);
  const [setupAssignments, setSetupAssignments] = useState<SetupAssignmentRow[]>([]);
  const [setupOrders, setSetupOrders] = useState<Record<string, SetupStationOrderPayload>>({});
  const [selectedSetupEventId, setSelectedSetupEventId] = useState(() => {
    if (typeof window === 'undefined') {
      return eventId;
    }
    return window.localStorage.getItem(SETUP_SELECTED_EVENT_STORAGE_KEY) || eventId;
  });
  const normalizedSelectedSetupEventId = normalizeText(selectedSetupEventId);
  const activeEventId = useMemo(() => {
    if (!setupEvents.length) {
      return eventId;
    }
    if (
      normalizedSelectedSetupEventId &&
      setupEvents.some((eventRow) => eventRow.id === normalizedSelectedSetupEventId)
    ) {
      return normalizedSelectedSetupEventId;
    }
    return eventId;
  }, [eventId, normalizedSelectedSetupEventId, setupEvents]);
  const [activeAdminPage, setActiveAdminPage] = useState<AdminPageKey>(() => {
    if (typeof window === 'undefined') {
      return 'live';
    }
    return parseAdminRoute(window.location.pathname).page;
  });
  const [adminRoutePrefix, setAdminRoutePrefix] = useState(() => {
    if (typeof window === 'undefined') {
      return ADMIN_ROUTE_PREFIX;
    }
    return detectAdminRoutePrefix(window.location.pathname);
  });
  const [pageTransitioning, setPageTransitioning] = useState(false);
  const [raceDashboardSummary, setRaceDashboardSummary] = useState<RaceDashboardSummary>(
    EMPTY_RACE_DASHBOARD_SUMMARY,
  );
  const [setupEventScoringConfig, setSetupEventScoringConfig] = useState<SetupEventScoringConfig>(
    () => createDefaultSetupEventScoringConfig(),
  );
  const [setupTroopDraft, setSetupTroopDraft] = useState('');
  const [answersTargetOptionCount, setAnswersTargetOptionCount] = useState<TargetAnswerOptionCount>(
    () => (manifest.event.targetAnswerOptionCount === 3 ? 3 : DEFAULT_TARGET_ANSWER_OPTION_COUNT),
  );
  const targetAnswerInputPattern = answersTargetOptionCount === 3 ? '[A-Ca-c]*' : '[A-Da-d]*';
  const targetAnswerInputHint = answersTargetOptionCount === 3 ? 'A-C' : 'A-D';

  const [createEventName, setCreateEventName] = useState('');
  const [createEventStartsAt, setCreateEventStartsAt] = useState('');
  const [createEventEndsAt, setCreateEventEndsAt] = useState('');
  const [copyStationsFromCurrentEvent, setCopyStationsFromCurrentEvent] = useState(true);

  const [orderInputs, setOrderInputs] = useState<Record<StationCategoryKey, string>>(() => createDefaultOrderTextState());
  const [separatorInputs, setSeparatorInputs] = useState<Partial<Record<StationCategoryKey, string>>>(
    () => createDefaultSeparatorState(),
  );

  const [judgeEmailInput, setJudgeEmailInput] = useState('');
  const [judgeDisplayNameInput, setJudgeDisplayNameInput] = useState('');
  const [judgeStationCodeInput, setJudgeStationCodeInput] = useState('');
  const [judgeCategoryToggle, setJudgeCategoryToggle] = useState<CategoryToggleState>(() => createDefaultCategoryToggleState());
  const [judgeTaskPreset, setJudgeTaskPreset] = useState<JudgeTaskPresetKey>(DEFAULT_JUDGE_TASK_PRESET);
  const [stationClosingId, setStationClosingId] = useState<string | null>(null);

  const [patrolCounts, setPatrolCounts] = useState<PatrolCountsState>(() => createDefaultPatrolCounts());
  const [patrolStarts, setPatrolStarts] = useState<PatrolStartsState>(() => createDefaultPatrolStarts());

  useEffect(() => {
    setEventState((previous) => ({ ...previous, name: manifest.event.name, scoringLocked: manifest.event.scoringLocked }));
  }, [manifest.event.name, manifest.event.scoringLocked]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!selectedSetupEventId) {
      window.localStorage.removeItem(SETUP_SELECTED_EVENT_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(SETUP_SELECTED_EVENT_STORAGE_KEY, selectedSetupEventId);
  }, [selectedSetupEventId]);

  const postSetupAction = useCallback(
    async (action: string, payload: Record<string, unknown>) => {
      if (!API_BASE_URL) {
        throw new Error('Chybí konfigurace API (VITE_AUTH_API_URL).');
      }
      if (!accessToken) {
        throw new Error('Chybí přístupový token.');
      }
      const response = await fetch(`${API_BASE_URL}/admin/event-state?setup=1`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, ...payload }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const message = [body?.error || `Akce ${action} selhala.`, body?.detail].filter(Boolean).join(' ');
        throw new Error(message);
      }
      return body;
    },
    [accessToken],
  );

  const loadAnswers = useCallback(async () => {
    setAnswersLoading(true);
    setAnswersError(null);
    try {
      const result = await postSetupAction('load_target_answers', { event_id: activeEventId });
      const data = result.answers as Array<{ category: string; correct_answers: string; updated_at: string | null }>;
      const form = createEmptyAnswers();
      const summary = createEmptySummary();
      (data ?? []).forEach((row) => {
        const category = typeof row.category === 'string' ? row.category.trim().toUpperCase() : '';
        if (!isCategoryKey(category)) {
          return;
        }
        const packed = typeof row.correct_answers === 'string' ? row.correct_answers : '';
        form[category] = normalizeAnswersInput(packed);
        summary[category] = {
          letters: parseAnswerLetters(packed),
          updatedAt: row.updated_at ?? null,
        };
      });

      setAnswersForm(form);
      setAnswersSummary(summary);
      return true;
    } catch (error) {
      setAnswersError(error instanceof Error ? error.message : 'Nepodařilo se načíst správné odpovědi.');
      return false;
    } finally {
      setAnswersLoading(false);
    }
  }, [activeEventId, postSetupAction]);

  const loadStationStats = useCallback(async () => {
    setStationLoading(true);
    setStationError(null);
    setMissingDialog(null);

    // Read via the admin API (service role): the browser's anon Supabase client is blocked by RLS.
    type StationOverviewPayload = {
      stations?: unknown[];
      passages?: unknown[];
      patrols?: unknown[];
      tickets?: Array<{ station_id: string; state: 'waiting' | 'serving'; arrived_at: string | null }> | null;
    };
    let overview: StationOverviewPayload | null = null;
    let overviewError: Error | null = null;
    if (!API_BASE_URL || !accessToken) {
      overviewError = new Error('Missing admin API configuration or token.');
    } else {
      try {
        const response = await fetch(
          `${API_BASE_URL}/admin/event-state?stationOverview=1&event_id=${encodeURIComponent(activeEventId)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || `Station overview failed (${response.status})`);
        }
        overview = (await response.json()) as StationOverviewPayload;
      } catch (error) {
        overviewError = error instanceof Error ? error : new Error(String(error));
      }
    }
    const stationsRes = { data: overview?.stations ?? [], error: overviewError };
    const passagesRes = { data: overview?.passages ?? [], error: overviewError };
    const patrolsRes = { data: overview?.patrols ?? [], error: overviewError };
    const ticketsRes = { data: overview?.tickets ?? [], error: overview?.tickets === null ? new Error('tickets unavailable') : null };

    setStationLoading(false);

    if (!ticketsRes.error) {
      const queues = new Map<string, { waiting: number; serving: number }>();
      const ticketRows = ((ticketsRes.data ?? []) as Array<{ station_id: string; state: 'waiting' | 'serving'; arrived_at: string | null }>);
      const waitingSince: number[] = [];
      ticketRows.forEach((row) => {
        const arrivedMs = Date.parse(row.arrived_at ?? '');
        if (row.state === 'waiting' && Number.isFinite(arrivedMs)) {
          waitingSince.push(arrivedMs);
        }
        const entry = queues.get(row.station_id) ?? { waiting: 0, serving: 0 };
        entry[row.state] += 1;
        queues.set(row.station_id, entry);
      });
      setStationQueues(queues);
      setWaitingSinceMs(waitingSince);
    } else if (overview) {
      console.warn('Station queues unavailable');
    }

    if (stationsRes.error || passagesRes.error || patrolsRes.error) {
      console.error(
        'Failed to load station passages overview',
        stationsRes.error,
        passagesRes.error,
        patrolsRes.error,
      );
      setStationError('Nepodařilo se načíst průchody stanovišť.');
      setStationRows([]);
      setRaceDashboardSummary((previous) => ({
        ...previous,
        problematicStations: Math.max(1, previous.problematicStations),
      }));
      return;
    }

    const stations = new Map<string, {
      code: string;
      name: string;
      isClosed: boolean;
      isSplit: boolean;
      splitCategories: CategoryKey[];
    }>();
    ((stationsRes.data ?? []) as Array<{
      id: string;
      code: string;
      name: string;
      is_closed?: boolean | null;
      is_split?: boolean | null;
      split_categories?: unknown;
    }>).forEach((station) => {
      const code = (station.code || '').trim().toUpperCase();
      if (code === 'R') {
        return;
      }
      stations.set(station.id, {
        code,
        name: station.name,
        isClosed: station.is_closed === true,
        isSplit: station.is_split === true,
        splitCategories: normalizeStationSplitCategories(station.split_categories),
      });
    });

    const categoryPatrols = createBaseCategoryRecord<PatrolSummary[]>(() => []);
    const allPatrols: PatrolSummary[] = [];

    type PatrolRow = {
      id: string;
      category: string | null;
      sex: string | null;
      patrol_code: string | null;
      team_name: string | null;
      active: boolean | null;
    };

    ((patrolsRes.data ?? []) as PatrolRow[]).forEach((patrol) => {
      if (patrol.active === false) {
        return;
      }
      const stationCategory = toStationCategoryKey(patrol.category, patrol.sex);
      if (!stationCategory) {
        return;
      }
      const summary: PatrolSummary = {
        id: patrol.id,
        code: normalizeText(patrol.patrol_code).toUpperCase(),
        teamName: normalizeText(patrol.team_name),
        category: stationCategory.slice(0, 1) as CategoryKey,
      };
      categoryPatrols[summary.category].push(summary);
      allPatrols.push(summary);
    });

    BASE_CATEGORY_ORDER.forEach((category) => {
      categoryPatrols[category].sort((a, b) => a.code.localeCompare(b.code, 'cs'));
    });

    type StationAccumulator = {
      stationId: string;
      stationCode: string;
      stationName: string;
      lastPassageAt: string | null;
      totals: Record<CategoryKey, number>;
      passed: Record<CategoryKey, Set<string>>;
    };

    const totals = new Map<string, StationAccumulator>();
    stations.forEach((station, id) => {
      totals.set(id, {
        stationId: id,
        stationCode: station.code,
        stationName: station.name,
        lastPassageAt: null,
        totals: createBaseCategoryRecord<number>(() => 0),
        passed: createBaseCategoryRecord<Set<string>>(() => new Set<string>()),
      });
    });

    type PassageRow = {
      station_id: string;
      patrol_id: string;
      arrived_at?: string | null;
      left_at?: string | null;
      client_created_at?: string | null;
      patrols?: { category?: string | null; sex?: string | null } | null;
    };

    ((passagesRes.data ?? []) as PassageRow[]).forEach((row) => {
      const station = totals.get(row.station_id);
      if (!station) {
        return;
      }
      const stationCategory = toStationCategoryKey(row.patrols?.category ?? null, row.patrols?.sex ?? null);
      if (!stationCategory) {
        return;
      }

      const maybeLatest = normalizeText(row.left_at) || normalizeText(row.arrived_at) || normalizeText(row.client_created_at);
      if (maybeLatest) {
        const latestTs = Date.parse(maybeLatest);
        const currentTs = Date.parse(station.lastPassageAt ?? '');
        if (Number.isFinite(latestTs) && (!Number.isFinite(currentTs) || latestTs > currentTs)) {
          station.lastPassageAt = maybeLatest;
        }
      }

      const baseCategory = stationCategory.slice(0, 1) as CategoryKey;
      station.totals[baseCategory] += 1;
      station.passed[baseCategory].add(row.patrol_id);
    });

    const sorted = Array.from(totals.values()).sort((a, b) =>
      a.stationCode.localeCompare(b.stationCode, 'cs'),
    );

    const rows: StationPassageRow[] = sorted.map((station) => {
      const stationConfig = stations.get(station.stationId);
      const categories = getConfiguredStationBaseCategories({
        stationCode: station.stationCode,
        isSplit: stationConfig?.isSplit ?? false,
        splitCategories: stationConfig?.splitCategories ?? [],
      });
      const allowedCategorySet = new Set<CategoryKey>(categories);
      const missing = createBaseCategoryRecord<PatrolSummary[]>(() => []);
      const expectedTotals = createBaseCategoryRecord<number>(() => 0);
      const passedOverall = new Set<string>();

      categories.forEach((category) => {
        const passed = station.passed[category];
        passed.forEach((id) => passedOverall.add(id));
        expectedTotals[category] = categoryPatrols[category].length;
        missing[category] = categoryPatrols[category].filter((patrol) => !passed.has(patrol.id));
      });

      const totalMissing = allPatrols.filter(
        (patrol) => allowedCategorySet.has(patrol.category) && !passedOverall.has(patrol.id),
      );

      const totalPassed = categories.reduce((sum, category) => sum + station.totals[category], 0);
      const totalExpected = categories.reduce((sum, category) => sum + expectedTotals[category], 0);

      return {
        stationId: station.stationId,
        stationCode: station.stationCode,
        stationName: station.stationName,
        lastPassageAt: station.lastPassageAt,
        categories,
        totals: station.totals,
        expectedTotals,
        totalPassed,
        totalExpected,
        missing,
        totalMissing,
      };
    });

    setStationRows(rows);
    const activePatrolById = new Map(allPatrols.map((patrol) => [patrol.id, patrol] as const));
    const activePatrolIds = new Set(activePatrolById.keys());
    const patrolsSeenOnCourse = new Set<string>();
    const patrolsFinished = new Set<string>();
    const lastSeenByPatrol = new Map<string, {
      at: string;
      stationCode: string;
      stationName: string;
    }>();
    ((passagesRes.data ?? []) as PassageRow[]).forEach((row) => {
      if (!activePatrolIds.has(row.patrol_id)) {
        return;
      }
      const station = stations.get(row.station_id);
      if (!station) {
        return;
      }
      patrolsSeenOnCourse.add(row.patrol_id);
      const maybeLatest = normalizeText(row.left_at) || normalizeText(row.arrived_at) || normalizeText(row.client_created_at);
      const latestTs = Date.parse(maybeLatest);
      const previousTs = Date.parse(lastSeenByPatrol.get(row.patrol_id)?.at ?? '');
      if (Number.isFinite(latestTs) && (!Number.isFinite(previousTs) || latestTs > previousTs)) {
        lastSeenByPatrol.set(row.patrol_id, {
          at: maybeLatest,
          stationCode: station.code,
          stationName: station.name,
        });
      }
      if (station.code === 'T') {
        patrolsFinished.add(row.patrol_id);
      }
    });
    const registeredPatrols = activePatrolIds.size;
    const patrolsSeen = patrolsSeenOnCourse.size;
    const finished = patrolsFinished.size;
    const waitingForStart = Math.max(0, registeredPatrols - patrolsSeen);
    const onCourse = Math.max(0, patrolsSeen - finished);
    const syncConflicts = rows.filter((row) => row.totalExpected > 0 && row.totalPassed > row.totalExpected).length;
    const problematicStations = rows.filter(
      (row) => row.totalExpected > 0 && row.totalPassed === 0 && patrolsSeen > 0,
    ).length;
    const now = Date.now();
    const maybeLostPatrols = Array.from(lastSeenByPatrol.entries())
      .filter(([patrolId, lastSeen]) => {
        if (patrolsFinished.has(patrolId)) {
          return false;
        }
        const lastSeenTs = Date.parse(lastSeen.at);
        return Number.isFinite(lastSeenTs) && now - lastSeenTs > MAYBE_LOST_PATROL_THRESHOLD_MS;
      })
      .map(([patrolId, lastSeen]) => {
        const patrol = activePatrolById.get(patrolId);
        return {
          id: patrolId,
          code: patrol?.code || 'Bez kódu',
          teamName: patrol?.teamName || '',
          lastSeenAt: lastSeen.at,
          stationCode: lastSeen.stationCode,
          stationName: lastSeen.stationName,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code, 'cs'));
    setRaceDashboardSummary({
      registeredPatrols,
      patrolsSeenOnCourse: patrolsSeen,
      patrolsOnCourse: onCourse,
      patrolsFinished: finished,
      patrolsWaitingForStart: waitingForStart,
      problematicStations,
      syncConflicts,
      missingLongPatrols: maybeLostPatrols.length,
      maybeLostPatrols,
      overdueNoFinishPatrols: 0,
      lastSyncAt: new Date().toISOString(),
    });
  }, [accessToken, activeEventId]);

  const handleOpenStationMissing = useCallback(
    (row: StationPassageRow, category: CategoryKey | 'TOTAL') => {
      if (category === 'TOTAL') {
        setMissingDialog({
          stationCode: row.stationCode,
          stationName: row.stationName,
          category,
          missing: row.totalMissing,
          expected: row.totalExpected,
        });
        return;
      }

      setMissingDialog({
        stationCode: row.stationCode,
        stationName: row.stationName,
        category,
        missing: row.missing[category],
        expected: row.expectedTotals[category],
      });
    },
    [],
  );

  const handleCloseMissingDialog = useCallback(() => {
    setMissingDialog(null);
  }, []);

  const loadEventState = useCallback(async () => {
    if (!API_BASE_URL) {
      setEventError('Chybí konfigurace API (VITE_AUTH_API_URL).');
      return;
    }
    if (!accessToken) {
      setEventError('Chybí přístupový token.');
      return;
    }

    setEventLoading(true);
    setEventError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/admin/event-state`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body?.error || 'Nepodařilo se načíst stav závodu.';
        throw new Error(message);
      }

      const payload = (await response.json()) as { eventName: string; scoringLocked: boolean; resultsConfirmedAt?: string | null };
      setEventState({ name: payload.eventName, scoringLocked: payload.scoringLocked, resultsConfirmedAt: payload.resultsConfirmedAt ?? null });
    } catch (error) {
      console.error('Failed to load event state', error);
      setEventError(
        error instanceof Error && error.message ? error.message : 'Nepodařilo se načíst stav závodu.',
      );
    } finally {
      setEventLoading(false);
    }
  }, [accessToken]);

  const loadSetupData = useCallback(async () => {
    if (!API_BASE_URL) {
      setSetupError('Chybí konfigurace API (VITE_AUTH_API_URL).');
      return;
    }
    if (!accessToken) {
      setSetupError('Chybí přístupový token.');
      return;
    }

    setSetupLoading(true);
    setSetupError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/admin/event-state?setup=1`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body?.error || 'Nepodařilo se načíst nastavení ročníků.';
        throw new Error(message);
      }

      const payload = (await response.json()) as {
        current_event_id?: string;
        events?: SetupEventRow[];
        stations?: SetupStationRow[];
        judges?: SetupJudgeRow[];
        assignments?: SetupAssignmentRow[];
        station_orders?: SetupStationOrderRow[];
      };

      const events = Array.isArray(payload.events) ? payload.events : [];
      const stations = Array.isArray(payload.stations) ? payload.stations : [];
      const judges = Array.isArray(payload.judges) ? payload.judges : [];
      const assignments = Array.isArray(payload.assignments) ? payload.assignments : [];
      const stationOrders = Array.isArray(payload.station_orders) ? payload.station_orders : [];
      const currentEventId = normalizeText(payload.current_event_id) || eventId;

      const orderByEvent: Record<string, SetupStationOrderPayload> = {};
      stationOrders.forEach((row) => {
        const targetEventId = normalizeText(row.event_id);
        if (!targetEventId) {
          return;
        }
        const normalized = normalizeSetupStationOrder({
          category_orders: row.category_orders ?? {},
          separator_before_by_category: row.separator_before_by_category ?? {},
        });
        if (normalized) {
          orderByEvent[targetEventId] = normalized;
        }
      });

      setSetupEvents(events);
      setSetupStations(stations);
      setSetupJudges(judges);
      setSetupAssignments(assignments);
      setSetupOrders(orderByEvent);
      setSelectedSetupEventId((prev) => {
        if (prev && events.some((eventRow) => eventRow.id === prev)) {
          return prev;
        }
        if (events.some((eventRow) => eventRow.id === currentEventId)) {
          return currentEventId;
        }
        return events[0]?.id ?? currentEventId;
      });
    } catch (error) {
      console.error('Failed to load event setup data', error);
      setSetupError(
        error instanceof Error && error.message
          ? error.message
          : 'Nepodařilo se načíst nastavení ročníků.',
      );
    } finally {
      setSetupLoading(false);
    }
  }, [accessToken, eventId]);

  const selectedSetupStations = useMemo(
    () =>
      setupStations
        .filter((station) => station.event_id === selectedSetupEventId)
        .map((station) => ({
          id: station.id,
          code: normalizeText(station.code).toUpperCase(),
          name: normalizeText(station.name),
          isClosed: station.is_closed === true,
          isSplit: station.is_split === true,
          splitCategories: normalizeStationSplitCategories(station.split_categories),
        }))
        .filter((station) => station.code),
    [selectedSetupEventId, setupStations],
  );

  const selectedSetupEvent = useMemo(
    () => setupEvents.find((row) => row.id === selectedSetupEventId) ?? null,
    [selectedSetupEventId, setupEvents],
  );
  const activeSetupEvent = useMemo(
    () => setupEvents.find((row) => row.id === activeEventId) ?? null,
    [activeEventId, setupEvents],
  );
  const activeEventName = activeSetupEvent?.name || eventState.name;
  const stationBaseCategoriesByCode = useMemo(() => {
    const result = new Map<string, CategoryKey[]>();
    selectedSetupStations.forEach((station) => {
      const code = normalizeText(station.code).toUpperCase();
      if (!code) {
        return;
      }
      result.set(
        code,
        getConfiguredStationBaseCategories({
          stationCode: code,
          isSplit: station.isSplit,
          splitCategories: station.splitCategories,
        }),
      );
    });
    return result;
  }, [selectedSetupStations]);

  const setupTroopOptions = useMemo(() => {
    const merged = normalizeTroopList([
      ...DEFAULT_SETUP_TROOP_OPTIONS,
      ...setupEventScoringConfig.participatingTroops,
    ]);
    return merged;
  }, [setupEventScoringConfig.participatingTroops]);

  useEffect(() => {
    const currentEventSettings =
      setupEvents.find((row) => row.id === selectedSetupEventId) ??
      setupEvents.find((row) => row.id === eventId);
    if (!currentEventSettings) {
      return;
    }
    setAnswersTargetOptionCount((prev) =>
      toTargetAnswerOptionCount(currentEventSettings.target_answer_option_count, prev),
    );
  }, [eventId, selectedSetupEventId, setupEvents]);

  const selectedSetupAssignments = useMemo<SelectedSetupAssignmentSummary[]>(() => {
    const judgeById = new Map(setupJudges.map((judge) => [judge.id, judge]));
    const stationById = new Map(
      setupStations
        .filter((station) => station.event_id === selectedSetupEventId)
        .map((station) => [station.id, station]),
    );
    return setupAssignments
      .filter((assignment) => assignment.event_id === selectedSetupEventId)
      .map((assignment) => {
        const judge = judgeById.get(assignment.judge_id);
        const station = stationById.get(assignment.station_id);
        return {
          id: assignment.id,
          email: normalizeText(judge?.email),
          displayName:
            normalizeText(assignment.judge_display_name) ||
            normalizeText(judge?.display_name) ||
            normalizeText(judge?.email),
          stationCode: normalizeText(station?.code).toUpperCase(),
          stationName: normalizeText(station?.name),
          categories: Array.isArray(assignment.allowed_categories)
            ? assignment.allowed_categories.filter((value) => typeof value === 'string')
            : [],
          createdAt: normalizeText(assignment.created_at),
        };
      })
      .sort((a, b) => a.stationCode.localeCompare(b.stationCode, 'cs') || a.displayName.localeCompare(b.displayName, 'cs'));
  }, [selectedSetupEventId, setupAssignments, setupJudges, setupStations]);

  const stationHealthCards = useMemo<AdminStationHealthCard[]>(() => {
    const assignmentCountByStationCode = new Map<string, number>();
    selectedSetupAssignments.forEach((assignment) => {
      const key = normalizeText(assignment.stationCode).toUpperCase();
      if (!key) {
        return;
      }
      assignmentCountByStationCode.set(key, (assignmentCountByStationCode.get(key) ?? 0) + 1);
    });

    const rowByStationCode = new Map(
      stationRows.map((row) => [normalizeText(row.stationCode).toUpperCase(), row] as const),
    );

    const baseStations = selectedSetupStations.length > 0
      ? selectedSetupStations
      : stationRows.map((row) => ({
          id: row.stationId,
          code: row.stationCode,
          name: row.stationName,
          isClosed: false,
        }));

    return baseStations.map((station) => {
      const stationCode = normalizeText(station.code).toUpperCase();
      const row = rowByStationCode.get(stationCode) ?? null;
      const isClosed = station.isClosed === true;
      const judgeCount = assignmentCountByStationCode.get(stationCode) ?? 0;
      const passed = row?.totalPassed ?? 0;
      const expected = row?.totalExpected ?? 0;
      const missing = row?.totalMissing.length ?? 0;
      const hasCourseData = raceDashboardSummary.patrolsSeenOnCourse > 0;

      let status: AdminStationHealthCard['status'] = 'unknown';
      let statusLabel = 'Bez dat';
      if (isClosed) {
        status = 'warning';
        statusLabel = 'Uzavřeno';
      } else if (row) {
        if (expected > 0 && passed === 0 && hasCourseData) {
          status = 'offline';
          statusLabel = 'Podezření offline';
        } else if (missing > 0) {
          status = 'warning';
          statusLabel = 'Vyžaduje kontrolu';
        } else if (passed > 0 || expected === 0) {
          status = 'online';
          statusLabel = 'Aktivní';
        } else {
          status = 'unknown';
          statusLabel = 'Bez průchodů';
        }
      }

      return {
        stationId: station.id,
        stationCode,
        stationName: normalizeText(station.name),
        isClosed,
        status,
        statusLabel,
        judgeCount,
        queueLabel: (() => {
          const queue = stationQueues.get(station.id);
          if (!queue || (queue.waiting === 0 && queue.serving === 0)) {
            return 'Prázdná';
          }
          return `${queue.waiting} čeká, ${queue.serving} obsluha`;
        })(),
        lastPassageAt: row?.lastPassageAt ?? null,
        passed,
        expected,
        missing,
      };
    });
  }, [raceDashboardSummary.patrolsSeenOnCourse, selectedSetupAssignments, selectedSetupStations, stationQueues, stationRows]);

  useEffect(() => {
    setSetupEventScoringConfig(normalizeSetupEventScoringConfig(selectedSetupEvent));
    setSetupTroopDraft('');
  }, [selectedSetupEvent]);

  useEffect(() => {
    const order = setupOrders[selectedSetupEventId];
    const defaults = createDefaultOrderTextState();
    const nextOrderInputs = { ...defaults };
    STATION_PASSAGE_CATEGORIES.forEach((category) => {
      const list = order?.category_orders?.[category];
      if (Array.isArray(list) && list.length > 0) {
        nextOrderInputs[category] = list.join(', ');
      }
    });
    setOrderInputs(nextOrderInputs);

    const nextSeparators = createDefaultSeparatorState();
    STATION_PASSAGE_CATEGORIES.forEach((category) => {
      const separator = order?.separator_before_by_category?.[category];
      if (separator) {
        nextSeparators[category] = separator;
      }
    });
    setSeparatorInputs(nextSeparators);
  }, [selectedSetupEventId, setupOrders]);

  useEffect(() => {
    if (!selectedSetupStations.length) {
      setJudgeStationCodeInput('');
      return;
    }
    const currentCode = judgeStationCodeInput.trim().toUpperCase();
    if (currentCode && selectedSetupStations.some((station) => station.code === currentCode)) {
      return;
    }
    setJudgeStationCodeInput(selectedSetupStations[0].code);
  }, [judgeStationCodeInput, selectedSetupStations]);

  const navigateAdminPage = useCallback(
    (page: AdminPageKey, options?: { replace?: boolean }) => {
      setActiveAdminPage(page);
      if (typeof window === 'undefined') {
        return;
      }

      const nextPrefix = detectAdminRoutePrefix(window.location.pathname);
      setAdminRoutePrefix(nextPrefix);
      const targetPath = buildAdminRoutePath({
        prefix: nextPrefix || adminRoutePrefix,
        eventId,
        page,
      });
      const currentPath = window.location.pathname.replace(/\/$/, '') || '/';

      if (currentPath !== targetPath) {
        const method = options?.replace ? 'replaceState' : 'pushState';
        window.history[method](window.history.state, '', targetPath);
      }

      setPageTransitioning(true);
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'auto' });
        setPageTransitioning(false);
      });
    },
    [adminRoutePrefix, eventId],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handlePopState = () => {
      const parsed = parseAdminRoute(window.location.pathname);
      setAdminRoutePrefix(parsed.prefix);
      setActiveAdminPage(parsed.page);
      setPageTransitioning(false);
      window.scrollTo({ top: 0, behavior: 'auto' });
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    if (!isCalcStation || typeof window === 'undefined') {
      return;
    }

    const parsed = parseAdminRoute(window.location.pathname);
    const prefix = parsed.prefix || adminRoutePrefix;
    const expectedPath = buildAdminRoutePath({
      prefix,
      eventId,
      page: activeAdminPage,
    });
    const currentPath = window.location.pathname.replace(/\/$/, '') || '/';

    if (currentPath !== expectedPath) {
      window.history.replaceState(window.history.state, '', expectedPath);
    }
    if (parsed.page !== activeAdminPage) {
      setActiveAdminPage(parsed.page);
    }
    if (prefix !== adminRoutePrefix) {
      setAdminRoutePrefix(prefix);
    }
  }, [activeAdminPage, adminRoutePrefix, eventId, isCalcStation]);

  const handleLookupPatrol = useCallback(async () => {
    setDisqualifyError(null);
    setDisqualifySuccess(null);

    const variants = buildPatrolCodeVariants(disqualifyCode);
    if (!variants.length) {
      setDisqualifyTarget(null);
      setDisqualifyError('Zadej kód hlídky.');
      return;
    }

    setDisqualifyLoading(true);
    try {
      const { data, error } = await supabase
        .from('patrols')
        .select('id, patrol_code, team_name, category, sex, disqualified')
        .eq('event_id', activeEventId)
        .in('patrol_code', variants)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        setDisqualifyTarget(null);
        setDisqualifyError('Hlídka nebyla nalezena.');
        return;
      }

      setDisqualifyTarget({
        id: data.id,
        code: normalizeText(data.patrol_code).toUpperCase(),
        teamName: normalizeText(data.team_name),
        category: normalizeText(data.category).toUpperCase(),
        sex: normalizeText(data.sex).toUpperCase(),
        disqualified: !!data.disqualified,
      });
    } catch (error) {
      console.error('Failed to load patrol', error);
      setDisqualifyError('Nepodařilo se načíst hlídku.');
      setDisqualifyTarget(null);
    } finally {
      setDisqualifyLoading(false);
    }
  }, [activeEventId, disqualifyCode]);

  const handleDisqualifyPatrol = useCallback(async () => {
    setDisqualifyError(null);
    setDisqualifySuccess(null);

    if (activeEventId !== eventId) {
      setDisqualifyError(
        `Diskvalifikace je dostupná jen pro aktuální ročník "${eventState.name}".`,
      );
      return;
    }
    if (!disqualifyTarget) {
      setDisqualifyError('Nejprve načti hlídku.');
      return;
    }
    if (disqualifyTarget.disqualified) {
      setDisqualifySuccess('Hlídka je už diskvalifikovaná.');
      return;
    }
    if (!API_BASE_URL) {
      setDisqualifyError('Chybí konfigurace API (VITE_AUTH_API_URL).');
      return;
    }
    if (!accessToken) {
      setDisqualifyError('Chybí přístupový token.');
      return;
    }

    const confirmed = window.confirm(`Opravdu diskvalifikovat hlídku ${disqualifyTarget.code}?`);
    if (!confirmed) {
      return;
    }

    setDisqualifySaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/patrol-disqualify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ patrol_code: disqualifyTarget.code, disqualified: true }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body?.error || 'Diskvalifikace se nepodařila.';
        throw new Error(message);
      }

      setDisqualifyTarget((prev) => (prev ? { ...prev, disqualified: true } : prev));
      setDisqualifySuccess(`Hlídka ${disqualifyTarget.code} byla diskvalifikována.`);
    } catch (error) {
      console.error('Failed to disqualify patrol', error);
      setDisqualifyError(
        error instanceof Error && error.message ? error.message : 'Diskvalifikace se nepodařila.',
      );
    } finally {
      setDisqualifySaving(false);
    }
  }, [accessToken, activeEventId, disqualifyTarget, eventId, eventState.name]);

  useEffect(() => {
    if (!isCalcStation) {
      return;
    }
    loadStationStats();
    loadEventState();
    loadSetupData();
  }, [isCalcStation, loadStationStats, loadEventState, loadSetupData]);

  useEffect(() => {
    if (!isCalcStation) {
      return;
    }
    loadAnswers();
  }, [isCalcStation, loadAnswers]);

  const handleSaveAnswers = useCallback(async () => {
    setAnswersError(null);
    setAnswersSuccess(null);

    const answers = Object.fromEntries(ANSWER_CATEGORIES.map((category) => [category, normalizeAnswersInput(answersForm[category])]));
    const pattern = answersTargetOptionCount === 3 ? /^[A-C]{12}$/ : /^[A-D]{12}$/;
    for (const category of ANSWER_CATEGORIES) {
      if (answers[category] && !pattern.test(answers[category])) {
        setAnswersError(`Kategorie ${category} musí mít 12 odpovědí ${answersTargetOptionCount === 3 ? 'A–C' : 'A–D'}.`);
        return;
      }
    }

    setAnswersSaving(true);

    try {
      await postSetupAction('save_target_answers', {
        event_id: activeEventId,
        target_answer_option_count: answersTargetOptionCount,
        answers,
      });

      const loaded = await loadAnswers();
      await loadSetupData();
      if (!loaded) return;
      setAnswersSuccess('Správné odpovědi a počet možností byly uloženy do databáze.');
    } catch (error) {
      console.error('Failed to save category answers', error);
      setAnswersError(error instanceof Error ? error.message : 'Uložení správných odpovědí selhalo.');
    } finally {
      setAnswersSaving(false);
    }
  }, [activeEventId, answersForm, answersTargetOptionCount, loadAnswers, loadSetupData, postSetupAction]);

  const handleToggleLock = useCallback(
    async (locked: boolean) => {
      if (!API_BASE_URL) {
        setLockMessage('Chybí konfigurace API (VITE_AUTH_API_URL).');
        return;
      }
      if (!accessToken) {
        setLockMessage('Chybí přístupový token.');
        return;
      }

      setLockUpdating(true);
      setLockMessage(null);

      try {
        const response = await fetch(`${API_BASE_URL}/admin/event-state`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ locked }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const message = body?.error || 'Nepodařilo se aktualizovat stav závodu.';
          throw new Error(message);
        }

        setEventState((prev) => ({ ...prev, scoringLocked: locked }));
        setLockMessage(locked ? 'Závod byl ukončen.' : 'Zapisování bodů bylo znovu povoleno.');
        await refreshManifest();
      } catch (error) {
        console.error('Failed to update scoring lock', error);
        setLockMessage(
          error instanceof Error && error.message
            ? error.message
            : 'Nepodařilo se aktualizovat stav závodu.',
        );
      } finally {
        setLockUpdating(false);
      }
    },
    [accessToken, refreshManifest],
  );

  const handleConfirmResults = useCallback(async () => {
    if (!API_BASE_URL || !accessToken) {
      setResultsConfirmationMessage('Chybí konfigurace API nebo přístupový token.');
      return;
    }
    if (!window.confirm('Potvrdit výsledky jako finální? Tato akce se zapíše k účtu hlavního rozhodčího.')) return;

    setConfirmingResults(true);
    setResultsConfirmationMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/results-confirmation`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'Výsledky se nepodařilo potvrdit.');
      setEventState((previous) => ({ ...previous, resultsConfirmedAt: body.resultsConfirmedAt ?? new Date().toISOString() }));
      setResultsConfirmationMessage('Výsledky byly potvrzeny hlavním rozhodčím.');
    } catch (error) {
      setResultsConfirmationMessage(error instanceof Error ? error.message : 'Výsledky se nepodařilo potvrdit.');
    } finally {
      setConfirmingResults(false);
    }
  }, [accessToken]);

  const handleRefreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadAnswers(),
      loadStationStats(),
      loadEventState(),
      loadSetupData(),
      refreshManifest(),
    ]).catch((error) => {
      console.error('Admin refresh failed', error);
    });
    setRefreshing(false);
  }, [loadAnswers, loadStationStats, loadEventState, loadSetupData, refreshManifest]);

  const handleCreateEvent = useCallback(async () => {
    setSetupError(null);
    setSetupSuccess(null);


    if (!createEventName.trim()) {
      setSetupError('Název ročníku je povinný.');
      return;
    }

    setSetupSaving(true);
    try {
      const payload = await postSetupAction('create_event', {
        name: createEventName.trim(),
        starts_at: createEventStartsAt || null,
        ends_at: createEventEndsAt || null,
        copy_stations_from_event_id: copyStationsFromCurrentEvent ? eventId : null,
      });
      setSetupSuccess(`Ročník ${payload?.event?.name ?? createEventName.trim()} byl vytvořen.`);
      setCreateEventName('');
      setCreateEventStartsAt('');
      setCreateEventEndsAt('');
      await loadSetupData();
      const nextEventId = normalizeText(payload?.event?.id);
      if (nextEventId) {
        setSelectedSetupEventId(nextEventId);
      }
    } catch (error) {
      console.error('Failed to create event', error);
      setSetupError(error instanceof Error ? error.message : 'Vytvoření ročníku selhalo.');
    } finally {
      setSetupSaving(false);
    }
  }, [
    copyStationsFromCurrentEvent,
    createEventEndsAt,
    createEventName,
    createEventStartsAt,
    eventId,
    loadSetupData,
    postSetupAction,
  ]);

  const handleSaveStationOrder = useCallback(async () => {
    setSetupError(null);
    setSetupSuccess(null);


    if (!selectedSetupEventId) {
      setSetupError('Vyber ročník, pro který se má pořadí uložit.');
      return;
    }

    const categoryOrders: Record<StationCategoryKey, string[]> = {
      NH: [],
      ND: [],
      MH: [],
      MD: [],
      SH: [],
      SD: [],
      RH: [],
      RD: [],
    };
    const separatorBeforeByCategory: Partial<Record<StationCategoryKey, string>> = {};

    STATION_PASSAGE_CATEGORIES.forEach((category) => {
      const values = orderInputs[category]
        .split(/[^A-Za-z0-9]+/)
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean);
      const dedup = Array.from(new Set(values));
      categoryOrders[category] = dedup;

      const separator = normalizeText(separatorInputs[category]).toUpperCase();
      if (separator) {
        separatorBeforeByCategory[category] = separator;
      }
    });

    setSetupSaving(true);
    try {
      await postSetupAction('save_station_order', {
        event_id: selectedSetupEventId,
        category_orders: categoryOrders,
        separator_before_by_category: separatorBeforeByCategory,
      });
      setSetupSuccess('Pořadí stanovišť bylo uloženo.');
      await loadSetupData();
    } catch (error) {
      console.error('Failed to save station order', error);
      setSetupError(error instanceof Error ? error.message : 'Uložení pořadí selhalo.');
    } finally {
      setSetupSaving(false);
    }
  }, [loadSetupData, orderInputs, postSetupAction, selectedSetupEventId, separatorInputs]);

  const handleSaveEventScoringConfig = useCallback(async () => {
    setSetupError(null);
    setSetupSuccess(null);


    if (!selectedSetupEventId) {
      setSetupError('Vyber ročník.');
      return;
    }

    setSetupSaving(true);
    try {
      await postSetupAction('save_event_scoring_config', {
        event_id: selectedSetupEventId,
        announced_places_nh: setupEventScoringConfig.announcedPlaces.NH,
        announced_places_nd: setupEventScoringConfig.announcedPlaces.ND,
        announced_places_mh: setupEventScoringConfig.announcedPlaces.MH,
        announced_places_md: setupEventScoringConfig.announcedPlaces.MD,
        announced_places_sh: setupEventScoringConfig.announcedPlaces.SH,
        announced_places_sd: setupEventScoringConfig.announcedPlaces.SD,
        announced_places_rh: setupEventScoringConfig.announcedPlaces.RH,
        announced_places_rd: setupEventScoringConfig.announcedPlaces.RD,
        time_limit_n_minutes: setupEventScoringConfig.timeLimitMinutes.N,
        time_limit_m_minutes: setupEventScoringConfig.timeLimitMinutes.M,
        time_limit_s_minutes: setupEventScoringConfig.timeLimitMinutes.S,
        time_limit_r_minutes: setupEventScoringConfig.timeLimitMinutes.R,
        time_penalty_step_minutes: setupEventScoringConfig.timePenaltyStepMinutes,
        target_answer_option_count: setupEventScoringConfig.targetAnswerOptionCount,
        participating_troops: setupEventScoringConfig.participatingTroops,
      });
      setSetupSuccess('Nastavení vyhlašovaných míst a času bylo uloženo.');
      await loadSetupData();
    } catch (error) {
      console.error('Failed to save event scoring config', error);
      setSetupError(error instanceof Error ? error.message : 'Uložení nastavení selhalo.');
    } finally {
      setSetupSaving(false);
    }
  }, [loadSetupData, postSetupAction, selectedSetupEventId, setupEventScoringConfig]);

  const handleToggleStationClosed = useCallback(async (stationId: string, nextClosed: boolean) => {
    setSetupError(null);
    setSetupSuccess(null);


    if (!selectedSetupEventId) {
      setSetupError('Vyber ročník.');
      return;
    }

    const station = selectedSetupStations.find((item) => item.id === stationId);
    if (!station) {
      setSetupError('Stanoviště nebylo nalezeno.');
      return;
    }

    setStationClosingId(stationId);
    try {
      await postSetupAction('set_station_closed', {
        event_id: selectedSetupEventId,
        station_id: stationId,
        closed: nextClosed,
      });
      setSetupSuccess(
        nextClosed
          ? `Stanoviště ${station.code} bylo uzavřeno.`
          : `Stanoviště ${station.code} bylo znovu otevřeno.`,
      );
      await loadSetupData();
      if (selectedSetupEventId === activeEventId) {
        await loadStationStats();
      }
    } catch (error) {
      console.error('Failed to toggle station closed state', error);
      setSetupError(error instanceof Error ? error.message : 'Nepodařilo se změnit stav stanoviště.');
    } finally {
      setStationClosingId(null);
    }
  }, [activeEventId, loadSetupData, loadStationStats, postSetupAction, selectedSetupEventId, selectedSetupStations]);

  const handleToggleSetupTroop = useCallback((troopName: string) => {
    const normalized = normalizeTroopName(troopName);
    if (!normalized) {
      return;
    }
    setSetupEventScoringConfig((prev) => {
      const hasTroop = prev.participatingTroops.some(
        (item) => item.toLocaleLowerCase('cs') === normalized.toLocaleLowerCase('cs'),
      );
      const nextTroops = hasTroop
        ? prev.participatingTroops.filter(
            (item) => item.toLocaleLowerCase('cs') !== normalized.toLocaleLowerCase('cs'),
          )
        : [...prev.participatingTroops, normalized];
      return {
        ...prev,
        participatingTroops: normalizeTroopList(nextTroops),
      };
    });
  }, []);

  const handleAddSetupTroop = useCallback(() => {
    const normalized = normalizeTroopName(setupTroopDraft);
    if (!normalized) {
      return;
    }
    setSetupEventScoringConfig((prev) => ({
      ...prev,
      participatingTroops: normalizeTroopList([...prev.participatingTroops, normalized]),
    }));
    setSetupTroopDraft('');
  }, [setupTroopDraft]);

  const handleAssignJudgeToEvent = useCallback(async () => {
    setSetupError(null);
    setSetupSuccess(null);


    if (!selectedSetupEventId) {
      setSetupError('Vyber ročník.');
      return;
    }
    if (!judgeEmailInput.trim()) {
      setSetupError('E-mail rozhodčího je povinný.');
      return;
    }
    if (!judgeStationCodeInput.trim()) {
      setSetupError('Vyber stanoviště.');
      return;
    }

    const allowedCategories = (Object.entries(judgeCategoryToggle) as Array<[CategoryKey, boolean]>)
      .filter(([, enabled]) => enabled)
      .map(([category]) => category);
    if (allowedCategories.length === 0) {
      setSetupError('Vyber alespoň jednu kategorii.');
      return;
    }

    const allowedTasks = getJudgeTasksForPreset(judgeTaskPreset);

    setSetupSaving(true);
    try {
      const result = await postSetupAction('assign_judge', {
        event_id: selectedSetupEventId,
        email: judgeEmailInput.trim(),
        display_name: judgeDisplayNameInput.trim(),
        station_code: judgeStationCodeInput.trim().toUpperCase(),
        allowed_categories: allowedCategories,
        allowed_tasks: allowedTasks,
      });
      setSetupSuccess(
        result?.created_judge
          ? `Rozhodčí byl vytvořen a přiřazen. Přihlašovací údaje byly zařazeny k odeslání na jeho e-mail.`
          : `Rozhodčí byl přiřazen k vybranému ročníku.`,
      );
      await loadSetupData();
    } catch (error) {
      console.error('Failed to assign judge', error);
      setSetupError(error instanceof Error ? error.message : 'Přiřazení rozhodčího selhalo.');
    } finally {
      setSetupSaving(false);
    }
  }, [
    judgeCategoryToggle,
    judgeDisplayNameInput,
    judgeEmailInput,
    judgeStationCodeInput,
    judgeTaskPreset,
    loadSetupData,
    postSetupAction,
    selectedSetupEventId,
  ]);

  const handleCreatePatrols = useCallback(async () => {
    setSetupError(null);
    setSetupSuccess(null);


    if (!selectedSetupEventId) {
      setSetupError('Vyber ročník.');
      return;
    }

    const total = STATION_PASSAGE_CATEGORIES.reduce((sum, category) => sum + Math.max(0, patrolCounts[category] ?? 0), 0);
    if (total <= 0) {
      setSetupError('Zadej počty hlídek alespoň pro jednu kategorii.');
      return;
    }

    setSetupSaving(true);
    try {
      const result = await postSetupAction('create_patrols', {
        event_id: selectedSetupEventId,
        counts: patrolCounts,
        start_numbers: patrolStarts,
      });
      setSetupSuccess(`Vytvořeno hlídek: ${Number(result?.created ?? 0)}.`);
      await loadSetupData();
    } catch (error) {
      console.error('Failed to create patrols', error);
      setSetupError(error instanceof Error ? error.message : 'Vytvoření hlídek selhalo.');
    } finally {
      setSetupSaving(false);
    }
  }, [loadSetupData, patrolCounts, patrolStarts, postSetupAction, selectedSetupEventId]);

  const handleClearEventPoints = useCallback(async () => {
    setSetupError(null);
    setSetupSuccess(null);


    if (!selectedSetupEventId) {
      setSetupError('Vyber ročník.');
      return;
    }

    const confirmed = window.confirm(
      `Opravdu smazat všechny body a průchody pro ročník "${selectedSetupEvent?.name ?? selectedSetupEventId}"?`,
    );
    if (!confirmed) {
      return;
    }

    setSetupSaving(true);
    try {
      await postSetupAction('clear_event_points', { event_id: selectedSetupEventId });
      setSetupSuccess('Body, průchody, čekání a terčové odpovědi byly smazány.');
    } catch (error) {
      console.error('Failed to clear event points', error);
      setSetupError(error instanceof Error ? error.message : 'Smazání bodů selhalo.');
    } finally {
      setSetupSaving(false);
    }
  }, [postSetupAction, selectedSetupEvent, selectedSetupEventId]);

  const handleCleanupIncompletePatrols = useCallback(async () => {
    setSetupError(null);
    setSetupSuccess(null);


    if (!selectedSetupEventId) {
      setSetupError('Vyber ročník.');
      return;
    }

    const confirmed = window.confirm(
      `Opravdu smazat hlídky bez vyplněného jména a příjmení člena v ročníku "${selectedSetupEvent?.name ?? selectedSetupEventId}"?`,
    );
    if (!confirmed) {
      return;
    }

    setSetupSaving(true);
    try {
      const result = await postSetupAction('cleanup_incomplete_patrols', { event_id: selectedSetupEventId });
      const deleted = Number(result?.deleted ?? 0);
      const skipped = Number(result?.skipped ?? 0);
      setSetupSuccess(`Smazáno hlídek: ${deleted}. Přeskočeno (už s body/průchody): ${skipped}.`);
      await loadSetupData();
    } catch (error) {
      console.error('Failed to cleanup incomplete patrols', error);
      setSetupError(error instanceof Error ? error.message : 'Mazání nevyplněných hlídek selhalo.');
    } finally {
      setSetupSaving(false);
    }
  }, [loadSetupData, postSetupAction, selectedSetupEvent, selectedSetupEventId]);

  const handleExportNameCheck = useCallback(async () => {
    if (exportingNames) {
      return;
    }

    setExportingNames(true);
    try {
      type PatrolNameCheckRow = {
        patrol_code: string | null;
        team_name: string | null;
        category: string | null;
        sex: string | null;
        patrol_members: string | null;
        note: string | null;
        active: boolean | null;
      };

      const { data, error } = await supabase
        .from('patrols')
        .select('patrol_code, team_name, category, sex, patrol_members, note, active')
        .eq('event_id', activeEventId)
        .eq('active', true);

      if (error) {
        throw error;
      }

      const rows = ((data ?? []) as PatrolNameCheckRow[]).filter((row) => row.active !== false);
      rows.sort(comparePatrolOrder);

      const troopNamesByNumber = new Map<number, Set<string>>();
      rows.forEach((row) => {
        splitMixedTroopNames(row.team_name).forEach((troopName) => {
          const troopNumber = parseTroopNumber(troopName);
          if (troopNumber === null) {
            return;
          }
          if (!troopNamesByNumber.has(troopNumber)) {
            troopNamesByNumber.set(troopNumber, new Set<string>());
          }
          troopNamesByNumber.get(troopNumber)!.add(troopName);
        });
      });

      const canonicalTroopNameByNumber = new Map<number, string>();
      troopNamesByNumber.forEach((nameSet, troopNumber) => {
        canonicalTroopNameByNumber.set(troopNumber, pickCanonicalTroopName(troopNumber, Array.from(nameSet)));
      });

      const byTroop = new Map<string, PatrolNameCheckRow[]>();
      rows.forEach((row) => {
        const canonicalTroops = splitMixedTroopNames(row.team_name).map((troopName) => {
          const troopNumber = parseTroopNumber(troopName);
          if (troopNumber === null) {
            return troopName;
          }
          return canonicalTroopNameByNumber.get(troopNumber) ?? `${troopNumber}. PTO`;
        });
        const seenTroops = new Set<string>();
        canonicalTroops.forEach((troopName) => {
          const key = troopName.toLocaleLowerCase('cs');
          if (seenTroops.has(key)) {
            return;
          }
          seenTroops.add(key);
          if (!byTroop.has(troopName)) {
            byTroop.set(troopName, []);
          }
          byTroop.get(troopName)!.push(row);
        });
      });

      const workbook = new ExcelJS.Workbook();
      const usedSheetNames = new Set<string>();
      const sortedTroops = Array.from(byTroop.entries()).sort((a, b) => compareTroopSheetOrder(a[0], b[0]));

      if (sortedTroops.length === 0) {
        const worksheet = workbook.addWorksheet('Kontrola jmen');
        worksheet.addRow(['Žádná hlídka pro export']);
      }

      sortedTroops.forEach(([troopName, patrols]) => {
        const baseSheetName = toWorksheetBaseName(troopName, 'Bez oddílu');
        const sheetName = toUniqueWorksheetName(baseSheetName, usedSheetNames);
        const worksheet = workbook.addWorksheet(sheetName);
        patrols.sort(comparePatrolOrder);
        const memberLists = patrols.map((patrol) => extractPatrolMembers(patrol.patrol_members ?? patrol.note));
        const memberColumnCount = Math.max(
          1,
          memberLists.reduce((max, members) => Math.max(max, members.length), 0),
        );
        const memberHeaders = Array.from({ length: memberColumnCount }, (_, index) => `Člen ${index + 1}`);
        worksheet.addRow(['Číslo hlídky', ...memberHeaders]);
        patrols.forEach((patrol, index) => {
          const code = parsePatrolCodeParts(patrol.patrol_code).normalizedCode || '—';
          const members = memberLists[index];
          const memberCells = Array.from({ length: memberColumnCount }, (_, memberIndex) => members[memberIndex] || '—');
          worksheet.addRow([code, ...memberCells]);
        });
        worksheet.columns = [{ width: 16 }, ...Array.from({ length: memberColumnCount }, () => ({ width: 28 }))];
      });

      await downloadWorkbook(workbook, toExportFileName(activeEventName, 'kontrola-jmen'));
    } catch (error) {
      console.error('Failed to export name check workbook', error);
      window.alert('Export kontroly jmen selhal.');
    } finally {
      setExportingNames(false);
    }
  }, [activeEventId, activeEventName, exportingNames]);

  const totalMissingAcrossStations = useMemo(
    () => stationRows.reduce((sum, row) => sum + row.totalMissing.length, 0),
    [stationRows],
  );

  const isLivePage = activeAdminPage === 'live';
  const isPatrolsPage = activeAdminPage === 'patrols';
  const isStationsPage = activeAdminPage === 'stations';
  const isResultsPage = activeAdminPage === 'results';
  const isStatisticsPage = activeAdminPage === 'statistics';
  const isSettingsPage = activeAdminPage === 'settings';

  if (!isCalcStation) {
    return (
      <div className="admin-shell">
        <header className="admin-header">
          <div className="admin-header-inner">
            <div>
              <h1>Administrace závodu</h1>
              <p className="admin-subtitle">Tento účet nemá oprávnění pro kancelář závodu.</p>
            </div>
            <div className="admin-header-actions">
              <button
                type="button"
                className="admin-button admin-button--secondary admin-button--pill"
                onClick={() => logout()}
              >
                Odhlásit se
              </button>
            </div>
          </div>
        </header>
        <main className="admin-content">
          <section className="admin-card">
            <h2>Přístup zamítnut</h2>
            <p>Administrace je dostupná pouze stanovišti T (výpočetka).</p>
          </section>
        </main>
        <AppFooter variant="minimal" />
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header-inner">
          <div>
            <h1>Administrace závodu</h1>
            <p className="admin-subtitle">
              {activeEventName} · {ADMIN_PAGE_TITLE[activeAdminPage]}
              {activeEventId === eventId && eventState.scoringLocked ? ' · Závod ukončen' : ''}
            </p>
          </div>
          <div className="admin-header-actions admin-header-actions--centered-row">
            <a
              className="admin-button admin-button--secondary admin-button--pill"
              href="https://www.zelenaliga.cz/aplikace/setonuv-zavod/vysledky"
              target="_blank"
              rel="noreferrer"
            >
              Otevřít výsledky
            </a>
            <a
              className="admin-button admin-button--secondary admin-button--pill"
              href="https://www.zelenaliga.cz/aplikace/setonuv-zavod/vysledky?autoExport=1"
              target="_blank"
              rel="noreferrer"
            >
              Export výsledky
            </a>
            <button
              type="button"
              className="admin-button admin-button--secondary admin-button--pill"
              onClick={handleRefreshAll}
              disabled={refreshing}
            >
              {refreshing ? 'Obnovuji…' : 'Obnovit data'}
            </button>
            <button
              type="button"
              className="admin-button admin-button--secondary admin-button--pill"
              onClick={handleExportNameCheck}
              disabled={exportingNames}
            >
              {exportingNames ? 'Exportuji…' : 'Export kontrola jmen'}
            </button>
            <button
              type="button"
              className="admin-button admin-button--secondary admin-button--pill"
              onClick={() => logout()}
            >
              Odhlásit se
            </button>
          </div>
          <div className="admin-header-event-switch">
            <label className="admin-header-event-switch-label" htmlFor="admin-global-event-switch">
              Ročník
            </label>
            <select
              id="admin-global-event-switch"
              className="admin-header-event-switch-select"
              value={activeEventId}
              onChange={(event) => setSelectedSetupEventId(event.target.value)}
              disabled={setupLoading || setupSaving || setupEvents.length === 0}
            >
              {setupEvents.length === 0 ? (
                <option value={eventId}>{eventState.name}</option>
              ) : null}
              {setupEvents.map((setupEvent) => (
                <option key={setupEvent.id} value={setupEvent.id}>
                  {setupEvent.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>
      <main className="admin-content">
        <AdminSectionNav
          activePage={activeAdminPage}
          onNavigate={navigateAdminPage}
        />
        {pageTransitioning ? (
          <section className="admin-card admin-card--section admin-card--narrow admin-page-loading">
            <h2>Načítám stránku…</h2>
          </section>
        ) : null}

        {isLivePage ? (
          <AdminLiveOverviewSection
            stationLoading={stationLoading}
            onRefresh={() => {
              void loadStationStats();
            }}
            summary={raceDashboardSummary}
          />
        ) : null}

        {isPatrolsPage ? <AdminPatrolsOverviewSection eventId={activeEventId} /> : null}
        {isPatrolsPage ? <AdminStartsSection eventId={activeEventId} /> : null}

        {isStationsPage ? (
        <TargetAnswersSection
targetAnswerInputHint={targetAnswerInputHint}
loadAnswers={async () => { await loadAnswers(); }}
answersLoading={answersLoading}
answersError={answersError}
answersSuccess={answersSuccess}
activeEventName={activeEventName}
answersTargetOptionCount={answersTargetOptionCount}
setAnswersTargetOptionCount={setAnswersTargetOptionCount}
setupSaving={setupSaving}
setupLoading={setupLoading}
answersSummary={answersSummary}
answersForm={answersForm}
setAnswersForm={setAnswersForm}
targetAnswerInputPattern={targetAnswerInputPattern}
handleSaveAnswers={handleSaveAnswers}
answersSaving={answersSaving}
/>
        ) : null}

        {isStationsPage ? (
          <section
            id={toAdminSectionId('stations')}
            className="admin-card admin-card--with-divider admin-card--section admin-section-block admin-section-block--stations"
          >
            <header className="admin-card-header">
              <div>
                <h2>Stanoviště a rozhodčí</h2>
                <p className="admin-card-subtitle">
                  Live přehled stanovišť a aktuálně přiřazených rozhodčích.
                </p>
              </div>
              <div className="admin-card-actions">
                <button
                  type="button"
                  className="admin-button admin-button--secondary"
                  onClick={() => void loadSetupData()}
                  disabled={setupLoading || setupSaving}
                >
                  {setupLoading ? 'Načítám…' : 'Obnovit stanoviště'}
                </button>
                <button
                  type="button"
                  className="admin-button admin-button--secondary"
                  onClick={() => navigateAdminPage('settings')}
                >
                  Otevřít detailní nastavení
                </button>
              </div>
            </header>
            {setupError ? <p className="admin-error">{setupError}</p> : null}
            {setupSuccess ? <p className="admin-success">{setupSuccess}</p> : null}
            <div className="admin-setup-block">
              <h3>Rozhodčí a přiřazení</h3>
              <p className="admin-card-subtitle">
                Pokud už e-mail existuje, účet se jen přiřadí k vybranému ročníku a stanovišti.
              </p>
              <div className="admin-disqualify-form">
                <label className="admin-field" htmlFor="admin-judge-email">
                  <span>E-mail</span>
                  <input
                    id="admin-judge-email"
                    type="email"
                    value={judgeEmailInput}
                    onChange={(event) => setJudgeEmailInput(event.target.value)}
                    placeholder="rozhodci@example.com"
                    autoComplete="email"
                  />
                </label>
                <label className="admin-field" htmlFor="admin-judge-display-name">
                  <span>Jméno (volitelné)</span>
                  <input
                    id="admin-judge-display-name"
                    value={judgeDisplayNameInput}
                    onChange={(event) => setJudgeDisplayNameInput(event.target.value)}
                    placeholder="Jan Novák"
                    autoComplete="off"
                  />
                </label>
                <label className="admin-field" htmlFor="admin-judge-station">
                  <span>Stanoviště</span>
                  <select
                    id="admin-judge-station"
                    value={judgeStationCodeInput}
                    onChange={(event) => setJudgeStationCodeInput(event.target.value)}
                  >
                    {selectedSetupStations.map((station) => (
                      <option key={station.id} value={station.code}>
                        {station.code} – {station.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-field" htmlFor="admin-judge-tasks">
                  <span>Oprávnění (allowed tasks)</span>
                  <select
                    id="admin-judge-tasks"
                    value={judgeTaskPreset}
                    onChange={(event) => setJudgeTaskPreset(toJudgeTaskPresetKey(event.target.value))}
                  >
                    {JUDGE_TASK_PRESETS.map((preset) => (
                      <option key={preset.key} value={preset.key}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="admin-category-toggle-list">
                {(['N', 'M', 'S', 'R'] as const).map((category) => (
                  <label key={category} className="admin-check">
                    <input
                      type="checkbox"
                      checked={judgeCategoryToggle[category]}
                      onChange={(event) =>
                        setJudgeCategoryToggle((prev) => ({
                          ...prev,
                          [category]: event.target.checked,
                        }))
                      }
                    />
                    <span>{category}</span>
                  </label>
                ))}
              </div>
              <div className="admin-card-actions admin-card-actions--end">
                <button
                  type="button"
                  className="admin-button admin-button--secondary"
                  onClick={() => void handleAssignJudgeToEvent()}
                  disabled={setupSaving}
                >
                  {setupSaving ? 'Ukládám…' : 'Vytvořit/Přiřadit rozhodčího'}
                </button>
              </div>
            </div>
            <AdminStationHealthPanel
              stationCards={stationHealthCards}
              assignmentRows={selectedSetupAssignments}
              onToggleStationClosed={(stationId, nextClosed) => void handleToggleStationClosed(stationId, nextClosed)}
              stationClosingId={stationClosingId}
            />
          </section>
        ) : null}

        {isSettingsPage ? (
        <section
          className="admin-card admin-card--with-divider admin-card--section admin-section-block admin-section-block--stations"
        >
          <header className="admin-card-header">
            <div>
              <h2>Nastavení závodu</h2>
              <p className="admin-card-subtitle">
                Nastavení ročníků, výsledků, času a předzávodních kroků.
              </p>
            </div>
            <div className="admin-card-actions">
              <button
                type="button"
                className="admin-button admin-button--secondary"
                onClick={() => void loadSetupData()}
                disabled={setupLoading || setupSaving}
              >
                {setupLoading ? 'Načítám…' : 'Obnovit nastavení'}
              </button>
              <button
                type="button"
                className="admin-button admin-button--secondary"
                onClick={() => void handleToggleLock(!eventState.scoringLocked)}
                disabled={lockUpdating || eventLoading}
              >
                {lockUpdating
                  ? 'Aktualizuji…'
                  : eventState.scoringLocked
                  ? 'Znovu povolit zapisování'
                  : 'Ukončit závod'}
              </button>
            </div>
          </header>
          {eventError ? <p className="admin-error">{eventError}</p> : null}
          {lockMessage ? <p className="admin-notice">{lockMessage}</p> : null}
          {setupError ? <p className="admin-error">{setupError}</p> : null}
          {setupSuccess ? <p className="admin-success">{setupSuccess}</p> : null}

          <CollapsibleSetupSection title="Vytvořit nový ročník">
            <div className="admin-disqualify-form">
              <label className="admin-field" htmlFor="admin-create-event-name">
                <span>Název ročníku</span>
                <input
                  id="admin-create-event-name"
                  value={createEventName}
                  onChange={(event) => setCreateEventName(event.target.value)}
                  placeholder="např. Setonův závod 2027"
                  autoComplete="off"
                />
              </label>
              <label className="admin-field" htmlFor="admin-create-event-start">
                <span>Začátek (volitelné)</span>
                <input
                  id="admin-create-event-start"
                  type="datetime-local"
                  value={createEventStartsAt}
                  onChange={(event) => setCreateEventStartsAt(event.target.value)}
                />
              </label>
              <label className="admin-field" htmlFor="admin-create-event-end">
                <span>Konec (volitelné)</span>
                <input
                  id="admin-create-event-end"
                  type="datetime-local"
                  value={createEventEndsAt}
                  onChange={(event) => setCreateEventEndsAt(event.target.value)}
                />
              </label>
              <label className="admin-check" htmlFor="admin-copy-stations">
                <input
                  id="admin-copy-stations"
                  type="checkbox"
                  checked={copyStationsFromCurrentEvent}
                  onChange={(event) => setCopyStationsFromCurrentEvent(event.target.checked)}
                />
                <span>Kopírovat stanoviště z aktuálního ročníku</span>
              </label>
              <button
                type="button"
                className="admin-button admin-button--primary"
                onClick={() => void handleCreateEvent()}
                disabled={setupSaving}
              >
                {setupSaving ? 'Ukládám…' : 'Vytvořit ročník'}
              </button>
            </div>
          </CollapsibleSetupSection>

          <EventScoringSettings
setupEventScoringConfig={setupEventScoringConfig}
setSetupEventScoringConfig={setSetupEventScoringConfig}
setupTroopOptions={setupTroopOptions}
handleToggleSetupTroop={handleToggleSetupTroop}
setupTroopDraft={setupTroopDraft}
setSetupTroopDraft={setSetupTroopDraft}
handleAddSetupTroop={handleAddSetupTroop}
handleSaveEventScoringConfig={handleSaveEventScoringConfig}
setupSaving={setupSaving}
/>

          <CollapsibleSetupSection title="Pořadí stanovišť podle kategorie">
            <p className="admin-card-subtitle">
              Pro každou kategorii zadej pořadí kódů stanovišť oddělené čárkou (např. F, U, C…).
            </p>
            <div className="admin-setup-order-grid">
              {STATION_PASSAGE_CATEGORIES.map((category) => (
                <div key={category} className="admin-setup-order-row">
                  <label className="admin-field" htmlFor={`admin-order-${category}`}>
                    <span>{category} – pořadí stanovišť</span>
                    <textarea
                      id={`admin-order-${category}`}
                      value={orderInputs[category]}
                      onChange={(event) =>
                        setOrderInputs((prev) => ({
                          ...prev,
                          [category]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="admin-field" htmlFor={`admin-separator-${category}`}>
                    <span>{category} – oddělovač (volitelné)</span>
                    <input
                      id={`admin-separator-${category}`}
                      value={separatorInputs[category] ?? ''}
                      onChange={(event) =>
                        setSeparatorInputs((prev) => ({
                          ...prev,
                          [category]: event.target.value.trim().toUpperCase(),
                        }))
                      }
                      placeholder="např. R"
                      autoComplete="off"
                    />
                  </label>
                </div>
              ))}
            </div>
            <div className="admin-card-actions admin-card-actions--end">
              <button
                type="button"
                className="admin-button admin-button--secondary"
                onClick={() => void handleSaveStationOrder()}
                disabled={setupSaving}
              >
                {setupSaving ? 'Ukládám…' : 'Uložit pořadí stanovišť'}
              </button>
            </div>
          </CollapsibleSetupSection>

          <CollapsibleSetupSection title="Vytvoření hlídek">
            <p className="admin-card-subtitle">
              Zadej počty hlídek pro jednotlivé kategorie a počáteční čísla kódů.
            </p>
            <div className="admin-setup-patrol-grid">
              {STATION_PASSAGE_CATEGORIES.map((category) => (
                <div key={category} className="admin-setup-patrol-row">
                  <strong>{category}</strong>
                  <label className="admin-field" htmlFor={`admin-patrol-count-${category}`}>
                    <span>Počet</span>
                    <input
                      id={`admin-patrol-count-${category}`}
                      type="number"
                      min={0}
                      value={patrolCounts[category]}
                      onChange={(event) =>
                        setPatrolCounts((prev) => ({
                          ...prev,
                          [category]: Math.max(0, Number.parseInt(event.target.value || '0', 10) || 0),
                        }))
                      }
                    />
                  </label>
                  <label className="admin-field" htmlFor={`admin-patrol-start-${category}`}>
                    <span>Od čísla</span>
                    <input
                      id={`admin-patrol-start-${category}`}
                      type="number"
                      min={1}
                      value={patrolStarts[category]}
                      onChange={(event) =>
                        setPatrolStarts((prev) => ({
                          ...prev,
                          [category]: Math.max(1, Number.parseInt(event.target.value || '1', 10) || 1),
                        }))
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
            <div className="admin-card-actions admin-card-actions--end">
              <button
                type="button"
                className="admin-button admin-button--secondary"
                onClick={() => void handleCreatePatrols()}
                disabled={setupSaving}
              >
                {setupSaving ? 'Ukládám…' : 'Vytvořit hlídky'}
              </button>
            </div>
          </CollapsibleSetupSection>

          <CollapsibleSetupSection title="Smazat všechny body ročníku">
            <p className="admin-card-subtitle">
              Smaže bodování, průchody, čekání a odpovědi terčového úseku pro vybraný ročník.
            </p>
            <div className="admin-card-actions">
              <button
                type="button"
                className="admin-button admin-button--danger"
                onClick={() => void handleClearEventPoints()}
                disabled={setupSaving}
              >
                {setupSaving ? 'Zpracovávám…' : 'Smazat body ročníku'}
              </button>
              <button
                type="button"
                className="admin-button admin-button--secondary"
                onClick={() => void handleCleanupIncompletePatrols()}
                disabled={setupSaving}
              >
                {setupSaving ? 'Zpracovávám…' : 'Smazat nevyplněné hlídky'}
              </button>
            </div>
          </CollapsibleSetupSection>
        </section>
        ) : null}

        {isPatrolsPage ? (
        <section className="admin-card admin-card--with-divider admin-card--section admin-section-block admin-section-block--patrols">
          <header className="admin-card-header">
            <div>
              <h2>Diskvalifikace hlídky</h2>
              <p className="admin-card-subtitle">
                Zadej ručně kód hlídky, načti její detail a potvrď diskvalifikaci.
              </p>
            </div>
          </header>
          {activeEventId !== eventId ? (
            <p className="admin-notice">
              Pro vybraný ročník je diskvalifikace jen pro čtení. Upravovat lze pouze aktuální ročník účtu.
            </p>
          ) : null}
          <div className="admin-disqualify-form">
            <label className="admin-field" htmlFor="admin-disqualify-code">
              <span>Kód hlídky</span>
              <input
                id="admin-disqualify-code"
                value={disqualifyCode}
                onChange={(event) => {
                  setDisqualifyCode(event.target.value);
                  setDisqualifyTarget(null);
                  setDisqualifyError(null);
                  setDisqualifySuccess(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleLookupPatrol();
                  }
                }}
                placeholder="např. NH-12"
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              className="admin-button admin-button--secondary"
              onClick={handleLookupPatrol}
              disabled={disqualifyLoading}
            >
              {disqualifyLoading ? 'Načítám…' : 'Načíst hlídku'}
            </button>
          </div>
          {disqualifyError ? <p className="admin-error">{disqualifyError}</p> : null}
          {disqualifySuccess ? <p className="admin-success">{disqualifySuccess}</p> : null}
          {disqualifyTarget ? (
            <div className="admin-disqualify-summary">
              <div>
                <strong>{disqualifyTarget.code}</strong>
                <span className="admin-disqualify-team">
                  {disqualifyTarget.teamName || 'Bez názvu'}
                </span>
              </div>
              <div className="admin-disqualify-meta">
                <span>{`${disqualifyTarget.category}${disqualifyTarget.sex}`}</span>
                <span
                  className={
                    disqualifyTarget.disqualified
                      ? 'admin-disqualify-flag admin-disqualify-flag--danger'
                      : 'admin-disqualify-flag'
                  }
                >
                  {disqualifyTarget.disqualified ? 'Diskvalifikována' : 'Aktivní'}
                </span>
              </div>
              <div className="admin-card-actions">
                <button
                  type="button"
                  className="admin-button admin-button--danger"
                  onClick={handleDisqualifyPatrol}
                  disabled={disqualifySaving || disqualifyTarget.disqualified || activeEventId !== eventId}
                >
                  {disqualifySaving ? 'Ukládám…' : 'Diskvalifikovat hlídku'}
                </button>
              </div>
            </div>
          ) : null}
        </section>
        ) : null}

        {isLivePage ? (
          <AdminQueuesSection
            waiting={Array.from(stationQueues.values()).reduce((sum, queue) => sum + queue.waiting, 0)}
            serving={Array.from(stationQueues.values()).reduce((sum, queue) => sum + queue.serving, 0)}
            waitingSinceMs={waitingSinceMs}
          />
        ) : null}
        {isLivePage ? (
          <AdminLiveMapSection
            eventId={activeEventId}
            mapRoute={MAPA_PROCHODU_ROUTE}
          />
        ) : null}
        {isLivePage ? (
        <StationPassagesSection
loadStationStats={loadStationStats}
stationLoading={stationLoading}
stationError={stationError}
raceDashboardSummary={raceDashboardSummary}
stationRows={stationRows}
handleOpenStationMissing={handleOpenStationMissing}
/>
        ) : null}

        {isResultsPage ? (
        <AdminResultsSection
          eventId={activeEventId}
          totalMissingAcrossStations={totalMissingAcrossStations}
          summary={raceDashboardSummary}
          scoringLocked={activeEventId === eventId && eventState.scoringLocked}
          resultsConfirmedAt={activeEventId === eventId ? eventState.resultsConfirmedAt : null}
          confirmingResults={confirmingResults}
          canConfirmCurrentEvent={activeEventId === eventId}
          onConfirmResults={() => void handleConfirmResults()}
          confirmationMessage={resultsConfirmationMessage}
        />
        ) : null}

        {isStatisticsPage ? (
        <AdminStatsSection
          eventId={activeEventId}
        />
        ) : null}

        {missingDialog ? (
          <div
            className="admin-modal-backdrop"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                handleCloseMissingDialog();
              }
            }}
          >
            <div
              className="admin-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-missing-title"
            >
              <div className="admin-modal-header">
                <div>
                  <h3 id="admin-missing-title">
                    Stanoviště {missingDialog.stationCode} – {missingDialog.stationName}
                  </h3>
                  <p className="admin-modal-subtitle">
                    {missingDialog.category === 'TOTAL'
                      ? 'Zbývající hlídky celkem'
                      : `Zbývající hlídky (${missingDialog.category})`}
                  </p>
                </div>
                <button
                  type="button"
                  className="admin-modal-close"
                  onClick={handleCloseMissingDialog}
                  aria-label="Zavřít"
                >
                  ×
                </button>
              </div>
              <p className="admin-modal-meta">
                {missingDialog.missing.length} z{' '}
                {missingDialog.expected} hlídek ještě neprošlo.
              </p>
              {missingDialog.missing.length === 0 ? (
                <p className="admin-modal-empty">Všechny hlídky již stanoviště navštívily.</p>
              ) : (
                <ul className="admin-missing-list">
                  {missingDialog.missing.map((patrol) => (
                    <li key={patrol.id}>
                      <span className="admin-missing-code">{patrol.code}</span>
                      {patrol.teamName ? <span className="admin-missing-name">{patrol.teamName}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="admin-button admin-button--secondary"
                  onClick={handleCloseMissingDialog}
                >
                  Zavřít
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
      <AppFooter variant="minimal" />
    </div>
  );
}
