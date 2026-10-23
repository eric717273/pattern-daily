import { useRef, useState } from 'react';
import type { LibraryItem } from '../../content';
import { chunkCore, matchChunkSpoken } from '../../lib/chunkDrill';
import { randomCombo } from '../../lib/frameEngine';
import { speak } from '../../lib/speech';
import { matchVoice, READ_ALOUD_THRESHOLD } from '../../lib/voiceMatch';
import { MicButton } from '../drills/MicButton';
import { useVoicePref } from '../drills/useVoice';
import { VoiceToggle } from '../drills/VoiceToggle';
import { CheckIcon, SpeakerIcon } from '../icons';
import { Button, Card, cx } from '../ui';
import { SoundTip } from './SoundTip';

export const SHADOW_REPS = 3;

export interface ShadowResult {
  /** Repetitions completed (always the requested number once 完成 is enabled). */
  reps: number;
  /** Every repetition was confirmed by speech recognition (false when counted by tapping). */
  verified: boolean;
}

export interface ShadowDrillProps {
  item: LibraryItem;
  onDone: (result: ShadowResult) => void;
  /** Repetitions to do. Default 3. */
  reps?: number;
  doneLabel?: string;
}

/** What is spoken, shown and matched: the chunk itself, or a model sentence of the frame. */
function shadowTarget(item: LibraryItem): { say: string; zh: string; soundZh?: string } {
  if (item.kind === 'chunk') {
    return { say: chunkCore(item.chunk.en), zh: item.chunk.zh, soundZh: item.chunk.soundZh };
  }
  const ex = item.frame.examples[0];
  const combo = ex ? { en: ex.en, zh: ex.zh } : randomCombo(item.frame);
  return { say: combo.en, zh: combo.zh, soundZh: item.frame.soundZh };
}

/**
 * 跟读: play the item, then say it after the audio, 3 times. With speech recognition and voice mode on, a
 * repetition only counts when the microphone recognised it (similarity >= 0.8 against the chunk text, or the
 * full sentence for a frame); otherwise every tap on 听并跟读 counts one. The 听力提示 is the thing to imitate.
 */
export function ShadowDrill({ item, onDone, reps = SHADOW_REPS, doneLabel = '完成跟读' }: ShadowDrillProps) {
  const [target] = useState(() => shadowTarget(item));
  const [count, setCount] = useState(0);
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [heard, setHeard] = useState<{ text: string; similarity: number; matched: boolean } | null>(null);
  const voicePref = useVoicePref();
  const voice = voicePref.enabled;
  const lastTap = useRef(0);
  const done = count >= reps;

  const tap = () => {
    // Speech must start inside the tap (iOS); quick double taps count once.
    const now = Date.now();
    if (now - lastTap.current < 400) return;
    lastTap.current = now;
    void speak(target.say);
    if (!voice) setCount((c) => Math.min(reps, c + 1));
  };

  const verify = (text: string) => {
    const m =
      item.kind === 'chunk'
        ? matchChunkSpoken(text, item.chunk.en, READ_ALOUD_THRESHOLD)
        : matchVoice(text, target.say, { threshold: READ_ALOUD_THRESHOLD });
    setHeard({ text, similarity: m.similarity, matched: m.matched });
    if (m.matched && count < reps) {
      setCount((c) => Math.min(reps, c + 1));
      setVerifiedCount((c) => c + 1);
    }
  };

  return (
    <Card className="flex flex-col gap-4" aria-label="跟读">
      <div>
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500">听一遍，照着读出来</p>
        <p className="font-en mt-1 text-2xl leading-snug font-bold text-slate-900 dark:text-white" data-testid="shadow-text">
          {target.say}
        </p>
        <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">{target.zh}</p>
      </div>

      {target.soundZh && <SoundTip text={target.soundZh} label="模仿这个音" />}

      <div className="flex items-center gap-3" role="status" aria-live="polite">
        <div className="flex gap-1.5" aria-hidden="true">
          {Array.from({ length: reps }, (_, i) => (
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
          跟读 {reps} 遍：{count} / {reps}
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
          <Button
            variant={done ? 'secondary' : 'primary'}
            size="lg"
            onClick={tap}
            aria-label={`听并跟读（已读 ${count} 遍）`}
          >
            <SpeakerIcon size={20} />
            听并跟读
          </Button>
        )}
      </div>
      {voice && !done && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          语音验证已开启：先听示范，再点「我来读」对着麦克风说，说对才算一遍（说不出来可关掉语音验证，改为点按计数）。
        </p>
      )}
      {heard !== null && (
        <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="shadow-heard">
          识别到：<span className="font-en font-medium">{heard.text}</span>（相似度 {Math.round(heard.similarity * 100)}%
          {heard.matched ? '，算一遍' : '，再读一次'}）
        </p>
      )}

      <Button
        variant="primary"
        size="lg"
        full
        disabled={!done}
        onClick={() => onDone({ reps: count, verified: verifiedCount >= reps })}
      >
        {done ? doneLabel : `再跟读 ${reps - count} 遍后继续`}
      </Button>
    </Card>
  );
}
