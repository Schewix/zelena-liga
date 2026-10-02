export type LeagueHistoryColumn = {
  season_label: string;
  ordinal: string;
};

export type LeagueHistoryRow = {
  id: string;
  troop_number: string;
  name: string;
  points: Record<string, number>;
};

export type LeagueHistoryData = {
  columns: LeagueHistoryColumn[];
  rows: LeagueHistoryRow[];
};

export type LeagueHistoryRankedRow = LeagueHistoryRow & {
  total: number;
  rankLabel: string;
};

export function normalizeLeagueHistory(raw: any): LeagueHistoryData {
  const columns: LeagueHistoryColumn[] = Array.isArray(raw?.columns)
    ? raw.columns
      .filter((column: any) => typeof column?.season_label === 'string' && column.season_label.trim())
      .map((column: any) => ({
        season_label: column.season_label.trim(),
        ordinal: typeof column.ordinal === 'string' ? column.ordinal : '',
      }))
    : [];
  const rows: LeagueHistoryRow[] = Array.isArray(raw?.rows)
    ? raw.rows
      .filter((row: any) => typeof row?.id === 'string' && typeof row?.name === 'string')
      .map((row: any) => {
        const points: Record<string, number> = {};
        Object.entries(row.points ?? {}).forEach(([label, value]) => {
          const parsed = typeof value === 'number' ? value : Number(value);
          if (Number.isFinite(parsed)) {
            points[label] = parsed;
          }
        });
        return {
          id: row.id,
          troop_number: typeof row.troop_number === 'string' ? row.troop_number : '',
          name: row.name,
          points,
        };
      })
    : [];
  return { columns, rows };
}

export function getLeagueHistoryTotal(row: LeagueHistoryRow, columns: LeagueHistoryColumn[]): number {
  return columns.reduce((sum, column) => sum + (row.points[column.season_label] ?? 0), 0);
}

/** Sorts by total points; tied rows share a range label such as "18.–19.". */
export function rankLeagueHistory(data: LeagueHistoryData): LeagueHistoryRankedRow[] {
  const sorted = data.rows
    .map((row, index) => ({ row, index, total: getLeagueHistoryTotal(row, data.columns) }))
    .sort((a, b) => b.total - a.total || a.index - b.index);
  const result: LeagueHistoryRankedRow[] = [];
  let start = 0;
  while (start < sorted.length) {
    let end = start;
    while (end + 1 < sorted.length && sorted[end + 1].total === sorted[start].total) {
      end += 1;
    }
    const rankLabel = end > start ? `${start + 1}.–${end + 1}.` : `${start + 1}.`;
    for (let i = start; i <= end; i += 1) {
      result.push({ ...sorted[i].row, total: sorted[i].total, rankLabel });
    }
    start = end + 1;
  }
  return result;
}

export function formatHistoryPoints(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '';
  }
  return value.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });
}
