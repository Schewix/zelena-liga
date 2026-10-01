import {
normalisePatrolCode
} from '../components/PatrolCodeInput';
import { Patrol,StationSummaryPatrol } from './types';

export function formatPatrolMetaLabel(patrol: { patrol_code: string | null; category: string; sex: string } | null) {
  if (!patrol) {
    return '';
  }
  const code = formatMergedPatrolCode(patrol.patrol_code);
  if (code) {
    return code;
  }
  const category = patrol.category?.trim();
  const sex = patrol.sex?.trim();
  if (category && sex) {
    return `${category}/${sex}`;
  }
  return category || sex || '';
}

export function formatSummaryPatrolLabel(patrol: StationSummaryPatrol) {
  const mergedCode = formatMergedPatrolCode(patrol.code);
  return mergedCode || `${patrol.baseCategory}/${patrol.sex}`;
}

export function formatMergedPatrolCode(rawCode: string | null | undefined) {
  const normalized = normalisePatrolCode(rawCode ?? '');
  if (!normalized) {
    return '';
  }
  const match = normalized.match(/^([NMSR])(?:[HD])?-(\d{1,3})$/);
  if (!match) {
    return normalized;
  }
  const number = Number.parseInt(match[2], 10);
  if (!Number.isFinite(number) || number <= 0) {
    return normalized;
  }
  return `${match[1]}-${number}`;
}

export function isMergedPatrolCode(rawCode: string) {
  const normalized = normalisePatrolCode(rawCode);
  return /^([NMSR])-(\d{1,3})$/.test(normalized);
}

export function hasExplicitSexPatrolCode(rawCode: string) {
  const normalized = normalisePatrolCode(rawCode);
  return /^([NMSR])([HD])-(\d{1,3})$/.test(normalized);
}

export function comparePatrolCandidates(
  a: Pick<Patrol, 'id' | 'patrol_code'>,
  b: Pick<Patrol, 'id' | 'patrol_code'>,
) {
  const aCode = (a.patrol_code ?? '').trim().toUpperCase();
  const bCode = (b.patrol_code ?? '').trim().toUpperCase();
  if (aCode !== bCode) {
    return aCode.localeCompare(bCode, 'cs');
  }
  return a.id.localeCompare(b.id, 'cs');
}

export function pickPatrolCandidate(candidates: Patrol[], requestedCode: string): Patrol | null {
  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }

  const normalizedRequested = normalisePatrolCode(requestedCode);
  const exactMatches = candidates.filter(
    (candidate) => normalisePatrolCode(candidate.patrol_code ?? '') === normalizedRequested,
  );
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  if (isMergedPatrolCode(normalizedRequested)) {
    const mergedMatches = candidates.filter(
      (candidate) => formatMergedPatrolCode(candidate.patrol_code ?? '') === normalizedRequested,
    );
    if (mergedMatches.length > 0) {
      return mergedMatches.slice().sort(comparePatrolCandidates)[0];
    }
  }

  if (exactMatches.length > 1) {
    return exactMatches.slice().sort(comparePatrolCandidates)[0];
  }

  return candidates.slice().sort(comparePatrolCandidates)[0];
}

export function createManualPatrolFromCode(code: string): Patrol | null {
  const normalized = code.trim().toUpperCase();
  const match = normalized.match(/^([NMSR])([HD])?[- ]?(\d{1,3})$/);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[3], 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  const sex = match[2] ? match[2] : 'H';
  const padded = `${match[1]}${sex}-${String(parsed).padStart(2, '0')}`;
  return {
    id: `manual-${padded}`,
    team_name: 'Ruční hlídka',
    category: match[1],
    sex,
    patrol_code: padded,
    input_patrol_code: normalisePatrolCode(code),
  };
}

export function getPatrolCodeVariants(raw: string) {
  const normalized = normalisePatrolCode(raw);
  if (!normalized) {
    return [];
  }
  const match = normalized.match(/^([NMSR])([HD])?-(\d{1,3})$/);
  if (!match) {
    return [normalized];
  }
  const parsed = Number.parseInt(match[3], 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return [normalized];
  }
  const category = match[1];
  const sex = match[2] ? match[2] : '';
  const noPad = String(parsed);
  const pad2 = noPad.padStart(2, '0');
  const variants: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    const code = value.trim().toUpperCase();
    if (!code || seen.has(code)) {
      return;
    }
    seen.add(code);
    variants.push(code);
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

export function getSummaryPatrolSortKey(patrol: StationSummaryPatrol) {
  const normalized = normalisePatrolCode(patrol.code || '');
  const match = normalized.match(/^([NMSR])(?:[HD])?-(\d{1,3})$/);
  const category = match?.[1] ?? patrol.baseCategory;
  const numberValue = match ? Number(match[2]) : NaN;
  const label = formatSummaryPatrolLabel(patrol).toUpperCase();
  return {
    category,
    numberValue,
    label,
  };
}

export function compareSummaryPatrols(a: StationSummaryPatrol, b: StationSummaryPatrol) {
  const keyA = getSummaryPatrolSortKey(a);
  const keyB = getSummaryPatrolSortKey(b);
  if (keyA.category !== keyB.category) {
    return keyA.category.localeCompare(keyB.category, 'cs');
  }
  const aHasNumber = Number.isFinite(keyA.numberValue);
  const bHasNumber = Number.isFinite(keyB.numberValue);
  if (aHasNumber && bHasNumber && keyA.numberValue !== keyB.numberValue) {
    return keyA.numberValue - keyB.numberValue;
  }
  if (aHasNumber !== bHasNumber) {
    return aHasNumber ? -1 : 1;
  }
  return keyA.label.localeCompare(keyB.label, 'cs');
}
