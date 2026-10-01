import { parsePatrolCategoryNumber } from '../patrols.js';
import { respond } from '../respond.js';
import { hasAtLeastOneFullName,normalizePatrolMembers,normalizeText } from '../validation.js';

const CATEGORIES = new Set(['N', 'M', 'S', 'R']);
const MAX_NUMBER = 50;
const MAX_ROWS = 400;

type ImportRow = {
  category: string;
  number: number;
  sex: string;
  team_name: string;
  patrol_members: string;
};

function parseRows(raw: unknown): ImportRow[] | string {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ROWS) {
    return 'Neplatný seznam hlídek.';
  }
  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  for (const entry of raw as Array<Record<string, unknown>>) {
    const category = normalizeText(entry?.category as string).toUpperCase();
    const sex = normalizeText(entry?.sex as string).toUpperCase();
    const number = Number(entry?.number);
    const teamName = normalizeText(entry?.team_name as string).slice(0, 300);
    const members = normalizePatrolMembers(entry?.patrol_members);
    if (!CATEGORIES.has(category) || (sex !== 'H' && sex !== 'D')
      || !Number.isInteger(number) || number < 1 || number > MAX_NUMBER) {
      return 'Neplatná kategorie, pohlaví nebo startovní číslo.';
    }
    if (!teamName || !members || !hasAtLeastOneFullName(members)) {
      return `Hlídka ${category}${sex}-${number}: chybí oddíl nebo člen s jménem a příjmením.`;
    }
    const key = `${category}-${number}`;
    if (seen.has(key)) {
      return `Číslo ${number} je v kategorii ${category} uvedené víckrát.`;
    }
    seen.add(key);
    rows.push({ category, number, sex, team_name: teamName, patrol_members: members });
  }
  return rows;
}

// Runs behind requireCalcSession. Fills patrol profiles into the selected event: an existing patrol with the
// same category and number is updated, a missing one is created.
export async function importPatrols(db: any, payload: Record<string, unknown>, res: any) {
  const eventId = normalizeText(payload.event_id as string);
  if (!eventId) {
    return res.status(400).json({ error: 'Chybí ročník.' });
  }
  const rows = parseRows(payload.patrols);
  if (typeof rows === 'string') {
    return res.status(400).json({ error: rows });
  }

  const { data: event, error: eventError } = await db.from('events').select('id').eq('id', eventId).maybeSingle();
  if (eventError) {
    return respond(res, 500, 'Nepodařilo se ověřit ročník.', eventError.message);
  }
  if (!event) {
    return res.status(404).json({ error: 'Ročník neexistuje.' });
  }

  const { data: existing, error: existingError } = await db
    .from('patrols')
    .select('id, patrol_code, category, active')
    .eq('event_id', eventId);
  if (existingError) {
    return respond(res, 500, 'Nepodařilo se načíst existující hlídky.', existingError.message);
  }

  const existingByKey = new Map<string, { id: string; active: boolean }>();
  ((existing ?? []) as Array<{ id: string; patrol_code: string | null; category: string | null; active: boolean | null }>)
    .forEach((patrol) => {
      const parsed = parsePatrolCategoryNumber(patrol.patrol_code, patrol.category);
      if (!parsed) {
        return;
      }
      const key = `${parsed.category}-${parsed.number}`;
      const current = existingByKey.get(key);
      if (!current || (!current.active && patrol.active !== false)) {
        existingByKey.set(key, { id: patrol.id, active: patrol.active !== false });
      }
    });

  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<{ id: string; values: Record<string, unknown> }> = [];
  rows.forEach((row) => {
    const code = `${row.category}${row.sex}-${row.number}`;
    const values = {
      patrol_code: code,
      category: row.category,
      sex: row.sex,
      team_name: row.team_name,
      patrol_members: row.patrol_members,
    };
    const match = existingByKey.get(`${row.category}-${row.number}`);
    if (match) {
      updates.push({ id: match.id, values });
    } else {
      inserts.push({ ...values, event_id: eventId, note: null, active: true, disqualified: false });
    }
  });

  if (inserts.length > 0) {
    const { error } = await db.from('patrols').insert(inserts);
    if (error) {
      return respond(res, 500, 'Nepodařilo se vytvořit nové hlídky.', error.message);
    }
  }
  for (let offset = 0; offset < updates.length; offset += 25) {
    const results = await Promise.all(updates.slice(offset, offset + 25).map((update) =>
      db.from('patrols').update(update.values).eq('event_id', eventId).eq('id', update.id)));
    const failed = results.find((result: { error?: { message: string } }) => result.error);
    if (failed?.error) {
      return respond(res, 500, 'Nepodařilo se aktualizovat hlídky.', failed.error.message);
    }
  }

  return res.status(200).json({ ok: true, created: inserts.length, updated: updates.length });
}
