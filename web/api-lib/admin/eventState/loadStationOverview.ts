import { respond } from './respond.js';

const PAGE_SIZE = 1000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchAll(buildQuery: () => any) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) {
      return { rows, error };
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) {
      return { rows, error: null };
    }
  }
}

export async function loadStationOverview(supabaseAdmin: any, eventId: string, res: any) {
  if (!UUID_REGEX.test(eventId)) {
    return res.status(400).json({ error: 'Invalid event_id' });
  }

  const [stationsRes, passagesRes, patrolsRes, ticketsRes] = await Promise.all([
    supabaseAdmin
      .from('stations')
      .select('id, code, name, is_closed, is_split, split_categories')
      .eq('event_id', eventId)
      .order('code'),
    fetchAll(() =>
      supabaseAdmin
        .from('station_passages')
        .select('id, station_id, patrol_id, arrived_at, left_at, client_created_at, patrols(category, sex)')
        .eq('event_id', eventId)
        .order('id'),
    ),
    supabaseAdmin
      .from('patrols')
      .select('id, category, sex, patrol_code, team_name, active')
      .eq('event_id', eventId),
    supabaseAdmin
      .from('station_tickets')
      .select('station_id, state, arrived_at')
      .eq('event_id', eventId)
      .in('state', ['waiting', 'serving']),
  ]);

  if (stationsRes.error || passagesRes.error || patrolsRes.error) {
    return respond(
      res,
      500,
      'Failed to load station overview',
      [stationsRes.error?.message, passagesRes.error?.message, patrolsRes.error?.message]
        .filter(Boolean)
        .join(' | '),
    );
  }

  return res.status(200).json({
    stations: stationsRes.data ?? [],
    passages: passagesRes.rows,
    patrols: patrolsRes.data ?? [],
    // Queue state is optional: report it as null instead of failing the whole overview.
    tickets: ticketsRes.error ? null : ticketsRes.data ?? [],
  });
}
