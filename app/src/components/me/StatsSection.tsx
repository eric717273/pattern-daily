import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { buildHeatGrid, type HeatCell } from '../../lib/heatmap';
import { getStats } from '../../lib/repo';
import { Card, PageLoading, SectionTitle, cx } from '../ui';

const LEVEL_CLASS: Record<HeatCell['level'], string> = {
  0: 'bg-slate-200 dark:bg-slate-800',
  1: 'bg-indigo-200 dark:bg-indigo-900',
  2: 'bg-indigo-300 dark:bg-indigo-700',
  3: 'bg-indigo-500 dark:bg-indigo-500',
  4: 'bg-indigo-700 dark:bg-indigo-300',
};

function StatTile({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="rounded-2xl bg-slate-100 px-3 py-3 dark:bg-slate-800/70">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-2xl font-bold text-slate-900 dark:text-white">
        {value}
        {unit && <span className="ml-0.5 text-sm font-medium text-slate-500 dark:text-slate-400">{unit}</span>}
      </p>
    </div>
  );
}

export function Heatmap({ days }: { days: { date: string; minutes: number }[] }) {
  const grid = useMemo(() => buildHeatGrid(days), [days]);
  return (
    <div>
      <div role="group" aria-label="近 12 周学习热力图" className="grid max-w-md grid-cols-12 gap-1">
        {grid.flatMap((row, r) =>
          row.map((cell, c) =>
            cell ? (
              <div
                key={`${r}-${c}`}
                role="img"
                data-level={cell.level}
                title={`${cell.date} · ${cell.minutes} 分钟`}
                aria-label={`${cell.date}，学习 ${cell.minutes} 分钟`}
                className={cx('aspect-square rounded-[4px]', LEVEL_CLASS[cell.level])}
              />
            ) : (
              <div key={`${r}-${c}`} aria-hidden="true" className="aspect-square" />
            ),
          ),
        )}
      </div>
      <div className="mt-2 flex max-w-md items-center justify-end gap-1.5 text-xs text-slate-500 dark:text-slate-400" aria-hidden="true">
        少
        {([0, 1, 2, 3, 4] as const).map((l) => (
          <i key={l} className={cx('size-3 rounded-[3px]', LEVEL_CLASS[l])} />
        ))}
        多
      </div>
    </div>
  );
}

export function StatsSection() {
  const stats = useLiveQuery(() => getStats(), []);
  return (
    <section aria-labelledby="me-stats" className="mb-6">
      <SectionTitle>
        <span id="me-stats">学习统计</span>
      </SectionTitle>
      <Card>
        {!stats ? (
          <PageLoading />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <StatTile label="连续天数" value={stats.streak} unit="天" />
              <StatTile label="完成天数" value={stats.totalDays} unit="天" />
              <StatTile label="复习次数" value={stats.totalReviews} unit="次" />
              <StatTile label="已学卡片" value={stats.cardsLearned} unit="张" />
              <StatTile label="近 7 天" value={stats.minutesLast7} unit="分钟" />
            </div>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              已完成 {stats.totalDays} 课，下一课是第 {stats.totalDays + 1} 课（按完成的课数推进，漏练的日子不会跳过内容）。
            </p>
            <h3 className="mt-5 mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">近 12 周</h3>
            <Heatmap days={stats.heatmap} />
          </>
        )}
      </Card>
    </section>
  );
}
