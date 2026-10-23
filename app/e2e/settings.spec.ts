import { expect, test } from '@playwright/test';

test('settings persist across reloads', async ({ page }) => {
  await page.goto('/#/me');
  await expect(page.getByRole('heading', { name: 'AI 设置（DeepSeek）' })).toBeVisible();

  const key = page.getByRole('textbox', { name: 'DeepSeek API Key' });
  await expect(key).toHaveAttribute('type', 'password');
  await key.fill('sk-persist-me');
  await page.getByRole('button', { name: '显示 Key' }).click();
  await expect(key).toHaveAttribute('type', 'text');

  await page.getByLabel('模型', { exact: true }).selectOption('deepseek-reasoner');
  await page.getByRole('button', { name: '通过 Supabase 代理' }).click();
  await expect(page.getByText('代理：请求经你自己的 Supabase Edge Function 转发')).toBeVisible();
  await page.getByRole('button', { name: '直连', exact: true }).click();
  await expect(page.getByText('Key 只保存在这台设备上')).toBeVisible();

  // plan: minutes + scenes
  await page.getByRole('button', { name: '20 分钟' }).click();
  await page.getByRole('button', { name: '旅行' }).click();

  // speech rate
  await page.getByRole('slider', { name: '朗读语速' }).fill('1.2');
  await expect(page.getByText('语速 1.20×')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'DeepSeek API Key' })).toHaveValue('sk-persist-me');
  await expect(page.getByLabel('模型', { exact: true })).toHaveValue('deepseek-reasoner');
  await expect(page.getByRole('button', { name: '直连', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '20 分钟' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '旅行' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('语速 1.20×')).toBeVisible();

  // without Supabase configured the sync section asks for the project URL and key
  await expect(page.getByRole('textbox', { name: 'Supabase 项目 URL' })).toBeVisible();
  await expect(page.getByText('docs/SETUP.md')).toBeVisible();
});

test('install instructions show in the browser but not when installed', async ({ page, browser }) => {
  await page.goto('/#/me');
  const install = page.getByRole('heading', { name: '安装到设备' });
  await expect(install).toBeVisible();
  await expect(page.getByText('添加到主屏幕')).toBeVisible();
  await expect(page.getByText('添加到程序坞')).toBeVisible();

  const standalone = await browser.newContext();
  const installed = await standalone.newPage();
  await installed.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (q: string) =>
      q.includes('display-mode: standalone') ? ({ ...original(q), matches: true } as MediaQueryList) : original(q);
  });
  await installed.goto('/#/me');
  await expect(installed.getByRole('heading', { name: '学习统计' })).toBeVisible();
  await expect(installed.getByRole('heading', { name: '安装到设备' })).toHaveCount(0);
  await standalone.close();
});

test('backup: export downloads a dated JSON and import reports the result', async ({ page }) => {
  await page.goto('/#/me');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出 JSON' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^pattern-daily-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.getByText('已导出备份文件。')).toBeVisible();

  const bad = page.getByLabel('选择备份文件');
  await bad.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('not json') });
  await expect(page.getByRole('alert')).toContainText('备份文件不是有效的 JSON');

  const good = Buffer.from(JSON.stringify({ version: 1, cards: [] }));
  await bad.setInputFiles({ name: 'ok.json', mimeType: 'application/json', buffer: good });
  await expect(page.getByText(/导入成功：ok\.json/)).toBeVisible();
});
