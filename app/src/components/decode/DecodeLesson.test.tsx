import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getDozen } from '../../content';
import { DecodeLesson } from './DecodeLesson';
import { DecodeMaintenance } from './DecodeMaintenance';

const D03 = getDozen('d03')!;

function typeAnswer(value: string) {
  fireEvent.change(screen.getByLabelText(/你的答案/), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: '检查' }));
}

describe('DecodeLesson', () => {
  it('starts with the read step: sentence, alignment, focus and traps, and a step indicator', () => {
    render(<DecodeLesson dozen={D03} dayKey="2026-01-01" onDone={() => undefined} />);
    expect(screen.getByTestId('dozen-en')).toHaveTextContent(D03.en);
    expect(screen.getByRole('list', { name: '中英逐字对照' })).toBeInTheDocument();
    expect(screen.getByText(D03.focusZh)).toBeInTheDocument();
    expect(screen.getByText('文法陷阱')).toBeInTheDocument();
    const steps = screen.getByRole('list', { name: '学习步骤' });
    expect(steps).toHaveTextContent('看骨架');
    expect(steps).toHaveTextContent('排语序');
    expect(steps).toHaveTextContent('变形');
    expect(steps.querySelector('[aria-current="step"]')).toHaveTextContent('看骨架');
  });

  it('flows read -> order -> transform and reports a grade', () => {
    const onDone = vi.fn();
    render(<DecodeLesson dozen={D03} dayKey="2026-01-01" onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: '看懂了，去排语序' }));
    expect(screen.getByRole('list', { name: '学习步骤' }).querySelector('[aria-current="step"]')).toHaveTextContent('排语序');

    // rebuild the order variant: click tiles in sentence order
    const answer = screen.getByTestId('order-zh');
    expect(answer).toBeInTheDocument();
    const variantWords = D03.variants.map((v) => v.en);
    // find which variant was picked by trying to match: place tiles by reading pool text
    const pool = () => [...document.querySelectorAll<HTMLElement>('[data-tile="pool"]')];
    const poolWords = pool().map((b) => b.textContent ?? '').sort();
    const variant = variantWords.find((v) => v.split(' ').sort().join() === poolWords.join());
    expect(variant).toBeDefined();
    for (const w of (variant as string).split(' ')) {
      fireEvent.click(pool().find((b) => b.textContent === w) as HTMLElement);
    }
    fireEvent.click(screen.getByRole('button', { name: '检查' }));
    fireEvent.click(screen.getByRole('button', { name: '继续' }));

    // transform step: 3 tasks
    expect(screen.getByRole('list', { name: '学习步骤' }).querySelector('[aria-current="step"]')).toHaveTextContent('变形');
    expect(screen.getByTestId('transform-progress')).toHaveTextContent('第 1 / 3 题');
    expect(onDone).not.toHaveBeenCalled();
    for (let i = 0; i < 3; i++) {
      const task = D03.transforms.find((t) => t.from === screenText('transform-from') && screenText('transform-instruction') === t.instructionZh);
      expect(task).toBeDefined();
      typeAnswer(task!.to);
      fireEvent.click(screen.getByRole('button', { name: i === 2 ? '完成' : '下一题' }));
    }
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0]).toBe(3); // order right first time (2) + all transforms right (3) -> rounds to 3
    expect(onDone.mock.calls[0][1]).toMatchObject({ orderGrade: 2, transform: { correct: 3, total: 3 } });
  });

  it('a lesson with everything missed grades 0', () => {
    const onDone = vi.fn();
    render(<DecodeLesson dozen={D03} dayKey="2026-01-01" onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: '看懂了，去排语序' }));
    // place any tiles, check, reveal the answer, continue
    const first = document.querySelector<HTMLElement>('[data-tile="pool"]') as HTMLElement;
    fireEvent.click(first);
    fireEvent.click(screen.getByRole('button', { name: '检查' }));
    fireEvent.click(screen.getByRole('button', { name: '看答案' }));
    fireEvent.click(screen.getByRole('button', { name: '记下了，继续' }));
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: '不会，看答案' }));
      fireEvent.click(screen.getByRole('button', { name: i === 2 ? '完成' : '下一题' }));
    }
    expect(onDone.mock.calls[0][0]).toBe(0);
  });
});

function screenText(testId: string): string {
  return screen.getByTestId(testId).textContent ?? '';
}

describe('DecodeMaintenance', () => {
  it('transform mode runs 3 tasks and maps the result to a grade', () => {
    const onDone = vi.fn();
    render(<DecodeMaintenance dozenId="d05" mode="transform" dayKey="2026-05-01" onDone={onDone} />);
    expect(screen.getByTestId('transform-progress')).toHaveTextContent('第 1 / 3 题');
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: '不会，看答案' }));
      fireEvent.click(screen.getByRole('button', { name: i === 2 ? '完成' : '下一题' }));
    }
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0]).toBe(0);
    expect(onDone.mock.calls[0][1]).toMatchObject({ correct: 0, total: 3 });
  });

  it('rotates tasks deterministically by date', () => {
    const first = (day: string) => {
      const { unmount } = render(<DecodeMaintenance dozenId="d03" mode="transform" dayKey={day} onDone={() => undefined} />);
      const ops = screen.getByTestId('transform-instruction').textContent;
      unmount();
      return ops;
    };
    expect(first('2026-05-01')).toBe(first('2026-05-01'));
    const seen = new Set(['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05'].map(first));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('label mode runs the dozen sentence and one frame sentence', () => {
    const onDone = vi.fn();
    render(<DecodeMaintenance dozenId="d05" mode="label" dayKey="2026-05-01" onDone={onDone} />);
    expect(screen.getByTestId('label-progress')).toHaveTextContent('第 1 / 2 句');
    expect(screen.getByTestId('label-zh')).toHaveTextContent(getDozen('d05')!.zh);
  });

  it('shows a message for an unknown sentence', () => {
    render(<DecodeMaintenance dozenId="d99" mode="label" onDone={() => undefined} />);
    expect(screen.getByText('没有找到这个骨架句。')).toBeInTheDocument();
  });
});
