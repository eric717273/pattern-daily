import { expect, test } from '@playwright/test';
import { getChunk, getSeedFrame } from '../src/content';
import { firstItems, importLearned, MOCK_DECONSTRUCTION, MOCK_FEEDBACK, MOCK_PROMPTS_FIRST, mockDeepSeek, openToday, stepTab } from './helpers';

test('AI flow with a mocked DeepSeek: test connection, analyze, graded chunk output', async ({ page }) => {
  const calls = await mockDeepSeek(page);

  // /decode/analyze without a key explains itself
  await page.goto('/#/decode/analyze');
  await expect(page.getByText('需要先设置 AI')).toBeVisible();
  await page.getByRole('link', { name: /去「我的」设置 AI/ }).click();
  await expect(page).toHaveURL(/#\/me$/);

  // set the key and test the connection
  await page.getByRole('textbox', { name: 'DeepSeek API Key' }).fill('sk-test-123');
  await page.getByRole('button', { name: '测试连接' }).click();
  await expect(page.getByText('连接成功，AI 功能可以使用了。')).toBeVisible();
  expect(calls.ping).toBe(1);

  // 解码 hub -> AI 解构: deconstruct the first sample
  await page.goto('/#/decode');
  await page.getByRole('link', { name: /AI 解构任意句子/ }).click();
  await page.getByRole('button', { name: '示例 1' }).click();
  await expect(page.getByRole('textbox', { name: '输入一句英语' })).not.toHaveValue('');
  await page.getByRole('button', { name: '解构', exact: true }).click();
  await expect(page.getByTestId('decon-zh')).toHaveText(MOCK_DECONSTRUCTION.zh);
  expect(calls.deconstruct).toBe(1);
  // skeleton slots are rendered as pills
  await expect(page.getByTestId('skeleton-pill')).toHaveCount(7);
  await expect(page.getByRole('list', { name: '中英逐字对照' })).toBeVisible();
  // nearest dozen sentence links to its detail page in the decode section
  await expect(page.getByRole('link', { name: /I want to give it to her\./ })).toHaveAttribute('href', '#/decode/dozen/d10');
  // save the generated frame
  await page.getByRole('button', { name: '保存为我的母框' }).click();
  await expect(page.getByText('已保存到「语块库 · 我的母框」')).toBeVisible();
  // history keeps the analysis
  await expect(page.getByRole('region', { name: '最近解构' })).toBeVisible();

  // Today: open the day, learn five items (via backup import), then step 4 with AI situations and grading
  await openToday(page);
  const items = firstItems(5);
  await importLearned(page, items);
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: '第 1 课' })).toBeVisible();
  await stepTab(page, 4).click();
  await expect(page.getByTestId('output-zh')).toHaveText(MOCK_PROMPTS_FIRST);
  await expect(page.getByTestId('output-hint')).toHaveText('up to, call');
  expect(calls.prompts).toBe(1);
  // the request is about today's items, one id per line
  for (const it of items) expect(calls.promptRequests[0]).toContain(`id=${it.id} `);

  await page.getByRole('textbox', { name: '你造的英语句子' }).fill('It is up to you.');
  await page.getByRole('button', { name: 'AI 批改' }).click();
  await expect(page.getByText(`得分 ${MOCK_FEEDBACK.score}`)).toBeVisible();
  await expect(page.getByTestId('ai-corrected')).toHaveText(MOCK_FEEDBACK.corrected);
  await expect(page.getByText(MOCK_FEEDBACK.explanationZh)).toBeVisible();
  expect(calls.grade).toBe(1);
  // graded against the first target, as a chunk to use (no grammar analysis)
  const first = items[0];
  const target = first.kind === 'chunk' ? getChunk(first.id)?.en : getSeedFrame(first.id)?.pattern;
  expect(target).toBeTruthy();
  expect(calls.gradeRequests[0]).toContain(`要求自然用上的语块/句型：${target}`);

  // the prompts are cached for the day: reopening the step does not refetch
  await page.reload();
  await stepTab(page, 4).click();
  await expect(page.getByTestId('output-zh')).toHaveText(MOCK_PROMPTS_FIRST);
  expect(calls.prompts).toBe(1);

  // the graded sentence shows up under 我的 -> 最近练习
  await page.goto('/#/me');
  await expect(page.getByText('92 分')).toBeVisible();
});

test('an AI failure falls back to offline prompts with a notice', async ({ page }) => {
  await page.route('https://api.deepseek.com/**', (route) =>
    route.fulfill({ status: 401, headers: { 'access-control-allow-origin': '*' }, body: '{}' }),
  );
  await page.addInitScript(() => localStorage.setItem('pd.settings', JSON.stringify({ deepseekApiKey: 'sk-bad' })));
  await openToday(page);
  await importLearned(page, firstItems(5));
  await page.goto('/#/');
  await stepTab(page, 4).click();
  await expect(page.getByRole('note')).toContainText('已改用离线题目');
  await expect(page.getByTestId('output-zh')).toBeVisible();
  await expect(page.getByTestId('output-hint')).toContainText(/^用上：|^用这个句型：/);
});
