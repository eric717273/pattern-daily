import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEED_FRAMES } from '../../content';
import { buildCombo } from '../../lib/frameEngine';
import { picksFromExample } from '../../lib/drill';
import { AnchorDrill } from './AnchorDrill';

const frame = SEED_FRAMES[0];
const target = buildCombo(frame, picksFromExample(frame, frame.examples[0])).en;

class Fake {
  static last: Fake | null = null;
  lang = '';
  interimResults = false;
  continuous = false;
  maxAlternatives = 1;
  onresult: ((e: { results: { length: number; 0: { transcript: string } }[] }) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    Fake.last = this;
  }
  start() {}
  stop() {}
  abort() {}
}

async function hear(text: string) {
  await act(async () => {
    Fake.last?.onresult?.({ results: [{ length: 1, 0: { transcript: text } }] });
    Fake.last?.onend?.();
  });
}

const w = window as unknown as Record<string, unknown>;
beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  w.webkitSpeechRecognition = Fake;
});
afterEach(() => {
  delete w.webkitSpeechRecognition;
  vi.useRealTimers();
});

describe('AnchorDrill voice mode', () => {
  it('counts a read-aloud only when the recognized speech matches the sentence', async () => {
    render(<AnchorDrill frame={frame} onDone={() => undefined} />);
    expect(screen.getByRole('switch', { name: /语音验证/ })).toHaveAttribute('aria-checked', 'true');

    // playing the model sentence does not count any more
    fireEvent.click(screen.getByRole('button', { name: '听示范' }));
    expect(screen.getByText('跟读 3 遍：0 / 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /我来读/ }));
    await hear('something else entirely');
    expect(screen.getByText('跟读 3 遍：0 / 3')).toBeInTheDocument();
    expect(screen.getByText(/再读一次/)).toBeInTheDocument();

    for (let i = 1; i <= 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: /我来读/ }));
      await hear(target.toLowerCase().replace(/[.?!]$/, ''));
      expect(screen.getByText(`跟读 3 遍：${i} / 3`)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: '下一步：单槽快替' })).toBeEnabled();
  });

  it('with the switch off, taps count as before', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(10_000);
    render(<AnchorDrill frame={frame} onDone={() => undefined} />);
    fireEvent.click(screen.getByRole('switch', { name: /语音验证/ }));
    expect(localStorage.getItem('pd.swapVoice')).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: /^听并跟读/ }));
    expect(screen.getByText('跟读 3 遍：1 / 3')).toBeInTheDocument();
  });

  it('without recognition support there is no switch and taps count', () => {
    delete w.webkitSpeechRecognition;
    render(<AnchorDrill frame={frame} onDone={() => undefined} />);
    expect(screen.queryByRole('switch', { name: /语音验证/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^听并跟读/ }));
    expect(screen.getByText('跟读 3 遍：1 / 3')).toBeInTheDocument();
  });
});
