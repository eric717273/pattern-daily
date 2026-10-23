import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDozen } from '../../content';
import type { Deconstruction } from '../../lib/ai';
import { ROLE_STYLES } from '../../lib/labels';
import { saveUserFrame } from '../../lib/repo';
import { skeletonSlotRole, splitSkeleton } from '../../lib/skeleton';
import { AlignmentView } from '../AlignmentView';
import { FramePattern } from '../FramePattern';
import { FrameTable } from '../FrameTable';
import { GrammarTags } from '../GrammarTag';
import { ChevronRightIcon } from '../icons';
import { SpeakButton } from '../SpeakButton';
import { Badge, Button, Card, SectionTitle, cx } from '../ui';

/** A skeleton like "[Subject] [verb] [object]." with every [slot] shown as a coloured pill. */
export function SkeletonLine({ skeleton, className }: { skeleton: string; className?: string }) {
  const parts = useMemo(() => splitSkeleton(skeleton), [skeleton]);
  return (
    <p className={cx('font-en text-[19px] leading-10 text-slate-800 dark:text-slate-100', className)} aria-label={`骨架：${skeleton}`}>
      {parts.map((p, i) =>
        p.slot ? (
          <span
            key={i}
            data-testid="skeleton-pill"
            className={cx(
              'mx-0.5 inline-block rounded-lg px-2.5 py-0.5 align-baseline font-sans text-[15px] leading-6 font-medium',
              ROLE_STYLES[skeletonSlotRole(p.text)].pill,
            )}
          >
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  );
}

/** Full result of "解构": translation, skeleton, alignment, grammar, nearest dozen sentence, explanation, frame. */
export function DeconstructionView({ result }: { result: Deconstruction }) {
  const nearest = getDozen(result.nearestDozenId);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const frame = result.frame;

  const save = async () => {
    if (!frame) return;
    setSaveState('saving');
    try {
      await saveUserFrame(frame);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  };

  return (
    <div className="flex flex-col gap-5" data-testid="deconstruction">
      <Card>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-en text-2xl leading-snug font-bold text-slate-900 dark:text-white">{result.en}</p>
            <p className="mt-1.5 text-base text-slate-600 dark:text-slate-300" data-testid="decon-zh">
              {result.zh}
            </p>
          </div>
          <SpeakButton text={result.en} />
        </div>
      </Card>

      <section>
        <SectionTitle>骨架</SectionTitle>
        <Card>
          <SkeletonLine skeleton={result.skeleton} />
          {result.grammar.length > 0 && <GrammarTags points={result.grammar} className="mt-3 flex flex-wrap gap-1.5" />}
        </Card>
      </section>

      <section>
        <SectionTitle>中英逐字对照</SectionTitle>
        <Card>
          <AlignmentView tokens={result.alignment} legend />
        </Card>
      </section>

      <section>
        <SectionTitle>讲解</SectionTitle>
        <Card>
          <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">{result.explanationZh}</p>
        </Card>
      </section>

      {nearest && (
        <section>
          <SectionTitle>最接近的解构句</SectionTitle>
          <Link to={`/dozen/${nearest.id}`} className="block rounded-2xl">
            <Card interactive padded={false} className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200">
                {nearest.order}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-en truncate text-base font-medium text-slate-900 dark:text-slate-100">{nearest.en}</p>
                <p className="truncate text-sm text-slate-500 dark:text-slate-400">{nearest.zh}</p>
              </div>
              <ChevronRightIcon size={18} className="shrink-0 text-slate-300 dark:text-slate-600" />
            </Card>
          </Link>
        </section>
      )}

      {frame && (
        <section>
          <SectionTitle aside={<Badge tone="violet">AI 生成的母框</Badge>}>{frame.title}</SectionTitle>
          <Card className="mb-3">
            <FramePattern frame={frame} />
            <FramePattern frame={frame} lang="zh" className="mt-1" />
            {frame.tipZh && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{frame.tipZh}</p>}
          </Card>
          <FrameTable frame={frame} picks={picks} onChange={setPicks} />
          <div className="mt-4">
            {saveState === 'saved' ? (
              <p className="flex items-center gap-3 text-sm font-medium text-emerald-700 dark:text-emerald-400" role="status">
                已保存到「母框」
                <Link to={`/frames/${frame.id}`} className="text-indigo-600 underline dark:text-indigo-300">
                  去看看
                </Link>
              </p>
            ) : (
              <Button variant="primary" size="lg" full disabled={saveState === 'saving'} onClick={() => void save()}>
                保存为我的母框
              </Button>
            )}
            {saveState === 'error' && (
              <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                保存失败，请重试。
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
