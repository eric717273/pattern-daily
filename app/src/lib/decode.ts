import type {
  DozenSentence,
  FrameCombo,
  Grade,
  GrammarPoint,
  SlotRole,
  SubstitutionFrame,
  TransformTask,
} from '../types';
import { averageGrade, hashString, seededRng, type Rng } from './drill';
import { normalizeEn, randomCombo } from './frameEngine';
import { inferSlotRole } from './labels';

// ---------- shared result type ----------

/** Outcome of one decode exercise set (transform or label). */
export interface DecodeResult {
  correct: number;
  total: number;
  /** Time spent, in ms. */
  ms: number;
}

/**
 * Self-grade for a decode exercise from the share of correct answers:
 * all right -> 3 (简单), >= 60% -> 2 (良好), >= 30% -> 1 (困难), otherwise 0 (忘了).
 */
export function gradeFromRatio(correct: number, total: number): Grade {
  if (total <= 0) return 2;
  const r = correct / total;
  if (r >= 1) return 3;
  if (r >= 0.6) return 2;
  if (r >= 0.3) return 1;
  return 0;
}

/** Merge several results (e.g. two label sentences) into one. */
export function mergeResults(results: readonly DecodeResult[]): DecodeResult {
  return results.reduce<DecodeResult>(
    (acc, r) => ({ correct: acc.correct + r.correct, total: acc.total + r.total, ms: acc.ms + r.ms }),
    { correct: 0, total: 0, ms: 0 },
  );
}

/** Grade of a foundation lesson: the average of the order-drill grade and the transform grade. */
export function lessonGrade(orderGrade: 0 | 1 | 2, transform: DecodeResult): Grade {
  return averageGrade([orderGrade, gradeFromRatio(transform.correct, transform.total)]);
}

// ---------- transform tasks ----------

/**
 * Pick `count` transform tasks of a dozen sentence. Tasks that transform the base sentence itself come
 * first (then tasks on variants); different operations are preferred over repeats. `offset` rotates the
 * starting point so different days show different tasks; the same offset always gives the same tasks.
 */
export function pickTransformTasks(dozen: DozenSentence, count: number, offset = 0): TransformTask[] {
  const all = dozen.transforms;
  if (all.length === 0 || count <= 0) return [];
  const base = all.filter((t) => t.from === dozen.en);
  const rest = all.filter((t) => t.from !== dozen.en);
  const rotate = <T,>(list: T[]): T[] => {
    if (list.length === 0) return list;
    const k = ((offset % list.length) + list.length) % list.length;
    return [...list.slice(k), ...list.slice(0, k)];
  };
  const ordered = [...rotate(base), ...rotate(rest)];
  const picked: TransformTask[] = [];
  const ops = new Set<string>();
  for (const t of ordered) {
    if (picked.length >= count) break;
    if (!ops.has(t.op)) {
      ops.add(t.op);
      picked.push(t);
    }
  }
  for (const t of ordered) {
    if (picked.length >= count) break;
    if (!picked.includes(t)) picked.push(t);
  }
  return picked;
}

/** Deterministic rotation offset for a dozen sentence on a given day. */
export function dayOffset(dayKey: string, dozenId: string): number {
  return hashString(`${dayKey}|${dozenId}`);
}

// ---------- label tasks ----------

/** Roles the learner can assign in 成分标注 (a subset of SlotRole). */
export type LabelRole = 'subject' | 'verb' | 'aux' | 'object' | 'indirect-object' | 'complement' | 'adverbial' | 'other';

/** Palette order. */
export const LABEL_ROLES: LabelRole[] = [
  'subject',
  'verb',
  'aux',
  'object',
  'indirect-object',
  'complement',
  'adverbial',
  'other',
];

export const LABEL_ROLE_NAMES: Record<LabelRole, string> = {
  subject: '主语',
  verb: '谓语动词',
  aux: '助动词·情态',
  object: '宾语',
  'indirect-object': '间接宾语',
  complement: '表语·补语',
  adverbial: '时间地点状语',
  other: '其他',
};

export type Tense = 'present' | 'past' | 'future' | 'perfect' | 'modal';

export const TENSES: Tense[] = ['present', 'past', 'future', 'perfect', 'modal'];

export const TENSE_LABELS: Record<Tense, string> = {
  present: '一般现在',
  past: '一般过去',
  future: '将来',
  perfect: '现在完成',
  modal: '情态',
};

export interface LabelToken {
  /** What the learner sees; may be several words (a merged "the apple", a slot option "next week"). */
  text: string;
  /** Correct role; null = a fixed word of a frame pattern that is shown but not asked. */
  role: LabelRole | null;
  /** Explanations carried over from the dozen alignment. */
  notes?: { en: string; note: string }[];
}

export interface LabelTask {
  /** Stable id: `dozen:d05` or `frame:f001:<picks>`. */
  id: string;
  source: 'dozen' | 'frame';
  /** Dozen id or frame id. */
  refId: string;
  en: string;
  zh: string;
  tokens: LabelToken[];
  /** Correct answer of the tense question; undefined = no tense question for this sentence. */
  tense?: Tense;
}

/** Tense of the 13 base sentences (hand-checked). */
const DOZEN_TENSE: Record<string, Tense> = {
  d01: 'present',
  d02: 'present',
  d03: 'present',
  d04: 'present',
  d05: 'present',
  d06: 'present',
  d07: 'present',
  d08: 'present',
  d09: 'modal',
  d10: 'present',
  d11: 'future',
  d12: 'modal',
  d13: 'perfect',
};

function mapRole(r: SlotRole): LabelRole {
  switch (r) {
    case 'subject':
    case 'verb':
    case 'aux':
    case 'object':
    case 'indirect-object':
    case 'complement':
    case 'adverbial':
      return r;
    default:
      return 'other';
  }
}

/**
 * Label task from a dozen sentence's alignment (exact data). Determiners and particles are folded
 * into the following word ("The apple", "to John", "to give") so every token has one clear role;
 * pure punctuation tokens are dropped.
 */
export function labelTaskFromDozen(d: DozenSentence): LabelTask {
  const tokens: LabelToken[] = [];
  let pendingText = '';
  let pendingNotes: { en: string; note: string }[] = [];
  for (const a of d.alignment) {
    if (/^[?.!,;:]+$/.test(a.en.trim())) continue;
    const notes = a.note ? [{ en: a.en, note: a.note }] : [];
    if (a.role === 'determiner' || a.role === 'particle') {
      pendingText = pendingText ? `${pendingText} ${a.en}` : a.en;
      pendingNotes = [...pendingNotes, ...notes];
      continue;
    }
    const allNotes = [...pendingNotes, ...notes];
    tokens.push({
      text: pendingText ? `${pendingText} ${a.en}` : a.en,
      role: mapRole(a.role),
      ...(allNotes.length > 0 ? { notes: allNotes } : {}),
    });
    pendingText = '';
    pendingNotes = [];
  }
  if (pendingText && tokens.length > 0) {
    const last = tokens[tokens.length - 1];
    last.text = `${last.text} ${pendingText}`;
  }
  return {
    id: `dozen:${d.id}`,
    source: 'dozen',
    refId: d.id,
    en: d.en,
    zh: d.zh,
    tokens,
    tense: DOZEN_TENSE[d.id] ?? detectTense(d.en, { grammar: d.grammar }),
  };
}

// ----- tense detection (conservative: undefined when not sure) -----

const IRREGULAR_PARTICIPLES = 'been|done|gone|seen|eaten|written|taken|given|made|known|got|gotten|had|met|read|said|told|found|left|brought|bought|begun|spoken|chosen|driven|forgotten|heard|kept|lost|paid|run|sent|thought|understood|worn';
const IRREGULAR_PAST =
  'was|were|did|went|saw|ate|took|gave|made|got|had|came|bought|met|wrote|said|told|knew|found|left|felt|began|ran|spoke|thought|brought|sent|paid|heard|kept|lost|sat|stood|understood|forgot|drove|chose|wore|held|built|lent|slept|spent';
const PRESENT_VERBS = new Set([
  'want',
  'wants',
  'need',
  'needs',
  'like',
  'likes',
  'love',
  'loves',
  'prefer',
  'prefers',
  'hope',
  'hopes',
  'think',
  'thinks',
  'know',
  'knows',
  'work',
  'works',
]);
const GOING_TO_NOT_FUTURE = new Set([
  'the', 'a', 'an', 'my', 'your', 'his', 'her', 'our', 'their', 'this', 'that', 'work', 'school', 'bed', 'town', 'church', 'college',
]);

export interface TenseHints {
  grammar?: readonly GrammarPoint[];
  /** The words of the sentence's verb slots (their first word is checked for a past form). */
  verbs?: readonly string[];
}

/**
 * Best-effort tense of an English sentence among the five exam choices. Returns undefined whenever the
 * evidence is thin or contradictory, so no wrong answer is ever taught. Only explicit markers count:
 * will / going to, have + participle, modals, was / were / did / past forms, am / is / are / do / does.
 */
export function detectTense(en: string, hints: TenseHints = {}): Tense | undefined {
  const raw = en.replace(/[‘’]/g, "'");
  const n = normalizeEn(raw);
  const words = n.split(' ').filter(Boolean);
  const found = new Set<Tense>();

  // will / going to + verb
  if (/\bwill\b/.test(n)) found.add('future');
  const gt = words.indexOf('going');
  if (gt >= 0 && words[gt + 1] === 'to' && words[gt + 2] && !GOING_TO_NOT_FUTURE.has(words[gt + 2])) found.add('future');
  if (hints.grammar?.includes('going-to') && words.includes('going')) found.add('future');

  // have / has + participle
  const perfect = new RegExp(`\\b(have|has)\\s+(?:not\\s+)?(?:(?:never|already|just|ever|finally|still|yet)\\s+)?(${IRREGULAR_PARTICIPLES})\\b`);
  const perfectEd = /\b(have|has)\s+(?:not\s+)?(?:(?:never|already|just|ever|finally|still|yet)\s+)?\w+ed\b/;
  if (perfect.test(n) || (hints.grammar?.includes('present-perfect') && perfectEd.test(n))) found.add('perfect');

  // modals (lowercase "may" only, so the month May is not a modal)
  if (/\b(must|can|cannot|could|should|would|might|shall)\b/.test(n)) found.add('modal');
  if (/\bmay\b/.test(raw) || /^May\s+(I|we|you|he|she|it|they)\b/.test(raw)) found.add('modal');

  // past
  const verbs = (hints.verbs ?? []).map((v) => v.trim().split(/\s+/)[0]?.toLowerCase() ?? '');
  const pastRe = new RegExp(`^(${IRREGULAR_PAST})$`);
  const hasHaveOrBe = /\b(have|has|am|is|are|be|been|being)\b/.test(n);
  if (/\b(was|were|did)\b/.test(n)) found.add('past');
  else if (verbs.some((v) => pastRe.test(v) || (/..ed$/.test(v) && !hasHaveOrBe))) found.add('past');

  const marked = [...found];
  if (marked.length === 1) return marked[0];
  if (marked.length > 1) return undefined;

  // present: only with an explicit marker
  if (/\b(am|is|are|do|does)\b/.test(n) || words.some((w) => PRESENT_VERBS.has(w))) return 'present';
  return undefined;
}

// ----- frame combos -----

/** A frame is labelable when every slot maps to a role other than 'other' (so the answer is unambiguous). */
export function isLabelableFrame(frame: SubstitutionFrame): boolean {
  return frame.slots.length > 0 && frame.slots.every((s) => inferSlotRole(s) !== 'other');
}

function cleanWord(w: string): string {
  return w.replace(/^[,.;:!?"“”]+|[,.;:!?"“”]+$/g, '');
}

/**
 * Label task from a frame combo. Slot options (even multi-word) are single tokens whose role comes from
 * inferSlotRole; the frame's fixed words are shown muted and not asked. Returns null for frames that are
 * not labelable.
 */
export function labelTaskFromCombo(frame: SubstitutionFrame, combo: FrameCombo): LabelTask | null {
  if (!isLabelableFrame(frame)) return null;
  const tokens: LabelToken[] = [];
  for (const part of frame.pattern.split(/(\{\w+\})/)) {
    const m = /^\{(\w+)\}$/.exec(part);
    if (m) {
      const slot = frame.slots.find((s) => s.key === m[1]);
      if (!slot) return null;
      const idx = combo.picks[slot.key] ?? 0;
      const opt = slot.options[idx] ?? slot.options[0];
      if (!opt) return null;
      tokens.push({ text: cleanWord(opt.en.trim()), role: mapRole(inferSlotRole(slot)) });
    } else {
      for (const w of part.split(/\s+/)) {
        const word = cleanWord(w);
        if (word) tokens.push({ text: word, role: null });
      }
    }
  }
  if (tokens.length === 0) return null;
  tokens[0] = { ...tokens[0], text: tokens[0].text.replace(/^([^A-Za-z]*)([a-z])/, (_m, lead: string, c: string) => lead + c.toUpperCase()) };
  const verbs = tokens.filter((t) => t.role === 'verb').map((t) => t.text);
  const picks = frame.slots.map((s) => combo.picks[s.key] ?? 0).join('-');
  return {
    id: `frame:${frame.id}:${picks}`,
    source: 'frame',
    refId: frame.id,
    en: combo.en,
    zh: combo.zh,
    tokens,
    tense: detectTense(combo.en, { grammar: frame.grammar, verbs }),
  };
}

/**
 * A label task from one of `frames` (default: callers pass SEED_FRAMES). Frames sharing a grammar point
 * with `prefer` are tried first. Deterministic for a given rng.
 */
export function pickFrameLabelTask(
  frames: readonly SubstitutionFrame[],
  rng: Rng = Math.random,
  prefer?: readonly GrammarPoint[],
): LabelTask | null {
  const ok = frames.filter(isLabelableFrame);
  if (ok.length === 0) return null;
  const same = prefer ? ok.filter((f) => f.grammar.some((g) => prefer.includes(g))) : [];
  const pool = same.length > 0 ? same : ok;
  const frame = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  return labelTaskFromCombo(frame, randomCombo(frame, rng));
}

/** Deterministic rng for a day and a dozen sentence. */
export function dayRng(dayKey: string, dozenId: string, salt = ''): Rng {
  return seededRng(hashString(`${dayKey}|${dozenId}|${salt}`));
}

// ---------- scoring ----------

export interface LabelScore {
  /** Correct roles + (1 if the tense answer is right). */
  correct: number;
  /** Scored tokens + (1 if a tense question was asked). */
  total: number;
  /** Per token (same order as task.tokens): true/false for scored tokens, null for fixed words. */
  tokenCorrect: (boolean | null)[];
  /** undefined = no tense question. */
  tenseCorrect?: boolean;
}

/**
 * Score a labeling. `answers[i]` is the role chosen for task.tokens[i] (fixed words are ignored).
 * The tense question counts as one more item when the task has one.
 */
export function scoreLabeling(
  task: LabelTask,
  answers: readonly (LabelRole | undefined)[],
  tenseAnswer?: Tense,
): LabelScore {
  let correct = 0;
  let total = 0;
  const tokenCorrect = task.tokens.map((t, i) => {
    if (t.role === null) return null;
    total += 1;
    const ok = answers[i] === t.role;
    if (ok) correct += 1;
    return ok;
  });
  let tenseCorrect: boolean | undefined;
  if (task.tense !== undefined) {
    total += 1;
    tenseCorrect = tenseAnswer === task.tense;
    if (tenseCorrect) correct += 1;
  }
  return { correct, total, tokenCorrect, tenseCorrect };
}
