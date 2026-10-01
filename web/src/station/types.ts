import type { AuthStatus } from '../auth/types';
import {
OutboxEntry
} from '../outbox';
import {
StationCategoryKey
} from '../utils/stationCategories';
import {
CategoryKey
} from '../utils/targetAnswers';

export interface Patrol {
  id: string;
  team_name: string;
  category: string;
  sex: string;
  patrol_code: string | null;
  patrol_members?: string | null;
  input_patrol_code?: string | null;
}

export type OutboxState = OutboxEntry['state'];

export interface StationScoreRow {
  stationId: string;
  stationCode: string;
  stationName: string;
  points: number | null;
  waitMinutes: number | null;
  judge: string | null;
  note: string | null;
  hasScore: boolean;
  hasWait: boolean;
  separatorBefore?: boolean;
}

export interface StationScoreRowState {
  ok: boolean;
  pointsDraft: string;
  waitDraft: string;
  saving: boolean;
  error: string | null;
}

export interface PatrolFormDraft {
  points: string;
  note: string;
  answersInput: string;
  useTargetScoring: boolean;
  waitDraft: string;
  arrivedAt: string | null;
  startTime: string | null;
  finishAt: string | null;
}

export type CalcPatrolLoadMode = 'full' | 'profile';

export type PatrolProfileChildRow = {
  firstName: string;
  lastName: string;
  nickname: string;
  troop: string;
};

export interface StationSummaryPatrol {
  id: string;
  code: string;
  teamName: string;
  baseCategory: string;
  sex: string;
  visited: boolean;
}

export type SummaryCategoryKey = CategoryKey | StationCategoryKey;

export interface StationCategorySummaryItem {
  key: SummaryCategoryKey;
  expected: number;
  visited: number;
  missing: StationSummaryPatrol[];
  completed: StationSummaryPatrol[];
}

export interface StationCategorySummary {
  items: StationCategorySummaryItem[];
  totalExpected: number;
  totalVisited: number;
  totalMissing: StationSummaryPatrol[];
}

export type AuthenticatedState = Extract<AuthStatus, { state: 'authenticated' }>;
