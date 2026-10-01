import { logger } from '../logger.js';
import { resolveBody } from './articles/model.js';
import {
requireEditor
} from './editorAuth.js';
import { getSupabaseAdminClient } from './supabaseAdmin.js';

export type ScheduleEventRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  kind: string;
  note: string | null;
  href: string | null;
  published: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export const CONTENT_SCHEDULE_KINDS = new Set(['event', 'assembly', 'staff']);

export const CONTENT_SCHEDULE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseScheduleEventPayload(payload: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  const readText = (key: string) => {
    if (typeof payload[key] !== 'string') {
      return;
    }
    const value = (payload[key] as string).trim();
    update[key] = value.length > 0 ? value : null;
  };

  if (typeof payload.name === 'string') {
    update.name = payload.name.trim();
  }
  if (typeof payload.start_date === 'string' && CONTENT_SCHEDULE_DATE_PATTERN.test(payload.start_date)) {
    update.start_date = payload.start_date;
  }
  if (typeof payload.kind === 'string' && CONTENT_SCHEDULE_KINDS.has(payload.kind)) {
    update.kind = payload.kind;
  } else if (!partial) {
    update.kind = 'event';
  }
  if (typeof payload.published === 'boolean') {
    update.published = payload.published;
  }
  // Konec akce je nepovinný, prázdný řetězec musí umět termín zase zkrátit na jeden den.
  if (payload.end_date === null || payload.end_date === '') {
    update.end_date = null;
  } else if (typeof payload.end_date === 'string' && CONTENT_SCHEDULE_DATE_PATTERN.test(payload.end_date)) {
    update.end_date = payload.end_date;
  }

  readText('note');
  readText('href');

  return update;
}

export function toPublicScheduleEvent(row: ScheduleEventRow) {
  return {
    id: row.id,
    name: row.name,
    start: row.start_date,
    end: row.end_date,
    kind: row.kind,
    note: row.note,
    href: row.href,
  };
}

export async function handlePublicSchedule(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('content_schedule_events')
      .select('*')
      .eq('published', true)
      .order('start_date', { ascending: true });
    if (error) {
      // Dokud není migrace nasazená, web si vystačí se zabudovaným seznamem termínů.
      if (typeof (error as any).code === 'string' && (error as any).code === '42P01') {
        res.status(200).json({ events: [] });
        return;
      }
      res.status(500).json({ error: 'Failed to load schedule.' });
      return;
    }
    res.status(200).json({ events: ((data ?? []) as ScheduleEventRow[]).map(toPublicScheduleEvent) });
  } catch (error) {
    logger.error('[api/content/schedule] failed', error);
    res.status(500).json({ error: 'Failed to load schedule.' });
  }
}

export async function handleAdminScheduleEvents(req: any, res: any) {
  if (!requireEditor(req, res)) {
    return;
  }
  const supabase = getSupabaseAdminClient();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('content_schedule_events')
      .select('*')
      .order('start_date', { ascending: true });
    if (error) {
      res.status(500).json({ error: 'Nepodařilo se načíst termíny.' });
      return;
    }
    res.status(200).json({ events: data ?? [] });
    return;
  }

  if (req.method === 'POST') {
    const payload = resolveBody(req);
    const values = parseScheduleEventPayload(payload, false);
    if (typeof values.name !== 'string' || values.name.length === 0) {
      res.status(400).json({ error: 'Chybí název akce.' });
      return;
    }
    if (typeof values.start_date !== 'string') {
      res.status(400).json({ error: 'Chybí datum akce.' });
      return;
    }

    const { data, error } = await supabase
      .from('content_schedule_events')
      .insert(values)
      .select('*')
      .single();
    if (error) {
      res.status(500).json({ error: 'Nepodařilo se uložit termín.' });
      return;
    }
    res.status(200).json({ event: data });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

export async function handleAdminScheduleEvent(req: any, res: any, id: string) {
  if (!requireEditor(req, res)) {
    return;
  }
  const supabase = getSupabaseAdminClient();

  if (req.method === 'PUT') {
    const payload = resolveBody(req);
    const update = parseScheduleEventPayload(payload, true);
    if (typeof update.name === 'string' && update.name.length === 0) {
      res.status(400).json({ error: 'Chybí název akce.' });
      return;
    }
    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: 'Není co uložit.' });
      return;
    }

    const { data, error } = await supabase
      .from('content_schedule_events')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      res.status(500).json({ error: 'Nepodařilo se uložit termín.' });
      return;
    }
    res.status(200).json({ event: data });
    return;
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('content_schedule_events').delete().eq('id', id);
    if (error) {
      res.status(500).json({ error: 'Nepodařilo se smazat termín.' });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
