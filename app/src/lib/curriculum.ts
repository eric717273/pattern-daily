import type { Chunk, Freq, FunctionCategory, ItemRef, SubstitutionFrame } from '../types';
import { FUNCTION_CATEGORIES } from './labels';

/** Per repeating block of 5 items: 3 chunks then 2 frames. */
const KIND_PATTERN: ('chunk' | 'frame')[] = ['chunk', 'chunk', 'frame', 'chunk', 'frame'];
/** How far down a queue we look for an item whose category differs from the recently placed ones. */
const LOOKAHEAD = 6;
/** ...and from how many of the most recently placed items. */
const AVOID_RECENT = 3;
const DEFAULT_FREQ: Freq = 2;

function freqOf(f: Freq | undefined): Freq {
  return f === 1 || f === 2 || f === 3 ? f : DEFAULT_FREQ;
}

interface Entry {
  ref: ItemRef;
  category: FunctionCategory | '';
  level: number;
}

function byId(a: Entry, b: Entry): number {
  return a.ref.id < b.ref.id ? -1 : a.ref.id > b.ref.id ? 1 : 0;
}

/**
 * Round-robin over categories: one item from each category in turn (categories in FUNCTION_CATEGORIES order,
 * unknown ones last), so consecutive items differ in function until a category runs out.
 */
function interleave(entries: Entry[]): Entry[] {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const list = groups.get(e.category);
    if (list) list.push(e);
    else groups.set(e.category, [e]);
  }
  const order = (c: string): number => {
    const i = FUNCTION_CATEGORIES.indexOf(c as FunctionCategory);
    return i < 0 ? FUNCTION_CATEGORIES.length : i;
  };
  const lists = [...groups.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, list]) => list);
  const out: Entry[] = [];
  for (let round = 0; out.length < entries.length; round++) {
    for (const list of lists) if (round < list.length) out.push(list[round]);
  }
  return out;
}

/**
 * Pops the next entry from a queue. Prefers one (within LOOKAHEAD) whose category differs from the last
 * AVOID_RECENT items already placed, then one that merely differs from the previous item, then the head.
 */
function take(queue: Entry[], placed: Entry[]): Entry {
  const recent = placed.slice(-AVOID_RECENT).map((e) => e.category);
  const prev = recent[recent.length - 1];
  const limit = Math.min(queue.length, LOOKAHEAD);
  let at = -1;
  for (let i = 0; i < limit && at < 0; i++) {
    if (queue[i].category === '' || !recent.includes(queue[i].category)) at = i;
  }
  for (let i = 0; i < limit && at < 0; i++) {
    if (queue[i].category === '' || queue[i].category !== prev) at = i;
  }
  return queue.splice(at < 0 ? 0 : at, 1)[0];
}

/** Merge the chunk and frame queues of one frequency band in a 3:2 chunk:frame rhythm. */
function mergeBand(chunks: Entry[], frames: Entry[]): Entry[] {
  const out: Entry[] = [];
  let step = 0;
  while (chunks.length > 0 || frames.length > 0) {
    let kind = KIND_PATTERN[step % KIND_PATTERN.length];
    step++;
    if (kind === 'chunk' && chunks.length === 0) kind = 'frame';
    else if (kind === 'frame' && frames.length === 0) kind = 'chunk';
    out.push(take(kind === 'chunk' ? chunks : frames, out));
  }
  return out;
}

/**
 * The learning order of the chunk track. Pure and deterministic.
 * - Bands by frequency: freq 1 first, then 2, then 3 (items without freq count as 2).
 * - Inside a band, chunks and frames are each interleaved round-robin across function categories,
 *   then merged at about 3 chunks : 2 frames. Frames are ordered by `level` first (easier ones earlier).
 * - Every item appears exactly once.
 */
export function buildCurriculum(frames: SubstitutionFrame[], chunks: Chunk[]): ItemRef[] {
  const bands = new Map<Freq, { chunks: Entry[]; frames: Entry[] }>();
  const band = (f: Freq): { chunks: Entry[]; frames: Entry[] } => {
    let b = bands.get(f);
    if (!b) {
      b = { chunks: [], frames: [] };
      bands.set(f, b);
    }
    return b;
  };
  for (const c of chunks) {
    band(freqOf(c.freq)).chunks.push({ ref: { kind: 'chunk', id: c.id }, category: c.category ?? '', level: 0 });
  }
  for (const f of frames) {
    band(freqOf(f.freq)).frames.push({
      ref: { kind: 'frame', id: f.id },
      category: f.category ?? '',
      level: f.level,
    });
  }

  const out: ItemRef[] = [];
  for (const freq of [1, 2, 3] as Freq[]) {
    const b = bands.get(freq);
    if (!b) continue;
    const chunkQueue = interleave([...b.chunks].sort(byId));
    const frameQueue = interleave([...b.frames].sort((x, y) => x.level - y.level || byId(x, y)));
    for (const e of mergeBand(chunkQueue, frameQueue)) out.push(e.ref);
  }
  return out;
}
