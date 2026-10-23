import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SubstitutionFrame } from '../../types';

const frame: SubstitutionFrame = {
  id: 'f-test',
  title: '测试',
  pattern: '{subject} {be} {adj}.',
  patternZh: '{subject}{adj}。',
  slots: [
    { key: 'subject', labelZh: '主语', options: [{ en: 'The soup', zh: '汤' }, { en: 'The pasta', zh: '意面' }] },
    { key: 'be', labelZh: '助动词', options: [{ en: 'is', zh: '' }] },
    { key: 'adj', labelZh: '形容词', options: [{ en: 'hot', zh: '很热' }, { en: 'zzyzx', zh: '很咸' }] },
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
    // start: "The soup is hot." then only the adjective changes to "zzyzx"
    singleSwapSequence: (f: SubstitutionFrame) => [
      actual.buildCombo(f, { subject: 0, be: 0, adj: 0 }),
      actual.buildCombo(f, { subject: 0, be: 0, adj: 1 }),
    ],
  };
});

import { SingleSwapDrill } from './SingleSwapDrill';

describe('SingleSwapDrill answer leak', () => {
  it('does not show the new option in English before the answer is revealed', () => {
    const { container } = render(<SingleSwapDrill frame={frame} length={2} onDone={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: '开始快替' }));

    // before reveal: the Chinese prompt and the changed column's Chinese are visible, the new English is not
    expect(screen.getByTestId('swap-zh')).toHaveTextContent('很咸');
    expect(container.textContent).not.toContain('zzyzx');
    expect(document.body.innerHTML).not.toContain('zzyzx');
    const adjColumn = screen.getByRole('group', { name: '形容词' });
    expect(within(adjColumn).getByText('?')).toBeInTheDocument();
    expect(within(adjColumn).getByText('很咸')).toBeInTheDocument();
    // unchanged slots stay visible
    expect(screen.getByText('The soup')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    expect(screen.getByTestId('swap-en')).toHaveTextContent('The soup is zzyzx.');
    expect(within(screen.getByRole('group', { name: '形容词' })).getByText('zzyzx')).toBeInTheDocument();
  });
});
