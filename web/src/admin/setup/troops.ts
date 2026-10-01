import { normalizeText } from '../shared/text';

export type PtoTroopRegistryEntry = {
  canonicalName: string;
  numbers: number[];
  aliases?: string[];
};

export const PTO_TROOP_REGISTRY: ReadonlyArray<PtoTroopRegistryEntry> = [
  { canonicalName: '2. PTO Poutníci', numbers: [2], aliases: ['PTO Poutníci', 'Poutníci'] },
  { canonicalName: '6. PTO Nibowaka', numbers: [6], aliases: ['PTO Nibowaka', 'Nibowaka'] },
  { canonicalName: '8. PTO Mustangové', numbers: [8], aliases: ['PTO Mustangové', 'Mustangové'] },
  { canonicalName: '10. PTO Severka', numbers: [10], aliases: ['10 PTO Severka'] },
  { canonicalName: '11. PTO Iktomi', numbers: [11], aliases: ['PTO Iktomi', 'Iktomi'] },
  { canonicalName: '15. PTO Vatra', numbers: [15], aliases: ['PTO Vatra', 'Vatra'] },
  { canonicalName: '21. PTO Hády', numbers: [21], aliases: ['PTO Hády', 'Hady'] },
  {
    canonicalName: 'ZS PCV',
    numbers: [14, 24, 25, 26, 27],
    aliases: [
      'ZS PCV',
      'ZSPCV',
      '14. TSP Zeměpisná společnost PCV',
      '14. TSP Zemepisna spolecnost PCV',
      'TSP Zeměpisná společnost PCV',
      'TSP Zemepisna spolecnost PCV',
      'Zeměpisná společnost PCV',
      'Zemepisna spolecnost PCV',
      '24. PTO života v přírodě',
      '25. PTO Ochrany přírody',
      '26. PTO Kulturní historie',
      '27. PTO Lesní moudrosti',
      'života v přírodě',
      'ochrany přírody',
      'kulturní historie',
      'lesní moudrosti',
    ],
  },
  { canonicalName: '32. PTO Severka', numbers: [32], aliases: ['32 PTO Severka'] },
  { canonicalName: '34. PTO Tulák', numbers: [34], aliases: ['PTO Tulák', 'Tulák'] },
  { canonicalName: '41. PTO Dráčata', numbers: [41], aliases: ['PTO Dráčata', 'Dracata'] },
  { canonicalName: '48. PTO Stezka', numbers: [48], aliases: ['PTO Stezka', 'Stezka'] },
  { canonicalName: '61. PTO Tuhas', numbers: [61], aliases: ['PTO Tuhas', 'Tuhas'] },
  { canonicalName: '63. PTO Phoenix', numbers: [63], aliases: ['PTO Phoenix', 'Phoenix'] },
  { canonicalName: '64. PTO Lorien', numbers: [64], aliases: ['PTO Lorien', 'Lorien'] },
  { canonicalName: '66. PTO Brabrouci', numbers: [66], aliases: ['PTO Brabrouci', 'Brabrouci'] },
  { canonicalName: '99. PTO Kamzíci', numbers: [99], aliases: ['PTO Kamzíci', 'Kamzici'] },
  { canonicalName: '111. PTO Vinohrady', numbers: [111], aliases: ['PTO Vinohrady', 'Vinohrady'] },
  { canonicalName: '172. PTO Pegas', numbers: [172], aliases: ['PTO Pegas', 'Pegas'] },
  { canonicalName: '176. PTO Vlčata', numbers: [176], aliases: ['PTO Vlčata', 'Vlcata'] },
  {
    canonicalName: 'PTO Žabky Jedovnice',
    numbers: [],
    aliases: ['PTO Žabky Jedovnice', 'Žabky Jedovnice', 'Zabky Jedovnice', 'Žabky'],
  },
];

export const DEFAULT_SETUP_TROOP_OPTIONS = PTO_TROOP_REGISTRY.map((entry) => entry.canonicalName).sort(compareTroopSheetOrder);

export function normalizeTroopName(value: string | null | undefined): string {
  return normalizeText(value).replace(/\s+/g, ' ');
}

export function normalizeTroopList(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const result: string[] = [];
  list.forEach((entry) => {
    const troopName = normalizeTroopName(typeof entry === 'string' ? entry : '');
    if (!troopName) {
      return;
    }
    const key = troopName.toLocaleLowerCase('cs');
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(troopName.slice(0, 120));
  });
  return result.sort(compareTroopSheetOrder);
}

export function parseTroopNumber(value: string): number | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  const match = normalized.match(/^(\d{1,4})\s*\.?/);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function troopNameQualityScore(value: string, troopNumber: number) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return -1;
  }
  const withoutNumber = normalized.replace(new RegExp(`^${troopNumber}\\s*\\.?\\s*`, 'i'), '').trim();
  if (!withoutNumber) {
    return 0;
  }
  if (/^PTO$/i.test(withoutNumber)) {
    return 1;
  }
  if (/^PTO\b/i.test(withoutNumber)) {
    return 10 + withoutNumber.length;
  }
  return 5 + withoutNumber.length;
}

export function pickCanonicalTroopName(troopNumber: number, candidates: readonly string[]) {
  let bestName = '';
  let bestScore = -1;
  candidates.forEach((candidate) => {
    const normalizedCandidate = normalizeText(candidate);
    if (!normalizedCandidate) {
      return;
    }
    const score = troopNameQualityScore(normalizedCandidate, troopNumber);
    if (score > bestScore || (score === bestScore && normalizedCandidate.length > bestName.length)) {
      bestName = normalizedCandidate;
      bestScore = score;
    }
  });
  if (bestScore <= 0 || !bestName) {
    return `${troopNumber}. PTO`;
  }
  return bestName;
}

export function compareTroopSheetOrder(a: string, b: string) {
  const aNumber = parseTroopNumber(a);
  const bNumber = parseTroopNumber(b);
  if (aNumber !== null && bNumber !== null) {
    if (aNumber !== bNumber) {
      return aNumber - bNumber;
    }
    return a.localeCompare(b, 'cs', { sensitivity: 'base' });
  }
  if (aNumber !== null) {
    return -1;
  }
  if (bNumber !== null) {
    return 1;
  }
  return a.localeCompare(b, 'cs', { sensitivity: 'base' });
}

export function isMixedTroopPlaceholder(value: string) {
  return /^(?:sm[ií]s(?:en[áa]?|ene?)?|sm[ií]šen[áaýy]?\s+hl[ií]dka|mix(?:ed)?)$/i.test(value.trim());
}

export function splitMixedTroopNames(rawTeamName: string | null | undefined): string[] {
  const normalized = normalizeText(rawTeamName);
  if (!normalized) {
    return ['Bez oddílu'];
  }

  const hasMultipleNumberedTroops = (normalized.match(/\d+\s*\.?\s*PTO/gi) ?? []).length >= 2;
  const splitPattern = hasMultipleNumberedTroops
    ? /\s*(?:\+|\/|&|;|\|)\s*|\s+\ba\b\s+|\s+\band\b\s+|,\s*(?=\d+\s*\.?)/gi
    : /\s*(?:\+|\/|&|;|\|)\s*|,\s*(?=\d+\s*\.?)/gi;
  const parts = normalized
    .split(splitPattern)
    .map((part) =>
      part
        .replace(/^\(?\s*(?:sm[ií]šen[áaýy]?\s+hl[ií]dka|sm[ií]s(?:en[áa]?|ene?)?|mix(?:ed)?)\s*[:\-]?\s*/i, '')
        .replace(/\s*\)?$/, '')
        .trim(),
    )
    .filter((part) => Boolean(part) && !isMixedTroopPlaceholder(part));

  if (!parts.length) {
    return ['Bez oddílu'];
  }

  const seen = new Set<string>();
  return parts.filter((part) => {
    const key = part.toLocaleLowerCase('cs');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
