import { describe, expect, it } from 'vitest';
import type { Assessment, Goal, Ladder } from '../types';
import { buildGoalPlan, expectedAt, progressStatus, type GoalPlan } from './goalPlan';

const goal = (horizonDays: 30 | 60 | 100 = 30, startLesson = 1, dailyMinutes = 20): Goal => ({
  focus: 'speaking-listening',
  horizonDays,
  dailyMinutes,
  startDate: '2026-05-01',
  startLesson,
});
const ladder = (over: Partial<Ladder> = {}): Ladder => ({ listen: 2, speak: 1, newPerDay: 5, ...over });
const placement = (over: Partial<Assessment> = {}): Assessment => ({
  id: 'p',
  date: '2026-05-01',
  kind: 'placement',
  listenLevel: 2,
  listenAcc: 0.7,
  speakLevel: 1,
  speakAcc: 0.7,
  bandAcc: {},
  levelZh: '入门',
  ...over,
});

describe('buildGoalPlan', () => {
  it('splits 30 / 60 / 100 days at 30% and 70%', () => {
    const spans = (h: 30 | 60 | 100) =>
      buildGoalPlan(goal(h), placement(), ladder(), 5, 1).phases.map((p) => [p.fromDay, p.toDay]);
    expect(spans(30)).toEqual([[1, 9], [10, 21], [22, 30]]);
    expect(spans(60)).toEqual([[1, 18], [19, 42], [43, 60]]);
    expect(spans(100)).toEqual([[1, 30], [31, 70], [71, 100]]);
  });

  it('names the phases and states their focus', () => {
    const p = buildGoalPlan(goal(), placement(), ladder(), 5, 1);
    expect(p.phases.map((x) => x.nameZh)).toEqual(['打基础', '扩展', '提速']);
    expect(p.phases.map((x) => x.id)).toEqual(['foundation', 'expand', 'sprint']);
    expect(p.phases[0].focusZh).toContain('频率等级 1');
    expect(p.phases[1].focusZh).toContain('第 2 档对话');
    expect(p.phases[2].focusZh).toContain('第 3 档对话');
  });

  it('milestones: items from newPerDay, listening start + 2 per phase (max L8), speaking start + 1 (max S5)', () => {
    const p = buildGoalPlan(goal(), placement({ listenLevel: 3, speakLevel: 2, fastTracked: ['c001', 'c002'] }), ladder(), 5, 1);
    expect(p.baseline).toEqual({ itemsLearned: 2, listenLevel: 3, speakLevel: 2 });
    expect(p.phases.map((x) => x.milestones)).toEqual([
      { itemsLearned: 2 + 5 * 9, listenLevel: 5, speakLevel: 3 },
      { itemsLearned: 2 + 5 * 21, listenLevel: 7, speakLevel: 4 },
      { itemsLearned: 2 + 5 * 30, listenLevel: 8, speakLevel: 5 },
    ]);
  });

  it('caps items at the library size and levels at L8 / S5', () => {
    const p = buildGoalPlan(goal(100), placement({ listenLevel: 7, speakLevel: 5 }), ladder(), 12, 1);
    expect(p.phases[2].milestones.itemsLearned).toBe(500);
    expect(p.phases.every((x) => x.milestones.listenLevel === 8 && x.milestones.speakLevel === 5)).toBe(true);
    expect(buildGoalPlan(goal(), placement(), ladder(), 10, 1, { librarySize: 100 }).phases[2].milestones.itemsLearned).toBe(100);
  });

  it('starts from the ladder when there is no placement, and honours itemsLearned', () => {
    const p = buildGoalPlan(goal(), undefined, ladder({ listen: 4, speak: 3 }), 6, 1, { itemsLearned: 40 });
    expect(p.baseline).toEqual({ itemsLearned: 40, listenLevel: 4, speakLevel: 3 });
    expect(p.phases[0].milestones).toEqual({ itemsLearned: 40 + 6 * 9, listenLevel: 6, speakLevel: 4 });
    expect(buildGoalPlan(goal(), undefined, ladder(), 5, 1).baseline.itemsLearned).toBe(0);
  });

  it('writes measurable milestone text with day, items, level and time limit', () => {
    const p = buildGoalPlan(goal(), placement(), ladder(), 5, 1);
    expect(p.phases[0].milestoneZh).toBe('第 9 天：已学 45 条，听力 L4（第 2 档对话，语速 1.05×），限时 ≤6 秒说出');
  });

  it('locates the current day and phase from the lesson number', () => {
    const at = (lesson: number, startLesson = 1) => {
      const p = buildGoalPlan(goal(30, startLesson), placement(), ladder(), 5, lesson);
      return [p.currentDay, p.currentPhase];
    };
    expect(at(1)).toEqual([1, 0]);
    expect(at(9)).toEqual([9, 0]);
    expect(at(10)).toEqual([10, 1]);
    expect(at(22)).toEqual([22, 2]);
    expect(at(45)).toEqual([45, 2]); // past the horizon stays in the last phase
    expect(at(25, 21)).toEqual([5, 0]); // goal set at lesson 21
    expect(at(0)).toEqual([1, 0]);
  });
});

function planFor(over: { h?: 30 | 60 | 100; startLesson?: number; daily?: number; newPerDay?: number } = {}): GoalPlan {
  return buildGoalPlan(goal(over.h ?? 30, over.startLesson ?? 1, over.daily ?? 20), placement(), ladder(), over.newPerDay ?? 5, 1);
}

describe('expectedAt', () => {
  it('interpolates linearly between baseline and the milestones', () => {
    const p = planFor();
    expect(expectedAt(p, 0)).toEqual(p.baseline);
    expect(expectedAt(p, 9)).toEqual(p.phases[0].milestones);
    expect(expectedAt(p, 30)).toEqual(p.phases[2].milestones);
    expect(expectedAt(p, 99)).toEqual(p.phases[2].milestones);
    expect(expectedAt(p, -3)).toEqual(p.baseline);
    const half = expectedAt(p, 4.5);
    expect(half.itemsLearned).toBe(Math.round(22.5));
    expect(half.listenLevel).toBeCloseTo(3);
  });
});

describe('progressStatus', () => {
  it('is always on-track in the first 3 lessons', () => {
    const r = progressStatus(planFor(), { lesson: 3, itemsLearned: 0, ladder: ladder({ listen: 0, speak: 0 }) });
    expect(r.status).toBe('on-track');
    expect(r.daysDone).toBe(2);
    expect(r.adviceZh).toContain('刚刚开始');
  });

  it('on-track when items and levels match the plan', () => {
    const p = planFor();
    const exp = expectedAt(p, 8);
    const r = progressStatus(p, {
      lesson: 9, // 8 lessons done
      itemsLearned: exp.itemsLearned,
      ladder: ladder({ listen: Math.round(exp.listenLevel), speak: Math.round(exp.speakLevel) }),
    });
    expect(r.status).toBe('on-track');
    expect(r.adviceZh).toContain('按计划推进');
    expect(r.expected.itemsLearned).toBe(exp.itemsLearned);
  });

  it('behind: too few items -> advice about time or new count', () => {
    const p = planFor();
    const exp = expectedAt(p, 10);
    const r = progressStatus(p, { lesson: 11, itemsLearned: Math.floor(exp.itemsLearned * 0.5), ladder: ladder({ listen: Math.round(exp.listenLevel), speak: Math.round(exp.speakLevel) }) });
    expect(r.status).toBe('behind');
    expect(r.adviceZh).toContain('进度落后');
    expect(r.adviceZh).toContain('已学');
    expect(r.adviceZh).toContain('每天时长从 20 分钟加到 25 分钟');
    expect(r.adviceZh).toContain('延长到 60 天');
  });

  it('behind: listening far below the plan', () => {
    const p = planFor();
    const exp = expectedAt(p, 15);
    const r = progressStatus(p, { lesson: 16, itemsLearned: exp.itemsLearned, ladder: ladder({ listen: 1, speak: Math.round(exp.speakLevel) }) });
    expect(r.status).toBe('behind');
    expect(r.adviceZh).toContain('听力 L1');
    expect(r.adviceZh).toContain('连读');
  });

  it('suggests reducing new items when already at 30 min/day and the horizon is 100', () => {
    const p = planFor({ h: 100, daily: 30 });
    const exp = expectedAt(p, 40);
    const r = progressStatus(p, { lesson: 41, itemsLearned: Math.floor(exp.itemsLearned * 0.4), ladder: ladder({ listen: Math.round(exp.listenLevel), speak: Math.round(exp.speakLevel) }) });
    expect(r.status).toBe('behind');
    expect(r.adviceZh).not.toContain('加到');
    expect(r.adviceZh).not.toContain('延长到');
    expect(r.adviceZh).toContain('减少每天的新语块');
  });

  it('ahead: more items and higher levels than planned', () => {
    const p = planFor();
    const exp = expectedAt(p, 10);
    const r = progressStatus(p, { lesson: 11, itemsLearned: Math.ceil(exp.itemsLearned * 1.3), ladder: ladder({ listen: Math.round(exp.listenLevel) + 2, speak: Math.round(exp.speakLevel) + 1 }) });
    expect(r.status).toBe('ahead');
    expect(r.adviceZh).toContain('进度超前');
    expect(r.adviceZh).toContain('6 条/天');
  });

  it('one good and one bad dimension cancel out', () => {
    const p = planFor();
    const exp = expectedAt(p, 10);
    const r = progressStatus(p, { lesson: 11, itemsLearned: Math.ceil(exp.itemsLearned * 1.3), ladder: ladder({ listen: Math.max(0, Math.round(exp.listenLevel) - 2), speak: Math.round(exp.speakLevel) }) });
    expect(r.status).toBe('on-track');
  });

  it('item ratio thresholds: 0.8 is on-track, below is behind; 1.15 is ahead', () => {
    const p = planFor({ newPerDay: 10 });
    const exp = expectedAt(p, 10); // 100 + baseline 0 -> roughly 111
    const base = { lesson: 11, ladder: ladder({ listen: Math.round(exp.listenLevel), speak: Math.round(exp.speakLevel) }) };
    expect(progressStatus(p, { ...base, itemsLearned: Math.ceil(exp.itemsLearned * 0.8) }).status).toBe('on-track');
    expect(progressStatus(p, { ...base, itemsLearned: Math.floor(exp.itemsLearned * 0.79) }).status).toBe('behind');
    expect(progressStatus(p, { ...base, itemsLearned: Math.ceil(exp.itemsLearned * 1.15) }).status).toBe('ahead');
  });

  it('counts lessons from the goal start, and past the horizon compares with the final milestones', () => {
    const p = planFor({ startLesson: 11 });
    expect(progressStatus(p, { lesson: 15, itemsLearned: 0, ladder: ladder() }).daysDone).toBe(4);
    const end = progressStatus(p, { lesson: 80, itemsLearned: 10, ladder: ladder() });
    expect(end.expected).toEqual(p.phases[2].milestones);
    expect(end.status).toBe('behind');
  });
});
