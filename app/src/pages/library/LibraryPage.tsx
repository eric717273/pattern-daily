import { useLiveQuery } from 'dexie-react-hooks';
import { memo, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CHUNKS, SEED_FRAMES } from '../../content';
import type { Freq, FunctionCategory } from '../../types';
import { FramePattern } from '../../components/FramePattern';
import { GenerateFrameSheet } from '../../components/GenerateFrameSheet';
import { ChevronRightIcon, SearchIcon, SparklesIcon } from '../../components/icons';
import { SpeakButton } from '../../components/SpeakButton';
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, cx, inputClass, type Tone } from '../../components/ui';
import { useAllFrames, useCardMap } from '../../lib/hooks';
import { FREQ_LABELS, FREQS, FUNCTION_CATEGORIES, FUNCTION_CATEGORY_LABELS } from '../../lib/labels';
import {
  NO_FILTERS,
  STATUS_LABELS,
  buildRows,
  filterRows,
  type KindFilter,
  type LibraryFilters,
  type LibraryRow,
  type LibraryStatus,
} from '../../lib/library';
import { getLibraryProgress } from '../../lib/repo';
import type { CategoryProgress } from '../../lib/repo';

const FREQ_TONE: Record<Freq, Tone> = { 1: 'indigo', 2: 'sky', 3: 'slate' };
const STATUS_DOT: Record<LibraryStatus, string> = {
  new: 'bg-slate-300 dark:bg-slate-600',
  learning: 'bg-amber-400',
  mastered: 'bg-emerald-500',
};
/** Off-screen rows skip layout and paint, so 400 rows stay cheap on phones. */
const ROW_PERF = '[content-visibility:auto] [contain-intrinsic-size:auto_92px]';
const EMPTY_PROGRESS: CategoryProgress = { total: 0, introduced: 0, mastered: 0 };

function isCategory(v: string | null): v is FunctionCategory {
  return v !== null && (FUNCTION_CATEGORIES as string[]).includes(v);
}

/** Two stacked bars: how much of a set was met (indigo) and how much of it is mastered (green). */
function MiniBar({ p, className }: { p: CategoryProgress; className?: string }) {
  const pct = (n: number) => (p.total > 0 ? Math.min(100, (n / p.total) * 100) : 0);
  return (
    <div
      className={cx('relative h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700', className)}
      role="img"
      aria-label={`已学 ${p.introduced} / ${p.total}，已掌握 ${p.mastered}`}
    >
      <div className="absolute inset-y-0 left-0 rounded-full bg-indigo-300 dark:bg-indigo-500/60" style={{ width: `${pct(p.introduced)}%` }} />
      <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500" style={{ width: `${pct(p.mastered)}%` }} />
    </div>
  );
}

const Row = memo(function Row({ row }: { row: LibraryRow }) {
  const dot = (
    <span className="inline-flex shrink-0 items-center" title={STATUS_LABELS[row.status]}>
      <span className={cx('size-2.5 rounded-full', STATUS_DOT[row.status])} aria-hidden="true" />
      <span className="sr-only">{STATUS_LABELS[row.status]}</span>
    </span>
  );
  if (row.kind === 'chunk' && row.chunk) {
    const c = row.chunk;
    return (
      <li className={ROW_PERF}>
        <Card padded={false} interactive className="flex items-center gap-1 pr-2">
          <Link to={`/library/chunk/${c.id}`} className="min-w-0 flex-1 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2">
              {dot}
              <p className="font-en min-w-0 text-[17px] leading-snug font-medium text-slate-900 dark:text-slate-100">{c.en}</p>
            </div>
            <p className="mt-0.5 pl-[18px] text-sm text-slate-500 dark:text-slate-400">{c.zh}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-[18px]">
              <Badge tone={FREQ_TONE[c.freq]}>{FREQ_LABELS[c.freq]}</Badge>
              <span className="text-xs text-slate-400 dark:text-slate-500">{FUNCTION_CATEGORY_LABELS[c.category]}</span>
            </div>
          </Link>
          <SpeakButton text={c.en.replace(/\s*…$/, '')} />
        </Card>
      </li>
    );
  }
  const f = row.frame;
  if (!f) return null;
  return (
    <li className={ROW_PERF}>
      <Link to={`/frames/${f.id}`} className="block rounded-2xl" aria-label={f.title}>
        <Card interactive padded={false} className="flex items-start gap-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {dot}
              <p className="mr-1 text-base font-semibold text-slate-900 dark:text-white">{f.title}</p>
              <Badge tone="violet">母框</Badge>
              {f.freq && <Badge tone={FREQ_TONE[f.freq]}>{FREQ_LABELS[f.freq]}</Badge>}
              {row.mine && <Badge tone="amber">{f.source === 'ai' ? 'AI 生成' : '自建'}</Badge>}
            </div>
            <FramePattern frame={f} className="mt-1.5 pl-[18px]" />
            {f.category && (
              <p className="mt-0.5 pl-[18px] text-xs text-slate-400 dark:text-slate-500">
                {FUNCTION_CATEGORY_LABELS[f.category]}
              </p>
            )}
          </div>
          <ChevronRightIcon size={20} className="mt-1 shrink-0 text-slate-300 dark:text-slate-600" />
        </Card>
      </Link>
    </li>
  );
});

export function LibraryPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const frames = useAllFrames();
  const cards = useCardMap();
  const progress = useLiveQuery(() => getLibraryProgress(), []);

  const [filters, setFilters] = useState<LibraryFilters>(() => {
    const cat = params.get('cat');
    return { ...NO_FILTERS, category: isCategory(cat) ? cat : 'all' };
  });
  const [catsOpen, setCatsOpen] = useState(() => !isCategory(params.get('cat')));
  const [aiOpen, setAiOpen] = useState(false);
  const patch = (p: Partial<LibraryFilters>) => setFilters((f) => ({ ...f, ...p }));

  const rows = useMemo(() => buildRows(CHUNKS, frames ?? SEED_FRAMES, cards), [frames, cards]);
  const filtered = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const mineCount = useMemo(() => rows.filter((r) => r.mine).length, [rows]);

  const total = progress ?? { ...EMPTY_PROGRESS, total: CHUNKS.length + SEED_FRAMES.length };
  const selected = filters.category === 'all' ? null : filters.category;
  const filtering =
    filters.category !== 'all' || filters.kind !== 'all' || filters.freq !== 0 || filters.status !== 'all' || filters.query.trim() !== '';

  return (
    <>
      <PageHeader
        title="语块库"
        subtitle="按交际功能整理的高频表达：练到听见就懂、张口就来。"
        actions={
          <Button variant="primary" size="sm" onClick={() => setAiOpen(true)}>
            <SparklesIcon size={18} />
            AI 生成母框
          </Button>
        }
      />

      <Card className="mb-5" aria-label="学习进度">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-lg font-semibold text-slate-900 dark:text-white">
            已学 <span className="tabular-nums">{total.introduced}</span> / <span className="tabular-nums">{total.total}</span>
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            已掌握 <span className="font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">{total.mastered}</span>
            <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">（复习间隔 ≥ 21 天）</span>
          </p>
        </div>
        <MiniBar p={total} className="mt-3 h-2.5" />
      </Card>

      <section className="mb-5" aria-label="按功能分类">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">按功能找</h2>
          {selected && (
            <button
              type="button"
              onClick={() => setCatsOpen((o) => !o)}
              className="min-h-11 rounded-lg px-2 text-sm text-indigo-600 dark:text-indigo-400"
            >
              {catsOpen ? '收起分类' : '换一个分类'}
            </button>
          )}
        </div>
        {selected && !catsOpen ? (
          <div className="flex items-center gap-2">
            <Badge tone="indigo" className="px-3 py-1.5 text-sm">
              {FUNCTION_CATEGORY_LABELS[selected]}
            </Badge>
            <button
              type="button"
              onClick={() => patch({ category: 'all' })}
              className="min-h-11 rounded-lg px-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400"
            >
              显示全部
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {FUNCTION_CATEGORIES.map((cat) => {
              const p = progress?.byCategory[cat] ?? EMPTY_PROGRESS;
              const active = selected === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    patch({ category: active ? 'all' : cat });
                    setCatsOpen(active);
                  }}
                  className={cx(
                    'flex min-h-[4.25rem] flex-col justify-between gap-2 rounded-2xl border p-3 text-left transition active:scale-[0.98]',
                    active
                      ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950/40'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700',
                  )}
                >
                  <span className="text-sm leading-snug font-semibold text-slate-900 dark:text-slate-100">
                    {FUNCTION_CATEGORY_LABELS[cat]}
                  </span>
                  <span className="flex flex-col gap-1">
                    <MiniBar p={p} />
                    <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      {p.introduced} / {p.total} 已学{p.mastered > 0 && ` · ${p.mastered} 掌握`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="mb-4 flex flex-col gap-2.5">
        <div className="relative">
          <SearchIcon size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            className={`${inputClass} pl-10`}
            placeholder="搜索英文、中文或母框名称"
            aria-label="搜索语块"
            value={filters.query}
            onChange={(e) => patch({ query: e.target.value })}
          />
        </div>
        <Segmented<KindFilter>
          ariaLabel="类型"
          value={filters.kind}
          onChange={(kind) => patch({ kind })}
          options={[
            { value: 'all', label: '全部' },
            { value: 'chunk', label: '固定表达' },
            { value: 'frame', label: '母框' },
            { value: 'mine', label: `我的母框${mineCount > 0 ? ` ${mineCount}` : ''}` },
          ]}
        />
        <div className="flex flex-wrap gap-2.5">
          <Segmented<0 | Freq>
            ariaLabel="频率"
            value={filters.freq}
            onChange={(freq) => patch({ freq })}
            options={[{ value: 0, label: '全部频率' }, ...FREQS.map((f) => ({ value: f, label: FREQ_LABELS[f] }))]}
          />
          <Segmented<LibraryStatus | 'all'>
            ariaLabel="状态"
            value={filters.status}
            onChange={(status) => patch({ status })}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'new', label: STATUS_LABELS.new },
              { value: 'learning', label: STATUS_LABELS.learning },
              { value: 'mastered', label: STATUS_LABELS.mastered },
            ]}
          />
        </div>
      </div>

      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400" aria-live="polite" data-testid="library-count">
        共 {filtered.length} 条
      </p>
      {filtered.length === 0 ? (
        <EmptyState
          title="没有符合条件的内容"
          description={filters.kind === 'mine' ? '你还没有自建或 AI 生成的母框，点右上角让 AI 按主题生成一个。' : '换个筛选条件试试。'}
          action={
            filtering ? (
              <Button
                onClick={() => {
                  setFilters(NO_FILTERS);
                  setCatsOpen(true);
                }}
              >
                清除筛选
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {filtered.map((r) => (
            <Row key={r.key} row={r} />
          ))}
        </ul>
      )}

      <GenerateFrameSheet
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onSaved={(f) => {
          setAiOpen(false);
          void navigate(`/frames/${f.id}`);
        }}
      />
    </>
  );
}
