import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlignmentView } from '../components/AlignmentView';
import { CardStatus } from '../components/CardStatus';
import { GrammarTags } from '../components/GrammarTag';
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon, EyeOffIcon } from '../components/icons';
import { SpeakButton } from '../components/SpeakButton';
import { Badge, Button, ButtonLink, Card, EmptyState, PageHeader, SectionTitle } from '../components/ui';
import { DOZEN, getDozen } from '../content';
import { useAllFrames, useCard } from '../lib/hooks';
import { FRAME_LEVEL_LABELS, VARIANT_LEVEL_LABELS, VARIANT_LEVELS } from '../lib/labels';
import { ensureCards } from '../lib/repo';

interface Trap {
  wrong?: string;
  right?: string;
  note?: string;
  raw: string;
}

/** Parse "✗ wrong → ✓ right（note）" into parts; falls back to the raw string. */
export function parseTrap(raw: string): Trap {
  const m = /^\s*✗\s*(.+?)\s*(?:→|->)\s*✓\s*(.+?)\s*(?:（(.+)）)?\s*$/.exec(raw);
  if (!m) return { raw };
  return { wrong: m[1], right: m[2], note: m[3], raw };
}

export function DozenDetailPage() {
  const { id = '' } = useParams();
  const sentence = getDozen(id);
  const frames = useAllFrames();
  const { loading, card } = useCard('dozen', id);
  const [showZh, setShowZh] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!sentence) {
    return (
      <>
        <PageHeader title="12 句解构" backTo="/dozen" backLabel="全部句子" />
        <EmptyState title="没有这一句" description="请从列表中选择 1–13 句。" />
      </>
    );
  }

  const idx = DOZEN.findIndex((d) => d.id === sentence.id);
  const prev = idx > 0 ? DOZEN[idx - 1] : undefined;
  const next = idx < DOZEN.length - 1 ? DOZEN[idx + 1] : undefined;
  const related = (frames ?? []).filter((f) => sentence.frameIds.includes(f.id));

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
        backTo="/dozen"
        backLabel="全部句子"
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
          <Card as="ul" className="flex flex-col gap-4">
            {sentence.trapsZh.map((raw, i) => {
              const t = parseTrap(raw);
              return (
                <li key={i} className="text-[15px] leading-relaxed">
                  {t.wrong && t.right ? (
                    <>
                      <p className="font-en flex items-baseline gap-2 text-rose-600 dark:text-rose-400">
                        <span aria-label="错误" className="shrink-0 font-sans font-bold">✗</span>
                        <span className="line-through decoration-rose-300 dark:decoration-rose-800">{t.wrong}</span>
                      </p>
                      <p className="font-en mt-0.5 flex items-baseline gap-2 font-medium text-emerald-700 dark:text-emerald-400">
                        <span aria-label="正确" className="shrink-0 font-sans font-bold">✓</span>
                        <span>{t.right}</span>
                      </p>
                      {t.note && <p className="mt-1 pl-6 text-sm text-slate-500 dark:text-slate-400">{t.note}</p>}
                    </>
                  ) : (
                    <p className="text-slate-700 dark:text-slate-300">{t.raw}</p>
                  )}
                </li>
              );
            })}
          </Card>
        </section>
      )}

      <section className="mb-5">
        <SectionTitle
          aside={
            <button
              type="button"
              aria-pressed={showZh}
              onClick={() => setShowZh((v) => !v)}
              className="-mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            >
              {showZh ? <EyeIcon size={18} /> : <EyeOffIcon size={18} />}
              {showZh ? '隐藏中文' : '显示中文'}
            </button>
          }
        >
          模组替换：同一骨架，换词
        </SectionTitle>
        <div className="flex flex-col gap-3">
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
      </section>

      {related.length > 0 && (
        <section className="mb-6">
          <SectionTitle>用母框练这个句型</SectionTitle>
          <ul className="flex flex-col gap-2">
            {related.map((f) => (
              <li key={f.id}>
                <Link to={`/frames/${f.id}`} className="block rounded-2xl">
                  <Card interactive padded={false} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium text-slate-900 dark:text-slate-100">{f.title}</p>
                      <p className="font-en mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
                        {f.examples[0]?.en}
                      </p>
                    </div>
                    <Badge tone="slate">{FRAME_LEVEL_LABELS[f.level]}</Badge>
                    <ChevronRightIcon size={18} className="shrink-0 text-slate-300 dark:text-slate-600" />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav aria-label="上一句下一句" className="grid grid-cols-2 gap-3">
        {prev ? (
          <ButtonLink to={`/dozen/${prev.id}`} className="justify-start! py-2! text-left" aria-label={`上一句：${prev.en}`}>
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
          <ButtonLink to={`/dozen/${next.id}`} className="justify-end! py-2! text-right" aria-label={`下一句：${next.en}`}>
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
