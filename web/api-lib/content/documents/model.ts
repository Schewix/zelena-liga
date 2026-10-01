

export type DocumentRow = {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  event_date: string | null;
  year: number | null;
  file_url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  external_url: string | null;
  links?: unknown;
  cover_url: string | null;
  visibility: string;
  published: boolean;
  order_index: number;
  schedule_event_id?: string | null;
  competition_slug?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export const CONTENT_DOCUMENTS_BUCKET = 'content-documents';

export const CONTENT_DOCUMENT_ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

export const CONTENT_DOCUMENT_MAX_SIZE = 50 * 1024 * 1024;

export const CONTENT_DOCUMENT_KINDS = new Set([
  'sbornicek',
  'propozice',
  'pozvanka',
  'pravidla',
  'zapis-snem',
  'zapis-stab',
  'prihlaska',
  'ostatni',
]);

export const CONTENT_DOCUMENT_VISIBILITIES = new Set(['public', 'internal']);

export function resolveDocumentExtension(fileName: string, contentType: string): string {
  const extensionFromName = fileName
    .split('.')
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (extensionFromName && ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(extensionFromName)) {
    return extensionFromName === 'jpg' ? 'jpeg' : extensionFromName;
  }
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/jpeg') return 'jpeg';
  return 'pdf';
}

// Odkazy chodí z redakce jako pole { label, url }. Pouštíme dál jen http(s), ať se do stránky nedostane javascript:.
export const DOCUMENT_LINKS_LIMIT = 20;

export function sanitizeDocumentLinks(raw: unknown): { label: string; url: string }[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const links: { label: string; url: string }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Record<string, unknown>;
    const url = typeof value.url === 'string' ? value.url.trim() : '';
    if (!/^https?:\/\/\S/i.test(url)) continue;
    const label = typeof value.label === 'string' ? value.label.trim().slice(0, 120) : '';
    links.push({ label, url: url.slice(0, 2000) });
    if (links.length >= DOCUMENT_LINKS_LIMIT) break;
  }
  return links;
}

export function parseDocumentPayload(payload: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  const readText = (key: string) => {
    if (typeof payload[key] !== 'string') {
      return;
    }
    const value = (payload[key] as string).trim();
    update[key] = value.length > 0 ? value : null;
  };

  if (typeof payload.title === 'string') {
    update.title = payload.title.trim();
  }
  if (typeof payload.kind === 'string' && CONTENT_DOCUMENT_KINDS.has(payload.kind)) {
    update.kind = payload.kind;
  } else if (!partial) {
    update.kind = 'ostatni';
  }
  if (typeof payload.visibility === 'string' && CONTENT_DOCUMENT_VISIBILITIES.has(payload.visibility)) {
    update.visibility = payload.visibility;
  }
  if (typeof payload.published === 'boolean') {
    update.published = payload.published;
  }
  if (payload.year === null) {
    update.year = null;
  } else if (typeof payload.year === 'number' && Number.isFinite(payload.year)) {
    update.year = Math.trunc(payload.year);
  }
  if (payload.file_size === null) {
    update.file_size = null;
  } else if (typeof payload.file_size === 'number' && Number.isFinite(payload.file_size)) {
    update.file_size = Math.trunc(payload.file_size);
  }
  if (typeof payload.order_index === 'number' && Number.isFinite(payload.order_index)) {
    update.order_index = Math.trunc(payload.order_index);
  }

  // Prázdná hodnota ze selectu v redakci znamená „dokument k žádné akci nepatří“.
  if (payload.schedule_event_id === null || payload.schedule_event_id === '') {
    update.schedule_event_id = null;
  } else if (typeof payload.schedule_event_id === 'string') {
    update.schedule_event_id = payload.schedule_event_id;
  }

  readText('description');
  readText('event_date');
  readText('competition_slug');
  readText('file_url');
  readText('file_path');
  readText('file_name');
  readText('external_url');
  readText('cover_url');

  // Redakce posílá celý seznam naráz. external_url držíme v souladu s prvním odkazem kvůli starším řádkům.
  if (Array.isArray(payload.links)) {
    const links = sanitizeDocumentLinks(payload.links);
    update.links = links;
    update.external_url = links[0]?.url ?? null;
  }

  return update;
}

// Interní dokumenty zůstávají v seznamu, ale odkazy na ně ven neposíláme.
export function toPublicDocument(row: DocumentRow) {
  const restricted = row.visibility === 'internal';
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    eventDate: row.event_date,
    year: row.year,
    fileUrl: restricted ? null : row.file_url,
    fileName: restricted ? null : row.file_name,
    fileSize: restricted ? null : row.file_size,
    externalUrl: restricted ? null : row.external_url,
    links: restricted ? [] : sanitizeDocumentLinks(row.links),
    coverUrl: row.cover_url,
    orderIndex: row.order_index,
    scheduleEventId: row.schedule_event_id ?? null,
    competitionSlug: row.competition_slug ?? null,
    restricted,
  };
}
