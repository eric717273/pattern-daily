import { expect, type Page } from '@playwright/test';
import { disableVoiceVerification } from './helpers';

/** Shift the page's clock forward by the number of ms stored under 'e2e.offset' (set it, then reload). */
export async function installClockOffset(page: Page): Promise<void> {
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

/** Sets a goal through the real onboarding: defaults (100 days, 20 min), skipping the diagnostic, then 开始第一课. */
export async function setGoalViaOnboarding(page: Page): Promise<void> {
  await disableVoiceVerification(page);
  await page.goto('/#/onboarding');
  await page.getByRole('button', { name: '下一步：诊断测试' }).click();
  await page.getByRole('button', { name: '先跳过诊断' }).click();
  await expect(page.getByTestId('result-skipped')).toBeVisible();
  await page.getByRole('button', { name: '开始第一课' }).click();
  await expect(page.getByRole('heading', { name: /^第 \d+ 课$/ })).toBeVisible();
}

/** One dialogue of the listening block: gist, then give up on every dictation blank, then 对照 -> 完成. */
async function doDialogue(page: Page): Promise<void> {
  await page.getByRole('button', { name: '播放对话' }).click();
  await page.getByRole('group', { name: '主旨选项' }).getByRole('button').first().click();
  await page.getByRole('button', { name: '下一步：听写关键语块' }).click();
  for (;;) {
    await page.getByRole('button', { name: '不会，看答案' }).click();
    const next = page.getByRole('button', { name: /^(下一个|下一步：对照原文)$/ });
    const last = (await next.innerText()).startsWith('下一步');
    await next.click();
    if (last) break;
  }
  await page.getByRole('button', { name: '完成', exact: true }).click();
}

/** A sound / numbers drill: give up on each item, step through until 完成. */
async function doGiveUpDrill(page: Page, next: RegExp): Promise<void> {
  for (;;) {
    await page.getByRole('button', { name: '不会，看答案' }).click();
    const btn = page.getByRole('button', { name: next });
    const last = (await btn.innerText()).trim() === '完成';
    await btn.click();
    if (last) return;
  }
}

/** Step 3 听力 with the real drills (answers are skipped: the flow, logging and feedback are what is tested). Returns the task count. */
export async function doListeningBlock(page: Page): Promise<number> {
  const progress = page.getByTestId('listening-progress');
  await expect(progress).toBeVisible();
  const total = Number(/\/ (\d+)/.exec(await progress.innerText())?.[1]);
  for (let i = 1; i <= total; i++) {
    await expect(progress).toHaveText(`听力 ${i} / ${total}`);
    if (await page.getByLabel('听主旨').isVisible()) await doDialogue(page);
    else if (await page.getByLabel('音变听写').isVisible()) await doGiveUpDrill(page, /^(下一句|完成)$/);
    else await doGiveUpDrill(page, /^(下一题|完成)$/);
  }
  await expect(page.getByText('听力完成')).toBeVisible();
  await page.getByRole('button', { name: '继续：解码' }).click();
  return total;
}
