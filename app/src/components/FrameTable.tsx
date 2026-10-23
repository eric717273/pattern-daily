import { useMemo } from 'react';
import type { SubstitutionFrame } from '../types';
import { buildCombo, countCombos, randomCombo } from '../lib/frameEngine';
import { inferSlotRole, ROLE_STYLES } from '../lib/labels';
import { DiceIcon } from './icons';
import { SpeakButton } from './SpeakButton';
import { Button, cx } from './ui';

export interface FrameTableProps {
  frame: SubstitutionFrame;
  /** Controlled selection: slot key -> option index. Missing / invalid keys fall back to option 0. */
  picks: Record<string, number>;
  /** Called with the full picks object (every slot key present). */
  onChange: (picks: Record<string, number>) => void;
  /** Slot key to emphasize (e.g. the slot that changed in a single-swap drill). */
  highlightSlot?: string;
  /** Show the assembled sentence + speak / random / count row below the table. Default true. */
  showSentence?: boolean;
  /** Show the Chinese translation of the assembled sentence. Default true. */
  showSentenceZh?: boolean;
  /** Compact view: only the picked option of every column (for drills). Default false. */
  compact?: boolean;
  /** Display only: cells cannot be tapped. Default false. */
  readOnly?: boolean;
  /** Slot key whose picked option hides its English (shows "?" + the Chinese): used before an answer is revealed. */
  maskEnSlot?: string;
  className?: string;
}

/** Slot keys in the order they appear in the English pattern (a "real" Palmer table reads left to right). */
function orderedSlots(frame: SubstitutionFrame) {
  const order = [...frame.pattern.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const rank = (key: string) => {
    const i = order.indexOf(key);
    return i === -1 ? order.length : i;
  };
  return [...frame.slots].sort((a, b) => rank(a.key) - rank(b.key));
}

/**
 * Palmer substitution table: one column per slot (header = labelZh, coloured by inferred role),
 * options stacked as tappable cells, the picked cell of each column highlighted. Below it the live
 * assembled sentence with speak button, 🎲 random and the "可组合 N 句" count.
 */
export function FrameTable({
  frame,
  picks,
  onChange,
  highlightSlot,
  showSentence = true,
  showSentenceZh = true,
  compact = false,
  readOnly = false,
  maskEnSlot,
  className,
}: FrameTableProps) {
  const columns = useMemo(() => orderedSlots(frame), [frame]);
  const combo = useMemo(() => buildCombo(frame, picks), [frame, picks]);
  const total = useMemo(() => countCombos(frame), [frame]);

  const pick = (key: string, index: number) => {
    if (readOnly) return;
    onChange({ ...combo.picks, [key]: index });
  };

  return (
    <div className={className}>
      <div
        className="no-scrollbar -mx-4 snap-x overflow-x-auto px-4 py-1 md:mx-0 md:px-0"
        role="group"
        aria-label="替换表"
      >
        <div className="flex w-max min-w-full gap-2">
          {columns.map((slot) => {
            const style = ROLE_STYLES[inferSlotRole(slot)];
            const selected = combo.picks[slot.key];
            const emphasized = highlightSlot === slot.key;
            return (
              <div
                key={slot.key}
                role="group"
                aria-label={slot.labelZh}
                className={cx(
                  'flex shrink-0 snap-start flex-col gap-1.5 rounded-2xl p-1 transition md:flex-1',
                  compact ? 'w-[7.25rem] md:min-w-[7.25rem]' : 'w-[8.75rem] md:min-w-[8.75rem]',
                  emphasized && cx('ring-2', style.ring, 'bg-slate-100/80 dark:bg-slate-800/50'),
                )}
              >
                <div className={cx('rounded-xl px-2 py-2 text-center text-[13px] font-semibold', style.header)}>
                  {slot.labelZh}
                </div>
                {slot.options.map((opt, i) => {
                  const isSel = i === selected;
                  if (compact && !isSel) return null;
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={isSel}
                      aria-disabled={readOnly || undefined}
                      onClick={() => pick(slot.key, i)}
                      className={cx(
                        'flex min-h-[3.25rem] flex-col items-center justify-center rounded-xl border px-2 py-1.5 text-center transition',
                        readOnly ? 'cursor-default' : 'active:scale-[0.97]',
                        isSel
                          ? cx(style.selected, 'shadow-sm')
                          : cx(
                              'border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100',
                              style.cell,
                            ),
                      )}
                    >
                      <span className="font-en text-[15px] leading-tight font-medium">
                        {maskEnSlot === slot.key && isSel ? '?' : opt.en}
                      </span>
                      <span className={cx('mt-0.5 text-xs leading-tight', isSel ? 'opacity-85' : 'text-slate-500 dark:text-slate-400')}>
                        {opt.zh}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {columns.length > 2 && !compact && (
        <p className="mt-1 text-center text-xs text-slate-400 md:hidden dark:text-slate-500">左右滑动查看全部列</p>
      )}

      {showSentence && (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-400 dark:text-slate-500">组合出的句子</p>
          <p
            data-testid="frame-sentence-en"
            aria-live="polite"
            className="font-en mt-1 text-xl leading-snug font-semibold text-slate-900 md:text-2xl dark:text-white"
          >
            {combo.en}
          </p>
          {showSentenceZh && (
            <p data-testid="frame-sentence-zh" className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
              {combo.zh}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <SpeakButton text={combo.en} />
            <Button size="sm" onClick={() => onChange(randomCombo(frame).picks)}>
              <DiceIcon size={18} />
              随机
            </Button>
            <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
              可组合 {total.toLocaleString('en-US')} 句
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
