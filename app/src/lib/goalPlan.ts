import type { Assessment, Goal, Ladder } from '../types';
import { MAX_LISTEN_LEVEL, MAX_SPEAK_LEVEL, listenRate, dialogueTier, speakLimitMs } from './ladder';

// Plan generation and progress tracking (research/DELIBERATE-PRACTICE.md §六). Pure.

/** Size of the whole library (150 frames + 350 chunks); item milestones never exceed it. */
export const DEFAULT_LIBRARY_SIZE = 500;
/** Phase boundaries as shares of the horizon: foundation first 30%, expand to 70%, sprint the rest. */
export const PHASE_END_SHARE = [0.3, 0.7, 1] as const;

export interface Milestone {
  itemsLearned: number;
  listenLevel: number;
  speakLevel: number;
}

export interface GoalPhase {
  id: 'foundation' | 'expand' | 'sprint';
  nameZh: '打基础' | '扩展' | '提速';
  /** 1-based plan days (day 1 = the lesson the goal started on), inclusive. */
  fromDay: number;
  toDay: number;
  focusZh: string;
  /** To be reached by the end of the phase. */
  milestones: Milestone;
  /** "第 9 天：已学 45 条，听力 L4（第 2 档对话 · 1.05×），限时 ≤6 秒说出" */
  milestoneZh: string;
}

export interface GoalPlan {
  horizonDays: number;
  dailyMinutes: number;
  startLesson: number;
  newPerDay: number;
  /** Where the learner starts (placement or current ladder). */
  baseline: Milestone;
  phases: GoalPhase[];
  /** Plan day of `todayLesson` (1-based, may exceed the horizon). */
  currentDay: number;
  /** 0-based index of the phase `currentDay` falls in (the last phase when past the horizon). */
  currentPhase: number;
}

export interface GoalPlanOptions {
  /** Items already learned when the plan is made (default: the placement's fast-tracked chunks). */
  itemsLearned?: number;
  librarySize?: number;
}

const FOCUS: Record<GoalPhase['id'], { nameZh: GoalPhase['nameZh']; focusZh: string }> = {
  foundation: {
    nameZh: '打基础',
    focusZh: '频率等级 1 的高频语块；第 1 档对话；13 个骨架句；基础音变（缩读、弱读）。',
  },
  expand: {
    nameZh: '扩展',
    focusZh: '频率等级 2 的语块；第 2 档对话；连读与吞音；更多母框。',
  },
  sprint: {
    nameZh: '提速',
    focusZh: '频率等级 3 的语块；第 3 档对话；更快语速；自由口语输出。',
  },
};

function milestoneText(day: number, m: Milestone): string {
  const tier = dialogueTier(m.listenLevel);
  return `第 ${day} 天：已学 ${m.itemsLearned} 条，听力 L${m.listenLevel}（第 ${tier} 档对话，语速 ${listenRate(m.listenLevel).toFixed(2)}×），限时 ≤${speakLimitMs(m.speakLevel) / 1000} 秒说出`;
}

/**
 * Three phases (打基础 / 扩展 / 提速 at 30% / 70% / 100% of the horizon), each with measurable milestones:
 * - itemsLearned: start + newPerDay x days up to the end of the phase (capped at the library size);
 * - listenLevel: start level + phase number x 2, at most L8;
 * - speakLevel: start level + phase number, at most S5.
 * The start is the placement result when given, otherwise the current ladder.
 */
export function buildGoalPlan(
  goal: Goal,
  placement: Assessment | undefined,
  ladder: Ladder,
  newPerDay: number,
  todayLesson: number,
  opts: GoalPlanOptions = {},
): GoalPlan {
  const horizon = goal.horizonDays;
  const librarySize = opts.librarySize ?? DEFAULT_LIBRARY_SIZE;
  const baseline: Milestone = {
    itemsLearned: Math.min(librarySize, opts.itemsLearned ?? placement?.fastTracked?.length ?? 0),
    listenLevel: placement?.listenLevel ?? ladder.listen,
    speakLevel: placement?.speakLevel ?? ladder.speak,
  };

  const ids = ['foundation', 'expand', 'sprint'] as const;
  let from = 1;
  const phases: GoalPhase[] = ids.map((id, i) => {
    const toDay = i === ids.length - 1 ? horizon : Math.max(from, Math.round(horizon * PHASE_END_SHARE[i]));
    const milestones: Milestone = {
      itemsLearned: Math.min(librarySize, baseline.itemsLearned + Math.round(newPerDay) * toDay),
      listenLevel: Math.min(MAX_LISTEN_LEVEL, baseline.listenLevel + 2 * (i + 1)),
      speakLevel: Math.min(MAX_SPEAK_LEVEL, baseline.speakLevel + (i + 1)),
    };
    const phase: GoalPhase = {
      id,
      nameZh: FOCUS[id].nameZh,
      fromDay: from,
      toDay,
      focusZh: FOCUS[id].focusZh,
      milestones,
      milestoneZh: milestoneText(toDay, milestones),
    };
    from = toDay + 1;
    return phase;
  });

  const currentDay = Math.max(1, Math.floor(todayLesson) - goal.startLesson + 1);
  const idx = phases.findIndex((p) => currentDay <= p.toDay);
  return {
    horizonDays: horizon,
    dailyMinutes: goal.dailyMinutes,
    startLesson: goal.startLesson,
    newPerDay,
    baseline,
    phases,
    currentDay,
    currentPhase: idx < 0 ? phases.length - 1 : idx,
  };
}

// ---------- progress ----------

export type ProgressStatus = 'ahead' | 'on-track' | 'behind';

export interface ProgressCurrent {
  lesson: number;
  itemsLearned: number;
  ladder: Ladder;
}

export interface ProgressReport {
  status: ProgressStatus;
  adviceZh: string;
  /** Completed lessons since the goal started. */
  daysDone: number;
  /** Where the plan says the learner should be after `daysDone` lessons (linear between milestones). */
  expected: Milestone;
}

/** Fewer completed lessons than this and the status is always 'on-track' (too little data). */
const MIN_DAYS_FOR_STATUS = 3;
const ITEMS_AHEAD_RATIO = 1.15;
const ITEMS_BEHIND_RATIO = 0.8;
const LEVEL_AHEAD_DIFF = 1;
const LEVEL_BEHIND_DIFF = -1.5;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** The milestone interpolated linearly at `day` completed lessons (0 = baseline). */
export function expectedAt(plan: GoalPlan, day: number): Milestone {
  const points: { day: number; m: Milestone }[] = [
    { day: 0, m: plan.baseline },
    ...plan.phases.map((p) => ({ day: p.toDay, m: p.milestones })),
  ];
  const d = Math.min(Math.max(0, day), plan.horizonDays);
  for (let i = 1; i < points.length; i++) {
    if (d <= points[i].day) {
      const a = points[i - 1];
      const b = points[i];
      const t = b.day === a.day ? 1 : (d - a.day) / (b.day - a.day);
      return {
        itemsLearned: Math.round(lerp(a.m.itemsLearned, b.m.itemsLearned, t)),
        listenLevel: lerp(a.m.listenLevel, b.m.listenLevel, t),
        speakLevel: lerp(a.m.speakLevel, b.m.speakLevel, t),
      };
    }
  }
  return points[points.length - 1].m;
}

function flag(value: number, ahead: number, behind: number): -1 | 0 | 1 {
  if (value >= ahead) return 1;
  if (value <= behind) return -1;
  return 0;
}

/**
 * Compare the learner with the plan. Items, listening level and speaking level each vote ahead (+1), behind (-1) or
 * neutral: items by ratio (>= 1.15 / < 0.8 of the expected count), levels by difference (>= +1 / <= -1.5 levels
 * versus the interpolated expectation). Sum >= 1 -> 'ahead', <= -1 -> 'behind', otherwise 'on-track'.
 * With fewer than 3 completed lessons the status is always 'on-track'.
 */
export function progressStatus(plan: GoalPlan, current: ProgressCurrent): ProgressReport {
  const daysDone = Math.max(0, Math.floor(current.lesson) - plan.startLesson);
  const expected = expectedAt(plan, daysDone);

  if (daysDone < MIN_DAYS_FOR_STATUS) {
    return {
      status: 'on-track',
      daysDone,
      expected,
      adviceZh: '刚刚开始，先把每天的练习坚持下来，数据多了才能判断进度。',
    };
  }

  const ratio = expected.itemsLearned < 5 ? 1 : current.itemsLearned / expected.itemsLearned;
  const itemsVote: -1 | 0 | 1 = ratio >= ITEMS_AHEAD_RATIO ? 1 : ratio < ITEMS_BEHIND_RATIO ? -1 : 0;
  const listenDiff = current.ladder.listen - expected.listenLevel;
  const speakDiff = current.ladder.speak - expected.speakLevel;
  const listenVote = flag(listenDiff, LEVEL_AHEAD_DIFF, LEVEL_BEHIND_DIFF);
  const speakVote = flag(speakDiff, LEVEL_AHEAD_DIFF, LEVEL_BEHIND_DIFF);
  const sum = itemsVote + listenVote + speakVote;

  const status: ProgressStatus = sum >= 1 ? 'ahead' : sum <= -1 ? 'behind' : 'on-track';
  const expItems = expected.itemsLearned;
  const expListen = Math.round(expected.listenLevel);
  const expSpeak = Math.round(expected.speakLevel);

  let adviceZh: string;
  if (status === 'on-track') {
    adviceZh = `按计划推进：已学 ${current.itemsLearned} 条（计划约 ${expItems} 条），听力 L${current.ladder.listen}、口语 S${current.ladder.speak}，继续保持。`;
  } else if (status === 'ahead') {
    const bits: string[] = [];
    if (itemsVote === 1) bits.push(`已学 ${current.itemsLearned} 条，比计划（约 ${expItems} 条）多`);
    if (listenVote === 1) bits.push(`听力 L${current.ladder.listen} 高于计划的 L${expListen}`);
    if (speakVote === 1) bits.push(`口语 S${current.ladder.speak} 高于计划的 S${expSpeak}`);
    adviceZh = `进度超前：${bits.join('；')}。可以把新语块提高到 ${Math.min(12, Math.round(plan.newPerDay) + 1)} 条/天，或把目标等级再调高一点。`;
  } else {
    const bits: string[] = [];
    const fixes: string[] = [];
    if (itemsVote === -1) {
      bits.push(`已学 ${current.itemsLearned} 条，计划此时约 ${expItems} 条`);
      fixes.push(
        plan.dailyMinutes < 30
          ? `把每天时长从 ${plan.dailyMinutes} 分钟加到 ${Math.min(30, plan.dailyMinutes + 5)} 分钟`
          : '把每天新学数量保持在计划值，先不要再增加难度',
      );
    }
    if (listenVote === -1) {
      bits.push(`听力 L${current.ladder.listen}，计划应到 L${expListen}`);
      fixes.push('每天多做一段对话听写，重点练连读和弱读');
    }
    if (speakVote === -1) {
      bits.push(`口语 S${current.ladder.speak}，计划应到 S${expSpeak}`);
      fixes.push('多做限时复述，先求说对再求变快');
    }
    const longer = plan.horizonDays < 60 ? 60 : plan.horizonDays < 100 ? 100 : undefined;
    if (longer !== undefined) fixes.push(`或者把周期延长到 ${longer} 天`);
    else if (itemsVote === -1) fixes.push('或者减少每天的新语块数量，把复习做扎实');
    adviceZh = `进度落后：${bits.join('；')}。建议：${fixes.slice(0, 3).join('；')}。`;
  }
  return { status, adviceZh, daysDone, expected };
}
