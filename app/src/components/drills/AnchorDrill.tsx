import { useMemo, useRef, useState } from 'react';
import type { SubstitutionFrame } from '../../types';
import { picksFromExample } from '../../lib/drill';
import { buildCombo, compareAnswer } from '../../lib/frameEngine';
import { speak } from '../../lib/speech';
import { FramePattern } from '../FramePattern';
import { FrameTable } from '../FrameTable';
import { CheckIcon, SpeakerIcon } from '../icons';
import { Button, Card, cx } from '../ui';
import { MicButton } from './MicButton';

export const ANCHOR_REPEATS = 3;

export interface AnchorDrillProps {
  frame: SubstitutionFrame;
  onDone: (ms: number) => void;
  /** Label of the finish button. */
  doneLabel?: string;
}

/** Palmer step 1 (锚定): see the table with a model sentence and read it aloud three times. */
export function AnchorDrill({ frame, onDone, doneLabel = '下一步：单槽快替' }: AnchorDrillProps) {
  const [startedAt] = useState(() => Date.now());
  const [picks, setPicks] = useState<Record<string, number>>(() => picksFromExample(frame, frame.examples[0]));
  const combo = useMemo(() => buildCombo(frame, picks), [frame, picks]);
  const [count, setCount] = useState(0);
  const [heard, setHeard] = useState<string | null>(null);
  const done = count >= ANCHOR_REPEATS;

  const lastTap = useRef(0);

  const tap = () => {
    // Speech must start synchronously inside the tap (iOS). The counter does not wait for playback to end
    // (some browsers never report it), but taps in quick succession count once.
    const now = Date.now();
    if (now - lastTap.current < 400) return;
    lastTap.current = now;
    void speak(combo.en);
    setCount((c) => Math.min(ANCHOR_REPEATS, c + 1));
  };

  const verify = (text: string) => {
    setHeard(text);
    if (compareAnswer(text, combo.en).similarity >= 0.8) setCount((c) => Math.min(ANCHOR_REPEATS, c + 1));
  };

  const similarity = heard !== null ? compareAnswer(heard, combo.en).similarity : null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <FramePattern frame={frame} />
        <FramePattern frame={frame} lang="zh" className="mt-1" />
        {frame.tipZh && <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{frame.tipZh}</p>}
      </Card>

      <FrameTable frame={frame} picks={picks} onChange={setPicks} showSentence={false} />

      <Card className="flex flex-col gap-3">
        <div>
          <p className="text-xs font-medium text-slate-400 dark:text-slate-500">先读熟这一句</p>
          <p className="font-en mt-1 text-2xl leading-snug font-bold text-slate-900 dark:text-white" data-testid="anchor-en">
            {combo.en}
          </p>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">{combo.zh}</p>
        </div>

        <div className="flex items-center gap-3" role="status" aria-live="polite">
          <div className="flex gap-1.5" aria-hidden="true">
            {Array.from({ length: ANCHOR_REPEATS }, (_, i) => (
              <span
                key={i}
                className={cx(
                  'flex size-7 items-center justify-center rounded-full text-white transition-colors',
                  i < count ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700',
                )}
              >
                {i < count && <CheckIcon size={16} />}
              </span>
            ))}
          </div>
          <span className="text-sm text-slate-600 dark:text-slate-300">
            跟读 {ANCHOR_REPEATS} 遍：{count} / {ANCHOR_REPEATS}
          </span>
        </div>

        <div className="flex flex-wrap items-start gap-3">
          <Button variant={done ? 'secondary' : 'primary'} size="lg" onClick={tap} aria-label={`听并跟读（已读 ${count} 遍）`}>
            <SpeakerIcon size={20} />
            听并跟读
          </Button>
          <MicButton onResult={verify} label="我来读" />
        </div>
        {heard !== null && similarity !== null && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            识别到：<span className="font-en font-medium">{heard}</span>（相似度 {Math.round(similarity * 100)}%
            {similarity >= 0.8 ? '，算一遍' : '，再读一次'}）
          </p>
        )}
      </Card>

      <Button
        variant="primary"
        size="lg"
        full
        disabled={!done}
        onClick={() => onDone(Math.min(180_000, Date.now() - startedAt))}
      >
        {done ? doneLabel : `再跟读 ${ANCHOR_REPEATS - count} 遍后继续`}
      </Button>
    </div>
  );
}
