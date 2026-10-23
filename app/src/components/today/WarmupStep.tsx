import { useEffect, useState } from 'react';
import type { Grade } from '../../types';
import { useActiveTimer } from '../../lib/activeTimer';
import { buildFlashPrompt, GRADE_LABELS, type FlashPrompt } from '../../lib/drill';
import { getAllFrames, getDueCards } from '../../lib/repo';
import { Flashcard } from '../drills/Flashcard';
import { Button, Card, PageLoading } from '../ui';

const WARMUP_LIMIT = 10;

export interface WarmupStepProps {
  onComplete: (activeMs: number) => void | Promise<void>;
}

/** Step 1: spaced-repetition warm-up with up to 10 due cards. */
export function WarmupStep({ onComplete }: WarmupStepProps) {
  const timer = useActiveTimer();
  const [queue, setQueue] = useState<FlashPrompt[] | null>(null);
  const [index, setIndex] = useState(0);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [cards, frames] = await Promise.all([getDueCards(Date.now(), WARMUP_LIMIT), getAllFrames()]);
      if (cancelled) return;
      const prompts = cards.flatMap((c) => {
        const p = buildFlashPrompt(c, frames);
        return p ? [p] : [];
      });
      setQueue(prompts);
    })().catch(() => {
      if (!cancelled) setQueue([]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onComplete(timer.read());
    } finally {
      setBusy(false);
    }
  };

  if (queue === null) return <PageLoading />;

  if (queue.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-4 py-8 text-center">
        <p className="text-4xl" aria-hidden="true">
          🎉
        </p>
        <div>
          <p className="text-lg font-semibold text-slate-900 dark:text-white">今天没有到期的复习 🎉</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            学过的解构句和母框会按间隔重复自动回来，今天直接进入新内容。
          </p>
        </div>
        <Button variant="primary" size="lg" full disabled={busy} onClick={() => void finish()}>
          继续：解构
        </Button>
      </Card>
    );
  }

  if (index >= queue.length) {
    const counts = ([0, 1, 2, 3] as Grade[]).map((g) => ({ g, n: grades.filter((x) => x === g).length })).filter((x) => x.n > 0);
    return (
      <Card className="flex flex-col items-center gap-4 py-8 text-center">
        <p className="text-4xl" aria-hidden="true">
          ✅
        </p>
        <div>
          <p className="text-lg font-semibold text-slate-900 dark:text-white">热身完成，复习了 {queue.length} 张卡片</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {counts.map((x) => `${GRADE_LABELS[x.g]} ${x.n}`).join(' · ')}
          </p>
        </div>
        <Button variant="primary" size="lg" full disabled={busy} onClick={() => void finish()}>
          继续：解构
        </Button>
      </Card>
    );
  }

  return (
    <Flashcard
      key={queue[index].cardId}
      prompt={queue[index]}
      index={index + 1}
      total={queue.length}
      onGraded={(g) => {
        setGrades((all) => [...all, g]);
        setIndex((i) => i + 1);
      }}
    />
  );
}
