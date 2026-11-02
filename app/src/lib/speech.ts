import { getSettings } from './settings';

/** Browser TTS (speechSynthesis) and speech recognition (webkitSpeechRecognition). Safe on SSR / jsdom. */

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  return 'speechSynthesis' in window && window.speechSynthesis ? window.speechSynthesis : null;
}

// ---------- voices ----------

/** Voices that are good for learning, in order of preference (Apple first). */
const PREFERRED_NAMES = ['Samantha', 'Ava', 'Alex', 'Allison', 'Susan', 'Nicky', 'Evan', 'Google US English'];
/** Novelty / low-quality voices to avoid. */
const AVOID_NAMES =
  /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|ralph|junior|kathy|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley/i;

function voiceScore(v: SpeechSynthesisVoice): number {
  const lang = v.lang.replace('_', '-').toLowerCase();
  let score = 0;
  if (lang === 'en-us') score += 20;
  else if (lang.startsWith('en-gb')) score += 8;
  else if (lang.startsWith('en')) score += 4;
  else return -1;
  const idx = PREFERRED_NAMES.findIndex((n) => v.name.includes(n));
  if (idx >= 0) score += 12 - idx;
  if (/premium|enhanced|natural/i.test(v.name)) score += 6;
  if (v.localService) score += 1;
  if (AVOID_NAMES.test(v.name)) score -= 30;
  return score;
}

/** Choose the best voice: the user's saved voice, else the best en-US voice. */
export function pickVoice(voices: SpeechSynthesisVoice[], voiceURI: string): SpeechSynthesisVoice | null {
  if (voiceURI) {
    const chosen = voices.find((v) => v.voiceURI === voiceURI);
    if (chosen) return chosen;
  }
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = 0;
  for (const v of voices) {
    const s = voiceScore(v);
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return best;
}

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const s = synth();
  if (!s) return Promise.resolve([]);
  if (voicesPromise) return voicesPromise;
  voicesPromise = new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const now = s.getVoices();
    if (now.length > 0) {
      resolve(now);
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      s.removeEventListener('voiceschanged', finish);
      resolve(s.getVoices());
    };
    s.addEventListener('voiceschanged', finish);
    setTimeout(finish, 1500); // some browsers never fire the event
  });
  return voicesPromise;
}

/** English voices available on this device (for the settings page). Resolves to [] when unsupported. */
export async function listVoices(): Promise<SpeechSynthesisVoice[]> {
  const voices = await loadVoices();
  return voices
    .filter((v) => v.lang.toLowerCase().startsWith('en'))
    .sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name));
}

// Warm the voice list up as early as possible so the first tap already has voices.
void loadVoices();

// ---------- speaking ----------

/** Keep a reference: Safari can garbage-collect an utterance mid-speech and never fire 'end'. */
let current: SpeechSynthesisUtterance | null = null;
/** Bumped by every speak() / stopSpeaking() so a running speakSequence() notices it was pre-empted. */
let epoch = 0;

/** Speak English text. Cancels any previous utterance. Resolves when finished (also on error / cancel). */
export function speak(text: string, opts: { rate?: number } = {}): Promise<void> {
  const s = synth();
  const clean = text.trim();
  if (!s || !clean || typeof SpeechSynthesisUtterance === 'undefined') return Promise.resolve();

  const settings = getSettings();
  // Must run synchronously inside the tap handler on iOS, so only use the voices already loaded.
  const voice = pickVoice(s.getVoices(), settings.ttsVoiceURI);

  epoch++;
  return new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = voice?.lang || 'en-US';
    if (voice) u.voice = voice;
    const rate = opts.rate ?? settings.ttsRate;
    u.rate = Math.min(1.5, Math.max(0.5, rate));
    const finish = () => {
      if (current === u) current = null;
      resolve();
    };
    u.onend = finish;
    u.onerror = finish;
    s.cancel();
    current = u;
    s.speak(u);
  });
}

export function stopSpeaking(): void {
  epoch++;
  const s = synth();
  if (s) s.cancel();
  current = null;
}

/** True while a `speak()` utterance is playing (used to ignore the microphone so TTS is not "heard"). */
export function isSpeaking(): boolean {
  if (current !== null) return true;
  const s = synth();
  return s ? s.speaking : false;
}

// ---------- two-voice dialogue ----------

const FEMALE_NAMES = /samantha|ava\b|allison|susan|victoria|karen|serena|kate|moira|tessa|fiona|zira|jenny|aria|nicky|joanna|salli|female/i;
const MALE_NAMES = /\balex\b|daniel|\btom\b|evan|aaron|oliver|arthur|david|mark|guy|gordon|male|rishi/i;

function isEnglishUsGb(v: SpeechSynthesisVoice): boolean {
  const lang = v.lang.replace('_', '-').toLowerCase();
  return (lang === 'en-us' || lang === 'en-gb') && !AVOID_NAMES.test(v.name);
}

/** Pure choice of two clearly different voices from `voices`: female + male when known, else two different voices. */
export function choosePair(voices: SpeechSynthesisVoice[]): [SpeechSynthesisVoice | null, SpeechSynthesisVoice | null] {
  const ranked = voices
    .filter(isEnglishUsGb)
    .sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name));
  if (ranked.length === 0) return [null, null];
  const female = ranked.find((v) => FEMALE_NAMES.test(v.name) && !MALE_NAMES.test(v.name));
  const male = ranked.find((v) => MALE_NAMES.test(v.name));
  if (female && male) return [female, male];
  const first = female ?? male ?? ranked[0];
  const other = ranked.find((v) => v.voiceURI !== first.voiceURI && v.name !== first.name);
  // Same voice twice: speakSequence callers separate the speakers with pitch (see pairPitches).
  return [first, other ?? first];
}

/** Two clearly different en-US / en-GB voices for speakers A and B (null = browser default). */
export async function pickVoicePair(): Promise<[SpeechSynthesisVoice | null, SpeechSynthesisVoice | null]> {
  return choosePair(await loadVoices());
}

/** Pitches (A, B) that keep two speakers apart: neutral when the voices differ, 1.2 / 0.8 when they are the same. */
export function pairPitches(pair: readonly [SpeechSynthesisVoice | null, SpeechSynthesisVoice | null]): [number, number] {
  const same = pair[0] === pair[1] || (pair[0] !== null && pair[1] !== null && pair[0].voiceURI === pair[1].voiceURI);
  return same ? [1.2, 0.8] : [1, 1];
}

export interface SequenceLine {
  text: string;
  voice?: SpeechSynthesisVoice | null;
  pitch?: number;
}

export interface SequenceOptions {
  rate: number;
  /** Silence between turns, default 350 ms. */
  gapMs?: number;
  /** Fired just before line `i` starts. */
  onLine?: (i: number) => void;
}

/**
 * Play lines one after another, each with its own voice / pitch. Cancel-safe: `stop()` (or any other speak() /
 * stopSpeaking() call) ends the sequence and resolves `done`. Every line has a watchdog because Safari sometimes
 * never fires `end`, and utterances are kept referenced so Safari cannot garbage-collect them mid-speech.
 */
export function speakSequence(lines: SequenceLine[], opts: SequenceOptions): { done: Promise<void>; stop(): void } {
  const s = synth();
  const gap = opts.gapMs ?? 350;
  const rate = Math.min(1.5, Math.max(0.5, opts.rate));
  epoch++;
  const myEpoch = epoch;
  let stopped = false;
  let wake: (() => void) | null = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (s && epoch === myEpoch) {
      epoch++;
      s.cancel();
    }
    current = null;
    wake?.();
  };
  const alive = () => !stopped && epoch === myEpoch;

  /** Resolves on `fire()`, after `ms`, or when stop() is called. */
  const wait = (ms: number, register: (fire: () => void) => void = () => undefined) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(fire, ms);
      function fire() {
        clearTimeout(timer);
        if (wake === fire) wake = null;
        resolve();
      }
      wake = fire;
      register(fire);
    });

  const run = async (): Promise<void> => {
    if (!s || typeof SpeechSynthesisUtterance === 'undefined') return;
    s.cancel();
    for (let i = 0; i < lines.length && alive(); i++) {
      const line = lines[i];
      const text = line.text.trim();
      if (text === '') continue;
      opts.onLine?.(i);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = line.voice?.lang || 'en-US';
      if (line.voice) u.voice = line.voice;
      u.rate = rate;
      if (line.pitch !== undefined) u.pitch = Math.min(2, Math.max(0, line.pitch));
      current = u;
      const budget = (text.length * 90) / rate + 4000;
      let cancelled = false;
      await wait(budget, (fire) => {
        u.onend = fire;
        u.onerror = (e) => {
          if (e.error === 'canceled' || e.error === 'interrupted') cancelled = true;
          fire();
        };
        s.speak(u);
      });
      if (current === u) current = null;
      if (cancelled) stopped = true;
      if (!alive()) break;
      if (i < lines.length - 1 && gap > 0) await wait(gap);
    }
  };

  const done = run().catch(() => undefined);
  return { done, stop };
}

// ---------- recognition ----------

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly length: number;
  readonly isFinal?: boolean;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  results: ArrayLike<RecognitionResult>;
}
interface RecognitionErrorEvent {
  error: string;
}
interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => RecognitionLike;

interface RecognitionWindow {
  SpeechRecognition?: RecognitionCtor;
  webkitSpeechRecognition?: RecognitionCtor;
}

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as RecognitionWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function recognitionSupported(): boolean {
  return recognitionCtor() !== null;
}

const RECOGNITION_ERRORS: Record<string, string> = {
  'no-speech': '没有听到声音，请靠近麦克风再说一次。',
  'audio-capture': '找不到可用的麦克风。',
  'not-allowed': '没有麦克风权限，请在系统设置中允许 Safari 使用麦克风和语音识别。',
  'service-not-allowed': '没有语音识别权限，请在系统设置中允许 Safari 使用语音识别。',
  network: '语音识别需要网络连接，请检查网络后重试。',
  aborted: '语音识别已取消。',
  'language-not-supported': '当前设备不支持英语语音识别。',
};

/** Listen once and resolve with the transcript. Rejects with a Chinese error message. */
export function listenOnce(lang = 'en-US'): Promise<string> {
  const Ctor = recognitionCtor();
  if (!Ctor) return Promise.reject(new Error('当前浏览器不支持语音识别。'));
  return new Promise<string>((resolve, reject) => {
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let settled = false;
    let transcript = '';
    const fail = (msg: string) => {
      if (settled) return;
      settled = true;
      reject(new Error(msg));
    };
    rec.onresult = (e) => {
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.length > 0) parts.push(r[0].transcript);
      }
      transcript = parts.join(' ').trim();
    };
    rec.onerror = (e) => fail(RECOGNITION_ERRORS[e.error] ?? '语音识别失败，请重试。');
    rec.onend = () => {
      if (settled) return;
      if (transcript) {
        settled = true;
        resolve(transcript);
      } else {
        fail(RECOGNITION_ERRORS['no-speech']);
      }
    };
    try {
      rec.start();
    } catch {
      fail('无法启动语音识别，请稍后重试。');
    }
  });
}

// ---------- streaming recognition ----------

export interface SpeechError {
  /** Raw SpeechRecognition error code ('not-allowed', 'network', ...) or 'unsupported' / 'start-failed'. */
  code: string;
  /** Chinese message for the user. */
  message: string;
  /** False for 'no-speech' / 'aborted': the session can simply be restarted. */
  fatal: boolean;
}

const STREAM_ERRORS: Record<string, string> = {
  'not-allowed': '麦克风权限被拒绝：请在浏览器/系统设置中允许本网站使用麦克风',
  'service-not-allowed':
    '语音识别不可用：在 Mac 上请到 系统设置 → 键盘 → 听写 打开“听写”（iPhone：设置 → 通用 → 键盘 → 启用听写）',
  'audio-capture': '没有检测到麦克风',
  network: '语音识别需要联网',
  'no-speech': '没有听到声音',
  'language-not-supported': '当前设备不支持英语语音识别',
  aborted: '语音识别已取消',
  unsupported: '当前浏览器不支持语音识别',
  'start-failed': '无法启动语音识别，请稍后重试',
};

/** Map a SpeechRecognition error code to a user-facing Chinese error. */
export function speechError(code: string): SpeechError {
  return {
    code,
    message: STREAM_ERRORS[code] ?? '语音识别出错，请重试',
    fatal: code !== 'no-speech' && code !== 'aborted',
  };
}

export interface ListenOptions {
  lang?: string;
  /**
   * Called on every interim / final update. `text` is the best transcript of everything heard since the
   * session started (or since the last `mark()`); `alternatives` are the same text built from the 2nd / 3rd
   * recognition hypotheses of each phrase (empty when the engine gives none).
   */
  onResult: (text: string, isFinal: boolean, alternatives: string[]) => void;
  onError?: (err: SpeechError) => void;
  /** The engine started capturing (after the permission prompt was accepted). */
  onStart?: () => void;
  /** The session ended: by stop() / abort(), by the browser (silence, time limit) or after an error. */
  onEnd?: () => void;
}

export interface ListenHandle {
  /** Stop listening; results already captured are still delivered, then onEnd fires. */
  stop(): void;
  /** Stop immediately and drop pending results. No further callbacks fire. */
  abort(): void;
  /** Forget everything heard so far: later onResult texts only contain speech from now on. */
  mark(): void;
}

const MAX_ALTERNATIVES = 3;

/**
 * Continuous recognition with interim results. Must be called inside a user gesture the first time
 * (Safari asks for microphone permission then). Safe when unsupported: reports an 'unsupported' error.
 */
export function startListening(opts: ListenOptions): ListenHandle {
  const Ctor = recognitionCtor();
  const noop: ListenHandle = { stop: () => undefined, abort: () => undefined, mark: () => undefined };
  if (!Ctor) {
    opts.onError?.(speechError('unsupported'));
    opts.onEnd?.();
    return noop;
  }

  const rec = new Ctor();
  rec.lang = opts.lang ?? 'en-US';
  rec.interimResults = true;
  rec.continuous = true;
  rec.maxAlternatives = MAX_ALTERNATIVES;

  let closed = false;
  let latest: ArrayLike<RecognitionResult> | null = null;
  let base = 0;
  /** Text of the interim phrase that was already under way at mark(): stripped from that phrase. */
  let skipPrefix = '';

  const text = (r: RecognitionResult, rank: number, index: number): string => {
    if (r.length === 0) return '';
    let t = r[Math.min(rank, r.length - 1)].transcript.trim();
    if (index === base && skipPrefix) {
      const stale = skipPrefix.toLowerCase();
      if (t.toLowerCase().startsWith(stale)) t = t.slice(stale.length).trim();
    }
    return t;
  };

  const build = (results: ArrayLike<RecognitionResult>, rank: number): string => {
    const parts: string[] = [];
    for (let i = base; i < results.length; i++) {
      const t = text(results[i], rank, i);
      if (t) parts.push(t);
    }
    return parts.join(' ');
  };

  const emit = () => {
    if (closed || !latest || latest.length <= base) return;
    const results = latest;
    let ranks = 1;
    for (let i = base; i < results.length; i++) ranks = Math.max(ranks, Math.min(MAX_ALTERNATIVES, results[i].length));
    const best = build(results, 0);
    if (!best) return;
    const alternatives: string[] = [];
    for (let k = 1; k < ranks; k++) {
      const alt = build(results, k);
      if (alt && alt !== best && !alternatives.includes(alt)) alternatives.push(alt);
    }
    const last = results[results.length - 1];
    opts.onResult(best, last.isFinal === true, alternatives);
  };

  rec.onstart = () => {
    if (!closed) opts.onStart?.();
  };
  rec.onresult = (e) => {
    latest = e.results;
    emit();
  };
  rec.onerror = (e) => {
    if (!closed) opts.onError?.(speechError(e.error));
  };
  rec.onend = () => {
    if (closed) return;
    closed = true;
    opts.onEnd?.();
  };

  try {
    rec.start();
  } catch {
    closed = true;
    opts.onError?.(speechError('start-failed'));
    opts.onEnd?.();
    return noop;
  }

  return {
    stop() {
      if (closed) return;
      try {
        rec.stop();
      } catch {
        // already stopped
      }
    },
    abort() {
      if (closed) return;
      closed = true;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.onstart = null;
      try {
        rec.abort();
      } catch {
        // already stopped
      }
    },
    mark() {
      if (!latest || latest.length === 0) {
        base = 0;
        skipPrefix = '';
        return;
      }
      const lastIndex = latest.length - 1;
      const last = latest[lastIndex];
      if (last.isFinal === true || last.length === 0) {
        base = latest.length;
        skipPrefix = '';
      } else {
        base = lastIndex;
        skipPrefix = last[0].transcript.trim();
      }
    },
  };
}
