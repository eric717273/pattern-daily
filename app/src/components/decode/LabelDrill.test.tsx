import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DOZEN } from '../../content';
import { labelTaskFromDozen, type LabelRole } from '../../lib/decode';
import { LabelDrill } from './LabelDrill';
import { LabelSession } from './LabelSession';

const D05 = labelTaskFromDozen(DOZEN.find((d) => d.id === 'd05')!);

function choose(role: string) {
  fireEvent.click(within(screen.getByRole('group', { name: '选择成分' })).getByRole('button', { name: role }));
}

/** Label tokens in order: the selection auto-advances to the next open token. */
function labelAll(roles: LabelRole[]) {
  const names: Record<LabelRole, string> = {
    subject: '主语',
    verb: '谓语动词',
    aux: '助动词·情态',
    object: '宾语',
    'indirect-object': '间接宾语',
    complement: '表语·补语',
    adverbial: '时间地点状语',
    other: '其他',
  };
  for (const r of roles) choose(names[r]);
}

describe('LabelDrill', () => {
  it('shows the tokens as buttons, requires every label and the tense before 检查', () => {
    render(<LabelDrill sentence={D05} onDone={() => undefined} />);
    expect(screen.getByTestId('label-zh')).toHaveTextContent(D05.zh);
    expect(screen.getAllByRole('button', { name: /未标注/ })).toHaveLength(4);
    const check = screen.getByRole('button', { name: '检查' });
    expect(check).toBeDisabled();
    labelAll(['subject', 'verb', 'object', 'indirect-object']);
    expect(check).toBeDisabled(); // tense still open
    fireEvent.click(screen.getByRole('button', { name: '一般现在' }));
    expect(check).toBeEnabled();
  });

  it('an all-correct labeling scores full marks and reports the result', () => {
    const onDone = vi.fn();
    render(<LabelDrill sentence={D05} onDone={onDone} />);
    labelAll(['subject', 'verb', 'object', 'indirect-object']);
    fireEvent.click(screen.getByRole('button', { name: '一般现在' }));
    fireEvent.click(screen.getByRole('button', { name: '检查' }));
    expect(screen.getByTestId('label-score')).toHaveTextContent('答对 5 / 5');
    expect(screen.getByText('全对')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0]).toMatchObject({ correct: 5, total: 5 });
  });

  it('marks wrong roles and a wrong tense, showing the correct labeling', () => {
    const onDone = vi.fn();
    render(<LabelDrill sentence={D05} onDone={onDone} />);
    labelAll(['subject', 'verb', 'indirect-object', 'object']);
    fireEvent.click(screen.getByRole('button', { name: '一般过去' }));
    fireEvent.click(screen.getByRole('button', { name: '检查' }));
    expect(screen.getByTestId('label-score')).toHaveTextContent('答对 2 / 5');
    expect(screen.getByText('时态应为：一般现在')).toBeInTheDocument();
    const wrong = screen.getByRole('button', { name: 'it：应为宾语，你选了间接宾语' });
    expect(wrong).toHaveAttribute('data-state', 'wrong');
    expect(screen.getByRole('button', { name: 'to John：应为间接宾语，你选了宾语' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'He：应为主语，你答对了' })).toHaveAttribute('data-state', 'right');
    expect(screen.queryByRole('group', { name: '选择成分' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    expect(onDone.mock.calls[0][0]).toMatchObject({ correct: 2, total: 5 });
  });

  it('lets the learner pick a token to relabel before checking', () => {
    render(<LabelDrill sentence={D05} onDone={() => undefined} />);
    labelAll(['object']); // first token (He) wrongly labelled object, selection moves on
    fireEvent.click(screen.getByRole('button', { name: 'He，已选宾语' }));
    choose('主语');
    expect(screen.getByRole('button', { name: 'He，已选主语' })).toBeInTheDocument();
  });

  it('skips the tense question when the task has none and shows fixed words muted', () => {
    const task = { ...D05, id: 'x', tense: undefined, tokens: [{ text: 'to', role: null }, ...D05.tokens] };
    render(<LabelDrill sentence={task} onDone={() => undefined} />);
    expect(screen.queryByText('这句话的时态 / 形式是？')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-token="fixed"]')).toHaveLength(1);
    labelAll(['subject', 'verb', 'object', 'indirect-object']);
    expect(screen.getByRole('button', { name: '检查' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '检查' }));
    expect(screen.getByTestId('label-score')).toHaveTextContent('答对 4 / 4');
  });
});

describe('LabelSession', () => {
  it('runs sentences one after another and merges the scores', () => {
    const onDone = vi.fn();
    const d09 = labelTaskFromDozen(DOZEN.find((d) => d.id === 'd09')!);
    render(<LabelSession tasks={[D05, d09]} onDone={onDone} />);
    expect(screen.getByTestId('label-progress')).toHaveTextContent('第 1 / 2 句');
    labelAll(['subject', 'verb', 'object', 'indirect-object']);
    fireEvent.click(screen.getByRole('button', { name: '一般现在' }));
    fireEvent.click(screen.getByRole('button', { name: '检查' }));
    fireEvent.click(screen.getByRole('button', { name: '下一句' }));
    expect(screen.getByTestId('label-progress')).toHaveTextContent('第 2 / 2 句');
    labelAll(['subject', 'aux', 'verb', 'object', 'indirect-object']);
    fireEvent.click(screen.getByRole('button', { name: '情态' }));
    fireEvent.click(screen.getByRole('button', { name: '检查' }));
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    expect(onDone.mock.calls[0][0]).toMatchObject({ correct: 11, total: 11 });
  });
});
