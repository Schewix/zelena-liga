import { respond } from '../respond.js';
import { hasAtLeastOneFullName,normalizeAllowedCategories,normalizeAllowedTasks,normalizeEmail,normalizePatrolMembers,normalizeStationCode,normalizeStationOrderPayload,normalizeStationSplitCategories,normalizeText,parseIsoOrNull,toNonNegativeInt } from '../validation.js';

export async function clearEventPoints(supabaseAdmin: any, currentEventId: string, payload: Record<string, unknown>, res: any) {
    const targetEventId = normalizeText(payload.event_id);
    if (!targetEventId) {
      return res.status(400).json({ error: 'Missing event_id.' });
    }

    const tables = ['station_quiz_responses', 'station_scores', 'station_passages', 'timings'];
    for (const table of tables) {
      const { error } = await supabaseAdmin.from(table).delete().eq('event_id', targetEventId);
      if (error) {
        return respond(res, 500, 'Failed to clear event points', `${table}: ${error.message}`);
      }
    }

    return res.status(200).json({ ok: true });
  }
