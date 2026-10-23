import { expect, test } from '@playwright/test';
import { doDeconstruct, doFrames, doOutputSelfCheck, finishEmptyWarmup, openToday } from './helpers';

test('complete a full day offline without AI, and it persists', async ({ page }) => {
  await openToday(page);
  await expect(page.getByRole('heading', { name: '第 1 课' })).toBeVisible();
  await expect(page.getByText('解构期')).toBeVisible();
  // four step tabs
  for (const label of ['热身复习', '解构', '母框替换', '模组替换输出']) {
    await expect(page.getByRole('button', { name: new RegExp(`^第 \\d 步 ${label}`) })).toBeVisible();
  }

  // 1. warm-up: nothing due on day 1
  await finishEmptyWarmup(page);

  // 2. deconstruct incl. the order drill
  await doDeconstruct(page, 'd01');

  // 3. frame drills
  await doFrames(page);

  // 4. output, self-check
  await expect(page.getByTestId('output-zh')).toBeVisible();
  await doOutputSelfCheck(page);

  // completion screen
  await expect(page.getByRole('heading', { name: '今天的练习完成了！' })).toBeVisible();
  await expect(page.getByText('第 1 课完成')).toBeVisible();
  await expect(page.getByTestId('streak')).toContainText('连续 1 天');
  await expect(page.getByRole('button', { name: '再练一轮母框' })).toBeVisible();
  await expect(page.getByRole('link', { name: '查看统计' })).toBeVisible();

  // survives a reload
  await page.reload();
  await expect(page.getByRole('heading', { name: '今天的练习完成了！' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '第 1 课' })).toBeVisible();

  // 12句: d01 is now in the review queue
  await page.getByRole('link', { name: '12句' }).first().click();
  const d01 = page.getByRole('link', { name: /第 1 句：The apple is red\./ });
  await expect(d01).toContainText('已复习 1 次');

  // 我的: stats reflect the finished day and the attempts
  await page.goto('/#/me');
  await expect(page.getByRole('heading', { name: '学习统计' })).toBeVisible();
  await expect(page.getByText('已完成 1 课，下一课是第 2 课')).toBeVisible();
  await expect(page.getByRole('heading', { name: '最近练习' })).toBeVisible();
  await expect(page.getByText('I give him the apple.')).toBeVisible();
});

test('a half-finished day resumes at the first undone step and finished steps can be redone', async ({ page }) => {
  await openToday(page);
  await finishEmptyWarmup(page);
  await doDeconstruct(page, 'd01');
  // the warm-up tab shows as done, and resume lands on the first undone step (frames)
  await expect(page.getByRole('button', { name: '第 1 步 热身复习，已完成' })).toBeVisible();
  await expect(page.getByRole('button', { name: '第 2 步 解构，已完成' })).toBeVisible();
  await page.reload();
  await expect(page.getByText(/^母框 1 \/ \d$/)).toBeVisible();
  // a finished step can be reopened
  await page.getByRole('button', { name: '第 2 步 解构，已完成' }).click();
  await expect(page.getByTestId('dozen-en')).toHaveText('The apple is red.');
});
