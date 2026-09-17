export type SptoDocumentKind =
  | 'sbornicek'
  | 'propozice'
  | 'pozvanka'
  | 'pravidla'
  | 'zapis-snem'
  | 'zapis-stab'
  | 'prihlaska'
  | 'ostatni';

export type SptoDocumentLink = {
  label: string;
  url: string;
};

export type SptoDocument = {
  id: string;
  kind: SptoDocumentKind;
  title: string;
  description: string | null;
  eventDate: string | null;
  year: number | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  externalUrl: string | null;
  links: SptoDocumentLink[];
  coverUrl: string | null;
  orderIndex: number;
  scheduleEventId: string | null;
  competitionSlug: string | null;
  restricted: boolean;
};

const DOCUMENT_KINDS: SptoDocumentKind[] = [
  'sbornicek',
  'propozice',
  'pozvanka',
  'pravidla',
  'zapis-snem',
  'zapis-stab',
  'prihlaska',
  'ostatni',
];

function isDocumentKind(value: unknown): value is SptoDocumentKind {
  return typeof value === 'string' && (DOCUMENT_KINDS as string[]).includes(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// Bez adresy je položka k ničemu; když redakce nevyplní popisek, ukáže se aspoň doména.
export function normalizeDocumentLink(raw: unknown): SptoDocumentLink | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const url = typeof value.url === 'string' ? value.url.trim() : '';
  if (!/^https?:\/\/\S/i.test(url)) return null;
  const label = typeof value.label === 'string' ? value.label.trim() : '';
  return { label: label.length > 0 ? label : linkFallbackLabel(url), url };
}

function linkFallbackLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function readLinks(value: unknown): SptoDocumentLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeDocumentLink)
    .filter((link): link is SptoDocumentLink => link !== null);
}

// Bez id a názvu nemá dokument v seznamu co dělat, zbytek polí je nepovinný.
function normalizeDocument(raw: unknown): SptoDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== 'string' || value.id.length === 0) return null;
  if (typeof value.title !== 'string' || value.title.length === 0) return null;
  return {
    id: value.id,
    kind: isDocumentKind(value.kind) ? value.kind : 'ostatni',
    title: value.title,
    description: readString(value.description),
    eventDate: readString(value.eventDate),
    year: readNumber(value.year),
    fileUrl: readString(value.fileUrl),
    fileName: readString(value.fileName),
    fileSize: readNumber(value.fileSize),
    externalUrl: readString(value.externalUrl),
    links: readLinks(value.links),
    coverUrl: readString(value.coverUrl),
    orderIndex: readNumber(value.orderIndex) ?? 0,
    scheduleEventId: readString(value.scheduleEventId),
    competitionSlug: readString(value.competitionSlug),
    restricted: value.restricted === true,
  };
}

// Odkaz, na který se dá kliknout — interní dokumenty ho ze serveru vůbec nedostanou.
export function documentLink(document: SptoDocument): string | null {
  return document.fileUrl ?? document.links[0]?.url ?? document.externalUrl;
}

// U dokumentu bez souboru se první odkaz spotřebuje jako cíl dlaždice, zbytek se ukazuje zvlášť.
export function documentExtraLinks(document: SptoDocument): SptoDocumentLink[] {
  return document.links.slice(document.fileUrl ? 0 : 1);
}

export type TextSegment = { kind: 'text'; value: string } | { kind: 'link'; value: string; url: string };

// Koncová interpunkce a uzavírací závorka bývá součástí věty, ne adresy.
function trimUrlTail(url: string): string {
  let end = url.length;
  while (end > 0 && '.,;:!?"\''.includes(url[end - 1]!)) end -= 1;
  while (end > 0 && url[end - 1] === ')' && !url.slice(0, end).includes('(')) end -= 1;
  return url.slice(0, end);
}

// Text z redakce je prostý mail, odkazy v něm jsou holé – rozsekáme ho, ať z nich jde udělat <a>.
export function splitTextLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const pattern = /https?:\/\/\S+/gi;
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const url = trimUrlTail(match[0]);
    if (url.length === 0) continue;
    if (start > lastIndex) {
      segments.push({ kind: 'text', value: text.slice(lastIndex, start) });
    }
    segments.push({ kind: 'link', value: url, url });
    lastIndex = start + url.length;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}

// Sborníčky řadíme od nejnovějšího ročníku, ať je nahoře to, co lidi hledají.
export function sortDocumentsByYearDesc(documents: SptoDocument[]): SptoDocument[] {
  return [...documents].sort((a, b) => {
    const yearDiff = (b.year ?? 0) - (a.year ?? 0);
    if (yearDiff !== 0) return yearDiff;
    return a.orderIndex - b.orderIndex;
  });
}

export async function fetchDocuments(): Promise<SptoDocument[]> {
  let response: Response;
  try {
    response = await fetch('/api/content/documents');
  } catch {
    return [];
  }
  if (!response.ok) return [];
  let payload: { documents?: unknown };
  try {
    payload = (await response.json()) as { documents?: unknown };
  } catch {
    return [];
  }
  if (!Array.isArray(payload.documents)) return [];
  return payload.documents
    .map(normalizeDocument)
    .filter((document): document is SptoDocument => document !== null);
}
