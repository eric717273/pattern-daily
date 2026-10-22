import { useCallback, useEffect, useState } from 'react';
import type { Settings } from '../types';

const STORAGE_KEY = 'pd.settings';
const EVENT_NAME = 'settings-change';

export const DEFAULT_SETTINGS: Settings = {
  deepseekApiKey: '',
  deepseekModel: 'deepseek-chat',
  aiMode: 'direct',
  supabaseUrl: '',
  supabaseAnonKey: '',
  ttsRate: 0.95,
  ttsVoiceURI: '',
};

function envValue(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string {
  try {
    const v: unknown = import.meta.env?.[name];
    return typeof v === 'string' ? v : '';
  } catch {
    return '';
  }
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

/** Parse the raw localStorage value into the user's explicit choices (no env fallbacks applied). */
function parseStored(raw: string | null): Settings {
  let obj: Record<string, unknown> = {};
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        obj = parsed as Record<string, unknown>;
      }
    } catch {
      // corrupted value: fall back to defaults
    }
  }
  const rate = typeof obj.ttsRate === 'number' && Number.isFinite(obj.ttsRate) ? obj.ttsRate : DEFAULT_SETTINGS.ttsRate;
  return {
    deepseekApiKey: str(obj.deepseekApiKey, DEFAULT_SETTINGS.deepseekApiKey),
    deepseekModel: str(obj.deepseekModel, DEFAULT_SETTINGS.deepseekModel) || DEFAULT_SETTINGS.deepseekModel,
    aiMode: obj.aiMode === 'proxy' ? 'proxy' : 'direct',
    supabaseUrl: str(obj.supabaseUrl, DEFAULT_SETTINGS.supabaseUrl),
    supabaseAnonKey: str(obj.supabaseAnonKey, DEFAULT_SETTINGS.supabaseAnonKey),
    ttsRate: Math.min(1.5, Math.max(0.5, rate)),
    ttsVoiceURI: str(obj.ttsVoiceURI, DEFAULT_SETTINGS.ttsVoiceURI),
  };
}

function withEnvFallback(s: Settings): Settings {
  return {
    ...s,
    supabaseUrl: s.supabaseUrl.trim() || envValue('VITE_SUPABASE_URL'),
    supabaseAnonKey: s.supabaseAnonKey.trim() || envValue('VITE_SUPABASE_ANON_KEY'),
  };
}

export function getSettings(): Settings {
  return withEnvFallback(parseStored(readRaw()));
}

export function saveSettings(patch: Partial<Settings>): Settings {
  // Persist only what the user chose (never bake env fallbacks into storage).
  const next: Settings = { ...parseStored(readRaw()), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode / quota): the change is not persisted
  }
  try {
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    // no window (non-browser): nothing to notify
  }
  return withEnvFallback(next);
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(() => getSettings());

  useEffect(() => {
    const refresh = () => {
      const next = getSettings();
      // keep the previous reference when nothing changed to avoid needless renders
      setSettings((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === STORAGE_KEY) refresh();
    };
    window.addEventListener(EVENT_NAME, refresh);
    window.addEventListener('storage', onStorage);
    refresh();
    return () => {
      window.removeEventListener(EVENT_NAME, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    saveSettings(patch);
  }, []);

  return [settings, update];
}
