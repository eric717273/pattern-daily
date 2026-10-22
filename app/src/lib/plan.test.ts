import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DozenSentence, GrammarPoint, Scene, SubstitutionFrame } from '../types';

const GRAMMAR: GrammarPoint[] = [
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

// vi.mock is hoisted above the imports, so the synthetic content has to be built in vi.hoisted too.
const mocked = vi.hoisted(() => ({ dozen: [] as DozenSentence[] }));

vi.mock('../content', () => ({
  get DOZEN() {
    return mocked.dozen;
  },
  SEED_FRAMES: [],
  getDozen: (id: string) => mocked.dozen.find((d) => d.id === id),
}));

import { dayIndexFor, getDayPlan, todayStr } from './plan';

const SCENES: Scene[] = ['daily', 'work', 'travel', 'social', 'study'];

function makeDozen(frameIdsFor: (g: GrammarPoint) => string[] = () => []): DozenSentence[] {
  return GRAMMAR.map((g, i) => ({
    id: `d${String(i + 1).padStart(2, '0')}`,
    order: i + 1,
    en: `Sentence ${i + 1}.`,
    zh: `句子 ${i + 1}`,
    grammar: [g],
    focusZh: '',
    alignment: [],
    trapsZh: [],
    variants: [],
    frameIds: frameIdsFor(g),
  }));
}

function frame(id: string, grammar: GrammarPoint[], level: 1 | 2 | 3, scene: Scene): SubstitutionFrame {
  return {
    id,
    title: id,
    pattern: '{x}.',
    patternZh: '{x}。',
    slots: [{ key: 'x', labelZh: 'x', options: [] }],
    grammar,
    scene,
    level,
    examples: [],
    source: 'seed',
  };
}

/** `per` frames for each grammar point at each level, scenes cycling. Ids are f<grammar>-<level>-<n>. */
function bigFrameSet(per = 2): SubstitutionFrame[] {
  const out: SubstitutionFrame[] = [];
  let n = 0;
  for (const g of GRAMMAR) {
    for (const level of [1, 2, 3] as const) {
      for (let k = 0; k < per; k++) {
        out.push(frame(`f${String(++n).padStart(3, '0')}`, [g], level, SCENES[n % SCENES.length]));
      }
    }
  }
  return out;
}

beforeEach(() => {
  mocked.dozen = makeDozen();
});

describe('todayStr', () => {
  it('formats the local date as YYYY-MM-DD', () => {
    expect(todayStr(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(todayStr(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });
  it('uses local time, not UTC', () => {
    const d = new Date(2026, 5, 15, 0, 30); // 00:30 local
    expect(todayStr(d)).toBe('2026-06-15');
  });
  it('defaults to now', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('dayIndexFor', () => {
  it('is 1 on the start date and counts calendar days', () => {
    expect(dayIndexFor('2026-03-01', '2026-03-01')).toBe(1);
    expect(dayIndexFor('2026-03-01', '2026-03-02')).toBe(2);
    expect(dayIndexFor('2026-03-01', '2026-03-31')).toBe(31);
  });
  it('handles month, year and leap-day boundaries', () => {
    expect(dayIndexFor('2026-01-31', '2026-02-01')).toBe(2);
    expect(dayIndexFor('2025-12-31', '2026-01-01')).toBe(2);
    expect(dayIndexFor('2024-02-28', '2024-03-01')).toBe(3);
    expect(dayIndexFor('2026-01-01', '2027-01-01')).toBe(366);
  });
  it('is not affected by DST changes', () => {
    expect(dayIndexFor('2026-03-07', '2026-03-09')).toBe(3);
    expect(dayIndexFor('2026-10-30', '2026-11-02')).toBe(4);
  });
  it('never goes below 1', () => {
    expect(dayIndexFor('2026-03-10', '2026-03-01')).toBe(1);
    expect(dayIndexFor('garbage', '2026-03-01')).toBe(1);
  });
});

describe('getDayPlan: days 1-13', () => {
  it('teaches sentence #dayIndex and picks 2 frames sharing its grammar', () => {
    const frames = bigFrameSet();
    const byId = new Map(frames.map((f) => [f.id, f]));
    for (let day = 1; day <= 13; day++) {
      const plan = getDayPlan(day, frames);
      const sentence = mocked.dozen[day - 1];
      expect(plan.phase).toBe('deconstruct');
      expect(plan.dayIndex).toBe(day);
      expect(plan.dozenId).toBe(sentence.id);
      expect(plan.outputCount).toBe(3);
      expect(plan.frameIds).toHaveLength(2);
      expect(new Set(plan.frameIds).size).toBe(2);
      for (const id of plan.frameIds) {
        expect(byId.get(id)?.grammar.some((g) => sentence.grammar.includes(g))).toBe(true);
      }
    }
  });

  it('prefers frames listed in the dozen, then the lowest level', () => {
    const frames: SubstitutionFrame[] = [
      frame('a-low', ['be-adj'], 1, 'daily'),
      frame('b-mid', ['be-adj'], 2, 'daily'),
      frame('c-listed-high', ['be-adj'], 3, 'work'),
      frame('d-listed-low', ['be-adj'], 2, 'work'),
      frame('e-other', ['plural'], 1, 'daily'),
    ];
    mocked.dozen = makeDozen((g) => (g === 'be-adj' ? ['c-listed-high', 'd-listed-low'] : []));
    const plan = getDayPlan(1, frames);
    expect(plan.frameIds).toEqual(['c-listed-high', 'd-listed-low']);
  });

  it('falls back to lowest level when nothing is listed', () => {
    const frames = [
      frame('hi', ['be-adj'], 3, 'daily'),
      frame('lo', ['be-adj'], 1, 'daily'),
      frame('mid', ['be-adj'], 2, 'daily'),
    ];
    expect(getDayPlan(1, frames).frameIds).toEqual(['lo', 'mid']);
  });

  it('avoids frames already used on earlier days when alternatives exist', () => {
    // 'shared' fits both sentence 1 and sentence 2; day 2 should take a fresh one first.
    const frames = [
      frame('shared', ['be-adj', 'possessive'], 1, 'daily'),
      frame('only-be', ['be-adj'], 1, 'daily'),
      frame('only-poss-1', ['possessive'], 2, 'daily'),
      frame('only-poss-2', ['possessive'], 3, 'daily'),
    ];
    const d1 = getDayPlan(1, frames).frameIds;
    const d2 = getDayPlan(2, frames).frameIds;
    expect(d1).toEqual(['shared', 'only-be']);
    expect(d2).toEqual(['only-poss-1', 'only-poss-2']);
  });

  it('still returns frames if too few match the grammar', () => {
    const frames = [frame('x', ['plural'], 1, 'daily'), frame('y', ['plural'], 1, 'daily')];
    const plan = getDayPlan(1, frames);
    expect(plan.frameIds).toHaveLength(2);
  });

  it('copes with an empty frame list', () => {
    expect(getDayPlan(5, []).frameIds).toEqual([]);
    expect(getDayPlan(20, []).frameIds).toEqual([]);
    expect(getDayPlan(40, []).frameIds).toEqual([]);
  });
});

describe('getDayPlan: days 14-30', () => {
  it('gives 3 distinct frames and cycles the dozen for review', () => {
    const frames = bigFrameSet();
    const ids = new Set(mocked.dozen.map((d) => d.id));
    const reviewed: string[] = [];
    for (let day = 14; day <= 30; day++) {
      const plan = getDayPlan(day, frames);
      expect(plan.phase).toBe('frames');
      expect(plan.frameIds).toHaveLength(3);
      expect(new Set(plan.frameIds).size).toBe(3);
      expect(ids.has(plan.dozenId)).toBe(true);
      expect(plan.outputCount).toBe(3);
      reviewed.push(plan.dozenId);
    }
    // 17 days over 13 sentences: every sentence reviewed at least once, consecutive days differ.
    expect(new Set(reviewed).size).toBe(13);
    for (let i = 1; i < reviewed.length; i++) expect(reviewed[i]).not.toBe(reviewed[i - 1]);
  });

  it('excludes frames scheduled on days 1-13 when enough alternatives exist', () => {
    const frames = bigFrameSet(2); // 78 frames, 26 used in phase 1, 51 needed in phase 2
    const phase1 = new Set<string>();
    for (let day = 1; day <= 13; day++) getDayPlan(day, frames).frameIds.forEach((id) => phase1.add(id));
    const phase2: string[] = [];
    for (let day = 14; day <= 30; day++) phase2.push(...getDayPlan(day, frames).frameIds);
    expect(phase2.filter((id) => phase1.has(id))).toEqual([]);
    expect(new Set(phase2).size).toBe(phase2.length);
  });

  it('advances through levels 1 -> 3', () => {
    const frames = bigFrameSet(3);
    const level = new Map(frames.map((f) => [f.id, f.level]));
    const avg = (from: number, to: number): number => {
      const ls: number[] = [];
      for (let d = from; d <= to; d++) getDayPlan(d, frames).frameIds.forEach((id) => ls.push(level.get(id) ?? 0));
      return ls.reduce((a, b) => a + b, 0) / ls.length;
    };
    const early = avg(14, 19);
    const mid = avg(20, 25);
    const late = avg(26, 30);
    expect(early).toBeLessThan(mid);
    expect(mid).toBeLessThan(late);
    expect(late).toBeGreaterThanOrEqual(2.5);
  });

  it('rotates scenes', () => {
    const frames = bigFrameSet(3);
    const scene = new Map(frames.map((f) => [f.id, f.scene]));
    const seen = new Set<Scene>();
    for (let d = 14; d <= 18; d++) getDayPlan(d, frames).frameIds.forEach((id) => seen.add(scene.get(id) as Scene));
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('works with a small frame list (reuses frames, never duplicates within a day)', () => {
    const frames = [
      frame('a', ['be-adj'], 1, 'daily'),
      frame('b', ['be-adj'], 2, 'work'),
      frame('c', ['plural'], 3, 'travel'),
      frame('d', ['plural'], 1, 'daily'),
    ];
    for (let day = 14; day <= 30; day++) {
      const plan = getDayPlan(day, frames);
      expect(plan.frameIds).toHaveLength(3);
      expect(new Set(plan.frameIds).size).toBe(3);
    }
  });

  it('includes user-created frames', () => {
    const frames = bigFrameSet(1);
    const user: SubstitutionFrame = { ...frame('u-1', ['be-adj'], 1, 'daily'), source: 'user' };
    const withUser = [...frames, user];
    const all = new Set<string>();
    for (let d = 1; d <= 30; d++) getDayPlan(d, withUser).frameIds.forEach((id) => all.add(id));
    expect(all.has('u-1')).toBe(true);
  });
});

describe('getDayPlan: day 31+', () => {
  it('is maintenance, 3 frames a day, rotating through all frames', () => {
    const frames = bigFrameSet(1); // 39 frames
    const seen = new Set<string>();
    for (let day = 31; day < 31 + 13; day++) {
      const plan = getDayPlan(day, frames);
      expect(plan.phase).toBe('maintenance');
      expect(plan.frameIds).toHaveLength(3);
      expect(new Set(plan.frameIds).size).toBe(3);
      plan.frameIds.forEach((id) => seen.add(id));
    }
    expect(seen.size).toBe(frames.length); // 13 days x 3 = 39 frames, each exactly once
  });

  it('cycles the dozen and wraps around after a full rotation', () => {
    const frames = bigFrameSet(1);
    const dozens = new Set<string>();
    for (let day = 31; day < 44; day++) dozens.add(getDayPlan(day, frames).dozenId);
    expect(dozens.size).toBe(13);
    expect(getDayPlan(31, frames).frameIds).toEqual(getDayPlan(31 + 13, frames).frameIds);
  });

  it('continues the dozen cycle from day 30', () => {
    const frames = bigFrameSet(1);
    const d30 = mocked.dozen.findIndex((d) => d.id === getDayPlan(30, frames).dozenId);
    const d31 = mocked.dozen.findIndex((d) => d.id === getDayPlan(31, frames).dozenId);
    expect(d31).toBe((d30 + 1) % 13);
  });

  it('handles fewer than 3 frames', () => {
    const plan = getDayPlan(35, [frame('only', ['be-adj'], 1, 'daily')]);
    expect(plan.frameIds).toEqual(['only']);
  });
});

describe('getDayPlan: general', () => {
  it('is deterministic', () => {
    const frames = bigFrameSet();
    for (const day of [1, 7, 13, 14, 22, 30, 31, 100]) {
      expect(getDayPlan(day, frames)).toEqual(getDayPlan(day, frames));
      expect(getDayPlan(day, frames)).toEqual(getDayPlan(day, [...frames]));
    }
  });

  it('clamps day indexes below 1', () => {
    const frames = bigFrameSet();
    expect(getDayPlan(0, frames)).toEqual(getDayPlan(1, frames));
    expect(getDayPlan(-5, frames).dayIndex).toBe(1);
  });

  it('does not mutate the frame list', () => {
    const frames = bigFrameSet();
    const copy = JSON.stringify(frames);
    getDayPlan(20, frames);
    expect(JSON.stringify(frames)).toBe(copy);
  });

  it('uses the sentence that has order == dayIndex, not the array position', () => {
    mocked.dozen = [...makeDozen()].reverse();
    expect(getDayPlan(3, bigFrameSet()).dozenId).toBe('d03');
  });
});
