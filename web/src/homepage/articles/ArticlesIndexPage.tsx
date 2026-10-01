import { ARTICLES_PAGE_SIZE } from '../data/pagination';
import { SiteShell } from '../layout/SiteShell';
import { buildArticleSrcSet,fallbackToOriginalArticleImage,getArticleThumbUrl } from '../shared/images';
import { ArticleSkeletonGrid } from './ArticleSkeletonGrid';
import { Article } from './model';

export function ArticlesIndexPage({
  articles,
  articlesLoading,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  articles: Article[];
  articlesLoading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <SiteShell>
      <main className="homepage-main homepage-single articles-page" aria-labelledby="articles-heading">
        <section className="homepage-section" aria-labelledby="articles-heading">
          <div className="homepage-section-header homepage-section-header--left">
            <h1 id="articles-heading">Články a novinky</h1>
            <span className="homepage-section-accent" aria-hidden="true" />
          </div>
          {articlesLoading ? (
            <>
              <p className="homepage-skeleton-status" role="status">
                Načítám články z redakce…
              </p>
              <ArticleSkeletonGrid count={ARTICLES_PAGE_SIZE} />
            </>
          ) : articles.length > 0 ? (
            <>
              <div className="homepage-article-grid homepage-article-grid--index">
                {articles.map((article, index) => {
                  const isPriorityImage = index === 0;
                  const coverUrl = article.coverImage?.url ? getArticleThumbUrl(article.coverImage.url, 360) : '';
                  const coverSrcSet = article.coverImage?.url
                    ? buildArticleSrcSet(article.coverImage.url, [180, 240, 360, 480])
                    : '';
                  const excerpt = article.excerpt.trim();
                  return (
                    <article key={article.href} className="homepage-article-card">
                      <div className="homepage-article-row">
                        <div className={`homepage-article-thumb${article.coverImage?.url ? '' : ' is-empty'}`}>
                          {article.coverImage?.url ? (
                            <img
                              src={coverUrl}
                              srcSet={coverSrcSet || undefined}
                              sizes="(max-width: 360px) 84px, (max-width: 680px) 96px, 150px"
                              width={150}
                              height={140}
                              alt={article.coverImage.alt ?? article.title}
                              loading={isPriorityImage ? 'eager' : 'lazy'}
                              decoding="async"
                              fetchPriority={isPriorityImage ? 'high' : 'low'}
                              onError={(event) =>
                                fallbackToOriginalArticleImage(event, article.coverImage?.url ?? '')
                              }
                            />
                          ) : (
                            <span aria-hidden="true">SPTO</span>
                          )}
                        </div>
                        <div className="homepage-article-body">
                          <div className="homepage-article-meta">
                            <time className="homepage-article-date" dateTime={article.dateISO}>
                              {article.dateLabel}
                            </time>
                          </div>
                          <h3 className="homepage-article-title">
                            {article.title}
                          </h3>
                          {excerpt ? (
                            <p className="homepage-article-excerpt">
                              {excerpt}
                            </p>
                          ) : null}
                          <a className="homepage-inline-link homepage-article-read-link" href={article.href}>
                            Číst článek <span aria-hidden="true">→</span>
                          </a>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              {hasMore ? (
                <button
                  type="button"
                  className="homepage-cta secondary articles-load-more"
                  onClick={onLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Načítám další články…' : 'Načíst další články'}
                </button>
              ) : null}
            </>
          ) : (
            <div className="homepage-card">
              <p style={{ margin: 0 }}>Zatím tu není žádný článek z redakce.</p>
            </div>
          )}
        </section>
      </main>
    </SiteShell>
  );
}
