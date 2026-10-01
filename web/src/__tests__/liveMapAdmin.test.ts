// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { loadLiveMap } from '../../api-lib/admin/eventState/actions/liveMap';

function setup(fail = false) {
  const filters: Array<[string, string, string]> = [];
  const ranges: Array<[string, number, number]> = [];
  const db = { from: (table: string) => {
    let eventId = '';
    const query: any = {
      select: () => query,
      eq: (key: string, value: string) => { filters.push([table, key, value]); eventId = value; return query; },
      order: () => query,
      then: (resolve: (value: unknown) => unknown) => resolve({ data: [{ id: 'year-a', name: 'Ročník A' }, { id: 'year-b', name: 'Ročník B' }], error: null }),
      range: async (from: number, to: number) => {
        ranges.push([table, from, to]);
        if (fail && table === 'patrols') return { data: null, error: { message: 'unavailable' } };
        return { data: table === 'station_passages' && from === 0
          ? Array.from({ length: 1000 }, (_, i) => ({ id: i, event_id: eventId }))
          : [{ id: `${table}-${from}`, event_id: eventId }], error: null };
      },
    };
    return query;
  } };
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return { filters, ranges, res, run: (payload: Record<string, unknown>) => loadLiveMap(db, payload, res) };
}

describe('live map admin data', () => {
  it('lists available years', async () => {
    const app = setup();
    await app.run({ action: 'load_live_map_events' });
    expect(app.res.json).toHaveBeenCalledWith({ events: [{ id: 'year-a', name: 'Ročník A' }, { id: 'year-b', name: 'Ročník B' }] });
  });
  it.each(['year-a', 'year-b'])('scopes all eight datasets to %s and loads every page', async (eventId) => {
    const app = setup();
    await app.run({ action: 'load_live_map', event_id: eventId });
    expect(new Set(app.filters.map(([table]) => table)).size).toBe(8);
    expect(app.filters.every(([, key, value]) => key === 'event_id' && value === eventId)).toBe(true);
    expect(app.ranges).toContainEqual(['station_passages', 1000, 1999]);
    expect(app.res.json.mock.calls[0][0].station_passages).toHaveLength(1001);
  });
  it('rejects an absent year without querying data', async () => {
    const app = setup();
    await app.run({ action: 'load_live_map' });
    expect(app.res.status).toHaveBeenCalledWith(400);
    expect(app.filters).toEqual([]);
  });
  it('reports a failed dataset rather than showing empty results', async () => {
    const app = setup(true);
    await app.run({ action: 'load_live_map', event_id: 'year-a' });
    expect(app.res.status).toHaveBeenCalledWith(500);
    expect(app.res.json.mock.calls[0][0].error).toContain('Nepodařilo');
  });
});
