import { useMemo, useRef, useState } from 'react';
import { getDialogue, getSound } from '../../content';
import type { DayPlan, Ladder } from '../../types';
import { useActiveTimer } from '../../lib/activeTimer';
import { listenRate } from '../../lib/ladder';
import { logDialogue, logNumbers, logSound } from '../../lib/listening';
import { DialogueListen, NumbersDrill, SoundDrill } from '../listening';
import { Badge, Button, Card, EmptyState } from '../ui';

export interface ListeningStepProps {
  listening: NonNullable<DayPlan['listening']>;
  ladder: Ladder;
  onComplete: (activeMs: number) => void | Promise<void>;
}

type Task =
  | { kind: 'dialogue'; id: string }
  | { kind: 'sound'; id: string }
  | { kind: 'numbers'; count: number };

const TASK_LABEL: Record<Task['kind'], string> = { dialogue: '对话', sound: '音变', numbers: '数字' };

/** The plan's listening block as an ordered task list; ids whose content no longer exists are dropped. */
function listeningTasks(listening: NonNullable<DayPlan['listening']>): Task[] {
  const tasks: Task[] = [];
  for (const id of listening.dialogueIds) if (getDialogue(id)) tasks.push({ kind: 'dialogue', id });
  if (listening.soundId && getSound(listening.soundId)) tasks.push({ kind: 'sound', id: listening.soundId });
  if (listening.numbers > 0) tasks.push({ kind: 'numbers', count: listening.numbers });
  return tasks;
}

/**
 * Step 3 听力 (v3): the plan's dialogues (gist, then dictation of key chunks) at the ladder's speed, one sound-pattern
 * drill and a few number dictations. Every result is logged as a listening measurement. 今天先到这 ends the block early.
 */
export function ListeningStep({ listening, ladder, onComplete }: ListeningStepProps) {
  const timer = useActiveTimer();
  const tasks = useMemo(() => listeningTasks(listening), [listening]);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finishing = useRef(false);
  const rate = listenRate(ladder.listen);

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

  const advance = (save: Promise<void>) => {
    void save
      .catch(() => setError('这一项的成绩没有保存成功，但不影响继续。'))
      .finally(() => setIndex((i) => i + 1));
  };

  if (tasks.length === 0) {
    return (
      <Card>
        <EmptyState
          title="今天没有听力任务"
          description="可以去「听力」页自己选一段对话练习。"
          action={
            <Button variant="primary" size="lg" disabled={saving} onClick={() => void finish()}>
              继续：解码
            </Button>
          }
        />
      </Card>
    );
  }

  const task = tasks[index];
  if (!task) {
    return (
      <Card className="flex flex-col items-center gap-4 py-8 text-center" role="status">
        <p className="text-4xl" aria-hidden="true">
          ✅
        </p>
        <div>
          <p className="text-lg font-semibold text-slate-900 dark:text-white">听力完成</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">共 {tasks.length} 项，成绩会计入今天的反馈。</p>
        </div>
        <Button variant="primary" size="lg" full disabled={saving} onClick={() => void finish()}>
          继续：解码
        </Button>
      </Card>
    );
  }

  const key = `${task.kind}-${index}`;
  let body;
  if (task.kind === 'dialogue') {
    const dialogue = getDialogue(task.id);
    body = dialogue && (
      <DialogueListen key={key} dialogue={dialogue} rate={rate} onDone={(r) => advance(logDialogue(dialogue.id, r, ladder.listen))} />
    );
  } else if (task.kind === 'sound') {
    const pattern = getSound(task.id);
    body = pattern && (
      <SoundDrill key={key} pattern={pattern} rate={rate} onDone={(r) => advance(logSound(pattern.id, r, ladder.listen))} />
    );
  } else {
    body = <NumbersDrill key={key} count={task.count} rate={rate} onDone={(r) => advance(logNumbers(r, ladder.listen))} />;
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge tone="sky" data-testid="listening-progress">
            听力 {index + 1} / {tasks.length}
          </Badge>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {TASK_LABEL[task.kind]} · {rate.toFixed(2)}×
          </span>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0" disabled={saving} onClick={() => void finish()}>
          今天先到这
        </Button>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {error}
        </p>
      )}
      {body}
    </div>
  );
}
