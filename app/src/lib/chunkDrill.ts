import type { Chunk, FrameCombo, Grade, SlotOption, SubstitutionFrame } from '../types';
import type { LibraryItem } from '../content';
import { buildCombo, normalizeEn, randomCombo } from './frameEngine';
import { canonicalizeSpoken, matchVoice, READ_ALOUD_THRESHOLD, type VoiceMatch } from './voiceMatch';

/** Pure helpers of the chunk track drills (listen / shadow / recall / review). No React, no IO. */

export type Rng = () => number;

/** Speech rate of "natural speed" listening practice: independent of the learner's TTS setting. */
export const NATURAL_RATE = 1.0;
/** Speech rate of the slow replay after a wrong answer. */
export const SLOW_RATE = 0.7;

// ---------- chunk text ----------

/** The chunk without its open-ended tail: "I was wondering if …" -> "I was wondering if". */
export function chunkCore(en: string): string {
  return en.replace(/\s*(?:…|\.{3})\s*$/u, '').trim();
}

/** The part of a chunk that has to appear verbatim in a sentence: core minus trailing punctuation. */
function searchKey(chunkEn: string): string {
  return chunkCore(chunkEn)
    .replace(/[.!?,;:]+$/u, '')
    .replace(/[’‘]/g, "'")
    .trim()
    .toLowerCase();
}

/** Where a chunk occurs in a sentence (case-insensitive, ignores a trailing "…" and punctuation). */
export function findChunkRange(sentence: string, chunkEn: string): { start: number; end: number } | null {
  const key = searchKey(chunkEn);
  if (!key) return null;
  const hay = sentence.replace(/[’‘]/g, "'").toLowerCase();
  const start = hay.indexOf(key);
  return start < 0 ? null : { start, end: start + key.length };
}

/** The sentence with the chunk replaced by a blank. Unchanged when the chunk is not found. */
export function maskChunk(sentence: string, chunkEn: string, mask = '＿＿＿'): string {
  const r = findChunkRange(sentence, chunkEn);
  return r ? `${sentence.slice(0, r.start)}${mask}${sentence.slice(r.end)}` : sentence;
}

const wordCount = (s: string): number => normalizeEn(chunkCore(s)).split(' ').filter(Boolean).length;

// ---------- examples (single turn of a dialogue) ----------

/** "A: Hi. B: Hello." -> ["Hi.", "Hello."]. Text that does not start with "A:" is one turn. */
export function splitTurns(text: string): string[] {
  const t = text.trim();
  if (!/^A[:：]/.test(t)) return [t];
  const parts = t
    .split(/(?:^|(?<=[\s。？！…”）.?!"']))[AB][:：]\s*/u)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [t];
}

export interface ExampleTurn {
  /** English line that contains the chunk (one speaker's turn). */
  en: string;
  /** Matching Chinese line (the whole translation when the turns cannot be paired). */
  zh: string;
  /** The full example, as stored. */
  fullEn: string;
  fullZh: string;
}

/** The turn of an example that contains the chunk, with its Chinese counterpart. */
export function exampleTurn(example: SlotOption, chunkEn: string): ExampleTurn {
  const enTurns = splitTurns(example.en);
  const zhTurns = splitTurns(example.zh);
  let idx = enTurns.findIndex((t) => findChunkRange(t, chunkEn) !== null);
  if (idx < 0) idx = 0;
  return {
    en: enTurns[idx] ?? example.en,
    zh: zhTurns.length === enTurns.length ? (zhTurns[idx] ?? example.zh) : example.zh,
    fullEn: example.en,
    fullZh: example.zh,
  };
}

function pickIndex(n: number, rng: Rng): number {
  if (n <= 1) return 0;
  return Math.min(n - 1, Math.max(0, Math.floor(rng() * n)));
}

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A random example of the chunk as a single turn (falls back to the chunk itself when it has none). */
export function pickChunkExample(chunk: Chunk, rng: Rng = Math.random): ExampleTurn {
  const ex = chunk.examples[pickIndex(chunk.examples.length, rng)];
  if (!ex) return { en: chunk.en, zh: chunk.zh, fullEn: chunk.en, fullZh: chunk.zh };
  return exampleTurn(ex, chunk.en);
}

/** Mask the Chinese of the chunk inside an example translation: "好久不见！" -> "＿＿！". */
export function maskZh(text: string, chunkZh: string, mask = '＿＿'): string {
  const parts = chunkZh
    .split(/[／/]/u)
    .map((p) => p.replace(/[。？！，、…~～.!?,\s]/gu, ''))
    .filter((p) => p.length >= 2)
    .sort((a, b) => b.length - a.length);
  let out = text;
  for (const p of parts) out = out.split(p).join(mask);
  return out;
}

// ---------- listening questions ----------

export interface ListenOption {
  id: string;
  text: string;
}

export interface ListenQuestion {
  /** The sentence that is played (never shown before the answer). */
  sentence: string;
  sentenceZh: string;
  /** Text inside `sentence` to highlight when revealing (the chunk / the varying slot option). */
  highlight: string;
  options: ListenOption[];
  answerId: string;
  soundZh?: string;
}

/**
 * Distractors for a chunk listening question: other chunks of similar length, preferring the same category.
 * Never returns the target, a chunk with the same wording, a chunk that is contained in (or contains) the
 * target, or one that also occurs in the played `sentence` (that would make two options correct).
 */
export function chunkDistractors(
  target: Chunk,
  pool: readonly Chunk[],
  count = 3,
  rng: Rng = Math.random,
  sentence?: string,
): Chunk[] {
  const targetKey = normalizeEn(chunkCore(target.en));
  const targetLen = wordCount(target.en);
  const seen = new Set<string>([targetKey]);
  const scored: { chunk: Chunk; score: number }[] = [];
  for (const c of pool) {
    if (c.id === target.id) continue;
    const key = normalizeEn(chunkCore(c.en));
    if (key === '' || seen.has(key)) continue;
    if (` ${targetKey} `.includes(` ${key} `) || ` ${key} `.includes(` ${targetKey} `)) continue;
    if (sentence && findChunkRange(sentence, c.en)) continue;
    seen.add(key);
    const lenGap = Math.min(4, Math.abs(wordCount(c.en) - targetLen));
    const score = (c.category === target.category ? 2 : 0) - lenGap * 0.7 + rng() * 1.2;
    scored.push({ chunk: c, score });
  }
  scored.sort((a, b) => b.score - a.score || (a.chunk.id < b.chunk.id ? -1 : 1));
  return scored.slice(0, Math.max(0, count)).map((s) => s.chunk);
}

/**
 * Four sentences of one frame that differ from the answer in exactly one slot (the answer first).
 * Prefers one slot that has enough options; tops up from other slots only when it has too few.
 * Sentences with identical English are never repeated.
 */
export function frameListenCombos(
  frame: SubstitutionFrame,
  answer: FrameCombo,
  count = 4,
  rng: Rng = Math.random,
): { combos: FrameCombo[]; slotKey: string | undefined } {
  const combos: FrameCombo[] = [answer];
  const seen = new Set<string>([normalizeEn(answer.en)]);
  const swappable = frame.slots.filter((s) => s.options.length >= 2);
  if (swappable.length === 0) return { combos, slotKey: undefined };

  const roomy = swappable.filter((s) => s.options.length >= count);
  const first = roomy.length > 0 ? roomy[pickIndex(roomy.length, rng)] : swappable.reduce((a, b) => (b.options.length > a.options.length ? b : a));
  const order = [first, ...shuffle(swappable.filter((s) => s.key !== first.key), rng)];

  for (const slot of order) {
    const others = shuffle(
      slot.options.map((_, i) => i).filter((i) => i !== answer.picks[slot.key]),
      rng,
    );
    for (const i of others) {
      if (combos.length >= count) break;
      const combo = buildCombo(frame, { ...answer.picks, [slot.key]: i });
      const key = normalizeEn(combo.en);
      if (seen.has(key)) continue;
      seen.add(key);
      combos.push(combo);
    }
    if (combos.length >= count) break;
  }
  return { combos, slotKey: first.key };
}

/** Build the listening question for a library item. Pass a seeded `rng` for deterministic output. */
export function buildListenQuestion(item: LibraryItem, pool: readonly Chunk[], rng: Rng = Math.random): ListenQuestion {
  if (item.kind === 'chunk') {
    const { chunk } = item;
    const turn = pickChunkExample(chunk, rng);
    const range = findChunkRange(turn.en, chunk.en);
    const options = shuffle([chunk, ...chunkDistractors(chunk, pool, 3, rng, turn.en)], rng).map((c) => ({
      id: c.id,
      text: c.en,
    }));
    return {
      sentence: turn.en,
      sentenceZh: turn.zh,
      highlight: range ? turn.en.slice(range.start, range.end) : '',
      options,
      answerId: chunk.id,
      soundZh: chunk.soundZh,
    };
  }
  const { frame } = item;
  const answer = randomCombo(frame, rng);
  const { combos, slotKey } = frameListenCombos(frame, answer, 4, rng);
  const slot = frame.slots.find((s) => s.key === slotKey);
  const highlight = slot ? (slot.options[answer.picks[slot.key]]?.en ?? '') : '';
  return {
    sentence: answer.en,
    sentenceZh: answer.zh,
    highlight,
    options: shuffle(combos, rng).map((c) => ({ id: c.en, text: c.en })),
    answerId: answer.en,
    soundZh: frame.soundZh,
  };
}

// ---------- voice ----------

/**
 * Did the learner say the chunk? The whole utterance counts, and so does an utterance that CONTAINS the
 * chunk (a learner saying "I was wondering if you could help" for "I was wondering if …").
 */
export function matchChunkSpoken(
  heard: string | readonly string[],
  chunkEn: string,
  threshold = READ_ALOUD_THRESHOLD,
): VoiceMatch {
  const target = chunkCore(chunkEn);
  const candidates = (typeof heard === 'string' ? [heard] : [...heard]).filter((h) => h.trim() !== '');
  const whole = matchVoice(candidates, target, { threshold });
  if (whole.matched) return whole;
  const targetLen = canonicalizeSpoken(target).split(' ').filter(Boolean).length;
  for (const text of candidates) {
    const words = canonicalizeSpoken(text).split(' ').filter(Boolean);
    if (words.length <= targetLen) continue;
    for (const len of [targetLen, targetLen + 1, targetLen - 1]) {
      if (len < 1) continue;
      for (let s = 0; s + len <= words.length; s++) {
        const m = matchVoice(words.slice(s, s + len).join(' '), target, { threshold });
        if (m.matched) return { ...m, heard: text };
      }
    }
  }
  return whole;
}

// ---------- grading ----------

/** 0 = wrong, 1 = right after replaying, 2 = right first time. */
export function listenPoints(r: { correct: boolean; replays: number }): 0 | 1 | 2 {
  if (!r.correct) return 0;
  return r.replays === 0 ? 2 : 1;
}

/** 0 = not said, 1 = said within the limit, 2 = said within half of the limit. */
export function recallPoints(r: { correct: boolean; ms: number }, limitMs: number): 0 | 1 | 2 {
  if (!r.correct) return 0;
  return r.ms <= limitMs / 2 ? 2 : 1;
}

/**
 * Grade of a chunk (new or due) from its listening and recall results:
 * points = listenPoints + recallPoints (0..4): 0 -> 0 忘了, 1-2 -> 1 困难, 3 -> 2 良好, 4 -> 3 简单.
 */
export function chunkGrade(
  listen: { correct: boolean; replays: number },
  recall: { correct: boolean; ms: number },
  recallLimitMs: number,
): Grade {
  const p = listenPoints(listen) + recallPoints(recall, recallLimitMs);
  if (p >= 4) return 3;
  if (p === 3) return 2;
  if (p >= 1) return 1;
  return 0;
}

/**
 * Grade of a new frame: the 单槽快替 grade (voice accuracy or 吃力/刚好/轻松 -> 1/2/3),
 * minus one when the opening listening question was wrong (never below 0).
 */
export function frameGrade(listen: { correct: boolean }, swapGrade: Grade): Grade {
  return (listen.correct ? swapGrade : Math.max(0, swapGrade - 1)) as Grade;
}

/** Grade of a due frame from its recall prompts: all right -> 3 when quick (average within half the limit) else 2, one right -> 1, none -> 0. */
export function frameReviewGrade(results: readonly { correct: boolean; ms: number }[], limitMs: number): Grade {
  if (results.length === 0) return 0;
  const right = results.filter((r) => r.correct);
  if (right.length === results.length) {
    const avg = right.reduce((a, r) => a + r.ms, 0) / right.length;
    return avg <= limitMs / 2 ? 3 : 2;
  }
  return right.length > 0 ? 1 : 0;
}
