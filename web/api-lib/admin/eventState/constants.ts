

export type StationCategoryKey = 'NH' | 'ND' | 'MH' | 'MD' | 'SH' | 'SD' | 'RH' | 'RD';

export const CATEGORY_KEYS = ['N', 'M', 'S', 'R'] as const;

export type BaseCategoryKey = (typeof CATEGORY_KEYS)[number];

export const STATION_CATEGORY_KEYS: StationCategoryKey[] = ['NH', 'ND', 'MH', 'MD', 'SH', 'SD', 'RH', 'RD'];

export const MAX_PATROLS_PER_CATEGORY = 300;

export const DEFAULT_ANNOUNCED_PLACES: Record<BaseCategoryKey, number> = {
  N: 5,
  M: 6,
  S: 6,
  R: 3,
};

export const DEFAULT_ANNOUNCED_PLACES_BY_STATION_CATEGORY: Record<StationCategoryKey, number> = {
  NH: DEFAULT_ANNOUNCED_PLACES.N,
  ND: DEFAULT_ANNOUNCED_PLACES.N,
  MH: DEFAULT_ANNOUNCED_PLACES.M,
  MD: DEFAULT_ANNOUNCED_PLACES.M,
  SH: DEFAULT_ANNOUNCED_PLACES.S,
  SD: DEFAULT_ANNOUNCED_PLACES.S,
  RH: DEFAULT_ANNOUNCED_PLACES.R,
  RD: DEFAULT_ANNOUNCED_PLACES.R,
};

export const DEFAULT_TIME_LIMIT_MINUTES: Record<BaseCategoryKey, number> = {
  N: 110,
  M: 140,
  S: 140,
  R: 140,
};

export const DEFAULT_TIME_PENALTY_STEP_MINUTES = 20;

export const DEFAULT_TARGET_ANSWER_OPTION_COUNT = 4;

export const EVENT_SCORING_SETTINGS_SELECT =
  'announced_places_n,announced_places_m,announced_places_s,announced_places_r,announced_places_nh,announced_places_nd,announced_places_mh,announced_places_md,announced_places_sh,announced_places_sd,announced_places_rh,announced_places_rd,time_limit_n_minutes,time_limit_m_minutes,time_limit_s_minutes,time_limit_r_minutes,time_penalty_step_minutes,target_answer_option_count,participating_troops';
