// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTicket, transitionTicket, ticketSignature, type Ticket } from '../auth/tickets';
import { exchangeStationTickets, mergeTickets, type TicketSyncState } from '../station/ticketSync';

// In-memory stand-in for /api/station-tickets + upsert_station_ticket (newest client_updated_at wins).
function installFakeServer() {
  const rows = new Map<string, any>();
  vi.stubGlobal('fetch', async (_url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === 'POST') {
      const { tickets } = JSON.parse(init.body ?? '{}');
      tickets.forEach((ticket: any) => {
        const current = rows.get(ticket.patrol_id);
        if (!current || Date.parse(current.client_updated_at) <= Date.parse(ticket.client_updated_at)) {
          rows.set(ticket.patrol_id, { ...ticket, created_at: ticket.client_updated_at });
        }
      });
    }
    return { ok: true, json: async () => ({ tickets: Array.from(rows.values()) }) };
  });
  return rows;
}

function createDevice() {
  let tickets: Ticket[] = [];
  const synced: TicketSyncState = new Map();
  return {
    get tickets() { return tickets; },
    change(updater: (current: Ticket[]) => Ticket[], at: number) {
      const stamp = new Date(at).toISOString();
      const next = updater(tickets).map((ticket) => {
        const before = tickets.find((candidate) => candidate.id === ticket.id);
        return before && ticketSignature(before) === ticketSignature(ticket) ? ticket : { ...ticket, updatedAt: stamp };
      });
      tickets = next;
    },
    async exchange() {
      const remote = await exchangeStationTickets({ url: '/x', accessToken: 't', tickets, synced });
      const merged = mergeTickets(tickets, remote);
      merged.remoteTickets.forEach((ticket) => synced.set(ticket.patrolId, `${ticketSignature(ticket)}|${ticket.updatedAt ?? ''}`));
      tickets = merged.tickets;
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('queue shared by two judges', () => {
  it('propagates add, serve and remove in both directions', async () => {
    installFakeServer();
    const a = createDevice();
    const b = createDevice();
    const t0 = Date.parse('2026-10-01T10:00:00Z');

    a.change((c) => [...c, createTicket({ patrolId: 'p1', patrolCode: 'N-1', teamName: 'T1', category: 'N', sex: 'H' })], t0);
    await a.exchange();
    await b.exchange();
    expect(b.tickets.map((t) => [t.patrolId, t.state])).toEqual([['p1', 'waiting']]);

    b.change((c) => c.map((t) => transitionTicket(t, 'serving', t0 + 5000)), t0 + 5000);
    await b.exchange();
    await a.exchange();
    expect(a.tickets.map((t) => t.state)).toEqual(['serving']);

    a.change((c) => c.map((t) => transitionTicket(t, 'done', t0 + 9000)), t0 + 9000);
    await a.exchange();
    await b.exchange();
    expect(b.tickets.map((t) => t.state)).toEqual(['done']);
  });
});
