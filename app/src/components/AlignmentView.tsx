import { useState } from 'react';
import type { AlignmentToken } from '../types';
import { ROLE_STYLES, SLOT_ROLE_LABELS } from '../lib/labels';
import { EyeIcon, EyeOffIcon } from './icons';
import { cx } from './ui';

export interface AlignmentViewProps {
  /** Tokens in English word order (DozenSentence.alignment or Deconstruction.alignment). */
  tokens: AlignmentToken[];
  /**
   * Whether Chinese glosses are visible. Controlled when given together with `onShowZhChange`;
   * otherwise the component keeps its own state (default true).
   */
  showZh?: boolean;
  onShowZhChange?: (show: boolean) => void;
  /** Hide the built-in "显示/隐藏中文" toggle (when the parent renders its own). */
  hideToggle?: boolean;
  /** Show a colour legend (角色图例). Default false. */
  legend?: boolean;
  className?: string;
}

/**
 * 中英逐字对照: every token is a stacked chip (English above, Chinese below) coloured by role.
 * Tapping a chip that has a note shows the note underneath; with Chinese hidden, tapping reveals that token.
 */
export function AlignmentView({
  tokens,
  showZh: showZhProp,
  onShowZhChange,
  hideToggle = false,
  legend = false,
  className,
}: AlignmentViewProps) {
  const [innerShow, setInnerShow] = useState(true);
  const [active, setActive] = useState<number | null>(null);
  const controlled = showZhProp !== undefined;
  const showZh = controlled ? showZhProp : innerShow;

  const setShow = (v: boolean) => {
    if (!controlled) setInnerShow(v);
    onShowZhChange?.(v);
    setActive(null);
  };

  const activeToken = active !== null ? tokens[active] : undefined;
  const roles = legend ? [...new Set(tokens.map((t) => t.role))] : [];

  return (
    <div className={className}>
      {!hideToggle && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => setShow(!showZh)}
            aria-pressed={showZh}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            {showZh ? <EyeIcon size={18} /> : <EyeOffIcon size={18} />}
            {showZh ? '隐藏中文' : '显示中文'}
          </button>
        </div>
      )}

      <ul className="flex flex-wrap gap-2" aria-label="中英逐字对照">
        {tokens.map((t, i) => {
          const style = ROLE_STYLES[t.role];
          const isActive = active === i;
          const zhVisible = showZh || isActive;
          const interactive = Boolean(t.note) || !showZh;
          const body = (
            <>
              <span className="font-en text-lg leading-tight font-semibold md:text-xl">{t.en}</span>
              <span
                className={cx(
                  'mt-1 text-sm leading-tight',
                  zhVisible ? 'opacity-80' : 'opacity-30 select-none',
                )}
              >
                {zhVisible ? t.zh : '···'}
              </span>
              {t.note && (
                <span
                  aria-hidden="true"
                  className="absolute top-1 right-1 size-1.5 rounded-full bg-current opacity-50"
                />
              )}
            </>
          );
          const chipClass = cx(
            'relative flex min-h-[3.75rem] min-w-12 flex-col items-center justify-center rounded-xl border px-3 py-2 text-center transition',
            style.chip,
            isActive && 'ring-2 ring-offset-1 ring-offset-white dark:ring-offset-slate-950',
            isActive && style.ring,
          );
          return (
            <li key={i}>
              {interactive ? (
                <button
                  type="button"
                  className={cx(chipClass, 'active:scale-95')}
                  aria-expanded={t.note ? isActive : undefined}
                  aria-label={t.note ? `${t.en} ${t.zh}，点按查看说明` : undefined}
                  onClick={() => setActive(isActive ? null : i)}
                >
                  {body}
                </button>
              ) : (
                <div className={chipClass}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>

      {activeToken?.note && (
        <div
          role="note"
          className="mt-3 rounded-xl border border-slate-200 bg-slate-100/70 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
        >
          <span className="font-en font-semibold">{activeToken.en}</span>
          <span className="mx-1.5 text-slate-400">·</span>
          {activeToken.note}
        </div>
      )}

      {legend && roles.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
          {roles.map((r) => (
            <li key={r} className="inline-flex items-center gap-1.5">
              <span className={cx('size-2.5 rounded-full', ROLE_STYLES[r].dot)} />
              {SLOT_ROLE_LABELS[r]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
