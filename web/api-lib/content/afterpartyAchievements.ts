import {
  createStateFromApprovedOrders,
  getUnlockedAchievements,
  type ApprovedOrderForState,
} from '../../src/secretMenu/gamification.js';

type SupabaseClient = ReturnType<typeof import('./supabaseAdmin.js').getSupabaseAdminClient>;

type ApprovedOrderRow = {
  id: string;
  participant_id: string;
  submitted_at: string;
  reviewed_at: string | null;
  afterparty_order_items: Array<{ drink_key: string; approved_quantity: number | null }> | null;
};

const PAGE_SIZE = 500;

async function loadApprovedOrders(supabase: SupabaseClient, participantIds?: string[]) {
  const rows: ApprovedOrderRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('afterparty_orders')
      .select('id, participant_id, submitted_at, reviewed_at, afterparty_order_items(drink_key, approved_quantity)')
      .eq('status', 'approved')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (participantIds) {
      query = query.in('participant_id', participantIds);
    }
    const { data, error } = await query;
    if (error) {
      throw error;
    }
    const page = (data ?? []) as unknown as ApprovedOrderRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) {
      return rows;
    }
  }
}

async function loadParticipantIds(supabase: SupabaseClient) {
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('afterparty_participants')
      .select('id')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      throw error;
    }
    const page = (data ?? []) as Array<{ id: string }>;
    ids.push(...page.map((row) => row.id));
    if (page.length < PAGE_SIZE) {
      return ids;
    }
  }
}

/**
 * Recomputes achievement awards from approved orders so leaderboards match the app.
 * Pass participant ids to limit the recompute, or omit them to backfill everybody.
 */
export async function syncAfterpartyAchievements(supabase: SupabaseClient, participantIds?: string[]) {
  const targetIds = participantIds ?? (await loadParticipantIds(supabase));
  if (targetIds.length === 0) {
    return { participants: 0, awarded: 0, revoked: 0 };
  }

  const ordersByParticipant = new Map<string, ApprovedOrderForState[]>();
  for (let index = 0; index < targetIds.length; index += 100) {
    const chunk = targetIds.slice(index, index + 100);
    const orders = await loadApprovedOrders(supabase, chunk);
    orders.forEach((order) => {
      const list = ordersByParticipant.get(order.participant_id) ?? [];
      list.push({
        orderId: order.id,
        at: order.reviewed_at ?? order.submitted_at,
        items: (order.afterparty_order_items ?? []).map((item) => ({
          drinkKey: item.drink_key,
          quantity: Math.max(0, item.approved_quantity ?? 0),
        })),
      });
      ordersByParticipant.set(order.participant_id, list);
    });
  }

  let awarded = 0;
  let revoked = 0;
  for (const participantId of targetIds) {
    const unlocked = getUnlockedAchievements(
      createStateFromApprovedOrders(ordersByParticipant.get(participantId) ?? []),
    );
    const unlockedIds = new Set(unlocked.map((achievement) => achievement.id));

    const { data: existing, error: existingError } = await supabase
      .from('afterparty_achievement_awards')
      .select('achievement_id')
      .eq('participant_id', participantId);
    if (existingError) {
      throw existingError;
    }
    const existingIds = new Set(((existing ?? []) as Array<{ achievement_id: string }>).map((row) => row.achievement_id));

    const toInsert = unlocked
      .filter((achievement) => !existingIds.has(achievement.id))
      .map((achievement) => ({
        participant_id: participantId,
        achievement_id: achievement.id,
        bonus_points: achievement.bonusPoints,
      }));
    if (toInsert.length > 0) {
      const { error } = await supabase.from('afterparty_achievement_awards').insert(toInsert);
      if (error) {
        throw error;
      }
      awarded += toInsert.length;
    }

    const toRevoke = [...existingIds].filter((achievementId) => !unlockedIds.has(achievementId));
    if (toRevoke.length > 0) {
      const { error } = await supabase
        .from('afterparty_achievement_awards')
        .delete()
        .eq('participant_id', participantId)
        .in('achievement_id', toRevoke);
      if (error) {
        throw error;
      }
      revoked += toRevoke.length;
    }
  }

  return { participants: targetIds.length, awarded, revoked };
}
