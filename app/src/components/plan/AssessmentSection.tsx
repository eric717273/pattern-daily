import type { Assessment } from '../../types';
import { ButtonLink } from '../ui';
import { LineChart } from './LineChart';

const KIND_ZH: Record<Assessment['kind'], string> = { placement: '诊断', checkpoint: '周复测' };

export function AssessmentSection({ assessments }: { assessments: readonly Assessment[] }) {
  const labels = assessments.map((a) => a.date.slice(5));
  return (
    <div className="flex flex-col gap-4">
      {assessments.length === 0 ? (
        <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400" data-testid="assess-empty">
          还没有测评记录。做一次诊断或周复测，这里会画出听力和口语等级的变化。
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2" data-testid="assess-chart">
            <LineChart title="听力等级（L0–L8）" values={assessments.map((a) => a.listenLevel)} max={8} colorClass="text-indigo-600 dark:text-indigo-400" labels={labels} />
            <LineChart title="口语等级（S0–S5）" values={assessments.map((a) => a.speakLevel)} max={5} colorClass="text-violet-600 dark:text-violet-400" labels={labels} />
          </div>
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800" aria-label="测评记录">
            {[...assessments].reverse().map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 text-sm" data-testid="assess-row">
                <span className="w-24 shrink-0 whitespace-nowrap text-slate-400 tabular-nums dark:text-slate-500">{a.date}</span>
                <span className="font-medium text-slate-900 dark:text-white">{KIND_ZH[a.kind]} · {a.levelZh}</span>
                <span className="text-slate-600 tabular-nums dark:text-slate-300">
                  听力 L{a.listenLevel}（{Math.round(a.listenAcc * 100)}%） · 口语 S{a.speakLevel}（{Math.round(a.speakAcc * 100)}%）
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="flex flex-wrap gap-2.5">
        <ButtonLink to="/assessment/checkpoint" variant="primary">
          做一次周复测
        </ButtonLink>
        <ButtonLink to="/onboarding?step=diagnosis" variant="ghost">
          重新做诊断
        </ButtonLink>
      </div>
      <p className="text-xs leading-relaxed text-slate-400 dark:text-slate-500">测评是本软件内部的估计，不是标准化考试。</p>
    </div>
  );
}
