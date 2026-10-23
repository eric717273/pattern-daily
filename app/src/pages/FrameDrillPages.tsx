import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { DrillMode, Grade, SubstitutionFrame } from '../types';
import { SingleSwapDrill } from '../components/drills/SingleSwapDrill';
import { TranslateDrill } from '../components/drills/TranslateDrill';
import { Badge, Button, ButtonLink, Card, EmptyState, PageHeader, PageLoading } from '../components/ui';
import { GRADE_LABELS } from '../lib/drill';
import { useAllFrames } from '../lib/hooks';
import { SCENE_LABELS } from '../lib/labels';
import { ensureCards, gradeCard } from '../lib/repo';
import type { SwapFeel } from '../lib/swap';

const FEEL_GRADE: Record<SwapFeel, Grade> = { hard: 1, ok: 2, easy: 3 };

function useRouteFrame(): { id: string; frame: SubstitutionFrame | undefined; loading: boolean } {
  const { id = '' } = useParams();
  const frames = useAllFrames();
  const frame = useMemo(() => frames?.find((f) => f.id === id), [frames, id]);
  return { id, frame, loading: frames === undefined };
}

function NotFound({ id, title }: { id: string; title: string }) {
  return (
    <>
      <PageHeader title={title} backTo="/frames" backLabel="全部母框" />
      <EmptyState
        title="找不到这个母框"
        description="它可能已被删除。"
        action={<ButtonLink to={id ? `/frames/${id}` : '/frames'}>返回</ButtonLink>}
      />
    </>
  );
}

interface FinishedProps {
  id: string;
  grade: Grade;
  saved: boolean;
  again: () => void;
  otherTo: string;
  otherLabel: string;
}

function Finished({ id, grade, saved, again, otherTo, otherLabel }: FinishedProps) {
  return (
    <Card className="flex flex-col items-center gap-4 py-8 text-center" aria-label="练习完成">
      <p className="text-5xl" aria-hidden="true">
        🎯
      </p>
      <div>
        <p className="text-lg font-semibold text-slate-900 dark:text-white">这一轮完成了</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {saved ? `已记入复习：${GRADE_LABELS[grade]}` : '成绩没能保存，但练习本身不受影响。'}
        </p>
      </div>
      <div className="grid w-full max-w-sm gap-3">
        <Button variant="primary" size="lg" full onClick={again}>
          再来一轮
        </Button>
        <ButtonLink to={otherTo} size="lg" full>
          {otherLabel}
        </ButtonLink>
        <ButtonLink to={`/frames/${id}`} variant="ghost" full>
          返回母框
        </ButtonLink>
      </div>
    </Card>
  );
}

async function recordGrade(frameId: string, grade: Grade, mode: DrillMode, ms: number): Promise<boolean> {
  try {
    await ensureCards('frame', [frameId]);
    await gradeCard(`frame:${frameId}`, grade, mode, ms);
    return true;
  } catch {
    return false;
  }
}

/** /frames/:id/drill/single - standalone Palmer step 2. */
export function FrameSingleDrillPage() {
  const { id, frame, loading } = useRouteFrame();
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<{ grade: Grade; saved: boolean } | null>(null);

  if (loading) return <PageLoading />;
  if (!frame) return <NotFound id={id} title="单槽快替" />;

  return (
    <>
      <PageHeader
        title="单槽快替"
        backTo={`/frames/${id}`}
        backLabel="母框"
        subtitle={
          <span className="flex items-center gap-2">
            {frame.title}
            <Badge tone="slate">{SCENE_LABELS[frame.scene]}</Badge>
          </span>
        }
      />
      {result ? (
        <Finished
          id={id}
          grade={result.grade}
          saved={result.saved}
          again={() => {
            setResult(null);
            setRound((r) => r + 1);
          }}
          otherTo={`/frames/${id}/drill/translate`}
          otherLabel="去练中译英"
        />
      ) : (
        <SingleSwapDrill
          key={round}
          frame={frame}
          onDone={(r) => {
            const grade = r.grade ?? FEEL_GRADE[r.feel];
            void recordGrade(frame.id, grade, 'single-swap', r.ms).then((saved) => setResult({ grade, saved }));
          }}
        />
      )}
    </>
  );
}

/** /frames/:id/drill/translate - standalone Palmer step 3. */
export function FrameTranslateDrillPage() {
  const { id, frame, loading } = useRouteFrame();
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<{ grade: Grade; saved: boolean } | null>(null);

  if (loading) return <PageLoading />;
  if (!frame) return <NotFound id={id} title="中译英" />;

  return (
    <>
      <PageHeader
        title="中译英"
        backTo={`/frames/${id}`}
        backLabel="母框"
        subtitle={
          <span className="flex items-center gap-2">
            {frame.title}
            <Badge tone="slate">{SCENE_LABELS[frame.scene]}</Badge>
          </span>
        }
      />
      {result ? (
        <Finished
          id={id}
          grade={result.grade}
          saved={result.saved}
          again={() => {
            setResult(null);
            setRound((r) => r + 1);
          }}
          otherTo={`/frames/${id}/drill/single`}
          otherLabel="去练单槽快替"
        />
      ) : (
        <TranslateDrill
          key={round}
          frame={frame}
          onDone={(r) => {
            void recordGrade(frame.id, r.average, 'multi-swap', r.ms).then((saved) =>
              setResult({ grade: r.average, saved }),
            );
          }}
        />
      )}
    </>
  );
}
