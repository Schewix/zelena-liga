import {
useEffect,
useState
} from 'react';
import { fetchAlbumPreview,type GalleryPreview as CachedGalleryPreview } from '../../utils/galleryCache';
import { buildPhotoSrcSet,getPhotoThumbUrl } from '../shared/images';
import { DriveAlbum } from './model';

export function GalleryAlbumCard({ album }: { album: DriveAlbum }) {
  const [preview, setPreview] = useState<CachedGalleryPreview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!album.folderId) {
      return undefined;
    }
    setLoading(true);
    fetchAlbumPreview(album.folderId)
      .then((data) => {
        if (active) {
          setPreview(data);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [album.folderId]);

  const coverPhoto = preview?.files?.find((file) => file.thumbnailLink || file.fullImageUrl || file.webContentLink) ?? null;
  const coverUrl = getPhotoThumbUrl(coverPhoto ?? undefined, 720) || null;
  const coverSrcSet = coverPhoto ? buildPhotoSrcSet(coverPhoto, [360, 540, 720, 960]) : '';
  const previewPhotos = preview?.files ?? [];

  return (
    <a className="gallery-album-card" href={`/fotogalerie/${album.slug}`}>
      <div className="gallery-album-cover">
        {coverUrl ? (
          <img
            src={coverUrl}
            srcSet={coverSrcSet || undefined}
            sizes="(max-width: 700px) 90vw, (max-width: 1100px) 45vw, 320px"
            width={960}
            height={540}
            alt={album.title}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="gallery-album-cover-placeholder" />
        )}
        <span className="gallery-album-date">{album.year}</span>
      </div>
      <div className="gallery-album-body">
        <div>
          <h3>{album.title}</h3>
          <p>{album.year}</p>
        </div>
        <p className="gallery-album-count">
          {loading
            ? 'Načítám…'
            : preview?.totalCount !== null && preview?.totalCount !== undefined
              ? `${preview.totalCount} fotek`
              : 'Fotky se načítají'}
        </p>
      </div>
      <div className="gallery-album-thumbs">
        {previewPhotos.length > 0 ? (
          previewPhotos.slice(0, 4).map((photo) => {
            const thumbUrl = getPhotoThumbUrl(photo, 240);
            const thumbSrcSet = buildPhotoSrcSet(photo, [120, 180, 240, 360]);
            return thumbUrl ? (
              <img
                key={photo.fileId}
                src={thumbUrl}
                srcSet={thumbSrcSet || undefined}
                sizes="(max-width: 700px) 20vw, 72px"
                width={120}
                height={120}
                alt={photo.name}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
              />
            ) : null;
          })
        ) : (
          <div className="gallery-album-thumbs-placeholder">Náhledy se připravují</div>
        )}
      </div>
    </a>
  );
}
