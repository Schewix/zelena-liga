import { describe, expect, it } from 'vitest';
import { rankLeagueHistory } from '../homepage/league/historyModel';

describe('rankLeagueHistory', () => {
  it('sums points, sorts descending and labels ties as ranges', () => {
    const ranked = rankLeagueHistory({
      columns: [
        { season_label: '93/94', ordinal: 'I.' },
        { season_label: '94/95', ordinal: 'II.' },
      ],
      rows: [
        { id: 'a', troop_number: '1', name: 'A', points: { '93/94': 5 } },
        { id: 'b', troop_number: '2', name: 'B', points: { '93/94': 10, '94/95': 1.5 } },
        { id: 'c', troop_number: '3', name: 'C', points: { '94/95': 5 } },
      ],
    });
    expect(ranked.map((row) => [row.name, row.total, row.rankLabel])).toEqual([
      ['B', 11.5, '1.'],
      ['A', 5, '2.–3.'],
      ['C', 5, '2.–3.'],
    ]);
  });
});
