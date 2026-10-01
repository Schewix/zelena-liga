

export const NO_SESSION_ERROR = 'NO_SESSION';

export function requireAccessToken(accessToken: string | null) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { accessToken: null, error: 'OFFLINE', shouldBlock: false };
  }
  if (import.meta.env.DEV) {
    console.debug('[queue] token?', Boolean(accessToken));
  }
  if (accessToken) {
    return { accessToken, shouldBlock: true };
  }
  return { accessToken: null, error: NO_SESSION_ERROR, shouldBlock: true };
}

export async function clearBrowserRuntimeCaches() {
  if (typeof caches === 'undefined') {
    return;
  }
  const cacheNames = await caches.keys();
  if (!cacheNames.length) {
    return;
  }
  await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
}

export async function unregisterAllServiceWorkers() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  const registrations = await navigator.serviceWorker.getRegistrations();
  if (!registrations.length) {
    return;
  }
  await Promise.all(registrations.map((registration) => registration.unregister()));
}
