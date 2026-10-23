import { useMemo, useState } from 'react';
import type { DozenSentence } from '../../types';
import { useActiveTimer } from '../../lib/activeTimer';
import { pickDailyVariant } from '../../lib/drill';
import { ensureCards, gradeCard } from '../../lib/repo';
import { AlignmentView } from '../AlignmentView';
import { OrderDrill, type OrderDrillResult } from '../drills/OrderDrill';
import { GrammarTags } from '../GrammarTag';
import { ChevronRightIcon } from '../icons';
import { SpeakButton } from '../SpeakButton';
import { TrapList } from '../TrapList';
import { Badge, Button, Card, ButtonLink } from '../ui';

export interface DeconstructStepProps {
  dozen: DozenSentence;
  /** Date key, so the order-drill variant is stable for the whole day. */
  dayKey: string;
  onComplete: (activeMs: number) => void | Promise<void>;
}

/** Step 2: read the day's dozen sentence (alignment, focus, traps), then rebuild a variant from word tiles. */
export function DeconstructStep({ dozen, dayKey, onComplete }: DeconstructStepProps) {
  const timer = useActiveTimer();
  const [phase, setPhase] = useState<'read' | 'drill'>('read');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const variant = useMemo(() => pickDailyVariant(dozen, dayKey), [dozen, dayKey]);

  const finish = async (r: OrderDrillResult) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await ensureCards('dozen', [dozen.id]);
      await gradeCard(`dozen:${dozen.id}`, r.grade, 'order', r.ms);
    } catch {
      setError('保存成绩失败，但不影响继续。');
    }
    try {
      await onComplete(timer.read());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="indigo">{dozen.order === 13 ? '彩蛋句' : `第 ${dozen.order} 句`}</Badge>
          <GrammarTags points={dozen.grammar} className="contents" />
        </div>
        <p className="font-en mt-3 text-3xl leading-tight font-bold tracking-tight text-slate-900 dark:text-white" data-testid="dozen-en">
          {dozen.en}
        </p>
        <p className="mt-2 text-base text-slate-500 dark:text-slate-400">{dozen.zh}</p>
        <div className="mt-4 flex items-center gap-2">
          <SpeakButton text={dozen.en} label="朗读" />
          <SpeakButton text={dozen.en} label="慢速" rate={0.6} />
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">中英逐字对照</h3>
        <AlignmentView tokens={dozen.alignment} legend />
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">带小圆点的词可以点按查看说明。</p>
      </Card>

      <Card>
        <h3 className="mb-2 text-base font-semibold text-slate-900 dark:text-slate-100">这一句暴露了什么</h3>
        <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">{dozen.focusZh}</p>
      </Card>

      {dozen.trapsZh.length > 0 && (
        <Card padded={false}>
          <details className="group">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-base font-semibold text-slate-900 dark:text-slate-100 [&::-webkit-details-marker]:hidden">
              文法陷阱（{dozen.trapsZh.length}）
              <ChevronRightIcon size={18} className="text-slate-400 transition-transform group-open:rotate-90" />
            </summary>
            <div className="border-t border-slate-100 px-4 py-4 dark:border-slate-800">
              <TrapList traps={dozen.trapsZh} />
            </div>
          </details>
        </Card>
      )}

      {phase === 'read' ? (
        <Button variant="primary" size="lg" full onClick={() => setPhase('drill')}>
          看懂了，练语序重建
        </Button>
      ) : (
        <>
          <OrderDrill key={variant.en} en={variant.en} zh={variant.zh} onFinish={(r) => void finish(r)} />
          {error && (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
        </>
      )}
      <ButtonLink to={`/dozen/${dozen.id}`} variant="ghost" size="sm" className="self-center">
        在「12句」里查看完整讲解
      </ButtonLink>
    </div>
  );
}
