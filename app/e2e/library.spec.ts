import { expect, test } from '@playwright/test';
import { CHUNKS, CURRICULUM, getChunk, SEED_FRAMES } from '../src/content';
import { FUNCTION_CATEGORY_LABELS } from '../src/lib/labels';
import { disableVoiceVerification, learnItem } from './helpers';

const CATEGORY = 'request' as const;
const inCategory = (c: { category?: string }) => c.category === CATEGORY;
const chunkTotal = CHUNKS.filter(inCategory).length;
const frameTotal = SEED_FRAMES.filter(inCategory).length;

test('library: totals, category filter, kind filter and search', async ({ page }) => {
  await page.goto('/#/library');
  await expect(page.getByRole('heading', { name: '语块库' })).toBeVisible();
  await expect(page.getByLabel('学习进度')).toContainText('已学 0 / 400');
  await expect(page.getByTestId('library-count')).toHaveText('共 400 条');

  // category filter
  await page.getByRole('button', { name: new RegExp(`^${FUNCTION_CATEGORY_LABELS[CATEGORY]}`) }).click();
  await expect(page.getByTestId('library-count')).toHaveText(`共 ${chunkTotal + frameTotal} 条`);
  await expect(page.getByRole('button', { name: '显示全部' })).toBeVisible();

  // kind filter inside the category
  await page.getByRole('group', { name: '类型' }).getByRole('button', { name: '固定表达' }).click();
  await expect(page.getByTestId('library-count')).toHaveText(`共 ${chunkTotal} 条`);
  await page.getByRole('group', { name: '类型' }).getByRole('button', { name: '母框', exact: true }).click();
  await expect(page.getByTestId('library-count')).toHaveText(`共 ${frameTotal} 条`);

  // back to everything, then search for one chunk
  await page.getByRole('button', { name: '显示全部' }).click();
  await page.getByRole('group', { name: '类型' }).getByRole('button', { name: '全部', exact: true }).click();
  await expect(page.getByTestId('library-count')).toHaveText('共 400 条');
  const target = CHUNKS[41];
  await page.getByRole('searchbox', { name: '搜索语块' }).fill(target.en);
  await expect(page.getByRole('link', { name: new RegExp(target.zh) }).first()).toBeVisible();
  const count = Number(/共 (\d+) 条/.exec((await page.getByTestId('library-count').innerText()) ?? '')?.[1]);
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(10);

  // nothing matches: the empty state offers to clear the filters
  await page.getByRole('searchbox', { name: '搜索语块' }).fill('zzzzqqq');
  await expect(page.getByText('没有符合条件的内容')).toBeVisible();
  await page.getByRole('button', { name: '清除筛选' }).click();
  await expect(page.getByTestId('library-count')).toHaveText('共 400 条');
});

test('chunk detail: content, 开始练这条 runs the drills and adds it to review', async ({ page }) => {
  await disableVoiceVerification(page);
  const first = CURRICULUM.find((r) => r.kind === 'chunk');
  const chunk = first ? getChunk(first.id) : undefined;
  if (!first || !chunk) throw new Error('no chunk in the curriculum');

  await page.goto('/#/library');
  await page.getByRole('searchbox', { name: '搜索语块' }).fill(chunk.en);
  await page.getByRole('link', { name: new RegExp(chunk.zh) }).first().click();
  await expect(page).toHaveURL(new RegExp(`#/library/chunk/${chunk.id}$`));

  await expect(page.getByTestId('chunk-en')).toHaveText(chunk.en);
  await expect(page.getByText(chunk.zh).first()).toBeVisible();
  await expect(page.getByRole('region', { name: '例句' }).getByRole('listitem')).toHaveCount(chunk.examples.length);
  await expect(page.getByText('未加入复习')).toBeVisible();

  // practice it: 听辨 -> 跟读 -> 说出
  await page.getByRole('button', { name: '开始练这条' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('list', { name: '步骤' })).toContainText('听辨');
  await learnItem(page, { kind: 'chunk', id: chunk.id });
  await expect(page.getByTestId('practice-done')).toContainText('已加入复习');
  await sheet.getByRole('button', { name: '完成' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(/已复习 1 次/)).toBeVisible();
  await expect(page.getByRole('button', { name: '再练一遍' })).toBeVisible();

  // the library counts it
  await page.getByRole('link', { name: '语块库' }).first().click();
  await expect(page.getByLabel('学习进度')).toContainText('已学 1 / 400');
});
