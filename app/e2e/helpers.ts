import { expect, type Page, type Route } from '@playwright/test';
import { DOZEN } from '../src/content';

/**
 * Chromium has webkitSpeechRecognition but no speech service in tests, so voice verification would be
 * on by default. The day flow tests the self-graded drills: switch the preference off before the page loads.
 */
export async function disableVoiceVerification(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('pd.swapVoice', '0');
    } catch {
      // storage unavailable
    }
  });
}

/** Open the Today page and wait for the header. */
export async function openToday(page: Page): Promise<void> {
  await disableVoiceVerification(page);
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: /^第 \d+ 课$/ })).toBeVisible();
}

export function stepTab(page: Page, n: number) {
  return page.getByRole('button', { name: new RegExp(`^第 ${n} 步`) });
}

/** Step 1 with nothing due. */
export async function finishEmptyWarmup(page: Page): Promise<void> {
  await expect(page.getByText('今天没有到期的复习')).toBeVisible();
  await page.getByRole('button', { name: '继续：解构' }).click();
}

/** Step 2: read the sentence, rebuild the day's variant from the tiles on the first try. */
export async function doDeconstruct(page: Page, dozenId: string): Promise<void> {
  const dozen = DOZEN.find((d) => d.id === dozenId);
  if (!dozen) throw new Error(`unknown dozen sentence ${dozenId}`);
  await expect(page.getByTestId('dozen-en')).toHaveText(dozen.en);
  await page.getByRole('button', { name: '看懂了，练语序重建' }).click();

  const zh = (await page.getByTestId('order-zh').innerText()).trim();
  const variant = dozen.variants.find((v) => v.zh === zh);
  if (!variant) throw new Error(`no variant with zh "${zh}"`);
  for (const word of variant.en.split(/\s+/)) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await page.locator('[data-tile="pool"]').filter({ hasText: new RegExp(`^${escaped}$`) }).first().click();
  }
  await page.getByRole('button', { name: '检查' }).click();
  await expect(page.getByText('一次拼对了！')).toBeVisible();
  await page.getByRole('button', { name: '继续', exact: true }).click();
}

/** Step 3: the three Palmer sub-steps for every frame of the day, as fast as possible. */
export async function doFrames(page: Page): Promise<number> {
  const badge = page.getByText(/^母框 \d+ \/ \d+$/);
  await expect(badge).toBeVisible();
  const total = Number(/\/ (\d+)/.exec(await badge.innerText())?.[1] ?? '0');
  expect(total).toBeGreaterThan(0);

  for (let i = 1; i <= total; i++) {
    await expect(page.getByText(`母框 ${i} / ${total}`)).toBeVisible();

    // (a) anchor: read aloud 3 times
    const listen = page.getByRole('button', { name: /^听并跟读/ });
    for (let k = 0; k < 3; k++) {
      await listen.click();
      await page.waitForTimeout(450);
    }
    await page.getByRole('button', { name: '下一步：单槽快替' }).click();

    // (b) single swap: 7 prompts after the starting sentence
    await page.getByRole('button', { name: '开始快替' }).click();
    for (let k = 1; k <= 7; k++) {
      await page.getByRole('button', { name: '显示答案' }).click();
      await page.getByRole('button', { name: /^(下一句|完成这一轮)$/ }).click();
    }
    await page.getByRole('button', { name: '下一步：中译英' }).click();

    // (c) translate: give up on each prompt, self-grade 良好
    for (let k = 0; k < 3; k++) {
      await page.getByRole('button', { name: '不会，看答案' }).click();
      await page.getByRole('button', { name: /^良好/ }).click();
    }
  }
  return total;
}

/** Step 4 without AI: write three sentences and self-check each. */
export async function doOutputSelfCheck(page: Page): Promise<void> {
  const sentences = ['I give him the apple.', 'She gives it to John.', 'We can send you the report.'];
  for (let i = 0; i < sentences.length; i++) {
    await page.getByRole('textbox', { name: '你造的英语句子' }).fill(sentences[i]);
    await page.getByRole('button', { name: '提交并自查' }).click();
    await expect(page.getByTestId('output-reference')).toBeVisible();
    await page.getByRole('button', { name: i === sentences.length - 1 ? '完成今日练习' : '下一句' }).click();
  }
}

// ---------- DeepSeek mock ----------

export interface DeepSeekCalls {
  ping: number;
  deconstruct: number;
  prompts: number;
  grade: number;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function completion(json: unknown) {
  return {
    id: 'mock',
    object: 'chat.completion',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(json) } }],
  };
}

export const MOCK_DECONSTRUCTION = {
  zh: '我想和团队安排一次会议，讨论下周的项目时间表。',
  skeleton: '[主语] would like to [动作] [宾语] with [某人] to [动作] [宾语] [时间]',
  alignment: [
    { en: 'I', zh: '我', role: 'subject' },
    { en: 'would like to', zh: '想要', role: 'aux', note: 'would like to 比 want to 更礼貌' },
    { en: 'schedule', zh: '安排', role: 'verb' },
    { en: 'a meeting', zh: '一次会议', role: 'object' },
    { en: 'with the team', zh: '和团队', role: 'adverbial' },
  ],
  grammar: ['want-to', 'modal-must'],
  nearestDozenId: 'd10',
  explanationZh: '核心骨架是「主语 + would like to + 动词 + 宾语」，表示礼貌地提出打算。',
  frame: {
    title: '礼貌提出安排',
    pattern: '{subject} {aux} {verb} {object}.',
    patternZh: '{subject}{aux}{verb}{object}。',
    slots: [
      {
        key: 'subject',
        labelZh: '主语',
        options: [
          { en: 'I', zh: '我' },
          { en: 'We', zh: '我们' },
          { en: 'They', zh: '他们' },
        ],
      },
      {
        key: 'aux',
        labelZh: '情态',
        options: [
          { en: 'will', zh: '将' },
          { en: 'must', zh: '必须' },
          { en: 'can', zh: '可以' },
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
          { en: 'the plan', zh: '计划' },
          { en: 'the numbers', zh: '数据' },
        ],
      },
    ],
    grammar: ['modal-must'],
    scene: 'work',
    level: 2,
    examples: [
      { en: 'We will send the report.', zh: '我们将发送报告。' },
      { en: 'I must review the plan.', zh: '我必须审阅计划。' },
    ],
  },
};

export const MOCK_PROMPTS = {
  prompts: [
    { promptZh: '告诉同事你明天要把苹果给他。', hintEn: 'give, apple' },
    { promptZh: '问经理这份报告是不是红色的。', hintEn: 'report, red' },
    { promptZh: '说你不能吃这个苹果。', hintEn: "can't, eat" },
  ],
};

export const MOCK_FEEDBACK = {
  score: 92,
  correct: true,
  corrected: 'I will give him the apple tomorrow.',
  explanationZh: '语法正确，tomorrow 放句尾更自然。',
  alternatives: ["I'm going to give him the apple tomorrow."],
};

/** Mock https://api.deepseek.com with OpenAI-style responses; returns call counters. */
export async function mockDeepSeek(page: Page): Promise<DeepSeekCalls> {
  const calls: DeepSeekCalls = { ping: 0, deconstruct: 0, prompts: 0, grade: 0 };
  await page.route('https://api.deepseek.com/**', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const body = request.postDataJSON() as { messages?: { content?: string }[] } | null;
    const text = (body?.messages ?? []).map((m) => m.content ?? '').join('\n');
    let json: unknown;
    if (text.includes('connectivity probe')) {
      calls.ping++;
      json = { ok: true };
    } else if (text.includes('骨架解构')) {
      calls.deconstruct++;
      json = MOCK_DECONSTRUCTION;
    } else if (text.includes('每天模组替换')) {
      calls.prompts++;
      json = MOCK_PROMPTS;
    } else if (text.includes('请批改')) {
      calls.grade++;
      json = MOCK_FEEDBACK;
    } else {
      await route.fulfill({ status: 400, headers: CORS, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: CORS,
      contentType: 'application/json',
      body: JSON.stringify(completion(json)),
    });
  });
  return calls;
}
