import {
useEffect,
useState
} from 'react';
import { SiteShell } from '../layout/SiteShell';
import { LeagueHistoryTable } from './LeagueHistoryTable';
import { addCompetitionRanks,buildLeagueRows,formatLeagueScore,getActiveLeagueSeason,LeagueData } from './model';

export function LeagueStandingsPage({ leagueData }: { leagueData: LeagueData }) {
  const [selectedSeasonId, setSelectedSeasonId] = useState(leagueData.activeSeasonId);
  useEffect(() => {
    setSelectedSeasonId((current) =>
      leagueData.seasons.some((season) => season.id === current) ? current : leagueData.activeSeasonId,
    );
  }, [leagueData]);
  const selectedSeason =
    leagueData.seasons.find((season) => season.id === selectedSeasonId) ??
    getActiveLeagueSeason(leagueData);
  const leagueGridTemplate = `minmax(220px, 1.3fr) repeat(${selectedSeason.events.length}, minmax(90px, 1fr)) minmax(90px, 0.8fr)`;
  const rows = addCompetitionRanks(buildLeagueRows(selectedSeason.scores, selectedSeason.troops, selectedSeason.events));
  const hasAnyScores = rows.some((row) => row.total !== null);

  return (
    <SiteShell>
      <main className="homepage-main homepage-single homepage-league-page" aria-labelledby="league-heading">
        <h1 id="league-heading">Pořadí Zelené ligy</h1>
        <div className="gallery-year-tabs homepage-league-season-tabs" aria-label="Ročníky pořadí">
          {leagueData.seasons.map((season) => (
            <button
              key={season.id}
              type="button"
              className={`gallery-year-tab${season.id === selectedSeason.id ? ' is-active' : ''}`}
              onClick={() => setSelectedSeasonId(season.id)}
            >
              {season.name}
              {season.isActive ? ' · aktuální' : ''}
            </button>
          ))}
        </div>
        <div className="homepage-card homepage-league-table-card">
          <div className="homepage-league-season-heading">
            <h2>{selectedSeason.name}</h2>
            {selectedSeason.isActive ? <span>Aktuální ročník</span> : <span>Archivní ročník</span>}
          </div>
          {!hasAnyScores ? (
            <p className="homepage-league-note">Body pro tento ročník zatím nejsou vyplněné.</p>
          ) : null}
          <div className="homepage-league-table" style={{ '--league-grid': leagueGridTemplate } as React.CSSProperties}>
            <div className="homepage-league-row homepage-league-header">
              <span>Oddíl</span>
              {selectedSeason.events.map((event) => (
                <span key={event.key} className="homepage-league-score">
                  {event.label}
                </span>
              ))}
              <span className="homepage-league-score">Celkem</span>
            </div>
            {rows.map((row, index) => (
              <div key={row.key} className="homepage-league-row">
                <span className="homepage-league-name" data-label="Oddíl">
                  <strong className="homepage-league-rank">{row.rank}.</strong> {row.name}
                </span>
                {row.scores.map((score, scoreIndex) => {
                  const event = selectedSeason.events[scoreIndex];
                  return (
                    <span key={`${row.key}-${scoreIndex}`} className="homepage-league-score" data-label={event.label}>
                      {formatLeagueScore(score)}
                    </span>
                  );
                })}
                <span className="homepage-league-score homepage-league-total" data-label="Celkem">
                  {formatLeagueScore(row.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <LeagueHistoryTable />
      </main>
    </SiteShell>
  );
}
