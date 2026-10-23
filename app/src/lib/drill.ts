import type { CardState, DozenSentence, Grade, Level, SlotOption, SubstitutionFrame } from '../types';
import { getDozen } from '../content';
import { buildCombo, randomCombo } from './frameEngine';

export type Rng = () => number;

// ---------- deterministic randomness ----------

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: small seeded PRNG. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------- 语序重建 (order drill) ----------

export interface Tile {
  /** Position of the word in the original sentence; unique even when words repeat. */
  id: number;
  text: string;
}

/** Split an English sentence into shuffled word tiles. The result differs from the original order when possible. */
export function makeTiles(en: string, rng: Rng = Math.random): Tile[] {
  const words = en.trim().split(/\s+/).filter(Boolean);
  const tiles: Tile[] = words.map((text, id) => ({ id, text }));
  const sameOrder = (t: Tile[]) => t.every((x, i) => x.text === tiles[i].text);
  const distinct = new Set(words).size > 1;
  let out = shuffled(tiles, rng);
  for (let tries = 0; distinct && sameOrder(out) && tries < 10; tries++) out = shuffled(tiles, rng);
  return out;
}

/** The sentence formed by the tiles with the given ids, in the order they were placed. */
export function sentenceFromTiles(tiles: Tile[], placedIds: number[]): string {
  return placedIds
    .map((id) => tiles.find((t) => t.id === id)?.text ?? '')
    .filter(Boolean)
    .join(' ');
}

/** Variant (daily or work level) used for today's order drill: deterministic per day key. */
export function pickDailyVariant(dozen: DozenSentence, dayKey: string): { en: string; zh: string; level: Level } {
  const pool = dozen.variants.filter((v) => v.level === 'daily' || v.level === 'work');
  const list = pool.length > 0 ? pool : dozen.variants;
  if (list.length === 0) return { en: dozen.en, zh: dozen.zh, level: 'dummy' };
  return list[hashString(`${dayKey}|${dozen.id}`) % list.length];
}

// ---------- grading helpers ----------

/** Default self-grade suggested for a typed answer. */
export function suggestGrade(similarity: number): Grade {
  if (similarity >= 0.95) return 2;
  if (similarity >= 0.7) return 1;
  return 0;
}

export const GRADE_LABELS: Record<Grade, string> = { 0: '忘了', 1: '困难', 2: '良好', 3: '简单' };
export const GRADES: Grade[] = [0, 1, 2, 3];

export function averageGrade(grades: Grade[]): Grade {
  if (grades.length === 0) return 2;
  const avg = grades.reduce<number>((a, g) => a + g, 0) / grades.length;
  return Math.min(3, Math.max(0, Math.round(avg))) as Grade;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} 秒`;
  return s === 0 ? `${m} 分钟` : `${m} 分 ${s} 秒`;
}

// ---------- frame helpers ----------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function looseKey(s: string): string {
  return s.toLowerCase().replace(/[.,!?;:]+$/g, '').replace(/\s+/g, ' ').trim();
}

/** Whole-word / whole-phrase containment of `needle` in `haystack` (both lower-cased). */
function containsPhrase(haystack: string, needle: string): boolean {
  if (needle === '') return false;
  return new RegExp(`(^|[^a-z0-9'])${escapeRegex(needle)}($|[^a-z0-9'])`).test(haystack);
}

/**
 * Recover the slot picks closest to a model sentence (frame examples only store text, not picks).
 * First tries to read the sentence back through the pattern; otherwise each slot takes the longest
 * option that appears in the sentence. Slots that cannot be matched fall back to option 0.
 */
export function picksFromExample(frame: SubstitutionFrame, example: SlotOption | undefined): Record<string, number> {
  const picks: Record<string, number> = {};
  for (const s of frame.slots) picks[s.key] = 0;
  if (!example) return picks;
  const text = example.en.replace(/\s+/g, ' ').trim();

  const keys: string[] = [];
  const source = frame.pattern
    .split(/(\{\w+\})/g)
    .map((part) => {
      const m = /^\{(\w+)\}$/.exec(part);
      if (m) {
        keys.push(m[1]);
        return '(.*?)';
      }
      return escapeRegex(part).replace(/\s+/g, '\\s*');
    })
    .join('');
  let match: RegExpExecArray | null = null;
  try {
    match = new RegExp(`^\\s*${source}\\s*$`, 'i').exec(text);
  } catch {
    match = null;
  }
  if (match) {
    const m = match;
    const exact: Record<string, number> = { ...picks };
    const ok = keys.every((key, i) => {
      const slot = frame.slots.find((s) => s.key === key);
      if (!slot) return true;
      const got = looseKey(m[i + 1] ?? '');
      const idx = slot.options.findIndex((o) => looseKey(o.en) === got);
      if (idx < 0) return false;
      exact[key] = idx;
      return true;
    });
    if (ok) return exact;
  }

  // Fallback: per slot, the longest option found in the sentence.
  const lower = text.toLowerCase();
  for (const slot of frame.slots) {
    let best = -1;
    let bestLen = 0;
    slot.options.forEach((o, i) => {
      const en = o.en.toLowerCase().trim();
      if (en.length > bestLen && containsPhrase(lower, en)) {
        best = i;
        bestLen = en.length;
      }
    });
    if (best >= 0) picks[slot.key] = best;
  }
  return picks;
}

// ---------- flashcards ----------

export interface FlashPrompt {
  cardId: string;
  kind: 'dozen' | 'frame';
  /** Chinese prompt shown first. */
  promptZh: string;
  /** English answer revealed on tap. */
  answerEn: string;
  /** Small label above the prompt (frame title / "解构句"). */
  title: string;
  /** English skeleton hint for dozen cards drilled through a variant. */
  skeletonEn?: string;
}

/** Build the prompt for a due card, or null when its content no longer exists (e.g. a deleted user frame). */
export function buildFlashPrompt(
  card: CardState,
  frames: SubstitutionFrame[],
  rng: Rng = Math.random,
): FlashPrompt | null {
  if (card.kind === 'dozen') {
    const d = getDozen(card.refId);
    if (!d) return null;
    const useVariant = d.variants.length > 0 && rng() < 0.5;
    if (useVariant) {
      const v = d.variants[Math.min(d.variants.length - 1, Math.floor(rng() * d.variants.length))];
      return {
        cardId: card.id,
        kind: 'dozen',
        title: `第 ${d.order} 句 · 换词`,
        promptZh: v.zh,
        answerEn: v.en,
        skeletonEn: d.en,
      };
    }
    return { cardId: card.id, kind: 'dozen', title: `第 ${d.order} 句`, promptZh: d.zh, answerEn: d.en };
  }
  const f = frames.find((x) => x.id === card.refId);
  if (!f) return null;
  const combo = randomCombo(f, rng);
  return { cardId: card.id, kind: 'frame', title: f.title, promptZh: combo.zh, answerEn: combo.en };
}

// ---------- output prompts (offline) ----------

export interface OutputPrompt {
  promptZh: string;
  /** Short English skeleton shown as "用这个骨架". */
  skeletonEn: string;
  /** Frame to render as pills under the skeleton (frame-based prompts). */
  frameId?: string;
  /** True when skeletonEn is a vocabulary hint (AI prompts) rather than a skeleton. */
  vocabHint?: boolean;
  /** Model answer for self-checking (offline prompts only). */
  referenceEn?: string;
  refKind: 'dozen' | 'frame';
  refId: string;
}

/** Offline 模组替换 prompts: dozen variants (daily / work) and frame examples, deterministic per seed. */
export function offlineOutputPrompts(
  dozen: DozenSentence,
  frames: SubstitutionFrame[],
  count: number,
  seed: string,
): OutputPrompt[] {
  const rng = seededRng(hashString(seed));
  const variants = shuffled(
    dozen.variants.filter((v) => v.level === 'daily' || v.level === 'work'),
    rng,
  );
  const fromVariant = (i: number): OutputPrompt | null => {
    const v = variants[i];
    return v
      ? { promptZh: v.zh, skeletonEn: dozen.en, referenceEn: v.en, refKind: 'dozen', refId: dozen.id }
      : null;
  };
  const fromFrame = (i: number): OutputPrompt | null => {
    const f = frames[i];
    if (!f) return null;
    const exs = f.examples.length > 0 ? f.examples : [buildCombo(f, {})];
    const ex = exs[Math.min(exs.length - 1, Math.floor(rng() * exs.length))];
    return {
      promptZh: ex.zh,
      skeletonEn: f.pattern,
      frameId: f.id,
      referenceEn: ex.en,
      refKind: 'frame',
      refId: f.id,
    };
  };

  // Interleave: dozen variant, frame example, dozen variant, frame example ...
  const out: OutputPrompt[] = [];
  let vi = 0;
  let fi = 0;
  let turn = 0;
  while (out.length < count && turn < count * 4) {
    const p = turn % 2 === 0 ? fromVariant(vi++) : fromFrame(fi++ % Math.max(1, frames.length));
    turn++;
    if (p) out.push(p);
  }
  // Not enough distinct sources: fall back to the dozen sentence itself.
  while (out.length < count) {
    out.push({
      promptZh: dozen.zh,
      skeletonEn: dozen.en,
      referenceEn: dozen.en,
      refKind: 'dozen',
      refId: dozen.id,
    });
  }
  return out;
}
