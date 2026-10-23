import { describe, expect, it } from 'vitest';
import type { GrammarPoint, Level, Scene } from '../types';
import { DOZEN, SEED_FRAMES, getDozen } from './index';

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
  it('has at least 100 seed frames with unique ids', () => {
    expect(SEED_FRAMES.length, 'need at least 100 seed frames').toBeGreaterThanOrEqual(100);
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
      if (f.grammar.length === 0) problems.push(`${f.id}: grammar is empty`);
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

  it('every GrammarPoint is covered by at least 2 frames', () => {
    const problems: string[] = [];
    for (const g of GRAMMAR_POINTS) {
      const ids = SEED_FRAMES.filter((f) => f.grammar.includes(g)).map((f) => f.id);
      if (ids.length < 2) problems.push(`grammar "${g}" is covered by ${ids.length} frame(s) [${ids.join(', ')}], need 2`);
    }
    expectNoProblems(problems);
  });

  it('every dozen sentence has at least 2 frames matching its grammar', () => {
    const problems: string[] = [];
    for (const d of DOZEN) {
      const n = SEED_FRAMES.filter((f) => f.grammar.some((g) => d.grammar.includes(g))).length;
      if (n < 2) problems.push(`${d.id}: only ${n} frame(s) share its grammar [${d.grammar.join(', ')}]`);
    }
    expectNoProblems(problems);
  });

  it('the scene and level spread supports the 30-day plan (all 3 levels, several scenes)', () => {
    const levels = new Set(SEED_FRAMES.map((f) => f.level));
    const scenes = new Set(SEED_FRAMES.map((f) => f.scene));
    expect([...levels].sort(), 'seed frames must include levels 1, 2 and 3').toEqual([1, 2, 3]);
    expect(scenes.size, `only scenes [${[...scenes].join(', ')}] used`).toBeGreaterThanOrEqual(3);
  });
});
