import { registerPendingSync } from '../backgroundSync';
import {
OutboxEntry,
writeOutboxEntries,
writeOutboxEntry
} from '../outbox';

export const OUTBOX_FLUSH_LOCK_TTL_MS = 30 * 1000;

export const OUTBOX_BATCH_SIZE = 5;

export function getOutboxFlushLockKey(eventId: string, stationId: string) {
  return `outbox-flush-lock:${eventId}:${stationId}`;
}

export function tryAcquireOutboxFlushLock(eventId: string, stationId: string, ownerId: string, now: number) {
  if (typeof window === 'undefined') {
    return true;
  }
  try {
    const lockKey = getOutboxFlushLockKey(eventId, stationId);
    const currentRaw = window.localStorage.getItem(lockKey);
    if (currentRaw) {
      const current = JSON.parse(currentRaw) as { ownerId?: string; expiresAt?: number };
      const currentOwner = typeof current.ownerId === 'string' ? current.ownerId : '';
      const currentExpires = typeof current.expiresAt === 'number' ? current.expiresAt : 0;
      if (currentOwner && currentOwner !== ownerId && currentExpires > now) {
        return false;
      }
    }

    const next = { ownerId, expiresAt: now + OUTBOX_FLUSH_LOCK_TTL_MS };
    window.localStorage.setItem(lockKey, JSON.stringify(next));
    const confirmedRaw = window.localStorage.getItem(lockKey);
    if (!confirmedRaw) {
      return false;
    }
    const confirmed = JSON.parse(confirmedRaw) as { ownerId?: string };
    return confirmed.ownerId === ownerId;
  } catch {
    return true;
  }
}

export function releaseOutboxFlushLock(eventId: string, stationId: string, ownerId: string) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const lockKey = getOutboxFlushLockKey(eventId, stationId);
    const currentRaw = window.localStorage.getItem(lockKey);
    if (!currentRaw) {
      return;
    }
    const current = JSON.parse(currentRaw) as { ownerId?: string };
    if (current.ownerId === ownerId) {
      window.localStorage.removeItem(lockKey);
    }
  } catch {
    // ignore localStorage lock release errors
  }
}

export async function writeOutboxEntriesAndSync(items: OutboxEntry[]) {
  await writeOutboxEntries(items);
  if (typeof window !== 'undefined') {
    void registerPendingSync();
  }
}

export async function writeOutboxEntryAndSync(item: OutboxEntry) {
  await writeOutboxEntry(item);
  if (typeof window !== 'undefined') {
    void registerPendingSync();
  }
}
