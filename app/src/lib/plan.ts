import type { Dialogue, DialogueTier, DayPlan, ItemRef, Ladder, Scene, SoundPattern, StepKey } from '../types';
import { DOZEN } from '../content';
import { clampNewPerDayV3, dialogueTier } from './ladder';

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

/** The first `n` curriculum items that are not introduced yet (fewer when the library runs out). */
function pickNewItems(curriculum: readonly ItemRef[], introduced: ReadonlySet<string>, n: number): ItemRef[] {
  const out: ItemRef[] = [];
  for (const ref of curriculum) {
    if (out.length >= n) break;
    if (!introduced.has(itemKey(ref))) out.push({ kind: ref.kind, id: ref.id });
  }
  return out;
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

  const newItems = pickNewItems(i.curriculum, i.introduced, clampNewPerDay(i.newPerDay));

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

// ---------- v3 (deliberate practice) ----------

const STEP_ORDER: StepKey[] = ['review', 'chunks', 'listening', 'decode', 'output'];
/** Share of the daily minutes per block (research/DELIBERATE-PRACTICE.md §七), in STEP_ORDER. */
const STEP_SHARE: Record<StepKey, number> = { review: 25, chunks: 25, listening: 25, decode: 10, output: 15 };
/** Number-dictation items in the listening block. */
export const NUMBERS_PER_DAY = 3;
/** A listening block of at least this many minutes gets two dialogues instead of one. */
const TWO_DIALOGUES_MIN = 6;
/** Edge items prioritised in a day's review and output. */
export const MAX_EDGE_ITEMS = 5;
/** Lessons since the last assessment after which the weekly checkpoint is offered. */
export const CHECKPOINT_EVERY_LESSONS = 7;

/**
 * Minutes per block: 25 / 25 / 25 / 10 / 15 % of `dailyMinutes` (review, chunks, listening, decode, output),
 * whole minutes that sum exactly to `dailyMinutes` (largest-remainder rounding).
 */
export function splitBudget(dailyMinutes: number): Record<StepKey, number> {
  const total = Math.max(0, Math.round(dailyMinutes));
  const raw = STEP_ORDER.map((k) => (total * STEP_SHARE[k]) / 100);
  const mins = raw.map(Math.floor);
  let left = total - mins.reduce((a, b) => a + b, 0);
  const byRemainder = raw.map((r, idx) => ({ idx, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.idx - b.idx);
  for (const { idx } of byRemainder) {
    if (left <= 0) break;
    mins[idx]++;
    left--;
  }
  return Object.fromEntries(STEP_ORDER.map((k, idx) => [k, mins[idx]])) as Record<StepKey, number>;
}

export interface DialoguePickInput {
  dialogues: readonly Dialogue[];
  tier: DialogueTier;
  count: number;
  scenes: readonly Scene[];
  /** dialogue id -> epoch ms it was last practiced (any ReviewLog with cardId 'dialogue:<id>'). */
  heardAt: ReadonlyMap<string, number>;
}

/**
 * 1-2 dialogues at `tier`: first the ones never heard (preferred scenes first, then id order); when fewer than
 * `count` remain, the least recently heard ones are recycled.
 */
export function pickDialogues(i: DialoguePickInput): string[] {
  const pool = i.dialogues.filter((d) => d.tier === i.tier);
  const sceneRank = (d: Dialogue): number => (i.scenes.length === 0 || i.scenes.includes(d.scene) ? 0 : 1);
  const byId = (a: Dialogue, b: Dialogue): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const fresh = pool.filter((d) => !i.heardAt.has(d.id)).sort((a, b) => sceneRank(a) - sceneRank(b) || byId(a, b));
  const picked = fresh.slice(0, i.count);
  if (picked.length < i.count) {
    const recycled = pool
      .filter((d) => i.heardAt.has(d.id))
      .sort((a, b) => (i.heardAt.get(a.id) ?? 0) - (i.heardAt.get(b.id) ?? 0) || sceneRank(a) - sceneRank(b) || byId(a, b));
    picked.push(...recycled.slice(0, i.count - picked.length));
  }
  return picked.map((d) => d.id);
}

/**
 * Today's sound-pattern drill: the next pattern never introduced (by pattern level, then id); when all are
 * introduced, the due sound card that has waited longest (`dueSoundIds` is expected in due order).
 */
export function pickSound(
  sounds: readonly SoundPattern[],
  introduced: ReadonlySet<string>,
  dueSoundIds: readonly string[],
): string | undefined {
  const next = [...sounds]
    .filter((s) => !introduced.has(s.id))
    .sort((a, b) => a.level - b.level || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
  return next?.id ?? dueSoundIds[0];
}

export interface PlanV3Input {
  dayIndex: number;
  introduced: ReadonlySet<string>;
  curriculum: readonly ItemRef[];
  /** The ladder in force; its newPerDay (3-12) decides the number of new chunks. */
  ladder: Ladder;
  dailyMinutes: number;
  dialogues: readonly Dialogue[];
  heardAt: ReadonlyMap<string, number>;
  scenes: readonly Scene[];
  sounds: readonly SoundPattern[];
  introducedSounds: ReadonlySet<string>;
  /** Ids of due sound cards, longest-waiting first. */
  dueSoundIds: readonly string[];
  edge: readonly ItemRef[];
  checkpointDue: boolean;
}

/**
 * The deliberate-practice plan for one day: the v2 plan (decode track, new chunks) with the v3 fields on top:
 * ladder snapshot, minute budget per block, the listening block (dialogues at the current tier, one sound
 * pattern, 3 number items), edge items (max 5) and the weekly-checkpoint flag. Pure and deterministic.
 */
export function getDayPlanV3(i: PlanV3Input): DayPlan {
  const ladder: Ladder = { ...i.ladder, newPerDay: clampNewPerDayV3(i.ladder.newPerDay) };
  const base = getDayPlan({ dayIndex: i.dayIndex, introduced: i.introduced, curriculum: [], newPerDay: ladder.newPerDay });
  const budgetMin = splitBudget(i.dailyMinutes);
  const soundId = pickSound(i.sounds, i.introducedSounds, i.dueSoundIds);
  return {
    ...base,
    newItems: pickNewItems(i.curriculum, i.introduced, ladder.newPerDay),
    ladder,
    budgetMin,
    listening: {
      dialogueIds: pickDialogues({
        dialogues: i.dialogues,
        tier: dialogueTier(ladder.listen),
        count: budgetMin.listening >= TWO_DIALOGUES_MIN ? 2 : 1,
        scenes: i.scenes,
        heardAt: i.heardAt,
      }),
      ...(soundId !== undefined ? { soundId } : {}),
      numbers: NUMBERS_PER_DAY,
    },
    edge: i.edge.slice(0, MAX_EDGE_ITEMS).map((r) => ({ kind: r.kind, id: r.id })),
    checkpointDue: i.checkpointDue,
  };
}

/** Steps a day needs to count as completed: the 5 v3 steps for a v3 plan (it has a listening block), else the 4 v2 steps. */
export function requiredSteps(plan: DayPlan | undefined): StepKey[] {
  return plan?.listening ? STEP_ORDER : STEP_ORDER.filter((k) => k !== 'listening');
}

export const ALL_STEP_KEYS: readonly StepKey[] = STEP_ORDER;
