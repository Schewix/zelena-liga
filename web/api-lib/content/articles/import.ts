import { logger } from '../../logger.js';
import {
requireEditor
} from '../editorAuth.js';
import {
fetchPionyrArticleBySlug,
fetchPionyrArticles,
type PionyrArticle,
} from '../pionyr.js';
import { getSupabaseAdminClient } from '../supabaseAdmin.js';
import { ImportedArticleRow,PublicArticle } from './model.js';

export function mapPionyr(article: PionyrArticle): PublicArticle {
  return {
    source: 'pionyr',
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    dateISO: article.dateISO,
    author: article.author ?? null,
    coverImage: article.coverImageUrl ? { url: article.coverImageUrl, alt: article.coverImageAlt } : null,
    body: article.bodyHtml ?? null,
    bodyFormat: 'html',
  };
}

export const SYNC_EDIT_GRACE_MS = 60_000;

export function wasEditedAfterSync(row: { updated_at?: string | null; synced_at?: string | null }) {
  if (!row.updated_at || !row.synced_at) {
    return false;
  }
  const updatedAt = Date.parse(row.updated_at);
  const syncedAt = Date.parse(row.synced_at);
  if (!Number.isFinite(updatedAt) || !Number.isFinite(syncedAt)) {
    return false;
  }
  return updatedAt - syncedAt > SYNC_EDIT_GRACE_MS;
}

export function formatImportError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function isImportAuthorized(req: any, res: any): boolean {
  const secret = process.env.CONTENT_IMPORT_SECRET ?? '';
  const cronSecret = process.env.CRON_SECRET ?? '';
  const authHeader = typeof req.headers?.authorization === 'string' ? req.headers.authorization : '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (cronSecret && bearerToken === cronSecret) {
    return true;
  }
  if (secret) {
    const querySecret = typeof req.query?.secret === 'string' ? req.query.secret : '';
    const headerSecret = typeof req.headers?.['x-import-secret'] === 'string' ? req.headers['x-import-secret'] : '';
    if (querySecret === secret || headerSecret === secret) {
      return true;
    }
  }
  return requireEditor(req, res);
}

export async function handleAdminImport(req: any, res: any) {
  if (!isImportAuthorized(req, res)) {
    return;
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const includeErrorDetails =
    process.env.NODE_ENV !== 'production' ||
    req.query?.debug === '1' ||
    req.headers?.['x-debug-import'] === '1';

  try {
    const list = await fetchPionyrArticles();
    const { cachePionyrArticleImages } = await import('../articleImageR2.js');
    const enriched = await Promise.all(
      list.map(async (article) => {
        const detail = await fetchPionyrArticleBySlug(article.slug);
        const withDetail = detail
          ? {
              ...article,
              ...detail,
              excerpt: detail.excerpt || article.excerpt,
              dateISO: detail.dateISO || article.dateISO,
              coverImageUrl: detail.coverImageUrl || article.coverImageUrl,
              coverImageAlt: detail.coverImageAlt || article.coverImageAlt,
            }
          : article;
        return cachePionyrArticleImages(withDetail);
      }),
    );

    const now = new Date().toISOString();
    const rows = enriched.map((article) => ({
      slug: article.slug,
      title: article.title,
      excerpt: article.excerpt ?? '',
      body: article.bodyHtml ?? null,
      author: article.author ?? null,
      cover_image_url: article.coverImageUrl ?? null,
      cover_image_alt: article.coverImageAlt ?? null,
      status: 'published',
      published_at: article.dateISO ?? now,
      source: 'pionyr',
      external_id: article.slug,
      synced_at: now,
    }));

    const supabase = getSupabaseAdminClient();
    const { data: existingRows, error: existingError } = await supabase
      .from('content_articles')
      .select('id,external_id,updated_at,synced_at')
      .eq('source', 'pionyr');
    if (existingError) {
      logger.error('[api/content/import] failed to load existing rows', existingError);
      res.status(500).json({
        error: 'Failed to load imported articles.',
        ...(includeErrorDetails ? { details: formatImportError(existingError) } : {}),
      });
      return;
    }

    const existingByExternalId = new Map<string, ImportedArticleRow>();
    (existingRows ?? []).forEach((row: ImportedArticleRow) => {
      if (typeof row.external_id === 'string' && row.external_id.trim()) {
        existingByExternalId.set(row.external_id, row);
      }
    });

    const upserts: typeof rows = [];
    const skipped: string[] = [];
    rows.forEach((row) => {
      const existing = existingByExternalId.get(row.external_id);
      if (existing && wasEditedAfterSync(existing)) {
        skipped.push(row.external_id);
        return;
      }
      upserts.push(row);
    });

    if (upserts.length > 0) {
      const { error: upsertError } = await supabase
        .from('content_articles')
        .upsert(upserts, { onConflict: 'source,external_id' });
      if (upsertError) {
        logger.error('[api/content/import] failed to upsert rows', upsertError);
        res.status(500).json({
          error: 'Failed to import articles.',
          ...(includeErrorDetails ? { details: formatImportError(upsertError) } : {}),
        });
        return;
      }
    }

    const incomingExternalIds = new Set(rows.map((row) => row.external_id));
    const deleteIds = (existingRows ?? [])
      .filter((row: ImportedArticleRow) => {
        if (!row.external_id || incomingExternalIds.has(row.external_id)) {
          return false;
        }
        return !wasEditedAfterSync(row);
      })
      .map((row: ImportedArticleRow) => row.id);

    if (deleteIds.length > 0) {
      const { error: deleteError } = await supabase.from('content_articles').delete().in('id', deleteIds);
      if (deleteError) {
        logger.error('[api/content/import] failed to delete stale rows', deleteError);
        res.status(500).json({
          error: 'Failed to clear imported articles.',
          ...(includeErrorDetails ? { details: formatImportError(deleteError) } : {}),
        });
        return;
      }
    }

    res.status(200).json({
      ok: true,
      imported: rows.length,
      updated: upserts.length,
      skipped: skipped.length,
      deleted: deleteIds.length,
    });
  } catch (error) {
    logger.error('[api/content/import] failed', error);
    res.status(500).json({
      error: 'Failed to import articles.',
      ...(includeErrorDetails ? { details: formatImportError(error) } : {}),
    });
  }
}
