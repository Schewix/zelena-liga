import { BaseCategoryKey,CATEGORY_KEYS,STATION_CATEGORY_KEYS,StationCategoryKey } from './constants.js';

export function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeEmail(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

export function normalizeStationCode(value: unknown): string {
  return normalizeText(value).toUpperCase();
}

export function normalizePatrolMembers(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.replace(/\r\n?/g, '\n');
  const compact = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
  return compact.length > 0 ? compact : null;
}

export function hasAtLeastOneFullName(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const people = value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap((line) => line.split(/[;,|]/g))
    .map((item) => item.trim())
    .filter(Boolean);
  return people.some((person) => {
    const words = person.split(/\s+/).filter(Boolean);
    return words.length >= 2 && words[0].length >= 2 && words[1].length >= 2;
  });
}

export function toNonNegativeInt(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return Math.max(0, Math.round(fallback));
}

export function toPositiveInt(value: unknown, fallback: number, max = 1_000): number {
  const next = toNonNegativeInt(value, fallback);
  if (!Number.isFinite(next)) {
    return fallback;
  }
  return Math.min(max, Math.max(1, next));
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function normalizeAllowedCategories(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [];
  const normalized = values
    .map((entry) => normalizeText(entry).toUpperCase())
    .filter((entry) => CATEGORY_KEYS.includes(entry as (typeof CATEGORY_KEYS)[number]));
  const unique = Array.from(new Set(normalized));
  unique.sort();
  return unique;
}

export function normalizeStationSplitCategories(value: unknown): BaseCategoryKey[] {
  const normalized = normalizeAllowedCategories(value);
  return CATEGORY_KEYS.filter((category) => normalized.includes(category));
}

export function normalizeAllowedTasks(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [];
  const normalized = values.map((entry) => normalizeText(entry)).filter(Boolean);
  return Array.from(new Set(normalized));
}

export function normalizeStationCodeList(value: unknown): string[] {
  const asArray =
    Array.isArray(value) && value.length > 0
      ? value
      : typeof value === 'string'
        ? value
            .split(/[^A-Za-z0-9]+/)
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
  const seen = new Set<string>();
  const list: string[] = [];
  for (const raw of asArray) {
    const code = normalizeStationCode(raw);
    if (!code || seen.has(code)) {
      continue;
    }
    seen.add(code);
    list.push(code);
  }
  return list;
}

export function normalizeStationOrderPayload(payload: Record<string, unknown>) {
  const rawOrders =
    payload.category_orders && typeof payload.category_orders === 'object'
      ? (payload.category_orders as Record<string, unknown>)
      : {};
  const rawSeparators =
    payload.separator_before_by_category && typeof payload.separator_before_by_category === 'object'
      ? (payload.separator_before_by_category as Record<string, unknown>)
      : {};

  const categoryOrders: Record<StationCategoryKey, string[]> = {
    NH: [],
    ND: [],
    MH: [],
    MD: [],
    SH: [],
    SD: [],
    RH: [],
    RD: [],
  };
  const separatorBeforeByCategory: Partial<Record<StationCategoryKey, string>> = {};

  STATION_CATEGORY_KEYS.forEach((category) => {
    categoryOrders[category] = normalizeStationCodeList(rawOrders[category]);
    const separator = normalizeStationCode(rawSeparators[category]);
    if (separator) {
      separatorBeforeByCategory[category] = separator;
    }
  });

  return {
    categoryOrders,
    separatorBeforeByCategory,
  };
}

export function parseIsoOrNull(value: unknown): string | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return new Date(timestamp).toISOString();
}
