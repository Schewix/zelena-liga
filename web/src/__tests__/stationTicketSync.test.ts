import { describe, expect, it } from 'vitest';
import type { Ticket } from '../auth/tickets';
import { mergeTickets } from '../station/ticketSync';
import { buildLivePatrolStates } from '../liveMap/liveMapData';

function ticket(patrolId: string, overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: `t-${patrolId}`,
    patrolId,
    patrolCode: `N-${patrolId}`,
    teamName: `Team ${patrolId}`,
    category: 'N',
    sex: 'H',
    state: 'waiting',
    createdAt: '2026-10-01T10:00:00.000Z',
    arrivedAt: '2026-10-01T10:00:00.000Z',
    waitAccumMs: 0,
    serveAccumMs: 0,
    points: null,
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

function remoteRow(patrolId: string, state: Ticket['state'], updatedAt: string) {
  return {
    patrol_id: patrolId,
    state,
    patrol_code: `N-${patrolId}`,
    team_name: `Team ${patrolId}`,
    category: 'N',
    sex: 'H',
    arrived_at: '2026-10-01T10:00:00.000Z',
    served_at: null,
    wait_started_at: '2026-10-01T10:00:00.000Z',
    wait_accum_ms: 0,
    serve_accum_ms: 0,
    points: null,
    created_at: '2026-10-01T10:00:00.000Z',
    client_updated_at: updatedAt,
  };
}

describe('mergeTickets', () => {
  it('adopts tickets created by another judge', () => {
    const merged = mergeTickets([], [remoteRow('a', 'waiting', '2026-10-01T10:01:00.000Z')]);
    expect(merged.changed).toBe(true);
    expect(merged.tickets).toHaveLength(1);
    expect(merged.tickets[0]).toMatchObject({ patrolId: 'a', state: 'waiting' });
  });

  it('keeps the newer version per patrol', () => {
    const local = [ticket('a', { state: 'serving', updatedAt: '2026-10-01T10:05:00.000Z' })];
    expect(mergeTickets(local, [remoteRow('a', 'waiting', '2026-10-01T10:02:00.000Z')]).tickets[0].state).toBe('serving');
    expect(mergeTickets(local, [remoteRow('a', 'done', '2026-10-01T10:09:00.000Z')]).tickets[0].state).toBe('done');
  });

  it('keeps local-only tickets and reports no change when remote is not newer', () => {
    const local = [ticket('a')];
    const merged = mergeTickets(local, []);
    expect(merged.changed).toBe(false);
    expect(merged.tickets).toBe(local);
  });
});

describe('live map uses the shared queue', () => {
  it('marks patrols with a waiting or serving ticket at that station', () => {
    const patrols = ['a', 'b', 'c'].map((id) => ({
      id, event_id: 'e', team_name: id, patrol_code: `N-${id}`, category: 'N', sex: 'H', active: true, disqualified: false,
    }));
    const timings = patrols.map((p) => ({ event_id: 'e', patrol_id: p.id, start_time: '2026-10-01T08:00:00Z', finish_time: null }));
    const now = Date.parse('2026-10-01T10:10:00Z');
    const states = buildLivePatrolStates({
      patrols,
      timings,
      passages: [],
      tickets: [
        { id: '1', station_id: 's1', patrol_id: 'a', state: 'waiting', arrived_at: '2026-10-01T10:00:00Z' },
        { id: '2', station_id: 's1', patrol_id: 'b', state: 'serving', arrived_at: '2026-10-01T10:05:00Z' },
        { id: '3', station_id: 's1', patrol_id: 'c', state: 'done', arrived_at: '2026-10-01T09:00:00Z' },
      ],
      now,
    });
    const byId = new Map(states.onCourse.map((s) => [s.patrol.id, s] as const));
    expect(byId.get('a')).toMatchObject({ status: 'ceka', currentStationId: 's1', waitMinutes: 10 });
    expect(byId.get('b')).toMatchObject({ status: 'plni', currentStationId: 's1' });
    expect(byId.get('c')?.status).toBe('na-trase');
  });
});
