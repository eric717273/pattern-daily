import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '../routes';
import { db } from '../lib/db';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('drill routes', () => {
  it('/frames/f001/drill/single runs the single-swap drill and grades the frame card', async () => {
    renderAt('/frames/f001/drill/single');
    expect(await screen.findByRole('heading', { name: '单槽快替' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '开始快替' }));
    for (let i = 1; i <= 7; i++) {
      fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
      fireEvent.click(screen.getByRole('button', { name: i === 7 ? '完成这一轮' : '下一句' }));
    }
    fireEvent.click(screen.getByRole('button', { name: '轻松' }));
    fireEvent.click(screen.getByRole('button', { name: '完成单槽快替' }));
    expect(await screen.findByText('这一轮完成了')).toBeInTheDocument();
    expect(screen.getByText(/已记入复习：简单/)).toBeInTheDocument();
    const reviews = await db.reviews.toArray();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ cardId: 'frame:f001', grade: 3, mode: 'single-swap' });
    expect(await db.cards.get('frame:f001')).toBeTruthy();
    expect(screen.getByRole('link', { name: '去练中译英' })).toHaveAttribute('href', '/frames/f001/drill/translate');
    // another round starts a fresh drill
    fireEvent.click(screen.getByRole('button', { name: '再来一轮' }));
    expect(await screen.findByRole('button', { name: '开始快替' })).toBeInTheDocument();
  });

  it('/frames/f001/drill/translate runs the translate drill and grades with the average', async () => {
    renderAt('/frames/f001/drill/translate');
    expect(await screen.findByRole('heading', { name: '中译英' })).toBeInTheDocument();
    for (let i = 0; i < 3; i++) {
      fireEvent.click(await screen.findByRole('button', { name: '不会，看答案' }));
      fireEvent.click(screen.getByRole('button', { name: /^困难/ }));
    }
    expect(await screen.findByText('这一轮完成了')).toBeInTheDocument();
    await waitFor(async () => expect(await db.reviews.count()).toBe(1));
    expect((await db.reviews.toArray())[0]).toMatchObject({ cardId: 'frame:f001', grade: 1, mode: 'multi-swap' });
  });

  it('shows a friendly message for an unknown frame', async () => {
    renderAt('/frames/nope/drill/single');
    expect(await screen.findByText('找不到这个母框')).toBeInTheDocument();
  });
});
