import { useState } from 'react';
import type { SubstitutionFrame } from '../../types';
import { useActiveTimer } from '../../lib/activeTimer';
import { SCENE_LABELS } from '../../lib/labels';
import { ensureCards, gradeCard } from '../../lib/repo';
import { AnchorDrill } from '../drills/AnchorDrill';
import { SingleSwapDrill } from '../drills/SingleSwapDrill';
import { TranslateDrill } from '../drills/TranslateDrill';
import { Badge, Button, Card, cx } from '../ui';

type Sub = 'anchor' | 'single' | 'translate';

const SUBS: { key: Sub; label: string }[] = [
  { key: 'anchor', label: '锚定' },
  { key: 'single', label: '单槽快替' },
  { key: 'translate', label: '中译英' },
];

export interface FramesStepProps {
  frames: SubstitutionFrame[];
  onComplete: (activeMs: number) => void | Promise<void>;
}

/** Step 3: for every frame of the day, the three Palmer sub-steps (anchor -> single swap -> translate). */
export function FramesStep({ frames, onComplete }: FramesStepProps) {
  const timer = useActiveTimer();
  const [fi, setFi] = useState(0);
  const [sub, setSub] = useState<Sub>('anchor');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const frame = frames[fi] as SubstitutionFrame | undefined;

  if (!frame) {
    return (
      <Card className="flex flex-col gap-3">
        <p className="text-base text-slate-700 dark:text-slate-300">今天没有安排母框，直接进入下一步。</p>
        <Button variant="primary" size="lg" full onClick={() => void onComplete(timer.read())}>
          继续
        </Button>
      </Card>
    );
  }

  const subIndex = SUBS.findIndex((s) => s.key === sub);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="indigo">
            母框 {fi + 1} / {frames.length}
          </Badge>
          <Badge tone="slate">{SCENE_LABELS[frame.scene]}</Badge>
        </div>
        <h3 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{frame.title}</h3>
        <ol className="mt-3 flex gap-2" aria-label="帕默三步">
          {SUBS.map((s, i) => (
            <li
              key={s.key}
              aria-current={s.key === sub ? 'step' : undefined}
              className={cx(
                'flex-1 rounded-lg px-2 py-1.5 text-center text-xs font-medium',
                i < subIndex
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : i === subIndex
                    ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                    : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
              )}
            >
              {i + 1}. {s.label}
            </li>
          ))}
        </ol>
      </div>

      {error && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {sub === 'anchor' && (
        <AnchorDrill key={`${frame.id}-a`} frame={frame} onDone={() => setSub('single')} />
      )}
      {sub === 'single' && (
        <SingleSwapDrill
          key={`${frame.id}-s`}
          frame={frame}
          doneLabel="下一步：中译英"
          onDone={() => setSub('translate')}
        />
      )}
      {sub === 'translate' && (
        <TranslateDrill
          key={`${frame.id}-t`}
          frame={frame}
          onDone={(r) => {
            if (busy) return;
            setBusy(true);
            setError(null);
            void (async () => {
              try {
                await ensureCards('frame', [frame.id]);
                await gradeCard(`frame:${frame.id}`, r.average, 'multi-swap', r.ms);
              } catch {
                setError('保存这个母框的成绩失败，但不影响继续。');
              }
              setBusy(false);
              if (fi + 1 >= frames.length) {
                await onComplete(timer.read());
              } else {
                setFi(fi + 1);
                setSub('anchor');
              }
            })();
          }}
        />
      )}
    </div>
  );
}
