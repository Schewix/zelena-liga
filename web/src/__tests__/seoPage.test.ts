import { describe, expect, it } from 'vitest';
import { buildSeoPage, renderSeoHtml, type SeoDeps } from '../../api-lib/content/seoPage';

const deps: SeoDeps = {
  loadArticle: async (slug) =>
    slug === 'zavod'
      ? {
          source: 'local',
          slug,
          title: 'Setonův závod <2026>',
          excerpt: 'Shrnutí závodu.',
          dateISO: '2026-04-24T10:00:00Z',
          author: 'Redakce',
          body: 'První odstavec.\nDruhý odstavec.',
          bodyFormat: 'text',
        }
      : null,
  loadArticles: async () => [
    { source: 'local', slug: 'zavod', title: 'Závod', excerpt: 'Ex', dateISO: '2026-04-24' },
  ],
  loadSchedule: async () => [
    { name: 'Setonův závod', start: '2027-04-24', kind: 'event', href: '/souteze/setonuv-zavod' },
    { name: 'Štáb SPTO', start: '2027-05-04', kind: 'staff' },
  ],
  loadLeagueSeason: async () => ({
    id: 's',
    name: 'Ročník 2025/2026',
    isActive: true,
    troops: [
      { id: 'a', name: 'Severka', order: 0 },
      { id: 'b', name: 'Lorien', order: 1 },
    ],
    events: [],
    scores: [
      { troop_id: 'a', event_key: 'x', points: 5 },
      { troop_id: 'b', event_key: 'x', points: 9 },
    ],
  }),
};

const template = `<!doctype html><html><head><title>Zelená liga | zelenaliga.cz</title>
<meta name="description" content="x" />
<link rel="canonical" href="https://www.zelenaliga.cz/" />
<meta name="robots" content="index,follow" />
<meta property="og:title" content="x" />
<meta property="og:description" content="x" />
<meta property="og:url" content="https://www.zelenaliga.cz/" />
</head><body><div id="root"></div></body></html>`;

describe('seo prerender', () => {
  it('renders an article with escaped content and Article JSON-LD', async () => {
    const page = await buildSeoPage('/clanky/zavod', deps);
    const html = renderSeoHtml(template, page);
    expect(page.status).toBe(200);
    expect(html).toContain('<title>Setonův závod &lt;2026&gt; | Zelená liga</title>');
    expect(html).toContain('<p>Druhý odstavec.</p>');
    expect(html).toContain('href="https://www.zelenaliga.cz/clanky/zavod"');
    expect(html).toContain('"@type":"Article"');
  });

  it('truncates long descriptions at a word boundary', async () => {
    const long = Array.from({ length: 80 }, () => 'slovo').join(' ');
    const page = await buildSeoPage('/clanky/dlouhy', {
      ...deps,
      loadArticle: async (slug) => ({ source: 'local', slug, title: 'T', excerpt: long, dateISO: '2026-01-01' }),
    });
    expect(page.description.endsWith('slovo…')).toBe(true);
    expect(page.description.length).toBeLessThanOrEqual(301);
  });

  it('does not duplicate Organization JSON-LD already present in the template', async () => {
    const page = await buildSeoPage('/souteze', deps);
    expect(page.jsonLd).toHaveLength(0);
  });

  it('returns 404 noindex for a missing article', async () => {
    const page = await buildSeoPage('/clanky/neexistuje', deps);
    expect(page.status).toBe(404);
    expect(page.robots).toBe('noindex,nofollow');
  });

  it('lists schedule with Event JSON-LD only for events', async () => {
    const page = await buildSeoPage('/plan-akci', deps);
    const events = page.jsonLd.filter((item) => item['@type'] === 'Event');
    expect(events).toHaveLength(1);
    expect(page.bodyHtml).toContain('Štáb SPTO');
  });

  it('ranks troops by total points', async () => {
    const page = await buildSeoPage('/aktualni-poradi', deps);
    expect(page.bodyHtml.indexOf('Lorien')).toBeLessThan(page.bodyHtml.indexOf('Severka'));
  });

  it('keeps private app routes out of the index', async () => {
    const page = await buildSeoPage('/aplikace/setonuv-zavod/vysledky', deps);
    expect(page.robots).toBe('noindex,nofollow');
    expect(page.bodyHtml).toBe('');
  });

  it('survives data loading failures', async () => {
    const failing: SeoDeps = {
      ...deps,
      loadSchedule: async () => {
        throw new Error('db');
      },
      loadLeagueSeason: async () => {
        throw new Error('db');
      },
    };
    expect((await buildSeoPage('/plan-akci', failing)).status).toBe(200);
    expect((await buildSeoPage('/aktualni-poradi', failing)).status).toBe(200);
  });
});
