import { BaseCategoryKey,EVENT_SCORING_SETTINGS_SELECT,MAX_PATROLS_PER_CATEGORY,STATION_CATEGORY_KEYS } from '../constants.js';
import { respond } from '../respond.js';
import { hasAtLeastOneFullName,normalizeAllowedCategories,normalizeAllowedTasks,normalizeEmail,normalizePatrolMembers,normalizeStationCode,normalizeStationOrderPayload,normalizeStationSplitCategories,normalizeText,parseIsoOrNull,toNonNegativeInt } from '../validation.js';

export async function saveStationSplitConfig(supabaseAdmin: any, currentEventId: string, payload: Record<string, unknown>, res: any) {
    const targetEventId = normalizeText(payload.event_id);
    if (!targetEventId) {
      return res.status(400).json({ error: 'Missing event_id.' });
    }

    const rawUpdates = Array.isArray(payload.updates) ? payload.updates : [];
    if (rawUpdates.length === 0) {
      return res.status(400).json({ error: 'Missing station updates.' });
    }

    const updates: Array<{
      station_id: string;
      is_split: boolean;
      split_categories: BaseCategoryKey[];
    }> = [];
    const stationIds: string[] = [];
    let hasInvalidSplitCategories = false;

    rawUpdates.forEach((entry) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const row = entry as Record<string, unknown>;
      const stationId = normalizeText(row.station_id);
      if (!stationId) {
        return;
      }
      const isSplit = row.is_split === true;
      const splitCategories = normalizeStationSplitCategories(row.split_categories);
      if (isSplit && splitCategories.length === 0) {
        hasInvalidSplitCategories = true;
        return;
      }
      updates.push({
        station_id: stationId,
        is_split: isSplit,
        split_categories: isSplit ? splitCategories : [],
      });
      stationIds.push(stationId);
    });

    if (hasInvalidSplitCategories) {
      return res.status(400).json({ error: 'Split station must have at least one category.' });
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Invalid station split configuration.' });
    }

    const uniqueStationIds = Array.from(new Set(stationIds));
    const { data: existingStations, error: existingStationsError } = await supabaseAdmin
      .from('stations')
      .select('id')
      .eq('event_id', targetEventId)
      .in('id', uniqueStationIds);

    if (existingStationsError) {
      return respond(res, 500, 'Failed to validate station split configuration', existingStationsError.message);
    }

    const existingStationIdSet = new Set(
      ((existingStations ?? []) as Array<{ id?: string | null }>)
        .map((row) => normalizeText(row.id))
        .filter(Boolean),
    );
    const invalidStationId = uniqueStationIds.find((stationId) => !existingStationIdSet.has(stationId));
    if (invalidStationId) {
      return res.status(400).json({ error: 'Invalid station for selected event.' });
    }

    for (const update of updates) {
      const { error: updateError } = await supabaseAdmin
        .from('stations')
        .update({
          is_split: update.is_split,
          split_categories: update.split_categories,
        })
        .eq('event_id', targetEventId)
        .eq('id', update.station_id);

      if (updateError) {
        return respond(res, 500, 'Failed to save station split configuration', updateError.message);
      }
    }

    return res.status(200).json({
      ok: true,
      event_id: targetEventId,
      updated: updates.length,
    });
  }
