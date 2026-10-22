import type { FrameCombo, SubstitutionFrame } from '../types';

// ---------- Combos ----------

/** Number of distinct sentences a frame can produce. */
export function countCombos(f: SubstitutionFrame): number {
  return f.slots.reduce((n, s) => n * s.options.length, 1);
}

function fill(pattern: string, f: SubstitutionFrame, picks: Record<string, number>, lang: 'en' | 'zh'): string {
  return pattern.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const slot = f.slots.find((s) => s.key === key);
    if (!slot || slot.options.length === 0) return whole;
    const idx = picks[key];
    const opt = slot.options[Number.isInteger(idx) && idx >= 0 && idx < slot.options.length ? idx : 0];
    return opt[lang];
  });
}

/** Tidy spaces / punctuation and capitalise the first letter of an English sentence. */
function tidyEn(s: string): string {
  const t = s
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,?!;:])/g, '$1')
    .trim();
  return t.replace(/^([^A-Za-z0-9]*)([a-z])/, (_m, lead: string, c: string) => lead + c.toUpperCase());
}

function tidyZh(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s*([。，、？！；：])\s*/g, '$1')
    .trim();
}

/** Build the sentence for the chosen option indexes. Missing / out-of-range picks fall back to option 0. */
export function buildCombo(f: SubstitutionFrame, picks: Record<string, number>): FrameCombo {
  const normalized: Record<string, number> = {};
  for (const slot of f.slots) {
    const idx = picks[slot.key];
    normalized[slot.key] = Number.isInteger(idx) && idx >= 0 && idx < slot.options.length ? idx : 0;
  }
  return {
    frameId: f.id,
    picks: normalized,
    en: tidyEn(fill(f.pattern, f, normalized, 'en')),
    zh: tidyZh(fill(f.patternZh, f, normalized, 'zh')),
  };
}

function pickIndex(n: number, rng: () => number): number {
  if (n <= 1) return 0;
  return Math.min(n - 1, Math.max(0, Math.floor(rng() * n)));
}

export function randomCombo(f: SubstitutionFrame, rng: () => number = Math.random): FrameCombo {
  const picks: Record<string, number> = {};
  for (const slot of f.slots) picks[slot.key] = pickIndex(slot.options.length, rng);
  return buildCombo(f, picks);
}

/**
 * Palmer step 2: a run of sentences where every sentence differs from the previous one in exactly
 * one slot. Deterministic for a given rng. If the frame has no slot with 2+ options, the same
 * sentence is repeated.
 */
export function singleSwapSequence(
  f: SubstitutionFrame,
  length: number,
  rng: () => number = Math.random,
): FrameCombo[] {
  const n = Math.max(0, Math.floor(length));
  if (n === 0) return [];
  const result: FrameCombo[] = [randomCombo(f, rng)];
  const swappable = f.slots.filter((s) => s.options.length >= 2);
  let lastKey: string | null = null;
  while (result.length < n) {
    const prev = result[result.length - 1];
    if (swappable.length === 0) {
      result.push({ ...prev, picks: { ...prev.picks } });
      continue;
    }
    // Prefer a different slot than last time so the learner sees variety, when possible.
    const pool = swappable.length > 1 ? swappable.filter((s) => s.key !== lastKey) : swappable;
    const slot = pool[pickIndex(pool.length, rng)];
    const cur = prev.picks[slot.key] ?? 0;
    // Choose among the other options only, so the slot is guaranteed to change.
    let next = pickIndex(slot.options.length - 1, rng);
    if (next >= cur) next += 1;
    result.push(buildCombo(f, { ...prev.picks, [slot.key]: next }));
    lastKey = slot.key;
  }
  return result;
}

// ---------- Answer comparison ----------

const IRREGULAR: [RegExp, string][] = [
  [/\bcan['’]t\b/g, 'cannot'],
  [/\bcan not\b/g, 'cannot'],
  [/\bwon['’]t\b/g, 'will not'],
  [/\bshan['’]t\b/g, 'shall not'],
  [/\blet['’]s\b/g, 'let us'],
  [/\bain['’]t\b/g, 'is not'],
];

const SUFFIXES: [RegExp, string][] = [
  [/n['’]t\b/g, ' not'], // don't, doesn't, isn't, aren't, didn't, wouldn't ...
  [/['’]m\b/g, ' am'],
  [/['’]re\b/g, ' are'],
  [/['’]ve\b/g, ' have'],
  [/['’]ll\b/g, ' will'],
  [/['’]d\b/g, ' would'],
  // 's after a pronoun / wh-word is "is"; after a noun it is a possessive and is left alone.
  [/\b(he|she|it|that|there|here|what|who|where|how)['’]s\b/g, '$1 is'],
];

/** Lowercase, straighten quotes, expand contractions, drop punctuation, collapse whitespace. */
export function normalizeEn(s: string): string {
  let t = s
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”„]/g, '"');
  for (const [re, rep] of IRREGULAR) t = t.replace(re, rep);
  for (const [re, rep] of SUFFIXES) t = t.replace(re, rep);
  return t
    .replace(/[-–—]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s: string): string[] {
  const n = normalizeEn(s);
  return n === '' ? [] : n.split(' ');
}

export interface AnswerToken {
  text: string;
  status: 'ok' | 'missing' | 'extra';
}

export interface AnswerComparison {
  exact: boolean;
  similarity: number;
  tokens: AnswerToken[];
}

/**
 * Compare a typed answer with the target. Tokens are in normalized form (contractions expanded):
 * 'ok' = in both, 'missing' = target token the user did not write, 'extra' = user token not in target.
 */
export function compareAnswer(user: string, target: string): AnswerComparison {
  const a = tokenize(target); // target
  const b = tokenize(user); // user
  const n = a.length;
  const m = b.length;

  // lcs[i][j] = LCS length of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const tokens: AnswerToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      tokens.push({ text: a[i], status: 'ok' });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      tokens.push({ text: a[i], status: 'missing' });
      i++;
    } else {
      tokens.push({ text: b[j], status: 'extra' });
      j++;
    }
  }
  while (i < n) tokens.push({ text: a[i++], status: 'missing' });
  while (j < m) tokens.push({ text: b[j++], status: 'extra' });

  const common = lcs[0][0];
  const similarity = n + m === 0 ? 1 : (2 * common) / (n + m);
  return { exact: a.join(' ') === b.join(' '), similarity, tokens };
}
