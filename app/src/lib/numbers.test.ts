import { describe, expect, it } from 'vitest';
import {
  NUMBER_KINDS,
  checkNumberAnswer,
  makeNumberItem,
  makeNumberSet,
  numberToWords,
  ordinalToWords,
  type NumberItem,
  type NumberKind,
} from './numbers';

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

const item = (kind: NumberKind, answer: string, accept: string[] = [answer]): NumberItem => ({
  kind,
  answer,
  accept,
  spoken: '',
  promptZh: '',
});

describe('number words', () => {
  it('spells numbers in American English', () => {
    expect(numberToWords(0)).toBe('zero');
    expect(numberToWords(14)).toBe('fourteen');
    expect(numberToWords(40)).toBe('forty');
    expect(numberToWords(45)).toBe('forty-five');
    expect(numberToWords(100)).toBe('one hundred');
    expect(numberToWords(128)).toBe('one hundred twenty-eight');
    expect(numberToWords(1250)).toBe('one thousand two hundred fifty');
    expect(numberToWords(9999)).toBe('nine thousand nine hundred ninety-nine');
  });
  it('spells ordinals 1-31', () => {
    expect(ordinalToWords(1)).toBe('first');
    expect(ordinalToWords(12)).toBe('twelfth');
    expect(ordinalToWords(20)).toBe('twentieth');
    expect(ordinalToWords(21)).toBe('twenty-first');
    expect(ordinalToWords(30)).toBe('thirtieth');
    expect(ordinalToWords(31)).toBe('thirty-first');
  });
});

describe('makeNumberItem', () => {
  it.each(NUMBER_KINDS)('%s: complete, deterministic items over many seeds', (kind) => {
    for (let seed = 1; seed <= 300; seed++) {
      const a = makeNumberItem(kind, rngFrom(seed));
      expect(a).toEqual(makeNumberItem(kind, rngFrom(seed)));
      expect(a.kind).toBe(kind);
      expect(a.spoken.trim()).not.toBe('');
      expect(a.answer.trim()).not.toBe('');
      expect(a.promptZh).toMatch(/[一-鿿]/);
      expect(a.accept).toContain(a.answer);
      // the canonical answer and every accepted form are accepted by the checker...
      for (const x of a.accept) expect(checkNumberAnswer(x, a), `${kind} ${a.spoken} <- ${x}`).toBe(true);
      // ...and so is the spoken text read back as words (what the TTS said)
      expect(checkNumberAnswer(a.spoken, a), `${kind} spoken "${a.spoken}" vs ${a.answer}`).toBe(true);
    }
  });

  it('survives rng returning the extremes', () => {
    for (const kind of NUMBER_KINDS) {
      for (const v of [0, 0.999999999]) {
        const a = makeNumberItem(kind, () => v);
        expect(a.spoken).not.toBe('');
        expect(checkNumberAnswer(a.answer, a)).toBe(true);
      }
    }
  });

  it('price: natural phrasing and format', () => {
    const seen = new Set<string>();
    for (let s = 1; s <= 200; s++) {
      const a = makeNumberItem('price', rngFrom(s));
      expect(a.answer).toMatch(/^\$\d+(\.\d{2})?$/);
      seen.add(/dollar/.test(a.spoken) ? 'long' : 'casual');
    }
    expect(seen).toEqual(new Set(['long', 'casual']));
  });

  it('time: answer is H:MM on a 12-hour clock', () => {
    for (let s = 1; s <= 200; s++) {
      const a = makeNumberItem('time', rngFrom(s));
      const m = /^(\d{1,2}):(\d{2})$/.exec(a.answer);
      expect(m, a.answer).not.toBeNull();
      expect(Number(m?.[1])).toBeGreaterThanOrEqual(1);
      expect(Number(m?.[1])).toBeLessThanOrEqual(12);
      expect(Number(m?.[2])).toBeLessThan(60);
    }
  });

  it('time: produces the natural spoken styles', () => {
    const styles = new Set<string>();
    for (let s = 1; s <= 500; s++) {
      const sp = makeNumberItem('time', rngFrom(s)).spoken;
      if (/quarter to/.test(sp)) styles.add('quarter to');
      if (/quarter past/.test(sp)) styles.add('quarter past');
      if (/half past/.test(sp)) styles.add('half past');
      if (/o'clock/.test(sp)) styles.add("o'clock");
      if (/ to /.test(sp) && !/quarter/.test(sp)) styles.add('x to');
    }
    expect([...styles].sort()).toEqual(["o'clock", 'half past', 'quarter past', 'quarter to', 'x to'].sort());
  });

  it('date: "May twenty-first" style with valid days', () => {
    const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    for (let s = 1; s <= 200; s++) {
      const a = makeNumberItem('date', rngFrom(s));
      const m = /^([A-Za-z]+) (\d+)$/.exec(a.answer);
      expect(m).not.toBeNull();
      const mi = months.indexOf(m?.[1] ?? '');
      expect(mi).toBeGreaterThanOrEqual(0);
      expect(Number(m?.[2])).toBeLessThanOrEqual(days[mi]);
    }
  });

  it('phone: 10 digits, spoken in 3 comma-separated groups', () => {
    const a = makeNumberItem('phone', rngFrom(5));
    expect(a.answer).toMatch(/^[2-9]\d{2}-\d{3}-\d{4}$/);
    expect(a.spoken.split(', ')).toHaveLength(3);
    expect(a.accept).toContain(a.answer.replace(/-/g, ''));
  });

  it('year: between 1950 and 2035', () => {
    for (let s = 1; s <= 200; s++) {
      const y = Number(makeNumberItem('year', rngFrom(s)).answer);
      expect(y).toBeGreaterThanOrEqual(1950);
      expect(y).toBeLessThanOrEqual(2035);
    }
  });

  it('quantity: whole numbers, thousands get a comma form', () => {
    let big: NumberItem | undefined;
    for (let s = 1; s <= 300 && !big; s++) {
      const a = makeNumberItem('quantity', rngFrom(s));
      expect(a.answer).toMatch(/^\d+$/);
      if (Number(a.answer) >= 1000) big = a;
    }
    expect(big?.accept).toContain(Number(big?.answer).toLocaleString('en-US'));
  });

  it('teens vs tens (13/30 ...) show up regularly', () => {
    let confusable = 0;
    for (let s = 1; s <= 300; s++) {
      const n = Number(makeNumberItem('quantity', rngFrom(s)).answer);
      if ((n >= 13 && n <= 19) || (n >= 30 && n <= 90 && n % 10 === 0)) confusable++;
    }
    expect(confusable).toBeGreaterThan(40);
  });
});

describe('makeNumberSet', () => {
  it('cycles through kinds without repeating a kind back to back', () => {
    const set = makeNumberSet(6, rngFrom(3));
    expect(set).toHaveLength(6);
    expect(new Set(set.map((i) => i.kind)).size).toBe(6);
    expect(makeNumberSet(3, rngFrom(3), ['price', 'time'])).toHaveLength(3);
    expect(makeNumberSet(0, rngFrom(3))).toEqual([]);
  });
});

describe('checkNumberAnswer: prices', () => {
  const p = item('price', '$14.99', ['$14.99', '14.99']);
  it.each(['$14.99', '14.99', '14,99', ' $14.99 ', '14.99 dollars', 'fourteen ninety-nine', 'fourteen ninety nine', 'fourteen dollars and ninety-nine cents', '$ 14.99'])(
    'accepts %j',
    (x) => expect(checkNumberAnswer(x, p)).toBe(true),
  );
  it.each(['$14.90', '14', '1499', '$15.99', '$40.99', '', '   ', 'abc'])('rejects %j', (x) => expect(checkNumberAnswer(x, p)).toBe(false));

  it('whole dollars, tenths and thousands', () => {
    const w = item('price', '$20', ['$20', '20', '$20.00', '20.00']);
    for (const x of ['$20', '20', '20.00', '$20.00', 'twenty dollars', 'twenty']) expect(checkNumberAnswer(x, w)).toBe(true);
    expect(checkNumberAnswer('$2', w)).toBe(false);
    expect(checkNumberAnswer('$20.5', w)).toBe(false);
    const fifty = item('price', '$3.50');
    expect(checkNumberAnswer('3.5', fifty)).toBe(true); // one decimal digit = tenths
    expect(checkNumberAnswer('3.05', fifty)).toBe(false);
    const oh = item('price', '$3.05');
    expect(checkNumberAnswer('three oh five', oh)).toBe(true);
    expect(checkNumberAnswer('3.05', oh)).toBe(true);
    expect(checkNumberAnswer('3.5', oh)).toBe(false);
    const big = item('price', '$1299.00');
    expect(checkNumberAnswer('1,299', big)).toBe(true);
    expect(checkNumberAnswer('$1,299.00', big)).toBe(true);
  });
});

describe('checkNumberAnswer: times', () => {
  const t = item('time', '7:45', ['7:45', '7.45', '745']);
  it.each(['7:45', '7.45', '745', '07:45', '7 45', 'seven forty-five', 'seven forty five', 'a quarter to eight', 'quarter to 8', 'fifteen to eight', '7:45 pm', '19:45'])(
    'accepts %j',
    (x) => expect(checkNumberAnswer(x, t)).toBe(true),
  );
  it.each(['7:54', '8:45', '7:15', 'a quarter past seven', '7', '', 'seven'])('rejects %j', (x) => expect(checkNumberAnswer(x, t)).toBe(false));

  it('quarter past, half past, minutes past/to, o\'clock, oh', () => {
    expect(checkNumberAnswer('a quarter past five', item('time', '5:15'))).toBe(true);
    expect(checkNumberAnswer('five fifteen', item('time', '5:15'))).toBe(true);
    expect(checkNumberAnswer('half past three', item('time', '3:30'))).toBe(true);
    expect(checkNumberAnswer('three thirty', item('time', '3:30'))).toBe(true);
    expect(checkNumberAnswer('ten past nine', item('time', '9:10'))).toBe(true);
    expect(checkNumberAnswer('twenty to six', item('time', '5:40'))).toBe(true);
    expect(checkNumberAnswer('twenty-five to six', item('time', '5:35'))).toBe(true);
    expect(checkNumberAnswer("five o'clock", item('time', '5:00'))).toBe(true);
    expect(checkNumberAnswer('5', item('time', '5:00'))).toBe(true);
    expect(checkNumberAnswer('seven oh five', item('time', '7:05'))).toBe(true);
    expect(checkNumberAnswer('7:05', item('time', '7:05'))).toBe(true);
    expect(checkNumberAnswer('a quarter to one', item('time', '12:45'))).toBe(true);
    expect(checkNumberAnswer('twelve forty-five', item('time', '12:45'))).toBe(true);
    expect(checkNumberAnswer('twelve fifteen', item('time', '12:15'))).toBe(true);
  });
});

describe('checkNumberAnswer: dates', () => {
  const d = item('date', 'May 21', ['May 21', '5/21', '21 May', 'May 21st']);
  it.each(['May 21', 'may 21', 'May 21st', '5/21', '21 May', 'May twenty-first', 'may twenty first', 'the twenty-first of May', 'the 21st of May', 'May 21, 2026'])(
    'accepts %j',
    (x) => expect(checkNumberAnswer(x, d)).toBe(true),
  );
  it.each(['May 12', 'June 21', '21/5', '5/12', '21', 'May', '', 'twenty-first'])('rejects %j', (x) => {
    // 21/5 is read as 21 May by the day-first swap, so it is correct; everything else is wrong
    expect(checkNumberAnswer(x, d)).toBe(x === '21/5');
  });
  it('knows month abbreviations and ordinals', () => {
    expect(checkNumberAnswer('Sep 3', item('date', 'September 3'))).toBe(true);
    expect(checkNumberAnswer('Sept third', item('date', 'September 3'))).toBe(true);
    expect(checkNumberAnswer('March thirtieth', item('date', 'March 30'))).toBe(true);
    expect(checkNumberAnswer('December 31st', item('date', 'December 31'))).toBe(true);
    expect(checkNumberAnswer('February thirty', item('date', 'February 28'))).toBe(false);
  });
});

describe('checkNumberAnswer: phone numbers', () => {
  const ph = item('phone', '555-213-4088', ['555-213-4088', '5552134088', '(555) 213-4088']);
  it.each([
    '555-213-4088',
    '5552134088',
    '(555) 213-4088',
    '555 213 4088',
    '555.213.4088',
    '1-555-213-4088',
    'five five five, two one three, four zero eight eight',
    'five five five two one three four oh eight eight',
  ])('accepts %j', (x) => expect(checkNumberAnswer(x, ph)).toBe(true));
  it.each(['555-213-4089', '555-213-408', '213-4088', '', '555-213-40888'])('rejects %j', (x) => expect(checkNumberAnswer(x, ph)).toBe(false));
});

describe('checkNumberAnswer: quantities and years', () => {
  it('quantities accept digits, commas and words', () => {
    const q = item('quantity', '1250', ['1250', '1,250']);
    for (const x of ['1250', '1,250', 'one thousand two hundred fifty', 'twelve hundred fifty']) expect(checkNumberAnswer(x, q)).toBe(true);
    for (const x of ['125', '12500', '1,205', 'one thousand two hundred fifteen']) expect(checkNumberAnswer(x, q)).toBe(false);
    expect(checkNumberAnswer('forty', item('quantity', '40'))).toBe(true);
    expect(checkNumberAnswer('fourteen', item('quantity', '40'))).toBe(false);
    expect(checkNumberAnswer('340 people', item('quantity', '340'))).toBe(true);
    expect(checkNumberAnswer('three hundred forty', item('quantity', '340'))).toBe(true);
    expect(checkNumberAnswer('three hundred and forty', item('quantity', '340'))).toBe(true);
    expect(checkNumberAnswer('1 2', item('quantity', '12'))).toBe(false);
  });

  it('years accept digits and every spoken style', () => {
    const y = (a: string) => item('year', a);
    expect(checkNumberAnswer('nineteen eighty-five', y('1985'))).toBe(true);
    expect(checkNumberAnswer('1985', y('1985'))).toBe(true);
    expect(checkNumberAnswer('nineteen eighty five', y('1985'))).toBe(true);
    expect(checkNumberAnswer('twenty twenty-six', y('2026'))).toBe(true);
    expect(checkNumberAnswer('two thousand twenty-six', y('2026'))).toBe(true);
    expect(checkNumberAnswer('two thousand five', y('2005'))).toBe(true);
    expect(checkNumberAnswer('two thousand and five', y('2005'))).toBe(true);
    expect(checkNumberAnswer('twenty oh five', y('2005'))).toBe(true);
    expect(checkNumberAnswer('nineteen oh five', y('1905'))).toBe(true);
    expect(checkNumberAnswer('two thousand', y('2000'))).toBe(true);
    expect(checkNumberAnswer('nineteen eighty-four', y('1985'))).toBe(false);
    expect(checkNumberAnswer('1958', y('1985'))).toBe(false);
  });
});
