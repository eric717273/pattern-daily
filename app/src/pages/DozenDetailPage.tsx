import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlignmentView } from '../components/AlignmentView';
import { CardStatus } from '../components/CardStatus';
import { TransformDrill } from '../components/decode/TransformDrill';
import { GrammarTags } from '../components/GrammarTag';
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon, EyeOffIcon } from '../components/icons';
import { SpeakButton } from '../components/SpeakButton';
import { TrapList } from '../components/TrapList';
import { Badge, Button, ButtonLink, Card, EmptyState, PageHeader, SectionTitle } from '../components/ui';
import { DOZEN, getDozen } from '../content';
import { gradeFromRatio, type DecodeResult } from '../lib/decode';
import { GRADE_LABELS } from '../lib/drill';
import { useCard } from '../lib/hooks';
import { VARIANT_LEVEL_LABELS, VARIANT_LEVELS } from '../lib/labels';
import { ensureCards, gradeCard } from '../lib/repo';
import type { DozenSentence } from '../types';

/** 变形练习 of one sentence: runs all its transforms and grades the sentence's card. */
function TransformSection({ sentence }: { sentence: DozenSentence }) {
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<DecodeResult | null>(null);
  const [saveError, setSaveError] = useState(false);
  const tasks = sentence.transforms;
  if (tasks.length === 0) return null;

  const finish = async (r: DecodeResult) => {
    setResult(r);
    setPhase('done');
    setSaveError(false);
    try {
      await ensureCards('dozen', [sentence.id]);
      await gradeCard(`dozen:${sentence.id}`, gradeFromRatio(r.correct, r.total), 'transform', r.ms);
    } catch {
      setSaveError(true);
    }
  };

  return (
    <section className="mb-5" aria-label="变形练习">
      <SectionTitle>变形练习</SectionTitle>
      {phase === 'idle' && (
        <Card>
          <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
            把这一句改成疑问、否定、过去式、换代词……亲手改一遍，才算真的看懂了骨架。共 {tasks.length} 题。
          </p>
          <Button variant="primary" size="lg" full className="mt-3" onClick={() => setPhase('running')}>
            开始变形练习
          </Button>
        </Card>
      )}
      {phase === 'running' && (
        <TransformDrill key={round} tasks={tasks} onDone={(r) => void finish(r)} />
      )}
      {phase === 'done' && result && (
        <Card>
          <p className="text-base font-semibold text-slate-900 dark:text-white" data-testid="transform-summary">
            答对 {result.correct} / {result.total} 题 · {GRADE_LABELS[gradeFromRatio(result.correct, result.total)]}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">成绩已记入这一句的复习。</p>
          {saveError && (
            <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400">
              保存成绩失败，但不影响继续练习。
            </p>
          )}
          <Button
            className="mt-3"
            full
            onClick={() => {
              setRound((n) => n + 1);
              setPhase('running');
            }}
          >
            再做一遍
          </Button>
        </Card>
      )}
    </section>
  );
}

export function DozenDetailPage() {
  const { id = '' } = useParams();
  const sentence = getDozen(id);
  const { loading, card } = useCard('dozen', id);
  const [showZh, setShowZh] = useState(false);
  const [showVariants, setShowVariants] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!sentence) {
    return (
      <>
        <PageHeader title="骨架句" backTo="/decode" backLabel="解码" />
        <EmptyState title="没有这一句" description="请从解码页选择 1–13 句。" />
      </>
    );
  }

  const idx = DOZEN.findIndex((d) => d.id === sentence.id);
  const prev = idx > 0 ? DOZEN[idx - 1] : undefined;
  const next = idx < DOZEN.length - 1 ? DOZEN[idx + 1] : undefined;

  const addToReview = async () => {
    setSaving(true);
    try {
      await ensureCards('dozen', [sentence.id]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        backTo="/decode"
        backLabel="解码"
        title={sentence.order === 13 ? '第 13 句 · 彩蛋' : `第 ${sentence.order} 句`}
        subtitle={<GrammarTags points={sentence.grammar} className="mt-1 flex flex-wrap gap-1.5" />}
      />

      <Card className="mb-5">
        <p className="font-en text-3xl leading-tight font-bold tracking-tight text-slate-900 md:text-4xl dark:text-white">
          {sentence.en}
        </p>
        <p className="mt-2 text-base text-slate-500 dark:text-slate-400">{sentence.zh}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <SpeakButton text={sentence.en} label="朗读" />
          <SpeakButton text={sentence.en} label="慢速" rate={0.6} />
          <div className="ml-auto">
            {loading ? null : card ? (
              <div className="flex items-center gap-2">
                <CardStatus card={card} className="hidden sm:inline-flex" />
                <Button variant="secondary" disabled>
                  已在复习中
                </Button>
              </div>
            ) : (
              <Button variant="primary" disabled={saving} onClick={() => void addToReview()}>
                加入复习
              </Button>
            )}
          </div>
        </div>
      </Card>

      <section className="mb-5">
        <SectionTitle>中英逐字对照</SectionTitle>
        <Card>
          <AlignmentView tokens={sentence.alignment} legend />
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">带小圆点的词可以点按查看说明。</p>
        </Card>
      </section>

      <section className="mb-5">
        <SectionTitle>这一句暴露了什么</SectionTitle>
        <Card>
          <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">{sentence.focusZh}</p>
        </Card>
      </section>

      {sentence.trapsZh.length > 0 && (
        <section className="mb-5">
          <SectionTitle>文法陷阱</SectionTitle>
          <Card>
            <TrapList traps={sentence.trapsZh} />
          </Card>
        </section>
      )}

      <TransformSection key={sentence.id} sentence={sentence} />

      <section className="mb-6">
        <SectionTitle
          aside={
            showVariants ? (
              <button
                type="button"
                aria-pressed={showZh}
                onClick={() => setShowZh((v) => !v)}
                className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                {showZh ? <EyeIcon size={18} /> : <EyeOffIcon size={18} />}
                {showZh ? '隐藏中文' : '显示中文'}
              </button>
            ) : undefined
          }
        >
          同骨架的更多例子
        </SectionTitle>
        <button
          type="button"
          aria-expanded={showVariants}
          onClick={() => setShowVariants((v) => !v)}
          className="flex min-h-12 w-full items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-left text-[15px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/60"
        >
          <span>{showVariants ? '收起例子' : `展开 ${sentence.variants.length} 个例子（骨架不变，只换词）`}</span>
          <ChevronRightIcon size={18} className={showVariants ? 'rotate-90 text-slate-400' : 'text-slate-400'} />
        </button>
        {showVariants && (
          <div className="mt-3 flex flex-col gap-3">
            {VARIANT_LEVELS.map((level) => {
              const items = sentence.variants.filter((v) => v.level === level);
              if (items.length === 0) return null;
              return (
                <Card key={level} padded={false}>
                  <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
                    <Badge tone={level === 'work' ? 'rose' : level === 'daily' ? 'emerald' : 'sky'}>
                      {VARIANT_LEVEL_LABELS[level]}
                    </Badge>
                  </div>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {items.map((v, i) => (
                      <li key={i} className="flex items-center gap-3 px-4 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-en text-[17px] leading-snug text-slate-900 dark:text-slate-100">{v.en}</p>
                          {showZh && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{v.zh}</p>}
                        </div>
                        <SpeakButton text={v.en} />
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <nav aria-label="上一句下一句" className="grid grid-cols-2 gap-3">
        {prev ? (
          <ButtonLink to={`/decode/dozen/${prev.id}`} className="justify-start! py-2! text-left" aria-label={`上一句：${prev.en}`}>
            <ChevronLeftIcon size={18} className="shrink-0" />
            <span className="min-w-0">
              <span className="block text-xs text-slate-400">上一句</span>
              <span className="font-en block truncate text-sm">{prev.en}</span>
            </span>
          </ButtonLink>
        ) : (
          <span />
        )}
        {next ? (
          <ButtonLink to={`/decode/dozen/${next.id}`} className="justify-end! py-2! text-right" aria-label={`下一句：${next.en}`}>
            <span className="min-w-0">
              <span className="block text-xs text-slate-400">下一句</span>
              <span className="font-en block truncate text-sm">{next.en}</span>
            </span>
            <ChevronRightIcon size={18} className="shrink-0" />
          </ButtonLink>
        ) : (
          <span />
        )}
      </nav>
    </>
  );
}
