// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { targetAnswers } from '../../api-lib/admin/eventState/actions/targetAnswers';

function setup(failWrite = false) {
  const saved = [{ category: 'N', correct_answers: 'ABCDABCDABCD', updated_at: null }];
  const calls: Array<[string, string, unknown]> = [];
  const db = { from: (table: string) => {
    let operation = '';
    const query: any = {
      select: () => { operation = 'select'; return query; },
      update: (value: unknown) => { operation = 'update'; calls.push([table, operation, value]); return query; },
      upsert: (value: unknown) => { operation = 'upsert'; calls.push([table, operation, value]); return query; },
      delete: () => { operation = 'delete'; return query; },
      eq: (key: string, value: unknown) => { calls.push([table, key, value]); return query; },
      in: (key: string, value: unknown) => { calls.push([table, key, value]); return query; },
      maybeSingle: async () => ({ data: { id: 'selected-calc-station' }, error: null }),
      then: (resolve: (value: unknown) => unknown) => resolve({
        data: operation === 'select' ? saved : null,
        error: failWrite && operation === 'upsert' ? { message: 'write failed' } : null,
      }),
    };
    return query;
  } };
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  const payload = { action: 'save_target_answers', event_id: 'selected-event', target_answer_option_count: 4,
    answers: { N: 'ABCDABCDABCD', M: '', S: '', R: '' } };
  return { calls, res, payload, run: (value = payload) => targetAnswers(db, value, res) };
}

describe('admin target answers', () => {
  it('saves and reads answers for the selected event and its calculation station', async () => {
    const app = setup();
    await app.run();
    expect(app.calls).toContainEqual(['stations', 'event_id', 'selected-event']);
    expect(app.calls).toContainEqual(['stations', 'code', 'T']);
    expect(app.calls).toContainEqual(['events', 'update', { target_answer_option_count: 4 }]);
    expect(app.calls).toContainEqual(['station_category_answers', 'upsert', [{ event_id: 'selected-event', station_id: 'selected-calc-station', category: 'N', correct_answers: 'ABCDABCDABCD', option_count: 4 }]]);
    expect(app.calls).toContainEqual(['station_category_answers', 'option_count', 4]);
    expect(app.calls).toContainEqual(['station_category_answers', 'category', ['M', 'S', 'R']]);
    expect(app.res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, answers: [expect.objectContaining({ category: 'N', correct_answers: 'ABCDABCDABCD' })] }));
  });
  it.each(['ABC', 'ABCDABCDABCDA', 'ABCDABCDABCX'])('rejects invalid answers without writing: %s', async (value) => {
    const app = setup();
    await app.run({ ...app.payload, answers: { ...app.payload.answers, N: value } });
    expect(app.res.status).toHaveBeenCalledWith(400);
    expect(app.calls).toEqual([]);
  });
  it('rejects D in three-option mode instead of silently removing it', async () => {
    const app = setup();
    await app.run({ ...app.payload, target_answer_option_count: 3 });
    expect(app.res.status).toHaveBeenCalledWith(400);
    expect(app.calls).toEqual([]);
  });
  it('loads saved answers without mutations', async () => {
    const app = setup();
    await app.run({ ...app.payload, action: 'load_target_answers' });
    expect(app.calls.some(([, operation]) => operation === 'upsert' || operation === 'update')).toBe(false);
    expect(app.res.status).toHaveBeenCalledWith(200);
  });
  it('reports the failing step and database error instead of success', async () => {
    const app = setup(true);
    await app.run();
    expect(app.res.status).toHaveBeenCalledWith(500);
    expect(app.res.json).toHaveBeenCalledWith({ error: 'Nepodařilo se uložit správné odpovědi.', detail: 'write failed' });
  });
});
