import { act } from '@testing-library/react';

/** Test helper: a controllable SpeechRecognition for the chunk-track drill tests. */

interface FakeResult {
  isFinal: boolean;
  length: number;
  [i: number]: { transcript: string };
}

export class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  interimResults = false;
  continuous = false;
  maxAlternatives = 1;
  onresult: ((e: { results: FakeResult[] }) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  aborted = false;
  private results: FakeResult[] = [];

  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.onstart?.();
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.aborted = true;
  }

  /** Streaming recognizer: replace the phrase at `index` (or append) like a real engine. */
  say(text: string, opts: { final?: boolean; alternatives?: string[]; index?: number } = {}) {
    const alts = [text, ...(opts.alternatives ?? [])];
    const r: FakeResult = { isFinal: opts.final ?? false, length: alts.length };
    alts.forEach((t, i) => {
      r[i] = { transcript: t };
    });
    const index = opts.index ?? Math.max(0, this.results.length - (this.results.at(-1)?.isFinal === false ? 1 : 0));
    this.results[index] = r;
    act(() => this.onresult?.({ results: [...this.results] }));
  }

  /** One-shot recognizer (MicButton): deliver a final result, then end the session. */
  async hear(text: string) {
    await act(async () => {
      this.results = [{ isFinal: true, length: 1, 0: { transcript: text } }];
      this.onresult?.({ results: [...this.results] });
      this.onend?.();
    });
  }

  fail(error: string) {
    act(() => {
      this.onerror?.({ error });
      this.onend?.();
    });
  }
}

export const liveRecognition = (): FakeRecognition => FakeRecognition.instances.at(-1) as FakeRecognition;

export function installRecognition(supported: boolean): void {
  FakeRecognition.instances = [];
  const w = window as unknown as Record<string, unknown>;
  if (supported) w.webkitSpeechRecognition = FakeRecognition;
  else delete w.webkitSpeechRecognition;
}
