import type { DialogueTier, Ladder } from '../types';

/**
 * Difficulty ladder (research/DELIBERATE-PRACTICE.md §四).
 * Listening level L0-L8 = dialogue tier x playback rate; speaking level S0-S5 = time limit for saying a chunk.
 */
export const LISTEN_LEVELS: readonly { tier: DialogueTier; rate: number }[] = [
  { tier: 1, rate: 0.85 }, // L0
  { tier: 1, rate: 0.95 }, // L1
  { tier: 1, rate: 1.05 }, // L2
  { tier: 2, rate: 0.95 }, // L3
  { tier: 2, rate: 1.05 }, // L4
  { tier: 2, rate: 1.15 }, // L5
  { tier: 3, rate: 1.0 }, //  L6
  { tier: 3, rate: 1.1 }, //  L7
  { tier: 3, rate: 1.2 }, //  L8
];

/** Time limits (ms) for saying a chunk, S0-S5: 10s, 8s, 6s, 5s, 4s, 3s. */
export const SPEAK_LIMITS_MS: readonly number[] = [10_000, 8_000, 6_000, 5_000, 4_000, 3_000];

export const MAX_LISTEN_LEVEL = LISTEN_LEVELS.length - 1; // 8
export const MAX_SPEAK_LEVEL = SPEAK_LIMITS_MS.length - 1; // 5
export const MIN_NEW_PER_DAY = 3;
export const MAX_NEW_PER_DAY = 12;
export const DEFAULT_NEW_PER_DAY_V3 = 5;

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

export function clampListenLevel(level: number): number {
  return clampInt(level, 0, MAX_LISTEN_LEVEL);
}

export function clampSpeakLevel(level: number): number {
  return clampInt(level, 0, MAX_SPEAK_LEVEL);
}

/** New chunks per day in the v3 range 3-12 (the v2 range in plan.ts stays 3-10). */
export function clampNewPerDayV3(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_NEW_PER_DAY_V3;
  return clampInt(n, MIN_NEW_PER_DAY, MAX_NEW_PER_DAY);
}

/** Playback rate (TTS speed multiplier) for a listening level; out-of-range levels are clamped. */
export function listenRate(level: number): number {
  return LISTEN_LEVELS[clampListenLevel(level)].rate;
}

/** Dialogue difficulty tier (1-3) for a listening level. */
export function dialogueTier(level: number): DialogueTier {
  return LISTEN_LEVELS[clampListenLevel(level)].tier;
}

/** Time limit in ms for saying a chunk at speaking level `level`. */
export function speakLimitMs(level: number): number {
  return SPEAK_LIMITS_MS[clampSpeakLevel(level)];
}

/** Ladder before any placement test: gentle listening (L1: tier 1, 0.95x), 8 s speaking limit, 5 new chunks/day. */
export function defaultLadder(): Ladder {
  return { listen: 1, speak: 1, newPerDay: DEFAULT_NEW_PER_DAY_V3 };
}

/** "L4 · 第 2 档对话 · 1.05×" */
export function listenLevelZh(level: number): string {
  const l = clampListenLevel(level);
  const { tier, rate } = LISTEN_LEVELS[l];
  return `L${l} · 第 ${tier} 档对话 · ${rate.toFixed(2)}×`;
}

/** "S3 · 限时 5 秒" */
export function speakLevelZh(level: number): string {
  const s = clampSpeakLevel(level);
  return `S${s} · 限时 ${speakLimitMs(s) / 1000} 秒`;
}
