import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import type { Attempt, CardState, Profile } from '../../types';
import { InMemoryRemote, mergeRows, PUSH_BATCH, pullChanges, pushDirty, runSync, type RemoteRow } from './engine';

function card(id: string, updatedAt: number, extra: Partial<CardState> = {}): CardState {
  return {
    id,
    kind: 'dozen',
    refId: id.split(':')[1] ?? id,
    due: 1000,
    interval: 1,
    ease: 2.5,
    reps: 1,
    lapses: 0,
    updatedAt,
    _dirty: 1,
    ...extra,
  };
}

function remoteRow(c: CardState, serverTs = '2026-01-01T00:00:00.000Z'): RemoteRow {
  const { _dirty, ...data } = c;
  void _dirty;
  return { tbl: 'cards', id: c.id, data, updated_at: c.updatedAt, deleted: c.deleted === true, server_ts: serverTs };
}

beforeEach(async () => {
  for (const t of [db.cards, db.reviews, db.attempts, db.sessions, db.userFrames, db.profile, db.meta]) {
    await t.clear();
  }
});

describe('push', () => {
  it('pushes dirty rows without _dirty and clears the flag', async () => {
    await db.cards.bulkPut([card('dozen:d01', 10), card('dozen:d02', 20, { _dirty: 0 })]);
    const remote = new InMemoryRemote();
    const n = await pushDirty(remote);
    expect(n).toBe(1);
    const sent = remote.pushCalls[0];
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ tbl: 'cards', id: 'dozen:d01', updated_at: 10, deleted: false });
    expect('_dirty' in sent[0].data).toBe(false);
    expect((await db.cards.get('dozen:d01'))?._dirty).toBe(0);
  });

  it('does not clear _dirty when the row changed while pushing', async () => {
    await db.cards.put(card('dozen:d01', 10));
    const remote = new InMemoryRemote();
    remote.onPush = async () => {
      await db.cards.update('dozen:d01', { updatedAt: 99, _dirty: 1, reps: 5 });
    };
    await pushDirty(remote);
    const local = await db.cards.get('dozen:d01');
    expect(local?._dirty).toBe(1);
    expect(local?.updatedAt).toBe(99);
    // the next sync sends the newer edit
    remote.onPush = undefined;
    await pushDirty(remote);
    expect(remote.rows.get('cards/dozen:d01')?.updated_at).toBe(99);
    expect((await db.cards.get('dozen:d01'))?._dirty).toBe(0);
  });

  it('batches at most 500 rows per call', async () => {
    const rows = Array.from({ length: PUSH_BATCH + 20 }, (_, i) => card(`dozen:x${i}`, 1 + i));
    await db.cards.bulkPut(rows);
    const remote = new InMemoryRemote();
    const n = await pushDirty(remote);
    expect(n).toBe(PUSH_BATCH + 20);
    expect(remote.pushCalls.map((c) => c.length)).toEqual([PUSH_BATCH, 20]);
  });

  it('pushes soft deletes and all tables', async () => {
    const attempt: Attempt = {
      id: 'a1', refKind: 'dozen', refId: 'd01', userEn: 'hi', createdAt: 1, updatedAt: 5, deleted: true, _dirty: 1,
    };
    const profile: Profile = { id: 'profile', startDate: '2026-01-01', dailyMinutes: 15, scenes: ['daily'], updatedAt: 7, _dirty: 1 };
    await db.attempts.put(attempt);
    await db.profile.put(profile);
    const remote = new InMemoryRemote();
    expect(await pushDirty(remote)).toBe(2);
    expect(remote.rows.get('attempts/a1')?.deleted).toBe(true);
    expect(remote.rows.get('profile/profile')?.data.startDate).toBe('2026-01-01');
  });
});

describe('merge (LWW)', () => {
  it('inserts missing rows with _dirty 0', async () => {
    const applied = await mergeRows([remoteRow(card('dozen:d01', 10))]);
    expect(applied).toBe(1);
    const local = await db.cards.get('dozen:d01');
    expect(local).toMatchObject({ updatedAt: 10, _dirty: 0, reps: 1 });
  });

  it('applies newer remote, ignores older remote', async () => {
    await db.cards.put(card('dozen:d01', 10, { _dirty: 0, reps: 1 }));
    await mergeRows([remoteRow(card('dozen:d01', 20, { reps: 7 }))]);
    expect((await db.cards.get('dozen:d01'))?.reps).toBe(7);
    await mergeRows([remoteRow(card('dozen:d01', 15, { reps: 3 }))]);
    expect((await db.cards.get('dozen:d01'))?.reps).toBe(7);
  });

  it('newer remote overrides a dirty local row; older remote keeps it dirty', async () => {
    await db.cards.put(card('dozen:d01', 10, { reps: 2 }));
    await mergeRows([remoteRow(card('dozen:d01', 5, { reps: 9 }))]);
    expect(await db.cards.get('dozen:d01')).toMatchObject({ reps: 2, _dirty: 1 });
    await mergeRows([remoteRow(card('dozen:d01', 30, { reps: 9 }))]);
    expect(await db.cards.get('dozen:d01')).toMatchObject({ reps: 9, _dirty: 0 });
  });

  it('on a tie keeps dirty local, applies over clean local', async () => {
    await db.cards.put(card('dozen:d01', 10, { reps: 2 }));
    await mergeRows([remoteRow(card('dozen:d01', 10, { reps: 9 }))]);
    expect((await db.cards.get('dozen:d01'))?.reps).toBe(2);
    await db.cards.update('dozen:d01', { _dirty: 0 });
    await mergeRows([remoteRow(card('dozen:d01', 10, { reps: 9 }))]);
    expect((await db.cards.get('dozen:d01'))?.reps).toBe(9);
  });

  it('propagates deletes', async () => {
    await db.cards.put(card('dozen:d01', 10, { _dirty: 0 }));
    await mergeRows([remoteRow(card('dozen:d01', 20, { deleted: true }))]);
    expect((await db.cards.get('dozen:d01'))?.deleted).toBe(true);
    // and un-delete (restore) with a newer write
    await mergeRows([remoteRow(card('dozen:d01', 30, { deleted: false }))]);
    expect((await db.cards.get('dozen:d01'))?.deleted).toBe(false);
  });

  it('ignores malformed rows', async () => {
    const bad = [{ tbl: 'nope', id: 'x', data: {}, updated_at: 1, deleted: false }] as unknown as RemoteRow[];
    expect(await mergeRows(bad)).toBe(0);
  });
});

describe('two-device round trip', () => {
  it('syncs A -> server -> B and persists the cursor', async () => {
    const remote = new InMemoryRemote();
    await db.cards.put(card('dozen:d01', 100, { reps: 4 }));
    await db.profile.put({ id: 'profile', startDate: '2026-02-02', dailyMinutes: 15, scenes: ['work'], updatedAt: 50, _dirty: 1 });
    const a = await runSync(remote);
    expect(a).toEqual({ pushed: 2, pulled: 0 });

    // simulate device B: wipe local data
    await db.cards.clear();
    await db.profile.clear();
    await db.meta.clear();
    const b = await runSync(remote);
    expect(b.pulled).toBe(2);
    expect(await db.cards.get('dozen:d01')).toMatchObject({ reps: 4, _dirty: 0 });
    expect((await db.profile.get('profile'))?.startDate).toBe('2026-02-02');
    expect((await db.meta.get('cursor'))?.value).toBeTruthy();
  });

  it('pages through more rows than one page', async () => {
    const remote = new InMemoryRemote();
    for (let i = 0; i < 12; i++) {
      const c = card(`dozen:p${i}`, 1 + i);
      remote.rows.set(`cards/${c.id}`, { ...remoteRow(c), server_ts: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() });
    }
    const n = await pullChanges(remote, 5);
    expect(n).toBe(12);
    expect(await db.cards.count()).toBe(12);
  });

  it('a newer edit on B wins over A and flows back', async () => {
    const remote = new InMemoryRemote();
    await db.cards.put(card('dozen:d01', 100, { reps: 1 }));
    await runSync(remote);
    // B edits later (simulate by editing the server copy via another device push)
    await remote.push([remoteRow(card('dozen:d01', 200, { reps: 8 }))]);
    // A edits older than B's edit
    await db.cards.update('dozen:d01', { reps: 2, updatedAt: 150, _dirty: 1 });
    const r = await runSync(remote);
    expect(r.pulled).toBe(1);
    expect((await db.cards.get('dozen:d01'))?.reps).toBe(8);
    expect((await db.cards.get('dozen:d01'))?._dirty).toBe(0);
  });

  it('is idempotent when nothing changed', async () => {
    const remote = new InMemoryRemote();
    await db.cards.put(card('dozen:d01', 100));
    await runSync(remote);
    expect(await runSync(remote)).toEqual({ pushed: 0, pulled: 0 });
  });
});
