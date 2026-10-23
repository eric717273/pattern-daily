import type { StepKey } from '../../types';

export interface StepInfo {
  key: StepKey;
  label: string;
  /** Short label for the tab strip. */
  short: string;
  minutes: number;
  hint: string;
}

export const STEPS: StepInfo[] = [
  { key: 'warmup', label: '热身复习', short: '热身', minutes: 2, hint: '间隔重复：先把到期的卡片过一遍' },
  { key: 'deconstruct', label: '解构', short: '解构', minutes: 4, hint: '看清今天这句的骨架，再把词块拼回去' },
  { key: 'frames', label: '母框替换', short: '母框', minutes: 6, hint: '帕默三步：锚定、单槽快替、中译英' },
  { key: 'output', label: '模组替换输出', short: '输出', minutes: 3, hint: '用今天的骨架，自己造 3 句' },
];

export const STEP_ORDER: StepKey[] = STEPS.map((s) => s.key);

/** The step to show next: the first undone step after `after`, else the first undone one, else null. */
export function nextUndone(done: StepKey[], after?: StepKey): StepKey | null {
  const start = after ? STEP_ORDER.indexOf(after) + 1 : 0;
  const later = STEP_ORDER.slice(start).find((s) => !done.includes(s));
  if (later) return later;
  return STEP_ORDER.find((s) => !done.includes(s)) ?? null;
}

/** Minutes still to go, scaled to the learner's daily goal (the four steps add up to 15). */
export function remainingMinutes(done: StepKey[], dailyMinutes = 15): number {
  const base = STEPS.filter((s) => !done.includes(s.key)).reduce((n, s) => n + s.minutes, 0);
  return base === 0 ? 0 : Math.max(1, Math.round((base * dailyMinutes) / 15));
}

export const PHASE_LABELS = {
  deconstruct: '解构期',
  frames: '母框期',
  maintenance: '维护期',
} as const;
