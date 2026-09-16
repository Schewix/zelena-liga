import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchScheduleEvents, sortScheduleEvents } from '../data/schedule';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('sortScheduleEvents', () => {
  it('orders events by start date regardless of input order', () => {
    const sorted = sortScheduleEvents([
      { name: 'Sraz PTO', start: '2027-05-21', kind: 'event' },
      { name: 'Sněm SPTO', start: '2026-09-08', kind: 'assembly' },
      { name: 'Štáb SPTO', start: '2026-10-13', kind: 'staff' },
    ]);

    expect(sorted.map((event) => event.start)).toEqual(['2026-09-08', '2026-10-13', '2027-05-21']);
  });
});

describe('fetchScheduleEvents', () => {
  it('normalizes rows and sorts them by start date', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        events: [
          { name: 'Deskové hry', start: '2027-02-13', end: null, kind: 'event', note: null, href: '/souteze/deskove-hry' },
          { name: 'Sněm SPTO', start: '2026-09-08', end: null, kind: 'assembly', note: null, href: null },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const events = await fetchScheduleEvents();

    expect(fetchMock).toHaveBeenCalledWith('/api/content/schedule');
    expect(events?.map((event) => event.name)).toEqual(['Sněm SPTO', 'Deskové hry']);
    expect(events?.[1]?.href).toBe('/souteze/deskove-hry');
  });

  it('drops rows without a name or a start date', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          events: [
            { name: 'Štáb SPTO', start: '2026-10-13', kind: 'staff' },
            { name: '', start: '2026-11-10', kind: 'staff' },
            { name: 'Bez data', kind: 'event' },
          ],
        }),
      ),
    );

    const events = await fetchScheduleEvents();

    expect(events).toHaveLength(1);
    expect(events?.[0]?.name).toBe('Štáb SPTO');
  });

  it('falls back to null when the endpoint returns nothing usable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ events: [] })));
    await expect(fetchScheduleEvents()).resolves.toBeNull();

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'nope' }, 500)));
    await expect(fetchScheduleEvents()).resolves.toBeNull();

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await expect(fetchScheduleEvents()).resolves.toBeNull();
  });

  it('defaults an unknown kind to a regular event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ events: [{ name: 'Něco', start: '2027-01-01', kind: 'vylet' }] })),
    );

    const events = await fetchScheduleEvents();

    expect(events?.[0]?.kind).toBe('event');
  });
});
