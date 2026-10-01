import { BaseCategoryKey,EVENT_SCORING_SETTINGS_SELECT,MAX_PATROLS_PER_CATEGORY,STATION_CATEGORY_KEYS } from '../constants.js';
import { respond } from '../respond.js';
import { normalizeEventScoringSettings } from '../settings.js';
import { hasAtLeastOneFullName,normalizeAllowedCategories,normalizeAllowedTasks,normalizeEmail,normalizePatrolMembers,normalizeStationCode,normalizeStationOrderPayload,normalizeStationSplitCategories,normalizeText,parseIsoOrNull,toNonNegativeInt } from '../validation.js';

export async function createEvent(supabaseAdmin: any, currentEventId: string, payload: Record<string, unknown>, res: any) {
    const eventName = normalizeText(payload.name);
    if (!eventName) {
      return res.status(400).json({ error: 'Event name is required.' });
    }

    const startsAt = parseIsoOrNull(payload.starts_at);
    const endsAt = parseIsoOrNull(payload.ends_at);
    const hasSourceEventId = Object.prototype.hasOwnProperty.call(payload, 'copy_stations_from_event_id');
    const sourceEventId = hasSourceEventId
      ? normalizeText(payload.copy_stations_from_event_id)
      : currentEventId;
    let nextEventSettings = normalizeEventScoringSettings(null);

    if (sourceEventId) {
      const { data: sourceEventSettings, error: sourceEventSettingsError } = await supabaseAdmin
        .from('events')
        .select(EVENT_SCORING_SETTINGS_SELECT)
        .eq('id', sourceEventId)
        .maybeSingle();

      if (sourceEventSettingsError) {
        return respond(
          res,
          500,
          'Failed to load source event scoring settings',
          sourceEventSettingsError.message,
        );
      }

      if (sourceEventSettings) {
        nextEventSettings = normalizeEventScoringSettings(sourceEventSettings as Record<string, unknown>);
      }
    }

    const { data: insertedEvent, error: insertEventError } = await supabaseAdmin
      .from('events')
      .insert({
        name: eventName,
        starts_at: startsAt,
        ends_at: endsAt,
        scoring_locked: false,
        scoring_locked_at: null,
        ...nextEventSettings,
      })
      .select(`id,name,starts_at,ends_at,scoring_locked,${EVENT_SCORING_SETTINGS_SELECT}`)
      .single();

    if (insertEventError || !insertedEvent) {
      return respond(res, 500, 'Failed to create event', insertEventError?.message);
    }

    if (sourceEventId) {
      const { data: sourceStations, error: sourceStationsError } = await supabaseAdmin
        .from('stations')
        .select('code,name,is_split,split_categories,is_closed')
        .eq('event_id', sourceEventId)
        .order('code', { ascending: true });

      if (sourceStationsError) {
        return respond(res, 500, 'Event created, but failed to load source stations', sourceStationsError.message);
      }

      const stationRows = (sourceStations ?? [])
        .map((row: {
          code?: string | null;
          name?: string | null;
          is_split?: boolean | null;
          split_categories?: unknown;
          is_closed?: boolean | null;
        }) => ({
          event_id: insertedEvent.id,
          code: normalizeStationCode(row.code),
          name: normalizeText(row.name),
          is_split: row.is_split === true,
          split_categories: row.is_split === true ? normalizeStationSplitCategories(row.split_categories) : [],
          is_closed: row.is_closed === true,
        }))
        .filter((row: { code: string; name: string }) => row.code && row.name);

      if (stationRows.length > 0) {
        const { error: stationInsertError } = await supabaseAdmin
          .from('stations')
          .insert(stationRows);
        if (stationInsertError) {
          return respond(res, 500, 'Event created, but failed to copy stations', stationInsertError.message);
        }
      }

      const { data: sourceOrder, error: sourceOrderError } = await supabaseAdmin
        .from('event_station_orders')
        .select('category_orders,separator_before_by_category')
        .eq('event_id', sourceEventId)
        .maybeSingle();

      if (!sourceOrderError && sourceOrder) {
        const { error: copyOrderError } = await supabaseAdmin.from('event_station_orders').upsert(
          {
            event_id: insertedEvent.id,
            category_orders: sourceOrder.category_orders ?? {},
            separator_before_by_category: sourceOrder.separator_before_by_category ?? {},
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'event_id' },
        );
        if (copyOrderError) {
          return respond(res, 500, 'Event created, but failed to copy station order', copyOrderError.message);
        }
      }
    }

    return res.status(200).json({ ok: true, event: insertedEvent });
  }
