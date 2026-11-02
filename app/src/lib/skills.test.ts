import { describe, expect, it } from 'vitest';
import type { FunctionCategory, ReviewLog, Skill, SoundKind } from '../types';
import { getChunk } from '../content';
import { computeSkillStats, contentLookup, emptySkillStats, measuredLogs, median, type ContentLookup } from './skills';

const NOW = 1_800_000_000_000;
let seq = 0;

function log(over: Partial<ReviewLog> & { skill: Skill; correct: boolean }): ReviewLog {
  seq++;
  return {
    id: `l${seq}`,
    cardId: 'chunk:c001',
    grade: over.correct ? 2 : 0,
    mode: 'recall',
    reviewedAt: NOW - 100_000_000 + seq * 1000,
    durationMs: 3000,
    updatedAt: 0,
    ...over,
  };
}

/** n logs of one skill with the given correctness pattern (cycled), oldest first. */
function series(skill: Skill, pattern: boolean[], n: number, extra: Partial<ReviewLog> = {}): ReviewLog[] {
  return Array.from({ length: n }, (_, i) => log({ skill, correct: pattern[i % pattern.length], ...extra }));
}

const lookup: ContentLookup = {
  categoryOf: (id) =>
    ({ 'chunk:a': 'greeting', 'chunk:b': 'greeting', 'chunk:c': 'work', 'frame:f1': 'work', 'chunk:d': 'travel' })[id] as
      | FunctionCategory
      | undefined,
  sound: (id) => ({ s01: { name: 'want to → wanna', kind: 'reduction' as SoundKind }, s02: { name: 'got you → gotcha', kind: 'assimilation' as SoundKind } })[id],
};

describe('median', () => {
  it('handles empty, odd and even lists', () => {
    expect(median([])).toBeUndefined();
    expect(median([5])).toBe(5);
    expect(median([9, 1, 5])).toBe(5);
    expect(median([1, 2, 3, 10])).toBe(3); // (2+3)/2 = 2.5 -> 3
  });
});

describe('measuredLogs', () => {
  it('keeps only measured, non-deleted, non-future logs, oldest first', () => {
    const logs = [
      log({ skill: 'listen', correct: true, reviewedAt: NOW - 10 }),
      { ...log({ skill: 'listen', correct: true }), skill: undefined },
      { ...log({ skill: 'listen', correct: true }), correct: undefined },
      log({ skill: 'speak', correct: true, deleted: true }),
      log({ skill: 'speak', correct: false, reviewedAt: NOW + 5000 }),
      log({ skill: 'speak', correct: false, reviewedAt: NOW - 20 }),
    ];
    const out = measuredLogs(logs, NOW);
    expect(out.map((l) => l.reviewedAt)).toEqual([NOW - 20, NOW - 10]);
  });
});

describe('computeSkillStats', () => {
  it('empty input gives zeroed stats', () => {
    const s = computeSkillStats([], NOW, lookup);
    expect(s.bySkill.listen).toEqual({ n: 0, acc: 0, byLevel: {} });
    expect(s.categories).toEqual([]);
    expect(s.weakestCategories).toEqual([]);
    expect(s.soundErrors).toEqual([]);
    expect(s.measured).toBe(0);
    expect(emptySkillStats().bySkill.speak.n).toBe(0);
  });

  it('counts per skill and accuracy', () => {
    const logs = [...series('listen', [true, true, true, false], 20), ...series('speak', [true], 5), ...series('decode', [false], 4)];
    const s = computeSkillStats(logs, NOW, lookup);
    expect(s.bySkill.listen.n).toBe(20);
    expect(s.bySkill.listen.acc).toBeCloseTo(0.75);
    expect(s.bySkill.speak).toMatchObject({ n: 5, acc: 1 });
    expect(s.bySkill.decode).toMatchObject({ n: 4, acc: 0 });
  });

  it('uses only the last 40 measured logs of each skill', () => {
    const logs = [...series('listen', [false], 30), ...series('listen', [true], 40)];
    const s = computeSkillStats(logs, NOW, lookup);
    expect(s.bySkill.listen.n).toBe(40);
    expect(s.bySkill.listen.acc).toBe(1);
  });

  it('input order does not matter, reviewedAt does', () => {
    const logs = [...series('listen', [false], 40), ...series('listen', [true], 40)];
    const shuffled = [...logs].reverse();
    expect(computeSkillStats(shuffled, NOW, lookup).bySkill.listen.acc).toBe(1);
  });

  it('median latency covers correct answers that have a latency', () => {
    const logs = [
      log({ skill: 'speak', correct: true, latencyMs: 2000 }),
      log({ skill: 'speak', correct: true, latencyMs: 4000 }),
      log({ skill: 'speak', correct: true, latencyMs: 3000 }),
      log({ skill: 'speak', correct: false, latencyMs: 9000 }), // wrong: ignored
      log({ skill: 'speak', correct: true }), // no latency: ignored
    ];
    expect(computeSkillStats(logs, NOW, lookup).bySkill.speak.medianLatencyMs).toBe(3000);
    expect(computeSkillStats(series('listen', [true], 5), NOW, lookup).bySkill.listen.medianLatencyMs).toBeUndefined();
  });

  it('trend compares the newest 20 with the previous 20', () => {
    const logs = [...series('listen', [false, true], 20), ...series('listen', [true], 20)]; // 50% then 100%
    expect(computeSkillStats(logs, NOW, lookup).bySkill.listen.trend).toBeCloseTo(0.5);
    const down = [...series('speak', [true], 20), ...series('speak', [true, false], 20)];
    expect(computeSkillStats(down, NOW, lookup).bySkill.speak.trend).toBeCloseTo(-0.5);
  });

  it('trend is undefined when a half has fewer than 5 answers', () => {
    expect(computeSkillStats(series('listen', [true], 24), NOW, lookup).bySkill.listen.trend).toBeUndefined(); // previous 4
    expect(computeSkillStats(series('listen', [true], 25), NOW, lookup).bySkill.listen.trend).toBe(0);
  });

  it('byLevel groups answers that recorded a level', () => {
    const logs = [
      ...series('listen', [true, false], 10, { level: 2 }),
      ...series('listen', [true], 6, { level: 3 }),
      ...series('listen', [true], 3), // no level
    ];
    const s = computeSkillStats(logs, NOW, lookup).bySkill.listen;
    expect(s.byLevel[2]).toEqual({ n: 10, acc: 0.5 });
    expect(s.byLevel[3]).toEqual({ n: 6, acc: 1 });
    expect(Object.keys(s.byLevel)).toEqual(['2', '3']);
  });

  it('per-category accuracy for chunk-track cards, weakest categories and missed cards', () => {
    const rows = [
      ...['a', 'a', 'b', 'b', 'b'].map((id, i) => log({ skill: 'speak', cardId: `chunk:${id}`, correct: i < 1 })), // greeting 1/5
      ...[true, true, true, true].map((c) => log({ skill: 'listen', cardId: 'chunk:c', correct: c })), // work 4/4
      log({ skill: 'listen', cardId: 'frame:f1', correct: false }), // work now 4/5
      ...[true, true, true].map((c) => log({ skill: 'speak', cardId: 'chunk:d', correct: c })), // travel 3/3 (n<4)
      log({ skill: 'listen', cardId: 'chunk:unknown', correct: false }), // not resolvable
      log({ skill: 'listen', cardId: 'dialogue:dl001', correct: false }), // not chunk-track
    ];
    const s = computeSkillStats(rows, NOW, lookup);
    const byCat = Object.fromEntries(s.categories.map((c) => [c.category, c]));
    expect(byCat.greeting).toMatchObject({ n: 5, acc: 0.2 });
    expect(byCat.work).toMatchObject({ n: 5, acc: 0.8 });
    expect(byCat.travel).toMatchObject({ n: 3, acc: 1 });
    expect(s.categories.map((c) => c.category)).toEqual(['travel', 'work', 'greeting']); // best first
    // weakest: n >= 4 and acc < 0.88, worst first (travel has too few answers)
    expect(s.weakestCategories.map((c) => c.category)).toEqual(['greeting', 'work']);
    expect(byCat.greeting.missedCardIds).toEqual(['chunk:b', 'chunk:a']); // newest miss first, distinct
    expect(byCat.work.missedCardIds).toEqual(['frame:f1']);
  });

  it('collects sound-pattern errors and groups them by kind', () => {
    const rows = [
      log({ skill: 'listen', cardId: 'sound:s01', correct: false }),
      log({ skill: 'listen', cardId: 'sound:s01', correct: false }),
      log({ skill: 'listen', cardId: 'sound:s01', correct: true }),
      log({ skill: 'listen', cardId: 'sound:s02', correct: false }),
      log({ skill: 'listen', cardId: 'sound:s02', correct: true }),
      log({ skill: 'listen', cardId: 'sound:s99', correct: false }), // unknown pattern
    ];
    const s = computeSkillStats(rows, NOW, lookup);
    expect(s.soundErrors).toEqual([
      { soundId: 's01', name: 'want to → wanna', kind: 'reduction', attempts: 3, errors: 2 },
      { soundId: 's02', name: 'got you → gotcha', kind: 'assimilation', attempts: 2, errors: 1 },
    ]);
    expect(s.soundByKind).toEqual([
      { kind: 'reduction', attempts: 3, errors: 2 },
      { kind: 'assimilation', attempts: 2, errors: 1 },
    ]);
  });

  it('a pattern without errors is not listed in soundErrors but counts in its kind', () => {
    const s = computeSkillStats([log({ skill: 'listen', cardId: 'sound:s01', correct: true })], NOW, lookup);
    expect(s.soundErrors).toEqual([]);
    expect(s.soundByKind).toEqual([{ kind: 'reduction', attempts: 1, errors: 0 }]);
  });
});

describe('default content lookup', () => {
  it('resolves chunk and frame categories and sounds from the library', () => {
    expect(contentLookup.categoryOf('chunk:c001')).toBe(getChunk('c001')?.category);
    expect(contentLookup.categoryOf('chunk:nope')).toBeUndefined();
    expect(contentLookup.categoryOf('dialogue:dl001')).toBeUndefined();
    expect(contentLookup.sound('s01')?.name).toBeTruthy();
    expect(contentLookup.sound('zzz')).toBeUndefined();
  });
});
