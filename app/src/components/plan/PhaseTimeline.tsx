import type { Ladder } from '../../types';
import type { GoalPlan, Milestone } from '../../lib/goalPlan';
import { listenLevelZh, speakLevelZh } from '../../lib/ladder';
import { Badge, cx } from '../ui';

export interface PhaseCurrent {
  itemsLearned: number;
  ladder: Ladder;
}

function reached(m: Milestone, c: PhaseCurrent): { items: boolean; listen: boolean; speak: boolean } {
  return {
    items: c.itemsLearned >= m.itemsLearned,
    listen: c.ladder.listen >= m.listenLevel,
    speak: c.ladder.speak >= m.speakLevel,
  };
}

function Check({ ok, children }: { ok: boolean | undefined; children: string }) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-label={ok === undefined ? undefined : ok ? '已达到' : '未达到'}
        className={cx(
          'mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] leading-none font-bold',
          ok && 'bg-emerald-500 text-white',
          ok === false && 'border border-slate-300 text-transparent dark:border-slate-600',
          ok === undefined && 'text-transparent before:size-1.5 before:rounded-full before:bg-slate-400 before:content-[""] dark:before:bg-slate-500',
        )}
      >
        ✓
      </span>
      <span className={cx(ok ? 'text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300')}>{children}</span>
    </li>
  );
}

/** 3 phases of a goal plan: day range, focus and measurable milestones. With `current`, milestones show a check status. */
export function PhaseTimeline({ plan, current }: { plan: GoalPlan; current?: PhaseCurrent }) {
  return (
    <ol className="flex flex-col gap-3" aria-label="阶段时间线">
      {plan.phases.map((p, i) => {
        const isCurrent = i === plan.currentPhase && plan.currentDay <= plan.horizonDays;
        const past = plan.currentDay > p.toDay;
        const r = current ? reached(p.milestones, current) : undefined;
        const allReached = r ? r.items && r.listen && r.speak : false;
        const badge = !current
          ? null
          : past
            ? allReached
              ? { tone: 'emerald' as const, text: '已达成' }
              : { tone: 'amber' as const, text: '未达成' }
            : isCurrent
              ? { tone: 'indigo' as const, text: '进行中' }
              : { tone: 'slate' as const, text: '未开始' };
        return (
          <li
            key={p.id}
            aria-current={isCurrent ? 'step' : undefined}
            data-testid={`phase-${p.id}`}
            className={cx(
              'relative rounded-2xl border p-4',
              isCurrent
                ? 'border-indigo-400 bg-indigo-50/60 dark:border-indigo-500 dark:bg-indigo-950/30'
                : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
            )}
          >
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="text-base font-semibold text-slate-900 dark:text-white">
                {i + 1}. {p.nameZh}
              </span>
              <span className="text-sm text-slate-500 tabular-nums dark:text-slate-400">
                第 {p.fromDay}–{p.toDay} 天
              </span>
              {isCurrent && (
                <Badge tone="indigo" data-testid="phase-current">
                  现在在这里 · 第 {plan.currentDay} 天
                </Badge>
              )}
              {badge && !isCurrent && <Badge tone={badge.tone}>{badge.text}</Badge>}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{p.focusZh}</p>
            <p className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">第 {p.toDay} 天的里程碑</p>
            <ul className="mt-1.5 flex flex-col gap-1.5 text-sm" aria-label={`${p.nameZh}里程碑`}>
              <Check ok={r?.items}>{`已学 ${p.milestones.itemsLearned} 条语块`}</Check>
              <Check ok={r?.listen}>{`听力 ${listenLevelZh(p.milestones.listenLevel)}`}</Check>
              <Check ok={r?.speak}>{`口语 ${speakLevelZh(p.milestones.speakLevel)}`}</Check>
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
