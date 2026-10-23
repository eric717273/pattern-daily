import { SpeakerIcon } from '../icons';
import { cx } from '../ui';

/**
 * 听力提示 (linking / reduction of the chunk): deliberately prominent, because catching these sound changes
 * is the point of the chunk track.
 */
export function SoundTip({ text, label = '听力提示', className }: { text: string; label?: string; className?: string }) {
  return (
    <div
      data-testid="sound-tip"
      className={cx(
        'flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/60 dark:bg-amber-950/40',
        className,
      )}
    >
      <SpeakerIcon size={20} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{label}</p>
        <p className="mt-0.5 text-[15px] leading-relaxed font-medium text-amber-950 dark:text-amber-100">{text}</p>
      </div>
    </div>
  );
}
