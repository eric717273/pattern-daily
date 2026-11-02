import { useState } from 'react';

const FOCUS_KEY = 'pd.focus';

/** 专注模式 preference, kept per device (localStorage; falls back to in-memory when storage is unavailable). */
export function readFocusPref(): boolean {
  try {
    return localStorage.getItem(FOCUS_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeFocusPref(on: boolean): void {
  try {
    if (on) localStorage.setItem(FOCUS_KEY, '1');
    else localStorage.removeItem(FOCUS_KEY);
  } catch {
    // storage unavailable: the choice only lasts for this visit
  }
}

export function useFocusPref(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(readFocusPref);
  return [
    on,
    (v: boolean) => {
      writeFocusPref(v);
      setOn(v);
    },
  ];
}
