import { describe, expect, it } from 'vitest';
import type { Chunk, Dialogue, Freq } from '../types';
import {
  DIALOGUE_CAP,
  buildCheckpoint,
  buildPlacement,
  defaultPool,
  highestPassedLevel,
  levelZhFor,
  nextListenLevel,
  sample,
  scoreCheckpoint,
  scorePlacement,
  speakLevelFromResults,
  type AssessmentPool,
  type PlacementResults,
  type SpeakResult,
} from './assessment';

function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chunk(i: number, freq: Freq, tags?: Chunk['tags']): Chunk {
  return {
    id: `c${String(i).padStart(3, '0')}`,
    en: `chunk ${i}`,
    zh: `语块${i}`,
    category: 'greeting',
    freq,
    register: 'neutral',
    examples: [],
    ...(tags ? { tags } : {}),
  };
}

function dialogue(id: string, tier: 1 | 2 | 3): Dialogue {
  return {
    id,
    title: id,
    scene: 'daily',
    category: 'greeting',
    tier,
    turns: [],
    chunkIds: [],
    gist: { questionZh: '?', optionsZh: ['a', 'b', 'c'], answer: 0 },
    blanks: [],
  };
}

const POOL: AssessmentPool = {
  chunks: [
    ...Array.from({ length: 20 }, (_, i) => chunk(i + 1, 1)),
    ...Array.from({ length: 20 }, (_, i) => chunk(i + 21, 2)),
    ...Array.from({ length: 20 }, (_, i) => chunk(i + 41, 3)),
  ],
  dialogues: [dialogue('dl001', 1), dialogue('dl002', 1), dialogue('dl050', 2), dialogue('dl051', 2), dialogue('dl100', 3)],
};

describe('sample', () => {
  it('returns distinct elements, bounded by the list', () => {
    const out = sample([1, 2, 3, 4, 5], 3, rngFrom(1));
    expect(out).toHaveLength(3);
    expect(new Set(out).size).toBe(3);
    expect(sample([1, 2], 5, rngFrom(1))).toHaveLength(2);
    expect(sample([1, 2], 0, rngFrom(1))).toEqual([]);
    expect(sample<number>([], 3, rngFrom(1))).toEqual([]);
  });
  it('survives rng() returning exactly 1', () => {
    expect(sample([1, 2, 3], 3, () => 1)).toHaveLength(3);
  });
});

describe('nextListenLevel', () => {
  it('goes up on correct, down on wrong, clamped to L0-L8', () => {
    expect(nextListenLevel(2, true)).toBe(3);
    expect(nextListenLevel(2, false)).toBe(1);
    expect(nextListenLevel(8, true)).toBe(8);
    expect(nextListenLevel(0, false)).toBe(0);
  });
});

describe('buildPlacement', () => {
  it('has 12 listening chunks (4 per band, interleaved), start L2, 2 dialogues, 8 speaking chunks', () => {
    const p = buildPlacement(rngFrom(7), POOL);
    expect(p.listen.startLevel).toBe(2);
    expect(p.listen.items).toHaveLength(12);
    for (const f of [1, 2, 3]) expect(p.listen.items.filter((i) => i.freq === f)).toHaveLength(4);
    expect(p.listen.items.slice(0, 6).map((i) => i.freq)).toEqual([1, 2, 3, 1, 2, 3]);
    expect(p.speak.items).toHaveLength(8);
    expect(p.speak.items.filter((i) => i.freq === 1)).toHaveLength(4);
    expect(p.speak.items.filter((i) => i.freq === 2)).toHaveLength(4);
    expect(p.speak.limitMs).toBe(10_000);
    expect(p.dialogues).toHaveLength(2);
  });

  it('picks a tier-1 and a tier-2 dialogue', () => {
    for (let seed = 1; seed < 20; seed++) {
      const [a, b] = buildPlacement(rngFrom(seed), POOL).dialogues;
      expect(['dl001', 'dl002']).toContain(a);
      expect(['dl050', 'dl051']).toContain(b);
    }
  });

  it('never repeats a chunk across listening and speaking, and items match their freq', () => {
    const p = buildPlacement(rngFrom(3), POOL);
    const all = [...p.listen.items, ...p.speak.items];
    expect(new Set(all.map((i) => i.chunkId)).size).toBe(20);
    for (const i of all) expect(POOL.chunks.find((c) => c.id === i.chunkId)?.freq).toBe(i.freq);
  });

  it('is deterministic for a seed and varies between seeds', () => {
    expect(buildPlacement(rngFrom(5), POOL)).toEqual(buildPlacement(rngFrom(5), POOL));
    expect(buildPlacement(rngFrom(5), POOL)).not.toEqual(buildPlacement(rngFrom(6), POOL));
  });

  it('degrades gracefully with a small pool', () => {
    const small: AssessmentPool = { chunks: POOL.chunks.slice(0, 6), dialogues: [] };
    const p = buildPlacement(rngFrom(1), small);
    expect(p.listen.items.length).toBeLessThanOrEqual(6);
    expect(p.dialogues).toEqual([]);
  });

  it('the default pool excludes tagged (phrasal / collocation) chunks and works with the shipped library', () => {
    const pool = defaultPool();
    expect(pool.chunks.every((c) => !c.tags || c.tags.length === 0)).toBe(true);
    expect(pool.chunks.length).toBe(250);
    const p = buildPlacement(rngFrom(11));
    expect(p.listen.items).toHaveLength(12);
    expect(p.speak.items).toHaveLength(8);
    expect(p.dialogues).toHaveLength(2);
  });
});

describe('highestPassedLevel', () => {
  const r = (level: number, correct: boolean) => ({ level, correct });
  it('needs >= 2/3 correct at the level', () => {
    expect(highestPassedLevel([r(2, true), r(2, true), r(2, false)])).toBe(2);
    expect(highestPassedLevel([r(2, true), r(2, false), r(2, false)])).toBeUndefined();
    expect(highestPassedLevel([r(2, true), r(2, false)])).toBeUndefined(); // 1/2
  });
  it('picks the highest qualifying level, ignoring failed higher levels', () => {
    expect(highestPassedLevel([r(2, true), r(3, true), r(4, false), r(3, true), r(4, false)])).toBe(3);
  });
  it('a single correct answer at a level counts (1/1)', () => {
    expect(highestPassedLevel([r(2, true), r(3, true), r(4, true), r(5, false), r(4, false)])).toBe(3);
  });
  it('empty input has no level', () => {
    expect(highestPassedLevel([])).toBeUndefined();
  });
});

describe('speakLevelFromResults', () => {
  const sp = (correct: boolean, latencyMs?: number, freq: Freq = 1): SpeakResult => ({ chunkId: 'c', freq, correct, latencyMs });
  const all = (ms: number): SpeakResult[] => Array.from({ length: 8 }, () => sp(true, ms));

  it.each([
    [2500, 5],
    [3000, 5],
    [3001, 4],
    [4000, 4],
    [4001, 3],
    [5000, 3],
    [5001, 2],
    [6500, 2],
    [6501, 1],
    [8500, 1],
    [8501, 0],
    [12000, 0],
  ])('median %i ms -> S%i', (ms, level) => {
    expect(speakLevelFromResults(all(ms)).level).toBe(level);
  });

  it('accuracy below 50% is S0 whatever the speed; exactly 50% is scored', () => {
    const fast = (n: number): SpeakResult[] => [...Array.from({ length: n }, () => sp(true, 2000)), ...Array.from({ length: 8 - n }, () => sp(false))];
    expect(speakLevelFromResults(fast(3)).level).toBe(0);
    expect(speakLevelFromResults(fast(4)).level).toBe(5);
    expect(speakLevelFromResults(fast(3)).acc).toBeCloseTo(0.375);
  });

  it('uses the median of correct answers only', () => {
    const rs = [sp(true, 2000), sp(true, 2500), sp(true, 4500), sp(false, 20000), sp(false)];
    expect(speakLevelFromResults(rs)).toMatchObject({ level: 5, medianMs: 2500, acc: 0.6 });
  });

  it('no answers or no correct answers -> S0', () => {
    expect(speakLevelFromResults([])).toEqual({ level: 0, acc: 0 });
    expect(speakLevelFromResults([sp(false)]).level).toBe(0);
  });
});

describe('speakLevelFromResults: self-check (unverified) answers', () => {
  const self = (correct: boolean, latencyMs?: number): SpeakResult => ({ chunkId: 'c', freq: 1, correct, verified: false, latencyMs });
  const ver = (ms: number): SpeakResult => ({ chunkId: 'c', freq: 1, correct: true, verified: true, latencyMs: ms });
  const mix = (ok: number, n: number): SpeakResult[] => Array.from({ length: n }, (_, i) => self(i < ok, i < ok ? 1000 : undefined));

  it('ignores latency of unverified answers: the level is accuracy-based (>= 0.75 S2, >= 0.5 S1, else S0)', () => {
    expect(speakLevelFromResults(mix(8, 8))).toEqual({ level: 2, acc: 1 }); // 1 s "latency" would have been S5
    expect(speakLevelFromResults(mix(6, 8)).level).toBe(2); // exactly 0.75
    expect(speakLevelFromResults(mix(5, 8)).level).toBe(1);
    expect(speakLevelFromResults(mix(4, 8)).level).toBe(1); // exactly 0.5
    expect(speakLevelFromResults(mix(3, 8)).level).toBe(0);
    expect(speakLevelFromResults(mix(8, 8)).medianMs).toBeUndefined();
  });

  it('uses only the verified latencies when verified and unverified answers are mixed', () => {
    const rs = [ver(5800), ver(6000), self(true, 500), self(true, 500), self(true, 500)];
    expect(speakLevelFromResults(rs)).toMatchObject({ level: 2, medianMs: 5900 });
  });
});

describe('levelZhFor', () => {
  it('maps the composite 0.6 x listen/8 + 0.4 x speak/5 to the four labels', () => {
    expect(levelZhFor(0, 0)).toBe('入门');
    expect(levelZhFor(2, 1)).toBe('入门'); // 0.15 + 0.08 = 0.23
    expect(levelZhFor(3, 2)).toBe('基础'); // 0.225 + 0.16 = 0.385
    expect(levelZhFor(4, 3)).toBe('进阶'); // 0.30 + 0.24 = 0.54
    expect(levelZhFor(6, 4)).toBe('熟练'); // 0.45 + 0.32 = 0.77
    expect(levelZhFor(8, 5)).toBe('熟练');
  });
  it('boundaries: 0.25 is 基础, 0.50 is 进阶, 0.75 is 熟练', () => {
    expect(levelZhFor(0, 0)).toBe('入门');
    expect(levelZhFor(8, 0)).toBe('进阶'); // 0.6
    expect(levelZhFor(0, 5)).toBe('基础'); // 0.4
    expect(levelZhFor(5, 0)).toBe('基础'); // 0.375
    expect(levelZhFor(8, 3)).toBe('熟练'); // 0.6 + 0.24 = 0.84
  });
});

function results(over: Partial<PlacementResults> = {}): PlacementResults {
  const listen = [
    { chunkId: 'c001', freq: 1 as Freq, level: 2, correct: true },
    { chunkId: 'c021', freq: 2 as Freq, level: 3, correct: true },
    { chunkId: 'c041', freq: 3 as Freq, level: 4, correct: true },
    { chunkId: 'c002', freq: 1 as Freq, level: 5, correct: false },
    { chunkId: 'c022', freq: 2 as Freq, level: 4, correct: true },
    { chunkId: 'c042', freq: 3 as Freq, level: 5, correct: false },
  ];
  return {
    listen,
    dialogues: [
      { id: 'dl001', tier: 1, correct: true },
      { id: 'dl050', tier: 2, correct: true },
    ],
    speak: [
      { chunkId: 'c003', freq: 1, correct: true, latencyMs: 2000 },
      { chunkId: 'c004', freq: 1, correct: true, latencyMs: 3500 },
      { chunkId: 'c005', freq: 1, correct: true, latencyMs: 2800 },
      { chunkId: 'c006', freq: 1, correct: false },
      { chunkId: 'c023', freq: 2, correct: true, latencyMs: 4200 },
      { chunkId: 'c024', freq: 2, correct: true, latencyMs: 3000 },
    ],
    ...over,
  };
}

describe('scorePlacement', () => {
  it('produces a complete Assessment', () => {
    const a = scorePlacement(results(), { date: '2026-05-10' });
    expect(a).toMatchObject({
      id: 'placement-2026-05-10',
      date: '2026-05-10',
      kind: 'placement',
      listenLevel: 4, // L4: 2/2 correct; L5 0/2
      speakLevel: 5, // median of 2000, 2800, 3000, 3500, 4200 = 3000 ms -> S5
    });
  });

  it('listen level = highest level with >= 2/3 correct', () => {
    const a = scorePlacement(results(), { date: 'd' });
    expect(a.listenLevel).toBe(4);
    expect(a.listenAcc).toBeCloseTo(6 / 8); // 4 of 6 staircase + 2 of 2 dialogues
  });

  it('speaking level comes from the median latency of correct answers (spec thresholds)', () => {
    const a = scorePlacement(results(), { date: 'd' });
    expect(a.speakMedianMs).toBe(3000);
    expect(a.speakLevel).toBe(5);
    expect(a.speakAcc).toBeCloseTo(5 / 6);
  });

  it('fast-tracks freq-1 chunks answered correctly in <= 3 s only', () => {
    const a = scorePlacement(results(), { date: 'd' });
    expect(a.fastTracked).toEqual(['c003', 'c005']); // 3500 too slow, c006 wrong, freq-2 never fast-tracked
    const boundary = scorePlacement(
      results({ speak: [{ chunkId: 'c001', freq: 1, correct: true, latencyMs: 3000 }, { chunkId: 'c002', freq: 1, correct: true, latencyMs: 3001 }] }),
      { date: 'd' },
    );
    expect(boundary.fastTracked).toEqual(['c001']);
  });

  it('self-check placement: no latency-based level and nothing is fast-tracked', () => {
    const speak = Array.from({ length: 8 }, (_, i): SpeakResult => ({ chunkId: `c00${i + 1}`, freq: i < 4 ? 1 : 2, correct: true, verified: false, latencyMs: 800 }));
    const a = scorePlacement(results({ speak }), { date: 'd' });
    expect(a.fastTracked).toBeUndefined();
    expect(a.speakLevel).toBe(2);
    expect(a.speakMedianMs).toBeUndefined();
    expect(a.speakAcc).toBe(1);
  });

  it('verified fast answers are still fast-tracked', () => {
    const speak: SpeakResult[] = [
      { chunkId: 'c001', freq: 1, correct: true, verified: true, latencyMs: 2000 },
      { chunkId: 'c002', freq: 1, correct: true, verified: false, latencyMs: 2000 },
    ];
    expect(scorePlacement(results({ speak }), { date: 'd' }).fastTracked).toEqual(['c001']);
  });

  it('omits fastTracked when nothing qualifies', () => {
    const a = scorePlacement(results({ speak: [{ chunkId: 'c001', freq: 1, correct: true, latencyMs: 5000 }] }), { date: 'd' });
    expect(a.fastTracked).toBeUndefined();
  });

  it('computes accuracy per frequency band over listening and speaking items', () => {
    const a = scorePlacement(results(), { date: 'd' });
    // freq 1: listen 1/2 + speak 3/4 = 4/6 ; freq 2: listen 2/2 + speak 2/2 = 1 ; freq 3: listen 1/2
    expect(a.bandAcc[1]).toBeCloseTo(4 / 6);
    expect(a.bandAcc[2]).toBe(1);
    expect(a.bandAcc[3]).toBe(0.5);
  });

  it('a wrong dialogue caps the staircase level (tier 1 -> L2, tier 2 -> L5)', () => {
    const lowCap = scorePlacement(results({ dialogues: [{ id: 'dl001', tier: 1, correct: false }, { id: 'dl050', tier: 2, correct: true }] }), { date: 'd' });
    expect(lowCap.listenLevel).toBe(DIALOGUE_CAP[1]);
    const climbing = Array.from({ length: 12 }, (_, i) => ({ chunkId: `c${i}`, freq: 1 as Freq, level: Math.min(8, 2 + i), correct: true }));
    const tier2Wrong = scorePlacement({ ...results(), listen: climbing, dialogues: [{ id: 'dl050', tier: 2, correct: false }] }, { date: 'd' });
    expect(tier2Wrong.listenLevel).toBe(DIALOGUE_CAP[2]);
    const tier2Right = scorePlacement({ ...results(), listen: climbing, dialogues: [{ id: 'dl050', tier: 2, correct: true }] }, { date: 'd' });
    expect(tier2Right.listenLevel).toBe(8);
  });

  it('speakAcc below 50% is S0 even with fast correct answers', () => {
    const speak: SpeakResult[] = [
      { chunkId: 'a', freq: 1, correct: true, latencyMs: 1500 },
      { chunkId: 'b', freq: 1, correct: true, latencyMs: 1500 },
      ...Array.from({ length: 6 }, (_, i) => ({ chunkId: `x${i}`, freq: 2 as Freq, correct: false })),
    ];
    const a = scorePlacement(results({ speak }), { date: 'd' });
    expect(a.speakLevel).toBe(0);
    expect(a.speakAcc).toBe(0.25);
    expect(a.fastTracked).toEqual(['a', 'b']); // fast-track is independent of the level
  });

  it('all wrong gives the lowest levels and 入门', () => {
    const a = scorePlacement(
      {
        listen: [{ chunkId: 'a', freq: 1, level: 2, correct: false }, { chunkId: 'b', freq: 2, level: 1, correct: false }],
        dialogues: [{ id: 'd', tier: 1, correct: false }],
        speak: [{ chunkId: 'c', freq: 1, correct: false }],
      },
      { date: 'd' },
    );
    expect(a).toMatchObject({ listenLevel: 0, speakLevel: 0, listenAcc: 0, speakAcc: 0, levelZh: '入门' });
  });

  it('handles empty results and default id/date', () => {
    const a = scorePlacement({ listen: [], dialogues: [], speak: [] });
    expect(a).toMatchObject({ kind: 'placement', listenLevel: 0, speakLevel: 0, listenAcc: 0, speakAcc: 0, bandAcc: {} });
    expect(a.id).toBe(`placement-${a.date}`);
    expect(a.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(scorePlacement(results(), { id: 'custom', date: 'x' }).id).toBe('custom');
  });

  it('levelZh follows the composite', () => {
    const a = scorePlacement(results(), { date: 'd' }); // L4 / S5 -> 0.3 + 0.4 = 0.7 -> 进阶
    expect(a.levelZh).toBe('进阶');
  });
});

describe('buildCheckpoint', () => {
  it('has 6 listening items (3 at the current level, 3 one higher) and 4 speaking items', () => {
    const c = buildCheckpoint({ listen: 3, speak: 2, newPerDay: 5 }, rngFrom(2), { pool: POOL });
    expect(c.listen).toHaveLength(6);
    expect(c.listen.filter((i) => i.level === 3)).toHaveLength(3);
    expect(c.listen.filter((i) => i.level === 4)).toHaveLength(3);
    expect(c.speak.items).toHaveLength(4);
    expect(c.speak.limitMs).toBe(6000); // S2
    expect(new Set([...c.listen, ...c.speak.items].map((i) => i.chunkId)).size).toBe(10);
  });

  it('caps the higher level at L8', () => {
    const c = buildCheckpoint({ listen: 8, speak: 5, newPerDay: 5 }, rngFrom(2), { pool: POOL });
    expect(c.listen.every((i) => i.level === 8)).toBe(true);
    expect(c.speak.limitMs).toBe(3000);
  });

  it('prefers chunks the learner already met and tops up from the pool', () => {
    const prefer = new Set(['c001', 'c002', 'c003', 'c004']);
    const c = buildCheckpoint({ listen: 1, speak: 1, newPerDay: 5 }, rngFrom(9), { pool: POOL, preferIds: prefer });
    const ids = [...c.listen, ...c.speak.items].map((i) => i.chunkId);
    for (const id of prefer) expect(ids).toContain(id);
    expect(ids).toHaveLength(10);
    const many = new Set(POOL.chunks.slice(0, 30).map((x) => x.id));
    const c2 = buildCheckpoint({ listen: 1, speak: 1, newPerDay: 5 }, rngFrom(9), { pool: POOL, preferIds: many });
    expect([...c2.listen, ...c2.speak.items].every((i) => many.has(i.chunkId))).toBe(true);
  });

  it('works with the shipped library by default', () => {
    const c = buildCheckpoint({ listen: 2, speak: 1, newPerDay: 5 }, rngFrom(4));
    expect(c.listen).toHaveLength(6);
    expect(c.speak.items).toHaveLength(4);
  });
});

describe('scoreCheckpoint', () => {
  const ladder = { listen: 3, speak: 2, newPerDay: 5 };
  const l = (level: number, correct: boolean, freq: Freq = 1) => ({ chunkId: `c${level}${correct}`, freq, level, correct });
  const sp = (correct: boolean, latencyMs?: number, freq: Freq = 1): SpeakResult => ({ chunkId: 'c', freq, correct, latencyMs });

  it('moves up when >= 2 of 3 are right one level higher', () => {
    const a = scoreCheckpoint(ladder, { listen: [l(3, true), l(3, true), l(3, true), l(4, true), l(4, true), l(4, false)], speak: [sp(true, 4500), sp(true, 4800), sp(true, 4900), sp(true, 4700)] }, { date: '2026-05-17' });
    expect(a).toMatchObject({ kind: 'checkpoint', id: 'checkpoint-2026-05-17', listenLevel: 4, speakLevel: 3 });
    expect(a.listenAcc).toBeCloseTo(5 / 6);
    expect(a.fastTracked).toBeUndefined();
  });

  it('stays when only the current level passes', () => {
    const a = scoreCheckpoint(ladder, { listen: [l(3, true), l(3, true), l(3, false), l(4, true), l(4, false), l(4, false)], speak: [] }, { date: 'd' });
    expect(a.listenLevel).toBe(3);
  });

  it('drops one level when neither passes', () => {
    const a = scoreCheckpoint(ladder, { listen: [l(3, true), l(3, false), l(3, false), l(4, false), l(4, false), l(4, false)], speak: [] }, { date: 'd' });
    expect(a.listenLevel).toBe(2);
    expect(scoreCheckpoint({ ...ladder, listen: 0 }, { listen: [l(0, false), l(0, false), l(0, false), l(1, false), l(1, false), l(1, false)], speak: [] }, { date: 'd' }).listenLevel).toBe(0);
  });

  it('speaking: accuracy < 50% is S0, otherwise by median latency', () => {
    expect(scoreCheckpoint(ladder, { listen: [], speak: [sp(true, 2000), sp(false), sp(false), sp(false)] }, { date: 'd' }).speakLevel).toBe(0);
    const ok = scoreCheckpoint(ladder, { listen: [], speak: [sp(true, 2000), sp(true, 2400), sp(false), sp(false)] }, { date: 'd' });
    expect(ok.speakLevel).toBe(5);
    expect(ok.speakMedianMs).toBe(2200);
  });

  it('band accuracy and level label are filled', () => {
    const a = scoreCheckpoint(ladder, { listen: [l(3, true, 1), l(3, false, 2)], speak: [sp(true, 3000, 1)] }, { date: 'd' });
    expect(a.bandAcc).toEqual({ 1: 1, 2: 0 });
    expect(['入门', '基础', '进阶', '熟练']).toContain(a.levelZh);
  });
});

describe('scoreCheckpoint: self-check speaking', () => {
  it('uses the accuracy-based level and records no median', () => {
    const speak: SpeakResult[] = [1, 2, 3, 4].map((i) => ({ chunkId: `c00${i}`, freq: 1 as Freq, correct: i < 4, verified: false, latencyMs: 900 }));
    const a = scoreCheckpoint({ listen: 2, speak: 2, newPerDay: 5 }, { listen: [], speak }, { date: 'd' });
    expect(a.speakLevel).toBe(2); // 3/4 = 0.75
    expect(a.speakMedianMs).toBeUndefined();
  });
});
