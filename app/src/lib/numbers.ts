// Procedurally generated listening items for numbers: prices, times, dates, phone numbers, quantities and years.
// `spoken` is what the TTS reads (natural American phrasing); the learner types what they heard.

export type NumberKind = 'price' | 'time' | 'date' | 'phone' | 'quantity' | 'year';

export const NUMBER_KINDS: readonly NumberKind[] = ['price', 'time', 'date', 'phone', 'quantity', 'year'];

export interface NumberItem {
  kind: NumberKind;
  /** Text for the TTS, e.g. "fourteen ninety-nine". */
  spoken: string;
  /** Canonical written answer, e.g. "$14.99". */
  answer: string;
  /** Equivalent written answers that are accepted verbatim (checkNumberAnswer accepts more). */
  accept: string[];
  promptZh: string;
}

export type Rng = () => number;

// ---------- words <-> numbers ----------

const ONES_W = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS_W = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORD_W = [
  '', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh',
  'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth',
];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November',
  'December',
];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** 0-999,999 in American English without "and": 128 -> "one hundred twenty-eight". */
export function numberToWords(n: number): string {
  if (n < 20) return ONES_W[n];
  if (n < 100) return TENS_W[Math.floor(n / 10)] + (n % 10 ? `-${ONES_W[n % 10]}` : '');
  if (n < 1000) return `${ONES_W[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberToWords(n % 100)}` : ''}`;
  return `${numberToWords(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${numberToWords(n % 1000)}` : ''}`;
}

/** 1-31 as an ordinal: 21 -> "twenty-first". */
export function ordinalToWords(n: number): string {
  if (n < 20) return ORD_W[n];
  if (n === 20) return 'twentieth';
  if (n === 30) return 'thirtieth';
  return `${TENS_W[Math.floor(n / 10)]}-${ORD_W[n % 10]}`;
}

type NumClass = 'ones' | 'teens' | 'tens' | 'hundred' | 'thousand' | 'zero';

const WORD_VALUES = new Map<string, { cls: NumClass; v: number }>();
(() => {
  const add = (w: string, cls: NumClass, v: number): void => void WORD_VALUES.set(w, { cls, v });
  add('zero', 'zero', 0);
  add('oh', 'zero', 0);
  for (let i = 1; i <= 9; i++) add(ONES_W[i], 'ones', i);
  for (let i = 10; i <= 19; i++) add(ONES_W[i], 'teens', i);
  for (let i = 2; i <= 9; i++) add(TENS_W[i], 'tens', i * 10);
  for (let i = 1; i <= 9; i++) add(ORD_W[i], 'ones', i);
  for (let i = 10; i <= 19; i++) add(ORD_W[i], 'teens', i);
  add('twentieth', 'tens', 20);
  add('thirtieth', 'tens', 30);
  add('hundred', 'hundred', 100);
  add('thousand', 'thousand', 1000);
})();

type Tok = { t: 'num'; v: number; raw: string } | { t: 'word'; w: string };

/**
 * Splits text into numbers and other words. Number words are combined ("forty-five" -> 45,
 * "one thousand two hundred fifty" -> 1250) but not across natural boundaries ("seven forty-five" -> 7, 45).
 * Digit runs keep their raw text (for leading zeros, phone numbers); "21st" counts as 21.
 */
function tokenize(text: string): Tok[] {
  const s = text.toLowerCase().replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
  const out: Tok[] = [];
  let total = 0;
  let chunk = 0;
  let has = false;
  let last: NumClass | '' = '';
  const flush = (): void => {
    if (has) out.push({ t: 'num', v: total + chunk, raw: String(total + chunk) });
    total = 0;
    chunk = 0;
    has = false;
    last = '';
  };
  for (const p of s.split(/[^a-z0-9']+/).filter((x) => x !== '')) {
    const digits = /^(\d+)(?:st|nd|rd|th)?$/.exec(p);
    if (digits) {
      flush();
      out.push({ t: 'num', v: Number(digits[1]), raw: digits[1] });
      continue;
    }
    if (p === 'and') continue;
    const w = WORD_VALUES.get(p);
    if (!w) {
      flush();
      out.push({ t: 'word', w: p });
      continue;
    }
    switch (w.cls) {
      case 'zero':
        flush();
        out.push({ t: 'num', v: 0, raw: '0' });
        break;
      case 'ones':
        if (has && (last === 'tens' || last === 'hundred' || last === 'thousand')) chunk += w.v;
        else {
          flush();
          chunk = w.v;
          has = true;
        }
        last = 'ones';
        break;
      case 'teens':
      case 'tens':
        if (has && (last === 'hundred' || last === 'thousand')) chunk += w.v;
        else {
          flush();
          chunk = w.v;
          has = true;
        }
        last = w.cls;
        break;
      case 'hundred':
        if (has && chunk > 0 && chunk < 100 && (last === 'ones' || last === 'teens' || last === 'tens')) chunk *= 100;
        else {
          flush();
          chunk = 100;
          has = true;
        }
        last = 'hundred';
        break;
      case 'thousand':
        if (has && chunk > 0 && last !== 'thousand') {
          total += chunk * 1000;
          chunk = 0;
        } else {
          flush();
          total = 1000;
          has = true;
        }
        last = 'thousand';
        break;
    }
  }
  flush();
  return out;
}

const numsOf = (toks: Tok[]): Extract<Tok, { t: 'num' }>[] =>
  toks.filter((t): t is Extract<Tok, { t: 'num' }> => t.t === 'num');
const wordsOf = (toks: Tok[]): string[] => toks.flatMap((t) => (t.t === 'word' ? [t.w] : []));

// ---------- parsing a written/spoken answer per kind ----------

/** Total cents of a price, or null. "14.99" "14,99" "$14.99" "fourteen ninety-nine" -> 1499; "twenty dollars" -> 2000. */
function parsePrice(text: string): number | null {
  const dec = /^\$?\s*(\d+)[.,](\d{1,2})\s*(?:dollars?|usd)?$/i.exec(text.trim());
  if (dec) return Number(dec[1]) * 100 + Number(dec[2].padEnd(2, '0'));
  const nums = numsOf(tokenize(text));
  if (nums.length === 1) return nums[0].v * 100;
  if (nums.length === 2 && nums[1].v <= 99) return nums[0].v * 100 + nums[1].v;
  if (nums.length === 3 && nums[1].v === 0 && nums[2].v < 10) return nums[0].v * 100 + nums[2].v; // "three oh five"
  return null;
}

/** Hour 0-11 and minute of a clock time, or null. Accepts 7:45 / 7.45 / 745 / seven forty-five / a quarter to eight. */
function parseTime(text: string): { h: number; m: number } | null {
  const toks = tokenize(text);
  const nums = numsOf(toks).map((n) => n.v);
  const words = wordsOf(toks);
  const norm = (h: number, m: number): { h: number; m: number } | null =>
    h >= 0 && h <= 24 && m >= 0 && m < 60 ? { h: ((h % 12) + 12) % 12, m } : null;

  const rel = words.includes('past') || words.includes('after') ? 'past' : words.includes('to') ? 'to' : null;
  if (rel) {
    let minutes: number | undefined;
    let hour: number | undefined;
    if (words.includes('quarter')) [minutes, hour] = [15, nums[0]];
    else if (words.includes('half')) [minutes, hour] = [30, nums[0]];
    else [minutes, hour] = [nums[0], nums[1]];
    if (minutes === undefined || hour === undefined || minutes < 1 || minutes > 59) return null;
    return rel === 'to' ? norm(hour - 1, 60 - minutes) : norm(hour, minutes);
  }
  if (words.some((w) => w === "o'clock" || w === 'oclock')) return nums.length > 0 ? norm(nums[0], 0) : null;
  if (nums.length === 1) {
    const v = nums[0];
    if (v >= 100) return norm(Math.floor(v / 100), v % 100);
    return norm(v, 0);
  }
  if (nums.length === 2) return norm(nums[0], nums[1]);
  if (nums.length === 3 && nums[1] === 0 && nums[2] < 10) return norm(nums[0], nums[2]); // "seven oh five"
  return null;
}

const MONTH_ALIASES: Record<string, number> = {};
MONTHS.forEach((m, i) => {
  const l = m.toLowerCase();
  MONTH_ALIASES[l] = i + 1;
  MONTH_ALIASES[l.slice(0, 3)] = i + 1;
});
MONTH_ALIASES.sept = 9;

/** Month 1-12 and day of a date, or null. Accepts "May 21", "May 21st", "21 May", "5/21", "May twenty-first". */
function parseDate(text: string): { month: number; day: number } | null {
  const toks = tokenize(text);
  const nums = numsOf(toks).map((n) => n.v);
  const word = wordsOf(toks).find((w) => MONTH_ALIASES[w] !== undefined);
  if (word !== undefined) {
    const day = nums[0];
    return day >= 1 && day <= 31 ? { month: MONTH_ALIASES[word], day } : null;
  }
  if (nums.length >= 2) {
    let [month, day] = nums;
    if (month > 12 && day <= 12) [month, day] = [day, month];
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
  }
  return null;
}

/** Digits of a phone number (every number token concatenated; "oh" counts as 0), or '' . */
function parsePhone(text: string): string {
  return numsOf(tokenize(text))
    .map((n) => n.raw)
    .join('');
}

function parseQuantity(text: string): number | null {
  const nums = numsOf(tokenize(text));
  return nums.length === 1 ? nums[0].v : null;
}

/** "1985" / "nineteen eighty-five" / "twenty twenty-six" / "two thousand five" / "nineteen oh five". */
function parseYear(text: string): number | null {
  const nums = numsOf(tokenize(text)).map((n) => n.v);
  if (nums.length === 1) return nums[0];
  if (nums.length === 2 && nums[0] >= 10 && nums[0] <= 20 && nums[1] <= 99) return nums[0] * 100 + nums[1];
  if (nums.length === 3 && nums[0] >= 10 && nums[0] <= 20 && nums[1] === 0 && nums[2] < 10) return nums[0] * 100 + nums[2];
  return null;
}

/**
 * Lenient check of a typed answer. Accepts any written form that means the same: "$14.99" / "14.99" / "14,99" /
 * "fourteen ninety-nine"; "7:45" / "7.45" / "745" / "seven forty-five" / "a quarter to eight"; "May 21" / "5/21" /
 * "21 May" / "May twenty-first"; phone numbers with any separators or spoken digits; "1,250" / "1250"; years.
 */
export function checkNumberAnswer(input: string, item: NumberItem): boolean {
  const text = input.trim();
  if (text === '') return false;
  const squash = (s: string): string => s.toLowerCase().replace(/\s+/g, '');
  if (item.accept.some((a) => squash(a) === squash(text))) return true;
  switch (item.kind) {
    case 'price': {
      const a = parsePrice(text);
      return a !== null && a === parsePrice(item.answer);
    }
    case 'time': {
      const a = parseTime(text);
      const b = parseTime(item.answer);
      return a !== null && b !== null && a.h === b.h && a.m === b.m;
    }
    case 'date': {
      const a = parseDate(text);
      const b = parseDate(item.answer);
      return a !== null && b !== null && a.month === b.month && a.day === b.day;
    }
    case 'phone': {
      const want = parsePhone(item.answer);
      let got = parsePhone(text);
      if (got.length === want.length + 1 && got.startsWith('1')) got = got.slice(1); // leading country code
      return got !== '' && got === want;
    }
    case 'quantity': {
      const a = parseQuantity(text);
      return a !== null && a === parseQuantity(item.answer);
    }
    case 'year': {
      const a = parseYear(text);
      return a !== null && a === parseYear(item.answer);
    }
  }
}

// ---------- generators ----------

function ri(rng: Rng, lo: number, hi: number): number {
  return lo + Math.min(hi - lo, Math.floor(rng() * (hi - lo + 1)));
}
function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Numbers learners confuse by stress: teens vs tens (13/30 ... 19/90), picked on purpose in a third of the items. */
function confusable(rng: Rng): number {
  return rng() < 0.5 ? ri(rng, 13, 19) : ri(rng, 3, 9) * 10;
}

function makePrice(rng: Rng): NumberItem {
  const dollars = rng() < 0.3 ? confusable(rng) : rng() < 0.7 ? ri(rng, 1, 99) : ri(rng, 100, 450);
  const cents = rng() < 0.2 ? 0 : pick(rng, [50, 99, 95, 49, 75, 25, 99, ri(rng, 1, 99)]);
  let spoken: string;
  if (cents === 0) spoken = `${numberToWords(dollars)} ${dollars === 1 ? 'dollar' : 'dollars'}`;
  else if (dollars < 100 && cents >= 10 && rng() < 0.6) spoken = `${numberToWords(dollars)} ${numberToWords(cents)}`;
  else {
    spoken = `${numberToWords(dollars)} ${dollars === 1 ? 'dollar' : 'dollars'} and ${numberToWords(cents)} ${cents === 1 ? 'cent' : 'cents'}`;
  }
  const answer = cents === 0 ? `$${dollars}` : `$${dollars}.${pad2(cents)}`;
  const accept = cents === 0 ? [answer, String(dollars), `$${dollars}.00`, `${dollars}.00`] : [answer, answer.slice(1)];
  return { kind: 'price', spoken, answer, accept, promptZh: '写出听到的价格（美元）' };
}

function makeTime(rng: Rng): NumberItem {
  const h = ri(rng, 1, 12);
  const m = rng() < 0.7 ? pick(rng, [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]) : ri(rng, 1, 59);
  const next = (h % 12) + 1;
  let spoken: string;
  if (m === 0) spoken = `${numberToWords(h)} o'clock`;
  else if (m === 30 && rng() < 0.5) spoken = `half past ${numberToWords(h)}`;
  else if (m === 15 && rng() < 0.5) spoken = `a quarter past ${numberToWords(h)}`;
  else if (m === 45 && rng() < 0.5) spoken = `a quarter to ${numberToWords(next)}`;
  else if (m % 5 === 0 && m < 30 && rng() < 0.4) spoken = `${numberToWords(m)} past ${numberToWords(h)}`;
  else if (m % 5 === 0 && m > 30 && rng() < 0.4) spoken = `${numberToWords(60 - m)} to ${numberToWords(next)}`;
  else if (m < 10) spoken = `${numberToWords(h)} oh ${numberToWords(m)}`;
  else spoken = `${numberToWords(h)} ${numberToWords(m)}`;
  const answer = `${h}:${pad2(m)}`;
  return {
    kind: 'time',
    spoken,
    answer,
    accept: [answer, `${h}.${pad2(m)}`, `${h}${pad2(m)}`],
    promptZh: '写出听到的时间（几点几分，如 7:45）',
  };
}

function makeDate(rng: Rng): NumberItem {
  const month = ri(rng, 1, 12);
  const day = ri(rng, 1, DAYS_IN_MONTH[month - 1]);
  const name = MONTHS[month - 1];
  const spoken = rng() < 0.4 ? `the ${ordinalToWords(day)} of ${name}` : `${name} ${ordinalToWords(day)}`;
  const answer = `${name} ${day}`;
  return {
    kind: 'date',
    spoken,
    answer,
    accept: [answer, `${month}/${day}`, `${day} ${name}`, `${name} ${day}${ordSuffix(day)}`],
    promptZh: '写出听到的日期（月和日，如 May 21）',
  };
}

function ordSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
}

function makePhone(rng: Rng): NumberItem {
  const digits: number[] = [ri(rng, 2, 9)];
  for (let i = 1; i < 10; i++) digits.push(ri(rng, 0, 9));
  const zero = rng() < 0.3 ? 'oh' : 'zero';
  const say = (d: number): string => (d === 0 ? zero : ONES_W[d]);
  const groups = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)];
  const spoken = groups.map((g) => g.map(say).join(' ')).join(', ');
  const [a, b, c] = groups.map((g) => g.join(''));
  const answer = `${a}-${b}-${c}`;
  return {
    kind: 'phone',
    spoken,
    answer,
    accept: [answer, `${a}${b}${c}`, `(${a}) ${b}-${c}`],
    promptZh: '写出听到的电话号码（10 位数字）',
  };
}

const UNITS = ['people', 'boxes', 'tickets', 'miles', 'students', 'seats', 'calls', 'emails'];

function makeQuantity(rng: Rng): NumberItem {
  const r = rng();
  let n: number;
  if (r < 0.3) n = confusable(rng);
  else if (r < 0.7) n = ri(rng, 20, 999);
  else n = rng() < 0.4 ? ri(rng, 11, 19) * 100 : ri(rng, 1000, 9999);
  const hundreds = n >= 1100 && n <= 1900 && n % 100 === 0 && rng() < 0.5;
  const words = hundreds ? `${numberToWords(n / 100)} hundred` : numberToWords(n);
  const answer = String(n);
  return {
    kind: 'quantity',
    spoken: `${words} ${pick(rng, UNITS)}`,
    answer,
    accept: n >= 1000 ? [answer, n.toLocaleString('en-US')] : [answer],
    promptZh: '写出听到的数量（只写数字）',
  };
}

function makeYear(rng: Rng): NumberItem {
  const year = ri(rng, 1950, 2035);
  const xx = year % 100;
  let spoken: string;
  if (year < 2000) spoken = xx === 0 ? 'nineteen hundred' : xx < 10 ? `nineteen oh ${numberToWords(xx)}` : `nineteen ${numberToWords(xx)}`;
  else if (year === 2000) spoken = 'two thousand';
  else if (xx < 10) spoken = `two thousand ${numberToWords(xx)}`;
  else spoken = rng() < 0.5 ? `twenty ${numberToWords(xx)}` : `two thousand ${numberToWords(xx)}`;
  const answer = String(year);
  return { kind: 'year', spoken, answer, accept: [answer], promptZh: '写出听到的年份（四位数字）' };
}

/** One random item of `kind`. Deterministic for a given rng. */
export function makeNumberItem(kind: NumberKind, rng: Rng): NumberItem {
  switch (kind) {
    case 'price':
      return makePrice(rng);
    case 'time':
      return makeTime(rng);
    case 'date':
      return makeDate(rng);
    case 'phone':
      return makePhone(rng);
    case 'quantity':
      return makeQuantity(rng);
    case 'year':
      return makeYear(rng);
  }
}

/** `count` items cycling through the kinds, starting at a rng-chosen kind (no kind twice in a row). */
export function makeNumberSet(count: number, rng: Rng, kinds: readonly NumberKind[] = NUMBER_KINDS): NumberItem[] {
  const start = Math.floor(rng() * kinds.length);
  return Array.from({ length: Math.max(0, count) }, (_, i) => makeNumberItem(kinds[(start + i) % kinds.length], rng));
}
