import { compareAnswer, normalizeEn, type AnswerToken } from './frameEngine';

/** Similarity needed for a spoken sentence to count in the 单槽快替 voice mode. */
export const VOICE_THRESHOLD = 0.85;
/** More forgiving threshold for plain read-aloud (锚定 跟读). */
export const READ_ALOUD_THRESHOLD = 0.8;

/** Hesitation sounds the recognizer may transcribe; ignored unless the target itself contains them. */
const FILLERS = new Set(['uh', 'uhh', 'um', 'umm', 'uhm', 'er', 'erm', 'hmm', 'hm', 'mm', 'mmm', 'ah', 'eh', 'huh']);

/** Spoken / informal forms that recognizers and targets may spell differently. */
const SPOKEN: Record<string, string> = {
  gonna: 'going to',
  wanna: 'want to',
  gotta: 'got to',
  okay: 'ok',
  alright: 'all right',
};

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** 0-99 as English words ("21" -> "twenty one"); larger numbers are left as digits. */
function numberWords(digits: string): string {
  if (!/^\d{1,2}$/.test(digits)) return digits;
  const n = Number(digits);
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  return n % 10 === 0 ? tens : `${tens} ${ONES[n % 10]}`;
}

/**
 * Normalize text for spoken-answer matching: everything `normalizeEn` does (case, punctuation,
 * contractions) plus number words (3 = three), informal forms (gonna) and filler sounds (uh, um).
 */
export function canonicalizeSpoken(s: string, keep: ReadonlySet<string> = new Set()): string {
  const out: string[] = [];
  for (const raw of normalizeEn(s).split(' ')) {
    if (raw === '') continue;
    if (FILLERS.has(raw) && !keep.has(raw)) continue;
    const word = /^\d+$/.test(raw) ? numberWords(raw) : (SPOKEN[raw] ?? raw);
    out.push(word);
  }
  return out.join(' ');
}

export interface VoiceMatchOptions {
  /** Minimum similarity (0..1). Default VOICE_THRESHOLD. */
  threshold?: number;
  /** English text of the slot option that was swapped: all its words must be heard correctly. */
  slotEn?: string;
}

export interface VoiceMatch {
  matched: boolean;
  similarity: number;
  /** Every word of the swapped option was recognized in the right place (true when no slot is given). */
  slotOk: boolean;
  /** The transcript (among the alternatives) that matched best. */
  heard: string;
  /** Token diff of `heard` against the target (normalized words). */
  tokens: AnswerToken[];
}

/** Do all words of the slot option appear as 'ok' tokens, as a run in the target? */
function slotWordsOk(tokens: AnswerToken[], slot: string[]): boolean {
  if (slot.length === 0) return true;
  const target = tokens.filter((t) => t.status !== 'extra'); // the target's words, in order
  let found = false;
  for (let i = 0; i + slot.length <= target.length; i++) {
    if (!slot.every((w, k) => target[i + k].text === w)) continue;
    found = true;
    if (slot.every((_, k) => target[i + k].status === 'ok')) return true;
  }
  if (found) return false;
  // The option text is not a contiguous run of the target (unusual): require each word to be ok somewhere.
  return slot.every((w) => target.some((t) => t.text === w && t.status === 'ok'));
}

/**
 * Does what was heard count as the target sentence? Needs similarity >= threshold AND the swapped
 * slot's words all correct (the swapped chunk is the whole point of the drill). `heard` may be one
 * transcript or several recognition alternatives; the best one is judged.
 */
export function matchVoice(heard: string | readonly string[], target: string, opts: VoiceMatchOptions = {}): VoiceMatch {
  const threshold = opts.threshold ?? VOICE_THRESHOLD;
  const candidates = (typeof heard === 'string' ? [heard] : [...heard]).filter((h) => h.trim() !== '');
  if (candidates.length === 0) candidates.push('');

  const targetWords = new Set(normalizeEn(target).split(' '));
  const targetCanon = canonicalizeSpoken(target);
  const slot = opts.slotEn ? canonicalizeSpoken(opts.slotEn).split(' ').filter(Boolean) : [];

  let best: VoiceMatch | null = null;
  let bestScore = -1;
  for (const text of candidates) {
    const cmp = compareAnswer(canonicalizeSpoken(text, targetWords), targetCanon);
    const slotOk = slotWordsOk(cmp.tokens, slot);
    const matched = cmp.similarity >= threshold && slotOk;
    const score = (matched ? 2 : 0) + (slotOk ? 0.5 : 0) + cmp.similarity;
    if (score > bestScore) {
      bestScore = score;
      best = { matched, similarity: cmp.similarity, slotOk, heard: text, tokens: cmp.tokens };
    }
  }
  return best as VoiceMatch;
}
