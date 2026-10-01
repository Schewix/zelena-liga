import { resolveBody } from './articles/model.js';
import {
requireEditor
} from './editorAuth.js';
import { getSupabaseAdminClient } from './supabaseAdmin.js';

export type AlbumTitleRow = {
  folder_id: string;
  title: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export function parseAlbumTitlePayload(payload: Record<string, unknown>): {
  upserts: Array<{ folder_id: string; title: string }>;
  deletes: string[];
} {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const remove = Array.isArray(payload.remove) ? payload.remove : [];
  const upserts: Array<{ folder_id: string; title: string }> = [];
  const deletes: string[] = [];

  for (const entry of items) {
    if (!entry || typeof entry !== 'object') continue;
    const folderId = typeof (entry as any).folder_id === 'string' ? (entry as any).folder_id.trim() : '';
    if (!folderId) continue;
    const rawTitle = typeof (entry as any).title === 'string' ? (entry as any).title : '';
    const title = rawTitle.trim();
    if (!title) {
      deletes.push(folderId);
      continue;
    }
    upserts.push({ folder_id: folderId, title });
  }

  for (const id of remove) {
    if (typeof id === 'string' && id.trim()) {
      deletes.push(id.trim());
    }
  }

  return {
    upserts,
    deletes: Array.from(new Set(deletes)),
  };
}

export async function handleAdminAlbumTitles(req: any, res: any) {
  if (!requireEditor(req, res)) {
    return;
  }
  const supabase = getSupabaseAdminClient();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('content_gallery_albums')
      .select('folder_id,title,created_at,updated_at')
      .order('updated_at', { ascending: false });
    if (error) {
      res.status(500).json({ error: 'Failed to load album titles.' });
      return;
    }
    res.status(200).json({ items: (data ?? []) as AlbumTitleRow[] });
    return;
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    const payload = resolveBody(req);
    const { upserts, deletes } = parseAlbumTitlePayload(payload);

    if (upserts.length > 0) {
      const { error } = await supabase
        .from('content_gallery_albums')
        .upsert(upserts, { onConflict: 'folder_id' });
      if (error) {
        res.status(500).json({ error: 'Failed to save album titles.' });
        return;
      }
    }

    if (deletes.length > 0) {
      const { error } = await supabase.from('content_gallery_albums').delete().in('folder_id', deletes);
      if (error) {
        res.status(500).json({ error: 'Failed to delete album titles.' });
        return;
      }
    }

    res.status(200).json({ ok: true, updated: upserts.length, deleted: deletes.length });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
