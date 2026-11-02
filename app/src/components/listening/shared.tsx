import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { SpeakerIcon } from '../icons';
import { Button, cx, inputClass } from '../ui';
import { splitAround } from './util';


/** Underscore placeholder as wide as the hidden text (one underscore group per word, so the length is a hint, not the answer). */
export function Blank({ words, className }: { words: number; className?: string }) {
  return (
    <span
      data-testid="blank"
      aria-label="空白"
      className={cx(
        'mx-0.5 inline-block whitespace-nowrap rounded-md border-b-2 border-dashed border-indigo-400 bg-indigo-50 px-1 align-baseline text-indigo-400 dark:border-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-400',
        className,
      )}
    >
      {Array.from({ length: Math.max(1, words) }, () => '____').join(' ')}
    </span>
  );
}

/** The sentence with the first occurrence of `hidden` replaced by a blank. */
export function MaskedLine({ text, hidden }: { text: string; hidden: string }) {
  const parts = splitAround(text, hidden);
  if (!parts) return <>{text}</>;
  const words = hidden.trim().split(/\s+/).length;
  return (
    <>
      {parts.before}
      <Blank words={words} />
      {parts.after}
    </>
  );
}

export interface TypedAnswerProps {
  /** Called with the typed text (non-empty). */
  onSubmit: (value: string) => void;
  /** "不会，看答案". */
  onGiveUp: () => void;
  label: string;
  placeholder?: string;
  submitLabel?: string;
  /** Focus the input on mount (the parent re-keys it per item). */
  autoFocus?: boolean;
  children?: ReactNode;
}

/** One typed answer: Enter submits; mobile keyboards must not "fix" what the learner heard. */
export function TypedAnswer({ onSubmit, onGiveUp, label, placeholder, submitLabel = '提交', autoFocus = true, children }: TypedAnswerProps) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim() !== '') onSubmit(value);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5">
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={label}
        placeholder={placeholder}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
        className={cx(inputClass, 'font-en min-h-12 text-lg')}
      />
      {children}
      <div className="flex gap-2.5">
        <Button type="submit" variant="primary" size="lg" className="flex-1" disabled={value.trim() === ''}>
          {submitLabel}
        </Button>
        <Button variant="ghost" size="lg" onClick={onGiveUp}>
          不会，看答案
        </Button>
      </div>
    </form>
  );
}

/** Round speaker badge A / B that lights up while that speaker talks. */
export function Avatar({ speaker, active, size = 'md' }: { speaker: 'A' | 'B'; active?: boolean; size?: 'md' | 'lg' }) {
  const tone =
    speaker === 'A'
      ? active
        ? 'bg-indigo-600 text-white ring-4 ring-indigo-200 dark:bg-indigo-500 dark:ring-indigo-900'
        : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300'
      : active
        ? 'bg-emerald-600 text-white ring-4 ring-emerald-200 dark:bg-emerald-500 dark:ring-emerald-900'
        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300';
  return (
    <span
      data-speaker={speaker}
      data-active={active ? 'true' : 'false'}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold transition-all duration-200',
        size === 'lg' ? 'size-16 text-2xl' : 'size-9 text-sm',
        tone,
      )}
    >
      {speaker}
    </span>
  );
}

export function PlayButton({
  onClick,
  playing,
  label,
  variant = 'primary',
  disabled,
}: {
  onClick: () => void;
  playing: boolean;
  label: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  return (
    <Button variant={variant} size="lg" onClick={onClick} disabled={disabled} aria-label={label}>
      <SpeakerIcon size={22} className={cx(playing && 'animate-pulse')} />
      {label}
    </Button>
  );
}

export function ResultBanner({ correct, children }: { correct: boolean; children: ReactNode }) {
  return (
    <p
      role="status"
      data-correct={correct ? 'true' : 'false'}
      className={cx(
        'rounded-xl px-3 py-2 text-base font-semibold',
        correct
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
          : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
      )}
    >
      {children}
    </p>
  );
}
