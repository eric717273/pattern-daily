import { useMemo, useRef, useState } from 'react';
import type { SubstitutionFrame } from '../../types';
import { picksFromExample } from '../../lib/drill';
import { buildCombo } from '../../lib/frameEngine';
import { speak } from '../../lib/speech';
import { matchVoice, READ_ALOUD_THRESHOLD } from '../../lib/voiceMatch';
import { FramePattern } from '../FramePattern';
import { FrameTable } from '../FrameTable';
import { CheckIcon, SpeakerIcon } from '../icons';
import { Button, Card, cx } from '../ui';
import { MicButton } from './MicButton';
import { useVoicePref } from './useVoice';
import { VoiceToggle } from './VoiceToggle';

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
  const voicePref = useVoicePref();
  /** With voice verification a read-aloud only counts when the microphone heard the sentence. */
  const voice = voicePref.enabled;

  const lastTap = useRef(0);

  const tap = () => {
    // Speech must start synchronously inside the tap (iOS). The counter does not wait for playback to end
    // (some browsers never report it), but taps in quick succession count once.
    const now = Date.now();
    if (now - lastTap.current < 400) return;
    lastTap.current = now;
    void speak(combo.en);
    if (!voice) setCount((c) => Math.min(ANCHOR_REPEATS, c + 1));
  };

  const verify = (text: string) => {
    setHeard(text);
    if (matchVoice(text, combo.en, { threshold: READ_ALOUD_THRESHOLD }).matched) {
      setCount((c) => Math.min(ANCHOR_REPEATS, c + 1));
    }
  };

  const match = heard !== null ? matchVoice(heard, combo.en, { threshold: READ_ALOUD_THRESHOLD }) : null;

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

        {voicePref.supported && <VoiceToggle enabled={voice} onChange={voicePref.setEnabled} className="self-start" />}
        <div className="flex flex-wrap items-start gap-3">
          {voice ? (
            <>
              <MicButton onResult={verify} label="我来读" />
              <Button variant="secondary" size="lg" onClick={tap} aria-label="听示范">
                <SpeakerIcon size={20} />
                听示范
              </Button>
            </>
          ) : (
            <>
              <Button
                variant={done ? 'secondary' : 'primary'}
                size="lg"
                onClick={tap}
                aria-label={`听并跟读（已读 ${count} 遍）`}
              >
                <SpeakerIcon size={20} />
                听并跟读
              </Button>
              <MicButton onResult={verify} label="我来读" />
            </>
          )}
        </div>
        {voice && !done && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            语音验证已开启：点「我来读」，对着麦克风把整句读出来，读对才算一遍（读不出来可关掉语音验证，改为点按计数）。
          </p>
        )}
        {heard !== null && match !== null && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            识别到：<span className="font-en font-medium">{heard}</span>（相似度 {Math.round(match.similarity * 100)}%
            {match.matched ? '，算一遍' : '，再读一次'}）
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
