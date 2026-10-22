import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { DEFAULT_SETTINGS, getSettings, saveSettings, useSettings } from './settings';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('settings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(getSettings()).toEqual({ ...DEFAULT_SETTINGS, supabaseUrl: '', supabaseAnonKey: '' });
    expect(DEFAULT_SETTINGS.deepseekModel).toBe('deepseek-chat');
    expect(DEFAULT_SETTINGS.aiMode).toBe('direct');
    expect(DEFAULT_SETTINGS.ttsRate).toBe(0.95);
  });

  it('merges patches and persists them', () => {
    saveSettings({ deepseekApiKey: 'sk-1' });
    const s = saveSettings({ aiMode: 'proxy' });
    expect(s.deepseekApiKey).toBe('sk-1');
    expect(s.aiMode).toBe('proxy');
    expect(getSettings().deepseekApiKey).toBe('sk-1');
    expect(JSON.parse(localStorage.getItem('pd.settings') ?? '{}').aiMode).toBe('proxy');
  });

  it('survives corrupted storage and bad field types', () => {
    localStorage.setItem('pd.settings', '{not json');
    expect(getSettings().deepseekModel).toBe('deepseek-chat');
    localStorage.setItem('pd.settings', JSON.stringify({ ttsRate: 'fast', aiMode: 'x', deepseekModel: '' }));
    const s = getSettings();
    expect(s.ttsRate).toBe(0.95);
    expect(s.aiMode).toBe('direct');
    expect(s.deepseekModel).toBe('deepseek-chat');
  });

  it('clamps ttsRate', () => {
    saveSettings({ ttsRate: 9 });
    expect(getSettings().ttsRate).toBe(1.5);
  });

  it('falls back to env for supabase values but does not persist them', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://env.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'env-anon');
    expect(getSettings().supabaseUrl).toBe('https://env.supabase.co');
    saveSettings({ deepseekApiKey: 'k' });
    expect(JSON.parse(localStorage.getItem('pd.settings') ?? '{}').supabaseUrl).toBe('');
    saveSettings({ supabaseUrl: 'https://mine.supabase.co' });
    expect(getSettings().supabaseUrl).toBe('https://mine.supabase.co');
    expect(getSettings().supabaseAnonKey).toBe('env-anon');
  });

  it('does not throw when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => getSettings()).not.toThrow();
    expect(saveSettings({ deepseekApiKey: 'x' }).deepseekApiKey).toBe('x');
  });

  it('dispatches settings-change and the hook reacts', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current[0].deepseekApiKey).toBe('');
    act(() => result.current[1]({ deepseekApiKey: 'abc' }));
    expect(result.current[0].deepseekApiKey).toBe('abc');
    act(() => {
      localStorage.setItem('pd.settings', JSON.stringify({ deepseekApiKey: 'other-tab' }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'pd.settings' }));
    });
    expect(result.current[0].deepseekApiKey).toBe('other-tab');
  });
});
