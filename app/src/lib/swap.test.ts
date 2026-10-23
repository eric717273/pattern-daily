import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadSpeed,
  loadVoicePref,
  saveSpeed,
  saveVoicePref,
  shiftSpeed,
  speedAdvice,
  speedOptions,
  voiceGrade,
} from './swap';

beforeEach(() => localStorage.clear());

describe('voice grading', () => {
  it('maps accuracy out of 7 to a grade', () => {
    expect([7, 6, 5, 4, 3, 2, 1, 0].map((n) => voiceGrade(n, 7))).toEqual([3, 3, 2, 2, 1, 1, 0, 0]);
  });

  it('scales to other round lengths', () => {
    expect(voiceGrade(3, 3)).toBe(3);
    expect(voiceGrade(1, 2)).toBe(1);
    expect(voiceGrade(0, 0)).toBe(0);
  });

  it('advises speed from the result', () => {
    expect(speedAdvice(7, 7)).toBe('faster');
    expect(speedAdvice(6, 7)).toBe('faster');
    expect(speedAdvice(5, 7)).toBe('keep');
    expect(speedAdvice(4, 7)).toBe('keep');
    expect(speedAdvice(3, 7)).toBe('slower');
    expect(speedAdvice(0, 7)).toBe('slower');
  });

  it('shifts presets and clamps at the ends', () => {
    expect(shiftSpeed('slow', 'faster')).toBe('medium');
    expect(shiftSpeed('fast', 'faster')).toBe('fast');
    expect(shiftSpeed('slow', 'slower')).toBe('slow');
    expect(shiftSpeed('medium', 'keep')).toBe('medium');
  });
});

describe('speed presets', () => {
  it('voice mode is 8 / 6 / 4 s, self-graded mode 4 / 3 / 2 s', () => {
    expect(speedOptions(true).map((s) => s.ms)).toEqual([8000, 6000, 4000]);
    expect(speedOptions(false).map((s) => s.ms)).toEqual([4000, 3000, 2000]);
  });

  it('each mode remembers its own preset', () => {
    saveSpeed('fast', true);
    expect(loadSpeed(true)).toBe('fast');
    expect(loadSpeed(false)).toBe('slow');
    saveSpeed('medium', false);
    expect(loadSpeed(false)).toBe('medium');
    expect(loadSpeed(true)).toBe('fast');
  });

  it('remembers the voice preference; unset by default', () => {
    expect(loadVoicePref()).toBeUndefined();
    saveVoicePref(false);
    expect(loadVoicePref()).toBe(false);
    saveVoicePref(true);
    expect(loadVoicePref()).toBe(true);
  });
});
