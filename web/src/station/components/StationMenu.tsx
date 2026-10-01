import stationAppGuidePdf from '../../assets/instrukce-pouzivani-aplikace.pdf';
import competitionRulesPdf from '../../assets/pravidla/pravidla-souteze.pdf';
import stationRulesPdf from '../../assets/pravidla/pravidla-stanovist.pdf';
import calcGuidePdf from '../../assets/pruvodce-vypocetka.pdf';
import type { StationManifest } from '../../auth/types';

export type StationMenuProps = {
  setMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  stationDisplayName: string;
  stationCode: string;
  manifest: StationManifest;
  allowedStationCategoryLabel: string;
  handleOpenRules: (url: string) => void;
  isTargetStation: boolean;
  stationRules: string[];
  handleOpenChangePassword: () => void;
  handleSwitchEvent: () => void;
  handleFullRefresh: () => Promise<void>;
  fullRefreshRunning: boolean;
  handleLogout: () => void;
};

export function StationMenu({ setMenuOpen, stationDisplayName, stationCode, manifest, allowedStationCategoryLabel, handleOpenRules, isTargetStation, stationRules, handleOpenChangePassword, handleSwitchEvent, handleFullRefresh, fullRefreshRunning, handleLogout }: StationMenuProps) {
  return (<div
    className="station-menu-backdrop"
    role="dialog"
    aria-modal="true"
    onClick={(event) => {
      if (event.target === event.currentTarget) {
        setMenuOpen(false);
      }
    }}
  >
    <aside className="station-menu" id="station-menu">
      <header className="station-menu-header">
        <h2>Menu</h2>
        <button type="button" className="ghost station-menu-close" onClick={() => setMenuOpen(false)}>
          Zavřít
        </button>
      </header>
      <section className="card station-menu-card">
        <header className="card-header">
          <h3>Stanoviště</h3>
        </header>
        <ul className="station-menu-list">
          <li>
            <span className="card-hint">Název</span>
            <strong className="station-menu-value station-menu-value--emphasis">{stationDisplayName}</strong>
          </li>
          <li>
            <span className="card-hint">Kód</span>
            <span className="station-menu-code">{stationCode || '—'}</span>
          </li>
          <li>
            <span className="card-hint">Událost</span>
            <strong className="station-menu-value">{manifest.event.name}</strong>
          </li>
          <li>
            <span className="card-hint">Kategorie</span>
            <strong className="station-menu-value">{allowedStationCategoryLabel}</strong>
          </li>
        </ul>
      </section>
      <section className="card station-menu-card">
        <header className="card-header">
          <h3>Rozhodčí</h3>
        </header>
        <ul className="station-menu-list">
          <li>
            <span className="card-hint">Jméno</span>
            <strong className="station-menu-value station-menu-value--emphasis">{manifest.judge.displayName}</strong>
          </li>
          <li>
            <span className="card-hint">Email</span>
            <strong className="station-menu-value station-menu-value--muted">{manifest.judge.email}</strong>
          </li>
        </ul>
      </section>
      <section className="card station-menu-card">
        <header className="card-header">
          <h3>Pravidla a návody</h3>
        </header>
        <div className="station-menu-rules-actions">
          <button type="button" className="primary" onClick={() => handleOpenRules(competitionRulesPdf)}>
            Pravidla soutěže
          </button>
          <button type="button" className="ghost" onClick={() => handleOpenRules(stationRulesPdf)}>
            Pravidla stanovišť
          </button>
          {!isTargetStation ? (
            <button type="button" className="ghost" onClick={() => handleOpenRules(stationAppGuidePdf)}>
              Instrukce aplikace
            </button>
          ) : (
            <button type="button" className="ghost" onClick={() => handleOpenRules(calcGuidePdf)}>
              Průvodce výpočetka
            </button>
          )}
        </div>
        <ul className="station-menu-rules">
          {stationRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>
      <section className="card station-menu-card">
        <header className="card-header">
          <h3>Účet</h3>
        </header>
        <button type="button" className="logout-button" onClick={handleOpenChangePassword}>
          Změnit heslo
        </button>
        <button type="button" className="logout-button" onClick={handleSwitchEvent}>
          Změnit ročník
        </button>
        <button
          type="button"
          className="ghost logout-button"
          onClick={handleFullRefresh}
          disabled={fullRefreshRunning}
        >
          {fullRefreshRunning ? 'Probíhá full refresh…' : 'Full refresh a promazání cache'}
        </button>
        <p className="card-hint">Použij ráno před závodem po testování na každém stanovišti.</p>
        <p className="card-hint">Odhlásíš se z aktuální relace.</p>
        <button type="button" className="logout-button" onClick={handleLogout}>
          Odhlásit se
        </button>
      </section>
    </aside>
  </div>);
}
