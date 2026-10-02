import {
type SptoDocumentKind
} from '../../data/documents';
import {
type ScheduleEventKind
} from '../../data/schedule';

export const CONTENT_DOCUMENT_MAX_SIZE = 50 * 1024 * 1024;

export const CONTENT_ARTICLE_IMAGES_BUCKET = 'content-article-images';

export const CONTENT_ARTICLE_ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

export const CONTENT_ARTICLE_FONT_SIZE_OPTIONS = [
  { value: '2', label: '12 px' },
  { value: '3', label: '16 px' },
  { value: '4', label: '20 px' },
  { value: '5', label: '24 px' },
  { value: '6', label: '32 px' },
] as const;

export type EditorArticle = {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  body?: string | null;
  author?: string | null;
  cover_image_url?: string | null;
  cover_image_alt?: string | null;
  status: 'draft' | 'published';
  published_at?: string | null;
  created_at?: string | null;
};

export type EditorFormState = {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  author: string;
  cover_image_url: string;
  cover_image_alt: string;
  status: 'draft' | 'published';
};

export type EditorSignedImageUpload = {
  fileName: string;
  contentType: string;
  path: string;
  token: string;
  publicUrl: string;
};

export const EMPTY_EDITOR_FORM: EditorFormState = {
  title: '',
  slug: '',
  excerpt: '',
  body: '',
  author: '',
  cover_image_url: '',
  cover_image_alt: '',
  status: 'draft',
};

export type EditorDocument = {
  id: string;
  kind: SptoDocumentKind;
  title: string;
  description?: string | null;
  event_date?: string | null;
  year?: number | null;
  file_url?: string | null;
  file_path?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  external_url?: string | null;
  links?: unknown;
  cover_url?: string | null;
  visibility: 'public' | 'internal';
  published: boolean;
  schedule_event_id?: string | null;
  competition_slug?: string | null;
  created_at?: string | null;
};

export type EditorDocumentLink = { label: string; url: string };

// Řádky nahrané před sloupcem links mají odkaz jen v external_url, ať o něj redakce nepřijde.
export function editorDocumentLinks(doc: EditorDocument): EditorDocumentLink[] {
  const stored = Array.isArray(doc.links)
    ? doc.links.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const value = item as Record<string, unknown>;
        const url = typeof value.url === 'string' ? value.url : '';
        if (url.trim().length === 0) return [];
        return [{ label: typeof value.label === 'string' ? value.label : '', url }];
      })
    : [];
  if (stored.length > 0) {
    return stored;
  }
  return doc.external_url ? [{ label: '', url: doc.external_url }] : [];
}

export type EditorDocumentFormState = {
  kind: SptoDocumentKind;
  title: string;
  description: string;
  event_date: string;
  year: string;
  file_url: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  links: EditorDocumentLink[];
  cover_url: string;
  visibility: 'public' | 'internal';
  published: boolean;
  schedule_event_id: string;
  competition_slug: string;
};

export const EMPTY_DOCUMENT_FORM: EditorDocumentFormState = {
  kind: 'propozice',
  title: '',
  description: '',
  event_date: '',
  year: '',
  file_url: '',
  file_path: '',
  file_name: '',
  file_size: null,
  links: [],
  cover_url: '',
  visibility: 'public',
  published: true,
  schedule_event_id: '',
  competition_slug: '',
};

export type EditorScheduleEvent = {
  id: string;
  name: string;
  start_date: string;
  end_date?: string | null;
  kind: ScheduleEventKind;
  note?: string | null;
  href?: string | null;
  published: boolean;
};

export type EditorScheduleFormState = {
  name: string;
  start_date: string;
  end_date: string;
  kind: ScheduleEventKind;
  note: string;
  href: string;
  published: boolean;
};

export const EMPTY_SCHEDULE_FORM: EditorScheduleFormState = {
  name: '',
  start_date: '',
  end_date: '',
  kind: 'event',
  note: '',
  href: '',
  published: true,
};

export const EDITOR_SECTIONS = [
  { id: 'clanky', label: 'Články' },
  { id: 'poradi-zl', label: 'Pořadí Zelené ligy' },
  { id: 'historie-zl', label: 'Historická tabulka' },
  { id: 'body-zl', label: 'Výpočet bodů ZL' },
  { id: 'alba', label: 'Názvy alb' },
  { id: 'dokumenty', label: 'Dokumenty' },
  { id: 'terminy', label: 'Termíny' },
  { id: 'kontrola-jmen', label: 'Kontrola jmen' },
] as const;

export type EditorSection = (typeof EDITOR_SECTIONS)[number]['id'];

export function readEditorSection(): EditorSection {
  const hash = window.location.hash.slice(1);
  return EDITOR_SECTIONS.find((section) => section.id === hash)?.id ?? 'clanky';
}
