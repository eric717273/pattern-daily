import { useMemo, useState } from 'react';
import { compareAnswer } from '../../lib/frameEngine';
import { makeTiles, sentenceFromTiles, type Rng } from '../../lib/drill';
import { SpeakButton } from '../SpeakButton';
import { Button, Card, cx } from '../ui';
import { AnswerDiff } from './AnswerDiff';

export interface OrderDrillResult {
  /** 2 = right first time, 1 = right after a retry, 0 = gave up and looked at the answer. */
  grade: 0 | 1 | 2;
  attempts: number;
  ms: number;
}

export interface OrderDrillProps {
  /** The sentence to rebuild. */
  en: string;
  zh: string;
  /** Deterministic shuffle for tests. */
  rng?: Rng;
  onFinish: (result: OrderDrillResult) => void;
}

/** 语序重建: tap the shuffled word tiles to rebuild the English sentence. */
export function OrderDrill({ en, zh, rng, onFinish }: OrderDrillProps) {
  const [startedAt] = useState(() => Date.now());
  const tiles = useMemo(() => makeTiles(en, rng), [en, rng]);
  const [placed, setPlaced] = useState<number[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [result, setResult] = useState<'idle' | 'right' | 'wrong' | 'revealed'>('idle');

  const built = sentenceFromTiles(tiles, placed);
  const comparison = useMemo(() => compareAnswer(built, en), [built, en]);
  const locked = result === 'right' || result === 'revealed';
  const remaining = tiles.filter((t) => !placed.includes(t.id));

  const place = (id: number) => {
    if (locked) return;
    setResult('idle');
    setPlaced((p) => [...p, id]);
  };
  const remove = (id: number) => {
    if (locked) return;
    setResult('idle');
    setPlaced((p) => p.filter((x) => x !== id));
  };

  const check = () => {
    if (placed.length === 0) return;
    setAttempts((a) => a + 1);
    setResult(comparison.exact ? 'right' : 'wrong');
  };

  const retry = () => {
    setPlaced([]);
    setResult('idle');
  };

  const finish = (grade: 0 | 1 | 2) => {
    onFinish({ grade, attempts: Math.max(1, attempts), ms: Math.min(180_000, Date.now() - startedAt) });
  };

  const gradeIfRight = attempts <= 1 ? 2 : 1;

  return (
    <Card className="flex flex-col gap-4" aria-label="语序重建">
      <div>
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500">语序重建：点词块，拼出这句英语</p>
        <p className="mt-1 text-xl leading-snug font-bold text-slate-900 dark:text-white" data-testid="order-zh">
          {zh}
        </p>
      </div>

      <div
        aria-label="你拼的句子"
        aria-live="polite"
        className={cx(
          'flex min-h-[4.25rem] flex-wrap content-start gap-2 rounded-2xl border-2 border-dashed p-2.5 transition-colors',
          result === 'right'
            ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/30'
            : result === 'wrong'
              ? 'border-rose-300 bg-rose-50/60 dark:border-rose-700 dark:bg-rose-950/20'
              : 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60',
        )}
      >
        {placed.length === 0 && (
          <span className="self-center px-1 text-sm text-slate-400 dark:text-slate-500">点下面的词块放到这里</span>
        )}
        {placed.map((id) => {
          const t = tiles.find((x) => x.id === id);
          if (!t) return null;
          return (
            <button
              key={id}
              type="button"
              data-tile="placed"
              disabled={locked}
              onClick={() => remove(id)}
              aria-label={`移除 ${t.text}`}
              className="font-en min-h-11 rounded-xl border border-indigo-300 bg-indigo-100 px-3.5 text-base font-medium text-indigo-900 transition active:scale-95 disabled:opacity-100 dark:border-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-50"
            >
              {t.text}
            </button>
          );
        })}
      </div>

      <div aria-label="可用词块" className="flex min-h-11 flex-wrap gap-2">
        {remaining.map((t) => (
          <button
            key={t.id}
            type="button"
            data-tile="pool"
            disabled={locked}
            onClick={() => place(t.id)}
            className="font-en min-h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-base font-medium text-slate-900 shadow-sm transition active:scale-95 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
          >
            {t.text}
          </button>
        ))}
      </div>

      {result === 'idle' && (
        <Button variant="primary" size="lg" full disabled={placed.length === 0} onClick={check}>
          检查
        </Button>
      )}

      {result !== 'idle' && (
        <div className="flex flex-col gap-3" role="status" aria-live="polite">
          {result === 'right' && (
            <p className="text-base font-semibold text-emerald-700 dark:text-emerald-400">
              {attempts <= 1 ? '一次拼对了！' : '拼对了！'}
            </p>
          )}
          {result === 'wrong' && (
            <>
              <p className="text-base font-semibold text-rose-600 dark:text-rose-400">还差一点，看看哪里不对：</p>
              <AnswerDiff tokens={comparison.tokens} similarity={comparison.similarity} />
            </>
          )}
          {(result === 'right' || result === 'revealed') && (
            <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/70">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-en text-xl leading-snug font-semibold text-slate-900 dark:text-white" data-testid="order-answer">
                    {en}
                  </p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{zh}</p>
                </div>
                <SpeakButton text={en} />
              </div>
            </div>
          )}
          {result === 'wrong' && (
            <div className="grid grid-cols-2 gap-3">
              <Button variant="primary" onClick={retry}>
                重试
              </Button>
              <Button onClick={() => setResult('revealed')}>看答案</Button>
            </div>
          )}
          {result === 'right' && (
            <Button variant="primary" size="lg" full onClick={() => finish(gradeIfRight)}>
              继续
            </Button>
          )}
          {result === 'revealed' && (
            <Button variant="primary" size="lg" full onClick={() => finish(0)}>
              记下了，继续
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
