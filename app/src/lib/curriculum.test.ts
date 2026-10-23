import { describe, expect, it } from 'vitest';
import type { Chunk, Freq, FunctionCategory, SubstitutionFrame } from '../types';
import { buildCurriculum } from './curriculum';
import { FUNCTION_CATEGORIES } from './labels';

function chunk(id: string, category: FunctionCategory, freq: Freq): Chunk {
  return { id, en: id, zh: id, category, freq, register: 'neutral', examples: [] };
}

function frame(id: string, category: FunctionCategory, freq: Freq, level: 1 | 2 | 3 = 1): SubstitutionFrame {
  return {
    id,
    title: id,
    pattern: '{x}.',
    patternZh: '{x}。',
    slots: [],
    grammar: [],
    scene: 'daily',
    level,
    examples: [],
    source: 'seed',
    category,
    freq,
  };
}

/** 250 chunks and 150 frames spread evenly over categories and the three bands (40/40/20). */
function library(): { chunks: Chunk[]; frames: SubstitutionFrame[] } {
  const freqAt = (i: number): Freq => (i % 10 < 4 ? 1 : i % 10 < 8 ? 2 : 3);
  const chunks = Array.from({ length: 250 }, (_, i) =>
    chunk(`c${String(i + 1).padStart(3, '0')}`, FUNCTION_CATEGORIES[i % 20], freqAt(Math.floor(i / 20) * 7 + i)),
  );
  const frames = Array.from({ length: 150 }, (_, i) =>
    frame(`f${String(i + 1).padStart(3, '0')}`, FUNCTION_CATEGORIES[(i * 3) % 20], freqAt(i + 3), ((i % 3) + 1) as 1 | 2 | 3),
  );
  return { chunks, frames };
}

const key = (r: { kind: string; id: string }): string => `${r.kind}:${r.id}`;

describe('buildCurriculum', () => {
  const { chunks, frames } = library();
  const cur = buildCurriculum(frames, chunks);
  const freqOf = new Map<string, Freq>([
    ...chunks.map((c): [string, Freq] => [`chunk:${c.id}`, c.freq]),
    ...frames.map((f): [string, Freq] => [`frame:${f.id}`, f.freq ?? 2]),
  ]);

  it('is deterministic and independent of input order', () => {
    expect(buildCurriculum(frames, chunks)).toEqual(cur);
    expect(buildCurriculum([...frames].reverse(), [...chunks].reverse())).toEqual(cur);
  });

  it('contains every item exactly once', () => {
    expect(cur).toHaveLength(chunks.length + frames.length);
    expect(new Set(cur.map(key)).size).toBe(cur.length);
    for (const c of chunks) expect(cur.some((r) => r.kind === 'chunk' && r.id === c.id)).toBe(true);
    for (const f of frames) expect(cur.some((r) => r.kind === 'frame' && r.id === f.id)).toBe(true);
  });

  it('orders by frequency band: 1, then 2, then 3', () => {
    const f = cur.map((r) => freqOf.get(key(r)) as Freq);
    expect([...f].sort((a, b) => a - b)).toEqual(f);
    expect(new Set(f)).toEqual(new Set([1, 2, 3]));
  });

  it('mixes chunks and frames at about 3:2 inside the first band', () => {
    const band1 = cur.filter((r) => freqOf.get(key(r)) === 1);
    const head = band1.slice(0, 50);
    const nChunks = head.filter((r) => r.kind === 'chunk').length;
    expect(nChunks).toBe(30);
    // never more than 3 chunks or 2 frames in a row
    let run = 0;
    let prev = '';
    let maxChunkRun = 0;
    let maxFrameRun = 0;
    for (const r of head) {
      run = r.kind === prev ? run + 1 : 1;
      prev = r.kind;
      if (r.kind === 'chunk') maxChunkRun = Math.max(maxChunkRun, run);
      else maxFrameRun = Math.max(maxFrameRun, run);
    }
    expect(maxChunkRun).toBeLessThanOrEqual(3);
    expect(maxFrameRun).toBeLessThanOrEqual(1);
  });

  it('interleaves categories: the first days cover many functions', () => {
    const catOf = new Map<string, FunctionCategory>([
      ...chunks.map((c): [string, FunctionCategory] => [key({ kind: 'chunk', id: c.id }), c.category]),
      ...frames.map((f): [string, FunctionCategory] => [key({ kind: 'frame', id: f.id }), f.category as FunctionCategory]),
    ]);
    const first = cur.slice(0, 10).map((r) => catOf.get(key(r)));
    expect(new Set(first).size).toBeGreaterThanOrEqual(6);
    // within any window of 3 consecutive items of the first band, no category appears twice
    for (let i = 0; i + 3 <= 40; i++) {
      const w = cur.slice(i, i + 3).map((r) => catOf.get(key(r)));
      expect(new Set(w).size, `window at ${i}: ${w.join(',')}`).toBe(3);
    }
  });

  it('rarely puts two items of the same category back to back across the whole curriculum', () => {
    const catOf = new Map<string, FunctionCategory>([
      ...chunks.map((c): [string, FunctionCategory] => [key({ kind: 'chunk', id: c.id }), c.category]),
      ...frames.map((f): [string, FunctionCategory] => [key({ kind: 'frame', id: f.id }), f.category as FunctionCategory]),
    ]);
    let same = 0;
    for (let i = 1; i < cur.length; i++) if (catOf.get(key(cur[i])) === catOf.get(key(cur[i - 1]))) same++;
    expect(same / cur.length).toBeLessThan(0.05);
  });

  it('puts easier frames (lower level) first within a category', () => {
    const fs = [frame('f1', 'work', 1, 3), frame('f2', 'work', 1, 1), frame('f3', 'work', 1, 2)];
    expect(buildCurriculum(fs, []).map((r) => r.id)).toEqual(['f2', 'f3', 'f1']);
  });

  it('copes with empty input, a single kind, and items missing metadata', () => {
    expect(buildCurriculum([], [])).toEqual([]);
    const onlyChunks = [chunk('c1', 'greeting', 1), chunk('c2', 'response', 1)];
    expect(buildCurriculum([], onlyChunks).map(key)).toEqual(['chunk:c1', 'chunk:c2']);
    const bare = { ...frame('fx', 'work', 1), category: undefined, freq: undefined };
    const out = buildCurriculum([bare], [chunk('c1', 'greeting', 3)]);
    expect(out.map(key).sort()).toEqual(['chunk:c1', 'frame:fx']);
    expect(out[0].id).toBe('fx'); // freq-less items sit in the middle band, before freq 3
  });
});
