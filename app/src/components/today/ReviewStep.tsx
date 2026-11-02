import { useEffect, useMemo, useRef, useState } from 'react';
import type { CardState, DrillMode, Grade, ItemRef, Ladder } from '../../types';
import { useActiveTimer } from '../../lib/activeTimer';
import { db } from '../../lib/db';
import { speakLimitMs } from '../../lib/ladder';
import { itemKey } from '../../lib/plan';
import { getDueCards } from '../../lib/repo';
import { saveReview, type ItemParts } from '../../lib/today';
import { ReviewItem } from '../chunk';
import { Badge, Button, Card, EmptyState, PageLoading } from '../ui';

/** Most cards one review step asks for. */
export const REVIEW_LIMIT = 15;

/** Edge cards that are not due yet but still worth a look (v3), at most this many. */
export const EDGE_EXTRA_LIMIT = 3;

export interface ReviewStepProps {
  /** v3: edge items come first (labelled 边缘语块), including a few that are not due yet. */
  edge?: ItemRef[];
  /** v3: the ladder in force; its speak limit applies to the recall drills and its levels go into the measurements. */
  ladder?: Ladder;
  onComplete: (activeMs: number) => void | Promise<void>;
}

/**
 * Step 1 复习: the chunk/frame cards that are due, taken as a snapshot when the step opens and reviewed one by one
 * (ReviewItem). Each grade is saved right away, so a reload simply continues with what is still due.
 */
export function ReviewStep({ edge, ladder, onComplete }: ReviewStepProps) {
  const timer = useActiveTimer();
  const [cards, setCards] = useState<CardState[] | null>(null);
  const [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const edgeKeys = useMemo(() => new Set((edge ?? []).map(itemKey)), [edge]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const due = await getDueCards(Date.now(), REVIEW_LIMIT, ['chunk', 'frame']);
      if (edgeKeys.size === 0) return due;
      // edge items first; a few that are not due yet join them, the rest keep their order
      const dueEdge = due.filter((c) => edgeKeys.has(c.id));
      const have = new Set(due.map((c) => c.id));
      const extra: CardState[] = [];
      for (const key of edgeKeys) {
        if (extra.length >= EDGE_EXTRA_LIMIT) break;
        if (have.has(key)) continue;
        const card = await db.cards.get(key);
        if (card && !card.deleted) extra.push(card);
      }
      return [...dueEdge, ...extra, ...due.filter((c) => !edgeKeys.has(c.id))].slice(0, REVIEW_LIMIT);
    })()
      .then((list) => {
        if (!cancelled) setCards(list);
      })
      .catch(() => {
        if (!cancelled) setCards([]);
      });
    return () => {
      cancelled = true;
    };
  }, [edgeKeys]);

  const finish = async () => {
    if (started.current) return;
    started.current = true;
    setSaving(true);
    try {
      await onComplete(timer.read());
    } finally {
      started.current = false;
      setSaving(false);
    }
  };

  if (!cards) return <PageLoading />;

  if (cards.length === 0) {
    return (
      <Card>
        <EmptyState
          title="今天没有到期的复习 🎉"
          description="新学的语块明天开始会出现在这里。先去学今天的新语块吧。"
          action={
            <Button variant="primary" size="lg" disabled={saving} onClick={() => void finish()}>
              继续：新语块
            </Button>
          }
        />
      </Card>
    );
  }

  const card = cards[index];
  if (!card) {
    return (
      <Card className="flex flex-col items-center gap-4 py-8 text-center" role="status">
        <p className="text-4xl" aria-hidden="true">
          ✅
        </p>
        <div>
          <p className="text-lg font-semibold text-slate-900 dark:text-white">复习完成</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">这次复习了 {reviewed} 条。</p>
        </div>
        <Button variant="primary" size="lg" full disabled={saving} onClick={() => void finish()}>
          继续：新语块
        </Button>
      </Card>
    );
  }

  const advance = () => {
    setError(null);
    setIndex((i) => i + 1);
  };

  const onDone = (grade: Grade, mode: DrillMode, info?: { ms: number; parts?: ItemParts }) => {
    setReviewed((n) => n + 1);
    void saveReview(card.id, grade, mode, info?.ms ?? 0, ladder ? info?.parts : undefined, ladder)
      .catch(() => setError('这条的复习结果没有保存成功，但不影响继续。'))
      .finally(advance);
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge tone="indigo" data-testid="review-progress">
            复习 {index + 1} / {cards.length}
          </Badge>
          {edgeKeys.has(card.id) && (
            <Badge tone="amber" data-testid="edge-badge">
              边缘语块
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" disabled={saving} onClick={() => void finish()}>
          今天就复习到这
        </Button>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {error}
        </p>
      )}
      <ReviewItem key={card.id} card={card} onDone={onDone} onSkip={advance} speakLimitMs={ladder ? speakLimitMs(ladder.speak) : undefined} />
    </div>
  );
}
