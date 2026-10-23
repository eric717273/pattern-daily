import { useMemo, useRef, useState } from 'react';
import { getItem } from '../../content';
import type { Chunk, CardState, DrillMode, Grade, SubstitutionFrame } from '../../types';
import { chunkGrade, frameReviewGrade } from '../../lib/chunkDrill';
import { singleSwapSequence } from '../../lib/frameEngine';
import { useAllFrames } from '../../lib/hooks';
import { Button, EmptyState, PageLoading } from '../ui';
import { ListenDrill, type ListenResult } from './ListenDrill';
import { RecallDrill, type RecallResult } from './RecallDrill';
import { StepIndicator } from './StepIndicator';

/** Voice time limit of a chunk recall in a review (shorter than when learning: it is already familiar). */
export const REVIEW_CHUNK_RECALL_MS = 5000;
/** Voice time limit of each frame sentence in a review. */
export const REVIEW_FRAME_RECALL_MS = 8000;
/** Sentences prompted when reviewing a frame (the second differs from the first in one slot). */
export const REVIEW_FRAME_PROMPTS = 2;

export interface ReviewItemProps {
  /** A due chunk or frame card (`kind` 'chunk' | 'frame'). */
  card: CardState;
  /**
   * Fired once when the review of this card is finished. The CALLER persists it with
   * `repo.gradeCard(card.id, grade, mode, ms)`. mode is 'recall' for a chunk and 'multi-swap' for a frame;
   * `info.ms` is the wall-clock time spent.
   */
  onDone: (grade: Grade, mode: DrillMode, info?: { ms: number }) => void;
  /** Called by 跳过 when the card's content no longer exists (a deleted user frame) or is not a chunk/frame. */
  onSkip?: () => void;
}

/**
 * Due review, about 20 seconds per card:
 *   chunk: 听辨 (ListenDrill) -> 说出 (RecallDrill, 5 s). Grade = chunkGrade (see NewItemFlow).
 *   frame: two Chinese prompts of the frame (a random sentence, then the same sentence with one slot swapped),
 *          each said in full within 8 s. Grade: both right -> 3 when the average is within half the limit else 2,
 *          one right -> 1, none -> 0.
 */
export function ReviewItem({ card, onDone, onSkip }: ReviewItemProps) {
  const frames = useAllFrames();
  const refKind = card.kind === 'chunk' ? 'chunk' : card.kind === 'frame' ? 'frame' : null;
  const item = useMemo(
    () => (refKind ? getItem({ kind: refKind, id: card.refId }, frames ?? []) : undefined),
    [refKind, card.refId, frames],
  );

  if (!item) {
    if (refKind === 'frame' && frames === undefined) return <PageLoading />;
    return (
      <EmptyState
        title="这条内容已不存在"
        description="它可能已被删除，跳过即可。"
        action={
          <Button variant="secondary" onClick={() => (onSkip ? onSkip() : onDone(2, 'review'))}>
            跳过
          </Button>
        }
      />
    );
  }
  return item.kind === 'chunk' ? (
    <ReviewChunk chunk={item.chunk} onDone={onDone} />
  ) : (
    <ReviewFrame frame={item.frame} onDone={onDone} />
  );
}

type Done = ReviewItemProps['onDone'];

function ReviewChunk({ chunk, onDone }: { chunk: Chunk; onDone: Done }) {
  const item = useMemo(() => ({ kind: 'chunk' as const, chunk }), [chunk]);
  const [stage, setStage] = useState(0);
  const listen = useRef<ListenResult | null>(null);
  const [startedAt] = useState(() => Date.now());
  return (
    <div className="flex flex-col gap-3.5">
      <StepIndicator steps={['听辨', '说出']} current={stage} />
      {stage === 0 ? (
        <ListenDrill
          key="listen"
          item={item}
          continueLabel="下一步：说出来"
          onDone={(r) => {
            listen.current = r;
            setStage(1);
          }}
        />
      ) : (
        <RecallDrill
          key="recall"
          item={item}
          timeLimitMs={REVIEW_CHUNK_RECALL_MS}
          continueLabel="完成"
          onDone={(r) =>
            onDone(
              chunkGrade(listen.current ?? { correct: false, replays: 0 }, r, REVIEW_CHUNK_RECALL_MS),
              'recall',
              { ms: Math.min(600_000, Date.now() - startedAt) },
            )
          }
        />
      )}
    </div>
  );
}

function ReviewFrame({ frame, onDone }: { frame: SubstitutionFrame; onDone: Done }) {
  const item = useMemo(() => ({ kind: 'frame' as const, frame }), [frame]);
  const [combos] = useState(() => singleSwapSequence(frame, REVIEW_FRAME_PROMPTS));
  const [stage, setStage] = useState(0);
  const results = useRef<RecallResult[]>([]);
  const [startedAt] = useState(() => Date.now());
  const combo = combos[stage];
  return (
    <div className="flex flex-col gap-3.5">
      <StepIndicator steps={combos.map((_, i) => `第 ${i + 1} 句`)} current={stage} />
      {combo && (
        <RecallDrill
          key={`${frame.id}-${stage}`}
          item={item}
          combo={combo}
          timeLimitMs={REVIEW_FRAME_RECALL_MS}
          continueLabel={stage + 1 < combos.length ? '下一句' : '完成'}
          onDone={(r) => {
            results.current = [...results.current, r];
            if (stage + 1 < combos.length) setStage(stage + 1);
            else
              onDone(frameReviewGrade(results.current, REVIEW_FRAME_RECALL_MS), 'multi-swap', {
                ms: Math.min(600_000, Date.now() - startedAt),
              });
          }}
        />
      )}
    </div>
  );
}
