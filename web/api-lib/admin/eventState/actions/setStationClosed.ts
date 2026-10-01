import { respond } from '../respond.js';
import { hasAtLeastOneFullName,normalizeAllowedCategories,normalizeAllowedTasks,normalizeEmail,normalizePatrolMembers,normalizeStationCode,normalizeStationOrderPayload,normalizeStationSplitCategories,normalizeText,parseIsoOrNull,toNonNegativeInt } from '../validation.js';

export async function setStationClosed(supabaseAdmin: any, currentEventId: string, payload: Record<string, unknown>, res: any) {
    const targetEventId = normalizeText(payload.event_id);
    const stationId = normalizeText(payload.station_id);
    const isClosed = payload.closed === true;

    if (!targetEventId || !stationId) {
      return res.status(400).json({ error: 'Missing event_id or station_id.' });
    }

    const { data: station, error: stationLookupError } = await supabaseAdmin
      .from('stations')
      .select('id')
      .eq('event_id', targetEventId)
      .eq('id', stationId)
      .maybeSingle();

    if (stationLookupError) {
      return respond(res, 500, 'Failed to validate station', stationLookupError.message);
    }
    if (!station) {
      return res.status(400).json({ error: 'Invalid station for selected event.' });
    }

    const { error: updateError } = await supabaseAdmin
      .from('stations')
      .update({ is_closed: isClosed })
      .eq('event_id', targetEventId)
      .eq('id', stationId);

    if (updateError) {
      return respond(res, 500, 'Failed to update station closed state', updateError.message);
    }

    return res.status(200).json({
      ok: true,
      event_id: targetEventId,
      station_id: stationId,
      closed: isClosed,
    });
  }
