import type { FunctionCategory, ReviewLog, Skill, SoundKind } from '../types';
import { getChunk, getSeedFrame, getSound } from '../content';

/** Measured answers per skill that make up the rolling window. */
export const WINDOW = 40;
/** The trend compares the newest TREND_SPAN answers with the TREND_SPAN before them. */
export const TREND_SPAN = 20;
/** Each half of a trend needs this many answers, otherwise the trend is undefined. */
const TREND_MIN_HALF = 5;
/** Category / sound statistics look at a wider window of chunk-track / sound answers. */
const CATEGORY_WINDOW = 200;
const SOUND_WINDOW = 120;
const WEAK_CATEGORY_MIN_N = 4;
const WEAK_CATEGORY_MAX_ACC = 0.88;
const WEAK_CATEGORY_COUNT = 3;

export interface LevelStat {
  n: number;
  acc: number;
}

export interface SkillStat {
  /** Answers in the window (<= 40). */
  n: number;
  /** Correct fraction 0-1 (0 when n = 0). */
  acc: number;
  /** Median latency of the CORRECT answers that have a latency; undefined when there is none. */
  medianLatencyMs?: number;
  /** acc(newest 20) - acc(previous 20) of the window; undefined when either half has < 5 answers. */
  trend?: number;
  /** Distribution by ladder level in force (only answers that recorded a level). */
  byLevel: Record<number, LevelStat>;
}

export interface CategoryStat extends LevelStat {
  category: FunctionCategory;
}

export interface SoundErrorStat {
  soundId: string;
  name: string;
  kind: SoundKind;
  attempts: number;
  errors: number;
}

export interface SoundKindStat {
  kind: SoundKind;
  attempts: number;
  errors: number;
}

export interface SkillStats {
  bySkill: Record<Skill, SkillStat>;
  /** Accuracy per function category over recent chunk-track answers (cards `chunk:*` / `frame:*`), best first. */
  categories: CategoryStat[];
  /** Up to 3 categories with >= 4 answers and accuracy < 88%, worst first. */
  weakestCategories: CategoryStat[];
  /** Sound patterns (`sound:sNN`) with at least one error, most errors first. */
  soundErrors: SoundErrorStat[];
  /** The same errors grouped by kind of connected-speech phenomenon. */
  soundByKind: SoundKindStat[];
  /** Number of measured logs considered. */
  measured: number;
}

/** How the stats resolve ids to content; replaceable for tests. */
export interface ContentLookup {
  categoryOf(cardId: string): FunctionCategory | undefined;
  sound(soundId: string): { name: string; kind: SoundKind } | undefined;
}

export const contentLookup: ContentLookup = {
  categoryOf(cardId) {
    if (cardId.startsWith('chunk:')) return getChunk(cardId.slice(6))?.category;
    if (cardId.startsWith('frame:')) return getSeedFrame(cardId.slice(6))?.category;
    return undefined;
  },
  sound(soundId) {
    const s = getSound(soundId);
    return s ? { name: s.name, kind: s.kind } : undefined;
  },
};

interface Measured extends ReviewLog {
  skill: Skill;
  correct: boolean;
}

/** Logs that carry a measurement, not deleted, not in the future, oldest first (stable for equal times). */
export function measuredLogs(logs: readonly ReviewLog[], now: number): Measured[] {
  const out: Measured[] = [];
  for (const l of logs) {
    if (l.deleted || l.skill === undefined || typeof l.correct !== 'boolean') continue;
    if (l.reviewedAt > now) continue;
    out.push(l as Measured);
  }
  return out
    .map((l, i) => ({ l, i }))
    .sort((a, b) => a.l.reviewedAt - b.l.reviewedAt || a.i - b.i)
    .map((x) => x.l);
}

function accOf(rows: readonly { correct: boolean }[]): number {
  if (rows.length === 0) return 0;
  return rows.filter((r) => r.correct).length / rows.length;
}

export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function skillStat(rows: readonly Measured[]): SkillStat {
  const window = rows.slice(-WINDOW);
  const stat: SkillStat = { n: window.length, acc: accOf(window), byLevel: {} };

  const latencies = window
    .filter((r) => r.correct && typeof r.latencyMs === 'number' && Number.isFinite(r.latencyMs))
    .map((r) => r.latencyMs as number);
  const med = median(latencies);
  if (med !== undefined) stat.medianLatencyMs = med;

  const recent = window.slice(-TREND_SPAN);
  const previous = window.slice(-2 * TREND_SPAN, -TREND_SPAN);
  if (recent.length >= TREND_MIN_HALF && previous.length >= TREND_MIN_HALF) {
    stat.trend = accOf(recent) - accOf(previous);
  }

  const levels = new Map<number, Measured[]>();
  for (const r of window) {
    if (typeof r.level !== 'number') continue;
    const list = levels.get(r.level);
    if (list) list.push(r);
    else levels.set(r.level, [r]);
  }
  for (const [level, list] of levels) stat.byLevel[level] = { n: list.length, acc: accOf(list) };
  return stat;
}

/**
 * Rolling statistics per skill over the last 40 measured logs (logs with `skill` and `correct`).
 * `now` only excludes logs from the future. Category and sound statistics use wider windows
 * (last 200 chunk-track answers / 120 sound answers) because there are many more buckets.
 */
export function computeSkillStats(
  logs: readonly ReviewLog[],
  now: number,
  lookup: ContentLookup = contentLookup,
): SkillStats {
  const rows = measuredLogs(logs, now);
  const bySkill = {} as Record<Skill, SkillStat>;
  for (const skill of ['listen', 'speak', 'decode'] as const) {
    bySkill[skill] = skillStat(rows.filter((r) => r.skill === skill));
  }

  const perCategory = new Map<FunctionCategory, { n: number; ok: number }>();
  const chunkRows = rows.filter((r) => r.cardId.startsWith('chunk:') || r.cardId.startsWith('frame:')).slice(-CATEGORY_WINDOW);
  for (const r of chunkRows) {
    const category = lookup.categoryOf(r.cardId);
    if (!category) continue;
    const e = perCategory.get(category) ?? { n: 0, ok: 0 };
    e.n++;
    if (r.correct) e.ok++;
    perCategory.set(category, e);
  }
  const categories: CategoryStat[] = [...perCategory.entries()]
    .map(([category, e]) => ({ category, n: e.n, acc: e.ok / e.n }))
    .sort((a, b) => b.acc - a.acc || b.n - a.n || (a.category < b.category ? -1 : 1));
  const weakestCategories = categories
    .filter((c) => c.n >= WEAK_CATEGORY_MIN_N && c.acc < WEAK_CATEGORY_MAX_ACC)
    .sort((a, b) => a.acc - b.acc || b.n - a.n || (a.category < b.category ? -1 : 1))
    .slice(0, WEAK_CATEGORY_COUNT);

  const perSound = new Map<string, { attempts: number; errors: number }>();
  const soundRows = rows.filter((r) => r.cardId.startsWith('sound:')).slice(-SOUND_WINDOW);
  for (const r of soundRows) {
    const id = r.cardId.slice(6);
    const e = perSound.get(id) ?? { attempts: 0, errors: 0 };
    e.attempts++;
    if (!r.correct) e.errors++;
    perSound.set(id, e);
  }
  const soundErrors: SoundErrorStat[] = [];
  const perKind = new Map<SoundKind, SoundKindStat>();
  for (const [soundId, e] of perSound) {
    const info = lookup.sound(soundId);
    if (!info) continue;
    const k = perKind.get(info.kind) ?? { kind: info.kind, attempts: 0, errors: 0 };
    k.attempts += e.attempts;
    k.errors += e.errors;
    perKind.set(info.kind, k);
    if (e.errors > 0) soundErrors.push({ soundId, name: info.name, kind: info.kind, ...e });
  }
  soundErrors.sort((a, b) => b.errors - a.errors || b.errors / b.attempts - a.errors / a.attempts || (a.soundId < b.soundId ? -1 : 1));
  const soundByKind = [...perKind.values()].sort((a, b) => b.errors - a.errors || (a.kind < b.kind ? -1 : 1));

  return { bySkill, categories, weakestCategories, soundErrors, soundByKind, measured: rows.length };
}

/** An empty stats object (no measured logs). */
export function emptySkillStats(): SkillStats {
  return computeSkillStats([], 0, { categoryOf: () => undefined, sound: () => undefined });
}
