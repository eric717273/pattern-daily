import { useEffect, useState } from 'react';
import { CheckpointRunner } from '../components/assessment/Runners';
import { Badge, Button, ButtonLink, Card, EmptyState, PageHeader, PageLoading } from '../components/ui';
import type { Assessment, Ladder } from '../types';
import { buildCheckpoint, scoreCheckpoint, type CheckpointPlan, type CheckpointResults } from '../lib/assessment';
import { defaultLadder, listenLevelZh, speakLevelZh } from '../lib/ladder';
import { getOrCreateProfile, saveAssessment } from '../lib/repo';
import { db } from '../lib/db';

type Phase = 'intro' | 'run' | 'result';

/** Chunk ids the learner has already met (cards), preferred as checkpoint items. */
async function learnedChunkIds(): Promise<Set<string>> {
  const cards = await db.cards.filter((c) => !c.deleted && c.kind === 'chunk').toArray();
  return new Set(cards.map((c) => c.refId));
}

function Delta({ now, before }: { now: number; before: number | undefined }) {
  if (before === undefined) return null;
  const d = now - before;
  const text = d === 0 ? '与上次持平' : d > 0 ? `比上次高 ${d} 级` : `比上次低 ${-d} 级`;
  return (
    <Badge tone={d > 0 ? 'emerald' : d < 0 ? 'amber' : 'slate'}>{text}</Badge>
  );
}

/** 周复测 (about 3 minutes): 6 listening + 4 speaking items at the current ladder levels. */
export function CheckpointPage() {
  const [phase, setPhase] = useState<Phase>('intro');
  const [loaded, setLoaded] = useState<{ ladder: Ladder; previous?: Assessment; hasGoal: boolean }>();
  const [plan, setPlan] = useState<CheckpointPlan | null>(null);
  const [result, setResult] = useState<Assessment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getOrCreateProfile().then((p) => {
      if (cancelled) return;
      const list = p.assessments ?? [];
      setLoaded({ ladder: p.adaptive?.ladder ?? defaultLadder(), previous: list[list.length - 1], hasGoal: p.goal !== undefined });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) return <PageLoading />;
  const { ladder, previous, hasGoal } = loaded;

  if (!hasGoal) {
    return (
      <>
        <PageHeader title="周复测" backTo="/plan" backLabel="计划" />
        <Card>
          <EmptyState
            title="先设定目标"
            description="周复测要和你的难度阶梯对比，请先设定目标并做一次诊断。"
            action={
              <ButtonLink to="/onboarding" variant="primary">
                去设定目标
              </ButtonLink>
            }
          />
        </Card>
      </>
    );
  }

  const start = async () => {
    const ids = await learnedChunkIds();
    setPlan(buildCheckpoint(ladder, Math.random, { preferIds: ids }));
    setError(null);
    setPhase('run');
  };

  const finish = async (results: CheckpointResults) => {
    setBusy(true);
    try {
      const a = scoreCheckpoint(ladder, results);
      await saveAssessment(a);
      setResult(a);
      setPhase('result');
    } catch (e) {
      setError(e instanceof Error ? `保存失败：${e.message}` : '保存失败，请重试。');
      setPhase('intro');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="周复测" subtitle="约 3 分钟：6 道听辨 + 4 道限时口语" backTo="/plan" backLabel="计划" />
      <div className="mx-auto w-full max-w-xl">
        {phase === 'intro' && (
          <Card className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              听力用你当前的等级和高一级各出 3 题，口语按当前限时（{speakLevelZh(ladder.speak)}）说 4 条。题目优先选你学过的语块。结果会画进“计划”里的进度曲线。
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              当前：听力 {listenLevelZh(ladder.listen)}；口语 {speakLevelZh(ladder.speak)}。请打开声音；麦克风可选，口语题也可以自评。
            </p>
            {error && (
              <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                {error}
              </p>
            )}
            <Button variant="primary" size="lg" full onClick={() => void start()}>
              开始复测
            </Button>
          </Card>
        )}
        {phase === 'run' && plan && (busy ? <PageLoading /> : <CheckpointRunner plan={plan} onDone={(r) => void finish(r)} />)}
        {phase === 'result' && result && (
          <Card className="flex flex-col gap-4" aria-label="复测结果">
            <div>
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500">复测结果</p>
              <p className="mt-0.5 text-3xl font-bold text-indigo-600 dark:text-indigo-400" data-testid="checkpoint-level">
                {result.levelZh}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-100 px-3.5 py-3 dark:bg-slate-800/70">
                <p className="text-xs text-slate-500 dark:text-slate-400">听力</p>
                <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white" data-testid="checkpoint-listen">
                  L{result.listenLevel} · 正确率 {Math.round(result.listenAcc * 100)}%
                </p>
                <div className="mt-1">
                  <Delta now={result.listenLevel} before={previous?.listenLevel} />
                </div>
              </div>
              <div className="rounded-xl bg-slate-100 px-3.5 py-3 dark:bg-slate-800/70">
                <p className="text-xs text-slate-500 dark:text-slate-400">口语</p>
                <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white" data-testid="checkpoint-speak">
                  S{result.speakLevel} · 正确率 {Math.round(result.speakAcc * 100)}%
                </p>
                <div className="mt-1">
                  <Delta now={result.speakLevel} before={previous?.speakLevel} />
                </div>
              </div>
            </div>
            {result.speakAcc > 0 && result.speakMedianMs === undefined && (
              <p className="text-sm text-amber-700 dark:text-amber-300" data-testid="result-self-estimate">
                口语等级按自评估算；开启语音验证后会更准
              </p>
            )}
            {previous ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                对比{previous.kind === 'placement' ? '诊断' : '上次复测'}（{previous.date}）：听力 L{previous.listenLevel}，口语 S{previous.speakLevel}。
              </p>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">这是第一条测评记录，下次复测会和它对比。</p>
            )}
            <p className="text-xs leading-relaxed text-slate-400 dark:text-slate-500">
              复测只用 10 道题，有一定随机性，看趋势比看单次结果更可靠。它不会改动你的难度阶梯，阶梯由每天的练习自动调整。
            </p>
            <ButtonLink to="/plan" variant="primary" size="lg" full>
              回到计划
            </ButtonLink>
          </Card>
        )}
      </div>
    </>
  );
}
