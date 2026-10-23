import type { Grade } from '../../types';
import { GRADE_LABELS, GRADES } from '../../lib/drill';
import { cx } from '../ui';

const GRADE_STYLE: Record<Grade, string> = {
  0: 'border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40',
  1: 'border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/40',
  2: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40',
  3: 'border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40',
};

export interface GradeButtonsProps {
  onGrade: (grade: Grade) => void;
  /** Highlighted default suggestion. */
  suggested?: Grade;
  disabled?: boolean;
}

/** 忘了 / 困难 / 良好 / 简单: one tap grades and moves on. */
export function GradeButtons({ onGrade, suggested, disabled }: GradeButtonsProps) {
  return (
    <div role="group" aria-label="自评" className="grid grid-cols-4 gap-2">
      {GRADES.map((g) => (
        <button
          key={g}
          type="button"
          disabled={disabled}
          onClick={() => onGrade(g)}
          aria-label={`${GRADE_LABELS[g]}${suggested === g ? '（建议）' : ''}`}
          className={cx(
            'relative flex min-h-14 flex-col items-center justify-center rounded-xl border bg-white text-[15px] font-semibold transition active:scale-[0.97] disabled:opacity-45 dark:bg-slate-900',
            GRADE_STYLE[g],
            suggested === g && 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-950',
          )}
        >
          {GRADE_LABELS[g]}
          {suggested === g && <span className="text-[10px] font-normal opacity-80">建议</span>}
        </button>
      ))}
    </div>
  );
}
