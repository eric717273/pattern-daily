import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AlignmentToken } from '../types';
import { AlignmentView } from './AlignmentView';

const tokens: AlignmentToken[] = [
  { en: 'He', zh: '他', role: 'subject' },
  { en: 'gives', zh: '给', role: 'verb', note: '第三人称单数要加 -s' },
  { en: 'it', zh: '它', role: 'object' },
];

describe('AlignmentView', () => {
  it('renders every token with English and Chinese', () => {
    render(<AlignmentView tokens={tokens} />);
    for (const t of tokens) {
      expect(screen.getByText(t.en)).toBeInTheDocument();
      expect(screen.getByText(t.zh)).toBeInTheDocument();
    }
  });

  it('shows and hides the note when a token with a note is tapped', () => {
    render(<AlignmentView tokens={tokens} />);
    expect(screen.queryByText(/第三人称单数要加 -s/)).not.toBeInTheDocument();
    const chip = screen.getByRole('button', { name: /gives/ });
    fireEvent.click(chip);
    expect(screen.getByRole('note')).toHaveTextContent('第三人称单数要加 -s');
    fireEvent.click(chip);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('hides the Chinese glosses on toggle and reveals one token on tap', () => {
    render(<AlignmentView tokens={tokens} />);
    fireEvent.click(screen.getByRole('button', { name: '隐藏中文' }));
    expect(screen.queryByText('他')).not.toBeInTheDocument();
    expect(screen.queryByText('它')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('it'));
    expect(screen.getByText('它')).toBeInTheDocument();
    expect(screen.queryByText('他')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示中文' }));
    expect(screen.getByText('他')).toBeInTheDocument();
  });

  it('supports a controlled showZh prop', () => {
    render(<AlignmentView tokens={tokens} showZh={false} hideToggle />);
    expect(screen.queryByText('他')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /中文/ })).not.toBeInTheDocument();
  });
});
