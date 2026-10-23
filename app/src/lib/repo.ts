import type {
  Attempt,
  CardKind,
  CardState,
  DailySession,
  DayPlan,
  DrillMode,
  FunctionCategory,
  Grade,
  ItemRef,
  Profile,
  ReviewLog,
  StepKey,
  SubstitutionFrame,
  SyncedRecord,
  SyncedTable,
  UserFrame,
} from '../types';
import { CHUNKS, CURRICULUM, SEED_FRAMES } from '../content';
import { db, SYNCED_TABLES } from './db';
import { DEFAULT_NEW_PER_DAY, getDayPlan, itemKey, todayStr } from './plan';
import { FUNCTION_CATEGORIES } from './labels';
import { newCard, schedule } from './srs';

/** Dispatches a 'change' event after every local write (sync debounces on it). */
export const localChanges: EventTarget = new EventTarget();

const PROFILE_ID = 'profile';
const ALL_STEPS: StepKey[] = ['review', 'chunks', 'decode', 'output'];
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

export async function gradeCard(
  cardId: string,
  grade: Grade,
  mode: DrillMode,
  durationMs: number,
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
    });
    await db.cards.put(updated);
    await db.reviews.add(log);
    return updated;
  });
  notify();
  return next;
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

/**
 * Freezes today's plan: the introduced set is every live chunk/frame card, the curriculum is the seed
 * curriculum, newPerDay comes from the profile. Reads cards and profile, so callers' transactions must include them.
 */
async function computePlan(dayIndex: number): Promise<DayPlan> {
  const [cards, profile] = await Promise.all([
    db.cards.filter((c) => !c.deleted && (c.kind === 'chunk' || c.kind === 'frame')).toArray(),
    db.profile.get(PROFILE_ID),
  ]);
  return getDayPlan({
    dayIndex,
    introduced: new Set(cards.map((c) => itemKey({ kind: c.kind as ItemRef['kind'], id: c.refId }))),
    curriculum: CURRICULUM,
    newPerDay: profile?.newPerDay ?? DEFAULT_NEW_PER_DAY,
  });
}

/**
 * The session of `date`. A new session freezes its plan (see computePlan) so the plan never reshuffles
 * mid-day or across devices; an older session without a plan gets one on first read.
 */
export async function getOrCreateSession(date: string): Promise<DailySession> {
  await getOrCreateProfile();
  const { session, changed } = await db.transaction('rw', db.sessions, db.cards, db.profile, async () => {
    const existing = await db.sessions.get(date);
    if (existing && !existing.deleted) {
      if (existing.plan) return { session: existing, changed: false };
      const upgraded = touch<DailySession>({ ...existing, plan: await computePlan(existing.dayIndex) });
      await db.sessions.put(upgraded);
      return { session: upgraded, changed: true };
    }
    const dayIndex = await computeDayIndex(date);
    const fresh = touch<DailySession>({
      id: date,
      date,
      dayIndex,
      stepsDone: [],
      plan: await computePlan(dayIndex),
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
 * Records a finished step ('review' | 'chunks' | 'decode' | 'output'; anything else, e.g. a legacy v1 key, is
 * ignored but its time still counts). The day counts as completed (completedAt set) once all four are done.
 */
export async function markStepDone(date: string, step: StepKey, activeMs: number): Promise<DailySession> {
  await getOrCreateProfile();
  const next = await db.transaction('rw', db.sessions, db.cards, db.profile, async () => {
    const existing = await db.sessions.get(date);
    let base: DailySession;
    if (existing && !existing.deleted) {
      base = existing;
    } else {
      const dayIndex = await computeDayIndex(date);
      base = { id: date, date, dayIndex, stepsDone: [], plan: await computePlan(dayIndex), activeMs: 0, updatedAt: 0 };
    }
    const known = ALL_STEPS.includes(step);
    const stepsDone = !known || base.stepsDone.includes(step) ? base.stepsDone : [...base.stepsDone, step];
    const complete = ALL_STEPS.every((s) => stepsDone.includes(s));
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
