import type { FrameCombo, Grade } from '../types';

export type SwapSpeed = 'slow' | 'medium' | 'fast';
export type SwapFeel = 'hard' | 'ok' | 'easy';

/** Grade of a self-graded 单槽快替 round. */
export const FEEL_GRADE: Record<SwapFeel, Grade> = { hard: 1, ok: 2, easy: 3 };

export interface SwapSpeedOption {
  value: SwapSpeed;
  label: string;
  ms: number;
}

/** Self-graded mode: say it in your head / aloud, then reveal. */
export const SWAP_SPEEDS: SwapSpeedOption[] = [
  { value: 'slow', label: '慢 4s', ms: 4000 },
  { value: 'medium', label: '中 3s', ms: 3000 },
  { value: 'fast', label: '快 2s', ms: 2000 },
];

/** Voice-verified mode: speaking a whole sentence plus recognizer latency needs more time. */
export const VOICE_SWAP_SPEEDS: SwapSpeedOption[] = [
  { value: 'slow', label: '慢 8s', ms: 8000 },
  { value: 'medium', label: '中 6s', ms: 6000 },
  { value: 'fast', label: '快 4s', ms: 4000 },
];

export function speedOptions(voice: boolean): SwapSpeedOption[] {
  return voice ? VOICE_SWAP_SPEEDS : SWAP_SPEEDS;
}

const SPEED_KEY = 'pd.swapSpeed';
const VOICE_SPEED_KEY = 'pd.swapSpeed.voice';
const VOICE_KEY = 'pd.swapVoice';

/** The remembered speed preset; each mode (self-graded / voice) remembers its own. */
export function loadSpeed(voice = false): SwapSpeed {
  try {
    const v = localStorage.getItem(voice ? VOICE_SPEED_KEY : SPEED_KEY);
    if (v === 'slow' || v === 'medium' || v === 'fast') return v;
  } catch {
    // storage unavailable
  }
  return 'slow';
}

export function saveSpeed(v: SwapSpeed, voice = false): void {
  try {
    localStorage.setItem(voice ? VOICE_SPEED_KEY : SPEED_KEY, v);
  } catch {
    // storage unavailable
  }
}

/** Saved "语音验证" preference; undefined when the user never chose (default: on when supported). */
export function loadVoicePref(): boolean | undefined {
  try {
    const v = localStorage.getItem(VOICE_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    // storage unavailable
  }
  return undefined;
}

export function saveVoicePref(on: boolean): void {
  try {
    localStorage.setItem(VOICE_KEY, on ? '1' : '0');
  } catch {
    // storage unavailable
  }
}

/** Frame-card grade from the number of prompts said correctly in time: >= 6/7 -> 3, 4-5/7 -> 2, 2-3/7 -> 1, else 0. */
export function voiceGrade(correct: number, total: number): Grade {
  if (total <= 0) return 0;
  const ratio = correct / total;
  if (ratio >= 6 / 7 - 1e-9) return 3;
  if (ratio >= 4 / 7 - 1e-9) return 2;
  if (ratio >= 2 / 7 - 1e-9) return 1;
  return 0;
}

/** Speed advice after a voice round: >= 6/7 -> faster, <= 3/7 -> slower, otherwise stay. */
export function speedAdvice(correct: number, total: number): 'faster' | 'slower' | 'keep' {
  if (total <= 0) return 'keep';
  const ratio = correct / total;
  if (ratio >= 6 / 7 - 1e-9) return 'faster';
  if (ratio <= 3 / 7 + 1e-9) return 'slower';
  return 'keep';
}

/** The preset one step faster / slower (clamped). */
export function shiftSpeed(v: SwapSpeed, advice: 'faster' | 'slower' | 'keep'): SwapSpeed {
  const order: SwapSpeed[] = ['slow', 'medium', 'fast'];
  const i = order.indexOf(v);
  if (advice === 'faster') return order[Math.min(order.length - 1, i + 1)];
  if (advice === 'slower') return order[Math.max(0, i - 1)];
  return v;
}

/** The slot whose option differs between two consecutive combos. */
export function changedSlot(prev: FrameCombo | undefined, cur: FrameCombo): string | undefined {
  if (!prev) return undefined;
  return Object.keys(cur.picks).find((k) => cur.picks[k] !== prev.picks[k]);
}
