import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { waitUntil } from '@vercel/functions';

type Level = 'info' | 'warn' | 'error';
type Entry = Record<string, string | number>;
type Context = { requestId: string; route: string; entries: Entry[]; hasError: boolean };
const context = new AsyncLocalStorage<Context>();
const MAX_PER_REQUEST = 20;
const MAX_PER_MINUTE = 120;
let windowStart = 0;
let sentInWindow = 0;
let readyLogged = false;
let lastTransportWarning = 0;

function configuration() {
  const token = process.env.BETTER_STACK_SOURCE_TOKEN?.trim();
  const host = process.env.BETTER_STACK_INGESTING_HOST?.trim();
  if (!token || !host) return undefined;
  try {
    const url = new URL(host.includes('://') ? host : `https://${host}`);
    // Never send the source token to an arbitrary host or follow redirects.
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.betterstackdata.com') ||
        url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) return undefined;
    return { token, url: url.origin };
  } catch { return undefined; }
}

function transportWarning(status?: number) {
  if (Date.now() - lastTransportWarning < 60_000) return;
  lastTransportWarning = Date.now();
  console.warn('[telemetry] Better Stack delivery failed', status ?? 'network-or-timeout');
}

async function send(entries: Entry[], config: NonNullable<ReturnType<typeof configuration>>) {
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(entries),
      signal: AbortSignal.timeout(2000),
      redirect: 'error',
    });
    if (!response.ok) transportWarning(response.status);
    await response.body?.cancel();
  } catch { transportWarning(); }
}

function flush(entries: Entry[]) {
  const config = configuration();
  if (!config || entries.length === 0) return;
  const now = Date.now();
  if (now - windowStart >= 60_000) { windowStart = now; sentInWindow = 0; }
  const batch = entries.slice(0, Math.max(0, MAX_PER_MINUTE - sentInWindow));
  if (!batch.length) return;
  sentInWindow += batch.length;
  const delivery = send(batch, config);
  // Keep serverless execution alive after the response, without delaying the user.
  try { waitUntil(delivery); } catch { /* Delivery itself never rejects. */ }
}

function record(level: Level, message: string, details: unknown[]) {
  const current = context.getStore();
  // Only callers' operation labels and allowlisted codes leave the server.
  // Raw error messages, SQL details, request bodies, headers and emails do not.
  const entry: Entry = {
    dt: new Date().toISOString(), level, message: message.slice(0, 300),
    service: 'zelena-liga-api', environment: process.env.VERCEL_ENV ?? 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
    ...(current ? { request_id: current.requestId, route: current.route } : {}),
  };
  for (const detail of details) {
    if (!detail || typeof detail !== 'object') continue;
    const code = (detail as { code?: unknown }).code;
    if (typeof code === 'string' && /^[A-Z0-9_]{1,40}$/.test(code)) entry.error_code = code;
    const messageId = (detail as { message_id?: unknown }).message_id;
    if (typeof messageId === 'string' && /^[a-f0-9-]{36}$/i.test(messageId)) entry.message_id = messageId;
    // Browser error reports are sanitized and truncated by api/client-error.ts.
    const client = (detail as { client?: unknown }).client;
    if (client && typeof client === 'object') {
      for (const key of ['kind', 'name', 'message', 'stack', 'path', 'app_release']) {
        const value = (client as Record<string, unknown>)[key];
        if (typeof value === 'string') entry[`client_${key}`] = value.slice(0, key === 'stack' ? 800 : 300);
      }
    }
  }
  if (current) {
    if (level === 'error') current.hasError = true;
    if (current.entries.length < MAX_PER_REQUEST) current.entries.push(entry);
  } else { flush([entry]); }
}

export const logger = {
  error(message: string, ...details: unknown[]) { console.error(message, ...details); record('error', message, details); },
  warn(message: string, ...details: unknown[]) { console.warn(message, ...details); record('warn', message, details); },
  info(message: string, ...details: unknown[]) { record('info', message, details); },
};

/** Pass a static route label, never a raw URL (which may contain credentials). */
export function withLogging<T>(route: string, handler: (req: any, res: any) => Promise<T>) {
  return async (req: any, res: any): Promise<T> => {
    const current: Context = { requestId: randomUUID(), route, entries: [], hasError: false };
    return context.run(current, async () => {
      const started = Date.now();
      res.setHeader('X-Request-ID', current.requestId);
      if (!readyLogged && configuration()) {
        readyLogged = true;
        logger.info('logging.ready');
      }
      try {
        return await handler(req, res);
      } catch (error) {
        logger.error('api.unhandled_error', error);
        throw error;
      } finally {
        if (res.statusCode >= 500 && !current.hasError) logger.error('api.request_failed');
        if (Date.now() - started >= 5000) logger.warn('api.slow_request');
        for (const entry of current.entries) {
          entry.duration_ms = Date.now() - started;
          entry.status = current.hasError && !res.headersSent && res.statusCode < 400 ? 500 : (res.statusCode ?? 200);
        }
        flush(current.entries);
      }
    });
  };
}
