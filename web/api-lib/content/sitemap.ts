import { logger } from '../logger.js';
import { fetchLocalArticleSummaries } from './articles/public.js';

export type SitemapStaticEntry = {
  path: string;
  changefreq?: string;
  priority?: number;
};

export const SITEMAP_BASE_URL = 'https://www.zelenaliga.cz';

export const SITEMAP_STATIC_ENTRIES: SitemapStaticEntry[] = [
  { path: '/', changefreq: 'weekly', priority: 1.0 },
  { path: '/souteze', changefreq: 'weekly', priority: 0.8 },
  { path: '/souteze/setonuv-zavod', changefreq: 'monthly', priority: 0.7 },
  { path: '/souteze/draci-smycka', changefreq: 'monthly', priority: 0.7 },
  { path: '/souteze/kosmuv-prostor', changefreq: 'monthly', priority: 0.7 },
  { path: '/souteze/ringobal', changefreq: 'monthly', priority: 0.7 },
  { path: '/souteze/deskove-hry', changefreq: 'monthly', priority: 0.7 },
  { path: '/souteze/brnenske-bloudeni', changefreq: 'monthly', priority: 0.7 },
  { path: '/souteze/piotrio', changefreq: 'monthly', priority: 0.7 },
  { path: '/souteze/karakoram', changefreq: 'monthly', priority: 0.7 },
  { path: '/souteze/lakros', changefreq: 'monthly', priority: 0.7 },
  { path: '/souteze/vybijena', changefreq: 'monthly', priority: 0.7 },
  { path: '/souteze/memorial-bedricha-stolicky', changefreq: 'monthly', priority: 0.7 },
  { path: '/aplikace', changefreq: 'monthly', priority: 0.6 },
  { path: '/aplikace/deskovky', changefreq: 'weekly', priority: 0.5 },
  { path: '/aplikace/deskovky/standings', changefreq: 'daily', priority: 0.5 },
  { path: '/aplikace/deskovky/pravidla', changefreq: 'monthly', priority: 0.4 },
  { path: '/aktualni-poradi', changefreq: 'weekly', priority: 0.7 },
  { path: '/plan-akci', changefreq: 'monthly', priority: 0.7 },
  { path: '/oddily', changefreq: 'weekly', priority: 0.7 },
  { path: '/fotogalerie', changefreq: 'daily', priority: 0.7 },
  { path: '/clanky', changefreq: 'daily', priority: 0.8 },
  { path: '/o-spto', changefreq: 'monthly', priority: 0.6 },
  { path: '/sponzori', changefreq: 'monthly', priority: 0.6 },
  { path: '/kontakty', changefreq: 'monthly', priority: 0.6 },
];

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function normalizeSitemapLastmod(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return new Date(timestamp).toISOString();
}

export function renderSitemapUrl(params: { loc: string; lastmod?: string; changefreq?: string; priority?: number }): string {
  const lines = ['  <url>', `    <loc>${escapeXml(params.loc)}</loc>`];
  if (params.lastmod) {
    lines.push(`    <lastmod>${escapeXml(params.lastmod)}</lastmod>`);
  }
  if (params.changefreq) {
    lines.push(`    <changefreq>${params.changefreq}</changefreq>`);
  }
  if (typeof params.priority === 'number') {
    lines.push(`    <priority>${params.priority.toFixed(1)}</priority>`);
  }
  lines.push('  </url>');
  return lines.join('\n');
}

export async function handlePublicSitemap(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { articles } = await fetchLocalArticleSummaries({ limit: 3 });
    const latestArticles = articles
      .map((article) => {
        const lastmod = normalizeSitemapLastmod(article.dateISO);
        return renderSitemapUrl({
          loc: `${SITEMAP_BASE_URL}/clanky/${encodeURIComponent(article.slug)}`,
          lastmod: lastmod ?? undefined,
          changefreq: 'daily',
          priority: 0.7,
        });
      });

    const staticUrls = SITEMAP_STATIC_ENTRIES.map((entry) =>
      renderSitemapUrl({
        loc: `${SITEMAP_BASE_URL}${entry.path}`,
        changefreq: entry.changefreq,
        priority: entry.priority,
      }),
    );

    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...staticUrls,
      ...latestArticles,
      '</urlset>',
    ].join('\n');

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=300');
    if (req.method === 'HEAD') {
      res.status(200).end();
      return;
    }
    res.status(200).send(body);
  } catch (error) {
    logger.error('[api/content/sitemap] failed', error);
    res.status(500).json({ error: 'Failed to load sitemap.' });
  }
}
