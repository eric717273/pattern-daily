import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubstitutionFrame } from '../../types';
import { SEED_FRAMES } from '../../content';
import { buildCombo } from '../../lib/frameEngine';
import { AnchorDrill } from './AnchorDrill';
import { SingleSwapDrill } from './SingleSwapDrill';
import { TranslateDrill } from './TranslateDrill';

const frame: SubstitutionFrame = SEED_FRAMES[0];

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});
afterEach(() => vi.useRealTimers());

describe('TranslateDrill', () => {
  it('type -> Enter -> diff, similarity, answer and suggested grade; averages the grades at the end', () => {
    const onDone = vi.fn();
    render(<TranslateDrill frame={frame} count={3} onDone={onDone} />);

    for (let i = 1; i <= 3; i++) {
      expect(screen.getByText(`第 ${i} / 3 句`)).toBeInTheDocument();
      const input = screen.getByRole('textbox', { name: '你的英语答案' });
      expect(input).toHaveAttribute('autocapitalize', 'off');
      expect(input).toHaveAttribute('autocorrect', 'off');
      expect(input).toHaveAttribute('spellcheck', 'false');
      // give up the first prompt to read the answer, answer the others correctly
      if (i === 1) {
        fireEvent.click(screen.getByRole('button', { name: '不会，看答案' }));
        expect(screen.queryByRole('list', { name: '答案对比' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: '忘了（建议）' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /^良好/ }));
        continue;
      }
      // the answer is not visible before submitting
      expect(screen.queryByTestId('translate-answer')).not.toBeInTheDocument();
      fireEvent.change(input, { target: { value: 'totally wrong words' } });
      fireEvent.submit(input.closest('form') as HTMLFormElement);
      const answer = screen.getByTestId('translate-answer').textContent ?? '';
      expect(answer).not.toBe('');
      expect(screen.getByRole('list', { name: '答案对比' })).toBeInTheDocument();
      expect(screen.getByText(/相似度 \d+%/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '忘了（建议）' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /^简单/ }));
    }
    expect(onDone).toHaveBeenCalledTimes(1);
    const r = onDone.mock.calls[0][0];
    expect(r.grades).toEqual([2, 3, 3]);
    expect(r.average).toBe(3);
  });

  it('an exact answer (case and punctuation ignored) shows only ok tokens and suggests 良好', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const expected = buildCombo(frame, {}).en;
      render(<TranslateDrill frame={frame} count={1} onDone={() => undefined} />);
      expect(screen.getByTestId('translate-zh')).toHaveTextContent(buildCombo(frame, {}).zh);
      const input = screen.getByRole('textbox', { name: '你的英语答案' });
      fireEvent.change(input, { target: { value: expected.toLowerCase().replace(/[.?!]$/, '') } });
      fireEvent.submit(input.closest('form') as HTMLFormElement);
      const items = screen.getAllByRole('listitem').filter((li) => li.hasAttribute('data-status'));
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((li) => li.getAttribute('data-status') === 'ok')).toBe(true);
      expect(screen.getByText('相似度 100%')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '良好（建议）' })).toBeInTheDocument();
      expect(screen.getByTestId('translate-answer')).toHaveTextContent(expected);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe('AnchorDrill', () => {
  it('needs three read-aloud taps before continuing', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(10_000);
    const onDone = vi.fn();
    render(<AnchorDrill frame={frame} onDone={onDone} />);
    const next = screen.getByRole('button', { name: /再跟读 3 遍后继续/ });
    expect(next).toBeDisabled();
    expect(screen.getByTestId('anchor-en').textContent).toBeTruthy();

    for (let i = 1; i <= 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: /^听并跟读/ }));
      vi.setSystemTime(10_000 + i * 1000);
      expect(screen.getByText(`跟读 3 遍：${i} / 3`)).toBeInTheDocument();
    }
    const go = screen.getByRole('button', { name: '下一步：单槽快替' });
    expect(go).toBeEnabled();
    fireEvent.click(go);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('SingleSwapDrill', () => {
  it('walks start sentence -> 7 swaps -> feel -> done, highlighting the changed slot', () => {
    const onDone = vi.fn();
    render(<SingleSwapDrill frame={frame} onDone={onDone} />);
    expect(screen.getByText('起点句')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '开始快替' }));

    for (let i = 1; i <= 7; i++) {
      expect(screen.getByText(`第 ${i} / 7 句`)).toBeInTheDocument();
      // the table is compact and read-only; exactly one column is emphasized via the prompt label
      expect(screen.getByText(/换的是「.+」/)).toBeInTheDocument();
      expect(screen.queryByTestId('swap-en')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
      expect(screen.getByTestId('swap-en').textContent).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: i === 7 ? '完成这一轮' : '下一句' }));
    }
    expect(screen.getByText('这一轮练完了')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '轻松' }));
    fireEvent.click(screen.getByRole('button', { name: '完成单槽快替' }));
    expect(onDone).toHaveBeenCalledWith({ ms: expect.any(Number), feel: 'easy' });
    // "easy" makes the next round faster
    expect(localStorage.getItem('pd.swapSpeed')).toBe('medium');
  });

  it('reveals the answer automatically when the countdown runs out', () => {
    vi.useFakeTimers();
    render(<SingleSwapDrill frame={frame} onDone={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: '开始快替' }));
    expect(screen.queryByTestId('swap-en')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4200);
    });
    expect(screen.getByTestId('swap-en')).toBeInTheDocument();
  });

  it('remembers the chosen speed', () => {
    render(<SingleSwapDrill frame={frame} onDone={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: '快 2s' }));
    expect(localStorage.getItem('pd.swapSpeed')).toBe('fast');
  });
});
