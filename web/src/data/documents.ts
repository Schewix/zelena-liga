export type SptoDocumentKind = 'sbornicek' | 'propozice' | 'zapis-snem' | 'zapis-stab' | 'prihlaska' | 'ostatni';

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
  coverUrl: string | null;
  orderIndex: number;
  scheduleEventId: string | null;
  restricted: boolean;
};

const DOCUMENT_KINDS: SptoDocumentKind[] = [
  'sbornicek',
  'propozice',
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
    coverUrl: readString(value.coverUrl),
    orderIndex: readNumber(value.orderIndex) ?? 0,
    scheduleEventId: readString(value.scheduleEventId),
    restricted: value.restricted === true,
  };
}

// Odkaz, na který se dá kliknout — interní dokumenty ho ze serveru vůbec nedostanou.
export function documentLink(document: SptoDocument): string | null {
  return document.fileUrl ?? document.externalUrl;
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
