import { createHash, randomBytes, randomInt } from 'node:crypto';
import { hashPassword, verifyPassword } from '../auth/password-utils.js';
import { logger } from '../logger.js';
import { getSupabaseAdminClient } from './supabaseAdmin.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 15 * 60 * 1000;
const CODE_RESEND_COOLDOWN_MS = 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const ATTEMPT_LIMIT = 10;
const MIN_PASSWORD_LENGTH = 8;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type JudgeRow = {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  must_change_password: boolean | null;
  email_verified_at: string | null;
  account_type: string;
};

const JUDGE_COLUMNS = 'id, email, display_name, password_hash, must_change_password, email_verified_at, account_type';

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function readString(payload: Record<string, unknown>, key: string, max = 200) {
  const value = payload[key];
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function requestIp(req: any) {
  const forwarded = req.headers?.['x-forwarded-for'];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || 'unknown';
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

async function findJudgeByEmail(email: string): Promise<JudgeRow | null> {
  const { data, error } = await getSupabaseAdminClient()
    .from('judges')
    .select(JUDGE_COLUMNS)
    .ilike('email', escapeLike(email))
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return (data as JudgeRow | null) ?? null;
}

async function isRateLimited(keys: string[]) {
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MS).toISOString();
  const { count, error } = await getSupabaseAdminClient()
    .from('community_auth_attempts')
    .select('id', { count: 'exact', head: true })
    .in('key', keys)
    .gte('created_at', since);
  if (error) {
    throw error;
  }
  return (count ?? 0) >= ATTEMPT_LIMIT;
}

async function recordFailure(keys: string[]) {
  await getSupabaseAdminClient()
    .from('community_auth_attempts')
    .insert(keys.map((key) => ({ key })));
}

async function createSession(judge: JudgeRow) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const { error } = await getSupabaseAdminClient().from('community_sessions').insert({
    judge_id: judge.id,
    token_hash: sha256(token),
    expires_at: expiresAt.toISOString(),
  });
  if (error) {
    throw error;
  }
  return {
    token,
    expiresAt: expiresAt.toISOString(),
    user: { id: judge.id, email: judge.email, displayName: judge.display_name },
  };
}

function bearerToken(req: any) {
  const header = req.headers?.authorization ?? req.headers?.Authorization;
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

/** ID účtu podle tokenu vedoucího, nebo null. Token rozhodčího ze stanoviště sem nepasuje. */
export async function authenticateCommunityRequest(req: any): Promise<string | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const { data, error } = await getSupabaseAdminClient()
    .from('community_sessions')
    .select('judge_id, expires_at, revoked_at')
    .eq('token_hash', sha256(token))
    .maybeSingle();
  if (error || !data || data.revoked_at || new Date(data.expires_at).getTime() < Date.now()) {
    return null;
  }
  return data.judge_id as string;
}

async function sendVerificationEmail(to: string, displayName: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY environment variable.');
  }
  const from = process.env.TRANSACTIONAL_FROM_EMAIL ?? 'Zelená liga <info@zelenaliga.cz>';
  const replyTo = process.env.TRANSACTIONAL_REPLY_TO ?? 'info@zelenaliga.cz';
  const subject = 'Ověřovací kód – Zelená liga';
  const html = `<!DOCTYPE html>
<html lang="cs"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#333;">
  <div style="background:linear-gradient(to right,#0b8e3f,#06642b);padding:28px 20px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">Zelená liga</h1>
    <p style="color:rgba(255,255,255,.9);margin:4px 0 0;font-size:13px;">SPTO Brno</p>
  </div>
  <div style="max-width:600px;margin:0 auto;background:#fff;padding:32px 24px;">
    <p style="margin:0 0 16px;font-size:16px;">Ahoj ${escapeHtml(displayName)},</p>
    <p style="margin:0 0 16px;font-size:16px;">pro dokončení registrace na webu Zelené ligy opiš tento kód:</p>
    <p style="margin:24px 0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#04372c;">${code}</p>
    <p style="margin:0;font-size:13px;color:#64748b;">Kód platí 15 minut. Pokud ses neregistroval(a), tento e-mail ignoruj.</p>
  </div>
</body></html>`;
  const text = `Ahoj ${displayName},\n\nověřovací kód pro registraci na webu Zelené ligy: ${code}\n\nKód platí 15 minut. Pokud ses neregistroval(a), tento e-mail ignoruj.`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text, reply_to: replyTo }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to send email (${response.status}): ${body || '<no body>'}`);
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

async function issueVerificationCode(judge: JudgeRow): Promise<'sent' | 'cooldown'> {
  const supabase = getSupabaseAdminClient();
  const { data: latest } = await supabase
    .from('community_email_codes')
    .select('created_at')
    .eq('judge_id', judge.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest && Date.now() - new Date(latest.created_at).getTime() < CODE_RESEND_COOLDOWN_MS) {
    return 'cooldown';
  }
  await supabase
    .from('community_email_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('judge_id', judge.id)
    .is('used_at', null);
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const { error } = await supabase.from('community_email_codes').insert({
    judge_id: judge.id,
    code_hash: sha256(`${judge.id}:${code}`),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) {
    throw error;
  }
  await sendVerificationEmail(judge.email, judge.display_name, code);
  return 'sent';
}

function fail(res: any, status: number, error: string, code?: string) {
  res.status(status).json(code ? { error, code } : { error });
}

export async function handleCommunityAuth(req: any, res: any, action: string) {
  if (req.method !== 'POST' && !(req.method === 'GET' && action === 'me')) {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const payload = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const supabase = getSupabaseAdminClient();

  try {
    if (action === 'me') {
      const judgeId = await authenticateCommunityRequest(req);
      if (!judgeId) {
        fail(res, 401, 'Nejsi přihlášen.');
        return;
      }
      const { data } = await supabase.from('judges').select('id, email, display_name').eq('id', judgeId).maybeSingle();
      if (!data) {
        fail(res, 401, 'Nejsi přihlášen.');
        return;
      }
      res.status(200).json({ user: { id: data.id, email: data.email, displayName: data.display_name } });
      return;
    }

    if (action === 'logout') {
      const token = bearerToken(req);
      if (token) {
        await supabase
          .from('community_sessions')
          .update({ revoked_at: new Date().toISOString() })
          .eq('token_hash', sha256(token));
      }
      res.status(200).json({ ok: true });
      return;
    }

    const email = readString(payload, 'email', 200).toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      fail(res, 400, 'Zadej platný e-mail.');
      return;
    }
    const keys = [`ip:${requestIp(req)}`, `email:${email}`];

    if (action === 'register') {
      const password = typeof payload.password === 'string' ? payload.password : '';
      const displayName = readString(payload, 'displayName', 120);
      if (!displayName) {
        fail(res, 400, 'Vyplň své jméno.');
        return;
      }
      if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) {
        fail(res, 400, `Heslo musí mít alespoň ${MIN_PASSWORD_LENGTH} znaků.`);
        return;
      }
      if (await isRateLimited(keys)) {
        fail(res, 429, 'Příliš mnoho pokusů, zkus to za chvíli.');
        return;
      }
      await recordFailure(keys);

      let judge = await findJudgeByEmail(email);
      if (judge && judge.email_verified_at) {
        fail(res, 409, 'Účet s tímto e-mailem už existuje. Přihlas se.', 'exists');
        return;
      }
      const passwordHash = await hashPassword(password);
      if (judge) {
        const { error } = await supabase
          .from('judges')
          .update({ password_hash: passwordHash, display_name: displayName, updated_at: new Date().toISOString() })
          .eq('id', judge.id);
        if (error) throw error;
        judge = { ...judge, display_name: displayName };
      } else {
        const { data, error } = await supabase
          .from('judges')
          .insert({
            email,
            password_hash: passwordHash,
            display_name: displayName,
            account_type: 'community',
            must_change_password: false,
          })
          .select(JUDGE_COLUMNS)
          .single();
        if (error) throw error;
        judge = data as JudgeRow;
      }
      const result = await issueVerificationCode(judge);
      if (result === 'cooldown') {
        fail(res, 429, 'Kód jsme ti právě poslali, chvíli počkej a zkus to znovu.');
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'verify') {
      const code = readString(payload, 'code', 12);
      if (await isRateLimited(keys)) {
        fail(res, 429, 'Příliš mnoho pokusů, zkus to za chvíli.');
        return;
      }
      const judge = await findJudgeByEmail(email);
      const { data: record } = judge
        ? await supabase
            .from('community_email_codes')
            .select('id, code_hash, expires_at, attempts')
            .eq('judge_id', judge.id)
            .is('used_at', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null };
      if (
        !judge ||
        !record ||
        new Date(record.expires_at).getTime() < Date.now() ||
        record.attempts >= CODE_MAX_ATTEMPTS ||
        sha256(`${judge.id}:${code}`) !== record.code_hash
      ) {
        if (record) {
          await supabase.from('community_email_codes').update({ attempts: record.attempts + 1 }).eq('id', record.id);
        }
        await recordFailure(keys);
        fail(res, 400, 'Kód není platný nebo vypršel.');
        return;
      }
      const nowIso = new Date().toISOString();
      await supabase.from('community_email_codes').update({ used_at: nowIso }).eq('id', record.id);
      await supabase.from('judges').update({ email_verified_at: nowIso, updated_at: nowIso }).eq('id', judge.id);
      res.status(200).json(await createSession(judge));
      return;
    }

    if (action === 'login' || action === 'change-password') {
      const password = typeof payload.password === 'string' ? payload.password : '';
      if (await isRateLimited(keys)) {
        fail(res, 429, 'Příliš mnoho pokusů, zkus to za chvíli.');
        return;
      }
      const judge = await findJudgeByEmail(email);
      let passwordOk = false;
      if (judge?.password_hash) {
        try {
          passwordOk = await verifyPassword(judge.password_hash, password);
        } catch (error) {
          logger.error('[api/content/community] password verification failed', error);
        }
      }
      if (!judge || !passwordOk) {
        await recordFailure(keys);
        fail(res, 401, 'Neplatný e-mail nebo heslo.');
        return;
      }
      if (!judge.email_verified_at) {
        fail(res, 403, 'E-mail ještě není ověřený. Dokonči registraci kódem z e-mailu.', 'unverified');
        return;
      }

      if (action === 'change-password') {
        const newPassword = typeof payload.newPassword === 'string' ? payload.newPassword : '';
        if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > 200) {
          fail(res, 400, `Nové heslo musí mít alespoň ${MIN_PASSWORD_LENGTH} znaků.`);
          return;
        }
        const nowIso = new Date().toISOString();
        const { error } = await supabase
          .from('judges')
          .update({
            password_hash: await hashPassword(newPassword),
            must_change_password: false,
            password_rotated_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', judge.id);
        if (error) throw error;
        res.status(200).json(await createSession(judge));
        return;
      }

      if (judge.must_change_password) {
        fail(res, 403, 'Máš dočasné heslo, nastav si nové.', 'must_change_password');
        return;
      }
      res.status(200).json(await createSession(judge));
      return;
    }

    fail(res, 404, 'Not found');
  } catch (error) {
    logger.error('[api/content/community] auth failed', error);
    fail(res, 500, 'Něco se nepovedlo, zkus to prosím znovu.');
  }
}
