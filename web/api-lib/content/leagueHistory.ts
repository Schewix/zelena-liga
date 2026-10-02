import { logger } from '../logger.js';
import { resolveBody } from './articles/model.js';
import { requireEditor } from './editorAuth.js';
import { getSupabaseAdminClient } from './supabaseAdmin.js';

export type LeagueHistoryColumn = {
  season_label: string;
  ordinal: string;
  order_index: number;
};

export type LeagueHistoryRow = {
  id: string;
  troop_number: string;
  name: string;
  order_index: number;
  points: Record<string, number>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePoints(raw: unknown, labels: Set<string>): Record<string, number> {
  const points: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') {
    return points;
  }
  Object.entries(raw as Record<string, unknown>).forEach(([label, value]) => {
    if (!labels.has(label) || value === null || value === '') {
      return;
    }
    const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
    if (Number.isFinite(parsed) && parsed >= 0) {
      points[label] = parsed;
    }
  });
  return points;
}

export function parseLeagueHistory(payload: Record<string, unknown>) {
  const rawColumns = Array.isArray(payload.columns) ? payload.columns : [];
  const seen = new Set<string>();
  const columns: LeagueHistoryColumn[] = [];
  rawColumns.forEach((entry: any) => {
    const label = typeof entry?.season_label === 'string' ? entry.season_label.trim() : '';
    if (!label || seen.has(label)) {
      return;
    }
    seen.add(label);
    columns.push({
      season_label: label,
      ordinal: typeof entry?.ordinal === 'string' ? entry.ordinal.trim() : '',
      order_index: columns.length,
    });
  });

  const rawRows = Array.isArray(payload.rows) ? payload.rows : [];
  const rows: LeagueHistoryRow[] = [];
  rawRows.forEach((entry: any) => {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    if (!name) {
      return;
    }
    rows.push({
      id: typeof entry?.id === 'string' && UUID_PATTERN.test(entry.id) ? entry.id : crypto.randomUUID(),
      troop_number: typeof entry?.troop_number === 'string' ? entry.troop_number.trim() : '',
      name,
      order_index: rows.length,
      points: parsePoints(entry?.points, seen),
    });
  });
  return { columns, rows };
}

export async function loadLeagueHistory(supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const [columnsResult, rowsResult] = await Promise.all([
    supabase
      .from('content_league_history_columns')
      .select('season_label,ordinal,order_index')
      .order('order_index', { ascending: true }),
    supabase
      .from('content_league_history_rows')
      .select('id,troop_number,name,order_index,points')
      .order('order_index', { ascending: true }),
  ]);
  if (columnsResult.error) {
    throw columnsResult.error;
  }
  if (rowsResult.error) {
    throw rowsResult.error;
  }
  return {
    columns: (columnsResult.data ?? []) as LeagueHistoryColumn[],
    rows: (rowsResult.data ?? []) as LeagueHistoryRow[],
  };
}

export async function handlePublicLeagueHistory(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const payload = await loadLeagueHistory(getSupabaseAdminClient());
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.status(200).json(payload);
  } catch (error) {
    logger.error('[api/content/league-history] failed to load', error);
    res.status(500).json({ error: 'Failed to load league history.' });
  }
}

export async function handleAdminLeagueHistory(req: any, res: any) {
  if (!requireEditor(req, res)) {
    return;
  }
  const supabase = getSupabaseAdminClient();

  if (req.method === 'GET') {
    try {
      res.status(200).json(await loadLeagueHistory(supabase));
    } catch (error) {
      logger.error('[api/content/admin/league-history] failed to load', error);
      res.status(500).json({ error: 'Failed to load league history.' });
    }
    return;
  }

  if (req.method === 'PUT') {
    const { columns, rows } = parseLeagueHistory(resolveBody(req));
    if (columns.length === 0) {
      res.status(400).json({ error: 'Invalid payload.' });
      return;
    }
    try {
      const { error: columnsError } = await supabase
        .from('content_league_history_columns')
        .upsert(columns, { onConflict: 'season_label' });
      if (columnsError) {
        throw columnsError;
      }
      const { error: dropColumnsError } = await supabase
        .from('content_league_history_columns')
        .delete()
        .not('season_label', 'in', `(${columns.map((column) => `"${column.season_label.replace(/"/g, '""')}"`).join(',')})`);
      if (dropColumnsError) {
        throw dropColumnsError;
      }

      if (rows.length > 0) {
        const { error: rowsError } = await supabase
          .from('content_league_history_rows')
          .upsert(rows, { onConflict: 'id' });
        if (rowsError) {
          throw rowsError;
        }
        const { error: dropRowsError } = await supabase
          .from('content_league_history_rows')
          .delete()
          .not('id', 'in', `(${rows.map((row) => row.id).join(',')})`);
        if (dropRowsError) {
          throw dropRowsError;
        }
      } else {
        const { error: clearError } = await supabase
          .from('content_league_history_rows')
          .delete()
          .not('id', 'is', null);
        if (clearError) {
          throw clearError;
        }
      }

      res.status(200).json({ ok: true, ...(await loadLeagueHistory(supabase)) });
    } catch (error) {
      logger.error('[api/content/admin/league-history] failed to save', error);
      res.status(500).json({ error: 'Failed to save league history.' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
