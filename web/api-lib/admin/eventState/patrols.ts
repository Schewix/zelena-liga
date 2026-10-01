import { CATEGORY_KEYS,StationCategoryKey } from './constants.js';
import { hasAtLeastOneFullName,normalizePatrolMembers,normalizeStationCode } from './validation.js';

export function mapPatrolCategoryKey(key: StationCategoryKey): { category: string; sex: string } {
  return {
    category: key.slice(0, 1),
    sex: key.slice(1, 2),
  };
}

export function parsePatrolCategoryNumber(rawCode: unknown, fallbackCategory?: unknown): { category: string; number: number } | null {
  const code = normalizeStationCode(rawCode);
  const match = code.match(/^([NMSR])(?:[HD])?[- ]?(\d{1,3})$/);
  if (match) {
    const number = Number.parseInt(match[2], 10);
    if (Number.isFinite(number) && number > 0) {
      return { category: match[1], number };
    }
  }
  const fallback = normalizeStationCode(fallbackCategory);
  const fallbackMatch = code.match(/^([NMSR])([HD])[- ]?(\d{1,3})$/);
  if (fallback && CATEGORY_KEYS.includes(fallback as (typeof CATEGORY_KEYS)[number]) && fallbackMatch) {
    const number = Number.parseInt(fallbackMatch[3], 10);
    if (Number.isFinite(number) && number > 0) {
      return { category: fallback, number };
    }
  }
  return null;
}

export function buildPatrolCodeLookupVariants(rawCode: unknown): string[] {
  const code = normalizeStationCode(rawCode);
  if (!code) {
    return [];
  }
  const match = code.match(/^([NMSR])([HD])?[- ]?(\d{1,3})$/);
  if (!match) {
    return [code];
  }

  const category = match[1];
  const sex = match[2] ? match[2] : '';
  const number = Number.parseInt(match[3], 10);
  if (!Number.isFinite(number) || number <= 0) {
    return [code];
  }

  const noPad = String(number);
  const pad2 = noPad.padStart(2, '0');
  const seen = new Set<string>();
  const variants: string[] = [];
  const push = (value: string) => {
    const normalized = value.trim().toUpperCase();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    variants.push(normalized);
  };

  if (sex) {
    push(`${category}${sex}-${noPad}`);
    push(`${category}${sex}-${pad2}`);
    push(`${category}-${noPad}`);
    push(`${category}-${pad2}`);
    return variants;
  }

  push(`${category}-${noPad}`);
  push(`${category}-${pad2}`);
  push(`${category}H-${noPad}`);
  push(`${category}H-${pad2}`);
  push(`${category}D-${noPad}`);
  push(`${category}D-${pad2}`);
  return variants;
}

export function parseSexedPatrolCode(rawCode: unknown): { category: string; sex: string; number: number } | null {
  const code = normalizeStationCode(rawCode);
  const match = code.match(/^([NMSR])([HD])[- ]?(\d{1,3})$/);
  if (!match) {
    return null;
  }
  const number = Number.parseInt(match[3], 10);
  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }
  return {
    category: match[1],
    sex: match[2],
    number,
  };
}

export function buildCounterpartPatrolCode(rawCode: unknown): string | null {
  const parsed = parseSexedPatrolCode(rawCode);
  if (!parsed) {
    return null;
  }
  const oppositeSex = parsed.sex === 'H' ? 'D' : 'H';
  return `${parsed.category}${oppositeSex}-${parsed.number}`;
}

export async function resolvePatrolByCode(
  supabaseAdmin: any,
  eventId: string,
  rawCode: unknown,
): Promise<
  | {
      row: {
        id: string;
        patrol_code: string | null;
        category: string | null;
        sex: string | null;
        team_name: string | null;
        patrol_members?: string | null;
        note?: string | null;
      };
      ambiguous: false;
    }
  | {
      ambiguous: true;
      options: string[];
    }
  | null
> {
  const variants = buildPatrolCodeLookupVariants(rawCode);
  if (!variants.length) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('patrols')
    .select('id, patrol_code, category, sex, team_name, patrol_members, note, active')
    .eq('event_id', eventId)
    .in('patrol_code', variants);

  if (error) {
    throw new Error(error.message);
  }

  const rows = ((data ?? []) as Array<{
    id: string;
    patrol_code: string | null;
    category: string | null;
    sex: string | null;
    team_name: string | null;
    patrol_members?: string | null;
    note?: string | null;
    active?: boolean | null;
  }>).filter((row) => row.active !== false);

  if (rows.length === 0) {
    return null;
  }

  const exactNormalized = normalizeStationCode(rawCode);
  const exact = rows.filter((row) => normalizeStationCode(row.patrol_code) === exactNormalized);
  if (exact.length === 1) {
    return { ambiguous: false, row: exact[0] };
  }
  if (rows.length === 1) {
    return { ambiguous: false, row: rows[0] };
  }

  const withProfile = rows.filter((row) => {
    const members = normalizePatrolMembers(row.patrol_members ?? row.note ?? null);
    return hasAtLeastOneFullName(members ?? '');
  });
  if (withProfile.length === 1) {
    return { ambiguous: false, row: withProfile[0] };
  }

  return {
    ambiguous: true,
    options: rows
      .map((row) => normalizeStationCode(row.patrol_code))
      .filter(Boolean)
      .slice(0, 8),
  };
}
