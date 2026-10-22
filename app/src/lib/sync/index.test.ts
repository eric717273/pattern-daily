import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const state = vi.hoisted(() => ({
  signedIn: true,
  configured: true,
  rpc: null as unknown,
  remoteRows: [] as unknown[],
  otp: null as unknown,
}));

vi.mock('../repo', () => ({ localChanges: new EventTarget() }));
vi.mock('./client', () => {
  const makeQuery = () => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'limit', 'gt']) q[m] = () => q;
    q.then = (res: (v: unknown) => unknown) => res({ data: state.remoteRows, error: null });
    return q;
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: state.signedIn ? { user: { email: 'me@example.com' } } : null } }),
      signInWithOtp: (a: unknown) => (state.otp as (a: unknown) => unknown)(a),
      verifyOtp: (a: unknown) => (state.otp as (a: unknown) => unknown)(a),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
    rpc: (...a: unknown[]) => (state.rpc as (...a: unknown[]) => unknown)(...a),
    from: () => makeQuery(),
  };
  return {
    getSupabase: () => (state.configured ? client : null),
    supabaseConfigured: () => state.configured,
    resetSupabase: () => undefined,
  };
});

import { db } from '../db';
import { localChanges } from '../repo';
import {
  currentUserEmail,
  refreshStatus,
  sendOtp,
  startAutoSync,
  syncNow,
  useSyncStatus,
  verifyOtp,
} from './index';

beforeEach(async () => {
  state.signedIn = true;
  state.configured = true;
  state.remoteRows = [];
  state.rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
  state.otp = vi.fn().mockResolvedValue({ data: {}, error: null });
  for (const t of [db.cards, db.reviews, db.attempts, db.sessions, db.userFrames, db.profile, db.meta]) await t.clear();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('auth', () => {
  it('sends a 6-digit OTP (not a magic link) and verifies with type email', async () => {
    await sendOtp(' me@example.com ');
    expect(state.otp).toHaveBeenCalledWith({ email: 'me@example.com', options: { shouldCreateUser: true } });
    await verifyOtp('me@example.com', ' 123456 ');
    expect(state.otp).toHaveBeenLastCalledWith({ email: 'me@example.com', token: '123456', type: 'email' });
  });

  it('reports verify errors in Chinese', async () => {
    state.otp = vi.fn().mockResolvedValue({ data: {}, error: { message: 'Token has expired or is invalid' } });
    await expect(verifyOtp('a@b.c', '000000')).rejects.toThrow('验证码错误或已过期');
  });

  it('exposes the signed-in email', async () => {
    expect(await currentUserEmail()).toBe('me@example.com');
    state.signedIn = false;
    expect(await currentUserEmail()).toBeNull();
  });
});

describe('syncNow', () => {
  it('is a no-op when not configured / signed out / offline', async () => {
    state.configured = false;
    expect(await syncNow()).toEqual({ pushed: 0, pulled: 0 });
    await refreshStatus();
    const { result } = renderHook(() => useSyncStatus());
    expect(result.current.state).toBe('off');

    state.configured = true;
    state.signedIn = false;
    await syncNow();
    expect(result.current.state).toBe('signed-out');

    state.signedIn = true;
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await syncNow();
    expect(result.current.state).toBe('offline');
  });

  it('pushes dirty rows through the rpc and reports lastSyncedAt', async () => {
    await db.cards.put({ id: 'dozen:d01', kind: 'dozen', refId: 'd01', due: 1, interval: 1, ease: 2.5, reps: 1, lapses: 0, updatedAt: 5, _dirty: 1 });
    const { result } = renderHook(() => useSyncStatus());
    let r: { pushed: number; pulled: number } | undefined;
    await act(async () => {
      r = await syncNow();
    });
    expect(r).toEqual({ pushed: 1, pulled: 0 });
    expect(state.rpc).toHaveBeenCalledWith('push_records', { rows: [expect.objectContaining({ tbl: 'cards', id: 'dozen:d01' })] });
    expect(result.current.state).toBe('idle');
    expect(result.current.lastSyncedAt).toBeGreaterThan(0);
  });

  it('surfaces rpc errors as state error', async () => {
    await db.cards.put({ id: 'dozen:d01', kind: 'dozen', refId: 'd01', due: 1, interval: 1, ease: 2.5, reps: 1, lapses: 0, updatedAt: 5, _dirty: 1 });
    state.rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { result } = renderHook(() => useSyncStatus());
    await act(async () => {
      await expect(syncNow()).rejects.toThrow('boom');
    });
    expect(result.current).toMatchObject({ state: 'error', error: 'boom' });
  });
});

describe('startAutoSync', () => {
  it('debounces local changes by 3 s and stops cleanly', async () => {
    // fake-indexeddb relies on setImmediate, so only fake the timers the sync code uses
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const realSetImmediate = (globalThis as unknown as { setImmediate: (f: () => void) => void }).setImmediate;
    const flush = async () => {
      for (let n = 0; n < 30; n++) await new Promise<void>((r) => realSetImmediate(r));
    };
    const stop = startAutoSync();
    await flush(); // initial run
    (state.rpc as ReturnType<typeof vi.fn>).mockClear();
    await db.cards.put({ id: 'dozen:d02', kind: 'dozen', refId: 'd02', due: 1, interval: 1, ease: 2.5, reps: 1, lapses: 0, updatedAt: 5, _dirty: 1 });
    localChanges.dispatchEvent(new Event('change'));
    localChanges.dispatchEvent(new Event('change'));
    vi.advanceTimersByTime(2900);
    await flush();
    expect(state.rpc).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    await flush();
    expect(state.rpc).toHaveBeenCalledTimes(1);
    stop();
    await db.cards.update('dozen:d02', { updatedAt: 6, _dirty: 1 });
    localChanges.dispatchEvent(new Event('change'));
    vi.advanceTimersByTime(5000);
    await flush();
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });
});
