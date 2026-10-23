import { describe, expect, it } from 'vitest';
import { CHUNKS, SEED_FRAMES, getChunk } from '../content';
import type { Chunk, SubstitutionFrame } from '../types';
import {
  buildListenQuestion,
  chunkCore,
  chunkDistractors,
  chunkGrade,
  exampleTurn,
  findChunkRange,
  frameGrade,
  frameListenCombos,
  frameReviewGrade,
  listenPoints,
  maskChunk,
  maskZh,
  matchChunkSpoken,
  recallPoints,
  splitTurns,
} from './chunkDrill';
import { seededRng } from './drill';
import { buildCombo, normalizeEn, randomCombo } from './frameEngine';

const chunk = (id: string): Chunk => {
  const c = getChunk(id);
  if (!c) throw new Error(`missing ${id}`);
  return c;
};

describe('chunk text helpers', () => {
  it('chunkCore drops the open-ended tail', () => {
    expect(chunkCore('I was wondering if …')).toBe('I was wondering if');
    expect(chunkCore('What do you mean by …?')).toBe('What do you mean by');
    expect(chunkCore("It's up to you.")).toBe("It's up to you.");
  });

  it('findChunkRange ignores case, curly quotes, trailing punctuation and …', () => {
    expect(findChunkRange("Honestly, it’s up to you, really.", "It's up to you.")).toEqual({ start: 10, end: 24 });
    expect(findChunkRange('I was wondering if you could help.', 'I was wondering if …')).toEqual({ start: 0, end: 18 });
    expect(findChunkRange('Nothing here', 'Long time no see.')).toBeNull();
  });

  it('maskChunk blanks the chunk', () => {
    expect(maskChunk('Long time no see! How are you?', 'Long time no see.')).toBe('＿＿＿! How are you?');
  });

  it('splitTurns / exampleTurn pick the turn that holds the chunk and pair the Chinese', () => {
    expect(splitTurns("A: Hey, how's it going? B: Pretty good, thanks. You?")).toEqual([
      "Hey, how's it going?",
      'Pretty good, thanks. You?',
    ]);
    expect(splitTurns('A：嘿，最近怎么样？B：挺好的，谢谢。你呢？')).toEqual(['嘿，最近怎么样？', '挺好的，谢谢。你呢？']);
    const t = exampleTurn(
      { en: "A: Is it any good? B: I'd say it's the best pizza in town.", zh: 'A：好吃吗？B：我觉得这是全城最好的披萨。' },
      "I'd say …",
    );
    expect(t.en).toBe("I'd say it's the best pizza in town.");
    expect(t.zh).toBe('我觉得这是全城最好的披萨。');
    expect(splitTurns('Plan B: stay home.')).toEqual(['Plan B: stay home.']);
  });

  it('every chunk has an example turn that contains the chunk', () => {
    for (const c of CHUNKS) {
      const turns = c.examples.map((e) => exampleTurn(e, c.en));
      expect(turns.some((t) => findChunkRange(t.en, c.en) !== null), c.id).toBe(true);
    }
  });

  it('maskZh blanks the chunk meaning inside the example translation', () => {
    expect(maskZh('好久不见！你最近怎么样？', '好久不见。')).toBe('＿＿！你最近怎么样？');
    expect(maskZh('嘿，最近怎么样？', '最近怎么样？／还好吗？')).toBe('嘿，＿＿？');
    expect(maskZh('不相关的句子', '好')).toBe('不相关的句子');
  });
});

describe('chunkDistractors', () => {
  it('never includes the answer, repeats, or overlapping wordings (all 250 chunks, seeded)', () => {
    for (const c of CHUNKS) {
      const rng = seededRng(c.id.charCodeAt(1) * 1000 + Number(c.id.slice(1)));
      const turn = exampleTurn(c.examples[0], c.en);
      const d = chunkDistractors(c, CHUNKS, 3, rng, turn.en);
      expect(d, c.id).toHaveLength(3);
      const keys = d.map((x) => normalizeEn(chunkCore(x.en)));
      expect(new Set(keys).size).toBe(3);
      expect(keys).not.toContain(normalizeEn(chunkCore(c.en)));
      expect(d.map((x) => x.id)).not.toContain(c.id);
      for (const x of d) expect(findChunkRange(turn.en, x.en), `${c.id} vs ${x.id}`).toBeNull();
    }
  });

  it('is deterministic for a seeded rng and prefers the same category', () => {
    const c = chunk('c001');
    const a = chunkDistractors(c, CHUNKS, 3, seededRng(7));
    const b = chunkDistractors(c, CHUNKS, 3, seededRng(7));
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a.filter((x) => x.category === c.category).length).toBeGreaterThanOrEqual(2);
  });

  it('returns fewer when the pool is too small', () => {
    const c = chunk('c001');
    expect(chunkDistractors(c, [c, chunk('c002')], 3)).toHaveLength(1);
    expect(chunkDistractors(c, [c], 3)).toEqual([]);
  });
});

describe('frame listening options', () => {
  it('gives 4 distinct sentences that differ from the answer in exactly one slot (all seed frames)', () => {
    for (const f of SEED_FRAMES) {
      const answer = randomCombo(f, seededRng(f.id.length * 31 + Number(f.id.slice(1))));
      const { combos, slotKey } = frameListenCombos(f, answer, 4, seededRng(3));
      expect(combos[0]).toBe(answer);
      expect(new Set(combos.map((c) => normalizeEn(c.en))).size, f.id).toBe(combos.length);
      expect(combos.length, f.id).toBe(4);
      expect(slotKey).toBeDefined();
      for (const c of combos.slice(1)) {
        const diff = Object.keys(c.picks).filter((k) => c.picks[k] !== answer.picks[k]);
        expect(diff, f.id).toHaveLength(1);
      }
    }
  });

  it('degrades gracefully for a frame with one swappable option', () => {
    const f: SubstitutionFrame = {
      id: 'x',
      title: 't',
      pattern: 'Hello {name}.',
      patternZh: '你好{name}。',
      slots: [{ key: 'name', labelZh: '名字', options: [{ en: 'Tom', zh: '汤姆' }] }],
      grammar: [],
      scene: 'daily',
      level: 1,
      examples: [],
      source: 'user',
    };
    const { combos, slotKey } = frameListenCombos(f, buildCombo(f, {}), 4);
    expect(combos).toHaveLength(1);
    expect(slotKey).toBeUndefined();
  });
});

describe('buildListenQuestion', () => {
  it('chunk: the answer is one of 4 options, the sentence contains the chunk, no distractor is in the sentence', () => {
    const c = chunk('c003');
    const q = buildListenQuestion({ kind: 'chunk', chunk: c }, CHUNKS, seededRng(5));
    expect(q.options).toHaveLength(4);
    expect(q.options.filter((o) => o.id === q.answerId)).toHaveLength(1);
    expect(q.answerId).toBe(c.id);
    expect(findChunkRange(q.sentence, c.en)).not.toBeNull();
    expect(q.highlight.toLowerCase()).toContain('long time no see');
    expect(new Set(q.options.map((o) => o.text)).size).toBe(4);
  });

  it('frame: options are sentences of the frame, the answer is the played sentence', () => {
    const f = SEED_FRAMES[0];
    const q = buildListenQuestion({ kind: 'frame', frame: f }, CHUNKS, seededRng(9));
    expect(q.options).toHaveLength(4);
    expect(q.options.map((o) => o.id)).toContain(q.answerId);
    expect(q.sentence).toBe(q.answerId);
    expect(q.sentence).toContain(q.highlight);
  });
});

describe('matchChunkSpoken', () => {
  it('accepts the chunk alone, with different case/punctuation, or inside a longer utterance', () => {
    expect(matchChunkSpoken('long time no see', 'Long time no see.').matched).toBe(true);
    expect(matchChunkSpoken('I was wondering if you could help me', 'I was wondering if …').matched).toBe(true);
    expect(matchChunkSpoken('well um long time no see mike', 'Long time no see.').matched).toBe(true);
    expect(matchChunkSpoken(['no see', 'long time no see'], 'Long time no see.').matched).toBe(true);
  });

  it('rejects other phrases and silence', () => {
    expect(matchChunkSpoken('nice to meet you', 'Long time no see.').matched).toBe(false);
    expect(matchChunkSpoken('', 'Long time no see.').matched).toBe(false);
    expect(matchChunkSpoken('long time', 'Long time no see.').matched).toBe(false);
  });
});

describe('grading', () => {
  it('listen / recall points', () => {
    expect(listenPoints({ correct: true, replays: 0 })).toBe(2);
    expect(listenPoints({ correct: true, replays: 2 })).toBe(1);
    expect(listenPoints({ correct: false, replays: 0 })).toBe(0);
    expect(recallPoints({ correct: true, ms: 2900 }, 6000)).toBe(2);
    expect(recallPoints({ correct: true, ms: 3100 }, 6000)).toBe(1);
    expect(recallPoints({ correct: false, ms: 100 }, 6000)).toBe(0);
  });

  it('chunkGrade maps 0 / 1-2 / 3 / 4 points to 0 / 1 / 2 / 3', () => {
    const L = (correct: boolean, replays = 0) => ({ correct, replays });
    const R = (correct: boolean, ms: number) => ({ correct, ms });
    expect(chunkGrade(L(false), R(false, 6000), 6000)).toBe(0);
    expect(chunkGrade(L(true), R(false, 6000), 6000)).toBe(1);
    expect(chunkGrade(L(false), R(true, 5000), 6000)).toBe(1);
    expect(chunkGrade(L(true), R(true, 5000), 6000)).toBe(2);
    expect(chunkGrade(L(true, 1), R(true, 2000), 6000)).toBe(2);
    expect(chunkGrade(L(true), R(true, 2000), 6000)).toBe(3);
  });

  it('frameGrade lowers the swap grade by one after a wrong listen', () => {
    expect(frameGrade({ correct: true }, 3)).toBe(3);
    expect(frameGrade({ correct: false }, 3)).toBe(2);
    expect(frameGrade({ correct: false }, 0)).toBe(0);
  });

  it('frameReviewGrade', () => {
    expect(frameReviewGrade([{ correct: true, ms: 1000 }, { correct: true, ms: 3000 }], 8000)).toBe(3);
    expect(frameReviewGrade([{ correct: true, ms: 3000 }, { correct: true, ms: 6000 }], 8000)).toBe(2);
    expect(frameReviewGrade([{ correct: true, ms: 1000 }, { correct: false, ms: 8000 }], 8000)).toBe(1);
    expect(frameReviewGrade([{ correct: false, ms: 8000 }, { correct: false, ms: 8000 }], 8000)).toBe(0);
    expect(frameReviewGrade([], 8000)).toBe(0);
  });
});
