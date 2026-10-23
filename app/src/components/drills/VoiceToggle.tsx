import { MicIcon } from '../icons';
import { cx } from '../ui';

export interface VoiceToggleProps {
  enabled: boolean;
  onChange: (on: boolean) => void;
  className?: string;
}

/** "语音验证" switch (microphone checks what you say). */
export function VoiceToggle({ enabled, onChange, className }: VoiceToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={cx(
        'inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors',
        enabled
          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/50 dark:text-indigo-200'
          : 'border-slate-300 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
        className,
      )}
    >
      <MicIcon size={18} />
      语音验证
      <span
        aria-hidden="true"
        className={cx(
          'relative inline-block h-5 w-9 rounded-full transition-colors',
          enabled ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform',
            enabled && 'translate-x-4',
          )}
        />
      </span>
    </button>
  );
}

/** One-line note shown when the browser cannot recognize speech. */
export function VoiceUnsupportedNote({ className }: { className?: string }) {
  return (
    <p className={cx('text-xs text-slate-500 dark:text-slate-400', className)}>
      当前浏览器不支持语音识别，改为自评模式
    </p>
  );
}
