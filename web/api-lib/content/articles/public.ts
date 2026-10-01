import { logger } from '../../logger.js';
import {
fetchPionyrArticleBySlug
} from '../pionyr.js';
import { getSupabaseAdminClient } from '../supabaseAdmin.js';
import { parseNonNegativeInt } from '../validation.js';
import { mapPionyr } from './import.js';
import { LocalArticleRow,LocalArticleSummaryRow,PublicArticle,mapLocalRow,mapLocalSummaryRow } from './model.js';

export const PUBLIC_ARTICLE_PAGE_SIZE = 12;

export const PUBLIC_ARTICLE_MAX_PAGE_SIZE = 50;

export async function fetchLocalArticleSummaries({
  limit,
  offset = 0,
}: {
  limit: number;
  offset?: number;
}): Promise<{ articles: PublicArticle[]; hasMore: boolean }> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('content_articles')
    .select('slug,title,excerpt,author,cover_image_url,cover_image_alt,published_at,created_at,source')
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit);

  if (error) {
    logger.error('[api/content] supabase error', error);
    throw error;
  }

  const rows = (data ?? []) as LocalArticleSummaryRow[];
  return {
    articles: rows.slice(0, limit).map(mapLocalSummaryRow),
    hasMore: rows.length > limit,
  };
}

export async function handlePublicList(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400');
  try {
    const requestedLimit = parseNonNegativeInt(req.query?.limit, PUBLIC_ARTICLE_PAGE_SIZE);
    const limit = Math.min(PUBLIC_ARTICLE_MAX_PAGE_SIZE, Math.max(1, requestedLimit));
    const offset = parseNonNegativeInt(req.query?.offset, 0);
    const { articles, hasMore } = await fetchLocalArticleSummaries({ limit, offset });
    res.status(200).json({
      articles,
      hasMore,
      nextOffset: hasMore ? offset + articles.length : null,
    });
  } catch (error) {
    logger.error('[api/content/articles] failed', error);
    res.status(500).json({ error: 'Failed to load articles.' });
  }
}

export async function handlePublicDetail(req: any, res: any, slug: string) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400');
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('content_articles')
      .select(
        'id,slug,title,excerpt,body,author,cover_image_url,cover_image_alt,status,published_at,created_at,source',
      )
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();

    if (!error && data) {
      const row = data as LocalArticleRow;
      res.status(200).json({ article: mapLocalRow(row) });
      return;
    }

    const pionyrArticle = await fetchPionyrArticleBySlug(slug);
    if (!pionyrArticle) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json({ article: mapPionyr(pionyrArticle) });
  } catch (error) {
    logger.error('[api/content/articles/[slug]] failed', error);
    res.status(500).json({ error: 'Failed to load article.' });
  }
}
