import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentLink, fetchDocuments, sortDocumentsByYearDesc, type SptoDocument } from '../data/documents';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function makeDocument(overrides: Partial<SptoDocument> = {}): SptoDocument {
  return {
    id: 'doc-1',
    kind: 'sbornicek',
    title: 'Sborníček 2025',
    description: null,
    eventDate: null,
    year: 2025,
    fileUrl: null,
    fileName: null,
    fileSize: null,
    externalUrl: null,
    coverUrl: null,
    orderIndex: 0,
    scheduleEventId: null,
    restricted: false,
    ...overrides,
  };
}

describe('sortDocumentsByYearDesc', () => {
  it('puts the newest year first and keeps order_index as the tie-breaker', () => {
    const sorted = sortDocumentsByYearDesc([
      makeDocument({ id: 'b', year: 2024, orderIndex: 1 }),
      makeDocument({ id: 'c', year: 2026 }),
      makeDocument({ id: 'a', year: 2024, orderIndex: 0 }),
    ]);

    expect(sorted.map((document) => document.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('documentLink', () => {
  it('prefers the uploaded file over an external link', () => {
    expect(documentLink(makeDocument({ fileUrl: '/soubor.pdf', externalUrl: 'https://example.com' }))).toBe('/soubor.pdf');
    expect(documentLink(makeDocument({ externalUrl: 'https://example.com' }))).toBe('https://example.com');
  });

  it('returns null for an internal document without links', () => {
    expect(documentLink(makeDocument({ restricted: true }))).toBeNull();
  });
});

describe('fetchDocuments', () => {
  it('normalizes rows from the endpoint', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        documents: [
          {
            id: 'doc-1',
            kind: 'propozice',
            title: 'Propozice ZaPsem',
            description: null,
            eventDate: '2026-10-03',
            year: 2026,
            fileUrl: '/propozice.pdf',
            fileName: 'propozice.pdf',
            fileSize: 1024,
            externalUrl: null,
            coverUrl: null,
            orderIndex: 2,
            scheduleEventId: 'event-1',
            restricted: false,
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const documents = await fetchDocuments();

    expect(fetchMock).toHaveBeenCalledWith('/api/content/documents');
    expect(documents).toHaveLength(1);
    expect(documents[0]?.scheduleEventId).toBe('event-1');
    expect(documents[0]?.kind).toBe('propozice');
  });

  it('drops rows without an id or a title and defaults an unknown kind', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          documents: [
            { id: 'doc-1', title: 'Něco', kind: 'neznamy' },
            { id: '', title: 'Bez id' },
            { id: 'doc-2' },
          ],
        }),
      ),
    );

    const documents = await fetchDocuments();

    expect(documents).toHaveLength(1);
    expect(documents[0]?.kind).toBe('ostatni');
  });

  it('returns an empty list when the endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'nope' }, 500)));
    await expect(fetchDocuments()).resolves.toEqual([]);

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await expect(fetchDocuments()).resolves.toEqual([]);
  });
});
