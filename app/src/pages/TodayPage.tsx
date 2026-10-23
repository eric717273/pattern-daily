import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DailySession, DayPlan, Scene, StepKey } from '../types';
import { ChunksStep } from '../components/today/ChunksStep';
import { CompletionScreen } from '../components/today/CompletionScreen';
import { DayHeader } from '../components/today/DayHeader';
import { DecodeStep } from '../components/today/DecodeStep';
import { OutputStep } from '../components/today/OutputStep';
import { ReviewStep } from '../components/today/ReviewStep';
import { knownSteps, nextUndone, STEPS } from '../components/today/steps';
import { ButtonLink, EmptyState, PageLoading } from '../components/ui';
import { getDayPlan, todayStr } from '../lib/plan';
import { CURRICULUM } from '../content';
import { getLibraryProgress, getOrCreateProfile, getOrCreateSession, getStats, markStepDone } from '../lib/repo';

interface Boot {
  session: DailySession;
  /** The plan frozen in the session; stays the same object for the whole visit. */
  plan: DayPlan;
  scenes: Scene[];
  dailyMinutes: number;
}

/** 今日: the guided daily lesson on two independent tracks (复习 -> 新语块 -> 解码 -> 输出), from the frozen plan. */
export function TodayPage() {
  const date = useMemo(() => todayStr(), []);
  const [boot, setBoot] = useState<Boot | null>(null);
  const [view, setView] = useState<StepKey | 'done'>('review');
  const [error, setError] = useState<string | null>(null);
  const stats = useLiveQuery(() => getStats(), []);
  const library = useLiveQuery(() => getLibraryProgress(), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [profile, session] = await Promise.all([getOrCreateProfile(), getOrCreateSession(date)]);
      if (cancelled) return;
      // getOrCreateSession always freezes a plan; the fallback only guards a hand-edited record.
      const plan = session.plan ?? getDayPlan({ dayIndex: session.dayIndex, introduced: new Set(), curriculum: CURRICULUM, newPerDay: profile.newPerDay ?? 5 });
      setBoot({ session, plan, scenes: profile.scenes, dailyMinutes: profile.dailyMinutes });
      const done = knownSteps(session.stepsDone);
      setView(session.completedAt !== undefined ? 'done' : (nextUndone(done) ?? 'done'));
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
        setView(updated.completedAt !== undefined ? 'done' : (nextUndone(knownSteps(updated.stepsDone), step) ?? 'done'));
        window.scrollTo?.(0, 0);
      } catch {
        setError('保存进度失败，请重试。');
      }
    },
    [date],
  );

  if (error) {
    return <EmptyState title="出错了" description={error} action={<ButtonLink to="/library">先去语块库看看</ButtonLink>} />;
  }
  if (!boot) return <PageLoading />;

  const { session, plan, scenes, dailyMinutes } = boot;
  const stepsDone = knownSteps(session.stepsDone);
  const stepInfo = STEPS.find((s) => s.key === view);

  return (
    <>
      <DayHeader
        plan={plan}
        stepsDone={stepsDone}
        streak={stats?.streak}
        dailyMinutes={dailyMinutes}
        library={library ? { introduced: library.introduced, total: library.total } : undefined}
        view={view}
        onSelect={setView}
      />

      {view === 'done' ? (
        <CompletionScreen session={session} plan={plan} streak={stats?.streak} />
      ) : (
        <section aria-label={stepInfo?.label}>
          <div className="mb-3 px-1">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              第 {STEPS.findIndex((s) => s.key === view) + 1} 步 · {stepInfo?.label}
              <span className="ml-2 text-sm font-normal text-slate-400 dark:text-slate-500">约 {stepInfo?.minutes} 分钟</span>
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{stepInfo?.hint}</p>
          </div>

          {view === 'review' && <ReviewStep key="review" onComplete={(ms) => complete('review', ms)} />}
          {view === 'chunks' && (
            <ChunksStep
              key="chunks"
              items={plan.newItems}
              redo={stepsDone.includes('chunks')}
              onComplete={(ms) => complete('chunks', ms)}
            />
          )}
          {view === 'decode' && <DecodeStep key="decode" decode={plan.decode} dayKey={date} onComplete={(ms) => complete('decode', ms)} />}
          {view === 'output' && (
            <OutputStep key="output" plan={plan} scenes={scenes} dayKey={date} onComplete={(ms) => complete('output', ms)} />
          )}
        </section>
      )}
    </>
  );
}
