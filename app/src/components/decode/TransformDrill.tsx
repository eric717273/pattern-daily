import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { TransformTask } from '../../types';
import { checkTransform, type DecodeResult, type TransformCheck } from '../../lib/decode';
import { compareAnswer } from '../../lib/frameEngine';
import { TRANSFORM_OP_LABELS } from '../../lib/labels';
import { AnswerDiff } from '../drills/AnswerDiff';
import { SpeakButton } from '../SpeakButton';
import { Badge, Button, Card, cx, inputClass } from '../ui';

export interface TransformDrillProps {
  /** The tasks to run, in order (e.g. `pickTransformTasks(dozen, 3)`). Changing them restarts the drill. */
  tasks: TransformTask[];
  /** Called once, after the learner leaves the last task. `correct` counts normalized exact matches only. */
  onDone: (result: DecodeResult) => void;
}

/**
 * 变形练习 (decode track): for each task show the instruction and the source sentence; the learner TYPES the
 * transformed sentence. The answer stays hidden until it is submitted (Enter or 检查), then the feedback, the
 * reference answer and the note on what changed in the skeleton (the learning moment) appear.
 */
export function TransformDrill({ tasks, onDone }: TransformDrillProps) {
  const [startedAt] = useState(() => Date.now());
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [check, setCheck] = useState<TransformCheck | null>(null);
  const [correct, setCorrect] = useState(0);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const task = tasks[index];
  const isLast = index >= tasks.length - 1;
  const label = useMemo(() => (task ? TRANSFORM_OP_LABELS[task.op] : ''), [task]);

  useEffect(() => {
    if (check) feedbackRef.current?.querySelector<HTMLButtonElement>('button[data-next]')?.focus();
    else inputRef.current?.focus();
  }, [check, index]);

  if (!task) return null;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (check || typed.trim() === '') return;
    const result = checkTransform(task, typed);
    setCheck(result);
    if (result.outcome === 'correct') setCorrect((c) => c + 1);
  };

  const giveUp = () => {
    if (check) return;
    setCheck({ outcome: 'skipped', target: task.to, comparison: compareAnswer(typed, task.to) });
  };

  const next = () => {
    if (!check) return;
    if (isLast) {
      onDone({ correct, total: tasks.length, ms: Math.min(600_000, Date.now() - startedAt) });
      return;
    }
    setIndex((i) => i + 1);
    setTyped('');
    setCheck(null);
  };

  const alts = (task.alt ?? []).filter((a) => a !== check?.target || check.outcome !== 'correct');

  return (
    <Card className="flex flex-col gap-4" aria-label="变形练习">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500" data-testid="transform-progress">
          变形练习 · 第 {index + 1} / {tasks.length} 题
        </p>
        <Badge tone="indigo">{label}</Badge>
      </div>

      <div>
        <p className="text-xl leading-snug font-bold text-slate-900 dark:text-white" data-testid="transform-instruction">
          {task.instructionZh}
        </p>
        <div className="mt-3 flex items-start gap-2 rounded-2xl bg-slate-100 py-2.5 pr-1.5 pl-4 dark:bg-slate-800/70">
          <p className="font-en min-w-0 flex-1 self-center text-xl leading-snug font-semibold text-slate-900 dark:text-white" data-testid="transform-from">
            {task.from}
          </p>
          <SpeakButton text={task.from} />
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="transform-input" className="text-sm font-medium text-slate-700 dark:text-slate-300">
          你的答案（大小写、标点不影响判定）
        </label>
        <input
          id="transform-input"
          ref={inputRef}
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          readOnly={check !== null}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          lang="en"
          enterKeyHint="done"
          placeholder="输入变形后的英文句子"
          className={cx(
            inputClass,
            'font-en min-h-12 text-lg',
            check?.outcome === 'correct' && 'border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/30',
            check && check.outcome !== 'correct' && 'border-rose-300 dark:border-rose-700',
          )}
        />
        {!check && (
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Button type="submit" variant="primary" size="lg" disabled={typed.trim() === ''}>
              检查
            </Button>
            <Button type="button" size="lg" onClick={giveUp}>
              不会，看答案
            </Button>
          </div>
        )}
      </form>

      {check && (
        <div ref={feedbackRef} className="flex flex-col gap-3" role="status" aria-live="polite" data-testid="transform-feedback">
          {check.outcome === 'correct' && (
            <p className="text-base font-semibold text-emerald-700 dark:text-emerald-400">答对了！</p>
          )}
          {check.outcome === 'near' && (
            <>
              <p className="text-base font-semibold text-amber-700 dark:text-amber-400">差一点</p>
              <AnswerDiff tokens={check.comparison.tokens} similarity={check.comparison.similarity} />
            </>
          )}
          {check.outcome === 'wrong' && (
            <>
              <p className="text-base font-semibold text-rose-600 dark:text-rose-400">不对，对照一下：</p>
              <AnswerDiff tokens={check.comparison.tokens} similarity={check.comparison.similarity} />
            </>
          )}
          {check.outcome === 'skipped' && (
            <p className="text-base font-semibold text-slate-600 dark:text-slate-300">没关系，看看答案：</p>
          )}

          <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/30">
            <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">参考答案</p>
            <div className="mt-1 flex items-start gap-2">
              <p className="font-en min-w-0 flex-1 text-xl leading-snug font-semibold text-slate-900 dark:text-white" data-testid="transform-answer">
                {task.to}
              </p>
              <SpeakButton text={task.to} />
            </div>
            {alts.length > 0 && (
              <p className="font-en mt-2 text-sm text-slate-600 dark:text-slate-300">
                也可以说：{alts.join(' / ')}
              </p>
            )}
          </div>

          {task.noteZh && (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/30">
              <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">骨架变了什么</p>
              <p className="mt-1 text-[15px] leading-relaxed text-slate-800 dark:text-slate-200" data-testid="transform-note">
                {task.noteZh}
              </p>
            </div>
          )}

          <Button data-next variant="primary" size="lg" full onClick={next}>
            {isLast ? '完成' : '下一题'}
          </Button>
        </div>
      )}
    </Card>
  );
}
