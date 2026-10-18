import { logger } from '../logger.js';
import { SITEMAP_BASE_URL } from './sitemap.js';
import { getSupabaseAdminClient } from './supabaseAdmin.js';

const DEFAULT_RECIPIENTS = ['osevcik@severka.org'];

export type NotifiableItem = {
  key: string;
  kind: 'article' | 'album';
  title: string;
  url: string;
  detail: string | null;
};

function getRecipients(): string[] {
  const raw = process.env.CONTENT_NOTIFY_EMAILS ?? '';
  const parsed = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_RECIPIENTS;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

async function loadArticles(): Promise<NotifiableItem[]> {
  const { data, error } = await getSupabaseAdminClient()
    .from('content_articles')
    .select('slug,title,excerpt')
    .eq('status', 'published');
  if (error) {
    throw error;
  }
  return (data ?? []).map((row: { slug: string; title: string; excerpt: string | null }) => ({
    key: `article:${row.slug}`,
    kind: 'article',
    title: row.title,
    url: `${SITEMAP_BASE_URL}/clanky/${encodeURIComponent(row.slug)}`,
    detail: row.excerpt?.trim() || null,
  }));
}

async function loadAlbums(): Promise<NotifiableItem[]> {
  const response = await fetch(`${SITEMAP_BASE_URL}/api/gallery`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`Gallery request failed (${response.status}).`);
  }
  const payload = (await response.json()) as { albums?: Array<{ slug?: string; title?: string; year?: string }> };
  return (payload.albums ?? [])
    .filter((album) => album.slug && album.title)
    .map((album) => ({
      key: `album:${album.slug}`,
      kind: 'album',
      title: album.title!,
      url: `${SITEMAP_BASE_URL}/fotogalerie/${encodeURIComponent(album.slug!)}`,
      detail: album.year ? `Rok ${album.year}` : null,
    }));
}

export function buildNotificationEmail(items: NotifiableItem[]) {
  const articles = items.filter((item) => item.kind === 'article');
  const albums = items.filter((item) => item.kind === 'album');
  const parts: string[] = [];
  if (articles.length > 0) parts.push(articles.length === 1 ? 'nový článek' : `nové články (${articles.length})`);
  if (albums.length > 0) parts.push(albums.length === 1 ? 'nové fotoalbum' : `nová fotoalba (${albums.length})`);
  const subject =
    items.length === 1
      ? `${items[0].kind === 'article' ? 'Nový článek' : 'Nové fotoalbum'}: ${items[0].title}`
      : `Na webu Zelené ligy: ${parts.join(' a ')}`;

  const htmlSection = (heading: string, list: NotifiableItem[]) =>
    list.length === 0
      ? ''
      : `<h2 style="margin:24px 0 8px;font-size:16px;color:#06642b;">${heading}</h2>
    <ul style="margin:0;padding-left:20px;">${list
      .map(
        (item) =>
          `<li style="margin:0 0 12px;"><a href="${escapeHtml(item.url)}" style="color:#0b8e3f;font-weight:600;">${escapeHtml(item.title)}</a>${
            item.detail ? `<br><span style="font-size:13px;color:#64748b;">${escapeHtml(item.detail)}</span>` : ''
          }</li>`,
      )
      .join('')}</ul>`;

  const html = `<!DOCTYPE html>
<html lang="cs"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#333;">
  <div style="background:linear-gradient(to right,#0b8e3f,#06642b);padding:28px 20px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">Zelená liga</h1>
    <p style="color:rgba(255,255,255,.9);margin:4px 0 0;font-size:13px;">SPTO Brno</p>
  </div>
  <div style="max-width:600px;margin:0 auto;background:#fff;padding:32px 24px;">
    <p style="margin:0;font-size:16px;">Na webu Zelené ligy přibyl nový obsah.</p>
    ${htmlSection('Články', articles)}
    ${htmlSection('Fotoalba', albums)}
  </div>
</body></html>`;

  const textSection = (heading: string, list: NotifiableItem[]) =>
    list.length === 0 ? [] : ['', `${heading}:`, ...list.map((item) => `- ${item.title}\n  ${item.url}`)];
  const text = [
    'Na webu Zelené ligy přibyl nový obsah.',
    ...textSection('Články', articles),
    ...textSection('Fotoalba', albums),
  ].join('\n');

  return { subject, html, text };
}

export async function sendNotificationEmail(items: NotifiableItem[], recipients = getRecipients()) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY environment variable.');
  }
  const from = process.env.TRANSACTIONAL_FROM_EMAIL ?? 'Zelená liga <info@zelenaliga.cz>';
  const replyTo = process.env.TRANSACTIONAL_REPLY_TO ?? 'info@zelenaliga.cz';
  const { subject, html, text } = buildNotificationEmail(items);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: recipients, subject, html, text, reply_to: replyTo }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to send email (${response.status}): ${body || '<no body>'}`);
  }
}

function isNotifyAuthorized(req: any): boolean {
  const cronSecret = process.env.CRON_SECRET ?? '';
  const header = typeof req.headers?.authorization === 'string' ? req.headers.authorization : '';
  return Boolean(cronSecret) && header === `Bearer ${cronSecret}`;
}

/**
 * Najde publikované články a fotoalba, o kterých ještě nešlo upozornění, a pošle o nich jeden e-mail.
 * Při prvním běhu (prázdná evidence) jen zapíše stávající obsah, aby nepřišel e-mail o všem najednou.
 */
export async function handleNotifyNewContent(req: any, res: any) {
  if (!isNotifyAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const supabase = getSupabaseAdminClient();
    const [articles, albums, known] = await Promise.all([
      loadArticles(),
      loadAlbums(),
      supabase.from('content_notifications').select('item_key'),
    ]);
    if (known.error) {
      throw known.error;
    }
    const knownKeys = new Set((known.data ?? []).map((row: { item_key: string }) => row.item_key));
    const isBaseline = knownKeys.size === 0;
    const seen = new Set<string>();
    const fresh = [...articles, ...albums].filter((item) => {
      if (knownKeys.has(item.key) || seen.has(item.key)) return false;
      seen.add(item.key);
      return true;
    });

    if (fresh.length > 0 && !isBaseline) {
      await sendNotificationEmail(fresh);
    }
    if (fresh.length > 0) {
      const { error } = await supabase.from('content_notifications').upsert(
        fresh.map((item) => ({ item_key: item.key, kind: item.kind, title: item.title, url: item.url })),
        { onConflict: 'item_key', ignoreDuplicates: true },
      );
      if (error) {
        throw error;
      }
    }

    res.status(200).json({ baseline: isBaseline, notified: isBaseline ? 0 : fresh.length, recorded: fresh.length });
  } catch (error) {
    logger.error('[api/content/admin/notify] failed', error);
    res.status(500).json({ error: 'Failed to process content notifications.' });
  }
}
