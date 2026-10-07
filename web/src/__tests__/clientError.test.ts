// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const background = vi.hoisted(() => ({ tasks: [] as Promise<unknown>[] }));
vi.mock('@vercel/functions', () => ({ waitUntil: (task: Promise<unknown>) => background.tasks.push(task) }));
const fetchMock = vi.fn();
function response() {
  const res: any = { statusCode: 200, headersSent: true, setHeader: vi.fn() };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = vi.fn(() => res);
  res.end = vi.fn(() => res);
  return res;
}
function events() { return fetchMock.mock.calls.flatMap(([, options]) => JSON.parse(options.body)); }

beforeEach(() => {
  vi.resetModules();
  background.tasks = [];
  fetchMock.mockReset().mockResolvedValue({ ok: true, body: null });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('BETTER_STACK_SOURCE_TOKEN', 'test-source-token');
  vi.stubEnv('BETTER_STACK_INGESTING_HOST', 'test.betterstackdata.com');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function post(body: unknown, method = 'POST') {
  const { default: handler } = await import('../../api/client-error');
  const res = response();
  await handler({ method, body }, res);
  await Promise.all(background.tasks);
  return res;
}

describe('client error endpoint', () => {
  it('logs a sanitized browser error', async () => {
    const res = await post({
      kind: 'error', name: 'TypeError', path: '/admin',
      message: 'Cannot read x for person@example.org',
      stack: 'TypeError: x\n at https://zelenaliga.cz/assets/a.js:1:2?token=secret',
    });
    expect(res.statusCode).toBe(204);
    const entry = events().find(e => e.message === 'client.error');
    expect(entry).toMatchObject({ level: 'warn', client_kind: 'error', client_name: 'TypeError', client_path: '/admin' });
    const text = JSON.stringify(events());
    expect(text).not.toContain('person@example.org');
    expect(text).not.toContain('token=secret');
  });

  it('rejects invalid reports and methods', async () => {
    expect((await post({ kind: 'bogus' })).statusCode).toBe(400);
    expect((await post({}, 'GET')).statusCode).toBe(405);
    expect(events().filter(e => e.message === 'client.error')).toHaveLength(0);
  });

  it('caps reports per minute', async () => {
    const { default: handler } = await import('../../api/client-error');
    for (let i = 0; i < 40; i++) await handler({ method: 'POST', body: { kind: 'error', message: `m${i}` } }, response());
    await Promise.all(background.tasks);
    expect(events().filter(e => e.message === 'client.error')).toHaveLength(30);
  });
});
