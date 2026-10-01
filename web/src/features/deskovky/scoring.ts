import { MatchEntry } from './pageTypes';
import type {
BoardPointsOrder,
BoardScoringType
} from './types';

export function buildInitialMatchEntries(): MatchEntry[] {
  return [1, 2, 3, 4].map((seat) => ({
    seat,
    player: null,
    points: '',
    placement: '',
  }));
}

export function parseNumeric(value: string): number | null {
  const normalized = value.replace(',', '.').trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

export function buildPlacementsFromPoints(
  entries: Array<{ id: string; seat: number; points: string }>,
  pointsOrder: BoardPointsOrder,
): Map<string, number> {
  const scored = entries
    .map((entry) => ({
      id: entry.id,
      seat: entry.seat,
      points: parseNumeric(entry.points),
    }))
    .filter((entry): entry is { id: string; seat: number; points: number } => entry.points !== null)
    .sort((a, b) => {
      if (a.points === b.points) {
        return a.seat - b.seat;
      }
      return pointsOrder === 'asc' ? a.points - b.points : b.points - a.points;
    });

  const placements = new Map<string, number>();
  let index = 0;

  while (index < scored.length) {
    const start = index;
    const tiedPoints = scored[index].points;
    while (index + 1 < scored.length && scored[index + 1].points === tiedPoints) {
      index += 1;
    }

    const end = index;
    const averageRank = ((start + 1) + (end + 1)) / 2;
    for (let i = start; i <= end; i += 1) {
      placements.set(scored[i].id, averageRank);
    }

    index += 1;
  }

  return placements;
}

export function resolvePlacementForSave({
  scoringType,
  parsedPoints,
  parsedPlacement,
  autoPlacement,
}: {
  scoringType: BoardScoringType;
  parsedPoints: number | null;
  parsedPlacement: number | null;
  autoPlacement: number | null;
}): number | null {
  if (scoringType === 'placement') {
    return parsedPlacement;
  }
  if (scoringType === 'both') {
    if (parsedPlacement !== null) {
      return parsedPlacement;
    }
    if (parsedPoints !== null) {
      return autoPlacement;
    }
    return null;
  }
  return null;
}

export function getScoringInputs(scoringType: BoardScoringType) {
  return {
    showPoints: scoringType === 'points' || scoringType === 'both',
    showPlacement: scoringType === 'placement' || scoringType === 'both',
  };
}
