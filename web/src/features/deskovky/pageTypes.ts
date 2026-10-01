import type { AuthStatus } from '../../auth/types';
import type {
BoardBlock,
BoardCategory,
BoardGame,
BoardPlayer
} from './types';

export type AuthenticatedState = Extract<AuthStatus, { state: 'authenticated' }>;

export type DeskovkyPage = 'home' | 'new-match' | 'standings' | 'rules' | 'admin';

export type MatchEntry = {
  seat: number;
  player: BoardPlayer | null;
  points: string;
  placement: string;
};

export type EventSetup = {
  categories: BoardCategory[];
  games: BoardGame[];
  blocks: BoardBlock[];
};

export type CsvRow = {
  short_code: string;
  team_name: string;
  display_name: string;
  category: string;
};

export type AdminSectionKey =
  | 'overview'
  | 'event'
  | 'draw'
  | 'disqualify'
  | 'assignments'
  | 'categories'
  | 'games'
  | 'blocks'
  | 'players'
  | 'judges'
  | 'import-export';

export type AdminSectionHeaderConfig = {
  description: string;
  action?: {
    label: string;
    kind: 'primary' | 'secondary';
    disabled?: boolean;
    onClick: () => void;
  };
};
