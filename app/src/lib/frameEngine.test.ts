import { describe, expect, it } from 'vitest';
import type { SubstitutionFrame } from '../types';
import {
  buildCombo,
  compareAnswer,
  countCombos,
  normalizeEn,
  randomCombo,
  singleSwapSequence,
} from './frameEngine';

const FRAME: SubstitutionFrame = {
  id: 'f-test',
  title: '表达打算',
  pattern: '{subject} {aux} {verb} {object} {time}.',
  patternZh: '{subject}{time}{aux}{verb}{object}。',
  slots: [
    {
      key: 'subject',
      labelZh: '主语',
      options: [
        { en: 'I', zh: '我' },
        { en: 'she', zh: '她' },
        { en: 'they', zh: '他们' },
      ],
    },
    {
      key: 'aux',
      labelZh: '助动词',
      options: [
        { en: 'will', zh: '会' },
        { en: 'must', zh: '必须' },
      ],
    },
    {
      key: 'verb',
      labelZh: '动词',
      options: [
        { en: 'send', zh: '发送' },
        { en: 'review', zh: '审阅' },
        { en: 'finish', zh: '完成' },
      ],
    },
    {
      key: 'object',
      labelZh: '宾语',
      options: [
        { en: 'the report', zh: '报告' },
        { en: 'the email', zh: '邮件' },
      ],
    },
    {
      key: 'time',
      labelZh: '时间',
      options: [
        { en: 'tomorrow', zh: '明天' },
        { en: '', zh: '' },
        { en: 'today', zh: '今天' },
      ],
    },
  ],
  grammar: ['modal-must'],
  scene: 'work',
  level: 1,
  examples: [
    { en: 'I will send the report tomorrow.', zh: '我明天会发送报告。' },
    { en: 'She must finish the email.', zh: '她必须完成邮件。' },
  ],
  source: 'seed',
};

/** Deterministic pseudo-random generator (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('countCombos', () => {
  it('multiplies option counts', () => {
    expect(countCombos(FRAME)).toBe(3 * 2 * 3 * 2 * 3);
  });
  it('is 1 for a frame with no slots', () => {
    expect(countCombos({ ...FRAME, slots: [] })).toBe(1);
  });
});

describe('buildCombo', () => {
  it('fills English and Chinese patterns, capitalising the sentence', () => {
    const c = buildCombo(FRAME, { subject: 1, aux: 0, verb: 2, object: 1, time: 0 });
    expect(c.en).toBe('She will finish the email tomorrow.');
    expect(c.zh).toBe('她明天会完成邮件。');
    expect(c.frameId).toBe('f-test');
    expect(c.picks).toEqual({ subject: 1, aux: 0, verb: 2, object: 1, time: 0 });
  });

  it('tidies the space left by an empty option', () => {
    const c = buildCombo(FRAME, { subject: 0, aux: 1, verb: 0, object: 0, time: 1 });
    expect(c.en).toBe('I must send the report.');
    expect(c.zh).toBe('我必须发送报告。');
  });

  it('keeps a leading "I" and capitalises a lowercase first word', () => {
    const c = buildCombo(FRAME, { subject: 2, aux: 0, verb: 0, object: 0, time: 2 });
    expect(c.en.startsWith('They ')).toBe(true);
  });

  it('removes space before ? and , and collapses double spaces', () => {
    const f: SubstitutionFrame = {
      ...FRAME,
      pattern: '{aux}  {subject} {verb} {object} , {time} ?',
      patternZh: '{subject}{verb}{object}？',
    };
    const c = buildCombo(f, { subject: 0, aux: 0, verb: 0, object: 0, time: 0 });
    expect(c.en).toBe('Will I send the report, tomorrow?');
  });

  it('falls back to option 0 for missing or invalid picks', () => {
    const c = buildCombo(FRAME, { subject: 99 });
    expect(c.picks).toEqual({ subject: 0, aux: 0, verb: 0, object: 0, time: 0 });
    expect(c.en).toBe('I will send the report tomorrow.');
  });

  it('every combination is tidy (no double spaces, no space before punctuation)', () => {
    const rng = seeded(7);
    for (let i = 0; i < 100; i++) {
      const c = randomCombo(FRAME, rng);
      expect(c.en).not.toMatch(/\s{2,}/);
      expect(c.en).not.toMatch(/\s[.,?!]/);
      expect(c.en[0]).toBe(c.en[0].toUpperCase());
      expect(c.zh).not.toMatch(/\s/);
    }
  });
});

describe('randomCombo', () => {
  it('is deterministic with an injected rng', () => {
    const a = randomCombo(FRAME, seeded(42));
    const b = randomCombo(FRAME, seeded(42));
    expect(a).toEqual(b);
  });
  it('stays within option bounds even if rng returns 0.999...', () => {
    const c = randomCombo(FRAME, () => 0.9999999);
    for (const s of FRAME.slots) expect(c.picks[s.key]).toBe(s.options.length - 1);
  });
  it('picks the first options when rng returns 0', () => {
    const c = randomCombo(FRAME, () => 0);
    for (const s of FRAME.slots) expect(c.picks[s.key]).toBe(0);
  });
});

describe('singleSwapSequence', () => {
  function diffSlots(a: Record<string, number>, b: Record<string, number>): string[] {
    return Object.keys(a).filter((k) => a[k] !== b[k]);
  }

  it('returns the requested length', () => {
    expect(singleSwapSequence(FRAME, 8, seeded(1))).toHaveLength(8);
    expect(singleSwapSequence(FRAME, 1, seeded(1))).toHaveLength(1);
    expect(singleSwapSequence(FRAME, 0, seeded(1))).toEqual([]);
  });

  it('consecutive combos differ in exactly one slot', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const seq = singleSwapSequence(FRAME, 25, seeded(seed));
      for (let i = 1; i < seq.length; i++) {
        expect(diffSlots(seq[i - 1].picks, seq[i].picks)).toHaveLength(1);
        expect(seq[i].en).not.toBe(seq[i - 1].en);
      }
    }
  });

  it('is deterministic with an injected rng', () => {
    expect(singleSwapSequence(FRAME, 10, seeded(5))).toEqual(singleSwapSequence(FRAME, 10, seeded(5)));
  });

  it('works when only one slot can change', () => {
    const f: SubstitutionFrame = {
      ...FRAME,
      slots: FRAME.slots.map((s, i) => (i === 0 ? s : { ...s, options: s.options.slice(0, 1) })),
    };
    const seq = singleSwapSequence(f, 6, seeded(3));
    for (let i = 1; i < seq.length; i++) {
      expect(diffSlots(seq[i - 1].picks, seq[i].picks)).toEqual(['subject']);
    }
  });

  it('does not loop forever when nothing can change', () => {
    const f: SubstitutionFrame = { ...FRAME, slots: FRAME.slots.map((s) => ({ ...s, options: s.options.slice(0, 1) })) };
    expect(singleSwapSequence(f, 4, seeded(3))).toHaveLength(4);
  });
});

describe('normalizeEn', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeEn('  Hello,   World!  ')).toBe('hello world');
    expect(normalizeEn('Is the apple red?')).toBe('is the apple red');
  });

  it('expands contractions', () => {
    expect(normalizeEn("I'm")).toBe('i am');
    expect(normalizeEn("You're late")).toBe('you are late');
    expect(normalizeEn("He's here")).toBe('he is here');
    expect(normalizeEn("She's here")).toBe('she is here');
    expect(normalizeEn("It's red")).toBe('it is red');
    expect(normalizeEn("I can't eat the apple.")).toBe('i cannot eat the apple');
    expect(normalizeEn("I won't go")).toBe('i will not go');
    expect(normalizeEn("They don't know")).toBe('they do not know');
    expect(normalizeEn("She doesn't know")).toBe('she does not know');
    expect(normalizeEn("It isn't red")).toBe('it is not red');
    expect(normalizeEn("They aren't red")).toBe('they are not red');
    expect(normalizeEn("I've eaten")).toBe('i have eaten');
    expect(normalizeEn("I'll go")).toBe('i will go');
    expect(normalizeEn("I'd go")).toBe('i would go');
  });

  it('treats curly quotes like straight quotes', () => {
    expect(normalizeEn('I’m sure it’s fine')).toBe('i am sure it is fine');
    expect(normalizeEn('I can’t')).toBe('i cannot');
  });

  it('keeps possessives as one token', () => {
    expect(normalizeEn("It is John's apple.")).toBe('it is johns apple');
  });

  it('makes contracted and expanded forms equal', () => {
    expect(normalizeEn("I'm going to know tomorrow.")).toBe(normalizeEn('I am going to know tomorrow'));
    expect(normalizeEn('I can not go')).toBe(normalizeEn("I can't go"));
  });

  it('handles empty input', () => {
    expect(normalizeEn('')).toBe('');
    expect(normalizeEn('  ?! ')).toBe('');
  });
});

describe('compareAnswer', () => {
  it('detects an exact match ignoring case, punctuation and contractions', () => {
    const r = compareAnswer("i'm going to know tomorrow", 'I am going to know tomorrow.');
    expect(r.exact).toBe(true);
    expect(r.similarity).toBe(1);
    expect(r.tokens.every((t) => t.status === 'ok')).toBe(true);
  });

  it('flags missing tokens', () => {
    const r = compareAnswer('I give John apple', 'I give John the apple');
    expect(r.exact).toBe(false);
    expect(r.tokens.filter((t) => t.status === 'missing').map((t) => t.text)).toEqual(['the']);
    expect(r.tokens.filter((t) => t.status === 'extra')).toHaveLength(0);
    expect(r.similarity).toBeCloseTo((2 * 4) / (4 + 5), 5);
  });

  it('flags extra tokens', () => {
    const r = compareAnswer('The apple is very red', 'The apple is red');
    expect(r.tokens.filter((t) => t.status === 'extra').map((t) => t.text)).toEqual(['very']);
    expect(r.tokens.filter((t) => t.status === 'missing')).toHaveLength(0);
    expect(r.similarity).toBeCloseTo((2 * 4) / (5 + 4), 5);
  });

  it('flags a substituted word as missing + extra', () => {
    const r = compareAnswer('She give it to him', 'She gives it to him');
    expect(r.tokens.find((t) => t.status === 'missing')?.text).toBe('gives');
    expect(r.tokens.find((t) => t.status === 'extra')?.text).toBe('give');
    expect(r.similarity).toBeCloseTo((2 * 4) / 10, 5);
  });

  it('reconstructs both sentences from the token list', () => {
    const user = 'we gives him apple the';
    const target = 'we give him the apple';
    const r = compareAnswer(user, target);
    const targetTokens = r.tokens.filter((t) => t.status !== 'extra').map((t) => t.text);
    const userTokens = r.tokens.filter((t) => t.status !== 'missing').map((t) => t.text);
    expect(targetTokens.join(' ')).toBe(normalizeEn(target));
    expect(userTokens.join(' ')).toBe(normalizeEn(user));
  });

  it('is 0 for completely different, 0 for empty answer, 1 for both empty', () => {
    expect(compareAnswer('foo bar', 'baz qux').similarity).toBe(0);
    const e = compareAnswer('', 'the apple is red');
    expect(e.similarity).toBe(0);
    expect(e.exact).toBe(false);
    expect(e.tokens.every((t) => t.status === 'missing')).toBe(true);
    expect(compareAnswer('', '').similarity).toBe(1);
  });
});
