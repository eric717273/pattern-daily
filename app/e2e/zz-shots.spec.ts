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


const OUT = '/tmp/claude-0/-home-user-pattern-daily/b7a99459-f445-5f3e-96c0-28da916e4cf5/scratchpad/voice';

for (const [w, h, name] of [[1280, 800, 'desk'], [390, 844, 'phone']] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`${name}-${scheme}`, () => {
      test.use({ viewport: { width: w, height: h }, colorScheme: scheme });
      test('shots', async ({ page }) => {
        test.setTimeout(120_000);
        const shot = (n: string) => page.screenshot({ path: `${OUT}/${name}-${scheme}-${n}.png`, fullPage: true });
        await installFakeRecognition(page);
        await page.goto('/#/frames/f001/drill/single');
        await page.getByRole('button', { name: '快 4s' }).click();
        await page.getByRole('button', { name: '开始快替' }).click();
        await expect(page.getByText(/正在听/)).toBeVisible();
        await page.waitForTimeout(1500);
        const s1 = await expectedSentence(page);
        await say(page, s1.toLowerCase().split(' ').slice(0, 3).join(' ') + ' uh');
        await shot('1-listening');
        await say(page, s1.toLowerCase().replace(/\.$/, ''));
        await expect(page.getByTestId('swap-result')).toBeVisible();
        await shot('2-success');
        await expect(page.getByText('第 2 / 7 句')).toBeVisible({ timeout: 8000 });
        const s2 = await expectedSentence(page);
        const words = s2.toLowerCase().replace(/\.$/, '').split(' ');
        words[1] = 'thing';
        await say(page, words.join(' '));
        await expect(page.getByTestId('swap-result')).toHaveText(/超时/, { timeout: 8000 });
        await shot('3-timeout');
        await page.getByRole('button', { name: '下一句' }).click();
        for (let i = 3; i <= 7; i++) {
          await expect(page.getByText(`第 ${i} / 7 句`)).toBeVisible();
          if (i <= 5) {
            await say(page, (await expectedSentence(page)).toLowerCase().replace(/\.$/, ''));
            await expect(page.getByText(`第 ${i + 1} / 7 句`)).toBeVisible({ timeout: 8000 }).catch(() => undefined);
          } else {
            await page.getByRole('button', { name: /显示答案/ }).click();
            await page.getByRole('button', { name: /^(下一句|完成这一轮)$/ }).click();
          }
        }
        await expect(page.getByTestId('voice-score')).toBeVisible();
        await shot('4-summary');
      });
    });
  }
}
