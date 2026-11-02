import { expect, test } from '@playwright/test';
import { doDecodeLesson, doNewItems, doOutputSelfCheck, finishEmptyReview, firstItems, reviewAll } from './helpers';
import { doListeningBlock, installClockOffset, setGoalViaOnboarding } from './helpers-v3';

test('a full v3 day offline: five budgeted blocks, 今日反馈, and tomorrow reflects the adjustment', async ({ page }) => {
  await installClockOffset(page);
  await setGoalViaOnboarding(page);

  // header: five steps with minute budgets, today's micro-goals, no onboarding card
  await expect(page.getByRole('heading', { name: '第 1 课' })).toBeVisible();
  for (const label of ['复习', '新语块', '听力', '解码', '输出']) {
    await expect(page.getByRole('button', { name: new RegExp(`^第 \\d 步 ${label}`) })).toBeVisible();
  }
  await expect(page.getByTestId('goal-card')).toHaveCount(0);
  const goalLine = page.getByTestId('today-goal');
  await expect(goalLine).toContainText('今日目标');
  await expect(goalLine.getByRole('listitem')).toHaveText(['新学 5 条', '听力语速 0.95', '口语 8 秒内说出', '正确率保持在 70–88%']);
  await expect(page.getByTestId('step-budget')).toHaveText('约 5 分钟');
  await expect(page.getByTestId('step-clock')).toContainText('剩');

  // 1 复习 (nothing due), 2 新语块
  await finishEmptyReview(page);
  const items = firstItems(5);
  await doNewItems(page, items);

  // 3 听力 with the real drills: the log gets listening measurements
  await expect(page.getByTestId('step-budget')).toHaveText('约 5 分钟');
  const tasks = await doListeningBlock(page);
  expect(tasks).toBeGreaterThanOrEqual(3);

  // 4 解码, 5 输出
  await doDecodeLesson(page, 'd01');
  await doOutputSelfCheck(page);

  // 今日反馈
  await expect(page.getByRole('heading', { name: '今天的练习完成了！' })).toBeVisible();
  const feedback = page.getByTestId('day-feedback');
  await expect(feedback).toBeVisible();
  await expect(feedback.getByTestId('skill-listen')).toBeVisible();
  await expect(feedback.getByTestId('acc-listen')).toContainText('%');
  await expect(feedback.getByTestId('band-listen')).toHaveText(/太难|刚好|太容易/);
  await expect(feedback.getByTestId('day-tip')).not.toBeEmpty();
  await expect(page.getByRole('link', { name: '查看计划' })).toHaveAttribute('href', '#/plan');
  await expect(page.getByRole('link', { name: '去语块库' })).toHaveAttribute('href', '#/library');
  await expect(page.getByRole('link', { name: '再做一组解码练习' })).toHaveAttribute('href', '#/decode/practice');
  const adjustments = feedback.getByLabel('明天的自动调整');
  await expect(adjustments).toBeVisible();
  const text = await adjustments.innerText();
  const m = /新语块 (\d+) → (\d+) 条\/天/.exec(text);
  if (!m) expect(text).toContain('保持当前难度');
  const tomorrowNew = m ? Number(m[2]) : 5;

  // survives a reload, and the controller is idempotent
  await page.reload();
  await expect(page.getByTestId('day-feedback')).toBeVisible();
  await expect(page.getByTestId('day-feedback').getByLabel('明天的自动调整')).toContainText(m ? m[0] : '保持当前难度');

  // two days later: the new plan uses the adjusted ladder
  await page.evaluate(() => localStorage.setItem('e2e.offset', String(50 * 3_600_000)));
  await page.reload();
  await expect(page.getByRole('heading', { name: '第 2 课' })).toBeVisible();
  await expect(page.getByTestId('today-goal')).toContainText(`新学 ${tomorrowNew} 条`);
  await reviewAll(page, 5);
  await page.getByRole('button', { name: '继续：新语块' }).click();
  await expect(page.getByTestId('chunks-progress')).toHaveText(`新语块 1 / ${tomorrowNew}`);
});

test('focus mode hides the navigation, keeps the step running and persists', async ({ page }) => {
  await setGoalViaOnboarding(page);
  await expect(page.getByRole('button', { name: '专注模式' })).toBeVisible();
  await page.getByRole('button', { name: '专注模式' }).click();
  const bar = page.getByTestId('focus-bar');
  await expect(bar).toContainText('专注 · 复习');
  await expect(bar).toContainText('剩');
  // the app navigation is covered by the focus layer
  const nav = page.getByRole('navigation', { name: /底部导航|主导航/ }).first();
  await expect(page.getByText('今天没有到期的复习')).toBeVisible();
  const covered = await nav.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0) return true; // hidden at this viewport size
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !el.contains(hit);
  });
  expect(covered).toBe(true);

  await page.reload();
  await expect(page.getByTestId('focus-bar')).toBeVisible();
  await page.getByRole('button', { name: '退出专注' }).click();
  await expect(page.getByTestId('focus-bar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '专注模式' })).toBeVisible();
});
