import { useEffect, useRef, useState } from 'react';
import type { LibraryItem } from '../../content';
import { CHUNKS } from '../../content';
import type { Chunk } from '../../types';
import { buildListenQuestion, NATURAL_RATE, SLOW_RATE, type Rng } from '../../lib/chunkDrill';
import { speak, stopSpeaking } from '../../lib/speech';
import { highlightText } from '../drills/highlight';
import { CheckIcon, CloseIcon, SpeakerIcon } from '../icons';
import { Button, Card, cx } from '../ui';
import { SoundTip } from './SoundTip';

const clock = (): number => Date.now();

export interface ListenResult {
  /** The picked option was the played chunk. */
  correct: boolean;
  /** How many times the sentence was played again after the first play (0 = understood at first hearing). */
  replays: number;
  /** Milliseconds from the first play until the learner picked an option. */
  ms: number;
}

export interface ListenDrillProps {
  /** The item to recognise. Give the component a `key` per item: the question is built once on mount. */
  item: LibraryItem;
  /** Fired when the learner taps 继续 after the answer was revealed. */
  onDone: (result: ListenResult) => void;
  /** Deterministic randomness for tests. */
  rng?: Rng;
  /** Chunks that distractors are drawn from (default: all 250). */
  pool?: readonly Chunk[];
  continueLabel?: string;
}

/**
 * 听辨: a sentence containing the item is played at NATURAL speed (rate 1.0, whatever the TTS setting is),
 * its text is not shown. The learner picks which chunk they heard out of four. Chunk items use one of their
 * examples with 3 distractor chunks (similar length, same category first); frame items use a random
 * sentence of the frame with 3 other sentences that differ in one slot. After a pick the full sentence is
 * revealed with the chunk highlighted, plus the Chinese and the 听力提示; a wrong pick offers a slow replay.
 */
export function ListenDrill({ item, onDone, rng, pool = CHUNKS, continueLabel = '继续' }: ListenDrillProps) {
  const [question] = useState(() => buildListenQuestion(item, pool, rng));
  const [plays, setPlays] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pick1, setPick1] = useState<{ id: string; replays: number; ms: number } | null>(null);
  const picked = pick1?.id ?? null;
  const firstPlay = useRef<number | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopSpeaking();
    };
  }, []);

  const play = (rate: number) => {
    if (firstPlay.current === null) firstPlay.current = clock();
    setPlays((n) => n + 1);
    setPlaying(true);
    void speak(question.sentence, { rate }).then(() => {
      if (mounted.current) setPlaying(false);
    });
  };

  const pick = (id: string) => {
    if (picked !== null || plays === 0) return;
    const now = clock();
    const started = firstPlay.current ?? now;
    stopSpeaking();
    setPlaying(false);
    setPick1({ id, replays: Math.max(0, plays - 1), ms: Math.min(120_000, now - started) });
  };

  const revealed = picked !== null;
  const correct = picked === question.answerId;

  return (
    <Card className="flex flex-col gap-4" aria-label="听辨">
      <div>
        <p className="text-lg font-semibold text-slate-900 dark:text-white">你听到了哪个语块？</p>
        {!revealed && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {plays === 0 ? '先点播放，按正常语速听一句话。' : '句子不会显示，听完再选。'}
          </p>
        )}
      </div>

      {!revealed && (
        <Button
          variant={plays === 0 ? 'primary' : 'secondary'}
          size="lg"
          full
          onClick={() => play(NATURAL_RATE)}
          aria-label={plays === 0 ? '播放' : '再听一次'}
        >
          <SpeakerIcon size={22} className={cx(playing && 'animate-pulse')} />
          {plays === 0 ? '播放' : '再听一次'}
          {plays > 1 && <span className="text-xs font-normal opacity-70">（已重听 {plays - 1} 次）</span>}
        </Button>
      )}

      <div role="group" aria-label="选项" className="flex flex-col gap-2.5">
        {question.options.map((o) => {
          const isAnswer = o.id === question.answerId;
          const isPicked = o.id === picked;
          return (
            <button
              key={o.id}
              type="button"
              disabled={plays === 0 || revealed}
              onClick={() => pick(o.id)}
              data-state={revealed ? (isAnswer ? 'answer' : isPicked ? 'wrong' : 'other') : 'idle'}
              className={cx(
                'font-en flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-left text-[17px] leading-snug transition active:scale-[0.99]',
                !revealed &&
                  'border-slate-300 bg-white text-slate-900 hover:border-indigo-400 hover:bg-indigo-50/60 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-indigo-950/30',
                revealed && isAnswer && 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100',
                revealed && isPicked && !isAnswer && 'border-rose-400 bg-rose-50 text-rose-900 dark:border-rose-500 dark:bg-rose-950/40 dark:text-rose-100',
                revealed && !isAnswer && !isPicked && 'border-slate-200 bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500',
              )}
            >
              <span className="min-w-0 flex-1">{o.text}</span>
              {revealed && isAnswer && <CheckIcon size={20} className="shrink-0 text-emerald-600 dark:text-emerald-400" />}
              {revealed && isPicked && !isAnswer && <CloseIcon size={20} className="shrink-0 text-rose-600 dark:text-rose-400" />}
            </button>
          );
        })}
      </div>

      {revealed && (
        <div className="flex flex-col gap-3" data-testid="listen-revealed">
          <p
            role="status"
            data-testid="listen-result"
            className={cx(
              'rounded-xl px-3 py-2 text-base font-semibold',
              correct
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
            )}
          >
            {correct ? ((pick1?.replays ?? 0) > 0 ? `✓ 听对了（重听 ${pick1?.replays} 次）` : '✓ 一遍就听对了') : '✗ 听错了，再对照一下'}
          </p>
          <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/70">
            <p className="font-en text-xl leading-snug font-semibold text-slate-900 dark:text-white" data-testid="listen-sentence">
              {highlightText(question.sentence, question.highlight)}
            </p>
            <p className="mt-1.5 text-[15px] text-slate-600 dark:text-slate-300" data-testid="listen-zh">
              {question.sentenceZh}
            </p>
          </div>
          {question.soundZh && <SoundTip text={question.soundZh} />}
          <div className="flex flex-wrap gap-2.5">
            <Button variant="secondary" onClick={() => play(NATURAL_RATE)} aria-label="再听一遍">
              <SpeakerIcon size={18} />
              再听一遍
            </Button>
            <Button variant={correct ? 'secondary' : 'primary'} onClick={() => play(SLOW_RATE)} aria-label="慢速重听">
              <SpeakerIcon size={18} />
              慢速
            </Button>
          </div>
          <Button
            variant="primary"
            size="lg"
            full
            onClick={() => onDone({ correct, replays: pick1?.replays ?? 0, ms: pick1?.ms ?? 0 })}
          >
            {continueLabel}
          </Button>
        </div>
      )}
    </Card>
  );
}
