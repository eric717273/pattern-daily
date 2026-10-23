import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DailySession, DayPlan, DozenSentence, Scene, StepKey, SubstitutionFrame } from '../types';
import { CompletionScreen } from '../components/today/CompletionScreen';
import { DayHeader } from '../components/today/DayHeader';
import { DeconstructStep } from '../components/today/DeconstructStep';
import { FramesStep } from '../components/today/FramesStep';
import { OutputStep } from '../components/today/OutputStep';
import { nextUndone, STEPS } from '../components/today/steps';
import { WarmupStep } from '../components/today/WarmupStep';
import { ButtonLink, EmptyState, PageLoading } from '../components/ui';
import { getDozen, SEED_FRAMES } from '../content';
import { getDayPlan, todayStr } from '../lib/plan';
import { getAllFrames, getOrCreateProfile, getOrCreateSession, getStats, markStepDone } from '../lib/repo';

interface Boot {
  session: DailySession;
  plan: DayPlan;
  dozen: DozenSentence | undefined;
  frames: SubstitutionFrame[];
  scenes: Scene[];
  dailyMinutes: number;
}

/** 今日: the guided 15-minute session (warm-up -> deconstruct -> frames -> output). */
export function TodayPage() {
  const date = useMemo(() => todayStr(), []);
  const [boot, setBoot] = useState<Boot | null>(null);
  const [view, setView] = useState<StepKey | 'done'>('warmup');
  const [error, setError] = useState<string | null>(null);
  const stats = useLiveQuery(() => getStats(), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [profile, session, all] = await Promise.all([getOrCreateProfile(), getOrCreateSession(date), getAllFrames()]);
      if (cancelled) return;
      // Plan from seed frames only, so saving an AI frame mid-day can't reshuffle today's lesson.
      const plan = getDayPlan(session.dayIndex, SEED_FRAMES);
      const frames = plan.frameIds.flatMap((id) => {
        const f = all.find((x) => x.id === id);
        return f ? [f] : [];
      });
      setBoot({ session, plan, dozen: getDozen(plan.dozenId), frames, scenes: profile.scenes, dailyMinutes: profile.dailyMinutes });
      setView(session.completedAt !== undefined ? 'done' : (nextUndone(session.stepsDone) ?? 'done'));
    })().catch(() => {
      if (!cancelled) setError('读取本地数据失败，请刷新页面重试。');
    });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const complete = useCallback(
    async (step: StepKey, activeMs: number) => {
      try {
        const updated = await markStepDone(date, step, activeMs);
        setBoot((b) => (b ? { ...b, session: updated } : b));
        setView(updated.completedAt !== undefined ? 'done' : (nextUndone(updated.stepsDone, step) ?? 'done'));
        window.scrollTo?.(0, 0);
      } catch {
        setError('保存进度失败，请重试。');
      }
    },
    [date],
  );

  if (error) {
    return <EmptyState title="出错了" description={error} action={<ButtonLink to="/dozen">先去看看 12 句</ButtonLink>} />;
  }
  if (!boot) return <PageLoading />;

  const { session, plan, dozen, frames, scenes, dailyMinutes } = boot;
  const stepInfo = STEPS.find((s) => s.key === view);

  return (
    <>
      <DayHeader plan={plan} stepsDone={session.stepsDone} streak={stats?.streak} dailyMinutes={dailyMinutes} view={view} onSelect={setView} />

      {view === 'done' ? (
        <CompletionScreen session={session} streak={stats?.streak} onMoreFrames={() => setView('frames')} />
      ) : (
        <section aria-label={stepInfo?.label}>
          <div className="mb-3 px-1">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              第 {STEPS.findIndex((s) => s.key === view) + 1} 步 · {stepInfo?.label}
              <span className="ml-2 text-sm font-normal text-slate-400 dark:text-slate-500">
                约 {stepInfo?.minutes} 分钟
              </span>
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{stepInfo?.hint}</p>
          </div>

          {view === 'warmup' && <WarmupStep key="warmup" onComplete={(ms) => complete('warmup', ms)} />}
          {view === 'deconstruct' &&
            (dozen ? (
              <DeconstructStep key="deconstruct" dozen={dozen} dayKey={date} onComplete={(ms) => complete('deconstruct', ms)} />
            ) : (
              <EmptyState title="找不到今天的解构句" />
            ))}
          {view === 'frames' && <FramesStep key="frames" frames={frames} onComplete={(ms) => complete('frames', ms)} />}
          {view === 'output' &&
            (dozen ? (
              <OutputStep
                key="output"
                dozen={dozen}
                frames={frames}
                scenes={scenes}
                dayKey={date}
                count={plan.outputCount}
                onComplete={(ms) => complete('output', ms)}
              />
            ) : (
              <EmptyState title="找不到今天的解构句" />
            ))}
        </section>
      )}
    </>
  );
}
