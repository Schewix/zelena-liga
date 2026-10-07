// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isCronRequest, pingHeartbeat } from '../../api-lib/heartbeat';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('heartbeat', () => {
  it('does nothing without a configured URL', async () => {
    vi.stubEnv('BETTER_STACK_HEARTBEAT_URL', '');
    await pingHeartbeat();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pings the configured URL and swallows failures', async () => {
    vi.stubEnv('BETTER_STACK_HEARTBEAT_URL', 'https://example.test/heartbeat');
    await pingHeartbeat();
    expect(fetchMock).toHaveBeenCalledWith('https://example.test/heartbeat', expect.any(Object));
    fetchMock.mockRejectedValue(new Error('network'));
    await expect(pingHeartbeat()).resolves.toBeUndefined();
  });

  it('recognises only the cron secret', () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    expect(isCronRequest({ headers: { authorization: 'Bearer s3cret' } })).toBe(true);
    expect(isCronRequest({ headers: { authorization: 'Bearer other' } })).toBe(false);
    expect(isCronRequest({ headers: {} })).toBe(false);
    vi.stubEnv('CRON_SECRET', '');
    expect(isCronRequest({ headers: { authorization: 'Bearer ' } })).toBe(false);
  });
});
