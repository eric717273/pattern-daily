import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StepKey, SubstitutionFrame } from '../types';

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
  return {
    DOZEN: [],
    SEED_FRAMES: [frame('f001'), frame('f002')],
    getDozen: () => undefined,
  };
});

import { db } from './db';
import {
  deleteUserFrame,
  ensureCards,
  exportData,
  getAllFrames,
  getDueCards,
  getOrCreateProfile,
  getOrCreateSession,
  getStats,
  getTodayDayIndex,
  gradeCard,
  importData,
  listAttempts,
  listUserFrames,
  localChanges,
  markStepDone,
  saveAttempt,
  saveUserFrame,
  updateProfile,
} from './repo';

const DAY = 24 * 60 * 60 * 1000;
const ALL_STEPS: StepKey[] = ['warmup', 'deconstruct', 'frames', 'output'];

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
    let s = await markStepDone('2026-03-02', 'warmup', 60_000);
    expect(s.stepsDone).toEqual(['warmup']);
    expect(s.activeMs).toBe(60_000);
    expect(s.completedAt).toBeUndefined();
    expect(s.dayIndex).toBe(1);

    s = await markStepDone('2026-03-02', 'warmup', 10_000); // same step again: not duplicated
    expect(s.stepsDone).toEqual(['warmup']);
    expect(s.activeMs).toBe(70_000);

    await markStepDone('2026-03-02', 'deconstruct', 100);
    await markStepDone('2026-03-02', 'frames', 100);
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
    await markStepDone('2026-06-02', 'warmup', 1); // started, not finished
    await db.sessions.update('2026-06-01', { deleted: true });
    expect(await getTodayDayIndex('2026-06-04')).toBe(1);
  });

  it('markStepDone on a new session uses the completed-lessons rule', async () => {
    await completeDay('2026-07-01');
    const s = await markStepDone('2026-07-09', 'warmup', 10);
    expect(s.dayIndex).toBe(2);
  });

  it('markStepDone creates the session when missing', async () => {
    const s = await markStepDone('2026-04-01', 'frames', 500);
    expect(s.stepsDone).toEqual(['frames']);
    expect(await db.sessions.get('2026-04-01')).toEqual(s);
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
    await markStepDone(day(0), 'warmup', 1000);
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
    await markStepDone('2026-03-01', 'warmup', 5);
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
