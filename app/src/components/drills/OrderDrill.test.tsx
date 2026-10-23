import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { seededRng } from '../../lib/drill';
import { OrderDrill } from './OrderDrill';

const EN = 'I give John the apple.';
const ZH = '我给约翰苹果。';

function pool(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-tile="pool"]')];
}
function placed(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('[data-tile="placed"]')].map((b) => b.textContent ?? '');
}
function tap(container: HTMLElement, word: string): void {
  const tile = pool(container).find((b) => b.textContent === word);
  if (!tile) throw new Error(`no pool tile ${word}`);
  fireEvent.click(tile);
}
function build(container: HTMLElement, words: string[]): void {
  for (const w of words) tap(container, w);
}

describe('OrderDrill', () => {
  it('moves tiles between the pool and the answer, and removes a placed tile on tap', () => {
    const { container } = render(<OrderDrill en={EN} zh={ZH} rng={seededRng(1)} onFinish={() => undefined} />);
    expect(pool(container)).toHaveLength(5);
    expect(screen.getByTestId('order-zh')).toHaveTextContent(ZH);
    expect(screen.getByRole('button', { name: '检查' })).toBeDisabled();

    build(container, ['I', 'give']);
    expect(placed(container)).toEqual(['I', 'give']);
    expect(pool(container)).toHaveLength(3);
    expect(screen.getByRole('button', { name: '检查' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '移除 I' }));
    expect(placed(container)).toEqual(['give']);
    expect(pool(container)).toHaveLength(4);
  });

  it('a correct first try shows the answer and finishes with grade 2', () => {
    const onFinish = vi.fn();
    const { container } = render(<OrderDrill en={EN} zh={ZH} rng={seededRng(2)} onFinish={onFinish} />);
    build(container, EN.split(' '));
    fireEvent.click(screen.getByRole('button', { name: '检查' }));
    expect(screen.getByText('一次拼对了！')).toBeInTheDocument();
    expect(screen.getByTestId('order-answer')).toHaveTextContent(EN);
    // tiles are locked after a correct answer
    expect(pool(container).length).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({ grade: 2, attempts: 1 });
  });

  it('a wrong order shows the diff; retry then success finishes with grade 1', () => {
    const onFinish = vi.fn();
    const { container } = render(<OrderDrill en={EN} zh={ZH} rng={seededRng(3)} onFinish={onFinish} />);
    build(container, ['I', 'John', 'give', 'the', 'apple.']);
    fireEvent.click(screen.getByRole('button', { name: '检查' }));
    expect(screen.getByText(/还差一点/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '答案对比' })).toBeInTheDocument();
    expect(screen.queryByTestId('order-answer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(placed(container)).toEqual([]);
    expect(pool(container)).toHaveLength(5);
    build(container, EN.split(' '));
    fireEvent.click(screen.getByRole('button', { name: '检查' }));
    expect(screen.getByText('拼对了！')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    expect(onFinish.mock.calls[0][0]).toMatchObject({ grade: 1, attempts: 2 });
  });

  it('looking at the answer after a miss counts as forgotten (grade 0)', () => {
    const onFinish = vi.fn();
    const { container } = render(<OrderDrill en={EN} zh={ZH} rng={seededRng(4)} onFinish={onFinish} />);
    build(container, ['the', 'apple.']);
    fireEvent.click(screen.getByRole('button', { name: '检查' }));
    fireEvent.click(screen.getByRole('button', { name: '看答案' }));
    expect(screen.getByTestId('order-answer')).toHaveTextContent(EN);
    fireEvent.click(screen.getByRole('button', { name: '记下了，继续' }));
    expect(onFinish.mock.calls[0][0]).toMatchObject({ grade: 0 });
  });

  it('is case-insensitive like compareAnswer (tile order is what matters)', () => {
    const { container } = render(<OrderDrill en="Is the apple red?" zh="苹果是红的吗？" rng={seededRng(5)} onFinish={() => undefined} />);
    build(container, ['Is', 'the', 'apple', 'red?']);
    fireEvent.click(screen.getByRole('button', { name: '检查' }));
    expect(screen.getByText('一次拼对了！')).toBeInTheDocument();
  });
});
