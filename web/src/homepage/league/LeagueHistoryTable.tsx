import { useEffect, useState } from 'react';
import { formatHistoryPoints, LeagueHistoryData, normalizeLeagueHistory, rankLeagueHistory } from './historyModel';

export function LeagueHistoryTable() {
  const [history, setHistory] = useState<LeagueHistoryData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/content/league-history')
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        if (active) {
          setHistory(normalizeLeagueHistory(data));
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const rows = history ? rankLeagueHistory(history) : [];

  return (
    <div className="homepage-card homepage-league-history-card">
      <h2>Historická tabulka</h2>
      {failed ? <p className="homepage-league-note">Historickou tabulku se nepodařilo načíst.</p> : null}
      {!history && !failed ? <p className="homepage-league-note" role="status">Načítám historickou tabulku…</p> : null}
      {history && rows.length > 0 ? (
        <div className="homepage-league-history-scroll">
          <table className="homepage-league-history-table">
            <thead>
              <tr>
                <th className="is-rank" scope="col">Pořadí</th>
                <th className="is-number" scope="col">č.</th>
                <th className="is-name" scope="col">Oddíl</th>
                <th className="is-total" scope="col">Body celkem</th>
                {history.columns.map((column) => (
                  <th key={column.season_label} scope="col" className="is-season">
                    <span>{column.ordinal || '–'}</span>
                    <small>{column.season_label}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="is-rank">{row.rankLabel}</td>
                  <td className="is-number">{row.troop_number}</td>
                  <th className="is-name" scope="row">{row.name}</th>
                  <td className="is-total">{formatHistoryPoints(row.total)}</td>
                  {history.columns.map((column) => (
                    <td key={column.season_label} className="is-season">
                      {formatHistoryPoints(row.points[column.season_label])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
