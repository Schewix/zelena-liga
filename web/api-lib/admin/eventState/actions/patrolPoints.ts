import { respond } from '../respond.js';
import { normalizeText } from '../validation.js';

// station_scores is not readable with the browser's anon key (RLS), so the admin
// patrols overview gets point sums from here. Runs behind requireCalcSession.
export async function loadPatrolPoints(db: any, payload: Record<string, unknown>, res: any) {
  const eventId = normalizeText(payload.event_id);
  if (!eventId) return res.status(400).json({ error: 'Vyber ročník.' });
  try {
    const totals: Record<string, number> = {};
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from('station_scores').select('patrol_id,points')
        .eq('event_id', eventId).order('id').range(offset, offset + 999);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        totals[row.patrol_id] = (totals[row.patrol_id] ?? 0) + (Number(row.points) || 0);
      }
      if (!data || data.length < 1000) break;
    }
    return res.status(200).json({ totals });
  } catch (error) {
    return respond(res, 500, 'Nepodařilo se načíst body hlídek.', error instanceof Error ? error.message : undefined);
  }
}
