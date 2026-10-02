import { useEffect, useMemo, useState } from 'react';
import {
  formatHistoryPoints,
  getLeagueHistoryTotal,
  LeagueHistoryData,
  normalizeLeagueHistory,
  rankLeagueHistory,
} from '../../league/historyModel';
import type { EditorSection } from '../model';

type Props = { activeSection: EditorSection };

export function LeagueHistoryEditorSection({ activeSection }: Props) {
  const [data, setData] = useState<LeagueHistoryData>({ columns: [], rows: [] });
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [newSeasonLabel, setNewSeasonLabel] = useState('');
  const [newSeasonOrdinal, setNewSeasonOrdinal] = useState('');

  const load = () =>
    fetch('/api/content/admin/league-history', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('Načtení se nezdařilo.'))))
      .then((payload) => {
        setData(normalizeLeagueHistory(payload));
        setDirty(false);
        setLoaded(true);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Načtení se nezdařilo.'));

  useEffect(() => {
    void load();
  }, []);

  const rankById = useMemo(() => {
    const map = new Map<string, string>();
    rankLeagueHistory(data).forEach((row) => map.set(row.id, row.rankLabel));
    return map;
  }, [data]);

  const change = (updater: (current: LeagueHistoryData) => LeagueHistoryData) => {
    setData(updater);
    setDirty(true);
    setMessage(null);
  };

  const updateRow = (id: string, patch: { troop_number?: string; name?: string }) =>
    change((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));

  const updatePoints = (id: string, label: string, raw: string) =>
    change((current) => ({
      ...current,
      rows: current.rows.map((row) => {
        if (row.id !== id) {
          return row;
        }
        const points = { ...row.points };
        const parsed = Number(raw.replace(',', '.'));
        if (raw.trim() === '' || !Number.isFinite(parsed)) {
          delete points[label];
        } else {
          points[label] = parsed;
        }
        return { ...row, points };
      }),
    }));

  const updateOrdinal = (label: string, ordinal: string) =>
    change((current) => ({
      ...current,
      columns: current.columns.map((column) => (column.season_label === label ? { ...column, ordinal } : column)),
    }));

  const addRow = () =>
    change((current) => ({
      ...current,
      rows: [...current.rows, { id: crypto.randomUUID(), troop_number: '', name: '', points: {} }],
    }));

  const removeRow = (id: string, name: string) => {
    if (!window.confirm(`Odebrat oddíl „${name || 'bez názvu'}“ z historické tabulky?`)) {
      return;
    }
    change((current) => ({ ...current, rows: current.rows.filter((row) => row.id !== id) }));
  };

  const addSeason = () => {
    const label = newSeasonLabel.trim();
    if (!label) {
      setMessage('Zadej označení sezóny, např. 26/27.');
      return;
    }
    if (data.columns.some((column) => column.season_label === label)) {
      setMessage('Taková sezóna už v tabulce je.');
      return;
    }
    change((current) => ({
      ...current,
      columns: [...current.columns, { season_label: label, ordinal: newSeasonOrdinal.trim() }],
    }));
    setNewSeasonLabel('');
    setNewSeasonOrdinal('');
  };

  const removeSeason = (label: string) => {
    if (!window.confirm(`Odebrat sezónu ${label} včetně všech bodů?`)) {
      return;
    }
    change((current) => ({
      columns: current.columns.filter((column) => column.season_label !== label),
      rows: current.rows.map((row) => {
        const points = { ...row.points };
        delete points[label];
        return { ...row, points };
      }),
    }));
  };

  const handleSave = () => {
    if (data.rows.some((row) => !row.name.trim())) {
      setMessage('Každý oddíl musí mít název.');
      return;
    }
    setSaving(true);
    setMessage(null);
    fetch('/api/content/admin/league-history', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Uložení se nezdařilo.');
        }
        setData(normalizeLeagueHistory(await response.json()));
        setDirty(false);
        setMessage('Historická tabulka byla uložena.');
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Uložení se nezdařilo.'))
      .finally(() => setSaving(false));
  };

  return (
    <section
      className="editor-section homepage-card editor-league"
      aria-label="Historická tabulka"
      hidden={activeSection !== 'historie-zl'}
    >
      <div className="editor-league-toolbar">
        <div>
          <h2>Historická tabulka Zelené ligy</h2>
          <p>
            Body oddílů v jednotlivých sezónách. Součet a pořadí se počítají automaticky, prázdné políčko
            znamená, že oddíl v sezóně nesoutěžil.
          </p>
        </div>
        <div className="editor-league-actions">
          <button type="button" className="homepage-button" onClick={handleSave} disabled={saving || !loaded || !dirty}>
            {saving ? 'Ukládám…' : 'Uložit tabulku'}
          </button>
        </div>
      </div>
      {message ? <p className="homepage-alert">{message}</p> : null}
      <div className="editor-league-season-create">
        <label className="editor-field" htmlFor="editor-history-new-season">
          <span>Nová sezóna</span>
          <input
            id="editor-history-new-season"
            type="text"
            value={newSeasonLabel}
            onChange={(event) => setNewSeasonLabel(event.target.value)}
            placeholder="Např. 26/27"
          />
        </label>
        <label className="editor-field" htmlFor="editor-history-new-ordinal">
          <span>Číslo ročníku</span>
          <input
            id="editor-history-new-ordinal"
            type="text"
            value={newSeasonOrdinal}
            onChange={(event) => setNewSeasonOrdinal(event.target.value)}
            placeholder="Např. XXXIII."
          />
        </label>
        <button type="button" className="homepage-button homepage-button--ghost" onClick={addSeason}>
          Přidat sezónu
        </button>
      </div>
      <div className="homepage-league-history-scroll">
        <table className="editor-league-history-table">
          <thead>
            <tr>
              <th>Pořadí</th>
              <th>č.</th>
              <th>Oddíl</th>
              <th>Celkem</th>
              {data.columns.map((column) => (
                <th key={column.season_label}>
                  <input
                    className="is-ordinal"
                    type="text"
                    value={column.ordinal}
                    onChange={(event) => updateOrdinal(column.season_label, event.target.value)}
                    aria-label={`Číslo ročníku ${column.season_label}`}
                  />
                  <div>{column.season_label}</div>
                  <button
                    type="button"
                    className="editor-league-troop-pill"
                    onClick={() => removeSeason(column.season_label)}
                    aria-label={`Odebrat sezónu ${column.season_label}`}
                  >
                    ×
                  </button>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id}>
                <td>{rankById.get(row.id)}</td>
                <td>
                  <input
                    className="is-number"
                    type="text"
                    value={row.troop_number}
                    onChange={(event) => updateRow(row.id, { troop_number: event.target.value })}
                    aria-label="Číslo oddílu"
                  />
                </td>
                <td>
                  <input
                    className="is-name"
                    type="text"
                    value={row.name}
                    onChange={(event) => updateRow(row.id, { name: event.target.value })}
                    aria-label="Název oddílu"
                  />
                </td>
                <td className="is-total">{formatHistoryPoints(getLeagueHistoryTotal(row, data.columns))}</td>
                {data.columns.map((column) => (
                  <td key={column.season_label}>
                    <input
                      className="is-points"
                      type="text"
                      inputMode="decimal"
                      value={row.points[column.season_label] ?? ''}
                      onChange={(event) => updatePoints(row.id, column.season_label, event.target.value)}
                      aria-label={`${row.name || 'Oddíl'} – ${column.season_label}`}
                    />
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    className="homepage-button homepage-button--ghost"
                    onClick={() => removeRow(row.id, row.name)}
                  >
                    Odebrat
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <button type="button" className="homepage-button homepage-button--ghost" onClick={addRow}>
          Přidat oddíl
        </button>
      </div>
    </section>
  );
}
