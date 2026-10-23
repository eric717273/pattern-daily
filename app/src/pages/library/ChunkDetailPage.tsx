import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CHUNKS, getChunk } from '../../content';
import type { Chunk, Grade } from '../../types';
import { CardStatus } from '../../components/CardStatus';
import { NewItemFlow } from '../../components/chunk/NewItemFlow';
import { SoundTip } from '../../components/chunk/SoundTip';
import { highlightText } from '../../components/drills/highlight';
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon } from '../../components/icons';
import { SpeakButton } from '../../components/SpeakButton';
import { Badge, Button, ButtonLink, Card, EmptyState, PageHeader, PageLoading, SectionTitle, Sheet, type Tone } from '../../components/ui';
import { chunkCore, exampleTurn, findChunkRange } from '../../lib/chunkDrill';
import { useCard } from '../../lib/hooks';
import { FREQ_LABELS, FUNCTION_CATEGORY_LABELS } from '../../lib/labels';
import { gradeCard, introduceItems } from '../../lib/repo';
import { SLOW_RATE } from '../../lib/chunkDrill';
import { isDue } from '../../lib/srs';

const REGISTER_LABELS: Record<Chunk['register'], string> = { casual: '口语 · 随意', neutral: '通用', formal: '正式' };
const REGISTER_TONE: Record<Chunk['register'], Tone> = { casual: 'amber', neutral: 'slate', formal: 'violet' };
const FREQ_TONE: Record<1 | 2 | 3, Tone> = { 1: 'indigo', 2: 'sky', 3: 'slate' };

function Example({ chunk, index, example }: { chunk: Chunk; index: number; example: Chunk['examples'][number] }) {
  const [showZh, setShowZh] = useState(false);
  const turn = useMemo(() => exampleTurn(example, chunk.en), [example, chunk.en]);
  const range = findChunkRange(example.en, chunk.en);
  const hit = range ? example.en.slice(range.start, range.end) : undefined;
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <p className="font-en min-w-0 flex-1 text-[17px] leading-snug text-slate-900 dark:text-slate-100" data-testid={`example-en-${index}`}>
          {highlightText(example.en, hit)}
        </p>
        <SpeakButton text={example.en.replace(/\b[AB]:\s*/g, '')} label={`例句 ${index + 1}`} />
      </div>
      {showZh && (
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400" data-testid={`example-zh-${index}`}>
          {example.zh}
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0">
        <button
          type="button"
          aria-pressed={showZh}
          onClick={() => setShowZh((v) => !v)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <EyeIcon size={16} />
          {showZh ? '隐藏中文' : '看中文'}
        </button>
        <Link
          to={`/decode/analyze?s=${encodeURIComponent(turn.en)}`}
          className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"
        >
          看结构
        </Link>
      </div>
    </li>
  );
}

export function ChunkDetailPage() {
  const { id = '' } = useParams();
  const chunk = getChunk(id);
  const { loading, card } = useCard('chunk', id);
  const [practising, setPractising] = useState(false);
  const [finished, setFinished] = useState<{ grade: Grade; saved: boolean; counted: boolean } | null>(null);
  const [flowKey, setFlowKey] = useState(0);

  const siblings = useMemo(() => (chunk ? CHUNKS.filter((c) => c.category === chunk.category) : []), [chunk]);

  if (!chunk) {
    return (
      <>
        <PageHeader title="语块" backTo="/library" backLabel="语块库" />
        <EmptyState
          title="找不到这个语块"
          description="它可能不存在。"
          action={<ButtonLink to="/library">返回语块库</ButtonLink>}
        />
      </>
    );
  }
  if (loading) return <PageLoading />;

  const pos = siblings.findIndex((c) => c.id === chunk.id);
  const prev = pos > 0 ? siblings[pos - 1] : undefined;
  const next = pos >= 0 && pos < siblings.length - 1 ? siblings[pos + 1] : undefined;
  const speakText = chunkCore(chunk.en);

  /** First time: create the card and grade it. Practising an item that is not due yet does not touch its schedule. */
  const onFlowDone = async (grade: Grade, info: { ms: number }) => {
    let saved = false;
    let counted = false;
    try {
      if (!card) {
        await introduceItems([{ kind: 'chunk', id: chunk.id }]);
        await gradeCard(`chunk:${chunk.id}`, grade, 'recall', info.ms);
        counted = true;
      } else if (isDue(card, Date.now())) {
        await gradeCard(card.id, grade, 'recall', info.ms);
        counted = true;
      }
      saved = true;
    } catch {
      saved = false;
    }
    setFinished({ grade, saved, counted });
  };

  const closeSheet = () => {
    setPractising(false);
    setFinished(null);
  };

  return (
    <>
      <PageHeader
        backTo="/library"
        backLabel="语块库"
        title={<span className="sr-only">{chunk.en}</span>}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone="indigo">{FUNCTION_CATEGORY_LABELS[chunk.category]}</Badge>
            <Badge tone={FREQ_TONE[chunk.freq]}>{FREQ_LABELS[chunk.freq]}</Badge>
            <Badge tone={REGISTER_TONE[chunk.register]}>{REGISTER_LABELS[chunk.register]}</Badge>
          </span>
        }
      />

      <Card className="mb-4">
        <p className="font-en text-3xl leading-tight font-bold tracking-tight text-slate-900 dark:text-white" data-testid="chunk-en">
          {chunk.en}
        </p>
        <p className="mt-2 text-lg text-slate-600 dark:text-slate-300">{chunk.zh}</p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <SpeakButton text={speakText} label="朗读" />
          <SpeakButton text={speakText} label="慢速" rate={SLOW_RATE} />
        </div>
      </Card>

      {chunk.soundZh && <SoundTip text={chunk.soundZh} className="mb-4" />}

      {chunk.noteZh && (
        <p className="mb-5 px-1 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300" data-testid="chunk-note">
          <span className="mr-1.5 font-semibold text-indigo-600 dark:text-indigo-400">用法</span>
          {chunk.noteZh}
        </p>
      )}

      <section className="mb-5" aria-label="例句">
        <SectionTitle>例句</SectionTitle>
        <Card as="ul" padded={false} className="divide-y divide-slate-100 dark:divide-slate-800">
          {chunk.examples.map((ex, i) => (
            <Example key={i} chunk={chunk} index={i} example={ex} />
          ))}
        </Card>
      </section>

      <section className="mb-5" aria-label="学习状态">
        <SectionTitle>学习状态</SectionTitle>
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <CardStatus card={card} />
          <Button variant="primary" onClick={() => setPractising(true)}>
            {card ? '再练一遍' : '开始练这条'}
          </Button>
        </Card>
      </section>

      <nav aria-label="同类语块" className="mb-4 grid grid-cols-2 gap-3">
        {prev ? (
          <Link to={`/library/chunk/${prev.id}`} className="block rounded-2xl" aria-label={`上一条：${prev.en}`}>
            <Card interactive padded={false} className="flex h-full items-center gap-1.5 px-3 py-3">
              <ChevronLeftIcon size={18} className="shrink-0 text-slate-400" />
              <span className="min-w-0">
                <span className="block text-xs text-slate-400 dark:text-slate-500">上一条</span>
                <span className="font-en block truncate text-[15px] font-medium text-slate-800 dark:text-slate-100">{prev.en}</span>
              </span>
            </Card>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={`/library/chunk/${next.id}`} className="block rounded-2xl" aria-label={`下一条：${next.en}`}>
            <Card interactive padded={false} className="flex h-full items-center justify-end gap-1.5 px-3 py-3 text-right">
              <span className="min-w-0">
                <span className="block text-xs text-slate-400 dark:text-slate-500">下一条</span>
                <span className="font-en block truncate text-[15px] font-medium text-slate-800 dark:text-slate-100">{next.en}</span>
              </span>
              <ChevronRightIcon size={18} className="shrink-0 text-slate-400" />
            </Card>
          </Link>
        ) : (
          <span />
        )}
      </nav>
      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        {FUNCTION_CATEGORY_LABELS[chunk.category]} · 第 {pos + 1} / {siblings.length} 条
      </p>

      <Sheet
        open={practising}
        onClose={closeSheet}
        title="练这一条"
        footer={
          finished ? (
            <div className="flex gap-3">
              <Button
                variant="secondary"
                full
                onClick={() => {
                  setFinished(null);
                  setFlowKey((k) => k + 1);
                }}
              >
                再练一遍
              </Button>
              <Button variant="primary" full onClick={closeSheet}>
                完成
              </Button>
            </div>
          ) : undefined
        }
      >
        {finished ? (
          <div className="flex flex-col gap-2 py-2" data-testid="practice-done">
            <p className="text-lg font-semibold text-slate-900 dark:text-white">练完了</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {finished.counted
                ? finished.saved
                  ? '已加入复习，之后会按间隔提醒你。'
                  : '练习结果没有保存成功。'
                : '这条还没到复习时间，这一遍只是额外练习，不影响复习安排。'}
            </p>
          </div>
        ) : (
          <NewItemFlow key={flowKey} ref={{ kind: 'chunk', id: chunk.id }} onDone={(g, info) => void onFlowDone(g, info)} />
        )}
      </Sheet>
    </>
  );
}
