import { BaseCategoryKey,EVENT_SCORING_SETTINGS_SELECT,MAX_PATROLS_PER_CATEGORY,STATION_CATEGORY_KEYS } from '../constants.js';
import { respond } from '../respond.js';
import { normalizeEventScoringSettings } from '../settings.js';
import { hasAtLeastOneFullName,normalizeAllowedCategories,normalizeAllowedTasks,normalizeEmail,normalizePatrolMembers,normalizeStationCode,normalizeStationOrderPayload,normalizeStationSplitCategories,normalizeText,parseIsoOrNull,toNonNegativeInt } from '../validation.js';

export async function saveEventScoringConfig(supabaseAdmin: any, currentEventId: string, payload: Record<string, unknown>, res: any) {
    const targetEventId = normalizeText(payload.event_id);
    if (!targetEventId) {
      return res.status(400).json({ error: 'Missing event_id.' });
    }

    const { data: existingSettings, error: existingSettingsError } = await supabaseAdmin
      .from('events')
      .select(EVENT_SCORING_SETTINGS_SELECT)
      .eq('id', targetEventId)
      .maybeSingle();

    if (existingSettingsError) {
      return respond(res, 500, 'Failed to load current event scoring settings', existingSettingsError.message);
    }
    if (!existingSettings) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    const normalizedSettings = normalizeEventScoringSettings({
      ...(existingSettings as Record<string, unknown>),
      ...payload,
    });

    const { error: updateSettingsError } = await supabaseAdmin
      .from('events')
      .update(normalizedSettings)
      .eq('id', targetEventId);

    if (updateSettingsError) {
      return respond(res, 500, 'Failed to save event scoring settings', updateSettingsError.message);
    }

    return res.status(200).json({
      ok: true,
      event_id: targetEventId,
      ...normalizedSettings,
    });
  }
