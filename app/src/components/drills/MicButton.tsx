import { useEffect, useRef, useState } from 'react';
import { listenOnce, recognitionSupported } from '../../lib/speech';
import { MicIcon } from '../icons';
import { cx } from '../ui';

export interface MicButtonProps {
  /** Receives the recognized English text. */
  onResult: (text: string) => void;
  label?: string;
  className?: string;
}

/** Optional 🎤 button: only rendered when the browser supports speech recognition. */
export function MicButton({ onResult, label = '说出来', className }: MicButtonProps) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (!recognitionSupported()) return null;

  const start = () => {
    setError(null);
    setListening(true);
    listenOnce('en-US')
      .then((text) => {
        if (mounted.current) onResult(text);
      })
      .catch((e: unknown) => {
        if (mounted.current) setError(e instanceof Error ? e.message : '语音识别失败，请重试。');
      })
      .finally(() => {
        if (mounted.current) setListening(false);
      });
  };

  return (
    <div className={cx('flex flex-col items-start gap-1', className)}>
      <button
        type="button"
        onClick={start}
        disabled={listening}
        aria-label={listening ? '正在听…' : `${label}（语音识别）`}
        className={cx(
          'inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors',
          listening
            ? 'animate-pulse bg-rose-600 text-white'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
        )}
      >
        <MicIcon size={20} />
        {listening ? '正在听…' : label}
      </button>
      {error && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}
