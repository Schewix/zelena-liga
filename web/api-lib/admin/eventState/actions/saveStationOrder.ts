import { respond } from '../respond.js';
import { hasAtLeastOneFullName,normalizeAllowedCategories,normalizeAllowedTasks,normalizeEmail,normalizePatrolMembers,normalizeStationCode,normalizeStationOrderPayload,normalizeStationSplitCategories,normalizeText,parseIsoOrNull,toNonNegativeInt } from '../validation.js';

export async function saveStationOrder(supabaseAdmin: any, currentEventId: string, payload: Record<string, unknown>, res: any) {
    const targetEventId = normalizeText(payload.event_id);
    if (!targetEventId) {
      return res.status(400).json({ error: 'Missing event_id.' });
    }

    const normalized = normalizeStationOrderPayload(payload);
    const { error } = await supabaseAdmin.from('event_station_orders').upsert(
      {
        event_id: targetEventId,
        category_orders: normalized.categoryOrders,
        separator_before_by_category: normalized.separatorBeforeByCategory,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'event_id' },
    );

    if (error) {
      return respond(res, 500, 'Failed to save station order', error.message);
    }

    return res.status(200).json({
      ok: true,
      event_id: targetEventId,
      category_orders: normalized.categoryOrders,
      separator_before_by_category: normalized.separatorBeforeByCategory,
    });
  }
