import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { comparePatrolOrder } from '../exports/patrolWorkbook';
import { normalizeText } from '../shared/text';

type PatrolOverviewRow = {
  id: string;
  code: string;
  teamName: string;
  category: string;
  sex: string;
  active: boolean;
  disqualified: boolean;
  passages: number;
  finished: boolean;
  points: number;
};

type StatusKey = 'waiting' | 'course' | 'finished' | 'out' | 'dsq';
type StatusFilter = 'all' | StatusKey;

const STATUS_LABELS: Record<StatusKey, string> = {
  waiting: 'Čeká na start',
  course: 'Na trati',
  finished: 'V cíli',
  out: 'Mimo soutěž',
  dsq: 'Diskvalifikována',
};

const PAGE_SIZE = 1000;

const FINISH_STATION_CODE = 'T';

const CATEGORY_FILTER_OPTIONS = ['N', 'NH', 'ND', 'M', 'MH', 'MD', 'S', 'SH', 'SD', 'R', 'RH', 'RD'] as const;

function toStatus(row: Pick<PatrolOverviewRow, 'active' | 'disqualified' | 'passages' | 'finished'>): StatusKey {
  if (row.disqualified) {
    return 'dsq';
  }
  if (!row.active) {
    return 'out';
  }
  if (row.finished) {
    return 'finished';
  }
  return row.passages > 0 ? 'course' : 'waiting';
}

async function loadAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const result: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) {
      throw error;
    }
    const page = data ?? [];
    result.push(...page);
    if (page.length < PAGE_SIZE) {
      return result;
    }
  }
}

type PatrolsOverviewSectionProps = {
  eventId: string;
};

export function PatrolsOverviewSection({ eventId }: PatrolsOverviewSectionProps) {
  const [rows, setRows] = useState<PatrolOverviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [patrols, passages, scores] = await Promise.all([
        loadAllRows<{
          id: string;
          patrol_code: string | null;
          team_name: string | null;
          category: string | null;
          sex: string | null;
          active: boolean | null;
          disqualified: boolean | null;
        }>((from, to) =>
          supabase
            .from('patrols')
            .select('id, patrol_code, team_name, category, sex, active, disqualified')
            .eq('event_id', eventId)
            .order('id')
            .range(from, to),
        ),
        loadAllRows<{ patrol_id: string; stations: { code: string } | { code: string }[] | null }>((from, to) =>
          supabase
            .from('station_passages')
            .select('patrol_id, stations(code)')
            .eq('event_id', eventId)
            .order('id')
            .range(from, to),
        ),
        loadAllRows<{ patrol_id: string; points: number | null }>((from, to) =>
          supabase
            .from('station_scores')
            .select('patrol_id, points')
            .eq('event_id', eventId)
            .order('id')
            .range(from, to),
        ),
      ]);

      const passageCounts = new Map<string, number>();
      const finishedIds = new Set<string>();
      passages.forEach((row) => {
        const station = Array.isArray(row.stations) ? row.stations[0] : row.stations;
        if (normalizeText(station?.code).toUpperCase() === FINISH_STATION_CODE) {
          finishedIds.add(row.patrol_id);
        }
        passageCounts.set(row.patrol_id, (passageCounts.get(row.patrol_id) ?? 0) + 1);
      });
      const pointSums = new Map<string, number>();
      scores.forEach((row) => {
        pointSums.set(row.patrol_id, (pointSums.get(row.patrol_id) ?? 0) + (row.points ?? 0));
      });

      const next = patrols
        .map<PatrolOverviewRow & { patrol_code: string | null }>((row) => ({
          id: row.id,
          patrol_code: row.patrol_code,
          code: normalizeText(row.patrol_code).toUpperCase(),
          teamName: normalizeText(row.team_name),
          category: normalizeText(row.category),
          sex: normalizeText(row.sex),
          active: row.active !== false,
          disqualified: row.disqualified === true,
          passages: passageCounts.get(row.id) ?? 0,
          finished: finishedIds.has(row.id),
          points: pointSums.get(row.id) ?? 0,
        }))
        .sort((a, b) => comparePatrolOrder(
          { patrol_code: a.patrol_code, category: a.category, sex: a.sex },
          { patrol_code: b.patrol_code, category: b.category, sex: b.sex },
        ));
      setRows(next);
    } catch (loadError) {
      console.error('Failed to load patrols overview', loadError);
      setError('Nepodařilo se načíst přehled hlídek.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const result: Record<StatusKey, number> = { waiting: 0, course: 0, finished: 0, out: 0, dsq: 0 };
    rows.forEach((row) => {
      result[toStatus(row)] += 1;
    });
    return result;
  }, [rows]);

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (categoryFilter !== 'all' && !`${row.category}${row.sex}`.toUpperCase().startsWith(categoryFilter)) {
        return false;
      }
      if (statusFilter !== 'all' && toStatus(row) !== statusFilter) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return row.code.toLowerCase().includes(needle) || row.teamName.toLowerCase().includes(needle);
    });
  }, [rows, search, categoryFilter, statusFilter]);

  return (
    <section className="admin-card admin-card--with-divider admin-card--section admin-section-block admin-section-block--patrols">
      <header className="admin-card-header">
        <div>
          <h2>Přehled hlídek</h2>
          <p className="admin-card-subtitle">
            {`Celkem ${rows.length} · Čeká na start ${counts.waiting} · Na trati ${counts.course} · V cíli ${counts.finished} · Mimo soutěž ${counts.out} · Diskvalifikované ${counts.dsq}`}
          </p>
        </div>
        <div className="admin-card-actions">
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? 'Načítám…' : 'Obnovit přehled'}
          </button>
        </div>
      </header>
      <div className="admin-card-actions">
        <input
          type="search"
          placeholder="Hledat kód nebo název"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Hledat hlídku"
        />
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          aria-label="Kategorie"
        >
          <option value="all">Všechny kategorie</option>
          {CATEGORY_FILTER_OPTIONS.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          aria-label="Stav"
        >
          <option value="all">Všechny stavy</option>
          {(Object.keys(STATUS_LABELS) as StatusKey[]).map((key) => (
            <option key={key} value={key}>
              {STATUS_LABELS[key]}
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="admin-error">{error}</p> : null}
      {!loading && !error && rows.length === 0 ? <p>V ročníku zatím nejsou žádné hlídky.</p> : null}
      {rows.length > 0 ? (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Kód</th>
                <th>Název</th>
                <th>Kategorie</th>
                <th>Stav</th>
                <th>Stanoviště</th>
                <th>Body</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.code}</td>
                  <td>{row.teamName || '—'}</td>
                  <td>{`${row.category}${row.sex ? ` ${row.sex}` : ''}`}</td>
                  <td>{STATUS_LABELS[toStatus(row)]}</td>
                  <td>{row.passages}</td>
                  <td>{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRows.length === 0 ? <p>Žádná hlídka neodpovídá filtru.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
