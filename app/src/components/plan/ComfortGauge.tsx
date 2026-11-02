import type { Skill } from '../../types';
import { BAND_HIGH, BAND_LOW, MIN_SAMPLES } from '../../lib/adaptive';
import type { SkillStat } from '../../lib/skills';
import { cx } from '../ui';

const SKILL_NAME: Record<Skill, string> = { listen: '听力', speak: '口语', decode: '解码' };

type Verdict = 'none' | 'low' | 'in' | 'high';

function verdictOf(stat: SkillStat): Verdict {
  if (stat.n === 0) return 'none';
  if (stat.acc < BAND_LOW) return 'low';
  if (stat.acc > BAND_HIGH) return 'high';
  return 'in';
}

const VERDICT_TEXT: Record<Verdict, string> = {
  none: '还没有数据',
  low: '偏难',
  in: '舒适区边缘',
  high: '偏轻松',
};

const VERDICT_CLASS: Record<Verdict, string> = {
  none: 'text-slate-500 dark:text-slate-400',
  low: 'text-rose-700 dark:text-rose-300',
  in: 'text-emerald-700 dark:text-emerald-300',
  high: 'text-amber-700 dark:text-amber-300',
};

const MARKER_CLASS: Record<Verdict, string> = {
  none: 'bg-slate-400',
  low: 'bg-rose-500',
  in: 'bg-emerald-600',
  high: 'bg-amber-500',
};

function trendInfo(trend: number | undefined): { arrow: string; text: string } {
  if (trend === undefined) return { arrow: '–', text: '趋势：样本不够' };
  const pts = Math.round(Math.abs(trend) * 100);
  if (pts < 3) return { arrow: '→', text: '趋势：持平' };
  return trend > 0 ? { arrow: '↑', text: `趋势：上升 ${pts} 个百分点` } : { arrow: '↓', text: `趋势：下降 ${pts} 个百分点` };
}

export interface ComfortGaugeProps {
  skill: Skill;
  stat: SkillStat;
  /** Current ladder level in words (listenLevelZh / speakLevelZh); decode has no ladder. */
  levelZh?: string;
}

/** Horizontal 0-100% gauge with the 70-88% comfort band shaded and the rolling accuracy as a marker. */
export function ComfortGauge({ skill, stat, levelZh }: ComfortGaugeProps) {
  const verdict = verdictOf(stat);
  const accPct = Math.round(stat.acc * 100);
  const trend = trendInfo(stat.trend);
  const name = SKILL_NAME[skill];
  const label =
    verdict === 'none'
      ? `${name}：还没有练习数据`
      : `${name}：滚动正确率 ${accPct}%，${VERDICT_TEXT[verdict]}（目标区间 ${BAND_LOW * 100}%–${BAND_HIGH * 100}%）`;
  return (
    <div className="flex flex-col gap-1.5" data-testid={`gauge-${skill}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-[15px] font-semibold text-slate-900 dark:text-white">{name}</span>
        <span className={cx('text-sm font-medium', VERDICT_CLASS[verdict])}>
          {verdict === 'none' ? VERDICT_TEXT.none : `${accPct}% · ${VERDICT_TEXT[verdict]}`}
        </span>
      </div>
      <div role="img" aria-label={label} className="relative h-3.5 rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          data-testid={`gauge-band-${skill}`}
          className="absolute inset-y-0 rounded-full bg-emerald-300/80 dark:bg-emerald-500/40"
          style={{ left: `${Math.round(BAND_LOW * 100)}%`, width: `${Math.round((BAND_HIGH - BAND_LOW) * 100)}%` }}
        />
        {verdict !== 'none' && (
          <div
            data-testid={`gauge-marker-${skill}`}
            className={cx(
              'absolute top-1/2 h-6 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white dark:ring-slate-900',
              MARKER_CLASS[verdict],
            )}
            style={{ left: `${Math.min(100, Math.max(0, stat.acc * 100))}%` }}
          />
        )}
      </div>
      <div className="relative h-4 text-[11px] text-slate-400 tabular-nums dark:text-slate-500" aria-hidden="true">
        <span className="absolute left-0">0%</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${BAND_LOW * 100}%` }}>
          70%
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: `${BAND_HIGH * 100}%` }}>
          88%
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
        <span data-testid={`gauge-n-${skill}`}>
          最近 {stat.n} 次{stat.n < MIN_SAMPLES ? `（不足 ${MIN_SAMPLES} 次，暂不调整难度）` : ''}
        </span>
        <span aria-label={trend.text} title={trend.text}>
          <span aria-hidden="true" className="mr-0.5 font-bold">
            {trend.arrow}
          </span>
          {trend.text.replace('趋势：', '')}
        </span>
        {levelZh && <span className="font-medium text-slate-700 dark:text-slate-200">当前 {levelZh}</span>}
        {!levelZh && <span>按课程推进，没有难度阶梯</span>}
      </div>
    </div>
  );
}
