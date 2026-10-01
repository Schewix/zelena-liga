import { COMPETITIONS } from '../data/competitions';
import { APPLICATION_LINKS } from '../data/contacts';
import { SiteShell } from '../layout/SiteShell';

export function CompetitionsPage() {
  return (
    <SiteShell>
      <main className="homepage-main homepage-single" aria-labelledby="competitions-heading">
        <h1 id="competitions-heading">Soutěže SPTO</h1>
        <div className="homepage-card">
          <div className="homepage-souteze-grid">
            <div className="homepage-souteze-block">
              <h2>Soutěže</h2>
              <ul className="homepage-list">
                {COMPETITIONS.map((competition) => (
                  <li key={competition.slug}>
                    <a className="homepage-inline-link" href={competition.href}>
                      {competition.name}
                    </a>
                    <p>{competition.description ?? 'Pravidla a dokumenty k soutěži.'}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="homepage-souteze-block">
              <h2>Aplikace</h2>
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
          </div>
        </div>
      </main>
    </SiteShell>
  );
}
