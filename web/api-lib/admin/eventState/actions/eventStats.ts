import { respond } from '../respond.js';
import { normalizeText } from '../validation.js';

// station_passages / station_scores are RLS-protected for the browser's anon key,
// so the admin statistics are loaded here with the service role.
// Runs behind requireCalcSession in /api/admin/event-state.
export async function loadEventStats(db: any, payload: Record<string, unknown>, res: any) {
  const eventId = normalizeText(payload.event_id);
  if (!eventId) return res.status(400).json({ error: 'Vyber ročník.' });
  const tables = {
    stations: { columns: 'id,code,name', order: 'id' },
    station_passages: { columns: 'id,station_id,wait_minutes,patrols(category)', order: 'id' },
    station_scores: { columns: 'id,station_id,points,patrols(category)', order: 'id' },
    patrols: { columns: 'id,team_name,category,active', order: 'id' },
  };
  try {
    const entries = await Promise.all(Object.entries(tables).map(async ([table, { columns, order }]) => {
      const rows: unknown[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db.from(table).select(columns).eq('event_id', eventId)
          .order(order).range(offset, offset + 999);
        if (error) throw new Error(`${table}: ${error.message}`);
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return [table, rows];
    }));
    return res.status(200).json(Object.fromEntries(entries));
  } catch (error) {
    return respond(res, 500, 'Nepodařilo se načíst statistiky ročníku.', error instanceof Error ? error.message : undefined);
  }
}
