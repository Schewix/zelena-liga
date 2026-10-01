import { fetchPionyrArticleBySlug } from '../api-lib/content/pionyr.js';
import { fetchLocalArticleSummaries } from '../api-lib/content/articles/public.js';
import { mapLocalRow, type LocalArticleRow, type PublicArticle } from '../api-lib/content/articles/model.js';
import { mapPionyr } from '../api-lib/content/articles/import.js';
import { loadLeagueSeasons } from '../api-lib/content/league.js';
import { type ScheduleEventRow, toPublicScheduleEvent } from '../api-lib/content/schedule.js';
import { buildSeoPage, renderSeoHtml, type SeoDeps } from '../api-lib/content/seoPage.js';
import { getSupabaseAdminClient } from '../api-lib/content/supabaseAdmin.js';
import { withLogging } from '../api-lib/logger.js';

const TEMPLATE_TTL_MS = 60_000;
let templateCache: { html: string; origin: string; expiresAt: number } | null = null;

// Nasazený index.html (se správnými hashovanými skripty) se bere ze statických souborů vlastního nasazení.
async function loadTemplate(origin: string, cookie?: string): Promise<string | null> {
  if (templateCache && templateCache.origin === origin && templateCache.expiresAt > Date.now()) {
    return templateCache.html;
  }
  try {
    const response = await fetch(`${origin}/index.html`, { headers: cookie ? { cookie } : {} });
    if (!response.ok) return null;
    const html = await response.text();
    if (!html.includes('<div id="root">')) return null;
    templateCache = { html, origin, expiresAt: Date.now() + TEMPLATE_TTL_MS };
    return html;
  } catch {
    return null;
  }
}

const deps: SeoDeps = {
  async loadArticle(slug) {
    const supabase = getSupabaseAdminClient();
    const { data } = await supabase
      .from('content_articles')
      .select('id,slug,title,excerpt,body,author,cover_image_url,cover_image_alt,status,published_at,created_at,source')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();
    if (data) return mapLocalRow(data as LocalArticleRow);
    const pionyr = await fetchPionyrArticleBySlug(slug);
    return pionyr ? (mapPionyr(pionyr) as PublicArticle) : null;
  },
  async loadArticles(limit) {
    return (await fetchLocalArticleSummaries({ limit })).articles;
  },
  async loadSchedule() {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('content_schedule_events')
      .select('*')
      .eq('published', true)
      .order('start_date', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as ScheduleEventRow[]).map(toPublicScheduleEvent).map((event) => ({
      name: event.name,
      start: event.start,
      end: event.end,
      kind: event.kind,
      note: event.note,
      href: event.href,
    }));
  },
  async loadLeagueSeason() {
    const payload = await loadLeagueSeasons(getSupabaseAdminClient());
    return payload.seasons.find((season) => season.id === payload.activeSeasonId) ?? null;
  },
};

async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const rawPath = typeof req.query?.path === 'string' ? req.query.path : '/';
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  const proto = req.headers['x-forwarded-proto'] ?? 'https';
  const origin = `${proto}://${host}`;

  const template = await loadTemplate(origin, typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined);
  if (!template) {
    // Bez šablony nelze složit stránku – klient dostane SPA stejně jako dřív.
    res.redirect(307, '/');
    return;
  }

  const page = await buildSeoPage(rawPath, deps);
  const html = renderSeoHtml(template, page);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    page.status === 200 ? 'public, max-age=0, s-maxage=900, stale-while-revalidate=86400' : 'public, max-age=0, s-maxage=60',
  );
  res.status(page.status);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.send(html);
}

export default withLogging('/api/seo', handler);
