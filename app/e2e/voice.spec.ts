import { expect, test, type Page } from '@playwright/test';
import { SEED_FRAMES } from '../src/content';
import { buildCombo } from '../src/lib/frameEngine';

const FRAME = SEED_FRAMES.find((f) => f.id === 'f001');

interface FakeWindow {
  __recognizers: { aborted: boolean }[];
  __say: (text: string, final?: boolean) => void;
  __fail: (error: string) => void;
}

/**
 * Installs a fake webkitSpeechRecognition (Chromium has the real one, but no speech service in tests).
 * The test drives it through window.__say(text, final) like a recognizer streaming interim results.
 */
async function installFakeRecognition(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface Phrase {
      isFinal: boolean;
      length: number;
      [i: number]: { transcript: string };
    }
    class FakeRecognition {
      lang = '';
      interimResults = false;
      continuous = false;
      maxAlternatives = 1;
      onresult: ((e: { results: Phrase[] }) => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      onstart: (() => void) | null = null;
      results: Phrase[] = [];
      aborted = false;
      constructor() {
        w.__recognizers.push(this);
      }
      start() {
        setTimeout(() => this.onstart?.(), 20);
      }
      stop() {
        setTimeout(() => this.onend?.(), 0);
      }
      abort() {
        this.aborted = true;
      }
    }
    interface Win {
      __recognizers: FakeRecognition[];
      __say: (text: string, final?: boolean) => void;
      __fail: (error: string) => void;
      webkitSpeechRecognition: typeof FakeRecognition;
      SpeechRecognition: typeof FakeRecognition;
    }
    const w = window as unknown as Win;
    const active = () => {
      const rec = w.__recognizers.filter((r) => !r.aborted).at(-1);
      if (!rec) throw new Error('no active recognizer');
      return rec;
    };
    w.__recognizers = [];
    w.__say = (text, final = false) => {
      const rec = active();
      const phrase: Phrase = { isFinal: final, length: 1, 0: { transcript: text } };
      const last = rec.results.at(-1);
      if (last && !last.isFinal) rec.results[rec.results.length - 1] = phrase;
      else rec.results.push(phrase);
      rec.onresult?.({ results: [...rec.results] });
    };
    w.__fail = (error) => {
      const rec = active();
      rec.onerror?.({ error });
      rec.onend?.();
    };
    w.webkitSpeechRecognition = FakeRecognition;
    w.SpeechRecognition = FakeRecognition; // newer Chromium has the unprefixed constructor, which the app prefers
    try {
      localStorage.removeItem('pd.swapVoice');
    } catch {
      // storage unavailable
    }
  });
}

const say = (page: Page, text: string, final = false) =>
  page.evaluate(([t, f]) => (window as unknown as FakeWindow).__say(t as string, f as boolean), [text, final] as const);

/** The sentence the current prompt expects, found from its Chinese text (unique within frame f001). */
async function expectedSentence(page: Page): Promise<string> {
  if (!FRAME) throw new Error('frame f001 missing');
  const zh = ((await page.getByTestId('swap-zh').textContent()) ?? '').trim();
  const matches: string[] = [];
  const [subject, adjective, time] = FRAME.slots;
  for (let a = 0; a < subject.options.length; a++) {
    for (let b = 0; b < adjective.options.length; b++) {
      for (let c = 0; c < time.options.length; c++) {
        const combo = buildCombo(FRAME, { [subject.key]: a, [adjective.key]: b, [time.key]: c });
        if (combo.zh === zh) matches.push(combo.en);
      }
    }
  }
  expect(matches, `combos for "${zh}"`).toHaveLength(1);
  return matches[0];
}

test('voice-verified single swap: say the sentence before the countdown ends', async ({ page }) => {
  await installFakeRecognition(page);
  await page.goto('/#/frames/f001/drill/single');
  await expect(page.getByRole('heading', { name: '单槽快替' })).toBeVisible();

  await expect(page.getByRole('switch', { name: /语音验证/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: '慢 8s' })).toBeVisible();
  await page.getByRole('button', { name: '快 4s' }).click();

  await page.getByRole('button', { name: '开始快替' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as FakeWindow).__recognizers.length)).toBe(1);

  const total = 7;
  let correct = 0;
  for (let i = 1; i <= total; i++) {
    await expect(page.getByText(`第 ${i} / ${total} 句`)).toBeVisible();
    await expect(page.getByText(/正在听/)).toBeVisible();
    // the swapped slot's English is hidden until the prompt is decided
    await expect(page.getByTestId('swap-en')).toHaveCount(0);
    await expect(page.getByRole('group', { name: '替换表' }).getByText('?')).toBeVisible();
    const sentence = await expectedSentence(page);

    if (i === 6) {
      // say it wrong: the 4 s clock runs out -> 超时 + diff of what was heard
      await say(page, 'hello world');
      await expect(page.getByTestId('swap-live')).toHaveText('hello world');
      await expect(page.getByTestId('swap-result')).toHaveText(/✗ 超时/, { timeout: 10_000 });
      await expect(page.getByTestId('swap-en')).toHaveText(sentence);
      await expect(page.getByRole('list', { name: '答案对比' })).toBeVisible();
      await page.getByRole('button', { name: '下一句' }).click();
      continue;
    }
    if (i === 7) {
      await page.getByRole('button', { name: /显示答案/ }).click();
      await expect(page.getByTestId('swap-result')).toHaveText(/✗ 已跳过/);
      await expect(page.getByRole('list', { name: '答案对比' })).toHaveCount(0);
      await expect(page.getByTestId('swap-heard')).toHaveText('没有听到');
      await page.getByRole('button', { name: '完成这一轮' }).click();
      continue;
    }

    // interim words first (nothing happens), then the whole sentence, lower case and without the full stop
    const spoken = sentence.toLowerCase().replace(/\.$/, '');
    await say(page, spoken.split(' ').slice(0, 2).join(' '));
    await expect(page.getByTestId('swap-result')).toHaveCount(0);
    await say(page, spoken);
    correct++;
    await expect(page.getByTestId('swap-result')).toHaveText(/✓ 限时说对 · \d+\.\d 秒/);
    await expect(page.getByTestId('swap-en')).toHaveText(sentence);
    // auto-advances by itself
    await expect(page.getByText(`第 ${i + 1} / ${total} 句`)).toBeVisible({ timeout: 8000 });
  }

  await expect(page.getByTestId('voice-score')).toHaveText(`限时说对 ${correct} / ${total}`);
  expect(correct).toBe(5);
  await expect(page.getByRole('list', { name: '每一句的结果' }).getByRole('listitem')).toHaveCount(total);
  await expect(page.getByTestId('voice-advice')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as FakeWindow).__recognizers.every((r) => r.aborted))).toBe(true);

  await page.getByRole('button', { name: '完成单槽快替' }).click();
  await expect(page.getByText('这一轮完成了')).toBeVisible();
  await expect(page.getByText(/已记入复习/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('pd.swapSpeed.voice'))).toBe('fast');
});

test('a denied microphone falls back to self-grading with a Chinese message', async ({ page }) => {
  await installFakeRecognition(page);
  await page.goto('/#/frames/f001/drill/single');
  await page.getByRole('button', { name: '开始快替' }).click();
  await expect(page.getByText(/正在听/)).toBeVisible();
  await page.evaluate(() => (window as unknown as FakeWindow).__fail('not-allowed'));
  await expect(page.getByRole('alert')).toContainText('麦克风权限被拒绝');
  await expect(page.getByRole('button', { name: '显示答案' })).toBeVisible();
  await page.getByRole('button', { name: '显示答案' }).click();
  await expect(page.getByTestId('swap-en')).toBeVisible();
});
