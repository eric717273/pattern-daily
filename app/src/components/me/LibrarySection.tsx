import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import type { FunctionCategory } from '../../types';
import { FUNCTION_CATEGORY_LABELS } from '../../lib/labels';
import { getLibraryProgress, type CategoryProgress } from '../../lib/repo';
import { Card, PageLoading, SectionTitle, cx } from '../ui';

const TOP_CATEGORIES = 5;

/** Two stacked bars: how much was met (indigo) and how much is mastered (green). */
function Bar({ p, className }: { p: CategoryProgress; className?: string }) {
  const pct = (n: number) => (p.total > 0 ? Math.min(100, (n / p.total) * 100) : 0);
  return (
    <div className={cx('relative h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700', className)} role="img" aria-label={`已学 ${p.introduced} / ${p.total}，已掌握 ${p.mastered}`}>
      <div className="absolute inset-y-0 left-0 rounded-full bg-indigo-300 dark:bg-indigo-500/60" style={{ width: `${pct(p.introduced)}%` }} />
      <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500" style={{ width: `${pct(p.mastered)}%` }} />
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl bg-slate-100 px-3 py-3 dark:bg-slate-800/70">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={cx('mt-0.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-white', tone)}>{value}</p>
    </div>
  );
}

/** 语块库进度: met / mastered / total, and the categories the learner has gone furthest in. */
export function LibrarySection() {
  const progress = useLiveQuery(() => getLibraryProgress(), []);
  const top = progress
    ? (Object.entries(progress.byCategory) as [FunctionCategory, CategoryProgress][])
        .filter(([, p]) => p.introduced > 0)
        .sort((a, b) => b[1].introduced - a[1].introduced || b[1].introduced / b[1].total - a[1].introduced / a[1].total)
        .slice(0, TOP_CATEGORIES)
    : [];

  return (
    <section aria-labelledby="me-library" className="mb-6">
      <SectionTitle>
        <span id="me-library">语块库进度</span>
      </SectionTitle>
      <Card>
        {!progress ? (
          <PageLoading />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <Tile label="已学" value={progress.introduced} />
              <Tile label="已掌握" value={progress.mastered} tone="text-emerald-600 dark:text-emerald-400" />
              <Tile label="总数" value={progress.total} />
            </div>
            <Bar p={progress} className="mt-3 h-2.5" />
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">已掌握：复习间隔达到 21 天以上。</p>

            <h3 className="mt-5 mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">学得最多的类别</h3>
            {top.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">还没有学过语块，完成今天的「新语块」后这里会出现进度。</p>
            ) : (
              <ul className="flex flex-col gap-3" aria-label="按类别的进度">
                {top.map(([cat, p]) => (
                  <li key={cat}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                      <Link to={`/library?cat=${cat}`} className="font-medium text-slate-800 hover:text-indigo-600 dark:text-slate-200 dark:hover:text-indigo-300">
                        {FUNCTION_CATEGORY_LABELS[cat]}
                      </Link>
                      <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
                        {p.introduced} / {p.total}
                      </span>
                    </div>
                    <Bar p={p} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
    </section>
  );
}
