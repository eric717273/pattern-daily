import { useEffect, useRef, useState } from 'react';
import { compareAnswer } from '../../lib/frameEngine';
import { speak, stopSpeaking } from '../../lib/speech';
import type { SoundPattern } from '../../types';
import { AnswerDiff } from '../drills/AnswerDiff';
import { Badge, Button, Card } from '../ui';
import { MaskedLine, PlayButton, ResultBanner, TypedAnswer } from './shared';
import { clock } from './util';

export interface SoundDrillItem {
  target: string;
  input: string;
  correct: boolean;
}

export interface SoundDrillResult {
  correct: number;
  total: number;
  items: SoundDrillItem[];
  ms: number;
}

export interface SoundDrillProps {
  pattern: SoundPattern;
  rate: number;
  onDone: (result: SoundDrillResult) => void;
}

const KIND_ZH: Record<SoundPattern['kind'], string> = {
  reduction: '缩读',
  linking: '连读',
  elision: '吞音',
  flap: '闪音',
  assimilation: '同化',
  'weak-form': '弱读',
};

/**
 * 语流音变听写: the pattern is explained, then each of its examples is played at `rate` with the sentence shown
 * but the target words masked; the learner types the masked words. Afterwards the written form and the "heard"
 * spelling are revealed. Pure presentation: the caller logs the measurement.
 */
export function SoundDrill({ pattern, rate, onDone }: SoundDrillProps) {
  const [idx, setIdx] = useState(0);
  const [plays, setPlays] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [items, setItems] = useState<SoundDrillItem[]>([]);
  const [shown, setShown] = useState<SoundDrillItem | null>(null);
  const [showHeard, setShowHeard] = useState(true);
  const startedAt = useRef(clock());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopSpeaking();
    };
  }, []);

  const ex = pattern.examples[idx];
  const total = pattern.examples.length;
  const attempted = items.length > 0 || shown !== null;

  const play = (r: number) => {
    setPlays((n) => n + 1);
    setPlaying(true);
    void speak(ex.en, { rate: r }).then(() => {
      if (mounted.current) setPlaying(false);
    });
  };

  const reveal = (input: string, correct: boolean) => {
    stopSpeaking();
    setPlaying(false);
    setShown({ target: ex.target, input: input.trim(), correct });
  };

  const next = () => {
    if (!shown) return;
    const all = [...items, shown];
    if (idx + 1 < total) {
      setItems(all);
      setShown(null);
      setIdx(idx + 1);
      setPlays(0);
      return;
    }
    onDone({
      correct: all.filter((i) => i.correct).length,
      total,
      items: all,
      ms: Math.max(0, clock() - startedAt.current),
    });
  };

  const diff = shown && !shown.correct && shown.input !== '' ? compareAnswer(shown.input, shown.target) : null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2" aria-label="音变说明">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-en text-xl font-bold text-slate-900 dark:text-white">{pattern.name}</h2>
          <Badge tone="violet">{KIND_ZH[pattern.kind]}</Badge>
        </div>
        <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">{pattern.explanationZh}</p>
      </Card>

      <Card className="flex flex-col gap-4" aria-label="音变听写" key={idx}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-lg font-semibold text-slate-900 dark:text-white">听一句，写出空白处的词</p>
          <p className="text-sm text-slate-500 tabular-nums dark:text-slate-400">
            {idx + 1} / {total}
          </p>
        </div>

        <p
          className="font-en rounded-2xl bg-slate-100 p-4 text-xl leading-snug font-medium text-slate-900 dark:bg-slate-800/70 dark:text-white"
          data-testid="sound-line"
        >
          {shown ? ex.en : <MaskedLine text={ex.en} hidden={ex.target} />}
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
          {attempted && (
            <Button variant="ghost" size="lg" aria-pressed={showHeard} onClick={() => setShowHeard((v) => !v)}>
              听感
            </Button>
          )}
        </div>

        {!shown ? (
          <TypedAnswer
            label="空白处的词"
            placeholder="输入听到的词"
            onSubmit={(v) => reveal(v, compareAnswer(v, ex.target).exact)}
            onGiveUp={() => reveal('', false)}
          />
        ) : (
          <div className="flex flex-col gap-3" data-testid="sound-feedback">
            <ResultBanner correct={shown.correct}>
              {shown.correct ? '✓ 听对了' : shown.input === '' ? '看答案' : '✗ 再对照一下'}
            </ResultBanner>
            {diff && <AnswerDiff tokens={diff.tokens} similarity={diff.similarity} />}
            <p className="text-sm text-slate-600 dark:text-slate-300">
              正确答案：<span className="font-en text-lg font-semibold text-slate-900 dark:text-white">{ex.target}</span>
            </p>
            {showHeard && (
              <p
                data-testid="heard-spelling"
                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[15px] text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100"
              >
                <span className="mr-2 text-xs font-semibold text-amber-700 dark:text-amber-300">听感</span>
                <span className="font-en font-medium">{ex.heard}</span>
              </p>
            )}
            <p className="text-sm text-slate-500 dark:text-slate-400">{ex.zh}</p>
            <Button variant="primary" size="lg" full onClick={next}>
              {idx + 1 < total ? '下一句' : '完成'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
