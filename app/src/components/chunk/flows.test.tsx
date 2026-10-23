import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getChunk, SEED_FRAMES } from '../../content';
import type { CardState } from '../../types';
import { newCard } from '../../lib/srs';

vi.mock('../../lib/speech', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/speech')>();
  return { ...actual, speak: () => Promise.resolve(), stopSpeaking: () => undefined };
});

import { installRecognition } from './fakeRecognition';
import { NewItemFlow } from './NewItemFlow';
import { ReviewItem } from './ReviewItem';

const chunkEn = getChunk('c003')?.en ?? '';

beforeEach(() => {
  try {
    localStorage.clear();
    localStorage.setItem('pd.swapVoice', '0'); // self-graded modes
  } catch {
    // ignore
  }
  installRecognition(false);
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const pickAnswer = (right: boolean) => {
  fireEvent.click(screen.getByRole('button', { name: '播放' }));
  const options = within(screen.getByRole('group', { name: '选项' })).getAllByRole('button');
  const target = options.find((b) => (b.textContent === chunkEn) === right) as HTMLElement;
  fireEvent.click(target);
};
const steps = () => within(screen.getByRole('list', { name: '步骤' })).getAllByRole('listitem');
const tap = (name: RegExp | string) => {
  fireEvent.click(screen.getByRole('button', { name }));
  act(() => {
    vi.advanceTimersByTime(500);
  });
};

describe('NewItemFlow (chunk)', () => {
  it('listen -> shadow -> recall with a step indicator, then grades 3 for a perfect run', () => {
    const onDone = vi.fn();
    render(<NewItemFlow ref={{ kind: 'chunk', id: 'c003' }} onDone={onDone} />);
    expect(steps().map((s) => s.textContent)).toEqual(['听辨', '跟读', '说出']);
    expect(steps()[0]).toHaveAttribute('aria-current', 'step');

    pickAnswer(true);
    fireEvent.click(screen.getByRole('button', { name: '下一步：跟读' }));
    expect(steps()[1]).toHaveAttribute('aria-current', 'step');
    expect(steps()[0]).toHaveAttribute('data-state', 'done');

    for (let i = 0; i < 3; i++) tap(/听并跟读/);
    fireEvent.click(screen.getByRole('button', { name: '下一步：说出来' }));
    expect(steps()[2]).toHaveAttribute('aria-current', 'step');

    // English hidden until the learner asks for it
    expect(screen.queryByTestId('recall-en')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: '说对了' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(3, { ms: expect.any(Number), mode: 'recall' });
  });

  it('a wrong listening answer and a missed recall give 忘了 (0)', () => {
    const onDone = vi.fn();
    render(<NewItemFlow ref={{ kind: 'chunk', id: 'c003' }} onDone={onDone} />);
    pickAnswer(false);
    fireEvent.click(screen.getByRole('button', { name: '下一步：跟读' }));
    for (let i = 0; i < 3; i++) tap(/听并跟读/);
    fireEvent.click(screen.getByRole('button', { name: '下一步：说出来' }));
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: '没说出来' }));
    expect(onDone).toHaveBeenCalledWith(0, expect.objectContaining({ mode: 'recall' }));
  });

  it('shows a message for an unknown item', () => {
    render(<NewItemFlow ref={{ kind: 'chunk', id: 'nope' }} onDone={() => undefined} />);
    expect(screen.getByText('找不到这条内容')).toBeInTheDocument();
  });
});

describe('NewItemFlow (frame)', () => {
  it('listen -> anchor -> single-swap (5 swaps) and grades from the swap feel', () => {
    const frame = SEED_FRAMES[0];
    const onDone = vi.fn();
    render(<NewItemFlow ref={{ kind: 'frame', id: frame.id }} onDone={onDone} />);
    expect(steps().map((s) => s.textContent)).toEqual(['听辨', '锚定', '快替']);

    // listen: any wrong answer
    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    const options = within(screen.getByRole('group', { name: '选项' })).getAllByRole('button');
    fireEvent.click(options[0]);
    const correct = screen.getByTestId('listen-result').textContent?.includes('✓') ?? false;
    fireEvent.click(screen.getByRole('button', { name: '下一步：锚定' }));

    for (let i = 0; i < 3; i++) tap(/听并跟读/);
    fireEvent.click(screen.getByRole('button', { name: '下一步：单槽快替' }));

    fireEvent.click(screen.getByRole('button', { name: '开始快替' }));
    for (let i = 1; i <= 5; i++) {
      fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
      fireEvent.click(screen.getByRole('button', { name: i === 5 ? '完成这一轮' : '下一句' }));
    }
    fireEvent.click(screen.getByRole('button', { name: '轻松' }));
    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    expect(onDone).toHaveBeenCalledWith(correct ? 3 : 2, { ms: expect.any(Number), mode: 'single-swap' });
  });
});

describe('ReviewItem', () => {
  const card = (kind: 'chunk' | 'frame', refId: string): CardState => newCard(kind, refId, Date.now());

  it('chunk: listen then recall (5 s), mode recall', () => {
    const onDone = vi.fn();
    render(<ReviewItem card={card('chunk', 'c003')} onDone={onDone} />);
    expect(steps().map((s) => s.textContent)).toEqual(['听辨', '说出']);
    pickAnswer(true);
    fireEvent.click(screen.getByRole('button', { name: '下一步：说出来' }));
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: '说对了' }));
    expect(onDone).toHaveBeenCalledWith(3, 'recall', { ms: expect.any(Number) });
  });

  it('frame: two Chinese prompts of the frame, mode multi-swap', () => {
    const frame = SEED_FRAMES[0];
    const onDone = vi.fn();
    render(<ReviewItem card={card('frame', frame.id)} onDone={onDone} />);
    expect(steps().map((s) => s.textContent)).toEqual(['第 1 句', '第 2 句']);
    const first = screen.getByTestId('recall-zh').textContent;
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: '说对了' }));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByTestId('recall-zh').textContent).not.toBe(first);
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: '没说出来' }));
    expect(onDone).toHaveBeenCalledWith(1, 'multi-swap', { ms: expect.any(Number) });
  });

  it('a card whose content is gone can be skipped', () => {
    const onSkip = vi.fn();
    render(<ReviewItem card={card('chunk', 'zzz')} onDone={() => undefined} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole('button', { name: '跳过' }));
    expect(onSkip).toHaveBeenCalled();
  });
});
