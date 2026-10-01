export type LodgingTip = {
  id: string;
  name: string;
  place: string | null;
  lat: number;
  lng: number;
  url: string | null;
  groupSize: number | null;
  communication: string | null;
  rating: number | null;
  review: string | null;
  leaderName: string;
  leaderContact: string;
  ownerId: string | null;
};

export type LoanKind = 'games' | 'material';

export type LoanOffer = {
  id: string;
  kind: LoanKind;
  title: string;
  description: string | null;
  place: string | null;
  leaderName: string;
  leaderContact: string;
  ownerId: string | null;
};

export const LOAN_KIND_LABELS: Record<LoanKind, string> = {
  games: 'Hry',
  material: 'Materiál',
};

export async function fetchCommunity(): Promise<{ lodgings: LodgingTip[]; loans: LoanOffer[] } | null> {
  try {
    const response = await fetch('/api/content/community');
    if (!response.ok) return null;
    const payload = (await response.json()) as { lodgings?: LodgingTip[]; loans?: LoanOffer[] };
    return {
      lodgings: Array.isArray(payload.lodgings) ? payload.lodgings : [],
      loans: Array.isArray(payload.loans) ? payload.loans : [],
    };
  } catch {
    return null;
  }
}

export async function submitCommunity(
  kind: 'lodging' | 'loans',
  body: Record<string, unknown>,
  accessToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(`/api/content/community/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
    if (response.ok) return { ok: true };
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: payload?.error || 'Odeslání se nepodařilo, zkus to prosím znovu.' };
  } catch {
    return { ok: false, error: 'Odeslání se nepodařilo, zkontroluj připojení.' };
  }
}

export async function deleteCommunity(
  kind: 'lodging' | 'loans',
  id: string,
  accessToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(`/api/content/community/${kind}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) return { ok: true };
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: payload?.error || 'Smazání se nepodařilo.' };
  } catch {
    return { ok: false, error: 'Smazání se nepodařilo, zkontroluj připojení.' };
  }
}
