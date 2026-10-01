import {
useCallback,
useEffect,
useRef,
useState
} from 'react';
import { GALLERY_PAGE_SIZE } from '../data/pagination';
import { SiteShell } from '../layout/SiteShell';
import { NotFoundPage } from '../pages/NotFoundPage';
import { buildPhotoSrcSet,getPhotoThumbUrl,isDriveImageUrl,toDriveSizedUrl } from '../shared/images';
import { DriveAlbum,GalleryPhoto } from './model';

export function GalleryAlbumPage({
  slug,
  albums,
  loading: albumsLoading,
}: {
  slug: string;
  albums: DriveAlbum[];
  loading: boolean;
}) {
  const [album, setAlbum] = useState<DriveAlbum | null>(() => albums.find((item) => item.slug === slug) ?? null);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const loadingPageRef = useRef(false);

  useEffect(() => {
    const match = albums.find((item) => item.slug === slug) ?? null;
    if (match) {
      setAlbum(match);
    }
  }, [albums, slug]);

  useEffect(() => {
    let active = true;
    if (!album?.folderId) {
      return undefined;
    }
    loadingPageRef.current = false;
    setPhotos([]);
    setNextPageToken(null);
    setLightboxIndex(null);
    setIsLoading(true);
    const params = new URLSearchParams({
      folderId: album.folderId,
      pageSize: String(GALLERY_PAGE_SIZE),
      includeSubfolders: '1',
    });
    fetch(`/api/gallery?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Failed to load album photos.');
        }
        return response.json();
      })
      .then((data) => {
        if (!active) {
          return;
        }
        setPhotos(data.files ?? []);
        setNextPageToken(data.nextPageToken ?? null);
      })
      .catch(() => {
        if (active) {
          setPhotos([]);
          setNextPageToken(null);
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [album?.folderId]);

  const handleLoadMore = useCallback(async () => {
    if (!album?.folderId || !nextPageToken || loadingPageRef.current) {
      return false;
    }
    loadingPageRef.current = true;
    setIsLoading(true);
    const params = new URLSearchParams({
      folderId: album.folderId,
      pageSize: String(GALLERY_PAGE_SIZE),
      pageToken: nextPageToken,
      includeSubfolders: '1',
    });
    try {
      const response = await fetch(`/api/gallery?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to load more photos.');
      }
      const data = await response.json();
      const nextFiles = Array.isArray(data.files) ? (data.files as GalleryPhoto[]) : [];
      setPhotos((prev) => [...prev, ...nextFiles]);
      setNextPageToken(data.nextPageToken ?? null);
      return nextFiles.length > 0;
    } catch (error) {
      console.error('Failed to load more gallery photos', error);
      return false;
    } finally {
      loadingPageRef.current = false;
      setIsLoading(false);
    }
  }, [album?.folderId, nextPageToken]);

  const activePhoto = lightboxIndex !== null ? photos[lightboxIndex] : null;
  const isFirstPhoto = lightboxIndex === 0;
  const isAtLoadedEnd = lightboxIndex !== null && lightboxIndex >= photos.length - 1;
  const canGoNext = lightboxIndex !== null && (lightboxIndex < photos.length - 1 || Boolean(nextPageToken));
  const getLightboxUrl = (photo?: GalleryPhoto | null) => {
    if (!photo) {
      return '';
    }
    if (photo.fullImageUrl) {
      return photo.fullImageUrl;
    }
    if (photo.thumbnailLink) {
      return isDriveImageUrl(photo.thumbnailLink) ? toDriveSizedUrl(photo.thumbnailLink, 1800) : photo.thumbnailLink;
    }
    return photo.webContentLink ?? '';
  };
  const activePhotoUrl = getLightboxUrl(activePhoto);

  const handlePreviousPhoto = useCallback(() => {
    setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
  }, []);

  const handleNextPhoto = useCallback(async () => {
    if (lightboxIndex === null) {
      return;
    }
    if (lightboxIndex < photos.length - 1) {
      setLightboxIndex(lightboxIndex + 1);
      return;
    }
    if (!nextPageToken) {
      return;
    }
    const loaded = await handleLoadMore();
    if (loaded) {
      setLightboxIndex((prev) => (prev !== null ? prev + 1 : prev));
    }
  }, [handleLoadMore, lightboxIndex, nextPageToken, photos.length]);

  useEffect(() => {
    if (lightboxIndex === null) {
      return;
    }
    const preload = (index: number) => {
      const photo = photos[index];
      if (!photo) {
        return;
      }
      const url = getLightboxUrl(photo);
      if (!url) {
        return;
      }
      const image = new Image();
      image.src = url;
    };
    preload(lightboxIndex + 1);
    preload(lightboxIndex - 1);
  }, [lightboxIndex, photos]);

  useEffect(() => {
    if (lightboxIndex === null || !nextPageToken || isLoading) {
      return;
    }
    if (photos.length - lightboxIndex <= 4) {
      void handleLoadMore();
    }
  }, [handleLoadMore, isLoading, lightboxIndex, nextPageToken, photos.length]);

  useEffect(() => {
    if (lightboxIndex === null) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setLightboxIndex(null);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        handlePreviousPhoto();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        void handleNextPhoto();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleNextPhoto, handlePreviousPhoto, lightboxIndex]);

  if (!album) {
    if (albumsLoading) {
      return (
        <SiteShell>
          <main className="homepage-main homepage-single">
            <div className="homepage-card">Načítám album…</div>
          </main>
        </SiteShell>
      );
    }
    return <NotFoundPage />;
  }

  return (
    <SiteShell>
      <main className="homepage-main homepage-single gallery-page" aria-labelledby="album-heading">
        <h1 id="album-heading">{album.title}</h1>
        <p className="homepage-lead">
          {album.year}
        </p>
        <div className="gallery-photo-grid">
          {photos.map((photo, index) => {
            const thumbUrl = getPhotoThumbUrl(photo, 480);
            const thumbSrcSet = buildPhotoSrcSet(photo, [240, 360, 480, 640]);
            return (
              <button
                key={photo.fileId}
                type="button"
                className="gallery-photo-thumb"
                onClick={() => setLightboxIndex(index)}
              >
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    srcSet={thumbSrcSet || undefined}
                    alt={photo.name}
                    loading={index < 6 ? 'eager' : 'lazy'}
                    decoding="async"
                    sizes="(max-width: 600px) 45vw, (max-width: 900px) 30vw, 220px"
                    width={480}
                    height={360}
                    fetchPriority={index < 4 ? 'high' : 'auto'}
                  />
                ) : (
                  <span>{photo.name}</span>
                )}
              </button>
            );
          })}
        </div>
        {!isLoading && photos.length === 0 ? <div className="gallery-loading">Zatím zde nejsou žádné fotky.</div> : null}
        {isLoading ? <div className="gallery-loading">Načítám fotky…</div> : null}
        {nextPageToken ? (
          <button type="button" className="homepage-cta secondary gallery-load-more" onClick={handleLoadMore} disabled={isLoading}>
            Načíst další fotky
          </button>
        ) : null}
        <a className="homepage-back-link homepage-back-link--inline" href="/fotogalerie">
          Zpět na fotogalerii
        </a>
      </main>
      {activePhoto ? (
        <div className="gallery-lightbox" role="dialog" aria-modal="true">
          <button type="button" className="gallery-lightbox-close" onClick={() => setLightboxIndex(null)}>
            ✕
          </button>
          <button
            type="button"
            className="gallery-lightbox-nav prev"
            onClick={handlePreviousPhoto}
            aria-label="Předchozí fotka"
            disabled={isFirstPhoto}
          >
            ‹
          </button>
          <figure>
            <img
              src={activePhotoUrl}
              alt={activePhoto.name}
              loading="eager"
              decoding="async"
            />
            <figcaption>{activePhoto.name}</figcaption>
          </figure>
          <button
            type="button"
            className="gallery-lightbox-nav next"
            onClick={() => void handleNextPhoto()}
            aria-label="Další fotka"
            disabled={!canGoNext || (isAtLoadedEnd && isLoading)}
          >
            ›
          </button>
        </div>
      ) : null}
    </SiteShell>
  );
}
