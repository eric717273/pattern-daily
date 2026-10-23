import { expect, type Page, type Route } from '@playwright/test';
import { CURRICULUM, DOZEN, getChunk, getSeedFrame } from '../src/content';
import type { ItemRef } from '../src/types';

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

/** The first `n` items of the chunk-track curriculum: what day 1 teaches. */
export function firstItems(n: number): ItemRef[] {
  return CURRICULUM.slice(0, n);
}

/** Display name of a library item: the chunk's English or the frame's Chinese title. */
export function itemTitle(ref: ItemRef): string {
  return (ref.kind === 'chunk' ? getChunk(ref.id)?.en : getSeedFrame(ref.id)?.title) ?? ref.id;
}

// ---------- chunk track drills (voice off: every drill falls back to self-check) ----------

/** 听辨: play once, pick the first option (right or wrong does not matter for the flow). */
async function listenAndPick(page: Page, next: string): Promise<void> {
  await page.getByRole('button', { name: '播放' }).click();
  await page.getByRole('group', { name: '选项' }).getByRole('button').first().click();
  await expect(page.getByTestId('listen-revealed')).toBeVisible();
  await page.getByRole('button', { name: next }).click();
}

/** 跟读 / 锚定: three taps on 听并跟读 (taps closer than 400 ms count once). */
async function readAloudThrice(page: Page): Promise<void> {
  const listen = page.getByRole('button', { name: /^听并跟读/ });
  for (let k = 0; k < 3; k++) {
    await listen.click();
    await page.waitForTimeout(450);
  }
}

/** The whole NewItemFlow of one item, as fast as the drills allow. */
export async function learnItem(page: Page, ref: ItemRef): Promise<void> {
  if (ref.kind === 'chunk') {
    await listenAndPick(page, '下一步：跟读');
    await readAloudThrice(page);
    await page.getByRole('button', { name: '下一步：说出来' }).click();
    await page.getByRole('button', { name: '显示答案' }).click();
    await page.getByRole('button', { name: '说对了' }).click();
    return;
  }
  await listenAndPick(page, '下一步：锚定');
  await readAloudThrice(page);
  await page.getByRole('button', { name: '下一步：单槽快替' }).click();
  await page.getByRole('button', { name: '开始快替' }).click();
  for (let k = 1; k <= 5; k++) {
    await page.getByRole('button', { name: '显示答案' }).click();
    await page.getByRole('button', { name: k === 5 ? '完成这一轮' : '下一句' }).click();
  }
  await page.getByRole('button', { name: '轻松' }).click();
  await page.getByRole('button', { name: '完成', exact: true }).click();
}

/** Step 1 with nothing due. */
export async function finishEmptyReview(page: Page): Promise<void> {
  await expect(page.getByText('今天没有到期的复习')).toBeVisible();
  await page.getByRole('button', { name: '继续：新语块' }).click();
}

/** Step 2: learn the given items in order, checking the progress badge and the item title. */
export async function doNewItems(page: Page, items: ItemRef[], total: number = items.length, startAt = 1): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    await expect(page.getByTestId('chunks-progress')).toHaveText(`新语块 ${startAt + i} / ${total}`);
    await expect(page.getByTestId('chunks-title')).toHaveText(itemTitle(items[i]));
    await learnItem(page, items[i]);
  }
  await expect(page.getByText('今天的新语块学完了')).toBeVisible();
  await page.getByRole('button', { name: '继续：解码' }).click();
}

/** Step 3 (foundation): read the sentence, rebuild a variant, do the three transformations. */
export async function doDecodeLesson(page: Page, dozenId: string): Promise<void> {
  const dozen = DOZEN.find((d) => d.id === dozenId);
  if (!dozen) throw new Error(`unknown dozen sentence ${dozenId}`);
  await expect(page.getByTestId('decode-note')).toHaveText('解码：看懂结构（和语块练习分开，不求脱口而出）');
  await expect(page.getByTestId('dozen-en')).toHaveText(dozen.en);
  await page.getByRole('button', { name: '看懂了，去排语序' }).click();

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

  await doTransforms(page, dozenId);
}

/** Type the right answer to every transformation task shown until the drill ends; returns how many were done. */
export async function doTransforms(page: Page, dozenId: string): Promise<number> {
  const dozen = DOZEN.find((d) => d.id === dozenId);
  if (!dozen) throw new Error(`unknown dozen sentence ${dozenId}`);
  let done = 0;
  for (;;) {
    await expect(page.getByTestId('transform-progress')).toBeVisible();
    const instruction = (await page.getByTestId('transform-instruction').innerText()).trim();
    const from = (await page.getByTestId('transform-from').innerText()).trim();
    const task = dozen.transforms.find((t) => t.instructionZh === instruction && t.from === from);
    if (!task) throw new Error(`no transform task "${instruction}" / "${from}" in ${dozenId}`);
    await page.getByRole('textbox', { name: /你的答案/ }).fill(task.to);
    await page.getByRole('button', { name: '检查', exact: true }).click();
    await expect(page.getByText('答对了！')).toBeVisible();
    done++;
    const last = await page.getByRole('button', { name: '完成', exact: true }).isVisible();
    await page.getByRole('button', { name: last ? '完成' : '下一题', exact: true }).click();
    if (last) return done;
  }
}

/** Step 4 without AI: write three sentences and self-check each against the model sentence. */
export async function doOutputSelfCheck(page: Page): Promise<string[]> {
  const sentences = ['I give him the apple.', 'She gives it to John.', 'We can send you the report.'];
  for (let i = 0; i < sentences.length; i++) {
    await expect(page.getByTestId('output-progress')).toHaveText(`第 ${i + 1} / 3 题`);
    await expect(page.getByTestId('output-hint')).toContainText(/^用上：|^用这个句型：/);
    await page.getByRole('textbox', { name: '你造的英语句子' }).fill(sentences[i]);
    await page.getByRole('button', { name: '提交并自查' }).click();
    await expect(page.getByTestId('output-reference')).toBeVisible();
    await page.getByRole('button', { name: i === sentences.length - 1 ? '完成今日练习' : '下一题' }).click();
  }
  return sentences;
}

/** One due card of the review step: a chunk (listen, recall) or a frame (two sentences). */
export async function reviewAll(page: Page, total: number): Promise<void> {
  for (let i = 1; i <= total; i++) {
    await expect(page.getByTestId('review-progress')).toHaveText(`复习 ${i} / ${total}`);
    const first = page.getByRole('button', { name: /^(播放|显示答案)$/ });
    await first.first().waitFor();
    if (await page.getByRole('button', { name: '播放' }).isVisible()) {
      await listenAndPick(page, '下一步：说出来');
      await page.getByRole('button', { name: '显示答案' }).click();
      await page.getByRole('button', { name: '说对了' }).click();
    } else {
      for (let k = 0; k < 2; k++) {
        await page.getByRole('button', { name: '显示答案' }).click();
        await page.getByRole('button', { name: '说对了' }).click();
      }
    }
  }
  await expect(page.getByText('复习完成')).toBeVisible();
}

/** Backup JSON with a card for each item, as if they had been learned a day ago (due now). */
export function backupWithCards(items: ItemRef[]): Buffer {
  const now = Date.now();
  const cards = items.map((r, i) => ({
    id: `${r.kind}:${r.id}`,
    kind: r.kind,
    refId: r.id,
    due: now + 86_400_000,
    interval: 1,
    ease: 2.5,
    reps: 1,
    lapses: 0,
    lastReviewed: now - i * 1000,
    updatedAt: now - i * 1000,
  }));
  return Buffer.from(JSON.stringify({ version: 1, cards }));
}

/** Mark items as already learned through 我的 -> 导入备份 (a quick way to a day with something to practise). */
export async function importLearned(page: Page, items: ItemRef[]): Promise<void> {
  await page.goto('/#/me');
  await page.getByLabel('选择备份文件').setInputFiles({ name: 'learned.json', mimeType: 'application/json', buffer: backupWithCards(items) });
  await expect(page.getByText(/导入成功：learned\.json/)).toBeVisible();
}

// ---------- DeepSeek mock ----------

export interface DeepSeekCalls {
  ping: number;
  deconstruct: number;
  prompts: number;
  grade: number;
  /** Bodies of the chunk-prompt and grading requests, for assertions. */
  promptRequests: string[];
  gradeRequests: string[];
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

/** Chinese situations the mock hands out for chunk prompts, in order. */
export const MOCK_SITUATIONS = [
  '朋友问你周末去哪家餐厅吃饭，你都行，想让他来决定。',
  '同事问你下午的会议能不能提前十分钟开始，你想先确认一下他的意思。',
  '客人问你这个方案行不行，你想礼貌地说你还没想好。',
];
export const MOCK_PROMPTS_FIRST = MOCK_SITUATIONS[0];

export const MOCK_FEEDBACK = {
  score: 92,
  correct: true,
  corrected: 'I will give him the apple tomorrow.',
  explanationZh: '语法正确，tomorrow 放句尾更自然。',
  alternatives: ["I'm going to give him the apple tomorrow."],
};

/** Mock https://api.deepseek.com with OpenAI-style responses; returns call counters. */
export async function mockDeepSeek(page: Page): Promise<DeepSeekCalls> {
  const calls: DeepSeekCalls = { ping: 0, deconstruct: 0, prompts: 0, grade: 0, promptRequests: [], gradeRequests: [] };
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
    } else if (text.includes('情景输出')) {
      // answer the way the real model should: one situation per requested question, targets taken from the list
      calls.prompts++;
      calls.promptRequests.push(text);
      const ids = [...text.matchAll(/- id=(\w+) /g)].map((m) => m[1]);
      const count = Number(/出 (\d+) 道/.exec(text)?.[1] ?? '3');
      json = {
        prompts: Array.from({ length: count }, (_, k) => ({
          promptZh: MOCK_SITUATIONS[k % MOCK_SITUATIONS.length],
          hintEn: 'up to, call',
          targetId: ids[k % ids.length],
        })),
      };
    } else if (text.includes('请批改')) {
      calls.grade++;
      calls.gradeRequests.push(text);
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
