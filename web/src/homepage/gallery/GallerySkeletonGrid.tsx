

export function GallerySkeletonGrid({ count = 8 }: { count?: number }) {
  const normalizedCount = Number.isFinite(count) ? Math.max(1, Math.round(count)) : 8;
  return (
    <section className="gallery-year-section gallery-year-section--skeleton">
      <div className="gallery-year-header" aria-hidden="true">
        <div className="homepage-skeleton-line homepage-skeleton-line--year" />
      </div>
      <div className="gallery-album-grid homepage-skeleton-grid" aria-hidden="true">
        {Array.from({ length: normalizedCount }).map((_, index) => (
          <div key={`gallery-skeleton-${index}`} className="gallery-album-card gallery-album-card--skeleton">
            <div className="gallery-album-cover homepage-skeleton-block" />
            <div className="gallery-album-body">
              <div className="homepage-skeleton-line homepage-skeleton-line--album-title" />
              <div className="homepage-skeleton-line homepage-skeleton-line--album-count" />
            </div>
            <div className="gallery-album-thumbs">
              <div className="homepage-skeleton-block gallery-skeleton-thumb" />
              <div className="homepage-skeleton-block gallery-skeleton-thumb" />
              <div className="homepage-skeleton-block gallery-skeleton-thumb" />
              <div className="homepage-skeleton-block gallery-skeleton-thumb" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
