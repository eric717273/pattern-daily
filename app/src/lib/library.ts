import type { CardState, Chunk, Freq, FunctionCategory, SubstitutionFrame } from '../types';

/** Pure data helpers of the library page (语块库): rows, status and filtering. */

export const MASTERED_DAYS = 21;

/** 未学 (no card) / 学习中 (interval < 21 days) / 已掌握 (interval >= 21 days). */
export type LibraryStatus = 'new' | 'learning' | 'mastered';

export function statusOf(card: CardState | undefined): LibraryStatus {
  if (!card) return 'new';
  return card.interval >= MASTERED_DAYS ? 'mastered' : 'learning';
}

export const STATUS_LABELS: Record<LibraryStatus, string> = {
  new: '未学',
  learning: '学习中',
  mastered: '已掌握',
};

export interface LibraryRow {
  /** Card id: 'chunk:c001' | 'frame:f001'. */
  key: string;
  kind: 'chunk' | 'frame';
  id: string;
  category?: FunctionCategory;
  freq?: Freq;
  status: LibraryStatus;
  /** Created by the learner or the AI (not a built-in frame). */
  mine: boolean;
  chunk?: Chunk;
  frame?: SubstitutionFrame;
  /** Lower-cased text the search box looks into. */
  haystack: string;
}

export function buildRows(
  chunks: readonly Chunk[],
  frames: readonly SubstitutionFrame[],
  cards: ReadonlyMap<string, CardState> | undefined,
): LibraryRow[] {
  const rows: LibraryRow[] = [];
  for (const c of chunks) {
    const key = `chunk:${c.id}`;
    rows.push({
      key,
      kind: 'chunk',
      id: c.id,
      category: c.category,
      freq: c.freq,
      status: statusOf(cards?.get(key)),
      mine: false,
      chunk: c,
      haystack: `${c.en}\n${c.zh}`.toLowerCase(),
    });
  }
  for (const f of frames) {
    const key = `frame:${f.id}`;
    rows.push({
      key,
      kind: 'frame',
      id: f.id,
      category: f.category,
      freq: f.freq,
      status: statusOf(cards?.get(key)),
      mine: f.source !== 'seed',
      frame: f,
      haystack: `${f.title}\n${f.pattern}\n${f.patternZh}`.toLowerCase(),
    });
  }
  return rows;
}

/** 全部 / 固定表达 / 母框 / 我的母框 (frames made by the learner or the AI). */
export type KindFilter = 'all' | 'chunk' | 'frame' | 'mine';

export interface LibraryFilters {
  category: FunctionCategory | 'all';
  kind: KindFilter;
  /** 0 = every frequency band. */
  freq: 0 | Freq;
  status: LibraryStatus | 'all';
  query: string;
}

export const NO_FILTERS: LibraryFilters = { category: 'all', kind: 'all', freq: 0, status: 'all', query: '' };

export function filterRows(rows: readonly LibraryRow[], f: LibraryFilters): LibraryRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.kind === 'chunk' && r.kind !== 'chunk') return false;
    if (f.kind === 'frame' && r.kind !== 'frame') return false;
    if (f.kind === 'mine' && !r.mine) return false;
    if (f.category !== 'all' && r.category !== f.category) return false;
    if (f.freq !== 0 && r.freq !== f.freq) return false;
    if (f.status !== 'all' && r.status !== f.status) return false;
    return q === '' || r.haystack.includes(q);
  });
}
