import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFocusPref, writeFocusPref } from './focusPref';
import { StepRunner, type StepRunnerProps } from './StepRunner';

function setup(over: Partial<StepRunnerProps> = {}) {
  const onFocusChange = vi.fn();
  const onNext = vi.fn();
  const utils = render(
    <StepRunner
      stepKey="review"
      label="复习"
      index={1}
      total={5}
      hint="过一遍到期的卡片"
      budgetMin={2}
      focus={false}
      onFocusChange={onFocusChange}
      onNext={onNext}
      {...over}
    >
      <button type="button">内容</button>
    </StepRunner>,
  );
  return { ...utils, onFocusChange, onNext };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date('2026-11-02T10:00:00'));
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});
afterEach(() => {
  vi.useRealTimers();
  document.body.style.overflow = '';
});

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('StepRunner budget', () => {
  it('shows the minute budget and a live countdown', () => {
    setup();
    expect(screen.getByTestId('step-budget')).toHaveTextContent('约 2 分钟');
    expect(screen.getByTestId('step-clock')).toHaveTextContent('剩 2:00');
    advance(30_000);
    expect(screen.getByTestId('step-clock')).toHaveTextContent('剩 1:30');
    expect(screen.queryByTestId('budget-over')).not.toBeInTheDocument();
  });

  it('time is up: a gentle prompt, nothing is stopped; 继续练 dismisses it', () => {
    const { onNext } = setup();
    advance(121_000);
    expect(screen.getByTestId('budget-over')).toHaveTextContent('本块时间到了：继续练还是进入下一块？');
    expect(screen.getByTestId('step-clock')).toHaveTextContent('已超时');
    expect(screen.getByRole('button', { name: '内容' })).toBeInTheDocument();
    expect(onNext).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '继续练' }));
    expect(screen.queryByTestId('budget-over')).not.toBeInTheDocument();
    expect(screen.getByTestId('step-clock')).toHaveAttribute('data-over', 'true');
  });

  it('进入下一块 hands the measured active time to the page', async () => {
    const { onNext } = setup();
    advance(125_000);
    fireEvent.click(screen.getByRole('button', { name: '进入下一块' }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onNext.mock.calls[0][0]).toBeGreaterThanOrEqual(124_000);
  });

  it('the last block offers to finish the day', () => {
    setup({ isLast: true });
    advance(121_000);
    expect(screen.getByRole('button', { name: '结束今天的练习' })).toBeInTheDocument();
  });

  it('the clock pauses while the page is hidden', () => {
    setup();
    advance(10_000);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    advance(60_000);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    advance(1_000);
    expect(screen.getByTestId('step-clock')).toHaveTextContent('剩 1:49');
  });

  it('no budget (v2) or a finished block: no countdown', () => {
    setup({ budgetMin: undefined });
    expect(screen.queryByTestId('step-clock')).not.toBeInTheDocument();
  });

  it('a block that is being repeated has no countdown or prompt', () => {
    setup({ done: true });
    advance(300_000);
    expect(screen.queryByTestId('step-clock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('budget-over')).not.toBeInTheDocument();
  });
});

describe('StepRunner focus mode', () => {
  it('offers the toggle and reports the change', () => {
    const { onFocusChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: '专注模式' }));
    expect(onFocusChange).toHaveBeenCalledWith(true);
  });

  it('focus on: slim top bar with step name, remaining time and an exit button; content stays mounted', () => {
    const { onFocusChange } = setup({ focus: true });
    const bar = screen.getByTestId('focus-bar');
    expect(bar).toHaveTextContent('专注 · 复习');
    expect(bar).toHaveTextContent('剩 2:00');
    expect(screen.getByRole('button', { name: '内容' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '专注模式' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: '退出专注' }));
    expect(onFocusChange).toHaveBeenCalledWith(false);
  });

  it('the preference persists per device', () => {
    expect(readFocusPref()).toBe(false);
    writeFocusPref(true);
    expect(readFocusPref()).toBe(true);
    writeFocusPref(false);
    expect(readFocusPref()).toBe(false);
  });
});
