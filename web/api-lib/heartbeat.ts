/** Pings the Better Stack heartbeat so a missed daily cron raises an incident. No-op without the env var. */
export async function pingHeartbeat(): Promise<void> {
  const url = process.env.BETTER_STACK_HEARTBEAT_URL;
  if (!url) return;
  try {
    await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch {
    // Monitoring must never break the cron job itself.
  }
}

/** True when the request carries the Vercel cron secret, i.e. it came from the scheduled run. */
export function isCronRequest(req: any): boolean {
  const secret = process.env.CRON_SECRET ?? '';
  const header = typeof req.headers?.authorization === 'string' ? req.headers.authorization : '';
  return Boolean(secret) && header === `Bearer ${secret}`;
}
