import { PatrolProfileChildRow } from './types';

export const PATROL_PROFILE_CHILD_ROW_COUNT = 3;

export function normalizeProfileText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeTroopName(value: string) {
  return normalizeProfileText(value);
}

export function buildUniqueTroopList(values: readonly string[]) {
  const next: string[] = [];
  const seen = new Set<string>();
  values.forEach((value) => {
    const normalized = normalizeTroopName(value);
    if (!normalized) {
      return;
    }
    const key = normalized.toLocaleLowerCase('cs');
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    next.push(normalized);
  });
  return next;
}

export function parseTroopsFromTeamName(value: string | null | undefined) {
  const normalized = normalizeProfileText(value ?? '');
  if (!normalized) {
    return [] as string[];
  }
  const parts = normalized
    .split(/\s*(?:\+|\/|;|\||&)\s*|\s+\ba\b\s+/i)
    .map((part) => normalizeTroopName(part))
    .filter(Boolean);
  return buildUniqueTroopList(parts.length > 0 ? parts : [normalized]);
}

export function createEmptyPatrolProfileRows(): PatrolProfileChildRow[] {
  return Array.from({ length: PATROL_PROFILE_CHILD_ROW_COUNT }, () => ({
    firstName: '',
    lastName: '',
    nickname: '',
    troop: '',
  }));
}

export function splitProfileNameParts(value: string) {
  const parts = normalizeProfileText(value).split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: '', lastName: '' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

export function parsePatrolProfileRows(value: string | null | undefined, fallbackTroop: string) {
  const lines = (value ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const parsedRows = lines.map((line) => {
    let working = line;
    let troop = '';
    const troopMatch = working.match(/\{oddil:([^}]+)\}\s*$/i);
    if (troopMatch) {
      troop = normalizeTroopName(troopMatch[1] ?? '');
      working = working.slice(0, troopMatch.index).trim();
    }

    let nickname = '';
    const nicknameMatch = working.match(/\(([^)]+)\)\s*$/);
    if (nicknameMatch) {
      nickname = normalizeProfileText(nicknameMatch[1] ?? '');
      working = working.slice(0, nicknameMatch.index).trim();
    }

    const name = splitProfileNameParts(working);
    return {
      firstName: name.firstName,
      lastName: name.lastName,
      nickname,
      troop: troop || fallbackTroop,
    };
  });

  while (parsedRows.length < PATROL_PROFILE_CHILD_ROW_COUNT) {
    parsedRows.push({
      firstName: '',
      lastName: '',
      nickname: '',
      troop: '',
    });
  }

  return parsedRows;
}

export function stringifyPatrolProfileRows(
  rows: readonly PatrolProfileChildRow[],
  options: { requiresTroopPerChild: boolean },
) {
  const lines: string[] = [];
  rows.forEach((row) => {
    const firstName = normalizeProfileText(row.firstName);
    const lastName = normalizeProfileText(row.lastName);
    const nickname = normalizeProfileText(row.nickname);
    const troop = normalizeTroopName(row.troop);
    if (!firstName && !lastName && !nickname && !troop) {
      return;
    }

    const fullName = normalizeProfileText(`${firstName} ${lastName}`.trim());
    if (!fullName) {
      return;
    }

    let line = fullName;
    if (nickname) {
      line += ` (${nickname})`;
    }
    if (options.requiresTroopPerChild && troop) {
      line += ` {oddil:${troop}}`;
    }
    lines.push(line);
  });
  return lines.length > 0 ? lines.join('\n') : null;
}

export function parsePatrolProfileDraft(teamName: string | null | undefined, members: string | null | undefined) {
  const troops = buildUniqueTroopList(parseTroopsFromTeamName(teamName));
  const fallbackTroop = troops.length === 1 ? troops[0] : '';
  const rows = parsePatrolProfileRows(members, fallbackTroop);
  return { troops, rows };
}

export function buildPatrolTeamNameFromTroops(troops: readonly string[]) {
  return buildUniqueTroopList(troops).join(' + ');
}

export function validatePatrolProfileDraft(
  troops: readonly string[],
  rows: readonly PatrolProfileChildRow[],
) {
  const normalizedTroops = buildUniqueTroopList(troops);
  if (normalizedTroops.length === 0) {
    return 'Vyber alespoň jeden oddíl.';
  }

  let hasAtLeastOneChild = false;
  const requiresTroopPerChild = normalizedTroops.length > 1;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const firstName = normalizeProfileText(row.firstName);
    const lastName = normalizeProfileText(row.lastName);
    const nickname = normalizeProfileText(row.nickname);
    const troop = normalizeTroopName(row.troop);
    const hasAny = Boolean(firstName || lastName || nickname);
    if (!hasAny) {
      continue;
    }
    if (!firstName || !lastName) {
      return `Dítě ${index + 1}: vyplň jméno i příjmení.`;
    }
    if (requiresTroopPerChild && !troop) {
      return `Dítě ${index + 1}: vyber oddíl.`;
    }
    hasAtLeastOneChild = true;
  }

  if (!hasAtLeastOneChild) {
    return 'Vyplň alespoň jedno dítě.';
  }

  return null;
}
