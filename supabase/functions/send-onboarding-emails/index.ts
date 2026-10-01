/// <reference path="../types.d.ts" />

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const EVENT_ID = Deno.env.get("SYNC_EVENT_ID") ?? Deno.env.get("EVENT_ID");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SYNC_SECRET = Deno.env.get("SYNC_SECRET"); // volitelné – stejné jako u sync-judges
const ONBOARDING_LOGIN_URL =
  Deno.env.get("ONBOARDING_LOGIN_URL") ?? "https://zelenaliga.cz/aplikace/setonuv-zavod?reset=1";
const TRANSACTIONAL_FROM =
  Deno.env.get("TRANSACTIONAL_FROM_EMAIL") ?? "Zelená liga <info@zelenaliga.cz>";
const TRANSACTIONAL_REPLY_TO =
  Deno.env.get("TRANSACTIONAL_REPLY_TO") ?? "info@zelenaliga.cz";

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
if (!EVENT_ID) throw new Error("Missing SYNC_EVENT_ID (or EVENT_ID)");
if (!RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");

type OnboardingEvent = {
  id: string;
  judge_id: string | null;
  metadata: Record<string, unknown> | null;
};

const MAX_DELIVERY_ATTEMPTS = 5;

class ResendDeliveryError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }

  get retryable(): boolean {
    return this.status >= 500 || this.status === 408 || this.status === 429
      || (this.status === 409 && this.code !== "invalid_idempotent_request");
  }
}

function generatePassword(length = 10): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // bez podobných znaků
  let out = "";
  const rnd = crypto.getRandomValues(new Uint32Array(length));
  for (let i = 0; i < length; i++) {
    out += alphabet[rnd[i] % alphabet.length];
  }
  return out;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 210_000;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256 // 32 B
  );
  const encoded = `pbkdf2$sha256$${iterations}$${toBase64(salt.buffer)}$${toBase64(derived)}`;
  return encoded;
}

function isValidRecipient(email: string): boolean {
  // Judge records contain a bare address. Catch obvious input mistakes locally;
  // the provider still performs its complete address validation.
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
}

async function sendEmail(to: string, password: string, displayName?: string): Promise<string> {
  if (!isValidRecipient(to)) {
    throw new ResendDeliveryError(422, "invalid_recipient", "Recipient must be a single email address in email@example.com format.");
  }
  const from = TRANSACTIONAL_FROM;
  const replyTo = TRANSACTIONAL_REPLY_TO;
  const subject = "Dočasné heslo do aplikace Zelená liga";

  const preheader = "V e-mailu najdete dočasné heslo a odkaz na přihlášení";
  const safeDisplayName = escapeHtml(displayName?.trim() || "rozhodčí");
  const safePassword = escapeHtml(password);
  const safeLoginUrl = escapeHtml(ONBOARDING_LOGIN_URL);
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333;">
  <!-- Preheader (hidden) -->
  <div style="display: none; max-height: 0; overflow: hidden;">
    ${preheader}
  </div>

  <!-- Header gradient -->
  <div style="background: linear-gradient(to right, #0b8e3f, #06642b); padding: 32px 20px; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">Zelená Liga</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 4px 0 0; font-size: 13px;">SPTO Brno</p>
  </div>

  <!-- Main content -->
  <div style="max-width: 600px; margin: 0 auto; background: white; padding: 32px 24px;">
    <p style="margin: 0 0 20px; font-size: 16px; color: #333; line-height: 1.5;">
      Dobrý den <strong>${safeDisplayName}</strong>,
    </p>

    <p style="margin: 0 0 20px; font-size: 16px; color: #333; line-height: 1.5;">
      Byl vám vytvořen účet rozhodčího v systému Zelená liga.
    </p>

    <!-- Account setup card -->
    <div style="background: #eef9f0; border: 1px solid #cfe8d8; border-radius: 6px; padding: 16px; margin: 20px 0;">
      <h3 style="color: #06642b; margin: 0 0 12px; font-size: 14px; font-weight: 600; text-transform: uppercase;">Dočasné přihlašovací údaje</h3>
      <p style="margin: 0;">
        <strong>Dočasné heslo:</strong>
      </p>
      <p style="margin: 8px 0 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 18px; letter-spacing: 0.06em; color: #04372c;">
        ${safePassword}
      </p>
    </div>

    <p style="margin: 20px 0; font-size: 14px; color: #666; line-height: 1.5; text-align: center;">
      Klikněte na tlačítko níže, přihlaste se tímto dočasným heslem a aplikace vás vyzve k nastavení nového hesla:
    </p>

    <!-- CTA Button -->
    <div style="text-align: center; margin: 20px 0;">
      <a href="${safeLoginUrl}" style="display: inline-block; background: #ffd700; color: black; padding: 14px 28px; border-radius: 4px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Otevřít přihlášení
      </a>
    </div>

    <!-- Fallback link -->
    <p style="margin: 0; font-size: 12px; color: #0b8e3f; text-align: center;">
      Pokud se vám tlačítko nezobrazilo,
      <a href="${safeLoginUrl}" style="color: #0b8e3f; text-decoration: underline;">
        klikněte sem
      </a>
    </p>

    <hr style="margin: 20px 0; border: none; border-top: 1px solid #e8e8e8;">

    <p style="margin: 20px 0 0; font-size: 14px; color: #666; line-height: 1.5;">
      Máte-li technické dotazy, kontaktujte prosím info@zelenaliga.cz.
    </p>
  </div>

  <!-- Footer -->
  <div style="background: #f9f9f9; padding: 20px; text-align: center; font-size: 12px; color: #999;">
    <p style="margin: 0;">Zelená liga SPTO • Brno</p>
    <p style="margin: 8px 0 0;">
      <a href="mailto:info@zelenaliga.cz" style="color: #0b8e3f; text-decoration: none;">info@zelenaliga.cz</a>
    </p>
  </div>
</body>
</html>
  `;

  const text = [
    "Dobrý den,",
    "byl vám vytvořen účet rozhodčího.",
    `Dočasné heslo: ${password}`,
    `Přihlášení: ${ONBOARDING_LOGIN_URL}`,
    "Po přihlášení budete vyzváni ke změně hesla.",
    "Děkujeme.",
  ].join("\n");

  const ac = new AbortController();
  const FETCH_TIMEOUT_MS = 1500; // keep requests snappy in cron
  const fetchTimer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text,
        reply_to: replyTo,
      }),
      signal: ac.signal,
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => null);
      const code = typeof body?.name === "string" ? body.name : "unknown_error";
      const message = typeof body?.message === "string" ? body.message : "No error details returned";
      throw new ResendDeliveryError(resp.status, code, message);
    }

    const body = await resp.json().catch(() => ({} as Record<string, unknown>));
    const messageId = typeof body?.id === "string" ? body.id : "";
    return messageId;
  } finally {
    clearTimeout(fetchTimer);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (SYNC_SECRET) {
    const header = req.headers.get("authorization");
    if (!header || header !== `Bearer ${SYNC_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "true";
  const debug = url.searchParams.get("debug") === "1";
  const mode = url.searchParams.get("mode") || "";
  const forceReset = mode === "force-reset";

  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);

  // ---- 5s cron guardrails ----
  const STARTED = Date.now();
  const CRON_BUDGET_MS = 4000;   // keep well under the 5s scheduler limit
  const MAX_PER_RUN = 5;         // process at most 5 emails per run
  let processed = 0;

  // Vytáhneme události, které:
  // - patří do daného eventu nebo vznikly ručním přiřazením v administraci,
  // - jsou pro email (delivery_channel='email' nebo delivery_channel IS NULL),
  // - mají typ 'initial-password-issued',
  // - ještě nebyly odeslané (metadata.sent !== true)
  const { data, error } = await supabase
    .from("judge_onboarding_events")
    .select("id, judge_id, metadata")
    .or(`event_id.eq.${EVENT_ID},metadata->>source.eq.admin-assignment`)
    .or("delivery_channel.eq.email,delivery_channel.is.null");

  if (error) {
    console.error("Failed to load onboarding events", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const skipped = {
    not_initial_type: 0,
    already_sent: 0,
    missing_email: 0,
    missing_password: 0,
    forced_password_resets: 0,
    delivery_blocked: 0,
    retry_deferred: 0,
  };

  const candidates: (OnboardingEvent & { resolvedEmail: string; resolvedPassword: string; resolvedType: string; displayName?: string })[] = [];
  for (const row of (data as OnboardingEvent[] | null) ?? []) {
    const m = (row.metadata ?? {}) as Record<string, unknown>;
    if (m["type"] !== "initial-password-issued") { skipped.not_initial_type++; continue; }
    if (m["sent"] === true) { skipped.already_sent++; continue; }
    if (m["delivery_status"] === "failed" || Number(m["delivery_attempts"] ?? 0) >= MAX_DELIVERY_ATTEMPTS) {
      skipped.delivery_blocked++;
      continue;
    }
    if (typeof m["next_retry_at"] === "string" && Date.parse(m["next_retry_at"]) > Date.now()) {
      skipped.retry_deferred++;
      continue;
    }

    // resolve email and display_name from judges table
    let email = typeof m["email"] === "string" ? String(m["email"]) : "";
    let displayName: string | undefined;
    
    if (row.judge_id) {
      const { data: jrow } = await supabase
        .from("judges")
        .select("email, display_name")
        .eq("id", row.judge_id)
        .maybeSingle();
      if (jrow?.email && typeof jrow.email === "string") email = jrow.email;
      if (jrow?.display_name && typeof jrow.display_name === "string") displayName = jrow.display_name;
    }
    email = email.trim();
    if (!email) { skipped.missing_email++; continue; }

    // resolve password or force-reset
    let password = typeof m["password"] === "string" ? String(m["password"]) : "";
    let resolvedType = "initial-password-issued";
    if (!password && isValidRecipient(email)) {
      if (!forceReset || !row.judge_id) { skipped.missing_password++; continue; }
      // create a new temporary password and rotate it on the judge record
      const newPass = generatePassword(12);
      const newHash = await hashPassword(newPass);
      if (!dryRun) {
        const { error: updJudgeErr } = await supabase
          .from("judges")
          .update({
            password_hash: newHash,
            must_change_password: true,
            password_rotated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.judge_id);
        if (updJudgeErr) {
          // if update fails, skip this event
          skipped.missing_password++; // reuse bucket
          continue;
        }
      }
      password = newPass;
      resolvedType = "password-reset-issued";
      skipped.forced_password_resets++;
    }

    candidates.push({ ...row, resolvedEmail: email, resolvedPassword: password, resolvedType, displayName });
  }

  type SendSummary = {
    scanned: number;
    toSend: number;
    sent: number;
    failed: number;
    dryRun: boolean;
    errors: string[];
    skipped?: {
      not_initial_type: number;
      already_sent: number;
      missing_email: number;
      missing_password: number;
      forced_password_resets: number;
      delivery_blocked: number;
      retry_deferred: number;
    };
  };

  const summary: SendSummary = {
    scanned: data?.length ?? 0,
    toSend: candidates.length,
    sent: 0,
    failed: 0,
    dryRun,
    errors: [],
  };
  if (debug) summary.skipped = skipped;
  if (debug) (summary as any).mode = mode;

  for (const ev of candidates) {
    // stop early if we are close to the scheduler timeout
    if (processed >= MAX_PER_RUN) break;
    if (Date.now() - STARTED > CRON_BUDGET_MS) break;
    processed++;

    const md = (ev.metadata ?? {}) as Record<string, unknown>;
    const email = (ev as any).resolvedEmail as string;
    const password = (ev as any).resolvedPassword as string;
    const displayName = (ev as any).displayName as string | undefined;
    const previousAttempts = Number(md["delivery_attempts"] ?? 0);
    const attempts = (Number.isSafeInteger(previousAttempts) && previousAttempts >= 0 ? previousAttempts : 0) + 1;
    let acceptedMessageId: string | null = null;

    try {
      if (!dryRun) {
        const messageId = await sendEmail(email, password, displayName);
        acceptedMessageId = messageId;

        // označíme jako odeslané (metadata.sent=true, metadata.sent_at=now)
        const { password: _pw, ...restMd } = md as Record<string, unknown>;
        const newMetadata = {
          ...restMd,
          type: (ev as any).resolvedType || restMd["type"],
          email, // persist resolved email for audit
          sent: true,
          sent_at: new Date().toISOString(),
          provider: "resend",
          message_id: messageId,
          delivery_status: "sent",
          delivery_attempts: attempts,
          next_retry_at: null,
          last_delivery_error: null,
        };
        const { error: updErr } = await supabase
          .from("judge_onboarding_events")
          .update({ metadata: newMetadata })
          .eq("id", ev.id);

        if (updErr) throw new Error(`Update failed: ${updErr.message}`);

        summary.sent += 1;
        console.log(`Onboarding email sent: ${email} (message_id=${messageId})`);
      } else {
        summary.sent += 1;
      }
    } catch (e) {
      summary.failed += 1;
      const providerError = e instanceof ResendDeliveryError ? e : null;
      const retryable = acceptedMessageId === null && (!providerError || providerError.retryable);
      const blocked = !retryable || attempts >= MAX_DELIVERY_ATTEMPTS;
      // Provider errors can echo request fields; never persist a temporary password or API key in diagnostics.
      let errorMessage = e instanceof Error ? e.message : String(e);
      for (const secret of [password, RESEND_API_KEY]) {
        if (secret) errorMessage = errorMessage.replaceAll(secret, "[redacted]");
      }
      errorMessage = errorMessage.slice(0, 1000);
      const failure = {
        status: providerError?.status ?? null,
        code: providerError?.code ?? (acceptedMessageId !== null ? "delivery_receipt_update_failed" : "delivery_error"),
        message: errorMessage,
        failed_at: new Date().toISOString(),
      };
      summary.errors.push(`id=${ev.id} status=${failure.status} code=${failure.code}: ${errorMessage}`);
      console.error("Onboarding email delivery failed", { event_id: ev.id, ...failure });
      if (!dryRun) {
        const { password: _pw, ...restMd } = md;
        const { error: saveError } = await supabase
          .from("judge_onboarding_events")
          .update({ metadata: {
            ...restMd,
            // Retain the actual password for retries, including one generated by force-reset.
            ...(acceptedMessageId === null ? { password } : { sent: true, message_id: acceptedMessageId }),
            email,
            delivery_status: blocked ? "failed" : "retry",
            delivery_attempts: attempts,
            next_retry_at: blocked ? null : new Date(Date.now() + 5 * 60_000 * 2 ** (attempts - 1)).toISOString(),
            last_delivery_error: failure,
          } })
          .eq("id", ev.id);
        if (saveError) {
          summary.errors.push(`id=${ev.id}: Failed to persist delivery failure`);
          console.error("Failed to persist onboarding delivery failure", { event_id: ev.id, code: saveError.code });
          return new Response(JSON.stringify(summary), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      }
    }
  }

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
