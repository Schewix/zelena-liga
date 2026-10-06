import { parsePatrolCategoryNumber } from './patrols.js';
import { respond } from './respond.js';

const PAGE_SIZE = 1000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Numbers of active patrols per age category (N/M/S/R) for one event; H/D share a number sequence. */
export async function loadPatrolNumbers(supabaseAdmin: any, eventId: string, res: any) {
  if (!UUID_REGEX.test(eventId)) {
    return res.status(400).json({ error: 'Invalid event_id' });
  }

  const numbers: Record<string, number[]> = {};
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('patrols')
      .select('patrol_code, category, active')
      .eq('event_id', eventId)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      return respond(res, 500, 'Failed to load patrol numbers', error.message);
    }
    (data ?? []).forEach((row: { patrol_code?: string | null; category?: string | null; active?: boolean | null }) => {
      if (row.active === false) {
        return;
      }
      const parsed = parsePatrolCategoryNumber(row.patrol_code, row.category);
      if (!parsed) {
        return;
      }
      (numbers[parsed.category] ??= []).push(parsed.number);
    });
    if (!data || data.length < PAGE_SIZE) {
      break;
    }
  }

  Object.values(numbers).forEach((list) => list.sort((a, b) => a - b));
  return res.status(200).json({ numbers });
}
