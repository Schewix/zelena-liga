import { respond } from '../respond.js';
import { normalizeText } from '../validation.js';

const CATEGORIES = ['N', 'M', 'S', 'R'];

// Called only through event-state after requireCalcSession has authorized the administrator.
export async function targetAnswers(db: any, payload: Record<string, unknown>, res: any) {
  const eventId = normalizeText(payload.event_id);
  if (!eventId) return res.status(400).json({ error: 'Chybí ročník.' });
  const saving = payload.action === 'save_target_answers';
  const optionCount = payload.target_answer_option_count;
  const answers = payload.answers as Record<string, unknown> | undefined;
  if (saving) {
    if ((optionCount !== 3 && optionCount !== 4) || !answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'Neplatné nastavení odpovědí.' });
    }
    const pattern = optionCount === 3 ? /^[A-C]{12}$/ : /^[A-D]{12}$/;
    for (const category of CATEGORIES) {
      if (typeof answers[category] !== 'string' || (answers[category] !== '' && !pattern.test(answers[category] as string))) {
        return res.status(400).json({ error: `Kategorie ${category} musí být prázdná nebo mít přesně 12 odpovědí ${optionCount === 3 ? 'A–C' : 'A–D'}.` });
      }
    }
  }

  // Answer keys are consumed by the calculation station (T), including target scoring.
  const { data: station, error: stationError } = await db.from('stations')
    .select('id').eq('event_id', eventId).eq('code', 'T').maybeSingle();
  if (stationError) return respond(res, 500, 'Nepodařilo se načíst výpočetku.', stationError.message);
  if (!station) return res.status(404).json({ error: 'Pro vybraný ročník chybí stanoviště T (výpočetka).' });

  if (saving && answers) {
    const { error: settingsError } = await db.from('events')
      .update({ target_answer_option_count: optionCount }).eq('id', eventId);
    if (settingsError) return respond(res, 500, 'Nepodařilo se uložit počet možností.', settingsError.message);

    const updates = CATEGORIES.filter((category) => answers[category] !== '').map((category) => ({
      event_id: eventId, station_id: station.id, category, correct_answers: answers[category], option_count: optionCount,
    }));
    if (updates.length) {
      const { error } = await db.from('station_category_answers').upsert(updates, { onConflict: 'event_id,station_id,category,option_count' });
      if (error) return respond(res, 500, 'Nepodařilo se uložit správné odpovědi.', error.message);
    }
    const deletions = CATEGORIES.filter((category) => answers[category] === '');
    if (deletions.length) {
      const { error } = await db.from('station_category_answers').delete()
        .eq('event_id', eventId).eq('station_id', station.id).eq('option_count', optionCount).in('category', deletions);
      if (error) return respond(res, 500, 'Nepodařilo se vymazat prázdné kategorie.', error.message);
    }
  }

  const { data, error } = await db.from('station_category_answers')
    .select('category, correct_answers, updated_at, option_count').eq('event_id', eventId).eq('station_id', station.id);
  if (error) return respond(res, 500, 'Nepodařilo se načíst uložené odpovědi.', error.message);
  return res.status(200).json({ ok: true, answers: data ?? [] });
}
