import {
type SyntheticEvent
} from 'react';
import { GalleryPhotoLike } from '../gallery/model';

export function toDriveSizedUrl(url: string, size: number) {
  let output = url.replace(/=s\d+(-c)?/g, `=w${size}`);
  output = output.replace(/=w\d+-h\d+(-c)?/g, `=w${size}`);
  return output;
}

export function isDriveImageUrl(url: string) {
  return url.includes('drive.google.com') || url.includes('googleusercontent.com');
}

export function isDirectImageAssetUrl(url: string) {
  return /^\/api\/gallery\/image\b/.test(url) || /\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(url);
}

export function toProxyImageUrl(url: string, size: number, cropSquare = true) {
  const cleaned = url.replace(/^https?:\/\//i, '').replace(/^\/\//, '');
  const encoded = encodeURIComponent(cleaned);
  const cropParams = cropSquare ? `&h=${size}&fit=cover` : '';
  return `https://images.weserv.nl/?url=${encoded}&w=${size}${cropParams}&output=webp&q=80`;
}

export function extractDriveFileId(url: string) {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
}

export function getCachedArticleImageVariantUrl(url: string, size: number) {
  if (!url.includes('/articles/') || !/-w\d+\.webp(?:[?#].*)?$/i.test(url)) {
    return null;
  }
  const targetWidth = size <= 360 ? 360 : size <= 720 ? 720 : 1200;
  return url.replace(/-w\d+\.webp/i, `-w${targetWidth}.webp`);
}

export function getArticleThumbUrl(url: string, size: number, cropSquare = true) {
  if (!url) {
    return '';
  }
  const cachedArticleVariant = getCachedArticleImageVariantUrl(url, size);
  if (cachedArticleVariant) {
    return cachedArticleVariant;
  }
  // pionyr.cz blocks server-side image proxies with HTTP 403, while direct browser requests work.
  if (url.startsWith('/') || url.includes('images.weserv.nl/') || url.includes('pionyr.cz/')) {
    return url;
  }
  if (url.includes('drive.google.com/thumbnail')) {
    return toDriveSizedUrl(url, size);
  }
  if (url.includes('drive.google.com') || url.includes('googleusercontent.com')) {
    const id = extractDriveFileId(url);
    if (id) {
      return `https://drive.google.com/thumbnail?sz=w${size}&id=${id}`;
    }
  }
  return toProxyImageUrl(url, size, cropSquare);
}

export function getPhotoThumbUrl(photo: GalleryPhotoLike | undefined | null, size: number) {
  if (!photo) {
    return '';
  }
  if (photo.thumbnailLink) {
    return isDriveImageUrl(photo.thumbnailLink) ? toDriveSizedUrl(photo.thumbnailLink, size) : photo.thumbnailLink;
  }
  const fallback = photo.fullImageUrl ?? photo.webContentLink;
  if (!fallback) {
    return '';
  }
  if (isDriveImageUrl(fallback)) {
    return toProxyImageUrl(fallback, size);
  }
  return isDirectImageAssetUrl(fallback) ? fallback : toProxyImageUrl(fallback, size);
}

export function buildPhotoSrcSet(photo: GalleryPhotoLike | undefined | null, sizes: number[]) {
  const uniqueUrls = new Set<string>();
  const entries = sizes
    .map((size) => {
      const url = getPhotoThumbUrl(photo, size);
      if (!url || uniqueUrls.has(url)) {
        return null;
      }
      uniqueUrls.add(url);
      return url ? `${url} ${size}w` : null;
    })
    .filter((entry): entry is string => Boolean(entry));
  if (entries.length <= 1) {
    return '';
  }
  return entries.join(', ');
}

export function buildArticleSrcSet(url: string, sizes: number[], cropSquare = true) {
  const uniqueUrls = new Set<string>();
  const entries = sizes
    .map((size) => {
      const sized = getArticleThumbUrl(url, size, cropSquare);
      if (!sized || uniqueUrls.has(sized)) {
        return null;
      }
      uniqueUrls.add(sized);
      return sized ? `${sized} ${size}w` : null;
    })
    .filter((entry): entry is string => Boolean(entry));
  return entries.length > 1 ? entries.join(', ') : '';
}

export function fallbackToOriginalArticleImage(event: SyntheticEvent<HTMLImageElement>, originalUrl: string) {
  const image = event.currentTarget;
  if (!originalUrl || image.dataset.originalFallbackApplied === 'true') {
    return;
  }
  image.dataset.originalFallbackApplied = 'true';
  image.removeAttribute('srcset');
  image.src = originalUrl;
}
