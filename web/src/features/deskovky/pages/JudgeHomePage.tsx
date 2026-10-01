import { useEffect,useMemo,useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { assignmentMatchesBlockAndTable,loadEventSetup } from '../data';
import type {
BoardJudgeContext,
BoardMatch
} from '../types';

export function JudgeHomePage({
  judgeId,
  context,
  selectedEventId,
}: {
  judgeId: string;
  context: BoardJudgeContext;
  selectedEventId: string | null;
}) {
  const [matchProgress, setMatchProgress] = useState<{ completed: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const event = useMemo(
    () => context.events.find((item) => item.id === selectedEventId) ?? null,
    [context.events, selectedEventId],
  );

  const eventAssignments = useMemo(
    () => context.assignments.filter((assignment) => assignment.event_id === selectedEventId),
    [context.assignments, selectedEventId],
  );

  const gameMap = useMemo(
    () => new Map(context.games.map((game) => [game.id, game])),
    [context.games],
  );

  const categoryMap = useMemo(
    () => new Map(context.categories.map((category) => [category.id, category])),
    [context.categories],
  );

  useEffect(() => {
    if (!selectedEventId) {
      setMatchProgress(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      const [setup, matchesRes] = await Promise.all([
        loadEventSetup(selectedEventId),
        supabase
          .from('board_match')
          .select('id, event_id, category_id, block_id, round_number, table_number, created_by, created_at, status')
          .eq('event_id', selectedEventId)
          .neq('status', 'void'),
      ]);

      if (cancelled) {
        return;
      }

      setLoading(false);
      if (matchesRes.error) {
        console.error('Failed to load board match progress', matchesRes.error);
        setMatchProgress(null);
        return;
      }

      const blocks = setup.blocks ?? [];
      const games = setup.games ?? [];
      const blockMap = new Map(blocks.map((block) => [block.id, block]));
      const gameMap = new Map(games.map((game) => [game.id, game]));

      const eventAssignments = context.assignments.filter(
        (assignment) => assignment.event_id === selectedEventId && assignment.user_id === judgeId,
      );

      const assignedMatches = ((matchesRes.data ?? []) as BoardMatch[]).filter((match) => {
        const block = blockMap.get(match.block_id);
        if (!block) {
          return false;
        }
        return eventAssignments.some((assignment) =>
          assignmentMatchesBlockAndTable(assignment, block, match.table_number),
        );
      });

      const total = assignedMatches.length;
      if (!total) {
        setMatchProgress({ completed: 0, total: 0 });
        return;
      }

      const matchIds = assignedMatches.map((match) => match.id);
      const { data: rowsData, error: rowsError } = await supabase
        .from('board_match_player')
        .select('match_id, points, placement')
        .in('match_id', matchIds);

      if (cancelled) {
        return;
      }

      if (rowsError) {
        console.error('Failed to load board match rows for progress', rowsError);
        setMatchProgress(null);
        return;
      }

      const rowsByMatch = new Map<string, Array<{ points: number | null; placement: number | null }>>();
      for (const row of (rowsData ?? []) as Array<{ match_id: string; points: number | null; placement: number | null }>) {
        const list = rowsByMatch.get(row.match_id) ?? [];
        list.push({ points: row.points, placement: row.placement });
        rowsByMatch.set(row.match_id, list);
      }

      let completed = 0;
      for (const match of assignedMatches) {
        const block = blockMap.get(match.block_id);
        if (!block) {
          continue;
        }
        const game = gameMap.get(block.game_id);
        const scoringType = game?.scoring_type ?? 'both';
        const rows = rowsByMatch.get(match.id) ?? [];
        if (!rows.length) {
          continue;
        }

        const isMatchComplete = rows.every((row) => {
          const hasPoints = row.points !== null;
          const hasPlacement = row.placement !== null;
          if (scoringType === 'points') {
            return hasPoints;
          }
          if (scoringType === 'placement') {
            return hasPlacement;
          }
          return hasPoints || hasPlacement;
        });

        if (isMatchComplete) {
          completed += 1;
        }
      }

      setMatchProgress({ completed, total });
    })();

    return () => {
      cancelled = true;
    };
  }, [context.assignments, judgeId, selectedEventId]);

  if (!context.events.length) {
    return (
      <section className="admin-card">
        <h2>Deskové hry</h2>
        <p className="admin-card-subtitle">
          K tomuto účtu zatím není přiřazená žádná hra. Požádej administrátora o přiřazení.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="admin-card">
        <header className="admin-card-header">
          <div>
            <h2>Moje přiřazení</h2>
            <p className="admin-card-subtitle">
              {event ? `Event: ${event.name}` : 'Není vybraný event.'}
            </p>
          </div>
          <div className="deskovky-kpi">
            <span>Hotovo / přiřazeno</span>
            <strong>{loading ? '…' : matchProgress ? `${matchProgress.completed}/${matchProgress.total}` : '—'}</strong>
          </div>
        </header>

        {eventAssignments.length ? (
          <div className="deskovky-assignment-grid">
            {eventAssignments.map((assignment) => {
              const game = gameMap.get(assignment.game_id);
              const category = assignment.category_id ? categoryMap.get(assignment.category_id) : null;
              return (
                <article key={assignment.id} className="deskovky-assignment-card">
                  <h3>{game?.name ?? assignment.game_id}</h3>
                  <p>
                    Kategorie:{' '}
                    <strong>{category?.name ?? 'Všechny v rámci přiřazené hry'}</strong>
                  </p>
                  <p>
                    Stůl: <strong>{assignment.table_number ?? '—'}</strong>
                  </p>
                  <p className="admin-card-subtitle">
                    Typ bodování: {game?.scoring_type ?? '—'}
                  </p>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="admin-card-subtitle">Pro vybraný event nemáš žádná přiřazení.</p>
        )}
      </section>
    </>
  );
}
