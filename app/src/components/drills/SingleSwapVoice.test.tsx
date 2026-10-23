import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubstitutionFrame } from '../../types';

const ADJECTIVES = ['hot', 'cold', 'zzyzx', 'fresh', 'ready', 'sweet', 'salty', 'spicy'];

const frame: SubstitutionFrame = {
  id: 'f-voice',
  title: '测试',
  pattern: '{subject} is {adj}.',
  patternZh: '{subject}{adj}。',
  slots: [
    { key: 'subject', labelZh: '主语', options: [{ en: 'The soup', zh: '汤' }] },
    {
      key: 'adj',
      labelZh: '形容词',
      options: ADJECTIVES.map((en, i) => ({ en, zh: `形容${i}` })),
    },
  ],
  grammar: ['be-adj'],
  scene: 'daily',
  level: 1,
  examples: [],
  source: 'seed',
};

vi.mock('../../lib/frameEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/frameEngine')>();
  return {
    ...actual,
    // "The soup is hot." then only the adjective changes, one option after the other
    singleSwapSequence: (f: SubstitutionFrame, length: number) =>
      Array.from({ length }, (_, i) => actual.buildCombo(f, { subject: 0, adj: i })),
  };
});

const speechState = vi.hoisted(() => ({ speaking: false }));
const spoken = vi.hoisted(() => [] as string[]);
vi.mock('../../lib/speech', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/speech')>();
  return {
    ...actual,
    speak: (text: string) => {
      spoken.push(text);
      return Promise.resolve();
    },
    isSpeaking: () => speechState.speaking,
  };
});

import { SingleSwapDrill } from './SingleSwapDrill';

// ---------- a controllable SpeechRecognition ----------

interface FakeResult {
  isFinal: boolean;
  length: number;
  [i: number]: { transcript: string };
}

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  interimResults = false;
  continuous = false;
  maxAlternatives = 1;
  onresult: ((e: { results: FakeResult[] }) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  aborted = false;
  stopped = false;
  private results: FakeResult[] = [];

  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.onstart?.();
  }
  stop() {
    this.stopped = true;
    this.onend?.();
  }
  abort() {
    this.aborted = true;
  }

  /** Replace the phrase at `index` (or append a new one) like a real recognizer streaming updates. */
  say(text: string, opts: { final?: boolean; alternatives?: string[]; index?: number } = {}) {
    const alts = [text, ...(opts.alternatives ?? [])];
    const r: FakeResult = { isFinal: opts.final ?? false, length: alts.length };
    alts.forEach((t, i) => {
      r[i] = { transcript: t };
    });
    const index = opts.index ?? Math.max(0, this.results.length - (this.results.at(-1)?.isFinal === false ? 1 : 0));
    this.results[index] = r;
    act(() => this.onresult?.({ results: [...this.results] }));
  }
  fail(error: string) {
    act(() => {
      this.onerror?.({ error });
      this.onend?.();
    });
  }
}

const live = () => FakeRecognition.instances.at(-1) as FakeRecognition;

function install(supported: boolean) {
  const w = window as unknown as Record<string, unknown>;
  if (supported) w.webkitSpeechRecognition = FakeRecognition;
  else delete w.webkitSpeechRecognition;
}

const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

function startDrill(onDone = vi.fn(), length = 8) {
  const view = render(<SingleSwapDrill frame={frame} length={length} onDone={onDone} />);
  fireEvent.click(screen.getByRole('button', { name: '开始快替' }));
  return { ...view, onDone };
}

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  FakeRecognition.instances = [];
  spoken.length = 0;
  speechState.speaking = false;
  install(true);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  install(false);
});

describe('SingleSwapDrill voice mode', () => {
  it('is on by default when supported, with 8s / 6s / 4s presets, and starts the recognizer on 开始', () => {
    render(<SingleSwapDrill frame={frame} onDone={() => undefined} />);
    expect(screen.getByRole('switch', { name: /语音验证/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: '慢 8s' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '中 6s' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '快 4s' })).toBeInTheDocument();
    expect(FakeRecognition.instances).toHaveLength(0); // not before the tap (Safari needs a gesture)

    fireEvent.click(screen.getByRole('button', { name: '开始快替' }));
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(live()).toMatchObject({ lang: 'en-US', interimResults: true, continuous: true, maxAlternatives: 3 });
  });

  it('never has the answer in the DOM before it is revealed, even while speaking', () => {
    startDrill();
    // prompt 1 changes the adjective to "cold"; prompt 2 to "zzyzx"
    expect(screen.getByTestId('swap-zh')).toHaveTextContent('形容1');
    expect(document.body.innerHTML).not.toContain('cold');
    expect(screen.queryByTestId('swap-en')).not.toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: '形容词' })).getByText('?')).toBeInTheDocument();
    live().say('the soup is', { final: false });
    expect(screen.getByTestId('swap-live')).toHaveTextContent('the soup is');
    expect(screen.queryByTestId('swap-en')).not.toBeInTheDocument();
  });

  it('a matching interim result before the time limit stops the clock: ✓ 限时说对 + time, reveal, auto-advance', async () => {
    startDrill();
    await tick(1800);
    live().say('the soup is cold'); // an interim result (not final) is enough
    expect(screen.getByTestId('swap-result')).toHaveTextContent('✓ 限时说对');
    expect(screen.getByTestId('swap-result')).toHaveTextContent('1.8 秒');
    expect(screen.getByTestId('swap-en')).toHaveTextContent('The soup is cold.');
    expect(within(screen.getByRole('group', { name: '形容词' })).getByText('cold')).toBeInTheDocument();
    expect(spoken).toContain('The soup is cold.');

    // the countdown no longer fails the prompt
    await tick(7000);
    expect(screen.getByText('第 2 / 7 句')).toBeInTheDocument();
  });

  it('is lenient: contractions-free fillers, case, punctuation and alternatives count', async () => {
    startDrill();
    live().say('Uh, the soup was cold', { alternatives: ['uh the soup is cold.'] });
    expect(screen.getByTestId('swap-result')).toHaveTextContent('✓ 限时说对');
  });

  it('a wrong swapped word does not count even when the rest is right', async () => {
    startDrill();
    live().say('the soup is hot');
    expect(screen.queryByTestId('swap-result')).not.toBeInTheDocument();
    expect(screen.queryByTestId('swap-en')).not.toBeInTheDocument();
  });

  it('ignores results while text-to-speech is playing', () => {
    startDrill();
    speechState.speaking = true;
    live().say('the soup is cold');
    expect(screen.queryByTestId('swap-result')).not.toBeInTheDocument();
    speechState.speaking = false;
    live().say('the soup is cold');
    expect(screen.getByTestId('swap-result')).toHaveTextContent('✓ 限时说对');
  });

  it('time runs out: ✗ 超时, answer, diff of what was heard; waits for 下一句', async () => {
    startDrill();
    live().say('the soup is hot');
    await tick(8200);
    expect(screen.getByTestId('swap-result')).toHaveTextContent('✗ 超时');
    expect(screen.getByTestId('swap-en')).toHaveTextContent('The soup is cold.');
    const diff = screen.getByRole('list', { name: '答案对比' });
    expect(within(diff).getByText('cold').closest('li')).toHaveAttribute('data-status', 'missing');
    expect(within(diff).getByText('hot').closest('li')).toHaveAttribute('data-status', 'extra');
    expect(spoken).toContain('The soup is cold.');

    await tick(5000); // no auto-advance after a failure
    expect(screen.getByText('第 1 / 7 句')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一句' }));
    expect(screen.getByText('第 2 / 7 句')).toBeInTheDocument();
  });

  it('shows 没有听到 when nothing was recognized', async () => {
    startDrill();
    await tick(8200);
    expect(screen.getByTestId('swap-result')).toHaveTextContent('✗ 超时');
    expect(screen.getByTestId('swap-heard')).toHaveTextContent('没有听到');
    expect(screen.queryByRole('list', { name: '答案对比' })).not.toBeInTheDocument();
  });

  it('the countdown only starts once the microphone is capturing', async () => {
    // a recognizer that has not started yet (permission prompt open)
    class SlowStart extends FakeRecognition {
      start() {
        // no onstart yet
      }
    }
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = SlowStart;
    startDrill();
    await tick(20_000);
    expect(screen.queryByTestId('swap-result')).not.toBeInTheDocument();
    expect(screen.getByText(/正在启动麦克风/)).toBeInTheDocument();
    act(() => live().onstart?.());
    await tick(8200);
    expect(screen.getByTestId('swap-result')).toHaveTextContent('✗ 超时');
  });

  it('跳过 / 显示答案 reveals the answer as a miss', () => {
    startDrill();
    fireEvent.click(screen.getByRole('button', { name: /显示答案/ }));
    expect(screen.getByTestId('swap-result')).toHaveTextContent('✗ 已跳过');
    expect(screen.getByTestId('swap-en')).toHaveTextContent('The soup is cold.');
  });

  it('再说一次 retries once without counting it as in time', async () => {
    startDrill();
    await tick(8200);
    fireEvent.click(screen.getByRole('button', { name: '再说一次' }));
    expect(screen.queryByRole('button', { name: '再说一次' })).not.toBeInTheDocument();
    live().say('the soup is cold');
    expect(screen.getByTestId('swap-result')).toHaveTextContent('✗ 超时');
    expect(screen.getByTestId('swap-result')).toHaveTextContent('说对了（不计入限时）');
    await tick(3000); // still no auto-advance
    expect(screen.getByText('第 1 / 7 句')).toBeInTheDocument();
  });

  it('summarizes the round, grades it from the accuracy and remembers the chosen speed', async () => {
    const { onDone } = startDrill();
    for (let i = 1; i <= 7; i++) {
      if (i === 5) {
        await tick(8200); // one prompt runs out
        fireEvent.click(screen.getByRole('button', { name: '下一句' }));
        continue;
      }
      live().say(`the soup is ${ADJECTIVES[i]}`);
      expect(screen.getByTestId('swap-result')).toHaveTextContent('✓ 限时说对');
      await tick(1500);
    }
    expect(screen.getByTestId('voice-score')).toHaveTextContent('限时说对 6 / 7');
    expect(screen.getByTestId('voice-avg')).toHaveTextContent(/平均用时 0\.0 秒/);
    const rows = within(screen.getByRole('list', { name: '每一句的结果' })).getAllByRole('listitem');
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.getAttribute('data-ok'))).toEqual(['true', 'true', 'true', 'true', 'false', 'true', 'true']);
    expect(rows[0]).toHaveTextContent('你说：the soup is cold');
    expect(rows[4]).toHaveTextContent('没有听到');
    // 6 / 7: suggest going one preset faster
    expect(screen.getByTestId('voice-advice')).toHaveTextContent('建议加速到「中 6s」');
    expect(screen.getByRole('button', { name: '中 6s', pressed: true })).toBeInTheDocument();
    // the microphone is released at the end of the round
    expect(live().aborted).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '完成单槽快替' }));
    expect(onDone).toHaveBeenCalledWith({ ms: expect.any(Number), feel: 'easy', grade: 3, correct: 6, total: 7 });
    expect(localStorage.getItem('pd.swapSpeed.voice')).toBe('medium');
    expect(localStorage.getItem('pd.swapSpeed')).toBeNull(); // the self-graded preset is untouched
  });

  it('suggests slowing down at 3 / 7 or fewer and grades 1', async () => {
    const { onDone } = startDrill();
    for (let i = 1; i <= 7; i++) {
      if (i <= 3) {
        live().say(`the soup is ${ADJECTIVES[i]}`);
        await tick(1500);
      } else {
        await tick(8200);
        fireEvent.click(screen.getByRole('button', { name: i === 7 ? '完成这一轮' : '下一句' }));
      }
    }
    expect(screen.getByTestId('voice-score')).toHaveTextContent('限时说对 3 / 7');
    // already on the slowest preset
    expect(screen.getByTestId('voice-advice')).toHaveTextContent('已经是最慢一档');
    fireEvent.click(screen.getByRole('button', { name: '完成单槽快替' }));
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ grade: 1, feel: 'hard', correct: 3 }));
  });

  it('persists the toggle and uses 4 / 3 / 2 s when voice mode is off', () => {
    render(<SingleSwapDrill frame={frame} onDone={() => undefined} />);
    fireEvent.click(screen.getByRole('switch', { name: /语音验证/ }));
    expect(localStorage.getItem('pd.swapVoice')).toBe('0');
    expect(screen.getByRole('button', { name: '慢 4s' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '快 2s' }));
    expect(localStorage.getItem('pd.swapSpeed')).toBe('fast');
    expect(localStorage.getItem('pd.swapSpeed.voice')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '开始快替' }));
    expect(FakeRecognition.instances).toHaveLength(0);
    expect(screen.getByRole('button', { name: '显示答案' })).toBeInTheDocument();
  });

  it('remembers a saved "off" preference and per-mode speeds', () => {
    localStorage.setItem('pd.swapVoice', '0');
    localStorage.setItem('pd.swapSpeed.voice', 'fast');
    const { unmount } = render(<SingleSwapDrill frame={frame} onDone={() => undefined} />);
    expect(screen.getByRole('switch', { name: /语音验证/ })).toHaveAttribute('aria-checked', 'false');
    unmount();
    localStorage.setItem('pd.swapVoice', '1');
    render(<SingleSwapDrill frame={frame} onDone={() => undefined} />);
    expect(screen.getByRole('button', { name: '快 4s', pressed: true })).toBeInTheDocument();
  });

  it('falls back to self-grading with a Chinese message when recognition fails', () => {
    startDrill();
    live().fail('not-allowed');
    expect(screen.getByRole('alert')).toHaveTextContent('麦克风权限被拒绝：请在浏览器/系统设置中允许本网站使用麦克风');
    expect(screen.getByRole('button', { name: '显示答案' })).toBeInTheDocument();
    expect(screen.queryByTestId('swap-live')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /语音验证/ })).toHaveAttribute('aria-checked', 'false');
    // the saved preference is untouched
    expect(localStorage.getItem('pd.swapVoice')).toBeNull();
  });

  it('restarts the recognizer when the browser ends the session early', async () => {
    startDrill();
    const first = live();
    await tick(2000);
    act(() => first.onend?.());
    await tick(300);
    expect(FakeRecognition.instances).toHaveLength(2);
    live().say('the soup is cold');
    expect(screen.getByTestId('swap-result')).toHaveTextContent('✓ 限时说对');
  });

  it('keeps one session across prompts and ignores speech from the previous prompt', async () => {
    startDrill();
    live().say('the soup is cold', { final: true, index: 0 });
    await tick(1500);
    expect(screen.getByText('第 2 / 7 句')).toBeInTheDocument();
    expect(FakeRecognition.instances).toHaveLength(1);
    // the old phrase is still in the recognizer's result list but is not heard again
    expect(screen.getByTestId('swap-live')).not.toHaveTextContent('cold');
    live().say('the soup is zzyzx', { final: true, index: 1 });
    expect(screen.getByTestId('swap-result')).toHaveTextContent('✓ 限时说对');
  });

  it('stops the recognizer and clears timers on unmount', async () => {
    const { unmount } = startDrill();
    const rec = live();
    unmount();
    expect(rec.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('SingleSwapDrill without speech recognition', () => {
  it('keeps the self-graded flow and says so', () => {
    install(false);
    render(<SingleSwapDrill frame={frame} onDone={() => undefined} />);
    expect(screen.getByText('当前浏览器不支持语音识别，改为自评模式')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /语音验证/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '慢 4s' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '开始快替' }));
    expect(screen.queryByTestId('swap-en')).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('cold');
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    expect(screen.getByTestId('swap-en')).toHaveTextContent('The soup is cold.');
  });
});
