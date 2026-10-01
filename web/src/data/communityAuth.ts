const STORAGE_KEY = 'zl-community-session';

export type CommunityUser = { id: string; email: string; displayName: string };
export type CommunitySession = { token: string; expiresAt: string; user: CommunityUser };

type AuthResult =
  | { ok: true; session: CommunitySession | null }
  | { ok: false; error: string; code?: string };

const listeners = new Set<(session: CommunitySession | null) => void>();
let current: CommunitySession | null = null;
let loaded = false;

function load(): CommunitySession | null {
  if (loaded) return current;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CommunitySession) : null;
    current = parsed && new Date(parsed.expiresAt).getTime() > Date.now() ? parsed : null;
  } catch {
    current = null;
  }
  return current;
}

function store(session: CommunitySession | null) {
  current = session;
  loaded = true;
  try {
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Bez úložiště zůstane přihlášení jen do zavření stránky.
  }
  listeners.forEach((listener) => listener(session));
}

export function getCommunitySession() {
  return load();
}

export function onCommunitySessionChange(listener: (session: CommunitySession | null) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function post(action: string, body: Record<string, unknown>): Promise<AuthResult> {
  try {
    const response = await fetch(`/api/content/community/auth/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as
      | (Partial<CommunitySession> & { error?: string; code?: string })
      | null;
    if (!response.ok) {
      return { ok: false, error: payload?.error || 'Něco se nepovedlo, zkus to prosím znovu.', code: payload?.code };
    }
    if (payload?.token && payload.user && payload.expiresAt) {
      const session = { token: payload.token, expiresAt: payload.expiresAt, user: payload.user };
      store(session);
      return { ok: true, session };
    }
    return { ok: true, session: null };
  } catch {
    return { ok: false, error: 'Spojení se nepodařilo, zkontroluj připojení.' };
  }
}

export const registerCommunity = (email: string, password: string, displayName: string) =>
  post('register', { email, password, displayName });
export const verifyCommunityEmail = (email: string, code: string) => post('verify', { email, code });
export const loginCommunity = (email: string, password: string) => post('login', { email, password });
export const changeCommunityPassword = (email: string, password: string, newPassword: string) =>
  post('change-password', { email, password, newPassword });

export async function signOutCommunity() {
  const session = load();
  store(null);
  if (session) {
    await fetch('/api/content/community/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}` },
    }).catch(() => undefined);
  }
}
