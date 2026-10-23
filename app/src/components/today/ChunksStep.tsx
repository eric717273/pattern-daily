import { useEffect, useMemo, useRef, useState } from 'react';
import { getItem } from '../../content';
import type { DrillMode, Grade, ItemRef } from '../../types';
import { useActiveTimer } from '../../lib/activeTimer';
import { db } from '../../lib/db';
import { useAllFrames } from '../../lib/hooks';
import { itemKey } from '../../lib/plan';
import { saveNewItem } from '../../lib/today';
import { NewItemFlow } from '../chunk';
import { Badge, Button, Card, EmptyState, PageLoading } from '../ui';

export interface ChunksStepProps {
  /** Today's frozen new items (plan.newItems), in order. */
  items: ItemRef[];
  /** The step is already done: go through all items again, as practice. */
  redo?: boolean;
  onComplete: (activeMs: number) => void | Promise<void>;
}

/**
 * Step 2 新语块: today's new items one after another (NewItemFlow). Items that already have a card (an earlier,
 * interrupted attempt) are skipped, so the step resumes where it stopped. 剩下的明天再学 ends the step early; the
 * un-introduced items come back in tomorrow's plan.
 */
export function ChunksStep({ items, redo = false, onComplete }: ChunksStepProps) {
  const timer = useActiveTimer();
  const frames = useAllFrames();
  const [queue, setQueue] = useState<ItemRef[] | null>(null);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finishing = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const keys = new Set((await db.cards.filter((c) => !c.deleted).toArray()).map((c) => c.id));
      if (!cancelled) setQueue(redo ? items : items.filter((r) => !keys.has(itemKey(r))));
    })().catch(() => {
      if (!cancelled) setQueue(items);
    });
    return () => {
      cancelled = true;
    };
    // The queue is fixed when the step opens (today's plan is frozen).
  }, [items, redo]);

  const current = queue?.[index];
  const item = useMemo(() => (current ? getItem(current, frames ?? []) : undefined), [current, frames]);

  const finish = async () => {
    if (finishing.current) return;
    finishing.current = true;
    setSaving(true);
    try {
      await onComplete(timer.read());
    } finally {
      finishing.current = false;
      setSaving(false);
    }
  };

  if (!queue) return <PageLoading />;

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          title="语块库已经学完了"
          description="400 条新语块全部学过，今天只需要复习、解码和输出。"
          action={
            <Button variant="primary" size="lg" disabled={saving} onClick={() => void finish()}>
              继续：解码
            </Button>
          }
        />
      </Card>
    );
  }

  if (!current) {
    return (
      <Card className="flex flex-col items-center gap-4 py-8 text-center" role="status">
        <p className="text-4xl" aria-hidden="true">
          ✅
        </p>
        <div>
          <p className="text-lg font-semibold text-slate-900 dark:text-white">今天的新语块学完了</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">共 {items.length} 条，明天开始会按间隔出现在复习里。</p>
        </div>
        <Button variant="primary" size="lg" full disabled={saving} onClick={() => void finish()}>
          继续：解码
        </Button>
      </Card>
    );
  }

  const done = items.length - queue.length + index;
  const title = item ? (item.kind === 'chunk' ? item.chunk.en : item.frame.title) : '';

  const onDone = (grade: Grade, info: { ms: number; mode: DrillMode }) => {
    void saveNewItem(current, grade, info.mode, info.ms)
      .catch(() => setError('这一条没有保存成功，明天它还会再出现。'))
      .finally(() => setIndex((i) => i + 1));
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge tone="violet" className="shrink-0" data-testid="chunks-progress">
            新语块 {done + 1} / {items.length}
          </Badge>
          <span className="font-en min-w-0 truncate text-sm font-medium text-slate-600 dark:text-slate-300" data-testid="chunks-title">
            {title}
          </span>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0" disabled={saving} onClick={() => void finish()}>
          剩下的明天再学
        </Button>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {error}
        </p>
      )}
      <NewItemFlow key={itemKey(current)} ref={current} onDone={onDone} />
    </div>
  );
}
