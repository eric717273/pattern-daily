import { useEffect, useState } from 'react';
import type { Assessment, Profile } from '../../types';
import { PhaseTimeline } from '../../components/plan/PhaseTimeline';
import { Button, Card, PageLoading } from '../../components/ui';
import { defaultLadder, listenRate, speakLimitMs } from '../../lib/ladder';
import { getGoalProgress, getOrCreateProfile, type GoalProgress } from '../../lib/repo';

export interface ResultStepProps {
  /** The placement result; undefined when the diagnosis was skipped. */
  assessment?: Assessment;
  onStart: () => void;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-slate-100 px-2.5 py-3 dark:bg-slate-800/70">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-base font-bold text-slate-900 tabular-nums dark:text-white">{value}</p>
      {sub && <p className="text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  );
}

export function ResultStep({ assessment, onStart }: ResultStepProps) {
  const [loaded, setLoaded] = useState<{ profile: Profile; progress?: GoalProgress }>();
  useEffect(() => {
    let cancelled = false;
    void Promise.all([getOrCreateProfile(), getGoalProgress()]).then(([profile, progress]) => {
      if (!cancelled) setLoaded({ profile, progress });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!loaded) return <PageLoading />;
  const { profile, progress } = loaded;
  const ladder = profile.adaptive?.ladder ?? defaultLadder();
  const listen = assessment?.listenLevel ?? ladder.listen;
  const speak = assessment?.speakLevel ?? ladder.speak;

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4" aria-label="诊断结果">
        {assessment ? (
          <div>
            <p className="text-xs font-medium text-slate-400 dark:text-slate-500">你现在的水平</p>
            <p className="mt-0.5 text-3xl font-bold text-indigo-600 dark:text-indigo-400" data-testid="result-level">
              {assessment.levelZh}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              这是本软件内部的估计，不是标准化考试。它只用来决定从哪里开始，练习中会根据你的表现自动调整。
            </p>
          </div>
        ) : (
          <div>
            <p className="text-lg font-bold text-slate-900 dark:text-white" data-testid="result-skipped">
              已跳过诊断
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              先用默认难度开始。练习一段时间后系统会自动调节；想要更准的起点，随时可以在“计划”里补做诊断。
            </p>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="听力起点语速" value={`${listenRate(listen).toFixed(2)}×`} sub={`等级 L${listen}`} />
          <Stat label="口语限时" value={`${speakLimitMs(speak) / 1000} 秒`} sub={`等级 S${speak}`} />
          {assessment && <Stat label="直接记为已学" value={`${assessment.fastTracked?.length ?? 0} 条`} sub="3 秒内说对" />}
        </div>
      </Card>

      {progress && (
        <section aria-labelledby="result-plan" className="flex flex-col gap-3">
          <div>
            <h2 id="result-plan" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              你的 {progress.plan.horizonDays} 天计划
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">每天 {progress.plan.dailyMinutes} 分钟，分三个阶段，每个阶段结束时检查里程碑。</p>
          </div>
          <PhaseTimeline plan={progress.plan} />
        </section>
      )}

      <Button variant="primary" size="lg" full onClick={onStart}>
        开始第一课
      </Button>
    </div>
  );
}
