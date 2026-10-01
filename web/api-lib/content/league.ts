import { logger } from '../logger.js';
import { resolveBody,slugify } from './articles/model.js';
import {
requireEditor
} from './editorAuth.js';
import { getSupabaseAdminClient } from './supabaseAdmin.js';

export type LeagueScoreRow = {
  season_id?: string | null;
  troop_id: string;
  event_key: string;
  points: number | null;
};

export type LeagueSeasonRow = {
  id: string;
  name: string;
  is_active: boolean;
  starts_on?: string | null;
  ends_on?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type LeagueSeasonTroopRow = {
  season_id: string;
  troop_id: string;
  troop_name: string;
  order_index: number | null;
};

export type LeagueSeasonEventRow = {
  season_id: string;
  event_key: string;
  event_label: string;
  event_name: string;
  order_index: number | null;
};

export type PublicLeagueSeason = {
  id: string;
  name: string;
  isActive: boolean;
  startsOn?: string | null;
  endsOn?: string | null;
  troops: Array<{ id: string; name: string; order: number }>;
  events: Array<{ key: string; label: string; name: string; order: number }>;
  scores: LeagueScoreRow[];
};

export type LeagueScoreInput = {
  season_id?: string;
  troop_id: string;
  event_key: string;
  points: number | null;
};

export type LeagueSeasonInput = {
  id: string;
  name: string;
  is_active: boolean;
  starts_on?: string | null;
  ends_on?: string | null;
};

export type LeagueTroopInput = {
  troop_id: string;
  troop_name: string;
  order_index: number;
};

export type LeagueEventInput = {
  event_key: string;
  event_label: string;
  event_name: string;
  order_index: number;
};

export const DEFAULT_LEAGUE_SEASON_ID = '2025-2026';

export const DEFAULT_LEAGUE_SEASON_NAME = 'Ročník 2025/2026';

export function isMissingLeagueSeasonSchemaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = typeof (error as any).code === 'string' ? (error as any).code : '';
  const message = typeof (error as any).message === 'string' ? (error as any).message : '';
  return (
    code === '42P01' ||
    code === '42703' ||
    message.includes('content_league_seasons') ||
    message.includes('content_league_season_troops') ||
    message.includes('content_league_season_events') ||
    message.includes('season_id') ||
    message.includes('schema cache')
  );
}

export function parseLeagueSeason(payload: Record<string, unknown>): LeagueSeasonInput {
  const rawSeason = payload.season && typeof payload.season === 'object'
    ? payload.season as Record<string, unknown>
    : payload;
  const rawName = typeof rawSeason.name === 'string' ? rawSeason.name.trim() : '';
  const name = rawName || DEFAULT_LEAGUE_SEASON_NAME;
  const rawId = typeof rawSeason.id === 'string' ? rawSeason.id.trim() : '';
  const id = rawId || slugify(name) || DEFAULT_LEAGUE_SEASON_ID;
  const startsOn = typeof rawSeason.starts_on === 'string' ? rawSeason.starts_on.trim() : null;
  const endsOn = typeof rawSeason.ends_on === 'string' ? rawSeason.ends_on.trim() : null;
  return {
    id,
    name,
    is_active: rawSeason.is_active === true || rawSeason.isActive === true,
    starts_on: startsOn || null,
    ends_on: endsOn || null,
  };
}

export function parseLeagueTroops(payload: Record<string, unknown>): LeagueTroopInput[] {
  const raw = Array.isArray(payload.troops) ? payload.troops : [];
  const seen = new Set<string>();
  const parsed: LeagueTroopInput[] = [];
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const rawId =
      typeof (entry as any).troop_id === 'string'
        ? (entry as any).troop_id
        : typeof (entry as any).id === 'string'
          ? (entry as any).id
          : '';
    const rawName =
      typeof (entry as any).troop_name === 'string'
        ? (entry as any).troop_name
        : typeof (entry as any).name === 'string'
          ? (entry as any).name
          : '';
    const troopName = rawName.trim();
    const troopId = (rawId.trim() || slugify(troopName)).trim();
    if (!troopId || !troopName || seen.has(troopId)) {
      return;
    }
    seen.add(troopId);
    const orderRaw = Number((entry as any).order_index ?? (entry as any).order ?? index);
    parsed.push({
      troop_id: troopId,
      troop_name: troopName,
      order_index: Number.isFinite(orderRaw) ? Math.max(0, Math.round(orderRaw)) : index,
    });
  });
  return parsed.sort((a, b) => a.order_index - b.order_index);
}

export function parseLeagueEvents(payload: Record<string, unknown>): LeagueEventInput[] {
  const raw = Array.isArray(payload.events) ? payload.events : [];
  const seen = new Set<string>();
  const parsed: LeagueEventInput[] = [];
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const rawKey =
      typeof (entry as any).event_key === 'string'
        ? (entry as any).event_key
        : typeof (entry as any).key === 'string'
          ? (entry as any).key
          : '';
    const rawLabel =
      typeof (entry as any).event_label === 'string'
        ? (entry as any).event_label
        : typeof (entry as any).label === 'string'
          ? (entry as any).label
          : '';
    const rawName =
      typeof (entry as any).event_name === 'string'
        ? (entry as any).event_name
        : typeof (entry as any).name === 'string'
          ? (entry as any).name
          : '';
    const eventLabel = rawLabel.trim() || rawName.trim() || rawKey.trim();
    const eventName = rawName.trim() || rawLabel.trim() || rawKey.trim();
    const eventKey = (rawKey.trim() || slugify(eventName)).trim();
    if (!eventKey || !eventLabel || !eventName || seen.has(eventKey)) {
      return;
    }
    seen.add(eventKey);
    const orderRaw = Number((entry as any).order_index ?? (entry as any).order ?? index);
    parsed.push({
      event_key: eventKey,
      event_label: eventLabel,
      event_name: eventName,
      order_index: Number.isFinite(orderRaw) ? Math.max(0, Math.round(orderRaw)) : index,
    });
  });
  return parsed.sort((a, b) => a.order_index - b.order_index);
}

export function parseLeagueScores(payload: Record<string, unknown>): LeagueScoreInput[] | null {
  const raw = payload.scores;
  if (!Array.isArray(raw)) {
    return null;
  }
  const season = parseLeagueSeason(payload);
  const parsed: LeagueScoreInput[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const seasonId =
      typeof (entry as any).season_id === 'string' && (entry as any).season_id.trim()
        ? (entry as any).season_id.trim()
        : season.id;
    const troopId = typeof (entry as any).troop_id === 'string' ? (entry as any).troop_id.trim() : '';
    const eventKey = typeof (entry as any).event_key === 'string' ? (entry as any).event_key.trim() : '';
    if (!troopId || !eventKey) {
      continue;
    }
    const pointsRaw = (entry as any).points;
    let points: number | null = null;
    if (pointsRaw === null || pointsRaw === undefined || pointsRaw === '') {
      points = null;
    } else if (typeof pointsRaw === 'number') {
      points = Number.isFinite(pointsRaw) ? pointsRaw : null;
    } else if (typeof pointsRaw === 'string') {
      const normalized = pointsRaw.replace(',', '.').trim();
      const parsedNumber = Number(normalized);
      points = Number.isFinite(parsedNumber) ? parsedNumber : null;
    } else {
      continue;
    }
    parsed.push({ season_id: seasonId, troop_id: troopId, event_key: eventKey, points });
  }
  return parsed.length > 0 ? parsed : null;
}

export function buildLeagueSeasonsPayload({
  seasons,
  troops,
  events,
  scores,
}: {
  seasons: LeagueSeasonRow[];
  troops: LeagueSeasonTroopRow[];
  events: LeagueSeasonEventRow[];
  scores: LeagueScoreRow[];
}): { seasons: PublicLeagueSeason[]; activeSeasonId: string; scores: LeagueScoreRow[] } {
  const seasonRows = seasons.length > 0
    ? seasons
    : [{ id: DEFAULT_LEAGUE_SEASON_ID, name: DEFAULT_LEAGUE_SEASON_NAME, is_active: true }];
  const seasonIds = new Set(seasonRows.map((season) => season.id));
  const troopsBySeason = new Map<string, LeagueSeasonTroopRow[]>();
  troops.forEach((troop) => {
    if (!seasonIds.has(troop.season_id)) {
      return;
    }
    const items = troopsBySeason.get(troop.season_id) ?? [];
    items.push(troop);
    troopsBySeason.set(troop.season_id, items);
  });
  const eventsBySeason = new Map<string, LeagueSeasonEventRow[]>();
  events.forEach((event) => {
    if (!seasonIds.has(event.season_id)) {
      return;
    }
    const items = eventsBySeason.get(event.season_id) ?? [];
    items.push(event);
    eventsBySeason.set(event.season_id, items);
  });
  const scoresBySeason = new Map<string, LeagueScoreRow[]>();
  scores.forEach((score) => {
    const seasonId = score.season_id || DEFAULT_LEAGUE_SEASON_ID;
    if (!seasonIds.has(seasonId)) {
      return;
    }
    const items = scoresBySeason.get(seasonId) ?? [];
    items.push({ ...score, season_id: seasonId });
    scoresBySeason.set(seasonId, items);
  });
  const publicSeasons = seasonRows.map((season) => {
    const seasonTroops = (troopsBySeason.get(season.id) ?? [])
      .slice()
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    const seasonEvents = (eventsBySeason.get(season.id) ?? [])
      .slice()
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    return {
      id: season.id,
      name: season.name,
      isActive: season.is_active,
      startsOn: season.starts_on ?? null,
      endsOn: season.ends_on ?? null,
      troops: seasonTroops.map((troop, index) => ({
        id: troop.troop_id,
        name: troop.troop_name,
        order: troop.order_index ?? index,
      })),
      events: seasonEvents.map((event, index) => ({
        key: event.event_key,
        label: event.event_label,
        name: event.event_name,
        order: event.order_index ?? index,
      })),
      scores: scoresBySeason.get(season.id) ?? [],
    };
  });
  const activeSeason = publicSeasons.find((season) => season.isActive) ?? publicSeasons[0];
  return {
    seasons: publicSeasons,
    activeSeasonId: activeSeason?.id ?? DEFAULT_LEAGUE_SEASON_ID,
    scores: activeSeason?.scores ?? [],
  };
}

export async function loadLeagueSeasons(supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const [seasonsResult, troopsResult, eventsResult, scoresResult] = await Promise.all([
    supabase
      .from('content_league_seasons')
      .select('id,name,is_active,starts_on,ends_on,created_at,updated_at')
      .order('starts_on', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('content_league_season_troops')
      .select('season_id,troop_id,troop_name,order_index')
      .order('season_id', { ascending: true })
      .order('order_index', { ascending: true }),
    supabase
      .from('content_league_season_events')
      .select('season_id,event_key,event_label,event_name,order_index')
      .order('season_id', { ascending: true })
      .order('order_index', { ascending: true }),
    supabase
      .from('content_league_scores')
      .select('season_id,troop_id,event_key,points'),
  ]);

  if (seasonsResult.error || troopsResult.error || eventsResult.error || scoresResult.error) {
    const error = seasonsResult.error ?? troopsResult.error ?? eventsResult.error ?? scoresResult.error;
    throw error;
  }

  return buildLeagueSeasonsPayload({
    seasons: (seasonsResult.data ?? []) as LeagueSeasonRow[],
    troops: (troopsResult.data ?? []) as LeagueSeasonTroopRow[],
    events: (eventsResult.data ?? []) as LeagueSeasonEventRow[],
    scores: (scoresResult.data ?? []) as LeagueScoreRow[],
  });
}

export async function handlePublicLeague(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
  try {
    const supabase = getSupabaseAdminClient();
    try {
      const payload = await loadLeagueSeasons(supabase);
      res.status(200).json(payload);
      return;
    } catch (error) {
      if (!isMissingLeagueSeasonSchemaError(error)) {
        throw error;
      }
    }

    const { data, error } = await supabase
      .from('content_league_scores')
      .select('troop_id,event_key,points');
    if (error) {
      res.status(500).json({ error: 'Failed to load league scores.' });
      return;
    }
    res.status(200).json({ scores: (data ?? []) as LeagueScoreRow[] });
  } catch (error) {
    logger.error('[api/content/league] failed', error);
    res.status(500).json({ error: 'Failed to load league scores.' });
  }
}

export async function handleAdminLeague(req: any, res: any) {
  if (!requireEditor(req, res)) {
    return;
  }
  const supabase = getSupabaseAdminClient();

  if (req.method === 'GET') {
    try {
      const payload = await loadLeagueSeasons(supabase);
      res.status(200).json(payload);
      return;
    } catch (error) {
      if (!isMissingLeagueSeasonSchemaError(error)) {
        res.status(500).json({ error: 'Failed to load league seasons.' });
        return;
      }
    }

    const { data, error } = await supabase
      .from('content_league_scores')
      .select('troop_id,event_key,points');
    if (error) {
      res.status(500).json({ error: 'Failed to load league scores.' });
      return;
    }
    res.status(200).json({ scores: (data ?? []) as LeagueScoreRow[] });
    return;
  }

  if (req.method === 'PUT') {
    const payload = resolveBody(req);
    const season = parseLeagueSeason(payload);
    const troops = parseLeagueTroops(payload);
    const events = parseLeagueEvents(payload);
    const scores = parseLeagueScores(payload) ?? [];
    if (!season.id || !season.name || troops.length === 0 || events.length === 0) {
      res.status(400).json({ error: 'Invalid payload.' });
      return;
    }

    try {
      if (season.is_active) {
        const { error: deactivateError } = await supabase
          .from('content_league_seasons')
          .update({ is_active: false })
          .neq('id', season.id);
        if (deactivateError) {
          throw deactivateError;
        }
      }

      const { error: seasonError } = await supabase
        .from('content_league_seasons')
        .upsert(season, { onConflict: 'id' });
      if (seasonError) {
        throw seasonError;
      }

      const { error: deleteTroopsError } = await supabase
        .from('content_league_season_troops')
        .delete()
        .eq('season_id', season.id);
      if (deleteTroopsError) {
        throw deleteTroopsError;
      }

      const seasonTroops = troops.map((troop) => ({ ...troop, season_id: season.id }));
      if (seasonTroops.length > 0) {
        const { error: troopsError } = await supabase
          .from('content_league_season_troops')
          .insert(seasonTroops);
        if (troopsError) {
          throw troopsError;
        }
      }

      const { error: deleteEventsError } = await supabase
        .from('content_league_season_events')
        .delete()
        .eq('season_id', season.id);
      if (deleteEventsError) {
        throw deleteEventsError;
      }

      const seasonEvents = events.map((event) => ({ ...event, season_id: season.id }));
      if (seasonEvents.length > 0) {
        const { error: eventsError } = await supabase
          .from('content_league_season_events')
          .insert(seasonEvents);
        if (eventsError) {
          throw eventsError;
        }
      }

      const { error: deleteScoresError } = await supabase
        .from('content_league_scores')
        .delete()
        .eq('season_id', season.id);
      if (deleteScoresError) {
        throw deleteScoresError;
      }

      if (scores.length > 0) {
        const seasonScores = scores.map((score) => ({ ...score, season_id: season.id }));
        const { error: scoresError } = await supabase
          .from('content_league_scores')
          .insert(seasonScores);
        if (scoresError) {
          throw scoresError;
        }
      }

      const nextPayload = await loadLeagueSeasons(supabase);
      res.status(200).json({ ok: true, ...nextPayload });
      return;
    } catch (error) {
      if (isMissingLeagueSeasonSchemaError(error) && scores.length > 0) {
        const legacyScores = scores.map(({ troop_id, event_key, points }) => ({ troop_id, event_key, points }));
        const { error: legacyError } = await supabase
          .from('content_league_scores')
          .upsert(legacyScores, { onConflict: 'troop_id,event_key' });
        if (!legacyError) {
          res.status(200).json({ ok: true, scores: legacyScores });
          return;
        }
      }
      logger.error('[api/content/admin/league] failed to save league seasons', error);
      res.status(500).json({ error: 'Failed to save league seasons.' });
      return;
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}
