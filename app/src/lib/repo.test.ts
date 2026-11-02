import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assessment, Chunk, CoachReport, Dialogue, Goal, ItemRef, SoundPattern, StepKey, SubstitutionFrame } from '../types';

vi.mock('../content', () => {
  const frame = (id: string): SubstitutionFrame => ({
    id,
    title: id,
    pattern: '{x}.',
    patternZh: '{x}。',
    slots: [{ key: 'x', labelZh: 'x', options: [{ en: 'a', zh: 'a' }] }],
    grammar: ['be-adj'],
    scene: 'daily',
    level: 1,
    examples: [],
    source: 'seed',
  });
  const chunk = (id: string, category: Chunk['category']): Chunk => ({
    id,
    en: id,
    zh: id,
    category,
    freq: 1,
    register: 'neutral',
    examples: [],
  });
  const chunkList = [
    chunk('c001', 'greeting'),
    chunk('c002', 'greeting'),
    chunk('c003', 'work'),
    chunk('c004', 'work'),
    chunk('c005', 'travel'),
    chunk('c006', 'travel'),
    chunk('c007', 'social'),
  ];
  const seedFrames = [
    { ...frame('f001'), category: 'work' as const, freq: 1 as const },
    { ...frame('f002'), category: 'travel' as const, freq: 2 as const },
  ];
  const dialogue = (id: string, tier: 1 | 2 | 3, scene: 'daily' | 'work'): Dialogue => ({
    id,
    title: id,
    scene,
    category: 'greeting',
    tier,
    turns: [],
    chunkIds: [],
    gist: { questionZh: '?', optionsZh: ['a', 'b', 'c'], answer: 0 },
    blanks: [],
  });
  const sound = (id: string, level: 1 | 2 | 3): SoundPattern => ({ id, name: id, kind: 'linking', level, explanationZh: 'x', examples: [] });
  return {
    DOZEN: [],
    SEED_FRAMES: [
      { ...frame('f001'), category: 'work', freq: 1 },
      { ...frame('f002'), category: 'travel', freq: 2 },
    ],
    CHUNKS: chunkList,
    CURRICULUM: [
      { kind: 'chunk', id: 'c001' },
      { kind: 'chunk', id: 'c002' },
      { kind: 'frame', id: 'f001' },
      { kind: 'chunk', id: 'c003' },
      { kind: 'frame', id: 'f002' },
      { kind: 'chunk', id: 'c004' },
      { kind: 'chunk', id: 'c005' },
      { kind: 'chunk', id: 'c006' },
      { kind: 'chunk', id: 'c007' },
    ] satisfies ItemRef[],
    getDozen: () => undefined,
    DIALOGUES: [
      dialogue('dl001', 1, 'daily'),
      dialogue('dl002', 1, 'work'),
      dialogue('dl003', 1, 'work'),
      dialogue('dl050', 2, 'work'),
    ],
    SOUNDS: [sound('s01', 1), sound('s02', 1), sound('s03', 2)],
    getChunk: (id: string) => chunkList.find((c) => c.id === id),
    getSeedFrame: (id: string) => seedFrames.find((f) => f.id === id),
    getSound: (id: string) => [sound('s01', 1), sound('s02', 1), sound('s03', 2)].find((x) => x.id === id),
    getDialogue: () => undefined,
  };
});

import { db } from './db';
import {
  deleteUserFrame,
  ensureCards,
  exportData,
  getAllFrames,
  getDueCards,
  getLibraryProgress,
  getOrCreateProfile,
  getOrCreateSession,
  getCoachInput,
  getDaySummaryV3,
  getEdgeItems,
  getGoalProgress,
  getSkillStats,
  getStats,
  getTodayDayIndex,
  gradeCard,
  importData,
  introduceItems,
  introduceKnown,
  introduceSound,
  listAttempts,
  listUserFrames,
  localChanges,
  logMeasurement,
  markStepDone,
  runAdaptation,
  saveAssessment,
  saveAttempt,
  saveCoachReport,
  saveUserFrame,
  setGoal,
  updateProfile,
} from './repo';

const DAY = 24 * 60 * 60 * 1000;
const ALL_STEPS: StepKey[] = ['review', 'chunks', 'decode', 'output'];

function userFrame(id: string): SubstitutionFrame {
  return {
    id,
    title: `user ${id}`,
    pattern: '{x}.',
    patternZh: '{x}。',
    slots: [{ key: 'x', labelZh: 'x', options: [{ en: 'a', zh: 'a' }] }],
    grammar: ['plural'],
    scene: 'work',
    level: 2,
    examples: [],
    source: 'user',
  };
}

function ymd(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function completeDay(date: string, activeMs = 0): Promise<void> {
  for (let i = 0; i < ALL_STEPS.length; i++) {
    await markStepDone(date, ALL_STEPS[i], i === 0 ? activeMs : 0);
  }
}

let changes = 0;
const onChange = (): void => {
  changes++;
};

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  changes = 0;
  localChanges.removeEventListener('change', onChange);
  localChanges.addEventListener('change', onChange);
});

describe('profile', () => {
  it('creates a default profile once', async () => {
    const p = await getOrCreateProfile();
    expect(p.id).toBe('profile');
    expect(p.dailyMinutes).toBe(15);
    expect(p.scenes).toEqual(['work', 'daily']);
    expect(p.newPerDay).toBe(5);
    expect(p.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p._dirty).toBe(1);
    expect(p.updatedAt).toBeGreaterThan(0);
    const again = await getOrCreateProfile();
    expect(again).toEqual(p);
    expect(await db.profile.count()).toBe(1);
  });

  it('updateProfile merges the patch, bumps updatedAt, stays dirty', async () => {
    const p = await getOrCreateProfile();
    await db.profile.update('profile', { _dirty: 0, updatedAt: 5 });
    const u = await updateProfile({ dailyMinutes: 25, startDate: '2026-01-01' });
    expect(u.dailyMinutes).toBe(25);
    expect(u.startDate).toBe('2026-01-01');
    expect(u.scenes).toEqual(p.scenes);
    expect(u._dirty).toBe(1);
    expect(u.updatedAt).toBeGreaterThan(5);
    expect(await db.profile.get('profile')).toEqual(u);
  });

  it('updateProfile creates the profile if missing and cannot change the id', async () => {
    const u = await updateProfile({ id: 'other', dailyMinutes: 10 });
    expect(u.id).toBe('profile');
    expect(await db.profile.count()).toBe(1);
  });
});

describe('cards', () => {
  it('ensureCards creates missing cards only, with kind:refId ids', async () => {
    await ensureCards('dozen', ['d01', 'd02']);
    const d01 = await db.cards.get('dozen:d01');
    expect(d01?.kind).toBe('dozen');
    expect(d01?.refId).toBe('d01');
    expect(d01?._dirty).toBe(1);
    expect(d01?.ease).toBe(2.5);

    await db.cards.update('dozen:d01', { reps: 3, interval: 9 });
    await ensureCards('dozen', ['d01', 'd02', 'd03']);
    expect(await db.cards.count()).toBe(3);
    expect((await db.cards.get('dozen:d01'))?.reps).toBe(3); // untouched

    await ensureCards('frame', ['f001']);
    expect(await db.cards.get('frame:f001')).toBeDefined();
  });

  it('ensureCards tolerates duplicates and empty input', async () => {
    await ensureCards('frame', ['f001', 'f001']);
    await ensureCards('frame', []);
    expect(await db.cards.count()).toBe(1);
  });

  it('getDueCards returns due cards ordered by due, honours limit, skips deleted', async () => {
    const now = 1_000_000_000_000;
    await ensureCards('dozen', ['a', 'b', 'c', 'd']);
    await db.cards.update('dozen:a', { due: now - 3000 });
    await db.cards.update('dozen:b', { due: now - 1000 });
    await db.cards.update('dozen:c', { due: now + DAY });
    await db.cards.update('dozen:d', { due: now - 2000, deleted: true });

    const due = await getDueCards(now, 10);
    expect(due.map((c) => c.id)).toEqual(['dozen:a', 'dozen:b']);
    expect((await getDueCards(now, 1)).map((c) => c.id)).toEqual(['dozen:a']);
    expect(await getDueCards(now, 0)).toEqual([]);
    expect((await getDueCards(now + 2 * DAY, 10)).map((c) => c.id)).toContain('dozen:c');
  });

  it('gradeCard schedules the card and logs the review', async () => {
    await ensureCards('dozen', ['d01']);
    await db.cards.update('dozen:d01', { _dirty: 0, updatedAt: 1 });
    const before = Date.now();
    const card = await gradeCard('dozen:d01', 2, 'review', 4200);
    expect(card.reps).toBe(1);
    expect(card.interval).toBe(1);
    expect(card.due).toBeGreaterThanOrEqual(before + DAY);
    expect(card._dirty).toBe(1);
    expect(card.updatedAt).toBeGreaterThanOrEqual(before);
    expect(await db.cards.get('dozen:d01')).toEqual(card);

    const logs = await db.reviews.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ cardId: 'dozen:d01', grade: 2, mode: 'review', durationMs: 4200, _dirty: 1 });
    expect(logs[0].id).toBeTruthy();
    expect(logs[0].reviewedAt).toBeGreaterThanOrEqual(before);
  });

  it('gradeCard forgetting makes the card due again within minutes', async () => {
    await ensureCards('frame', ['f001']);
    await gradeCard('frame:f001', 2, 'review', 1);
    const lapsed = await gradeCard('frame:f001', 0, 'review', 1);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.reps).toBe(0);
    expect(lapsed.due - Date.now()).toBeLessThanOrEqual(10 * 60 * 1000);
    expect(await db.reviews.count()).toBe(2);
  });

  it('gradeCard rejects for an unknown card', async () => {
    await expect(gradeCard('dozen:nope', 2, 'review', 1)).rejects.toThrow();
    expect(await db.reviews.count()).toBe(0);
  });
});

describe('sessions', () => {
  it('getOrCreateSession starts at lesson 1 and ignores the calendar start date', async () => {
    await updateProfile({ startDate: '2026-03-01' });
    const s = await getOrCreateSession('2026-03-05');
    expect(s.id).toBe('2026-03-05');
    expect(s.date).toBe('2026-03-05');
    expect(s.dayIndex).toBe(1);
    expect(s.stepsDone).toEqual([]);
    expect(s.activeMs).toBe(0);
    expect(s.completedAt).toBeUndefined();
    expect(s._dirty).toBe(1);
    expect(await getOrCreateSession('2026-03-05')).toEqual(s);
    expect(await db.sessions.count()).toBe(1);
  });

  it('markStepDone accumulates steps and time, and completes after all four', async () => {
    await updateProfile({ startDate: '2026-03-01' });
    let s = await markStepDone('2026-03-02', 'review', 60_000);
    expect(s.stepsDone).toEqual(['review']);
    expect(s.activeMs).toBe(60_000);
    expect(s.completedAt).toBeUndefined();
    expect(s.dayIndex).toBe(1);

    s = await markStepDone('2026-03-02', 'review', 10_000); // same step again: not duplicated
    expect(s.stepsDone).toEqual(['review']);
    expect(s.activeMs).toBe(70_000);

    await markStepDone('2026-03-02', 'chunks', 100);
    await markStepDone('2026-03-02', 'decode', 100);
    s = await markStepDone('2026-03-02', 'output', 100);
    expect(s.stepsDone).toHaveLength(4);
    expect(s.completedAt).toBeGreaterThan(0);
    const completedAt = s.completedAt;

    s = await markStepDone('2026-03-02', 'output', 100);
    expect(s.completedAt).toBe(completedAt);
    expect(await db.sessions.count()).toBe(1);
  });

  it('lesson number advances by completed lessons, not calendar days', async () => {
    expect(await getTodayDayIndex('2026-05-01')).toBe(1);
    await completeDay('2026-05-01');
    expect(await getTodayDayIndex('2026-05-02')).toBe(2);
    // two missed days: the next lesson is still lesson 2
    expect(await getTodayDayIndex('2026-05-05')).toBe(2);
    const s = await getOrCreateSession('2026-05-05');
    expect(s.dayIndex).toBe(2);
    // an unfinished session does not count
    expect(await getTodayDayIndex('2026-05-06')).toBe(2);
    await completeDay('2026-05-05');
    expect(await getTodayDayIndex('2026-05-06')).toBe(3);
  });

  it('getTodayDayIndex returns the stored index of an existing session (even after it is completed)', async () => {
    await completeDay('2026-05-01');
    const s = await getOrCreateSession('2026-05-02');
    expect(s.dayIndex).toBe(2);
    await completeDay('2026-05-02');
    expect(await getTodayDayIndex('2026-05-02')).toBe(2);
    expect(await getTodayDayIndex('2026-05-01')).toBe(1);
  });

  it('only completed sessions before the date count; deleted and later ones do not', async () => {
    await completeDay('2026-06-01');
    await completeDay('2026-06-05'); // later than the queried date
    await markStepDone('2026-06-02', 'review', 1); // started, not finished
    await db.sessions.update('2026-06-01', { deleted: true });
    expect(await getTodayDayIndex('2026-06-04')).toBe(1);
  });

  it('markStepDone on a new session uses the completed-lessons rule', async () => {
    await completeDay('2026-07-01');
    const s = await markStepDone('2026-07-09', 'review', 10);
    expect(s.dayIndex).toBe(2);
  });

  it('markStepDone creates the session when missing', async () => {
    const s = await markStepDone('2026-04-01', 'decode', 500);
    expect(s.stepsDone).toEqual(['decode']);
    expect(await db.sessions.get('2026-04-01')).toEqual(s);
  });
});

describe('frozen plan', () => {
  it('a new session freezes the plan from the curriculum, the introduced cards and newPerDay', async () => {
    const s = await getOrCreateSession('2026-08-01');
    expect(s.plan).toBeDefined();
    expect(s.plan?.dayIndex).toBe(1);
    expect(s.plan?.decode).toEqual({ phase: 'foundation', dozenId: 'd01' });
    expect(s.plan?.outputCount).toBe(3);
    // default newPerDay 5, nothing introduced yet: the first five curriculum items
    expect(s.plan?.newItems.map((r) => `${r.kind}:${r.id}`)).toEqual([
      'chunk:c001',
      'chunk:c002',
      'frame:f001',
      'chunk:c003',
      'frame:f002',
    ]);
    expect((await db.sessions.get('2026-08-01'))?.plan).toEqual(s.plan);
  });

  it('skips introduced items and honours profile.newPerDay (clamped)', async () => {
    await updateProfile({ newPerDay: 3 });
    await introduceItems([
      { kind: 'chunk', id: 'c001' },
      { kind: 'frame', id: 'f001' },
    ]);
    // dozen cards and deleted cards do not count as introduced
    await ensureCards('dozen', ['d01']);
    await ensureCards('chunk', ['c002']);
    await db.cards.update('chunk:c002', { deleted: true });
    const s = await getOrCreateSession('2026-08-02');
    expect(s.plan?.newItems.map((r) => r.id)).toEqual(['c002', 'c003', 'f002']);
  });

  it('is frozen: later progress or profile changes do not reshuffle the day', async () => {
    const first = await getOrCreateSession('2026-08-03');
    await introduceItems(first.plan?.newItems ?? []);
    await updateProfile({ newPerDay: 10 });
    const again = await getOrCreateSession('2026-08-03');
    expect(again.plan).toEqual(first.plan);
    const tomorrow = await getOrCreateSession('2026-08-04');
    expect(tomorrow.plan?.newItems.map((r) => r.id)).toEqual(['c004', 'c005', 'c006', 'c007']);
  });

  it('markStepDone creating a session also freezes a plan', async () => {
    const s = await markStepDone('2026-08-05', 'review', 1);
    expect(s.plan?.newItems).toHaveLength(5);
  });

  it('a v1 session without a plan gets one on first read, marked dirty', async () => {
    await getOrCreateProfile();
    await db.sessions.put({
      id: '2026-01-10',
      date: '2026-01-10',
      dayIndex: 15,
      stepsDone: [],
      activeMs: 0,
      updatedAt: 5,
      _dirty: 0,
    });
    changes = 0;
    const s = await getOrCreateSession('2026-01-10');
    expect(s.plan?.dayIndex).toBe(15);
    expect(s.plan?.decode).toMatchObject({ phase: 'maintenance', dozenId: 'd02', mode: 'label' });
    expect(s._dirty).toBe(1);
    expect(s.updatedAt).toBeGreaterThan(5);
    expect(changes).toBe(1);
    const stored = await db.sessions.get('2026-01-10');
    expect(stored?.plan).toEqual(s.plan);
    changes = 0;
    await getOrCreateSession('2026-01-10');
    expect(changes).toBe(0);
  });

  it('ignores legacy step keys: they never complete a day', async () => {
    const legacy = ['warmup', 'deconstruct', 'frames', 'output'] as unknown as StepKey[];
    let s = await getOrCreateSession('2026-08-06');
    for (const k of legacy) s = await markStepDone('2026-08-06', k, 10);
    expect(s.stepsDone).toEqual(['output']);
    expect(s.completedAt).toBeUndefined();
    expect(s.activeMs).toBe(40);
    for (const k of ['review', 'chunks', 'decode'] as StepKey[]) s = await markStepDone('2026-08-06', k, 0);
    expect(s.completedAt).toBeGreaterThan(0);
  });
});

describe('introduceItems', () => {
  it('creates chunk and frame cards, once', async () => {
    await introduceItems([
      { kind: 'chunk', id: 'c001' },
      { kind: 'frame', id: 'f001' },
      { kind: 'chunk', id: 'c001' },
    ]);
    expect((await db.cards.get('chunk:c001'))?.kind).toBe('chunk');
    expect((await db.cards.get('frame:f001'))?.kind).toBe('frame');
    await db.cards.update('chunk:c001', { reps: 2 });
    await introduceItems([{ kind: 'chunk', id: 'c001' }]);
    expect((await db.cards.get('chunk:c001'))?.reps).toBe(2);
    expect(await db.cards.count()).toBe(2);
    await expect(introduceItems([])).resolves.toBeUndefined();
  });
});

describe('getDueCards kinds filter', () => {
  it('restricts to the requested kinds', async () => {
    const now = 1_000_000_000_000;
    await ensureCards('chunk', ['c001']);
    await ensureCards('frame', ['f001']);
    await ensureCards('dozen', ['d01']);
    for (const id of ['chunk:c001', 'frame:f001', 'dozen:d01']) await db.cards.update(id, { due: now - 1 });
    expect((await getDueCards(now, 10)).map((c) => c.kind).sort()).toEqual(['chunk', 'dozen', 'frame']);
    expect((await getDueCards(now, 10, ['chunk', 'frame'])).map((c) => c.kind).sort()).toEqual(['chunk', 'frame']);
    expect((await getDueCards(now, 10, ['dozen'])).map((c) => c.id)).toEqual(['dozen:d01']);
    expect(await getDueCards(now, 10, [])).toEqual([]);
    expect(await getDueCards(now, 1, ['chunk', 'frame'])).toHaveLength(1);
  });
});

describe('getLibraryProgress', () => {
  it('counts totals over seed frames + chunks, introduced cards and mastered (interval >= 21)', async () => {
    let p = await getLibraryProgress();
    expect(p).toMatchObject({ total: 9, introduced: 0, mastered: 0 });
    expect(p.byCategory.work).toEqual({ total: 3, introduced: 0, mastered: 0 }); // f001 + c003 + c004
    expect(p.byCategory.greeting.total).toBe(2);
    expect(p.byCategory.advice).toEqual({ total: 0, introduced: 0, mastered: 0 });

    await introduceItems([
      { kind: 'chunk', id: 'c001' },
      { kind: 'chunk', id: 'c003' },
      { kind: 'frame', id: 'f001' },
      { kind: 'chunk', id: 'c005' },
    ]);
    await db.cards.update('chunk:c003', { interval: 21 });
    await db.cards.update('frame:f001', { interval: 20 });
    await db.cards.update('chunk:c005', { interval: 60, deleted: true }); // deleted cards do not count
    await ensureCards('dozen', ['d01']); // other kinds do not count
    await ensureCards('frame', ['u-user']); // cards for non-library items do not count
    p = await getLibraryProgress();
    expect(p).toMatchObject({ total: 9, introduced: 3, mastered: 1 });
    expect(p.byCategory.work).toEqual({ total: 3, introduced: 2, mastered: 1 });
    expect(p.byCategory.greeting).toEqual({ total: 2, introduced: 1, mastered: 0 });
    expect(p.byCategory.travel).toEqual({ total: 3, introduced: 0, mastered: 0 });
  });
});

describe('attempts', () => {
  it('saves and lists newest first, filtered by refId, with limit', async () => {
    // Only fake Date: fake-indexeddb relies on real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(1_000);
      const a = await saveAttempt({ refKind: 'dozen', refId: 'd01', userEn: 'one', promptZh: '一' });
      vi.setSystemTime(2_000);
      await saveAttempt({ refKind: 'frame', refId: 'f001', userEn: 'two' });
      vi.setSystemTime(3_000);
      await saveAttempt({ refKind: 'dozen', refId: 'd01', userEn: 'three' });

      expect(a.id).toBeTruthy();
      expect(a.createdAt).toBe(1_000);
      expect(a.updatedAt).toBe(1_000);
      expect(a._dirty).toBe(1);

      expect((await listAttempts()).map((x) => x.userEn)).toEqual(['three', 'two', 'one']);
      expect((await listAttempts('d01')).map((x) => x.userEn)).toEqual(['three', 'one']);
      expect((await listAttempts(undefined, 2)).map((x) => x.userEn)).toEqual(['three', 'two']);
      expect((await listAttempts('d01', 1)).map((x) => x.userEn)).toEqual(['three']);
      expect(await listAttempts('zzz')).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps AI feedback', async () => {
    const feedback = { score: 90, correct: true, corrected: 'ok', explanationZh: '好', alternatives: [] };
    const a = await saveAttempt({ refKind: 'frame', refId: 'f001', userEn: 'x', feedback });
    expect((await db.attempts.get(a.id))?.feedback).toEqual(feedback);
  });

  it('hides soft-deleted attempts', async () => {
    const a = await saveAttempt({ refKind: 'frame', refId: 'f001', userEn: 'x' });
    await db.attempts.update(a.id, { deleted: true });
    expect(await listAttempts()).toEqual([]);
  });
});

describe('user frames', () => {
  it('saves, lists and soft-deletes', async () => {
    const rec = await saveUserFrame(userFrame('u-1'));
    expect(rec.id).toBe('u-1');
    expect(rec._dirty).toBe(1);
    expect(rec.deleted).toBeFalsy();
    expect((await listUserFrames()).map((f) => f.id)).toEqual(['u-1']);

    await db.userFrames.update('u-1', { _dirty: 0, updatedAt: 1 });
    await deleteUserFrame('u-1');
    expect(await listUserFrames()).toEqual([]);
    const raw = await db.userFrames.get('u-1');
    expect(raw?.deleted).toBe(true);
    expect(raw?._dirty).toBe(1);
    expect(raw?.updatedAt).toBeGreaterThan(1);
  });

  it('saving again overwrites and revives', async () => {
    await saveUserFrame(userFrame('u-1'));
    await deleteUserFrame('u-1');
    await saveUserFrame({ ...userFrame('u-1'), title: 'renamed' });
    const list = await listUserFrames();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('renamed');
    expect((await db.userFrames.get('u-1'))?.deleted).toBeFalsy();
  });

  it('deleting an unknown id is a no-op', async () => {
    await expect(deleteUserFrame('u-none')).resolves.toBeUndefined();
    expect(changes).toBe(0);
  });

  it('getAllFrames = seed frames + live user frames', async () => {
    await saveUserFrame(userFrame('u-1'));
    await saveUserFrame(userFrame('u-2'));
    await deleteUserFrame('u-2');
    expect((await getAllFrames()).map((f) => f.id)).toEqual(['f001', 'f002', 'u-1']);
  });
});

describe('change events', () => {
  it('fire after local writes, not after reads', async () => {
    await getOrCreateProfile();
    expect(changes).toBe(1);
    await getOrCreateProfile(); // read only
    expect(changes).toBe(1);
    await updateProfile({ dailyMinutes: 20 });
    expect(changes).toBe(2);
    await ensureCards('dozen', ['d01']);
    expect(changes).toBe(3);
    await ensureCards('dozen', ['d01']); // nothing new
    expect(changes).toBe(3);
    await gradeCard('dozen:d01', 2, 'review', 1);
    expect(changes).toBe(4);
    await saveAttempt({ refKind: 'dozen', refId: 'd01', userEn: 'x' });
    expect(changes).toBe(5);
    await getDueCards(Date.now(), 5);
    await listAttempts();
    await getStats();
    expect(changes).toBe(5);
  });
});

describe('getStats', () => {
  // Noon on a fixed local day, so DST/offset can never push the date.
  const NOW = new Date(2026, 5, 15, 12, 0, 0).getTime();
  const day = (offset: number): string => ymd(new Date(2026, 5, 15 + offset, 12));

  it('is all zero on an empty database, with an 84-day heatmap ending today', async () => {
    const s = await getStats(NOW);
    expect(s).toMatchObject({ streak: 0, totalDays: 0, totalReviews: 0, cardsLearned: 0, minutesLast7: 0 });
    expect(s.heatmap).toHaveLength(84);
    expect(s.heatmap[83].date).toBe('2026-06-15');
    expect(s.heatmap[0].date).toBe(day(-83));
    expect(s.heatmap.every((h) => h.minutes === 0)).toBe(true);
  });

  it('counts consecutive completed days ending today', async () => {
    await completeDay(day(0));
    await completeDay(day(-1));
    await completeDay(day(-2));
    await completeDay(day(-4)); // gap
    const s = await getStats(NOW);
    expect(s.streak).toBe(3);
    expect(s.totalDays).toBe(4);
  });

  it('keeps the streak alive when today is not done yet (counts from yesterday)', async () => {
    await completeDay(day(-1));
    await completeDay(day(-2));
    expect((await getStats(NOW)).streak).toBe(2);
  });

  it('is 0 if the last completed day was before yesterday', async () => {
    await completeDay(day(-2));
    await completeDay(day(-3));
    expect((await getStats(NOW)).streak).toBe(0);
  });

  it('ignores sessions that were started but not completed', async () => {
    await completeDay(day(-1));
    await markStepDone(day(0), 'review', 1000);
    const s = await getStats(NOW);
    expect(s.streak).toBe(1);
    expect(s.totalDays).toBe(1);
  });

  it('streak crosses month and year boundaries', async () => {
    const jan2 = new Date(2027, 0, 2, 12).getTime();
    await completeDay('2027-01-02');
    await completeDay('2027-01-01');
    await completeDay('2026-12-31');
    await completeDay('2026-12-30');
    expect((await getStats(jan2)).streak).toBe(4);
  });

  it('builds the heatmap and 7-day minutes from activeMs', async () => {
    await completeDay(day(0), 15 * 60_000);
    await completeDay(day(-3), 10 * 60_000);
    await completeDay(day(-6), 5 * 60_000);
    await completeDay(day(-7), 20 * 60_000); // outside the 7-day window
    const s = await getStats(NOW);
    const at = (d: string): number => s.heatmap.find((h) => h.date === d)?.minutes ?? -1;
    expect(at(day(0))).toBe(15);
    expect(at(day(-3))).toBe(10);
    expect(at(day(-7))).toBe(20);
    expect(at(day(-1))).toBe(0);
    expect(s.minutesLast7).toBe(30);
  });

  it('counts reviews and learned cards, ignoring deleted rows', async () => {
    await ensureCards('dozen', ['a', 'b', 'c']);
    await gradeCard('dozen:a', 2, 'review', 1);
    await gradeCard('dozen:b', 0, 'review', 1); // lapse keeps reps=0 -> not learned
    await gradeCard('dozen:a', 3, 'review', 1);
    const s = await getStats();
    expect(s.totalReviews).toBe(3);
    expect(s.cardsLearned).toBe(1);

    await db.cards.update('dozen:a', { deleted: true });
    expect((await getStats()).cardsLearned).toBe(0);
  });
});

describe('export / import', () => {
  it('exports every synced table plus a version', async () => {
    await getOrCreateProfile();
    await ensureCards('dozen', ['d01']);
    await gradeCard('dozen:d01', 2, 'review', 5);
    await saveAttempt({ refKind: 'dozen', refId: 'd01', userEn: 'hi' });
    await markStepDone('2026-03-01', 'review', 5);
    await saveUserFrame(userFrame('u-1'));

    const data = JSON.parse(await exportData()) as Record<string, unknown>;
    expect(data.version).toBe(1);
    for (const t of ['cards', 'reviews', 'attempts', 'sessions', 'userFrames', 'profile']) {
      expect(Array.isArray(data[t])).toBe(true);
    }
    expect((data.cards as unknown[]).length).toBe(1);
    expect((data.reviews as unknown[]).length).toBe(1);
    expect((data.userFrames as unknown[]).length).toBe(1);
    expect(data.meta).toBeUndefined();
  });

  it('round-trips and marks imported rows dirty', async () => {
    await getOrCreateProfile();
    await ensureCards('frame', ['f001', 'f002']);
    await gradeCard('frame:f001', 3, 'multi-swap', 700);
    await saveAttempt({ refKind: 'frame', refId: 'f001', userEn: 'hello' });
    await markStepDone('2026-03-01', 'output', 5);
    await saveUserFrame(userFrame('u-1'));
    await deleteUserFrame('u-1'); // tombstones are exported too
    const json = await exportData();
    const snapshot = {
      cards: await db.cards.toArray(),
      reviews: await db.reviews.toArray(),
      attempts: await db.attempts.toArray(),
      sessions: await db.sessions.toArray(),
      userFrames: await db.userFrames.toArray(),
      profile: await db.profile.toArray(),
    };

    await Promise.all(db.tables.map((t) => t.clear()));
    await db.cards.add({ ...snapshot.cards[0], id: 'dozen:stale', refId: 'stale', kind: 'dozen' });
    await importData(json);

    const strip = <T extends { _dirty?: 0 | 1 }>(rows: T[]): Omit<T, '_dirty'>[] =>
      rows.map(({ _dirty: _ignored, ...rest }) => rest);
    for (const name of ['cards', 'reviews', 'attempts', 'sessions', 'userFrames', 'profile'] as const) {
      const now = await db.table(name).toArray();
      const expected = snapshot[name];
      const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);
      const got = now.filter((r: { id: string }) => r.id !== 'dozen:stale');
      expect(strip([...got].sort(byId))).toEqual(strip([...expected].sort(byId)));
      expect(got.every((r: { _dirty?: number }) => r._dirty === 1)).toBe(true);
    }
    // import merges via put; it does not wipe unrelated rows
    expect(await db.cards.get('dozen:stale')).toBeDefined();
    // soft-deleted rows stay deleted
    expect(await listUserFrames()).toEqual([]);
  });

  it('importData dispatches a change event', async () => {
    const json = await exportData();
    changes = 0;
    await importData(json);
    expect(changes).toBe(1);
  });

  it('rejects invalid backups without touching data', async () => {
    await ensureCards('dozen', ['d01']);
    await expect(importData('not json')).rejects.toThrow();
    await expect(importData('[]')).rejects.toThrow();
    await expect(importData(JSON.stringify({ cards: [] }))).rejects.toThrow(); // no version
    await expect(importData(JSON.stringify({ version: 99 }))).rejects.toThrow();
    await expect(importData(JSON.stringify({ version: 1, cards: 'x' }))).rejects.toThrow();
    await expect(importData(JSON.stringify({ version: 1, cards: [{ nope: 1 }] }))).rejects.toThrow();
    expect(await db.cards.count()).toBe(1);
  });

  it('accepts a backup with only some tables', async () => {
    await importData(
      JSON.stringify({
        version: 1,
        cards: [
          { id: 'dozen:d09', kind: 'dozen', refId: 'd09', due: 0, interval: 0, ease: 2.5, reps: 0, lapses: 0, updatedAt: 1 },
        ],
      }),
    );
    expect((await db.cards.get('dozen:d09'))?._dirty).toBe(1);
  });
});

// ---------- v3: deliberate practice ----------

function makeGoal(over: Partial<Goal> = {}): Goal {
  return { focus: 'speaking-listening', horizonDays: 30, dailyMinutes: 20, startDate: ymd(new Date()), startLesson: 1, ...over };
}

function placementOf(over: Partial<Assessment> = {}): Assessment {
  return {
    id: 'placement-1',
    date: '2026-05-01',
    kind: 'placement',
    listenLevel: 4,
    listenAcc: 0.8,
    speakLevel: 3,
    speakAcc: 0.8,
    bandAcc: { 1: 1 },
    levelZh: '进阶',
    ...over,
  };
}

async function measured(n: number, over: Partial<Parameters<typeof logMeasurement>[0]> = {}, correct = true): Promise<void> {
  for (let i = 0; i < n; i++) {
    await logMeasurement({ cardId: 'dialogue:dl001', skill: 'listen', correct, mode: 'dialogue', durationMs: 1000, ...over });
  }
}

describe('gradeCard measurement', () => {
  it('stores optional measurement fields on the ReviewLog', async () => {
    await ensureCards('chunk', ['c001']);
    await gradeCard('chunk:c001', 2, 'recall', 3000, { skill: 'speak', correct: true, latencyMs: 2100, level: 3 });
    const log = (await db.reviews.toArray())[0];
    expect(log).toMatchObject({ cardId: 'chunk:c001', grade: 2, mode: 'recall', skill: 'speak', correct: true, latencyMs: 2100, level: 3 });
  });

  it('is backward compatible: without measurement the log has no measurement keys', async () => {
    await ensureCards('chunk', ['c001']);
    await gradeCard('chunk:c001', 2, 'review', 3000);
    const log = (await db.reviews.toArray())[0];
    for (const k of ['skill', 'correct', 'latencyMs', 'level']) expect(k in log).toBe(false);
  });

  it('skips undefined measurement fields', async () => {
    await ensureCards('chunk', ['c001']);
    await gradeCard('chunk:c001', 0, 'review', 1000, { skill: 'listen', correct: false, latencyMs: undefined });
    const log = (await db.reviews.toArray())[0];
    expect(log.skill).toBe('listen');
    expect('latencyMs' in log).toBe(false);
  });
});

describe('logMeasurement', () => {
  it('writes a dirty log with default grade 2 / 0 and never touches SRS state', async () => {
    const a = await logMeasurement({ cardId: 'numbers:price', skill: 'listen', correct: true, mode: 'numbers', durationMs: 4000, latencyMs: 1500, level: 3 });
    const b = await logMeasurement({ cardId: 'dialogue:dl001', skill: 'listen', correct: false, mode: 'dialogue', durationMs: 5000 });
    expect(a).toMatchObject({ cardId: 'numbers:price', grade: 2, skill: 'listen', correct: true, latencyMs: 1500, level: 3, mode: 'numbers', _dirty: 1 });
    expect(b.grade).toBe(0);
    expect('latencyMs' in b).toBe(false);
    expect(await db.cards.count()).toBe(0);
    expect(await db.reviews.count()).toBe(2);
  });

  it('an explicit grade wins and a real card keeps its schedule', async () => {
    await ensureCards('chunk', ['c001']);
    const before = await db.cards.get('chunk:c001');
    const log = await logMeasurement({ cardId: 'chunk:c001', skill: 'speak', correct: true, mode: 'recall', durationMs: 900, grade: 3 });
    expect(log.grade).toBe(3);
    expect(await db.cards.get('chunk:c001')).toEqual(before);
  });

  it('notifies listeners', async () => {
    await logMeasurement({ cardId: 'numbers:time', skill: 'listen', correct: true, mode: 'numbers', durationMs: 1 });
    expect(changes).toBeGreaterThan(0);
  });
});

describe('introduceSound / introduceKnown', () => {
  it('introduceSound creates a due sound card once', async () => {
    await introduceSound('s01');
    await introduceSound('s01');
    const c = await db.cards.get('sound:s01');
    expect(c).toMatchObject({ kind: 'sound', refId: 's01', reps: 0 });
    expect(await db.cards.count()).toBe(1);
  });

  it('introduceKnown makes already-known cards with a 7-day first interval, leaving existing cards alone', async () => {
    await ensureCards('chunk', ['c002']);
    await db.cards.update('chunk:c002', { reps: 5, interval: 20 });
    const before = Date.now();
    await introduceKnown([{ kind: 'chunk', id: 'c001' }, { kind: 'chunk', id: 'c002' }, { kind: 'chunk', id: 'c001' }]);
    const c1 = await db.cards.get('chunk:c001');
    expect(c1).toMatchObject({ reps: 1, interval: 7, _dirty: 1 });
    expect(c1?.due).toBeGreaterThanOrEqual(before + 7 * DAY);
    expect(c1?.due).toBeLessThan(Date.now() + 7 * DAY + 1000);
    expect(await db.cards.get('chunk:c002')).toMatchObject({ reps: 5, interval: 20 });
    expect((await getDueCards(Date.now() + DAY, 10)).map((c) => c.id)).toEqual(['chunk:c002']); // c001 is not due until day 7
  });
});

describe('v2 plan without a goal is unchanged', () => {
  it('has 4 steps and no v3 fields', async () => {
    const date = '2026-03-01';
    const s = await getOrCreateSession(date);
    expect(s.plan?.listening).toBeUndefined();
    expect(s.plan?.ladder).toBeUndefined();
    expect(s.plan?.budgetMin).toBeUndefined();
    expect(s.plan?.edge).toBeUndefined();
    expect(s.plan?.newItems).toHaveLength(5);
    for (const step of ALL_STEPS.slice(0, 3)) expect((await markStepDone(date, step, 0)).completedAt).toBeUndefined();
    expect((await markStepDone(date, 'output', 0)).completedAt).toBeDefined();
  });
});

describe('v3 session plan', () => {
  it('builds the v3 plan when the profile has a goal', async () => {
    await setGoal(makeGoal({ dailyMinutes: 20 }));
    const s = await getOrCreateSession('2026-03-02');
    const plan = s.plan;
    expect(plan?.ladder).toEqual({ listen: 1, speak: 1, newPerDay: 5 });
    expect(plan?.budgetMin).toEqual({ review: 5, chunks: 5, listening: 5, decode: 2, output: 3 });
    expect(plan?.newItems).toHaveLength(5);
    // L1 -> tier 1 dialogues; 5 listening minutes -> 1 dialogue; default scenes work+daily
    expect(plan?.listening).toEqual({ dialogueIds: ['dl001'], soundId: 's01', numbers: 3 });
    expect(plan?.edge).toEqual([]);
    expect(plan?.checkpointDue).toBe(false);
  });

  it('a 25-minute day gets two dialogues', async () => {
    await setGoal(makeGoal({ dailyMinutes: 25 }));
    const s = await getOrCreateSession('2026-03-02');
    expect(s.plan?.listening?.dialogueIds).toEqual(['dl001', 'dl002']);
  });

  it('prefers the scenes in the profile', async () => {
    await updateProfile({ scenes: ['work'] });
    await setGoal(makeGoal());
    expect((await getOrCreateSession('2026-03-02')).plan?.listening?.dialogueIds).toEqual(['dl002']);
  });

  it('uses the ladder of profile.adaptive: tier from the listening level, newPerDay from the ladder', async () => {
    await setGoal(makeGoal());
    await updateProfile({ adaptive: { ladder: { listen: 4, speak: 3, newPerDay: 8 }, lastChange: {}, history: [] } });
    const plan = (await getOrCreateSession('2026-03-02')).plan;
    expect(plan?.ladder).toEqual({ listen: 4, speak: 3, newPerDay: 8 });
    expect(plan?.newItems).toHaveLength(8);
    expect(plan?.listening?.dialogueIds).toEqual(['dl050']);
  });

  it('the plan is frozen, and the day needs all 5 steps', async () => {
    await setGoal(makeGoal());
    const date = '2026-03-02';
    const first = await getOrCreateSession(date);
    for (const step of ['review', 'chunks', 'decode', 'output'] as const) {
      const s = await markStepDone(date, step, 1000);
      expect(s.completedAt).toBeUndefined();
    }
    const done = await markStepDone(date, 'listening', 1000);
    expect(done.completedAt).toBeDefined();
    expect(done.plan).toEqual(first.plan);
    expect(done.stepsDone).toHaveLength(5);
  });

  it('listening alone does not complete a v3 day, and a v2 day ignores nothing', async () => {
    await setGoal(makeGoal());
    const date = '2026-03-03';
    await getOrCreateSession(date);
    for (const step of ['review', 'chunks', 'decode', 'output'] as const) await markStepDone(date, step, 0);
    expect((await db.sessions.get(date))?.completedAt).toBeUndefined();
    expect((await markStepDone(date, 'listening', 0)).completedAt).toBeDefined();
  });

  it('prefers dialogues not yet heard, recycles the least recently heard when a tier is exhausted', async () => {
    await setGoal(makeGoal({ dailyMinutes: 25 }));
    await logMeasurement({ cardId: 'dialogue:dl002', skill: 'listen', correct: true, mode: 'dialogue', durationMs: 1 });
    expect((await getOrCreateSession('2026-03-04')).plan?.listening?.dialogueIds).toEqual(['dl001', 'dl003']);
    await db.reviews.clear();
    const t = Date.now();
    await db.reviews.bulkAdd([
      { id: 'a', cardId: 'dialogue:dl001', grade: 2, mode: 'dialogue', reviewedAt: t - 3000, durationMs: 1, updatedAt: 0 },
      { id: 'b', cardId: 'dialogue:dl002', grade: 2, mode: 'dialogue', reviewedAt: t - 9000, durationMs: 1, updatedAt: 0 },
      { id: 'c', cardId: 'dialogue:dl003', grade: 2, mode: 'dialogue', reviewedAt: t - 5000, durationMs: 1, updatedAt: 0 },
    ]);
    expect((await getOrCreateSession('2026-03-05')).plan?.listening?.dialogueIds).toEqual(['dl002', 'dl003']);
  });

  it('sound pattern: next unintroduced by level order, then a due sound card', async () => {
    await setGoal(makeGoal());
    expect((await getOrCreateSession('2026-03-06')).plan?.listening?.soundId).toBe('s01');
    await introduceSound('s01');
    expect((await getOrCreateSession('2026-03-07')).plan?.listening?.soundId).toBe('s02');
    await introduceSound('s02');
    await introduceSound('s03');
    await db.cards.update('sound:s02', { due: Date.now() - 5000 });
    await db.cards.update('sound:s01', { due: Date.now() + 5 * DAY });
    await db.cards.update('sound:s03', { due: Date.now() + 5 * DAY });
    expect((await getOrCreateSession('2026-03-08')).plan?.listening?.soundId).toBe('s02');
    await db.cards.update('sound:s02', { due: Date.now() + 5 * DAY });
    const last = (await getOrCreateSession('2026-03-09')).plan?.listening;
    expect(last && 'soundId' in last).toBe(false);
  });

  it('edge items from recent lapses are put in the plan (max 5)', async () => {
    await setGoal(makeGoal());
    await ensureCards('chunk', ['c001', 'c002', 'c003']);
    await gradeCard('chunk:c002', 0, 'review', 1000);
    await gradeCard('chunk:c003', 2, 'review', 1000);
    const plan = (await getOrCreateSession('2026-03-10')).plan;
    expect(plan?.edge).toEqual([{ kind: 'chunk', id: 'c002' }]);
  });

  it('introduced cards are not offered as new items again', async () => {
    await setGoal(makeGoal());
    await introduceKnown([{ kind: 'chunk', id: 'c001' }, { kind: 'chunk', id: 'c002' }]);
    const plan = (await getOrCreateSession('2026-03-11')).plan;
    expect(plan?.newItems.map((r) => r.id)).not.toContain('c001');
    expect(plan?.newItems.map((r) => r.id)).not.toContain('c002');
    expect(plan?.newItems[0]).toEqual({ kind: 'frame', id: 'f001' });
  });

  it('checkpointDue after 7 completed lessons since the last assessment', async () => {
    await setGoal(makeGoal());
    await saveAssessment(placementOf({ date: '2026-01-01' }));
    const dates = Array.from({ length: 7 }, (_, i) => `2026-01-${String(i + 2).padStart(2, '0')}`);
    for (const d of dates.slice(0, 6)) await db.sessions.put({ id: d, date: d, dayIndex: 1, stepsDone: [], activeMs: 0, updatedAt: 1, completedAt: 1 });
    expect((await getOrCreateSession('2026-02-01')).plan?.checkpointDue).toBe(false);
    await db.sessions.put({ id: dates[6], date: dates[6], dayIndex: 1, stepsDone: [], activeMs: 0, updatedAt: 1, completedAt: 1 });
    expect((await getOrCreateSession('2026-02-02')).plan?.checkpointDue).toBe(true);
  });

  it('a session created before the goal gets a v3 plan once it is rebuilt (setGoal drops an unstarted plan)', async () => {
    const today = ymd(new Date());
    const before = await getOrCreateSession(today);
    expect(before.plan?.listening).toBeUndefined();
    await setGoal(makeGoal());
    expect((await db.sessions.get(today))?.plan).toBeUndefined();
    expect((await getOrCreateSession(today)).plan?.listening).toBeDefined();
  });

  it('setGoal keeps the plan of a day that has already started', async () => {
    const today = ymd(new Date());
    await getOrCreateSession(today);
    await markStepDone(today, 'review', 1000);
    await setGoal(makeGoal());
    expect((await db.sessions.get(today))?.plan).toBeDefined();
  });
});

describe('setGoal', () => {
  it('stores the goal, syncs dailyMinutes and creates the controller state', async () => {
    const p = await setGoal(makeGoal({ dailyMinutes: 25, horizonDays: 60 }));
    expect(p.goal?.horizonDays).toBe(60);
    expect(p.dailyMinutes).toBe(25);
    expect(p.adaptive).toEqual({ ladder: { listen: 1, speak: 1, newPerDay: 5 }, lastChange: {}, history: [] });
    expect(p._dirty).toBe(1);
  });

  it('seeds the ladder newPerDay from the profile and keeps an existing controller state', async () => {
    await updateProfile({ newPerDay: 8 });
    expect((await setGoal(makeGoal())).adaptive?.ladder.newPerDay).toBe(8);
    const state = { ladder: { listen: 5, speak: 4, newPerDay: 9 }, lastChange: { listen: '2026-01-01' }, history: [] };
    await updateProfile({ adaptive: state });
    expect((await setGoal(makeGoal({ dailyMinutes: 30 }))).adaptive).toEqual(state);
  });
});

describe('getSkillStats / getEdgeItems', () => {
  it('computes rolling statistics from the logs', async () => {
    await measured(10, {}, true);
    await measured(10, { skill: 'speak', cardId: 'chunk:c003', mode: 'recall', latencyMs: 2500 }, true);
    await measured(5, { skill: 'speak', cardId: 'chunk:c003', mode: 'recall' }, false);
    await logMeasurement({ cardId: 'sound:s01', skill: 'listen', correct: false, mode: 'sound', durationMs: 1 });
    const s = await getSkillStats();
    expect(s.bySkill.listen).toMatchObject({ n: 11 });
    expect(s.bySkill.speak).toMatchObject({ n: 15, medianLatencyMs: 2500 });
    expect(s.bySkill.speak.acc).toBeCloseTo(10 / 15);
    expect(s.categories.find((c) => c.category === 'work')).toMatchObject({ n: 15 });
    expect(s.soundErrors).toEqual([{ soundId: 's01', name: 's01', kind: 'linking', attempts: 1, errors: 1 }]);
  });

  it('getEdgeItems finds lapsed items', async () => {
    await ensureCards('chunk', ['c001', 'c002']);
    await gradeCard('chunk:c001', 0, 'review', 1000);
    await gradeCard('chunk:c002', 2, 'review', 1000);
    expect(await getEdgeItems()).toEqual([{ kind: 'chunk', id: 'c001' }]);
    expect(await getEdgeItems(Date.now(), 0)).toEqual([]);
  });
});

describe('runAdaptation', () => {
  it('does nothing without a goal', async () => {
    await measured(30, {}, true);
    expect(await runAdaptation('2026-03-01')).toEqual([]);
    expect((await db.profile.get('profile'))?.adaptive).toBeUndefined();
  });

  it('raises the listening level on high accuracy, saves state + history and syncs profile.newPerDay', async () => {
    await setGoal(makeGoal({ dailyMinutes: 30 }));
    await measured(20, { level: 1 }, true);
    const changes = await runAdaptation('2026-03-01');
    const listen = changes.find((c) => c.dimension === 'listen');
    expect(listen).toMatchObject({ from: 1, to: 2, date: '2026-03-01' });
    expect(listen?.reasonZh).toContain('听力正确率 100% > 88%');
    const profile = await db.profile.get('profile');
    expect(profile?.adaptive?.ladder.listen).toBe(2);
    expect(profile?.adaptive?.lastChange.listen).toBe('2026-03-01');
    expect(profile?.adaptive?.history.map((c) => c.dimension)).toContain('listen');
    expect(profile?.newPerDay).toBe(profile?.adaptive?.ladder.newPerDay);
  });

  it('is idempotent for the same day and respects the 2-day rule', async () => {
    await setGoal(makeGoal());
    await measured(20, {}, true);
    const first = await runAdaptation('2026-03-01');
    expect(first.length).toBeGreaterThan(0);
    expect(await runAdaptation('2026-03-01')).toEqual([]);
    expect(await runAdaptation('2026-03-02')).toEqual([]);
    expect((await runAdaptation('2026-03-03')).find((c) => c.dimension === 'listen')).toMatchObject({ from: 2, to: 3 });
  });

  it('lowers newPerDay from the time budget using the dues and the averages from the logs', async () => {
    await setGoal(makeGoal({ dailyMinutes: 15 }));
    await updateProfile({ adaptive: { ladder: { listen: 1, speak: 1, newPerDay: 8 }, lastChange: {}, history: [] } });
    const changes = await runAdaptation('2026-03-01');
    const n = changes.find((c) => c.dimension === 'newPerDay');
    // 15 min: blocks 4/4/4/1/2 -> fixed 7 min -> 480 s spare, nothing due -> 480 / 90 = 5
    expect(n).toMatchObject({ from: 8, to: 5 });
  });

  it('counts cards due by tomorrow as the review load', async () => {
    await setGoal(makeGoal({ dailyMinutes: 30 }));
    await updateProfile({ adaptive: { ladder: { listen: 1, speak: 1, newPerDay: 10 }, lastChange: {}, history: [] } });
    await ensureCards('chunk', ['c001', 'c002', 'c003', 'c004', 'c005', 'c006', 'c007']);
    await ensureCards('frame', ['f001', 'f002']);
    await ensureCards('sound', ['s01']); // not a review-step card
    const changes = await runAdaptation('2026-03-01');
    // 30 min: blocks 8/8/7/3/4 -> fixed 14 min -> 960 s; 9 due x 25 s = 225 -> 735 / 90 = 8
    expect(changes.find((c) => c.dimension === 'newPerDay')).toMatchObject({ from: 10, to: 8 });
    expect(changes.find((c) => c.dimension === 'newPerDay')?.reasonZh).toContain('到期复习 9 条');
  });
});

describe('saveAssessment', () => {
  it('a placement sets the ladder and introduces fast-tracked chunks as known', async () => {
    await setGoal(makeGoal());
    await saveAssessment(placementOf({ fastTracked: ['c001', 'c002'] }));
    const p = await db.profile.get('profile');
    expect(p?.assessments).toHaveLength(1);
    expect(p?.adaptive?.ladder).toEqual({ listen: 4, speak: 3, newPerDay: 5 });
    expect(p?.adaptive?.lastChange).toMatchObject({ listen: '2026-05-01', speak: '2026-05-01' });
    expect(await db.cards.get('chunk:c001')).toMatchObject({ interval: 7, reps: 1 });
    expect(await db.cards.get('chunk:c002')).toBeDefined();
    expect(await db.cards.count()).toBe(2);
  });

  it('works without a goal and without fast-tracked chunks', async () => {
    const p = await saveAssessment(placementOf());
    expect(p.adaptive?.ladder.listen).toBe(4);
    expect(await db.cards.count()).toBe(0);
  });

  it('a checkpoint is appended without touching the ladder', async () => {
    await setGoal(makeGoal());
    await saveAssessment(placementOf());
    await saveAssessment(placementOf({ id: 'cp-1', kind: 'checkpoint', listenLevel: 7, speakLevel: 5, date: '2026-05-08' }));
    const p = await db.profile.get('profile');
    expect(p?.assessments?.map((a) => a.id)).toEqual(['placement-1', 'cp-1']);
    expect(p?.adaptive?.ladder).toMatchObject({ listen: 4, speak: 3 });
  });

  it('keeps the newest 30, replaces an assessment with the same id', async () => {
    for (let i = 0; i < 33; i++) await saveAssessment(placementOf({ id: `a${i}`, kind: 'checkpoint' }));
    const ids = (await db.profile.get('profile'))?.assessments?.map((a) => a.id) ?? [];
    expect(ids).toHaveLength(30);
    expect(ids[0]).toBe('a3');
    expect(ids[29]).toBe('a32');
    await saveAssessment(placementOf({ id: 'a32', kind: 'checkpoint', listenLevel: 8 }));
    const after = (await db.profile.get('profile'))?.assessments ?? [];
    expect(after).toHaveLength(30);
    expect(after[29].listenLevel).toBe(8);
  });

  it('a placement rebuilds an unstarted plan (new ladder, fast-tracked items skipped)', async () => {
    await setGoal(makeGoal());
    const today = ymd(new Date());
    await getOrCreateSession(today);
    await saveAssessment(placementOf({ fastTracked: ['c001'], listenLevel: 4 }));
    const plan = (await getOrCreateSession(today)).plan;
    expect(plan?.ladder?.listen).toBe(4);
    expect(plan?.listening?.dialogueIds).toEqual(['dl050']);
    expect(plan?.newItems.map((r) => r.id)).not.toContain('c001');
  });
});

describe('saveCoachReport', () => {
  const report = (i: number): CoachReport => ({
    id: `r${i}`,
    createdAt: i,
    lesson: i,
    source: 'rules',
    summaryZh: '总结',
    strengthsZh: [],
    weaknessesZh: [],
    nextWeekFocusZh: ['x'],
    tipsZh: ['y'],
  });

  it('appends newest last and keeps 12', async () => {
    for (let i = 1; i <= 14; i++) await saveCoachReport(report(i));
    const reports = (await db.profile.get('profile'))?.coachReports ?? [];
    expect(reports.map((r) => r.id)).toEqual(Array.from({ length: 12 }, (_, i) => `r${i + 3}`));
  });
});

describe('getDaySummaryV3', () => {
  it('summarises today: accuracy vs band, latency, mistakes, adjustments', async () => {
    await setGoal(makeGoal());
    const today = ymd(new Date());
    await measured(8, { cardId: 'dialogue:dl001' }, true);
    await measured(2, { cardId: 'dialogue:dl001' }, false);
    await measured(3, { skill: 'speak', cardId: 'chunk:c001', mode: 'recall', latencyMs: 3000 }, true);
    await measured(3, { skill: 'speak', cardId: 'chunk:c002', mode: 'recall', latencyMs: 5000 }, true);
    await measured(2, { skill: 'speak', cardId: 'chunk:c002', mode: 'recall' }, false);
    await logMeasurement({ cardId: 'numbers:price', skill: 'listen', correct: false, mode: 'numbers', durationMs: 1 });
    await ensureCards('chunk', ['c003']);
    await gradeCard('chunk:c003', 0, 'review', 1000); // unmeasured lapse
    await db.reviews.add({ id: 'old', cardId: 'chunk:c009', grade: 0, mode: 'review', reviewedAt: Date.now() - 3 * DAY, durationMs: 1, updatedAt: 0 });
    const summary = await getDaySummaryV3(today);

    expect(summary.band).toEqual({ low: 0.7, high: 0.88 });
    expect(summary.skills.listen).toMatchObject({ n: 11, correct: 8, band: 'in' });
    expect(summary.skills.listen.acc).toBeCloseTo(8 / 11);
    expect(summary.skills.speak).toMatchObject({ n: 8, correct: 6, medianLatencyMs: 4000, band: 'in' });
    expect(summary.skills.decode).toEqual({ n: 0, correct: 0, acc: 0, band: 'none' });
    expect(summary.mistakes).toEqual([
      { cardId: 'chunk:c002', kind: 'chunk', ref: { kind: 'chunk', id: 'c002' }, count: 2 },
      { cardId: 'dialogue:dl001', kind: 'dialogue', count: 2 },
      { cardId: 'chunk:c003', kind: 'chunk', ref: { kind: 'chunk', id: 'c003' }, count: 1 },
      { cardId: 'numbers:price', kind: 'numbers', count: 1 },
    ]);
    expect(summary.adjustments).toEqual([]);
    expect(summary.ladder).toEqual({ listen: 1, speak: 1, newPerDay: 5 });
  });

  it('bands: above 88% and below 70%', async () => {
    await measured(10, {}, true);
    await measured(10, { skill: 'speak', cardId: 'chunk:c001', mode: 'recall' }, false);
    const s = await getDaySummaryV3(ymd(new Date()));
    expect(s.skills.listen.band).toBe('above');
    expect(s.skills.speak.band).toBe('below');
  });

  it('includes the adjustments made on that day, and an empty day is quiet', async () => {
    await setGoal(makeGoal());
    await measured(20, {}, true);
    const today = ymd(new Date());
    const made = await runAdaptation(today);
    const summary = await getDaySummaryV3(today);
    expect(summary.adjustments).toEqual(made);
    const quiet = await getDaySummaryV3('2000-01-01');
    expect(quiet.mistakes).toEqual([]);
    expect(quiet.skills.listen.band).toBe('none');
    expect(quiet.adjustments).toEqual([]);
  });
});

describe('getGoalProgress / getCoachInput', () => {
  it('is undefined without a goal', async () => {
    expect(await getGoalProgress()).toBeUndefined();
  });

  it('builds the phase plan from the placement and reports progress', async () => {
    await setGoal(makeGoal({ horizonDays: 30, dailyMinutes: 20 }));
    await saveAssessment(placementOf({ listenLevel: 2, speakLevel: 1, fastTracked: ['c001'] }));
    const g = await getGoalProgress();
    expect(g?.plan.phases).toHaveLength(3);
    expect(g?.plan.baseline).toEqual({ itemsLearned: 1, listenLevel: 2, speakLevel: 1 });
    expect(g?.itemsLearned).toBe(1);
    expect(g?.progress.status).toBe('on-track');
  });

  it('the baseline counts items studied before the goal started', async () => {
    await ensureCards('chunk', ['c001', 'c002']);
    await db.reviews.add({ id: 'x1', cardId: 'chunk:c001', grade: 2, mode: 'review', reviewedAt: Date.now() - 10 * DAY, durationMs: 1, updatedAt: 0 });
    await db.reviews.add({ id: 'x2', cardId: 'chunk:c001', grade: 2, mode: 'review', reviewedAt: Date.now() - 9 * DAY, durationMs: 1, updatedAt: 0 });
    await setGoal(makeGoal());
    const g = await getGoalProgress();
    expect(g?.plan.baseline.itemsLearned).toBe(1);
    expect(g?.itemsLearned).toBe(2);
  });

  it('getCoachInput gathers aggregated data only', async () => {
    await setGoal(makeGoal());
    await measured(20, { skill: 'speak', cardId: 'chunk:c003', mode: 'recall', latencyMs: 2000 }, false);
    await ensureCards('chunk', ['c003']);
    await gradeCard('chunk:c003', 0, 'review', 1000);
    const input = await getCoachInput();
    expect(input.skills.speak).toMatchObject({ n: 20, acc: 0 });
    expect(input.ladder).toEqual({ listen: 1, speak: 1, newPerDay: 5 });
    expect(input.weakCategories[0]).toMatchObject({ category: 'work', examples: ['c003'] });
    expect(input.edgeTexts).toEqual(['c003']);
    expect(input.goal?.horizonDays).toBe(30);
    expect(JSON.stringify(input)).not.toContain('userEn');
  });
});
