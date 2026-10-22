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

/** Speak English text. Cancels any previous utterance. Resolves when finished (also on error / cancel). */
export function speak(text: string, opts: { rate?: number } = {}): Promise<void> {
  const s = synth();
  const clean = text.trim();
  if (!s || !clean || typeof SpeechSynthesisUtterance === 'undefined') return Promise.resolve();

  const settings = getSettings();
  // Must run synchronously inside the tap handler on iOS, so only use the voices already loaded.
  const voice = pickVoice(s.getVoices(), settings.ttsVoiceURI);

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
  const s = synth();
  if (s) s.cancel();
  current = null;
}

// ---------- recognition ----------

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly length: number;
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
