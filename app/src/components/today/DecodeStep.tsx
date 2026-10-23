import { useRef, useState } from 'react';
import type { DayPlan, Grade } from '../../types';
import { getDozen } from '../../content';
import { useActiveTimer } from '../../lib/activeTimer';
import { ensureCards, gradeCard } from '../../lib/repo';
import { DecodeLesson, DecodeMaintenance } from '../decode';
import { EmptyState } from '../ui';

export interface DecodeStepProps {
  decode: DayPlan['decode'];
  /** Date key that rotates the exercises. */
  dayKey: string;
  onComplete: (activeMs: number) => void | Promise<void>;
}

/**
 * Step 3 解码 (~3 minutes), the decode track: the day's skeleton lesson in the foundation phase (days 1-13), a
 * transform or label exercise afterwards. The grade goes to the skeleton's own card; this track never mixes
 * with the chunk drills.
 */
export function DecodeStep({ decode, dayKey, onComplete }: DecodeStepProps) {
  const timer = useActiveTimer();
  const dozen = getDozen(decode.dozenId);
  const [error, setError] = useState<string | null>(null);
  const finishing = useRef(false);

  if (!dozen) return <EmptyState title="找不到今天的骨架句" description="可以先去「解码」页看看 13 个骨架句。" />;

  const done = async (grade: Grade, ms: number, mode: 'transform' | 'label') => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      await ensureCards('dozen', [dozen.id]);
      await gradeCard(`dozen:${dozen.id}`, grade, mode, ms);
    } catch {
      setError('这一课的成绩没有保存成功，但不影响继续。');
    }
    try {
      await onComplete(timer.read());
    } finally {
      finishing.current = false;
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      <p className="rounded-xl bg-sky-50 px-4 py-2.5 text-sm text-sky-900 dark:bg-sky-950/40 dark:text-sky-200" data-testid="decode-note">
        解码：看懂结构（和语块练习分开，不求脱口而出）
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {error}
        </p>
      )}
      {decode.phase === 'foundation' ? (
        <DecodeLesson key={`${dozen.id}|${dayKey}`} dozen={dozen} dayKey={dayKey} onDone={(g, info) => void done(g, info.ms, 'transform')} />
      ) : (
        <DecodeMaintenance
          key={`${dozen.id}|${decode.mode}|${dayKey}`}
          dozenId={dozen.id}
          mode={decode.mode}
          dayKey={dayKey}
          onDone={(g, info) => void done(g, info.ms, decode.mode)}
        />
      )}
    </div>
  );
}
