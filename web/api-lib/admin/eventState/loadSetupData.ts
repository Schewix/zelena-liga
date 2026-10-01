import { EVENT_SCORING_SETTINGS_SELECT } from './constants.js';
import { respond } from './respond.js';

export async function loadSetupData(supabaseAdmin: any, currentEventId: string, res: any) {
  const [eventsRes, stationsRes, judgesRes, assignmentsRes, orderRes] = await Promise.all([
    supabaseAdmin
      .from('events')
      .select(`id,name,starts_at,ends_at,scoring_locked,${EVENT_SCORING_SETTINGS_SELECT}`)
      .order('starts_at', { ascending: false, nullsFirst: false })
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('stations')
      .select('id,event_id,code,name,is_split,split_categories,is_closed')
      .order('event_id', { ascending: true })
      .order('code', { ascending: true }),
    supabaseAdmin.from('judges').select('id,email,display_name,created_at').order('display_name', { ascending: true }),
    supabaseAdmin
      .from('judge_assignments')
      .select('id,judge_id,station_id,event_id,allowed_categories,allowed_tasks,judge_display_name,created_at')
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('event_station_orders')
      .select('event_id,category_orders,separator_before_by_category,updated_at')
      .order('updated_at', { ascending: false }),
  ]);

  if (eventsRes.error || stationsRes.error || judgesRes.error || assignmentsRes.error || orderRes.error) {
    return respond(res, 500, 'Failed to load setup data', [
      eventsRes.error?.message,
      stationsRes.error?.message,
      judgesRes.error?.message,
      assignmentsRes.error?.message,
      orderRes.error?.message,
    ]
      .filter(Boolean)
      .join(' | '));
  }

  return res.status(200).json({
    current_event_id: currentEventId,
    events: eventsRes.data ?? [],
    stations: stationsRes.data ?? [],
    judges: judgesRes.data ?? [],
    assignments: assignmentsRes.data ?? [],
    station_orders: orderRes.data ?? [],
  });
}
