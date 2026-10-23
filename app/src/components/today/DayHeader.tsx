import type { DayPlan, StepKey } from '../../types';
import { CheckIcon } from '../icons';
import { Badge, Card, cx } from '../ui';
import { PHASE_LABELS, remainingMinutes, STEPS } from './steps';

export interface DayHeaderProps {
  plan: DayPlan;
  stepsDone: StepKey[];
  streak?: number;
  /** Profile.dailyMinutes, used to scale the time estimate. */
  dailyMinutes?: number;
  /** Currently shown view; 'done' = completion screen. */
  view: StepKey | 'done';
  onSelect: (step: StepKey) => void;
}

/** Progress ring: done / total, with the count in the middle. */
export function ProgressRing({ done, total, size = 60 }: { done: number; total: number; size?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      role="progressbar"
      aria-label="今日进度"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={`已完成 ${done} / ${total} 步`}
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-200 dark:stroke-slate-700" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - done / total)}
          className="stroke-indigo-600 transition-[stroke-dashoffset] duration-500 dark:stroke-indigo-400"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-900 dark:text-white">
        {done}/{total}
      </span>
    </div>
  );
}

/** "第 N 课" + phase, streak, progress ring, remaining minutes and the four step tabs. */
export function DayHeader({ plan, stepsDone, streak, dailyMinutes, view, onSelect }: DayHeaderProps) {
  const left = remainingMinutes(stepsDone, dailyMinutes);
  return (
    <Card className="mb-5">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl dark:text-white">
              第 {plan.dayIndex} 课
            </h1>
            <Badge tone="indigo">{PHASE_LABELS[plan.phase]}</Badge>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-500 dark:text-slate-400">
            <span data-testid="streak">🔥 连续 {streak ?? 0} 天</span>
            <span>{left === 0 ? '今日已完成' : `预计还需约 ${left} 分钟`}</span>
          </p>
        </div>
        <ProgressRing done={stepsDone.length} total={STEPS.length} />
      </div>

      <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label="今日四步">
        {STEPS.map((s, i) => {
          const done = stepsDone.includes(s.key);
          const active = view === s.key;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => onSelect(s.key)}
                aria-current={active ? 'step' : undefined}
                aria-label={`第 ${i + 1} 步 ${s.label}${done ? '，已完成' : ''}`}
                className={cx(
                  'flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 text-xs font-medium transition-colors',
                  active
                    ? 'border-indigo-600 bg-indigo-600 text-white dark:border-indigo-500 dark:bg-indigo-500'
                    : done
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    'flex size-5 items-center justify-center rounded-full text-[11px] font-bold',
                    active ? 'bg-white/25' : done ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700',
                  )}
                >
                  {done ? <CheckIcon size={13} /> : i + 1}
                </span>
                {s.short}
              </button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
