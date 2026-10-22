import type { SubstitutionFrame } from '../types';
import { inferSlotRole, ROLE_STYLES } from '../lib/labels';
import { cx } from './ui';

export interface FramePatternProps {
  frame: SubstitutionFrame;
  /** 'en' renders frame.pattern, 'zh' renders frame.patternZh. Default 'en'. */
  lang?: 'en' | 'zh';
  /** Show the slot's labelZh inside the pill (default) or its key. */
  pillText?: 'label' | 'key';
  className?: string;
}

/** The frame pattern with each {slot} rendered as a pill coloured by the slot's inferred role. */
export function FramePattern({ frame, lang = 'en', pillText = 'label', className }: FramePatternProps) {
  const source = lang === 'en' ? frame.pattern : frame.patternZh;
  const parts = source.split(/(\{\w+\})/g).filter((p) => p !== '');
  return (
    <p
      className={cx(
        'leading-9',
        lang === 'en' ? 'font-en text-[17px] text-slate-800 dark:text-slate-100' : 'text-[15px] text-slate-600 dark:text-slate-300',
        className,
      )}
    >
      {parts.map((part, i) => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (!m) return <span key={i}>{part}</span>;
        const slot = frame.slots.find((s) => s.key === m[1]);
        const style = ROLE_STYLES[slot ? inferSlotRole(slot) : 'other'];
        return (
          <span
            key={i}
            className={cx(
              'mx-0.5 inline-block rounded-md px-2 py-0.5 align-baseline font-sans text-sm leading-5 font-medium',
              style.pill,
            )}
          >
            {pillText === 'label' ? (slot?.labelZh ?? m[1]) : m[1]}
          </span>
        );
      })}
    </p>
  );
}
