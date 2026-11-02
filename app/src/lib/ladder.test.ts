import { describe, expect, it } from 'vitest';
import {
  LISTEN_LEVELS,
  SPEAK_LIMITS_MS,
  clampListenLevel,
  clampNewPerDayV3,
  clampSpeakLevel,
  defaultLadder,
  dialogueTier,
  listenLevelZh,
  listenRate,
  speakLevelZh,
  speakLimitMs,
} from './ladder';

describe('ladder tables (spec §四)', () => {
  it('has the nine listening levels L0-L8 exactly as specified', () => {
    expect(LISTEN_LEVELS.map((l) => l.tier)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3]);
    expect(LISTEN_LEVELS.map((l) => l.rate)).toEqual([0.85, 0.95, 1.05, 0.95, 1.05, 1.15, 1.0, 1.1, 1.2]);
  });

  it('has the six speaking limits S0-S5: 10s 8s 6s 5s 4s 3s', () => {
    expect(SPEAK_LIMITS_MS).toEqual([10000, 8000, 6000, 5000, 4000, 3000]);
  });

  it('helpers read the tables', () => {
    expect(listenRate(0)).toBe(0.85);
    expect(listenRate(5)).toBe(1.15);
    expect(listenRate(8)).toBe(1.2);
    expect(dialogueTier(2)).toBe(1);
    expect(dialogueTier(3)).toBe(2);
    expect(dialogueTier(6)).toBe(3);
    expect(speakLimitMs(0)).toBe(10000);
    expect(speakLimitMs(5)).toBe(3000);
  });

  it('clamps out-of-range and non-finite levels', () => {
    expect(clampListenLevel(-3)).toBe(0);
    expect(clampListenLevel(99)).toBe(8);
    expect(clampListenLevel(NaN)).toBe(0);
    expect(clampSpeakLevel(7)).toBe(5);
    expect(listenRate(-1)).toBe(0.85);
    expect(dialogueTier(100)).toBe(3);
    expect(speakLimitMs(-2)).toBe(10000);
    expect(speakLimitMs(42)).toBe(3000);
  });

  it('newPerDay is clamped to 3-12', () => {
    expect(clampNewPerDayV3(1)).toBe(3);
    expect(clampNewPerDayV3(20)).toBe(12);
    expect(clampNewPerDayV3(7.4)).toBe(7);
    expect(clampNewPerDayV3(NaN)).toBe(5);
  });

  it('defaultLadder is a fresh object inside the ranges', () => {
    const a = defaultLadder();
    expect(a).toEqual({ listen: 1, speak: 1, newPerDay: 5 });
    a.listen = 7;
    expect(defaultLadder().listen).toBe(1);
  });

  it('labels mention level, tier/limit', () => {
    expect(listenLevelZh(4)).toBe('L4 · 第 2 档对话 · 1.05×');
    expect(speakLevelZh(3)).toBe('S3 · 限时 5 秒');
  });
});
