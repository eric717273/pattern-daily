import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../lib/db';
import { todayStr } from '../lib/plan';
import { ensureCards, getOrCreateSession, markStepDone } from '../lib/repo';
import { TodayPage } from './TodayPage';

function renderToday() {
  return render(
    <MemoryRouter>
      <TodayPage />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // ignore
  }
});

describe('TodayPage', () => {
  it('shows lesson 1 with the four steps, the phase and the streak', async () => {
    renderToday();
    expect(await screen.findByRole('heading', { name: '第 1 课' })).toBeInTheDocument();
    expect(screen.getByText('解构期')).toBeInTheDocument();
    const steps = screen.getByRole('list', { name: '今日四步' });
    const tabs = within(steps).getAllByRole('button');
    expect(tabs.map((t) => t.getAttribute('aria-label'))).toEqual([
      '第 1 步 热身复习',
      '第 2 步 解构',
      '第 3 步 母框替换',
      '第 4 步 模组替换输出',
    ]);
    expect(screen.getByRole('progressbar', { name: '今日进度' })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByTestId('streak')).toHaveTextContent('连续 0 天');
    expect(screen.getByText(/预计还需约 15 分钟/)).toBeInTheDocument();
    // nothing due on a fresh install
    expect(await screen.findByText('今天没有到期的复习 🎉')).toBeInTheDocument();
  });

  it('moves on from the empty warm-up to the dozen sentence d01 with its alignment', async () => {
    renderToday();
    fireEvent.click(await screen.findByRole('button', { name: '继续：解构' }));
    expect(await screen.findByTestId('dozen-en')).toHaveTextContent('The apple is red.');
    expect(screen.getByText('中英逐字对照')).toBeInTheDocument();
    expect(screen.getByText(/文法陷阱/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '看懂了，练语序重建' })).toBeInTheDocument();
    // the warm-up step was recorded in the DB
    await waitFor(async () => {
      const s = await db.sessions.get(todayStr());
      expect(s?.stepsDone).toEqual(['warmup']);
      expect(s?.dayIndex).toBe(1);
    });
    expect(screen.getByRole('button', { name: '第 1 步 热身复习，已完成' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '今日进度' })).toHaveAttribute('aria-valuenow', '1');
  });

  it('uses due cards in the warm-up as flashcards', async () => {
    await ensureCards('dozen', ['d01']);
    renderToday();
    expect(await screen.findByTestId('flash-prompt')).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: /^良好/ }));
    expect(await screen.findByText(/热身完成，复习了 1 张卡片/)).toBeInTheDocument();
    const reviews = await db.reviews.toArray();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ cardId: 'dozen:d01', grade: 2, mode: 'review' });
  });

  it('resumes at the first undone step after a reload', async () => {
    const date = todayStr();
    await getOrCreateSession(date);
    await markStepDone(date, 'warmup', 1000);
    await markStepDone(date, 'deconstruct', 1000);
    renderToday();
    expect(await screen.findByText(/^母框 1 \/ \d$/)).toBeInTheDocument();
    expect(screen.getByText(/第 3 步 · 母框替换/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '第 2 步 解构，已完成' })).toBeInTheDocument();
    // a finished step can be reopened
    fireEvent.click(screen.getByRole('button', { name: '第 2 步 解构，已完成' }));
    expect(await screen.findByTestId('dozen-en')).toHaveTextContent('The apple is red.');
  });

  it('shows the completion screen when the day is done', async () => {
    const date = todayStr();
    for (const step of ['warmup', 'deconstruct', 'frames', 'output'] as const) await markStepDone(date, step, 30_000);
    renderToday();
    expect(await screen.findByRole('heading', { name: '今天的练习完成了！' })).toBeInTheDocument();
    expect(screen.getByText('2 分钟')).toBeInTheDocument();
    expect(await screen.findByTestId('streak')).toHaveTextContent('连续 1 天');
    expect(screen.getByRole('link', { name: '查看统计' })).toHaveAttribute('href', '/me');
    fireEvent.click(screen.getByRole('button', { name: '再练一轮母框' }));
    expect(await screen.findByText(/^母框 1 \/ \d$/)).toBeInTheDocument();
  });

  it('numbers the lesson by completed lessons after a gap', async () => {
    for (const step of ['warmup', 'deconstruct', 'frames', 'output'] as const) {
      await markStepDone('2020-01-01', step, 0);
    }
    renderToday();
    expect(await screen.findByRole('heading', { name: '第 2 课' })).toBeInTheDocument();
    expect(screen.getByText('解构期')).toBeInTheDocument();
  });
});
