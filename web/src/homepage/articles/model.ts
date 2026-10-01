import { type ContentArticle } from '../../data/content';
import { formatDateLabel,stripHtmlToText } from '../shared/format';

export type Article = {
  source: 'pionyr' | 'local';
  title: string;
  dateLabel: string;
  dateISO: string;
  excerpt: string;
  href: string;
  body: string[] | any[] | string | null;
  bodyFormat?: 'html' | 'text' | null;
  author?: string;
  coverImage?: { url: string; alt?: string | null } | null;
};

export type CarouselImage = {
  id: string;
  src: string;
  alt: string;
};

export function buildExcerptFromBody(
  body: Article['body'],
  bodyFormat?: Article['bodyFormat'] | null,
  maxLength = 180,
) {
  if (!body) {
    return '';
  }
  let text = '';
  if (typeof body === 'string') {
    if (bodyFormat === 'html' || body.trim().startsWith('<')) {
      text = stripHtmlToText(body);
    } else {
      text = body;
    }
  } else if (Array.isArray(body)) {
    text = body.filter((chunk): chunk is string => typeof chunk === 'string').join(' ');
  }
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  const sliced = normalized.slice(0, maxLength + 1);
  const safeCut = sliced.lastIndexOf(' ');
  return `${sliced.slice(0, safeCut > 0 ? safeCut : maxLength).trim()}…`;
}

export type ExtractedArticlePhoto = {
  src: string;
  alt: string;
};

export function extractArticlePhotos(html: string) {
  if (!html || typeof DOMParser === 'undefined') {
    return { html, photos: [] as ExtractedArticlePhoto[] };
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const images = Array.from(doc.querySelectorAll('img'));
  const photos = images
    .map((img) => {
      const src = img.getAttribute('src') ?? '';
      if (!src) {
        return null;
      }
      return {
        src,
        alt: img.getAttribute('alt') ?? '',
      };
    })
    .filter((photo): photo is ExtractedArticlePhoto => Boolean(photo));
  images.forEach((img) => {
    const figure = img.closest('figure');
    if (figure) {
      figure.remove();
    } else {
      img.remove();
    }
  });
  return { html: doc.body.innerHTML, photos };
}

export function mapContentArticle(article: ContentArticle): Article {
  const dateISO = article.dateISO;
  const coverImage =
    article.coverImage?.url ? { url: article.coverImage.url, alt: article.coverImage.alt ?? null } : undefined;
  const excerptValue = (article.excerpt ?? '').trim();
  return {
    source: article.source,
    title: article.title,
    dateISO,
    dateLabel: formatDateLabel(dateISO),
    excerpt: excerptValue || buildExcerptFromBody(article.body ?? null, article.bodyFormat ?? null),
    href: `/clanky/${article.slug}`,
    body: article.body ?? null,
    bodyFormat: article.bodyFormat ?? null,
    author: article.author ?? undefined,
    coverImage,
  };
}
