import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  choosePair,
  listenOnce,
  listVoices,
  pairPitches,
  pickVoice,
  recognitionSupported,
  speak,
  speakSequence,
  speechError,
  startListening,
} from './speech';

function voice(name: string, lang: string, uri = name): SpeechSynthesisVoice {
  return { name, lang, voiceURI: uri, localService: true, default: false } as SpeechSynthesisVoice;
}

describe('speech (jsdom, no speechSynthesis)', () => {
  it('degrades gracefully', async () => {
    await expect(speak('hello')).resolves.toBeUndefined();
    await expect(listVoices()).resolves.toEqual([]);
    expect(recognitionSupported()).toBe(false);
    await expect(listenOnce()).rejects.toThrow('不支持');
  });
});

describe('pickVoice', () => {
  const voices = [
    voice('Anna', 'de-DE'),
    voice('Daniel', 'en-GB'),
    voice('Bubbles', 'en-US'),
    voice('Samantha', 'en-US'),
    voice('Fred', 'en-US'),
  ];

  it('prefers a good en-US voice and avoids novelty voices', () => {
    expect(pickVoice(voices, '')?.name).toBe('Samantha');
  });

  it('honours the saved voice URI', () => {
    expect(pickVoice(voices, 'Daniel')?.name).toBe('Daniel');
  });

  it('returns null when no English voice exists', () => {
    expect(pickVoice([voice('Anna', 'de-DE')], '')).toBeNull();
  });
});

describe('startListening', () => {
  interface Phrase {
    isFinal: boolean;
    length: number;
    [i: number]: { transcript: string };
  }
  class Fake {
    static last: Fake | null = null;
    lang = '';
    interimResults = false;
    continuous = false;
    maxAlternatives = 0;
    onresult: ((e: { results: Phrase[] }) => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    onstart: (() => void) | null = null;
    started = 0;
    stopped = 0;
    aborted = 0;
    constructor() {
      Fake.last = this;
    }
    start() {
      this.started++;
    }
    stop() {
      this.stopped++;
    }
    abort() {
      this.aborted++;
    }
  }
  const phrase = (isFinal: boolean, ...alts: string[]): Phrase => {
    const p: Phrase = { isFinal, length: alts.length };
    alts.forEach((t, i) => {
      p[i] = { transcript: t };
    });
    return p;
  };
  const install = () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = Fake;
  };
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    Fake.last = null;
  });

  it('configures continuous interim recognition with alternatives and reports results', () => {
    install();
    const onResult = vi.fn();
    const onStart = vi.fn();
    startListening({ onResult, onStart });
    const rec = Fake.last as Fake;
    expect(rec).toMatchObject({ lang: 'en-US', interimResults: true, continuous: true, maxAlternatives: 3, started: 1 });
    rec.onstart?.();
    expect(onStart).toHaveBeenCalled();

    rec.onresult?.({ results: [phrase(false, 'I give', 'I gave', 'a give')] });
    expect(onResult).toHaveBeenLastCalledWith('I give', false, ['I gave', 'a give']);
    rec.onresult?.({ results: [phrase(true, 'I give him', 'I gave him'), phrase(false, 'the apple')] });
    expect(onResult).toHaveBeenLastCalledWith('I give him the apple', false, ['I gave him the apple']);
  });

  it('mark() keeps only speech after it, also for a phrase already under way', () => {
    install();
    const onResult = vi.fn();
    const h = startListening({ onResult });
    const rec = Fake.last as Fake;
    rec.onresult?.({ results: [phrase(true, 'first sentence')] });
    h.mark();
    rec.onresult?.({ results: [phrase(true, 'first sentence'), phrase(false, 'second')] });
    expect(onResult).toHaveBeenLastCalledWith('second', false, []);

    // mark while the phrase is still interim: its old text is dropped from later updates
    rec.onresult?.({ results: [phrase(true, 'first sentence'), phrase(false, 'second one')] });
    h.mark();
    onResult.mockClear();
    rec.onresult?.({ results: [phrase(true, 'first sentence'), phrase(false, 'second one')] }); // nothing new
    expect(onResult).not.toHaveBeenCalled();
    rec.onresult?.({ results: [phrase(true, 'first sentence'), phrase(true, 'second one third')] });
    expect(onResult).toHaveBeenLastCalledWith('third', true, []);
  });

  it('maps errors to Chinese messages', () => {
    expect(speechError('not-allowed').message).toBe('麦克风权限被拒绝：请在浏览器/系统设置中允许本网站使用麦克风');
    expect(speechError('service-not-allowed').message).toContain('系统设置 → 键盘 → 听写');
    expect(speechError('service-not-allowed').message).toContain('设置 → 通用 → 键盘 → 启用听写');
    expect(speechError('audio-capture').message).toBe('没有检测到麦克风');
    expect(speechError('network').message).toBe('语音识别需要联网');
    expect(speechError('no-speech')).toMatchObject({ message: '没有听到声音', fatal: false });
    expect(speechError('aborted').fatal).toBe(false);
    expect(speechError('not-allowed').fatal).toBe(true);

    install();
    const onError = vi.fn();
    const onEnd = vi.fn();
    startListening({ onResult: () => undefined, onError, onEnd });
    const rec = Fake.last as Fake;
    rec.onerror?.({ error: 'network' });
    rec.onend?.();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'network', message: '语音识别需要联网' }));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('stop() asks the engine to stop; abort() silences all later callbacks', () => {
    install();
    const onResult = vi.fn();
    const onEnd = vi.fn();
    const h = startListening({ onResult, onEnd });
    const rec = Fake.last as Fake;
    h.stop();
    expect(rec.stopped).toBe(1);
    h.abort();
    expect(rec.aborted).toBe(1);
    expect(rec.onresult).toBeNull();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('reports "unsupported" when the browser has no recognizer', () => {
    const onError = vi.fn();
    const onEnd = vi.fn();
    const h = startListening({ onResult: () => undefined, onError, onEnd });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'unsupported' }));
    expect(onEnd).toHaveBeenCalled();
    expect(() => {
      h.stop();
      h.abort();
      h.mark();
    }).not.toThrow();
  });

  it('reports start failures', () => {
    class Boom extends Fake {
      start() {
        throw new Error('already started');
      }
    }
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = Boom;
    const onError = vi.fn();
    startListening({ onResult: () => undefined, onError });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'start-failed' }));
  });
});

describe('pickVoicePair / choosePair', () => {
  it('prefers a female + male Apple pair', () => {
    const [a, b] = choosePair([
      voice('Alex', 'en-US'),
      voice('Samantha', 'en-US'),
      voice('Daniel', 'en-GB'),
      voice('Anna', 'de-DE'),
    ]);
    expect(a?.name).toBe('Samantha');
    expect(b?.name).toBe('Alex');
  });

  it('falls back to two different voices, then to the same voice with different pitch', () => {
    const [a, b] = choosePair([voice('Voice One', 'en-US'), voice('Voice Two', 'en-GB')]);
    expect(a?.name).not.toBe(b?.name);
    const same = choosePair([voice('Only', 'en-US')]);
    expect(same[0]).toBe(same[1]);
    const [pa, pb] = pairPitches(same);
    expect(pa).toBeGreaterThan(pb);
    expect(pairPitches([a, b])).toEqual([1, 1]);
    expect(choosePair([voice('Anna', 'de-DE')])).toEqual([null, null]);
  });
});

describe('speakSequence', () => {
  interface FakeUtterance {
    text: string;
    voice: SpeechSynthesisVoice | null;
    pitch: number;
    rate: number;
    lang: string;
    onend: (() => void) | null;
    onerror: ((e: { error: string }) => void) | null;
  }
  const queue: FakeUtterance[] = [];
  const cancel = vi.fn(() => {
    const pending = queue.splice(0);
    for (const u of pending) u.onerror?.({ error: 'canceled' });
  });

  beforeEach(() => {
    queue.length = 0;
    cancel.mockClear();
    class FakeU {
      text: string;
      voice: SpeechSynthesisVoice | null = null;
      pitch = 1;
      rate = 1;
      lang = '';
      onend: (() => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      constructor(t: string) {
        this.text = t;
      }
    }
    vi.stubGlobal('SpeechSynthesisUtterance', FakeU);
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => [],
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      speak: (u: FakeUtterance) => queue.push(u),
      cancel,
      speaking: false,
    });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const finishNext = () => {
    const u = queue.shift();
    u?.onend?.();
    return u;
  };

  it('plays lines in order with voice, pitch and rate, reporting each line', async () => {
    const v1 = voice('Samantha', 'en-US');
    const seen: number[] = [];
    const h = speakSequence(
      [
        { text: 'Hi there.', voice: v1, pitch: 1.2 },
        { text: 'Hello!', pitch: 0.8 },
      ],
      { rate: 0.9, gapMs: 100, onLine: (i) => seen.push(i) },
    );
    expect(queue).toHaveLength(1);
    expect(seen).toEqual([0]);
    const first = finishNext();
    expect(first?.voice).toBe(v1);
    expect(first?.pitch).toBe(1.2);
    expect(first?.rate).toBe(0.9);
    expect(queue).toHaveLength(0); // waits for the gap
    await vi.advanceTimersByTimeAsync(100);
    expect(seen).toEqual([0, 1]);
    expect(queue[0].text).toBe('Hello!');
    finishNext();
    await vi.advanceTimersByTimeAsync(0);
    await expect(h.done).resolves.toBeUndefined();
  });

  it('stop() cancels the current line, skips the rest and resolves done', async () => {
    const h = speakSequence([{ text: 'One' }, { text: 'Two' }], { rate: 1 });
    expect(queue).toHaveLength(1);
    h.stop();
    await vi.advanceTimersByTimeAsync(500);
    await expect(h.done).resolves.toBeUndefined();
    expect(queue).toHaveLength(0);
    expect(cancel).toHaveBeenCalled();
  });

  it('ends when another speak() pre-empts it, and survives a missing end event via the watchdog', async () => {
    const h = speakSequence([{ text: 'One' }, { text: 'Two' }], { rate: 1, gapMs: 0 });
    void speak('Interrupt'); // cancels our utterance -> 'canceled'
    await vi.advanceTimersByTimeAsync(10);
    await expect(h.done).resolves.toBeUndefined();
    expect(queue.map((u) => u.text)).toEqual(['Interrupt']);

    queue.length = 0;
    const h2 = speakSequence([{ text: 'Stuck' }, { text: 'Next' }], { rate: 1, gapMs: 0 });
    await vi.advanceTimersByTimeAsync(5000); // no 'end' ever fires
    expect(queue.map((u) => u.text)).toEqual(['Stuck', 'Next']);
    h2.stop();
  });
});
