import { logger } from '../../logger.js';
import { ArticleImageUploadRequest } from '../articles/images.js';
import { resolveBody,slugify } from '../articles/model.js';
import {
requireEditor
} from '../editorAuth.js';
import { getSupabaseAdminClient } from '../supabaseAdmin.js';
import { CONTENT_DOCUMENTS_BUCKET,CONTENT_DOCUMENT_ALLOWED_TYPES,CONTENT_DOCUMENT_MAX_SIZE,resolveDocumentExtension } from './model.js';

export async function handleAdminDocumentUpload(req: any, res: any) {
  if (!requireEditor(req, res)) {
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const payload = resolveBody(req);
  const filesRaw = Array.isArray(payload.files) ? payload.files : [];
  if (filesRaw.length === 0) {
    res.status(400).json({ error: 'Chybí soubory pro upload.' });
    return;
  }
  if (filesRaw.length > 10) {
    res.status(400).json({ error: 'Najednou můžeš nahrát maximálně 10 souborů.' });
    return;
  }

  const files: ArticleImageUploadRequest[] = [];
  for (const entry of filesRaw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const name = typeof (entry as any).name === 'string' ? (entry as any).name.trim() : '';
    const type = typeof (entry as any).type === 'string' ? (entry as any).type.trim().toLowerCase() : '';
    const size = typeof (entry as any).size === 'number' ? (entry as any).size : undefined;
    if (!name || !type) {
      continue;
    }
    files.push({ name, type, size });
  }

  if (files.length === 0) {
    res.status(400).json({ error: 'Neplatný seznam souborů.' });
    return;
  }

  const invalidType = files.find((file) => !CONTENT_DOCUMENT_ALLOWED_TYPES.has(file.type));
  if (invalidType) {
    res.status(400).json({ error: `Typ souboru ${invalidType.type} není povolený. Nahraj PDF nebo obrázek.` });
    return;
  }
  const tooLarge = files.find((file) => typeof file.size === 'number' && file.size > CONTENT_DOCUMENT_MAX_SIZE);
  if (tooLarge) {
    res.status(400).json({ error: `Soubor ${tooLarge.name} je větší než 50 MB.` });
    return;
  }

  const supabase = getSupabaseAdminClient();
  const now = new Date();
  const year = String(now.getFullYear());
  const stamp = now.getTime();

  try {
    const uploads = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const ext = resolveDocumentExtension(file.name, file.type);
      const stem = slugify(file.name.replace(/\.[^.]+$/, '')) || 'dokument';
      const random = Math.random().toString(36).slice(2, 10);
      const path = `dokumenty/${year}/${stamp}-${index}-${random}-${stem.slice(0, 80)}.${ext}`;
      const signed = await supabase.storage
        .from(CONTENT_DOCUMENTS_BUCKET)
        .createSignedUploadUrl(path, { upsert: false });
      if (signed.error || !signed.data) {
        throw signed.error ?? new Error('Failed to create signed upload URL.');
      }
      const publicUrl = supabase.storage.from(CONTENT_DOCUMENTS_BUCKET).getPublicUrl(path).data.publicUrl;
      uploads.push({
        fileName: file.name,
        contentType: file.type,
        path,
        token: signed.data.token,
        publicUrl,
      });
    }

    res.status(200).json({ uploads });
  } catch (error) {
    logger.error('[api/content/admin/document-upload] failed to prepare upload', error);
    res.status(500).json({ error: 'Nepodařilo se připravit upload souborů.' });
  }
}
