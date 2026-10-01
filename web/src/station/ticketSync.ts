import { generateTicketId, ticketSignature, type Ticket } from '../auth/tickets';

type RemoteTicketRow = {
  patrol_id: string;
  state: Ticket['state'];
  patrol_code: string | null;
  team_name: string | null;
  category: string | null;
  sex: string | null;
  arrived_at: string | null;
  served_at: string | null;
  wait_started_at: string | null;
  wait_accum_ms: number | null;
  serve_accum_ms: number | null;
  points: number | null;
  created_at: string;
  client_updated_at: string;
};

/** patrolId -> `${signature}|${updatedAt}` of the version the server is known to hold. */
export type TicketSyncState = Map<string, string>;

export function ticketSyncKey(ticket: Ticket) {
  return `${ticketSignature(ticket)}|${ticket.updatedAt ?? ''}`;
}

function toMs(value: string | undefined) {
  const ms = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ms) ? ms : 0;
}

function fromRemote(row: RemoteTicketRow, local?: Ticket): Ticket {
  return {
    id: local?.id ?? generateTicketId(row.patrol_id),
    patrolId: row.patrol_id,
    patrolCode: row.patrol_code ?? '',
    teamName: row.team_name ?? '',
    category: row.category ?? '',
    sex: row.sex ?? '',
    state: row.state,
    createdAt: local?.createdAt ?? row.created_at,
    arrivedAt: row.arrived_at ?? undefined,
    servedAt: row.served_at ?? undefined,
    waitStartedAt: row.state === 'waiting' ? row.wait_started_at ?? undefined : undefined,
    waitAccumMs: row.wait_accum_ms ?? 0,
    serveAccumMs: 0,
    points: row.points ?? null,
    updatedAt: row.client_updated_at,
  };
}

/** Last write wins per patrol; ties keep the local ticket. */
export function mergeTickets(local: Ticket[], remote: RemoteTicketRow[]) {
  const localByPatrol = new Map(local.map((ticket) => [ticket.patrolId, ticket] as const));
  const remoteTickets = remote.map((row) => fromRemote(row, localByPatrol.get(row.patrol_id)));
  const merged = new Map(localByPatrol);
  let changed = false;
  remoteTickets.forEach((remoteTicket) => {
    const current = merged.get(remoteTicket.patrolId);
    if (!current || toMs(remoteTicket.updatedAt) > toMs(current.updatedAt)) {
      merged.set(remoteTicket.patrolId, remoteTicket);
      changed = true;
    }
  });
  return { tickets: changed ? Array.from(merged.values()) : local, changed, remoteTickets };
}

function toPayload(ticket: Ticket) {
  return {
    patrol_id: ticket.patrolId,
    state: ticket.state,
    patrol_code: ticket.patrolCode,
    team_name: ticket.teamName,
    category: ticket.category || null,
    sex: ticket.sex || null,
    arrived_at: ticket.arrivedAt ?? null,
    served_at: ticket.servedAt ?? null,
    wait_started_at: ticket.waitStartedAt ?? null,
    wait_accum_ms: ticket.waitAccumMs,
    serve_accum_ms: ticket.serveAccumMs,
    points: ticket.points ?? null,
    client_updated_at: ticket.updatedAt ?? new Date().toISOString(),
  };
}

/**
 * Pushes locally changed tickets to the shared station queue and returns the server's version of it.
 * Throws on network/HTTP errors so the caller can retry later.
 */
export async function exchangeStationTickets(params: {
  url: string;
  accessToken: string;
  tickets: Ticket[];
  synced: TicketSyncState;
}) {
  const { url, accessToken, tickets, synced } = params;
  const dirty = tickets.filter((ticket) => synced.get(ticket.patrolId) !== ticketSyncKey(ticket));
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  const response = dirty.length
    ? await fetch(url, { method: 'POST', headers, body: JSON.stringify({ tickets: dirty.map(toPayload) }) })
    : await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Station tickets request failed (${response.status})`);
  }
  dirty.forEach((ticket) => synced.set(ticket.patrolId, ticketSyncKey(ticket)));
  const body = (await response.json()) as { tickets?: RemoteTicketRow[] };
  return body.tickets ?? [];
}
