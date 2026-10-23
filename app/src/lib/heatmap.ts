import { todayStr } from './plan';

export interface HeatCell {
  date: string;
  minutes: number;
  /** 0 (no practice) .. 4 */
  level: 0 | 1 | 2 | 3 | 4;
}

export const HEATMAP_WEEKS = 12;

export function heatLevel(minutes: number): HeatCell['level'] {
  if (minutes <= 0) return 0;
  if (minutes < 5) return 1;
  if (minutes < 10) return 2;
  if (minutes < 15) return 3;
  return 4;
}

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date: string, delta: number): string {
  const d = parse(date);
  return todayStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta));
}

/**
 * Lay the stats heatmap (oldest -> newest days, ending today) out as 7 rows (Mon..Sun) x 12 week columns.
 * Days after the last entry (the rest of the current week) are `null`. Returned row-major: grid[row][col].
 */
export function buildHeatGrid(heatmap: { date: string; minutes: number }[]): (HeatCell | null)[][] {
  const grid: (HeatCell | null)[][] = Array.from({ length: 7 }, () => new Array<HeatCell | null>(HEATMAP_WEEKS).fill(null));
  if (heatmap.length === 0) return grid;
  const minutesByDate = new Map(heatmap.map((h) => [h.date, h.minutes]));
  const last = heatmap[heatmap.length - 1].date;
  const lastRow = (parse(last).getDay() + 6) % 7; // Monday = 0
  for (let col = 0; col < HEATMAP_WEEKS; col++) {
    for (let row = 0; row < 7; row++) {
      const offset = (col - (HEATMAP_WEEKS - 1)) * 7 + (row - lastRow);
      if (offset > 0) continue;
      const date = addDays(last, offset);
      const minutes = minutesByDate.get(date) ?? 0;
      grid[row][col] = { date, minutes, level: heatLevel(minutes) };
    }
  }
  return grid;
}
