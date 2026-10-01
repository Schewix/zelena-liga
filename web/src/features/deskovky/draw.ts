import { slugify } from './admin/helpers';
import type {
BoardBlock,
BoardPlayer
} from './types';

export function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

export type DrawTable = {
  tableNumber: number;
  playerIds: string[];
};

export type DrawRound = {
  roundNumber: number;
  tables: DrawTable[];
};

export type DrawBlockPlan = {
  block: BoardBlock;
  rounds: DrawRound[];
  usedRelaxedSameTeamRule?: boolean;
};

export type OpponentCounts = Map<string, Map<string, number>>;

export type DrawAttempt = { groups: BoardPlayer[][]; penalty: number };

export const BOARD_DRAW_MAX_TABLES_PER_GAME = 25;

export const BOARD_DRAW_MAX_PLAYERS_PER_BLOCK = BOARD_DRAW_MAX_TABLES_PER_GAME * 4;

export type SameTeamPairStats = {
  totalPairs: number;
  topTeams: Array<{ teamLabel: string; count: number }>;
  byCategory: Array<{ categoryLabel: string; count: number }>;
};

export function buildSameTeamPairStats(
  plannedRows: Array<{
    match: {
      category_id: string;
    };
    players: string[];
  }>,
  playersById: Map<string, BoardPlayer>,
  categoryNamesById: Map<string, string>,
): SameTeamPairStats {
  const teamCounts = new Map<string, number>();
  const teamLabels = new Map<string, string>();
  const categoryCounts = new Map<string, number>();
  let totalPairs = 0;

  for (const planned of plannedRows) {
    const categoryLabel = categoryNamesById.get(planned.match.category_id) ?? planned.match.category_id;
    for (let i = 0; i < planned.players.length; i += 1) {
      for (let j = i + 1; j < planned.players.length; j += 1) {
        const playerA = playersById.get(planned.players[i]);
        const playerB = playersById.get(planned.players[j]);
        if (!playerA || !playerB) {
          continue;
        }
        const teamKeyA = getTeamKey(playerA.team_name);
        const teamKeyB = getTeamKey(playerB.team_name);
        if (!teamKeyA || teamKeyA !== teamKeyB) {
          continue;
        }

        totalPairs += 1;
        teamCounts.set(teamKeyA, (teamCounts.get(teamKeyA) ?? 0) + 1);
        categoryCounts.set(categoryLabel, (categoryCounts.get(categoryLabel) ?? 0) + 1);
        if (!teamLabels.has(teamKeyA)) {
          const label = (playerA.team_name ?? '').trim() || (playerB.team_name ?? '').trim() || teamKeyA;
          teamLabels.set(teamKeyA, label);
        }
      }
    }
  }

  return {
    totalPairs,
    topTeams: [...teamCounts.entries()]
      .map(([teamKey, count]) => ({
        teamLabel: teamLabels.get(teamKey) ?? teamKey,
        count,
      }))
      .sort((a, b) => b.count - a.count || a.teamLabel.localeCompare(b.teamLabel, 'cs')),
    byCategory: [...categoryCounts.entries()]
      .map(([categoryLabel, count]) => ({ categoryLabel, count }))
      .sort((a, b) => b.count - a.count || a.categoryLabel.localeCompare(b.categoryLabel, 'cs')),
  };
}

export function getTeamKey(teamName: string | null | undefined): string {
  const raw = (teamName ?? '').trim();
  if (!raw) {
    return '';
  }
  const numberMatch = raw.match(/(?:^|\s)(\d{1,3})\s*\./);
  if (numberMatch?.[1]) {
    return `pto-${numberMatch[1]}`;
  }
  return slugify(raw);
}

export function getOpponentCount(opponents: OpponentCounts, playerA: string, playerB: string): number {
  return opponents.get(playerA)?.get(playerB) ?? 0;
}

export function addOpponentPair(opponents: OpponentCounts, playerA: string, playerB: string) {
  if (!opponents.has(playerA)) {
    opponents.set(playerA, new Map<string, number>());
  }
  const row = opponents.get(playerA)!;
  row.set(playerB, (row.get(playerB) ?? 0) + 1);
}

export function addRoundOpponents(opponents: OpponentCounts, playerIds: string[]) {
  for (let i = 0; i < playerIds.length; i += 1) {
    for (let j = i + 1; j < playerIds.length; j += 1) {
      addOpponentPair(opponents, playerIds[i], playerIds[j]);
      addOpponentPair(opponents, playerIds[j], playerIds[i]);
    }
  }
}

export function buildRoundTableSizes(playerCount: number): number[] {
  if (playerCount <= 0) {
    return [];
  }
  if (playerCount <= 4) {
    return [playerCount];
  }
  const tables = Math.min(BOARD_DRAW_MAX_TABLES_PER_GAME, Math.ceil(playerCount / 4));
  const base = Math.floor(playerCount / tables);
  const remainder = playerCount % tables;
  const sizes = Array.from({ length: tables }, (_, index) => base + (index < remainder ? 1 : 0));
  return sizes.sort((a, b) => b - a);
}

export function pairPenalty(
  playerA: BoardPlayer,
  playerB: BoardPlayer,
  categoryOpponents: OpponentCounts,
  blockOpponents: OpponentCounts,
): number {
  const sameTeamKey = getTeamKey(playerA.team_name);
  const sameTeam = Boolean(sameTeamKey) && sameTeamKey === getTeamKey(playerB.team_name);
  const blockMeetings = getOpponentCount(blockOpponents, playerA.id, playerB.id);
  const categoryMeetings = getOpponentCount(categoryOpponents, playerA.id, playerB.id);

  return (sameTeam ? 240 : 0) + blockMeetings * 120 + categoryMeetings * 45;
}

export function isSameTeam(playerA: BoardPlayer, playerB: BoardPlayer): boolean {
  const teamA = getTeamKey(playerA.team_name);
  return Boolean(teamA) && teamA === getTeamKey(playerB.team_name);
}

export function buildTeamPlayerCounts(players: BoardPlayer[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const player of players) {
    const teamKey = getTeamKey(player.team_name);
    if (!teamKey) {
      continue;
    }
    counts.set(teamKey, (counts.get(teamKey) ?? 0) + 1);
  }
  return counts;
}

export function buildTeamSameTeamCaps(teamPlayerCounts: Map<string, number>): Map<string, number> {
  const caps = new Map<string, number>();
  for (const [teamKey, size] of teamPlayerCounts.entries()) {
    // Teams with 1-2 players should avoid internal matchups entirely.
    // Larger teams absorb unavoidable same-team pairings proportionally.
    caps.set(teamKey, Math.max(0, size - 2));
  }
  return caps;
}

export function canAddCandidateToGroup(
  candidate: BoardPlayer,
  group: BoardPlayer[],
  blockOpponents: OpponentCounts,
  blockSameTeamCounts: Map<string, number>,
  blockTeamSameTeamCounts: Map<string, number>,
  teamPlayerCounts: Map<string, number>,
  teamSameTeamCaps: Map<string, number>,
  maxSameTeamOpponentsPerBlock: number | null,
): boolean {
  if (maxSameTeamOpponentsPerBlock === null) {
    return true;
  }

  const candidateTeamKey = getTeamKey(candidate.team_name);
  const candidateTeamSize = candidateTeamKey ? (teamPlayerCounts.get(candidateTeamKey) ?? 0) : 0;
  const candidateCurrentCount = blockSameTeamCounts.get(candidate.id) ?? 0;
  let candidateAdditionalCount = 0;
  let candidateTeamAdditionalCount = 0;

  for (const current of group) {
    if (!isSameTeam(candidate, current)) {
      continue;
    }

    // If a team only has two players in the category, they should not meet.
    if (candidateTeamSize <= 2) {
      return false;
    }

    // The same team-vs-team pair should not repeat in one game block.
    if (getOpponentCount(blockOpponents, candidate.id, current.id) >= 1) {
      return false;
    }

    const currentCount = blockSameTeamCounts.get(current.id) ?? 0;
    if (currentCount + 1 > maxSameTeamOpponentsPerBlock) {
      return false;
    }

    candidateAdditionalCount += 1;
    candidateTeamAdditionalCount += 1;
  }

  if (candidateCurrentCount + candidateAdditionalCount > maxSameTeamOpponentsPerBlock) {
    return false;
  }

  if (candidateTeamKey) {
    const teamCurrentCount = blockTeamSameTeamCounts.get(candidateTeamKey) ?? 0;
    const teamCap = teamSameTeamCaps.get(candidateTeamKey) ?? 0;
    if (teamCurrentCount + candidateTeamAdditionalCount > teamCap) {
      return false;
    }
  }

  return true;
}

export function chooseGroupSeed(
  availablePlayers: BoardPlayer[],
  allPlayers: BoardPlayer[],
): BoardPlayer {
  if (availablePlayers.length <= 1) {
    return availablePlayers[0];
  }
  const byDifficulty = [...availablePlayers].sort((a, b) => {
    const aTeam = getTeamKey(a.team_name);
    const bTeam = getTeamKey(b.team_name);
    const aConflicts = aTeam ? allPlayers.filter((player) => getTeamKey(player.team_name) === aTeam).length : 0;
    const bConflicts = bTeam ? allPlayers.filter((player) => getTeamKey(player.team_name) === bTeam).length : 0;
    if (aConflicts !== bConflicts) {
      return bConflicts - aConflicts;
    }
    return a.short_code.localeCompare(b.short_code, 'cs');
  });
  return byDifficulty[0];
}

export function evaluateRoundPenalty(
  groups: BoardPlayer[][],
  categoryOpponents: OpponentCounts,
  blockOpponents: OpponentCounts,
  threePlayerCounts: Map<string, number>,
  trioHistory: Set<string>,
): number {
  let penalty = 0;

  for (const group of groups) {
    if (group.length === 3) {
      const trioKey = group
        .map((player) => player.id)
        .sort()
        .join('|');
      if (trioHistory.has(trioKey)) {
        penalty += 220;
      }
      for (const player of group) {
        penalty += (threePlayerCounts.get(player.id) ?? 0) * 30;
      }
    }

    if (group.length === 2) {
      penalty += 90;
    }

    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        penalty += pairPenalty(group[i], group[j], categoryOpponents, blockOpponents);
      }
    }
  }

  return penalty;
}

export function buildRoundAttempt(
  players: BoardPlayer[],
  tableSizes: number[],
  categoryOpponents: OpponentCounts,
  blockOpponents: OpponentCounts,
  blockSameTeamCounts: Map<string, number>,
  blockTeamSameTeamCounts: Map<string, number>,
  teamPlayerCounts: Map<string, number>,
  teamSameTeamCaps: Map<string, number>,
  threePlayerCounts: Map<string, number>,
  trioHistory: Set<string>,
  maxSameTeamOpponentsPerBlock: number | null,
): DrawAttempt | null {
  const available = [...players];
  const groups: BoardPlayer[][] = [];

  for (const targetSize of tableSizes) {
    if (!available.length) {
      break;
    }
    const seed = chooseGroupSeed(available, players);
    const group: BoardPlayer[] = [seed];
    available.splice(available.findIndex((player) => player.id === seed.id), 1);

    while (group.length < targetSize && available.length) {
      const candidatePool = available.filter((player) =>
        canAddCandidateToGroup(
          player,
          group,
          blockOpponents,
          blockSameTeamCounts,
          blockTeamSameTeamCounts,
          teamPlayerCounts,
          teamSameTeamCaps,
          maxSameTeamOpponentsPerBlock,
        ),
      );
      if (!candidatePool.length) {
        return null;
      }
      let bestIndex = 0;
      let bestPenalty = Number.POSITIVE_INFINITY;

      for (let index = 0; index < candidatePool.length; index += 1) {
        const candidate = candidatePool[index];
        const candidatePenalty = group.reduce(
          (sum, current) => sum + pairPenalty(candidate, current, categoryOpponents, blockOpponents),
          0,
        );
        const threePlayerPenalty = targetSize === 3 ? (threePlayerCounts.get(candidate.id) ?? 0) * 25 : 0;
        const score = candidatePenalty + threePlayerPenalty + Math.random() * 0.01;
        if (score < bestPenalty) {
          bestPenalty = score;
          bestIndex = available.findIndex((player) => player.id === candidate.id);
        }
      }

      group.push(available[bestIndex]);
      available.splice(bestIndex, 1);
    }

    groups.push(group);
  }

  if (available.length) {
    groups[groups.length - 1].push(...available);
  }

  return {
    groups,
    penalty: evaluateRoundPenalty(groups, categoryOpponents, blockOpponents, threePlayerCounts, trioHistory),
  };
}

export function findBestRoundAttempt(
  players: BoardPlayer[],
  tableSizes: number[],
  categoryOpponents: OpponentCounts,
  blockOpponents: OpponentCounts,
  blockSameTeamCounts: Map<string, number>,
  blockTeamSameTeamCounts: Map<string, number>,
  teamPlayerCounts: Map<string, number>,
  teamSameTeamCaps: Map<string, number>,
  threePlayerCounts: Map<string, number>,
  trioHistory: Set<string>,
  maxSameTeamOpponentsPerBlock: number | null,
): DrawAttempt | null {
  // Keep draw quality while preventing long UI freezes in large categories.
  const attempts = Math.min(220, Math.max(60, Math.round(players.length * 2.4)));
  const noImprovementLimit = 64;
  let best: DrawAttempt | null = null;
  let noImprovementCount = 0;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = buildRoundAttempt(
      players,
      tableSizes,
      categoryOpponents,
      blockOpponents,
      blockSameTeamCounts,
      blockTeamSameTeamCounts,
      teamPlayerCounts,
      teamSameTeamCaps,
      threePlayerCounts,
      trioHistory,
      maxSameTeamOpponentsPerBlock,
    );
    if (!candidate) {
      noImprovementCount += 1;
      continue;
    }
    if (!best || candidate.penalty < best.penalty) {
      best = candidate;
      noImprovementCount = 0;
      if (candidate.penalty <= 0) {
        break;
      }
      continue;
    }

    noImprovementCount += 1;
    if (best && noImprovementCount >= noImprovementLimit) {
      break;
    }
  }

  return best;
}

export function generateRoundGroups(
  players: BoardPlayer[],
  tableSizes: number[],
  categoryOpponents: OpponentCounts,
  blockOpponents: OpponentCounts,
  blockSameTeamCounts: Map<string, number>,
  blockTeamSameTeamCounts: Map<string, number>,
  teamPlayerCounts: Map<string, number>,
  teamSameTeamCaps: Map<string, number>,
  threePlayerCounts: Map<string, number>,
  trioHistory: Set<string>,
): { groups: BoardPlayer[][]; usedRelaxedSameTeamRule: boolean } {
  const strict = findBestRoundAttempt(
    players,
    tableSizes,
    categoryOpponents,
    blockOpponents,
    blockSameTeamCounts,
    blockTeamSameTeamCounts,
    teamPlayerCounts,
    teamSameTeamCaps,
    threePlayerCounts,
    trioHistory,
    0,
  );
  if (strict) {
    return {
      groups: strict.groups,
      usedRelaxedSameTeamRule: false,
    };
  }

  const relaxed = findBestRoundAttempt(
    players,
    tableSizes,
    categoryOpponents,
    blockOpponents,
    blockSameTeamCounts,
    blockTeamSameTeamCounts,
    teamPlayerCounts,
    teamSameTeamCaps,
    threePlayerCounts,
    trioHistory,
    1,
  );
  if (relaxed) {
    return {
      groups: relaxed.groups,
      usedRelaxedSameTeamRule: true,
    };
  }

  const unrestricted = findBestRoundAttempt(
    players,
    tableSizes,
    categoryOpponents,
    blockOpponents,
    blockSameTeamCounts,
    blockTeamSameTeamCounts,
    teamPlayerCounts,
    teamSameTeamCaps,
    threePlayerCounts,
    trioHistory,
    null,
  );
  if (unrestricted) {
    return {
      groups: unrestricted.groups,
      usedRelaxedSameTeamRule: true,
    };
  }

  const sorted = [...players].sort((a, b) => a.short_code.localeCompare(b.short_code, 'cs'));
  const fallback: BoardPlayer[][] = [];
  let cursor = 0;
  for (const size of tableSizes) {
    fallback.push(sorted.slice(cursor, cursor + size));
    cursor += size;
  }
  return {
    groups: fallback,
    usedRelaxedSameTeamRule: true,
  };
}

export function planCategoryDraw(categoryPlayers: BoardPlayer[], categoryBlocks: BoardBlock[]): DrawBlockPlan[] {
  const activePlayers = categoryPlayers.filter((player) => !player.disqualified);
  if (activePlayers.length < 2 || !categoryBlocks.length) {
    return [];
  }

  const tableSizes = buildRoundTableSizes(activePlayers.length);
  const categoryOpponents: OpponentCounts = new Map();
  const threePlayerCounts = new Map<string, number>();
  const trioHistory = new Set<string>();
  const teamPlayerCounts = buildTeamPlayerCounts(activePlayers);
  const teamSameTeamCaps = buildTeamSameTeamCaps(teamPlayerCounts);

  return categoryBlocks
    .sort((a, b) => a.block_number - b.block_number)
    .map<DrawBlockPlan>((block) => {
      const blockOpponents: OpponentCounts = new Map();
      const blockSameTeamCounts = new Map<string, number>();
      const blockTeamSameTeamCounts = new Map<string, number>();
      const rounds: DrawRound[] = [];
      let usedRelaxedSameTeamRule = false;

      for (let roundNumber = 1; roundNumber <= 3; roundNumber += 1) {
        const generated = generateRoundGroups(
          activePlayers,
          tableSizes,
          categoryOpponents,
          blockOpponents,
          blockSameTeamCounts,
          blockTeamSameTeamCounts,
          teamPlayerCounts,
          teamSameTeamCaps,
          threePlayerCounts,
          trioHistory,
        );
        const groups = generated.groups;
        usedRelaxedSameTeamRule = usedRelaxedSameTeamRule || generated.usedRelaxedSameTeamRule;

        rounds.push({
          roundNumber,
          tables: groups.map((group, index) => ({
            tableNumber: index + 1,
            playerIds: group.map((player) => player.id),
          })),
        });

        for (const group of groups) {
          const ids = group.map((player) => player.id);
          addRoundOpponents(categoryOpponents, ids);
          addRoundOpponents(blockOpponents, ids);
          for (let i = 0; i < group.length; i += 1) {
            for (let j = i + 1; j < group.length; j += 1) {
              if (!isSameTeam(group[i], group[j])) {
                continue;
              }
              blockSameTeamCounts.set(group[i].id, (blockSameTeamCounts.get(group[i].id) ?? 0) + 1);
              blockSameTeamCounts.set(group[j].id, (blockSameTeamCounts.get(group[j].id) ?? 0) + 1);
              const teamKey = getTeamKey(group[i].team_name);
              if (teamKey) {
                blockTeamSameTeamCounts.set(teamKey, (blockTeamSameTeamCounts.get(teamKey) ?? 0) + 1);
              }
            }
          }
          if (group.length === 3) {
            const trioKey = ids.slice().sort().join('|');
            trioHistory.add(trioKey);
            for (const playerId of ids) {
              threePlayerCounts.set(playerId, (threePlayerCounts.get(playerId) ?? 0) + 1);
            }
          }
        }
      }

      return {
        block,
        rounds,
        usedRelaxedSameTeamRule,
      };
    });
}
