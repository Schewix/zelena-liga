import { useEffect, useMemo, useState } from 'react';
import {
  formatDateTimeForStatus,
  toAdminSectionId,
  type AdminSectionKey,
  type RaceDashboardSummary,
} from '../adminSections';
import { supabase } from '../../supabaseClient';
import { API_BASE_URL } from '../apiConfig';
import { loadMapData } from '../../liveMap/api';

type DashboardSectionProps = {
  eventLoading: boolean;
  scoringLocked: boolean;
  lockUpdating: boolean;
  onToggleLock: (nextLocked: boolean) => void;
  onNavigate: (section: AdminSectionKey) => void;
  summary: RaceDashboardSummary;
  warnings: string[];
  eventError: string | null;
  lockMessage: string | null;
};

export function AdminDashboardSection({
  eventLoading,
  scoringLocked,
  lockUpdating,
  onToggleLock,
  onNavigate,
  summary,
  warnings,
  eventError,
  lockMessage,
}: DashboardSectionProps) {
  const syncState = summary.problematicStations > 0 || summary.syncConflicts > 0
    ? 'alert'
    : summary.lastSyncAt
    ? 'ok'
    : 'pending';

  return (
    <section
      id={toAdminSectionId('dashboard')}
      className="admin-card admin-card--section admin-card--dashboard-focus admin-section-block admin-section-block--dashboard"
    >
      <header className="admin-card-header">
        <div>
          <h2>Dashboard závodu</h2>
          <p className="admin-card-subtitle">
            {eventLoading
              ? 'Načítám stav závodu…'
              : scoringLocked
              ? 'Závod je ukončen. Zapisování bodů je uzamčeno pro všechna stanoviště kromě T.'
              : 'Závod probíhá. Všechna stanoviště mohou zapisovat body.'}
          </p>
        </div>
        <div className="admin-card-actions admin-card-actions--quick">
          <button
            type="button"
            className="admin-button admin-button--primary"
            onClick={() => onToggleLock(!scoringLocked)}
            disabled={lockUpdating}
          >
            {lockUpdating ? 'Aktualizuji…' : scoringLocked ? 'Znovu povolit zapisování' : 'Ukončit závod'}
          </button>
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={() => onNavigate('patrols')}
          >
            Přidat hlídku
          </button>
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={() => onNavigate('live')}
          >
            Otevřít live mapu
          </button>
          <a
            className="admin-button admin-button--secondary"
            href="https://www.zelenaliga.cz/aplikace/setonuv-zavod/vysledky?autoExport=1"
            target="_blank"
            rel="noreferrer"
          >
            Export výsledků
          </a>
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={() => onNavigate('exports')}
          >
            Export dat
          </button>
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={() => onNavigate('stations')}
          >
            Správa rozhodčích
          </button>
        </div>
      </header>
      <div className="admin-dashboard-live-status">
        <article className={`admin-dashboard-live-status-item admin-dashboard-live-status-item--${syncState}`}>
          <span>Synchronizace</span>
          <strong>
            {syncState === 'ok'
              ? 'Synchronizováno'
              : syncState === 'alert'
              ? 'Vyžaduje pozornost'
              : 'Čeká na první data'}
          </strong>
        </article>
        <article className="admin-dashboard-live-status-item">
          <span>Offline / problémová stanoviště</span>
          <strong>{summary.problematicStations}</strong>
        </article>
        <article className="admin-dashboard-live-status-item">
          <span>Konflikty synchronizace</span>
          <strong>{summary.syncConflicts}</strong>
        </article>
        <article className="admin-dashboard-live-status-item">
          <span>Poslední obnovení</span>
          <strong>{formatDateTimeForStatus(summary.lastSyncAt)}</strong>
        </article>
      </div>
      <div className="admin-dashboard-metrics">
        <article className="admin-dashboard-metric admin-dashboard-metric--primary">
          <span>Přihlášené hlídky</span>
          <strong>{summary.registeredPatrols}</strong>
        </article>
        <article className="admin-dashboard-metric admin-dashboard-metric--highlight">
          <span>Hlídky na trati</span>
          <strong>{summary.patrolsOnCourse}</strong>
        </article>
        <article className="admin-dashboard-metric admin-dashboard-metric--highlight">
          <span>Dokončené hlídky</span>
          <strong>{summary.patrolsFinished}</strong>
        </article>
        <article className="admin-dashboard-metric admin-dashboard-metric--warning">
          <span>Čekající na start</span>
          <strong>{summary.patrolsWaitingForStart}</strong>
        </article>
        <article className="admin-dashboard-metric admin-dashboard-metric--danger">
          <span>Offline/problémová stanoviště</span>
          <strong>{summary.problematicStations}</strong>
        </article>
        <article className="admin-dashboard-metric admin-dashboard-metric--primary">
          <span>Poslední obnovení</span>
          <strong>{formatDateTimeForStatus(summary.lastSyncAt)}</strong>
        </article>
      </div>
      {warnings.length > 0 ? (
        <div className="admin-dashboard-alerts">
          {warnings.map((warning) => (
            <p key={warning} className="admin-notice">{warning}</p>
          ))}
        </div>
      ) : null}
      {eventError ? <p className="admin-error">{eventError}</p> : null}
      {lockMessage ? <p className="admin-notice">{lockMessage}</p> : null}
    </section>
  );
}

type LiveSectionProps = {
  stationLoading: boolean;
  onRefresh: () => void;
  summary: RaceDashboardSummary;
};

export function AdminLiveOverviewSection({
  stationLoading,
  onRefresh,
  summary,
}: LiveSectionProps) {
  const hasCriticalIssue = summary.problematicStations > 0 || summary.syncConflicts > 0;
  const maybeLostPatrols = summary.maybeLostPatrols ?? [];

  return (
    <section
      id={toAdminSectionId('live')}
      className="admin-card admin-card--section admin-card--live-focus admin-section-block admin-section-block--live"
    >
      <header className="admin-card-header">
        <div>
          <h2>Živý průběh závodu</h2>
          <p className="admin-card-subtitle">
            Rychlý přehled provozu během závodu včetně průchodů a synchronizace.
          </p>
        </div>
        <div className="admin-card-actions">
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={onRefresh}
            disabled={stationLoading}
          >
            {stationLoading ? 'Načítám…' : 'Obnovit live data'}
          </button>
        </div>
      </header>
      <div className="admin-live-status-panel">
        <div className="admin-live-status-panel-row">
          <span className={`admin-status-badge ${hasCriticalIssue ? 'admin-status-badge--offline' : 'admin-status-badge--online'}`}>
            {hasCriticalIssue ? 'Vyžaduje kontrolu' : 'Vše v pořádku'}
          </span>
          <span className="admin-status-badge admin-status-badge--unknown">
            Poslední obnovení: {formatDateTimeForStatus(summary.lastSyncAt)}
          </span>
        </div>
      </div>
      <div className="admin-live-grid">
        <article className="admin-live-item admin-live-item--primary">
          <span>Hlídky na trati</span>
          <strong>{summary.patrolsOnCourse}</strong>
        </article>
        <article className="admin-live-item admin-live-item--danger">
          <span>Stanoviště bez dat</span>
          <strong>{summary.problematicStations}</strong>
        </article>
        <article className="admin-live-item admin-live-item--warning">
          <span>Konflikty synchronizace</span>
          <strong>{summary.syncConflicts}</strong>
        </article>
        <article className="admin-live-item admin-live-item--warning">
          <span>Hlídky, které se možná ztratily</span>
          <strong>{maybeLostPatrols.length}</strong>
          {maybeLostPatrols.length > 0 ? (
            <details className="admin-live-lost-patrols">
              <summary>Zobrazit čísla</summary>
              <ul>
                {maybeLostPatrols.map((patrol) => (
                  <li key={patrol.id}>
                    <strong>{patrol.code}</strong>
                    <span>
                      {patrol.teamName ? `${patrol.teamName} · ` : ''}
                      {patrol.stationCode} {patrol.stationName}
                      {' · '}
                      {formatDateTimeForStatus(patrol.lastSeenAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </article>
      </div>
    </section>
  );
}

type LiveMapSectionProps = {
  eventId: string;
  mapRoute: string;
  accessToken: string | null;
};

type AdminLiveMapRow = {
  image_url: string | null;
};

type AdminLiveMapStationRow = {
  id: string;
  code: string | null;
  name: string | null;
};

type AdminLiveMapPositionRow = {
  station_id: string;
  x_percent: number | null;
  y_percent: number | null;
};

type AdminLiveMapMarker = {
  stationId: string;
  code: string;
  name: string;
  x: number;
  y: number;
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return value;
}

export function AdminLiveMapSection({ eventId, mapRoute, accessToken }: LiveMapSectionProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stationMarkers, setStationMarkers] = useState<AdminLiveMapMarker[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    let canceled = false;

    const loadPreview = async () => {
      setPreviewLoading(true);
      let data: {
        event_maps?: AdminLiveMapRow[];
        stations?: AdminLiveMapStationRow[];
        station_map_positions?: AdminLiveMapPositionRow[];
      };
      try {
        if (!accessToken) throw new Error('Chybí přístupový token.');
        data = await loadMapData('load_live_map', accessToken, eventId);
      } catch (loadError) {
        if (canceled) {
          return;
        }
        console.error('Failed to load admin live map preview', loadError);
        setPreviewUrl(null);
        setStationMarkers([]);
        setPreviewLoading(false);
        return;
      }

      if (canceled) {
        return;
      }

      const mapRes = { data: data.event_maps?.[0] ?? null };
      const stationRes = { data: data.stations ?? [] };
      const positionRes = { data: data.station_map_positions ?? [] };

      const stationById = new Map(
        ((stationRes.data ?? []) as AdminLiveMapStationRow[])
          .map((station) => {
            const code = (station.code ?? '').trim().toUpperCase();
            if (!station.id || !code) {
              return null;
            }
            return [station.id, { code, name: (station.name ?? '').trim() }] as const;
          })
          .filter((entry): entry is readonly [string, { code: string; name: string }] => Boolean(entry)),
      );
      const markers = ((positionRes.data ?? []) as AdminLiveMapPositionRow[])
        .map((position) => {
          const station = stationById.get(position.station_id);
          if (!station) {
            return null;
          }
          return {
            stationId: position.station_id,
            code: station.code,
            name: station.name,
            x: clampPercent(Number(position.x_percent ?? 0)),
            y: clampPercent(Number(position.y_percent ?? 0)),
          };
        })
        .filter((marker): marker is AdminLiveMapMarker => Boolean(marker))
        .sort((a, b) => a.code.localeCompare(b.code, 'cs'));

      setPreviewUrl(((mapRes.data ?? null) as AdminLiveMapRow | null)?.image_url ?? null);
      setStationMarkers(markers);
      setPreviewLoading(false);
    };

    void loadPreview();

    return () => {
      canceled = true;
    };
  }, [eventId, accessToken]);

  return (
    <section
      id="admin-live-map-section"
      className="admin-card admin-card--section admin-card--live-map admin-section-block admin-section-block--live"
    >
      <header className="admin-card-header">
        <div>
          <h2>Live mapa závodu</h2>
          <p className="admin-card-subtitle">
            Náhled mapy, která se používá v živém dispečinku průchodů a front.
          </p>
        </div>
      </header>
      <div className="admin-live-map-placeholder">
        <div className="admin-live-map-placeholder-canvas" role="img" aria-label="Náhled live mapy závodu">
          {previewLoading ? (
            <span>Načítám mapu…</span>
          ) : previewUrl ? (
            <div className="admin-live-map-preview-stage">
              <img src={previewUrl} alt="Nahraná mapa závodu" className="admin-live-map-preview-image" />
              {stationMarkers.map((marker) => (
                <span
                  key={marker.stationId}
                  className="admin-live-map-marker"
                  style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                  title={`${marker.code} ${marker.name}`.trim()}
                >
                  {marker.code}
                </span>
              ))}
            </div>
          ) : (
            <span>Mapa zatím není nahraná</span>
          )}
        </div>
        <div className="admin-live-map-placeholder-meta">
          <a className="admin-button admin-button--secondary" href={`${mapRoute}?event_id=${encodeURIComponent(eventId)}`} target="_blank" rel="noreferrer">
            Otevřít mapu
          </a>
        </div>
      </div>
    </section>
  );
}

type AdminQueuesSectionProps = {
  waiting: number;
  serving: number;
  waitingSinceMs: number[];
};

function formatQueueWait(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function AdminQueuesSection({ waiting, serving, waitingSinceMs }: AdminQueuesSectionProps) {
  const now = Date.now();
  const waits = waitingSinceMs.map((since) => Math.max(0, now - since));
  const averageWait = waits.length ? waits.reduce((sum, wait) => sum + wait, 0) / waits.length : null;
  const maxWait = waits.length ? Math.max(...waits) : null;
  return (
    <section
      id={toAdminSectionId('queues')}
      className="admin-card admin-card--section admin-section-block admin-section-block--queues"
    >
      <header className="admin-card-header">
        <div>
          <h2>Fronty a čekání</h2>
          <p className="admin-card-subtitle">
            Aktuální stav front na všech stanovištích (čekání ve formátu HH:MM).
          </p>
        </div>
      </header>
      <div className="admin-placeholder-grid">
        <div className="admin-placeholder-item">
          <strong>Čekající hlídky</strong>
          <span>{waiting}</span>
        </div>
        <div className="admin-placeholder-item">
          <strong>Právě odbavováno</strong>
          <span>{serving}</span>
        </div>
        <div className="admin-placeholder-item">
          <strong>Průměrné čekání</strong>
          <span>{averageWait === null ? '—' : formatQueueWait(averageWait)}</span>
        </div>
        <div className="admin-placeholder-item">
          <strong>Maximální čekání</strong>
          <span>{maxWait === null ? '—' : formatQueueWait(maxWait)}</span>
        </div>
      </div>
    </section>
  );
}

type ResultsSectionProps = {
  eventId: string;
  totalMissingAcrossStations: number;
  summary: RaceDashboardSummary;
  scoringLocked: boolean;
  resultsConfirmedAt: string | null;
  confirmingResults: boolean;
  canConfirmCurrentEvent: boolean;
  onConfirmResults: () => void;
  confirmationMessage: string | null;
};

export function AdminResultsSection({
  eventId,
  totalMissingAcrossStations,
  summary,
  scoringLocked,
  resultsConfirmedAt,
  confirmingResults,
  canConfirmCurrentEvent,
  onConfirmResults,
  confirmationMessage,
}: ResultsSectionProps) {
  const hasResultProblems = totalMissingAcrossStations > 0 || summary.patrolsOnCourse > 0 || summary.overdueNoFinishPatrols > 0;
  const [disqualifiedCount, setDisqualifiedCount] = useState(0);
  const [outOfCompetitionCount, setOutOfCompetitionCount] = useState(0);
  const [statusLoading, setStatusLoading] = useState(false);

  useEffect(() => {
    let canceled = false;

    const loadResultsStatuses = async () => {
      setStatusLoading(true);
      const { data, error } = await supabase
        .from('patrols')
        .select('disqualified, active')
        .eq('event_id', eventId);

      if (canceled) {
        return;
      }

      setStatusLoading(false);
      if (error) {
        console.error('Failed to load disqualified/out-of-competition counts', error);
        setDisqualifiedCount(0);
        setOutOfCompetitionCount(0);
        return;
      }

      const rows = (data ?? []) as { disqualified?: boolean | null; active?: boolean | null }[];
      const disqualified = rows.filter((row) => row.disqualified === true).length;
      const outOfCompetition = rows.filter(
        (row) => row.active === false && row.disqualified !== true,
      ).length;
      setDisqualifiedCount(disqualified);
      setOutOfCompetitionCount(outOfCompetition);
    };

    void loadResultsStatuses();

    return () => {
      canceled = true;
    };
  }, [eventId]);

  const disqualifiedOrOutCount = disqualifiedCount + outOfCompetitionCount;

  return (
    <section
      id={toAdminSectionId('results')}
      className="admin-card admin-card--section admin-card--results-focus admin-section-block admin-section-block--results"
    >
      <header className="admin-card-header">
        <div>
          <h2>Výsledky</h2>
          <p className="admin-card-subtitle">
            Průběžné a finální výsledky včetně kontrol před vyhlášením.
          </p>
        </div>
      </header>
      {hasResultProblems ? (
        <div className="admin-results-alerts">
          {totalMissingAcrossStations > 0 ? (
            <p className="admin-error">Ve stanovištích chybí průchody nebo body.</p>
          ) : null}
          {summary.patrolsOnCourse > 0 ? (
            <p className="admin-notice">Některé hlídky jsou stále neuzavřené.</p>
          ) : null}
          {summary.overdueNoFinishPatrols > 0 ? (
            <p className="admin-error">Některé hlídky nemají cílový čas po očekávaném limitu.</p>
          ) : null}
        </div>
      ) : null}
      <div className="admin-placeholder-grid">
        <div className="admin-placeholder-item admin-placeholder-item--warning">
          <strong>Chybějící průchody / body</strong>
          <span>{totalMissingAcrossStations}</span>
        </div>
        <div className="admin-placeholder-item admin-placeholder-item--warning">
          <strong>Neuzavřené hlídky</strong>
          <span>{summary.patrolsOnCourse}</span>
        </div>
        <div className="admin-placeholder-item admin-placeholder-item--danger">
          <strong>Bez cíle po limitu</strong>
          <span>{summary.overdueNoFinishPatrols}</span>
        </div>
        <div className="admin-placeholder-item">
          <strong>Diskvalifikované / mimo soutěž</strong>
          <span>{statusLoading ? '…' : disqualifiedOrOutCount}</span>
          {!statusLoading ? (
            <small>{`DSQ: ${disqualifiedCount} · Mimo soutěž: ${outOfCompetitionCount}`}</small>
          ) : null}
        </div>
      </div>
      <div className="admin-card-actions">
        <button
          type="button"
          className="admin-button admin-button--secondary admin-button--cta"
          disabled={hasResultProblems || !scoringLocked || Boolean(resultsConfirmedAt) || confirmingResults || !canConfirmCurrentEvent}
          onClick={onConfirmResults}
          title={!scoringLocked ? 'Nejdříve ukonči závod.' : hasResultProblems ? 'Nejdříve vyřeš problémy ve výsledcích.' : undefined}
        >
          {confirmingResults
            ? 'Potvrzuji…'
            : resultsConfirmedAt
            ? `Potvrzeno ${formatDateTimeForStatus(resultsConfirmedAt)}`
            : 'Potvrdit výsledky hlavním rozhodčím'}
        </button>
      </div>
      {confirmationMessage ? <p className={resultsConfirmedAt ? 'admin-success' : 'admin-error'}>{confirmationMessage}</p> : null}
    </section>
  );
}

type StatsSectionProps = {
  eventId: string;
};

type StatsCategoryKey = 'N' | 'M' | 'S' | 'R';

const STATS_CATEGORY_ORDER: ReadonlyArray<StatsCategoryKey> = ['N', 'M', 'S', 'R'];

function toStatsCategoryKey(value: string | null | undefined): StatsCategoryKey | null {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'N' || normalized === 'M' || normalized === 'S' || normalized === 'R') {
    return normalized;
  }
  return null;
}

function normalizeStatsText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function computeMedian(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function formatStatNumber(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  return value.toFixed(digits);
}

type StationStatsSummaryRow = {
  stationCode: string;
  stationName: string;
  totalWaitMinutes: number;
  medianWaitMinutes: number | null;
  averagePoints: number | null;
};

type StationCategoryAverageRow = {
  stationCode: string;
  stationName: string;
  averages: Record<StatsCategoryKey, number | null>;
};

type TroopCountRow = {
  troopName: string;
  total: number;
  byCategory: Record<StatsCategoryKey, number>;
};

export function AdminStatsSection({ eventId }: StatsSectionProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overallWaitMedian, setOverallWaitMedian] = useState<number | null>(null);
  const [categoryWaitMedians, setCategoryWaitMedians] = useState<Record<StatsCategoryKey, number | null>>({
    N: null,
    M: null,
    S: null,
    R: null,
  });
  const [waitSamplesCount, setWaitSamplesCount] = useState(0);
  const [stationSummaries, setStationSummaries] = useState<StationStatsSummaryRow[]>([]);
  const [stationCategoryAverages, setStationCategoryAverages] = useState<StationCategoryAverageRow[]>([]);
  const [troopCounts, setTroopCounts] = useState<TroopCountRow[]>([]);

  useEffect(() => {
    let canceled = false;

    const loadStats = async () => {
      setLoading(true);
      setError(null);
      const [stationsResponse, passagesResponse, scoresResponse, patrolsResponse] = await Promise.all([
        supabase
          .from('stations')
          .select('id, code, name')
          .eq('event_id', eventId),
        supabase
          .from('station_passages')
          .select('station_id, wait_minutes, patrols(category)')
          .eq('event_id', eventId),
        supabase
          .from('station_scores')
          .select('station_id, points, patrols(category)')
          .eq('event_id', eventId),
        supabase
          .from('patrols')
          .select('team_name, category, active')
          .eq('event_id', eventId),
      ]);

      if (canceled) {
        return;
      }

      setLoading(false);

      if (stationsResponse.error || passagesResponse.error || scoresResponse.error || patrolsResponse.error) {
        console.error(
          'Failed to load post-race statistics',
          stationsResponse.error,
          passagesResponse.error,
          scoresResponse.error,
          patrolsResponse.error,
        );
        setError('Nepodařilo se načíst statistiky ročníku.');
        setOverallWaitMedian(null);
        setCategoryWaitMedians({ N: null, M: null, S: null, R: null });
        setWaitSamplesCount(0);
        setStationSummaries([]);
        setStationCategoryAverages([]);
        setTroopCounts([]);
        return;
      }

      const stations = ((stationsResponse.data ?? []) as { id: string; code: string | null; name: string | null }[])
        .map((station) => ({
          id: station.id,
          code: normalizeStatsText(station.code).toUpperCase(),
          name: normalizeStatsText(station.name),
        }))
        .filter((station) => station.code.length > 0);
      const stationById = new Map(stations.map((station) => [station.id, station]));

      type PassageRow = {
        station_id: string;
        wait_minutes: number | null;
        patrols?: { category?: string | null } | null;
      };
      type ScoreRow = {
        station_id: string;
        points: number | null;
        patrols?: { category?: string | null } | null;
      };
      type PatrolRow = {
        team_name: string | null;
        category: string | null;
        active: boolean | null;
      };

      const overallWaitSamples: number[] = [];
      const waitByCategory: Record<StatsCategoryKey, number[]> = {
        N: [],
        M: [],
        S: [],
        R: [],
      };
      const waitByStation = new Map<string, number[]>();

      ((passagesResponse.data ?? []) as PassageRow[]).forEach((row) => {
        const station = stationById.get(row.station_id);
        if (!station || station.code === 'T') {
          return;
        }
        const wait = typeof row.wait_minutes === 'number' && Number.isFinite(row.wait_minutes)
          ? Math.max(0, row.wait_minutes)
          : 0;

        overallWaitSamples.push(wait);
        const stationSamples = waitByStation.get(row.station_id) ?? [];
        stationSamples.push(wait);
        waitByStation.set(row.station_id, stationSamples);

        const category = toStatsCategoryKey(row.patrols?.category);
        if (category) {
          waitByCategory[category].push(wait);
        }
      });

      const categoryMedians: Record<StatsCategoryKey, number | null> = {
        N: computeMedian(waitByCategory.N),
        M: computeMedian(waitByCategory.M),
        S: computeMedian(waitByCategory.S),
        R: computeMedian(waitByCategory.R),
      };
      setWaitSamplesCount(overallWaitSamples.length);
      setOverallWaitMedian(computeMedian(overallWaitSamples));
      setCategoryWaitMedians(categoryMedians);

      const pointsByStation = new Map<string, number[]>();
      const pointsByStationCategory = new Map<string, Record<StatsCategoryKey, number[]>>();

      ((scoresResponse.data ?? []) as ScoreRow[]).forEach((row) => {
        const station = stationById.get(row.station_id);
        if (!station || typeof row.points !== 'number' || !Number.isFinite(row.points)) {
          return;
        }
        const stationPoints = pointsByStation.get(row.station_id) ?? [];
        stationPoints.push(row.points);
        pointsByStation.set(row.station_id, stationPoints);

        const category = toStatsCategoryKey(row.patrols?.category);
        if (!category) {
          return;
        }
        const perCategory = pointsByStationCategory.get(row.station_id) ?? {
          N: [],
          M: [],
          S: [],
          R: [],
        };
        perCategory[category].push(row.points);
        pointsByStationCategory.set(row.station_id, perCategory);
      });

      const stationStatsRows: StationStatsSummaryRow[] = stations
        .map((station) => {
          const waitSamples = waitByStation.get(station.id) ?? [];
          const points = pointsByStation.get(station.id) ?? [];
          const averagePoints = points.length > 0
            ? points.reduce((sum, value) => sum + value, 0) / points.length
            : null;
          return {
            stationCode: station.code,
            stationName: station.name,
            totalWaitMinutes: waitSamples.reduce((sum, value) => sum + value, 0),
            medianWaitMinutes: computeMedian(waitSamples),
            averagePoints,
          };
        })
        .sort((a, b) => a.stationCode.localeCompare(b.stationCode, 'cs'));
      setStationSummaries(stationStatsRows);

      const stationCategoryRows: StationCategoryAverageRow[] = stations
        .map((station) => {
          const grouped = pointsByStationCategory.get(station.id) ?? {
            N: [],
            M: [],
            S: [],
            R: [],
          };
          const averages: Record<StatsCategoryKey, number | null> = {
            N: grouped.N.length ? grouped.N.reduce((sum, value) => sum + value, 0) / grouped.N.length : null,
            M: grouped.M.length ? grouped.M.reduce((sum, value) => sum + value, 0) / grouped.M.length : null,
            S: grouped.S.length ? grouped.S.reduce((sum, value) => sum + value, 0) / grouped.S.length : null,
            R: grouped.R.length ? grouped.R.reduce((sum, value) => sum + value, 0) / grouped.R.length : null,
          };
          return {
            stationCode: station.code,
            stationName: station.name,
            averages,
          };
        })
        .sort((a, b) => a.stationCode.localeCompare(b.stationCode, 'cs'));
      setStationCategoryAverages(stationCategoryRows);

      const troopMap = new Map<string, TroopCountRow>();
      ((patrolsResponse.data ?? []) as PatrolRow[])
        .filter((row) => row.active !== false)
        .forEach((row) => {
          const troopName = normalizeStatsText(row.team_name) || 'Bez oddílu';
          const category = toStatsCategoryKey(row.category);
          const current = troopMap.get(troopName) ?? {
            troopName,
            total: 0,
            byCategory: { N: 0, M: 0, S: 0, R: 0 },
          };
          current.total += 1;
          if (category) {
            current.byCategory[category] += 1;
          }
          troopMap.set(troopName, current);
        });

      const troopRows = Array.from(troopMap.values()).sort((a, b) => {
        if (b.total !== a.total) {
          return b.total - a.total;
        }
        return a.troopName.localeCompare(b.troopName, 'cs');
      });
      setTroopCounts(troopRows);
    };

    void loadStats();

    return () => {
      canceled = true;
    };
  }, [eventId]);

  return (
    <section
      id={toAdminSectionId('stats')}
      className="admin-card admin-card--section admin-card--low-priority admin-section-block admin-section-block--stats"
    >
      <header className="admin-card-header">
        <div>
          <h2>Statistiky</h2>
          <p className="admin-card-subtitle">
            Souhrnné statistiky po závodě: čekání, body a oddíly.
          </p>
        </div>
      </header>
      {loading ? <p className="admin-card-subtitle">Načítám statistiky…</p> : null}
      {error ? <p className="admin-error">{error}</p> : null}

      {!loading && !error ? (
        <>
          <div className="admin-placeholder-grid">
            <div className="admin-placeholder-item">
              <strong>Medián čekání celkem (min)</strong>
              <span>{formatStatNumber(overallWaitMedian)}</span>
            </div>
            <div className="admin-placeholder-item">
              <strong>Záznamy čekání</strong>
              <span>{waitSamplesCount}</span>
            </div>
          </div>

          <section className="admin-setup-block">
            <h3>Medián čekání po kategorii (min)</h3>
            <div className="admin-placeholder-grid">
              {STATS_CATEGORY_ORDER.map((category) => (
                <div key={`wait-median-${category}`} className="admin-placeholder-item">
                  <strong>{category}</strong>
                  <span>{formatStatNumber(categoryWaitMedians[category])}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="admin-setup-block">
            <h3>Celkové čekání a průměr bodů na stanovišti</h3>
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Stanoviště</th>
                    <th>Celkové čekání (min)</th>
                    <th>Medián čekání (min)</th>
                    <th>Průměr bodů</th>
                  </tr>
                </thead>
                <tbody>
                  {stationSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={4}>Zatím nejsou dostupná data.</td>
                    </tr>
                  ) : (
                    stationSummaries.map((row) => (
                      <tr key={`station-summary-${row.stationCode}`}>
                        <td>{row.stationCode}{row.stationName ? ` - ${row.stationName}` : ''}</td>
                        <td>{row.totalWaitMinutes}</td>
                        <td>{formatStatNumber(row.medianWaitMinutes)}</td>
                        <td>{formatStatNumber(row.averagePoints, 2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-setup-block">
            <h3>Průměr bodů na stanovišti v kategorii</h3>
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Stanoviště</th>
                    {STATS_CATEGORY_ORDER.map((category) => (
                      <th key={`station-category-head-${category}`}>{category}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stationCategoryAverages.length === 0 ? (
                    <tr>
                      <td colSpan={5}>Zatím nejsou dostupná data.</td>
                    </tr>
                  ) : (
                    stationCategoryAverages.map((row) => (
                      <tr key={`station-category-average-${row.stationCode}`}>
                        <td>{row.stationCode}{row.stationName ? ` - ${row.stationName}` : ''}</td>
                        {STATS_CATEGORY_ORDER.map((category) => (
                          <td key={`station-category-average-${row.stationCode}-${category}`}>
                            {formatStatNumber(row.averages[category], 2)}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-setup-block">
            <h3>Počet hlídek z oddílů</h3>
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Oddíl</th>
                    <th>Celkem</th>
                    {STATS_CATEGORY_ORDER.map((category) => (
                      <th key={`troop-category-head-${category}`}>{category}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {troopCounts.length === 0 ? (
                    <tr>
                      <td colSpan={6}>Zatím nejsou dostupná data.</td>
                    </tr>
                  ) : (
                    troopCounts.map((row) => (
                      <tr key={`troop-count-${row.troopName}`}>
                        <td>{row.troopName}</td>
                        <td>{row.total}</td>
                        {STATS_CATEGORY_ORDER.map((category) => (
                          <td key={`troop-count-${row.troopName}-${category}`}>{row.byCategory[category]}</td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}

type ExportsOverviewSectionProps = {
  showExportsSection: boolean;
  onToggle: () => void;
  onExportNameCheck: () => void;
  exportingNames: boolean;
};

export function AdminExportsOverviewSection({
  showExportsSection,
  onToggle,
  onExportNameCheck,
  exportingNames,
}: ExportsOverviewSectionProps) {
  return (
    <section
      id={toAdminSectionId('exports')}
      className="admin-card admin-card--section admin-card--low-priority admin-section-block admin-section-block--exports"
    >
      <header className="admin-card-header">
        <div>
          <h2>Exporty, importy a technická správa</h2>
          <p className="admin-card-subtitle">
            Diagnostika, exporty a servisní operace. Sekce je defaultně sbalená.
          </p>
        </div>
        <div className="admin-card-actions">
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={onToggle}
          >
            {showExportsSection ? 'Skrýt exporty a techniku' : 'Zobrazit exporty a techniku'}
          </button>
        </div>
      </header>
      {showExportsSection ? (
        <>
          <div className="admin-card-actions">
            <button
              type="button"
              className="admin-button admin-button--secondary"
              onClick={onExportNameCheck}
              disabled={exportingNames}
            >
              {exportingNames ? 'Exportuji…' : 'Export kontrola jmen'}
            </button>
          </div>
          <p className="admin-card-subtitle">
            TODO: audit log, offline queue/debug, diagnostika synchronizace a API nástroje.
          </p>
        </>
      ) : (
        <p className="admin-card-subtitle">Exporty a technická správa jsou skryté.</p>
      )}
    </section>
  );
}
