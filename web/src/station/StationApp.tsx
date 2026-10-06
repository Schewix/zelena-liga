import { Fragment,ClipboardEvent as ReactClipboardEvent,FormEvent as ReactFormEvent,useCallback,useEffect,useMemo,useRef,useState } from 'react';
import zelenaLigaLogo from '../assets/znak_SPTO_transparent.png';
import { ManifestFetchError } from '../auth/api';
import { ACCESS_DENIED_MESSAGE } from '../auth/messages';
import StationChangePasswordPage from '../auth/StationChangePasswordPage';
import { Ticket,TicketState,computeWaitTime,createTicket,loadTickets,saveTickets,ticketSignature,transitionTicket } from '../auth/tickets';
import { setupSyncListener } from '../backgroundSync';
import AppFooter from '../components/AppFooter';
import LastScoresList,{ type RestoreTargetEditPayload } from '../components/LastScoresList';
import PatrolCodeInput,{
PatrolRegistryEntry,
PatrolValidationState,
normalisePatrolCode,
} from '../components/PatrolCodeInput';
import PointsInput from '../components/PointsInput';
import TicketQueue from '../components/TicketQueue';
import {
fetchPatrolRegistryEntries,
loadPatrolRegistryCache,
savePatrolRegistryCache,
} from '../data/patrolRegistry';
import {
OutboxEntry,
StationScorePayload,
deleteOutboxEntries,
enqueueStationScore as enqueueStationScoreHelper,
flushOutboxBatch,
readOutbox,
releaseNetworkBackoff,
writeOutboxEntry
} from '../outbox';
import {
CHANGE_PASSWORD_ROUTE,
SCOREBOARD_ROUTE_PREFIX,
getStationPath,
isChangePasswordPathname
} from '../routing';
import { getLocalforage,getOutboxStore } from '../storage/localforage';
import { getManualPatrols,upsertManualPatrol } from '../storage/manualPatrols';
import { loadStoredPatrolWaitMinutes,saveStoredPatrolWaitMinutes } from '../storage/patrolWaitMemory';
import { appendScanRecord } from '../storage/scanHistory';
import { supabase } from '../supabaseClient';
import { exchangeStationTickets,mergeTickets,ticketSyncKey,type TicketSyncState } from './ticketSync';
import {
buildTimeScoringConfig,
computePureCourseSeconds,
computeTimePoints,
isTimeScoringCategory,
} from '../timeScoring';
import { triggerHaptic } from '../utils/haptics';
import {
getAllowedStationCategories,
getStationAllowedBaseCategories,
toStationCategoryKey
} from '../utils/stationCategories';
import {
CategoryKey,
formatAnswersForInput,
isCategoryKey,
normalizeAnswersInput,
packAnswersForStorage,
parseAnswerLetters,
type TargetAnswerOptionCount,
} from '../utils/targetAnswers';
import { ACCESS_TOKEN_REFRESH_SKEW_MS,AUTH_API_BASE_URL,SCORE_REVIEW_URL,STATION_TICKETS_URL,SUBMIT_STATION_RECORD_URL } from './config';
import { OUTBOX_BATCH_SIZE,releaseOutboxFlushLock,tryAcquireOutboxFlushLock,writeOutboxEntriesAndSync,writeOutboxEntryAndSync } from './outboxSync';
import { compareSummaryPatrols,createManualPatrolFromCode,formatMergedPatrolCode,formatPatrolMetaLabel,formatSummaryPatrolLabel,getPatrolCodeVariants,hasExplicitSexPatrolCode,isMergedPatrolCode,pickPatrolCandidate } from './patrolLookup';
import { buildPatrolTeamNameFromTroops,buildUniqueTroopList,createEmptyPatrolProfileRows,normalizeProfileText,normalizeTroopName,parsePatrolProfileDraft,parseTroopsFromTeamName,stringifyPatrolProfileRows,validatePatrolProfileDraft } from './patrolProfile';
import { BASE_CATEGORY_ORDER,CALC_SCORE_REVIEW_ORDER_BY_CATEGORY,CALC_SCORE_REVIEW_SEPARATOR_BEFORE_BY_CATEGORY,SCORE_REVIEW_TASK_KEYS,StationOrderOverrides,formatBaseCategoryDetailLabel,getStationDisplayName,normalizeStationOrderOverrides } from './scoreReview';
import { NO_SESSION_ERROR,clearBrowserRuntimeCaches,requireAccessToken,unregisterAllServiceWorkers } from './session';
import { WAIT_MINUTES_MAX,WAIT_TIME_MAX,WAIT_TIME_ZERO,combineDateWithTime,formatDateTimeLabel,formatDurationMs,formatTime,formatWaitDraft,formatWaitDuration,formatWaitMinutes,normalizeWaitInput,parseWaitDraft,toLocalTimeInput,waitSecondsToMinutes } from './time';
import { AuthenticatedState,CalcPatrolLoadMode,Patrol,PatrolFormDraft,PatrolProfileChildRow,StationCategorySummary,StationCategorySummaryItem,StationScoreRow,StationScoreRowState,StationSummaryPatrol,SummaryCategoryKey } from './types';
import { StationMenu } from './components/StationMenu';
import { StationSummaryDetail } from './components/StationSummaryDetail';
import { PatrolProfileCard } from './components/PatrolProfileCard';
import { ScoreReviewPanel } from './components/ScoreReviewPanel';
import { PendingSyncPanel } from './components/PendingSyncPanel';

export function StationApp({
  auth,
  refreshManifest,
  logout,
  refreshTokens,
}: {
  auth: AuthenticatedState;
  refreshManifest: () => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: (options?: { force?: boolean; reason?: string }) => Promise<boolean>;
}) {
  const manifest = auth.manifest;
  const eventId = manifest.event.id;
  const stationId = manifest.station.id;
  const stationCode = manifest.station.code?.trim().toUpperCase() || '';
  const stationDisplayName = getStationDisplayName(manifest.station.name, manifest.station.code);
  const scoringLocked = manifest.event.scoringLocked;
  const stationClosed = manifest.station.isClosed === true;
  const isTargetStation = stationCode === 'T';
  const canManageEventWideOutbox = stationCode === 'T';
  const canReviewStationScores =
    isTargetStation || manifest.allowedTasks.some((task) => SCORE_REVIEW_TASK_KEYS.has(task));
  const scoringDisabled = stationClosed || (scoringLocked && !isTargetStation);
  const timeScoringConfig = useMemo(() => buildTimeScoringConfig(manifest.event), [manifest.event]);
  const targetAnswerOptionCount: TargetAnswerOptionCount = manifest.event.targetAnswerOptionCount === 3 ? 3 : 4;
  const targetAnswerInputPattern = targetAnswerOptionCount === 3 ? '[A-CXa-cx]*' : '[A-DXa-dx]*';
  const targetAnswerInputHint = targetAnswerOptionCount === 3 ? 'A-C + X' : 'A-D + X';
  const targetAnswerInputExample = targetAnswerOptionCount === 3 ? 'např. ABCX' : 'např. ABCDX';
  const [activePatrol, setActivePatrol] = useState<Patrol | null>(null);
  const [calcPatrolLoadMode, setCalcPatrolLoadMode] = useState<CalcPatrolLoadMode>('full');
  const [scannerPatrol, setScannerPatrol] = useState<Patrol | null>(null);
  const [scannerSource, setScannerSource] = useState<'manual' | 'scan' | 'summary' | null>(null);
  const [showPatrolChoice, setShowPatrolChoice] = useState(false);
  const [pendingRecoveredWaitMinutes, setPendingRecoveredWaitMinutes] = useState<number | null>(null);
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const [calcTeamNameDraft, setCalcTeamNameDraft] = useState('');
  const [calcPatrolMembersDraft, setCalcPatrolMembersDraft] = useState('');
  const [calcSelectedTroops, setCalcSelectedTroops] = useState<string[]>([]);
  const [calcTroopSelectDraft, setCalcTroopSelectDraft] = useState('');
  const [calcCustomTroopDraft, setCalcCustomTroopDraft] = useState('');
  const [calcMemberRows, setCalcMemberRows] = useState<PatrolProfileChildRow[]>(() => createEmptyPatrolProfileRows());
  const [calcCategoryDraft, setCalcCategoryDraft] = useState('');
  const [calcSexDraft, setCalcSexDraft] = useState('');
  const [savingPatrolProfile, setSavingPatrolProfile] = useState(false);
  const [patrolProfileMessage, setPatrolProfileMessage] = useState<string | null>(null);
  const [patrolProfileError, setPatrolProfileError] = useState<string | null>(null);
  const [answersInput, setAnswersInput] = useState('');
  const [answersError, setAnswersError] = useState('');
  const [useTargetScoring, setUseTargetScoring] = useState(false);
  const [categoryAnswers, setCategoryAnswers] = useState<Record<string, string>>({});
  const [outboxItems, setOutboxItems] = useState<OutboxEntry[]>([]);
  const [showPendingDetails, setShowPendingDetails] = useState(false);
  const [editingOutboxEntryId, setEditingOutboxEntryId] = useState<string | null>(null);
  const [editingOutboxPoints, setEditingOutboxPoints] = useState('');
  const [editingOutboxWait, setEditingOutboxWait] = useState(WAIT_TIME_ZERO);
  const [editingOutboxAnswers, setEditingOutboxAnswers] = useState('');
  const [editingOutboxError, setEditingOutboxError] = useState<string | null>(null);
  const [savingOutboxEntryId, setSavingOutboxEntryId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const didRecoverOutbox = useRef(false);
  const flushInFlightRef = useRef(false);
  const reconnectRetryTimeoutRef = useRef<number | null>(null);
  const flushLockOwnerIdRef = useRef(
    typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `flush-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [authNeedsLogin, setAuthNeedsLogin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fullRefreshRunning, setFullRefreshRunning] = useState(false);
  const [currentPathname, setCurrentPathname] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname : getStationPath(stationDisplayName),
  );
  const [manualCodeDraft, setManualCodeDraft] = useState('');
  const [confirmedManualCode, setConfirmedManualCode] = useState('');
  const [patrolRegistryEntries, setPatrolRegistryEntries] = useState<PatrolRegistryEntry[]>([]);
  const [patrolRegistryLoading, setPatrolRegistryLoading] = useState(true);
  const [patrolRegistryError, setPatrolRegistryError] = useState<string | null>(null);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);
  const [manualPatrols, setManualPatrols] = useState<Patrol[]>([]);
  const [manualValidation, setManualValidation] = useState<PatrolValidationState>({
    code: '',
    valid: false,
    reason: 'loading',
    message: 'Načítám dostupná čísla hlídek…',
  });
  const [scanActive, setScanActive] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [tick, setTick] = useState(0);
  const [autoScore, setAutoScore] = useState({ correct: 0, total: 0, given: 0, normalizedGiven: '' });
  const [alerts, setAlerts] = useState<string[]>([]);
  const displayAlerts = useMemo(() => {
    if (scoringDisabled) {
      const baseMessage = 'Závod byl ukončen. Zapisování bodů bylo kanceláří uzamčeno.';
      if (alerts.includes(baseMessage)) {
        return alerts;
      }
      return [baseMessage, ...alerts];
    }
    return alerts;
  }, [alerts, scoringDisabled]);
  const [arrivedAt, setArrivedAt] = useState<string | null>(null);
  const [finishAt, setFinishAt] = useState<string | null>(null);
  const [totalWaitMinutes, setTotalWaitMinutes] = useState<number | null>(null);
  const [waitDraft, setWaitDraft] = useState(WAIT_TIME_ZERO);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const tempCodesRef = useRef<Map<string, string>>(new Map());
  const tempCounterRef = useRef(1);
  const calcProfileRef = useRef<HTMLElement | null>(null);
  const formRef = useRef<HTMLElement | null>(null);
  const summaryRef = useRef<HTMLElement | null>(null);
  const summaryDetailRef = useRef<HTMLDivElement | null>(null);
  const summaryMissingRef = useRef<HTMLDivElement | null>(null);
  const summaryCompletedRef = useRef<HTMLDivElement | null>(null);
  const ticketQueueRef = useRef<HTMLElement | null>(null);
  const pointsInputRef = useRef<HTMLInputElement | null>(null);
  const answersInputRef = useRef<HTMLInputElement | null>(null);
  const activePatrolIdRef = useRef<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [startTimeInput, setStartTimeInput] = useState('');
  const [finishTimeInput, setFinishTimeInput] = useState('');
  const [scoreReviewRows, setScoreReviewRows] = useState<StationScoreRow[]>([]);
  const [scoreReviewState, setScoreReviewState] = useState<Record<string, StationScoreRowState>>({});
  const [scoreReviewLoading, setScoreReviewLoading] = useState(false);
  const [scoreReviewError, setScoreReviewError] = useState<string | null>(null);
  const [stationPassageIds, setStationPassageIds] = useState<string[]>([]);
  const [stationPassageLoading, setStationPassageLoading] = useState(false);
  const [stationPassageError, setStationPassageError] = useState<string | null>(null);
  const [patrolFormDrafts, setPatrolFormDrafts] = useState<Record<string, PatrolFormDraft>>({});
  const [selectedSummaryCategory, setSelectedSummaryCategory] = useState<SummaryCategoryKey | null>(null);
  const [showCompletedSummary, setShowCompletedSummary] = useState(false);
  const [showScannerPanel, setShowScannerPanel] = useState(false);
  const lastSummaryScrollRef = useRef<SummaryCategoryKey | null>(null);
  const isChangePasswordView = useMemo(
    () => isChangePasswordPathname(currentPathname),
    [currentPathname],
  );

  useEffect(() => {
    activePatrolIdRef.current = activePatrol?.id ?? null;
  }, [activePatrol]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handlePopState = () => setCurrentPathname(window.location.pathname);
    handlePopState();
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigateToPath = useCallback((pathname: string, options?: { replace?: boolean }) => {
    if (typeof window === 'undefined') {
      return;
    }
    const normalizedPathname = pathname.replace(/\/$/, '') || '/';
    const current = window.location.pathname.replace(/\/$/, '') || '/';
    if (current === normalizedPathname) {
      setCurrentPathname(normalizedPathname);
      return;
    }
    if (options?.replace) {
      window.history.replaceState(window.history.state, '', normalizedPathname);
    } else {
      window.history.pushState(window.history.state, '', normalizedPathname);
    }
    setCurrentPathname(normalizedPathname);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const shouldRefreshAccessToken = useCallback(() => {
    const expiresAt = auth.tokens.accessTokenExpiresAt;
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
      return true;
    }
    return Date.now() >= expiresAt - ACCESS_TOKEN_REFRESH_SKEW_MS;
  }, [auth.tokens.accessTokenExpiresAt]);

  const refreshAccessToken = useCallback(
    async (options?: { force?: boolean; reason?: string }) => {
      if (!isOnline) {
        return false;
      }
      return refreshTokens(options);
    },
    [isOnline, refreshTokens],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!eventId) {
        return;
      }
      try {
        const stored = await getManualPatrols(eventId);
        if (!cancelled) {
          setManualPatrols(stored);
        }
      } catch (error) {
        console.error('manual patrols load failed', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const enableTicketQueue = !isTargetStation;
  const scrollToQueue = useCallback(() => {
    if (!enableTicketQueue) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    const element = ticketQueueRef.current;
    if (!element) {
      return;
    }
    window.requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [enableTicketQueue]);
  const scrollToSummary = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const element = summaryRef.current;
    if (!element) {
      return;
    }
    window.requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);
  const allowedCategorySet = useMemo(() => {
    const manifestCategories = Array.isArray(manifest.allowedCategories)
      ? manifest.allowedCategories
      : [];
    const normalizedManifest = manifestCategories
      .map((category) => (typeof category === 'string' ? category.trim().toUpperCase() : ''))
      .filter((category): category is CategoryKey => category.length > 0 && isCategoryKey(category));
    const fallbackCategories = getStationAllowedBaseCategories(stationCode);
    const effectiveCategories = normalizedManifest.length ? normalizedManifest : fallbackCategories;
    return new Set<CategoryKey>(effectiveCategories);
  }, [manifest.allowedCategories, stationCode]);
  const allowedBaseCategories = useMemo(
    () => BASE_CATEGORY_ORDER.filter((category) => allowedCategorySet.has(category)),
    [allowedCategorySet],
  );
  const allowedSummaryCategories = useMemo<SummaryCategoryKey[]>(
    () => allowedBaseCategories,
    [allowedBaseCategories],
  );
  const allowedSummaryCategorySet = useMemo(
    () => new Set<SummaryCategoryKey>(allowedSummaryCategories),
    [allowedSummaryCategories],
  );
  const allowedStationCategoryLabel = useMemo(() => {
    if (!allowedBaseCategories.length) {
      return '—';
    }
    return allowedBaseCategories.join(', ');
  }, [allowedBaseCategories]);
  const stationRules = useMemo(() => {
    const rules: string[] = [];
    if (isTargetStation) {
      rules.push('Zapiš čas doběhu ve formátu HH:MM.');
      rules.push(
        `12 bodů je za limitní čas dle kategorie, za každých započatých ${timeScoringConfig.penaltyStepMinutes} minut navíc se odečte 1 bod.`,
      );
      rules.push('Zadej odpovědi v terčovém úseku, body se spočítají automaticky.');
    } else {
      rules.push('Zapisuj body v rozsahu 0–12.');
      rules.push('Čekání zadávej ve formátu HH:MM (bez vteřin).');
      if (enableTicketQueue) {
        rules.push('Hlídku můžeš vrátit do fronty nebo ji obsloužit hned.');
      }
    }
    return rules;
  }, [enableTicketQueue, isTargetStation, timeScoringConfig.penaltyStepMinutes]);
  useEffect(() => {
    setSelectedSummaryCategory((previous) => {
      if (!previous) {
        return null;
      }
      return allowedSummaryCategorySet.has(previous) ? previous : null;
    });
  }, [allowedSummaryCategorySet]);

  useEffect(() => {
    setShowCompletedSummary(false);
  }, [selectedSummaryCategory]);
  const isCategoryAllowed = useCallback(
    (category: string | null | undefined) => {
      if (allowedCategorySet.size === 0) {
        return true;
      }
      const normalized = category?.trim().toUpperCase() ?? '';
      if (!isCategoryKey(normalized)) {
        return false;
      }
      return allowedCategorySet.has(normalized);
    },
    [allowedCategorySet],
  );
  const reportSupabaseError = useCallback(
    (context: string, error: { message?: string } | null, status?: number) => {
      if (import.meta.env.DEV) {
        console.debug('[supabase] request failed', {
          context,
          status,
          message: error?.message ?? null,
        });
      }
      if (status === 403) {
        setAccessDeniedMessage(ACCESS_DENIED_MESSAGE);
      }
    },
    [],
  );

  const calcTroopOptions = useMemo(() => {
    const all: string[] = [];

    const configuredTroops = buildUniqueTroopList(
      (manifest.event.participatingTroops ?? [])
        .map((troop) => normalizeTroopName(troop)),
    );
    const hasConfiguredTroops = configuredTroops.length > 0;

    if (hasConfiguredTroops) {
      configuredTroops.forEach((troop) => all.push(troop));
    } else {
      auth.patrols.forEach((patrol) => {
        parseTroopsFromTeamName(patrol.team_name).forEach((troop) => {
          all.push(troop);
        });
      });
    }
    parseTroopsFromTeamName(activePatrol?.team_name).forEach((troop) => {
      all.push(troop);
    });
    calcSelectedTroops.forEach((troop) => {
      all.push(troop);
    });
    calcMemberRows.forEach((row) => {
      if (row.troop) {
        all.push(row.troop);
      }
    });
    return buildUniqueTroopList(all).sort((a, b) => a.localeCompare(b, 'cs'));
  }, [activePatrol?.team_name, auth.patrols, calcMemberRows, calcSelectedTroops, manifest.event.participatingTroops]);

  const calcProfileDraft = useMemo(() => {
    const troops = buildUniqueTroopList(calcSelectedTroops);
    const requiresTroopPerChild = troops.length > 1;
    const rows = calcMemberRows.map((row) => ({
      firstName: normalizeProfileText(row.firstName),
      lastName: normalizeProfileText(row.lastName),
      nickname: normalizeProfileText(row.nickname),
      troop: normalizeTroopName(row.troop),
    }));
    const teamName = buildPatrolTeamNameFromTroops(troops);
    const membersText = stringifyPatrolProfileRows(rows, { requiresTroopPerChild });
    return {
      troops,
      rows,
      teamName,
      membersText,
      requiresTroopPerChild,
    };
  }, [calcMemberRows, calcSelectedTroops]);

  useEffect(() => {
    setCalcTeamNameDraft((previous) => (previous === calcProfileDraft.teamName ? previous : calcProfileDraft.teamName));
    setCalcPatrolMembersDraft((previous) => {
      const next = calcProfileDraft.membersText ?? '';
      return previous === next ? previous : next;
    });
  }, [calcProfileDraft.membersText, calcProfileDraft.teamName]);

  useEffect(() => {
    if (!calcTroopOptions.length) {
      if (calcTroopSelectDraft) {
        setCalcTroopSelectDraft('');
      }
      return;
    }
    const current = normalizeTroopName(calcTroopSelectDraft);
    if (current && calcTroopOptions.includes(current)) {
      return;
    }
    setCalcTroopSelectDraft(calcTroopOptions[0]);
  }, [calcTroopOptions, calcTroopSelectDraft]);

  useEffect(() => {
    let cancelled = false;

    const loadRegistry = async () => {
      setPatrolRegistryLoading(true);
      setPatrolRegistryError(null);

      const cachedRegistry = await loadPatrolRegistryCache(eventId);
      if (!cancelled && cachedRegistry?.entries?.length) {
        setPatrolRegistryEntries(cachedRegistry.entries);
      }

      const registryResult = await fetchPatrolRegistryEntries({
        online: navigator.onLine,
        cachedEntries: cachedRegistry?.entries ?? null,
        fetchRows: async () => {
          const { data, error, status } = await supabase
            .from('patrols')
            .select('id, patrol_code, category, sex, active')
            .eq('event_id', eventId)
            .order('category')
            .order('sex')
            .order('patrol_code');
          if (error) {
            reportSupabaseError('patrols.registry', error, status);
          }
          return { data, error };
        },
        isCategoryAllowed,
      });

      if (cancelled) {
        return;
      }

      if (!registryResult.fetched && registryResult.error) {
        console.error('Failed to load patrol registry', registryResult.error);
      }

      if (registryResult.entries) {
        setPatrolRegistryEntries(registryResult.entries);
      }

      if (registryResult.fetched && registryResult.entries) {
        try {
          await savePatrolRegistryCache(eventId, registryResult.entries);
        } catch (storageError) {
          console.warn('Failed to cache patrol registry', storageError);
        }
      }

      if (registryResult.stats) {
        console.info('[patrol-code-input] registry-loaded', registryResult.stats);
      }

      if (registryResult.error) {
        setPatrolRegistryError(registryResult.error);
      } else if (!registryResult.entries?.length && cachedRegistry?.entries?.length) {
        setPatrolRegistryError(null);
      }

      setPatrolRegistryLoading(false);
    };

    void loadRegistry();

    return () => {
      cancelled = true;
    };
  }, [eventId, isCategoryAllowed, reportSupabaseError]);

  const patrolRegistryState = useMemo(
    () => ({
      loading: patrolRegistryLoading,
      entries: patrolRegistryEntries,
      error: patrolRegistryError,
    }),
    [patrolRegistryEntries, patrolRegistryError, patrolRegistryLoading],
  );
  const updateTickets = useCallback(
    (updater: (current: Ticket[]) => Ticket[]) => {
      let nextTickets: Ticket[] = [];
      setTickets((prev) => {
        const updated = updater(prev);
        const stampedAt = new Date().toISOString();
        const previousById = new Map(prev.map((ticket) => [ticket.id, ticket] as const));
        const next = updated.map((ticket) => {
          const before = previousById.get(ticket.id);
          return before && ticketSignature(before) === ticketSignature(ticket)
            ? ticket
            : { ...ticket, updatedAt: stampedAt };
        });
        nextTickets = next;
        void saveTickets(stationId, next);
        return next;
      });
      return nextTickets;
    },
    [stationId],
  );

  const updateOutboxState = useCallback((items: OutboxEntry[]) => {
    const sorted = [...items].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    setOutboxItems(sorted);
  }, []);

  const pushAlert = useCallback((message: string) => {
    setAlerts((prev) => [...prev, message]);
    setTimeout(() => {
      setAlerts((prev) => prev.slice(1));
    }, 4500);
  }, []);

  const normalizeOutboxForSession = useCallback(
    async (items: OutboxEntry[]) => {
      const now = Date.now();
      let changed = false;
      const updated = items.map<OutboxEntry>((item) => {
        if (item.state === 'sent') {
          return item;
        }
        const isCurrent =
          item.event_id === eventId &&
          (item.station_id === stationId || canManageEventWideOutbox);
        if (!isCurrent && item.state !== 'blocked_other_session') {
          changed = true;
          return { ...item, state: 'blocked_other_session', next_attempt_at: now };
        }
        if (isCurrent && item.state === 'blocked_other_session') {
          changed = true;
          return { ...item, state: 'queued', next_attempt_at: now };
        }
        return item;
      });
      if (changed) {
        await writeOutboxEntriesAndSync(updated);
      }
      return updated;
    },
    [canManageEventWideOutbox, eventId, stationId],
  );

  const refreshOutbox = useCallback(async () => {
    const items = await readOutbox();
    let nextItems = items;
    if (!didRecoverOutbox.current) {
      didRecoverOutbox.current = true;
      const now = Date.now();
      const recovered = items.map<OutboxEntry>((item) =>
        item.state === 'sending' ? { ...item, state: 'queued', next_attempt_at: now } : item,
      );
      if (recovered.some((item, index) => item !== items[index])) {
        await writeOutboxEntriesAndSync(recovered);
      }
      nextItems = recovered;
    }
    const normalized = await normalizeOutboxForSession(nextItems);
    updateOutboxState(normalized);
  }, [normalizeOutboxForSession, updateOutboxState]);

  useEffect(() => {
    void refreshOutbox();
  }, [refreshOutbox]);

  const currentSessionItems = useMemo(
    () =>
      outboxItems.filter(
        (item) =>
          item.event_id === eventId &&
          (item.station_id === stationId || canManageEventWideOutbox),
      ),
    [canManageEventWideOutbox, eventId, outboxItems, stationId],
  );
  const queuedPatrolIds = useMemo(() => {
    const ids = new Set<string>();
    if (!enableTicketQueue) {
      return ids;
    }
    tickets.forEach((ticket) => {
      if (ticket.state === 'waiting' || ticket.state === 'serving') {
        ids.add(ticket.patrolId);
      }
    });
    return ids;
  }, [enableTicketQueue, tickets]);
  const hasQueueTickets = useMemo(() => {
    if (!enableTicketQueue) {
      return false;
    }
    return tickets.some((ticket) => ticket.state === 'waiting' || ticket.state === 'serving');
  }, [enableTicketQueue, tickets]);
  const otherSessionItems = useMemo(
    () =>
      outboxItems.filter(
        (item) =>
          item.event_id !== eventId ||
          (!canManageEventWideOutbox && item.station_id !== stationId),
      ),
    [canManageEventWideOutbox, eventId, outboxItems, stationId],
  );
  const pendingCount = useMemo(
    () =>
      currentSessionItems.filter(
        (item) =>
          item.state !== 'sent'
          && item.state !== 'blocked_other_session'
          && item.state !== 'rejected_event_locked',
      ).length,
    [currentSessionItems],
  );

  useEffect(() => {
    if (outboxItems.length === 0) {
      setShowPendingDetails(false);
      setEditingOutboxEntryId(null);
      setEditingOutboxError(null);
      setSavingOutboxEntryId(null);
    }
  }, [outboxItems.length]);

  const handleClearOtherSessions = useCallback(async () => {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('Opravdu chcete vyčistit záznamy z jiné relace?');
      if (!confirmed) {
        return;
      }
    }
    const idsToRemove = otherSessionItems.map((item) => item.client_event_id);
    if (!idsToRemove.length) {
      return;
    }
    await deleteOutboxEntries(idsToRemove);
    const filtered = outboxItems.filter((item) => !idsToRemove.includes(item.client_event_id));
    updateOutboxState(filtered);
    pushAlert('Staré záznamy z jiné relace byly odstraněny.');
  }, [otherSessionItems, outboxItems, pushAlert, updateOutboxState]);

  const beginOutboxEdit = useCallback((entry: OutboxEntry) => {
    if (entry.state === 'sending') {
      return;
    }
    setEditingOutboxEntryId(entry.client_event_id);
    setEditingOutboxPoints(String(entry.payload.points));
    setEditingOutboxWait(formatWaitMinutes(entry.payload.wait_minutes));
    setEditingOutboxAnswers(
      normalizeAnswersInput(entry.payload.normalized_answers || '', {
        maxOptionCount: targetAnswerOptionCount,
        allowBlank: true,
      }),
    );
    setEditingOutboxError(null);
    setSavingOutboxEntryId(null);
  }, [targetAnswerOptionCount]);

  const cancelOutboxEdit = useCallback(() => {
    setEditingOutboxEntryId(null);
    setEditingOutboxError(null);
    setSavingOutboxEntryId(null);
  }, []);

  const isTimeStationOutboxEntry = useCallback(
    (entry: OutboxEntry) => stationCode === 'T' && entry.payload.station_id === stationId,
    [stationCode, stationId],
  );

  const handleSaveOutboxEntry = useCallback(
    async (entry: OutboxEntry) => {
      const pointsValue = Number(editingOutboxPoints.trim());
      const allowNegativePoints = isTimeStationOutboxEntry(entry);
      const hasValidPoints =
        Number.isInteger(pointsValue) &&
        pointsValue <= 12 &&
        (allowNegativePoints ? pointsValue >= -12 : pointsValue >= 0);
      if (!hasValidPoints) {
        setEditingOutboxError(
          allowNegativePoints
            ? 'Body musí být celé číslo -12 až 12.'
            : 'Body musí být celé číslo 0–12.',
        );
        return;
      }

      const waitValue = parseWaitDraft(editingOutboxWait);
      if (!Number.isInteger(waitValue) || waitValue < 0 || waitValue > WAIT_MINUTES_MAX) {
        setEditingOutboxError(`Čekání musí být čas v rozsahu 00:00–${WAIT_TIME_MAX}.`);
        return;
      }

      let normalizedAnswers: string | null = null;
      if (entry.payload.use_target_scoring) {
        normalizedAnswers = packAnswersForStorage(editingOutboxAnswers, {
          maxOptionCount: targetAnswerOptionCount,
          allowBlank: true,
        });
        const hasAnswers = parseAnswerLetters(normalizedAnswers, {
          maxOptionCount: targetAnswerOptionCount,
          allowBlank: true,
        }).length > 0;
        if (!hasAnswers) {
          setEditingOutboxError(`Pro terčový úsek je potřeba vyplnit odpovědi (${targetAnswerInputHint}).`);
          return;
        }
      }

      setSavingOutboxEntryId(entry.client_event_id);
      setEditingOutboxError(null);

      const nextState = entry.state === 'needs_auth' ? 'needs_auth' : 'queued';
      const now = Date.now();
      const updatedEntry: OutboxEntry = {
        ...entry,
        payload: {
          ...entry.payload,
          points: pointsValue,
          wait_minutes: waitValue,
          normalized_answers: entry.payload.use_target_scoring ? normalizedAnswers : null,
        },
        state: nextState,
        attempts: nextState === 'needs_auth' ? entry.attempts : 0,
        last_error: undefined,
        next_attempt_at: now,
        response: null,
      };

      try {
        await writeOutboxEntry(updatedEntry);
        const nextItems = outboxItems.map((item) =>
          item.client_event_id === updatedEntry.client_event_id ? updatedEntry : item,
        );
        updateOutboxState(nextItems);
        setEditingOutboxEntryId(null);
        setSavingOutboxEntryId(null);
        setEditingOutboxError(null);
        pushAlert('Záznam ve frontě byl upraven.');
      } catch (error) {
        console.error('Failed to update outbox entry', error);
        setSavingOutboxEntryId(null);
        setEditingOutboxError('Úprava fronty se nepodařila. Zkus to prosím znovu.');
      }
    },
    [
      editingOutboxAnswers,
      editingOutboxPoints,
      editingOutboxWait,
      isTimeStationOutboxEntry,
      outboxItems,
      pushAlert,
      targetAnswerInputHint,
      targetAnswerOptionCount,
      updateOutboxState,
    ],
  );

  const lastManifestToastAtRef = useRef<number | null>(null);

  useEffect(() => {
    tempCodesRef.current.clear();
    tempCounterRef.current = 1;
  }, [stationId]);

  const resolvePatrolCode = useCallback(
    (currentPatrol: Patrol | null) => {
      if (!currentPatrol) {
        return '';
      }
      const inputCode = normalisePatrolCode(currentPatrol.input_patrol_code ?? '');
      if (inputCode) {
        return inputCode.toUpperCase();
      }
      const raw = (currentPatrol.patrol_code ?? '').trim().toUpperCase();
      if (raw) {
        return raw;
      }
      const existing = tempCodesRef.current.get(currentPatrol.id);
      if (existing) {
        return existing;
      }
      const nextValue = `TMP-${String(tempCounterRef.current).padStart(3, '0')}`;
      tempCounterRef.current += 1;
      tempCodesRef.current.set(currentPatrol.id, nextValue);
      return nextValue;
    },
    [],
  );

  const previewPatrolCode = scannerPatrol ? resolvePatrolCode(scannerPatrol) : '';
  const showScannerPreview = Boolean(scannerPatrol && scannerSource === 'scan');
  const isCalcProfileOnlyMode = isTargetStation && calcPatrolLoadMode === 'profile';

  useEffect(() => {
    let cancelled = false;
    let onlineListener: (() => void) | null = null;
    const toastCooldownMs = 10 * 60 * 1000;

    const scheduleRetryOnOnline = () => {
      if (onlineListener) return;
      onlineListener = () => {
        onlineListener = null;
        if (!cancelled) {
          void refresh();
        }
      };
      window.addEventListener('online', onlineListener, { once: true });
    };

    const refresh = async () => {
      try {
        if (navigator.onLine === false) {
          scheduleRetryOnOnline();
          return;
        }

        if (shouldRefreshAccessToken()) {
          const refreshed = await refreshAccessToken({ reason: 'manifest-preflight' });
          if (refreshed) {
            // Access token was rotated; wait for the next render so manifest refresh
            // uses the latest auth context callbacks and token values.
            return;
          }
          return;
        }

        await refreshManifest();
      } catch (error) {
        console.error('Manifest refresh failed', error);
        if (navigator.onLine === false) {
          scheduleRetryOnOnline();
          return;
        }
        if (!cancelled) {
          const now = Date.now();
          const lastToastAt = lastManifestToastAtRef.current ?? 0;
          const isThrottled = now - lastToastAt < toastCooldownMs;
          const isDev = import.meta.env.DEV;
          const manifestError = error instanceof ManifestFetchError ? error : null;
          const isNotFoundOrHtml =
            manifestError?.isNotFound || manifestError?.isHtmlResponse || manifestError?.kind === 'content-type';
          const allowToast = isDev || (!isThrottled && !isNotFoundOrHtml);

          if (allowToast) {
            lastManifestToastAtRef.current = now;
            pushAlert('Nepodařilo se obnovit manifest. Zkusím to znovu později.');
          }
        }
      }
    };

    refresh();
    const interval = window.setInterval(refresh, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (onlineListener) {
        window.removeEventListener('online', onlineListener);
      }
    };
  }, [pushAlert, refreshAccessToken, refreshManifest, shouldRefreshAccessToken]);

  useEffect(() => {
    setStartTimeInput(toLocalTimeInput(startTime));
  }, [startTime, stationId]);

  useEffect(() => {
    setFinishTimeInput(toLocalTimeInput(finishAt));
  }, [finishAt, stationId]);

  const handleAddTicket = useCallback(
    (
      initialState: Extract<TicketState, 'waiting' | 'serving'> = 'waiting',
      options?: { restoredWaitMinutes?: number | null },
    ) => {
      if (scoringDisabled) {
        pushAlert('Závod byl ukončen. Zapisování bodů je uzamčeno.');
        return;
      }
      if (!scannerPatrol) {
        pushAlert('Nejprve načti hlídku.');
        return;
      }

      let addedState: TicketState | null = null;
      const patrolCode = resolvePatrolCode(scannerPatrol);

      updateTickets((current) => {
        const exists = current.some((ticket) => ticket.patrolId === scannerPatrol.id && ticket.state !== 'done');
        if (exists) {
          return current;
        }
        // One ticket per patrol: a finished/removed one is replaced by the new entry.
        current = current.filter((ticket) => ticket.patrolId !== scannerPatrol.id);
        const restoredWaitMinutes = Number(options?.restoredWaitMinutes ?? 0);
        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const restoredArrivedAtIso =
          restoredWaitMinutes > 0
            ? new Date(nowMs - restoredWaitMinutes * 60 * 1000).toISOString()
            : '';

        const newTicket: Ticket = createTicket({
          patrolId: scannerPatrol.id,
          patrolCode,
          teamName: scannerPatrol.team_name,
          category: scannerPatrol.category,
          sex: scannerPatrol.sex,
          initialState,
        });
        if (restoredArrivedAtIso) {
          newTicket.arrivedAt = restoredArrivedAtIso;
          if (initialState === 'waiting') {
            newTicket.waitStartedAt = restoredArrivedAtIso;
            newTicket.servedAt = undefined;
          } else {
            newTicket.waitStartedAt = undefined;
            newTicket.servedAt = nowIso;
          }
        }
        addedState = newTicket.state;
        return [...current, newTicket];
      });

      if (addedState) {
        if (initialState === 'serving') {
          pushAlert(`Hlídka ${scannerPatrol.team_name} je připravena k obsluze.`);
        } else {
          pushAlert(`Do fronty přidána hlídka ${scannerPatrol.team_name}.`);
        }
        setShowPatrolChoice(false);
      } else {
        setShowPatrolChoice(false);
      }
      setPendingRecoveredWaitMinutes(null);
    },
    [scannerPatrol, pushAlert, resolvePatrolCode, scoringDisabled, updateTickets],
  );

  const clearWait = useCallback(() => {
    setWaitDraft(WAIT_TIME_ZERO);
  }, []);

  const patrolById = useMemo(() => {
    const map = new Map<string, Patrol>();
    auth.patrols.forEach((summary) => {
      if (!isCategoryAllowed(summary.category)) {
        return;
      }
      map.set(summary.id, {
        id: summary.id,
        team_name: summary.team_name,
        category: summary.category,
        sex: summary.sex,
        patrol_code: summary.patrol_code,
      });
    });
    return map;
  }, [auth.patrols, isCategoryAllowed]);

  const registerManualPatrol = useCallback(
    async (patrol: Patrol) => {
      if (!eventId) {
        return;
      }
      if (!patrol.id.startsWith('manual-') || !patrol.patrol_code) {
        return;
      }
      try {
        const next = await upsertManualPatrol(eventId, {
          id: patrol.id,
          team_name: patrol.team_name,
          category: patrol.category,
          sex: patrol.sex,
          patrol_code: patrol.patrol_code,
        });
        setManualPatrols(next);
      } catch (error) {
        console.error('manual patrols persist failed', error);
      }
    },
    [eventId],
  );

  const stationPassageVisitedSet = useMemo(() => {
    const visited = new Set<string>();
    stationPassageIds.forEach((id) => {
      if (typeof id === 'string' && id.length > 0) {
        visited.add(id);
      }
    });

    currentSessionItems.forEach((item) => {
      if (item.type !== 'station_score') {
        return;
      }
      const payload = item.payload;
      if (!payload || payload.event_id !== eventId || payload.station_id !== stationId) {
        return;
      }
      if (payload.patrol_id) {
        visited.add(payload.patrol_id);
      }
    });

    queuedPatrolIds.forEach((id) => {
      visited.add(id);
    });

    return visited;
  }, [currentSessionItems, eventId, queuedPatrolIds, stationId, stationPassageIds]);


  const loadTimingData = useCallback(
    async (patrolId: string) => {
      if (stationCode !== 'T') {
        setStartTime(null);
        setFinishAt(null);
        setTotalWaitMinutes(null);
        return;
      }

      const [
        { data: timingRows, error: timingError, status: timingStatus },
        { data: passageRows, error: waitError, status: waitStatus },
      ] =
        await Promise.all([
          supabase
            .from('timings')
            .select('start_time, finish_time')
            .eq('event_id', eventId)
            .eq('patrol_id', patrolId),
          supabase
            .from('station_passages')
            .select('station_id, wait_minutes')
            .eq('event_id', eventId)
            .eq('patrol_id', patrolId),
        ]);

      if (timingError) {
        reportSupabaseError('timings.load', timingError, timingStatus);
        console.error('Failed to load finish time', timingError);
        setStartTime(null);
        setFinishAt(null);
        setTotalWaitMinutes(null);
        return;
      }

      const row = Array.isArray(timingRows) && timingRows.length > 0 ? timingRows[0] : null;
      const timing = row as { start_time?: string | null; finish_time?: string | null } | null;
      setStartTime(timing?.start_time ?? null);
      setFinishAt(timing?.finish_time ?? null);

      if (waitError) {
        reportSupabaseError('station_passages.wait', waitError, waitStatus);
        console.error('Failed to load wait data', waitError);
        setTotalWaitMinutes(null);
      } else {
        const rows = (passageRows as { station_id?: string | null; wait_minutes?: number | null }[] | null) ?? [];
        const total = rows.reduce((acc, current) => {
          if (current?.station_id === stationId) {
            return acc;
          }
          const value = Number(current?.wait_minutes ?? 0);
          return Number.isFinite(value) ? acc + value : acc;
        }, 0);
        setTotalWaitMinutes(total);
      }
    },
    [eventId, reportSupabaseError, stationCode, stationId],
  );

  const loadTargetAnswers = useCallback(
    async (patrolId: string) => {
      if (stationCode !== 'T') {
        return null;
      }

      const { data, error, status } = await supabase
        .from('station_quiz_responses')
        .select('answers, updated_at')
        .eq('event_id', eventId)
        .eq('patrol_id', patrolId)
        .order('updated_at', { ascending: false });

      if (error) {
        reportSupabaseError('station_quiz_responses.load', error, status);
        console.error('Failed to load target answers', error);
        return null;
      }

      const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
      const answers = typeof row?.answers === 'string' ? row.answers : '';
      if (!answers) {
        return null;
      }
      return normalizeAnswersInput(answers, {
        maxOptionCount: targetAnswerOptionCount,
        allowBlank: true,
      });
    },
    [eventId, reportSupabaseError, stationCode, targetAnswerOptionCount],
  );

  const loadScoreReview = useCallback(
    async (
      patrolId: string,
      patrolCode?: string | null,
      patrolCategory?: string | null,
      patrolSex?: string | null,
    ) => {
      if (!canReviewStationScores) {
        setScoreReviewRows([]);
        setScoreReviewState({});
        setScoreReviewError(null);
        setScoreReviewLoading(false);
        return;
      }

      setScoreReviewLoading(true);
      setScoreReviewError(null);

      try {
        let stationsData: { id: string; code: string; name: string }[] = [];
        let scoresData: { station_id: string; points: number | null; judge: string | null; note: string | null }[] = [];
        let waitsData: { station_id: string; wait_minutes: number | null }[] = [];
        let stationOrderOverrides: StationOrderOverrides | null = null;

        if (SCORE_REVIEW_URL) {
          const response = await fetch(SCORE_REVIEW_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_id: eventId,
              patrol_id: patrolId,
              patrol_code: patrolCode ?? '',
            }),
          });

          setScoreReviewLoading(false);

          if (!response.ok) {
            const detail = await response.text().catch(() => '');
            console.error('Failed to load station scores for review', {
              status: response.status,
              detail,
            });
            setScoreReviewRows([]);
            setScoreReviewState({});
            setScoreReviewError('Nepodařilo se načíst body ostatních stanovišť.');
            return;
          }

          const payload = (await response.json().catch(() => null)) as
              | {
                  stations?: { id: string; code: string; name: string }[];
                  scores?: { station_id: string; points: number | null; judge: string | null; note: string | null }[];
                  waits?: { station_id: string; wait_minutes: number | null }[];
                  station_order?: unknown;
                }
              | null;

          stationsData = payload?.stations ?? [];
          scoresData = payload?.scores ?? [];
          waitsData = payload?.waits ?? [];
          stationOrderOverrides = normalizeStationOrderOverrides(payload?.station_order ?? null);
        } else {
          const [stationsRes, scoresRes, waitsRes] = await Promise.all([
            supabase
              .from('stations')
              .select('id, code, name')
              .eq('event_id', eventId),
            supabase
              .from('station_scores')
              .select('station_id, points, judge, note')
              .eq('event_id', eventId)
              .eq('patrol_id', patrolId),
            supabase
              .from('station_passages')
              .select('station_id, wait_minutes')
              .eq('event_id', eventId)
              .eq('patrol_id', patrolId),
          ]);

          setScoreReviewLoading(false);

          if (stationsRes.error || scoresRes.error || waitsRes.error) {
            reportSupabaseError('stations.review', stationsRes.error, stationsRes.status);
            reportSupabaseError('station_scores.review', scoresRes.error, scoresRes.status);
            reportSupabaseError('station_passages.review', waitsRes.error, waitsRes.status);
            console.error(
              'Failed to load station scores for review',
              stationsRes.error,
              scoresRes.error,
              waitsRes.error,
            );
            setScoreReviewRows([]);
            setScoreReviewState({});
            setScoreReviewError('Nepodařilo se načíst body ostatních stanovišť.');
            return;
          }

          stationsData = (stationsRes.data ?? []) as { id: string; code: string; name: string }[];
          scoresData = (scoresRes.data ?? []) as {
            station_id: string;
            points: number | null;
            judge: string | null;
            note: string | null;
          }[];
          waitsData = (waitsRes.data ?? []) as { station_id: string; wait_minutes: number | null }[];
        }

        const patrolStationCategory = toStationCategoryKey(patrolCategory, patrolSex);
        const hideTimeStation = stationCode === 'T';
        const categoryOrder = patrolStationCategory
          ? stationOrderOverrides?.categoryOrders[patrolStationCategory] ??
            CALC_SCORE_REVIEW_ORDER_BY_CATEGORY[patrolStationCategory]
          : null;
        const orderIndex = new Map<string, number>(
          (categoryOrder ?? []).map((code, index) => [code, index] as const),
        );
        const separatorBeforeCode = patrolStationCategory
          ? stationOrderOverrides?.separatorBeforeByCategory[patrolStationCategory] ??
            CALC_SCORE_REVIEW_SEPARATOR_BEFORE_BY_CATEGORY[patrolStationCategory] ??
            null
          : null;

        const stations = stationsData
          .map((station) => ({
          id: station.id,
          code: (station.code || '').trim().toUpperCase(),
          name: station.name,
        }))
          .filter((station) => {
            if (station.code === 'R') {
              return true;
            }
            if (station.code === 'T') {
              return !hideTimeStation;
            }
            if (!patrolStationCategory) {
              return true;
            }
            return getAllowedStationCategories(station.code).includes(patrolStationCategory);
          });

        const scoreMap = new Map<
          string,
          { points: number | null; judge: string | null; note: string | null }
        >();
        scoresData.forEach((row) => {
          scoreMap.set(row.station_id, {
            points: typeof row.points === 'number' ? row.points : row.points ?? null,
            judge: row.judge ?? null,
            note: row.note ?? null,
          });
        });

        const waitValues = new Map<string, number>();
        const waitPresent = new Set<string>();
        waitsData.forEach((row) => {
          const station = row.station_id;
          if (typeof station !== 'string' || station.length === 0) {
            return;
          }
          const wait = Number(row.wait_minutes ?? 0);
          if (!Number.isFinite(wait) || wait < 0) {
            waitValues.set(station, 0);
          } else {
            waitValues.set(station, wait);
          }
          waitPresent.add(station);
        });

        const rows = stations
          .map<StationScoreRow>((station) => {
            const existing = scoreMap.get(station.id);
            const waitValue = waitValues.get(station.id);
            return {
              stationId: station.id,
              stationCode: station.code,
              stationName: station.name,
              points: existing?.points ?? null,
              waitMinutes: waitValue ?? null,
              judge: existing?.judge ?? null,
              note: existing?.note ?? null,
              hasScore: typeof existing?.points === 'number',
              hasWait: waitPresent.has(station.id),
            };
          })
          .sort((a, b) => {
            const aIndex = orderIndex.get(a.stationCode);
            const bIndex = orderIndex.get(b.stationCode);
            if (aIndex !== undefined || bIndex !== undefined) {
              if (aIndex === undefined) return 1;
              if (bIndex === undefined) return -1;
              if (aIndex !== bIndex) {
                return aIndex - bIndex;
              }
            }
            return a.stationCode.localeCompare(b.stationCode, 'cs');
          })
          .map((row, index) => ({
            ...row,
            separatorBefore: Boolean(separatorBeforeCode) && index > 0 && row.stationCode === separatorBeforeCode,
          }));

        setScoreReviewRows(rows);
        setScoreReviewState((prev) => {
          const next: Record<string, StationScoreRowState> = {};
          rows.forEach((row) => {
            const previous = prev[row.stationId];
            const defaultPointsDraft = row.points !== null ? String(row.points) : '';
            const defaultWaitDraft = formatWaitDraft(row.waitMinutes);
            next[row.stationId] = {
              ok: previous?.ok ?? true,
              pointsDraft: previous
                ? previous.ok
                  ? defaultPointsDraft
                  : previous.pointsDraft
                : defaultPointsDraft,
              waitDraft: previous
                ? previous.ok
                  ? defaultWaitDraft
                  : previous.waitDraft
                : defaultWaitDraft,
              saving: false,
              error: null,
            };
          });
          return next;
        });
      } catch (error) {
        setScoreReviewLoading(false);
        setScoreReviewRows([]);
        setScoreReviewState({});
        setScoreReviewError('Nepodařilo se načíst body ostatních stanovišť.');
        console.error('Failed to load station score review', error);
      }
    },
    [eventId, canReviewStationScores, reportSupabaseError],
  );

  const initializeFormForPatrol = useCallback(
    (
      data: Patrol,
      options?: {
        arrivedAt?: string | null;
        waitSeconds?: number | null;
        draft?: PatrolFormDraft | null;
        prefilledAnswers?: string | null;
        calcLoadMode?: CalcPatrolLoadMode;
      },
    ) => {
      const draft = options?.draft ?? null;
      const hasPrefilledAnswers = typeof options?.prefilledAnswers === 'string';
      const nextCalcLoadMode = isTargetStation ? options?.calcLoadMode ?? 'full' : 'full';
      const shouldLoadScoringContext = !isTargetStation || nextCalcLoadMode === 'full';
      const initialTeamName = data.team_name ?? '';
      const initialMembers = typeof data.patrol_members === 'string' ? data.patrol_members : '';
      const parsedProfile = parsePatrolProfileDraft(initialTeamName, initialMembers);
      setActivePatrol({ ...data });
      setScannerPatrol({ ...data });
      setCalcPatrolLoadMode(nextCalcLoadMode);
      setCalcTeamNameDraft(initialTeamName);
      setCalcPatrolMembersDraft(initialMembers);
      setCalcSelectedTroops(parsedProfile.troops);
      setCalcMemberRows(parsedProfile.rows);
      setCalcCategoryDraft(data.category ?? '');
      setCalcSexDraft(data.sex ?? '');
      setCalcCustomTroopDraft('');
      setCalcTroopSelectDraft(parsedProfile.troops[0] ?? '');
      setPatrolProfileMessage(null);
      setPatrolProfileError(null);
      setPoints(draft?.points ?? '');
      setNote(draft?.note ?? '');
      const initialAnswers = hasPrefilledAnswers ? options?.prefilledAnswers ?? '' : draft?.answersInput ?? '';
      setAnswersInput(
        normalizeAnswersInput(initialAnswers, {
          maxOptionCount: targetAnswerOptionCount,
          allowBlank: true,
        }),
      );
      setAnswersError('');
      setScanActive(false);
      setManualCodeDraft('');
      setConfirmedManualCode('');
      setUseTargetScoring(draft?.useTargetScoring ?? isTargetStation);

      const arrival = draft?.arrivedAt ?? options?.arrivedAt ?? new Date().toISOString();
      setArrivedAt(arrival);
      setStartTime(draft?.startTime ?? null);
      setFinishAt(draft?.finishAt ?? null);
      setStartTimeInput('');
      setFinishTimeInput('');
      setTotalWaitMinutes(null);

      const waitMinutes = !isTargetStation && typeof options?.waitSeconds === 'number'
        ? waitSecondsToMinutes(options.waitSeconds)
        : 0;
      setWaitDraft(draft?.waitDraft ? normalizeWaitInput(draft.waitDraft, WAIT_TIME_ZERO) : formatWaitMinutes(waitMinutes));

      const stored = categoryAnswers[data.category] || '';
      const total = parseAnswerLetters(stored, { maxOptionCount: targetAnswerOptionCount }).length;
      setAutoScore({ correct: 0, total, given: 0, normalizedGiven: '' });

      if (!draft && shouldLoadScoringContext) {
        void loadTimingData(data.id);
      }
      if (isTargetStation && !draft && !hasPrefilledAnswers && shouldLoadScoringContext) {
        void (async () => {
          const storedAnswers = await loadTargetAnswers(data.id);
          if (!storedAnswers) {
            return;
          }
          if (activePatrolIdRef.current !== data.id) {
            return;
          }
          setAnswersInput((current) => (current.trim().length > 0 ? current : storedAnswers));
        })();
      }
      if (canReviewStationScores && !draft && shouldLoadScoringContext) {
        void loadScoreReview(data.id, data.patrol_code, data.category, data.sex);
      } else if (!shouldLoadScoringContext) {
        setScoreReviewRows([]);
        setScoreReviewState({});
        setScoreReviewError(null);
        setScoreReviewLoading(false);
      }

      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          if (isTargetStation && nextCalcLoadMode === 'profile') {
            calcProfileRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
          }
          formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          if (isTargetStation) {
            answersInputRef.current?.focus();
          } else {
            pointsInputRef.current?.focus();
          }
        });
      }
    },
    [
      categoryAnswers,
      calcProfileRef,
      canReviewStationScores,
      formRef,
      isTargetStation,
      loadTargetAnswers,
      loadTimingData,
      loadScoreReview,
      targetAnswerOptionCount,
    ],
  );

  const handleOpenPatrol = useCallback(
    async (mode: CalcPatrolLoadMode = 'full') => {
      if (enableTicketQueue) {
        handleAddTicket('serving', { restoredWaitMinutes: pendingRecoveredWaitMinutes });
        return;
      }
      if (!scannerPatrol) {
        pushAlert('Nejprve načti hlídku.');
        return;
      }

      let patrolForForm = scannerPatrol;
      if (stationCode === 'T' && isOnline && !scannerPatrol.id.startsWith('manual-')) {
        const { data, error, status } = await supabase
          .from('patrols')
          .select('team_name, patrol_members, note')
          .eq('event_id', eventId)
          .eq('id', scannerPatrol.id)
          .maybeSingle();

        if (error) {
          reportSupabaseError('patrols.profile', error, status);
        } else if (data) {
          patrolForForm = {
            ...scannerPatrol,
            team_name: typeof data.team_name === 'string' && data.team_name.trim().length > 0
              ? data.team_name.trim()
              : scannerPatrol.team_name,
            patrol_members:
              typeof data.patrol_members === 'string'
                ? data.patrol_members
                : typeof data.note === 'string'
                  ? data.note
                  : null,
          };
        }
      }

      initializeFormForPatrol(patrolForForm, {
        waitSeconds: pendingRecoveredWaitMinutes && pendingRecoveredWaitMinutes > 0
          ? pendingRecoveredWaitMinutes * 60
          : 0,
        calcLoadMode: stationCode === 'T' ? mode : 'full',
      });
      if (stationCode === 'T' && scannerSource === 'summary') {
        setSelectedSummaryCategory(null);
      }
      if (stationCode === 'T' && mode === 'profile') {
        pushAlert(`Profil hlídky ${patrolForForm.team_name} je připraven k úpravě.`);
      } else {
        pushAlert(`Hlídka ${patrolForForm.team_name} je připravena k obsluze.`);
      }
      setShowPatrolChoice(false);
      setPendingRecoveredWaitMinutes(null);
    },
    [
      enableTicketQueue,
      handleAddTicket,
      initializeFormForPatrol,
      isOnline,
      eventId,
      reportSupabaseError,
      pendingRecoveredWaitMinutes,
      pushAlert,
      scannerPatrol,
      scannerSource,
      setSelectedSummaryCategory,
      stationCode,
    ],
  );

  const handleServePatrol = useCallback(() => {
    void handleOpenPatrol('full');
  }, [handleOpenPatrol]);

  const handleOpenPatrolProfileOnly = useCallback(() => {
    void handleOpenPatrol('profile');
  }, [handleOpenPatrol]);

  const handleSavePatrolProfile = useCallback(async () => {
    if (!isTargetStation || !activePatrol) {
      return;
    }
    if (!AUTH_API_BASE_URL) {
      setPatrolProfileError('Chybí konfigurace API (VITE_AUTH_API_URL).');
      setPatrolProfileMessage(null);
      return;
    }

    const sessionResult = requireAccessToken(auth.tokens.accessToken);
    if (!sessionResult.accessToken) {
      setPatrolProfileError('Chybí přístupový token. Přihlas se znovu.');
      setPatrolProfileMessage(null);
      return;
    }

    const profileValidationError = validatePatrolProfileDraft(
      calcProfileDraft.troops,
      calcProfileDraft.rows,
    );
    if (profileValidationError) {
      setPatrolProfileError(profileValidationError);
      setPatrolProfileMessage(null);
      return;
    }

    const nextTeamName = calcProfileDraft.teamName;
    const nextMembers = calcProfileDraft.membersText;
    const inputPatrolCode = normalisePatrolCode(activePatrol.input_patrol_code ?? '');
    const categoryChanged = Boolean(calcCategoryDraft) && calcCategoryDraft !== activePatrol.category;
    const sexChanged = Boolean(calcSexDraft) && calcSexDraft !== activePatrol.sex;
    const shouldCleanupSharedNumber = hasExplicitSexPatrolCode(inputPatrolCode) && !categoryChanged && !sexChanged;

    setSavingPatrolProfile(true);
    setPatrolProfileError(null);
    setPatrolProfileMessage(null);
    try {
      const response = await fetch(`${AUTH_API_BASE_URL}/admin/event-state?setup=1`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionResult.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'upsert_patrol_profile',
          event_id: eventId,
          patrol_id: activePatrol.id,
          team_name: nextTeamName,
          patrol_members: nextMembers,
          category: categoryChanged ? calcCategoryDraft : undefined,
          sex: sexChanged ? calcSexDraft : undefined,
          patrol_code_input: inputPatrolCode,
          cleanup_shared_number: shouldCleanupSharedNumber,
        }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error || 'Uložení profilu hlídky se nepodařilo.');
      }

      const updatedPatrol = body?.patrol as {
        team_name?: string | null;
        patrol_members?: string | null;
        category?: string | null;
        sex?: string | null;
        patrol_code?: string | null;
      } | undefined;
      const updatedCategory = typeof updatedPatrol?.category === 'string' ? updatedPatrol.category : activePatrol.category;
      const updatedSex = typeof updatedPatrol?.sex === 'string' ? updatedPatrol.sex : activePatrol.sex;
      const updatedCode = typeof updatedPatrol?.patrol_code === 'string' ? updatedPatrol.patrol_code : activePatrol.patrol_code;
      const updatedTeamName = typeof updatedPatrol?.team_name === 'string' && updatedPatrol.team_name.trim().length > 0
        ? updatedPatrol.team_name.trim()
        : nextTeamName;
      const updatedMembers = typeof updatedPatrol?.patrol_members === 'string'
        ? updatedPatrol.patrol_members
        : nextMembers;
      const removedSharedPatrolId = typeof body?.removed_shared_patrol_id === 'string'
        ? body.removed_shared_patrol_id
        : null;

      setActivePatrol((current) =>
        current && current.id === activePatrol.id
          ? {
              ...current,
              team_name: updatedTeamName,
              patrol_members: updatedMembers,
              category: updatedCategory,
              sex: updatedSex,
              patrol_code: updatedCode,
            }
          : current,
      );
      setScannerPatrol((current) =>
        current && current.id === activePatrol.id
          ? {
              ...current,
              team_name: updatedTeamName,
              patrol_members: updatedMembers,
              category: updatedCategory,
              sex: updatedSex,
              patrol_code: updatedCode,
            }
          : current,
      );
      const parsed = parsePatrolProfileDraft(updatedTeamName, updatedMembers ?? '');
      setCalcSelectedTroops(parsed.troops);
      setCalcMemberRows(parsed.rows);
      setCalcCategoryDraft(updatedCategory);
      setCalcSexDraft(updatedSex);
      setCalcCustomTroopDraft('');
      setCalcTroopSelectDraft(parsed.troops[0] ?? '');
      setPatrolProfileMessage(
        removedSharedPatrolId
          ? 'Profil hlídky byl uložen. Protějšek se stejným číslem byl odstraněn.'
          : 'Profil hlídky byl uložen.',
      );
    } catch (error) {
      console.error('Failed to save patrol profile', error);
      setPatrolProfileError(
        error instanceof Error && error.message ? error.message : 'Uložení profilu hlídky se nepodařilo.',
      );
    } finally {
      setSavingPatrolProfile(false);
    }
  }, [
    activePatrol,
    auth.tokens.accessToken,
    calcCategoryDraft,
    calcSexDraft,
    calcProfileDraft.membersText,
    calcProfileDraft.rows,
    calcProfileDraft.teamName,
    calcProfileDraft.troops,
    eventId,
    isTargetStation,
  ]);

  const clearPatrolProfileFeedback = useCallback(() => {
    setPatrolProfileMessage(null);
    setPatrolProfileError(null);
  }, []);

  const appendTroopToProfile = useCallback(
    (rawTroop: string) => {
      const troop = normalizeTroopName(rawTroop);
      if (!troop) {
        return;
      }
      setCalcSelectedTroops((previous) => buildUniqueTroopList([...previous, troop]));
      clearPatrolProfileFeedback();
    },
    [clearPatrolProfileFeedback],
  );

  const handleAddSelectedTroop = useCallback(() => {
    appendTroopToProfile(calcTroopSelectDraft);
  }, [appendTroopToProfile, calcTroopSelectDraft]);

  const handleAddCustomTroop = useCallback(() => {
    const nextTroop = normalizeTroopName(calcCustomTroopDraft);
    if (!nextTroop) {
      return;
    }
    appendTroopToProfile(nextTroop);
    setCalcCustomTroopDraft('');
    setCalcTroopSelectDraft(nextTroop);
  }, [appendTroopToProfile, calcCustomTroopDraft]);

  const handleRemoveTroop = useCallback(
    (troopToRemove: string) => {
      const normalized = normalizeTroopName(troopToRemove);
      if (!normalized) {
        return;
      }
      setCalcSelectedTroops((previous) => {
        const next = previous.filter(
          (troop) => troop.toLocaleLowerCase('cs') !== normalized.toLocaleLowerCase('cs'),
        );
        return buildUniqueTroopList(next);
      });
      setCalcMemberRows((previous) =>
        previous.map((row) => {
          const currentTroop = normalizeTroopName(row.troop);
          if (!currentTroop) {
            return row;
          }
          if (currentTroop.toLocaleLowerCase('cs') !== normalized.toLocaleLowerCase('cs')) {
            return row;
          }
          return { ...row, troop: '' };
        }),
      );
      clearPatrolProfileFeedback();
    },
    [clearPatrolProfileFeedback],
  );

  const handleProfileRowChange = useCallback(
    (
      rowIndex: number,
      field: keyof PatrolProfileChildRow,
      value: string,
    ) => {
      setCalcMemberRows((previous) =>
        previous.map((row, index) =>
          index === rowIndex
            ? { ...row, [field]: value }
            : row,
        ),
      );
      clearPatrolProfileFeedback();
    },
    [clearPatrolProfileFeedback],
  );

  const handleScoreOkToggle = useCallback(
    (stationId: string, ok: boolean) => {
      setScoreReviewState((prev) => {
        const next = { ...prev };
        const base = scoreReviewRows.find((row) => row.stationId === stationId);
        const defaultPointsDraft = base && base.points !== null ? String(base.points) : '';
        const defaultWaitDraft = formatWaitDraft(base?.waitMinutes);
        const current = prev[stationId];
        next[stationId] = {
          ok,
          pointsDraft: ok ? defaultPointsDraft : current?.pointsDraft ?? defaultPointsDraft,
          waitDraft: ok ? defaultWaitDraft : current?.waitDraft ?? defaultWaitDraft,
          saving: false,
          error: null,
        };
        return next;
      });
    },
    [scoreReviewRows],
  );

  const handleScoreDraftChange = useCallback((stationId: string, value: string) => {
    setScoreReviewState((prev) => {
      const current =
        prev[stationId] ?? { ok: false, pointsDraft: '', waitDraft: WAIT_TIME_ZERO, saving: false, error: null };
      return {
        ...prev,
        [stationId]: {
          ...current,
          pointsDraft: value,
          error: null,
        },
      };
    });
  }, []);

  const handleWaitDraftChange = useCallback((stationId: string, value: string) => {
    setScoreReviewState((prev) => {
      const current =
        prev[stationId] ?? { ok: false, pointsDraft: '', waitDraft: WAIT_TIME_ZERO, saving: false, error: null };
      const nextWaitDraft = normalizeWaitInput(value, current.waitDraft);
      return {
        ...prev,
        [stationId]: {
          ...current,
          waitDraft: nextWaitDraft,
          error: null,
        },
      };
    });
  }, []);

  const handleRefreshScoreReview = useCallback(() => {
    if (activePatrol) {
      void loadScoreReview(
        activePatrol.id,
        activePatrol.patrol_code,
        activePatrol.category,
        activePatrol.sex,
      );
    }
  }, [loadScoreReview, activePatrol]);

  const handleOpenFullCalcForm = useCallback(() => {
    if (!isTargetStation || !activePatrol) {
      return;
    }
    setCalcPatrolLoadMode('full');
    void loadTimingData(activePatrol.id);
    void loadScoreReview(activePatrol.id, activePatrol.patrol_code, activePatrol.category, activePatrol.sex);
    if (!answersInput.trim()) {
      void (async () => {
        const storedAnswers = await loadTargetAnswers(activePatrol.id);
        if (!storedAnswers) {
          return;
        }
        if (activePatrolIdRef.current !== activePatrol.id) {
          return;
        }
        setAnswersInput((current) => (current.trim().length > 0 ? current : storedAnswers));
      })();
    }
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        answersInputRef.current?.focus();
      });
    }
  }, [activePatrol, answersInput, isTargetStation, loadScoreReview, loadTargetAnswers, loadTimingData]);

  const handleTicketStateChange = useCallback(
    (id: string, nextState: Ticket['state']) => {
      const existingTicket = tickets.find((ticket) => ticket.id === id);
      if (!existingTicket) {
        return;
      }

      if (
        nextState === 'done'
        && activePatrol
        && activePatrol.id !== existingTicket.patrolId
      ) {
        pushAlert('Nejdřív ulož nebo vymaž rozpracovaný formulář.');
        return;
      }

      const nextTicket = transitionTicket(existingTicket, nextState);

      updateTickets((current) =>
        current.map((ticket) => (ticket.id === id ? nextTicket : ticket)),
      );

      if (nextState !== 'done') {
        return;
      }

      const summary = patrolById.get(nextTicket.patrolId);
      const ticketPatrol: Patrol = summary
        ? {
          id: summary.id,
          team_name: summary.team_name,
          category: summary.category,
          sex: summary.sex,
          patrol_code: summary.patrol_code || nextTicket.patrolCode || null,
        }
        : {
          id: nextTicket.patrolId,
          team_name: nextTicket.teamName,
          category: nextTicket.category,
          sex: nextTicket.sex,
          patrol_code: nextTicket.patrolCode || null,
        };

      if (!ticketPatrol.team_name) {
        pushAlert('Hlídku se nepodařilo otevřít, není v manifestu.');
        return;
      }

      const waitSeconds = Math.max(0, Math.round(computeWaitTime(nextTicket) / 1000));
      const draft = patrolFormDrafts[nextTicket.patrolId] ?? null;
      initializeFormForPatrol(ticketPatrol, {
        arrivedAt: nextTicket.arrivedAt ?? nextTicket.createdAt,
        waitSeconds,
        draft,
      });
    },
    [activePatrol, initializeFormForPatrol, patrolById, patrolFormDrafts, pushAlert, tickets, updateTickets],
  );

  const handleRemoveTicket = useCallback(
    async (id: string) => {
      const ticket = tickets.find((candidate) => candidate.id === id);
      if (!ticket) {
        return false;
      }

      if (typeof window !== 'undefined') {
        const confirmed = window.confirm('Vážně chceš vrátit hlídku zpět na přehled?');
        if (!confirmed) {
          return false;
        }
      }

      if (stationCode !== 'T') {
        const waitSeconds = Math.max(0, Math.round(computeWaitTime(ticket) / 1000));
        const waitMinutes = waitSecondsToMinutes(waitSeconds);
        if (waitMinutes > 0) {
          await saveStoredPatrolWaitMinutes(eventId, stationId, ticket.patrolId, waitMinutes);
        }
      }

      updateTickets((current) =>
        current.map((candidate) => (candidate.id === id ? transitionTicket(candidate, 'done') : candidate)),
      );
      setPatrolFormDrafts((current) => {
        if (!Object.prototype.hasOwnProperty.call(current, ticket.patrolId)) {
          return current;
        }
        const next = { ...current };
        delete next[ticket.patrolId];
        return next;
      });
      return true;
    },
    [eventId, stationCode, stationId, tickets, updateTickets],
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (isChangePasswordPathname(window.location.pathname)) {
        setCurrentPathname(window.location.pathname);
        return;
      }
      const desiredPath = getStationPath(stationDisplayName);
      if (window.location.pathname !== desiredPath) {
        window.history.replaceState(window.history.state, '', desiredPath);
        setCurrentPathname(desiredPath);
      }
    }
  }, [stationDisplayName]);

  useEffect(() => {
    loadTickets(stationId).then((loaded) => {
      setTickets(loaded);
    });
  }, [stationId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  // The queue is shared between all judges of the station: push local changes, pull and merge the rest.
  const syncedTicketsRef = useRef<TicketSyncState>(new Map());
  const latestTicketsRef = useRef<Ticket[]>(tickets);
  latestTicketsRef.current = tickets;
  const latestAccessTokenRef = useRef<string | null>(auth.tokens.accessToken);
  latestAccessTokenRef.current = auth.tokens.accessToken;
  const ticketExchangeInFlightRef = useRef(false);
  const [ticketSyncStatus, setTicketSyncStatus] = useState<{ lastOkAt: number | null; error: string | null }>({ lastOkAt: null, error: null });
  const exchangeTickets = useCallback(async () => {
    if (!enableTicketQueue || !STATION_TICKETS_URL || ticketExchangeInFlightRef.current) {
      return;
    }
    const session = requireAccessToken(latestAccessTokenRef.current);
    if (!session.accessToken) {
      return;
    }
    ticketExchangeInFlightRef.current = true;
    try {
      const remote = await exchangeStationTickets({
        url: STATION_TICKETS_URL,
        accessToken: session.accessToken,
        tickets: latestTicketsRef.current,
        synced: syncedTicketsRef.current,
      });
      const merged = mergeTickets(latestTicketsRef.current, remote);
      merged.remoteTickets.forEach((ticket) => syncedTicketsRef.current.set(ticket.patrolId, ticketSyncKey(ticket)));
      if (merged.changed) {
        latestTicketsRef.current = merged.tickets;
        setTickets(merged.tickets);
        void saveTickets(stationId, merged.tickets);
      }
      setTicketSyncStatus({ lastOkAt: Date.now(), error: null });
    } catch (error) {
      console.warn('Ticket sync failed', error);
      setTicketSyncStatus((previous) => ({ ...previous, error: error instanceof Error ? error.message : 'chyba' }));
    } finally {
      ticketExchangeInFlightRef.current = false;
    }
  }, [enableTicketQueue, stationId]);
  useEffect(() => {
    syncedTicketsRef.current = new Map();
  }, [eventId, stationId]);
  useEffect(() => {
    void exchangeTickets();
  }, [exchangeTickets, tickets]);
  useEffect(() => {
    const interval = window.setInterval(() => void exchangeTickets(), 5000);
    const onFocus = () => void exchangeTickets();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [exchangeTickets]);

  useEffect(() => {
    setUseTargetScoring(isTargetStation);
  }, [isTargetStation]);

  const loadCategoryAnswers = useCallback(async () => {
    if (!stationId) {
      return;
    }
    const { data, error, status } = await supabase
      .from('station_category_answers')
      .select('category, correct_answers')
      .eq('event_id', eventId)
      .eq('station_id', stationId)
      .eq('option_count', targetAnswerOptionCount);

    if (error) {
      reportSupabaseError('station_category_answers.load', error, status);
      console.error(error);
      pushAlert('Nepodařilo se načíst správné odpovědi.');
      return;
    }

    const map: Record<string, string> = {};
    (data || []).forEach((row) => {
      map[row.category] = row.correct_answers;
    });
    setCategoryAnswers(map);
  }, [eventId, stationId, targetAnswerOptionCount, pushAlert, reportSupabaseError]);

  const loadStationPassages = useCallback(async () => {
    setStationPassageLoading(true);
    setStationPassageError(null);

    try {
      const [passagesRes, scoresRes] = await Promise.all([
        supabase
          .from('station_passages')
          .select('patrol_id')
          .eq('event_id', eventId)
          .eq('station_id', stationId),
        supabase
          .from('station_scores')
          .select('patrol_id')
          .eq('event_id', eventId)
          .eq('station_id', stationId),
      ]);

      if (passagesRes.error || scoresRes.error) {
        reportSupabaseError('station_passages.summary', passagesRes.error, passagesRes.status);
        reportSupabaseError('station_scores.summary', scoresRes.error, scoresRes.status);
        throw passagesRes.error || scoresRes.error;
      }

      const rows = (passagesRes.data ?? []) as { patrol_id: string | null }[];
      const scoreRows = (scoresRes.data ?? []) as { patrol_id: string | null }[];
      const ids = new Set<string>();
      rows.forEach((row) => {
        if (typeof row.patrol_id === 'string' && row.patrol_id.length > 0) {
          ids.add(row.patrol_id);
        }
      });
      scoreRows.forEach((row) => {
        if (typeof row.patrol_id === 'string' && row.patrol_id.length > 0) {
          ids.add(row.patrol_id);
        }
      });
      setStationPassageIds(Array.from(ids));
    } catch (error) {
      console.error('Failed to load station passages summary', error);
      setStationPassageError('Nepodařilo se načíst průchody hlídek.');
    } finally {
      setStationPassageLoading(false);
    }
  }, [eventId, reportSupabaseError, stationId]);

  const stationCategorySummary = useMemo<StationCategorySummary>(() => {
    const createEmptyEntry = () => ({
      expected: 0,
      visited: 0,
      missing: [] as StationSummaryPatrol[],
      completed: [] as StationSummaryPatrol[],
    });
    const record = new Map<SummaryCategoryKey, ReturnType<typeof createEmptyEntry>>();
    allowedSummaryCategories.forEach((key) => {
      record.set(key, createEmptyEntry());
    });
    let totalExpected = 0;
    let totalVisited = 0;
    const seen = new Set<string>();

    const resolveSummaryCategory = (
      category: string | null | undefined,
    ): SummaryCategoryKey | null => {
      const normalizedCategory = category?.trim().toUpperCase() ?? '';
      if (!isCategoryKey(normalizedCategory)) {
        return null;
      }
      if (!allowedCategorySet.has(normalizedCategory)) {
        return null;
      }
      return normalizedCategory;
    };

    auth.patrols.forEach((patrolSummary) => {
      if (!isCategoryAllowed(patrolSummary.category)) {
        return;
      }
      const summaryCategory = resolveSummaryCategory(patrolSummary.category);
      if (!summaryCategory) {
        return;
      }
      const normalizedCode = normalisePatrolCode(patrolSummary.patrol_code ?? '');
      seen.add(patrolSummary.id);
      if (normalizedCode) {
        seen.add(`code:${normalizedCode}`);
      }
      const teamName = (patrolSummary.team_name || '').trim();
      const detail: StationSummaryPatrol = {
        id: patrolSummary.id,
        code: normalizedCode,
        teamName,
        baseCategory: patrolSummary.category,
        sex: patrolSummary.sex,
        visited: stationPassageVisitedSet.has(patrolSummary.id),
      };

      const entry = record.get(summaryCategory);
      if (!entry) {
        return;
      }

      entry.expected += 1;
      totalExpected += 1;

      if (detail.visited) {
        entry.visited += 1;
        totalVisited += 1;
        entry.completed.push(detail);
      } else {
        entry.missing.push(detail);
      }
    });

    manualPatrols.forEach((manual) => {
      if (!isCategoryAllowed(manual.category)) {
        return;
      }
      const summaryCategory = resolveSummaryCategory(manual.category);
      if (!summaryCategory) {
        return;
      }
      const normalizedCode = normalisePatrolCode(manual.patrol_code ?? '');
      if (seen.has(manual.id) || (normalizedCode && seen.has(`code:${normalizedCode}`))) {
        return;
      }
      const visited = stationPassageVisitedSet.has(manual.id) || manual.id.startsWith('manual-');
      const detail: StationSummaryPatrol = {
        id: manual.id,
        code: normalizedCode || manual.patrol_code || manual.id,
        teamName: (manual.team_name || 'Ruční hlídka').trim(),
        baseCategory: manual.category,
        sex: manual.sex,
        visited,
      };
      const entry = record.get(summaryCategory);
      if (!entry) {
        return;
      }

      entry.expected += 1;
      totalExpected += 1;
      if (detail.visited) {
        entry.visited += 1;
        totalVisited += 1;
        entry.completed.push(detail);
      } else {
        entry.missing.push(detail);
      }
    });

    const items = allowedSummaryCategories.map<StationCategorySummaryItem>((category) => {
      const entry = record.get(category) ?? createEmptyEntry();
      const missing = [...entry.missing].sort(compareSummaryPatrols);
      const completed = [...entry.completed].sort(compareSummaryPatrols);
      return {
        key: category,
        expected: entry.expected,
        visited: entry.visited,
        missing,
        completed,
      };
    });

    const totalMissing = items.flatMap((item) => item.missing);

    return {
      items,
      totalExpected,
      totalVisited,
      totalMissing,
    };
  }, [
    allowedSummaryCategories,
    allowedCategorySet,
    auth.patrols,
    isCategoryAllowed,
    manualPatrols,
    stationPassageVisitedSet,
  ]);

  const selectedSummaryDetail = useMemo(() => {
    if (!selectedSummaryCategory) {
      return null;
    }
    return (
      stationCategorySummary.items.find((item) => item.key === selectedSummaryCategory) ?? null
    );
  }, [selectedSummaryCategory, stationCategorySummary]);

  useEffect(() => {
    if (!selectedSummaryCategory) {
      lastSummaryScrollRef.current = null;
      return;
    }
    if (lastSummaryScrollRef.current === selectedSummaryCategory) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    const target = summaryDetailRef.current;
    if (!target) {
      return;
    }
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    lastSummaryScrollRef.current = selectedSummaryCategory;
  }, [selectedSummaryCategory]);

  const handleSelectSummaryCategory = useCallback((category: SummaryCategoryKey) => {
    setSelectedSummaryCategory((previous) => (previous === category ? null : category));
  }, []);

  const formatSummaryPatrolDisplayLabel = useCallback(
    (patrol: StationSummaryPatrol) => formatSummaryPatrolLabel(patrol),
    [],
  );

  const handleSelectSummaryPatrol = useCallback(
    async (patrol: StationSummaryPatrol) => {
      if (scannerPatrol && scannerPatrol.id === patrol.id) {
        pushAlert('Hlídka už je načtená.');
        return;
      }
      if (activePatrol && activePatrol.id === patrol.id) {
        pushAlert('Hlídka už je právě obsluhovaná.');
        return;
      }
      if (patrol.visited && stationCode !== 'T') {
        pushAlert('Hlídka už na stanovišti byla.');
        return;
      }
      const data = auth.patrols.find((candidate) => candidate.id === patrol.id);
      if (!data) {
        pushAlert('Hlídka nenalezena.');
        return;
      }
      const storedWaitMinutes =
        !isTargetStation ? await loadStoredPatrolWaitMinutes(eventId, stationId, data.id) : null;
      let recoveredWaitMinutes: number | null = null;
      if (storedWaitMinutes && storedWaitMinutes > 0) {
        const shouldRecover = typeof window === 'undefined'
          ? false
          : window.confirm(
              `Hlídka ${data.team_name} už na tomto stanovišti čekala ${formatWaitMinutes(storedWaitMinutes)}. Chceš načíst toto čekání?`,
            );
        if (shouldRecover) {
          recoveredWaitMinutes = storedWaitMinutes;
        }
      }
      const summaryCode = normalisePatrolCode(patrol.code ? patrol.code.toUpperCase() : '');
      setPendingRecoveredWaitMinutes(recoveredWaitMinutes);
      setScannerPatrol({ ...data, input_patrol_code: summaryCode || null });
      setScannerSource('summary');
      setShowPatrolChoice(true);
      setScanActive(false);
      setManualCodeDraft('');
      setConfirmedManualCode(summaryCode);
      setSelectedSummaryCategory(null);
    },
    [
      activePatrol,
      auth.patrols,
      eventId,
      isTargetStation,
      pushAlert,
      scannerPatrol,
      stationId,
      setConfirmedManualCode,
      setManualCodeDraft,
      setPendingRecoveredWaitMinutes,
      setScanActive,
      setScannerPatrol,
      setScannerSource,
      setSelectedSummaryCategory,
      setShowPatrolChoice,
      stationCode,
    ],
  );

  const handleRefreshStationPassages = useCallback(() => {
    void (async () => {
      await loadStationPassages();
      try {
        await refreshManifest();
      } catch (error) {
        console.error('Manual manifest refresh failed', error);
      }
    })();
  }, [loadStationPassages, refreshManifest]);

  const stationSummaryRemaining = useMemo(
    () => Math.max(0, stationCategorySummary.totalExpected - stationCategorySummary.totalVisited),
    [stationCategorySummary.totalExpected, stationCategorySummary.totalVisited],
  );

  useEffect(() => {
    if (!isTargetStation) {
      setCategoryAnswers({});
      return;
    }
    loadCategoryAnswers();
  }, [isTargetStation, loadCategoryAnswers]);

  useEffect(() => {
    loadStationPassages();
  }, [loadStationPassages]);

  const flushOutbox = useCallback(async (options?: { force?: boolean }) => {
    if (flushInFlightRef.current) {
      return;
    }
    flushInFlightRef.current = true;
    const lockOwnerId = flushLockOwnerIdRef.current;
    let hasCrossTabLock = false;

    try {
      const now = Date.now();
      hasCrossTabLock = tryAcquireOutboxFlushLock(eventId, stationId, lockOwnerId, now);
      if (!hasCrossTabLock) {
        return;
      }

      let items = await readOutbox();
      items = await normalizeOutboxForSession(items);
      updateOutboxState(items);

      const released = releaseNetworkBackoff(items, {
        eventId,
        stationId,
        now,
        allowEventWideStation: canManageEventWideOutbox,
      });
      if (released.changed) {
        items = released.updated;
        await writeOutboxEntriesAndSync(items);
        updateOutboxState(items);
      }

      if (options?.force) {
        const forced = items.map((item) => {
          if (
            item.event_id === eventId &&
            (item.station_id === stationId || canManageEventWideOutbox) &&
            (item.state === 'queued' || item.state === 'failed') &&
            item.next_attempt_at > now
          ) {
            return { ...item, next_attempt_at: now };
          }
          return item;
        });
        if (forced.some((item, index) => item !== items[index])) {
          await writeOutboxEntriesAndSync(forced);
          items = forced;
          updateOutboxState(items);
        }
      }
      const ready = items.filter(
        (item) =>
          item.event_id === eventId &&
          (item.station_id === stationId || canManageEventWideOutbox) &&
          (item.state === 'queued' || item.state === 'failed') &&
          item.next_attempt_at <= now,
      );
      if (!ready.length) {
        return;
      }

      if (shouldRefreshAccessToken()) {
        const refreshed = await refreshAccessToken({ reason: 'outbox-preflight' });
        if (refreshed) {
          setAuthNeedsLogin(false);
          return;
        }
      } else if (!auth.tokens.accessToken) {
        const refreshed = await refreshAccessToken({ force: true, reason: 'missing-access' });
        if (refreshed) {
          setAuthNeedsLogin(false);
          return;
        }
      }

      const sessionResult = requireAccessToken(auth.tokens.accessToken);
      if (!sessionResult.accessToken) {
        if (sessionResult.shouldBlock) {
          const updated = items.map<OutboxEntry>((item) => {
            if (
              item.event_id !== eventId ||
              (!canManageEventWideOutbox && item.station_id !== stationId) ||
              item.state === 'sent' ||
              item.state === 'blocked_other_session' ||
              item.state === 'rejected_event_locked'
            ) {
              return item;
            }
            if (item.state === 'needs_auth') {
              return item;
            }
            return {
              ...item,
              state: 'needs_auth',
              last_error: sessionResult.error ?? NO_SESSION_ERROR,
              next_attempt_at: now,
            };
          });
          await writeOutboxEntriesAndSync(updated);
          updateOutboxState(updated);
          setAuthNeedsLogin(true);
          if (import.meta.env.DEV) {
            console.debug('[outbox] auth block', { error: sessionResult.error ?? NO_SESSION_ERROR });
          }
        }
        return;
      }

      const cleared = items.map<OutboxEntry>((item) => {
        if (
          item.event_id === eventId &&
          (item.station_id === stationId || canManageEventWideOutbox) &&
          item.state === 'needs_auth'
        ) {
          return { ...item, state: 'queued', last_error: undefined, next_attempt_at: now };
        }
        return item;
      });
      if (cleared.some((item, index) => item !== items[index])) {
        await writeOutboxEntriesAndSync(cleared);
        items = cleared;
        updateOutboxState(items);
        setAuthNeedsLogin(false);
      }

      const batchIds = new Set(ready.slice(0, OUTBOX_BATCH_SIZE).map((item) => item.client_event_id));
      const sendingItems = items.map<OutboxEntry>((item) =>
        batchIds.has(item.client_event_id) ? { ...item, state: 'sending' } : item,
      );
      await writeOutboxEntriesAndSync(sendingItems);
      updateOutboxState(sendingItems);
      setSyncing(true);

      try {
        const accessToken = sessionResult.accessToken;
        const endpoint = SUBMIT_STATION_RECORD_URL;

        if (import.meta.env.DEV) {
          console.debug('[outbox] submit batch', { endpoint, hasAccessToken: Boolean(accessToken) });
        }

        const { updated, sentIds } = await flushOutboxBatch({
          items,
          eventId,
          stationId,
          allowEventWideStation: canManageEventWideOutbox,
          accessToken,
          endpoint,
          fetchFn: fetch,
          now,
          batchSize: OUTBOX_BATCH_SIZE,
        });

        const needsAuth = updated.some((item) => item.state === 'needs_auth');
        let nextItems = updated;
        if (needsAuth) {
          setAuthNeedsLogin(true);
          if (isOnline) {
            const refreshed = await refreshAccessToken({ force: true, reason: 'outbox-401' });
            if (refreshed) {
              nextItems = updated.map((item) =>
                item.state === 'needs_auth'
                  ? { ...item, state: 'queued', last_error: undefined, next_attempt_at: now }
                  : item,
              );
              setAuthNeedsLogin(false);
            }
          }
        }

        const retained = nextItems.filter((item) => item.state !== 'sent');
        if (sentIds.length > 0) {
          await deleteOutboxEntries(sentIds);
        }
        await writeOutboxEntriesAndSync(retained);
        updateOutboxState(retained);

        if (sentIds.length > 0) {
          void loadStationPassages();
        }
      } finally {
        setSyncing(false);
      }
    } finally {
      if (hasCrossTabLock) {
        releaseOutboxFlushLock(eventId, stationId, lockOwnerId);
      }
      flushInFlightRef.current = false;
    }
  }, [
    auth.tokens.accessToken,
    canManageEventWideOutbox,
    eventId,
    loadStationPassages,
    normalizeOutboxForSession,
    pushAlert,
    refreshAccessToken,
    setAuthNeedsLogin,
    stationId,
    shouldRefreshAccessToken,
    updateOutboxState,
  ]);

  useEffect(() => {
    void flushOutbox();
    const onOnline = () => {
      const jitterMs = Math.floor(Math.random() * 301);
      if (reconnectRetryTimeoutRef.current !== null) {
        window.clearTimeout(reconnectRetryTimeoutRef.current);
      }
      reconnectRetryTimeoutRef.current = window.setTimeout(() => {
        reconnectRetryTimeoutRef.current = null;
        void flushOutbox();
      }, jitterMs);
    };
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      if (reconnectRetryTimeoutRef.current !== null) {
        window.clearTimeout(reconnectRetryTimeoutRef.current);
        reconnectRetryTimeoutRef.current = null;
      }
    };
  }, [flushOutbox]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void flushOutbox();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [flushOutbox]);

  useEffect(() => setupSyncListener(flushOutbox), [flushOutbox]);

  useEffect(() => {
    void flushOutbox();
  }, [flushOutbox, tick]);

  const resetForm = useCallback(() => {
    setActivePatrol(null);
    setCalcPatrolLoadMode('full');
    setScannerPatrol(null);
    setScannerSource(null);
    setPendingRecoveredWaitMinutes(null);
    setShowPatrolChoice(false);
    setPoints('');
    setNote('');
    setCalcTeamNameDraft('');
    setCalcPatrolMembersDraft('');
    setPatrolProfileMessage(null);
    setPatrolProfileError(null);
    setAnswersInput('');
    setAnswersError('');
    setAutoScore({ correct: 0, total: 0, given: 0, normalizedGiven: '' });
    setUseTargetScoring(isTargetStation);
    setScanActive(false);
    setManualCodeDraft('');
    setConfirmedManualCode('');
    setArrivedAt(null);
    setFinishAt(null);
    setStartTimeInput('');
    setFinishTimeInput('');
    setStartTime(null);
    setTotalWaitMinutes(null);
    setScoreReviewRows([]);
    setScoreReviewState({});
    setScoreReviewError(null);
    setScoreReviewLoading(false);
    clearWait();
    lastScanRef.current = null;
  }, [clearWait, isTargetStation]);

  const handleReturnToQueue = useCallback(async () => {
    if (!activePatrol) {
      resetForm();
      scrollToQueue();
      return;
    }

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('Vážně chceš vrátit hlídku zpět na přehled?');
      if (!confirmed) {
        return;
      }
    }

    setPatrolFormDrafts((current) => ({
      ...current,
      [activePatrol.id]: {
        points,
        note,
        answersInput,
        useTargetScoring,
        waitDraft,
        arrivedAt,
        startTime,
        finishAt,
      },
    }));

    const waitMinutes = parseWaitDraft(waitDraft);
    if (Number.isInteger(waitMinutes) && waitMinutes > 0 && stationCode !== 'T') {
      await saveStoredPatrolWaitMinutes(eventId, stationId, activePatrol.id, waitMinutes);
    }

    if (!enableTicketQueue) {
      resetForm();
      return;
    }

    const targetTicket = tickets.find((ticket) => ticket.patrolId === activePatrol.id);
    if (!targetTicket) {
      pushAlert('Hlídku se nepodařilo vrátit do obsluhy.');
      resetForm();
      scrollToQueue();
      return;
    }

    if (targetTicket.state === 'serving') {
      pushAlert('Hlídka už je v obsluze.');
      resetForm();
      scrollToQueue();
      return;
    }

    updateTickets((current) =>
      current.map((ticket) =>
        ticket.id === targetTicket.id ? transitionTicket(ticket, 'serving') : ticket,
      ),
    );
    pushAlert(`Hlídka ${activePatrol.team_name} byla vrácena do obsluhovaných.`);
    resetForm();
    scrollToQueue();
  }, [
    activePatrol,
    answersInput,
    arrivedAt,
    eventId,
    enableTicketQueue,
    finishAt,
    note,
    points,
    pushAlert,
    resetForm,
    scrollToQueue,
    startTime,
    stationCode,
    stationId,
    tickets,
    updateTickets,
    useTargetScoring,
    waitDraft,
  ]);

  const needsAuthCount = useMemo(
    () => currentSessionItems.filter((item) => item.state === 'needs_auth').length,
    [currentSessionItems],
  );
  const shouldShowAuthBanner = authNeedsLogin || needsAuthCount > 0;
  const authBannerMessage = useMemo(() => {
    if (!isOnline) {
      return 'Jste offline – přihlášení ověříme po návratu online.';
    }
    if (needsAuthCount > 0) {
      return `Pro odeslání fronty se přihlas (${needsAuthCount} čeká na přihlášení).`;
    }
    return 'Přihlášení vypršelo, obnov ho prosím pro synchronizaci.';
  }, [isOnline, needsAuthCount]);

  const handleLoginPrompt = useCallback(() => {
    if (!isOnline) {
      pushAlert('Jste offline, přihlášení ověříme po obnovení připojení.');
      return;
    }
    void (async () => {
      const refreshed = await refreshAccessToken({ force: true, reason: 'manual' });
      if (refreshed) {
        setAuthNeedsLogin(false);
        return;
      }
      pushAlert('Nepodařilo se obnovit přihlášení. Zkus to prosím znovu.');
    })();
  }, [isOnline, pushAlert, refreshAccessToken]);

  useEffect(() => {
    resetForm();
    setShowPendingDetails(false);
  }, [resetForm, stationId]);

  const handleStartTimeChange = useCallback(
    (value: string) => {
      setStartTimeInput(value);
      const combined = combineDateWithTime(startTime, value, { rolloverToNextDay: false });
      if (combined) {
        setStartTime(combined);
        if (finishTimeInput) {
          const recomputedFinish = combineDateWithTime(combined, finishTimeInput);
          setFinishAt(recomputedFinish);
        }
        return;
      }
      if (!value) {
        setStartTime(null);
        if (finishTimeInput) {
          setFinishAt(null);
        }
      }
    },
    [finishTimeInput, startTime],
  );

  const handleFinishTimeChange = useCallback(
    (value: string) => {
      setFinishTimeInput(value);
      const combined = combineDateWithTime(startTime, value);
      if (combined) {
        setFinishAt(combined);
      } else if (!value) {
        setFinishAt(null);
      }
    },
    [startTime],
  );

  const cachedPatrolMap = useMemo(() => {
    const map = new Map<string, Patrol[]>();
    auth.patrols.forEach((activePatrol) => {
      if (activePatrol.patrol_code) {
        if (!isCategoryAllowed(activePatrol.category)) {
          return;
        }
        const variants = getPatrolCodeVariants(activePatrol.patrol_code);
        variants.forEach((variant) => {
          const key = variant.trim().toUpperCase();
          const candidate: Patrol = {
            id: activePatrol.id,
            team_name: activePatrol.team_name,
            category: activePatrol.category,
            sex: activePatrol.sex,
            patrol_code: activePatrol.patrol_code,
          };
          const existing = map.get(key);
          if (!existing) {
            map.set(key, [candidate]);
            return;
          }
          if (!existing.some((row) => row.id === candidate.id)) {
            existing.push(candidate);
          }
        });
      }
    });
    return map;
  }, [auth.patrols, isCategoryAllowed]);

  const fetchPatrol = useCallback(
    async (patrolCode: string, options?: { allowFallback?: boolean }) => {
      const normalized = normalisePatrolCode(patrolCode);
      if (!normalized) {
        pushAlert('Neplatný kód hlídky.');
        return false;
      }
      const cachedCandidates = cachedPatrolMap.get(normalized) ?? [];
      let data = pickPatrolCandidate(cachedCandidates, normalized);
      let sharedNumberCandidateCount = isMergedPatrolCode(normalized)
        ? cachedCandidates.filter(
          (candidate) => formatMergedPatrolCode(candidate.patrol_code ?? '') === normalized,
        ).length
        : 0;
      let usedFallback = false;

      if (!data) {
        if (isOnline) {
          const variants = getPatrolCodeVariants(normalized);
          const { data: fetched, error, status } = await supabase
            .from('patrols')
            .select('id, team_name, category, sex, patrol_code, patrol_members, note')
            .eq('event_id', eventId)
            .in('patrol_code', variants.length ? variants : [normalized]);

          if (error || !fetched || fetched.length === 0) {
            if (error) {
              reportSupabaseError('patrols.fetch', error, status);
            }
            if (options?.allowFallback) {
              const fallback = createManualPatrolFromCode(normalized);
              if (fallback) {
                data = fallback;
                usedFallback = true;
              }
            } else {
              pushAlert('Hlídka nenalezena.');
              void appendScanRecord(eventId, stationId, {
                code: normalized,
                scannedAt: new Date().toISOString(),
                status: 'failed',
                reason: error ? 'fetch-error' : 'not-found',
              }).catch((err) => console.debug('scan history store failed', err));
              return false;
            }
          } else {
            const fetchedCandidates = fetched.map((selected) => ({
              id: selected.id,
              team_name: selected.team_name,
              category: selected.category,
              sex: selected.sex,
              patrol_code: selected.patrol_code,
              patrol_members:
                typeof selected.patrol_members === 'string'
                  ? selected.patrol_members
                  : typeof selected.note === 'string'
                    ? selected.note
                    : null,
            })) as Patrol[];
            data = pickPatrolCandidate(fetchedCandidates, normalized);
            if (isMergedPatrolCode(normalized)) {
              sharedNumberCandidateCount = fetchedCandidates.filter(
                (candidate) => formatMergedPatrolCode(candidate.patrol_code ?? '') === normalized,
              ).length;
            }
            if (!data) {
              pushAlert('Hlídka nenalezena.');
              void appendScanRecord(eventId, stationId, {
                code: normalized,
                scannedAt: new Date().toISOString(),
                status: 'failed',
                reason: 'not-found',
              }).catch((err) => console.debug('scan history store failed', err));
              return false;
            }
          }
        } else if (options?.allowFallback) {
          const fallback = createManualPatrolFromCode(normalized);
          if (fallback) {
            data = fallback;
            usedFallback = true;
          }
        } else {
          pushAlert('Offline režim: hlídku nelze načíst.');
          return false;
        }
      }

      if (!data) {
        pushAlert('Hlídka nenalezena.');
        return false;
      }

      const patrolForScanner: Patrol = { ...data, input_patrol_code: normalized };

      if (!isCategoryAllowed(data.category)) {
        pushAlert('Hlídka této kategorie na stanoviště nepatří.');
        void appendScanRecord(eventId, stationId, {
          code: normalized,
          scannedAt: new Date().toISOString(),
          status: 'failed',
          reason: 'category-not-allowed',
          patrolId: data.id,
          teamName: data.team_name,
        }).catch((err) => console.debug('scan history store failed', err));
        return false;
      }

      if (scannerPatrol && scannerPatrol.id === data.id) {
        pushAlert('Hlídka už je načtená.');
        return false;
      }

      if (activePatrol && activePatrol.id === data.id) {
        pushAlert('Hlídka už je právě obsluhovaná.');
        return false;
      }

      if (stationCode !== 'T' && stationPassageVisitedSet.has(data.id)) {
        pushAlert('Hlídka už na stanovišti byla.');
        void appendScanRecord(eventId, stationId, {
          code: normalized,
          scannedAt: new Date().toISOString(),
          status: 'failed',
          reason: 'already-visited',
          patrolId: data.id,
          teamName: data.team_name,
        }).catch((err) => console.debug('scan history store failed', err));
        return false;
      }

      const storedWaitMinutes =
        !isTargetStation ? await loadStoredPatrolWaitMinutes(eventId, stationId, data.id) : null;
      let recoveredWaitMinutes: number | null = null;
      if (storedWaitMinutes && storedWaitMinutes > 0) {
        const shouldRecover = typeof window === 'undefined'
          ? false
          : window.confirm(
              `Hlídka ${data.team_name} už na tomto stanovišti čekala ${formatWaitMinutes(storedWaitMinutes)}. Chceš načíst toto čekání?`,
            );
        if (shouldRecover) {
          recoveredWaitMinutes = storedWaitMinutes;
        }
      }

      setPendingRecoveredWaitMinutes(recoveredWaitMinutes);
      setScannerPatrol(patrolForScanner);
      setShowPatrolChoice(true);
      setScanActive(false);
      setManualCodeDraft('');
      setConfirmedManualCode(normalized);

      if (usedFallback) {
        pushAlert('Hlídka není v cache. Pokračuji s ručním záznamem.');
      } else if (sharedNumberCandidateCount > 1 && isMergedPatrolCode(normalized)) {
        pushAlert(`Sdílené číslo ${normalized}: body se zapíší oběma hlídkám (${sharedNumberCandidateCount}).`);
      }

      void appendScanRecord(eventId, stationId, {
        code: normalized,
        scannedAt: new Date().toISOString(),
        status: 'success',
        patrolId: patrolForScanner.id,
        teamName: patrolForScanner.team_name,
      }).catch((err) => console.debug('scan history store failed', err));

      return true;
    },
    [
      activePatrol,
      cachedPatrolMap,
      eventId,
      isCategoryAllowed,
      isOnline,
      isTargetStation,
      pushAlert,
      reportSupabaseError,
      scannerPatrol,
      stationCode,
      stationId,
      stationPassageVisitedSet,
      setConfirmedManualCode,
      setManualCodeDraft,
      setShowPatrolChoice,
    ]
  );

  const handleManualConfirm = useCallback(async () => {
    if (!manualValidation.valid) {
      return;
    }
    const trimmed = manualValidation.code.trim();
    if (!trimmed) {
      return;
    }
    const normalized = trimmed.toUpperCase();
    console.info('[patrol-code-input] confirm', {
      code: normalized,
      patrolId: manualValidation.patrolId,
    });
    const hapticType = normalized === confirmedManualCode ? 'light' : 'heavy';
    triggerHaptic(hapticType);
    setScannerSource('manual');
    void fetchPatrol(normalized, { allowFallback: true });
  }, [confirmedManualCode, fetchPatrol, manualValidation, setScannerSource]);

  const handleScanResult = useCallback(
    async (text: string) => {
      const match = text.match(/zelenaliga:\/\/p\/(.+)$/);
      if (!match) {
        pushAlert('Neplatný QR kód. Očekávám zelenaliga://p/<code>');
        void appendScanRecord(eventId, stationId, {
          code: text,
          scannedAt: new Date().toISOString(),
          status: 'failed',
          reason: 'invalid-schema',
        }).catch((err) => console.debug('scan history store failed', err));
        return;
      }
      const scannedCode = match[1].trim();
      const now = Date.now();
      const recent = lastScanRef.current;
      if (recent && recent.code === scannedCode && now - recent.at < 3_000) {
        return;
      }
      lastScanRef.current = { code: scannedCode, at: now };
      setScannerSource('scan');
      await fetchPatrol(scannedCode);
    },
    [eventId, fetchPatrol, pushAlert, setScannerSource, stationId]
  );

  useEffect(() => {
    if (!activePatrol) {
      return;
    }

    const stored = categoryAnswers[activePatrol.category] || '';
    const total = parseAnswerLetters(stored, { maxOptionCount: targetAnswerOptionCount }).length;
    setAutoScore((prev) => ({ ...prev, total }));
  }, [categoryAnswers, activePatrol, targetAnswerOptionCount]);

  useEffect(() => {
    if (!activePatrol || !useTargetScoring) {
      setAnswersError('');
      setAutoScore((prev) => ({ ...prev, correct: 0, given: 0, normalizedGiven: '' }));
      return;
    }

    const correctLetters = parseAnswerLetters(categoryAnswers[activePatrol.category] || '', {
      maxOptionCount: targetAnswerOptionCount,
    });
    const givenLetters = parseAnswerLetters(answersInput, {
      maxOptionCount: targetAnswerOptionCount,
      allowBlank: true,
    });
    const correct = correctLetters.reduce((acc, letter, index) => (letter === givenLetters[index] ? acc + 1 : acc), 0);
    const normalizedGiven = packAnswersForStorage(answersInput, {
      maxOptionCount: targetAnswerOptionCount,
      allowBlank: true,
    });
    const total = correctLetters.length;

    setAutoScore({ correct, total, given: givenLetters.length, normalizedGiven });

    if (!total) {
      setAnswersError('Pro tuto kategorii nejsou nastavené správné odpovědi.');
    } else if (givenLetters.length !== total) {
      setAnswersError(`Zadaných odpovědí: ${givenLetters.length} / ${total}.`);
    } else {
      setAnswersError('');
    }

    if (total > 0) {
      setPoints(String(correct));
    }
  }, [answersInput, useTargetScoring, activePatrol, categoryAnswers, targetAnswerOptionCount]);

  const handleLogout = useCallback(() => {
    void logout();
  }, [logout]);

  const handleSwitchEvent = useCallback(() => {
    setMenuOpen(false);
    void logout();
  }, [logout]);

  const handleOpenChangePassword = useCallback(() => {
    setMenuOpen(false);
    navigateToPath(CHANGE_PASSWORD_ROUTE);
  }, [navigateToPath]);

  const handleFullRefresh = useCallback(async () => {
    if (fullRefreshRunning) {
      return;
    }
    const confirmed = typeof window !== 'undefined' && window.confirm(
      'Smazat lokální cache aplikace na tomto zařízení a provést plný reload?\n\nPoužívej ráno před závodem po testování. Po reloadu bude potřeba se znovu přihlásit.',
    );
    if (!confirmed) {
      return;
    }

    setMenuOpen(false);
    setFullRefreshRunning(true);
    try {
      const localforage = getLocalforage();
      const outboxStore = getOutboxStore();
      await Promise.allSettled([
        localforage.clear(),
        outboxStore.clear(),
        clearBrowserRuntimeCaches(),
        unregisterAllServiceWorkers(),
      ]);

      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.clear();
        } catch (error) {
          console.warn('Failed to clear sessionStorage during full refresh', error);
        }
      }
    } catch (error) {
      console.error('Full refresh failed', error);
    } finally {
      setFullRefreshRunning(false);
    }

    if (typeof window !== 'undefined') {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('hard-refresh', String(Date.now()));
      window.location.replace(currentUrl.toString());
    }
  }, [fullRefreshRunning]);

  const handleTargetAnswersBeforeInput = useCallback((event: ReactFormEvent<HTMLInputElement>) => {
    const nativeEvent = event.nativeEvent as InputEvent;
    const insertedText = nativeEvent.data;

    if (typeof insertedText !== 'string' || insertedText.length === 0) {
      return;
    }

    const allowedPattern = targetAnswerOptionCount === 3 ? /^[A-CXa-cx]+$/ : /^[A-DXa-dx]+$/;
    if (!allowedPattern.test(insertedText)) {
      event.preventDefault();
    }
  }, [targetAnswerOptionCount]);

  const handleTargetAnswersPaste = useCallback((event: ReactClipboardEvent<HTMLInputElement>) => {
    const pastedText = event.clipboardData.getData('text');
    if (!pastedText) {
      return;
    }

    event.preventDefault();
    setAnswersInput((previous) =>
      normalizeAnswersInput(`${previous}${pastedText}`, {
        maxOptionCount: targetAnswerOptionCount,
        allowBlank: true,
      }),
    );
  }, [targetAnswerOptionCount]);

  const handleCloseChangePassword = useCallback(() => {
    navigateToPath(getStationPath(stationDisplayName), { replace: true });
  }, [navigateToPath, stationDisplayName]);

  const enqueueStationScore = useCallback(
    async (payload: Omit<StationScorePayload, 'client_event_id' | 'client_created_at'>) => {
      return enqueueStationScoreHelper(
        payload,
        {
          write: writeOutboxEntryAndSync,
          refresh: refreshOutbox,
          flush: () => void flushOutbox(),
          pushAlert,
          isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
        },
      );
    },
    [flushOutbox, pushAlert, refreshOutbox],
  );

  const handleSaveStationScore = useCallback(
    async (stationId: string) => {
      if (!activePatrol) {
        return;
      }
      if (stationClosed) {
        pushAlert('Stanoviště je uzavřené. Zapisování bodů není povoleno.');
        return;
      }

      const baseRow = scoreReviewRows.find((row) => row.stationId === stationId);
      const state = scoreReviewState[stationId];

      if (!baseRow || !state) {
        return;
      }

      if (baseRow.stationCode === 'R' || baseRow.stationCode === 'T') {
        return;
      }

      const trimmedPoints = state.pointsDraft.trim();
      const pointsValue = trimmedPoints === '' ? NaN : Number(trimmedPoints);
      const waitValue = parseWaitDraft(state.waitDraft);

      if (!Number.isInteger(pointsValue) || pointsValue < 0 || pointsValue > 12) {
        setScoreReviewState((prev) => {
          const previous = prev[stationId] ?? state;
          return {
            ...prev,
            [stationId]: {
              ...previous,
              ok: false,
              saving: false,
              error: 'Body musí být číslo 0–12.',
            },
          };
        });
        return;
      }

      if (!Number.isInteger(waitValue) || waitValue < 0 || waitValue > WAIT_MINUTES_MAX) {
        setScoreReviewState((prev) => {
          const previous = prev[stationId] ?? state;
          return {
            ...prev,
            [stationId]: {
              ...previous,
              ok: false,
              saving: false,
              error: `Čekání musí být čas v rozsahu 00:00–${WAIT_TIME_MAX}.`,
            },
          };
        });
        return;
      }

      setScoreReviewState((prev) => {
        const previous = prev[stationId] ?? state;
        return {
          ...prev,
          [stationId]: { ...previous, saving: true, error: null },
        };
      });

      const normalizedCalcTeamName = calcProfileDraft.teamName.trim();
      const effectiveTeamName = stationCode === 'T'
        ? normalizedCalcTeamName || activePatrol.team_name
        : activePatrol.team_name;
      const normalizedCalcMembers = stationCode === 'T'
        ? calcProfileDraft.membersText
        : null;

      try {
        const queued = await enqueueStationScore({
          event_id: eventId,
          station_id: stationId,
          patrol_id: activePatrol.id,
          category: activePatrol.category,
          arrived_at: new Date().toISOString(),
          wait_minutes: waitValue,
          points: pointsValue,
          note: baseRow.note ?? '',
          use_target_scoring: false,
          normalized_answers: null,
          start_time: null,
          finish_time: null,
          patrol_code: resolvePatrolCode(activePatrol),
          team_name: effectiveTeamName,
          patrol_members: stationCode === 'T' ? normalizedCalcMembers : undefined,
          sex: activePatrol.sex,
        });
        if (!queued) {
          throw new Error('queue-failed');
        }

        setScoreReviewRows((prev) =>
          prev.map((row) =>
            row.stationId === stationId
              ? {
                ...row,
                points: pointsValue,
                waitMinutes: waitValue,
                hasScore: true,
                hasWait: true,
              }
              : row,
          ),
        );
        pushAlert(`Záznam pro stanoviště ${baseRow.stationCode || stationId} aktualizován.`);
        await loadScoreReview(
          activePatrol.id,
          activePatrol.patrol_code,
          activePatrol.category,
          activePatrol.sex,
        );
        setScoreReviewState((prev) => {
          const current = prev[stationId];
          if (!current) {
            return prev;
          }
          return {
            ...prev,
            [stationId]: {
              ...current,
              ok: true,
              saving: false,
              error: null,
              pointsDraft: String(pointsValue),
              waitDraft: formatWaitDraft(waitValue),
            },
          };
        });
      } catch (error) {
        console.error('Failed to save station score', error);
        setScoreReviewState((prev) => {
          const previous = prev[stationId] ?? state;
          return {
            ...prev,
            [stationId]: {
              ...previous,
              saving: false,
              error: 'Uložení se nezdařilo. Zkus to znovu.',
            },
          };
        });
        pushAlert('Nepodařilo se uložit záznam pro vybrané stanoviště.');
      }
    },
    [
      activePatrol,
      calcProfileDraft.membersText,
      calcProfileDraft.teamName,
      enqueueStationScore,
      eventId,
      loadScoreReview,
      pushAlert,
      resolvePatrolCode,
      scoreReviewRows,
      scoreReviewState,
      stationClosed,
      stationCode,
    ],
  );

  const effectiveTotalWaitMinutes = useMemo(() => {
    if (stationCode !== 'T') {
      return totalWaitMinutes;
    }
    if (!scoreReviewRows.length) {
      return totalWaitMinutes;
    }

    let hasAnyWait = false;
    let total = 0;

    scoreReviewRows.forEach((row) => {
      if (row.stationCode === 'R' || row.stationCode === 'T') {
        return;
      }

      const reviewState = scoreReviewState[row.stationId];
      const draftWait = reviewState ? parseWaitDraft(reviewState.waitDraft) : Number.NaN;

      if (Number.isInteger(draftWait) && draftWait >= 0) {
        hasAnyWait = true;
        total += draftWait;
        return;
      }

      if (typeof row.waitMinutes === 'number' && Number.isFinite(row.waitMinutes) && row.waitMinutes >= 0) {
        hasAnyWait = true;
        total += Math.round(row.waitMinutes);
        return;
      }

      if (row.hasWait) {
        hasAnyWait = true;
      }
    });

    if (hasAnyWait) {
      return total;
    }

    return totalWaitMinutes;
  }, [scoreReviewRows, scoreReviewState, stationCode, totalWaitMinutes]);

  const handleSave = useCallback(async () => {
    if (scoringDisabled) {
      pushAlert('Závod byl ukončen. Zapisování bodů je uzamčeno.');
      return;
    }
    if (!activePatrol) return;
    if (!stationId) {
      pushAlert('Vyber stanoviště před uložením záznamu.');
      return;
    }

    if (stationCode === 'T' && (!finishTimeInput || !finishAt)) {
      pushAlert('Nejdřív vyplň čas doběhu.');
      return;
    }

    let scorePoints = 0;
    let normalizedAnswers: string | null = null;

    if (useTargetScoring) {
      if (!autoScore.total) {
        pushAlert('Pro tuto kategorii nejsou nastavené správné odpovědi.');
        return;
      }
      if (autoScore.given !== autoScore.total) {
        pushAlert(`Je potřeba zadat všech ${autoScore.total} odpovědí.`);
        return;
      }
      scorePoints = autoScore.correct;
      normalizedAnswers = autoScore.normalizedGiven;
    } else {
      const normalizedPoints = points.trim();
      const parsed = Number(normalizedPoints);
      if (
        !normalizedPoints ||
        Number.isNaN(parsed) ||
        !Number.isInteger(parsed) ||
        parsed < 0 ||
        parsed > 12
      ) {
        pushAlert('Body musí být celé číslo v rozsahu 0 až 12.');
        return;
      }
      scorePoints = parsed;
    }

    const manualWaitMinutes = parseWaitDraft(waitDraft);
    if (
      stationCode !== 'T' &&
      (!Number.isInteger(manualWaitMinutes) || manualWaitMinutes < 0 || manualWaitMinutes > WAIT_MINUTES_MAX)
    ) {
      pushAlert(`Čekání musí být čas v rozsahu 00:00–${WAIT_TIME_MAX}.`);
      return;
    }
    const waitMinutes = stationCode === 'T'
      ? (() => {
          const parsed = Number(effectiveTotalWaitMinutes ?? 0);
          return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
        })()
      : manualWaitMinutes;

    const normalizedCalcTeamName = calcProfileDraft.teamName.trim();
    const effectiveTeamName = stationCode === 'T'
      ? normalizedCalcTeamName
      : activePatrol.team_name;
    if (stationCode === 'T') {
      const profileValidationError = validatePatrolProfileDraft(
        calcProfileDraft.troops,
        calcProfileDraft.rows,
      );
      if (profileValidationError) {
        pushAlert(profileValidationError);
        return;
      }
    }
    const effectivePatrolMembers = stationCode === 'T'
      ? calcProfileDraft.membersText
      : null;

    const now = new Date().toISOString();
    const arrivalIso = arrivedAt || now;
    const effectivePatrolCode = resolvePatrolCode(activePatrol);

    const baseSubmissionData = {
      event_id: eventId,
      patrol_id: activePatrol.id,
      category: activePatrol.category,
      arrived_at: arrivalIso,
      patrol_code: effectivePatrolCode,
      team_name: effectiveTeamName,
      sex: activePatrol.sex,
      patrol_members: stationCode === 'T' ? effectivePatrolMembers : undefined,
    };

    if (stationCode === 'T') {
      const normalizedCategory = activePatrol.category.trim().toUpperCase();
      if (!isTimeScoringCategory(normalizedCategory)) {
        pushAlert('Body za čas nejdou spočítat pro tuto kategorii hlídky.');
        return;
      }
      if (!startTime || !finishAt) {
        pushAlert('Nelze spočítat body za čas bez startu a doběhu.');
        return;
      }

      const start = new Date(startTime);
      const finish = new Date(finishAt);
      if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime())) {
        pushAlert('Čas startu nebo doběhu má neplatný formát.');
        return;
      }

      const computedPureSeconds = computePureCourseSeconds({ start, finish, waitMinutes });
      const computedTimePoints = computeTimePoints(normalizedCategory, computedPureSeconds, timeScoringConfig);
      if (
        typeof computedTimePoints !== 'number'
        || !Number.isInteger(computedTimePoints)
        || computedTimePoints < -12
        || computedTimePoints > 12
      ) {
        pushAlert('Body za čas se nepodařilo spočítat. Zkontroluj vyplněné časy.');
        return;
      }
      const timePointsValue = computedTimePoints;

      const targetRow = scoreReviewRows.find((row) => row.stationCode === 'R');
      if (!targetRow) {
        pushAlert('V přehledu bodů chybí stanoviště R, záznam nejde dokončit.');
        return;
      }

      const queuedTime = await enqueueStationScore({
        ...baseSubmissionData,
        station_id: stationId,
        wait_minutes: waitMinutes,
        points: timePointsValue,
        note,
        use_target_scoring: false,
        normalized_answers: null,
        start_time: startTime,
        finish_time: finishAt,
      });
      if (!queuedTime) {
        return;
      }

      const queuedTarget = await enqueueStationScore({
        ...baseSubmissionData,
        station_id: targetRow.stationId,
        wait_minutes: 0,
        points: scorePoints,
        note: '',
        use_target_scoring: true,
        normalized_answers: normalizedAnswers,
        start_time: null,
        finish_time: null,
      });
      if (!queuedTarget) {
        pushAlert('Body terčového úseku se nepodařilo uložit. Zkus záznam uložit znovu.');
        return;
      }

      setScoreReviewRows((prev) =>
        prev.map((row) => {
          if (row.stationCode === 'T') {
            return {
              ...row,
              points: timePointsValue,
              waitMinutes,
              hasScore: true,
              hasWait: true,
            };
          }
          if (row.stationCode === 'R') {
            return {
              ...row,
              points: scorePoints,
              hasScore: true,
            };
          }
          return row;
        }),
      );
      setActivePatrol((current) =>
        current
          ? {
            ...current,
            team_name: effectiveTeamName,
            patrol_members: effectivePatrolMembers,
          }
          : current,
      );
      setScannerPatrol((current) =>
        current && current.id === activePatrol.id
          ? {
            ...current,
            team_name: effectiveTeamName,
            patrol_members: effectivePatrolMembers,
          }
          : current,
      );
      const parsed = parsePatrolProfileDraft(effectiveTeamName, effectivePatrolMembers ?? '');
      setCalcSelectedTroops(parsed.troops);
      setCalcMemberRows(parsed.rows);
      setCalcCustomTroopDraft('');
      setCalcTroopSelectDraft(parsed.troops[0] ?? '');
    } else {
      const queued = await enqueueStationScore({
        ...baseSubmissionData,
        station_id: stationId,
        wait_minutes: waitMinutes,
        points: scorePoints,
        note,
        use_target_scoring: useTargetScoring,
        normalized_answers: normalizedAnswers,
        start_time: null,
        finish_time: finishAt,
      });
      if (!queued) {
        return;
      }
    }

    void registerManualPatrol(activePatrol);
    if (enableTicketQueue) {
      updateTickets((current) =>
        current.map((ticket) =>
          ticket.patrolId === activePatrol.id ? { ...ticket, points: scorePoints } : ticket,
        ),
      );
    }
    setPatrolFormDrafts((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, activePatrol.id)) {
        return current;
      }
      const next = { ...current };
      delete next[activePatrol.id];
      return next;
    });
    setShowPendingDetails(false);
    resetForm();
    if (hasQueueTickets) {
      scrollToQueue();
    } else {
      scrollToSummary();
    }
  }, [
    autoScore,
    calcProfileDraft.membersText,
    calcProfileDraft.rows,
    calcProfileDraft.teamName,
    calcProfileDraft.troops,
    note,
    activePatrol,
    points,
    useTargetScoring,
    pushAlert,
    enqueueStationScore,
    resetForm,
    updateTickets,
    waitDraft,
    effectiveTotalWaitMinutes,
    arrivedAt,
    stationId,
    finishAt,
    startTime,
    registerManualPatrol,
    resolvePatrolCode,
    scoreReviewRows,
    scoringDisabled,
    stationCode,
    timeScoringConfig,
    scrollToQueue,
    scrollToSummary,
    enableTicketQueue,
    hasQueueTickets,
  ]);

  const handleRestoreTargetEdit = useCallback(
    (payload: RestoreTargetEditPayload) => {
      if (!isTargetStation) {
        return;
      }

      const patrol: Patrol = {
        id: payload.patrolId,
        team_name: payload.teamName,
        category: payload.category,
        sex: payload.sex,
        patrol_code: payload.patrolCode,
        input_patrol_code: normalisePatrolCode(payload.patrolCode ?? ''),
      };

      initializeFormForPatrol(patrol, {
        arrivedAt: payload.createdAt,
        prefilledAnswers: typeof payload.normalizedAnswers === 'string' ? payload.normalizedAnswers : undefined,
      });
      setUseTargetScoring(true);
      setAnswersError('');
      setNote(payload.note ?? '');
      setShowPendingDetails(false);
      pushAlert(`Hlídka ${payload.teamName} vrácena do formuláře.`);
    },
    [initializeFormForPatrol, isTargetStation, pushAlert],
  );

  const totalAnswers = useMemo(
    () =>
      activePatrol
        ? parseAnswerLetters(categoryAnswers[activePatrol.category] || '', {
            maxOptionCount: targetAnswerOptionCount,
          }).length
        : 0,
    [activePatrol, categoryAnswers, targetAnswerOptionCount],
  );
  const heroBadges = useMemo(() => {
    const badges = [`Event: ${manifest.event.name}`];
    if (enableTicketQueue) {
      const queueLabel = pendingCount ? `Offline fronta: ${pendingCount}` : 'Offline fronta prázdná';
      badges.push(queueLabel);
    }
    return badges;
  }, [enableTicketQueue, manifest.event.name, pendingCount]);

  const nextAttemptAtIso = useMemo(() => {
    const future = currentSessionItems
      .filter(
        (item) =>
          (item.state === 'queued' || item.state === 'failed') &&
          item.next_attempt_at > Date.now(),
      )
      .map((item) => item.next_attempt_at);
    if (!future.length) {
      return null;
    }
    const earliest = Math.min(...future);
    return new Date(earliest).toISOString();
  }, [currentSessionItems]);
  const handleOpenRules = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  useEffect(() => {
    if (!nextAttemptAtIso) {
      return undefined;
    }

    const targetTime = new Date(nextAttemptAtIso).getTime();
    if (!Number.isFinite(targetTime)) {
      return undefined;
    }

    const delay = Math.max(0, targetTime - Date.now());
    const timeout = window.setTimeout(() => {
      void flushOutbox();
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [nextAttemptAtIso, flushOutbox]);

  const timeOnCourse = useMemo(() => {
    if (!startTime || !finishAt) {
      return null;
    }
    const start = new Date(startTime);
    const finish = new Date(finishAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime())) {
      return null;
    }
    let ms = finish.getTime() - start.getTime();
    if (ms < 0) {
      ms += 24 * 60 * 60 * 1000;
    }
    return formatDurationMs(ms);
  }, [startTime, finishAt]);

  const pureCourseSeconds = useMemo(() => {
    if (!startTime || !finishAt) {
      return null;
    }
    const start = new Date(startTime);
    const finish = new Date(finishAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime())) {
      return null;
    }
    const waitMinutes = Number(effectiveTotalWaitMinutes ?? 0);
    return computePureCourseSeconds({ start, finish, waitMinutes });
  }, [effectiveTotalWaitMinutes, finishAt, startTime]);

  const pureCourseLabel = useMemo(() => {
    if (pureCourseSeconds === null) {
      return '—';
    }
    return formatDurationMs(pureCourseSeconds * 1000);
  }, [pureCourseSeconds]);

  const timePoints = useMemo(() => {
    if (!activePatrol) {
      return null;
    }
    const category = activePatrol.category?.trim().toUpperCase();
    if (!isTimeScoringCategory(category)) {
      return null;
    }
    return computeTimePoints(category, pureCourseSeconds, timeScoringConfig);
  }, [activePatrol, pureCourseSeconds, timeScoringConfig]);

  const targetAnswersReady = useMemo(
    () => autoScore.total > 0 && autoScore.given === autoScore.total,
    [autoScore],
  );

  const targetSectionPoints = useMemo(() => {
    if (!isTargetStation) {
      return null;
    }
    if (targetAnswersReady) {
      return autoScore.correct;
    }
    const persistedTargetRow = scoreReviewRows.find(
      (row) => row.stationCode === 'R' && typeof row.points === 'number',
    );
    return persistedTargetRow?.points ?? null;
  }, [autoScore.correct, isTargetStation, scoreReviewRows, targetAnswersReady]);

  const calcPointsSummary = useMemo(() => {
    if (stationCode !== 'T' || !scoreReviewRows.length) {
      return { total: null as number | null, withoutT: null as number | null };
    }

    const hasTimeStationRow = scoreReviewRows.some((row) => row.stationCode === 'T');

    let hasAny = false;
    let total = 0;
    let withoutT = 0;

    scoreReviewRows.forEach((row) => {
      let pointsValue: number | null = null;

      if (row.stationCode === 'R') {
        pointsValue = typeof targetSectionPoints === 'number' ? targetSectionPoints : row.points;
      } else if (row.stationCode === 'T') {
        pointsValue = typeof timePoints === 'number' ? timePoints : row.points;
      } else {
        const state = scoreReviewState[row.stationId];
        const draftPoints = state ? Number(state.pointsDraft.trim()) : Number.NaN;
        if (Number.isInteger(draftPoints) && draftPoints >= 0 && draftPoints <= 12) {
          pointsValue = draftPoints;
        } else if (typeof row.points === 'number' && Number.isFinite(row.points) && row.points >= 0) {
          pointsValue = row.points;
        }
      }

      if (typeof pointsValue !== 'number' || !Number.isFinite(pointsValue)) {
        return;
      }

      hasAny = true;
      total += pointsValue;
      if (row.stationCode !== 'T') {
        withoutT += pointsValue;
      }
    });

    if (!hasTimeStationRow && typeof timePoints === 'number' && Number.isFinite(timePoints)) {
      hasAny = true;
      total += timePoints;
    }

    if (!hasAny) {
      return { total: null as number | null, withoutT: null as number | null };
    }

    return {
      total,
      withoutT,
    };
  }, [scoreReviewRows, scoreReviewState, stationCode, targetSectionPoints, timePoints]);

  const controlChecks = useMemo(() => {
    const checks: { label: string; ok: boolean }[] = [];
    if (stationCode === 'T') {
      checks.push({ label: 'Čas doběhu vyplněn', ok: Boolean(finishAt && finishTimeInput) });
      checks.push({ label: 'Čas startu dostupný', ok: Boolean(startTime) });
      checks.push({ label: 'Čistý čas vypočítán', ok: pureCourseSeconds !== null });
      checks.push({ label: 'Odpovědi zadány', ok: targetAnswersReady });
    }
    return checks;
  }, [stationCode, finishAt, finishTimeInput, startTime, pureCourseSeconds, targetAnswersReady]);

  const isPatrolInQueue = useMemo(() => {
    if (!scannerPatrol) {
      return false;
    }
    return tickets.some((ticket) => ticket.patrolId === scannerPatrol.id && ticket.state !== 'done');
  }, [scannerPatrol, tickets]);

  if (isChangePasswordView) {
    return (
      <StationChangePasswordPage
        accessToken={auth.tokens.accessToken}
        onBack={handleCloseChangePassword}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-inner">
          <div className="hero-brand">
            <a
              className="hero-logo"
              href="https://zelenaliga.cz"
              target="_blank"
              rel="noreferrer"
              aria-label="Zelená liga"
            >
              <img src={zelenaLigaLogo} alt="Logo Setonův závod - aplikace" />
            </a>
            <div>
              <h1>Setonův závod - aplikace</h1>
            </div>
          </div>
          <div className="hero-meta">
            <div className="hero-menu-actions">
              <button
                type="button"
                className="hero-menu-button"
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-expanded={menuOpen}
                aria-controls="station-menu"
              >
                <span className="hero-menu-icon" aria-hidden="true" />
                {menuOpen ? 'Zavřít menu' : 'Otevřít menu'}
              </button>
              {isTargetStation ? (
                <a
                  className="hero-menu-link"
                  href={`${SCOREBOARD_ROUTE_PREFIX}?event=${encodeURIComponent(manifest.event.id)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Otevřít výsledky
                </a>
              ) : null}
            </div>
          </div>
          {displayAlerts.length ? (
            <div className="hero-alerts">
              {displayAlerts.map((msg, idx) => (
                <div key={idx} className="hero-alert">
                  {msg}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </header>
      {menuOpen ? (
        <StationMenu
setMenuOpen={setMenuOpen}
stationDisplayName={stationDisplayName}
stationCode={stationCode}
manifest={manifest}
allowedStationCategoryLabel={allowedStationCategoryLabel}
handleOpenRules={handleOpenRules}
isTargetStation={isTargetStation}
stationRules={stationRules}
handleOpenChangePassword={handleOpenChangePassword}
handleSwitchEvent={handleSwitchEvent}
handleFullRefresh={handleFullRefresh}
fullRefreshRunning={fullRefreshRunning}
handleLogout={handleLogout}
/>
      ) : null}
      {showPatrolChoice && scannerPatrol ? (
        <div className="patrol-choice-backdrop" role="dialog" aria-modal="true">
          <div className="patrol-choice-modal">
            <div className="patrol-choice-header">
              <h2>Hlídka načtena</h2>
              <button
                type="button"
                className="ghost patrol-choice-close"
                onClick={() => {
                  setPendingRecoveredWaitMinutes(null);
                  setShowPatrolChoice(false);
                }}
                aria-label="Zavřít dialog"
              >
                ✕
              </button>
            </div>
            <p className="patrol-choice-subtitle">Vyber další krok, aby hlídka nezapadla ve frontě.</p>
            <div className="patrol-choice-details">
              <strong>{scannerPatrol.team_name}</strong>
              {previewPatrolCode ? <span>Kód: {previewPatrolCode}</span> : null}
              <span>{formatPatrolMetaLabel(scannerPatrol)}</span>
            </div>
            <div className="patrol-choice-actions">
              <button
                type="button"
                className="primary"
                onClick={handleServePatrol}
              >
                Obsluhovat
              </button>
              {stationCode === 'T' ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={handleOpenPatrolProfileOnly}
                >
                  Jen profil
                </button>
              ) : null}
              {enableTicketQueue ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    handleAddTicket('waiting', { restoredWaitMinutes: pendingRecoveredWaitMinutes });
                    setShowPatrolChoice(false);
                  }}
                >
                  Čekat
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <main className="content">
        <>
          {accessDeniedMessage ? <p className="error-text">{accessDeniedMessage}</p> : null}
          <section ref={summaryRef} className="card station-summary-card">
            <header className="card-header">
              <div>
                <h2>Přehled průchodů</h2>
                <p className="card-subtitle">
                  Sleduj, kolik hlídek už stanoviště navštívilo podle kategorií. Hlídky lze
                  načítat také přes tlačítko „Zobrazit ruční načítání kódů“.
                </p>
              </div>
              <div className="card-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setShowScannerPanel((prev) => !prev)}
                  aria-expanded={showScannerPanel}
                  aria-controls="scanner-panel"
                >
                  {showScannerPanel ? 'Skrýt ruční načítání' : 'Zobrazit ruční načítání kódů'}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={handleRefreshStationPassages}
                  disabled={stationPassageLoading}
                >
                  {stationPassageLoading ? 'Načítám…' : 'Obnovit'}
                </button>
              </div>
            </header>
            {showScannerPanel ? (
              <section className="card scanner-card">
                <header className="card-header">
                  <div>
                    <h2>Načtení hlídek</h2>
                    <p className="card-subtitle">
                      {enableTicketQueue
                        ? 'Zadej kód hlídky ručně. Hlídku pak přidej do fronty nebo rovnou obsluhuj.'
                        : 'Zadej kód hlídky ručně a obsluhuj ji.'}
                    </p>
                  </div>
                </header>
                <div className="scanner-wrapper" id="scanner-panel">
                  {/*
                  <div className="scanner-controls">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setScanActive((prev) => !prev)}
                    >
                      {scanActive ? 'Vypnout skener' : 'Zapnout skener'}
                    </button>
                    <span className={`scanner-status ${scanActive ? 'active' : 'inactive'}`}>
                      {scanActive ? 'Skener je zapnutý' : 'Skener je vypnutý'}
                    </span>
                  </div>
                  <QRScanner active={scanActive} onResult={handleScanResult} onError={(err) => console.error(err)} />
                  */}
                <div className="manual-entry">
                  <PatrolCodeInput
                    value={manualCodeDraft}
                    onChange={setManualCodeDraft}
                    label="Ruční kód"
                    registry={patrolRegistryState}
                    onValidationChange={setManualValidation}
                    excludePatrolIds={stationPassageVisitedSet}
                    allowedCategories={allowedCategorySet}
                    validationMode="station-only"
                    action={(
                      <button
                        type="button"
                        className="primary"
                        onClick={() => {
                          void handleManualConfirm();
                        }}
                        disabled={!manualValidation.valid}
                      >
                        Načíst hlídku
                      </button>
                    )}
                  />
                </div>
                  {showScannerPreview ? (
                    <div className="scanner-preview">
                      <>
                        <strong>{scannerPatrol?.team_name ?? 'Hlídka'}</strong>
                        {previewPatrolCode ? (
                          <span
                            className="scanner-code"
                            aria-label={`Kód hlídky ${previewPatrolCode}`}
                            data-code={previewPatrolCode}
                          >
                            <span className="scanner-code__label" aria-hidden="true">
                              Kód
                            </span>
                          </span>
                        ) : null}
                        <span>{formatPatrolMetaLabel(scannerPatrol)}</span>
                      </>
                      <div className="scanner-actions">
                        <button
                          type="button"
                          className="primary"
                          onClick={handleServePatrol}
                          disabled={enableTicketQueue && isPatrolInQueue}
                        >
                          Obsluhovat
                        </button>
                        {stationCode === 'T' ? (
                          <button
                            type="button"
                            className="ghost"
                            onClick={handleOpenPatrolProfileOnly}
                            disabled={enableTicketQueue && isPatrolInQueue}
                          >
                            Jen profil
                          </button>
                        ) : null}
                        {enableTicketQueue ? (
                          <button
                            type="button"
                            className="ghost"
                            onClick={() =>
                              handleAddTicket('waiting', { restoredWaitMinutes: pendingRecoveredWaitMinutes })
                            }
                            disabled={isPatrolInQueue}
                          >
                            Čekat
                          </button>
                        ) : null}
                      </div>
                      {enableTicketQueue && isPatrolInQueue ? (
                        <span className="scanner-note" aria-hidden="true" />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
            {stationPassageError ? <p className="error-text">{stationPassageError}</p> : null}
            {stationCategorySummary.items.length ? (
              <>
                <div className="station-summary-grid">
                  {stationCategorySummary.items.map((item) => {
                    const missingCount = Math.max(0, item.expected - item.visited);
                    let statusLabel = 'Žádné hlídky';
                    if (item.expected > 0) {
                      statusLabel = missingCount === 0 ? 'Splněno' : `Chybí ${missingCount}`;
                    }
                    return (
                      <button
                        key={item.key}
                        type="button"
                        className="station-summary-chip"
                        data-missing={missingCount > 0 ? '1' : '0'}
                        data-empty={item.expected === 0 ? '1' : '0'}
                        data-active={selectedSummaryCategory === item.key ? '1' : '0'}
                        onClick={() => handleSelectSummaryCategory(item.key)}
                      >
                        <span className="station-summary-chip-label">
                          {item.key}
                        </span>
                        <span className="station-summary-chip-value">
                          {item.visited}/{item.expected}
                        </span>
                        <span className="station-summary-chip-status">{statusLabel}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="card-hint">
                  Celkem: {stationCategorySummary.totalVisited}/{stationCategorySummary.totalExpected} hlídek
                  {stationCategorySummary.totalExpected === 0
                    ? '.'
                    : stationSummaryRemaining > 0
                      ? `, chybí ${stationSummaryRemaining}.`
                      : ', vše splněno.'}
                </p>
              </>
            ) : (
              <p className="card-hint">Pro toto stanoviště nejsou žádné hlídky k zobrazení.</p>
            )}
            {selectedSummaryDetail ? (
              <StationSummaryDetail
summaryDetailRef={summaryDetailRef}
selectedSummaryDetail={selectedSummaryDetail}
setSelectedSummaryCategory={setSelectedSummaryCategory}
summaryMissingRef={summaryMissingRef}
formatSummaryPatrolDisplayLabel={formatSummaryPatrolDisplayLabel}
stationCode={stationCode}
handleSelectSummaryPatrol={handleSelectSummaryPatrol}
summaryCompletedRef={summaryCompletedRef}
setShowCompletedSummary={setShowCompletedSummary}
showCompletedSummary={showCompletedSummary}
/>
            ) : null}
          </section>
          {enableTicketQueue ? (
            <TicketQueue
              ref={ticketQueueRef}
              tickets={tickets}
              heartbeat={tick}
              syncStatus={ticketSyncStatus}
              onChangeState={handleTicketStateChange}
              onRemove={handleRemoveTicket}
              onBackToSummary={scrollToSummary}
            />
          ) : null}

          {stationCode === 'T' && activePatrol ? (
            <PatrolProfileCard
calcProfileRef={calcProfileRef}
isCalcProfileOnlyMode={isCalcProfileOnlyMode}
handleOpenFullCalcForm={handleOpenFullCalcForm}
handleSavePatrolProfile={handleSavePatrolProfile}
savingPatrolProfile={savingPatrolProfile}
calcTroopSelectDraft={calcTroopSelectDraft}
setCalcTroopSelectDraft={setCalcTroopSelectDraft}
clearPatrolProfileFeedback={clearPatrolProfileFeedback}
calcTroopOptions={calcTroopOptions}
handleAddSelectedTroop={handleAddSelectedTroop}
calcCustomTroopDraft={calcCustomTroopDraft}
setCalcCustomTroopDraft={setCalcCustomTroopDraft}
handleAddCustomTroop={handleAddCustomTroop}
calcSelectedTroops={calcSelectedTroops}
handleRemoveTroop={handleRemoveTroop}
calcMemberRows={calcMemberRows}
calcProfileDraft={calcProfileDraft}
calcCategoryDraft={calcCategoryDraft}
setCalcCategoryDraft={setCalcCategoryDraft}
calcSexDraft={calcSexDraft}
setCalcSexDraft={setCalcSexDraft}
handleProfileRowChange={handleProfileRowChange}
patrolProfileError={patrolProfileError}
patrolProfileMessage={patrolProfileMessage}
/>
          ) : null}

          <section ref={formRef} className="card form-card">
            <header className="card-header">
              <div>
                <h2>Stanovištní formulář</h2>
                <p className="card-subtitle">
                  {stationCode === 'T'
                    ? 'Nejprve vyplň terčový úsek, zkontroluj body stanovišť a nakonec zapiš čas doběhu.'
                    : useTargetScoring
                      ? 'Zadej odpovědi a potvrď uložení.'
                      : 'Vyplň body a potvrď uložení.'}
                </p>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={enableTicketQueue ? handleReturnToQueue : resetForm}
              >
                {enableTicketQueue ? 'Vrátit hlídku do fronty' : 'Vymazat'}
              </button>
            </header>
            {activePatrol ? (
              isCalcProfileOnlyMode ? (
                <div className="form-placeholder">
                  <p>Hlídka je načtená jen pro úpravu profilu (oddíl a členové).</p>
                  <button type="button" className="ghost" onClick={handleOpenFullCalcForm}>
                    Otevřít bodování
                  </button>
                </div>
              ) : (
              <div className={`form-grid${stationCode === 'T' ? ' form-grid--calc' : ''}`}>
                <div className="patrol-meta">
                  <strong>{activePatrol.team_name}</strong>
                  <span>{formatPatrolMetaLabel(activePatrol)}</span>
                </div>
                {stationCode !== 'T' ? (
                  <div className="wait-field">
                    <span className="wait-label">Čekání</span>
                    <div className="wait-display">
                      <input
                        type="time"
                        step={60}
                        min={WAIT_TIME_ZERO}
                        max={WAIT_TIME_MAX}
                        value={waitDraft}
                        onChange={(event) =>
                          setWaitDraft((current) => normalizeWaitInput(event.target.value, current))
                        }
                        placeholder="hh:mm"
                        required
                      />
                    </div>
                    <p className="wait-hint">Zadej čekání ručně ve formátu HH:MM (bez vteřin), např. 01:30.</p>
                  </div>
                ) : null}
                <label className="note-field">
                  Poznámka k bodům (volitelné)
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Např. upřesnění k hodnocení nebo důvod odchylky."
                  />
                </label>
                {stationCode === 'T' ? (
                  <div className="calc-grid">
                    <div className="calc-time-card">
                      <div className="calc-time-header">
                        <h3>Čas doběhu</h3>
                        <p className="card-hint">Zapiš čas doběhu na stanovišti. Přepočet vychází ze startovního času.</p>
                        <p className="card-hint">
                          12 bodů je za limitní čas dle kategorie, za každých započatých 10 minut navíc se odečte 1 bod.
                        </p>
                      </div>
                      <div className="calc-time-input">
                        <label htmlFor="start-time-input">Start (HH:MM)</label>
                        <input
                          id="start-time-input"
                          type="time"
                          value={startTimeInput}
                          onChange={(event) => handleStartTimeChange(event.target.value)}
                          step={60}
                          placeholder="hh:mm"
                        />
                      </div>
                      <div className="calc-time-input">
                        <label htmlFor="finish-time-input">Doběh (HH:MM)</label>
                        <input
                          id="finish-time-input"
                          type="time"
                          value={finishTimeInput}
                          onChange={(event) => handleFinishTimeChange(event.target.value)}
                          step={60}
                          placeholder="hh:mm"
                        />
                      </div>
                      <div className="calc-time-meta">
                        <div>
                          <span className="calc-meta-label">Start:</span>
                          <strong>{formatDateTimeLabel(startTime)}</strong>
                        </div>
                        <div>
                          <span className="calc-meta-label">Čas na trati:</span>
                          <strong>{timeOnCourse ?? '—'}</strong>
                        </div>
                        <div>
                          <span className="calc-meta-label">Čekání:</span>
                          <strong>
                            {effectiveTotalWaitMinutes !== null
                              ? formatWaitDuration(effectiveTotalWaitMinutes * 60)
                              : '—'}
                          </strong>
                        </div>
                        <div>
                          <span className="calc-meta-label">Čistý čas:</span>
                          <strong>{pureCourseLabel}</strong>
                        </div>
                        <div>
                          <span className="calc-meta-label">Body za čas:</span>
                          <strong>{timePoints ?? '—'}</strong>
                        </div>
                      </div>
                      <div className="calc-points-summary">
                        <h4>Přepis do karty hlídky</h4>
                        <div>
                          <span className="calc-meta-label">Body celkem:</span>
                          <strong>{calcPointsSummary.total ?? '—'}</strong>
                        </div>
                        <div>
                          <span className="calc-meta-label">Body bez T:</span>
                          <strong>{calcPointsSummary.withoutT ?? '—'}</strong>
                        </div>
                        <p className="card-hint">Rozhodčí přepíše hodnoty do karty hlídky.</p>
                      </div>
                      <button type="button" className="primary" onClick={handleSave} disabled={scoringDisabled}>
                        Uložit záznam
                      </button>
                    </div>
                    {controlChecks.length ? (
                      <div className="calc-checklist">
                        <h3>Kontrola vyplnění</h3>
                        <ul>
                          {controlChecks.map((item) => (
                            <li key={item.label} className={item.ok ? 'ok' : 'warn'}>
                              <span className="status-dot" aria-hidden />
                              {item.label}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {canReviewStationScores ? (
                  <ScoreReviewPanel
handleRefreshScoreReview={handleRefreshScoreReview}
scoreReviewLoading={scoreReviewLoading}
scoreReviewError={scoreReviewError}
scoreReviewRows={scoreReviewRows}
scoreReviewState={scoreReviewState}
stationCode={stationCode}
targetSectionPoints={targetSectionPoints}
timePoints={timePoints}
handleScoreDraftChange={handleScoreDraftChange}
handleWaitDraftChange={handleWaitDraftChange}
handleScoreOkToggle={handleScoreOkToggle}
handleSaveStationScore={handleSaveStationScore}
/>
                ) : null}
                {useTargetScoring ? (
                  <div className={`auto-section${stationCode === 'T' ? ' calc-auto' : ''}`}>
                    {stationCode === 'T' ? <h3>Odpovědi v terčovém úseku</h3> : null}
                    <p className="card-hint">Terčový úsek se hodnotí automaticky podle zadaných odpovědí.</p>
                    <label>
                      Odpovědi hlídky ({totalAnswers || '–'})
                      <input
                        ref={answersInputRef}
                        value={answersInput}
                        onChange={(event) =>
                          setAnswersInput(
                            normalizeAnswersInput(event.target.value, {
                              maxOptionCount: targetAnswerOptionCount,
                              allowBlank: true,
                            }),
                          )
                        }
                        onBeforeInput={handleTargetAnswersBeforeInput}
                        onPaste={handleTargetAnswersPaste}
                        placeholder={targetAnswerInputExample}
                        pattern={targetAnswerInputPattern}
                        autoCapitalize="characters"
                        maxLength={totalAnswers || undefined}
                      />
                    </label>
                    <p className="auto-score">Správně: {autoScore.correct} / {autoScore.total}</p>
                    {answersError ? <p className="error-text">{answersError}</p> : null}
                  </div>
                ) : (
                  <PointsInput
                    ref={pointsInputRef}
                    value={points}
                    onChange={setPoints}
                    label="Body (0 až 12)"
                    helperText="Zadej celé číslo v rozsahu 0 až 12 (např. 8)."
                  />
                )}
                {stationCode !== 'T' ? (
                  <button type="button" className="primary" onClick={handleSave} disabled={scoringDisabled}>
                    Uložit záznam
                  </button>
                ) : null}
                {scoringDisabled ? (
                  <p className="error-text">
                    {stationClosed
                      ? 'Stanoviště je uzavřené. Zapisování bodů je dočasně vypnuté.'
                      : 'Závod byl ukončen. Zapisování bodů je možné pouze na stanovišti T.'}
                  </p>
                ) : null}
              </div>
              )
            ) : (
              <p className="form-placeholder">Nejprve načti hlídku a otevři formulář.</p>
            )}
            {shouldShowAuthBanner ? (
              <div className="pending-auth-banner" role="status">
                <div className="pending-auth-text">{authBannerMessage}</div>
                {isOnline ? (
                  <button type="button" className="ghost" onClick={handleLoginPrompt}>
                    Přihlásit
                  </button>
                ) : null}
              </div>
            ) : null}
            {outboxItems.length > 0 ? (
              <PendingSyncPanel
pendingCount={pendingCount}
syncing={syncing}
otherSessionItems={otherSessionItems}
setShowPendingDetails={setShowPendingDetails}
showPendingDetails={showPendingDetails}
flushOutbox={flushOutbox}
outboxItems={outboxItems}
currentSessionItems={currentSessionItems}
stationCode={stationCode}
stationId={stationId}
targetAnswerOptionCount={targetAnswerOptionCount}
editingOutboxEntryId={editingOutboxEntryId}
savingOutboxEntryId={savingOutboxEntryId}
manifest={manifest}
beginOutboxEdit={beginOutboxEdit}
editingOutboxWait={editingOutboxWait}
setEditingOutboxWait={setEditingOutboxWait}
editingOutboxPoints={editingOutboxPoints}
setEditingOutboxPoints={setEditingOutboxPoints}
targetAnswerInputHint={targetAnswerInputHint}
editingOutboxAnswers={editingOutboxAnswers}
setEditingOutboxAnswers={setEditingOutboxAnswers}
handleTargetAnswersBeforeInput={handleTargetAnswersBeforeInput}
targetAnswerInputExample={targetAnswerInputExample}
targetAnswerInputPattern={targetAnswerInputPattern}
handleSaveOutboxEntry={handleSaveOutboxEntry}
cancelOutboxEdit={cancelOutboxEdit}
editingOutboxError={editingOutboxError}
handleClearOtherSessions={handleClearOtherSessions}
/>
            ) : null}
          </section>

          <LastScoresList
            eventId={eventId}
            stationId={stationId}
            isTargetStation={isTargetStation}
            onQueueScoreUpdate={enqueueStationScore}
            onRestoreTargetEdit={handleRestoreTargetEdit}
          />

        </>
      </main>
      <AppFooter />
    </div>
  );
}
