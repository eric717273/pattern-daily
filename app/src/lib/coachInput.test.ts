import { describe, expect, it, vi } from 'vitest';
import type { Profile } from '../types';

vi.mock('../content', () => ({
  getChunk: (id: string) => (id === 'c001' ? { id, en: 'Could you give me a hand?' } : id === 'c002' ? { id, en: 'It slipped my mind.' } : undefined),
  getSeedFrame: (id: string) => (id === 'f001' ? { id, pattern: '{subject} {aux} {verb}.' } : undefined),
}));

import { buildCoachInput } from './coachInput';
import { emptySkillStats, type SkillStats } from './skills';
import { buildGoalPlan, progressStatus } from './goalPlan';

const profile = (over: Partial<Profile> = {}): Profile => ({ id: 'profile', startDate: '2026-05-01', dailyMinutes: 20, scenes: ['work'], updatedAt: 1, ...over });
const ladder = { listen: 3, speak: 2, newPerDay: 6 };

function stats(): SkillStats {
  const base = emptySkillStats();
  return {
    ...base,
    bySkill: {
      listen: { n: 40, acc: 0.9, medianLatencyMs: 2000, trend: 0.05, byLevel: { 3: { n: 40, acc: 0.9 } } },
      speak: { n: 0, acc: 0, byLevel: {} },
      decode: { n: 12, acc: 0.75, byLevel: {} },
    },
    weakestCategories: [
      { category: 'request', n: 8, acc: 0.5, missedCardIds: ['chunk:c001', 'chunk:zzz', 'frame:f001', 'dialogue:dl001', 'chunk:c002'] },
    ],
    soundErrors: Array.from({ length: 7 }, (_, i) => ({ soundId: `s0${i}`, name: `p${i}`, kind: 'linking' as const, attempts: 5, errors: 7 - i })),
  };
}

describe('buildCoachInput', () => {
  it('keeps only skills that have answers, rounds nothing, and drops undefined optionals', () => {
    const input = buildCoachInput({ lesson: 12, stats: stats(), profile: profile(), ladder, edge: [], itemsLearned: 30 });
    expect(Object.keys(input.skills)).toEqual(['listen', 'decode']);
    expect(input.skills.listen).toEqual({ n: 40, acc: 0.9, medianLatencyMs: 2000, trend: 0.05 });
    expect(input.skills.decode).toEqual({ n: 12, acc: 0.75 });
    expect(input.lesson).toBe(12);
    expect(input.ladder).toEqual(ladder);
    expect(input.goal).toBeUndefined();
  });

  it('resolves weak-category examples and edge items to library texts', () => {
    const input = buildCoachInput({
      lesson: 12,
      stats: stats(),
      profile: profile(),
      ladder,
      edge: [
        { kind: 'chunk', id: 'c002' },
        { kind: 'frame', id: 'f001' },
        { kind: 'chunk', id: 'missing' },
      ],
      itemsLearned: 30,
    });
    expect(input.weakCategories).toEqual([
      { category: 'request', acc: 0.5, n: 8, examples: ['Could you give me a hand?', '{subject} {aux} {verb}.', 'It slipped my mind.'] },
    ]);
    expect(input.edgeTexts).toEqual(['It slipped my mind.', '{subject} {aux} {verb}.']);
  });

  it('limits sound errors to 5, history to 10 and assessments to 4', () => {
    const history = Array.from({ length: 14 }, (_, i) => ({ date: '2026-05-01', dimension: 'listen' as const, from: i, to: i + 1, reasonZh: `r${i}` }));
    const assessments = Array.from({ length: 6 }, (_, i) => ({
      id: `a${i}`,
      date: `2026-05-0${i + 1}`,
      kind: 'checkpoint' as const,
      listenLevel: i,
      listenAcc: 0.8,
      speakLevel: 1,
      speakAcc: 0.7,
      bandAcc: {},
      levelZh: '基础' as const,
    }));
    const input = buildCoachInput({
      lesson: 20,
      stats: stats(),
      profile: profile({ adaptive: { ladder, lastChange: {}, history }, assessments }),
      ladder,
      edge: [],
      itemsLearned: 10,
    });
    expect(input.soundErrors).toHaveLength(5);
    expect(input.soundErrors[0]).toEqual({ name: 'p0', kind: 'linking', errors: 7, attempts: 5 });
    expect(input.ladderHistory).toHaveLength(10);
    expect(input.ladderHistory[9].reasonZh).toBe('r13');
    expect(input.assessments.map((a) => a.listenLevel)).toEqual([2, 3, 4, 5]);
    expect(Object.keys(input.assessments[0]).sort()).toEqual(['date', 'kind', 'levelZh', 'listenAcc', 'listenLevel', 'speakAcc', 'speakLevel']);
  });

  it('adds the goal and plan progress', () => {
    const goal = { focus: 'speaking-listening' as const, horizonDays: 30 as const, dailyMinutes: 20, startDate: '2026-05-01', startLesson: 1 };
    const plan = buildGoalPlan(goal, undefined, ladder, 6, 12);
    const progress = progressStatus(plan, { lesson: 12, itemsLearned: 30, ladder });
    const input = buildCoachInput({ lesson: 12, stats: stats(), profile: profile({ goal }), ladder, edge: [], itemsLearned: 30, goal: { plan, progress } });
    expect(input.goal).toEqual({
      horizonDays: 30,
      dailyMinutes: 20,
      day: 12,
      phaseNameZh: '扩展',
      status: progress.status,
      adviceZh: progress.adviceZh,
      itemsLearned: 30,
      expectedItems: progress.expected.itemsLearned,
    });
  });

  it('never carries free text from the learner', () => {
    const input = buildCoachInput({ lesson: 1, stats: stats(), profile: profile(), ladder, edge: [], itemsLearned: 0 });
    expect(Object.keys(input).sort()).toEqual(['assessments', 'edgeTexts', 'ladder', 'ladderHistory', 'lesson', 'skills', 'soundErrors', 'weakCategories']);
  });
});
