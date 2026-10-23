import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlashPrompt } from '../../lib/drill';

vi.mock('../../lib/repo', () => ({
  gradeCard: vi.fn(() => Promise.resolve({})),
}));

const speech = vi.hoisted(() => ({ supported: false, heard: 'I give John the apple' }));
vi.mock('../../lib/speech', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/speech')>();
  return {
    ...actual,
    recognitionSupported: () => speech.supported,
    listenOnce: () => Promise.resolve(speech.heard),
  };
});

import { gradeCard } from '../../lib/repo';
import { Flashcard } from './Flashcard';

const prompt: FlashPrompt = {
  cardId: 'dozen:d03',
  kind: 'dozen',
  title: '第 3 句 · 换词',
  promptZh: '我给约翰苹果。',
  answerEn: 'I give John the apple.',
  skeletonEn: 'I give John the apple.',
};

beforeEach(() => {
  vi.mocked(gradeCard).mockClear();
  speech.supported = false;
});

describe('Flashcard', () => {
  it('shows the Chinese prompt and skeleton hint, hides the answer until revealed', () => {
    render(<Flashcard prompt={prompt} index={2} total={5} onGraded={() => undefined} />);
    expect(screen.getByTestId('flash-prompt')).toHaveTextContent('我给约翰苹果。');
    expect(screen.getByText(/骨架:/)).toBeInTheDocument();
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
    expect(screen.queryByTestId('flash-answer')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /良好/ })).not.toBeInTheDocument();
    // no speech recognition: no mic button
    expect(screen.queryByRole('button', { name: /语音识别/ })).not.toBeInTheDocument();
  });

  it('keeps the English answer out of the DOM (text, aria-labels, titles) until revealed', () => {
    const p: FlashPrompt = { cardId: 'frame:f001', kind: 'frame', title: '测试', promptZh: '披萨很热。', answerEn: 'The pizza is zzyzx.' };
    render(<Flashcard prompt={p} index={1} total={1} onGraded={() => undefined} />);
    expect(document.body.innerHTML).not.toContain('zzyzx');
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    expect(document.body.innerHTML).toContain('zzyzx');
  });

  it('reveals the answer with a speak button and the four grade buttons', () => {
    render(<Flashcard prompt={prompt} index={1} total={1} onGraded={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    expect(screen.getByTestId('flash-answer')).toHaveTextContent('I give John the apple.');
    expect(screen.getByRole('button', { name: /朗读：I give John the apple\./ })).toBeInTheDocument();
    for (const g of ['忘了', '困难', '良好', '简单']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${g}`) })).toBeInTheDocument();
    }
  });

  it.each([
    ['忘了', 0],
    ['困难', 1],
    ['良好', 2],
    ['简单', 3],
  ] as const)('grading %s calls repo.gradeCard with grade %i in review mode', async (label, grade) => {
    const onGraded = vi.fn();
    render(<Flashcard prompt={prompt} index={1} total={1} onGraded={onGraded} />);
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }));
    await waitFor(() => expect(onGraded).toHaveBeenCalledTimes(1));
    expect(gradeCard).toHaveBeenCalledTimes(1);
    expect(gradeCard).toHaveBeenCalledWith('dozen:d03', grade, 'review', expect.any(Number));
    expect(onGraded.mock.calls[0][0]).toBe(grade);
  });

  it('still moves on (with a notice) when saving the grade fails', async () => {
    vi.mocked(gradeCard).mockRejectedValueOnce(new Error('boom'));
    const onGraded = vi.fn();
    render(<Flashcard prompt={prompt} index={1} total={1} onGraded={onGraded} />);
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: /^良好/ }));
    await waitFor(() => expect(onGraded).toHaveBeenCalled());
  });

  it('with speech recognition: shows what was heard, the diff and a suggested grade', async () => {
    speech.supported = true;
    speech.heard = 'I give John apple';
    render(<Flashcard prompt={prompt} index={1} total={1} onGraded={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /语音识别/ }));
    expect(await screen.findByText('I give John apple')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    expect(screen.getByRole('list', { name: '答案对比' })).toBeInTheDocument();
    expect(screen.getByText(/相似度/)).toBeInTheDocument();
    // 4 of 5 words matched -> similarity ~0.89 -> suggests 困难
    expect(screen.getByRole('button', { name: '困难（建议）' })).toBeInTheDocument();
  });
});
