import { respond } from '../respond.js';
import { normalizeText, parseIsoOrNull } from '../validation.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadStartSchedule(supabaseAdmin: any, currentEventId: string, payload: Record<string, unknown>, res: any) {
  const eventId = normalizeText(payload.event_id) || currentEventId;
  if (!UUID_REGEX.test(eventId)) {
    return res.status(400).json({ error: 'Invalid event_id.' });
  }

  const [patrolsRes, timingsRes, eventRes] = await Promise.all([
    supabaseAdmin
      .from('patrols')
      .select('id, patrol_code, team_name, category, sex, active')
      .eq('event_id', eventId)
      .order('patrol_code'),
    supabaseAdmin.from('timings').select('patrol_id, start_time').eq('event_id', eventId),
    supabaseAdmin.from('events').select('starts_at').eq('id', eventId).maybeSingle(),
  ]);

  const failure = patrolsRes.error || timingsRes.error || eventRes.error;
  if (failure) {
    return respond(res, 500, 'Failed to load start schedule', failure.message);
  }

  return res.status(200).json({
    patrols: patrolsRes.data ?? [],
    timings: timingsRes.data ?? [],
    event_starts_at: eventRes.data?.starts_at ?? null,
  });
}

export async function saveStartTimes(supabaseAdmin: any, currentEventId: string, payload: Record<string, unknown>, res: any) {
  const eventId = normalizeText(payload.event_id) || currentEventId;
  if (!UUID_REGEX.test(eventId)) {
    return res.status(400).json({ error: 'Invalid event_id.' });
  }
  if (!Array.isArray(payload.updates) || payload.updates.length === 0) {
    return res.status(400).json({ error: 'Missing updates.' });
  }

  const updates: Array<{ event_id: string; patrol_id: string; start_time: string }> = [];
  for (const raw of payload.updates) {
    const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const patrolId = normalizeText(item.patrol_id);
    const startTime = parseIsoOrNull(item.start_time);
    if (!UUID_REGEX.test(patrolId) || !startTime) {
      return res.status(400).json({ error: 'Invalid update item.' });
    }
    updates.push({ event_id: eventId, patrol_id: patrolId, start_time: startTime });
  }

  const { data: ownPatrols, error: patrolsError } = await supabaseAdmin
    .from('patrols')
    .select('id')
    .eq('event_id', eventId)
    .in('id', updates.map((update) => update.patrol_id));
  if (patrolsError) {
    return respond(res, 500, 'Failed to verify patrols', patrolsError.message);
  }
  if ((ownPatrols ?? []).length !== new Set(updates.map((update) => update.patrol_id)).size) {
    return res.status(400).json({ error: 'Patrol does not belong to event.' });
  }

  const { error } = await supabaseAdmin.from('timings').upsert(updates, { onConflict: 'event_id,patrol_id' });
  if (error) {
    return respond(res, 500, 'Failed to save start times', error.message);
  }
  return res.status(200).json({ ok: true });
}
