import type { Goal } from '../../types';
import type { ProgressStatus } from '../../lib/goalPlan';
import type { GoalProgress } from '../../lib/repo';
import { Badge, ButtonLink, Card, type Tone } from '../ui';

const STATUS: Record<ProgressStatus, { zh: string; tone: Tone }> = {
  ahead: { zh: '超前', tone: 'emerald' },
  'on-track': { zh: '按计划', tone: 'indigo' },
  behind: { zh: '落后', tone: 'amber' },
};

const FOCUS_ZH: Record<Goal['focus'], string> = { 'speaking-listening': '日常口语与听力' };

export function GoalCard({ goal, progress }: { goal: Goal; progress: GoalProgress }) {
  const { plan, progress: report } = progress;
  const day = Math.min(plan.currentDay, goal.horizonDays);
  const over = plan.currentDay > goal.horizonDays;
  const st = STATUS[report.status];
  return (
    <Card as="section" aria-label="我的目标" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-slate-400 dark:text-slate-500">我的目标</p>
          <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">{FOCUS_ZH[goal.focus]}</p>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
            {goal.horizonDays} 天 · 每天 {goal.dailyMinutes} 分钟
          </p>
        </div>
        <Badge tone={st.tone} data-testid="goal-status" className="text-sm">
          {st.zh}
        </Badge>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="font-medium text-slate-800 dark:text-slate-100" data-testid="goal-day">
            第 {day} / {goal.horizonDays} 天
          </span>
          <span className="text-slate-500 tabular-nums dark:text-slate-400">已学 {progress.itemsLearned} 条语块</span>
        </div>
        <div
          role="progressbar"
          aria-label="计划进度"
          aria-valuemin={0}
          aria-valuemax={goal.horizonDays}
          aria-valuenow={day}
          className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        >
          <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.round((day / goal.horizonDays) * 100)}%` }} />
        </div>
        {over && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">已超过计划周期，可以修改目标开启新的周期。</p>}
      </div>

      <p className="rounded-xl bg-slate-100 px-3.5 py-2.5 text-sm leading-relaxed text-slate-700 dark:bg-slate-800/70 dark:text-slate-200" data-testid="goal-advice">
        {report.adviceZh}
      </p>

      <div className="flex flex-wrap gap-2.5">
        <ButtonLink to="/onboarding" variant="secondary">
          修改目标
        </ButtonLink>
        <ButtonLink to="/onboarding?step=diagnosis" variant="ghost">
          重新做诊断
        </ButtonLink>
      </div>
    </Card>
  );
}
