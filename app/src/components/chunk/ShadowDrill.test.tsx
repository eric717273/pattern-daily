import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHUNKS, SEED_FRAMES, getChunk } from '../../content';
import type { Chunk } from '../../types';

const spoken = vi.hoisted(() => [] as string[]);
vi.mock('../../lib/speech', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/speech')>();
  return {
    ...actual,
    speak: (text: string) => {
      spoken.push(text);
      return Promise.resolve();
    },
  };
});

import { installRecognition, liveRecognition } from './fakeRecognition';
import { ShadowDrill } from './ShadowDrill';

const chunk = (id: string): Chunk => {
  const c = getChunk(id);
  if (!c) throw new Error(id);
  return c;
};
const item = { kind: 'chunk' as const, chunk: chunk('c003') }; // Long time no see.

const mic = () => screen.getByRole('button', { name: /我来读/ });

async function say(text: string) {
  fireEvent.click(mic());
  await liveRecognition().hear(text);
}

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  spoken.length = 0;
  installRecognition(true);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  installRecognition(false);
});

describe('ShadowDrill with speech recognition', () => {
  it('shows the chunk, its Chinese and the 听力提示 to imitate', () => {
    render(<ShadowDrill item={item} onDone={() => undefined} />);
    expect(screen.getByTestId('shadow-text')).toHaveTextContent('Long time no see.');
    expect(screen.getByTestId('sound-tip')).toHaveTextContent('模仿这个音');
    if (item.chunk.soundZh) expect(screen.getByTestId('sound-tip')).toHaveTextContent(item.chunk.soundZh);
    expect(screen.getByRole('switch', { name: /语音验证/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('a repetition only counts when it was recognised (>= 0.8); three recognised reps finish, verified', async () => {
    const onDone = vi.fn();
    render(<ShadowDrill item={item} onDone={onDone} />);
    const done = () => screen.getByRole('button', { name: /跟读 \d+ 遍后继续|完成跟读/ });
    expect(done()).toBeDisabled();

    await say('nice to meet you'); // wrong
    expect(screen.getByTestId('shadow-heard')).toHaveTextContent('再读一次');
    expect(screen.getByText('跟读 3 遍：0 / 3')).toBeInTheDocument();

    await say('long time no see');
    await say('Long time, no see!');
    expect(screen.getByText('跟读 3 遍：2 / 3')).toBeInTheDocument();
    expect(done()).toBeDisabled();
    await say('long time no see');
    expect(screen.getByText('跟读 3 遍：3 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '完成跟读' }));
    expect(onDone).toHaveBeenCalledWith({ reps: 3, verified: true });
  });

  it('tapping 听示范 plays the chunk but does not count', () => {
    render(<ShadowDrill item={item} onDone={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: '听示范' }));
    expect(spoken).toEqual(['Long time no see.']);
    expect(screen.getByText('跟读 3 遍：0 / 3')).toBeInTheDocument();
  });

  it('after turning voice verification off, taps count and the result is unverified', () => {
    const onDone = vi.fn();
    render(<ShadowDrill item={item} onDone={onDone} />);
    fireEvent.click(screen.getByRole('switch', { name: /语音验证/ }));
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: /听并跟读/ }));
      act(() => {
        vi.advanceTimersByTime(500);
      });
    }
    expect(spoken).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '完成跟读' }));
    expect(onDone).toHaveBeenCalledWith({ reps: 3, verified: false });
  });

  it('uses the open chunk text without the … and accepts a longer utterance', async () => {
    const open = CHUNKS.find((c) => c.en.includes('…')) as Chunk;
    const onDone = vi.fn();
    render(<ShadowDrill item={{ kind: 'chunk', chunk: open }} onDone={onDone} />);
    expect(screen.getByTestId('shadow-text').textContent).not.toContain('…');
    fireEvent.click(screen.getByRole('button', { name: '听示范' }));
    expect(spoken[0]).not.toContain('…');
    await say(`${open.en.replace(/\s*…\??$/, '')} the report`);
    expect(screen.getByText('跟读 3 遍：1 / 3')).toBeInTheDocument();
  });

  it('frames: shadows a full model sentence (matched against the whole sentence)', async () => {
    const frame = SEED_FRAMES[0];
    render(<ShadowDrill item={{ kind: 'frame', frame }} onDone={() => undefined} />);
    const sentence = screen.getByTestId('shadow-text').textContent ?? '';
    expect(sentence).toBe(frame.examples[0].en);
    await say(sentence.toLowerCase());
    expect(screen.getByText('跟读 3 遍：1 / 3')).toBeInTheDocument();
  });
});

describe('ShadowDrill without speech recognition', () => {
  it('counts every tap on 听并跟读 (no mic, no voice toggle)', () => {
    installRecognition(false);
    const onDone = vi.fn();
    render(<ShadowDrill item={item} onDone={onDone} />);
    expect(screen.queryByRole('switch', { name: /语音验证/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /我来读/ })).not.toBeInTheDocument();
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: /听并跟读/ }));
      act(() => {
        vi.advanceTimersByTime(500);
      });
    }
    fireEvent.click(screen.getByRole('button', { name: '完成跟读' }));
    expect(onDone).toHaveBeenCalledWith({ reps: 3, verified: false });
  });
});
