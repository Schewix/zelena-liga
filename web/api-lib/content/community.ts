import { logger } from '../logger.js';
import { authenticateCommunityRequest } from './communityAuth.js';
import { getSupabaseAdminClient } from './supabaseAdmin.js';

type LodgingRow = {
  id: string;
  name: string;
  place: string | null;
  lat: number;
  lng: number;
  url: string | null;
  group_size: number | null;
  communication: string | null;
  rating: number | null;
  review: string | null;
  leader_name: string;
  leader_contact: string;
  owner_id: string | null;
  created_at: string;
};

type LoanRow = {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  place: string | null;
  leader_name: string;
  leader_contact: string;
  owner_id: string | null;
  created_at: string;
};

const LOAN_KINDS = new Set(['games', 'material']);

// Hrubý obdélník kolem ČR, ať se do mapy nedostanou body odjinud.
const CZ_BOUNDS = { minLat: 48.5, maxLat: 51.1, minLng: 12.0, maxLng: 18.9 };

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const submissions = new Map<string, number[]>();

function isRateLimited(req: any) {
  const forwarded = req.headers?.['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const recent = (submissions.get(ip) ?? []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    submissions.set(ip, recent);
    return true;
  }
  recent.push(now);
  submissions.set(ip, recent);
  return false;
}

function readText(payload: Record<string, unknown>, key: string, max: number): string | null {
  const value = payload[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, max) : null;
}

function readInt(payload: Record<string, unknown>, key: string, min: number, max: number): number | null {
  const value = payload[key];
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function readUrl(payload: Record<string, unknown>, key: string): string | null {
  const value = readText(payload, key, 300);
  if (!value) return null;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function toPublicLodging(row: LodgingRow) {
  return {
    id: row.id,
    name: row.name,
    place: row.place,
    lat: row.lat,
    lng: row.lng,
    url: row.url,
    groupSize: row.group_size,
    communication: row.communication,
    rating: row.rating,
    review: row.review,
    leaderName: row.leader_name,
    leaderContact: row.leader_contact,
    ownerId: row.owner_id,
    createdAt: row.created_at,
  };
}

function toPublicLoan(row: LoanRow) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    place: row.place,
    leaderName: row.leader_name,
    leaderContact: row.leader_contact,
    ownerId: row.owner_id,
    createdAt: row.created_at,
  };
}

function isMissingTable(error: unknown) {
  return typeof (error as any)?.code === 'string' && (error as any).code === '42P01';
}

export async function handlePublicCommunity(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  try {
    const supabase = getSupabaseAdminClient();
    const [lodgings, loans] = await Promise.all([
      supabase.from('content_lodging_tips').select('*').eq('published', true).order('created_at', { ascending: false }),
      supabase.from('content_equipment_loans').select('*').eq('published', true).order('created_at', { ascending: false }),
    ]);
    if (isMissingTable(lodgings.error) || isMissingTable(loans.error)) {
      res.status(200).json({ lodgings: [], loans: [] });
      return;
    }
    if (lodgings.error || loans.error) {
      res.status(500).json({ error: 'Failed to load community tips.' });
      return;
    }
    res.status(200).json({
      lodgings: ((lodgings.data ?? []) as LodgingRow[]).map(toPublicLodging),
      loans: ((loans.data ?? []) as LoanRow[]).map(toPublicLoan),
    });
  } catch (error) {
    logger.error('[api/content/community] failed', error);
    res.status(500).json({ error: 'Failed to load community tips.' });
  }
}

async function saveRow(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  table: 'content_lodging_tips' | 'content_equipment_loans',
  fields: Record<string, unknown>,
  ownerId: string,
  id: string | undefined,
  res: any,
) {
  if (!id) {
    const { error } = await supabase.from(table).insert({ ...fields, owner_id: ownerId });
    if (error) throw error;
    res.status(201).json({ ok: true });
    return;
  }
  const { data, error } = await supabase.from(table).update(fields).eq('id', id).eq('owner_id', ownerId).select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    res.status(404).json({ error: 'Záznam nenalezen, nebo ho nemůžeš upravit.' });
    return;
  }
  res.status(200).json({ ok: true });
}

export async function handleCommunitySubmit(req: any, res: any, kind: 'lodging' | 'loan', id?: string) {
  const isUpdate = Boolean(id);
  if (req.method !== (isUpdate ? 'PUT' : 'POST')) {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const payload = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;

  const ownerId = await authenticateCommunityRequest(req).catch(() => null);
  if (!ownerId) {
    res.status(401).json({ error: isUpdate ? 'Pro úpravu se nejdřív přihlas.' : 'Pro přidání tipu se nejdřív přihlas.' });
    return;
  }

  // Skryté pole, které vyplní jen robot — tvářit se, že vše proběhlo, ať se nezkouší dál.
  if (typeof payload.company === 'string' && payload.company.trim().length > 0) {
    res.status(201).json({ ok: true });
    return;
  }
  if (!isUpdate && isRateLimited(req)) {
    res.status(429).json({ error: 'Příliš mnoho odeslání, zkus to prosím za chvíli.' });
    return;
  }

  const leaderName = readText(payload, 'leaderName', 120);
  const leaderContact = readText(payload, 'leaderContact', 160);
  if (!leaderName || !leaderContact) {
    res.status(400).json({ error: 'Vyplň jméno a kontakt na vedoucího.' });
    return;
  }

  try {
    const supabase = getSupabaseAdminClient();

    if (kind === 'lodging') {
      const name = readText(payload, 'name', 160);
      const lat = Number(payload.lat);
      const lng = Number(payload.lng);
      if (!name) {
        res.status(400).json({ error: 'Vyplň název ubytování.' });
        return;
      }
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < CZ_BOUNDS.minLat ||
        lat > CZ_BOUNDS.maxLat ||
        lng < CZ_BOUNDS.minLng ||
        lng > CZ_BOUNDS.maxLng
      ) {
        res.status(400).json({ error: 'Vyber polohu ubytování v mapě České republiky.' });
        return;
      }
      const fields = {
        name,
        place: readText(payload, 'place', 160),
        lat,
        lng,
        url: readUrl(payload, 'url'),
        group_size: readInt(payload, 'groupSize', 1, 500),
        communication: readText(payload, 'communication', 1000),
        rating: readInt(payload, 'rating', 1, 5),
        review: readText(payload, 'review', 2000),
        leader_name: leaderName,
        leader_contact: leaderContact,
      };
      await saveRow(supabase, 'content_lodging_tips', fields, ownerId, id, res);
      return;
    }

    const title = readText(payload, 'title', 160);
    const loanKind = typeof payload.kind === 'string' && LOAN_KINDS.has(payload.kind) ? payload.kind : 'games';
    if (!title) {
      res.status(400).json({ error: 'Vyplň, co nabízíš k půjčení.' });
      return;
    }
    await saveRow(supabase, 'content_equipment_loans', {
      kind: loanKind,
      title,
      description: readText(payload, 'description', 1000),
      place: readText(payload, 'place', 160),
      leader_name: leaderName,
      leader_contact: leaderContact,
    }, ownerId, id, res);
  } catch (error) {
    logger.error('[api/content/community] submit failed', error);
    res.status(500).json({ error: 'Uložení se nepodařilo, zkus to prosím znovu.' });
  }
}

export async function handleCommunityDelete(req: any, res: any, kind: 'lodging' | 'loan', id: string) {
  if (req.method !== 'DELETE') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const ownerId = await authenticateCommunityRequest(req);
    if (!ownerId) {
      res.status(401).json({ error: 'Pro smazání se nejdřív přihlas.' });
      return;
    }
    const table = kind === 'lodging' ? 'content_lodging_tips' : 'content_equipment_loans';
    const { data, error } = await getSupabaseAdminClient()
      .from(table)
      .delete()
      .eq('id', id)
      .eq('owner_id', ownerId)
      .select('id');
    if (error) {
      throw error;
    }
    if (!data || data.length === 0) {
      res.status(404).json({ error: 'Záznam nenalezen, nebo ho nemůžeš smazat.' });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error('[api/content/community] delete failed', error);
    res.status(500).json({ error: 'Smazání se nepodařilo, zkus to prosím znovu.' });
  }
}
