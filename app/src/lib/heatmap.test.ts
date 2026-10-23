import { describe, expect, it } from 'vitest';
import { buildHeatGrid, heatLevel, HEATMAP_WEEKS } from './heatmap';
import { todayStr } from './plan';

function days(endDate: string, n: number, minutesOn: Record<string, number> = {}) {
  const [y, m, d] = endDate.split('-').map(Number);
  const out: { date: string; minutes: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = todayStr(new Date(y, m - 1, d - i));
    out.push({ date, minutes: minutesOn[date] ?? 0 });
  }
  return out;
}

describe('heatLevel', () => {
  it('buckets minutes into 5 levels', () => {
    expect([0, 1, 4.9, 5, 9.9, 10, 14.9, 15, 60].map(heatLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe('buildHeatGrid', () => {
  it('is 7 rows x 12 columns with Monday on the first row and today in the last column', () => {
    // 2026-10-22 is a Thursday (row 3)
    const grid = buildHeatGrid(days('2026-10-22', 84, { '2026-10-22': 20, '2026-10-19': 6 }));
    expect(grid).toHaveLength(7);
    for (const row of grid) expect(row).toHaveLength(HEATMAP_WEEKS);
    expect(grid[3][HEATMAP_WEEKS - 1]).toMatchObject({ date: '2026-10-22', minutes: 20, level: 4 });
    expect(grid[0][HEATMAP_WEEKS - 1]).toMatchObject({ date: '2026-10-19', minutes: 6, level: 2 });
    // the rest of this week is in the future
    expect(grid[4][HEATMAP_WEEKS - 1]).toBeNull();
    expect(grid[6][HEATMAP_WEEKS - 1]).toBeNull();
    // all earlier columns are full
    for (let c = 0; c < HEATMAP_WEEKS - 1; c++) for (let r = 0; r < 7; r++) expect(grid[r][c]).not.toBeNull();
    // the first cell is a Monday 11 weeks before this week's Monday
    expect(grid[0][0]?.date).toBe('2026-08-03');
  });

  it('puts a Sunday "today" in the bottom-right corner', () => {
    const grid = buildHeatGrid(days('2026-10-25', 84));
    expect(grid[6][HEATMAP_WEEKS - 1]?.date).toBe('2026-10-25');
    expect(grid.flat().filter((c) => c === null)).toHaveLength(0);
  });

  it('copes with empty input', () => {
    expect(buildHeatGrid([]).flat().every((c) => c === null)).toBe(true);
  });
});
