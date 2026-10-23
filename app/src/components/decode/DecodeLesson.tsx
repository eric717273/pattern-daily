import { useEffect, useMemo, useRef, useState } from 'react';
import type { DozenSentence, Grade } from '../../types';
import { lessonGrade, pickTransformTasks, type DecodeResult } from '../../lib/decode';
import { pickDailyVariant } from '../../lib/drill';
import { todayStr } from '../../lib/plan';
import { AlignmentView } from '../AlignmentView';
import { OrderDrill, type OrderDrillResult } from '../drills/OrderDrill';
import { GrammarTags } from '../GrammarTag';
import { SpeakButton } from '../SpeakButton';
import { TrapList } from '../TrapList';
import { Badge, Button, Card, SectionTitle, cx } from '../ui';
import { TransformDrill } from './TransformDrill';

export type LessonStep = 'read' | 'order' | 'transform';

const STEPS: { key: LessonStep; label: string }[] = [
  { key: 'read', label: '看骨架' },
  { key: 'order', label: '排语序' },
  { key: 'transform', label: '变形' },
];

/** 看骨架 · 排语序 · 变形 */
export function LessonSteps({ current }: { current: LessonStep }) {
  const at = STEPS.findIndex((s) => s.key === current);
  return (
    <ol aria-label="学习步骤" className="flex items-center gap-1.5 text-sm">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5" aria-current={i === at ? 'step' : undefined}>
          {i > 0 && <span aria-hidden="true" className="h-px w-4 bg-slate-300 dark:bg-slate-700" />}
          <span
            className={cx(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium',
              i === at
                ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                : i < at
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
            )}
          >
            <span aria-hidden="true" className="text-xs">
              {i < at ? '✓' : i + 1}
            </span>
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** What a finished lesson reports besides the grade. */
export interface LessonInfo {
  /** Active time in the lesson, ms (order drill + transforms; reading time is not counted). */
  ms: number;
  orderGrade: 0 | 1 | 2;
  transform: DecodeResult;
}

export interface DecodeLessonProps {
  /** The skeleton sentence to learn. */
  dozen: DozenSentence;
  /**
   * Called once at the end. `grade` = average of the order-drill grade (2 right first time, 1 after a retry,
   * 0 revealed) and the transform grade (all right 3, >= 60% 2, >= 30% 1, else 0). The caller writes to the repo
   * (ensureCards('dozen', [id]) + gradeCard(`dozen:${id}`, grade, 'transform', info.ms)).
   */
  onDone: (grade: Grade, info: LessonInfo) => void;
  /** Date key that picks the order-drill variant; default today. */
  dayKey?: string;
}

/**
 * Foundation lesson for one skeleton (decode track): (a) read the sentence with its word-by-word alignment,
 * focus and traps; (b) rebuild the word order of a variant; (c) transform the sentence three ways.
 */
export function DecodeLesson({ dozen, onDone, dayKey }: DecodeLessonProps) {
  const [step, setStep] = useState<LessonStep>('read');
  const [orderResult, setOrderResult] = useState<OrderDrillResult | null>(null);
  const key = dayKey ?? todayStr();
  const variant = useMemo(() => pickDailyVariant(dozen, key), [dozen, key]);
  const tasks = useMemo(() => pickTransformTasks(dozen, 3), [dozen]);
  const top = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    top.current?.scrollIntoView?.({ block: 'start' });
  }, [step]);

  return (
    <div ref={top} className="flex scroll-mt-4 flex-col gap-4">
      <LessonSteps current={step} />

      {step === 'read' && (
        <>
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

          <section>
            <SectionTitle>中英逐字对照</SectionTitle>
            <Card>
              <AlignmentView tokens={dozen.alignment} legend />
              <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">带小圆点的词可以点按查看说明。</p>
            </Card>
          </section>

          <section>
            <SectionTitle>这一句暴露了什么</SectionTitle>
            <Card>
              <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">{dozen.focusZh}</p>
            </Card>
          </section>

          {dozen.trapsZh.length > 0 && (
            <section>
              <SectionTitle>文法陷阱</SectionTitle>
              <Card>
                <TrapList traps={dozen.trapsZh} />
              </Card>
            </section>
          )}

          <Button variant="primary" size="lg" full onClick={() => setStep('order')}>
            看懂了，去排语序
          </Button>
        </>
      )}

      {step === 'order' && (
        <OrderDrill
          key={variant.en}
          en={variant.en}
          zh={variant.zh}
          onFinish={(r) => {
            setOrderResult(r);
            setStep('transform');
          }}
        />
      )}

      {step === 'transform' && (
        <TransformDrill
          tasks={tasks}
          onDone={(t) => {
            const orderGrade = orderResult?.grade ?? 1;
            onDone(lessonGrade(orderGrade, t), {
              ms: (orderResult?.ms ?? 0) + t.ms,
              orderGrade,
              transform: t,
            });
          }}
        />
      )}
    </div>
  );
}
