import { exampleTurn } from './chunkDrill';
import type { LibraryItem } from '../content';
import type { DayPlan, DrillMode, Grade, ItemRef, Ladder, SubstitutionFrame } from '../types';
import { db } from './db';
import { hashString, seededRng } from './drill';
import { randomCombo } from './frameEngine';
import { itemKey } from './plan';
import { gradeCard, introduceItems, logMeasurement, type CardMeasurement } from './repo';
import { isDue } from './srs';

/** Items that become the targets of the output step: at most this many. */
export const MAX_OUTPUT_TARGETS = 6;

/** Local midnight of a 'YYYY-MM-DD' date, as epoch ms (NaN-safe: 0 for malformed input). */
export function startOfDay(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return 0;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

/** The keys ('chunk:c001') of every chunk/frame that has a live card, i.e. everything the learner has met. */
async function introducedKeys(): Promise<Set<string>> {
  const cards = await db.cards.filter((c) => !c.deleted && (c.kind === 'chunk' || c.kind === 'frame')).toArray();
  return new Set(cards.map((c) => c.id));
}

/** Plan items whose cards already exist, i.e. the ones learned today (or earlier in an interrupted lesson). */
export async function introducedPlanItems(plan: DayPlan): Promise<ItemRef[]> {
  const have = await introducedKeys();
  return plan.newItems.filter((r) => have.has(itemKey(r)));
}

/**
 * Targets of today's output prompts: the plan's new items that were introduced; when there are none (the library is
 * exhausted, or the learner skipped everything), the most recently introduced items, found by each card's first review.
 */
export async function pickOutputTargets(plan: DayPlan, limit: number = MAX_OUTPUT_TARGETS): Promise<ItemRef[]> {
  const base = await pickBaseTargets(plan, limit);
  return mixEdge(base, plan.edge ?? [], limit);
}

/** Today's new items with the edge items woven in after each one (v3): both are the weak spots worth using in a sentence. */
export function mixEdge(base: readonly ItemRef[], edge: readonly ItemRef[], limit: number): ItemRef[] {
  const seen = new Set<string>();
  const out: ItemRef[] = [];
  const add = (r: ItemRef | undefined) => {
    if (!r || seen.has(itemKey(r)) || out.length >= limit) return;
    seen.add(itemKey(r));
    out.push(r);
  };
  const n = Math.max(base.length, edge.length);
  for (let i = 0; i < n; i++) {
    add(base[i]);
    add(edge[i]);
  }
  return out;
}

async function pickBaseTargets(plan: DayPlan, limit: number): Promise<ItemRef[]> {
  const today = await introducedPlanItems(plan);
  if (today.length > 0) return today.slice(0, limit);

  const cards = await db.cards.filter((c) => !c.deleted && (c.kind === 'chunk' || c.kind === 'frame')).toArray();
  if (cards.length === 0) return [];
  const first = new Map<string, number>();
  await db.reviews
    .filter((r) => !r.deleted && (r.cardId.startsWith('chunk:') || r.cardId.startsWith('frame:')))
    .each((r) => {
      const prev = first.get(r.cardId);
      if (prev === undefined || r.reviewedAt < prev) first.set(r.cardId, r.reviewedAt);
    });
  return cards
    .map((c) => ({ c, at: first.get(c.id) ?? c.updatedAt }))
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map(({ c }) => ({ kind: c.kind as ItemRef['kind'], id: c.refId }));
}

export interface DaySummary {
  /** Plan items that have a card (learned in today's lesson). */
  learned: number;
  /** Reviews of chunk/frame cards that were not today's new items. */
  reviewed: number;
  /** Decode-track grades logged today. */
  decodeRounds: number;
}

/** What the learner did today, counted from the review log. */
export async function getDaySummary(date: string, plan: DayPlan): Promise<DaySummary> {
  const since = startOfDay(date);
  const newKeys = new Set(plan.newItems.map(itemKey));
  const have = await introducedKeys();
  const reviewedIds = new Set<string>();
  let decodeRounds = 0;
  await db.reviews
    .where('reviewedAt')
    .aboveOrEqual(since)
    .filter((r) => !r.deleted)
    .each((r) => {
      if (r.cardId.startsWith('dozen:')) decodeRounds++;
      else if (!newKeys.has(r.cardId)) reviewedIds.add(r.cardId);
    });
  return {
    learned: plan.newItems.filter((r) => have.has(itemKey(r))).length,
    reviewed: reviewedIds.size,
    decodeRounds,
  };
}

/** What the learner did in each part of an item's drill (reported by NewItemFlow / ReviewItem, additive to the grade). */
export interface ItemParts {
  /** The 听辨 question: picked the right chunk. */
  listen?: { correct: boolean; ms: number };
  /** The 说出 prompts (a chunk has one, a reviewed frame two sentences). */
  recall?: { correct: boolean; ms: number }[];
}

/** The speak measurement of an item: right when every prompt was said, latency = mean time of the right ones. */
export function speakMeasurement(recall: readonly { correct: boolean; ms: number }[], level?: number): CardMeasurement | undefined {
  if (recall.length === 0) return undefined;
  const right = recall.filter((r) => r.correct);
  const m: CardMeasurement = { skill: 'speak', correct: right.length === recall.length };
  if (right.length > 0) m.latencyMs = Math.round(right.reduce((a, r) => a + r.ms, 0) / right.length);
  if (level !== undefined) m.level = level;
  return m;
}

/** Writes the measurement logs of one finished item: the speak part rides on the graded log, the listen part is its own log. */
async function logParts(id: string, parts: ItemParts | undefined, ladder: Ladder | undefined, graded: boolean): Promise<CardMeasurement | undefined> {
  if (!parts) return undefined;
  if (parts.listen) {
    await logMeasurement({
      cardId: id,
      skill: 'listen',
      correct: parts.listen.correct,
      mode: 'listen',
      durationMs: Math.max(0, Math.round(parts.listen.ms)),
      latencyMs: Math.max(0, Math.round(parts.listen.ms)),
      ...(ladder ? { level: ladder.listen } : {}),
    });
  }
  const speak = parts.recall ? speakMeasurement(parts.recall, ladder?.speak) : undefined;
  if (speak && !graded) {
    await logMeasurement({
      cardId: id,
      skill: 'speak',
      correct: speak.correct ?? false,
      mode: 'recall',
      durationMs: 0,
      ...(speak.latencyMs !== undefined ? { latencyMs: speak.latencyMs } : {}),
      ...(speak.level !== undefined ? { level: speak.level } : {}),
    });
    return undefined;
  }
  return speak;
}

/**
 * Persist a finished new-item flow: the first time creates the card and grades it; when the item is already known
 * only a due card is graded, so repeating a finished step never disturbs the review schedule. With `parts` (v3
 * plans) the listen / speak results are also written as measurements.
 */
export async function saveNewItem(ref: ItemRef, grade: Grade, mode: DrillMode, ms: number, parts?: ItemParts, ladder?: Ladder): Promise<void> {
  const id = itemKey(ref);
  const card = await db.cards.get(id);
  if (!card || card.deleted) {
    await introduceItems([ref]);
    const speak = await logParts(id, parts, ladder, true);
    await gradeCard(id, grade, mode, ms, speak);
  } else if (isDue(card, Date.now())) {
    const speak = await logParts(id, parts, ladder, true);
    await gradeCard(id, grade, mode, ms, speak);
  } else {
    await logParts(id, parts, ladder, false);
  }
}

/** Persist one reviewed card (grade + SRS) together with its measurements. */
export async function saveReview(cardId: string, grade: Grade, mode: DrillMode, ms: number, parts?: ItemParts, ladder?: Ladder): Promise<void> {
  const speak = await logParts(cardId, parts, ladder, true);
  await gradeCard(cardId, grade, mode, ms, speak);
}

/** One output question. Chunk track only: the target is a chunk or a frame, never a grammar point. */
export interface ChunkOutputPrompt {
  promptZh: string;
  target: ItemRef;
  /** Sent to the grader: the chunk's English, or the frame's pattern. */
  targetChunk: string;
  /** AI prompts: 1-3 key words of the target. */
  hintEn?: string;
  /** Offline prompts: what to use, in Chinese ("用上：这取决于你"). */
  hintZh?: string;
  /** Frame targets: show the pattern pills. */
  frame?: SubstitutionFrame;
  /** Offline prompts: the model answer, revealed after the learner's attempt. */
  referenceEn?: string;
}

export function targetChunkOf(item: LibraryItem): string {
  return item.kind === 'chunk' ? item.chunk.en : item.frame.pattern;
}

export const idOf = (item: LibraryItem): string => (item.kind === 'chunk' ? item.chunk.id : item.frame.id);

/** Offline questions: a chunk's example turn (Chinese) to say with the chunk, or a random sentence of the frame. */
export function offlineChunkPrompts(items: readonly LibraryItem[], count: number, seed: string): ChunkOutputPrompt[] {
  const rng = seededRng(hashString(seed));
  const out: ChunkOutputPrompt[] = [];
  for (let i = 0; i < count && items.length > 0; i++) {
    const item = items[i % items.length];
    const round = Math.floor(i / items.length);
    if (item.kind === 'chunk') {
      const c = item.chunk;
      const ex = c.examples[round % Math.max(1, c.examples.length)];
      const turn = ex ? exampleTurn(ex, c.en) : { en: c.en, zh: c.zh };
      out.push({
        promptZh: turn.zh,
        target: { kind: 'chunk', id: c.id },
        targetChunk: c.en,
        hintZh: `用上：${c.zh}`,
        referenceEn: turn.en,
      });
    } else {
      const f = item.frame;
      const combo = randomCombo(f, rng);
      out.push({
        promptZh: combo.zh,
        target: { kind: 'frame', id: f.id },
        targetChunk: f.pattern,
        hintZh: `用这个句型：${f.title}`,
        frame: f,
        referenceEn: combo.en,
      });
    }
  }
  return out;
}
