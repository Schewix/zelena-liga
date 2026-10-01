import { requireStationSession } from './admin/eventState/auth.js';
import { respond } from './admin/eventState/respond.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TICKET_STATES = new Set(['waiting', 'serving', 'done']);
const MAX_TICKETS_PER_REQUEST = 200;

type TicketInput = {
  patrol_id: string;
  state: string;
  patrol_code?: string;
  team_name?: string;
  category?: string | null;
  sex?: string | null;
  arrived_at?: string | null;
  served_at?: string | null;
  wait_started_at?: string | null;
  wait_accum_ms?: number;
  serve_accum_ms?: number;
  points?: number | null;
  client_updated_at?: string;
};

function isoOrNull(value: unknown) {
  if (typeof value !== 'string' || !value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function nonNegativeInt(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

async function listTickets(supabaseAdmin: any, eventId: string, stationId: string) {
  return supabaseAdmin.rpc('list_station_tickets', { p_event_id: eventId, p_station_id: stationId });
}

// Served from /api/admin/event-state?stationTickets=1 (Vercel Hobby limits the number of functions).
// Shared queue of a station: every judge of the station reads and writes the same rows.
// The upsert RPC keeps the row with the newest client_updated_at, so concurrent edits resolve last-write-wins.
export async function handleStationTickets(req: any, res: any) {
  const session = await requireStationSession(req, res);
  if (!session) {
    return;
  }
  const { supabaseAdmin, eventId, stationId, judgeId } = session;

  if (req.method === 'POST') {
    let body: unknown = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: 'Invalid JSON' });
      }
    }
    const tickets = (body as { tickets?: unknown })?.tickets;
    if (!Array.isArray(tickets) || tickets.length > MAX_TICKETS_PER_REQUEST) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    for (const raw of tickets as TicketInput[]) {
      if (!raw || !UUID_REGEX.test(String(raw.patrol_id)) || !TICKET_STATES.has(String(raw.state))) {
        return res.status(400).json({ error: 'Invalid ticket' });
      }
    }

    const results = await Promise.all(
      (tickets as TicketInput[]).map((raw) =>
        supabaseAdmin.rpc('upsert_station_ticket', {
          p_event_id: eventId,
          p_station_id: stationId,
          p_patrol_id: raw.patrol_id,
          p_state: raw.state,
          p_patrol_code: typeof raw.patrol_code === 'string' ? raw.patrol_code : '',
          p_team_name: typeof raw.team_name === 'string' ? raw.team_name : '',
          p_category: raw.category || null,
          p_sex: raw.sex || null,
          p_arrived_at: isoOrNull(raw.arrived_at),
          p_served_at: isoOrNull(raw.served_at),
          p_wait_started_at: isoOrNull(raw.wait_started_at),
          p_wait_accum_ms: nonNegativeInt(raw.wait_accum_ms),
          p_serve_accum_ms: nonNegativeInt(raw.serve_accum_ms),
          p_points: typeof raw.points === 'number' && Number.isFinite(raw.points) ? Math.round(raw.points) : null,
          p_client_updated_at: isoOrNull(raw.client_updated_at) ?? new Date().toISOString(),
          p_updated_by: judgeId,
        }),
      ),
    );
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      return respond(res, 500, 'Failed to save tickets', failed.error.message);
    }
  }

  const { data, error } = await listTickets(supabaseAdmin, eventId, stationId);
  if (error) {
    return respond(res, 500, 'Failed to load tickets', error.message);
  }
  return res.status(200).json({ tickets: data ?? [] });
}
