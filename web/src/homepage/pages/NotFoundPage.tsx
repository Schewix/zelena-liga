import { NAV_ITEMS } from '../layout/navigation';
import { SiteShell } from '../layout/SiteShell';

// Gallery cache helpers are imported from utils/galleryCache.ts
// fetchAlbumPreview() is used by GalleryAlbumCard components

// Nejčastější cíle, kam se z neexistující adresy dá odskočit. Domů je zvlášť jako hlavní tlačítko.
export const NOT_FOUND_LINKS = NAV_ITEMS.filter((item) => item.href !== '/');

export function NotFoundPage() {
  const attemptedPath = typeof window === 'undefined' ? '' : window.location.pathname;

  return (
    <SiteShell>
      <main className="homepage-main homepage-single error-page" aria-labelledby="error-heading">
        <div className="error-card">
          <span className="error-code" aria-hidden="true">404</span>
          <h1 id="error-heading">Tuhle stránku jsme nenašli</h1>
          <p className="homepage-lead">
            Nejspíš vedla jinam nebo se v adrese ztratilo písmenko. Zkus se odrazit odsud:
          </p>
          {attemptedPath && attemptedPath !== '/' ? (
            <p className="error-path">
              Hledaná adresa: <code>{attemptedPath}</code>
            </p>
          ) : null}
          <a className="homepage-cta primary" href="/">
            Zpět na hlavní stránku
          </a>
          <ul className="error-links">
            {NOT_FOUND_LINKS.map((item) => (
              <li key={item.id}>
                <a href={item.href}>{item.label}</a>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </SiteShell>
  );
}
