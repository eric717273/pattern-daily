import type { DayPlan, StepKey } from '../../types';
import { listenRate, speakLimitMs } from '../../lib/ladder';
import { requiredSteps } from '../../lib/plan';

export interface StepInfo {
  key: StepKey;
  label: string;
  /** Default minutes (v2 plans; v3 plans carry their own `plan.budgetMin`). */
  minutes: number;
  hint: string;
}

/** The four v2 steps of a day (the two tracks: 语块线 = 复习 + 新语块 + 输出, 解码线 = 解码). They add up to 15 minutes. */
export const STEPS: StepInfo[] = [
  { key: 'review', label: '复习', minutes: 4, hint: '听出语块、说出语块：到期的卡片过一遍' },
  { key: 'chunks', label: '新语块', minutes: 6, hint: '今天的新语块：听辨、跟读、说出来' },
  { key: 'decode', label: '解码', minutes: 3, hint: '看懂结构，和语块练习分开' },
  { key: 'output', label: '输出', minutes: 2, hint: '用今天学的语块应对 3 个小情景' },
];

/** The v3 listening block (between 新语块 and 解码). */
export const LISTENING_STEP: StepInfo = {
  key: 'listening',
  label: '听力',
  minutes: 4,
  hint: '对话、音变、数字：练的是听懂连贯的语流',
};

/** All five steps in the order of a v3 day. */
export const ALL_STEPS: StepInfo[] = [STEPS[0], STEPS[1], LISTENING_STEP, STEPS[2], STEPS[3]];

/** v2 order (kept for callers that do not know the plan). */
export const STEP_ORDER: StepKey[] = STEPS.map((s) => s.key);

/** The steps of a day: 5 for a v3 plan (with a listening block), 4 for a v2 plan. */
export function stepsFor(plan: DayPlan | undefined): StepInfo[] {
  const keys = requiredSteps(plan);
  return ALL_STEPS.filter((s) => keys.includes(s.key));
}

/** True for a plan made with a goal (ladder + budgets + listening block). */
export function isV3Plan(plan: DayPlan | undefined): boolean {
  return plan?.ladder !== undefined && plan.listening !== undefined;
}

/** Minutes budgeted for a step: the plan's budget when it has one, else the v2 default. */
export function stepMinutes(plan: DayPlan | undefined, key: StepKey): number {
  const info = ALL_STEPS.find((s) => s.key === key);
  return plan?.budgetMin?.[key] ?? info?.minutes ?? 3;
}

/** The step to show next: the first undone step after `after`, else the first undone one, else null. */
export function nextUndone(done: readonly StepKey[], after?: StepKey, order: readonly StepKey[] = STEP_ORDER): StepKey | null {
  const start = after ? order.indexOf(after) + 1 : 0;
  const later = order.slice(start).find((s) => !done.includes(s));
  if (later) return later;
  return order.find((s) => !done.includes(s)) ?? null;
}

/** Keep only the known step keys: legacy v1 keys ('warmup' | 'deconstruct' | 'frames') in old sessions are ignored. */
export function knownSteps(done: readonly string[]): StepKey[] {
  return ALL_STEPS.map((s) => s.key).filter((s) => done.includes(s));
}

/** Minutes still to go. v3 plans: the budgets of the undone steps; v2: scaled to the learner's daily goal (the four steps add up to 15). */
export function remainingMinutes(done: readonly StepKey[], dailyMinutes = 15, plan?: DayPlan): number {
  if (plan && isV3Plan(plan)) {
    return stepsFor(plan)
      .filter((s) => !done.includes(s.key))
      .reduce((n, s) => n + stepMinutes(plan, s.key), 0);
  }
  const base = STEPS.filter((s) => !done.includes(s.key)).reduce((n, s) => n + s.minutes, 0);
  return base === 0 ? 0 : Math.max(1, Math.round((base * dailyMinutes) / 15));
}

/** Short label of today's decode work, e.g. "骨架 3/13" or "维护·变形". */
export function decodeBadge(decode: DayPlan['decode'], order: number): string {
  if (decode.phase === 'foundation') return `骨架 ${order}/13`;
  return decode.mode === 'transform' ? '维护·变形' : '维护·标注';
}

/** Concrete micro-goals of a v3 day, derived from the plan: "新学 5 条", "听力语速 1.05×", "口语 6 秒内说出", "正确率保持在 70–88%". */
export function todayGoals(plan: DayPlan): string[] {
  const out: string[] = [];
  if (plan.newItems.length > 0) out.push(`新学 ${plan.newItems.length} 条`);
  if (plan.ladder) {
    out.push(`听力语速 ${listenRate(plan.ladder.listen).toFixed(2)}`);
    out.push(`口语 ${speakLimitMs(plan.ladder.speak) / 1000} 秒内说出`);
  }
  out.push('正确率保持在 70–88%');
  return out;
}

/** m:ss for a countdown (never negative). */
export function formatClock(sec: number): string {
  const total = Math.max(0, Math.ceil(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
