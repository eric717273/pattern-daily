import type { DayPlan, DozenSentence, Scene, SubstitutionFrame } from '../types';
import { DOZEN } from '../content';

const OUTPUT_COUNT = 3;
const PHASE1_DAYS = 13;
const PHASE2_END = 30;
const FRAMES_PER_DAY = 3;
const SCENE_ORDER: Scene[] = ['daily', 'work', 'travel', 'social', 'study'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local-timezone calendar date 'YYYY-MM-DD'. */
export function todayStr(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function parseDate(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** 1-based day of the plan: the start date itself is day 1. Never less than 1. */
export function dayIndexFor(startDate: string, today: string): number {
  const a = parseDate(startDate);
  const b = parseDate(today);
  if (a === null || b === null) return 1;
  const days = Math.round((b - a) / 86_400_000);
  return Math.max(1, days + 1);
}

// ---------- plan construction ----------

type Plan = Pick<DayPlan, 'dozenId' | 'frameIds'>;

function sentenceForDay(day: number): DozenSentence | undefined {
  return DOZEN.find((d) => d.order === day) ?? (DOZEN.length > 0 ? DOZEN[(day - 1) % DOZEN.length] : undefined);
}

/** Dozen sentence reviewed on a given day after the new-sentence phase: cycles through all of them. */
function reviewDozenId(day: number): string {
  if (DOZEN.length === 0) return '';
  const i = (((day - PHASE1_DAYS - 1) % DOZEN.length) + DOZEN.length) % DOZEN.length;
  return DOZEN[i].id;
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** Days 1-13: for each sentence, 2 frames sharing its grammar, avoiding frames used on earlier days. */
function planPhase1(frames: SubstitutionFrame[]): Plan[] {
  const plans: Plan[] = [];
  const used = new Set<string>();
  for (let day = 1; day <= PHASE1_DAYS; day++) {
    const sentence = sentenceForDay(day);
    const grammar = new Set(sentence?.grammar ?? []);
    const listed = sentence?.frameIds ?? [];
    const ranked = frames
      .map((f, order) => {
        const relevant = f.grammar.some((g) => grammar.has(g));
        const listedAt = listed.indexOf(f.id);
        const isListed = listedAt >= 0;
        // 0: relevant+fresh, 1: relevant+used, 2: other listed frame, 3: anything else
        const tier = relevant ? (used.has(f.id) ? 1 : 0) : isListed ? 2 : 3;
        return { f, order, key: [tier, isListed ? 0 : 1, isListed ? listedAt : 0, f.level, order] };
      })
      .sort((x, y) => compareKeys(x.key, y.key));
    const chosen = ranked.slice(0, 2).map((r) => r.f.id);
    for (const id of chosen) used.add(id);
    plans.push({ dozenId: sentence?.id ?? '', frameIds: chosen });
  }
  return plans;
}

/** Days 14-30: 3 frames/day, level 1 -> 3 over the period, scenes rotating, preferring unused frames. */
function planPhase2(frames: SubstitutionFrame[], phase1: Plan[]): Plan[] {
  const useCount = new Map<string, number>();
  for (const p of phase1) for (const id of p.frameIds) useCount.set(id, (useCount.get(id) ?? 0) + 1);

  const present = new Set(frames.map((f) => f.scene));
  const scenes = [...SCENE_ORDER.filter((s) => present.has(s)), ...[...present].filter((s) => !SCENE_ORDER.includes(s))];
  const days = PHASE2_END - PHASE1_DAYS;

  const plans: Plan[] = [];
  for (let k = 0; k < days; k++) {
    const targetLevel = 1 + Math.floor((k * 3) / days);
    const today: string[] = [];
    for (let j = 0; j < FRAMES_PER_DAY; j++) {
      const scene = scenes.length > 0 ? scenes[(k * FRAMES_PER_DAY + j) % scenes.length] : undefined;
      let best: { id: string; cost: number } | null = null;
      for (const f of frames) {
        if (today.includes(f.id)) continue;
        const cost =
          3 * (useCount.get(f.id) ?? 0) + 2 * Math.abs(f.level - targetLevel) + (f.scene === scene ? 0 : 1);
        if (best === null || cost < best.cost) best = { id: f.id, cost };
      }
      if (best === null) break;
      today.push(best.id);
      useCount.set(best.id, (useCount.get(best.id) ?? 0) + 1);
    }
    plans.push({ dozenId: reviewDozenId(PHASE1_DAYS + 1 + k), frameIds: today });
  }
  return plans;
}

/** Day 31+: deterministic rotation over all frames (3/day) and over the dozen. */
function planMaintenance(day: number, frames: SubstitutionFrame[]): Plan {
  const m = day - PHASE2_END - 1;
  const n = frames.length;
  const frameIds: string[] = [];
  for (let i = 0; i < Math.min(FRAMES_PER_DAY, n); i++) {
    frameIds.push(frames[(m * FRAMES_PER_DAY + i) % n].id);
  }
  return { dozenId: reviewDozenId(day), frameIds };
}

/**
 * The plan for a given day of the program, computed from the supplied frame list (seed + user frames).
 * Pure and deterministic: the same inputs always give the same plan.
 */
export function getDayPlan(dayIndex: number, frames: SubstitutionFrame[]): DayPlan {
  const day = Number.isFinite(dayIndex) ? Math.max(1, Math.floor(dayIndex)) : 1;

  if (day <= PHASE1_DAYS) {
    const p = planPhase1(frames)[day - 1];
    return { dayIndex: day, phase: 'deconstruct', ...p, outputCount: OUTPUT_COUNT };
  }
  if (day <= PHASE2_END) {
    const p = planPhase2(frames, planPhase1(frames))[day - PHASE1_DAYS - 1];
    return { dayIndex: day, phase: 'frames', ...p, outputCount: OUTPUT_COUNT };
  }
  return { dayIndex: day, phase: 'maintenance', ...planMaintenance(day, frames), outputCount: OUTPUT_COUNT };
}
