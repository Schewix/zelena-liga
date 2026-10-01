import { BaseCategoryKey,EVENT_SCORING_SETTINGS_SELECT,MAX_PATROLS_PER_CATEGORY,STATION_CATEGORY_KEYS } from '../constants.js';
import { buildCounterpartPatrolCode,buildPatrolCodeLookupVariants,mapPatrolCategoryKey,parsePatrolCategoryNumber,parseSexedPatrolCode,resolvePatrolByCode } from '../patrols.js';
import { respond } from '../respond.js';
import { hasAtLeastOneFullName,normalizeAllowedCategories,normalizeAllowedTasks,normalizeEmail,normalizePatrolMembers,normalizeStationCode,normalizeStationOrderPayload,normalizeStationSplitCategories,normalizeText,parseIsoOrNull,toNonNegativeInt } from '../validation.js';

export async function createPatrols(supabaseAdmin: any, currentEventId: string, payload: Record<string, unknown>, res: any) {
    const targetEventId = normalizeText(payload.event_id);
    if (!targetEventId) {
      return res.status(400).json({ error: 'Missing event_id.' });
    }

    const rawCounts =
      payload.counts && typeof payload.counts === 'object' ? (payload.counts as Record<string, unknown>) : {};
    const rawStarts =
      payload.start_numbers && typeof payload.start_numbers === 'object'
        ? (payload.start_numbers as Record<string, unknown>)
        : {};

    const rows: Array<{
      event_id: string;
      team_name: string;
      category: string;
      sex: string;
      patrol_code: string;
      note: string | null;
      active: boolean;
      disqualified: boolean;
    }> = [];

    for (const bracketKey of STATION_CATEGORY_KEYS) {
      const count = Math.min(toNonNegativeInt(rawCounts[bracketKey], 0), MAX_PATROLS_PER_CATEGORY);
      const start = Math.max(1, toNonNegativeInt(rawStarts[bracketKey], 1));
      const { category, sex } = mapPatrolCategoryKey(bracketKey);
      for (let i = 0; i < count; i += 1) {
        const number = start + i;
        const code = `${bracketKey}-${number}`;
        rows.push({
          event_id: targetEventId,
          team_name: `Hlídka ${code}`,
          category,
          sex,
          patrol_code: code,
          note: null,
          active: true,
          disqualified: false,
        });
      }
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No patrols requested.' });
    }

    const requestedCategoryNumbers = new Set<string>();
    const duplicateCategoryNumbers: string[] = [];
    rows.forEach((row) => {
      const parsed = parsePatrolCategoryNumber(row.patrol_code, row.category);
      if (!parsed) {
        return;
      }
      const key = `${parsed.category}-${parsed.number}`;
      if (requestedCategoryNumbers.has(key)) {
        duplicateCategoryNumbers.push(key);
        return;
      }
      requestedCategoryNumbers.add(key);
    });

    if (duplicateCategoryNumbers.length > 0) {
      const sample = Array.from(new Set(duplicateCategoryNumbers)).slice(0, 12);
      return res.status(409).json({
        error: `Duplicate patrol numbers across H/D in same category are not allowed (e.g. ${sample.join(', ')}).`,
      });
    }

    if (requestedCategoryNumbers.size > 0) {
      const { data: existingPatrols, error: existingPatrolsError } = await supabaseAdmin
        .from('patrols')
        .select('patrol_code, category, active')
        .eq('event_id', targetEventId);

      if (existingPatrolsError) {
        return respond(res, 500, 'Failed to validate category patrol numbers', existingPatrolsError.message);
      }

      const overlappingCategoryNumbers: string[] = [];
      ((existingPatrols ?? []) as Array<{
        patrol_code?: string | null;
        category?: string | null;
        active?: boolean | null;
      }>).forEach((row) => {
        if (row.active === false) {
          return;
        }
        const parsed = parsePatrolCategoryNumber(row.patrol_code, row.category);
        if (!parsed) {
          return;
        }
        const key = `${parsed.category}-${parsed.number}`;
        if (requestedCategoryNumbers.has(key)) {
          overlappingCategoryNumbers.push(key);
        }
      });

      if (overlappingCategoryNumbers.length > 0) {
        const sample = Array.from(new Set(overlappingCategoryNumbers)).slice(0, 12);
        return res.status(409).json({
          error: `Patrol numbers already exist in selected categories (e.g. ${sample.join(', ')}).`,
        });
      }
    }

    const duplicateCodes: string[] = [];
    const codeList = rows.map((row) => row.patrol_code);
    const chunkSize = 400;
    for (let offset = 0; offset < codeList.length; offset += chunkSize) {
      const slice = codeList.slice(offset, offset + chunkSize);
      const { data, error } = await supabaseAdmin
        .from('patrols')
        .select('patrol_code')
        .eq('event_id', targetEventId)
        .in('patrol_code', slice);
      if (error) {
        return respond(res, 500, 'Failed to check existing patrol codes', error.message);
      }
      (data ?? []).forEach((row: { patrol_code?: string | null }) => {
        const code = normalizeStationCode(row.patrol_code);
        if (code) {
          duplicateCodes.push(code);
        }
      });
    }

    if (duplicateCodes.length > 0) {
      const sample = Array.from(new Set(duplicateCodes)).slice(0, 12);
      return res.status(409).json({
        error: `Patrol codes already exist in this event (e.g. ${sample.join(', ')}).`,
      });
    }

    const { error: insertError } = await supabaseAdmin.from('patrols').insert(rows);
    if (insertError) {
      return respond(res, 500, 'Failed to create patrols', insertError.message);
    }

    return res.status(200).json({ ok: true, created: rows.length });
  }
