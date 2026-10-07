const ENDPOINT = '/api/client-error';
const MAX_REPORTS_PER_PAGE = 5;

let sent = 0;
const seen = new Set<string>();

type ClientErrorKind = 'error' | 'unhandledrejection' | 'react';

export function reportClientError(kind: ClientErrorKind, error: unknown) {
  try {
    const err = error instanceof Error ? error : undefined;
    const message = err?.message ?? (typeof error === 'string' ? error : '');
    const key = `${kind}:${message}`;
    if (sent >= MAX_REPORTS_PER_PAGE || seen.has(key)) return;
    seen.add(key);
    sent += 1;
    const body = JSON.stringify({
      kind,
      name: err?.name,
      message,
      stack: err?.stack?.split('\n').slice(0, 6).join('\n'),
      // Pathname only: query strings and hashes can carry credentials.
      path: window.location.pathname,
      release: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA,
    });
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch { /* Reporting must never throw. */ }
}

export function installClientErrorReporting() {
  window.addEventListener('error', event => {
    // Resource load failures (images etc.) arrive without an Error.
    if (event.error) reportClientError('error', event.error);
  });
  window.addEventListener('unhandledrejection', event => reportClientError('unhandledrejection', event.reason));
}
