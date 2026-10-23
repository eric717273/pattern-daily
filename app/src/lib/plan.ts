import type { DayPlan, ItemRef } from '../types';
import { DOZEN } from '../content';

const OUTPUT_COUNT = 3;
/** Days 1-13 learn one skeleton sentence per day; afterwards the decode track only maintains. */
const FOUNDATION_DAYS = 13;
export const DEFAULT_NEW_PER_DAY = 5;
export const MIN_NEW_PER_DAY = 3;
export const MAX_NEW_PER_DAY = 10;

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

/** Key of an item in the `introduced` set, identical to its card id: 'chunk:c001' | 'frame:f001'. */
export function itemKey(ref: ItemRef): string {
  return `${ref.kind}:${ref.id}`;
}

export function clampNewPerDay(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n)) return DEFAULT_NEW_PER_DAY;
  return Math.min(MAX_NEW_PER_DAY, Math.max(MIN_NEW_PER_DAY, Math.round(n)));
}

/** The dozen sentence with the given 1-based position (by `order`); falls back to the canonical id d01..d13. */
function dozenIdAt(position: number): string {
  const found = DOZEN.find((d) => d.order === position) ?? DOZEN[position - 1];
  return found ? found.id : `d${pad(position)}`;
}

export interface PlanInput {
  /** 1-based lesson number. */
  dayIndex: number;
  /** Keys ('chunk:c001' | 'frame:f001') of the items the learner has already met. */
  introduced: ReadonlySet<string>;
  /** Learning order of the chunk track (content CURRICULUM). */
  curriculum: readonly ItemRef[];
  /** New chunk-track items per day; clamped to 3-10. */
  newPerDay: number;
}

/**
 * The plan for one day, two independent tracks:
 * - decode: days 1-13 learn skeleton sentence #dayIndex ('foundation'); from day 14 one ~3-minute exercise on
 *   the skeletons in rotation (d01..d13), alternating 'transform' (even offset) and 'label' (odd offset).
 * - chunks: the first `newPerDay` curriculum items that are not yet introduced. Fewer when the library runs out.
 * Pure and deterministic: the same inputs always give the same plan.
 */
export function getDayPlan(i: PlanInput): DayPlan {
  const day = Number.isFinite(i.dayIndex) ? Math.max(1, Math.floor(i.dayIndex)) : 1;

  const n = clampNewPerDay(i.newPerDay);
  const newItems: ItemRef[] = [];
  for (const ref of i.curriculum) {
    if (newItems.length >= n) break;
    if (!i.introduced.has(itemKey(ref))) newItems.push({ kind: ref.kind, id: ref.id });
  }

  if (day <= FOUNDATION_DAYS) {
    return { dayIndex: day, decode: { phase: 'foundation', dozenId: dozenIdAt(day) }, newItems, outputCount: OUTPUT_COUNT };
  }
  const offset = day - FOUNDATION_DAYS - 1;
  return {
    dayIndex: day,
    decode: {
      phase: 'maintenance',
      dozenId: dozenIdAt((offset % FOUNDATION_DAYS) + 1),
      mode: offset % 2 === 0 ? 'transform' : 'label',
    },
    newItems,
    outputCount: OUTPUT_COUNT,
  };
}
