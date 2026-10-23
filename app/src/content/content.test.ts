import { describe, expect, it } from 'vitest';
import type { Chunk, Freq, FunctionCategory, GrammarPoint, ItemRef, Level, Scene, SubstitutionFrame } from '../types';
import { FUNCTION_CATEGORIES, TRANSFORM_OPS } from '../lib/labels';
import { CHUNKS, CURRICULUM, DOZEN, SEED_FRAMES, getChunk, getDozen, getItem, getSeedFrame } from './index';

const GRAMMAR_POINTS: GrammarPoint[] = [
  'be-adj',
  'possessive',
  'double-object',
  'object-pronoun',
  'third-person-s',
  'pronoun-order',
  'question-inversion',
  'plural',
  'modal-must',
  'want-to',
  'going-to',
  'negation-modal',
  'present-perfect',
];
const LEVELS: Level[] = ['dummy', 'daily', 'work'];
const SCENES: Scene[] = ['daily', 'work', 'travel', 'social', 'study'];
const FREQS: Freq[] = [1, 2, 3];
const REGISTERS: Chunk['register'][] = ['casual', 'neutral', 'formal'];
const CHUNK_COUNT = 250;
const MIN_FRAMES = 150;
const MIN_PER_CATEGORY = 8;

const blank = (s: unknown): boolean => typeof s !== 'string' || s.trim() === '';

/** Fails with the whole list of problems, so one run shows every offending id. */
function expectNoProblems(problems: string[]): void {
  expect(problems, problems.join('\n')).toEqual([]);
}

/** Every `{key}` occurrence in a pattern, in order. */
function placeholders(pattern: string): string[] {
  return [...pattern.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
}

describe('Deconstruction Dozen content', () => {
  it('has exactly 13 sentences with orders 1..13 and ids d01..d13', () => {
    expect(DOZEN, 'DOZEN must contain exactly 13 sentences').toHaveLength(13);
    expect(DOZEN.map((d) => d.order)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    expect(DOZEN.map((d) => d.id)).toEqual(
      Array.from({ length: 13 }, (_, i) => `d${String(i + 1).padStart(2, '0')}`),
    );
    expect(new Set(DOZEN.map((d) => d.id)).size, 'dozen ids must be unique').toBe(13);
  });

  it('id and order agree (dNN has order NN)', () => {
    expectNoProblems(
      DOZEN.filter((d) => d.id !== `d${String(d.order).padStart(2, '0')}`).map(
        (d) => `${d.id}: id does not match order ${d.order}`,
      ),
    );
  });

  it('getDozen finds every sentence and returns undefined otherwise', () => {
    for (const d of DOZEN) expect(getDozen(d.id), d.id).toBe(d);
    expect(getDozen('nope')).toBeUndefined();
  });

  it('every sentence has text, translation, focus and valid grammar points', () => {
    const problems: string[] = [];
    for (const d of DOZEN) {
      if (blank(d.en)) problems.push(`${d.id}: en is empty`);
      if (blank(d.zh)) problems.push(`${d.id}: zh is empty`);
      if (blank(d.focusZh)) problems.push(`${d.id}: focusZh is empty`);
      if (d.grammar.length === 0) problems.push(`${d.id}: grammar is empty`);
      for (const g of d.grammar) {
        if (!GRAMMAR_POINTS.includes(g)) problems.push(`${d.id}: unknown grammar point "${g}"`);
      }
    }
    expectNoProblems(problems);
  });

  it('every sentence has at least 2 variants per level (dummy / daily / work)', () => {
    const problems: string[] = [];
    for (const d of DOZEN) {
      for (const level of LEVELS) {
        const n = d.variants.filter((v) => v.level === level).length;
        if (n < 2) problems.push(`${d.id}: only ${n} "${level}" variant(s), need at least 2`);
      }
      d.variants.forEach((v, i) => {
        if (!LEVELS.includes(v.level)) problems.push(`${d.id}: variants[${i}] has unknown level "${v.level}"`);
        if (blank(v.en)) problems.push(`${d.id}: variants[${i}].en is empty`);
        if (blank(v.zh)) problems.push(`${d.id}: variants[${i}].zh is empty`);
      });
    }
    expectNoProblems(problems);
  });

  it('every sentence has a non-empty alignment and trapsZh', () => {
    const problems: string[] = [];
    for (const d of DOZEN) {
      if (d.alignment.length === 0) problems.push(`${d.id}: alignment is empty`);
      d.alignment.forEach((t, i) => {
        if (blank(t.en)) problems.push(`${d.id}: alignment[${i}].en is empty`);
        if (blank(t.zh)) problems.push(`${d.id}: alignment[${i}].zh is empty`);
        if (blank(t.role)) problems.push(`${d.id}: alignment[${i}].role is empty`);
      });
      if (d.trapsZh.length === 0) problems.push(`${d.id}: trapsZh is empty`);
      d.trapsZh.forEach((t, i) => {
        if (blank(t)) problems.push(`${d.id}: trapsZh[${i}] is empty`);
      });
    }
    expectNoProblems(problems);
  });

  it('alignment covers the English sentence (every alignment token appears in en, in order)', () => {
    const problems: string[] = [];
    const clean = (s: string): string => s.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
    for (const d of DOZEN) {
      let rest = ` ${clean(d.en)} `;
      for (const t of d.alignment) {
        if (clean(t.en) === '') continue; // pure punctuation token such as "?"
        const w = ` ${clean(t.en)} `;
        const at = rest.indexOf(w);
        if (at < 0) {
          problems.push(`${d.id}: alignment token "${t.en}" not found (in order) in "${d.en}"`);
          break;
        }
        rest = rest.slice(at + w.length - 1);
      }
    }
    expectNoProblems(problems);
  });

  it('every frameIds entry exists in SEED_FRAMES', () => {
    const known = new Set(SEED_FRAMES.map((f) => f.id));
    const problems: string[] = [];
    for (const d of DOZEN) {
      if (d.frameIds.length === 0) problems.push(`${d.id}: frameIds is empty`);
      for (const id of d.frameIds) {
        if (!known.has(id)) problems.push(`${d.id}: frameIds references unknown frame "${id}"`);
      }
      if (new Set(d.frameIds).size !== d.frameIds.length) problems.push(`${d.id}: frameIds contains duplicates`);
    }
    expectNoProblems(problems);
  });
});

describe('Substitution frame content', () => {
  it('has at least 150 seed frames with unique ids', () => {
    expect(SEED_FRAMES.length, `need at least ${MIN_FRAMES} seed frames`).toBeGreaterThanOrEqual(MIN_FRAMES);
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const f of SEED_FRAMES) {
      if (seen.has(f.id)) dupes.push(`duplicate frame id "${f.id}"`);
      seen.add(f.id);
    }
    expectNoProblems(dupes);
  });

  it('frame metadata is valid', () => {
    const problems: string[] = [];
    for (const f of SEED_FRAMES) {
      if (blank(f.id)) problems.push('a frame has an empty id');
      if (blank(f.title)) problems.push(`${f.id}: title is empty`);
      if (!SCENES.includes(f.scene)) problems.push(`${f.id}: unknown scene "${f.scene}"`);
      if (![1, 2, 3].includes(f.level)) problems.push(`${f.id}: level must be 1, 2 or 3 (got ${String(f.level)})`);
      if (f.source !== 'seed') problems.push(`${f.id}: source must be "seed" (got "${f.source}")`);
      for (const g of f.grammar) {
        if (!GRAMMAR_POINTS.includes(g)) problems.push(`${f.id}: unknown grammar point "${g}"`);
      }
      if (f.tipZh !== undefined && blank(f.tipZh)) problems.push(`${f.id}: tipZh is present but empty`);
    }
    expectNoProblems(problems);
  });

  it('{key} placeholders in pattern and patternZh match the slot keys exactly (each once)', () => {
    const problems: string[] = [];
    for (const f of SEED_FRAMES) {
      const keys = f.slots.map((s) => s.key);
      if (new Set(keys).size !== keys.length) problems.push(`${f.id}: duplicate slot keys [${keys.join(', ')}]`);
      for (const k of keys) {
        if (blank(k)) problems.push(`${f.id}: a slot has an empty key`);
      }
      for (const [field, pattern] of [
        ['pattern', f.pattern],
        ['patternZh', f.patternZh],
      ] as const) {
        const found = placeholders(pattern);
        const counts = new Map<string, number>();
        for (const k of found) counts.set(k, (counts.get(k) ?? 0) + 1);
        for (const [k, n] of counts) {
          if (!keys.includes(k)) problems.push(`${f.id}: ${field} uses {${k}} but no slot has that key`);
          if (n > 1) problems.push(`${f.id}: ${field} uses {${k}} ${n} times, expected once`);
        }
        for (const k of keys) {
          if (!counts.has(k)) problems.push(`${f.id}: slot "${k}" is missing from ${field}`);
        }
      }
    }
    expectNoProblems(problems);
  });

  it('every slot has 3-6 options with non-empty en and zh', () => {
    const problems: string[] = [];
    for (const f of SEED_FRAMES) {
      if (f.slots.length === 0) problems.push(`${f.id}: has no slots`);
      for (const s of f.slots) {
        if (blank(s.labelZh)) problems.push(`${f.id}.${s.key}: labelZh is empty`);
        const n = s.options.length;
        if (n < 3 || n > 6) problems.push(`${f.id}.${s.key}: has ${n} options, need 3-6`);
        s.options.forEach((o, i) => {
          if (blank(o.en)) problems.push(`${f.id}.${s.key}.options[${i}]: en is empty`);
          if (blank(o.zh)) problems.push(`${f.id}.${s.key}.options[${i}]: zh is empty`);
        });
        const ens = s.options.map((o) => o.en.trim().toLowerCase());
        if (new Set(ens).size !== ens.length) problems.push(`${f.id}.${s.key}: duplicate English options`);
      }
    }
    expectNoProblems(problems);
  });

  it('every frame has 2-3 complete examples', () => {
    const problems: string[] = [];
    for (const f of SEED_FRAMES) {
      const n = f.examples.length;
      if (n < 2 || n > 3) problems.push(`${f.id}: has ${n} examples, need 2-3`);
      f.examples.forEach((e, i) => {
        if (blank(e.en)) problems.push(`${f.id}.examples[${i}]: en is empty`);
        if (blank(e.zh)) problems.push(`${f.id}.examples[${i}]: zh is empty`);
      });
    }
    expectNoProblems(problems);
  });

  it('every seed frame has a valid category and freq', () => {
    const problems: string[] = [];
    for (const f of SEED_FRAMES) {
      if (f.category === undefined) problems.push(`${f.id}: category is missing`);
      else if (!FUNCTION_CATEGORIES.includes(f.category)) problems.push(`${f.id}: unknown category "${f.category}"`);
      if (f.freq === undefined) problems.push(`${f.id}: freq is missing`);
      else if (!FREQS.includes(f.freq)) problems.push(`${f.id}: freq must be 1, 2 or 3 (got ${String(f.freq)})`);
      if (f.soundZh !== undefined && blank(f.soundZh)) problems.push(`${f.id}: soundZh is present but empty`);
    }
    expectNoProblems(problems);
  });

  it('the scene and level spread is wide enough (all 3 levels, several scenes)', () => {
    const levels = new Set(SEED_FRAMES.map((f) => f.level));
    const scenes = new Set(SEED_FRAMES.map((f) => f.scene));
    expect([...levels].sort(), 'seed frames must include levels 1, 2 and 3').toEqual([1, 2, 3]);
    expect(scenes.size, `only scenes [${[...scenes].join(', ')}] used`).toBeGreaterThanOrEqual(3);
  });
});

// ---------- Chunk library ----------

/** Lowercase, straight quotes, no trailing punctuation or open-ended marker (" …", "...", " …?"). */
function chunkCore(en: string): string {
  return en
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[\s.!?,;:…]+$/, '')
    .trim();
}

function sentenceKey(en: string): string {
  return en
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('Chunk content', () => {
  it(`has exactly ${CHUNK_COUNT} chunks with contiguous unique ids c001..c250`, () => {
    expect(CHUNKS, `CHUNKS has ${CHUNKS.length} entries, expected ${CHUNK_COUNT}`).toHaveLength(CHUNK_COUNT);
    const expected = Array.from({ length: CHUNK_COUNT }, (_, i) => `c${String(i + 1).padStart(3, '0')}`);
    const have = new Set(CHUNKS.map((c) => c.id));
    const missing = expected.filter((id) => !have.has(id));
    const extra = CHUNKS.map((c) => c.id).filter((id) => !expected.includes(id));
    const seen = new Set<string>();
    const dupes = CHUNKS.map((c) => c.id).filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
    expectNoProblems([
      ...missing.map((id) => `missing chunk ${id}`),
      ...extra.map((id) => `unexpected chunk id "${id}"`),
      ...dupes.map((id) => `duplicate chunk id ${id}`),
    ]);
    expect(CHUNKS.map((c) => c.id), 'CHUNKS must be sorted by id').toEqual(expected);
  });

  it('every chunk has valid category, freq, register and text', () => {
    const problems: string[] = [];
    for (const c of CHUNKS) {
      if (!FUNCTION_CATEGORIES.includes(c.category)) problems.push(`${c.id}: unknown category "${String(c.category)}"`);
      if (!FREQS.includes(c.freq)) problems.push(`${c.id}: freq must be 1, 2 or 3 (got ${String(c.freq)})`);
      if (!REGISTERS.includes(c.register)) problems.push(`${c.id}: unknown register "${String(c.register)}"`);
      if (blank(c.en)) problems.push(`${c.id}: en is empty`);
      else if (chunkCore(c.en) === '') problems.push(`${c.id}: en "${c.en}" has no words`);
      if (blank(c.zh)) problems.push(`${c.id}: zh is empty`);
      if (blank(c.noteZh)) problems.push(`${c.id}: noteZh is missing`);
      if (c.soundZh !== undefined && blank(c.soundZh)) problems.push(`${c.id}: soundZh is present but empty`);
    }
    expectNoProblems(problems);
  });

  it('every chunk has 2 examples whose en contains the chunk verbatim', () => {
    const problems: string[] = [];
    for (const c of CHUNKS) {
      if (c.examples.length !== 2) problems.push(`${c.id}: has ${c.examples.length} examples, need exactly 2`);
      const core = chunkCore(c.en);
      c.examples.forEach((e, i) => {
        if (blank(e.en)) problems.push(`${c.id}.examples[${i}]: en is empty`);
        if (blank(e.zh)) problems.push(`${c.id}.examples[${i}]: zh is empty`);
        const hay = e.en.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
        if (core !== '' && !hay.includes(core)) {
          problems.push(`${c.id}.examples[${i}]: en "${e.en}" does not contain the chunk "${c.en}"`);
        }
      });
    }
    expectNoProblems(problems);
  });

  it('no two chunks share the same en (case / punctuation insensitive)', () => {
    const owner = new Map<string, string>();
    const problems: string[] = [];
    for (const c of CHUNKS) {
      const k = sentenceKey(c.en);
      const first = owner.get(k);
      if (first !== undefined) problems.push(`${c.id} duplicates ${first}: "${c.en}"`);
      else owner.set(k, c.id);
    }
    expectNoProblems(problems);
  });

  it('getChunk / getSeedFrame / getItem resolve content', () => {
    for (const c of CHUNKS) {
      expect(getChunk(c.id), c.id).toBe(c);
      expect(getItem({ kind: 'chunk', id: c.id }), c.id).toEqual({ kind: 'chunk', chunk: c });
    }
    for (const f of SEED_FRAMES) {
      expect(getSeedFrame(f.id), f.id).toBe(f);
      expect(getItem({ kind: 'frame', id: f.id }), f.id).toEqual({ kind: 'frame', frame: f });
    }
    expect(getChunk('nope')).toBeUndefined();
    expect(getSeedFrame('nope')).toBeUndefined();
    expect(getItem({ kind: 'chunk', id: 'nope' })).toBeUndefined();
    expect(getItem({ kind: 'frame', id: 'nope' })).toBeUndefined();
    // kinds do not mix: a chunk id is not a frame id
    expect(getItem({ kind: 'frame', id: 'c001' })).toBeUndefined();
    expect(getItem({ kind: 'chunk', id: 'f001' })).toBeUndefined();
  });

  it('getItem also finds user frames when they are passed in', () => {
    const user = { ...SEED_FRAMES[0], id: 'u-123', source: 'user' } as SubstitutionFrame;
    expect(getItem({ kind: 'frame', id: 'u-123' })).toBeUndefined();
    expect(getItem({ kind: 'frame', id: 'u-123' }, [user])).toEqual({ kind: 'frame', frame: user });
    // seed frames win over a user frame with the same id
    expect(getItem({ kind: 'frame', id: SEED_FRAMES[0].id }, [{ ...user, id: SEED_FRAMES[0].id }])).toEqual({
      kind: 'frame',
      frame: SEED_FRAMES[0],
    });
  });
});

describe('Library balance', () => {
  it(`every function category has at least ${MIN_PER_CATEGORY} items (frames + chunks)`, () => {
    const count = new Map<FunctionCategory, { chunks: number; frames: number }>();
    for (const c of FUNCTION_CATEGORIES) count.set(c, { chunks: 0, frames: 0 });
    for (const c of CHUNKS) {
      const n = count.get(c.category);
      if (n) n.chunks++;
    }
    for (const f of SEED_FRAMES) {
      const n = f.category ? count.get(f.category) : undefined;
      if (n) n.frames++;
    }
    const problems: string[] = [];
    for (const [cat, n] of count) {
      if (n.chunks + n.frames < MIN_PER_CATEGORY) {
        problems.push(`category "${cat}" has only ${n.chunks} chunks + ${n.frames} frames, need ${MIN_PER_CATEGORY}`);
      }
    }
    expectNoProblems(problems);
  });
});

describe('Dozen transforms (decode track)', () => {
  it('every sentence has at least 5 transforms with non-empty fields', () => {
    const problems: string[] = [];
    for (const d of DOZEN) {
      const ts = d.transforms ?? [];
      if (ts.length < 5) problems.push(`${d.id}: has ${ts.length} transforms, need at least 5`);
      ts.forEach((t, i) => {
        const at = `${d.id}.transforms[${i}]`;
        if (!TRANSFORM_OPS.includes(t.op)) problems.push(`${at}: unknown op "${String(t.op)}"`);
        if (blank(t.instructionZh)) problems.push(`${at}: instructionZh is empty`);
        if (blank(t.from)) problems.push(`${at}: from is empty`);
        if (blank(t.to)) problems.push(`${at}: to is empty`);
        (t.alt ?? []).forEach((a, j) => {
          if (blank(a)) problems.push(`${at}.alt[${j}] is empty`);
        });
        if (t.noteZh !== undefined && blank(t.noteZh)) problems.push(`${at}: noteZh is present but empty`);
      });
    }
    expectNoProblems(problems);
  });

  it('every transform starts from the base sentence or one of its variants', () => {
    const problems: string[] = [];
    for (const d of DOZEN) {
      const sources = new Set([d.en, ...d.variants.map((v) => v.en)]);
      (d.transforms ?? []).forEach((t, i) => {
        if (!sources.has(t.from)) {
          problems.push(`${d.id}.transforms[${i}] (${t.op}): from "${t.from}" is neither the base sentence nor a variant`);
        }
        if (t.from === t.to) problems.push(`${d.id}.transforms[${i}] (${t.op}): to equals from "${t.to}"`);
      });
    }
    expectNoProblems(problems);
  });

  it('every TransformOp is used somewhere', () => {
    const used = new Set(DOZEN.flatMap((d) => (d.transforms ?? []).map((t) => t.op)));
    expectNoProblems(TRANSFORM_OPS.filter((op) => !used.has(op)).map((op) => `no transform uses op "${op}"`));
  });
});

describe('CURRICULUM', () => {
  it('covers every seed chunk and frame exactly once', () => {
    const key = (r: ItemRef): string => `${r.kind}:${r.id}`;
    const seen = new Map<string, number>();
    for (const r of CURRICULUM) seen.set(key(r), (seen.get(key(r)) ?? 0) + 1);
    const problems: string[] = [];
    for (const c of CHUNKS) if (!seen.has(`chunk:${c.id}`)) problems.push(`chunk ${c.id} is missing from CURRICULUM`);
    for (const f of SEED_FRAMES) if (!seen.has(`frame:${f.id}`)) problems.push(`frame ${f.id} is missing from CURRICULUM`);
    for (const [k, n] of seen) if (n > 1) problems.push(`${k} appears ${n} times in CURRICULUM`);
    const known = new Set([...CHUNKS.map((c) => `chunk:${c.id}`), ...SEED_FRAMES.map((f) => `frame:${f.id}`)]);
    for (const k of seen.keys()) if (!known.has(k)) problems.push(`CURRICULUM has unknown item ${k}`);
    expectNoProblems(problems);
    expect(CURRICULUM).toHaveLength(CHUNKS.length + SEED_FRAMES.length);
  });

  it('every curriculum item resolves via getItem', () => {
    expectNoProblems(CURRICULUM.filter((r) => getItem(r) === undefined).map((r) => `${r.kind}:${r.id} does not resolve`));
  });
});
