import { useCallback, useEffect, useRef, useState } from 'react';
import { speak, stopSpeaking } from '../lib/speech';
import { useSettings } from '../lib/settings';
import { SpeakerIcon, StopIcon } from './icons';
import { cx } from './ui';

export interface SpeakButtonProps {
  /** English text to read aloud. */
  text: string;
  /** Optional visible label (e.g. "朗读"). Without it the button is a round icon button. */
  label?: string;
  /** Overrides the speech rate from settings. */
  rate?: number;
  /** Fired when playback finishes (or is cancelled / errors). */
  onDone?: () => void;
  className?: string;
}

/** Plays English text with speechSynthesis; tapping again while playing stops it. */
export function SpeakButton({ text, label, rate, onDone, className }: SpeakButtonProps) {
  const [settings] = useSettings();
  const [playing, setPlaying] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onClick = useCallback(() => {
    if (playing) {
      stopSpeaking();
      return;
    }
    setPlaying(true);
    void speak(text, { rate: rate ?? settings.ttsRate }).then(() => {
      if (mounted.current) setPlaying(false);
      onDone?.();
    });
  }, [playing, text, rate, settings.ttsRate, onDone]);

  const name = playing ? '停止朗读' : label ? `朗读：${label}` : `朗读：${text}`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={name}
      aria-pressed={playing}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full transition-colors',
        label ? 'min-h-11 px-4 text-sm font-medium' : 'size-11',
        playing
          ? 'bg-indigo-600 text-white dark:bg-indigo-500'
          : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 active:bg-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900/60',
        className,
      )}
    >
      {playing ? <StopIcon size={20} className="animate-pulse" /> : <SpeakerIcon size={20} />}
      {label && <span>{playing ? '停止' : label}</span>}
    </button>
  );
}
