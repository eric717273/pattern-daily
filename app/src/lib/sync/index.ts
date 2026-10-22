import { useEffect, useSyncExternalStore } from 'react';
import { localChanges } from '../repo';
import { getSupabase, supabaseConfigured } from './client';
import { runSync, SupabaseRemote } from './engine';

export type SyncState = 'off' | 'signed-out' | 'idle' | 'syncing' | 'error' | 'offline';

export interface SyncStatus {
  state: SyncState;
  lastSyncedAt?: number;
  error?: string;
}

// ---------- tiny status store ----------

let status: SyncStatus = { state: supabaseConfigured() ? 'idle' : 'off' };
const listeners = new Set<() => void>();

function setStatus(next: SyncStatus): void {
  if (next.state === status.state && next.lastSyncedAt === status.lastSyncedAt && next.error === status.error) return;
  status = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function getStatus(): SyncStatus {
  return status;
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

function errMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

/** Recompute off / signed-out / idle / offline without touching an in-flight sync or a fresh error. */
export async function refreshStatus(): Promise<void> {
  if (status.state === 'syncing') return;
  if (!supabaseConfigured()) {
    setStatus({ state: 'off' });
    return;
  }
  const email = await currentUserEmail();
  if (getStatus().state === 'syncing') return;
  if (!email) {
    setStatus({ state: 'signed-out' });
  } else if (!isOnline()) {
    setStatus({ ...status, state: 'offline', error: undefined });
  } else if (status.state === 'off' || status.state === 'signed-out' || status.state === 'offline') {
    setStatus({ state: 'idle', lastSyncedAt: status.lastSyncedAt });
  }
}

export function useSyncStatus(): SyncStatus {
  useEffect(() => {
    void refreshStatus();
  }, []);
  return useSyncExternalStore(subscribe, getStatus, getStatus);
}

// ---------- auth ----------

export function syncConfigured(): boolean {
  return supabaseConfigured();
}

function requireClient() {
  const c = getSupabase();
  if (!c) throw new Error('请先在设置中填写 Supabase 的 URL 和 anon key。');
  return c;
}

export async function sendOtp(email: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true },
  });
  if (error) {
    if (error.status === 429 || /rate limit|too many/i.test(error.message)) {
      throw new Error('验证码发送太频繁，请一分钟后再试。');
    }
    throw new Error(`发送验证码失败：${error.message}`);
  }
}

export async function verifyOtp(email: string, code: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: 'email',
  });
  if (error) {
    throw new Error(/expired|invalid/i.test(error.message) ? '验证码错误或已过期，请重新获取。' : `登录失败：${error.message}`);
  }
  setStatus({ state: 'idle', lastSyncedAt: status.lastSyncedAt });
  void syncNow().catch(() => undefined);
}

export async function signOut(): Promise<void> {
  const client = getSupabase();
  if (client) {
    try {
      await client.auth.signOut();
    } catch {
      // local session cleanup is best-effort
    }
  }
  setStatus({ state: supabaseConfigured() ? 'signed-out' : 'off' });
}

export async function currentUserEmail(): Promise<string | null> {
  const client = getSupabase();
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data.session?.user.email ?? null;
  } catch {
    return null;
  }
}

// ---------- sync ----------

let inFlight: Promise<{ pushed: number; pulled: number }> | null = null;

export function syncNow(): Promise<{ pushed: number; pulled: number }> {
  if (inFlight) return inFlight;
  inFlight = doSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doSync(): Promise<{ pushed: number; pulled: number }> {
  const none = { pushed: 0, pulled: 0 };
  const client = getSupabase();
  if (!client) {
    setStatus({ state: 'off' });
    return none;
  }
  if (!isOnline()) {
    setStatus({ state: 'offline', lastSyncedAt: status.lastSyncedAt });
    return none;
  }
  if (!(await currentUserEmail())) {
    setStatus({ state: 'signed-out' });
    return none;
  }
  setStatus({ state: 'syncing', lastSyncedAt: status.lastSyncedAt });
  try {
    const result = await runSync(new SupabaseRemote(client));
    setStatus({ state: 'idle', lastSyncedAt: Date.now() });
    return result;
  } catch (e) {
    if (!isOnline()) {
      setStatus({ state: 'offline', lastSyncedAt: status.lastSyncedAt });
    } else {
      setStatus({ state: 'error', lastSyncedAt: status.lastSyncedAt, error: errMessage(e, '同步失败') });
    }
    throw e;
  }
}

const DEBOUNCE_MS = 3000;
const INTERVAL_MS = 60_000;

/** Triggers: local change (3 s debounce), back online, tab visible, every 60 s. Returns the stop function. */
export function startAutoSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    if (!supabaseConfigured() || !isOnline()) {
      void refreshStatus();
      return;
    }
    void syncNow().catch(() => undefined); // errors are surfaced through useSyncStatus
  };
  const onChange = () => {
    clearTimeout(timer);
    timer = setTimeout(run, DEBOUNCE_MS);
  };
  const onOnline = () => run();
  const onOffline = () => void refreshStatus();
  const onVisible = () => {
    if (document.visibilityState === 'visible') run();
  };
  const onSettings = () => {
    void refreshStatus();
    onChange();
  };

  localChanges.addEventListener('change', onChange);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  window.addEventListener('settings-change', onSettings);
  document.addEventListener('visibilitychange', onVisible);
  const interval = setInterval(run, INTERVAL_MS);

  const client = getSupabase();
  const { data: sub } = client
    ? client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') setStatus({ state: 'signed-out' });
        else if (event === 'SIGNED_IN') void refreshStatus();
      })
    : { data: null };

  run(); // initial sync on start

  return () => {
    clearTimeout(timer);
    clearInterval(interval);
    localChanges.removeEventListener('change', onChange);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    window.removeEventListener('settings-change', onSettings);
    document.removeEventListener('visibilitychange', onVisible);
    sub?.subscription.unsubscribe();
  };
}
