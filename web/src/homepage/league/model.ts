import { slugify } from '../shared/format';

export type LeagueEventEntry = {
  key: string;
  label: string;
  name: string;
  order?: number;
};

export const LEAGUE_EVENTS: LeagueEventEntry[] = [
  { key: 'pto-ob', label: 'PTOB', name: 'Orientační běh' },
  { key: 'ds', label: 'DS', name: 'Dračí smyčka' },
  { key: 'kp', label: 'KP', name: 'Kosmův prostor' },
  { key: 'zls', label: 'Seton', name: 'Setonův závod' },
];

export const LEAGUE_TOP_COUNT = 7;

export type LeagueEvent = string;

export type LeagueTroopEntry = {
  id: string;
  name: string;
  order?: number;
};

export type LeagueScoresRecord = Record<string, Partial<Record<LeagueEvent, number | null>>>;

export type LeagueScoreEntry = {
  season_id?: string | null;
  troop_id: string;
  event_key: string;
  points: number | string | null;
};

export type LeagueSeason = {
  id: string;
  name: string;
  isActive: boolean;
  startsOn?: string | null;
  endsOn?: string | null;
  troops: LeagueTroopEntry[];
  events: LeagueEventEntry[];
  scores: LeagueScoresRecord;
};

export type LeagueData = {
  seasons: LeagueSeason[];
  activeSeasonId: string;
};

export const LEAGUE_TROOPS: LeagueTroopEntry[] = [
  { id: '63-phoenix', name: '63. PTO Phoenix' },
  { id: '6-nibowaka', name: '6. PTO Nibowaka' },
  { id: '66-brabrouci', name: '66. PTO Brabrouci' },
  { id: 'zs-pcv', name: 'ZS PCV' },
  { id: '10-severka', name: '10. PTO Severka' },
  { id: '176-vlcata', name: '176. PTO Vlčata' },
  { id: '34-tulak', name: '34. PTO Tulák' },
  { id: '21-hady', name: '21. PTO Hády' },
  { id: '32-severka', name: '32. PTO Severka' },
  { id: '64-lorien', name: '64. PTO Lorien' },
  { id: '48-stezka', name: '48. PTO Stezka' },
  { id: '2-poutnici', name: '2. PTO Poutníci' },
  { id: '111-vinohrady', name: '111. PTO Vinohrady' },
  { id: '8-mustangove', name: '8. PTO Mustangové' },
  { id: '11-iktomi', name: '11. PTO Iktomi' },
  { id: '15-vatra', name: '15. PTO Vatra' },
  { id: '41-dracata', name: '41. PTO Dráčata' },
  { id: '61-tuhas', name: '61. PTO Tuhas' },
  { id: '99-kamzici', name: '99. PTO Kamzíci' },
  { id: '172-pegas', name: '172. PTO Pegas' },
  { id: 'zabky-jedovnice', name: 'PTO Žabky Jedovnice' },
];

export const DEFAULT_LEAGUE_SEASON_ID = '2025-2026';

export const DEFAULT_LEAGUE_SEASON_NAME = 'Ročník 2025/2026';

export const CURRENT_LEAGUE_SCORES: Record<string, Partial<Record<LeagueEvent, number>>> = {
  '63-phoenix': { 'pto-ob': 106 },
  '6-nibowaka': { 'pto-ob': 100 },
  '66-brabrouci': { 'pto-ob': 100 },
  'zs-pcv': { 'pto-ob': 100 },
  '10-severka': { 'pto-ob': 94 },
  '176-vlcata': { 'pto-ob': 94 },
  '34-tulak': { 'pto-ob': 94 },
  '21-hady': { 'pto-ob': 85 },
  '32-severka': { 'pto-ob': 79 },
  '64-lorien': { 'pto-ob': 71.5 },
  '48-stezka': { 'pto-ob': 29.5 },
  '2-poutnici': { 'pto-ob': 22 },
  '111-vinohrady': { 'pto-ob': 11.5 },
  '8-mustangove': { 'pto-ob': 0 },
  '11-iktomi': { 'pto-ob': 0 },
  '15-vatra': { 'pto-ob': 0 },
  '41-dracata': { 'pto-ob': 0 },
  '61-tuhas': { 'pto-ob': 0 },
  '99-kamzici': { 'pto-ob': 0 },
  '172-pegas': { 'pto-ob': 0 },
  'zabky-jedovnice': { 'pto-ob': 0 },
};

export const HISTORICAL_LEAGUE_EMBED_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTgnHQSwUJSNQF_cfCEwRshBNhh67JWuV_EQO5urCaWgxlvAXLxAc8F8Nrt4PVsrw/pubhtml?gid=252350504&single=true&widget=false&headers=false';

export const HISTORICAL_LEAGUE_VIEW_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTgnHQSwUJSNQF_cfCEwRshBNhh67JWuV_EQO5urCaWgxlvAXLxAc8F8Nrt4PVsrw/pubhtml?gid=252350504&single=true';

export function formatLeagueScore(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  return value.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export type LeagueRow = {
  key: string;
  name: string;
  scores: Array<number | null>;
  total: number | null;
  order: number;
};

export type LeagueRowWithRank = LeagueRow & { rank: number };

export function getLeagueTroopNameNumber(name: string): number | null {
  const match = name.match(/\d+/);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function compareLeagueRowsByTroopNumber(a: Pick<LeagueRow, 'name' | 'order'>, b: Pick<LeagueRow, 'name' | 'order'>) {
  const aNumber = getLeagueTroopNameNumber(a.name);
  const bNumber = getLeagueTroopNameNumber(b.name);
  if (aNumber !== null && bNumber !== null) {
    if (aNumber !== bNumber) {
      return aNumber - bNumber;
    }
    return a.name.localeCompare(b.name, 'cs', { sensitivity: 'base' });
  }
  if (aNumber !== null) {
    return -1;
  }
  if (bNumber !== null) {
    return 1;
  }
  return a.name.localeCompare(b.name, 'cs', { sensitivity: 'base' }) || a.order - b.order;
}

export function cloneLeagueScores(source: LeagueScoresRecord): LeagueScoresRecord {
  const next: LeagueScoresRecord = {};
  Object.entries(source).forEach(([troopId, scores]) => {
    next[troopId] = { ...(scores ?? {}) };
  });
  return next;
}

export function cloneLeagueTroops(troops: LeagueTroopEntry[] = LEAGUE_TROOPS): LeagueTroopEntry[] {
  return troops.map((troop, index) => ({
    id: troop.id,
    name: troop.name,
    order: troop.order ?? index,
  }));
}

export function cloneLeagueEvents(events: LeagueEventEntry[] = LEAGUE_EVENTS): LeagueEventEntry[] {
  return events.map((event, index) => ({
    key: event.key,
    label: event.label,
    name: event.name,
    order: event.order ?? index,
  }));
}

export function createDefaultLeagueSeason(): LeagueSeason {
  return {
    id: DEFAULT_LEAGUE_SEASON_ID,
    name: DEFAULT_LEAGUE_SEASON_NAME,
    isActive: true,
    startsOn: '2025-09-01',
    endsOn: '2026-06-30',
    troops: cloneLeagueTroops(),
    events: cloneLeagueEvents(),
    scores: cloneLeagueScores(CURRENT_LEAGUE_SCORES),
  };
}

export function createDefaultLeagueData(): LeagueData {
  const season = createDefaultLeagueSeason();
  return {
    seasons: [season],
    activeSeasonId: season.id,
  };
}

export function getActiveLeagueSeason(leagueData: LeagueData): LeagueSeason {
  return (
    leagueData.seasons.find((season) => season.id === leagueData.activeSeasonId) ??
    leagueData.seasons.find((season) => season.isActive) ??
    leagueData.seasons[0] ??
    createDefaultLeagueSeason()
  );
}

export function buildLeagueScoreRecord(
  entries: LeagueScoreEntry[] | null | undefined,
  fallback: LeagueScoresRecord,
  troops: LeagueTroopEntry[] = LEAGUE_TROOPS,
): LeagueScoresRecord {
  if (!entries || entries.length === 0) {
    return cloneLeagueScores(fallback);
  }
  const record: LeagueScoresRecord = {};
  troops.forEach((troop) => {
    record[troop.id] = {};
  });
  entries.forEach((entry) => {
    const troopId = entry?.troop_id;
    const eventKey = entry?.event_key;
    if (!troopId || !eventKey) {
      return;
    }
    const valueRaw = entry.points;
    let value: number | null = null;
    if (typeof valueRaw === 'number') {
      value = Number.isFinite(valueRaw) ? valueRaw : null;
    } else if (typeof valueRaw === 'string') {
      const parsed = Number(valueRaw.replace(',', '.'));
      value = Number.isFinite(parsed) ? parsed : null;
    } else if (valueRaw === null || valueRaw === undefined) {
      value = null;
    }
    if (!record[troopId]) {
      record[troopId] = {};
    }
    record[troopId][eventKey as LeagueEvent] = value;
  });
  return record;
}

export function normalizeLeagueEvents(rawEvents: unknown): LeagueEventEntry[] {
  if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
    return cloneLeagueEvents();
  }
  const seen = new Set<string>();
  const events = rawEvents
    .map((event: any, index: number): LeagueEventEntry | null => {
      const rawName = typeof event?.name === 'string' ? event.name.trim() : '';
      const rawLabel = typeof event?.label === 'string' ? event.label.trim() : '';
      const rawKey =
        typeof event?.key === 'string' && event.key.trim()
          ? event.key.trim()
          : typeof event?.event_key === 'string' && event.event_key.trim()
            ? event.event_key.trim()
            : '';
      const name = rawName || rawLabel || rawKey;
      const label = rawLabel || rawName || rawKey;
      const key = rawKey || slugify(name);
      if (!key || !name || seen.has(key)) {
        return null;
      }
      seen.add(key);
      const orderRaw = Number(event.order ?? event.order_index ?? index);
      return {
        key,
        label,
        name,
        order: Number.isFinite(orderRaw) ? orderRaw : index,
      };
    })
    .filter((event: LeagueEventEntry | null): event is LeagueEventEntry => Boolean(event))
    .sort((a: LeagueEventEntry, b: LeagueEventEntry) => (a.order ?? 0) - (b.order ?? 0));
  return events.length > 0 ? events : cloneLeagueEvents();
}

export function normalizeLeagueData(raw: any): LeagueData {
  const fallback = createDefaultLeagueData();
  const rawSeasons = Array.isArray(raw?.seasons) ? raw.seasons : [];
  if (rawSeasons.length === 0) {
    const entries = Array.isArray(raw?.scores) ? (raw.scores as LeagueScoreEntry[]) : [];
    return {
      seasons: [{
        ...fallback.seasons[0],
        scores: buildLeagueScoreRecord(entries, CURRENT_LEAGUE_SCORES),
      }],
      activeSeasonId: DEFAULT_LEAGUE_SEASON_ID,
    };
  }

  const seasons: LeagueSeason[] = rawSeasons
    .map((season: any, seasonIndex: number): LeagueSeason | null => {
      const id = typeof season?.id === 'string' && season.id.trim() ? season.id.trim() : '';
      const name = typeof season?.name === 'string' && season.name.trim() ? season.name.trim() : id;
      if (!id || !name) {
        return null;
      }
      const rawTroops = Array.isArray(season.troops) ? season.troops : [];
      const troops: LeagueTroopEntry[] = rawTroops.length > 0
        ? rawTroops
          .map((troop: any, troopIndex: number): LeagueTroopEntry | null => {
            const troopId = typeof troop?.id === 'string' && troop.id.trim()
              ? troop.id.trim()
              : typeof troop?.troop_id === 'string' && troop.troop_id.trim()
                ? troop.troop_id.trim()
                : '';
            const troopName = typeof troop?.name === 'string' && troop.name.trim()
              ? troop.name.trim()
              : typeof troop?.troop_name === 'string' && troop.troop_name.trim()
                ? troop.troop_name.trim()
                : '';
            if (!troopId || !troopName) {
              return null;
            }
            const orderRaw = Number(troop.order ?? troop.order_index ?? troopIndex);
            return {
              id: troopId,
              name: troopName,
              order: Number.isFinite(orderRaw) ? orderRaw : troopIndex,
            };
          })
          .filter((troop: LeagueTroopEntry | null): troop is LeagueTroopEntry => Boolean(troop))
          .sort((a: LeagueTroopEntry, b: LeagueTroopEntry) => (a.order ?? 0) - (b.order ?? 0))
        : cloneLeagueTroops();
      const fallbackScores = seasonIndex === 0 ? CURRENT_LEAGUE_SCORES : {};
      const scoreEntries = Array.isArray(season.scores) ? (season.scores as LeagueScoreEntry[]) : [];
      const events = normalizeLeagueEvents(season.events);
      return {
        id,
        name,
        isActive: season.isActive === true || season.is_active === true,
        startsOn: typeof season.startsOn === 'string' ? season.startsOn : season.starts_on ?? null,
        endsOn: typeof season.endsOn === 'string' ? season.endsOn : season.ends_on ?? null,
        troops,
        events,
        scores: buildLeagueScoreRecord(scoreEntries, fallbackScores, troops),
      };
    })
    .filter((season: LeagueSeason | null): season is LeagueSeason => Boolean(season));

  if (seasons.length === 0) {
    return fallback;
  }
  const activeSeasonId =
    typeof raw?.activeSeasonId === 'string' && seasons.some((season) => season.id === raw.activeSeasonId)
      ? raw.activeSeasonId
      : seasons.find((season) => season.isActive)?.id ?? seasons[0].id;
  return { seasons, activeSeasonId };
}

export function buildLeagueRows(
  scores: LeagueScoresRecord = CURRENT_LEAGUE_SCORES,
  troops: LeagueTroopEntry[] = LEAGUE_TROOPS,
  events: LeagueEventEntry[] = LEAGUE_EVENTS,
): LeagueRow[] {
  return troops.map((troop, index) => {
    const troopScores = scores[troop.id] ?? {};
    const scoreValues = events.map((event) => troopScores[event.key] ?? null);
    const hasScores = scoreValues.some((value) => value !== null);
    const total = hasScores ? scoreValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
    return {
      key: troop.id,
      name: troop.name,
      scores: scoreValues,
      total,
      order: troop.order ?? index,
    };
  }).sort((a, b) => {
    if (a.total === null && b.total === null) {
      return compareLeagueRowsByTroopNumber(a, b);
    }
    if (a.total === null) {
      return 1;
    }
    if (b.total === null) {
      return -1;
    }
    if (b.total !== a.total) {
      return b.total - a.total;
    }
    return a.order - b.order;
  });
}

export function addCompetitionRanks(rows: LeagueRow[]): LeagueRowWithRank[] {
  let lastTotal: number | null = null;
  let lastRank = 0;
  return rows.map((row, index) => {
    if (lastTotal !== null && row.total !== null && row.total === lastTotal) {
      return { ...row, rank: lastRank };
    }
    const rank = index + 1;
    lastRank = rank;
    lastTotal = row.total;
    return { ...row, rank };
  });
}
