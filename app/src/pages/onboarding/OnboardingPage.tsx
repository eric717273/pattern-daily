import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PlacementRunner } from '../../components/assessment/Runners';
import { PageHeader, PageLoading } from '../../components/ui';
import type { Assessment, Goal } from '../../types';
import { buildPlacement, scorePlacement, type PlacementPlan, type PlacementResults } from '../../lib/assessment';
import { todayStr } from '../../lib/plan';
import { getOrCreateProfile, getTodayDayIndex, saveAssessment, setGoal } from '../../lib/repo';
import { GoalStep, RECOMMENDED_HORIZON, RECOMMENDED_MINUTES, type GoalDraft } from './GoalStep';
import { IntroStep } from './IntroStep';
import { ResultStep } from './ResultStep';

type Step = 'goal' | 'intro' | 'run' | 'result';

const STEP_NO: Record<Step, number> = { goal: 1, intro: 2, run: 2, result: 3 };
const SUBTITLE: Record<Step, string> = {
  goal: '第 1 步 / 共 3 步：设定目标',
  intro: '第 2 步 / 共 3 步：诊断测试',
  run: '第 2 步 / 共 3 步：诊断测试进行中',
  result: '第 3 步 / 共 3 步：你的起点和计划',
};

/**
 * 目标 -> 诊断测试 -> 结果与计划. Also the "edit goal" screen (an existing goal is preloaded and its start date and
 * start lesson are kept) and, with ?step=diagnosis, the way to redo the placement. Partial progress lives in
 * component state only: leaving the page mid-test discards it.
 */
export function OnboardingPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [existing, setExisting] = useState<Goal | null | undefined>(undefined);
  const [step, setStep] = useState<Step>('goal');
  const [draft, setDraft] = useState<GoalDraft>({ horizonDays: RECOMMENDED_HORIZON, dailyMinutes: RECOMMENDED_MINUTES });
  const [plan, setPlan] = useState<PlacementPlan | null>(null);
  const [assessment, setAssessment] = useState<Assessment | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wantsDiagnosis = params.get('step') === 'diagnosis';
  useEffect(() => {
    let cancelled = false;
    void getOrCreateProfile().then((p) => {
      if (cancelled) return;
      setExisting(p.goal ?? null);
      if (p.goal) {
        setDraft({ horizonDays: p.goal.horizonDays, dailyMinutes: p.goal.dailyMinutes });
        if (wantsDiagnosis) setStep('intro');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [wantsDiagnosis]);

  if (existing === undefined) return <PageLoading />;

  /** The goal to save: keeps the original start of an existing goal, otherwise starts today. */
  const buildGoal = async (): Promise<Goal> => {
    const today = todayStr();
    return {
      focus: 'speaking-listening',
      horizonDays: draft.horizonDays,
      dailyMinutes: draft.dailyMinutes,
      startDate: existing?.startDate ?? today,
      startLesson: existing?.startLesson ?? (await getTodayDayIndex(today)),
    };
  };

  const attempt = async (fn: () => Promise<void>, failStep?: Step) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? `保存失败：${e.message}` : '保存失败，请重试。');
      if (failStep) setStep(failStep);
    } finally {
      setBusy(false);
    }
  };

  const saveOnly = () =>
    attempt(async () => {
      await setGoal(await buildGoal());
      navigate('/plan');
    });

  const skip = () =>
    attempt(async () => {
      await setGoal(await buildGoal());
      setAssessment(undefined);
      setStep('result');
    });

  const startRun = () => {
    setPlan(buildPlacement(Math.random));
    setError(null);
    setStep('run');
  };

  const finishRun = (results: PlacementResults) =>
    attempt(async () => {
      const a = scorePlacement(results);
      await saveAssessment(a);
      await setGoal(await buildGoal());
      setAssessment(a);
      setStep('result');
    }, 'intro');

  return (
    <>
      <PageHeader title={existing ? '修改目标' : '设定目标'} subtitle={SUBTITLE[step]} />
      <div className="mx-auto w-full max-w-xl" data-step={STEP_NO[step]}>
        {step === 'goal' && (
          <GoalStep
            draft={draft}
            onChange={setDraft}
            onNext={() => setStep('intro')}
            editing={existing !== null}
            onSaveOnly={() => void saveOnly()}
            saving={busy}
            error={error}
          />
        )}
        {step === 'intro' && (
          <IntroStep onStart={startRun} onSkip={() => void skip()} onBack={() => setStep('goal')} busy={busy} error={error} />
        )}
        {step === 'run' && plan && (busy ? <PageLoading /> : <PlacementRunner plan={plan} onDone={(r) => void finishRun(r)} />)}
        {step === 'result' && <ResultStep assessment={assessment} onStart={() => navigate('/')} />}
      </div>
    </>
  );
}
