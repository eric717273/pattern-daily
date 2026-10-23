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

// ---------- the "语音验证" preference ----------

export interface VoicePref {
  /** The browser has speech recognition. */
  supported: boolean;
  /** Voice verification is on: supported AND (saved preference, default on). */
  enabled: boolean;
  setEnabled: (on: boolean) => void;
}

export function useVoicePref(): VoicePref {
  const supported = recognitionSupported();
  const [pref, setPref] = useState<boolean>(() => loadVoicePref() ?? true);
  const setEnabled = useCallback((on: boolean) => {
    setPref(on);
    saveVoicePref(on);
  }, []);
  return { supported, enabled: supported && pref, setEnabled };
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

/**
 * One recognizer session shared by all prompts of a drill. Restarts itself when the browser ends it,
 * ignores results while text-to-speech is playing, and cleans up on unmount.
 */
export function useVoiceListener(onFatalError?: (err: SpeechError) => void): VoiceListener {
  const handle = useRef<ListenHandle | null>(null);
  const wanted = useRef(false);
  const subs = useRef(new Set<(u: SpeechUpdate) => void>());
  const quickEnds = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beginRef = useRef<() => void>(() => undefined);
  const fatalRef = useRef(onFatalError);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<SpeechError | null>(null);

  useEffect(() => {
    fatalRef.current = onFatalError;
  }, [onFatalError]);

  const begin = useCallback(() => {
    handle.current?.abort();
    const startedAt = Date.now();
    handle.current = startListening({
      onStart: () => setReady(true),
      onResult: (text, isFinal, alternatives) => {
        if (isSpeaking()) return; // the microphone would only hear our own voice
        for (const fn of [...subs.current]) fn({ text, alternatives, isFinal });
      },
      onError: (err) => {
        if (!err.fatal) return;
        wanted.current = false;
        setError(err);
        fatalRef.current?.(err);
      },
      onEnd: () => {
        handle.current = null;
        if (!wanted.current) return;
        quickEnds.current = Date.now() - startedAt < QUICK_END_MS ? quickEnds.current + 1 : 0;
        if (quickEnds.current > MAX_QUICK_ENDS) {
          const err = speechError('start-failed');
          wanted.current = false;
          setError(err);
          fatalRef.current?.(err);
          return;
        }
        timer.current = setTimeout(() => {
          timer.current = null;
          if (wanted.current) beginRef.current();
        }, RESTART_DELAY_MS);
      },
    });
  }, []);

  useEffect(() => {
    beginRef.current = begin;
  }, [begin]);

  const start = useCallback(() => {
    if (wanted.current) return;
    wanted.current = true;
    quickEnds.current = 0;
    setError(null);
    begin();
  }, [begin]);

  const stop = useCallback(() => {
    wanted.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    handle.current?.abort();
    handle.current = null;
  }, []);

  const mark = useCallback(() => handle.current?.mark(), []);

  const subscribe = useCallback((fn: (u: SpeechUpdate) => void) => {
    subs.current.add(fn);
    return () => {
      subs.current.delete(fn);
    };
  }, []);

  useEffect(() => stop, [stop]);

  return { start, stop, mark, subscribe, ready, error };
}
