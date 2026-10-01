

export function ArticleSkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="homepage-article-grid homepage-skeleton-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <article key={`article-skeleton-${index}`} className="homepage-article-card homepage-article-card--skeleton">
          <div className="homepage-article-row">
            <div className="homepage-article-thumb homepage-skeleton-block" />
            <div className="homepage-article-body">
              <div className="homepage-article-meta">
                <span className="homepage-skeleton-chip" />
              </div>
              <div className="homepage-skeleton-line homepage-skeleton-line--title" />
              <div className="homepage-skeleton-line homepage-skeleton-line--text" />
              <div className="homepage-skeleton-line homepage-skeleton-line--text short" />
              <div className="homepage-skeleton-line homepage-skeleton-line--link" />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
