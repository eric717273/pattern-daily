import { getSettings } from './settings';

/** Browser TTS (speechSynthesis) and speech recognition (webkitSpeechRecognition). Safe on SSR / jsdom. */

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  return 'speechSynthesis' in window && window.speechSynthesis ? window.speechSynthesis : null;
}

// ---------- voices ----------

export type VoiceQuality = 'premium' | 'enhanced' | 'standard' | 'novelty';

/** Robotic / novelty voices (classic Mac fun voices and the Eloquence set) that must never be picked automatically. */
const NOVELTY_NAMES =
  /^(albert|bad news|bahh|bells|boing|bubbles|cellos|eddy|flo|fred|good news|grandma|grandpa|jester|junior|kathy|organ|ralph|reed|rocko|sandy|shelley|superstar|trinoids|whisper|wobble|zarvox)(\b|\s*\()/i;
const NOVELTY_URI_TAIL = /speech\.synthesis\.voice\.(albert|bad ?news|bahh|bells|boing|bubbles|cellos|fred|good ?news|jester|junior|kathy|organ|ralph|superstar|trinoids|whisper|wobble|zarvox)$/i;

/** Standard (non-downloaded) voices that still sound decent, best first. */
const KNOWN_GOOD: readonly RegExp[] = [
  /^samantha\b/i,
  /^alex\b/i,
  /^daniel\b/i,
  /^karen\b/i,
  /^moira\b/i,
  /google us english/i,
  /microsoft .*online.*\(natural\)/i,
  /\(natural\)/i,
];

const langOf = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-').toLowerCase();

/** Quality class of a voice: downloaded premium / enhanced Apple voices beat the stock ones; novelty voices are junk. */
export function voiceQuality(v: SpeechSynthesisVoice): VoiceQuality {
  const uri = v.voiceURI ?? '';
  if (/eloquence/i.test(uri) || NOVELTY_NAMES.test(v.name) || NOVELTY_URI_TAIL.test(uri)) return 'novelty';
  if (/premium/i.test(v.name) || /\.premium\./i.test(uri)) return 'premium';
  if (/enhanced/i.test(v.name) || /\.enhanced\./i.test(uri)) return 'enhanced';
  return 'standard';
}

const TIER: Record<VoiceQuality, number> = { premium: 3, enhanced: 2, standard: 0, novelty: -1 };

function knownGoodIndex(v: SpeechSynthesisVoice): number {
  const i = KNOWN_GOOD.findIndex((re) => re.test(v.name));
  return i < 0 ? KNOWN_GOOD.length : i;
}

/** 3 premium, 2 enhanced, 1 known-good standard, 0 other standard, -1 novelty. */
function tierOf(v: SpeechSynthesisVoice): number {
  const q = voiceQuality(v);
  if (q === 'standard') return knownGoodIndex(v) < KNOWN_GOOD.length ? 1 : 0;
  return TIER[q];
}

/** 0 en-US, 1 en-GB / en-AU / en-IE, 2 other English, -1 not English. */
function langGroup(v: SpeechSynthesisVoice): number {
  const l = langOf(v);
  if (l === 'en-us') return 0;
  if (l === 'en-gb' || l === 'en-au' || l === 'en-ie') return 1;
  return l.startsWith('en') ? 2 : -1;
}

/**
 * English voices, best first, novelty voices removed: premium > enhanced > known-good standard > other standard
 * (within a class en-US, then en-GB / en-AU / en-IE; other English accents come after the main four).
 */
export function rankVoices(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices
    .filter((v) => langGroup(v) >= 0 && voiceQuality(v) !== 'novelty')
    .sort((a, b) => {
      const ga = langGroup(a) === 2 ? 1 : 0;
      const gb = langGroup(b) === 2 ? 1 : 0;
      return (
        ga - gb ||
        tierOf(b) - tierOf(a) ||
        langGroup(a) - langGroup(b) ||
        knownGoodIndex(a) - knownGoodIndex(b) ||
        (b.localService ? 1 : 0) - (a.localService ? 1 : 0) ||
        a.name.localeCompare(b.name)
      );
    });
}

/** True when a downloaded premium / enhanced English voice is installed. */
export function hasHighQualityVoice(voices: readonly SpeechSynthesisVoice[]): boolean {
  return rankVoices(voices).some((v) => {
    const q = voiceQuality(v);
    return q === 'premium' || q === 'enhanced';
  });
}

/** Choose the voice: the user's saved voice, else the best-ranked English voice. */
export function pickVoice(voices: SpeechSynthesisVoice[], voiceURI: string): SpeechSynthesisVoice | null {
  if (voiceURI) {
    const chosen = voices.find((v) => v.voiceURI === voiceURI);
    if (chosen) return chosen;
  }
  return rankVoices(voices)[0] ?? null;
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
  return rankVoices(await loadVoices());
}

// Warm the voice list up as early as possible so the first tap already has voices.
void loadVoices();

// ---------- speaking ----------

/** Keep a reference: Safari can garbage-collect an utterance mid-speech and never fire 'end'. */
let current: SpeechSynthesisUtterance | null = null;
/** Bumped by every speak() / stopSpeaking() so a running speakSequence() notices it was pre-empted. */
let epoch = 0;

/** Speak English text. Cancels any previous utterance. Resolves when finished (also on error / cancel). */
export function speak(text: string, opts: { rate?: number; voice?: SpeechSynthesisVoice } = {}): Promise<void> {
  const s = synth();
  const clean = text.trim();
  if (!s || !clean || typeof SpeechSynthesisUtterance === 'undefined') return Promise.resolve();

  const settings = getSettings();
  // Must run synchronously inside the tap handler on iOS, so only use the voices already loaded.
  const voice = opts.voice ?? pickVoice(s.getVoices(), settings.ttsVoiceURI);

  epoch++;
  return new Promise<void>((resolve) => {
    try {
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = voice?.lang || 'en-US';
      if (voice) u.voice = voice;
      const rate = opts.rate ?? settings.ttsRate;
      u.rate = Math.min(1.5, Math.max(0.5, rate));
      // Safari sometimes never fires 'end': a watchdog keeps `current` (and callers awaiting us) from sticking forever.
      let watchdog: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (watchdog !== null) clearTimeout(watchdog);
        watchdog = null;
        if (current === u) current = null;
        resolve();
      };
      u.onend = finish;
      u.onerror = finish;
      watchdog = setTimeout(finish, (clean.length * 90) / u.rate + 4000);
      s.cancel();
      current = u;
      s.speak(u);
    } catch {
      current = null;
      resolve();
    }
  });
}

export function stopSpeaking(): void {
  epoch++;
  current = null;
  try {
    synth()?.cancel();
  } catch {
    // speech synthesis unavailable
  }
}

/** True while a `speak()` utterance is playing (used to ignore the microphone so TTS is not "heard"). */
export function isSpeaking(): boolean {
  if (current !== null) return true;
  try {
    return synth()?.speaking ?? false;
  } catch {
    return false;
  }
}

// ---------- two-voice dialogue ----------

const FEMALE_NAMES =
  /samantha|\bava\b|allison|susan|victoria|karen|serena|kate|moira|tessa|fiona|zoe|joelle|noelle|stephanie|zira|jenny|aria|nicky|joanna|salli|\bfemale\b/i;
const MALE_NAMES = /\balex\b|daniel|\btom\b|evan|nathan|aaron|oliver|arthur|david|\bmark\b|\bguy\b|gordon|rishi|\blee\b|\bmale\b/i;

const isFemale = (v: SpeechSynthesisVoice) => FEMALE_NAMES.test(v.name) && !MALE_NAMES.test(v.name);
const isMale = (v: SpeechSynthesisVoice) => MALE_NAMES.test(v.name);

/**
 * Pure choice of two clearly different voices from `voices`: the best voice plus the best voice of the other gender
 * that is about as good (female first when both genders are known), else any other voice, else the same voice twice.
 */
export function choosePair(voices: SpeechSynthesisVoice[]): [SpeechSynthesisVoice | null, SpeechSynthesisVoice | null] {
  const ranked = rankVoices(voices).filter((v) => langGroup(v) <= 1);
  if (ranked.length === 0) return [null, null];
  const first = ranked[0];
  // Keep both voices high quality when the best one is; a stock voice may be paired with any stock voice.
  const minTier = Math.min(tierOf(first), 2);
  const good = ranked.filter((v) => v !== first && tierOf(v) >= minTier && v.name !== first.name);
  const firstIsFemale = isFemale(first);
  const firstIsMale = isMale(first);
  const opposite = good.find((v) => (firstIsFemale ? isMale(v) : firstIsMale ? isFemale(v) : isFemale(v) || isMale(v)));
  const other = opposite ?? good[0] ?? ranked.find((v) => v !== first && v.name !== first.name);
  if (!other) return [first, first];
  // Same voice twice is handled by pairPitches; here the voices differ. Female speaks first when known.
  if (isMale(first) && isFemale(other)) return [other, first];
  return [first, other];
}

/** Two clearly different, high-quality en-US / en-GB voices for speakers A and B (null = browser default). */
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
  onaudiostart: (() => void) | null;
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

const LISTEN_START_MS = 4000;
const LISTEN_MAX_MS = 15_000;

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
    let started = false;
    let transcript = '';
    const timers: ReturnType<typeof setTimeout>[] = [];
    const clearTimers = () => {
      timers.forEach(clearTimeout);
      timers.length = 0;
    };
    const fail = (msg: string) => {
      if (settled) return;
      settled = true;
      clearTimers();
      try {
        rec.abort();
      } catch {
        // already stopped
      }
      reject(new Error(msg));
    };
    const markStarted = () => {
      started = true;
    };
    rec.onstart = markStarted;
    rec.onaudiostart = markStarted;
    // Watchdogs: a recognizer that never starts, or never ends, must not leave the button spinning forever.
    timers.push(setTimeout(() => !started && fail(START_TIMEOUT_MESSAGE), LISTEN_START_MS));
    timers.push(setTimeout(() => fail(RECOGNITION_ERRORS['no-speech']), LISTEN_MAX_MS));
    rec.onresult = (e) => {
      started = true;
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
        clearTimers();
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
  /** Raw SpeechRecognition error code ('not-allowed', 'network', ...) or 'unsupported' / 'start-failed' / 'start-timeout'. */
  code: string;
  /** Chinese message for the user. */
  message: string;
  /** False for 'no-speech' / 'aborted': the session can simply be restarted. */
  fatal: boolean;
}

/** Shown when the recognizer never reported that it started (Dictation off, permission stuck, Safari quirk). */
export const START_TIMEOUT_MESSAGE =
  '麦克风没有启动。请检查：Mac 到 系统设置 → 键盘 → 听写，打开“听写”；iPhone 到 设置 → 通用 → 键盘 → 启用听写；并在 Safari 网站设置 → 麦克风 中选“允许”';

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
  'start-timeout': START_TIMEOUT_MESSAGE,
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
  /** The engine started capturing (first of onstart / onaudiostart / first result; fires once). */
  onStart?: () => void;
  /**
   * Start watchdog: when the engine reports no start within this many ms of start(), the session is aborted and
   * onError('start-timeout') + onEnd fire. Waits while the page is hidden (the permission prompt). Default: off.
   */
  startTimeoutMs?: number;
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
/** Extra start-watchdog periods granted while the page is hidden (permission prompt). */
const MAX_HIDDEN_WAITS = 5;

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

  let started = false;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const clearWatchdog = () => {
    if (watchdog !== null) clearTimeout(watchdog);
    watchdog = null;
  };
  const markStarted = () => {
    if (closed || started) return;
    started = true;
    clearWatchdog();
    opts.onStart?.();
  };
  const detach = () => {
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    rec.onstart = null;
    rec.onaudiostart = null;
  };

  rec.onstart = markStarted;
  rec.onaudiostart = markStarted;
  rec.onresult = (e) => {
    markStarted();
    latest = e.results;
    emit();
  };
  rec.onerror = (e) => {
    if (!closed) opts.onError?.(speechError(e.error));
  };
  rec.onend = () => {
    if (closed) return;
    closed = true;
    clearWatchdog();
    opts.onEnd?.();
  };

  try {
    rec.start();
  } catch {
    closed = true;
    detach();
    opts.onError?.(speechError('start-failed'));
    opts.onEnd?.();
    return noop;
  }

  const timeoutMs = opts.startTimeoutMs;
  if (timeoutMs !== undefined && timeoutMs > 0) {
    let waits = 0;
    const arm = () => {
      watchdog = setTimeout(() => {
        watchdog = null;
        if (closed || started) return;
        // The permission prompt can hide the page for a while: do not blame the microphone yet.
        if (waits < MAX_HIDDEN_WAITS && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          waits++;
          arm();
          return;
        }
        closed = true;
        detach();
        try {
          rec.abort();
        } catch {
          // already stopped
        }
        opts.onError?.(speechError('start-timeout'));
        opts.onEnd?.();
      }, timeoutMs);
    };
    arm();
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
      clearWatchdog();
      detach();
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
