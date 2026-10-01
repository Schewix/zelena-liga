

export type DriveAlbum = {
  id: string;
  title: string;
  baseTitle?: string;
  year: string;
  slug: string;
  folderId: string;
};

export type GalleryPhoto = {
  fileId: string;
  name: string;
  thumbnailLink: string | null;
  fullImageUrl: string | null;
  webContentLink: string | null;
};

export type GalleryPhotoLike = {
  name: string;
  thumbnailLink?: string | null;
  fullImageUrl?: string | null;
  webContentLink?: string | null;
};
