import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiFeedback, DayPlan } from '../../types';

const ai = vi.hoisted(() => ({
  promptsFail: false,
  gradeFail: false,
  prompts: vi.fn(),
  grade: vi.fn(),
}));
vi.mock('../../lib/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/ai')>();
  return {
    ...actual,
    generateChunkPrompts: (input: { items: { kind: string; chunk?: { id: string }; frame?: { id: string } }[]; count: number }) => {
      ai.prompts(input);
      if (ai.promptsFail) return Promise.reject(new actual.AiError('network', '网络连接失败。'));
      return Promise.resolve(
        Array.from({ length: input.count }, (_, i) => {
          const it = input.items[i % input.items.length];
          return { promptZh: `情景 ${i + 1}：朋友问你想吃什么`, hintEn: 'up to', targetId: it.chunk?.id ?? it.frame?.id ?? '' };
        }),
      );
    },
    gradeOutput: (input: unknown) => {
      ai.grade(input);
      if (ai.gradeFail) return Promise.reject(new actual.AiError('rate', '请求太频繁，请稍后再试。'));
      const fb: AiFeedback = {
        score: 91,
        correct: true,
        corrected: 'It is up to you.',
        explanationZh: '语块用得很自然。',
        alternatives: ["It's your call."],
      };
      return Promise.resolve(fb);
    },
  };
});
vi.mock('../../lib/speech', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/speech')>()),
  speak: () => Promise.resolve(),
  stopSpeaking: () => undefined,
}));

import { CURRICULUM, getChunk } from '../../content';
import { db } from '../../lib/db';
import { introduceItems } from '../../lib/repo';
import { OutputStep } from './OutputStep';

const plan: DayPlan = {
  dayIndex: 1,
  decode: { phase: 'foundation', dozenId: 'd01' },
  newItems: CURRICULUM.slice(0, 4),
  outputCount: 3,
};

function renderStep(onComplete = vi.fn()) {
  render(
    <MemoryRouter>
      <OutputStep plan={plan} scenes={['work', 'daily']} dayKey="2030-01-01" onComplete={onComplete} />
    </MemoryRouter>,
  );
  return onComplete;
}

function setKey(): void {
  localStorage.setItem('pd.settings', JSON.stringify({ deepseekApiKey: 'sk-test' }));
}

beforeEach(async () => {
  ai.promptsFail = false;
  ai.gradeFail = false;
  ai.prompts.mockClear();
  ai.grade.mockClear();
  await Promise.all(db.tables.map((t) => t.clear()));
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // ignore
  }
  await introduceItems(plan.newItems);
});

describe('OutputStep with AI', () => {
  beforeEach(setKey);

  it('asks for chunk prompts about today\'s items once, and grades with the target chunk', async () => {
    const onComplete = renderStep();
    expect(await screen.findByTestId('output-zh')).toHaveTextContent('情景 1：朋友问你想吃什么');
    expect(ai.prompts).toHaveBeenCalledTimes(1);
    const call = ai.prompts.mock.calls[0][0] as { items: unknown[]; scenes: string[]; count: number };
    expect(call.count).toBe(3);
    expect(call.scenes).toEqual(['work', 'daily']);
    expect(call.items).toHaveLength(4);
    expect(screen.getByTestId('output-hint')).toHaveTextContent('up to');

    fireEvent.change(screen.getByRole('textbox', { name: '你造的英语句子' }), { target: { value: 'Its up to you' } });
    fireEvent.click(screen.getByRole('button', { name: 'AI 批改' }));
    expect(await screen.findByText('得分 91')).toBeInTheDocument();
    expect(screen.getByTestId('ai-corrected')).toHaveTextContent('It is up to you.');
    expect(screen.getByText('语块用得很自然。')).toBeInTheDocument();
    const graded = ai.grade.mock.calls[0][0] as { promptZh: string; userEn: string; targetChunk: string; grammar?: unknown };
    expect(graded.userEn).toBe('Its up to you');
    expect(graded.promptZh).toBe('情景 1：朋友问你想吃什么');
    expect(graded.grammar).toBeUndefined();
    const first = plan.newItems[0];
    const targetChunk = first.kind === 'chunk' ? (getChunk(first.id)?.en ?? '') : '{';
    expect(graded.targetChunk).toContain(targetChunk.slice(0, 3));

    const [attempt] = await db.attempts.toArray();
    expect(attempt).toMatchObject({ refKind: first.kind, refId: first.id, userEn: 'Its up to you' });
    expect(attempt.feedback?.score).toBe(91);

    fireEvent.click(screen.getByRole('button', { name: '下一题' }));
    expect(await screen.findByTestId('output-progress')).toHaveTextContent('第 2 / 3 题');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('reuses the day\'s prompts after a remount instead of asking again', async () => {
    renderStep();
    await screen.findByTestId('output-zh');
    expect(ai.prompts).toHaveBeenCalledTimes(1);
    renderStep();
    await waitFor(() => expect(screen.getAllByTestId('output-zh')).toHaveLength(2));
    expect(ai.prompts).toHaveBeenCalledTimes(1);
  });

  it('falls back to offline questions with a notice when the AI cannot make prompts', async () => {
    ai.promptsFail = true;
    renderStep();
    expect(await screen.findByRole('note')).toHaveTextContent('已改用离线题目');
    expect(screen.getByTestId('output-zh')).toBeInTheDocument();
    // offline questions are self-checked
    fireEvent.change(screen.getByRole('textbox', { name: '你造的英语句子' }), { target: { value: 'anything' } });
    fireEvent.click(screen.getByRole('button', { name: 'AI 批改' }));
    expect(await screen.findByTestId('ai-feedback')).toBeInTheDocument();
  });

  it('a grading error keeps the answer and offers to save without grading', async () => {
    ai.gradeFail = true;
    const onComplete = renderStep();
    await screen.findByTestId('output-zh');
    fireEvent.change(screen.getByRole('textbox', { name: '你造的英语句子' }), { target: { value: 'my answer' } });
    fireEvent.click(screen.getByRole('button', { name: 'AI 批改' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('请求太频繁');
    expect(screen.getByRole('textbox', { name: '你造的英语句子' })).toHaveValue('my answer');
    fireEvent.click(screen.getByRole('button', { name: '跳过批改，直接保存' }));
    expect(await screen.findByText('你写的：')).toBeInTheDocument();
    const [attempt] = await db.attempts.toArray();
    expect(attempt.userEn).toBe('my answer');
    expect(attempt.feedback).toBeUndefined();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('finishes with the active time after the last question', async () => {
    const onComplete = renderStep();
    for (let i = 1; i <= 3; i++) {
      await screen.findByText(`第 ${i} / 3 题`);
      fireEvent.change(screen.getByRole('textbox', { name: '你造的英语句子' }), { target: { value: `answer ${i}` } });
      fireEvent.click(screen.getByRole('button', { name: 'AI 批改' }));
      await screen.findByText('得分 91');
      fireEvent.click(screen.getByRole('button', { name: i === 3 ? '完成今日练习' : '下一题' }));
    }
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete.mock.calls[0][0]).toBeTypeOf('number');
    expect(ai.grade).toHaveBeenCalledTimes(3);
  });
});

describe('OutputStep offline', () => {
  it('a chunk question: the example turn in Chinese with "用上：<chunk zh>", reveals the example', async () => {
    renderStep();
    const first = plan.newItems[0];
    expect(await screen.findByTestId('output-zh')).toBeInTheDocument();
    expect(ai.prompts).not.toHaveBeenCalled();
    if (first.kind === 'chunk') {
      expect(screen.getByTestId('output-hint')).toHaveTextContent(`用上：${getChunk(first.id)?.zh}`);
    }
    expect(screen.getByText('自查模式')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: '你造的英语句子' }), { target: { value: 'my try' } });
    fireEvent.click(screen.getByRole('button', { name: '提交并自查' }));
    expect(await screen.findByTestId('output-reference')).toBeInTheDocument();
    expect(ai.grade).not.toHaveBeenCalled();
    const [attempt] = await db.attempts.toArray();
    expect(attempt).toMatchObject({ refKind: first.kind, refId: first.id, userEn: 'my try' });
  });
});
