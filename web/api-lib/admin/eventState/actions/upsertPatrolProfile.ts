import { buildCounterpartPatrolCode,buildPatrolCodeLookupVariants,mapPatrolCategoryKey,parsePatrolCategoryNumber,parseSexedPatrolCode,resolvePatrolByCode } from '../patrols.js';
import { respond } from '../respond.js';
import { hasAtLeastOneFullName,normalizeAllowedCategories,normalizeAllowedTasks,normalizeEmail,normalizePatrolMembers,normalizeStationCode,normalizeStationOrderPayload,normalizeStationSplitCategories,normalizeText,parseIsoOrNull,toNonNegativeInt } from '../validation.js';

export async function upsertPatrolProfile(supabaseAdmin: any, currentEventId: string, payload: Record<string, unknown>, res: any) {
    const targetEventId = normalizeText(payload.event_id);
    const patrolId = normalizeText(payload.patrol_id);
    const patrolCode = normalizeText(payload.patrol_code);
    const patrolCodeInput = normalizeText(payload.patrol_code_input);
    const cleanupSharedNumber = payload.cleanup_shared_number === true;
    const teamName = normalizeText(payload.team_name);
    const patrolMembers = normalizePatrolMembers(payload.patrol_members);
    const requestedCategory = normalizeText(payload.category).toUpperCase();
    const requestedSex = normalizeText(payload.sex).toUpperCase();
    if (requestedCategory && !/^[NMSR]$/.test(requestedCategory)) {
      return res.status(400).json({ error: 'Invalid category (expected N, M, S or R).' });
    }
    if (requestedSex && !/^[HD]$/.test(requestedSex)) {
      return res.status(400).json({ error: 'Invalid sex (expected H or D).' });
    }

    if (!targetEventId) {
      return res.status(400).json({ error: 'Missing event_id.' });
    }
    if (!patrolId && !patrolCode) {
      return res.status(400).json({ error: 'Missing patrol reference (patrol_id or patrol_code).' });
    }
    if (!teamName) {
      return res.status(400).json({ error: 'Team name is required.' });
    }

    let resolvedPatrolId = patrolId;
    if (!resolvedPatrolId) {
      let resolved;
      try {
        resolved = await resolvePatrolByCode(supabaseAdmin, targetEventId, patrolCode);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return respond(res, 500, 'Failed to resolve patrol code', detail);
      }
      if (!resolved) {
        return res.status(404).json({ error: 'Patrol not found for this event.' });
      }
      if (resolved.ambiguous) {
        return res.status(409).json({
          error: `Ambiguous patrol code. Matches: ${resolved.options.join(', ')}`,
          options: resolved.options,
        });
      }
      resolvedPatrolId = resolved.row.id;
    }

    const updateFields: Record<string, unknown> = {
      team_name: teamName,
      patrol_members: patrolMembers,
    };

    if (requestedCategory || requestedSex) {
      const { data: currentPatrol, error: currentError } = await supabaseAdmin
        .from('patrols')
        .select('id, patrol_code, category, sex')
        .eq('event_id', targetEventId)
        .eq('id', resolvedPatrolId)
        .maybeSingle();
      if (currentError) {
        return respond(res, 500, 'Failed to load patrol', currentError.message);
      }
      if (!currentPatrol) {
        return res.status(404).json({ error: 'Patrol not found for this event.' });
      }

      const nextCategory = requestedCategory || String(currentPatrol.category ?? '');
      const nextSex = requestedSex || String(currentPatrol.sex ?? '');
      if (nextCategory !== currentPatrol.category || nextSex !== currentPatrol.sex) {
        const currentCode = normalizeText(currentPatrol.patrol_code).toUpperCase();
        const numberMatch = currentCode.match(/^[NMSR][HD]?[- ]?(\d{1,3})$/);
        updateFields.category = nextCategory;
        updateFields.sex = nextSex;
        if (numberMatch) {
          const number = Number.parseInt(numberMatch[1], 10);
          const hasSexPart = /^[NMSR][HD]/.test(currentCode);
          const nextCode = hasSexPart ? `${nextCategory}${nextSex}-${number}` : `${nextCategory}-${number}`;
          if (nextCode !== currentCode) {
            const { data: clashes, error: clashError } = await supabaseAdmin
              .from('patrols')
              .select('id, patrol_code')
              .eq('event_id', targetEventId)
              .in('patrol_code', buildPatrolCodeLookupVariants(nextCode).filter((variant) => (
                hasSexPart ? /^[NMSR][HD]-/.test(variant) : /^[NMSR]-/.test(variant)
              )))
              .neq('id', resolvedPatrolId);
            if (clashError) {
              return respond(res, 500, 'Failed to check patrol code', clashError.message);
            }
            if ((clashes ?? []).length > 0) {
              return res.status(409).json({
                error: `Hlídka ${nextCode} už existuje. Zvol jinou kategorii nebo nejdřív změň číslo.`,
              });
            }
            updateFields.patrol_code = nextCode;
          }
        }
      }
    }

    const { data: updatedPatrol, error: updateError } = await supabaseAdmin
      .from('patrols')
      .update(updateFields)
      .eq('event_id', targetEventId)
      .eq('id', resolvedPatrolId)
      .select('id, patrol_code, team_name, patrol_members, category, sex')
      .maybeSingle();

    if (updateError) {
      return respond(res, 500, 'Failed to update patrol profile', updateError.message);
    }
    if (!updatedPatrol) {
      return res.status(404).json({ error: 'Patrol not found for this event.' });
    }

    let removedSharedPatrolId: string | null = null;
    if (cleanupSharedNumber) {
      const cleanupReferenceCode = patrolCodeInput || updatedPatrol.patrol_code || patrolCode;
      const counterpartCode = buildCounterpartPatrolCode(cleanupReferenceCode);
      if (counterpartCode) {
        const counterpartVariants = buildPatrolCodeLookupVariants(counterpartCode);
        if (counterpartVariants.length > 0) {
          const expectedCounterpart = parseSexedPatrolCode(counterpartCode);
          const { data: counterpartRows, error: counterpartLookupError } = await supabaseAdmin
            .from('patrols')
            .select('id, patrol_code, active')
            .eq('event_id', targetEventId)
            .in('patrol_code', counterpartVariants)
            .neq('id', resolvedPatrolId);

          if (counterpartLookupError) {
            return respond(res, 500, 'Failed to find counterpart patrol', counterpartLookupError.message);
          }

          const exactCounterpart = ((counterpartRows ?? []) as Array<{
            id: string;
            patrol_code?: string | null;
            active?: boolean | null;
          }>)
            .filter((row) => row.active !== false)
            .find((row) => {
              const parsed = parseSexedPatrolCode(row.patrol_code);
              return Boolean(
                parsed
                && expectedCounterpart
                && parsed.category === expectedCounterpart.category
                && parsed.sex === expectedCounterpart.sex
                && parsed.number === expectedCounterpart.number,
              );
            });

          if (exactCounterpart?.id) {
            const { error: deleteCounterpartError } = await supabaseAdmin
              .from('patrols')
              .delete()
              .eq('event_id', targetEventId)
              .eq('id', exactCounterpart.id);

            if (deleteCounterpartError) {
              return respond(res, 500, 'Failed to remove counterpart patrol', deleteCounterpartError.message);
            }
            removedSharedPatrolId = exactCounterpart.id;
          }
        }
      }
    }

    return res.status(200).json({
      ok: true,
      patrol: updatedPatrol,
      removed_shared_patrol_id: removedSharedPatrolId,
    });
  }
