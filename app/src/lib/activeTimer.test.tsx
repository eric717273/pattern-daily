import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_STEP_MS, useActiveTimer } from './activeTimer';

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  vi.useRealTimers();
  setVisibility('visible');
});

describe('useActiveTimer', () => {
  it('counts only while the page is visible', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result } = renderHook(() => useActiveTimer());
    act(() => {
      vi.setSystemTime(5_000);
    });
    expect(result.current.read()).toBe(5_000);

    act(() => {
      setVisibility('hidden');
      vi.setSystemTime(65_000); // a minute in the background
    });
    expect(result.current.read()).toBe(5_000);

    act(() => {
      setVisibility('visible');
      vi.setSystemTime(68_000);
    });
    expect(result.current.read()).toBe(8_000);
  });

  it('reset starts a new measurement, and one step is capped', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result } = renderHook(() => useActiveTimer());
    act(() => {
      vi.setSystemTime(60 * 60_000);
    });
    expect(result.current.read()).toBe(MAX_STEP_MS);
    act(() => result.current.reset());
    expect(result.current.read()).toBe(0);
    act(() => {
      vi.setSystemTime(60 * 60_000 + 1_500);
    });
    expect(result.current.read()).toBe(1_500);
  });
});
