import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DecodeMaintenance } from '../../components/decode/DecodeMaintenance';
import { Button, ButtonLink, Card, PageHeader, Segmented } from '../../components/ui';
import { DOZEN, getDozen } from '../../content';
import { pickPracticeDozenId, type DecodeResult } from '../../lib/decode';
import { GRADE_LABELS } from '../../lib/drill';
import { useCardMap } from '../../lib/hooks';
import { ensureCards, gradeCard } from '../../lib/repo';
import type { CardState, Grade } from '../../types';

type Mode = 'transform' | 'label';

const MODE_LABELS: Record<Mode, string> = { transform: '变形练习', label: '成分标注' };

function newSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

interface Finished {
  grade: Grade;
  result: DecodeResult;
}

/**
 * Standalone decode practice: `?mode=transform|label&id=dNN`. Without `id`, a random learned skeleton is used
 * (d01 if none is learned). Every finished round grades the skeleton's card.
 */
export function DecodePracticePage() {
  const cards = useCardMap();
  // wait for the cards so a random skeleton is picked once, from the real learned set
  if (!cards) {
    return (
      <>
        <PageHeader title="解码练习" backTo="/decode" backLabel="解码" />
        <Card className="h-40 animate-pulse" aria-busy="true" aria-label="加载中" />
      </>
    );
  }
  return <PracticeBody cards={cards} />;
}

function PracticeBody({ cards }: { cards: ReadonlyMap<string, CardState> }) {
  const [params, setParams] = useSearchParams();
  const mode: Mode = params.get('mode') === 'label' ? 'label' : 'transform';
  const idParam = params.get('id') ?? '';
  const fixed = getDozen(idParam)?.id;

  const [picked, setPicked] = useState(() => pickPracticeDozenId(cards, DOZEN.map((d) => d.id)));
  const [round, setRound] = useState(0);
  const [seed, setSeed] = useState(newSeed);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [saveError, setSaveError] = useState(false);

  const dozen = getDozen(fixed ?? picked);

  const restart = () => {
    setRound((r) => r + 1);
    setSeed(newSeed());
    setFinished(null);
    setSaveError(false);
    if (!fixed) setPicked(pickPracticeDozenId(cards, DOZEN.map((d) => d.id)));
  };

  const setMode = (m: Mode) => {
    if (m === mode) return;
    const next = new URLSearchParams(params);
    next.set('mode', m);
    setParams(next, { replace: true });
    restart();
  };

  const onDone = async (grade: Grade, result: DecodeResult) => {
    if (!dozen) return;
    setFinished({ grade, result });
    try {
      await ensureCards('dozen', [dozen.id]);
      await gradeCard(`dozen:${dozen.id}`, grade, mode, result.ms);
    } catch {
      setSaveError(true);
    }
  };

  return (
    <>
      <PageHeader
        title="解码练习"
        backTo="/decode"
        backLabel="解码"
        subtitle={mode === 'transform' ? '亲手改一遍句子，确认你真的看懂了骨架。' : '给句子里的词标上成分，再判断时态。'}
      />

      <Segmented<Mode>
        ariaLabel="练习类型"
        full
        className="mb-4"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'transform', label: MODE_LABELS.transform },
          { value: 'label', label: MODE_LABELS.label },
        ]}
      />

      {!dozen ? (
        <Card className="h-40 animate-pulse" aria-busy="true" aria-label="加载中" />
      ) : (
        <div className="flex flex-col gap-4">
          <Link to={`/decode/dozen/${dozen.id}`} className="block rounded-2xl" aria-label={`本组骨架：第 ${dozen.order} 句 ${dozen.en}`}>
            <Card interactive padded={false} className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200">
                {dozen.order}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-400 dark:text-slate-500">本组骨架</p>
                <p className="font-en truncate text-base font-medium text-slate-900 dark:text-slate-100">{dozen.en}</p>
              </div>
            </Card>
          </Link>

          {finished ? (
            <Card data-testid="practice-summary">
              <p className="text-lg font-bold text-slate-900 dark:text-white">
                答对 {finished.result.correct} / {finished.result.total}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                自动评级：{GRADE_LABELS[finished.grade]}，已记入这一句的复习。
              </p>
              {saveError && (
                <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                  保存成绩失败，但不影响继续练习。
                </p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Button variant="primary" size="lg" onClick={restart}>
                  再来一组
                </Button>
                <ButtonLink to="/decode" size="lg">
                  回解码
                </ButtonLink>
              </div>
            </Card>
          ) : (
            <DecodeMaintenance
              key={`${round}|${dozen.id}|${mode}`}
              dozenId={dozen.id}
              mode={mode}
              dayKey={`practice-${seed}`}
              onDone={(g, r) => void onDone(g, r)}
            />
          )}
        </div>
      )}
    </>
  );
}
