# Better Stack monitoring

Set `BETTER_STACK_SOURCE_TOKEN` and `BETTER_STACK_INGESTING_HOST` in Vercel's
Production environment, then deploy. The host accepts either the hostname copied
from Better Stack or its HTTPS origin. It must end in `.betterstackdata.com`.
Do not put the token in frontend/VITE variables or commit it.

The API handlers use `withLogging` and `logger`. They send caught errors and
warnings, otherwise unlogged HTTP 5xx responses, unhandled exceptions and requests
lasting at least 5 seconds. Every request has an `X-Request-ID` response header;
related logs share `request_id`, static `route`, `release`, `status`, and
`duration_ms`. Successful password-reset submissions emit
`email.password_reset.accepted` with the Resend message ID. This means accepted
by Resend, not delivered to the mailbox.

Only operation labels, allowlisted error codes and message IDs are exported.
Request bodies, headers, URLs/query strings, raw provider errors, email addresses,
passwords and tokens are not exported. Keep logger's first argument a static,
non-sensitive operation description. Existing console diagnostics stay in Vercel.

Each request sends one batch in the background using Vercel `waitUntil`, with a
2-second transport timeout, no redirects and no retries. Logging failure must not
change the API response. Failures produce a rate-limited `[telemetry]` warning in
Vercel. Missing credentials disable export; malformed hosts are rejected.

Volume is bounded to 20 entries/request and 120 entries/minute **per warm
instance**. This is not a global quota: scaling creates more independent limits.
Keep the Better Stack account on its free tier with paid ingestion disabled;
monitor usage there. HTTP 402 (quota reached) drops logs without retrying.
The configured retention remains 3 days; no platform Log Drains are required.

## Verify after deployment

1. Open an uncached API-backed part of the website (e.g. articles).
2. In Better Stack Live tail, select the production source and look for
   `logging.ready`. This is emitted on the first configured invocation of each
   function instance, not on every request.
3. Check `environment=production`, `release`, and `request_id`.
4. If nothing arrives, check the Vercel environment/deployment and `[telemetry]`
   warnings. The static homepage or CDN-cached responses may not invoke an API.

This integration does not yet collect frontend errors, Supabase internal logs or
Supabase Edge Function logs. Resend delivery/bounce tracking needs a separately
configured and signature-verified webhook. Uptime monitors and alert rules are
configured in Better Stack; ingesting logs alone does not create notifications.
