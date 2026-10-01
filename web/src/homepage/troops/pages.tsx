import { SiteShell } from '../layout/SiteShell';
import { toTelHref } from '../shared/format';
import { LEADER_HISTORY_SOURCE,TROOPS,Troop,TroopLeaderTerm,formatTroopDescription,formatTroopName,resolveTroopLogo } from './model';

export function TroopsPage() {
  return (
    <SiteShell>
      <main className="homepage-main homepage-single troops-page" aria-labelledby="troops-heading">
        <h1 id="troops-heading">Oddíly SPTO</h1>
        <div className="homepage-card">
          <div className="troops-grid">
            {TROOPS.map((troop) => {
              const logo = resolveTroopLogo(troop);
              return (
                <div key={troop.href} className="troop-card">
                  <a className="troop-card-main" href={troop.href}>
                    <div className="troop-logo">
                      {logo ? <img src={logo} alt={`Logo ${formatTroopName(troop)}`} loading="lazy" /> : null}
                    </div>
                    <div className="troop-card-content">
                      <strong>{formatTroopName(troop)}</strong>
                      <span>{formatTroopDescription(troop)}</span>
                    </div>
                  </a>
                  <TroopLeaderContactLinks troop={troop} className="troop-card-contact" />
                  {troop.website ? (
                    <a className="troop-website-link" href={troop.website} target="_blank" rel="noreferrer">
                      Web oddílu
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </SiteShell>
  );
}

export function TroopLeaderContactLinks({ troop, className }: { troop: Troop; className: string }) {
  if (!troop.leaderPhone && !troop.leaderEmail) {
    return null;
  }
  return (
    <div className={className}>
      {troop.leaderPhone ? (
        <span>
          Telefon:{' '}
          <a className="contact-card-link" href={toTelHref(troop.leaderPhone)}>
            {troop.leaderPhone}
          </a>
        </span>
      ) : null}
      {troop.leaderEmail ? (
        <span>
          E-mail:{' '}
          <a className="contact-card-link" href={`mailto:${troop.leaderEmail}`}>
            {troop.leaderEmail}
          </a>
        </span>
      ) : null}
    </div>
  );
}

export function TroopLeaderTimeline({ leaders }: { leaders: TroopLeaderTerm[] }) {
  return (
    <ol className="troop-leaders-timeline">
      {leaders.map((entry, index) => (
        <li key={`${entry.name}-${entry.term}-${index}`}>
          <span className="troop-leader-term">{entry.term}</span>
          <span className="troop-leader-person">
            {entry.name}
            {/* Seznam je řazený od nejnovějšího, takže současného náčelníka poznáme podle prvního otevřeného období. */}
            {index === 0 && /dosud|nyní/.test(entry.term) ? (
              <span className="troop-leader-badge">současný náčelník</span>
            ) : null}
          </span>
          {entry.note ? <span className="troop-leader-note">{entry.note}</span> : null}
        </li>
      ))}
    </ol>
  );
}

export function TroopDetailPage({ troop }: { troop: Troop }) {
  const logo = resolveTroopLogo(troop);
  const hasHistory =
    (troop.leaderHistory && troop.leaderHistory.length > 0) ||
    (troop.leaderHistoryGroups && troop.leaderHistoryGroups.length > 0);
  return (
    <SiteShell>
      <main className="homepage-main homepage-single troop-detail" aria-labelledby="troop-heading">
        {/* Znak oddílu patří k názvu, samostatná karta jen s logem působila prázdně. */}
        <header className="troop-detail-hero">
          {logo ? (
            <img className="troop-detail-logo" src={logo} alt={`Logo ${formatTroopName(troop)}`} />
          ) : null}
          <div className="troop-detail-hero-text">
            <h1 id="troop-heading">{formatTroopName(troop)}</h1>
            {troop.year ? <p className="homepage-lead">založeno {troop.year}</p> : null}
            {troop.website ? (
              <a className="troop-website-link" href={troop.website} target="_blank" rel="noreferrer">
                Web oddílu
              </a>
            ) : null}
          </div>
        </header>
        <section className="homepage-card troop-leader-card" aria-labelledby="troop-leader-heading">
          <h2 id="troop-leader-heading">Náčelník oddílu</h2>
          <p className="troop-leader-name">{troop.leader}</p>
          <TroopLeaderContactLinks troop={troop} className="troop-leader-meta" />
          {!troop.leaderPhone && !troop.leaderEmail ? (
            <p className="troop-leader-empty">Kontakt zatím nemáme, zkus web oddílu.</p>
          ) : null}
        </section>
        {hasHistory ? (
          <section className="homepage-card troop-leaders-card" aria-labelledby="troop-leaders-heading">
            <h2 id="troop-leaders-heading">Náčelníci v historii oddílu</h2>
            {troop.leaderHistoryNote ? <p className="troop-leaders-intro">{troop.leaderHistoryNote}</p> : null}
            {troop.leaderHistory && troop.leaderHistory.length > 0 ? (
              <TroopLeaderTimeline leaders={troop.leaderHistory} />
            ) : null}
            {troop.leaderHistoryGroups?.map((group) => (
              <div key={group.title} className="troop-leaders-group">
                <h3>{group.title}</h3>
                <TroopLeaderTimeline leaders={group.leaders} />
              </div>
            ))}
            <p className="troop-leaders-source">{LEADER_HISTORY_SOURCE}</p>
          </section>
        ) : null}
        <a className="homepage-back-link homepage-back-link--inline" href="/oddily">
          Zpět na seznam oddílů
        </a>
      </main>
    </SiteShell>
  );
}
