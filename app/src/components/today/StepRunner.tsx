import { useEffect, useState, type ReactNode } from 'react';
import type { StepKey } from '../../types';
import { useActiveTimer } from '../../lib/activeTimer';
import { Button, cx } from '../ui';
import { formatClock } from './steps';

export interface StepRunnerProps {
  stepKey: StepKey;
  label: string;
  /** 1-based position and the number of steps today. */
  index: number;
  total: number;
  hint: string;
  /** Minutes budgeted for this block (undefined: no countdown, as in v2 plans). */
  budgetMin?: number;
  /** The block is already done (being repeated): no countdown, no prompt. */
  done?: boolean;
  /** Last block of the day: the prompt then offers to finish instead of moving on. */
  isLast?: boolean;
  focus: boolean;
  onFocusChange: (on: boolean) => void;
  /** 进入下一块: mark the block done (with the active ms measured here) and move on. */
  onNext: (activeMs: number) => void | Promise<void>;
  /** Clock tick in ms (tests use a smaller one). */
  tickMs?: number;
  children: ReactNode;
}

/**
 * Frame around one running block: title with its minute budget and a live countdown (it counts only while the page
 * is visible), the 专注模式 toggle (a full-screen layer over the app's navigation with a slim top bar), and the gentle
 * "本块时间到了" prompt when the budget runs out. The prompt never interrupts an item: the learner picks 继续练 or 下一块.
 */
export function StepRunner({
  stepKey,
  label,
  index,
  total,
  hint,
  budgetMin,
  done = false,
  isLast = false,
  focus,
  onFocusChange,
  onNext,
  tickMs = 1000,
  children,
}: StepRunnerProps) {
  const timer = useActiveTimer();
  const [, setTick] = useState(0);
  const [snoozed, setSnoozed] = useState(false);
  const [busy, setBusy] = useState(false);
  const counting = budgetMin !== undefined && !done;

  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => setTick((n) => n + 1), tickMs);
    return () => clearInterval(id);
  }, [counting, tickMs]);

  // Focus mode covers the page: keep the page behind it from scrolling.
  useEffect(() => {
    if (!focus) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [focus]);

  const remaining = counting ? budgetMin * 60 - timer.read() / 1000 : null;
  const over = remaining !== null && remaining <= 0;
  const clock =
    remaining === null ? null : over ? `已超时 ${formatClock(-remaining)}` : `剩 ${formatClock(remaining)}`;

  const next = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onNext(timer.read());
    } finally {
      setBusy(false);
    }
  };

  const clockChip = clock !== null && (
    <span
      data-testid="step-clock"
      data-over={over ? 'true' : undefined}
      className={cx(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums',
        over
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
          : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
      )}
    >
      ⏱ {clock}
    </span>
  );

  return (
    <section
      aria-label={label}
      data-focus={focus ? 'true' : undefined}
      className={cx(focus && 'fixed inset-0 z-50 overflow-y-auto bg-slate-50 dark:bg-slate-950')}
    >
      {focus ? (
        <div
          data-testid="focus-bar"
          className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              专注 · {label}
              <span className="ml-1.5 text-xs font-normal text-slate-400 dark:text-slate-500">
                {index}/{total}
              </span>
            </p>
          </div>
          {clockChip}
          <Button size="sm" variant="secondary" onClick={() => onFocusChange(false)}>
            退出专注
          </Button>
        </div>
      ) : (
        <div className="mb-3 px-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 text-lg font-semibold text-slate-900 dark:text-white">
              第 {index} 步 · {label}
              {budgetMin !== undefined && (
                <span className="ml-2 text-sm font-normal text-slate-400 dark:text-slate-500" data-testid="step-budget">
                  约 {budgetMin} 分钟
                </span>
              )}
            </h2>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {clockChip}
            </div>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">{hint}</p>
            <button
              type="button"
              onClick={() => onFocusChange(true)}
              aria-pressed={false}
              className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              专注模式
            </button>
          </div>
        </div>
      )}

      <div className={cx(focus && 'mx-auto w-full max-w-[880px] px-4 pt-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))]')}>
        {over && !snoozed && (
          <div
            role="alert"
            data-testid="budget-over"
            className="mb-3.5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          >
            <p className="text-sm font-medium">本块时间到了：继续练还是进入下一块？</p>
            <div className="grid grid-cols-2 gap-2.5">
              <Button size="md" onClick={() => setSnoozed(true)}>
                继续练
              </Button>
              <Button size="md" variant="primary" disabled={busy} onClick={() => void next()} data-step={stepKey}>
                {isLast ? '结束今天的练习' : '进入下一块'}
              </Button>
            </div>
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
