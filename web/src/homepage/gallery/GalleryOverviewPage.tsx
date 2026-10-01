import {
useMemo
} from 'react';
import { SiteShell } from '../layout/SiteShell';
import { GalleryAlbumCard } from './GalleryAlbumCard';
import { GallerySkeletonGrid } from './GallerySkeletonGrid';
import { DriveAlbum } from './model';

export function GalleryOverviewPage({
  albums,
  loading,
  years,
  selectedYear,
  loadingSkeletonCount,
  onSelectYear,
}: {
  albums: DriveAlbum[];
  loading: boolean;
  years: string[];
  selectedYear: string | null;
  loadingSkeletonCount?: number;
  onSelectYear: (year: string) => void;
}) {
  const grouped = useMemo(() => {
    const groups = new Map<string, DriveAlbum[]>();
    albums.forEach((album) => {
      const key = album.year || 'Ostatní';
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(album);
    });
    groups.forEach((items) => items.sort((a, b) => a.title.localeCompare(b.title, 'cs')));
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [albums]);

  return (
    <SiteShell>
      <main className="homepage-main homepage-single gallery-page" aria-labelledby="gallery-heading">
        <h1 id="gallery-heading">Fotogalerie</h1>
        {years.length > 0 ? (
          <div className="gallery-year-tabs" role="tablist" aria-label="Výběr roku fotogalerie">
            {years.map((year) => {
              const isActive = selectedYear === year;
              return (
                <button
                  key={year}
                  type="button"
                  className={`gallery-year-tab${isActive ? ' is-active' : ''}`}
                  onClick={() => onSelectYear(year)}
                  aria-pressed={isActive}
                >
                  {year}
                </button>
              );
            })}
          </div>
        ) : null}
        {loading ? (
          <>
            <p className="homepage-skeleton-status" role="status">
              Načítám alba…
            </p>
            <GallerySkeletonGrid count={loadingSkeletonCount} />
          </>
        ) : null}
        {!loading && albums.length === 0 ? (
          <div className="homepage-card">Zatím nejsou publikovaná žádná alba.</div>
        ) : null}
        {grouped.map(([year, items]) => (
          <section key={year} className="gallery-year-section">
            <div className="gallery-year-header">
              <h2>{year}</h2>
            </div>
            <div className="gallery-album-grid">
              {items.map((album) => (
                <GalleryAlbumCard key={album.slug} album={album} />
              ))}
            </div>
          </section>
        ))}
      </main>
    </SiteShell>
  );
}
