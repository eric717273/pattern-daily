import type {
  Attempt,
  CardKind,
  CardState,
  DailySession,
  DrillMode,
  Grade,
  Profile,
  ReviewLog,
  StepKey,
  SubstitutionFrame,
  SyncedRecord,
  SyncedTable,
  UserFrame,
} from '../types';
import { SEED_FRAMES } from '../content';
import { db, SYNCED_TABLES } from './db';
import { dayIndexFor, todayStr } from './plan';
import { newCard, schedule } from './srs';

/** Dispatches a 'change' event after every local write (sync debounces on it). */
export const localChanges: EventTarget = new EventTarget();

const PROFILE_ID = 'profile';
const ALL_STEPS: StepKey[] = ['warmup', 'deconstruct', 'frames', 'output'];
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

export async function getDueCards(now: number, limit: number): Promise<CardState[]> {
  if (limit <= 0) return [];
  return db.cards
    .where('due')
    .belowOrEqual(now)
    .filter((c) => !c.deleted)
    .limit(limit)
    .toArray();
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

async function loadOrCreateSession(date: string, startDate: string): Promise<DailySession> {
  return db.transaction('rw', db.sessions, async () => {
    const existing = await db.sessions.get(date);
    if (existing && !existing.deleted) return existing;
    const fresh = touch<DailySession>({
      id: date,
      date,
      dayIndex: dayIndexFor(startDate, date),
      stepsDone: [],
      activeMs: 0,
      updatedAt: 0,
    });
    await db.sessions.put(fresh);
    return fresh;
  });
}

export async function getOrCreateSession(date: string): Promise<DailySession> {
  const profile = await getOrCreateProfile();
  const before = await db.sessions.get(date);
  const session = await loadOrCreateSession(date, profile.startDate);
  if (!before || before.deleted) notify();
  return session;
}

/** Records a finished step. The day counts as completed (completedAt set) once all four steps are done. */
export async function markStepDone(date: string, step: StepKey, activeMs: number): Promise<DailySession> {
  const profile = await getOrCreateProfile();
  const next = await db.transaction('rw', db.sessions, async () => {
    const existing = await db.sessions.get(date);
    const base: DailySession =
      existing && !existing.deleted
        ? existing
        : { id: date, date, dayIndex: dayIndexFor(profile.startDate, date), stepsDone: [], activeMs: 0, updatedAt: 0 };
    const stepsDone = base.stepsDone.includes(step) ? base.stepsDone : [...base.stepsDone, step];
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
