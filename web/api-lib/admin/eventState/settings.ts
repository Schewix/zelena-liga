import { DEFAULT_ANNOUNCED_PLACES,DEFAULT_ANNOUNCED_PLACES_BY_STATION_CATEGORY,DEFAULT_TARGET_ANSWER_OPTION_COUNT,DEFAULT_TIME_LIMIT_MINUTES,DEFAULT_TIME_PENALTY_STEP_MINUTES } from './constants.js';
import { normalizeText,toPositiveInt } from './validation.js';

export type EventScoringSettings = {
  announced_places_n: number;
  announced_places_m: number;
  announced_places_s: number;
  announced_places_r: number;
  announced_places_nh: number;
  announced_places_nd: number;
  announced_places_mh: number;
  announced_places_md: number;
  announced_places_sh: number;
  announced_places_sd: number;
  announced_places_rh: number;
  announced_places_rd: number;
  time_limit_n_minutes: number;
  time_limit_m_minutes: number;
  time_limit_s_minutes: number;
  time_limit_r_minutes: number;
  time_penalty_step_minutes: number;
  target_answer_option_count: 3 | 4;
  participating_troops: string[];
};

export function normalizeTargetAnswerOptionCount(value: unknown): 3 | 4 {
  return value === 3 || value === '3' ? 3 : 4;
}

export function normalizeTroopList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((entry) => {
    const troopName = normalizeText(entry).replace(/\s+/g, ' ');
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
  return result.sort((a, b) => a.localeCompare(b, 'cs', { sensitivity: 'base' }));
}

export function normalizeEventScoringSettings(source: Record<string, unknown> | null | undefined): EventScoringSettings {
  const values = source ?? {};
  const announcedPlacesNH = toPositiveInt(
    values.announced_places_nh ?? values.announced_places_n,
    DEFAULT_ANNOUNCED_PLACES_BY_STATION_CATEGORY.NH,
    100,
  );
  const announcedPlacesND = toPositiveInt(
    values.announced_places_nd ?? values.announced_places_n,
    DEFAULT_ANNOUNCED_PLACES_BY_STATION_CATEGORY.ND,
    100,
  );
  const announcedPlacesMH = toPositiveInt(
    values.announced_places_mh ?? values.announced_places_m,
    DEFAULT_ANNOUNCED_PLACES_BY_STATION_CATEGORY.MH,
    100,
  );
  const announcedPlacesMD = toPositiveInt(
    values.announced_places_md ?? values.announced_places_m,
    DEFAULT_ANNOUNCED_PLACES_BY_STATION_CATEGORY.MD,
    100,
  );
  const announcedPlacesSH = toPositiveInt(
    values.announced_places_sh ?? values.announced_places_s,
    DEFAULT_ANNOUNCED_PLACES_BY_STATION_CATEGORY.SH,
    100,
  );
  const announcedPlacesSD = toPositiveInt(
    values.announced_places_sd ?? values.announced_places_s,
    DEFAULT_ANNOUNCED_PLACES_BY_STATION_CATEGORY.SD,
    100,
  );
  const announcedPlacesRH = toPositiveInt(
    values.announced_places_rh ?? values.announced_places_r,
    DEFAULT_ANNOUNCED_PLACES_BY_STATION_CATEGORY.RH,
    100,
  );
  const announcedPlacesRD = toPositiveInt(
    values.announced_places_rd ?? values.announced_places_r,
    DEFAULT_ANNOUNCED_PLACES_BY_STATION_CATEGORY.RD,
    100,
  );
  return {
    announced_places_n: toPositiveInt(
      values.announced_places_n ?? Math.max(announcedPlacesNH, announcedPlacesND),
      DEFAULT_ANNOUNCED_PLACES.N,
      100,
    ),
    announced_places_m: toPositiveInt(
      values.announced_places_m ?? Math.max(announcedPlacesMH, announcedPlacesMD),
      DEFAULT_ANNOUNCED_PLACES.M,
      100,
    ),
    announced_places_s: toPositiveInt(
      values.announced_places_s ?? Math.max(announcedPlacesSH, announcedPlacesSD),
      DEFAULT_ANNOUNCED_PLACES.S,
      100,
    ),
    announced_places_r: toPositiveInt(
      values.announced_places_r ?? Math.max(announcedPlacesRH, announcedPlacesRD),
      DEFAULT_ANNOUNCED_PLACES.R,
      100,
    ),
    announced_places_nh: announcedPlacesNH,
    announced_places_nd: announcedPlacesND,
    announced_places_mh: announcedPlacesMH,
    announced_places_md: announcedPlacesMD,
    announced_places_sh: announcedPlacesSH,
    announced_places_sd: announcedPlacesSD,
    announced_places_rh: announcedPlacesRH,
    announced_places_rd: announcedPlacesRD,
    time_limit_n_minutes: toPositiveInt(values.time_limit_n_minutes, DEFAULT_TIME_LIMIT_MINUTES.N, 24 * 60),
    time_limit_m_minutes: toPositiveInt(values.time_limit_m_minutes, DEFAULT_TIME_LIMIT_MINUTES.M, 24 * 60),
    time_limit_s_minutes: toPositiveInt(values.time_limit_s_minutes, DEFAULT_TIME_LIMIT_MINUTES.S, 24 * 60),
    time_limit_r_minutes: toPositiveInt(values.time_limit_r_minutes, DEFAULT_TIME_LIMIT_MINUTES.R, 24 * 60),
    time_penalty_step_minutes: toPositiveInt(values.time_penalty_step_minutes, DEFAULT_TIME_PENALTY_STEP_MINUTES, 24 * 60),
    target_answer_option_count: normalizeTargetAnswerOptionCount(
      values.target_answer_option_count ?? DEFAULT_TARGET_ANSWER_OPTION_COUNT,
    ),
    participating_troops: normalizeTroopList(values.participating_troops),
  };
}
