import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DozenSentence, ItemRef } from '../types';

// vi.mock is hoisted above the imports, so the synthetic content has to be built in vi.hoisted too.
const mocked = vi.hoisted(() => ({ dozen: [] as DozenSentence[] }));

vi.mock('../content', () => ({
  get DOZEN() {
    return mocked.dozen;
  },
}));

import { clampNewPerDay, dayIndexFor, getDayPlan, itemKey, todayStr } from './plan';

function makeDozen(): DozenSentence[] {
  return Array.from({ length: 13 }, (_, i) => ({
    id: `d${String(i + 1).padStart(2, '0')}`,
    order: i + 1,
    en: `Sentence ${i + 1}.`,
    zh: `句子 ${i + 1}`,
    grammar: ['be-adj'],
    focusZh: '',
    alignment: [],
    trapsZh: [],
    variants: [],
    frameIds: [],
    transforms: [],
  }));
}

/** 30 items: c01..c18 and f01..f12 alternating roughly 3:2. */
function curriculum(n = 30): ItemRef[] {
  const out: ItemRef[] = [];
  let c = 0;
  let f = 0;
  for (let i = 0; i < n; i++) {
    const frame = i % 5 === 2 || i % 5 === 4;
    out.push(frame ? { kind: 'frame', id: `f${String(++f).padStart(2, '0')}` } : { kind: 'chunk', id: `c${String(++c).padStart(2, '0')}` });
  }
  return out;
}

const none = new Set<string>();

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

describe('getDayPlan: decode track', () => {
  it('days 1-13 learn skeleton #dayIndex', () => {
    for (let day = 1; day <= 13; day++) {
      const plan = getDayPlan({ dayIndex: day, introduced: none, curriculum: curriculum(), newPerDay: 5 });
      expect(plan.dayIndex).toBe(day);
      expect(plan.decode).toEqual({ phase: 'foundation', dozenId: `d${String(day).padStart(2, '0')}` });
      expect(plan.outputCount).toBe(3);
    }
  });

  it('day 14+ maintains, rotating d01..d13 and alternating transform / label', () => {
    const decode = (day: number) => getDayPlan({ dayIndex: day, introduced: none, curriculum: [], newPerDay: 5 }).decode;
    expect(decode(14)).toEqual({ phase: 'maintenance', dozenId: 'd01', mode: 'transform' });
    expect(decode(15)).toEqual({ phase: 'maintenance', dozenId: 'd02', mode: 'label' });
    expect(decode(16)).toEqual({ phase: 'maintenance', dozenId: 'd03', mode: 'transform' });
    expect(decode(26)).toEqual({ phase: 'maintenance', dozenId: 'd13', mode: 'transform' });
    expect(decode(27)).toEqual({ phase: 'maintenance', dozenId: 'd01', mode: 'label' });
    // every skeleton is revisited, and both modes are used, over a long run
    const days = Array.from({ length: 60 }, (_, k) => decode(14 + k));
    expect(new Set(days.map((d) => d.dozenId)).size).toBe(13);
    expect(new Set(days.map((d) => ('mode' in d ? d.mode : ''))).size).toBe(2);
  });

  it('is independent of the chunk track', () => {
    const a = getDayPlan({ dayIndex: 20, introduced: none, curriculum: curriculum(), newPerDay: 3 });
    const b = getDayPlan({ dayIndex: 20, introduced: new Set(['chunk:c01']), curriculum: [], newPerDay: 10 });
    expect(a.decode).toEqual(b.decode);
  });

  it('sanitises the day index', () => {
    expect(getDayPlan({ dayIndex: 0, introduced: none, curriculum: [], newPerDay: 5 }).dayIndex).toBe(1);
    expect(getDayPlan({ dayIndex: -4, introduced: none, curriculum: [], newPerDay: 5 }).decode.phase).toBe('foundation');
    expect(getDayPlan({ dayIndex: 3.9, introduced: none, curriculum: [], newPerDay: 5 }).dayIndex).toBe(3);
    expect(getDayPlan({ dayIndex: Number.NaN, introduced: none, curriculum: [], newPerDay: 5 }).dayIndex).toBe(1);
  });

  it('falls back to canonical ids when the dozen content is unavailable', () => {
    mocked.dozen = [];
    expect(getDayPlan({ dayIndex: 4, introduced: none, curriculum: [], newPerDay: 5 }).decode).toMatchObject({ dozenId: 'd04' });
  });
});

describe('getDayPlan: chunk track', () => {
  it('picks the first newPerDay curriculum items in order', () => {
    const cur = curriculum();
    const plan = getDayPlan({ dayIndex: 1, introduced: none, curriculum: cur, newPerDay: 5 });
    expect(plan.newItems).toEqual(cur.slice(0, 5));
  });

  it('skips introduced items (chunk and frame keys are distinct)', () => {
    const cur = curriculum();
    const introduced = new Set([itemKey(cur[0]), itemKey(cur[2]), 'frame:c01', 'chunk:f01']);
    const plan = getDayPlan({ dayIndex: 2, introduced, curriculum: cur, newPerDay: 4 });
    expect(plan.newItems).toEqual([cur[1], cur[3], cur[4], cur[5]]);
  });

  it('a missed day is repeated, a finished day moves on', () => {
    const cur = curriculum();
    const day1 = getDayPlan({ dayIndex: 1, introduced: none, curriculum: cur, newPerDay: 5 });
    const retry = getDayPlan({ dayIndex: 2, introduced: none, curriculum: cur, newPerDay: 5 });
    expect(retry.newItems).toEqual(day1.newItems);
    const next = getDayPlan({ dayIndex: 2, introduced: new Set(day1.newItems.map(itemKey)), curriculum: cur, newPerDay: 5 });
    expect(next.newItems).toEqual(cur.slice(5, 10));
  });

  it('clamps newPerDay to 3-10', () => {
    const cur = curriculum();
    const n = (v: number): number => getDayPlan({ dayIndex: 1, introduced: none, curriculum: cur, newPerDay: v }).newItems.length;
    expect(n(1)).toBe(3);
    expect(n(0)).toBe(3);
    expect(n(7)).toBe(7);
    expect(n(99)).toBe(10);
    expect(n(Number.NaN)).toBe(5);
    expect(clampNewPerDay(undefined)).toBe(5);
    expect(clampNewPerDay(6.6)).toBe(7);
  });

  it('returns fewer items when the library is nearly exhausted, none when it is', () => {
    const cur = curriculum(12);
    const introduced = new Set(cur.slice(0, 10).map(itemKey));
    expect(getDayPlan({ dayIndex: 30, introduced, curriculum: cur, newPerDay: 5 }).newItems).toEqual(cur.slice(10));
    const all = new Set(cur.map(itemKey));
    const done = getDayPlan({ dayIndex: 31, introduced: all, curriculum: cur, newPerDay: 5 });
    expect(done.newItems).toEqual([]);
    expect(done.decode.phase).toBe('maintenance');
    expect(getDayPlan({ dayIndex: 1, introduced: none, curriculum: [], newPerDay: 5 }).newItems).toEqual([]);
  });

  it('does not mutate its inputs and is deterministic', () => {
    const cur = curriculum();
    const copy = JSON.parse(JSON.stringify(cur)) as ItemRef[];
    const introduced = new Set(['chunk:c01']);
    const a = getDayPlan({ dayIndex: 9, introduced, curriculum: cur, newPerDay: 6 });
    const b = getDayPlan({ dayIndex: 9, introduced, curriculum: cur, newPerDay: 6 });
    expect(a).toEqual(b);
    expect(cur).toEqual(copy);
    expect([...introduced]).toEqual(['chunk:c01']);
    a.newItems[0].id = 'changed';
    expect(cur[1].id).not.toBe('changed'); // returned refs are copies
  });
});
