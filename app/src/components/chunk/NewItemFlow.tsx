import { useMemo, useRef, useState } from 'react';
import { getItem } from '../../content';
import type { DrillMode, Grade, ItemRef } from '../../types';
import { chunkGrade, frameGrade } from '../../lib/chunkDrill';
import { useAllFrames } from '../../lib/hooks';
import { FEEL_GRADE } from '../../lib/swap';
import { AnchorDrill } from '../drills/AnchorDrill';
import { SingleSwapDrill, type SingleSwapResult } from '../drills/SingleSwapDrill';
import { EmptyState, PageLoading } from '../ui';
import { ListenDrill, type ListenResult } from './ListenDrill';
import { CHUNK_RECALL_MS, RecallDrill, type RecallResult } from './RecallDrill';
import { ShadowDrill } from './ShadowDrill';
import { StepIndicator } from './StepIndicator';

const CHUNK_STEPS = ['听辨', '跟读', '说出'] as const;
const FRAME_STEPS = ['听辨', '锚定', '快替'] as const;
/** Prompts of the 单槽快替 round in a new-frame flow: the start sentence plus 5 swaps. */
export const NEW_FRAME_SWAP_LENGTH = 6;

export interface NewItemFlowProps {
  /** The library item to learn (React 19 passes `ref` through as an ordinary prop on function components). */
  ref: ItemRef;
  /**
   * Fired once, after the last step. The CALLER persists it (`repo.introduceItems([ref])`, then
   * `repo.gradeCard(...)`). `info.ms` is the wall-clock time of the whole flow, `info.mode` the DrillMode
   * to log (chunk 'recall', frame 'single-swap').
   */
  onDone: (grade: Grade, info: { ms: number; mode: DrillMode }) => void;
}

/** The item to learn (React 19 hands `ref` to function components as a normal prop). */
const refOf = (p: NewItemFlowProps): ItemRef => p.ref;

/**
 * Learn one new item:
 *   chunk: 听辨 (ListenDrill) -> 跟读 (ShadowDrill, 3 reps) -> 说出 (RecallDrill, 6 s)
 *   frame: 听辨 (ListenDrill) -> 锚定 (AnchorDrill) -> 快替 (SingleSwapDrill, 5 swaps)
 *
 * Grade (see lib/chunkDrill.ts):
 *   chunk = listenPoints (0 wrong / 1 right after replay / 2 right first time)
 *         + recallPoints (0 not said / 1 said in time / 2 said within half the limit);
 *     0 -> 0 忘了, 1-2 -> 1 困难, 3 -> 2 良好, 4 -> 3 简单. 跟读 only has to be completed; it is not graded.
 *   frame = the 单槽快替 grade (voice mode: accuracy 6/7 -> 3, 4/7 -> 2, 2/7 -> 1; self-graded: 吃力 1, 刚好 2,
 *     轻松 3) minus 1 when the listening question was wrong.
 */
export function NewItemFlow(props: NewItemFlowProps) {
  const { onDone } = props;
  const target = refOf(props);
  const frames = useAllFrames();
  const item = useMemo(() => getItem({ kind: target.kind, id: target.id }, frames ?? []), [target.kind, target.id, frames]);
  const [step, setStep] = useState(0);
  const listen = useRef<ListenResult | null>(null);
  const [startedAt] = useState(() => Date.now());

  if (!item) {
    if (target.kind === 'frame' && frames === undefined) return <PageLoading />;
    return <EmptyState title="找不到这条内容" description="它可能已被删除。" />;
  }

  const steps = item.kind === 'chunk' ? CHUNK_STEPS : FRAME_STEPS;
  const finish = (grade: Grade, mode: DrillMode) =>
    onDone(grade, { ms: Math.min(1_800_000, Date.now() - startedAt), mode });
  const listenResult = (): ListenResult => listen.current ?? { correct: false, replays: 0, ms: 0 };

  let body;
  if (step === 0) {
    body = (
      <ListenDrill
        key="listen"
        item={item}
        continueLabel={item.kind === 'chunk' ? '下一步：跟读' : '下一步：锚定'}
        onDone={(r) => {
          listen.current = r;
          setStep(1);
        }}
      />
    );
  } else if (item.kind === 'chunk') {
    body =
      step === 1 ? (
        <ShadowDrill key="shadow" item={item} doneLabel="下一步：说出来" onDone={() => setStep(2)} />
      ) : (
        <RecallDrill
          key="recall"
          item={item}
          timeLimitMs={CHUNK_RECALL_MS}
          continueLabel="完成"
          onDone={(r: RecallResult) => finish(chunkGrade(listenResult(), r, CHUNK_RECALL_MS), 'recall')}
        />
      );
  } else {
    body =
      step === 1 ? (
        <AnchorDrill key="anchor" frame={item.frame} doneLabel="下一步：单槽快替" onDone={() => setStep(2)} />
      ) : (
        <SingleSwapDrill
          key="swap"
          frame={item.frame}
          length={NEW_FRAME_SWAP_LENGTH}
          doneLabel="完成"
          onDone={(r: SingleSwapResult) => finish(frameGrade(listenResult(), r.grade ?? FEEL_GRADE[r.feel]), 'single-swap')}
        />
      );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <StepIndicator steps={steps} current={step} />
      {body}
    </div>
  );
}
