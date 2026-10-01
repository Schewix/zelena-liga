// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { assignJudge } from '../../api-lib/admin/eventState/actions/assignJudge';

vi.mock('../../api-lib/auth/password-utils.js', () => ({
  generateTemporaryPassword: () => 'temporary-secret',
  hashPassword: async () => 'hashed-secret',
}));

function setup(existing = false, queueFails = false) {
  const queue = vi.fn(async () => ({ error: queueFails ? { message: 'queue unavailable' } : null }));
  const remove = vi.fn(() => ({ eq: async () => ({ error: null }) }));
  const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: 'judge-1', display_name: 'Judge' }, error: null }) }) }));
  const lookup = (data: unknown) => {
    const query: any = { eq: () => query, ilike: () => query, limit: () => query, maybeSingle: async () => ({ data, error: null }) };
    return query;
  };
  const db = { from: (table: string) => {
    if (table === 'stations') return { select: () => lookup({ id: 'station-1', code: 'A' }) };
    if (table === 'judges') return { select: () => lookup(existing ? { id: 'judge-1', display_name: 'Judge' } : null), insert, delete: remove };
    if (table === 'judge_assignments') return { upsert: async () => ({ error: null }) };
    if (table === 'judge_onboarding_events') return { insert: queue };
    throw new Error(table);
  } };
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  const run = (email = 'judge@example.org') => assignJudge(db, 'event-1', {
    event_id: 'event-2', email, display_name: 'Judge', station_code: 'A', allowed_categories: ['N'], allowed_tasks: [],
  }, res);
  return { run, res, queue, remove, insert };
}

describe('assign judge credentials', () => {
  it('queues credentials for the selected event without exposing them in the API response', async () => {
    const app = setup();
    await app.run();
    expect(app.queue).toHaveBeenCalledWith(expect.objectContaining({
      event_id: 'event-2', judge_id: 'judge-1', delivery_channel: 'email',
      metadata: expect.objectContaining({ type: 'initial-password-issued', source: 'admin-assignment', password: 'temporary-secret', sent: false }),
    }));
    expect(app.res.json).toHaveBeenCalledWith(expect.objectContaining({ created_judge: true, email_delivery: 'queued' }));
    expect(JSON.stringify(app.res.json.mock.calls)).not.toContain('temporary-secret');
    expect(app.res.json.mock.calls[0][0]).not.toHaveProperty('temporary_password');
  });

  it('does not issue a new password or email for an existing account', async () => {
    const app = setup(true);
    await app.run();
    expect(app.queue).not.toHaveBeenCalled();
    expect(app.insert).not.toHaveBeenCalled();
    expect(app.res.json).toHaveBeenCalledWith(expect.objectContaining({ email_delivery: 'not_required' }));
  });

  it('rolls back the new account and reports queue failure without leaking credentials', async () => {
    const app = setup(false, true);
    await app.run();
    expect(app.remove).toHaveBeenCalledOnce();
    expect(app.res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(app.res.json.mock.calls)).not.toContain('temporary-secret');
  });

  it('rejects an invalid recipient before creating an account', async () => {
    const app = setup();
    await app.run('judge@example@org');
    expect(app.res.status).toHaveBeenCalledWith(400);
    expect(app.insert).not.toHaveBeenCalled();
    expect(app.queue).not.toHaveBeenCalled();
  });
});
