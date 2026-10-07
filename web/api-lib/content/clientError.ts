import { logger } from '../logger.js';

const MAX_PER_MINUTE = 30;
let windowStart = 0;
let accepted = 0;

const KINDS = new Set(['error', 'unhandledrejection', 'react']);

/** Browser text is untrusted: drop anything that looks like an email, token or query string. */
function clean(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  return value
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\b(?:eyJ[\w-]{10,}|[A-Za-z0-9_-]{32,})\b/g, '[token]')
    .replace(/([?#][^\s)'"]*)/g, '')
    .slice(0, max);
}

export async function handleClientError(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let body: unknown = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof input.kind !== 'string' || !KINDS.has(input.kind)) return res.status(400).json({ error: 'Invalid report' });

  // Public endpoint: keep browser noise from crowding out server logs.
  const now = Date.now();
  if (now - windowStart >= 60_000) { windowStart = now; accepted = 0; }
  if (accepted >= MAX_PER_MINUTE) return res.status(204).end();
  accepted += 1;

  logger.warn('client.error', {
    client: {
      kind: input.kind,
      name: clean(input.name, 100),
      message: clean(input.message, 300),
      stack: clean(input.stack, 800),
      path: clean(input.path, 200),
      app_release: clean(input.release, 40),
    },
  });
  return res.status(204).end();
}
