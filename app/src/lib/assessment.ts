import type { Assessment, Chunk, Dialogue, DialogueTier, Freq, Ladder } from '../types';
import { CHUNKS, DIALOGUES } from '../content';
import { MAX_LISTEN_LEVEL, clampListenLevel, speakLimitMs } from './ladder';
import { median } from './skills';
import { todayStr } from './plan';

// Item selection and scoring for the placement test (research/DELIBERATE-PRACTICE.md §五) and the weekly
// checkpoint. Pure: the UI renders the items, collects results and calls the score functions.

export type Rng = () => number;

/** Where test items come from. Defaults to the shipped content; tests inject their own. */
export interface AssessmentPool {
  chunks: readonly Chunk[];
  dialogues: readonly Dialogue[];
}

/**
 * Default pool: the 250 core chunks (c001-c250, i.e. without a `phrasal` / `collocation` tag), because tests should
 * probe general ability and not rely on phrasal verbs the learner may never have met.
 */
export function defaultPool(): AssessmentPool {
  return { chunks: CHUNKS.filter((c) => c.tags === undefined || c.tags.length === 0), dialogues: DIALOGUES };
}

// ---------- constants ----------

export const PLACEMENT_START_LEVEL = 2;
export const PLACEMENT_LISTEN_PER_BAND = 4;
export const PLACEMENT_SPEAK_PER_BAND = 4;
/** Placement speaking limit: the slowest speaking level (S0), 10 seconds. */
export const PLACEMENT_SPEAK_LIMIT_MS = speakLimitMs(0);
/** A level counts as "reached" when at least this share of the answers at that level were right. */
export const LEVEL_PASS_SHARE = 2 / 3;
/** A freq-1 chunk said correctly within this time is fast-tracked as already known. */
export const FAST_TRACK_MS = 3000;
/** Speaking level from the median latency (ms) of correct answers: first row whose maximum is not exceeded. */
export const SPEAK_LATENCY_LEVELS: readonly { maxMs: number; level: number }[] = [
  { maxMs: 3000, level: 5 },
  { maxMs: 4000, level: 4 },
  { maxMs: 5000, level: 3 },
  { maxMs: 6500, level: 2 },
  { maxMs: 8500, level: 1 },
];
/** Below this speaking accuracy the level is S0 whatever the speed. */
export const SPEAK_MIN_ACC = 0.5;
/**
 * A cap on the staircase level from the two dialogue gist questions: a wrong tier-1 dialogue caps listening at L2,
 * a wrong tier-2 dialogue at L5 (the top of tier 2). Single sentences are easier than dialogues, so the staircase
 * alone tends to overestimate.
 */
export const DIALOGUE_CAP: Record<DialogueTier, number> = { 1: 2, 2: 5, 3: MAX_LISTEN_LEVEL };

/**
 * levelZh: composite = 0.6 x listenLevel/8 + 0.4 x speakLevel/5 (listening is the learner's main goal), then
 *   < 0.25 入门, < 0.50 基础, < 0.75 进阶, otherwise 熟练.
 * This is an internal heuristic of this app, not a standardized test result.
 */
export const LEVEL_WEIGHT_LISTEN = 0.6;
export const LEVEL_CUTS: readonly { below: number; zh: Assessment['levelZh'] }[] = [
  { below: 0.25, zh: '入门' },
  { below: 0.5, zh: '基础' },
  { below: 0.75, zh: '进阶' },
];

// ---------- random helpers ----------

/** `n` distinct elements chosen by `rng` (partial Fisher-Yates); fewer if the list is shorter. */
export function sample<T>(items: readonly T[], n: number, rng: Rng): T[] {
  const a = [...items];
  const k = Math.min(Math.max(0, n), a.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.min(a.length - i - 1, Math.floor(rng() * (a.length - i)));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

function byFreq(chunks: readonly Chunk[], freq: Freq): Chunk[] {
  return chunks.filter((c) => c.freq === freq);
}

// ---------- plans ----------

export interface ChunkProbe {
  chunkId: string;
  freq: Freq;
}

export interface PlacementPlan {
  /** Staircase: present `items` in order; start at `startLevel`, +1 after a correct answer, -1 after a wrong one. */
  listen: { startLevel: number; items: ChunkProbe[] };
  /** Gist questions after the staircase: [tier-1 dialogue id, tier-2 dialogue id]. */
  dialogues: string[];
  speak: { limitMs: number; items: ChunkProbe[] };
}

/** Next staircase level after an answer, clamped to L0-L8. */
export function nextListenLevel(level: number, correct: boolean): number {
  return clampListenLevel(level + (correct ? 1 : -1));
}

/**
 * Placement items: 12 listening chunks (4 per frequency band, interleaved 1,2,3,1,2,3...), the tier-1 and tier-2
 * dialogue, and 8 speaking chunks (4 of freq 1 + 4 of freq 2) that differ from the listening chunks.
 */
export function buildPlacement(rng: Rng, pool: AssessmentPool = defaultPool()): PlacementPlan {
  const used = new Set<string>();
  const take = (freq: Freq, n: number): ChunkProbe[] => {
    const picked = sample(byFreq(pool.chunks, freq).filter((c) => !used.has(c.id)), n, rng);
    for (const c of picked) used.add(c.id);
    return picked.map((c) => ({ chunkId: c.id, freq }));
  };
  const bands = ([1, 2, 3] as const).map((f) => take(f, PLACEMENT_LISTEN_PER_BAND));
  const listenItems: ChunkProbe[] = [];
  for (let i = 0; i < PLACEMENT_LISTEN_PER_BAND; i++) for (const b of bands) if (b[i]) listenItems.push(b[i]);

  const speakItems = [...take(1, PLACEMENT_SPEAK_PER_BAND), ...take(2, PLACEMENT_SPEAK_PER_BAND)];

  const dialogueFor = (tier: DialogueTier): string[] =>
    sample(pool.dialogues.filter((d) => d.tier === tier), 1, rng).map((d) => d.id);

  return {
    listen: { startLevel: PLACEMENT_START_LEVEL, items: listenItems },
    dialogues: [...dialogueFor(1), ...dialogueFor(2)],
    speak: { limitMs: PLACEMENT_SPEAK_LIMIT_MS, items: speakItems },
  };
}

export interface CheckpointPlan {
  /** 6 items: 3 at the current listening level and 3 one level higher, alternating. */
  listen: (ChunkProbe & { level: number })[];
  /** 4 items, to be said within `limitMs` (the current speaking limit). */
  speak: { limitMs: number; items: ChunkProbe[] };
}

export interface CheckpointOptions {
  pool?: AssessmentPool;
  /** Chunk ids the learner has already met; preferred as test items (topped up from the pool when too few). */
  preferIds?: ReadonlySet<string>;
}

export function buildCheckpoint(ladder: Ladder, rng: Rng, opts: CheckpointOptions = {}): CheckpointPlan {
  const pool = opts.pool ?? defaultPool();
  const prefer = opts.preferIds;
  const preferred = prefer ? pool.chunks.filter((c) => prefer.has(c.id)) : [];
  const picked = sample(preferred, 10, rng);
  if (picked.length < 10) {
    const have = new Set(picked.map((c) => c.id));
    picked.push(...sample(pool.chunks.filter((c) => !have.has(c.id)), 10 - picked.length, rng));
  }
  const probe = (c: Chunk): ChunkProbe => ({ chunkId: c.id, freq: c.freq });
  const lower = ladder.listen;
  const upper = Math.min(MAX_LISTEN_LEVEL, ladder.listen + 1);
  const listen = picked.slice(0, 6).map((c, i) => ({ ...probe(c), level: i % 2 === 0 ? lower : upper }));
  return {
    listen,
    speak: { limitMs: speakLimitMs(ladder.speak), items: picked.slice(6, 10).map(probe) },
  };
}

// ---------- scoring ----------

export interface ListenResult extends ChunkProbe {
  /** Level at which the item was presented. */
  level: number;
  correct: boolean;
}
export interface DialogueResult {
  id: string;
  tier: DialogueTier;
  correct: boolean;
}
export interface SpeakResult extends ChunkProbe {
  correct: boolean;
  /** Time from the prompt to a correct answer; absent for wrong answers. */
  latencyMs?: number;
}

export interface PlacementResults {
  listen: ListenResult[];
  dialogues: DialogueResult[];
  speak: SpeakResult[];
}

export interface CheckpointResults {
  listen: ListenResult[];
  speak: SpeakResult[];
}

export interface ScoreOptions {
  date?: string;
  id?: string;
}

/** Highest level at which >= 2/3 of the answers were correct, or undefined when no level qualifies. */
export function highestPassedLevel(results: readonly { level: number; correct: boolean }[]): number | undefined {
  const perLevel = new Map<number, { n: number; ok: number }>();
  for (const r of results) {
    const e = perLevel.get(r.level) ?? { n: 0, ok: 0 };
    e.n++;
    if (r.correct) e.ok++;
    perLevel.set(r.level, e);
  }
  let best: number | undefined;
  for (const [level, e] of perLevel) {
    if (e.ok / e.n >= LEVEL_PASS_SHARE - 1e-9 && (best === undefined || level > best)) best = level;
  }
  return best;
}

/** Speaking level S0-S5 from accuracy and the median latency of the correct answers (see the table above). */
export function speakLevelFromResults(results: readonly SpeakResult[]): { level: number; acc: number; medianMs?: number } {
  const acc = results.length === 0 ? 0 : results.filter((r) => r.correct).length / results.length;
  const times = results
    .filter((r) => r.correct && typeof r.latencyMs === 'number')
    .map((r) => r.latencyMs as number);
  const medianMs = median(times);
  const out: { level: number; acc: number; medianMs?: number } = { level: 0, acc };
  if (medianMs !== undefined) out.medianMs = medianMs;
  if (acc < SPEAK_MIN_ACC || medianMs === undefined) return out;
  const row = SPEAK_LATENCY_LEVELS.find((r) => medianMs <= r.maxMs);
  out.level = row ? row.level : 0;
  return out;
}

export function levelZhFor(listenLevel: number, speakLevel: number): Assessment['levelZh'] {
  const composite =
    LEVEL_WEIGHT_LISTEN * (clampListenLevel(listenLevel) / MAX_LISTEN_LEVEL) +
    (1 - LEVEL_WEIGHT_LISTEN) * (Math.min(5, Math.max(0, speakLevel)) / 5);
  return LEVEL_CUTS.find((c) => composite < c.below)?.zh ?? '熟练';
}

function bandAccuracy(rows: readonly { freq: Freq; correct: boolean }[]): Partial<Record<Freq, number>> {
  const out: Partial<Record<Freq, number>> = {};
  for (const f of [1, 2, 3] as const) {
    const r = rows.filter((x) => x.freq === f);
    if (r.length > 0) out[f] = r.filter((x) => x.correct).length / r.length;
  }
  return out;
}

function stamp(kind: Assessment['kind'], o: ScoreOptions): { id: string; date: string } {
  const date = o.date ?? todayStr();
  return { id: o.id ?? `${kind}-${date}`, date };
}

/**
 * Placement result.
 * - listenLevel: highest staircase level with >= 2/3 correct (0 if none), capped by the dialogue gist answers (DIALOGUE_CAP).
 * - listenAcc: share correct over staircase items and dialogues.
 * - speakLevel: accuracy < 50% -> S0, otherwise from the median latency of the correct answers
 *   (<= 3 s S5, <= 4 s S4, <= 5 s S3, <= 6.5 s S2, <= 8.5 s S1, else S0).
 * - fastTracked: freq-1 chunks said correctly within 3 s.
 */
export function scorePlacement(results: PlacementResults, opts: ScoreOptions = {}): Assessment {
  let listenLevel = highestPassedLevel(results.listen) ?? 0;
  for (const d of results.dialogues) {
    if (!d.correct) listenLevel = Math.min(listenLevel, DIALOGUE_CAP[d.tier]);
  }
  const listenAnswers = [...results.listen, ...results.dialogues];
  const listenAcc =
    listenAnswers.length === 0 ? 0 : listenAnswers.filter((r) => r.correct).length / listenAnswers.length;
  const speak = speakLevelFromResults(results.speak);
  const fastTracked = [
    ...new Set(
      results.speak
        .filter((r) => r.freq === 1 && r.correct && typeof r.latencyMs === 'number' && r.latencyMs <= FAST_TRACK_MS)
        .map((r) => r.chunkId),
    ),
  ];
  const a: Assessment = {
    ...stamp('placement', opts),
    kind: 'placement',
    listenLevel,
    listenAcc,
    speakLevel: speak.level,
    speakAcc: speak.acc,
    bandAcc: bandAccuracy([...results.listen, ...results.speak]),
    levelZh: levelZhFor(listenLevel, speak.level),
  };
  if (speak.medianMs !== undefined) a.speakMedianMs = speak.medianMs;
  if (fastTracked.length > 0) a.fastTracked = fastTracked;
  return a;
}

/**
 * Weekly checkpoint result: listenLevel is the highest of the two tested levels with >= 2/3 correct, or one below
 * the current level when neither qualifies; speaking is scored like the placement.
 */
export function scoreCheckpoint(ladder: Ladder, results: CheckpointResults, opts: ScoreOptions = {}): Assessment {
  const passed = highestPassedLevel(results.listen);
  const listenLevel = passed ?? Math.max(0, ladder.listen - 1);
  const listenAcc =
    results.listen.length === 0 ? 0 : results.listen.filter((r) => r.correct).length / results.listen.length;
  const speak = speakLevelFromResults(results.speak);
  const a: Assessment = {
    ...stamp('checkpoint', opts),
    kind: 'checkpoint',
    listenLevel,
    listenAcc,
    speakLevel: speak.level,
    speakAcc: speak.acc,
    bandAcc: bandAccuracy([...results.listen, ...results.speak]),
    levelZh: levelZhFor(listenLevel, speak.level),
  };
  if (speak.medianMs !== undefined) a.speakMedianMs = speak.medianMs;
  return a;
}
