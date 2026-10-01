import { handleSetupAction } from '../../api-lib/admin/eventState/actions.js';
import { requireCalcSession } from '../../api-lib/admin/eventState/auth.js';
import { loadSetupData } from '../../api-lib/admin/eventState/loadSetupData.js';
import { loadStationOverview } from '../../api-lib/admin/eventState/loadStationOverview.js';
import { respond } from '../../api-lib/admin/eventState/respond.js';
import { buildDefaultLockAtIso } from '../../api-lib/admin/eventState/time.js';
import { isBoolean,normalizeText } from '../../api-lib/admin/eventState/validation.js';
import { withLogging } from '../../api-lib/logger.js';

async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const session = await requireCalcSession(req, res);
  if (!session) {
    return;
  }

  const { supabaseAdmin, eventId } = session;

  const setupMode = req.query?.setup === '1' || req.query?.setup === 'true';

  if (req.method === 'GET' && (req.query?.stationOverview === '1' || req.query?.stationOverview === 'true')) {
    const requestedEventId = normalizeText(req.query?.event_id) || eventId;
    return loadStationOverview(supabaseAdmin, requestedEventId, res);
  }

  if (req.method === 'GET' && setupMode) {
    return loadSetupData(supabaseAdmin, eventId, res);
  }

  if (req.method === 'POST') {
    let rawBody: unknown = req.body;
    if (typeof rawBody === 'string') {
      try {
        rawBody = JSON.parse(rawBody);
      } catch {
        return res.status(400).json({ error: 'Invalid JSON' });
      }
    }

    const payload = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as Record<string, unknown>;

    if (setupMode || normalizeText(payload.action)) {
      return handleSetupAction(supabaseAdmin, eventId, payload, res);
    }

    const locked = payload.locked;
    if (!isBoolean(locked)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const { data: currentEvent, error: currentEventError } = await supabaseAdmin
      .from('events')
      .select('scoring_locked_at')
      .eq('id', eventId)
      .maybeSingle();

    if (currentEventError || !currentEvent) {
      return respond(res, 500, 'Failed to load current event state', currentEventError?.message);
    }

    const updatePayload = locked
      ? {
          scoring_locked: true,
          scoring_locked_at: currentEvent.scoring_locked_at ?? buildDefaultLockAtIso(),
        }
      : {
          scoring_locked: false,
          scoring_locked_at: null,
        };

    const { error: updateError } = await supabaseAdmin
      .from('events')
      .update(updatePayload)
      .eq('id', eventId);

    if (updateError) {
      return respond(res, 500, 'Failed to update event state', updateError.message);
    }
  }

  const { data: eventRow, error: eventError } = await supabaseAdmin
    .from('events')
    .select('name, scoring_locked')
    .eq('id', eventId)
    .maybeSingle();

  if (eventError || !eventRow) {
    return respond(res, 500, 'Failed to load event state', eventError?.message);
  }

  return res.json({
    eventName: eventRow.name,
    scoringLocked: Boolean(eventRow.scoring_locked),
  });
}

export default withLogging('/api/admin/event-state', handler);
