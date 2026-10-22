import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SubstitutionFrame } from '../types';
import { FrameTable } from './FrameTable';

const frame: SubstitutionFrame = {
  id: 'ft-test',
  title: '测试',
  pattern: '{subject} {verb} {object}.',
  patternZh: '{subject}{verb}{object}。',
  slots: [
    {
      key: 'subject',
      labelZh: '主语',
      options: [
        { en: 'I', zh: '我' },
        { en: 'We', zh: '我们' },
      ],
    },
    {
      key: 'verb',
      labelZh: '动词',
      options: [
        { en: 'like', zh: '喜欢' },
        { en: 'need', zh: '需要' },
        { en: 'want', zh: '想要' },
      ],
    },
    {
      key: 'object',
      labelZh: '宾语',
      options: [
        { en: 'tea', zh: '茶' },
        { en: 'coffee', zh: '咖啡' },
      ],
    },
  ],
  grammar: ['be-adj'],
  scene: 'daily',
  level: 1,
  examples: [{ en: 'I like tea.', zh: '我喜欢茶。' }],
  source: 'user',
};

function Harness({ onChange }: { onChange?: (p: Record<string, number>) => void }) {
  const [picks, setPicks] = useState<Record<string, number>>({});
  return (
    <FrameTable
      frame={frame}
      picks={picks}
      onChange={(p) => {
        setPicks(p);
        onChange?.(p);
      }}
    />
  );
}

describe('FrameTable', () => {
  it('renders a column per slot with its Chinese header and stacked options', () => {
    render(<Harness />);
    for (const label of ['主语', '动词', '宾语']) expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(3);
    expect(screen.getByTestId('frame-sentence-en')).toHaveTextContent('I like tea.');
    expect(screen.getByText('可组合 12 句')).toBeInTheDocument();
  });

  it('updates the assembled sentence when options are selected', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /^need/ }));
    fireEvent.click(screen.getByRole('button', { name: /^coffee/ }));
    fireEvent.click(screen.getByRole('button', { name: /^We/ }));
    expect(screen.getByTestId('frame-sentence-en')).toHaveTextContent('We need coffee.');
    expect(screen.getByTestId('frame-sentence-zh')).toHaveTextContent('我们需要咖啡。');
  });

  it('random button emits a complete, valid picks object', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /随机/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const picks = onChange.mock.calls[0][0] as Record<string, number>;
    for (const slot of frame.slots) {
      expect(picks[slot.key]).toBeGreaterThanOrEqual(0);
      expect(picks[slot.key]).toBeLessThan(slot.options.length);
    }
  });
});
