

export const CAROUSEL_IMAGE_SOURCES = Object.entries(
  import.meta.glob('../../assets/homepage-carousel/*.{jpg,jpeg,png,webp}', {
    eager: true,
    import: 'default',
  }),
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, src]) => src as string);
