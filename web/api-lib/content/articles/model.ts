

export type LocalArticleRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  author: string | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  status: string;
  published_at: string | null;
  created_at: string;
  source?: string | null;
  external_id?: string | null;
  external_url?: string | null;
  synced_at?: string | null;
};

export type LocalArticleSummaryRow = Pick<
  LocalArticleRow,
  | 'slug'
  | 'title'
  | 'excerpt'
  | 'author'
  | 'cover_image_url'
  | 'cover_image_alt'
  | 'published_at'
  | 'created_at'
  | 'source'
>;

export type ImportedArticleRow = {
  id: string;
  external_id: string | null;
  updated_at: string | null;
  synced_at: string | null;
};

export type PublicArticle = {
  source: 'pionyr' | 'local';
  slug: string;
  title: string;
  excerpt: string;
  dateISO: string;
  author?: string | null;
  coverImage?: { url: string | null; alt?: string | null } | null;
  body?: string | null;
  bodyFormat?: 'html' | 'text' | null;
};

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function resolveBody(req: any): Record<string, unknown> {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (req.body && typeof req.body === 'object') {
    return req.body as Record<string, unknown>;
  }
  return {};
}

export function mapLocalRow(row: LocalArticleRow): PublicArticle {
  const source = row.source === 'pionyr' ? 'pionyr' : 'local';
  return {
    source,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt ?? '',
    dateISO: row.published_at ?? row.created_at,
    author: row.author,
    coverImage: row.cover_image_url ? { url: row.cover_image_url, alt: row.cover_image_alt } : null,
    body: row.body,
    bodyFormat: source === 'pionyr' ? 'html' : 'text',
  };
}

export function mapLocalSummaryRow(row: LocalArticleSummaryRow): PublicArticle {
  const source = row.source === 'pionyr' ? 'pionyr' : 'local';
  return {
    source,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt ?? '',
    dateISO: row.published_at ?? row.created_at,
    author: row.author,
    coverImage: row.cover_image_url ? { url: row.cover_image_url, alt: row.cover_image_alt } : null,
  };
}
