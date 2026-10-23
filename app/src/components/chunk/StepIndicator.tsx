import { CheckIcon } from '../icons';
import { cx } from '../ui';

/** Small "听辨 · 跟读 · 说出" progress strip: done steps get a check, the current one is filled. */
export function StepIndicator({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className="flex items-center gap-1.5 text-xs font-medium" aria-label="步骤">
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li
            key={label}
            aria-current={state === 'current' ? 'step' : undefined}
            data-state={state}
            className="flex items-center gap-1.5"
          >
            {i > 0 && <span aria-hidden="true" className="h-px w-3 bg-slate-300 dark:bg-slate-700" />}
            <span
              className={cx(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1',
                state === 'current' && 'bg-indigo-600 text-white dark:bg-indigo-500',
                state === 'done' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
                state === 'todo' && 'bg-slate-200/70 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
              )}
            >
              {state === 'done' && <CheckIcon size={12} />}
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
