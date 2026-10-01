import {
useCallback,
useEffect,
useMemo,
useState
} from 'react';
import { CarouselImage } from '../articles/model';

export function HomepageCarousel({ images }: { images: CarouselImage[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const getPreviousIndex = useCallback((index: number) => (index - 1 + images.length) % images.length, [images.length]);
  const getNextIndex = useCallback((index: number) => (index + 1) % images.length, [images.length]);

  const visibleIndexes = useMemo(() => {
    if (images.length <= 3) {
      return images.map((_, index) => index);
    }
    return Array.from(new Set([getPreviousIndex(activeIndex), activeIndex, getNextIndex(activeIndex)]));
  }, [activeIndex, getNextIndex, getPreviousIndex, images]);

  useEffect(() => {
    if (images.length <= 1 || isPaused) {
      return;
    }
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => getNextIndex(prev));
    }, 7000);
    return () => window.clearInterval(timer);
  }, [getNextIndex, images.length, isPaused]);

  useEffect(() => {
    if (activeIndex >= images.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, images.length]);

  useEffect(() => {
    if (typeof window === 'undefined' || images.length <= 1) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      [getNextIndex(activeIndex), getPreviousIndex(activeIndex)].forEach((index) => {
        const src = images[index]?.src;
        if (!src) {
          return;
        }
        const image = new Image();
        image.decoding = 'async';
        image.src = src;
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [activeIndex, getNextIndex, getPreviousIndex, images]);

  const handlePrev = () => {
    setActiveIndex((prev) => getPreviousIndex(prev));
  };
  const handleNext = () => {
    setActiveIndex((prev) => getNextIndex(prev));
  };

  const getSlidePositionClass = (index: number) => {
    if (index === activeIndex) {
      return 'is-active';
    }
    if (images.length > 1 && index === getPreviousIndex(activeIndex)) {
      return 'is-before';
    }
    if (images.length > 1 && index === getNextIndex(activeIndex)) {
      return 'is-after';
    }
    return 'is-hidden';
  };

  if (images.length === 0) {
    return null;
  }

  return (
    <section className="homepage-carousel" aria-label="Fotky z akcí SPTO">
      <div
        className="homepage-carousel-frame"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocus={() => setIsPaused(true)}
        onBlur={() => setIsPaused(false)}
      >
        <div className="homepage-carousel-track">
          {visibleIndexes.map((index) => {
            const image = images[index];
            if (!image) {
              return null;
            }
            const isActive = index === activeIndex;
            return (
              <figure key={image.id} className={`homepage-carousel-slide ${getSlidePositionClass(index)}`}>
                <img
                  src={image.src}
                  alt={image.alt}
                  loading={isActive ? 'eager' : 'lazy'}
                  decoding="async"
                  fetchPriority={isActive ? 'high' : 'low'}
                  width={1600}
                  height={900}
                  sizes="(max-width: 900px) 100vw, 1120px"
                />
              </figure>
            );
          })}
        </div>
        {images.length > 1 ? (
          <>
            <button type="button" className="homepage-carousel-arrow prev" onClick={handlePrev} aria-label="Předchozí fotka">
              ‹
            </button>
            <button type="button" className="homepage-carousel-arrow next" onClick={handleNext} aria-label="Další fotka">
              ›
            </button>
          </>
        ) : null}
      </div>
      {images.length > 1 ? (
        <div className="homepage-carousel-dots" role="tablist" aria-label="Vybrat fotku">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              className={`homepage-carousel-dot${index === activeIndex ? ' is-active' : ''}`}
              onClick={() => setActiveIndex(index)}
              aria-label={`Fotka ${index + 1} z ${images.length}`}
              aria-pressed={index === activeIndex}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
