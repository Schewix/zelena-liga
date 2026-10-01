import { createClient, type Session } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Samostatný klient s vlastním úložištěm, ať se nepere s přihlášením rozhodčích.
const client =
  url && anon
    ? createClient(url, anon, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: 'zl-community-auth',
        },
      })
    : null;

export async function getCommunitySession(): Promise<Session | null> {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session;
}

export function onCommunitySessionChange(callback: (session: Session | null) => void) {
  if (!client) return () => undefined;
  const { data } = client.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function sendCommunityCode(email: string): Promise<string | null> {
  if (!client) return 'Přihlášení není dostupné.';
  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  return error ? 'Kód se nepodařilo odeslat. Zkontroluj e-mail a zkus to za chvíli.' : null;
}

export async function verifyCommunityCode(email: string, token: string): Promise<string | null> {
  if (!client) return 'Přihlášení není dostupné.';
  const { error } = await client.auth.verifyOtp({ email, token: token.trim(), type: 'email' });
  return error ? 'Kód není platný nebo vypršel.' : null;
}

export async function signOutCommunity() {
  await client?.auth.signOut();
}
