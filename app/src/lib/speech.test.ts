import { describe, expect, it } from 'vitest';
import { listenOnce, listVoices, pickVoice, recognitionSupported, speak } from './speech';

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
