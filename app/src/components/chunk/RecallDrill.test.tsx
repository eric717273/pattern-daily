import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHUNKS, SEED_FRAMES, getChunk } from '../../content';
import type { Chunk } from '../../types';
import { buildCombo } from '../../lib/frameEngine';

const speechState = vi.hoisted(() => ({ speaking: false }));
const spoken = vi.hoisted(() => [] as string[]);
vi.mock('../../lib/speech', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/speech')>();
  return {
    ...actual,
    speak: (text: string) => {
      spoken.push(text);
      return Promise.resolve();
    },
    isSpeaking: () => speechState.speaking,
  };
});

import { installRecognition, liveRecognition } from './fakeRecognition';
import { RecallDrill } from './RecallDrill';

const chunk = (id: string): Chunk => {
  const c = getChunk(id);
  if (!c) throw new Error(id);
  return c;
};
const item = { kind: 'chunk' as const, chunk: chunk('c003') }; // Long time no see. / 好久不见。

const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const start = () => fireEvent.click(screen.getByRole('button', { name: /开始说/ }));

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  spoken.length = 0;
  speechState.speaking = false;
  installRecognition(true);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  installRecognition(false);
});

describe('RecallDrill (voice mode)', () => {
  it('shows the Chinese and a masked situation; the English is nowhere in the DOM before the reveal', () => {
    const { container } = render(<RecallDrill item={item} onDone={() => undefined} />);
    expect(screen.getByTestId('recall-zh')).toHaveTextContent(item.chunk.zh);
    expect(screen.getByTestId('recall-situation')).toBeInTheDocument();
    expect(container.innerHTML.toLowerCase()).not.toContain('long time no see');
    start();
    expect(container.innerHTML.toLowerCase()).not.toContain('long time no see');
    liveRecognition().say('long time');
    expect(screen.getByTestId('recall-live')).toHaveTextContent('long time');
    expect(screen.queryByTestId('recall-en')).not.toBeInTheDocument();
    expect(container.querySelector('mark')).toBeNull();
  });

  it('does not start the recognizer before the tap (Safari needs a gesture) and offers a 6 s limit', () => {
    render(<RecallDrill item={item} onDone={() => undefined} />);
    expect(screen.getByRole('button', { name: /开始说（限时 6 秒）/ })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /语音验证/ })).toHaveAttribute('aria-checked', 'true');
    start();
    expect(liveRecognition()).toMatchObject({ lang: 'en-US', interimResults: true, continuous: true });
  });

  it('saying the chunk in time stops the clock: ✓, the answer appears, 继续 reports correct + ms + heard', async () => {
    const onDone = vi.fn();
    render(<RecallDrill item={item} onDone={onDone} />);
    start();
    await tick(1800);
    liveRecognition().say('Long time no see');
    expect(screen.getByTestId('recall-result')).toHaveTextContent('✓ 限时说对');
    expect(screen.getByTestId('recall-result')).toHaveTextContent('1.8 秒');
    expect(screen.getByTestId('recall-en')).toHaveTextContent('Long time no see.');
    expect(spoken).toContain('Long time no see.');
    await tick(10_000); // the clock no longer fails the prompt
    expect(screen.getByTestId('recall-result')).toHaveTextContent('✓');
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    expect(onDone).toHaveBeenCalledWith({ correct: true, ms: 1800, heard: 'Long time no see' });
  });

  it('an open chunk ("… ") is accepted inside a longer utterance', () => {
    const open = CHUNKS.find((c) => c.en.endsWith('…')) as Chunk;
    render(<RecallDrill item={{ kind: 'chunk', chunk: open }} onDone={() => undefined} />);
    start();
    liveRecognition().say(`um ${open.en.replace(/\s*…$/, '').toLowerCase()} the budget thing`);
    expect(screen.getByTestId('recall-result')).toHaveTextContent('✓');
  });

  it('a wrong phrase does not count and the diff shows what was heard when the time runs out', async () => {
    const onDone = vi.fn();
    render(<RecallDrill item={item} onDone={onDone} />);
    start();
    liveRecognition().say('long time no hello');
    expect(screen.queryByTestId('recall-result')).not.toBeInTheDocument();
    await tick(6200);
    expect(screen.getByTestId('recall-result')).toHaveTextContent('✗ 超时');
    expect(screen.getByTestId('recall-en')).toHaveTextContent('Long time no see.');
    const diff = within(screen.getByTestId('recall-heard')).getByRole('list', { name: '答案对比' });
    expect(within(diff).getByText('hello').closest('li')).toHaveAttribute('data-status', 'extra');
    expect(spoken).toContain('Long time no see.');
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    expect(onDone).toHaveBeenCalledWith({ correct: false, ms: 6000, heard: 'long time no hello' });
  });

  it('honours timeLimitMs and only starts counting once the microphone is capturing', async () => {
    class SlowStart extends (window as unknown as { webkitSpeechRecognition: new () => { start(): void } }).webkitSpeechRecognition {
      start() {
        // permission prompt still open: no onstart yet
      }
    }
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = SlowStart;
    render(<RecallDrill item={item} timeLimitMs={3000} onDone={() => undefined} />);
    expect(screen.getByRole('button', { name: /限时 3 秒/ })).toBeInTheDocument();
    start();
    await tick(20_000);
    expect(screen.queryByTestId('recall-result')).not.toBeInTheDocument();
    expect(screen.getByText(/正在启动麦克风/)).toBeInTheDocument();
    act(() => liveRecognition().onstart?.());
    await tick(3200);
    expect(screen.getByTestId('recall-result')).toHaveTextContent('✗ 超时');
  });

  it('ignores speech while text-to-speech is playing', () => {
    render(<RecallDrill item={item} onDone={() => undefined} />);
    start();
    speechState.speaking = true;
    liveRecognition().say('long time no see');
    expect(screen.queryByTestId('recall-result')).not.toBeInTheDocument();
  });

  it('跳过 reveals the answer as a miss', () => {
    render(<RecallDrill item={item} onDone={() => undefined} />);
    start();
    fireEvent.click(screen.getByRole('button', { name: /跳过/ }));
    expect(screen.getByTestId('recall-result')).toHaveTextContent('✗ 已跳过');
    expect(screen.getByTestId('recall-heard')).toHaveTextContent('没有听到');
  });

  it('falls back to self-check with a Chinese message when recognition fails', () => {
    const onDone = vi.fn();
    render(<RecallDrill item={item} onDone={onDone} />);
    start();
    liveRecognition().fail('not-allowed');
    expect(screen.getByRole('alert')).toHaveTextContent('麦克风权限被拒绝');
    expect(screen.queryByTestId('recall-en')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: '说对了' }));
    expect(onDone).toHaveBeenCalledWith({ correct: true, ms: expect.any(Number) });
  });

  it('stops the recognizer on unmount', () => {
    const { unmount } = render(<RecallDrill item={item} onDone={() => undefined} />);
    start();
    const rec = liveRecognition();
    unmount();
    expect(rec.aborted).toBe(true);
  });
});

describe('RecallDrill (no speech recognition)', () => {
  beforeEach(() => installRecognition(false));

  it('hides the English until 显示答案, then asks 说对了 / 没说出来', () => {
    const onDone = vi.fn();
    const { container } = render(<RecallDrill item={item} onDone={onDone} />);
    expect(screen.getByText('当前浏览器不支持语音识别，改为自评模式')).toBeInTheDocument();
    expect(container.innerHTML.toLowerCase()).not.toContain('long time no see');
    expect(screen.queryByRole('button', { name: /开始说/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    expect(screen.getByTestId('recall-en')).toHaveTextContent('Long time no see.');
    fireEvent.click(screen.getByRole('button', { name: '没说出来' }));
    expect(onDone).toHaveBeenCalledWith({ correct: false, ms: expect.any(Number) });
  });
});

describe('RecallDrill (frame)', () => {
  const frame = SEED_FRAMES[0];
  const combo = buildCombo(frame, {});

  it('prompts the Chinese of the combo and defaults to an 8 s limit; needs the whole sentence', async () => {
    const onDone = vi.fn();
    const { container } = render(<RecallDrill item={{ kind: 'frame', frame }} combo={combo} onDone={onDone} />);
    expect(screen.getByTestId('recall-zh')).toHaveTextContent(combo.zh);
    expect(screen.getByRole('button', { name: /限时 8 秒/ })).toBeInTheDocument();
    expect(container.innerHTML).not.toContain(combo.en);
    start();
    liveRecognition().say(combo.en.split(' ').slice(0, 2).join(' '));
    expect(screen.queryByTestId('recall-result')).not.toBeInTheDocument();
    liveRecognition().say(combo.en.toLowerCase());
    expect(screen.getByTestId('recall-result')).toHaveTextContent('✓');
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ correct: true }));
  });
});
