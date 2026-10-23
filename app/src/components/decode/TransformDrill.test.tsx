import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TransformTask } from '../../types';
import { checkTransform } from '../../lib/decode';
import { TransformDrill } from './TransformDrill';

const TASKS: TransformTask[] = [
  {
    op: 'pronoun',
    instructionZh: '把 The apple 换成代词',
    from: 'The apple is red.',
    to: "It's red.",
    alt: ['It is red.'],
    noteZh: '名词换成 it 后，the 随名词一起消失。',
  },
  {
    op: 'question',
    instructionZh: '改成一般疑问句',
    from: 'The apple is red.',
    to: 'Is the apple red?',
    noteZh: '疑问句把 is 提到主语前面。',
  },
  {
    op: 'question',
    instructionZh: '改成一般疑问句（长句）',
    from: 'She gives the quarterly report to the manager.',
    to: 'Does she give the quarterly report to the manager?',
    noteZh: '助动词 does 提前，动词回到原形。',
  },
];

function type(value: string) {
  fireEvent.change(screen.getByLabelText(/你的答案/), { target: { value } });
}

describe('checkTransform', () => {
  it('accepts the answer and every alt, ignoring case, punctuation and contractions', () => {
    expect(checkTransform(TASKS[0], "it's red").outcome).toBe('correct');
    expect(checkTransform(TASKS[0], 'IT IS RED.').outcome).toBe('correct');
    expect(checkTransform(TASKS[1], 'is the apple red').outcome).toBe('correct');
  });

  it('flags a near miss from 90% similarity and a wrong answer below', () => {
    const near = checkTransform(TASKS[2], 'Does she give the quarterly report to manager?');
    expect(near.outcome).toBe('near');
    expect(near.comparison.similarity).toBeGreaterThanOrEqual(0.9);
    expect(checkTransform(TASKS[1], 'The apple is red?').outcome).toBe('wrong');
    expect(checkTransform(TASKS[1], 'Is apple red').outcome).toBe('wrong');
  });
});

describe('TransformDrill', () => {
  it('shows the instruction and source, hides the answer and note until submitted', () => {
    render(<TransformDrill tasks={TASKS} onDone={() => undefined} />);
    expect(screen.getByTestId('transform-instruction')).toHaveTextContent('把 The apple 换成代词');
    expect(screen.getByTestId('transform-from')).toHaveTextContent('The apple is red.');
    expect(screen.getByTestId('transform-progress')).toHaveTextContent('第 1 / 3 题');
    expect(screen.queryByTestId('transform-answer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('transform-note')).not.toBeInTheDocument();
    expect(screen.queryByText(/名词换成 it/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '检查' })).toBeDisabled();

    const input = screen.getByLabelText(/你的答案/);
    expect(input).toHaveAttribute('autocapitalize', 'off');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
  });

  it('submits with Enter; a correct answer shows the reference answer, the note and the next button', () => {
    render(<TransformDrill tasks={TASKS} onDone={() => undefined} />);
    type("it's red");
    fireEvent.submit(screen.getByLabelText(/你的答案/).closest('form') as HTMLFormElement);
    expect(screen.getByText('答对了！')).toBeInTheDocument();
    expect(screen.getByTestId('transform-answer')).toHaveTextContent("It's red.");
    expect(screen.getByTestId('transform-note')).toHaveTextContent('名词换成 it 后');
    expect(screen.getByLabelText(/你的答案/)).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: '下一题' })).toBeInTheDocument();
  });

  it('accepts an alt answer', () => {
    render(<TransformDrill tasks={TASKS} onDone={() => undefined} />);
    type('It is red.');
    fireEvent.click(screen.getByRole('button', { name: '检查' }));
    expect(screen.getByText('答对了！')).toBeInTheDocument();
  });

  it('shows 差一点 with a diff for a near miss, and the diff plus answer for a wrong answer', () => {
    render(<TransformDrill tasks={[TASKS[2], TASKS[1]]} onDone={() => undefined} />);
    type('Does she give the quarterly report to manager?');
    fireEvent.click(screen.getByRole('button', { name: '检查' }));
    expect(screen.getByText('差一点')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '答案对比' })).toBeInTheDocument();
    expect(screen.getByTestId('transform-answer')).toHaveTextContent('Does she give the quarterly report to the manager?');
    fireEvent.click(screen.getByRole('button', { name: '下一题' }));

    type('The apple is red?');
    fireEvent.click(screen.getByRole('button', { name: '检查' }));
    expect(screen.getByText(/不对/)).toBeInTheDocument();
    expect(screen.queryByText('差一点')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: '答案对比' })).toBeInTheDocument();
    expect(screen.getByTestId('transform-answer')).toHaveTextContent('Is the apple red?');
  });

  it('can give up and see the answer', () => {
    render(<TransformDrill tasks={TASKS} onDone={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: '不会，看答案' }));
    expect(screen.getByTestId('transform-answer')).toHaveTextContent("It's red.");
    expect(screen.getByTestId('transform-note')).toBeInTheDocument();
  });

  it('runs all tasks and reports correct / total / ms once', () => {
    const onDone = vi.fn();
    render(<TransformDrill tasks={TASKS} onDone={onDone} />);
    type("It's red.");
    fireEvent.click(screen.getByRole('button', { name: '检查' }));
    fireEvent.click(screen.getByRole('button', { name: '下一题' }));
    expect(screen.getByTestId('transform-progress')).toHaveTextContent('第 2 / 3 题');
    expect(screen.getByLabelText(/你的答案/)).toHaveValue('');
    expect(screen.queryByTestId('transform-answer')).not.toBeInTheDocument();

    type('wrong');
    fireEvent.click(screen.getByRole('button', { name: '检查' }));
    fireEvent.click(screen.getByRole('button', { name: '下一题' }));

    type('Does she give the quarterly report to the manager');
    fireEvent.click(screen.getByRole('button', { name: '检查' }));
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0]).toMatchObject({ correct: 2, total: 3 });
    expect(onDone.mock.calls[0][0].ms).toBeGreaterThanOrEqual(0);
  });
});
