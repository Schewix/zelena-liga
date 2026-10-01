import { logger } from '../../logger.js';
import { resolveBody } from '../articles/model.js';
import {
requireEditor
} from '../editorAuth.js';
import { getSupabaseAdminClient } from '../supabaseAdmin.js';
import { CONTENT_DOCUMENTS_BUCKET,DocumentRow,parseDocumentPayload,toPublicDocument } from './model.js';

export async function handlePublicDocuments(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('content_documents')
      .select('*')
      .eq('published', true)
      .order('order_index', { ascending: true })
      .order('event_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) {
      // Dokud není migrace nasazená, tváříme se jako prázdný seznam, ať web nespadne.
      if (typeof (error as any).code === 'string' && (error as any).code === '42P01') {
        res.status(200).json({ documents: [] });
        return;
      }
      res.status(500).json({ error: 'Failed to load documents.' });
      return;
    }
    res.status(200).json({ documents: ((data ?? []) as DocumentRow[]).map(toPublicDocument) });
  } catch (error) {
    logger.error('[api/content/documents] failed', error);
    res.status(500).json({ error: 'Failed to load documents.' });
  }
}

export async function handleAdminDocuments(req: any, res: any) {
  if (!requireEditor(req, res)) {
    return;
  }
  const supabase = getSupabaseAdminClient();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('content_documents')
      .select('*')
      .order('event_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) {
      res.status(500).json({ error: 'Nepodařilo se načíst dokumenty.' });
      return;
    }
    res.status(200).json({ documents: data ?? [] });
    return;
  }

  if (req.method === 'POST') {
    const payload = resolveBody(req);
    const values = parseDocumentPayload(payload, false);
    if (typeof values.title !== 'string' || values.title.length === 0) {
      res.status(400).json({ error: 'Chybí název dokumentu.' });
      return;
    }
    if (!values.file_url && !values.external_url) {
      res.status(400).json({ error: 'Nahraj soubor nebo vyplň aspoň jeden odkaz.' });
      return;
    }

    const { data, error } = await supabase.from('content_documents').insert(values).select('*').single();
    if (error) {
      res.status(500).json({ error: 'Nepodařilo se uložit dokument.' });
      return;
    }
    res.status(200).json({ document: data });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

export async function handleAdminDocument(req: any, res: any, id: string) {
  if (!requireEditor(req, res)) {
    return;
  }
  const supabase = getSupabaseAdminClient();

  if (req.method === 'PUT') {
    const payload = resolveBody(req);
    const update = parseDocumentPayload(payload, true);
    if (typeof update.title === 'string' && update.title.length === 0) {
      res.status(400).json({ error: 'Chybí název dokumentu.' });
      return;
    }
    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: 'Není co uložit.' });
      return;
    }

    const { data, error } = await supabase
      .from('content_documents')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      res.status(500).json({ error: 'Nepodařilo se uložit dokument.' });
      return;
    }
    res.status(200).json({ document: data });
    return;
  }

  if (req.method === 'DELETE') {
    const { data: existing } = await supabase
      .from('content_documents')
      .select('file_path')
      .eq('id', id)
      .maybeSingle();

    const { error } = await supabase.from('content_documents').delete().eq('id', id);
    if (error) {
      res.status(500).json({ error: 'Nepodařilo se smazat dokument.' });
      return;
    }

    const filePath = (existing as { file_path?: string | null } | null)?.file_path;
    if (filePath) {
      const removal = await supabase.storage.from(CONTENT_DOCUMENTS_BUCKET).remove([filePath]);
      if (removal.error) {
        // Záznam je pryč, osiřelý soubor v bucketu nebrání dalšímu provozu.
        logger.error('[api/content/admin/documents] failed to remove file', removal.error);
      }
    }

    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
