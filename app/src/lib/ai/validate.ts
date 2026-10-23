import type {
  AiFeedback,
  AlignmentToken,
  GrammarPoint,
  Scene,
  Slot,
  SlotOption,
  SlotRole,
  SubstitutionFrame,
} from '../../types';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const GRAMMAR_POINTS: readonly GrammarPoint[] = [
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

export const SLOT_ROLES: readonly SlotRole[] = [
  'subject',
  'aux',
  'verb',
  'object',
  'indirect-object',
  'complement',
  'adverbial',
  'determiner',
  'particle',
  'other',
];

export const SCENES: readonly Scene[] = ['daily', 'work', 'travel', 'social', 'study'];

function fail(path: string, why: string): never {
  throw new ValidationError(`${path}: ${why}`);
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (!isRecord(v)) fail(path, '应为对象');
  return v;
}

function nonEmptyStr(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.trim() === '') fail(path, '应为非空字符串');
  return v.trim();
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, '应为数组');
  return v;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], path: string): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    fail(path, `非法取值 ${JSON.stringify(v)}`);
  }
  return v as T;
}

// ---------- AiFeedback ----------

export function validateFeedback(u: unknown): AiFeedback {
  const o = obj(u, 'feedback');
  const rawScore = o.score;
  if (typeof rawScore !== 'number' || !Number.isFinite(rawScore)) fail('feedback.score', '应为数字');
  const score = Math.round(Math.min(100, Math.max(0, rawScore)));
  const corrected = nonEmptyStr(o.corrected, 'feedback.corrected');
  const explanationZh = nonEmptyStr(o.explanationZh, 'feedback.explanationZh');
  const correct = typeof o.correct === 'boolean' ? o.correct : score >= 80;
  let alternatives: string[] = [];
  if (o.alternatives !== undefined && o.alternatives !== null) {
    alternatives = arr(o.alternatives, 'feedback.alternatives')
      .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      .map((x) => x.trim())
      .slice(0, 3);
  }
  return { score, correct, corrected, explanationZh, alternatives };
}

// ---------- Alignment / deconstruction ----------

export function validateAlignment(u: unknown, path = 'alignment'): AlignmentToken[] {
  const items = arr(u, path);
  if (items.length === 0) fail(path, '不能为空');
  return items.map((it, i) => {
    const p = `${path}[${i}]`;
    const o = obj(it, p);
    const tok: AlignmentToken = {
      en: nonEmptyStr(o.en, `${p}.en`),
      zh: typeof o.zh === 'string' ? o.zh.trim() : fail(`${p}.zh`, '应为字符串'),
      role: oneOf(o.role, SLOT_ROLES, `${p}.role`),
    };
    if (typeof o.note === 'string' && o.note.trim() !== '') tok.note = o.note.trim();
    return tok;
  });
}

export function validateGrammar(u: unknown, path = 'grammar'): GrammarPoint[] {
  const items = arr(u, path);
  const out = items.map((g, i) => oneOf(g, GRAMMAR_POINTS, `${path}[${i}]`));
  return Array.from(new Set(out));
}

export interface DeconstructionResult {
  en: string;
  zh: string;
  skeleton: string;
  alignment: AlignmentToken[];
  grammar: GrammarPoint[];
  nearestDozenId: string;
  explanationZh: string;
  frame?: SubstitutionFrame;
}

export function validateDeconstruction(
  u: unknown,
  opts: { en: string; dozenIds: readonly string[] },
): DeconstructionResult {
  const o = obj(u, 'deconstruction');
  const result: DeconstructionResult = {
    en: opts.en,
    zh: nonEmptyStr(o.zh, 'zh'),
    skeleton: nonEmptyStr(o.skeleton, 'skeleton'),
    alignment: validateAlignment(o.alignment),
    grammar: validateGrammar(o.grammar),
    nearestDozenId: oneOf(o.nearestDozenId, opts.dozenIds, 'nearestDozenId'),
    explanationZh: nonEmptyStr(o.explanationZh, 'explanationZh'),
  };
  // The substitution frame is a bonus: an unusable one is dropped instead of failing the whole result.
  if (o.frame !== undefined && o.frame !== null) {
    try {
      result.frame = validateFrame(o.frame);
    } catch {
      // ignore
    }
  }
  return result;
}

// ---------- Substitution frame ----------

const PLACEHOLDER = /\{([^{}]+)\}/g;

export function placeholders(pattern: string): string[] {
  return Array.from(pattern.matchAll(PLACEHOLDER), (m) => m[1]);
}

function validateOptions(u: unknown, path: string, min: number, max: number): SlotOption[] {
  const items = arr(u, path);
  if (items.length < min || items.length > max) fail(path, `数量应为 ${min}-${max} 个，实际 ${items.length}`);
  return items.map((it, i) => {
    const o = obj(it, `${path}[${i}]`);
    return { en: nonEmptyStr(o.en, `${path}[${i}].en`), zh: nonEmptyStr(o.zh, `${path}[${i}].zh`) };
  });
}

/** Validates an AI-produced frame and stamps `id` ('u-' + uuid) and `source: 'ai'`. */
export function validateFrame(u: unknown): SubstitutionFrame {
  const o = obj(u, 'frame');
  const pattern = nonEmptyStr(o.pattern, 'pattern');
  const patternZh = nonEmptyStr(o.patternZh, 'patternZh');

  const slotItems = arr(o.slots, 'slots');
  if (slotItems.length < 1 || slotItems.length > 6) fail('slots', '槽位数量应为 1-6');
  const slots: Slot[] = slotItems.map((it, i) => {
    const so = obj(it, `slots[${i}]`);
    const key = nonEmptyStr(so.key, `slots[${i}].key`);
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) fail(`slots[${i}].key`, `非法的槽位名 ${key}`);
    return {
      key,
      labelZh: nonEmptyStr(so.labelZh, `slots[${i}].labelZh`),
      options: validateOptions(so.options, `slots[${i}].options`, 3, 6),
    };
  });

  const keys = slots.map((s) => s.key);
  if (new Set(keys).size !== keys.length) fail('slots', '槽位名重复');
  const keySet = new Set(keys);

  for (const [name, text] of [
    ['pattern', pattern],
    ['patternZh', patternZh],
  ] as const) {
    const found = new Set(placeholders(text));
    for (const k of found) if (!keySet.has(k)) fail(name, `占位符 {${k}} 没有对应的槽位`);
    for (const k of keySet) if (!found.has(k)) fail(name, `槽位 ${k} 没有在句型中出现`);
  }

  const grammar = validateGrammar(o.grammar);
  const scene = oneOf(o.scene, SCENES, 'scene');
  const level = o.level;
  if (level !== 1 && level !== 2 && level !== 3) fail('level', '应为 1、2 或 3');

  const frame: SubstitutionFrame = {
    id: `u-${crypto.randomUUID()}`,
    title: nonEmptyStr(o.title, 'title'),
    pattern,
    patternZh,
    slots,
    grammar,
    scene,
    level,
    examples: validateOptions(o.examples, 'examples', 2, 3),
    source: 'ai',
  };
  if (typeof o.tipZh === 'string' && o.tipZh.trim() !== '') frame.tipZh = o.tipZh.trim();
  return frame;
}

// ---------- Output prompts ----------

export function validateOutputPrompts(
  u: unknown,
  count: number,
): { promptZh: string; hintEn: string }[] {
  const o = obj(u, 'prompts');
  const items = arr(o.prompts, 'prompts');
  if (items.length < count) fail('prompts', `需要 ${count} 条，实际 ${items.length}`);
  return items.slice(0, count).map((it, i) => {
    const p = obj(it, `prompts[${i}]`);
    return {
      promptZh: nonEmptyStr(p.promptZh, `prompts[${i}].promptZh`),
      hintEn: typeof p.hintEn === 'string' ? p.hintEn.trim() : '',
    };
  });
}

// ---------- Chunk-track output prompts ----------

export interface ChunkPrompt {
  promptZh: string;
  hintEn: string;
  /** id of the chunk ('c001') or frame ('f001') this situation is meant to elicit. */
  targetId: string;
}

/** Validates situation prompts for the chunk track: each must name a target that is one of today's items. */
export function validateChunkPrompts(u: unknown, count: number, targetIds: readonly string[]): ChunkPrompt[] {
  const o = obj(u, 'prompts');
  const items = arr(o.prompts, 'prompts');
  if (items.length < count) fail('prompts', `需要 ${count} 条，实际 ${items.length}`);
  return items.slice(0, count).map((it, i) => {
    const p = obj(it, `prompts[${i}]`);
    return {
      promptZh: nonEmptyStr(p.promptZh, `prompts[${i}].promptZh`),
      hintEn: typeof p.hintEn === 'string' ? p.hintEn.trim() : '',
      targetId: oneOf(typeof p.targetId === 'string' ? p.targetId.trim() : p.targetId, targetIds, `prompts[${i}].targetId`),
    };
  });
}
