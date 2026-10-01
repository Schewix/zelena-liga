import { APPLICATION_LINKS } from '../data/contacts';
import { SiteShell } from '../layout/SiteShell';

export function ApplicationsPage() {
  return (
    <SiteShell>
      <main className="homepage-main homepage-single" aria-labelledby="apps-heading">
        <h1 id="apps-heading">Aplikace SPTO</h1>
        <p className="homepage-lead">Digitální nástroje pro soutěže, bodování a výsledky.</p>
        <div className="homepage-card">
          <ul className="homepage-list">
            {APPLICATION_LINKS.map((app) => (
              <li key={app.href}>
                <a className="homepage-inline-link" href={app.href}>
                  {app.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <a className="homepage-back-link" href="/">
          Zpět na hlavní stránku
        </a>
      </main>
    </SiteShell>
  );
}
