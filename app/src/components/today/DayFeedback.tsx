import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdaptiveChange, Skill } from '../../types';
import { getDaySummaryV3, runAdaptation, type DaySummaryV3, type SkillDaySummary } from '../../lib/repo';
import { Badge, Card, cx } from '../ui';
import { bandLabel, feedbackTip, latencyText, mistakeView, SKILL_LABEL } from './feedback';

const MARKER: Record<string, string> = {
  below: 'bg-rose-500',
  in: 'bg-emerald-500',
  above: 'bg-sky-500',
  none: 'bg-slate-400',
};

/** One skill: accuracy marker on a 0-100% track with the 70-88% comfort band shaded. */
function SkillBar({ skill, s, band }: { skill: Skill; s: SkillDaySummary; band: { low: number; high: number } }) {
  const label = bandLabel(s.band);
  const left = `${band.low * 100}%`;
  const width = `${(band.high - band.low) * 100}%`;
  return (
    <li className="flex flex-col gap-2" data-testid={`skill-${skill}`} data-band={s.band}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-semibold text-slate-900 dark:text-white">{SKILL_LABEL[skill]}</p>
        <div className="flex items-center gap-2">
          {s.n > 0 && (
            <span className="text-lg font-bold text-slate-900 tabular-nums dark:text-white" data-testid={`acc-${skill}`}>
              {Math.round(s.acc * 100)}%
            </span>
          )}
          <Badge tone={label.tone} data-testid={`band-${skill}`}>
            {label.text}
          </Badge>
        </div>
      </div>
      {s.n > 0 && (
        <>
          <div
            role="img"
            aria-label={`${SKILL_LABEL[skill]}正确率 ${Math.round(s.acc * 100)}%，舒适区 ${Math.round(band.low * 100)}%–${Math.round(band.high * 100)}%`}
            className="relative h-3.5 rounded-full bg-slate-200 dark:bg-slate-700"
          >
            <div
              className="absolute inset-y-0 rounded-full bg-emerald-300/70 dark:bg-emerald-700/60"
              style={{ left, width }}
              aria-hidden="true"
            />
            <div
              className={cx(
                'absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow dark:border-slate-900',
                MARKER[s.band],
              )}
              style={{ left: `${Math.min(100, Math.max(0, s.acc * 100))}%` }}
              aria-hidden="true"
            />
          </div>
          <div className="relative h-4 text-[11px] text-slate-400 dark:text-slate-500" aria-hidden="true">
            <span className="absolute left-0">0</span>
            <span className="absolute -translate-x-1/2" style={{ left }}>
              70%
            </span>
            <span className="absolute -translate-x-1/2" style={{ left: `${band.high * 100}%` }}>
              88%
            </span>
            <span className="absolute right-0">100%</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {s.correct}/{s.n} 题答对 · 反应时间中位数 {latencyText(s.medianLatencyMs)}
          </p>
        </>
      )}
    </li>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="text-base font-semibold text-slate-900 dark:text-white">{children}</h3>;
}

export interface DayFeedbackProps {
  /** Session date: the controller runs for it once, then its summary is read. */
  date: string;
  /** Re-read when the session changes. */
  version?: number;
}

/**
 * 今日反馈: per-skill accuracy against the 70-88% band, response times, today's mistakes, tomorrow's automatic
 * adjustments with their reasons and one targeted tip. Runs the difficulty controller once when it opens.
 */
export function DayFeedback({ date, version }: DayFeedbackProps) {
  const [summary, setSummary] = useState<DaySummaryV3 | null>(null);
  const [adjustments, setAdjustments] = useState<AdaptiveChange[]>([]);
  const [failed, setFailed] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!ran.current) {
        ran.current = true;
        await runAdaptation(date);
      }
      const s = await getDaySummaryV3(date);
      if (cancelled) return;
      setSummary(s);
      setAdjustments(s.adjustments);
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [date, version]);

  if (failed) {
    return (
      <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        今日反馈读取失败，刷新页面后重试。
      </p>
    );
  }
  if (!summary) {
    return (
      <Card className="py-8 text-center text-sm text-slate-500 dark:text-slate-400" aria-busy="true">
        正在整理今日反馈…
      </Card>
    );
  }

  const skills = (['listen', 'speak', 'decode'] as const).filter((k) => k !== 'decode' || summary.skills.decode.n > 0);
  const mistakes = summary.mistakes.map(mistakeView);

  return (
    <section aria-label="今日反馈" className="flex flex-col gap-4 text-left" data-testid="day-feedback">
      <Card className="flex flex-col gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">今日反馈</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            绿色区域是舒适区边缘 70%–88%：正确率在这里，学得最快。
          </p>
        </div>
        <ul className="flex flex-col gap-5">
          {skills.map((k) => (
            <SkillBar key={k} skill={k} s={summary.skills[k]} band={summary.band} />
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col gap-2.5" aria-label="今天的错题">
        <SectionTitle>今天出错的内容</SectionTitle>
        {mistakes.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="no-mistakes">
            今天没有出错的内容。
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {mistakes.map((m) => (
              <li key={m.key} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  {m.to ? (
                    <Link to={m.to} className="font-en text-[15px] font-medium text-indigo-700 hover:underline dark:text-indigo-300">
                      {m.label}
                    </Link>
                  ) : (
                    <span className="font-en text-[15px] font-medium text-slate-800 dark:text-slate-100">{m.label}</span>
                  )}
                  {m.sub && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{m.sub}</p>}
                </div>
                {m.count > 1 && <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">× {m.count}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-2.5" aria-label="明天的自动调整">
        <SectionTitle>明天的自动调整</SectionTitle>
        {adjustments.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="no-adjustments">
            保持当前难度
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5" data-testid="adjustments">
            {adjustments.map((c, i) => (
              <li key={i} className="flex gap-2 text-[15px] text-slate-700 dark:text-slate-200">
                <span aria-hidden="true">{c.to > c.from ? '↑' : '↓'}</span>
                <span>{c.reasonZh}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex gap-3 bg-indigo-50 dark:bg-indigo-950/40" aria-label="今日建议">
        <span className="text-2xl" aria-hidden="true">
          💡
        </span>
        <div>
          <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">一条建议</p>
          <p className="mt-0.5 text-[15px] leading-relaxed text-slate-800 dark:text-slate-200" data-testid="day-tip">
            {feedbackTip(summary)}
          </p>
        </div>
      </Card>
    </section>
  );
}
