// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../envVars', () => ({ env: {
  VITE_SUPABASE_URL: 'https://database.example.org', VITE_SUPABASE_ANON_KEY: 'public-anon-key',
} }));
const token = vi.hoisted(() => vi.fn());
vi.mock('../auth/storage', () => ({ getAccessToken: token }));
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; vi.resetModules(); });

async function setup(accessToken: string | null = 'session-token') {
  token.mockResolvedValue(accessToken);
  const transport = vi.fn().mockResolvedValue(new Response('{}'));
  globalThis.fetch = transport;
  await import('../auth/fetch');
  return transport;
}

describe('Supabase request headers', () => {
  it('adds the public API key alongside the user token', async () => {
    const transport = await setup();
    await fetch('https://database.example.org/functions/v1/submit-station-record', { method: 'POST', body: '{}' });
    const headers = new Headers(transport.mock.calls[0][1].headers);
    expect(headers.get('apikey')).toBe('public-anon-key');
    expect(headers.get('authorization')).toBe('Bearer session-token');
    expect(transport.mock.calls[0][1].body).toBe('{}');
  });
  it('adds the API key even before login', async () => {
    const transport = await setup(null);
    await fetch('https://database.example.org/rest/v1/events');
    expect(new Headers(transport.mock.calls[0][1].headers).get('apikey')).toBe('public-anon-key');
  });
  it('preserves an existing API key and Request headers', async () => {
    const transport = await setup();
    await fetch(new Request('https://database.example.org/rest/v1/events', { headers: { apikey: 'existing-public-key', 'x-custom': 'value' } }));
    const request = transport.mock.calls[0][0] as Request;
    expect(request.headers.get('apikey')).toBe('existing-public-key');
    expect(request.headers.get('x-custom')).toBe('value');
    expect(request.headers.get('authorization')).toBe('Bearer session-token');
  });
  it.each(['https://app.example.org/api/admin/event-state', 'https://database.example.org.evil.test/rest/v1/events'])('does not attach the API key to another origin: %s', async (url) => {
    const transport = await setup(null);
    await fetch(url);
    expect(new Headers(transport.mock.calls[0][1].headers).has('apikey')).toBe(false);
  });
});
