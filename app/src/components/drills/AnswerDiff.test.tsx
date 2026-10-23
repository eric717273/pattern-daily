import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { compareAnswer } from '../../lib/frameEngine';
import { AnswerDiff } from './AnswerDiff';

describe('AnswerDiff', () => {
  it('marks ok / missing / extra tokens from compareAnswer', () => {
    const c = compareAnswer('I give the apple to John', 'I give John the apple');
    render(<AnswerDiff tokens={c.tokens} similarity={c.similarity} />);
    const list = screen.getByRole('list', { name: '答案对比' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(c.tokens.length);
    const status = (s: string) => items.filter((li) => li.getAttribute('data-status') === s).map((li) => li.textContent);
    expect(c.tokens.some((t) => t.status === 'extra')).toBe(true);
    expect(c.tokens.some((t) => t.status === 'missing')).toBe(true);
    expect(status('extra').join(' ')).toContain('to');
    expect(status('ok').join(' ')).toContain('give');
    expect(screen.getByText(`相似度 ${Math.round(c.similarity * 100)}%`)).toBeInTheDocument();
  });

  it('shows everything as ok for an exact answer', () => {
    const c = compareAnswer("It's John's apple", 'It is John’s apple.');
    render(<AnswerDiff tokens={c.tokens} similarity={c.similarity} />);
    expect(c.exact).toBe(true);
    const items = screen.getAllByRole('listitem');
    expect(items.every((li) => li.getAttribute('data-status') === 'ok')).toBe(true);
    expect(screen.getByText('相似度 100%')).toBeInTheDocument();
  });

  it('offers screen reader text for non-ok tokens', () => {
    const c = compareAnswer('I give John', 'I give John apple');
    render(<AnswerDiff tokens={c.tokens} />);
    expect(screen.getByText('漏掉：')).toBeInTheDocument();
    expect(screen.queryByText(/相似度/)).not.toBeInTheDocument();
  });
});
