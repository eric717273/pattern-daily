import { expect, test } from '@playwright/test';
import { MOCK_DECONSTRUCTION, MOCK_FEEDBACK, mockDeepSeek, openToday, stepTab } from './helpers';

test('AI flow with a mocked DeepSeek: test connection, analyze, graded output', async ({ page }) => {
  const calls = await mockDeepSeek(page);

  // /analyze without a key explains itself
  await page.goto('/#/analyze');
  await expect(page.getByText('需要先设置 AI')).toBeVisible();
  await page.getByRole('link', { name: /去「我的」设置 AI/ }).click();
  await expect(page).toHaveURL(/#\/me$/);

  // set the key and test the connection
  await page.getByRole('textbox', { name: 'DeepSeek API Key' }).fill('sk-test-123');
  await page.getByRole('button', { name: '测试连接' }).click();
  await expect(page.getByText('连接成功，AI 功能可以使用了。')).toBeVisible();
  expect(calls.ping).toBe(1);

  // /analyze: deconstruct the first sample
  await page.getByRole('link', { name: '解构', exact: true }).first().click();
  await page.getByRole('button', { name: '示例 1' }).click();
  await expect(page.getByRole('textbox', { name: '输入一句英语' })).not.toHaveValue('');
  await page.getByRole('button', { name: '解构', exact: true }).click();
  await expect(page.getByTestId('decon-zh')).toHaveText(MOCK_DECONSTRUCTION.zh);
  expect(calls.deconstruct).toBe(1);
  // skeleton slots are rendered as pills
  await expect(page.getByTestId('skeleton-pill')).toHaveCount(7);
  await expect(page.getByRole('list', { name: '中英逐字对照' })).toBeVisible();
  // nearest dozen sentence links to its detail page
  await expect(page.getByRole('link', { name: /I want to give it to her\./ })).toHaveAttribute('href', '#/dozen/d10');
  // save the generated frame
  await page.getByRole('button', { name: '保存为我的母框' }).click();
  await expect(page.getByText('已保存到「母框」')).toBeVisible();
  // history keeps the analysis
  await expect(page.getByRole('region', { name: '最近解构' })).toBeVisible();

  // Today step 4 with AI grading
  await openToday(page);
  await stepTab(page, 4).click();
  await expect(page.getByTestId('output-zh')).toHaveText(MOCK_PROMPTS_FIRST);
  expect(calls.prompts).toBe(1);
  await page.getByRole('textbox', { name: '你造的英语句子' }).fill('I will give him the apple tomorrow.');
  await page.getByRole('button', { name: 'AI 批改' }).click();
  await expect(page.getByText(`得分 ${MOCK_FEEDBACK.score}`)).toBeVisible();
  await expect(page.getByTestId('ai-corrected')).toHaveText(MOCK_FEEDBACK.corrected);
  await expect(page.getByText(MOCK_FEEDBACK.explanationZh)).toBeVisible();
  expect(calls.grade).toBe(1);

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
  await stepTab(page, 4).click();
  await expect(page.getByRole('note')).toContainText('已改用离线题目');
  await expect(page.getByTestId('output-zh')).toBeVisible();
});

const MOCK_PROMPTS_FIRST = '告诉同事你明天要把苹果给他。';
