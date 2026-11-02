import type { AdaptiveChange, AdaptiveState, CardState, ItemRef, ReviewLog, Skill } from '../types';
import {
  LISTEN_LEVELS,
  MAX_LISTEN_LEVEL,
  MAX_NEW_PER_DAY,
  MAX_SPEAK_LEVEL,
  MIN_NEW_PER_DAY,
  clampNewPerDayV3,
  defaultLadder,
  speakLimitMs,
} from './ladder';
import type { SkillStat } from './skills';

// ---------- constants (research/DELIBERATE-PRACTICE.md §四) ----------

/** Comfort-zone-edge band for the rolling accuracy of each skill. */
export const BAND_LOW = 0.7;
export const BAND_HIGH = 0.88;
/** Fewer answers than this and a skill is not adjusted. */
export const MIN_SAMPLES = 15;
/** Minimum days between two changes of the same dimension (prevents oscillation). */
export const MIN_GAP_DAYS = 2;
/** Any skill below this accuracy takes 2 off the new-chunk count. */
export const STRUGGLE_ACC = 0.65;
export const STRUGGLE_NEW_PENALTY = 2;
/** newPerDay can rise by at most this much per change (it falls straight to the budget). */
export const MAX_NEW_STEP_UP = 2;
export const DEFAULT_REVIEW_SEC = 25;
export const DEFAULT_NEW_SEC = 90;
export const HISTORY_LIMIT = 60;
/** An item is "slow" when a correct answer took at least this share of the time limit. */
export const SLOW_SHARE = 0.8;
export const EDGE_LAPSE_DAYS = 14;

const DAY_MS = 86_400_000;

// ---------- helpers ----------

/** Whole days from date `a` to date `b` ('YYYY-MM-DD'); NaN when either is malformed. */
export function daysBetween(a: string, b: string): number {
  const pa = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a);
  const pb = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b);
  if (!pa || !pb) return NaN;
  const ta = Date.UTC(Number(pa[1]), Number(pa[2]) - 1, Number(pa[3]));
  const tb = Date.UTC(Number(pb[1]), Number(pb[2]) - 1, Number(pb[3]));
  return Math.round((tb - ta) / DAY_MS);
}

/** True when a change today is not blocked by the 2-day rule. */
function gapOk(last: string | undefined, today: string): boolean {
  if (last === undefined) return true;
  const d = daysBetween(last, today);
  return Number.isNaN(d) || d >= MIN_GAP_DAYS;
}

/** "92%"; one decimal when whole-percent rounding would hide which side of the threshold we are on. */
function pct(acc: number, threshold: number): string {
  const whole = Math.round(acc * 100);
  if (whole === Math.round(threshold * 100)) return `${(acc * 100).toFixed(1)}%`;
  return `${whole}%`;
}

function rateStr(rate: number): string {
  const s = String(Math.round(rate * 100) / 100);
  return s.includes('.') ? s : `${s}.0`;
}

function listenReason(acc: number, from: number, to: number): string {
  const a = LISTEN_LEVELS[from];
  const b = LISTEN_LEVELS[to];
  const up = to > from;
  const head = up ? `听力正确率 ${pct(acc, BAND_HIGH)} > 88%` : `听力正确率 ${pct(acc, BAND_LOW)} < 70%`;
  const rate = `语速 ${rateStr(a.rate)} → ${rateStr(b.rate)}`;
  if (a.tier === b.tier) return `${head}，${rate}`;
  const tierText = up ? `对话升到第 ${b.tier} 档` : `对话退回第 ${b.tier} 档`;
  return `${head}，${tierText}（${rate}）`;
}

function speakReason(acc: number, from: number, to: number): string {
  const head = to > from ? `口语正确率 ${pct(acc, BAND_HIGH)} > 88%` : `口语正确率 ${pct(acc, BAND_LOW)} < 70%`;
  return `${head}，限时 ${speakLimitMs(from) / 1000} 秒 → ${speakLimitMs(to) / 1000} 秒`;
}

// ---------- new-chunk count from the time budget ----------

export interface AdaptiveContext {
  /** Cards expected to be due in the next lesson. */
  dueCount: number;
  /** Average seconds per review card (from logs); default 25. */
  avgReviewSec?: number;
  /** Average seconds to learn one new item (from logs); default 90. */
  avgNewSec?: number;
  dailyMinutes: number;
  /** Minutes of the fixed blocks (listening + decode + output) per day. */
  fixedBlocksMin: number;
}

/**
 * The largest new-chunk count whose estimated lesson time stays within `dailyMinutes`:
 * due x avgReview + new x avgNew + fixed blocks <= dailyMinutes. Clamped to 3-12.
 */
export function budgetNewPerDay(ctx: AdaptiveContext): number {
  const review = ctx.avgReviewSec !== undefined && ctx.avgReviewSec > 0 ? ctx.avgReviewSec : DEFAULT_REVIEW_SEC;
  const perNew = ctx.avgNewSec !== undefined && ctx.avgNewSec > 0 ? ctx.avgNewSec : DEFAULT_NEW_SEC;
  const spareSec = (ctx.dailyMinutes - ctx.fixedBlocksMin) * 60 - Math.max(0, ctx.dueCount) * review;
  const n = Math.floor(spareSec / perNew);
  return Math.min(MAX_NEW_PER_DAY, Math.max(MIN_NEW_PER_DAY, Number.isFinite(n) ? n : MIN_NEW_PER_DAY));
}

// ---------- controller ----------

type AdjustStats = { bySkill: Partial<Record<Skill, Pick<SkillStat, 'n' | 'acc'>>> };

export interface AdjustResult {
  /** The new state; the very same object when nothing changed. */
  state: AdaptiveState;
  changes: AdaptiveChange[];
}

/**
 * The difficulty controller (run when a day completes; the result shapes tomorrow's plan).
 * - listen / speak: rolling accuracy > 0.88 -> one level up, < 0.70 -> one level down; strict inequalities,
 *   at least 15 answers, at least 2 days since the last change of that dimension, clamped to the ladder.
 * - newPerDay: from the time budget (see budgetNewPerDay), minus 2 when any skill (>= 15 answers) is below
 *   0.65; falls straight to the target but rises by at most 2 per change; same 2-day rule.
 * Every change carries a Chinese reason with the numbers.
 */
export function adjust(
  state: AdaptiveState,
  stats: AdjustStats,
  today: string,
  ctx: AdaptiveContext,
): AdjustResult {
  const changes: AdaptiveChange[] = [];
  const ladder = { ...state.ladder };
  const lastChange = { ...state.lastChange };

  const stepSkill = (skill: 'listen' | 'speak'): void => {
    const s = stats.bySkill[skill];
    if (!s || s.n < MIN_SAMPLES || !gapOk(lastChange[skill], today)) return;
    const from = ladder[skill];
    const max = skill === 'listen' ? MAX_LISTEN_LEVEL : MAX_SPEAK_LEVEL;
    let to = from;
    if (s.acc > BAND_HIGH && from < max) to = from + 1;
    else if (s.acc < BAND_LOW && from > 0) to = from - 1;
    if (to === from) return;
    ladder[skill] = to;
    lastChange[skill] = today;
    changes.push({
      date: today,
      dimension: skill,
      from,
      to,
      reasonZh: skill === 'listen' ? listenReason(s.acc, from, to) : speakReason(s.acc, from, to),
    });
  };
  stepSkill('listen');
  stepSkill('speak');

  // new chunks per day
  if (gapOk(lastChange.newPerDay, today)) {
    const from = clampNewPerDayV3(ladder.newPerDay);
    const budget = budgetNewPerDay(ctx);
    const names: Record<Skill, string> = { listen: '听力', speak: '口语', decode: '解码' };
    let worst: { skill: Skill; acc: number } | undefined;
    for (const k of ['listen', 'speak', 'decode'] as const) {
      const s = stats.bySkill[k];
      if (s && s.n >= MIN_SAMPLES && s.acc < STRUGGLE_ACC && (!worst || s.acc < worst.acc)) worst = { skill: k, acc: s.acc };
    }
    const target = Math.max(MIN_NEW_PER_DAY, budget - (worst ? STRUGGLE_NEW_PENALTY : 0));
    const to = target < from ? target : Math.min(target, from + MAX_NEW_STEP_UP);
    if (to !== from) {
      ladder.newPerDay = to;
      lastChange.newPerDay = today;
      const parts = [
        `每天 ${ctx.dailyMinutes} 分钟，预计明天到期复习 ${Math.max(0, Math.round(ctx.dueCount))} 条，按时间预算新语块约 ${budget} 条`,
      ];
      if (worst) parts.push(`${names[worst.skill]}正确率 ${Math.round(worst.acc * 100)}% < 65%，再减 ${STRUGGLE_NEW_PENALTY} 条`);
      if (to < target) parts.push(`每次最多增加 ${MAX_NEW_STEP_UP} 条`);
      changes.push({
        date: today,
        dimension: 'newPerDay',
        from,
        to,
        reasonZh: `${parts.join('；')}：新语块 ${from} → ${to} 条/天`,
      });
    }
  }

  if (changes.length === 0) return { state, changes };
  const history = [...state.history, ...changes].slice(-HISTORY_LIMIT);
  return { state: { ladder, lastChange, history }, changes };
}

/** A fresh controller state: default ladder, no history. */
export function defaultAdaptiveState(ladder = defaultLadder()): AdaptiveState {
  return { ladder, lastChange: {}, history: [] };
}

// ---------- edge items ----------

export interface EdgeOptions {
  /** Maximum items to return (default: all). */
  limit?: number;
  /** Speaking level used for the "slow" test of logs that did not record their level (default S1). */
  speakLevel?: number;
}

function outcome(l: ReviewLog): boolean {
  return l.correct ?? l.grade > 0;
}

/**
 * Items at the edge of what the learner can do (will-but-not-yet), for review / output priority:
 * a lapse (grade 0) in the last 14 days, a mix of right and wrong in the last 3 answers, or a correct spoken
 * answer that took >= 80% of the time limit (most recent such answer within 14 days).
 * Only chunk / frame cards. Sorted by number of reasons, then most recent trouble, then id.
 */
export function findEdgeItems(
  cards: readonly CardState[],
  logs: readonly ReviewLog[],
  now: number,
  opts: EdgeOptions = {},
): ItemRef[] {
  const byCard = new Map<string, ReviewLog[]>();
  for (const l of logs) {
    if (l.deleted || l.reviewedAt > now) continue;
    const list = byCard.get(l.cardId);
    if (list) list.push(l);
    else byCard.set(l.cardId, [l]);
  }
  const since = now - EDGE_LAPSE_DAYS * DAY_MS;
  const defaultSpeak = opts.speakLevel ?? 1;

  const scored: { ref: ItemRef; reasons: number; recent: number }[] = [];
  for (const card of cards) {
    if (card.deleted || (card.kind !== 'chunk' && card.kind !== 'frame')) continue;
    const list = (byCard.get(card.id) ?? []).sort((a, b) => a.reviewedAt - b.reviewedAt);
    if (list.length === 0) continue;

    let reasons = 0;
    let recent = 0;

    const lapse = list.filter((l) => l.grade === 0 && l.reviewedAt >= since);
    if (lapse.length > 0) {
      reasons++;
      recent = Math.max(recent, lapse[lapse.length - 1].reviewedAt);
    }

    const last3 = list.slice(-3);
    if (last3.length >= 2) {
      const flags = last3.map(outcome);
      if (flags.includes(true) && flags.includes(false)) {
        reasons++;
        recent = Math.max(recent, last3[last3.length - 1].reviewedAt);
      }
    }

    const timed = list.filter(
      (l) => l.skill === 'speak' && l.correct === true && typeof l.latencyMs === 'number' && l.reviewedAt >= since,
    );
    const lastTimed = timed[timed.length - 1];
    if (lastTimed && (lastTimed.latencyMs as number) >= SLOW_SHARE * speakLimitMs(lastTimed.level ?? defaultSpeak)) {
      reasons++;
      recent = Math.max(recent, lastTimed.reviewedAt);
    }

    if (reasons > 0) scored.push({ ref: { kind: card.kind, id: card.refId }, reasons, recent });
  }

  scored.sort((a, b) => b.reasons - a.reasons || b.recent - a.recent || (a.ref.id < b.ref.id ? -1 : a.ref.id > b.ref.id ? 1 : 0));
  const refs = scored.map((s) => s.ref);
  return opts.limit !== undefined ? refs.slice(0, Math.max(0, opts.limit)) : refs;
}
