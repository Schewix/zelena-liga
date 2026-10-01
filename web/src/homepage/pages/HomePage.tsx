import { PortableText } from '@portabletext/react';
import { type SanityHomepage } from '../../data/sanity';
import { ArticleSkeletonGrid } from '../articles/ArticleSkeletonGrid';
import { Article } from '../articles/model';
import { portableTextComponents } from '../articles/portableText';
import { HEADER_LEAD,SPTO_HISTORY_HIGHLIGHTS } from '../data/about';
import { HOMEPAGE_ARTICLE_LIMIT } from '../data/pagination';
import { HOMEPAGE_CAROUSEL } from '../documents/model';
import { SiteShell } from '../layout/SiteShell';
import { LEAGUE_TOP_COUNT,LeagueSeason,addCompetitionRanks,buildLeagueRows,formatLeagueScore } from '../league/model';
import { buildArticleSrcSet,fallbackToOriginalArticleImage,getArticleThumbUrl } from '../shared/images';
import { HomepageCarousel } from './HomepageCarousel';

export const HOMEPAGE_GALLERY_PREFETCH_LIMIT = 3;

export const HOMEPAGE_GALLERY_PREFETCH_DELAY_MS = 900;

export function Homepage({
  homepageContent,
  articles,
  articlesLoading,
  leagueSeason,
}: {
  homepageContent: SanityHomepage | null;
  articles: Article[];
  articlesLoading: boolean;
  leagueSeason: LeagueSeason;
}) {
  const headerTitle = homepageContent?.heroTitle ?? undefined;
  const headerSubtitle = homepageContent?.heroSubtitle ?? undefined;
  const headerLead = HEADER_LEAD;
  const homepageArticles = articles.slice(0, HOMEPAGE_ARTICLE_LIMIT);

  return (
    <SiteShell
      headerTitle={headerTitle ?? undefined}
      headerSubtitle={headerSubtitle ?? undefined}
      headerLead={headerLead}
    >
      <main className="homepage-main" aria-labelledby="homepage-intro-heading">
        <HomepageCarousel images={HOMEPAGE_CAROUSEL} />
        <section className="homepage-section" aria-labelledby="homepage-intro-heading">
          <div className="homepage-section-header homepage-section-header--left">
            <h2 id="homepage-intro-heading">O SPTO a Zelené lize</h2>
            <span className="homepage-section-accent" aria-hidden="true" />
          </div>
          <div className="homepage-card" style={{ maxWidth: '920px', boxShadow: 'none' }}>
            {homepageContent?.intro?.length ? (
              <PortableText value={homepageContent.intro} components={portableTextComponents} />
            ) : (
              <>
                <p>
                  SPTO sdružuje pionýrské tábornické oddíly (PTO), které vedou děti a mladé k pobytu v přírodě,
                  spolupráci a dobrodružství. Pravidelné schůzky, víkendové výpravy i letní tábory jsou otevřené všem,
                  kdo chtějí zažít táborový život naplno.
                </p>
                <p style={{ marginTop: '12px' }}>
                  Zelená liga je celoroční soutěžní rámec SPTO. Skládá se z několika závodů během roku
                  (například Setonův závod) a soutěžící jsou rozděleni do věkových kategorií.
                </p>
              </>
            )}
          </div>
        </section>

        <section className="homepage-section" id="clanky" aria-labelledby="clanky-heading">
          <div className="homepage-section-header homepage-section-header--left">
            <h2 id="clanky-heading">Články a novinky</h2>
            <span className="homepage-section-accent" aria-hidden="true" />
          </div>
          {articlesLoading ? (
            <>
              <p className="homepage-skeleton-status" role="status">
                Načítám články z redakce…
              </p>
              <ArticleSkeletonGrid count={HOMEPAGE_ARTICLE_LIMIT} />
            </>
          ) : homepageArticles.length > 0 ? (
            <div className="homepage-article-grid homepage-article-grid--homepage">
              {homepageArticles.map((article, index) => {
                const isPriorityImage = index < 2;
                const coverUrl = article.coverImage?.url
                  ? getArticleThumbUrl(article.coverImage.url, 360)
                  : '';
                const coverSrcSet = article.coverImage?.url
                  ? buildArticleSrcSet(article.coverImage.url, [180, 240, 360, 480])
                  : '';
                const excerpt = article.excerpt.trim();
                return (
                  <article key={article.title} className="homepage-article-card homepage-article-card--homepage">
                    <div className="homepage-article-row">
                      <div className={`homepage-article-thumb${article.coverImage?.url ? '' : ' is-empty'}`}>
                        {article.coverImage?.url ? (
                          <img
                            src={coverUrl}
                            srcSet={coverSrcSet || undefined}
                            sizes="(max-width: 680px) calc(100vw - 72px), (max-width: 1180px) 128px, 260px"
                            width={320}
                            height={200}
                            alt={article.coverImage.alt ?? article.title}
                            loading="lazy"
                            decoding="async"
                            fetchPriority={isPriorityImage ? 'auto' : 'low'}
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
                          <p className="homepage-article-excerpt homepage-article-excerpt--short">
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
          ) : (
            <div className="homepage-card" style={{ maxWidth: '720px' }}>
              <p style={{ margin: 0 }}>Zatím tu není žádný článek z redakce.</p>
            </div>
          )}
          <div className="homepage-section-cta">
            <a className="homepage-cta secondary" href="/clanky">
              Všechny články
            </a>
          </div>
        </section>

        <section className="homepage-section" id="zelenaliga" aria-labelledby="zelenaliga-heading">
          <div className="homepage-section-header homepage-section-header--left">
            <h2 id="zelenaliga-heading">Aktuální pořadí</h2>
            <span className="homepage-section-accent" aria-hidden="true" />
          </div>
          <div className="homepage-card" style={{ maxWidth: '880px' }}>
            <h3>Top {LEAGUE_TOP_COUNT} oddílů</h3>
            <p className="homepage-league-note">{leagueSeason.name}</p>
            <ol className="homepage-about-list">
              {addCompetitionRanks(buildLeagueRows(leagueSeason.scores, leagueSeason.troops, leagueSeason.events))
                .slice(0, LEAGUE_TOP_COUNT)
                .map((row) => (
                  <li
                    key={row.key} // Added padding and bottom border for better readability
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '32px 2fr 1fr',
                      gap: '16px',
                      alignItems: 'center',
                      padding: '12px 0',
                      borderBottom: '1px solid rgba(4, 55, 44, 0.1)',
                    }}
                  >
                    <span style={{ textAlign: 'right', fontSize: '1.1rem' }}>{row.rank}.</span>
                    <strong style={{ fontSize: '1.1rem' }}>{row.name}</strong>
                    <span
                      style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0b8e3f', justifySelf: 'end' }}
                    >
                      {row.total === null ? '— bodů' : `${formatLeagueScore(row.total)} bodů`}
                    </span>
                  </li>
                ))}
            </ol>
          </div>
          <div className="homepage-section-cta">
            <a className="homepage-cta secondary" href="/aktualni-poradi">
              Zobrazit celé pořadí
            </a>
          </div>
        </section>

        <section className="homepage-section" id="o-spto" aria-labelledby="o-spto-heading">
          <div className="homepage-section-header homepage-section-header--left">
            <h2 id="o-spto-heading">Z historie</h2>
            <span className="homepage-section-accent" aria-hidden="true" />
          </div>
          <div className="homepage-card" style={{ maxWidth: '880px' }}>
            <ul className="homepage-about-list">
              {SPTO_HISTORY_HIGHLIGHTS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="homepage-section-cta">
            <a className="homepage-cta secondary" href="/o-spto">
              Více o SPTO
            </a>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
