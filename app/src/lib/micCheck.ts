/** Per-device result of the microphone test (MicCheck), kept in localStorage. */

const OK_KEY = 'pd.micOk';
const FAIL_KEY = 'pd.micFail';

export type MicStatus = { ok: true; at: number } | { ok: false; at: number; reason: string };

function readJson(key: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: Record<string, unknown>): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // storage unavailable
  }
}

/** The latest test result on this device (the newer of the ok / failure records), or null when never tested. */
export function loadMicStatus(): MicStatus | null {
  const ok = readJson(OK_KEY);
  const fail = readJson(FAIL_KEY);
  const okAt = ok && typeof ok.at === 'number' ? ok.at : -1;
  const failAt = fail && typeof fail.at === 'number' ? fail.at : -1;
  if (okAt < 0 && failAt < 0) return null;
  if (okAt >= failAt) return { ok: true, at: okAt };
  return { ok: false, at: failAt, reason: typeof fail?.reason === 'string' ? fail.reason : '' };
}

export function saveMicOk(now = Date.now()): void {
  write(OK_KEY, { at: now });
  remove(FAIL_KEY);
}

export function saveMicFailure(reason: string, now = Date.now()): void {
  write(FAIL_KEY, { at: now, reason });
  remove(OK_KEY);
}

/** Forget a failure (the learner wants to try voice verification again). */
export function clearMicFailure(): void {
  remove(FAIL_KEY);
}
