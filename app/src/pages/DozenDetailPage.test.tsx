import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDozen } from '../content';
import { db } from '../lib/db';
import { DozenDetailPage } from './DozenDetailPage';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/decode/dozen/:id" element={<DozenDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DozenDetailPage', () => {
  it('shows alignment, focus and traps, links back to /decode and to prev/next skeletons', async () => {
    renderAt('/decode/dozen/d05');
    expect(await screen.findByRole('heading', { name: '第 5 句' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /解码/ })).toHaveAttribute('href', '/decode');
    expect(screen.getByText('中英逐字对照')).toBeInTheDocument();
    expect(screen.getByText('这一句暴露了什么')).toBeInTheDocument();
    expect(screen.getByText('文法陷阱')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /上一句/ })).toHaveAttribute('href', '/decode/dozen/d04');
    expect(screen.getByRole('link', { name: /下一句/ })).toHaveAttribute('href', '/decode/dozen/d06');
  });

  it('has no links into the chunk track (frames) and no frame section', async () => {
    renderAt('/decode/dozen/d03');
    await screen.findByRole('heading', { name: '第 3 句' });
    expect(screen.queryByText('用母框练这个句型')).not.toBeInTheDocument();
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.some((h) => h.startsWith('/frames') || h.startsWith('/library'))).toBe(false);
  });

  it('keeps the variants collapsed under 同骨架的更多例子 until expanded', async () => {
    const d = getDozen('d01')!;
    renderAt('/decode/dozen/d01');
    await screen.findByRole('heading', { name: '第 1 句' });
    expect(screen.getByText('同骨架的更多例子')).toBeInTheDocument();
    expect(screen.queryByText(d.variants[0].en)).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /展开 \d+ 个例子/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByText(d.variants[0].en)).toBeInTheDocument();
    expect(screen.queryByText(d.variants[0].zh)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示中文' }));
    expect(screen.getByText(d.variants[0].zh)).toBeInTheDocument();
  });

  it('runs the sentence transforms and grades the dozen card', async () => {
    const d = getDozen('d01')!;
    renderAt('/decode/dozen/d01');
    fireEvent.click(await screen.findByRole('button', { name: '开始变形练习' }));
    for (let i = 0; i < d.transforms.length; i++) {
      expect(screen.getByTestId('transform-progress')).toHaveTextContent(`第 ${i + 1} / ${d.transforms.length} 题`);
      fireEvent.change(screen.getByLabelText(/你的答案/), { target: { value: d.transforms[i].to } });
      fireEvent.click(screen.getByRole('button', { name: '检查' }));
      fireEvent.click(screen.getByRole('button', { name: i === d.transforms.length - 1 ? '完成' : '下一题' }));
    }
    expect(await screen.findByTestId('transform-summary')).toHaveTextContent(`答对 ${d.transforms.length} / ${d.transforms.length} 题`);
    await waitFor(async () => {
      const logs = await db.reviews.toArray();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ cardId: 'dozen:d01', mode: 'transform', grade: 3 });
    });
    expect(await db.cards.get('dozen:d01')).toBeDefined();
  });

  it('shows a friendly message for an unknown id', async () => {
    renderAt('/decode/dozen/d99');
    expect(await screen.findByText('没有这一句')).toBeInTheDocument();
  });
});
