import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { getAuthConfig } from '../../authTokens.js';
import { respond } from './respond.js';

export type TokenClaims = {
  sub?: string;
  sessionId?: string;
  event_id?: string;
  eventId?: string;
  station_id?: string;
  stationId?: string;
  type?: string;
};

export function getSupabaseAdminConfig() {
  const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL environment variable.');
  }

  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable.');
  }

  return { supabaseUrl, serviceRoleKey };
}

export async function requireCalcSession(req: any, res: any) {
  const authHeader = req.headers?.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing session' });
    return null;
  }

  const token = authHeader.slice('Bearer '.length).trim();

  let authConfig;
  try {
    authConfig = getAuthConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Missing auth configuration.';
    respond(res, 500, message, 'auth-config');
    return null;
  }

  let claims: TokenClaims;
  try {
    claims = jwt.verify(token, authConfig.jwtSecret) as TokenClaims;
  } catch {
    res.status(401).json({ error: 'Invalid JWT' });
    return null;
  }

  if (claims.type !== 'access') {
    res.status(401).json({ error: 'Invalid session' });
    return null;
  }

  const resolveClaimString = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : '');
  const sessionId = resolveClaimString(claims.sessionId);
  const judgeId = resolveClaimString(claims.sub);
  const tokenEventId = resolveClaimString(claims.event_id) || resolveClaimString(claims.eventId);
  const tokenStationId = resolveClaimString(claims.station_id) || resolveClaimString(claims.stationId);

  if (!sessionId || !judgeId || !tokenEventId || !tokenStationId) {
    res.status(401).json({ error: 'Invalid session' });
    return null;
  }

  let supabaseConfig;
  try {
    supabaseConfig = getSupabaseAdminConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Missing Supabase configuration.';
    respond(res, 500, message, 'supabase-config');
    return null;
  }

  const supabaseAdmin = createClient(supabaseConfig.supabaseUrl, supabaseConfig.serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: session, error: sessionError } = await supabaseAdmin
    .from('judge_sessions')
    .select('id, judge_id, revoked_at')
    .eq('id', sessionId)
    .eq('judge_id', judgeId)
    .maybeSingle();

  if (sessionError) {
    respond(res, 500, 'Session lookup failed', sessionError.message);
    return null;
  }

  if (!session || session.revoked_at) {
    res.status(401).json({ error: 'Invalid session' });
    return null;
  }

  const { data: assignment, error: assignmentError } = await supabaseAdmin
    .from('judge_assignments')
    .select('id')
    .eq('judge_id', judgeId)
    .eq('station_id', tokenStationId)
    .eq('event_id', tokenEventId)
    .maybeSingle();

  if (assignmentError) {
    respond(res, 500, 'Assignment lookup failed', assignmentError.message);
    return null;
  }

  if (!assignment) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  const { data: station, error: stationError } = await supabaseAdmin
    .from('stations')
    .select('code')
    .eq('id', tokenStationId)
    .eq('event_id', tokenEventId)
    .maybeSingle();

  if (stationError) {
    respond(res, 500, 'Station lookup failed', stationError.message);
    return null;
  }

  const stationCode = (station?.code ?? '').trim().toUpperCase();
  if (stationCode !== 'T') {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  return {
    supabaseAdmin,
    eventId: tokenEventId,
  };
}
