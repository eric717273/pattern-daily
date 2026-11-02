import { useEffect, useRef, useState } from 'react';
import { checkNumberAnswer, makeNumberItem, NUMBER_KINDS, type NumberItem, type NumberKind, type Rng } from '../../lib/numbers';
import { speak, stopSpeaking } from '../../lib/speech';
import { Button, Card } from '../ui';
import { PlayButton, ResultBanner, TypedAnswer } from './shared';
import { clock } from './util';

export interface NumbersDrillItem {
  kind: NumberKind;
  /** What the TTS read. */
  spoken: string;
  /** Canonical written answer. */
  answer: string;
  input: string;
  correct: boolean;
}

export interface NumbersDrillResult {
  correct: number;
  total: number;
  items: NumbersDrillItem[];
  ms: number;
}

export interface NumbersDrillProps {
  count: number;
  rate: number;
  /** Deterministic randomness for tests. */
  rng?: Rng;
  /** Restrict to some kinds (default: all six, cycling). */
  kinds?: readonly NumberKind[];
  onDone: (result: NumbersDrillResult) => void;
}

const KIND_ZH: Record<NumberKind, string> = {
  price: '价格',
  time: '时间',
  date: '日期',
  phone: '电话',
  quantity: '数量',
  year: '年份',
};

/**
 * 数字听写: prices, times, dates, phone numbers, quantities and years, generated on the fly. The TTS reads the
 * natural spoken form; the learner types digits (or words). Pure presentation: the caller logs the measurement.
 */
export function NumbersDrill({ count, rate, rng = Math.random, kinds = NUMBER_KINDS, onDone }: NumbersDrillProps) {
  const [set] = useState<NumberItem[]>(() => {
    const total = Math.max(1, count);
    const start = Math.floor(rng() * kinds.length);
    return Array.from({ length: total }, (_, i) => makeNumberItem(kinds[(start + i) % kinds.length], rng));
  });
  const [idx, setIdx] = useState(0);
  const [plays, setPlays] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState<NumbersDrillItem[]>([]);
  const [shown, setShown] = useState<NumbersDrillItem | null>(null);
  const startedAt = useRef(clock());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopSpeaking();
    };
  }, []);

  const item = set[idx];

  const play = (r: number) => {
    setPlays((n) => n + 1);
    setPlaying(true);
    void speak(item.spoken, { rate: r }).then(() => {
      if (mounted.current) setPlaying(false);
    });
  };

  const reveal = (input: string, correct: boolean) => {
    stopSpeaking();
    setPlaying(false);
    setShown({ kind: item.kind, spoken: item.spoken, answer: item.answer, input: input.trim(), correct });
  };

  const next = () => {
    if (!shown) return;
    const all = [...done, shown];
    if (idx + 1 < set.length) {
      setDone(all);
      setShown(null);
      setIdx(idx + 1);
      setPlays(0);
      return;
    }
    onDone({ correct: all.filter((i) => i.correct).length, total: all.length, items: all, ms: Math.max(0, clock() - startedAt.current) });
  };

  return (
    <Card className="flex flex-col gap-4" aria-label="数字听写" key={idx}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-lg font-semibold text-slate-900 dark:text-white">听数字，写下来</p>
        <p className="text-sm text-slate-500 tabular-nums dark:text-slate-400">
          {idx + 1} / {set.length}
        </p>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        <span className="mr-2 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/50 dark:text-violet-200">
          {KIND_ZH[item.kind]}
        </span>
        {item.promptZh}
      </p>

      <div className="flex flex-wrap items-center gap-2.5">
        <PlayButton
          onClick={() => play(rate)}
          playing={playing}
          variant={plays === 0 ? 'primary' : 'secondary'}
          label={plays === 0 ? '播放' : '再听一遍'}
        />
        <Button variant="secondary" size="lg" onClick={() => play(0.8)} aria-label="慢速播放">
          慢速 0.8×
        </Button>
      </div>

      {!shown ? (
        <TypedAnswer
          label="听到的数字"
          placeholder="例如 $14.99 / 7:45 / 555-0123"
          onSubmit={(v) => reveal(v, checkNumberAnswer(v, item))}
          onGiveUp={() => reveal('', false)}
        />
      ) : (
        <div className="flex flex-col gap-3" data-testid="numbers-feedback">
          <ResultBanner correct={shown.correct}>
            {shown.correct ? '✓ 听对了' : shown.input === '' ? '看答案' : `✗ 你写的是 ${shown.input}`}
          </ResultBanner>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            正确写法：<span className="font-en text-xl font-semibold text-slate-900 dark:text-white">{item.answer}</span>
          </p>
          <p className="font-en text-[15px] text-slate-500 dark:text-slate-400">
            读法：{item.spoken}
          </p>
          <Button variant="primary" size="lg" full onClick={next}>
            {idx + 1 < set.length ? '下一题' : '完成'}
          </Button>
        </div>
      )}
    </Card>
  );
}
