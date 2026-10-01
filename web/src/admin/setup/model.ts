import {
getStationAllowedBaseCategories,
STATION_PASSAGE_CATEGORIES,
StationCategoryKey
} from '../../utils/stationCategories';
import {
CategoryKey,
isCategoryKey
} from '../../utils/targetAnswers';
import { BASE_CATEGORY_ORDER } from '../overview/constants';
import { normalizeText } from '../shared/text';
import { CategoryToggleState,JudgeTaskPreset,JudgeTaskPresetKey,PatrolCountsState,PatrolStartsState,SetupEventRow,SetupEventScoringConfig,SetupStationOrderPayload,StationSplitDraft } from '../types';
import { normalizeTroopList } from './troops';
import { DEFAULT_TARGET_ANSWER_OPTION_COUNT,toPositiveInt,toTargetAnswerOptionCount } from './validation';

export const SETUP_CATEGORY_ORDER_DEFAULTS: Record<StationCategoryKey, readonly string[]> = {
  NH: ['F', 'U', 'C', 'O', 'B', 'Z', 'K', 'P', 'J', 'R'],
  ND: ['F', 'U', 'C', 'O', 'B', 'Z', 'K', 'P', 'J', 'R'],
  MH: ['F', 'U', 'C', 'O', 'B', 'S', 'Z', 'M', 'A', 'K', 'P', 'J', 'R'],
  MD: ['R', 'J', 'P', 'K', 'A', 'M', 'Z', 'S', 'B', 'O', 'C', 'U', 'F'],
  SH: ['F', 'U', 'C', 'B', 'S', 'Z', 'M', 'V', 'N', 'O', 'A', 'P', 'J', 'R'],
  SD: ['R', 'J', 'P', 'A', 'O', 'N', 'V', 'M', 'Z', 'S', 'B', 'C', 'U', 'F'],
  RH: ['A', 'B', 'C', 'D', 'F', 'J', 'M', 'N', 'O', 'P', 'R', 'S', 'U', 'V', 'Z'],
  RD: ['A', 'B', 'C', 'D', 'F', 'J', 'M', 'N', 'O', 'P', 'R', 'S', 'U', 'V', 'Z'],
};

export const SETUP_SEPARATOR_DEFAULTS: Partial<Record<StationCategoryKey, string>> = {
  NH: 'R',
  ND: 'R',
  MH: 'R',
  MD: 'J',
  SH: 'R',
  SD: 'J',
};

export const DEFAULT_SETUP_ANNOUNCED_PLACES: Record<CategoryKey, number> = {
  N: 5,
  M: 6,
  S: 6,
  R: 3,
};

export const DEFAULT_SETUP_ANNOUNCED_PLACES_BY_STATION_CATEGORY: Record<StationCategoryKey, number> = {
  NH: DEFAULT_SETUP_ANNOUNCED_PLACES.N,
  ND: DEFAULT_SETUP_ANNOUNCED_PLACES.N,
  MH: DEFAULT_SETUP_ANNOUNCED_PLACES.M,
  MD: DEFAULT_SETUP_ANNOUNCED_PLACES.M,
  SH: DEFAULT_SETUP_ANNOUNCED_PLACES.S,
  SD: DEFAULT_SETUP_ANNOUNCED_PLACES.S,
  RH: DEFAULT_SETUP_ANNOUNCED_PLACES.R,
  RD: DEFAULT_SETUP_ANNOUNCED_PLACES.R,
};

export const DEFAULT_SETUP_TIME_LIMITS_MINUTES: Record<CategoryKey, number> = {
  N: 110,
  M: 140,
  S: 140,
  R: 140,
};

export const DEFAULT_SETUP_TIME_PENALTY_STEP_MINUTES = 20;

export const JUDGE_TASK_PRESETS: ReadonlyArray<JudgeTaskPreset> = [
  {
    key: 'station-basic',
    label: 'Klasický rozhodčí (zápis bodů)',
    tasks: [],
  },
  {
    key: 'score-review',
    label: 'Kontrola bodů (score-review)',
    tasks: ['score-review'],
  },
  {
    key: 'calc-score-review',
    label: 'Výpočetka - rozšířená kontrola bodů',
    tasks: ['calc-score-review'],
  },
  {
    key: 'manage-results',
    label: 'Správa výsledků',
    tasks: ['manage-results'],
  },
  {
    key: 'manage-wait-times',
    label: 'Správa čekacích dob',
    tasks: ['manage-wait-times'],
  },
];

export const DEFAULT_JUDGE_TASK_PRESET: JudgeTaskPresetKey = 'station-basic';

export function toJudgeTaskPresetKey(value: string): JudgeTaskPresetKey {
  const normalized = value.trim() as JudgeTaskPresetKey;
  return JUDGE_TASK_PRESETS.some((preset) => preset.key === normalized)
    ? normalized
    : DEFAULT_JUDGE_TASK_PRESET;
}

export function getJudgeTasksForPreset(presetKey: JudgeTaskPresetKey): string[] {
  return JUDGE_TASK_PRESETS.find((preset) => preset.key === presetKey)?.tasks ?? [];
}

export function createDefaultSetupEventScoringConfig(): SetupEventScoringConfig {
  return {
    announcedPlaces: { ...DEFAULT_SETUP_ANNOUNCED_PLACES_BY_STATION_CATEGORY },
    timeLimitMinutes: { ...DEFAULT_SETUP_TIME_LIMITS_MINUTES },
    timePenaltyStepMinutes: DEFAULT_SETUP_TIME_PENALTY_STEP_MINUTES,
    targetAnswerOptionCount: DEFAULT_TARGET_ANSWER_OPTION_COUNT,
    participatingTroops: [],
  };
}

export function normalizeSetupEventScoringConfig(source: SetupEventRow | null | undefined): SetupEventScoringConfig {
  const defaults = createDefaultSetupEventScoringConfig();
  if (!source) {
    return defaults;
  }
  return {
    announcedPlaces: {
      NH: toPositiveInt(
        source.announced_places_nh ?? source.announced_places_n,
        defaults.announcedPlaces.NH,
        100,
      ),
      ND: toPositiveInt(
        source.announced_places_nd ?? source.announced_places_n,
        defaults.announcedPlaces.ND,
        100,
      ),
      MH: toPositiveInt(
        source.announced_places_mh ?? source.announced_places_m,
        defaults.announcedPlaces.MH,
        100,
      ),
      MD: toPositiveInt(
        source.announced_places_md ?? source.announced_places_m,
        defaults.announcedPlaces.MD,
        100,
      ),
      SH: toPositiveInt(
        source.announced_places_sh ?? source.announced_places_s,
        defaults.announcedPlaces.SH,
        100,
      ),
      SD: toPositiveInt(
        source.announced_places_sd ?? source.announced_places_s,
        defaults.announcedPlaces.SD,
        100,
      ),
      RH: toPositiveInt(
        source.announced_places_rh ?? source.announced_places_r,
        defaults.announcedPlaces.RH,
        100,
      ),
      RD: toPositiveInt(
        source.announced_places_rd ?? source.announced_places_r,
        defaults.announcedPlaces.RD,
        100,
      ),
    },
    timeLimitMinutes: {
      N: toPositiveInt(source.time_limit_n_minutes, defaults.timeLimitMinutes.N, 24 * 60),
      M: toPositiveInt(source.time_limit_m_minutes, defaults.timeLimitMinutes.M, 24 * 60),
      S: toPositiveInt(source.time_limit_s_minutes, defaults.timeLimitMinutes.S, 24 * 60),
      R: toPositiveInt(source.time_limit_r_minutes, defaults.timeLimitMinutes.R, 24 * 60),
    },
    timePenaltyStepMinutes: toPositiveInt(
      source.time_penalty_step_minutes,
      defaults.timePenaltyStepMinutes,
      24 * 60,
    ),
    targetAnswerOptionCount: toTargetAnswerOptionCount(
      source.target_answer_option_count,
      defaults.targetAnswerOptionCount,
    ),
    participatingTroops: normalizeTroopList(source.participating_troops),
  };
}

export function createDefaultOrderTextState(): Record<StationCategoryKey, string> {
  return STATION_PASSAGE_CATEGORIES.reduce(
    (acc, category) => {
      acc[category] = SETUP_CATEGORY_ORDER_DEFAULTS[category].join(', ');
      return acc;
    },
    {} as Record<StationCategoryKey, string>,
  );
}

export function createDefaultSeparatorState(): Partial<Record<StationCategoryKey, string>> {
  return { ...SETUP_SEPARATOR_DEFAULTS };
}

export function createDefaultPatrolCounts(): PatrolCountsState {
  return STATION_PASSAGE_CATEGORIES.reduce(
    (acc, category) => {
      acc[category] = 0;
      return acc;
    },
    {} as PatrolCountsState,
  );
}

export function createDefaultPatrolStarts(): PatrolStartsState {
  return STATION_PASSAGE_CATEGORIES.reduce(
    (acc, category) => {
      acc[category] = 1;
      return acc;
    },
    {} as PatrolStartsState,
  );
}

export function createDefaultCategoryToggleState(): CategoryToggleState {
  return {
    N: true,
    M: true,
    S: true,
    R: true,
  };
}

export function normalizeStationSplitCategories(value: unknown): CategoryKey[] {
  const list = Array.isArray(value) ? value : [];
  const normalized = list
    .map((entry) => (typeof entry === 'string' ? entry.trim().toUpperCase() : ''))
    .filter((entry): entry is CategoryKey => isCategoryKey(entry));
  const unique = new Set(normalized);
  return BASE_CATEGORY_ORDER.filter((category) => unique.has(category));
}

export function getConfiguredStationBaseCategories(input: {
  stationCode: string;
  isSplit?: boolean | null;
  splitCategories?: unknown;
}): CategoryKey[] {
  const splitCategories = normalizeStationSplitCategories(input.splitCategories);
  if (input.isSplit === true && splitCategories.length > 0) {
    return splitCategories;
  }
  return getStationAllowedBaseCategories(input.stationCode);
}

export function normalizeStationSplitDraft(draft: StationSplitDraft): StationSplitDraft {
  return {
    isSplit: draft.isSplit === true,
    categories: normalizeStationSplitCategories(draft.categories),
  };
}

export function isSameCategoryList(left: readonly CategoryKey[], right: readonly CategoryKey[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

export function createBaseCategoryRecord<T>(factory: () => T): Record<CategoryKey, T> {
  return {
    N: factory(),
    M: factory(),
    S: factory(),
    R: factory(),
  };
}

export function normalizeSetupStationOrder(raw: unknown): SetupStationOrderPayload | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const source = raw as {
    category_orders?: unknown;
    separator_before_by_category?: unknown;
  };
  const rawOrders =
    source.category_orders && typeof source.category_orders === 'object'
      ? (source.category_orders as Record<string, unknown>)
      : {};
  const rawSeparators =
    source.separator_before_by_category && typeof source.separator_before_by_category === 'object'
      ? (source.separator_before_by_category as Record<string, unknown>)
      : {};

  const categoryOrders: Partial<Record<StationCategoryKey, string[]>> = {};
  const separatorBeforeByCategory: Partial<Record<StationCategoryKey, string>> = {};

  STATION_PASSAGE_CATEGORIES.forEach((category) => {
    const list = Array.isArray(rawOrders[category]) ? rawOrders[category] : [];
    const seen = new Set<string>();
    const normalizedList: string[] = [];
    list.forEach((entry) => {
      const code = normalizeText(typeof entry === 'string' ? entry : '').toUpperCase();
      if (!code || seen.has(code)) {
        return;
      }
      seen.add(code);
      normalizedList.push(code);
    });
    if (normalizedList.length > 0) {
      categoryOrders[category] = normalizedList;
    }

    const separator = normalizeText(typeof rawSeparators[category] === 'string' ? rawSeparators[category] : '').toUpperCase();
    if (separator) {
      separatorBeforeByCategory[category] = separator;
    }
  });

  return {
    category_orders: categoryOrders,
    separator_before_by_category: separatorBeforeByCategory,
  };
}
