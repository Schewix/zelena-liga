export const ZL_BAND_POINTS = [16, 12, 9, 6, 4, 2, 1] as const;
const ZL_GAUSS_CENTER_INDEX = 2;
const ZL_GAUSS_SIGMA = 1.35;
const ZL_GAUSS_RATIO_PENALTY_WEIGHT = 0.35;
const ZL_GAUSS_DROPPED_PENALTY_WEIGHT = 0.08;
const toNumeric = (value: number): number | null => (Number.isFinite(value) ? value : null);

export type BandInput = {
  id: string;
  group: string;
  score: number | null;
  status: 'finished' | 'DSQ' | 'DNF' | 'DNS';
  lowerIsBetter: boolean;
};
export type BandProposal = {
  zlPointsNoCutoff: number;
  zlPointsWithCutoff: number;
  zlPointsGaussWithCutoff: number;
  zlPointsGaussOpenCutoff: number;
  cutoffDropped: boolean;
  gaussCutoffDropped: boolean;
  gaussOpenCutoffDropped: boolean;
};
type BandRow = BandProposal & { id: string; total_points: number };

export function proposeBands(input: BandInput[]): Map<string, BandProposal> {
  const results = new Map<string, BandProposal>();
  const scoringPools = new Map<string, BandRow[]>();
  const groups = new Map<string, BandInput[]>();
  for (const row of input) {
    const points = row.status === 'DNF' ? 1 : 0;
    const proposal: BandRow = {
      id: row.id,
      total_points: row.score ?? 0,
      zlPointsNoCutoff: points,
      zlPointsWithCutoff: points,
      zlPointsGaussWithCutoff: points,
      zlPointsGaussOpenCutoff: points,
      cutoffDropped: false,
      gaussCutoffDropped: false,
      gaussOpenCutoffDropped: false,
    };
    results.set(row.id, proposal);
    if (row.status !== 'finished') continue;
    if (row.score === null || !Number.isFinite(row.score)) throw new Error('Chybí platný výsledek.');
    const group = groups.get(row.group) ?? [];
    if (group.length && group[0].lowerIsBetter !== row.lowerIsBetter)
      throw new Error(`Skupina ${row.group} kombinuje opačné směry hodnocení.`);
    group.push(row);
    groups.set(row.group, group);
  }
  for (const [key, group] of groups) {
    const scores = group.map((row) => row.score!);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    scoringPools.set(
      key,
      group.map((row) => {
        const result = results.get(row.id) as BandRow;
        // Mirror ascending results while keeping positive scores and equal-score ties.
        result.total_points =
          (row.lowerIsBetter ? max + min - row.score! : row.score!) + (min < 0 ? -min : 0);
        return result;
      }),
    );
  }

  type AutomaticCutoffCandidate = {
    index: number;
    gap: number;
    weighted: number;
    cutoffIndex: number;
  };

  const collectAutomaticCutoffCandidates = (pool: BandRow[]) => {
    if (pool.length < 5) {
      return [] as AutomaticCutoffCandidate[];
    }

    const totals = pool.map((row) => toNumeric(row.total_points));
    const baseCandidates: Array<{ index: number; gap: number; weighted: number }> = [];
    const startIndex = Math.floor((pool.length - 1) / 2);
    for (let index = startIndex; index < pool.length - 1; index += 1) {
      const currentTotal = totals[index];
      const nextTotal = totals[index + 1];
      if (currentTotal === null || nextTotal === null) {
        continue;
      }
      const gap = currentTotal - nextTotal;
      if (gap <= 0) {
        continue;
      }
      const tailCount = pool.length - (index + 1);
      const weighted = gap * Math.log(tailCount + 1.5);
      baseCandidates.push({ index, gap, weighted });
    }
    if (!baseCandidates.length) {
      return [] as AutomaticCutoffCandidate[];
    }

    const sortedGaps = baseCandidates.map((candidate) => candidate.gap).sort((a, b) => a - b);
    const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)] ?? 0;
    const minRequiredGap = medianGap * 2;

    const selectedCandidates = baseCandidates
      .filter((candidate) => candidate.gap > minRequiredGap)
      .map((candidate) => {
        let cutoffIndex = candidate.index + 1;
        while (cutoffIndex < pool.length) {
          const previousTotal = totals[cutoffIndex - 1];
          const currentTotal = totals[cutoffIndex];
          if (previousTotal === null || currentTotal === null || previousTotal !== currentTotal) {
            break;
          }
          cutoffIndex += 1;
        }
        return {
          ...candidate,
          cutoffIndex,
        };
      })
      .filter((candidate) => candidate.cutoffIndex < pool.length && candidate.cutoffIndex >= 3)
      .sort((a, b) => b.weighted - a.weighted || b.gap - a.gap || a.index - b.index);

    return selectedCandidates;
  };

  const findAutomaticCutoffIndex = (pool: BandRow[]) => {
    const candidates = collectAutomaticCutoffCandidates(pool);
    return candidates.length ? candidates[0].cutoffIndex : null;
  };

  const collectGaussOpenCutoffCandidates = (pool: BandRow[]) => {
    if (pool.length < 5) {
      return [] as AutomaticCutoffCandidate[];
    }

    const totals = pool.map((row) => toNumeric(row.total_points));
    const startIndex = Math.floor((pool.length - 1) / 2);
    const selectedCandidates: AutomaticCutoffCandidate[] = [];
    for (let index = startIndex; index < pool.length - 1; index += 1) {
      const currentTotal = totals[index];
      const nextTotal = totals[index + 1];
      if (currentTotal === null || nextTotal === null) {
        continue;
      }
      const gap = currentTotal - nextTotal;
      if (gap <= 0) {
        continue;
      }
      const tailCount = pool.length - (index + 1);
      const weighted = gap * Math.log(tailCount + 1.5);
      let cutoffIndex = index + 1;
      while (cutoffIndex < pool.length) {
        const previousTotal = totals[cutoffIndex - 1];
        const currentAtCutoff = totals[cutoffIndex];
        if (previousTotal === null || currentAtCutoff === null || previousTotal !== currentAtCutoff) {
          break;
        }
        cutoffIndex += 1;
      }
      if (cutoffIndex >= pool.length || cutoffIndex < 3) {
        continue;
      }
      selectedCandidates.push({
        index,
        gap,
        weighted,
        cutoffIndex,
      });
    }
    return selectedCandidates.sort((a, b) => b.weighted - a.weighted || b.gap - a.gap || a.index - b.index);
  };

  const assignBandPoints = (pool: BandRow[], applyPoints: (row: BandRow, points: number) => void) => {
    const rowsWithTotals = pool.filter((row) => toNumeric(row.total_points) !== null);
    const bestTotal = rowsWithTotals.length ? toNumeric(rowsWithTotals[0].total_points) : null;
    const worstTotal = rowsWithTotals.length
      ? toNumeric(rowsWithTotals[rowsWithTotals.length - 1].total_points)
      : null;
    const step = bestTotal !== null && worstTotal !== null ? (bestTotal - worstTotal) / 7 : null;
    const epsilon = 1e-9;

    pool.forEach((row) => {
      const total = toNumeric(row.total_points);
      let band = 7;
      if (total !== null && bestTotal !== null && step !== null) {
        if (step <= epsilon) {
          band = 1;
        } else {
          const distanceFromBest = bestTotal - total;
          for (let candidateBand = 1; candidateBand <= 6; candidateBand += 1) {
            if (distanceFromBest <= step * candidateBand + epsilon) {
              band = candidateBand;
              break;
            }
          }
        }
      }
      const points = ZL_BAND_POINTS[Math.max(0, Math.min(ZL_BAND_POINTS.length - 1, band - 1))];
      applyPoints(row, points);
    });
  };

  const gaussTargetShares = (() => {
    const weights = ZL_BAND_POINTS.map((_, index) => {
      const distance = index - ZL_GAUSS_CENTER_INDEX;
      return Math.exp(-(distance * distance) / (2 * ZL_GAUSS_SIGMA * ZL_GAUSS_SIGMA));
    });
    const weightSum = weights.reduce((sum, value) => sum + value, 0) || 1;
    return weights.map((value) => value / weightSum);
  })();

  const evaluateGaussCutoff = (pool: BandRow[], cutoffIndex: number | null) => {
    const evaluatedPool = cutoffIndex === null ? pool : pool.slice(0, cutoffIndex);
    if (!evaluatedPool.length) {
      return {
        totalScore: Number.POSITIVE_INFINITY,
        distributionError: Number.POSITIVE_INFINITY,
        ratioPenalty: Number.POSITIVE_INFINITY,
        droppedPenalty: Number.POSITIVE_INFINITY,
      };
    }

    const pointsByRow = new Map<BandRow, number>();
    assignBandPoints(evaluatedPool, (row, points) => {
      pointsByRow.set(row, points);
    });

    const bandCounts = ZL_BAND_POINTS.map(() => 0);
    evaluatedPool.forEach((row) => {
      const points = pointsByRow.get(row) ?? 1;
      const bandIndex = ZL_BAND_POINTS.findIndex((value) => value === points);
      const safeIndex = bandIndex >= 0 ? bandIndex : ZL_BAND_POINTS.length - 1;
      bandCounts[safeIndex] += 1;
    });

    const distributionError = bandCounts.reduce((sum, count, index) => {
      const actualShare = count / evaluatedPool.length;
      const delta = actualShare - gaussTargetShares[index];
      return sum + delta * delta;
    }, 0);

    const bestTotal = toNumeric(evaluatedPool[0].total_points);
    const worstTotal = toNumeric(evaluatedPool[evaluatedPool.length - 1].total_points);
    const ratioPenalty =
      bestTotal !== null && worstTotal !== null && bestTotal > 0
        ? Math.max(0, 1 - Math.max(0, Math.min(1, worstTotal / bestTotal)))
        : 0;

    const droppedCount = cutoffIndex === null ? 0 : Math.max(0, pool.length - cutoffIndex);
    const droppedPenalty = pool.length ? droppedCount / pool.length : 0;

    const totalScore =
      distributionError +
      ratioPenalty * ZL_GAUSS_RATIO_PENALTY_WEIGHT +
      droppedPenalty * ZL_GAUSS_DROPPED_PENALTY_WEIGHT;

    return {
      totalScore,
      distributionError,
      ratioPenalty,
      droppedPenalty,
    };
  };

  const pickBestGaussCutoffIndex = (pool: BandRow[], candidateCutoffIndices: number[]) => {
    let bestCutoffIndex: number | null = null;
    let bestEvaluation = evaluateGaussCutoff(pool, null);

    candidateCutoffIndices.forEach((candidateCutoffIndex) => {
      const candidateEvaluation = evaluateGaussCutoff(pool, candidateCutoffIndex);
      const hasBetterScore = candidateEvaluation.totalScore < bestEvaluation.totalScore - 1e-9;
      const hasEqualScore = Math.abs(candidateEvaluation.totalScore - bestEvaluation.totalScore) <= 1e-9;
      const winsByTieBreak =
        hasEqualScore &&
        (candidateEvaluation.distributionError < bestEvaluation.distributionError - 1e-9 ||
          (Math.abs(candidateEvaluation.distributionError - bestEvaluation.distributionError) <= 1e-9 &&
            (candidateEvaluation.ratioPenalty < bestEvaluation.ratioPenalty - 1e-9 ||
              (Math.abs(candidateEvaluation.ratioPenalty - bestEvaluation.ratioPenalty) <= 1e-9 &&
                candidateEvaluation.droppedPenalty < bestEvaluation.droppedPenalty - 1e-9))));

      if (hasBetterScore || winsByTieBreak) {
        bestEvaluation = candidateEvaluation;
        bestCutoffIndex = candidateCutoffIndex;
      }
    });

    return bestCutoffIndex;
  };

  scoringPools.forEach((pool) => {
    pool.sort((a, b) => b.total_points - a.total_points || a.id.localeCompare(b.id));
    pool.forEach((row) => {
      row.cutoffDropped = false;
      row.gaussCutoffDropped = false;
      row.gaussOpenCutoffDropped = false;
    });
    assignBandPoints(pool, (row, points) => {
      row.zlPointsNoCutoff = points;
      row.zlPointsWithCutoff = points;
    });

    const cutoffIndex = findAutomaticCutoffIndex(pool);
    if (cutoffIndex !== null) {
      const nonCutoffPool = pool.slice(0, cutoffIndex);
      assignBandPoints(nonCutoffPool, (row, points) => {
        row.zlPointsWithCutoff = points;
        row.cutoffDropped = false;
      });
      for (let index = cutoffIndex; index < pool.length; index += 1) {
        const row = pool[index];
        row.zlPointsWithCutoff = 1;
        row.cutoffDropped = true;
      }
    }

    const gaussCutoffCandidates: number[] = Array.from(
      new Set<number>(collectAutomaticCutoffCandidates(pool).map((candidate) => candidate.cutoffIndex)),
    ).sort((a, b) => a - b);
    const bestGaussCutoffIndex: number | null = pickBestGaussCutoffIndex(pool, gaussCutoffCandidates);

    const gaussScoredPool = bestGaussCutoffIndex === null ? pool : pool.slice(0, bestGaussCutoffIndex);
    assignBandPoints(gaussScoredPool, (row, points) => {
      row.zlPointsGaussWithCutoff = points;
      row.gaussCutoffDropped = false;
    });
    const gaussCutoffStartIndex = bestGaussCutoffIndex ?? pool.length;
    if (gaussCutoffStartIndex < pool.length) {
      for (let index = gaussCutoffStartIndex; index < pool.length; index += 1) {
        const row = pool[index];
        row.zlPointsGaussWithCutoff = 1;
        row.gaussCutoffDropped = true;
      }
    }

    const gaussOpenCutoffCandidates: number[] = Array.from(
      new Set<number>(collectGaussOpenCutoffCandidates(pool).map((candidate) => candidate.cutoffIndex)),
    ).sort((a, b) => a - b);
    const bestGaussOpenCutoffIndex: number | null = pickBestGaussCutoffIndex(pool, gaussOpenCutoffCandidates);

    const gaussOpenScoredPool =
      bestGaussOpenCutoffIndex === null ? pool : pool.slice(0, bestGaussOpenCutoffIndex);
    assignBandPoints(gaussOpenScoredPool, (row, points) => {
      row.zlPointsGaussOpenCutoff = points;
      row.gaussOpenCutoffDropped = false;
    });
    const gaussOpenCutoffStartIndex = bestGaussOpenCutoffIndex ?? pool.length;
    if (gaussOpenCutoffStartIndex < pool.length) {
      for (let index = gaussOpenCutoffStartIndex; index < pool.length; index += 1) {
        const row = pool[index];
        row.zlPointsGaussOpenCutoff = 1;
        row.gaussOpenCutoffDropped = true;
      }
    }
  });
  return results;
}
