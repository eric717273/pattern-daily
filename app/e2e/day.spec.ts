import { expect, test, type Page } from '@playwright/test';
import { CURRICULUM } from '../src/content';
import { doDecodeLesson, doNewItems, doOutputSelfCheck, finishEmptyReview, firstItems, itemTitle, learnItem, openToday, reviewAll } from './helpers';

/** Shift the page's clock forward by the number of ms stored under 'e2e.offset' (set it, then reload). */
async function installClockOffset(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const off = Number(localStorage.getItem('e2e.offset') ?? 0);
    if (!off) return;
    const Real = Date;
    class Shifted extends Real {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(Real.now() + off);
        else super(...(args as [number]));
      }
      static now(): number {
        return Real.now() + off;
      }
    }
    window.Date = Shifted as unknown as DateConstructor;
  });
}

test('complete a full day offline without AI, and it persists', async ({ page }) => {
  await openToday(page);
  await expect(page.getByRole('heading', { name: '第 1 课' })).toBeVisible();
  await expect(page.getByTestId('decode-badge')).toHaveText('解码 骨架 1/13');
  await expect(page.getByTestId('chunk-badge')).toHaveText('语块 已学 0 / 400');
  // four step tabs
  for (const label of ['复习', '新语块', '解码', '输出']) {
    await expect(page.getByRole('button', { name: new RegExp(`^第 \\d 步 ${label}`) })).toBeVisible();
  }

  // 1. review: nothing due on day 1
  await finishEmptyReview(page);

  // 2. five new items through the real drills
  const items = firstItems(5);
  await doNewItems(page, items);
  await expect(page.getByTestId('chunk-badge')).toHaveText('语块 已学 5 / 400');

  // 3. decode: skeleton d01
  await doDecodeLesson(page, 'd01');

  // 4. output, self-check
  await expect(page.getByTestId('output-zh')).toBeVisible();
  const written = await doOutputSelfCheck(page);

  // completion screen
  await expect(page.getByRole('heading', { name: '今天的练习完成了！' })).toBeVisible();
  await expect(page.getByText('第 1 课完成')).toBeVisible();
  await expect(page.getByTestId('streak')).toContainText('连续 1 天');
  await expect(page.getByTestId('sum-learned')).toHaveText('5 条');
  await expect(page.getByTestId('sum-reviewed')).toHaveText('0 条');
  await expect(page.getByTestId('sum-decode')).toHaveText('骨架 1/13');
  await expect(page.getByRole('link', { name: '去语块库' })).toBeVisible();
  await expect(page.getByRole('link', { name: '再做一组解码练习' })).toHaveAttribute('href', '#/decode/practice');

  // survives a reload
  await page.reload();
  await expect(page.getByRole('heading', { name: '今天的练习完成了！' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '第 1 课' })).toBeVisible();
  await expect(page.getByTestId('chunk-badge')).toHaveText('语块 已学 5 / 400');

  // 语块库: five items learned
  await page.getByRole('link', { name: '去语块库' }).click();
  await expect(page.getByLabel('学习进度')).toContainText('已学 5 / 400');

  // 解码: d01 is learned
  await page.goto('/#/decode');
  await expect(page.getByRole('link', { name: /第 1 句：The apple is red\./ })).toContainText('已学');
  await expect(page.getByRole('link', { name: /第 2 句：/ })).toContainText('未学');

  // 我的: stats, library progress and the attempts
  await page.goto('/#/me');
  await expect(page.getByRole('heading', { name: '学习统计' })).toBeVisible();
  await expect(page.getByText('已完成 1 课，下一课是第 2 课')).toBeVisible();
  await expect(page.getByRole('region', { name: '语块库进度' }).getByText('已学', { exact: true }).locator('xpath=following-sibling::p')).toHaveText('5');
  await expect(page.getByRole('heading', { name: '最近练习' })).toBeVisible();
  await expect(page.getByText(written[0])).toBeVisible();
});

test('a half-finished day resumes where it stopped; 剩下的明天再学 ends the new-items step', async ({ page }) => {
  await openToday(page);
  await finishEmptyReview(page);
  const items = firstItems(5);
  await doNewItemsPartly(page, items.slice(0, 2));

  // reload in the middle of the step: it continues with the third item, not the first
  await page.reload();
  await expect(page.getByTestId('chunks-progress')).toHaveText('新语块 3 / 5');
  await expect(page.getByTestId('chunks-title')).toHaveText(itemTitle(items[2]));
  await expect(page.getByRole('button', { name: '第 1 步 复习，已完成' })).toBeVisible();

  // enough for today
  await page.getByRole('button', { name: '剩下的明天再学' }).click();
  await expect(page.getByTestId('decode-note')).toBeVisible();
  await expect(page.getByRole('button', { name: '第 2 步 新语块，已完成' })).toBeVisible();
  await expect(page.getByTestId('chunk-badge')).toHaveText('语块 已学 2 / 400');

  // reload again: resumes at the decode step; finished steps can be redone
  await page.reload();
  await expect(page.getByTestId('dozen-en')).toHaveText('The apple is red.');
  await page.getByRole('button', { name: '第 1 步 复习，已完成' }).click();
  await expect(page.getByText('今天没有到期的复习')).toBeVisible();
});

test('the next lesson reviews yesterday\'s items first, then teaches the next ones', async ({ page }) => {
  await installClockOffset(page);
  await openToday(page);
  await finishEmptyReview(page);
  const day1 = firstItems(5);
  await doNewItems(page, day1);
  await doDecodeLesson(page, 'd01');
  await doOutputSelfCheck(page);
  await expect(page.getByRole('heading', { name: '今天的练习完成了！' })).toBeVisible();

  // two days later
  await page.evaluate(() => localStorage.setItem('e2e.offset', String(50 * 3_600_000)));
  await page.reload();
  await expect(page.getByRole('heading', { name: '第 2 课' })).toBeVisible();
  await expect(page.getByTestId('decode-badge')).toHaveText('解码 骨架 2/13');
  await expect(page.getByTestId('chunk-badge')).toHaveText('语块 已学 5 / 400');

  await reviewAll(page, 5);
  await page.getByRole('button', { name: '继续：新语块' }).click();
  await expect(page.getByTestId('chunks-progress')).toHaveText('新语块 1 / 5');
  await expect(page.getByTestId('chunks-title')).toHaveText(itemTitle(CURRICULUM[5]));
});

/** Learn the given items (not the whole day) and stay in the step. */
async function doNewItemsPartly(page: Page, items: ReturnType<typeof firstItems>): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    await expect(page.getByTestId('chunks-progress')).toHaveText(`新语块 ${i + 1} / 5`);
    await learnItem(page, items[i]);
  }
  await expect(page.getByTestId('chunks-progress')).toHaveText(`新语块 ${items.length + 1} / 5`);
}
