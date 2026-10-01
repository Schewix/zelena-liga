import { loadLiveMap } from './actions/liveMap.js';
import { targetAnswers } from './actions/targetAnswers.js';
import { hasAtLeastOneFullName,normalizeAllowedCategories,normalizeAllowedTasks,normalizeEmail,normalizePatrolMembers,normalizeStationCode,normalizeStationOrderPayload,normalizeStationSplitCategories,normalizeText,parseIsoOrNull,toNonNegativeInt } from './validation.js';
import { createEvent } from './actions/createEvent.js';
import { saveStationOrder } from './actions/saveStationOrder.js';
import { saveEventScoringConfig } from './actions/saveEventScoringConfig.js';
import { saveStationSplitConfig } from './actions/saveStationSplitConfig.js';
import { setStationClosed } from './actions/setStationClosed.js';
import { assignJudge } from './actions/assignJudge.js';
import { upsertPatrolProfile } from './actions/upsertPatrolProfile.js';
import { cleanupIncompletePatrols } from './actions/cleanupIncompletePatrols.js';
import { createPatrols } from './actions/createPatrols.js';
import { importPatrols } from './actions/importPatrols.js';
import { clearEventPoints } from './actions/clearEventPoints.js';

export async function handleSetupAction(
  supabaseAdmin: any,
  currentEventId: string,
  payload: Record<string, unknown>,
  res: any,
) {
  const action = normalizeText(payload.action);
  if (!action) {
    return res.status(400).json({ error: 'Missing action.' });
  }

  if (action === 'load_live_map' || action === 'load_live_map_events') { return loadLiveMap(supabaseAdmin, payload, res); }



  if (action === 'load_target_answers' || action === 'save_target_answers') { return targetAnswers(supabaseAdmin, payload, res); }

  if (action === 'create_event') { return createEvent(supabaseAdmin, currentEventId, payload, res); }

  if (action === 'save_station_order') { return saveStationOrder(supabaseAdmin, currentEventId, payload, res); }

  if (action === 'save_event_scoring_config') { return saveEventScoringConfig(supabaseAdmin, currentEventId, payload, res); }

  if (action === 'save_station_split_config') { return saveStationSplitConfig(supabaseAdmin, currentEventId, payload, res); }

  if (action === 'set_station_closed') { return setStationClosed(supabaseAdmin, currentEventId, payload, res); }

  if (action === 'assign_judge') { return assignJudge(supabaseAdmin, currentEventId, payload, res); }

  if (action === 'upsert_patrol_profile') { return upsertPatrolProfile(supabaseAdmin, currentEventId, payload, res); }

  if (action === 'cleanup_incomplete_patrols') { return cleanupIncompletePatrols(supabaseAdmin, currentEventId, payload, res); }

  if (action === 'create_patrols') { return createPatrols(supabaseAdmin, currentEventId, payload, res); }

  if (action === 'import_patrols') { return importPatrols(supabaseAdmin, payload, res); }

  if (action === 'clear_event_points') { return clearEventPoints(supabaseAdmin, currentEventId, payload, res); }

  return res.status(400).json({ error: `Unsupported action "${action}".` });
}
