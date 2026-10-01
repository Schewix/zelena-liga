import { PortableText } from '@portabletext/react';
import { SiteShell } from '../layout/SiteShell';
import { buildArticleSrcSet,fallbackToOriginalArticleImage,getArticleThumbUrl } from '../shared/images';
import { Article,extractArticlePhotos } from './model';
import { portableTextComponents } from './portableText';

export function ArticlePage({ article }: { article: Article }) {
  const isPortableText = Array.isArray(article.body) && typeof article.body[0] === 'object';
  const isHtmlBody =
    article.bodyFormat === 'html' ||
    (typeof article.body === 'string' && article.body.trim().startsWith('<'));
  const htmlBody = isHtmlBody && typeof article.body === 'string' ? article.body : null;
  const extracted = htmlBody ? extractArticlePhotos(htmlBody) : null;
  const articleHtml = extracted?.html ?? htmlBody;
  const sidePhotos = extracted?.photos ?? [];
  const coverImage = article.coverImage?.url
    ? { src: article.coverImage.url, alt: article.coverImage.alt ?? article.title }
    : null;
  const mediaItems = [
    ...(coverImage ? [coverImage] : []),
    ...sidePhotos.filter((photo) => photo.src !== coverImage?.src),
  ];
  const hasMedia = mediaItems.length > 0;
  const textParagraphs =
    typeof article.body === 'string' && !isHtmlBody
      ? article.body
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
      : [];
  return (
    <SiteShell>
      <main className="homepage-main homepage-single" aria-labelledby="article-heading">
        <h1 id="article-heading">{article.title}</h1>
        <div className={`homepage-card${hasMedia ? ' homepage-article-layout' : ''}`}>
          <div className="homepage-article-text">
            {isPortableText ? (
              <PortableText value={article.body as any[]} components={portableTextComponents} />
            ) : articleHtml ? (
              <div className="homepage-article-html" dangerouslySetInnerHTML={{ __html: articleHtml }} />
            ) : textParagraphs.length > 0 ? (
              textParagraphs.map((paragraph, index) => <p key={`${article.href}-${index}`}>{paragraph}</p>)
            ) : Array.isArray(article.body) ? (
              (article.body as string[]).map((paragraph, index) => (
                <p key={`${article.href}-${index}`}>{paragraph}</p>
              ))
            ) : null}
            {article.author ? <p style={{ marginTop: '24px', fontWeight: 600 }}>{article.author}</p> : null}
          </div>
          {hasMedia ? (
            <aside className="homepage-article-photos" aria-label="Fotografie k článku">
              {mediaItems.map((photo, index) => {
                const isCover = index === 0 && Boolean(coverImage);
                const isPriorityImage = index === 0;
                const imageSize = isCover ? 960 : 720;
                const src = getArticleThumbUrl(photo.src, imageSize, false) || photo.src;
                const srcSet = buildArticleSrcSet(
                  photo.src,
                  isCover ? [480, 720, 960, 1200] : [320, 480, 720, 960],
                  false,
                );
                return (
                  <img
                    key={`${article.href}-photo-${index}`}
                    className={isCover ? 'homepage-article-cover' : undefined}
                    src={src}
                    srcSet={srcSet || undefined}
                    sizes="(max-width: 900px) 100vw, 38vw"
                    alt={photo.alt}
                    loading={isPriorityImage ? 'eager' : 'lazy'}
                    decoding="async"
                    fetchPriority={isPriorityImage ? 'high' : 'low'}
                    onError={(event) => fallbackToOriginalArticleImage(event, photo.src)}
                  />
                );
              })}
            </aside>
          ) : null}
        </div>
        <a className="homepage-back-link" href="/clanky">
          Zpět na seznam článků
        </a>
      </main>
    </SiteShell>
  );
}
