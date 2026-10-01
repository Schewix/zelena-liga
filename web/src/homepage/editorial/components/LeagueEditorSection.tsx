import { LeagueData, LeagueEvent, LeagueEventEntry, LeagueRowWithRank, LeagueSeason, formatLeagueScore } from '../../league/model';

export type LeagueEditorSectionProps = {
  activeSection: "clanky" | "poradi-zl" | "body-zl" | "alba" | "dokumenty" | "terminy";
  handleLeagueSave: () => void;
  leagueSaving: boolean;
  leagueMessage: string | null;
  leagueData: LeagueData;
  selectedLeagueSeason: LeagueSeason;
  setSelectedLeagueSeasonId: React.Dispatch<React.SetStateAction<string>>;
  setLeagueMessage: React.Dispatch<React.SetStateAction<string | null>>;
  updateLeagueSeasonName: (value: string) => void;
  updateLeagueSeasonActive: (isActive: boolean) => void;
  newLeagueSeasonName: string;
  setNewLeagueSeasonName: React.Dispatch<React.SetStateAction<string>>;
  handleCreateLeagueSeason: () => void;
  handleRemoveLeagueTroop: (troopId: string) => void;
  newLeagueTroopName: string;
  setNewLeagueTroopName: React.Dispatch<React.SetStateAction<string>>;
  handleAddLeagueTroop: () => void;
  updateLeagueEvent: (eventKey: string, patch: Partial<Pick<LeagueEventEntry, "label" | "name">>) => void;
  handleRemoveLeagueEvent: (eventKey: string) => void;
  newLeagueEventLabel: string;
  setNewLeagueEventLabel: React.Dispatch<React.SetStateAction<string>>;
  newLeagueEventName: string;
  setNewLeagueEventName: React.Dispatch<React.SetStateAction<string>>;
  handleAddLeagueEvent: () => void;
  leagueGridTemplate: string;
  leagueRows: LeagueRowWithRank[];
  updateLeagueScore: (troopId: string, eventKey: LeagueEvent, rawValue: string) => void;
};

export function LeagueEditorSection({ activeSection, handleLeagueSave, leagueSaving, leagueMessage, leagueData, selectedLeagueSeason, setSelectedLeagueSeasonId, setLeagueMessage, updateLeagueSeasonName, updateLeagueSeasonActive, newLeagueSeasonName, setNewLeagueSeasonName, handleCreateLeagueSeason, handleRemoveLeagueTroop, newLeagueTroopName, setNewLeagueTroopName, handleAddLeagueTroop, updateLeagueEvent, handleRemoveLeagueEvent, newLeagueEventLabel, setNewLeagueEventLabel, newLeagueEventName, setNewLeagueEventName, handleAddLeagueEvent, leagueGridTemplate, leagueRows, updateLeagueScore }: LeagueEditorSectionProps) {
  return (<section
    className="editor-section homepage-card editor-league"
    aria-label="Pořadí Zelené ligy"
    hidden={activeSection !== 'poradi-zl'}
  >
    <div className="editor-league-toolbar">
      <div>
        <h2>Pořadí Zelené ligy podle ročníků</h2>
        <p>Vytvářej ročníky, nastav účastnící se oddíly a uprav body v jednotlivých soutěžích.</p>
      </div>
      <div className="editor-league-actions">
        <button type="button" className="homepage-button" onClick={handleLeagueSave} disabled={leagueSaving}>
          {leagueSaving ? 'Ukládám…' : 'Uložit ročník'}
        </button>
      </div>
    </div>
    {leagueMessage ? <p className="homepage-alert">{leagueMessage}</p> : null}
    <div className="gallery-year-tabs editor-league-season-tabs" aria-label="Ročníky pořadí">
      {leagueData.seasons.map((season) => (
        <button
          key={season.id}
          type="button"
          className={`gallery-year-tab${season.id === selectedLeagueSeason.id ? ' is-active' : ''}`}
          onClick={() => {
            setSelectedLeagueSeasonId(season.id);
            setLeagueMessage(null);
          }}
        >
          {season.name}
          {season.isActive ? ' · aktuální' : ''}
        </button>
      ))}
    </div>
    <div className="editor-league-season-panel">
      <label className="editor-field" htmlFor="editor-league-season-name">
        <span>Název ročníku</span>
        <input
          id="editor-league-season-name"
          type="text"
          value={selectedLeagueSeason.name}
          onChange={(event) => updateLeagueSeasonName(event.target.value)}
        />
      </label>
      <label className="editor-check" htmlFor="editor-league-season-active">
        <input
          id="editor-league-season-active"
          type="checkbox"
          checked={selectedLeagueSeason.isActive}
          onChange={(event) => updateLeagueSeasonActive(event.target.checked)}
        />
        <span>Tento ročník zobrazovat jako aktuální</span>
      </label>
    </div>
    <div className="editor-league-season-create">
      <label className="editor-field" htmlFor="editor-league-new-season">
        <span>Vytvořit nový ročník</span>
        <input
          id="editor-league-new-season"
          type="text"
          value={newLeagueSeasonName}
          onChange={(event) => setNewLeagueSeasonName(event.target.value)}
          placeholder="Např. Ročník 2026/2027"
        />
      </label>
      <button type="button" className="homepage-button homepage-button--ghost" onClick={handleCreateLeagueSeason}>
        Vytvořit ročník
      </button>
    </div>
    <div className="editor-league-troops">
      <div>
        <h3>Oddíly v ročníku</h3>
        <p>Oddíl odstraněný z ročníku se nebude počítat do tabulky, ostatní ročníky zůstanou beze změny.</p>
      </div>
      <div className="editor-league-troop-list">
        {selectedLeagueSeason.troops.map((troop) => (
          <span key={troop.id} className="editor-league-troop-pill">
            {troop.name}
            <button
              type="button"
              onClick={() => handleRemoveLeagueTroop(troop.id)}
              aria-label={`Odebrat oddíl ${troop.name}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="editor-league-season-create">
        <label className="editor-field" htmlFor="editor-league-new-troop">
          <span>Přidat oddíl</span>
          <input
            id="editor-league-new-troop"
            type="text"
            value={newLeagueTroopName}
            onChange={(event) => setNewLeagueTroopName(event.target.value)}
            placeholder="Např. 32. PTO Severka"
          />
        </label>
        <button type="button" className="homepage-button homepage-button--ghost" onClick={handleAddLeagueTroop}>
          Přidat oddíl
        </button>
      </div>
    </div>
    <div className="editor-league-troops editor-league-events">
      <div>
        <h3>Soutěže v ročníku</h3>
        <p>Soutěže můžeš pro každý ročník pojmenovat jinak nebo je úplně odebrat.</p>
      </div>
      <div className="editor-league-event-list">
        {selectedLeagueSeason.events.map((event) => (
          <div key={event.key} className="editor-league-event-row">
            <label className="editor-field" htmlFor={`editor-league-event-label-${event.key}`}>
              <span>Zkratka v tabulce</span>
              <input
                id={`editor-league-event-label-${event.key}`}
                type="text"
                value={event.label}
                onChange={(changeEvent) => updateLeagueEvent(event.key, { label: changeEvent.target.value })}
                placeholder="PTOB"
              />
            </label>
            <label className="editor-field" htmlFor={`editor-league-event-name-${event.key}`}>
              <span>Název soutěže</span>
              <input
                id={`editor-league-event-name-${event.key}`}
                type="text"
                value={event.name}
                onChange={(changeEvent) => updateLeagueEvent(event.key, { name: changeEvent.target.value })}
                placeholder="Orientační běh"
              />
            </label>
            <button
              type="button"
              className="homepage-button homepage-button--ghost editor-league-event-remove"
              onClick={() => handleRemoveLeagueEvent(event.key)}
            >
              Odebrat
            </button>
          </div>
        ))}
      </div>
      <div className="editor-league-season-create editor-league-event-create">
        <label className="editor-field" htmlFor="editor-league-new-event-label">
          <span>Zkratka</span>
          <input
            id="editor-league-new-event-label"
            type="text"
            value={newLeagueEventLabel}
            onChange={(event) => setNewLeagueEventLabel(event.target.value)}
            placeholder="Např. ZL"
          />
        </label>
        <label className="editor-field" htmlFor="editor-league-new-event-name">
          <span>Název nové soutěže</span>
          <input
            id="editor-league-new-event-name"
            type="text"
            value={newLeagueEventName}
            onChange={(event) => setNewLeagueEventName(event.target.value)}
            placeholder="Např. Závod ligy"
          />
        </label>
        <button type="button" className="homepage-button homepage-button--ghost" onClick={handleAddLeagueEvent}>
          Přidat soutěž
        </button>
      </div>
    </div>
    <div className="editor-league-table" style={{ '--league-editor-grid': leagueGridTemplate } as React.CSSProperties}>
      <div className="editor-league-row editor-league-row--header">
        <span>Oddíl</span>
        {selectedLeagueSeason.events.map((event) => (
          <span key={event.key} className="editor-league-score">
            {event.label}
          </span>
        ))}
        <span className="editor-league-score">Celkem</span>
      </div>
      {leagueRows.map((row) => (
        <div key={row.key} className="editor-league-row">
          <span className="editor-league-name">{row.name}</span>
          {selectedLeagueSeason.events.map((event) => {
            const value = selectedLeagueSeason.scores[row.key]?.[event.key];
            return (
              <label key={`${row.key}-${event.key}`} className="editor-league-input">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  value={value ?? ''}
                  onChange={(eventChange) =>
                    updateLeagueScore(row.key, event.key, eventChange.target.value)
                  }
                  aria-label={`${row.name} – ${event.label}`}
                />
              </label>
            );
          })}
          <span className="editor-league-total">{formatLeagueScore(row.total)}</span>
        </div>
      ))}
    </div>
  </section>);
}
