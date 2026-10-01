import {
requireEditor
} from '../editorAuth.js';
import { getSupabaseAdminClient } from '../supabaseAdmin.js';
import { resolveBody,slugify } from './model.js';

export async function handleAdminArticles(req: any, res: any) {
  if (!requireEditor(req, res)) {
    return;
  }
  const supabase = getSupabaseAdminClient();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('content_articles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      res.status(500).json({ error: 'Failed to load articles.' });
      return;
    }
    res.status(200).json({ articles: data ?? [] });
    return;
  }

  if (req.method === 'POST') {
    const payload = resolveBody(req);
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    if (!title) {
      res.status(400).json({ error: 'Missing title.' });
      return;
    }
    const status =
      typeof payload.status === 'string' && ['draft', 'published'].includes(payload.status)
        ? payload.status
        : 'draft';
    const slug =
      typeof payload.slug === 'string' && payload.slug.trim().length > 0 ? payload.slug.trim() : slugify(title);
    const now = new Date().toISOString();
    const publishedAt = status === 'published' ? (payload.published_at as string | undefined) ?? now : null;

    const { data, error } = await supabase
      .from('content_articles')
      .insert({
        slug,
        title,
        excerpt: typeof payload.excerpt === 'string' ? payload.excerpt : null,
        body: typeof payload.body === 'string' ? payload.body : null,
        author: typeof payload.author === 'string' ? payload.author : null,
        cover_image_url: typeof payload.cover_image_url === 'string' ? payload.cover_image_url : null,
        cover_image_alt: typeof payload.cover_image_alt === 'string' ? payload.cover_image_alt : null,
        status,
        published_at: publishedAt,
      })
      .select('*')
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to create article.' });
      return;
    }
    res.status(200).json({ article: data });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

export async function handleAdminArticle(req: any, res: any, id: string) {
  if (!requireEditor(req, res)) {
    return;
  }
  const supabase = getSupabaseAdminClient();

  if (req.method === 'PUT') {
    const payload = resolveBody(req);
    const status =
      typeof payload.status === 'string' && ['draft', 'published'].includes(payload.status)
        ? payload.status
        : undefined;
    let publishedAt: string | null | undefined = undefined;

    if (status === 'draft') {
      publishedAt = null;
    } else if (status === 'published') {
      if (typeof payload.published_at === 'string' && payload.published_at.trim().length > 0) {
        publishedAt = payload.published_at;
      } else {
        const { data: existingArticle, error: existingArticleError } = await supabase
          .from('content_articles')
          .select('status,published_at')
          .eq('id', id)
          .maybeSingle();
        if (existingArticleError) {
          res.status(500).json({ error: 'Failed to load existing article state.' });
          return;
        }
        if (!existingArticle) {
          res.status(404).json({ error: 'Article not found.' });
          return;
        }
        const existingStatus = (existingArticle as { status?: string | null }).status ?? null;
        const existingPublishedAt = (existingArticle as { published_at?: string | null }).published_at ?? null;
        if (!(existingStatus === 'published' && existingPublishedAt)) {
          publishedAt = new Date().toISOString();
        }
      }
    }

    const update: Record<string, unknown> = {};
    if (typeof payload.slug === 'string') update.slug = payload.slug.trim();
    if (typeof payload.title === 'string') update.title = payload.title.trim();
    if (typeof payload.excerpt === 'string') update.excerpt = payload.excerpt;
    if (typeof payload.body === 'string') update.body = payload.body;
    if (typeof payload.author === 'string') update.author = payload.author;
    if (typeof payload.cover_image_url === 'string') update.cover_image_url = payload.cover_image_url;
    if (typeof payload.cover_image_alt === 'string') update.cover_image_alt = payload.cover_image_alt;
    if (status) update.status = status;
    if (publishedAt !== undefined) update.published_at = publishedAt;

    const { data, error } = await supabase
      .from('content_articles')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to update article.' });
      return;
    }
    res.status(200).json({ article: data });
    return;
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('content_articles').delete().eq('id', id);
    if (error) {
      res.status(500).json({ error: 'Failed to delete article.' });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
