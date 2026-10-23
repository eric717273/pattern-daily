import type { DayPlan, StepKey } from '../../types';

export interface StepInfo {
  key: StepKey;
  label: string;
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

export const STEP_ORDER: StepKey[] = STEPS.map((s) => s.key);

/** The step to show next: the first undone step after `after`, else the first undone one, else null. */
export function nextUndone(done: readonly StepKey[], after?: StepKey): StepKey | null {
  const start = after ? STEP_ORDER.indexOf(after) + 1 : 0;
  const later = STEP_ORDER.slice(start).find((s) => !done.includes(s));
  if (later) return later;
  return STEP_ORDER.find((s) => !done.includes(s)) ?? null;
}

/** Keep only the v2 step keys: legacy v1 keys ('warmup' | 'deconstruct' | 'frames') in old sessions are ignored. */
export function knownSteps(done: readonly string[]): StepKey[] {
  return STEP_ORDER.filter((s) => done.includes(s));
}

/** Minutes still to go, scaled to the learner's daily goal (the four steps add up to 15). */
export function remainingMinutes(done: readonly StepKey[], dailyMinutes = 15): number {
  const base = STEPS.filter((s) => !done.includes(s.key)).reduce((n, s) => n + s.minutes, 0);
  return base === 0 ? 0 : Math.max(1, Math.round((base * dailyMinutes) / 15));
}

/** Short label of today's decode work, e.g. "骨架 3/13" or "维护·变形". */
export function decodeBadge(decode: DayPlan['decode'], order: number): string {
  if (decode.phase === 'foundation') return `骨架 ${order}/13`;
  return decode.mode === 'transform' ? '维护·变形' : '维护·标注';
}
