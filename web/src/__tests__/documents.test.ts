import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  documentExtraLinks,
  documentLink,
  fetchDocuments,
  sortDocumentsByYearDesc,
  splitTextLinks,
  type SptoDocument,
} from '../data/documents';

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
    links: [],
    coverUrl: null,
    orderIndex: 0,
    scheduleEventId: null,
    competitionSlug: null,
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

  it('falls back to the first named link when there is no file', () => {
    const document = makeDocument({
      links: [
        { label: 'Přihlašovna', url: 'https://pionyr.cz/prihlasovna' },
        { label: 'Autobus', url: 'https://docs.google.com/spreadsheets/d/abc' },
      ],
    });
    expect(documentLink(document)).toBe('https://pionyr.cz/prihlasovna');
    expect(documentLink({ ...document, fileUrl: '/propozice.pdf' })).toBe('/propozice.pdf');
  });
});

describe('documentExtraLinks', () => {
  const links = [
    { label: 'Přihlašovna', url: 'https://pionyr.cz/prihlasovna' },
    { label: 'Autobus', url: 'https://docs.google.com/spreadsheets/d/abc' },
  ];

  it('drops the first link when it is already the tile target', () => {
    expect(documentExtraLinks(makeDocument({ links }))).toEqual([links[1]]);
  });

  it('keeps every link when the tile points at an uploaded file', () => {
    expect(documentExtraLinks(makeDocument({ links, fileUrl: '/propozice.pdf' }))).toEqual(links);
  });

  it('has nothing to show for an internal document, because the API strips its links', () => {
    expect(documentExtraLinks(makeDocument({ restricted: true }))).toEqual([]);
  });
});

describe('splitTextLinks', () => {
  it('pulls bare urls out of the surrounding text', () => {
    expect(splitTextLinks('Zapiš se do tabulky https://example.com/a?b=c a díky.')).toEqual([
      { kind: 'text', value: 'Zapiš se do tabulky ' },
      { kind: 'link', value: 'https://example.com/a?b=c', url: 'https://example.com/a?b=c' },
      { kind: 'text', value: ' a díky.' },
    ]);
  });

  it('leaves sentence punctuation out of the url', () => {
    expect(splitTextLinks('Registrace: https://pionyr.cz/detail/?id=779.')).toEqual([
      { kind: 'text', value: 'Registrace: ' },
      { kind: 'link', value: 'https://pionyr.cz/detail/?id=779', url: 'https://pionyr.cz/detail/?id=779' },
      { kind: 'text', value: '.' },
    ]);
  });

  it('keeps a closing bracket that belongs to the url', () => {
    const segments = splitTextLinks('Viz https://cs.wikipedia.org/wiki/Sifra_(hra) dole.');
    expect(segments[1]).toEqual({
      kind: 'link',
      value: 'https://cs.wikipedia.org/wiki/Sifra_(hra)',
      url: 'https://cs.wikipedia.org/wiki/Sifra_(hra)',
    });
  });

  it('returns a single text segment when there is no url', () => {
    expect(splitTextLinks('Bez odkazu.')).toEqual([{ kind: 'text', value: 'Bez odkazu.' }]);
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

  it('keeps the new kinds and the competition binding', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          documents: [
            { id: 'doc-1', title: 'Pravidla lakrosu', kind: 'pravidla', competitionSlug: 'lakros' },
            { id: 'doc-2', title: 'Pozvánka na štáb', kind: 'pozvanka' },
          ],
        }),
      ),
    );

    const documents = await fetchDocuments();

    expect(documents.map((document) => document.kind)).toEqual(['pravidla', 'pozvanka']);
    expect(documents[0]?.competitionSlug).toBe('lakros');
    expect(documents[1]?.competitionSlug).toBeNull();
  });

  it('keeps usable links, labels them by domain and drops the rest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          documents: [
            {
              id: 'doc-1',
              title: 'Propozice ZaPsem',
              links: [
                { label: 'Zápis na autobus', url: 'https://docs.google.com/spreadsheets/d/abc' },
                { label: '', url: 'https://www.pionyr.cz/prihlasovna-detail/?id=779' },
                { label: 'Zlý', url: 'javascript:alert(1)' },
                { label: 'Bez adresy' },
                'nesmysl',
              ],
            },
          ],
        }),
      ),
    );

    const documents = await fetchDocuments();

    expect(documents[0]?.links).toEqual([
      { label: 'Zápis na autobus', url: 'https://docs.google.com/spreadsheets/d/abc' },
      { label: 'pionyr.cz', url: 'https://www.pionyr.cz/prihlasovna-detail/?id=779' },
    ]);
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
