import { SiteShell } from '../layout/SiteShell';
import { LeagueHistoryTable } from './LeagueHistoryTable';

export function LeagueHistoryPage() {
  return (
    <SiteShell>
      <main className="homepage-main homepage-single homepage-league-page" aria-labelledby="league-history-heading">
        <h1 id="league-history-heading">Historická tabulka Zelené ligy</h1>
        <LeagueHistoryTable />
      </main>
    </SiteShell>
  );
}
