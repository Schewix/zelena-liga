import { supabase } from '../../supabaseClient';
import { unique } from './draw';
import { EventSetup } from './pageTypes';
import type {
BoardBlock,
BoardCategory,
BoardEvent,
BoardGame,
BoardJudgeAssignment,
BoardJudgeContext
} from './types';

export async function loadJudgeContext(
  judgeId: string,
  options?: {
    includeAllEvents?: boolean;
  },
): Promise<BoardJudgeContext> {
  const { data: assignmentsData, error: assignmentsError } = await supabase
    .from('board_judge_assignment')
    .select('id, event_id, user_id, game_id, category_id, table_number, created_at')
    .eq('user_id', judgeId)
    .order('created_at', { ascending: false });

  if (assignmentsError) {
    throw assignmentsError;
  }

  const assignments = ((assignmentsData ?? []) as BoardJudgeAssignment[]).map((assignment) => ({
    ...assignment,
    category_id: assignment.category_id ?? null,
    table_number: assignment.table_number ?? null,
  }));

  const eventIds = unique(assignments.map((assignment) => assignment.event_id));
  const gameIds = unique(assignments.map((assignment) => assignment.game_id));
  const categoryIds = unique(
    assignments
      .map((assignment) => assignment.category_id)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  );

  const loadAllEvents = options?.includeAllEvents === true;

  const [eventsRes, gamesRes, categoriesRes] = await Promise.all([
    loadAllEvents
      ? supabase
        .from('board_event')
        .select('id, slug, name, start_date, end_date, created_at')
        .order('start_date', { ascending: false, nullsFirst: false })
      : eventIds.length
        ? supabase
          .from('board_event')
          .select('id, slug, name, start_date, end_date, created_at')
          .in('id', eventIds)
          .order('start_date', { ascending: false, nullsFirst: false })
        : Promise.resolve({ data: [], error: null }),
    gameIds.length
      ? supabase
        .from('board_game')
        .select('id, event_id, name, scoring_type, points_order, three_player_adjustment, notes, created_at')
        .in('id', gameIds)
        .order('name', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    categoryIds.length
      ? supabase
        .from('board_category')
        .select('id, event_id, name, primary_game_id, created_at')
        .in('id', categoryIds)
        .order('name', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (eventsRes.error) {
    throw eventsRes.error;
  }
  if (gamesRes.error) {
    throw gamesRes.error;
  }
  if (categoriesRes.error) {
    throw categoriesRes.error;
  }

  return {
    assignments,
    events: (eventsRes.data ?? []) as BoardEvent[],
    games: (gamesRes.data ?? []) as BoardGame[],
    categories: (categoriesRes.data ?? []) as BoardCategory[],
  };
}

export async function loadEventSetup(eventId: string): Promise<EventSetup> {
  const [categoriesRes, gamesRes, blocksRes] = await Promise.all([
    supabase
      .from('board_category')
      .select('id, event_id, name, primary_game_id, created_at')
      .eq('event_id', eventId)
      .order('name', { ascending: true }),
    supabase
      .from('board_game')
      .select('id, event_id, name, scoring_type, points_order, three_player_adjustment, notes, created_at')
      .eq('event_id', eventId)
      .order('name', { ascending: true }),
    supabase
      .from('board_block')
      .select('id, event_id, category_id, block_number, game_id, created_at')
      .eq('event_id', eventId)
      .order('block_number', { ascending: true }),
  ]);

  if (categoriesRes.error) throw categoriesRes.error;
  if (gamesRes.error) throw gamesRes.error;
  if (blocksRes.error) throw blocksRes.error;

  return {
    categories: (categoriesRes.data ?? []) as BoardCategory[],
    games: (gamesRes.data ?? []) as BoardGame[],
    blocks: (blocksRes.data ?? []) as BoardBlock[],
  };
}

export function assignmentMatchesBlockAndTable(
  assignment: BoardJudgeAssignment,
  block: BoardBlock,
  tableNumber: number | null | undefined,
): boolean {
  if (assignment.game_id !== block.game_id) {
    return false;
  }
  if (assignment.category_id && assignment.category_id !== block.category_id) {
    return false;
  }
  if (assignment.table_number === null || assignment.table_number === undefined) {
    return true;
  }
  if (tableNumber === null || tableNumber === undefined) {
    return false;
  }
  return assignment.table_number === tableNumber;
}
