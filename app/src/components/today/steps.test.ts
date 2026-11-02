import { describe, expect, it } from 'vitest';
import type { DayPlan, StepKey } from '../../types';
import { formatClock, isV3Plan, knownSteps, nextUndone, remainingMinutes, stepMinutes, stepsFor, todayGoals } from './steps';

const v2: DayPlan = { dayIndex: 1, decode: { phase: 'foundation', dozenId: 'd01' }, newItems: [], outputCount: 3 };
const v3: DayPlan = {
  ...v2,
  newItems: [
    { kind: 'chunk', id: 'c001' },
    { kind: 'chunk', id: 'c002' },
    { kind: 'chunk', id: 'c003' },
    { kind: 'chunk', id: 'c004' },
    { kind: 'chunk', id: 'c005' },
  ],
  ladder: { listen: 2, speak: 2, newPerDay: 5 },
  budgetMin: { review: 4, chunks: 4, listening: 4, decode: 2, output: 2 },
  listening: { dialogueIds: ['dl001'], numbers: 3 },
};

describe('stepsFor', () => {
  it('v2: the four steps; v3: five with 听力 between 新语块 and 解码', () => {
    expect(stepsFor(v2).map((s) => s.key)).toEqual(['review', 'chunks', 'decode', 'output']);
    expect(stepsFor(v3).map((s) => s.key)).toEqual(['review', 'chunks', 'listening', 'decode', 'output']);
    expect(isV3Plan(v2)).toBe(false);
    expect(isV3Plan(v3)).toBe(true);
  });

  it('minutes come from the plan budget, else the v2 default', () => {
    expect(stepMinutes(v3, 'listening')).toBe(4);
    expect(stepMinutes(v2, 'review')).toBe(4);
    expect(stepMinutes(v2, 'chunks')).toBe(6);
  });
});

describe('remainingMinutes', () => {
  it('v3 sums the budgets of the undone steps', () => {
    expect(remainingMinutes([], 16, v3)).toBe(16);
    expect(remainingMinutes(['review', 'chunks'], 16, v3)).toBe(8);
    expect(remainingMinutes(['review', 'chunks', 'listening', 'decode', 'output'], 16, v3)).toBe(0);
  });
  it('v2 scales to the daily minutes', () => {
    expect(remainingMinutes([], 15)).toBe(15);
    expect(remainingMinutes([], 30)).toBe(30);
  });
});

describe('nextUndone / knownSteps with a v3 order', () => {
  const order: StepKey[] = stepsFor(v3).map((s) => s.key);
  it('goes through listening', () => {
    expect(nextUndone(['review', 'chunks'], 'chunks', order)).toBe('listening');
    expect(nextUndone(['review', 'chunks', 'listening', 'decode'], 'decode', order)).toBe('output');
  });
  it('wraps to an earlier undone step', () => {
    expect(nextUndone(['chunks', 'listening', 'decode', 'output'], 'output', order)).toBe('review');
  });
  it('ignores legacy keys', () => {
    expect(knownSteps(['warmup', 'listening', 'review'])).toEqual(['review', 'listening']);
  });
});

describe('todayGoals', () => {
  it('derives concrete micro-goals from the plan', () => {
    // L2 = 1.05x, S2 = 6 s
    expect(todayGoals(v3)).toEqual(['新学 5 条', '听力语速 1.05', '口语 6 秒内说出', '正确率保持在 70–88%']);
  });
  it('omits the new-item goal when nothing is new', () => {
    expect(todayGoals({ ...v3, newItems: [] })[0]).toBe('听力语速 1.05');
  });
});

describe('formatClock', () => {
  it('m:ss, rounding up, never negative', () => {
    expect(formatClock(222)).toBe('3:42');
    expect(formatClock(59.2)).toBe('1:00');
    expect(formatClock(-5)).toBe('0:00');
  });
});
