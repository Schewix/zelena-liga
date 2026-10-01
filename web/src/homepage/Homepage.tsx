import {
  useEffect,
  useState
} from 'react';
import { fetchContentArticles } from '../data/content';
import { fetchHomepage, hasSanityConfig, type SanityHomepage } from '../data/sanity';
import { fetchAlbumPreview } from '../utils/galleryCache';
import { ArticlePageLoader } from './articles/ArticlePageLoader';
import { ArticlesIndexPage } from './articles/ArticlesIndexPage';
import { Article, mapContentArticle } from './articles/model';
import { ARTICLES_PAGE_SIZE, HOMEPAGE_ARTICLE_LIMIT } from './data/pagination';
import { RedakcePage } from './editorial/RedakcePage';
import { GalleryAlbumPage } from './gallery/GalleryAlbumPage';
import { GalleryOverviewPage } from './gallery/GalleryOverviewPage';
import { DriveAlbum } from './gallery/model';
import './Homepage.css';
import { LeagueStandingsPage } from './league/LeagueStandingsPage';
import { LeagueData, createDefaultLeagueData, getActiveLeagueSeason, normalizeLeagueData } from './league/model';
import { AboutSptoPage } from './pages/AboutSptoPage';
import { ApplicationsPage } from './pages/ApplicationsPage';
import { CompetitionRulesPage } from './pages/CompetitionRulesPage';
import { CompetitionsPage } from './pages/CompetitionsPage';
import { CommunityPage } from './pages/CommunityPage';
import { ContactsPage } from './pages/ContactsPage';
import { HOMEPAGE_GALLERY_PREFETCH_DELAY_MS, HOMEPAGE_GALLERY_PREFETCH_LIMIT, Homepage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SponsorsPage } from './pages/SponsorsPage';
import { SchedulePage } from './schedule/SchedulePage';
import { TROOPS } from './troops/model';
import { TroopDetailPage, TroopsPage } from './troops/pages';

export default function ZelenaligaSite() {
  const [homepageContent, setHomepageContent] = useState<SanityHomepage | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [articlesHasMore, setArticlesHasMore] = useState(false);
  const [articlesLoadingMore, setArticlesLoadingMore] = useState(false);
  const [leagueData, setLeagueData] = useState<LeagueData>(createDefaultLeagueData());
  const [driveAlbums, setDriveAlbums] = useState<DriveAlbum[]>([]);
  const [galleryYears, setGalleryYears] = useState<string[]>([]);
  const [galleryAlbumCountsByYear, setGalleryAlbumCountsByYear] = useState<Record<string, number>>({});
  const [selectedGalleryYear, setSelectedGalleryYear] = useState<string | null>(null);
  const [driveAlbumsLoading, setDriveAlbumsLoading] = useState(false);
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const segments = path.split('/').filter(Boolean);
  const slug = segments[0] ?? '';
  const shouldLoadArticles = path === '/' || path === '/clanky';
  const shouldLoadLeague = path === '/' || slug === 'aktualni-poradi' || slug === 'zelena-liga';
  const shouldLoadGallery = slug === 'fotogalerie';
  const isGalleryOverviewRoute = shouldLoadGallery && segments.length === 1;

  useEffect(() => {
    if (!hasSanityConfig()) {
      return;
    }
    let active = true;
    fetchHomepage()
      .then((homepageData) => {
        if (!active) {
          return;
        }
        setHomepageContent(homepageData);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!shouldLoadArticles) {
      setArticles([]);
      setArticlesHasMore(false);
      setArticlesLoading(false);
      return;
    }
    let active = true;
    const limit = path === '/' ? HOMEPAGE_ARTICLE_LIMIT : ARTICLES_PAGE_SIZE;
    setArticles([]);
    setArticlesHasMore(false);
    setArticlesLoading(true);
    fetchContentArticles({ limit })
      .then((pageData) => {
        if (!active) {
          return;
        }
        setArticles(pageData.articles.map(mapContentArticle));
        setArticlesHasMore(path === '/clanky' && pageData.hasMore);
      })
      .catch(() => {
        if (active) {
          setArticles([]);
          setArticlesHasMore(false);
        }
      })
      .finally(() => {
        if (active) {
          setArticlesLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [path, shouldLoadArticles]);

  const handleLoadMoreArticles = () => {
    if (path !== '/clanky' || articlesLoading || articlesLoadingMore || !articlesHasMore) {
      return;
    }
    setArticlesLoadingMore(true);
    fetchContentArticles({ limit: ARTICLES_PAGE_SIZE, offset: articles.length })
      .then((pageData) => {
        setArticles((current) => {
          const existingHrefs = new Set(current.map((article) => article.href));
          const nextArticles = pageData.articles
            .map(mapContentArticle)
            .filter((article) => !existingHrefs.has(article.href));
          return [...current, ...nextArticles];
        });
        setArticlesHasMore(pageData.hasMore);
      })
      .catch(() => {
        // Keep the button available so the visitor can retry the same page.
      })
      .finally(() => {
        setArticlesLoadingMore(false);
      });
  };

  useEffect(() => {
    if (!shouldLoadLeague) {
      return;
    }
    let active = true;
    fetch('/api/content/league')
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        if (!active) {
          return;
        }
        setLeagueData(normalizeLeagueData(data));
      })
      .catch(() => {
        if (active) {
          setLeagueData(createDefaultLeagueData());
        }
      });
    return () => {
      active = false;
    };
  }, [shouldLoadLeague]);

  useEffect(() => {
    if (!isGalleryOverviewRoute) {
      setGalleryYears([]);
      setGalleryAlbumCountsByYear({});
      setSelectedGalleryYear(null);
      return;
    }
    let active = true;
    setDriveAlbumsLoading(true);
    fetch('/api/gallery?years=1')
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        if (!active) {
          return;
        }
        const albumCountsByYear: Record<string, number> = {};
        if (data.albumCountsByYear && typeof data.albumCountsByYear === 'object' && !Array.isArray(data.albumCountsByYear)) {
          Object.entries(data.albumCountsByYear as Record<string, unknown>).forEach(([yearKey, value]) => {
            const parsed = Number(value);
            if (yearKey.trim().length === 0 || !Number.isFinite(parsed) || parsed < 0) {
              return;
            }
            albumCountsByYear[yearKey] = Math.round(parsed);
          });
        }
        const years = Array.isArray(data.years)
          ? data.years.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
          : [];
        setGalleryAlbumCountsByYear(albumCountsByYear);
        setGalleryYears(years);
        setSelectedGalleryYear((current) => (current && years.includes(current) ? current : years[0] ?? null));
        if (years.length === 0) {
          setDriveAlbums([]);
          setDriveAlbumsLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setGalleryYears([]);
          setGalleryAlbumCountsByYear({});
          setSelectedGalleryYear(null);
          setDriveAlbums([]);
          setDriveAlbumsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [isGalleryOverviewRoute]);

  useEffect(() => {
    if (!shouldLoadGallery) {
      setDriveAlbumsLoading(false);
      return;
    }
    const endpoint = isGalleryOverviewRoute
      ? selectedGalleryYear
        ? `/api/gallery?year=${encodeURIComponent(selectedGalleryYear)}`
        : ''
      : '/api/gallery';
    if (!endpoint) {
      setDriveAlbums([]);
      return;
    }
    let active = true;
    setDriveAlbumsLoading(true);
    fetch(endpoint)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Failed to load albums.');
        }
        return response.json();
      })
      .then((data) => {
        if (active) {
          const albums = data.albums ?? [];
          setDriveAlbums(albums);
          if (isGalleryOverviewRoute && selectedGalleryYear) {
            setGalleryAlbumCountsByYear((current) => {
              if (current[selectedGalleryYear] === albums.length) {
                return current;
              }
              return {
                ...current,
                [selectedGalleryYear]: albums.length,
              };
            });
          }
          // Data will be loaded on-demand when user navigates to gallery
          // Cache keeps data in memory for 5 minutes (see galleryCache.ts)
        }
      })
      .catch(() => {
        if (active) {
          setDriveAlbums([]);
        }
      })
      .finally(() => {
        if (active) {
          setDriveAlbumsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [isGalleryOverviewRoute, selectedGalleryYear, shouldLoadGallery]);

  useEffect(() => {
    if (path !== '/') {
      return;
    }
    let active = true;
    const prefetchTimers: number[] = [];
    let startTimer: number | null = null;
    let idleCallbackId: number | null = null;
    const browserWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const startPrefetch = () => {
      fetch(`/api/gallery?limit=${HOMEPAGE_GALLERY_PREFETCH_LIMIT}`)
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((data) => {
          if (!active) {
            return;
          }
          const albums = Array.isArray(data.albums) ? (data.albums as DriveAlbum[]) : [];
          albums
            .slice(0, HOMEPAGE_GALLERY_PREFETCH_LIMIT)
            .forEach((album, index) => {
              if (!album?.folderId) {
                return;
              }
              const timer = window.setTimeout(() => {
                if (!active) {
                  return;
                }
                fetchAlbumPreview(album.folderId).catch(() => undefined);
              }, index * HOMEPAGE_GALLERY_PREFETCH_DELAY_MS);
              prefetchTimers.push(timer);
            });
        })
        .catch(() => undefined);
    };

    const schedulePrefetchAfterLoad = () => {
      if (!active) {
        return;
      }
      if (browserWindow.requestIdleCallback) {
        idleCallbackId = browserWindow.requestIdleCallback(() => {
          startTimer = window.setTimeout(startPrefetch, 200);
        }, { timeout: 2000 });
        return;
      }
      startTimer = window.setTimeout(startPrefetch, 400);
    };

    if (document.readyState === 'complete') {
      schedulePrefetchAfterLoad();
    } else {
      window.addEventListener('load', schedulePrefetchAfterLoad, { once: true });
    }

    return () => {
      active = false;
      window.removeEventListener('load', schedulePrefetchAfterLoad);
      if (startTimer !== null) {
        window.clearTimeout(startTimer);
      }
      if (idleCallbackId !== null && browserWindow.cancelIdleCallback) {
        browserWindow.cancelIdleCallback(idleCallbackId);
      }
      prefetchTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [path]);

  if (path === '/') {
    return (
      <Homepage
        homepageContent={homepageContent}
        articles={articles}
        articlesLoading={articlesLoading}
        leagueSeason={getActiveLeagueSeason(leagueData)}
      />
    );
  }

  if (segments.length > 0) {
    const slug = segments[0];
    if (slug === 'redakce') {
      return <RedakcePage />;
    }
    if (slug === 'plan-akci' && segments.length === 1) {
      return <SchedulePage />;
    }
    if (slug === 'souteze') {
      if (segments.length > 1) {
        return <CompetitionRulesPage slug={segments[1]} />;
      }
      return <CompetitionsPage />;
    }

    if (slug === 'aktualni-poradi' || slug === 'zelena-liga') {
      return <LeagueStandingsPage leagueData={leagueData} />;
    }

    if (slug === 'aplikace') {
      return <ApplicationsPage />;
    }

    if (slug === 'oddily') {
      if (segments.length > 1) {
        const troopSlug = segments[1];
        const troop = TROOPS.find((item) => item.href.split('/').pop() === troopSlug);
        if (!troop) {
          return <NotFoundPage />;
        }
        return <TroopDetailPage troop={troop} />;
      }
      return <TroopsPage />;
    }

    if (slug === 'clanky') {
      if (segments.length > 1) {
        const articleSlug = segments[1];
        return <ArticlePageLoader slug={articleSlug} />;
      }
      return (
        <ArticlesIndexPage
          articles={articles}
          articlesLoading={articlesLoading}
          hasMore={articlesHasMore}
          loadingMore={articlesLoadingMore}
          onLoadMore={handleLoadMoreArticles}
        />
      );
    }

    if (slug === 'fotogalerie') {
      if (segments.length > 1) {
        const albumSlug = segments[segments.length - 1];
        return <GalleryAlbumPage slug={albumSlug} albums={driveAlbums} loading={driveAlbumsLoading} />;
      }
      return (
        <GalleryOverviewPage
          albums={driveAlbums}
          loading={driveAlbumsLoading}
          years={galleryYears}
          selectedYear={selectedGalleryYear}
          loadingSkeletonCount={selectedGalleryYear ? galleryAlbumCountsByYear[selectedGalleryYear] : undefined}
          onSelectYear={setSelectedGalleryYear}
        />
      );
    }

    if (slug === 'o-spto' || slug === 'historie') {
      return <AboutSptoPage />;
    }

    if (slug === 'tipy' && segments.length === 1) {
      return <CommunityPage />;
    }

    if (slug === 'kontakty') {
      return <ContactsPage />;
    }

    if (slug === 'sponzori') {
      return <SponsorsPage />;
    }

  }

  return <NotFoundPage />;
}
