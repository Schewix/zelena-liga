import type { Ticket } from '../auth/tickets';
import { supabase } from '../supabaseClient';

export type TicketSyncSignatures = Map<string, string>;

function signature(ticket: Ticket) {
  return JSON.stringify([
    ticket.state,
    ticket.patrolCode,
    ticket.teamName,
    ticket.category,
    ticket.sex,
    ticket.arrivedAt ?? null,
    ticket.servedAt ?? null,
    ticket.waitStartedAt ?? null,
    ticket.waitAccumMs,
    ticket.points ?? null,
  ]);
}

/**
 * Mirrors the station's local queue into `station_tickets` so the admin can see it.
 * Best effort: failed rows stay out of `synced` and are retried on the next call.
 */
export async function syncStationTickets(params: {
  eventId: string;
  stationId: string;
  tickets: Ticket[];
  synced: TicketSyncSignatures;
}) {
  const { eventId, stationId, tickets, synced } = params;
  const currentPatrolIds = new Set(tickets.map((ticket) => ticket.patrolId));

  const removed = Array.from(synced.keys()).filter((patrolId) => !currentPatrolIds.has(patrolId));
  const changed = tickets.filter((ticket) => synced.get(ticket.patrolId) !== signature(ticket));

  await Promise.all([
    ...removed.map(async (patrolId) => {
      const { error } = await supabase
        .from('station_tickets')
        .delete()
        .eq('event_id', eventId)
        .eq('station_id', stationId)
        .eq('patrol_id', patrolId);
      if (!error) {
        synced.delete(patrolId);
      }
    }),
    ...changed.map(async (ticket) => {
      const { error } = await supabase.rpc('upsert_station_ticket', {
        p_event_id: eventId,
        p_station_id: stationId,
        p_patrol_id: ticket.patrolId,
        p_state: ticket.state,
        p_patrol_code: ticket.patrolCode,
        p_team_name: ticket.teamName,
        p_category: ticket.category || null,
        p_sex: ticket.sex || null,
        p_arrived_at: ticket.arrivedAt ?? null,
        p_served_at: ticket.servedAt ?? null,
        p_wait_started_at: ticket.waitStartedAt ?? null,
        p_wait_accum_ms: Math.round(ticket.waitAccumMs),
        p_serve_accum_ms: Math.round(ticket.serveAccumMs),
        p_points: ticket.points ?? null,
        p_client_updated_at: new Date().toISOString(),
      });
      if (!error) {
        synced.set(ticket.patrolId, signature(ticket));
      }
    }),
  ]);
}
