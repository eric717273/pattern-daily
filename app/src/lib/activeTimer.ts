import { useCallback, useEffect, useRef } from 'react';

/** A single step never counts more than this, so a forgotten open tab does not inflate the stats. */
export const MAX_STEP_MS = 20 * 60_000;

export interface ActiveTimer {
  /** Active milliseconds since the timer started (or was last reset). */
  read: () => number;
  reset: () => void;
}

/**
 * Measures time spent on a screen, counting only while the page is visible
 * (the clock stops when the tab is hidden / the app is in the background).
 */
export function useActiveTimer(): ActiveTimer {
  const acc = useRef(0);
  const since = useRef<number | null>(null);

  useEffect(() => {
    const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
    since.current = visible() ? Date.now() : null;
    const onChange = () => {
      const now = Date.now();
      if (visible()) {
        if (since.current === null) since.current = now;
      } else if (since.current !== null) {
        acc.current += now - since.current;
        since.current = null;
      }
    };
    document.addEventListener('visibilitychange', onChange);
    return () => {
      document.removeEventListener('visibilitychange', onChange);
      if (since.current !== null) {
        acc.current += Date.now() - since.current;
        since.current = null;
      }
    };
  }, []);

  const read = useCallback(() => {
    const live = since.current !== null ? Date.now() - since.current : 0;
    return Math.min(MAX_STEP_MS, Math.max(0, Math.round(acc.current + live)));
  }, []);

  const reset = useCallback(() => {
    acc.current = 0;
    if (since.current !== null) since.current = Date.now();
  }, []);

  return { read, reset };
}
