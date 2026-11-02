import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chunk, DozenSentence, SubstitutionFrame } from '../../types';

vi.mock('../../content', () => ({
  DOZEN: Array.from({ length: 13 }, (_, i) => ({
    id: `d${String(i + 1).padStart(2, '0')}`,
    order: i + 1,
    en: `Sentence ${i + 1}.`,
    zh: `句子${i + 1}。`,
    grammar: ['be-adj'],
    focusZh: '焦点',
    alignment: [],
    trapsZh: [],
    variants: [],
    frameIds: [],
  })),
}));

const supabaseMock = vi.hoisted(() => ({
  client: null as unknown,
  configured: false,
}));
vi.mock('../sync/client', () => ({
  getSupabase: () => supabaseMock.client,
  supabaseConfigured: () => supabaseMock.configured,
}));

import { saveSettings } from '../settings';
import {
  AiError,
  aiConfigured,
  deconstruct,
  generateChunkPrompts,
  generateCoachReport,
  generateFrame,
  generateOutputPrompts,
  gradeOutput,
  rulesCoachReport,
  testConnection,
} from './index';
import type { CoachInput } from '../coachInput';

const fetchMock = vi.fn();

function completion(content: unknown, finishReason = 'stop', extraMessage: Record<string, unknown> = {}): Response {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  return new Response(JSON.stringify({ choices: [{ message: { content: text, ...extraMessage }, finish_reason: finishReason }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
function status(code: number): Response {
  return new Response('{}', { status: code });
}

const feedback = { score: 88, correct: true, corrected: 'I must go.', explanationZh: '很好。', alternatives: ['I have to go.'] };

const frameJson = {
  title: '表达打算',
  pattern: '{subject} {aux} {verb} the {object}.',
  patternZh: '{subject}{aux}{verb}{object}。',
  slots: [
    { key: 'subject', labelZh: '主语', options: [{ en: 'I', zh: '我' }, { en: 'We', zh: '我们' }, { en: 'They', zh: '他们' }] },
    { key: 'aux', labelZh: '助动词', options: [{ en: 'must', zh: '必须' }, { en: 'can', zh: '能' }, { en: 'will', zh: '会' }] },
    { key: 'verb', labelZh: '动词', options: [{ en: 'send', zh: '发送' }, { en: 'review', zh: '审阅' }, { en: 'finish', zh: '完成' }] },
    { key: 'object', labelZh: '宾语', options: [{ en: 'report', zh: '报告' }, { en: 'email', zh: '邮件' }, { en: 'plan', zh: '计划' }] },
  ],
  grammar: ['modal-must'],
  scene: 'daily',
  level: 1,
  examples: [{ en: 'I must send the report.', zh: '我必须发送报告。' }, { en: 'We can review the plan.', zh: '我们能审阅计划。' }],
};

const deconJson = {
  zh: '我必须把它给他。',
  skeleton: '[主语] must [动作] [宾语] to [宾语]',
  alignment: [
    { en: 'I', zh: '我', role: 'subject' },
    { en: 'must', zh: '必须', role: 'aux', note: '后接原形' },
  ],
  grammar: ['modal-must'],
  nearestDozenId: 'd09',
  explanationZh: '说明',
};

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  supabaseMock.client = null;
  supabaseMock.configured = false;
  saveSettings({ deepseekApiKey: 'sk-test' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AiError) return e.code;
    throw e;
  }
  return 'ok';
}

describe('transport (direct)', () => {
  it('sends a DeepSeek JSON-mode request and parses the result', async () => {
    fetchMock.mockResolvedValueOnce(completion(feedback));
    const r = await gradeOutput({ promptZh: '我必须走了', grammar: ['modal-must'], userEn: 'I must go' });
    expect(r).toEqual(feedback);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('deepseek-chat');
    expect(body.stream).toBe(false);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(JSON.stringify(body.messages).toLowerCase()).toContain('json');
  });

  it('no key -> no-key without calling fetch', async () => {
    saveSettings({ deepseekApiKey: '' });
    expect(await code(gradeOutput({ grammar: [], userEn: 'x' }))).toBe('no-key');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps fetch TypeError to cors when online, network when offline', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    expect(await code(testConnection())).toBe('cors');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(await code(testConnection())).toBe('network');
  });

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [402, 'auth'],
    [429, 'rate'],
    [503, 'network'],
  ])('HTTP %i -> %s', async (st, expected) => {
    fetchMock.mockResolvedValue(status(st));
    expect(await code(testConnection())).toBe(expected);
    expect(fetchMock).toHaveBeenCalledTimes(1); // not retried
  });

  it('402 gives the balance message', async () => {
    fetchMock.mockResolvedValue(status(402));
    await expect(testConnection()).rejects.toThrow('DeepSeek 余额不足');
  });

  it('retries once on invalid JSON, then succeeds', async () => {
    fetchMock.mockResolvedValueOnce(completion('this is not json')).mockResolvedValueOnce(completion(feedback));
    const r = await gradeOutput({ grammar: [], userEn: 'I must go' });
    expect(r.score).toBe(88);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries once on failed validation, then bad-response', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(completion({ score: 'high' })));
    expect(await code(gradeOutput({ grammar: [], userEn: 'x' }))).toBe('bad-response');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('missing choices -> bad-response', async () => {
    fetchMock.mockResolvedValue(new Response('{"foo":1}', { status: 200 }));
    expect(await code(testConnection())).toBe('bad-response');
  });

  it('accepts a fenced json block', async () => {
    fetchMock.mockResolvedValueOnce(completion('```json\n' + JSON.stringify(feedback) + '\n```'));
    expect((await gradeOutput({ grammar: [], userEn: 'x' })).corrected).toBe('I must go.');
  });
});

function sentBody(call = 0): Record<string, unknown> {
  return JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string) as Record<string, unknown>;
}

describe('token budgets and truncation', () => {
  it('uses 4000 max_tokens for deconstruct and generateFrame, small budgets elsewhere', async () => {
    fetchMock.mockResolvedValueOnce(completion(deconJson));
    await deconstruct('I must go.');
    expect(sentBody(0).max_tokens).toBe(4000);
    fetchMock.mockResolvedValueOnce(completion(frameJson));
    await generateFrame({ topic: 't', scene: 'daily', level: 1 });
    expect(sentBody(1).max_tokens).toBe(4000);
    fetchMock.mockResolvedValueOnce(completion(feedback));
    await gradeOutput({ grammar: [], userEn: 'x' });
    expect(sentBody(2).max_tokens).toBeLessThanOrEqual(2000);
    expect(sentBody(2).temperature).toBe(0.2);
  });

  it('deepseek-reasoner: 8000 tokens, no temperature, parses content only', async () => {
    saveSettings({ deepseekModel: 'deepseek-reasoner' });
    fetchMock.mockResolvedValueOnce(
      completion(feedback, 'stop', { reasoning_content: '{"score": 1, "corrected": "WRONG", "explanationZh": "WRONG"}' }),
    );
    const r = await gradeOutput({ grammar: [], userEn: 'I must go' });
    expect(r.corrected).toBe('I must go.');
    const body = sentBody(0);
    expect(body.model).toBe('deepseek-reasoner');
    expect(body.max_tokens).toBe(8000);
    expect('temperature' in body).toBe(false);
    fetchMock.mockResolvedValueOnce(completion(deconJson));
    await deconstruct('I must go.');
    expect(sentBody(1).max_tokens).toBe(8000);
  });

  it('reasoner with empty content (reasoning only) is a bad-response', async () => {
    saveSettings({ deepseekModel: 'deepseek-reasoner' });
    fetchMock.mockImplementation(() => Promise.resolve(completion('', 'length', { reasoning_content: 'thinking...' })));
    expect(await code(testConnection())).toBe('bad-response');
  });

  it('finish_reason length -> retry once, then truncation message', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(completion('{"zh": "被截', 'length')));
    const p = deconstruct('I must go.');
    await expect(p).rejects.toMatchObject({ code: 'bad-response', message: expect.stringContaining('AI 输出被截断') });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a truncated first attempt can be recovered by the retry', async () => {
    fetchMock.mockResolvedValueOnce(completion('{"score": 8', 'length')).mockResolvedValueOnce(completion(feedback));
    expect((await gradeOutput({ grammar: [], userEn: 'x' })).score).toBe(88);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not accept complete-looking JSON when finish_reason is length', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(completion(feedback, 'length')));
    expect(await code(gradeOutput({ grammar: [], userEn: 'x' }))).toBe('bad-response');
  });
});

describe('proxy mode', () => {
  beforeEach(() => {
    saveSettings({ aiMode: 'proxy', deepseekApiKey: '' });
  });

  it('proxy-unavailable when supabase is not configured', async () => {
    expect(await code(testConnection())).toBe('proxy-unavailable');
  });

  it('proxy-unavailable when signed out', async () => {
    supabaseMock.configured = true;
    supabaseMock.client = {
      auth: { getSession: async () => ({ data: { session: null } }) },
      functions: { invoke: vi.fn() },
    };
    expect(await code(testConnection())).toBe('proxy-unavailable');
  });

  it('invokes ai-proxy with the request body and no key', async () => {
    supabaseMock.configured = true;
    const invoke = vi.fn().mockResolvedValue({ data: { choices: [{ message: { content: JSON.stringify(feedback) } }] }, error: null });
    supabaseMock.client = { auth: { getSession: async () => ({ data: { session: { user: {} } } }) }, functions: { invoke } };
    const r = await gradeOutput({ grammar: [], userEn: 'I must go' });
    expect(r.score).toBe(88);
    expect(invoke).toHaveBeenCalledWith('ai-proxy', expect.anything());
    const body = (invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(JSON.stringify(body)).not.toContain('Bearer');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps proxy HTTP errors', async () => {
    supabaseMock.configured = true;
    const err = Object.assign(new Error('x'), { name: 'FunctionsHttpError', context: new Response('{}', { status: 429 }) });
    supabaseMock.client = {
      auth: { getSession: async () => ({ data: { session: {} } }) },
      functions: { invoke: async () => ({ data: null, error: err }) },
    };
    expect(await code(testConnection())).toBe('rate');
  });
});

describe('aiConfigured', () => {
  it('depends on the mode', () => {
    expect(aiConfigured()).toBe(true);
    saveSettings({ deepseekApiKey: '' });
    expect(aiConfigured()).toBe(false);
    saveSettings({ aiMode: 'proxy' });
    expect(aiConfigured()).toBe(false);
    supabaseMock.configured = true;
    expect(aiConfigured()).toBe(true);
  });
});

describe('deconstruct', () => {
  it('returns a typed result and uses the input sentence', async () => {
    fetchMock.mockResolvedValueOnce(completion({ ...deconJson, frame: frameJson }));
    const r = await deconstruct('  I must give it to him.  ');
    expect(r.en).toBe('I must give it to him.');
    expect(r.nearestDozenId).toBe('d09');
    expect(r.alignment[1].note).toBe('后接原形');
    expect(r.frame?.source).toBe('ai');
    expect(r.frame?.id).toMatch(/^u-/);
    const prompt = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).messages[1].content as string;
    expect(prompt).toContain('d13: Sentence 13.');
  });

  it('drops an invalid optional frame but keeps the rest', async () => {
    fetchMock.mockResolvedValueOnce(completion({ ...deconJson, frame: { ...frameJson, pattern: '{nope}' } }));
    const r = await deconstruct('I must go.');
    expect(r.frame).toBeUndefined();
  });

  it.each([
    ['invalid role', { ...deconJson, alignment: [{ en: 'I', zh: '我', role: 'noun' }] }],
    ['invalid grammar', { ...deconJson, grammar: ['past-tense'] }],
    ['unknown dozen id', { ...deconJson, nearestDozenId: 'd99' }],
    ['empty alignment', { ...deconJson, alignment: [] }],
  ])('rejects %s', async (_n, payload) => {
    fetchMock.mockImplementation(() => Promise.resolve(completion(payload)));
    expect(await code(deconstruct('I must go.'))).toBe('bad-response');
  });
});

describe('generateFrame', () => {
  it('stamps id/source and honours requested scene & level', async () => {
    fetchMock.mockResolvedValueOnce(completion(frameJson));
    const f = await generateFrame({ topic: '工作汇报', scene: 'work', level: 2 });
    expect(f.id).toMatch(/^u-[0-9a-f-]{36}$/);
    expect(f.source).toBe('ai');
    expect(f.scene).toBe('work');
    expect(f.level).toBe(2);
  });

  it.each([
    ['placeholder without slot', { ...frameJson, pattern: '{subject} {aux} {verb} the {thing}.' }],
    ['slot missing from pattern', { ...frameJson, patternZh: '{subject}{aux}{verb}。' }],
    ['2 options', { ...frameJson, slots: [{ ...frameJson.slots[0], options: frameJson.slots[0].options.slice(0, 2) }, ...frameJson.slots.slice(1)] }],
    ['7 options', { ...frameJson, slots: [{ ...frameJson.slots[0], options: Array.from({ length: 7 }, (_, i) => ({ en: `w${i}`, zh: `词${i}` })) }, ...frameJson.slots.slice(1)] }],
    ['1 example', { ...frameJson, examples: frameJson.examples.slice(0, 1) }],
    ['bad scene', { ...frameJson, scene: 'sports' }],
    ['bad level', { ...frameJson, level: 4 }],
    ['bad grammar', { ...frameJson, grammar: ['passive'] }],
    ['duplicate keys', { ...frameJson, slots: [frameJson.slots[0], frameJson.slots[0], ...frameJson.slots.slice(2)] }],
  ])('rejects %s', async (_n, payload) => {
    fetchMock.mockImplementation(() => Promise.resolve(completion(payload)));
    expect(await code(generateFrame({ topic: 't', scene: 'daily', level: 1 }))).toBe('bad-response');
  });
});

describe('generateOutputPrompts', () => {
  const dozen = { id: 'd09', order: 9, en: 'I must give it to him.', zh: '我必须把它给他。', focusZh: '情态', grammar: ['modal-must'], alignment: [], trapsZh: [], variants: [], frameIds: [], transforms: [] } as DozenSentence;

  it('returns exactly count prompts', async () => {
    fetchMock.mockResolvedValueOnce(
      completion({ prompts: [1, 2, 3, 4].map((n) => ({ promptZh: `题${n}`, hintEn: `hint ${n}` })) }),
    );
    const r = await generateOutputPrompts({ dozen, frames: [], scenes: ['work'], count: 3 });
    expect(r).toHaveLength(3);
    expect(r[0]).toEqual({ promptZh: '题1', hintEn: 'hint 1' });
  });

  it('rejects too few prompts', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(completion({ prompts: [{ promptZh: 'a', hintEn: 'b' }] })));
    expect(await code(generateOutputPrompts({ dozen, frames: [], scenes: [], count: 3 }))).toBe('bad-response');
  });
});

describe('chunk track', () => {
  const chunk: Chunk = {
    id: 'c012',
    en: "It's up to you.",
    zh: '你来决定。',
    category: 'agree',
    freq: 1,
    register: 'neutral',
    examples: [],
    noteZh: '把决定权交给对方。',
  };
  const frame = {
    id: 'f007',
    title: '表达打算',
    pattern: '{subject} {aux} {verb} the {object}.',
    patternZh: '{subject}{aux}{verb}{object}。',
    slots: frameJson.slots,
    grammar: [],
    scene: 'daily',
    level: 1,
    examples: [],
    source: 'seed',
  } as SubstitutionFrame;
  const items = [
    { kind: 'chunk' as const, chunk },
    { kind: 'frame' as const, frame },
  ];
  const userPrompt = (call = 0): string =>
    (JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string).messages as { role: string; content: string }[])[1].content;

  describe('generateChunkPrompts', () => {
    it('returns count prompts with valid targetIds', async () => {
      fetchMock.mockResolvedValueOnce(
        completion({
          prompts: [
            { promptZh: '朋友问你去哪吃饭，你都行。', hintEn: 'up to', targetId: 'c012' },
            { promptZh: '告诉同事你明天要交报告。', hintEn: 'report', targetId: 'f007' },
            { promptZh: '室友问看什么电影。', hintEn: ' up to ', targetId: ' c012 ' },
            { promptZh: '多余的一条', hintEn: '', targetId: 'c012' },
          ],
        }),
      );
      const r = await generateChunkPrompts({ items, scenes: ['daily'], count: 3 });
      expect(r).toEqual([
        { promptZh: '朋友问你去哪吃饭，你都行。', hintEn: 'up to', targetId: 'c012' },
        { promptZh: '告诉同事你明天要交报告。', hintEn: 'report', targetId: 'f007' },
        { promptZh: '室友问看什么电影。', hintEn: 'up to', targetId: 'c012' },
      ]);
      const p = userPrompt();
      expect(p).toContain("It's up to you.");
      expect(p).toContain('id=f007');
      expect(p).toContain('第 3 题 → c012'); // rotation across targets
      expect(p).toContain('正好是 3');
      expect(p).toContain('不要要求学习者分析语法');
      expect(sentBody(0).temperature).toBe(0.8);
    });

    it('rejects a targetId that is not among the items (after one retry)', async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(completion({ prompts: [{ promptZh: '题', hintEn: 'x', targetId: 'c999' }] })),
      );
      expect(await code(generateChunkPrompts({ items, scenes: [], count: 1 }))).toBe('bad-response');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['too few prompts', { prompts: [{ promptZh: '题', hintEn: 'x', targetId: 'c012' }] }],
      ['missing targetId', { prompts: [{ promptZh: '题', hintEn: 'x' }, { promptZh: '题2', hintEn: 'x' }] }],
      ['empty promptZh', { prompts: [{ promptZh: ' ', hintEn: 'x', targetId: 'c012' }, { promptZh: 'b', hintEn: 'x', targetId: 'c012' }] }],
      ['not an array', { prompts: 'nope' }],
    ])('rejects %s', async (_n, payload) => {
      fetchMock.mockImplementation(() => Promise.resolve(completion(payload)));
      expect(await code(generateChunkPrompts({ items, scenes: [], count: 2 }))).toBe('bad-response');
    });

    it('recovers when the retry returns a valid answer', async () => {
      fetchMock
        .mockResolvedValueOnce(completion({ prompts: [{ promptZh: '题', hintEn: '', targetId: 'zzz' }] }))
        .mockResolvedValueOnce(completion({ prompts: [{ promptZh: '题', hintEn: '', targetId: 'f007' }] }));
      const r = await generateChunkPrompts({ items, scenes: ['work'], count: 1 });
      expect(r[0].targetId).toBe('f007');
    });

    it('fails fast without items and without calling the API', async () => {
      expect(await code(generateChunkPrompts({ items: [], scenes: [], count: 3 }))).toBe('bad-response');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('gradeOutput with targetChunk', () => {
    it('judges natural use of the chunk and never asks for grammar analysis', async () => {
      fetchMock.mockResolvedValueOnce(completion(feedback));
      const r = await gradeOutput({ promptZh: '朋友问你去哪吃饭。', targetChunk: "It's up to you.", userEn: "It's up to you." });
      expect(r).toEqual(feedback);
      const p = userPrompt();
      expect(p).toContain("要求自然用上的语块/句型：It's up to you.");
      expect(p).toContain('是否自然地用上了目标语块');
      expect(p).toContain('不要做语法分析');
      expect(p).not.toContain('语法是否正确');
      expect(p).not.toContain('要求练习的语法点');
      const sys = (JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).messages[0] as { content: string }).content;
      expect(sys).toContain('绝不做语法分析');
    });

    it('stays backward compatible: no targetChunk means the original grammar rubric', async () => {
      fetchMock.mockResolvedValueOnce(completion(feedback));
      await gradeOutput({ promptZh: '我必须走了', grammar: ['modal-must'], userEn: 'I must go' });
      const p = userPrompt();
      expect(p).toContain('语法是否正确');
      expect(p).toContain('要求练习的语法点：modal-must');
      expect(p).not.toContain('要求自然用上的语块');
    });

    it('grammar may be omitted', async () => {
      fetchMock.mockResolvedValueOnce(completion(feedback));
      await gradeOutput({ userEn: 'I must go' });
      expect(userPrompt()).not.toContain('要求练习的语法点');
    });
  });
});

// ---------- coach ----------

function coachInput(over: Partial<CoachInput> = {}): CoachInput {
  return {
    lesson: 14,
    skills: {
      listen: { n: 40, acc: 0.92, medianLatencyMs: 2100, trend: 0.1 },
      speak: { n: 30, acc: 0.62, medianLatencyMs: 4300, trend: -0.08 },
      decode: { n: 6, acc: 0.8 },
    },
    ladder: { listen: 4, speak: 3, newPerDay: 6 },
    ladderHistory: [{ date: '2026-05-01', dimension: 'listen', from: 3, to: 4, reasonZh: '听力正确率 92% > 88%，语速 0.95 → 1.05' }],
    weakCategories: [{ category: 'request', acc: 0.5, n: 8, examples: ["Could you give me a hand?"] }],
    edgeTexts: ['It slipped my mind.', 'Let me get back to you.'],
    soundErrors: [{ name: 'want to → wanna', kind: 'reduction', errors: 4, attempts: 6 }],
    goal: { horizonDays: 30, dailyMinutes: 20, day: 14, phaseNameZh: '扩展', status: 'behind', adviceZh: '把每天时长加到 25 分钟。', itemsLearned: 40, expectedItems: 70 },
    assessments: [{ date: '2026-05-01', kind: 'placement', listenLevel: 2, speakLevel: 1, listenAcc: 0.7, speakAcc: 0.6, levelZh: '基础' }],
    ...over,
  };
}

const coachJson = {
  summaryZh: '本周听力很稳（92%），口语偏难（62%）。',
  strengthsZh: ['听力正确率 92%，已升到 L4。'],
  weaknessesZh: ['口语正确率 62%，低于 70%。'],
  nextWeekFocusZh: ['稳住口语'],
  tipsZh: ['每天把 "It slipped my mind." 大声说 3 遍并计时。'],
  suggestedNewPerDay: 5,
};

describe('generateCoachReport', () => {
  it('sends only aggregated data and returns a validated CoachReport', async () => {
    fetchMock.mockResolvedValueOnce(completion(coachJson));
    const r = await generateCoachReport(coachInput(), 1_700_000_000_000);
    expect(r).toEqual({ id: 'coach-1700000000000', createdAt: 1_700_000_000_000, lesson: 14, source: 'ai', ...coachJson });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const text = JSON.stringify(body.messages);
    expect(body.messages[1].content).toContain('"lesson":14');
    expect(text).toContain('It slipped my mind.');
    expect(text).toContain('want to → wanna');
    expect(body.messages[0].content).toContain('不会看到学习者写的原句');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('clamps suggestedNewPerDay to 3-12 and drops it when not a number', async () => {
    fetchMock.mockResolvedValueOnce(completion({ ...coachJson, suggestedNewPerDay: 40 }));
    expect((await generateCoachReport(coachInput())).suggestedNewPerDay).toBe(12);
    fetchMock.mockResolvedValueOnce(completion({ ...coachJson, suggestedNewPerDay: 1 }));
    expect((await generateCoachReport(coachInput())).suggestedNewPerDay).toBe(3);
    fetchMock.mockResolvedValueOnce(completion({ ...coachJson, suggestedNewPerDay: 'many' }));
    expect((await generateCoachReport(coachInput())).suggestedNewPerDay).toBeUndefined();
    const { suggestedNewPerDay: _drop, ...without } = coachJson;
    fetchMock.mockResolvedValueOnce(completion(without));
    expect('suggestedNewPerDay' in (await generateCoachReport(coachInput()))).toBe(false);
  });

  it('drops non-Chinese list items and caps list lengths', async () => {
    fetchMock.mockResolvedValueOnce(
      completion({
        ...coachJson,
        strengthsZh: ['Great job', ...Array.from({ length: 9 }, (_, i) => `优点 ${i}`)],
        tipsZh: ['English only tip', '把 wanna 听写 3 遍。'],
      }),
    );
    const r = await generateCoachReport(coachInput());
    expect(r.strengthsZh).toHaveLength(5);
    expect(r.strengthsZh[0]).toBe('优点 0');
    expect(r.tipsZh).toEqual(['把 wanna 听写 3 遍。']);
  });

  it('retries once on an invalid report, then gives bad-response', async () => {
    fetchMock.mockResolvedValueOnce(completion({ summaryZh: 'English summary', nextWeekFocusZh: ['x'], tipsZh: ['y'] })).mockResolvedValueOnce(completion(coachJson));
    expect((await generateCoachReport(coachInput())).summaryZh).toBe(coachJson.summaryZh);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(completion({ summaryZh: '总结', nextWeekFocusZh: [], tipsZh: [] }));
    expect(await code(generateCoachReport(coachInput()))).toBe('bad-response');
  });

  it('requires tips and a focus', async () => {
    fetchMock.mockResolvedValue(completion({ ...coachJson, tipsZh: [] }));
    expect(await code(generateCoachReport(coachInput()))).toBe('bad-response');
  });

  it('no key -> no-key; auth and rate errors pass through', async () => {
    saveSettings({ deepseekApiKey: '' });
    expect(await code(generateCoachReport(coachInput()))).toBe('no-key');
    saveSettings({ deepseekApiKey: 'sk-test' });
    fetchMock.mockResolvedValueOnce(status(401));
    expect(await code(generateCoachReport(coachInput()))).toBe('auth');
    fetchMock.mockResolvedValueOnce(status(429));
    expect(await code(generateCoachReport(coachInput()))).toBe('rate');
  });
});

describe('rulesCoachReport', () => {
  it('writes a Chinese report from thresholds, with the numbers', () => {
    const r = rulesCoachReport(coachInput(), 5);
    expect(r).toMatchObject({ id: 'coach-5', createdAt: 5, lesson: 14, source: 'rules' });
    expect(r.summaryZh).toContain('第 14 课');
    expect(r.summaryZh).toContain('听力正确率 92%');
    expect(r.summaryZh).toContain('口语正确率 62%');
    expect(r.strengthsZh.join('\n')).toContain('高于舒适区上限 88%');
    expect(r.strengthsZh.join('\n')).toContain('提高了 10 个百分点');
    expect(r.weaknessesZh.join('\n')).toContain('口语正确率 62%，低于 70%');
    expect(r.weaknessesZh.join('\n')).toContain('下降了 8 个百分点');
    expect(r.weaknessesZh.join('\n')).toContain('接近 5 秒的限时'); // 4.3 s median vs the S3 limit of 5 s = 86%
    expect(r.weaknessesZh.join('\n')).toContain('请求与求助');
    expect(r.weaknessesZh.join('\n')).toContain('want to → wanna');
    expect(r.tipsZh.join('\n')).toContain('把每天时长加到 25 分钟。'); // the plan is behind: its advice is passed on
    expect(r.tipsZh.join('\n')).toContain('It slipped my mind.');
    expect(r.tipsZh.join('\n')).toContain('Could you give me a hand?');
    expect(r.tipsZh.length).toBeLessThanOrEqual(6);
    expect(r.nextWeekFocusZh.length).toBeGreaterThan(0);
    for (const line of [r.summaryZh, ...r.strengthsZh, ...r.weaknessesZh, ...r.nextWeekFocusZh, ...r.tipsZh]) expect(line).toMatch(/[\u4e00-\u9fff]/);
  });

  it('suggests fewer new chunks when a skill is below 65%', () => {
    const r = rulesCoachReport(coachInput({ skills: { speak: { n: 30, acc: 0.6 } } }));
    expect(r.suggestedNewPerDay).toBe(4);
    expect(r.summaryZh).toContain('低于 65%');
    expect(rulesCoachReport(coachInput({ skills: { speak: { n: 30, acc: 0.6 } }, ladder: { listen: 1, speak: 1, newPerDay: 3 } })).suggestedNewPerDay).toBeUndefined();
  });

  it('suggests one more when accuracy is comfortable and the plan is ahead', () => {
    const r = rulesCoachReport(
      coachInput({
        skills: { listen: { n: 30, acc: 0.95 }, speak: { n: 30, acc: 0.9 } },
        goal: { horizonDays: 30, dailyMinutes: 20, day: 10, phaseNameZh: '扩展', status: 'ahead', adviceZh: '', itemsLearned: 90, expectedItems: 60 },
        weakCategories: [],
        soundErrors: [],
        edgeTexts: [],
      }),
    );
    expect(r.suggestedNewPerDay).toBe(7);
    expect(r.strengthsZh.join('\n')).toContain('超前');
    expect(r.weaknessesZh).toEqual([]);
  });

  it('says samples are too few instead of judging (n < 15)', () => {
    const r = rulesCoachReport(coachInput({ skills: { listen: { n: 9, acc: 0.1 } }, weakCategories: [], soundErrors: [], edgeTexts: [], goal: undefined }));
    expect(r.summaryZh).toContain('样本还少');
    expect(r.weaknessesZh.join('')).toContain('练习次数还不够');
    expect(r.suggestedNewPerDay).toBeUndefined();
  });

  it('always has at least one tip and one focus, even with no data', () => {
    const r = rulesCoachReport({ lesson: 1, skills: {}, ladder: { listen: 1, speak: 1, newPerDay: 5 }, ladderHistory: [], weakCategories: [], edgeTexts: [], soundErrors: [], assessments: [] });
    expect(r.tipsZh.length).toBeGreaterThan(0);
    expect(r.nextWeekFocusZh.length).toBeGreaterThan(0);
    expect(r.source).toBe('rules');
  });

  it('is in-band praise when accuracy sits in 70-88%', () => {
    const r = rulesCoachReport(coachInput({ skills: { listen: { n: 30, acc: 0.8 } }, weakCategories: [], soundErrors: [], edgeTexts: [], goal: undefined }));
    expect(r.strengthsZh[0]).toContain('难度合适');
  });
});
