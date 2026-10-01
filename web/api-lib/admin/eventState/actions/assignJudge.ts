import { generateTemporaryPassword,hashPassword } from '../../../auth/password-utils.js';
import { respond } from '../respond.js';
import { hasAtLeastOneFullName,normalizeAllowedCategories,normalizeAllowedTasks,normalizeEmail,normalizePatrolMembers,normalizeStationCode,normalizeStationOrderPayload,normalizeStationSplitCategories,normalizeText,parseIsoOrNull,toNonNegativeInt } from '../validation.js';

export async function assignJudge(supabaseAdmin: any, currentEventId: string, payload: Record<string, unknown>, res: any) {
    const targetEventId = normalizeText(payload.event_id);
    const email = normalizeEmail(payload.email);
    const displayNameInput = normalizeText(payload.display_name);
    const stationCode = normalizeStationCode(payload.station_code);
    const allowedCategories = normalizeAllowedCategories(payload.allowed_categories);
    const allowedTasks = normalizeAllowedTasks(payload.allowed_tasks);

    if (!targetEventId || !email || !stationCode) {
      return res.status(400).json({ error: 'Missing required fields (event, email, station).' });
    }

    const { data: station, error: stationError } = await supabaseAdmin
      .from('stations')
      .select('id,code,name')
      .eq('event_id', targetEventId)
      .eq('code', stationCode)
      .maybeSingle();

    if (stationError) {
      return respond(res, 500, 'Failed to load station', stationError.message);
    }
    if (!station) {
      return res.status(400).json({ error: `Station ${stationCode} does not exist in selected event.` });
    }

    const { data: existingJudge, error: judgeLookupError } = await supabaseAdmin
      .from('judges')
      .select('id,email,display_name')
      .ilike('email', email)
      .limit(1)
      .maybeSingle();

    if (judgeLookupError) {
      return respond(res, 500, 'Failed to lookup judge account', judgeLookupError.message);
    }

    const nowIso = new Date().toISOString();
    let judgeId = '';
    let judgeDisplayName = displayNameInput || email;
    let createdJudge = false;
    let temporaryPassword: string | null = null;

    if (!existingJudge) {
      temporaryPassword = generateTemporaryPassword(12);
      const passwordHash = await hashPassword(temporaryPassword);
      const { data: insertedJudge, error: insertJudgeError } = await supabaseAdmin
        .from('judges')
        .insert({
          email,
          display_name: judgeDisplayName,
          password_hash: passwordHash,
          must_change_password: true,
          password_rotated_at: nowIso,
          updated_at: nowIso,
        })
        .select('id,display_name')
        .single();
      if (insertJudgeError || !insertedJudge) {
        return respond(res, 500, 'Failed to create judge account', insertJudgeError?.message);
      }
      judgeId = insertedJudge.id;
      judgeDisplayName = normalizeText(insertedJudge.display_name) || judgeDisplayName;
      createdJudge = true;
    } else {
      judgeId = existingJudge.id;
      const nextDisplayName = displayNameInput || normalizeText(existingJudge.display_name) || email;
      if (nextDisplayName !== normalizeText(existingJudge.display_name)) {
        const { error: updateJudgeError } = await supabaseAdmin
          .from('judges')
          .update({
            display_name: nextDisplayName,
            updated_at: nowIso,
          })
          .eq('id', judgeId);
        if (updateJudgeError) {
          return respond(res, 500, 'Failed to update judge profile', updateJudgeError.message);
        }
      }
      judgeDisplayName = nextDisplayName;
    }

    const { error: upsertAssignmentError } = await supabaseAdmin.from('judge_assignments').upsert(
      {
        judge_id: judgeId,
        station_id: station.id,
        event_id: targetEventId,
        role: 'judge',
        judge_display_name: judgeDisplayName,
        allowed_categories: allowedCategories,
        allowed_tasks: allowedTasks,
      },
      { onConflict: 'judge_id,station_id,event_id' },
    );

    if (upsertAssignmentError) {
      return respond(res, 500, 'Failed to save judge assignment', upsertAssignmentError.message);
    }

    return res.status(200).json({
      ok: true,
      created_judge: createdJudge,
      temporary_password: temporaryPassword,
      assignment: {
        judge_id: judgeId,
        event_id: targetEventId,
        station_id: station.id,
        station_code: station.code,
        allowed_categories: allowedCategories,
        allowed_tasks: allowedTasks,
        judge_display_name: judgeDisplayName,
        email,
      },
    });
  }
