import type { AnswerToken } from '../../lib/frameEngine';
import { cx } from '../ui';

export interface AnswerDiffProps {
  tokens: AnswerToken[];
  /** 0..1. When given, a "相似度 NN%" badge is shown. */
  similarity?: number;
  className?: string;
}

const STATUS_CLASS: Record<AnswerToken['status'], string> = {
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  missing:
    'border border-dashed border-rose-400 bg-rose-50 text-rose-700 dark:border-rose-500 dark:bg-rose-950/40 dark:text-rose-300',
  extra: 'bg-amber-100 text-amber-800 line-through decoration-amber-600 dark:bg-amber-900/40 dark:text-amber-200',
};

const STATUS_LABEL: Record<AnswerToken['status'], string> = {
  ok: '正确',
  missing: '漏掉',
  extra: '多余',
};

/** Token-level diff of a typed answer against the target (compareAnswer output). */
export function AnswerDiff({ tokens, similarity, className }: AnswerDiffProps) {
  return (
    <div className={className}>
      <ul className="flex flex-wrap gap-1.5" aria-label="答案对比">
        {tokens.map((t, i) => (
          <li
            key={i}
            data-status={t.status}
            className={cx('font-en rounded-lg px-2 py-1 text-[15px] leading-tight font-medium', STATUS_CLASS[t.status])}
          >
            <span className="sr-only">{STATUS_LABEL[t.status]}：</span>
            {t.text}
          </li>
        ))}
      </ul>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1">
          <i className="size-2.5 rounded-sm bg-emerald-400" aria-hidden="true" />
          正确
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="size-2.5 rounded-sm border border-dashed border-rose-400" aria-hidden="true" />
          漏掉
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="size-2.5 rounded-sm bg-amber-400" aria-hidden="true" />
          多余
        </span>
        {similarity !== undefined && (
          <span className="ml-auto font-semibold text-slate-700 dark:text-slate-200">
            相似度 {Math.round(similarity * 100)}%
          </span>
        )}
      </p>
    </div>
  );
}
