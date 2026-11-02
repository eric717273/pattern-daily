import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DailySession, DayPlan, Scene, StepKey } from '../types';
import { ChunksStep } from '../components/today/ChunksStep';
import { CompletionScreen } from '../components/today/CompletionScreen';
import { DayHeader } from '../components/today/DayHeader';
import { DecodeStep } from '../components/today/DecodeStep';
import { ListeningStep } from '../components/today/ListeningStep';
import { OutputStep } from '../components/today/OutputStep';
import { ReviewStep } from '../components/today/ReviewStep';
import { useFocusPref } from '../components/today/focusPref';
import { StepRunner } from '../components/today/StepRunner';
import { isV3Plan, knownSteps, nextUndone, stepMinutes, stepsFor } from '../components/today/steps';
import { ButtonLink, Card, EmptyState, PageLoading } from '../components/ui';
import { getDayPlan, todayStr } from '../lib/plan';
import { CURRICULUM } from '../content';
import { getLibraryProgress, getOrCreateProfile, getOrCreateSession, getStats, markStepDone } from '../lib/repo';

interface Boot {
  session: DailySession;
  /** The plan frozen in the session; stays the same object for the whole visit. */
  plan: DayPlan;
  scenes: Scene[];
  dailyMinutes: number;
  hasGoal: boolean;
}

/** 今日: the guided daily lesson, from the frozen plan. v2 plans have 4 steps; v3 plans (with a goal) 5, each with a time budget. */
export function TodayPage() {
  const date = useMemo(() => todayStr(), []);
  const [boot, setBoot] = useState<Boot | null>(null);
  const [view, setView] = useState<StepKey | 'done'>('review');
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useFocusPref();
  const stats = useLiveQuery(() => getStats(), []);
  const library = useLiveQuery(() => getLibraryProgress(), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [profile, session] = await Promise.all([getOrCreateProfile(), getOrCreateSession(date)]);
      if (cancelled) return;
      // getOrCreateSession always freezes a plan; the fallback only guards a hand-edited record.
      const plan = session.plan ?? getDayPlan({ dayIndex: session.dayIndex, introduced: new Set(), curriculum: CURRICULUM, newPerDay: profile.newPerDay ?? 5 });
      setBoot({ session, plan, scenes: profile.scenes, dailyMinutes: profile.dailyMinutes, hasGoal: profile.goal !== undefined });
      const order = stepsFor(plan).map((s) => s.key);
      setView(session.completedAt !== undefined ? 'done' : (nextUndone(knownSteps(session.stepsDone), undefined, order) ?? 'done'));
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
        const order = stepsFor(updated.plan).map((s) => s.key);
        setView(updated.completedAt !== undefined ? 'done' : (nextUndone(knownSteps(updated.stepsDone), step, order) ?? 'done'));
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

  const { session, plan, scenes, dailyMinutes, hasGoal } = boot;
  const stepsDone = knownSteps(session.stepsDone);
  const steps = stepsFor(plan);
  const v3 = isV3Plan(plan);
  const stepIndex = steps.findIndex((s) => s.key === view);
  const stepInfo = steps[stepIndex];
  const ladder = v3 ? plan.ladder : undefined;

  return (
    <>
      {!hasGoal && (
        <Card className="mb-5 flex flex-col gap-3 border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/40" data-testid="goal-card">
          <div>
            <p className="text-[15px] font-semibold text-indigo-900 dark:text-indigo-100">设定目标并做 10 分钟诊断，开启自适应训练</p>
            <p className="mt-0.5 text-sm text-indigo-800/80 dark:text-indigo-200/80">
              系统会按你的水平安排每天的时间、语速和新语块数量，并让正确率保持在舒适区边缘。
            </p>
          </div>
          <ButtonLink to="/onboarding" variant="primary" full>
            设定目标
          </ButtonLink>
        </Card>
      )}
      {v3 && plan.checkpointDue && (
        <Card className="mb-5 flex items-center justify-between gap-3 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40" data-testid="checkpoint-card">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-amber-900 dark:text-amber-100">本周复测到了</p>
            <p className="text-sm text-amber-800/80 dark:text-amber-200/80">可选，约 3 分钟：看看这周的进步。</p>
          </div>
          <ButtonLink to="/assessment/checkpoint" size="md" className="shrink-0">
            去复测
          </ButtonLink>
        </Card>
      )}

      <DayHeader
        plan={plan}
        stepsDone={stepsDone}
        streak={stats?.streak}
        dailyMinutes={dailyMinutes}
        library={library ? { introduced: library.introduced, total: library.total } : undefined}
        view={view}
        onSelect={setView}
      />

      {view === 'done' || !stepInfo ? (
        <CompletionScreen session={session} plan={plan} streak={stats?.streak} />
      ) : (
        <StepRunner
          key={view}
          stepKey={view}
          label={stepInfo.label}
          hint={stepInfo.hint}
          index={stepIndex + 1}
          total={steps.length}
          budgetMin={v3 ? stepMinutes(plan, view) : undefined}
          done={stepsDone.includes(view)}
          isLast={stepIndex === steps.length - 1}
          focus={focus}
          onFocusChange={setFocus}
          onNext={(ms) => complete(view, ms)}
        >
          {view === 'review' && <ReviewStep key="review" edge={ladder ? plan.edge : undefined} ladder={ladder} onComplete={(ms) => complete('review', ms)} />}
          {view === 'chunks' && (
            <ChunksStep
              key="chunks"
              items={plan.newItems}
              redo={stepsDone.includes('chunks')}
              ladder={ladder}
              onComplete={(ms) => complete('chunks', ms)}
            />
          )}
          {view === 'listening' && plan.listening && ladder && (
            <ListeningStep key="listening" listening={plan.listening} ladder={ladder} onComplete={(ms) => complete('listening', ms)} />
          )}
          {view === 'decode' && <DecodeStep key="decode" decode={plan.decode} dayKey={date} onComplete={(ms) => complete('decode', ms)} />}
          {view === 'output' && (
            <OutputStep key="output" plan={plan} scenes={scenes} dayKey={date} onComplete={(ms) => complete('output', ms)} />
          )}
        </StepRunner>
      )}
    </>
  );
}
