import { COMPETITIONS } from '../../src/homepage/data/competitions.js';
import {
  SPTO_CHIEFS,
  SPTO_FOUNDING_HIGHLIGHTS,
  SPTO_HISTORY_HIGHLIGHTS,
} from '../../src/homepage/data/about.js';
import { CONTACTS } from '../../src/homepage/data/contacts.js';
import { DEFAULT_SEO, ROUTE_SEO, SITE_URL } from '../../src/seo/routeSeo.js';
import type { PublicArticle } from './articles/model.js';
import type { PublicLeagueSeason } from './league.js';

// Předrenderování veřejných stránek pro crawlery, které nespouštějí JavaScript (AI vyhledávače, náhledy odkazů).
// Aplikace po načtení obsah #root nahradí, takže uživatelé vidí vždy normální SPA.

export type ScheduleItem = {
  name: string;
  start: string;
  end?: string | null;
  kind: string;
  note?: string | null;
  href?: string | null;
};

export type SeoDeps = {
  loadArticle: (slug: string) => Promise<PublicArticle | null>;
  loadArticles: (limit: number) => Promise<PublicArticle[]>;
  loadSchedule: () => Promise<ScheduleItem[]>;
  loadLeagueSeason: () => Promise<PublicLeagueSeason | null>;
};

export type SeoPage = {
  status: number;
  title: string;
  description: string;
  canonicalPath: string;
  robots: string;
  bodyHtml: string;
  jsonLd: Array<Record<string, unknown>>;
};

const SITE_NAME = 'Zelená liga';
const TITLE_SUFFIX = / \| Zelená liga$| \| zelenaliga\.cz$/;

// Stránky, které nemají být indexované ani předrenderované (aplikace pro rozhodčí, admin, výsledky pro výpočetku).
const PRIVATE_PREFIXES = [
  '/aplikace/setonuv-zavod',
  '/aplikace/deskovky/admin',
  '/admin',
  '/redakce',
  '/stanoviste',
  '/stations',
  '/scoreboard',
  '/vysledky',
  '/auth',
];

const MAIN_LINKS: Array<[string, string]> = [
  ['/souteze', 'Soutěže'],
  ['/aktualni-poradi', 'Aktuální pořadí'],
  ['/plan-akci', 'Plán akcí'],
  ['/clanky', 'Články'],
  ['/oddily', 'Oddíly'],
  ['/fotogalerie', 'Fotogalerie'],
  ['/o-spto', 'O SPTO'],
  ['/kontakty', 'Kontakty'],
];

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

export function htmlToText(value: string): string {
  return value
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export function normalizeSeoPath(raw: string): string {
  let path = raw.split(/[?#]/)[0] || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path;
}

export function isPrivatePath(path: string): boolean {
  return PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function paragraphs(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}

function linkList(items: Array<[string, string]>): string {
  return `<ul>${items
    .map(([href, label]) => `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`)
    .join('')}</ul>`;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function truncateAtWord(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:–-]+$/, '')}…`;
}

function pageHeading(title: string): string {
  return title.replace(TITLE_SUFFIX, '');
}

function baseNav(): string {
  return `<nav aria-label="Hlavní navigace">${linkList(MAIN_LINKS)}</nav>`;
}

function staticPage(path: string, title: string, description: string, extra = ''): SeoPage {
  return {
    status: 200,
    title,
    description,
    canonicalPath: path,
    robots: 'index,follow',
    bodyHtml: `<main><h1>${escapeHtml(pageHeading(title))}</h1><p>${escapeHtml(description)}</p>${extra}</main>${baseNav()}`,
    // Organization a WebSite JSON-LD jsou už v šabloně index.html.
    jsonLd: [],
  };
}

async function safe<T>(task: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await task();
  } catch {
    return fallback;
  }
}

export async function buildSeoPage(rawPath: string, deps: SeoDeps): Promise<SeoPage> {
  const requested = normalizeSeoPath(rawPath);
  const path = requested === '/zelena-liga' ? '/aktualni-poradi' : requested;

  if (isPrivatePath(path)) {
    return {
      status: 200,
      title: DEFAULT_SEO.title,
      description: DEFAULT_SEO.description,
      canonicalPath: path,
      robots: 'noindex,nofollow',
      bodyHtml: '',
      jsonLd: [],
    };
  }

  if (path.startsWith('/clanky/')) {
    const slug = decodeURIComponent(path.slice('/clanky/'.length).split('/')[0] ?? '');
    const article = slug ? await safe(() => deps.loadArticle(slug), null) : null;
    if (!article) {
      return { ...staticPage(path, 'Článek nenalezen | Zelená liga', 'Požadovaný článek neexistuje.'), status: 404, robots: 'noindex,nofollow' };
    }
    const bodyText = article.body
      ? article.bodyFormat === 'html' ? htmlToText(article.body) : article.body
      : article.excerpt;
    const description = truncateAtWord(article.excerpt || bodyText, 300);
    const image = article.coverImage?.url ?? undefined;
    return {
      status: 200,
      title: `${article.title} | Zelená liga`,
      description,
      canonicalPath: path,
      robots: 'index,follow',
      bodyHtml: `<article><h1>${escapeHtml(article.title)}</h1>${
        article.dateISO ? `<p><time datetime="${escapeHtml(article.dateISO)}">${escapeHtml(article.dateISO.slice(0, 10))}</time>${article.author ? ` · ${escapeHtml(article.author)}` : ''}</p>` : ''
      }${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(article.coverImage?.alt ?? article.title)}" />` : ''}${paragraphs(bodyText)}</article>${baseNav()}`,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: article.title,
          description,
          datePublished: article.dateISO,
          ...(article.author ? { author: { '@type': 'Person', name: article.author } } : {}),
          ...(image ? { image } : {}),
          mainEntityOfPage: `${SITE_URL}${path}`,
          publisher: { '@type': 'Organization', name: SITE_NAME, logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon-512.png` } },
        },
      ],
    };
  }

  const known = ROUTE_SEO[path];
  const competition = path.startsWith('/souteze/')
    ? COMPETITIONS.find((item) => item.href === path)
    : undefined;

  if (path === '/clanky') {
    const articles = await safe(() => deps.loadArticles(12), [] as PublicArticle[]);
    const list = articles.length
      ? `<ul>${articles.map((article) => `<li><a href="/clanky/${encodeURIComponent(article.slug)}">${escapeHtml(article.title)}</a>${article.excerpt ? ` – ${escapeHtml(article.excerpt)}` : ''}</li>`).join('')}</ul>`
      : '';
    const page = staticPage(path, known.title, known.description, list);
    return page;
  }

  if (path === '/plan-akci') {
    const events = (await safe(() => deps.loadSchedule(), [] as ScheduleItem[]))
      .filter((event) => event.kind === 'event' || event.kind === 'assembly' || event.kind === 'staff');
    const list = events.length
      ? `<ul>${events.map((event) => `<li>${escapeHtml(formatDate(event.start))}${event.end ? ` – ${escapeHtml(formatDate(event.end))}` : ''}: ${escapeHtml(event.name)}${event.note ? ` (${escapeHtml(event.note)})` : ''}</li>`).join('')}</ul>`
      : '';
    const page = staticPage(path, known.title, known.description, list);
    page.jsonLd.push(
      ...events
        .filter((event) => event.kind === 'event')
        .map((event) => ({
          '@context': 'https://schema.org',
          '@type': 'Event',
          name: event.name,
          startDate: event.start,
          ...(event.end ? { endDate: event.end } : {}),
          eventStatus: 'https://schema.org/EventScheduled',
          eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
          location: { '@type': 'Place', name: 'Brno a okolí' },
          organizer: { '@type': 'Organization', name: 'SPTO Brno', url: `${SITE_URL}/` },
          ...(event.note ? { description: event.note } : {}),
          url: `${SITE_URL}${event.href || path}`,
        })),
    );
    return page;
  }

  if (path === '/aktualni-poradi') {
    const season = await safe(() => deps.loadLeagueSeason(), null);
    let table = '';
    if (season && season.troops.length > 0) {
      const totals = season.troops
        .map((troop) => ({
          name: troop.name,
          total: season.scores
            .filter((score) => score.troop_id === troop.id)
            .reduce((sum, score) => sum + (score.points ?? 0), 0),
        }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'cs'));
      table = `<h2>${escapeHtml(season.name)}</h2><ol>${totals
        .map((row) => `<li>${escapeHtml(row.name)} – ${row.total} b.</li>`)
        .join('')}</ol>`;
    }
    return staticPage(path, known.title, known.description, table);
  }

  if (path === '/souteze' || path === '/') {
    const list = `<h2>Soutěže Zelené ligy</h2><ul>${COMPETITIONS.map((item) => `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.name)}</a>${item.description ? ` – ${escapeHtml(item.description)}` : ''}</li>`).join('')}</ul>`;
    const page = staticPage(path, known?.title ?? DEFAULT_SEO.title, known?.description ?? DEFAULT_SEO.description, list);
    return page;
  }

  if (competition) {
    const page = staticPage(
      path,
      known?.title ?? `${competition.name} | Zelená liga`,
      known?.description ?? competition.description ?? DEFAULT_SEO.description,
      competition.description ? `<p>${escapeHtml(competition.description)}</p>` : '',
    );
    return page;
  }

  if (path === '/o-spto') {
    const list = (items: string[]) => `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    const chiefs = `<h2>Náčelníci SPTO</h2><ul>${SPTO_CHIEFS.map((chief) => `<li>${escapeHtml(chief.name)} (${escapeHtml(chief.term)})</li>`).join('')}</ul>`;
    return staticPage(path, known.title, known.description,
      `<h2>Historie</h2>${list(SPTO_HISTORY_HIGHLIGHTS)}<h2>Založení SPTO</h2>${list(SPTO_FOUNDING_HIGHLIGHTS)}${chiefs}`);
  }

  if (path === '/kontakty') {
    const people = `<ul>${CONTACTS.map((contact) => `<li>${escapeHtml(contact.role)}: ${escapeHtml(contact.name)}</li>`).join('')}</ul>`;
    return staticPage(path, known.title, known.description, people);
  }

  if (known) {
    return staticPage(path, known.title, known.description);
  }

  // Dynamické podstránky bez vlastních dat (oddíl, album): obecný titulek a popisek.
  if (path.startsWith('/oddily/')) {
    return staticPage(path, 'Oddíl SPTO | Zelená liga', 'Profil oddílu zapojeného do Zelené ligy a SPTO Brno.');
  }
  if (path.startsWith('/fotogalerie/')) {
    return staticPage(path, 'Fotogalerie | Zelená liga', 'Album fotografií ze soutěží a akcí Zelené ligy.');
  }

  return { ...staticPage(path, DEFAULT_SEO.title, DEFAULT_SEO.description), status: 200 };
}

function replaceTag(html: string, pattern: RegExp, replacement: string): string {
  return pattern.test(html) ? html.replace(pattern, replacement) : html.replace('</head>', `${replacement}\n</head>`);
}

export function renderSeoHtml(template: string, page: SeoPage): string {
  const canonical = `${SITE_URL}${page.canonicalPath === '/' ? '/' : page.canonicalPath}`;
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  let html = template;
  html = replaceTag(html, /<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  html = replaceTag(html, /<meta\s+name="description"[\s\S]*?\/>/i, `<meta name="description" content="${description}" />`);
  html = replaceTag(html, /<link\s+rel="canonical"[^>]*\/>/i, `<link rel="canonical" href="${escapeHtml(canonical)}" />`);
  html = replaceTag(html, /<meta\s+name="robots"[^>]*\/>/i, `<meta name="robots" content="${page.robots}" />`);
  html = replaceTag(html, /<meta\s+property="og:title"[\s\S]*?\/>/i, `<meta property="og:title" content="${title}" />`);
  html = replaceTag(html, /<meta\s+property="og:description"[\s\S]*?\/>/i, `<meta property="og:description" content="${description}" />`);
  html = replaceTag(html, /<meta\s+property="og:url"[^>]*\/>/i, `<meta property="og:url" content="${escapeHtml(canonical)}" />`);
  const jsonLd = page.jsonLd
    .map((item) => `<script type="application/ld+json">${JSON.stringify(item).replace(/</g, '\\u003c')}</script>`)
    .join('\n');
  if (jsonLd) {
    html = html.replace('</head>', `${jsonLd}\n</head>`);
  }
  if (page.bodyHtml) {
    html = html.replace('</head>', '<style>#root>main,#root>article,#root>nav{font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:16px}</style>\n</head>');
    html = html.replace(/<div id="root">\s*<\/div>/, `<div id="root">${page.bodyHtml}</div>`);
  }
  return html;
}
