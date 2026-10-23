import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHUNKS, SEED_FRAMES, getChunk } from '../../content';
import type { Chunk } from '../../types';
import { buildListenQuestion } from '../../lib/chunkDrill';
import { seededRng } from '../../lib/drill';

const spoken = vi.hoisted(() => [] as { text: string; rate?: number }[]);
vi.mock('../../lib/speech', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/speech')>();
  return {
    ...actual,
    speak: (text: string, opts?: { rate?: number }) => {
      spoken.push({ text, rate: opts?.rate });
      return Promise.resolve();
    },
    stopSpeaking: () => undefined,
  };
});

import { saveSettings } from '../../lib/settings';
import { ListenDrill } from './ListenDrill';

const chunk = (id: string): Chunk => {
  const c = getChunk(id);
  if (!c) throw new Error(id);
  return c;
};

beforeEach(() => {
  spoken.length = 0;
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});

const item = { kind: 'chunk' as const, chunk: chunk('c003') }; // Long time no see.
const seed = 11;
const question = () => buildListenQuestion(item, CHUNKS, seededRng(seed));

function optionButtons() {
  return within(screen.getByRole('group', { name: '选项' })).getAllByRole('button');
}

describe('ListenDrill (chunk)', () => {
  it('asks 你听到了哪个语块？ with 4 options, disabled until the sentence was played', () => {
    render(<ListenDrill item={item} rng={seededRng(seed)} onDone={() => undefined} />);
    expect(screen.getByText('你听到了哪个语块？')).toBeInTheDocument();
    const buttons = optionButtons();
    expect(buttons).toHaveLength(4);
    expect(buttons.every((b) => b.hasAttribute('disabled'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    expect(optionButtons().every((b) => !b.hasAttribute('disabled'))).toBe(true);
  });

  it('plays the example at natural speed (rate 1.0) whatever the TTS setting, and never shows it before the answer', () => {
    saveSettings({ ttsRate: 0.6 });
    const q = question();
    const { container } = render(<ListenDrill item={item} rng={seededRng(seed)} onDone={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    expect(spoken).toEqual([{ text: q.sentence, rate: 1 }]);
    // the played sentence is not on screen, nor is its translation or the listening tip
    expect(container.innerHTML).not.toContain(q.sentence);
    expect(screen.queryByTestId('listen-sentence')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sound-tip')).not.toBeInTheDocument();
    expect(screen.queryByText(q.sentenceZh)).not.toBeInTheDocument();
  });

  it('a correct pick reveals the sentence with the chunk highlighted, the Chinese and the 听力提示', () => {
    const q = question();
    const onDone = vi.fn();
    render(<ListenDrill item={item} rng={seededRng(seed)} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    const answer = optionButtons().find((b) => b.textContent?.includes(item.chunk.en)) as HTMLElement;
    expect(answer).toBeDefined();
    fireEvent.click(answer);
    expect(screen.getByTestId('listen-result')).toHaveTextContent('一遍就听对了');
    expect(screen.getByTestId('listen-sentence')).toHaveTextContent(q.sentence);
    expect(screen.getByTestId('listen-sentence').querySelector('mark')).toHaveTextContent(/long time no see/i);
    expect(screen.getByTestId('listen-zh')).toHaveTextContent(q.sentenceZh);
    if (item.chunk.soundZh) expect(screen.getByTestId('sound-tip')).toHaveTextContent(item.chunk.soundZh);
    expect(answer).toHaveAttribute('data-state', 'answer');

    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    expect(onDone).toHaveBeenCalledWith({ correct: true, replays: 0, ms: expect.any(Number) });
  });

  it('counts 再听一次 as replays; a wrong pick offers 慢速 replay (rate 0.7) and reports correct: false', () => {
    const onDone = vi.fn();
    render(<ListenDrill item={item} rng={seededRng(seed)} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    fireEvent.click(screen.getByRole('button', { name: '再听一次' }));
    fireEvent.click(screen.getByRole('button', { name: '再听一次' }));
    const wrong = optionButtons().find((b) => !b.textContent?.includes(item.chunk.en)) as HTMLElement;
    fireEvent.click(wrong);
    expect(wrong).toHaveAttribute('data-state', 'wrong');
    expect(screen.getByTestId('listen-result')).toHaveTextContent('听错了');
    // options are locked after the answer
    expect(optionButtons().every((b) => b.hasAttribute('disabled'))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '慢速重听' }));
    expect(spoken.at(-1)?.rate).toBe(0.7);
    fireEvent.click(screen.getByRole('button', { name: '再听一遍' }));
    expect(spoken.at(-1)?.rate).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    // replays after the answer do not count
    expect(onDone).toHaveBeenCalledWith({ correct: false, replays: 2, ms: expect.any(Number) });
  });

  it('plays only a turn of a dialogue example, without the "A:" labels', () => {
    const dialogue = CHUNKS.find((c) => c.examples.every((e) => e.en.startsWith('A:')));
    if (!dialogue) return;
    render(<ListenDrill item={{ kind: 'chunk', chunk: dialogue }} rng={seededRng(2)} onDone={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    expect(spoken[0].text).not.toMatch(/\b[AB]:/);
  });
});

describe('ListenDrill (frame)', () => {
  const frame = SEED_FRAMES[0];

  it('offers 4 sentences of the frame that differ in one slot; the answer is the played sentence', () => {
    const onDone = vi.fn();
    render(<ListenDrill item={{ kind: 'frame', frame }} rng={seededRng(4)} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    const played = spoken[0];
    expect(played.rate).toBe(1);
    const buttons = optionButtons();
    expect(buttons).toHaveLength(4);
    expect(new Set(buttons.map((b) => b.textContent)).size).toBe(4);
    const answer = buttons.find((b) => b.textContent?.startsWith(played.text)) as HTMLElement;
    expect(answer).toBeDefined();
    fireEvent.click(answer);
    expect(screen.getByTestId('listen-result')).toHaveTextContent('听对了');
    expect(screen.getByTestId('listen-sentence').querySelector('mark')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    expect(onDone).toHaveBeenCalledWith({ correct: true, replays: 0, ms: expect.any(Number) });
  });
});
