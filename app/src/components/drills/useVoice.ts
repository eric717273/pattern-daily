import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isSpeaking,
  recognitionSupported,
  speechError,
  startListening,
  type ListenHandle,
  type SpeechError,
} from '../../lib/speech';
import { loadVoicePref, saveVoicePref } from '../../lib/swap';
import { clearMicFailure, loadMicStatus } from '../../lib/micCheck';

// ---------- the "语音验证" preference ----------

export interface VoicePref {
  /** The browser has speech recognition. */
  supported: boolean;
  /** Voice verification is on: supported AND (saved preference, default on) AND the last microphone test did not fail. */
  enabled: boolean;
  setEnabled: (on: boolean) => void;
}

export function useVoicePref(): VoicePref {
  const supported = recognitionSupported();
  const [pref, setPref] = useState<boolean>(() => loadVoicePref() ?? true);
  const [micFailed, setMicFailed] = useState<boolean>(() => loadMicStatus()?.ok === false);
  const setEnabled = useCallback((on: boolean) => {
    setPref(on);
    saveVoicePref(on);
    if (on) {
      // the learner chose to try again (maybe after enabling Dictation): forget the earlier failure
      clearMicFailure();
      setMicFailed(false);
    }
  }, []);
  return { supported, enabled: supported && pref && !micFailed, setEnabled };
}

// ---------- a long-lived recognizer session ----------

export interface SpeechUpdate {
  /** Best transcript of the speech since the last mark(). */
  text: string;
  /** The same speech built from the 2nd / 3rd hypotheses. */
  alternatives: string[];
  isFinal: boolean;
}

export interface VoiceListener {
  /** Start the session (no-op when running). Call it inside a tap: Safari asks for the microphone then. */
  start: () => void;
  /** Stop for good (drops pending results). */
  stop: () => void;
  /** Begin a new segment: later updates only contain speech from now on. */
  mark: () => void;
  /** Receive updates; returns the unsubscribe function. Updates during TTS playback are not delivered. */
  subscribe: (fn: (u: SpeechUpdate) => void) => () => void;
  /** The microphone has been capturing at least once (the permission prompt is over). */
  ready: boolean;
  /** Set by a fatal recognition error (permission denied, offline, ...). Cleared by start(). */
  error: SpeechError | null;
}

/** Browsers end a continuous session by themselves (silence, time limit): restart unless it keeps failing at once. */
const MAX_QUICK_ENDS = 4;
const QUICK_END_MS = 1000;
const RESTART_DELAY_MS = 150;
const MAX_RESTART_DELAY_MS = 2000;
/** Hard cap on automatic restarts of one start() (reset whenever speech is heard): never loop forever. */
const MAX_RESTARTS = 60;
/** The microphone must report that it started within this long after start(), else we fall back to self-check. */
export const MIC_START_TIMEOUT_MS = 4000;

/**
 * One recognizer session shared by all prompts of a drill. Restarts itself when the browser ends it (with a growing
 * delay and a hard cap), gives up with a 'start-timeout' / 'start-failed' error when the microphone never starts, ignores
 * results while text-to-speech is playing, and cleans up on unmount. start() and stop() never throw.
 */
export function useVoiceListener(onFatalError?: (err: SpeechError) => void): VoiceListener {
  const handle = useRef<ListenHandle | null>(null);
  const wanted = useRef(false);
  const subs = useRef(new Set<(u: SpeechUpdate) => void>());
  const quickEnds = useRef(0);
  const restarts = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beginRef = useRef<() => void>(() => undefined);
  const fatalRef = useRef(onFatalError);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<SpeechError | null>(null);

  useEffect(() => {
    fatalRef.current = onFatalError;
  }, [onFatalError]);

  const giveUp = useCallback((err: SpeechError) => {
    wanted.current = false;
    setError(err);
    fatalRef.current?.(err);
  }, []);

  const begin = useCallback(() => {
    try {
      handle.current?.abort();
    } catch {
      // already gone
    }
    handle.current = null;
    const startedAt = Date.now();
    handle.current = startListening({
      startTimeoutMs: MIC_START_TIMEOUT_MS,
      onStart: () => setReady(true),
      onResult: (text, isFinal, alternatives) => {
        restarts.current = 0;
        if (isSpeaking()) return; // the microphone would only hear our own voice
        for (const fn of [...subs.current]) fn({ text, alternatives, isFinal });
      },
      onError: (err) => {
        if (!err.fatal) return;
        giveUp(err);
      },
      onEnd: () => {
        handle.current = null;
        if (!wanted.current) return;
        quickEnds.current = Date.now() - startedAt < QUICK_END_MS ? quickEnds.current + 1 : 0;
        restarts.current += 1;
        if (quickEnds.current > MAX_QUICK_ENDS || restarts.current > MAX_RESTARTS) {
          giveUp(speechError('start-failed'));
          return;
        }
        const delay = Math.min(MAX_RESTART_DELAY_MS, RESTART_DELAY_MS * 2 ** quickEnds.current);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          if (wanted.current) beginRef.current();
        }, delay);
      },
    });
  }, [giveUp]);

  useEffect(() => {
    beginRef.current = begin;
  }, [begin]);

  const start = useCallback(() => {
    if (wanted.current) return;
    wanted.current = true;
    quickEnds.current = 0;
    restarts.current = 0;
    setError(null);
    setReady(false);
    try {
      begin();
    } catch {
      giveUp(speechError('start-failed'));
    }
  }, [begin, giveUp]);

  const stop = useCallback(() => {
    wanted.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const h = handle.current;
    handle.current = null;
    try {
      h?.abort();
    } catch {
      // abort must never throw out of a click handler
    }
  }, []);

  const mark = useCallback(() => {
    try {
      handle.current?.mark();
    } catch {
      // ignore
    }
  }, []);

  const subscribe = useCallback((fn: (u: SpeechUpdate) => void) => {
    subs.current.add(fn);
    return () => {
      subs.current.delete(fn);
    };
  }, []);

  useEffect(() => stop, [stop]);

  return { start, stop, mark, subscribe, ready, error };
}
