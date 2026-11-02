import type {
  AdaptiveChange,
  AdaptiveState,
  Assessment,
  Attempt,
  CardKind,
  CardState,
  CoachReport,
  DailySession,
  DayPlan,
  DrillMode,
  FunctionCategory,
  Goal,
  Grade,
  ItemRef,
  Ladder,
  Profile,
  ReviewLog,
  Skill,
  StepKey,
  SubstitutionFrame,
  SyncedRecord,
  SyncedTable,
  UserFrame,
} from '../types';
import { CHUNKS, CURRICULUM, DIALOGUES, SEED_FRAMES, SOUNDS } from '../content';
import { db, SYNCED_TABLES } from './db';
import {
  ALL_STEP_KEYS,
  DEFAULT_NEW_PER_DAY,
  getDayPlan,
  getDayPlanV3,
  itemKey,
  MAX_EDGE_ITEMS,
  CHECKPOINT_EVERY_LESSONS,
  requiredSteps,
  splitBudget,
  todayStr,
} from './plan';
import { FUNCTION_CATEGORIES } from './labels';
import { knownCard, newCard, schedule } from './srs';
import { BAND_HIGH, BAND_LOW, adjust, defaultAdaptiveState, findEdgeItems } from './adaptive';
import { clampNewPerDayV3, defaultLadder } from './ladder';
import { computeSkillStats, median, type SkillStats } from './skills';
import { buildGoalPlan, progressStatus, type GoalPlan, type ProgressReport } from './goalPlan';
import { buildCoachInput, type CoachInput } from './coachInput';

/** Dispatches a 'change' event after every local write (sync debounces on it). */
export const localChanges: EventTarget = new EventTarget();

const PROFILE_ID = 'profile';
/** A card is 'mastered' once its review interval reaches this many days. */
const MASTERED_INTERVAL_DAYS = 21;
const EXPORT_VERSION = 1;
const HEATMAP_DAYS = 84;

function notify(): void {
  localChanges.dispatchEvent(new Event('change'));
}

/** Mark a record as locally modified: fresh updatedAt and _dirty=1. */
function touch<T extends SyncedRecord>(r: T): T {
  return { ...r, updatedAt: Date.now(), _dirty: 1 };
}

function newId(): string {
  return crypto.randomUUID();
}

// ---------- profile ----------

export async function getOrCreateProfile(): Promise<Profile> {
  let created = false;
  const profile = await db.transaction('rw', db.profile, async () => {
    const existing = await db.profile.get(PROFILE_ID);
    if (existing && !existing.deleted) return existing;
    const fresh = touch<Profile>({
      id: PROFILE_ID,
      startDate: todayStr(),
      dailyMinutes: 15,
      scenes: ['work', 'daily'],
      newPerDay: DEFAULT_NEW_PER_DAY,
      updatedAt: 0,
    });
    await db.profile.put(fresh);
    created = true;
    return fresh;
  });
  if (created) notify();
  return profile;
}

export async function updateProfile(patch: Partial<Profile>): Promise<Profile> {
  await getOrCreateProfile();
  const next = await db.transaction('rw', db.profile, async () => {
    const current = await db.profile.get(PROFILE_ID);
    const merged = touch<Profile>({ ...(current as Profile), ...patch, id: PROFILE_ID, deleted: false });
    await db.profile.put(merged);
    return merged;
  });
  notify();
  return next;
}

// ---------- cards ----------

export async function ensureCards(kind: CardKind, refIds: string[]): Promise<void> {
  const now = Date.now();
  const unique = [...new Set(refIds)];
  const created = await db.transaction('rw', db.cards, async () => {
    const existing = await db.cards.bulkGet(unique.map((r) => `${kind}:${r}`));
    const fresh: CardState[] = [];
    unique.forEach((refId, i) => {
      const e = existing[i];
      if (!e || e.deleted) fresh.push(touch(newCard(kind, refId, now)));
    });
    if (fresh.length > 0) await db.cards.bulkPut(fresh);
    return fresh.length;
  });
  if (created > 0) notify();
}

/**
 * Cards due at `now`, oldest due first. `kinds` restricts the card kinds (the review step asks for
 * ['chunk', 'frame']; decode maintenance may ask for ['dozen']); omitted = every kind.
 */
export async function getDueCards(now: number, limit: number, kinds?: CardKind[]): Promise<CardState[]> {
  if (limit <= 0) return [];
  return db.cards
    .where('due')
    .belowOrEqual(now)
    .filter((c) => !c.deleted && (kinds === undefined || kinds.includes(c.kind)))
    .limit(limit)
    .toArray();
}

/** Marks library items as met (creates their SRS cards, due immediately). Called when the learner finishes an item. */
export async function introduceItems(refs: ItemRef[]): Promise<void> {
  for (const kind of ['chunk', 'frame'] as const) {
    const ids = refs.filter((r) => r.kind === kind).map((r) => r.id);
    if (ids.length > 0) await ensureCards(kind, ids);
  }
}

/** Marks a sound pattern (s01..s40) as met: creates its SRS card, due immediately. */
export async function introduceSound(id: string): Promise<void> {
  await ensureCards('sound', [id]);
}

/**
 * Placement fast track: marks library items as already known. Creates their cards with one successful review
 * recorded and the first real review `intervalDays` (default 7) away. Existing cards are left untouched.
 */
export async function introduceKnown(refs: ItemRef[], intervalDays = 7): Promise<void> {
  const now = Date.now();
  const created = await db.transaction('rw', db.cards, async () => {
    const unique = [...new Map(refs.map((r) => [itemKey(r), r])).values()];
    const existing = await db.cards.bulkGet(unique.map(itemKey));
    const fresh: CardState[] = [];
    unique.forEach((ref, i) => {
      const e = existing[i];
      if (!e || e.deleted) fresh.push(touch(knownCard(ref.kind, ref.id, now, intervalDays)));
    });
    if (fresh.length > 0) await db.cards.bulkPut(fresh);
    return fresh.length;
  });
  if (created > 0) notify();
}

/** Optional measurement stored on the ReviewLog (v3): feeds the skill statistics and the difficulty controller. */
export interface CardMeasurement {
  skill?: Skill;
  correct?: boolean;
  latencyMs?: number;
  /** Ladder level in force: listen L0-L8 / speak S0-S5. */
  level?: number;
}

function measurementFields(m: CardMeasurement | undefined): CardMeasurement {
  const out: CardMeasurement = {};
  if (!m) return out;
  if (m.skill !== undefined) out.skill = m.skill;
  if (m.correct !== undefined) out.correct = m.correct;
  if (m.latencyMs !== undefined) out.latencyMs = m.latencyMs;
  if (m.level !== undefined) out.level = m.level;
  return out;
}

export async function gradeCard(
  cardId: string,
  grade: Grade,
  mode: DrillMode,
  durationMs: number,
  measurement?: CardMeasurement,
): Promise<CardState> {
  const now = Date.now();
  const next = await db.transaction('rw', db.cards, db.reviews, async () => {
    const card = await db.cards.get(cardId);
    if (!card || card.deleted) throw new Error(`Card not found: ${cardId}`);
    const updated = touch(schedule(card, grade, now));
    const log = touch<ReviewLog>({
      id: newId(),
      cardId,
      grade,
      mode,
      reviewedAt: now,
      durationMs,
      updatedAt: now,
      ...measurementFields(measurement),
    });
    await db.cards.put(updated);
    await db.reviews.add(log);
    return updated;
  });
  notify();
  return next;
}

export interface MeasurementInput extends CardMeasurement {
  /** A card id ('chunk:c001') or a pseudo id for card-less practice ('dialogue:dl001', 'numbers:price'). */
  cardId: string;
  skill: Skill;
  correct: boolean;
  mode: DrillMode;
  durationMs: number;
  /** Defaults to 2 (good) when correct, 0 (forgot) when not. */
  grade?: Grade;
}

/**
 * Records one measured answer as a ReviewLog. Never touches the SRS state, so it is safe for pseudo ids and for
 * practice that should not reschedule a card (use gradeCard with measurement fields to do both).
 */
export async function logMeasurement(input: MeasurementInput): Promise<ReviewLog> {
  const now = Date.now();
  const log = touch<ReviewLog>({
    id: newId(),
    cardId: input.cardId,
    grade: input.grade ?? (input.correct ? 2 : 0),
    mode: input.mode,
    reviewedAt: now,
    durationMs: input.durationMs,
    updatedAt: now,
    skill: input.skill,
    correct: input.correct,
    ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
    ...(input.level !== undefined ? { level: input.level } : {}),
  });
  await db.reviews.add(log);
  notify();
  return log;
}

// ---------- sessions ----------

/**
 * Lesson number for `date`, counted in COMPLETED lessons, not calendar days, so a missed day never skips
 * content: an existing session keeps its dayIndex; otherwise it is (completed sessions before `date`) + 1.
 * Reads sessions only, so it can run inside a sessions transaction.
 */
async function computeDayIndex(date: string): Promise<number> {
  const existing = await db.sessions.get(date);
  if (existing && !existing.deleted) return existing.dayIndex;
  const done = await db.sessions
    .filter((s) => !s.deleted && s.completedAt !== undefined && s.date < date)
    .count();
  return done + 1;
}

export async function getTodayDayIndex(today: string): Promise<number> {
  return computeDayIndex(today);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const EDGE_LOOKBACK_DAYS = 30;

/** The ladder in force: the controller's, or a default seeded with the profile's newPerDay. */
function ladderOf(profile: Profile | undefined): Ladder {
  if (profile?.adaptive) return profile.adaptive.ladder;
  return { ...defaultLadder(), newPerDay: clampNewPerDayV3(profile?.newPerDay ?? DEFAULT_NEW_PER_DAY) };
}

/** dialogue id -> last time practiced, from logs with cardId 'dialogue:<id>'. */
async function loadDialogueHeard(): Promise<Map<string, number>> {
  const logs = await db.reviews.where('cardId').startsWith('dialogue:').toArray();
  const heard = new Map<string, number>();
  for (const l of logs) {
    if (l.deleted) continue;
    const id = l.cardId.slice('dialogue:'.length);
    heard.set(id, Math.max(heard.get(id) ?? 0, l.reviewedAt));
  }
  return heard;
}

async function loadRecentLogs(now: number, days = EDGE_LOOKBACK_DAYS): Promise<ReviewLog[]> {
  const logs = await db.reviews
    .where('reviewedAt')
    .aboveOrEqual(now - days * DAY_MS)
    .toArray();
  return logs.filter((l) => !l.deleted);
}

/**
 * Freezes today's plan. Without a goal this is the v2 plan (4 steps): the introduced set is every live
 * chunk/frame card, the curriculum is the seed curriculum, newPerDay comes from the profile. With a goal it is
 * the v3 plan (see getDayPlanV3). Reads cards, profile, reviews and sessions, so callers' transactions must
 * include them.
 */
async function computePlan(dayIndex: number, date: string): Promise<DayPlan> {
  const [cards, profile] = await Promise.all([
    db.cards.filter((c) => !c.deleted).toArray(),
    db.profile.get(PROFILE_ID),
  ]);
  const itemCards = cards.filter((c) => c.kind === 'chunk' || c.kind === 'frame');
  const introduced = new Set(itemCards.map((c) => itemKey({ kind: c.kind as ItemRef['kind'], id: c.refId })));

  if (!profile || profile.deleted || !profile.goal) {
    return getDayPlan({
      dayIndex,
      introduced,
      curriculum: CURRICULUM,
      newPerDay: profile?.newPerDay ?? DEFAULT_NEW_PER_DAY,
    });
  }

  const now = Date.now();
  const ladder = ladderOf(profile);
  const soundCards = cards.filter((c) => c.kind === 'sound');
  const lastAssessment = profile.assessments?.[profile.assessments.length - 1]?.date;
  let checkpointDue = false;
  if (lastAssessment !== undefined) {
    const lessonsSince = await db.sessions
      .filter((s) => !s.deleted && s.completedAt !== undefined && s.date > lastAssessment && s.date < date)
      .count();
    checkpointDue = lessonsSince >= CHECKPOINT_EVERY_LESSONS;
  }
  const [heardAt, logs] = await Promise.all([loadDialogueHeard(), loadRecentLogs(now)]);
  return getDayPlanV3({
    dayIndex,
    introduced,
    curriculum: CURRICULUM,
    ladder,
    dailyMinutes: profile.goal.dailyMinutes,
    dialogues: DIALOGUES,
    heardAt,
    scenes: profile.scenes,
    sounds: SOUNDS,
    introducedSounds: new Set(soundCards.map((c) => c.refId)),
    dueSoundIds: soundCards
      .filter((c) => c.due <= now)
      .sort((a, b) => a.due - b.due)
      .map((c) => c.refId),
    edge: findEdgeItems(itemCards, logs, now, { limit: MAX_EDGE_ITEMS, speakLevel: ladder.speak }),
    checkpointDue,
  });
}

/**
 * The session of `date`. A new session freezes its plan (see computePlan) so the plan never reshuffles
 * mid-day or across devices; an older session without a plan gets one on first read.
 */
export async function getOrCreateSession(date: string): Promise<DailySession> {
  await getOrCreateProfile();
  const { session, changed } = await db.transaction('rw', db.sessions, db.cards, db.profile, db.reviews, async () => {
    const existing = await db.sessions.get(date);
    if (existing && !existing.deleted) {
      if (existing.plan) return { session: existing, changed: false };
      const upgraded = touch<DailySession>({ ...existing, plan: await computePlan(existing.dayIndex, date) });
      await db.sessions.put(upgraded);
      return { session: upgraded, changed: true };
    }
    const dayIndex = await computeDayIndex(date);
    const fresh = touch<DailySession>({
      id: date,
      date,
      dayIndex,
      stepsDone: [],
      plan: await computePlan(dayIndex, date),
      activeMs: 0,
      updatedAt: 0,
    });
    await db.sessions.put(fresh);
    return { session: fresh, changed: true };
  });
  if (changed) notify();
  return session;
}

/**
 * Records a finished step ('review' | 'chunks' | 'listening' | 'decode' | 'output'; anything else, e.g. a legacy v1
 * key, is ignored but its time still counts). The day counts as completed (completedAt set) once all required
 * steps are done: 5 for a v3 plan (it has a listening block), 4 for a v2 plan (no 'listening').
 */
export async function markStepDone(date: string, step: StepKey, activeMs: number): Promise<DailySession> {
  await getOrCreateProfile();
  const next = await db.transaction('rw', db.sessions, db.cards, db.profile, db.reviews, async () => {
    const existing = await db.sessions.get(date);
    let base: DailySession;
    if (existing && !existing.deleted) {
      base = existing;
    } else {
      const dayIndex = await computeDayIndex(date);
      base = { id: date, date, dayIndex, stepsDone: [], plan: await computePlan(dayIndex, date), activeMs: 0, updatedAt: 0 };
    }
    const known = ALL_STEP_KEYS.includes(step);
    const stepsDone = !known || base.stepsDone.includes(step) ? base.stepsDone : [...base.stepsDone, step];
    const complete = requiredSteps(base.plan).every((s) => stepsDone.includes(s));
    const updated = touch<DailySession>({
      ...base,
      stepsDone,
      activeMs: base.activeMs + Math.max(0, activeMs),
      completedAt: base.completedAt ?? (complete ? Date.now() : undefined),
    });
    if (updated.completedAt === undefined) delete updated.completedAt;
    await db.sessions.put(updated);
    return updated;
  });
  notify();
  return next;
}

// ---------- attempts ----------

export async function saveAttempt(a: Omit<Attempt, 'id' | 'updatedAt' | 'createdAt'>): Promise<Attempt> {
  const now = Date.now();
  const attempt = touch<Attempt>({ ...a, id: newId(), createdAt: now, updatedAt: now });
  await db.attempts.add(attempt);
  notify();
  return attempt;
}

export async function listAttempts(refId?: string, limit?: number): Promise<Attempt[]> {
  let q = db.attempts
    .orderBy('createdAt')
    .reverse()
    .filter((a) => !a.deleted && (refId === undefined || a.refId === refId));
  if (limit !== undefined) q = q.limit(Math.max(0, limit));
  return q.toArray();
}

// ---------- user frames ----------

export async function saveUserFrame(f: SubstitutionFrame): Promise<UserFrame> {
  const record = touch<UserFrame>({ id: f.id, frame: f, updatedAt: 0 });
  await db.userFrames.put(record);
  notify();
  return record;
}

export async function listUserFrames(): Promise<SubstitutionFrame[]> {
  const rows = await db.userFrames.filter((u) => !u.deleted).toArray();
  return rows.map((u) => u.frame);
}

export async function deleteUserFrame(id: string): Promise<void> {
  const changed = await db.transaction('rw', db.userFrames, async () => {
    const row = await db.userFrames.get(id);
    if (!row || row.deleted) return false;
    await db.userFrames.put(touch<UserFrame>({ ...row, deleted: true }));
    return true;
  });
  if (changed) notify();
}

export async function getAllFrames(): Promise<SubstitutionFrame[]> {
  return [...SEED_FRAMES, ...(await listUserFrames())];
}

// ---------- library progress ----------

export interface CategoryProgress {
  total: number;
  introduced: number;
  mastered: number;
}

export interface LibraryProgress extends CategoryProgress {
  byCategory: Record<FunctionCategory, CategoryProgress>;
}

/**
 * How much of the seed library (seed frames + chunks) the learner has met. introduced = has a live card;
 * mastered = card interval >= 21 days. Frames without a category count in the totals only.
 */
export async function getLibraryProgress(): Promise<LibraryProgress> {
  const cards = await db.cards.filter((c) => !c.deleted && (c.kind === 'chunk' || c.kind === 'frame')).toArray();
  const byKey = new Map(cards.map((c) => [c.id, c]));

  const byCategory = Object.fromEntries(
    FUNCTION_CATEGORIES.map((c): [FunctionCategory, CategoryProgress] => [c, { total: 0, introduced: 0, mastered: 0 }]),
  ) as Record<FunctionCategory, CategoryProgress>;
  const out: LibraryProgress = { total: 0, introduced: 0, mastered: 0, byCategory };

  const count = (ref: ItemRef, category: FunctionCategory | undefined): void => {
    const card = byKey.get(itemKey(ref));
    const buckets = [out, ...(category && byCategory[category] ? [byCategory[category]] : [])];
    for (const b of buckets) {
      b.total++;
      if (card) {
        b.introduced++;
        if (card.interval >= MASTERED_INTERVAL_DAYS) b.mastered++;
      }
    }
  };
  for (const f of SEED_FRAMES) count({ kind: 'frame', id: f.id }, f.category);
  for (const c of CHUNKS) count({ kind: 'chunk', id: c.id }, c.category);
  return out;
}

// ---------- stats ----------

function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return todayStr(new Date(y, m - 1, d + delta));
}

export async function getStats(now: number = Date.now()): Promise<{
  streak: number;
  totalDays: number;
  totalReviews: number;
  cardsLearned: number;
  minutesLast7: number;
  heatmap: { date: string; minutes: number }[];
}> {
  const today = todayStr(new Date(now));
  const [sessions, totalReviews, cards] = await Promise.all([
    db.sessions.filter((s) => !s.deleted).toArray(),
    db.reviews.filter((r) => !r.deleted).count(),
    db.cards.filter((c) => !c.deleted && c.reps > 0).count(),
  ]);

  const completed = new Set(sessions.filter((s) => s.completedAt !== undefined).map((s) => s.date));
  // The streak survives until the end of today: if today is not done yet, count back from yesterday.
  let cursor = completed.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (completed.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  const msByDate = new Map<string, number>();
  for (const s of sessions) msByDate.set(s.date, (msByDate.get(s.date) ?? 0) + s.activeMs);
  const toMinutes = (ms: number): number => Math.round((ms / 60_000) * 10) / 10;

  const heatmap: { date: string; minutes: number }[] = [];
  for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    heatmap.push({ date, minutes: toMinutes(msByDate.get(date) ?? 0) });
  }
  const last7Ms = heatmap.slice(-7).reduce((sum, h) => sum + h.minutes, 0);

  return {
    streak,
    totalDays: completed.size,
    totalReviews,
    cardsLearned: cards,
    minutesLast7: Math.round(last7Ms * 10) / 10,
    heatmap,
  };
}

// ---------- v3: deliberate practice ----------

/** Applies `fn` to the profile inside one transaction (creating a default profile first). */
async function mutateProfile(fn: (p: Profile) => Partial<Profile>): Promise<Profile> {
  await getOrCreateProfile();
  const next = await db.transaction('rw', db.profile, async () => {
    const current = (await db.profile.get(PROFILE_ID)) as Profile;
    const merged = touch<Profile>({ ...current, ...fn(current), id: PROFILE_ID, deleted: false });
    await db.profile.put(merged);
    return merged;
  });
  notify();
  return next;
}

/**
 * Today's session keeps no stale plan when the goal or the ladder changes before the learner started: a session
 * without any finished step loses its plan, and getOrCreateSession rebuilds it on the next read.
 */
async function invalidateUnstartedPlan(date: string): Promise<void> {
  const changed = await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(date);
    if (!s || s.deleted || !s.plan || s.stepsDone.length > 0 || s.completedAt !== undefined) return false;
    const next = touch<DailySession>({ ...s });
    delete next.plan;
    await db.sessions.put(next);
    return true;
  });
  if (changed) notify();
}

/** Sets the measurable goal, creates the controller state if missing, and refreshes today's plan if not started. */
export async function setGoal(goal: Goal): Promise<Profile> {
  const profile = await mutateProfile((p) => ({
    goal,
    dailyMinutes: goal.dailyMinutes,
    adaptive: p.adaptive ?? defaultAdaptiveState(ladderOf(p)),
  }));
  await invalidateUnstartedPlan(todayStr());
  return profile;
}

const STATS_LOG_LIMIT = 1500;

async function loadMeasuredLogs(): Promise<ReviewLog[]> {
  const logs = await db.reviews.orderBy('reviewedAt').reverse().limit(STATS_LOG_LIMIT).toArray();
  return logs.filter((l) => !l.deleted);
}

/** Rolling per-skill statistics (last 40 measured answers per skill), category and sound error breakdowns. */
export async function getSkillStats(now: number = Date.now()): Promise<SkillStats> {
  return computeSkillStats(await loadMeasuredLogs(), now);
}

/** Items at the edge of the comfort zone (lapsed, mixed, or slow), most urgent first. */
export async function getEdgeItems(now: number = Date.now(), limit: number = MAX_EDGE_ITEMS): Promise<ItemRef[]> {
  const [cards, logs, profile] = await Promise.all([
    db.cards.filter((c) => !c.deleted && (c.kind === 'chunk' || c.kind === 'frame')).toArray(),
    loadRecentLogs(now),
    db.profile.get(PROFILE_ID),
  ]);
  return findEdgeItems(cards, logs, now, { limit, speakLevel: ladderOf(profile).speak });
}

const AVG_WINDOW_DAYS = 30;
const MAX_STEP_MS = 120_000; // answers slower than this are treated as the learner walking away
const NEW_FLOW_MODES: DrillMode[] = ['listen', 'shadow', 'recall'];

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Average seconds per review card and per newly learned item, from the last 30 days of logs (undefined if too few). */
function timeAverages(logs: ReviewLog[], now: number): { avgReviewSec?: number; avgNewSec?: number } {
  const recent = logs.filter((l) => l.reviewedAt >= now - AVG_WINDOW_DAYS * DAY_MS && l.durationMs > 0 && l.durationMs <= MAX_STEP_MS);
  const out: { avgReviewSec?: number; avgNewSec?: number } = {};
  const reviews = recent.filter((l) => l.mode === 'review' && (l.cardId.startsWith('chunk:') || l.cardId.startsWith('frame:')));
  if (reviews.length >= 5) out.avgReviewSec = mean(reviews.map((l) => l.durationMs)) / 1000;
  const perCard = new Map<string, number>();
  for (const l of recent) {
    if (!NEW_FLOW_MODES.includes(l.mode) || !(l.cardId.startsWith('chunk:') || l.cardId.startsWith('frame:'))) continue;
    perCard.set(l.cardId, (perCard.get(l.cardId) ?? 0) + l.durationMs);
  }
  if (perCard.size >= 3) out.avgNewSec = mean([...perCard.values()]) / 1000;
  return out;
}

/**
 * Runs the difficulty controller for a finished day (see lib/adaptive.ts) and saves the new ladder + history in
 * profile.adaptive (and profile.newPerDay). Returns the changes made now, for the UI's "明天的调整".
 * No goal -> nothing happens. Calling it twice in a day is harmless (the 2-day rule blocks repeated changes);
 * getDaySummaryV3 returns the day's changes again.
 */
export async function runAdaptation(today: string = todayStr(), now: number = Date.now()): Promise<AdaptiveChange[]> {
  const profile = await getOrCreateProfile();
  const goal = profile.goal;
  if (!goal) return [];
  const [logs, dueCount] = await Promise.all([
    loadMeasuredLogs(),
    db.cards
      .where('due')
      .belowOrEqual(now + DAY_MS)
      .filter((c) => !c.deleted && (c.kind === 'chunk' || c.kind === 'frame'))
      .count(),
  ]);
  const budget = splitBudget(goal.dailyMinutes);
  const state = profile.adaptive ?? defaultAdaptiveState(ladderOf(profile));
  const result = adjust(state, computeSkillStats(logs, now), today, {
    dueCount,
    ...timeAverages(logs, now),
    dailyMinutes: goal.dailyMinutes,
    fixedBlocksMin: budget.listening + budget.decode + budget.output,
  });
  if (result.changes.length > 0) {
    await mutateProfile(() => ({ adaptive: result.state, newPerDay: result.state.ladder.newPerDay }));
  }
  return result.changes;
}

const ASSESSMENT_LIMIT = 30;
const COACH_REPORT_LIMIT = 12;

/**
 * Appends a placement / checkpoint result (newest last, keeps 30). A placement also sets the starting ladder
 * (listen / speak levels; the controller then waits 2 days before moving them) and introduces its fast-tracked
 * chunks as already known (first review in 7 days).
 */
export async function saveAssessment(a: Assessment): Promise<Profile> {
  const profile = await mutateProfile((p) => {
    const assessments = [...(p.assessments ?? []).filter((x) => x.id !== a.id), a].slice(-ASSESSMENT_LIMIT);
    if (a.kind !== 'placement') return { assessments };
    const base: AdaptiveState = p.adaptive ?? defaultAdaptiveState(ladderOf(p));
    const adaptive: AdaptiveState = {
      ...base,
      ladder: { ...base.ladder, listen: a.listenLevel, speak: a.speakLevel },
      lastChange: { ...base.lastChange, listen: a.date, speak: a.date },
    };
    return { assessments, adaptive };
  });
  if (a.kind === 'placement') {
    await introduceKnown((a.fastTracked ?? []).map((id): ItemRef => ({ kind: 'chunk', id })), 7);
    await invalidateUnstartedPlan(todayStr());
  }
  return profile;
}

/** Appends an AI / rules coach report (newest last, keeps 12). */
export async function saveCoachReport(r: CoachReport): Promise<Profile> {
  return mutateProfile((p) => ({
    coachReports: [...(p.coachReports ?? []).filter((x) => x.id !== r.id), r].slice(-COACH_REPORT_LIMIT),
  }));
}


export interface GoalProgress {
  plan: GoalPlan;
  progress: ProgressReport;
  /** Chunks + frames the learner has met so far. */
  itemsLearned: number;
}

/**
 * The goal's phase plan and how the learner is doing against it (undefined without a goal). The starting point is
 * the latest placement result; items learned before the goal started (cards with a review log earlier than the
 * start date) count as the baseline, so the plan only expects the new items to come from newPerDay.
 */
export async function getGoalProgress(today: string = todayStr()): Promise<GoalProgress | undefined> {
  const profile = await getOrCreateProfile();
  const goal = profile.goal;
  if (!goal) return undefined;
  const [cards, before] = await Promise.all([
    db.cards.filter((c) => !c.deleted && (c.kind === 'chunk' || c.kind === 'frame')).toArray(),
    db.reviews
      .where('reviewedAt')
      .below(startOfDay(goal.startDate))
      .filter((l) => !l.deleted && (l.cardId.startsWith('chunk:') || l.cardId.startsWith('frame:')))
      .toArray(),
  ]);
  const placement = [...(profile.assessments ?? [])].reverse().find((a) => a.kind === 'placement');
  const baseline = new Set(before.map((l) => l.cardId)).size + (placement?.fastTracked?.length ?? 0);
  const lesson = await getTodayDayIndex(today);
  const ladder = ladderOf(profile);
  const plan = buildGoalPlan(goal, placement, ladder, ladder.newPerDay, lesson, { itemsLearned: baseline });
  const progress = progressStatus(plan, { lesson, itemsLearned: cards.length, ladder });
  return { plan, progress, itemsLearned: cards.length };
}

/** Everything the weekly coach report needs (aggregated statistics and library texts, no personal text). */
export async function getCoachInput(now: number = Date.now()): Promise<CoachInput> {
  const today = todayStr(new Date(now));
  const [profile, stats, edge, goal, lesson, itemsLearned] = await Promise.all([
    getOrCreateProfile(),
    getSkillStats(now),
    getEdgeItems(now),
    getGoalProgress(today),
    getTodayDayIndex(today),
    db.cards.filter((c) => !c.deleted && (c.kind === 'chunk' || c.kind === 'frame')).count(),
  ]);
  return buildCoachInput({
    lesson,
    stats,
    profile,
    ladder: ladderOf(profile),
    edge,
    itemsLearned,
    ...(goal ? { goal: { plan: goal.plan, progress: goal.progress } } : {}),
  });
}

export type AccuracyBand = 'none' | 'below' | 'in' | 'above';

export interface SkillDaySummary {
  n: number;
  correct: number;
  /** 0-1; 0 when n = 0. */
  acc: number;
  medianLatencyMs?: number;
  /** Where today's accuracy sits against the 70%-88% comfort-zone band ('none' with no answers). */
  band: AccuracyBand;
}

export interface MistakeEntry {
  cardId: string;
  kind: 'chunk' | 'frame' | 'sound' | 'dialogue' | 'numbers' | 'other';
  /** Present for chunk / frame cards. */
  ref?: ItemRef;
  count: number;
}

export interface DaySummaryV3 {
  date: string;
  skills: Record<Skill, SkillDaySummary>;
  band: { low: number; high: number };
  /** Items answered wrong today (correct === false, or a grade-0 log without measurement), most often first. */
  mistakes: MistakeEntry[];
  /** The difficulty changes the controller made on `date` (apply from the next lesson). */
  adjustments: AdaptiveChange[];
  ladder?: Ladder;
}

function bandOf(n: number, acc: number): AccuracyBand {
  if (n === 0) return 'none';
  return acc > BAND_HIGH ? 'above' : acc < BAND_LOW ? 'below' : 'in';
}

function mistakeKind(cardId: string): MistakeEntry['kind'] {
  const prefix = cardId.split(':', 1)[0];
  return prefix === 'chunk' || prefix === 'frame' || prefix === 'sound' || prefix === 'dialogue' || prefix === 'numbers'
    ? prefix
    : 'other';
}

/** Local-time start of 'YYYY-MM-DD'. */
function startOfDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** The v3 "今日反馈" data for `date`: per-skill accuracy vs the band, latency, today's mistakes, tomorrow's adjustments. */
export async function getDaySummaryV3(date: string): Promise<DaySummaryV3> {
  const from = startOfDay(date);
  const to = startOfDay(addDays(date, 1));
  const [logs, profile] = await Promise.all([
    db.reviews
      .where('reviewedAt')
      .between(from, to, true, false)
      .filter((l) => !l.deleted)
      .toArray(),
    db.profile.get(PROFILE_ID),
  ]);

  const skills = {} as Record<Skill, SkillDaySummary>;
  for (const skill of ['listen', 'speak', 'decode'] as const) {
    const rows = logs.filter((l) => l.skill === skill && typeof l.correct === 'boolean');
    const correct = rows.filter((l) => l.correct).length;
    const acc = rows.length === 0 ? 0 : correct / rows.length;
    const med = median(
      rows.filter((l) => l.correct && typeof l.latencyMs === 'number').map((l) => l.latencyMs as number),
    );
    skills[skill] = {
      n: rows.length,
      correct,
      acc,
      ...(med !== undefined ? { medianLatencyMs: med } : {}),
      band: bandOf(rows.length, acc),
    };
  }

  const counts = new Map<string, number>();
  for (const l of logs) {
    const wrong = l.correct === false || (l.correct === undefined && l.grade === 0);
    if (wrong) counts.set(l.cardId, (counts.get(l.cardId) ?? 0) + 1);
  }
  const mistakes: MistakeEntry[] = [...counts.entries()]
    .map(([cardId, count]): MistakeEntry => {
      const kind = mistakeKind(cardId);
      const entry: MistakeEntry = { cardId, kind, count };
      if (kind === 'chunk' || kind === 'frame') entry.ref = { kind, id: cardId.slice(kind.length + 1) };
      return entry;
    })
    .sort((a, b) => b.count - a.count || (a.cardId < b.cardId ? -1 : 1));

  return {
    date,
    skills,
    band: { low: BAND_LOW, high: BAND_HIGH },
    mistakes,
    adjustments: (profile?.adaptive?.history ?? []).filter((c) => c.date === date),
    ...(profile?.adaptive ? { ladder: profile.adaptive.ladder } : {}),
  };
}

// ---------- backup ----------

export async function exportData(): Promise<string> {
  const out: Record<string, unknown> = { version: EXPORT_VERSION, exportedAt: Date.now() };
  for (const name of SYNCED_TABLES) {
    out[name] = await db.table(name).toArray();
  }
  return JSON.stringify(out);
}

export async function importData(json: string): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('备份文件不是有效的 JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('备份文件格式不正确');
  }
  const data = parsed as Record<string, unknown>;
  if (data.version !== EXPORT_VERSION) {
    throw new Error(`不支持的备份版本：${String(data.version)}`);
  }

  const rows = new Map<SyncedTable, SyncedRecord[]>();
  for (const name of SYNCED_TABLES) {
    const value = data[name];
    if (value === undefined) continue;
    if (!Array.isArray(value)) throw new Error(`备份中的 ${name} 不是数组`);
    const list: SyncedRecord[] = [];
    for (const item of value) {
      if (typeof item !== 'object' || item === null || typeof (item as { id?: unknown }).id !== 'string') {
        throw new Error(`备份中的 ${name} 含有无效记录`);
      }
      list.push({ ...(item as SyncedRecord), _dirty: 1 });
    }
    rows.set(name, list);
  }

  await db.transaction('rw', SYNCED_TABLES.map((t) => db.table(t)), async () => {
    for (const [name, list] of rows) await db.table(name).bulkPut(list);
  });
  notify();
}
