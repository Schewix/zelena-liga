import {
STATION_PASSAGE_CATEGORIES,
StationCategoryKey
} from '../utils/stationCategories';
import {
CategoryKey
} from '../utils/targetAnswers';
import { SummaryCategoryKey } from './types';

export const SCORE_REVIEW_TASK_KEYS = new Set([
  'score-review',
  'score_review',
  'review-station-scores',
  'calc',
  'calc-score-review',
  'manage-results',
  'manage-wait-times',
]);

export function getStationDisplayName(name: string, code: string | null | undefined): string {
  return code?.trim().toUpperCase() === 'T' ? 'Výpočetka' : name;
}

export function formatBaseCategoryDetailLabel(category: SummaryCategoryKey): string {
  if (category === 'N') return 'N';
  if (category === 'M') return 'M';
  if (category === 'S') return 'S';
  if (category === 'R') return 'R';
  return category;
}

export const BASE_CATEGORY_ORDER: readonly CategoryKey[] = ['N', 'M', 'S', 'R'];

export const CALC_SCORE_REVIEW_ORDER_BY_CATEGORY: Record<StationCategoryKey, readonly string[]> = {
  NH: ['F', 'U', 'C', 'O', 'B', 'Z', 'K', 'P', 'J', 'R'],
  ND: ['F', 'U', 'C', 'O', 'B', 'Z', 'K', 'P', 'J', 'R'],
  MH: ['F', 'U', 'C', 'O', 'B', 'S', 'Z', 'M', 'A', 'K', 'P', 'J', 'R'],
  MD: ['R', 'J', 'P', 'K', 'A', 'M', 'Z', 'S', 'B', 'O', 'C', 'U', 'F'],
  SH: ['F', 'U', 'C', 'B', 'S', 'Z', 'M', 'V', 'N', 'O', 'A', 'P', 'J', 'R'],
  SD: ['R', 'J', 'P', 'A', 'O', 'N', 'V', 'M', 'Z', 'S', 'B', 'C', 'U', 'F'],
  RH: ['A', 'B', 'C', 'D', 'F', 'J', 'M', 'N', 'O', 'P', 'R', 'S', 'U', 'V', 'Z'],
  RD: ['A', 'B', 'C', 'D', 'F', 'J', 'M', 'N', 'O', 'P', 'R', 'S', 'U', 'V', 'Z'],
};

export const CALC_SCORE_REVIEW_SEPARATOR_BEFORE_BY_CATEGORY: Partial<Record<StationCategoryKey, string>> = {
  NH: 'R',
  ND: 'R',
  MH: 'R',
  MD: 'J',
  SH: 'R',
  SD: 'J',
};

export type StationOrderOverrides = {
  categoryOrders: Partial<Record<StationCategoryKey, string[]>>;
  separatorBeforeByCategory: Partial<Record<StationCategoryKey, string>>;
};

export function normalizeStationOrderOverrides(raw: unknown): StationOrderOverrides | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const payload = raw as {
    category_orders?: unknown;
    separator_before_by_category?: unknown;
  };
  const rawOrders =
    payload.category_orders && typeof payload.category_orders === 'object'
      ? (payload.category_orders as Record<string, unknown>)
      : {};
  const rawSeparators =
    payload.separator_before_by_category && typeof payload.separator_before_by_category === 'object'
      ? (payload.separator_before_by_category as Record<string, unknown>)
      : {};

  const categoryOrders: Partial<Record<StationCategoryKey, string[]>> = {};
  const separatorBeforeByCategory: Partial<Record<StationCategoryKey, string>> = {};

  STATION_PASSAGE_CATEGORIES.forEach((category) => {
    const entries = Array.isArray(rawOrders[category]) ? (rawOrders[category] as unknown[]) : [];
    const seen = new Set<string>();
    const normalized: string[] = [];
    entries.forEach((entry) => {
      const code = typeof entry === 'string' ? entry.trim().toUpperCase() : '';
      if (!code || seen.has(code)) {
        return;
      }
      seen.add(code);
      normalized.push(code);
    });
    if (normalized.length > 0) {
      categoryOrders[category] = normalized;
    }

    const separator = typeof rawSeparators[category] === 'string'
      ? rawSeparators[category].trim().toUpperCase()
      : '';
    if (separator) {
      separatorBeforeByCategory[category] = separator;
    }
  });

  return { categoryOrders, separatorBeforeByCategory };
}
