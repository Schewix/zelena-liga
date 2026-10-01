import { respond } from '../respond.js';
import { hasAtLeastOneFullName,normalizeAllowedCategories,normalizeAllowedTasks,normalizeEmail,normalizePatrolMembers,normalizeStationCode,normalizeStationOrderPayload,normalizeStationSplitCategories,normalizeText,parseIsoOrNull,toNonNegativeInt } from '../validation.js';

export async function cleanupIncompletePatrols(supabaseAdmin: any, currentEventId: string, payload: Record<string, unknown>, res: any) {
    const targetEventId = normalizeText(payload.event_id);
    if (!targetEventId) {
      return res.status(400).json({ error: 'Missing event_id.' });
    }

    const { data: patrols, error: patrolsError } = await supabaseAdmin
      .from('patrols')
      .select('id, patrol_code, team_name, patrol_members, note')
      .eq('event_id', targetEventId)
      .eq('active', true);

    if (patrolsError) {
      return respond(res, 500, 'Failed to load patrols', patrolsError.message);
    }

    const candidates = ((patrols ?? []) as Array<{
      id: string;
      patrol_code?: string | null;
      team_name?: string | null;
      patrol_members?: string | null;
      note?: string | null;
    }>).filter((row) => {
      const members = normalizePatrolMembers(row.patrol_members ?? row.note ?? null);
      return !hasAtLeastOneFullName(members ?? '');
    });

    if (candidates.length === 0) {
      return res.status(200).json({ ok: true, deleted: 0, skipped: 0 });
    }

    const candidateIds = candidates.map((row) => row.id);
    const [scoresRes, passagesRes, timingsRes] = await Promise.all([
      supabaseAdmin
        .from('station_scores')
        .select('patrol_id')
        .eq('event_id', targetEventId)
        .in('patrol_id', candidateIds),
      supabaseAdmin
        .from('station_passages')
        .select('patrol_id')
        .eq('event_id', targetEventId)
        .in('patrol_id', candidateIds),
      supabaseAdmin
        .from('timings')
        .select('patrol_id')
        .eq('event_id', targetEventId)
        .in('patrol_id', candidateIds),
    ]);

    if (scoresRes.error || passagesRes.error || timingsRes.error) {
      return respond(res, 500, 'Failed to verify patrol usage before cleanup', [
        scoresRes.error?.message,
        passagesRes.error?.message,
        timingsRes.error?.message,
      ]
        .filter(Boolean)
        .join(' | '));
    }

    const lockedIds = new Set<string>();
    ((scoresRes.data ?? []) as Array<{ patrol_id?: string | null }>).forEach((row) => {
      const id = normalizeText(row.patrol_id);
      if (id) {
        lockedIds.add(id);
      }
    });
    ((passagesRes.data ?? []) as Array<{ patrol_id?: string | null }>).forEach((row) => {
      const id = normalizeText(row.patrol_id);
      if (id) {
        lockedIds.add(id);
      }
    });
    ((timingsRes.data ?? []) as Array<{ patrol_id?: string | null }>).forEach((row) => {
      const id = normalizeText(row.patrol_id);
      if (id) {
        lockedIds.add(id);
      }
    });

    const deletableIds = candidateIds.filter((id) => !lockedIds.has(id));
    if (deletableIds.length === 0) {
      return res.status(200).json({
        ok: true,
        deleted: 0,
        skipped: candidateIds.length,
      });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('patrols')
      .delete()
      .eq('event_id', targetEventId)
      .in('id', deletableIds);

    if (deleteError) {
      return respond(res, 500, 'Failed to delete incomplete patrols', deleteError.message);
    }

    return res.status(200).json({
      ok: true,
      deleted: deletableIds.length,
      skipped: candidateIds.length - deletableIds.length,
    });
  }
