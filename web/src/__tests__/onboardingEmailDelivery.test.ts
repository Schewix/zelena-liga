// @vitest-environment node
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Run the real Deno handler with an in-memory database and mocked HTTP transport.
// No production database or email provider is contacted.
const source = readFileSync(new URL('../../../supabase/functions/send-onboarding-emails/index.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup(metadata: Record<string, unknown> = {}, judgeEmail = 'judge@example.org') {
  const row = {
    id: 'event-1', judge_id: 'judge-1',
    metadata: { type: 'initial-password-issued', email: 'judge@example.org', password: 'temporary-secret', ...metadata } as Record<string, unknown>,
  };
  const fetch = vi.fn();
  const write = vi.fn(() => ({ error: null as null | { message: string; code: string } }));
  const judgeWrite = vi.fn();
  const client = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          or: async () => ({ data: [structuredClone(row)], error: null }),
          maybeSingle: async () => ({ data: { email: judgeEmail, display_name: 'Judge' }, error: null }),
        }),
      }),
      update: (values: { metadata: Record<string, unknown> }) => ({
        eq: async () => {
          if (table === 'judges') { judgeWrite(values); return { error: null }; }
          const result = write();
          if (!result.error) row.metadata = structuredClone(values.metadata);
          return result;
        },
      }),
    }),
  };
  let handler!: (request: Request) => Promise<Response>;
  runInNewContext(compiled, {
    exports: {},
    require: () => ({ createClient: () => client }),
    Deno: {
      env: { get: (key: string) => ({
        SUPABASE_URL: 'https://database.example.org', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
        EVENT_ID: 'test-event', RESEND_API_KEY: 'test-api-key', SYNC_SECRET: 'test-sync-secret',
      }[key]) },
      serve: (fn: typeof handler) => { handler = fn; },
    },
    fetch, Response, Request, URL, AbortController, Date, setTimeout, clearTimeout,
    crypto: webcrypto, TextEncoder, Uint8Array, Uint32Array, btoa,
    console: { log: vi.fn(), error: vi.fn() },
  });
  return {
    row, fetch, write, judgeWrite,
    run: (query = '') => handler(new Request(`https://function.example.org/${query}`, {
      method: 'POST', headers: { authorization: 'Bearer test-sync-secret' },
    })),
  };
}

afterEach(() => vi.useRealTimers());

describe('onboarding email delivery', () => {
  it.each(['judge@example@org', 'judge example.org', 'judge@', '@example.org'])('blocks an invalid recipient locally: %s', async (email) => {
    const app = setup({}, email);
    await app.run();
    expect(app.row.metadata).toMatchObject({
      delivery_status: 'failed',
      last_delivery_error: { status: 422, code: 'invalid_recipient' },
    });
    await app.run();
    expect(app.fetch).not.toHaveBeenCalled();
  });

  it('does not rotate a password for an invalid address in force-reset mode', async () => {
    const app = setup({ password: undefined }, 'judge@example@org');
    await app.run('?mode=force-reset');
    expect(app.judgeWrite).not.toHaveBeenCalled();
    expect(app.fetch).not.toHaveBeenCalled();
    expect(app.row.metadata.delivery_status).toBe('failed');
  });

  it('trims surrounding whitespace without guessing or rewriting the recipient', async () => {
    const app = setup({}, '  Judge+test@sub.example.org  ');
    app.fetch.mockResolvedValue(new Response(JSON.stringify({ id: 'message-1' })));
    await app.run();
    expect(JSON.parse(app.fetch.mock.calls[0][1].body).to).toEqual(['Judge+test@sub.example.org']);
  });

  it('persists a 422 rejection and does not send again on the next cron run', async () => {
    const app = setup();
    app.fetch.mockResolvedValue(new Response(JSON.stringify({ name: 'validation_error', message: 'Invalid recipient' }), { status: 422 }));
    expect((await (await app.run()).json()).failed).toBe(1);
    expect(app.row.metadata).toMatchObject({
      delivery_status: 'failed', delivery_attempts: 1, next_retry_at: null,
      last_delivery_error: { status: 422, code: 'validation_error', message: 'Invalid recipient' },
    });
    const next = await (await app.run('?debug=1')).json();
    expect(next.skipped.delivery_blocked).toBe(1);
    expect(app.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([429, 503])('defers retries for HTTP %s and stops after five failures', async (status) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T10:00:00Z'));
    const app = setup();
    app.fetch.mockImplementation(async () => new Response('{}', { status }));
    for (let attempt = 1; attempt <= 5; attempt++) {
      await app.run();
      expect(app.row.metadata.delivery_attempts).toBe(attempt);
      if (attempt < 5) {
        const due = Date.parse(String(app.row.metadata.next_retry_at));
        expect(due - Date.now()).toBe(5 * 60_000 * 2 ** (attempt - 1));
        await app.run();
        expect(app.fetch).toHaveBeenCalledTimes(attempt);
        vi.setSystemTime(due);
      }
    }
    expect(app.row.metadata.delivery_status).toBe('failed');
    await app.run();
    expect(app.fetch).toHaveBeenCalledTimes(5);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('records network failures and always clears the fetch timeout', async () => {
    vi.useFakeTimers();
    const app = setup();
    app.fetch.mockRejectedValue(new Error('network unavailable'));
    await app.run();
    expect(app.row.metadata).toMatchObject({ delivery_status: 'retry', delivery_attempts: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes the password and old failure state after a successful retry', async () => {
    const app = setup({ delivery_status: 'retry', delivery_attempts: 1, last_delivery_error: { status: 503 } });
    app.fetch.mockResolvedValue(new Response(JSON.stringify({ id: 'message-1' })));
    await app.run();
    expect(app.row.metadata).toMatchObject({ sent: true, delivery_status: 'sent', delivery_attempts: 2, last_delivery_error: null, next_retry_at: null });
    expect(app.row.metadata).not.toHaveProperty('password');
    await app.run();
    expect(app.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not mutate data or send emails during dry-run', async () => {
    const app = setup();
    const initial = structuredClone(app.row.metadata);
    await app.run('?dry_run=true');
    expect(app.fetch).not.toHaveBeenCalled();
    expect(app.write).not.toHaveBeenCalled();
    expect(app.row.metadata).toEqual(initial);
  });

  it('redacts credentials from persisted and returned provider diagnostics', async () => {
    const app = setup();
    app.fetch.mockResolvedValue(new Response(JSON.stringify({ message: 'Bad temporary-secret test-api-key' }), { status: 422 }));
    const result = await (await app.run()).text();
    const diagnostic = JSON.stringify(app.row.metadata.last_delivery_error);
    for (const secret of ['temporary-secret', 'test-api-key']) {
      expect(result).not.toContain(secret);
      expect(diagnostic).not.toContain(secret);
    }
  });

  it('returns HTTP 500 if failure metadata cannot be persisted', async () => {
    const app = setup();
    app.fetch.mockResolvedValue(new Response('{}', { status: 422 }));
    app.write.mockReturnValue({ error: { message: 'database unavailable', code: 'DB_ERROR' } });
    expect((await app.run()).status).toBe(500);
  });

  it('preserves the acceptance receipt if the first success update fails', async () => {
    const app = setup();
    app.fetch.mockResolvedValue(new Response(JSON.stringify({ id: 'message-1' })));
    app.write.mockReturnValueOnce({ error: { message: 'database unavailable', code: 'DB_ERROR' } });
    await app.run();
    expect(app.row.metadata).toMatchObject({ sent: true, message_id: 'message-1' });
    expect(app.row.metadata).not.toHaveProperty('password');
    await app.run();
    expect(app.fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps a force-reset password stable across a temporary delivery failure', async () => {
    const app = setup({ password: undefined });
    app.fetch.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    await app.run('?mode=force-reset');
    const password = app.row.metadata.password;
    expect(typeof password).toBe('string');
    expect(password).toHaveLength(12);
    app.row.metadata.next_retry_at = null;
    app.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'message-1' })));
    await app.run('?mode=force-reset');
    expect(app.judgeWrite).toHaveBeenCalledTimes(1);
    expect(JSON.parse(app.fetch.mock.calls[1][1].body).text).toContain(password);
  });
});
