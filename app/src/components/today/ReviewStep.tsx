import { useEffect, useRef, useState } from 'react';
import type { CardState, DrillMode, Grade } from '../../types';
import { useActiveTimer } from '../../lib/activeTimer';
import { getDueCards, gradeCard } from '../../lib/repo';
import { ReviewItem } from '../chunk';
import { Badge, Button, Card, EmptyState, PageLoading } from '../ui';

/** Most cards one review step asks for. */
export const REVIEW_LIMIT = 15;

export interface ReviewStepProps {
  onComplete: (activeMs: number) => void | Promise<void>;
}

/**
 * Step 1 复习: the chunk/frame cards that are due, taken as a snapshot when the step opens and reviewed one by one
 * (ReviewItem). Each grade is saved right away, so a reload simply continues with what is still due.
 */
export function ReviewStep({ onComplete }: ReviewStepProps) {
  const timer = useActiveTimer();
  const [cards, setCards] = useState<CardState[] | null>(null);
  const [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getDueCards(Date.now(), REVIEW_LIMIT, ['chunk', 'frame'])
      .then((due) => {
        if (!cancelled) setCards(due);
      })
      .catch(() => {
        if (!cancelled) setCards([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const onDone = (grade: Grade, mode: DrillMode, info?: { ms: number }) => {
    setReviewed((n) => n + 1);
    void gradeCard(card.id, grade, mode, info?.ms ?? 0)
      .catch(() => setError('这条的复习结果没有保存成功，但不影响继续。'))
      .finally(advance);
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <Badge tone="indigo" data-testid="review-progress">
          复习 {index + 1} / {cards.length}
        </Badge>
        <Button variant="ghost" size="sm" disabled={saving} onClick={() => void finish()}>
          今天就复习到这
        </Button>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {error}
        </p>
      )}
      <ReviewItem key={card.id} card={card} onDone={onDone} onSkip={advance} />
    </div>
  );
}
