import { getAccessToken } from './storage';
import { env } from '../envVars';

const WRAP_MARKER = '__zelenaLigaAuthFetchWrapped';

function shouldWrapFetch(fetchFn: typeof fetch | undefined): fetchFn is typeof fetch {
  if (typeof fetchFn !== 'function') {
    return false;
  }
  return !(fetchFn as typeof fetch & { [WRAP_MARKER]?: boolean })[WRAP_MARKER];
}

const SUPABASE_URL = (env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  if (input instanceof Request) {
    return input.url;
  }
  return '';
}

function isSupabaseRequest(url: string) {
  if (!SUPABASE_URL) return false;
  try {
    const target = new URL(url);
    const base = new URL(SUPABASE_URL);
    return target.origin === base.origin
      && (target.pathname === base.pathname || target.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/`));
  } catch {
    return false;
  }
}

if (shouldWrapFetch(globalThis.fetch)) {
  const nativeFetch = globalThis.fetch;
  const wrappedFetch: typeof fetch & { [WRAP_MARKER]?: boolean } = async (input, init) => {
    const accessToken = await getAccessToken();
    const url = resolveRequestUrl(input);
    const baseHeaders = init?.headers ?? (input instanceof Request ? input.headers : undefined);
    const headers = new Headers(baseHeaders);

    if (isSupabaseRequest(url)) {
      if (!headers.has('apikey') && env.VITE_SUPABASE_ANON_KEY) {
        headers.set('apikey', env.VITE_SUPABASE_ANON_KEY);
      }
      if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    } else if (accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    const nextInit: RequestInit = { ...init, headers };

    if (input instanceof Request) {
      return nativeFetch(new Request(input, nextInit));
    }

    return nativeFetch(input, nextInit);
  };

  wrappedFetch[WRAP_MARKER] = true;
  globalThis.fetch = wrappedFetch;
}
