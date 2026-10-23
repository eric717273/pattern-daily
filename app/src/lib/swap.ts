import type { FrameCombo } from '../types';

export type SwapSpeed = 'slow' | 'medium' | 'fast';
export type SwapFeel = 'hard' | 'ok' | 'easy';

export const SWAP_SPEEDS: { value: SwapSpeed; label: string; ms: number }[] = [
  { value: 'slow', label: '慢 4s', ms: 4000 },
  { value: 'medium', label: '中 3s', ms: 3000 },
  { value: 'fast', label: '快 2s', ms: 2000 },
];

const SPEED_KEY = 'pd.swapSpeed';

export function loadSpeed(): SwapSpeed {
  try {
    const v = localStorage.getItem(SPEED_KEY);
    if (v === 'slow' || v === 'medium' || v === 'fast') return v;
  } catch {
    // storage unavailable
  }
  return 'slow';
}

export function saveSpeed(v: SwapSpeed): void {
  try {
    localStorage.setItem(SPEED_KEY, v);
  } catch {
    // storage unavailable
  }
}

/** The slot whose option differs between two consecutive combos. */
export function changedSlot(prev: FrameCombo | undefined, cur: FrameCombo): string | undefined {
  if (!prev) return undefined;
  return Object.keys(cur.picks).find((k) => cur.picks[k] !== prev.picks[k]);
}
