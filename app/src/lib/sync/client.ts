import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSettings } from '../settings';
import type { Settings } from '../../types';

let cached: { url: string; key: string; client: SupabaseClient } | null = null;

export function supabaseConfigured(s: Settings = getSettings()): boolean {
  return s.supabaseUrl.trim() !== '' && s.supabaseAnonKey.trim() !== '';
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Lazily create the SupabaseClient from the current settings.
 * Returns null when Supabase is not configured. A new client is created whenever URL / anon key change.
 */
export function getSupabase(): SupabaseClient | null {
  const s = getSettings();
  if (!supabaseConfigured(s)) {
    resetSupabase();
    return null;
  }
  const url = s.supabaseUrl.trim();
  const key = s.supabaseAnonKey.trim();
  if (cached && cached.url === url && cached.key === key) return cached.client;
  resetSupabase();
  const client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // 6-digit code flow: there is no redirect to parse (iOS home-screen PWAs can't receive magic links)
      detectSessionInUrl: false,
      storage: safeStorage(),
      storageKey: 'pd.supabase.auth',
    },
  });
  cached = { url, key, client };
  return client;
}

/** Drop the cached client (settings changed / sign-out of a different project). */
export function resetSupabase(): void {
  if (cached) {
    try {
      void cached.client.auth.stopAutoRefresh();
    } catch {
      // ignore
    }
    cached = null;
  }
}
