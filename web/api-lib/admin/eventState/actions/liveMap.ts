import { respond } from '../respond.js';
import { normalizeText } from '../validation.js';

// Both actions run behind requireCalcSession in /api/admin/event-state.
export async function loadLiveMap(db: any, payload: Record<string, unknown>, res: any) {
  if (payload.action === 'load_live_map_events') {
    const { data, error } = await db.from('events').select('id,name').order('starts_at', { ascending: false });
    if (error) return respond(res, 500, 'Nepodařilo se načíst ročníky.', error.message);
    return res.status(200).json({ events: data ?? [] });
  }
  const eventId = normalizeText(payload.event_id);
  if (!eventId) return res.status(400).json({ error: 'Vyber ročník.' });
  const tables = {
    event_maps: 'id,event_id,image_url,created_at',
    stations: 'id,event_id,code,name',
    station_map_positions: 'id,event_id,station_id,x_percent,y_percent,created_at',
    patrols: 'id,event_id,team_name,patrol_code,category,sex,active,disqualified',
    timings: 'event_id,patrol_id,start_time,finish_time',
    station_passages: 'id,event_id,station_id,patrol_id,arrived_at,left_at,wait_minutes,client_created_at',
    station_scores: 'id,event_id,station_id,patrol_id,created_at,client_created_at',
  };
  try {
    const entries = await Promise.all(Object.entries(tables).map(async ([table, columns]) => {
      const rows: unknown[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db.from(table).select(columns).eq('event_id', eventId)
          .order(table === 'timings' ? 'patrol_id' : 'id').range(offset, offset + 999);
        if (error) throw new Error(`${table}: ${error.message}`);
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return [table, rows];
    }));
    return res.status(200).json(Object.fromEntries(entries));
  } catch (error) {
    return respond(res, 500, 'Nepodařilo se načíst mapu vybraného ročníku.', error instanceof Error ? error.message : undefined);
  }
}
