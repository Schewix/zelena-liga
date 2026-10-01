// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const background = vi.hoisted(() => ({ tasks: [] as Promise<unknown>[] }));
vi.mock('@vercel/functions', () => ({ waitUntil: (task: Promise<unknown>) => background.tasks.push(task) }));
const fetchMock = vi.fn();
function response() {
  return { setHeader: vi.fn(), statusCode: 200, headersSent: true };
}
async function load() { return import('../../api-lib/logger'); }
async function finish() { await Promise.all(background.tasks); }
function events() { return fetchMock.mock.calls.flatMap(([, options]) => JSON.parse(options.body)); }

beforeEach(() => {
  vi.resetModules();
  background.tasks = [];
  fetchMock.mockReset().mockResolvedValue({ ok: true, body: null });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('BETTER_STACK_SOURCE_TOKEN', 'test-source-token');
  vi.stubEnv('BETTER_STACK_INGESTING_HOST', 'test.betterstackdata.com');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('server logging', () => {
  it('batches logs with correlation and does not export sensitive error details or request data', async () => {
    const { logger, withLogging } = await load();
    const res = response();
    const handler = withLogging('/api/auth/login', async () => {
      logger.error('database.lookup_failed', { code: '23505', message: 'password=secret', details: 'person@example.org', token: 'private' });
      return 'original-result';
    });
    expect(await handler({ url: '/api/auth/login?token=private', body: { password: 'secret' } }, res)).toBe('original-result');
    await finish();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.stringify(events());
    for (const secret of ['password', 'person@example.org', 'private', 'test-source-token']) expect(body).not.toContain(secret);
    expect(events().find(e => e.level === 'error')).toMatchObject({ error_code: '23505', route: '/api/auth/login' });
    expect(events()[0].request_id).toBe(res.setHeader.mock.calls[0][1]);
    expect(fetchMock.mock.calls[0][1].redirect).toBe('error');
  });

  it('does not mix overlapping request contexts', async () => {
    const { logger, withLogging } = await load();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const a = response(), b = response();
    const first = withLogging('/api/a', async () => { await gate; logger.error('a.failed'); })(null, a);
    await withLogging('/api/b', async () => { logger.error('b.failed'); })(null, b);
    release(); await first; await finish();
    expect(events().find(e => e.message === 'a.failed').request_id).toBe(a.setHeader.mock.calls[0][1]);
    expect(events().find(e => e.message === 'b.failed').request_id).toBe(b.setHeader.mock.calls[0][1]);
    expect(a.setHeader.mock.calls[0][1]).not.toBe(b.setHeader.mock.calls[0][1]);
  });

  it('preserves handler errors and reports otherwise unlogged 5xx responses', async () => {
    const { withLogging } = await load();
    const error = new Error('sensitive exception');
    await expect(withLogging('/api/a', async () => { throw error; })(null, response())).rejects.toBe(error);
    const res = response(); res.statusCode = 503;
    await withLogging('/api/b', async () => {})(null, res);
    await finish();
    expect(events().map(e => e.message)).toContain('api.unhandled_error');
    expect(events().find(e => e.message === 'api.request_failed').status).toBe(503);
    expect(JSON.stringify(events())).not.toContain('sensitive exception');
  });

  it.each(['', 'https://evil.example', 'https://test.betterstackdata.com.evil.example', 'http://test.betterstackdata.com'])('does not send credentials to invalid host %s', async (host) => {
    vi.stubEnv('BETTER_STACK_INGESTING_HOST', host);
    const { logger, withLogging } = await load();
    await withLogging('/api/a', async () => { logger.error('failed'); })(null, response());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is disabled without credentials', async () => {
    vi.stubEnv('BETTER_STACK_SOURCE_TOKEN', '');
    const { logger, withLogging } = await load();
    await withLogging('/api/a', async () => { logger.error('failed'); })(null, response());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([402, 403, 500])('keeps application successful when ingestion returns %s', async status => {
    fetchMock.mockResolvedValue({ ok: false, status, body: null });
    const { logger, withLogging } = await load();
    expect(await withLogging('/api/a', async () => { logger.warn('warning'); return 42; })(null, response())).toBe(42);
    await finish();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not wait for the log transport, and absorbs network failure', async () => {
    let reject!: (reason: unknown) => void;
    fetchMock.mockReturnValue(new Promise((_, rej) => { reject = rej; }));
    const { logger, withLogging } = await load();
    expect(await withLogging('/api/a', async () => { logger.error('failed'); return 42; })(null, response())).toBe(42);
    expect(background.tasks).toHaveLength(1);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    reject(new Error('offline'));
    await finish();
  });

  it('bounds log volume per request and warm instance', async () => {
    const { logger, withLogging } = await load();
    const handler = withLogging('/api/a', async () => { for (let i = 0; i < 100; i++) logger.error('repeated'); });
    for (let i = 0; i < 10; i++) await handler(null, response());
    await finish();
    expect(events()).toHaveLength(120);
    for (const [, options] of fetchMock.mock.calls) expect(JSON.parse(options.body).length).toBeLessThanOrEqual(20);
  });

  it('aborts stalled ingestion after two seconds', async () => {
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }));
    const { logger, withLogging } = await load();
    expect(await withLogging('/api/a', async () => { logger.error('failed'); return 42; })(null, response())).toBe(42);
    await finish();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
