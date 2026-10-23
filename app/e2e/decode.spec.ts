import { expect, test } from '@playwright/test';
import { DOZEN } from '../src/content';
import { doTransforms } from './helpers';

test('decode hub lists the 13 skeletons and leads to the practice modes', async ({ page }) => {
  await page.goto('/#/decode');
  await expect(page.getByRole('heading', { name: '解码', exact: true })).toBeVisible();
  await expect(page.getByText('13 个骨架句，已学 0 个')).toBeVisible();
  await expect(page.getByRole('region', { name: '13 个骨架句' }).getByRole('listitem')).toHaveCount(DOZEN.length);
  await page.getByRole('link', { name: /变形练习/ }).click();
  await expect(page).toHaveURL(/#\/decode\/practice\?mode=transform$/);
  await expect(page.getByRole('heading', { name: '解码练习' })).toBeVisible();
});

test('transform practice: the right answers give 3/3 and grade the skeleton card', async ({ page }) => {
  await page.goto('/#/decode/practice?mode=transform&id=d01');
  await expect(page.getByRole('link', { name: /本组骨架：第 1 句 The apple is red\./ })).toBeVisible();

  // a wrong answer first: the reference answer and what changed in the skeleton are shown
  const first = DOZEN[0].transforms;
  await expect(page.getByTestId('transform-progress')).toContainText('第 1 / 3 题');
  await page.getByRole('textbox', { name: /你的答案/ }).fill('totally wrong answer');
  await page.getByRole('button', { name: '检查', exact: true }).click();
  await expect(page.getByText('不对，对照一下：')).toBeVisible();
  await expect(page.getByTestId('transform-answer')).toBeVisible();
  expect(first.length).toBeGreaterThanOrEqual(5);
  await page.getByRole('button', { name: '下一题' }).click();

  // the other two tasks, answered correctly
  await expect(page.getByTestId('transform-progress')).toContainText('第 2 / 3 题');
  expect(await doTransforms(page, 'd01')).toBe(2);

  await expect(page.getByTestId('practice-summary')).toContainText('答对 2 / 3');
  await expect(page.getByTestId('practice-summary')).toContainText('已记入这一句的复习');

  // 再来一组 and answer everything right: 3 / 3
  await page.getByRole('button', { name: '再来一组' }).click();
  expect(await doTransforms(page, 'd01')).toBe(3);
  await expect(page.getByTestId('practice-summary')).toContainText('答对 3 / 3');
  await expect(page.getByTestId('practice-summary')).toContainText('自动评级：简单');

  // the skeleton is now learned
  await page.goto('/#/decode');
  await expect(page.getByText('13 个骨架句，已学 1 个')).toBeVisible();
  await expect(page.getByRole('link', { name: /第 1 句：The apple is red\./ })).toContainText('已学');
});

test('label practice renders and takes a role for a word; the mode switch keeps the skeleton', async ({ page }) => {
  await page.goto('/#/decode/practice?mode=label&id=d01');
  await expect(page.getByRole('group', { name: '练习类型' }).getByRole('button', { name: '成分标注' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('label-zh')).toBeVisible();
  const words = page.getByRole('list', { name: '句子成分' }).locator('[data-token="asked"]');
  expect(await words.count()).toBeGreaterThan(1);
  await expect(page.getByRole('button', { name: '检查', exact: true })).toBeDisabled();

  // label the first word
  await words.first().click();
  await page.getByRole('group', { name: '选择成分' }).getByRole('button').first().click();
  await expect(words.first()).toHaveAttribute('data-state', 'set');

  // switching to transform mode keeps the same skeleton
  await page.getByRole('group', { name: '练习类型' }).getByRole('button', { name: '变形练习' }).click();
  await expect(page.getByTestId('transform-progress')).toBeVisible();
});
