import { env } from '../envVars';

export const SUPABASE_BASE_URL = (env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');

if (!SUPABASE_BASE_URL) {
  throw new Error('Missing VITE_SUPABASE_URL for submit-station-record requests.');
}

export const SUBMIT_STATION_RECORD_URL = import.meta.env.PROD
  ? '/api/submit-station-record'
  : `${SUPABASE_BASE_URL}/functions/v1/submit-station-record`;

export const SCORE_REVIEW_URL = import.meta.env.PROD ? '/api/station-score-review' : '';

export const STATION_TICKETS_URL = import.meta.env.PROD ? '/api/station-tickets' : '';

export const AUTH_API_BASE_URL = env.VITE_AUTH_API_URL?.replace(/\/$/, '') ?? '';

export const ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

if (import.meta.env.DEV) {
  console.debug('[outbox] resolved submit endpoint', { submitStationRecordUrl: SUBMIT_STATION_RECORD_URL });
}
