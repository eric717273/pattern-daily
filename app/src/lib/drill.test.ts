import { describe, expect, it } from 'vitest';
import type { CardState, SubstitutionFrame } from '../types';
import { DOZEN, SEED_FRAMES } from '../content';
import {
  averageGrade,
  buildFlashPrompt,
  formatDuration,
  hashString,
  makeTiles,
  offlineOutputPrompts,
  pickDailyVariant,
  picksFromExample,
  seededRng,
  sentenceFromTiles,
  shuffled,
  suggestGrade,
} from './drill';
import { buildCombo, compareAnswer, normalizeEn } from './frameEngine';

const d01 = DOZEN[0];

function card(kind: 'dozen' | 'frame', refId: string): CardState {
  return { id: `${kind}:${refId}`, kind, refId, due: 0, interval: 0, ease: 2.5, reps: 0, lapses: 0, updatedAt: 1 };
}

describe('seeded randomness', () => {
  it('is deterministic per seed and varies between seeds', () => {
    const a = seededRng(hashString('2026-01-01'));
    const b = seededRng(hashString('2026-01-01'));
    const c = seededRng(hashString('2026-01-02'));
    const seqA = [a(), a(), a()];
    expect(seqA).toEqual([b(), b(), b()]);
    expect(seqA).not.toEqual([c(), c(), c()]);
    for (const x of seqA) expect(x).toBeGreaterThanOrEqual(0);
    for (const x of seqA) expect(x).toBeLessThan(1);
  });

  it('shuffled keeps every item', () => {
    const items = [1, 2, 3, 4, 5, 6];
    expect(shuffled(items, seededRng(7)).sort()).toEqual(items);
  });
});

describe('order drill tiles', () => {
  it('splits a sentence into word tiles with unique ids', () => {
    const tiles = makeTiles('I give John the apple.', seededRng(3));
    expect(tiles).toHaveLength(5);
    expect(new Set(tiles.map((t) => t.id)).size).toBe(5);
    expect(tiles.map((t) => t.text).sort()).toEqual(['I', 'John', 'apple.', 'give', 'the'].sort());
  });

  it('never returns the original order when the words differ', () => {
    for (let seed = 0; seed < 30; seed++) {
      const tiles = makeTiles('She gives it to him.', seededRng(seed));
      expect(tiles.map((t) => t.text).join(' ')).not.toBe('She gives it to him.');
    }
  });

  it('keeps repeated words as separate tiles', () => {
    const tiles = makeTiles('the cat and the dog', seededRng(1));
    expect(tiles.filter((t) => t.text === 'the')).toHaveLength(2);
    expect(new Set(tiles.map((t) => t.id)).size).toBe(5);
  });

  it('rebuilds a sentence from placed ids, and the result is compared with compareAnswer', () => {
    const en = 'I give John the apple.';
    const tiles = makeTiles(en, seededRng(5));
    const inOrder = [...tiles].sort((a, b) => a.id - b.id).map((t) => t.id);
    expect(sentenceFromTiles(tiles, inOrder)).toBe(en);
    expect(compareAnswer(sentenceFromTiles(tiles, inOrder), en).exact).toBe(true);
    const swapped = [inOrder[1], inOrder[0], ...inOrder.slice(2)];
    expect(compareAnswer(sentenceFromTiles(tiles, swapped), en).exact).toBe(false);
    expect(sentenceFromTiles(tiles, [])).toBe('');
  });
});

describe('pickDailyVariant', () => {
  it('is deterministic per day and uses daily / work vocabulary', () => {
    const a = pickDailyVariant(d01, '2026-05-01');
    expect(pickDailyVariant(d01, '2026-05-01')).toEqual(a);
    expect(['daily', 'work']).toContain(a.level);
    expect(d01.variants).toContainEqual(a);
    const levels = new Set<string>();
    for (let day = 1; day <= 20; day++) levels.add(pickDailyVariant(d01, `2026-05-${String(day).padStart(2, '0')}`).en);
    expect(levels.size).toBeGreaterThan(1);
  });
});

describe('grading helpers', () => {
  it('suggests a grade from similarity', () => {
    expect(suggestGrade(1)).toBe(2);
    expect(suggestGrade(0.95)).toBe(2);
    expect(suggestGrade(0.8)).toBe(1);
    expect(suggestGrade(0.69)).toBe(0);
    expect(suggestGrade(0)).toBe(0);
  });

  it('averages grades with rounding', () => {
    expect(averageGrade([])).toBe(2);
    expect(averageGrade([2, 2, 2])).toBe(2);
    expect(averageGrade([3, 2, 2])).toBe(2);
    expect(averageGrade([3, 3, 2])).toBe(3);
    expect(averageGrade([0, 1, 0])).toBe(0);
  });

  it('formats durations in Chinese', () => {
    expect(formatDuration(0)).toBe('0 秒');
    expect(formatDuration(45_000)).toBe('45 秒');
    expect(formatDuration(120_000)).toBe('2 分钟');
    expect(formatDuration(125_000)).toBe('2 分 5 秒');
  });
});

describe('picksFromExample', () => {
  it('recovers the picks of the first example (all seed frames)', () => {
    let total = 0;
    let rebuilt = 0;
    for (const f of SEED_FRAMES) {
      for (const ex of f.examples) {
        total++;
        const c = buildCombo(f, picksFromExample(f, ex));
        if (normalizeEn(c.en) === normalizeEn(ex.en)) rebuilt++;
      }
    }
    expect(total).toBeGreaterThan(100);
    expect(rebuilt / total).toBeGreaterThan(0.9);
  });

  it('falls back to option 0 without an example', () => {
    const f = SEED_FRAMES[0];
    const picks = picksFromExample(f, undefined);
    expect(Object.values(picks).every((i) => i === 0)).toBe(true);
    expect(Object.keys(picks).sort()).toEqual(f.slots.map((s) => s.key).sort());
  });
});

describe('buildFlashPrompt', () => {
  it('uses the dozen sentence itself or a variant with the skeleton hint', () => {
    const plain = buildFlashPrompt(card('dozen', 'd01'), [], () => 0.99); // >= 0.5: the sentence itself
    expect(plain).toMatchObject({ kind: 'dozen', promptZh: d01.zh, answerEn: d01.en });
    expect(plain?.skeletonEn).toBeUndefined();

    const variant = buildFlashPrompt(card('dozen', 'd01'), [], () => 0.1);
    expect(variant?.skeletonEn).toBe(d01.en);
    const v = d01.variants.find((x) => x.zh === variant?.promptZh);
    expect(v?.en).toBe(variant?.answerEn);
  });

  it('builds a frame prompt from a random combo with the frame title', () => {
    const f = SEED_FRAMES[0];
    const p = buildFlashPrompt(card('frame', f.id), SEED_FRAMES, () => 0);
    expect(p?.kind).toBe('frame');
    expect(p?.title).toBe(f.title);
    expect(p?.promptZh).toBeTruthy();
    expect(p?.answerEn).toBeTruthy();
  });

  it('returns null when the content is gone', () => {
    expect(buildFlashPrompt(card('dozen', 'zzz'), [], () => 0)).toBeNull();
    expect(buildFlashPrompt(card('frame', 'u-gone'), SEED_FRAMES, () => 0)).toBeNull();
  });
});

describe('offlineOutputPrompts', () => {
  const frames: SubstitutionFrame[] = SEED_FRAMES.slice(0, 2);

  it('builds 3 deterministic prompts from dozen variants and frame examples', () => {
    const a = offlineOutputPrompts(d01, frames, 3, 'seed');
    expect(a).toHaveLength(3);
    expect(offlineOutputPrompts(d01, frames, 3, 'seed')).toEqual(a);
    expect(a[0]).toMatchObject({ refKind: 'dozen', refId: 'd01', skeletonEn: d01.en });
    expect(a[1]).toMatchObject({ refKind: 'frame', refId: frames[0].id, frameId: frames[0].id });
    for (const p of a) {
      expect(p.promptZh).toBeTruthy();
      expect(p.referenceEn).toBeTruthy();
    }
    const dozenPrompts = a.filter((p) => p.refKind === 'dozen');
    for (const p of dozenPrompts) {
      const v = d01.variants.find((x) => x.zh === p.promptZh);
      expect(v && ['daily', 'work'].includes(v.level)).toBe(true);
    }
  });

  it('still returns `count` prompts without frames', () => {
    const a = offlineOutputPrompts(d01, [], 3, 'x');
    expect(a).toHaveLength(3);
    expect(a.every((p) => p.refKind === 'dozen')).toBe(true);
  });
});
