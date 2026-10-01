import type { AuthStatus } from '../auth/types';
import {
StationCategoryKey
} from '../utils/stationCategories';
import {
CategoryKey,
type TargetAnswerOptionCount
} from '../utils/targetAnswers';
import {
type AdminJudgeAssignmentSummary
} from './components/AdminStationHealthPanel';

export type AuthenticatedState = Extract<AuthStatus, { state: 'authenticated' }>;

export type AnswersFormState = Record<CategoryKey, string>;

export type AnswersSummary = Record<CategoryKey, { letters: string[]; updatedAt: string | null }>;

export type PatrolSummary = {
  id: string;
  code: string;
  teamName: string;
  category: CategoryKey;
};

export type DisqualifyPatrol = {
  id: string;
  code: string;
  teamName: string;
  category: string;
  sex: string;
  disqualified: boolean;
};

export type StationPassageRow = {
  stationId: string;
  stationCode: string;
  stationName: string;
  lastPassageAt: string | null;
  categories: CategoryKey[];
  totals: Record<CategoryKey, number>;
  expectedTotals: Record<CategoryKey, number>;
  totalPassed: number;
  totalExpected: number;
  missing: Record<CategoryKey, PatrolSummary[]>;
  totalMissing: PatrolSummary[];
};

export type EventState = {
  name: string;
  scoringLocked: boolean;
  resultsConfirmedAt: string | null;
};

export type MissingDialogState = {
  stationCode: string;
  stationName: string;
  category: CategoryKey | 'TOTAL';
  missing: PatrolSummary[];
  expected: number;
};

export type SetupEventRow = {
  id: string;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  scoring_locked?: boolean | null;
  announced_places_n?: number | null;
  announced_places_nh?: number | null;
  announced_places_nd?: number | null;
  announced_places_m?: number | null;
  announced_places_mh?: number | null;
  announced_places_md?: number | null;
  announced_places_s?: number | null;
  announced_places_sh?: number | null;
  announced_places_sd?: number | null;
  announced_places_r?: number | null;
  announced_places_rh?: number | null;
  announced_places_rd?: number | null;
  time_limit_n_minutes?: number | null;
  time_limit_m_minutes?: number | null;
  time_limit_s_minutes?: number | null;
  time_limit_r_minutes?: number | null;
  time_penalty_step_minutes?: number | null;
  target_answer_option_count?: number | null;
  participating_troops?: string[] | null;
};

export type SetupStationRow = {
  id: string;
  event_id: string;
  code: string | null;
  name: string | null;
  is_closed?: boolean | null;
  is_split?: boolean | null;
  split_categories?: string[] | null;
};

export type SetupJudgeRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at?: string | null;
};

export type SetupAssignmentRow = {
  id: string;
  judge_id: string;
  station_id: string;
  event_id: string;
  allowed_categories: string[] | null;
  allowed_tasks?: string[] | null;
  judge_display_name?: string | null;
  created_at?: string | null;
};

export type SetupStationOrderRow = {
  event_id: string;
  category_orders?: Record<string, unknown> | null;
  separator_before_by_category?: Record<string, unknown> | null;
  updated_at?: string | null;
};

export type SetupStationOrderPayload = {
  category_orders: Partial<Record<StationCategoryKey, string[]>>;
  separator_before_by_category: Partial<Record<StationCategoryKey, string>>;
};

export type StationSplitDraft = {
  isSplit: boolean;
  categories: CategoryKey[];
};

export type PatrolCountsState = Record<StationCategoryKey, number>;

export type PatrolStartsState = Record<StationCategoryKey, number>;

export type CategoryToggleState = Record<CategoryKey, boolean>;

export type SetupEventScoringConfig = {
  announcedPlaces: Record<StationCategoryKey, number>;
  timeLimitMinutes: Record<CategoryKey, number>;
  timePenaltyStepMinutes: number;
  targetAnswerOptionCount: TargetAnswerOptionCount;
  participatingTroops: string[];
};

export type JudgeTaskPresetKey =
  | 'station-basic'
  | 'score-review'
  | 'calc-score-review'
  | 'manage-results'
  | 'manage-wait-times';

export type JudgeTaskPreset = {
  key: JudgeTaskPresetKey;
  label: string;
  tasks: string[];
};

export type SelectedSetupAssignmentSummary = AdminJudgeAssignmentSummary & {
  createdAt: string;
};
