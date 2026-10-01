import { logger } from '../../logger.js';
import {
requireEditor
} from '../editorAuth.js';
import { getSupabaseAdminClient } from '../supabaseAdmin.js';
import { resolveBody,slugify } from './model.js';

export type ArticleImageUploadRequest = {
  name: string;
  type: string;
  size?: number;
};

export const CONTENT_ARTICLE_IMAGES_BUCKET = 'content-article-images';

export const CONTENT_ARTICLE_ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function resolveArticleImageExtension(fileName: string, contentType: string): string {
  const extensionFromName = fileName
    .split('.')
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (extensionFromName && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extensionFromName)) {
    return extensionFromName === 'jpg' ? 'jpeg' : extensionFromName;
  }
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/gif') return 'gif';
  return 'jpeg';
}

export async function handleAdminArticleImages(req: any, res: any) {
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
  if (filesRaw.length > 20) {
    res.status(400).json({ error: 'Najednou můžeš nahrát maximálně 20 souborů.' });
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

  const invalidType = files.find((file) => !CONTENT_ARTICLE_ALLOWED_IMAGE_TYPES.has(file.type));
  if (invalidType) {
    res.status(400).json({ error: `Typ souboru ${invalidType.type} není povolený.` });
    return;
  }
  const tooLarge = files.find((file) => typeof file.size === 'number' && file.size > 10 * 1024 * 1024);
  if (tooLarge) {
    res.status(400).json({ error: `Soubor ${tooLarge.name} je větší než 10 MB.` });
    return;
  }

  const supabase = getSupabaseAdminClient();
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const stamp = now.getTime();

  try {
    const uploads = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const ext = resolveArticleImageExtension(file.name, file.type);
      const stem = slugify(file.name.replace(/\.[^.]+$/, '')) || 'image';
      const random = Math.random().toString(36).slice(2, 10);
      const path = `articles/${year}/${month}/${stamp}-${index}-${random}-${stem.slice(0, 80)}.${ext}`;
      const signed = await supabase.storage
        .from(CONTENT_ARTICLE_IMAGES_BUCKET)
        .createSignedUploadUrl(path, { upsert: false });
      if (signed.error || !signed.data) {
        throw signed.error ?? new Error('Failed to create signed upload URL.');
      }
      const publicUrl = supabase.storage.from(CONTENT_ARTICLE_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
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
    logger.error('[api/content/admin/article-images] failed to prepare upload', error);
    res.status(500).json({ error: 'Nepodařilo se připravit upload obrázků.' });
  }
}
