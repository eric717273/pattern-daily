import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ai = vi.hoisted(() => ({ configured: false, promptsError: null as unknown, gradeError: null as unknown }));
vi.mock('../../lib/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/ai')>();
  return {
    ...actual,
    aiConfigured: () => ai.configured,
    generateOutputPrompts: vi.fn(() =>
      ai.promptsError
        ? Promise.reject(ai.promptsError)
        : Promise.resolve([
            { promptZh: '告诉他苹果是红的。', hintEn: 'apple, red' },
            { promptZh: '问她这是不是你的苹果。', hintEn: 'Is, your' },
            { promptZh: '说你明天要把它给他。', hintEn: 'give, tomorrow' },
          ]),
    ),
    gradeOutput: vi.fn(() =>
      ai.gradeError
        ? Promise.reject(ai.gradeError)
        : Promise.resolve({
            score: 88,
            correct: true,
            corrected: 'The apple is red.',
            explanationZh: '很好，注意 be 动词。',
            alternatives: ['That apple is red.'],
          }),
    ),
  };
});

import { DOZEN, SEED_FRAMES } from '../../content';
import { AiError, generateOutputPrompts, gradeOutput } from '../../lib/ai';
import { db } from '../../lib/db';
import { OutputStep } from './OutputStep';

const dozen = DOZEN[0];
const frames = SEED_FRAMES.slice(0, 2);

function renderStep(onComplete = vi.fn()) {
  render(<OutputStep dozen={dozen} frames={frames} scenes={['work']} dayKey="2026-10-22" count={3} onComplete={onComplete} />);
  return onComplete;
}

async function write(text: string) {
  fireEvent.change(await screen.findByRole('textbox', { name: '你造的英语句子' }), { target: { value: text } });
}

beforeEach(async () => {
  ai.configured = false;
  ai.promptsError = null;
  ai.gradeError = null;
  vi.mocked(generateOutputPrompts).mockClear();
  vi.mocked(gradeOutput).mockClear();
  sessionStorage.clear();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('OutputStep offline', () => {
  it('shows offline prompts with the skeleton, then the reference for self-check, and saves attempts', async () => {
    const onComplete = renderStep();
    expect(await screen.findByTestId('output-zh')).toBeInTheDocument();
    expect(screen.getByText('用这个骨架')).toBeInTheDocument();
    expect(screen.getByText('自查模式')).toBeInTheDocument();
    expect(screen.queryByText('提示词汇')).not.toBeInTheDocument();
    expect(generateOutputPrompts).not.toHaveBeenCalled();

    for (let i = 0; i < 3; i++) {
      await write(`my sentence ${i}`);
      fireEvent.click(screen.getByRole('button', { name: '提交并自查' }));
      expect(await screen.findByTestId('output-reference')).toBeInTheDocument();
      expect(screen.getByRole('list', { name: '答案对比' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: i === 2 ? '完成今日练习' : '下一句' }));
    }
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete.mock.calls[0][0]).toEqual(expect.any(Number));
    const saved = await db.attempts.toArray();
    expect(saved.map((a) => a.userEn).sort()).toEqual(['my sentence 0', 'my sentence 1', 'my sentence 2']);
    expect(saved.every((a) => a.feedback === undefined && a.promptZh)).toBe(true);
  });
});

describe('OutputStep with AI', () => {
  it('fetches prompts once (cached for the day), grades with AI and stores the feedback', async () => {
    ai.configured = true;
    const first = render(<OutputStep dozen={dozen} frames={frames} scenes={['work']} dayKey="2026-10-22" count={3} onComplete={vi.fn()} />);
    expect(screen.getByRole('status', { name: '正在生成今日题目' })).toBeInTheDocument();
    expect(await screen.findByTestId('output-zh')).toHaveTextContent('告诉他苹果是红的。');
    expect(screen.getByText('AI 批改', { selector: 'span' })).toBeInTheDocument();
    // AI prompts carry a vocabulary hint, shown next to the day's skeleton
    expect(screen.getByText('提示词汇')).toBeInTheDocument();
    expect(screen.getByText(`骨架：${dozen.en}`)).toBeInTheDocument();
    expect(screen.queryByText('用这个骨架')).not.toBeInTheDocument();
    expect(generateOutputPrompts).toHaveBeenCalledTimes(1);
    expect(generateOutputPrompts).toHaveBeenCalledWith({ dozen, frames, scenes: ['work'], count: 3 });

    await write('The apple red.');
    fireEvent.click(screen.getByRole('button', { name: 'AI 批改' }));
    expect(await screen.findByText('得分 88')).toBeInTheDocument();
    expect(screen.getByTestId('ai-corrected')).toHaveTextContent('The apple is red.');
    expect(screen.getByText('很好，注意 be 动词。')).toBeInTheDocument();
    expect(screen.getByText('That apple is red.')).toBeInTheDocument();
    expect(gradeOutput).toHaveBeenCalledWith({
      promptZh: '告诉他苹果是红的。',
      skeletonEn: 'apple, red',
      grammar: dozen.grammar,
      userEn: 'The apple red.',
    });
    await waitFor(async () => expect(await db.attempts.count()).toBe(1));
    const [attempt] = await db.attempts.toArray();
    expect(attempt).toMatchObject({ refKind: 'dozen', refId: 'd01', userEn: 'The apple red.' });
    expect(attempt.feedback?.score).toBe(88);

    // re-render (e.g. reload): prompts come from the day cache
    first.unmount();
    render(<OutputStep dozen={dozen} frames={frames} scenes={['work']} dayKey="2026-10-22" count={3} onComplete={vi.fn()} />);
    expect(await screen.findByTestId('output-zh')).toHaveTextContent('告诉他苹果是红的。');
    expect(generateOutputPrompts).toHaveBeenCalledTimes(1);
  });

  it('falls back to offline prompts with a notice when the AI cannot produce prompts', async () => {
    ai.configured = true;
    ai.promptsError = new AiError('network', 'DeepSeek 服务暂时不可用（HTTP 503），请稍后重试。');
    renderStep();
    expect(await screen.findByRole('note')).toHaveTextContent('已改用离线题目');
    expect(screen.getByRole('note')).toHaveTextContent('HTTP 503');
    expect(screen.getByTestId('output-zh')).toBeInTheDocument();
  });

  it('a grading error can be skipped: the sentence is still saved', async () => {
    ai.configured = true;
    ai.gradeError = new AiError('rate', '请求太频繁了，请稍等几秒再试。');
    renderStep();
    await write('I give him the apple.');
    fireEvent.click(await screen.findByRole('button', { name: 'AI 批改' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('请求太频繁了');
    fireEvent.click(screen.getByRole('button', { name: '跳过批改，直接保存' }));
    expect(await screen.findByRole('button', { name: '下一句' })).toBeInTheDocument();
    await waitFor(async () => expect(await db.attempts.count()).toBe(1));
    expect((await db.attempts.toArray())[0].feedback).toBeUndefined();
  });
});
