import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, type LinkProps } from 'react-router-dom';
import { ChevronLeftIcon, CloseIcon } from './icons';

/** Join class names, ignoring falsy values. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ---------- Button ----------

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_BASE =
  'inline-flex select-none items-center justify-center gap-2 rounded-xl font-medium transition-colors duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 active:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:active:bg-indigo-600',
  secondary:
    'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100 dark:hover:bg-slate-800 dark:active:bg-slate-700',
  ghost:
    'text-slate-600 hover:bg-slate-200/60 active:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800 dark:active:bg-slate-700',
  danger:
    'border border-rose-300 bg-white text-rose-600 hover:bg-rose-50 active:bg-rose-100 dark:border-rose-800 dark:bg-transparent dark:text-rose-400 dark:hover:bg-rose-950/50',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3.5 text-sm',
  md: 'min-h-11 px-4 text-[15px]',
  lg: 'min-h-12 px-6 text-base',
};

/** Class string for a button look; use it to style links / custom elements like buttons. */
export function buttonClass(opts: { variant?: ButtonVariant; size?: ButtonSize; full?: boolean; className?: string } = {}): string {
  const { variant = 'secondary', size = 'md', full = false, className } = opts;
  return cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], full && 'w-full', className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. Default 'secondary'. */
  variant?: ButtonVariant;
  /** 'sm' | 'md' | 'lg' - all keep a >= 44px tap height. Default 'md'. */
  size?: ButtonSize;
  /** Stretch to the container width. */
  full?: boolean;
}

export function Button({ variant, size, full, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass({ variant, size, full, className })} {...rest} />;
}

/** A react-router Link that looks like a Button. */
export function ButtonLink({
  variant,
  size,
  full,
  className,
  ...rest
}: LinkProps & { variant?: ButtonVariant; size?: ButtonSize; full?: boolean }) {
  return <Link className={buttonClass({ variant, size, full, className })} {...rest} />;
}

// ---------- Card ----------

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Element to render (e.g. 'section', 'li'). Default 'div'. */
  as?: ElementType;
  /** Default true: p-4 (p-5 on >= md). */
  padded?: boolean;
  /** Adds hover / press feedback (for clickable cards). */
  interactive?: boolean;
}

export function Card({ as, padded = true, interactive = false, className, ...rest }: CardProps) {
  const Tag: ElementType = as ?? 'div';
  return (
    <Tag
      className={cx(
        'rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900',
        padded && 'p-4 md:p-5',
        interactive &&
          'transition hover:border-slate-300 hover:shadow-md active:scale-[0.99] dark:hover:border-slate-700',
        className,
      )}
      {...rest}
    />
  );
}

// ---------- Badge / Chip ----------

export type Tone = 'slate' | 'indigo' | 'sky' | 'violet' | 'emerald' | 'amber' | 'rose';

const TONES: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-200',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-200',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

/** Small static label. */
export function Badge({ tone = 'slate', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
      {...rest}
    />
  );
}

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

/** Toggleable filter chip (a button with aria-pressed). */
export function Chip({ selected = false, className, type = 'button', ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cx(
        'inline-flex min-h-11 items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors',
        selected
          ? 'border-indigo-600 bg-indigo-600 text-white dark:border-indigo-500 dark:bg-indigo-500'
          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
        className,
      )}
      {...rest}
    />
  );
}

// ---------- Segmented ----------

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
}

export interface SegmentedProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  ariaLabel?: string;
  /** Make options share the full width equally. */
  full?: boolean;
  className?: string;
}

/** iOS-style segmented control. Scrolls horizontally if it does not fit. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  full = false,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cx(
        'no-scrollbar flex max-w-full overflow-x-auto rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800',
        full ? 'w-full' : 'w-fit',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'min-h-9 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition-colors',
              full && 'flex-1',
              active
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-600 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Spinner / EmptyState ----------

export function Spinner({ size = 20, label = '加载中' }: { size?: number; label?: string }) {
  return (
    <svg
      role="status"
      aria-label={label}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin text-indigo-500"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Centered spinner block for page-level loading. */
export function PageLoading() {
  return (
    <div className="flex justify-center py-16">
      <Spinner size={28} />
    </div>
  );
}

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cx('flex flex-col items-center px-6 py-12 text-center', className)}>
      {icon && <div className="mb-3 text-slate-400 dark:text-slate-500">{icon}</div>}
      <p className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ---------- PageHeader ----------

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned actions (buttons). */
  actions?: ReactNode;
  /** If set, shows a "back" link above the title. */
  backTo?: string;
  backLabel?: string;
}

export function PageHeader({ title, subtitle, actions, backTo, backLabel = '返回' }: PageHeaderProps) {
  return (
    <header className="mb-5 md:mb-7">
      {backTo && (
        <Link
          to={backTo}
          className="-ml-2 mb-1 inline-flex min-h-11 items-center gap-0.5 rounded-lg px-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ChevronLeftIcon size={18} />
          {backLabel}
        </Link>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white md:text-3xl">{title}</h1>
          {subtitle && (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400 md:text-[15px]">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

// ---------- Sheet / Modal ----------

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** Sticky footer (e.g. action buttons). */
  footer?: ReactNode;
}

/** Bottom sheet on mobile, centered dialog from 768px up. Closes on backdrop tap and Escape. */
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div
        className="absolute inset-0 animate-[pd-fade_0.18s_ease-out] bg-slate-950/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full animate-[pd-sheet-up_0.22s_ease-out] flex-col rounded-t-3xl bg-white shadow-2xl outline-none dark:bg-slate-900 md:max-h-[85dvh] md:max-w-lg md:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="-mr-2 flex size-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <CloseIcon size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer && (
          <div className="border-t border-slate-200 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-slate-800">
            {footer}
          </div>
        )}
        {!footer && <div className="pb-[env(safe-area-inset-bottom)]" />}
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Small yes/no dialog built on Sheet. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确定',
  cancelLabel = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" full onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} full onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {message && <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">{message}</p>}
    </Sheet>
  );
}

// ---------- Small helpers ----------

/** Section heading inside a page. */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{children}</h2>
      {aside}
    </div>
  );
}

/** Class string for text inputs, selects and textareas (>= 44px tall, 16px text so iOS does not zoom). */
export const inputClass =
  'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500';

/** Labelled form row. Wrap an input / select / Segmented in it. */
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-400 dark:text-slate-500">{hint}</span>}
    </div>
  );
}
