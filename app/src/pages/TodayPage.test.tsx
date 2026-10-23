import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Grade, ItemRef } from '../types';

// The real drills are covered by their own tests and by e2e: here each one is a button that finishes it.
vi.mock('../components/chunk', () => ({
  NewItemFlow: ({ ref, onDone }: { ref: ItemRef; onDone: (g: Grade, i: { ms: number; mode: 'recall' | 'single-swap' }) => void }) => (
    <button type="button" onClick={() => onDone(2, { ms: 1000, mode: ref.kind === 'chunk' ? 'recall' : 'single-swap' })}>
      学完 {ref.id}
    </button>
  ),
  ReviewItem: ({ card, onDone }: { card: { refId: string }; onDone: (g: Grade, m: 'recall', i: { ms: number }) => void }) => (
    <button type="button" onClick={() => onDone(2, 'recall', { ms: 500 })}>
      复习完 {card.refId}
    </button>
  ),
}));
vi.mock('../components/decode', () => ({
  DecodeLesson: ({ dozen, onDone }: { dozen: { id: string; en: string }; onDone: (g: Grade, i: { ms: number }) => void }) => (
    <div>
      <p data-testid="lesson">{dozen.en}</p>
      <button type="button" onClick={() => onDone(2, { ms: 2000 })}>
        完成课程
      </button>
    </div>
  ),
  DecodeMaintenance: ({ dozenId, mode, onDone }: { dozenId: string; mode: string; onDone: (g: Grade, i: { ms: number }) => void }) => (
    <div>
      <p data-testid="maintenance">
        {dozenId}/{mode}
      </p>
      <button type="button" onClick={() => onDone(3, { ms: 3000 })}>
        完成维护
      </button>
    </div>
  ),
}));
vi.mock('../lib/speech', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/speech')>()),
  speak: () => Promise.resolve(),
  stopSpeaking: () => undefined,
}));

import { CHUNKS, CURRICULUM, getChunk } from '../content';
import { db } from '../lib/db';
import { todayStr } from '../lib/plan';
import { ensureCards, getOrCreateSession, gradeCard, introduceItems, markStepDone, updateProfile } from '../lib/repo';
import { TodayPage } from './TodayPage';

function renderToday() {
  return render(
    <MemoryRouter>
      <TodayPage />
    </MemoryRouter>,
  );
}

const nameOf = (ref: ItemRef): string => {
  const c = getChunk(ref.id);
  return c ? c.en : ref.id;
};

async function finishDays(n: number): Promise<void> {
  for (let i = 1; i <= n; i++) {
    await db.sessions.put({
      id: `2020-01-${String(i).padStart(2, '0')}`,
      date: `2020-01-${String(i).padStart(2, '0')}`,
      dayIndex: i,
      stepsDone: ['review', 'chunks', 'decode', 'output'],
      activeMs: 0,
      completedAt: 1,
      updatedAt: 1,
    });
  }
}

beforeEach(async () => {
  window.scrollTo = vi.fn();
  await Promise.all(db.tables.map((t) => t.clear()));
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // ignore
  }
});

describe('TodayPage v2: header and plan', () => {
  it('day 1: lesson number, two track badges, four steps, streak and time estimate', async () => {
    renderToday();
    expect(await screen.findByRole('heading', { name: '第 1 课' })).toBeInTheDocument();
    expect(screen.getByTestId('decode-badge')).toHaveTextContent('解码 骨架 1/13');
    await waitFor(() => expect(screen.getByTestId('chunk-badge')).toHaveTextContent('语块 已学 0 / 400'));
    const tabs = within(screen.getByRole('list', { name: '今日四步' })).getAllByRole('button');
    expect(tabs.map((t) => t.getAttribute('aria-label'))).toEqual(['第 1 步 复习', '第 2 步 新语块', '第 3 步 解码', '第 4 步 输出']);
    expect(screen.getByRole('progressbar', { name: '今日进度' })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByTestId('streak')).toHaveTextContent('连续 0 天');
    expect(screen.getByText(/预计还需约 15 分钟/)).toBeInTheDocument();
  });

  it('scales the remaining time with the daily minutes', async () => {
    await updateProfile({ dailyMinutes: 30 });
    renderToday();
    expect(await screen.findByText(/预计还需约 30 分钟/)).toBeInTheDocument();
  });

  it('freezes the plan in the session on first open', async () => {
    renderToday();
    await screen.findByRole('heading', { name: '第 1 课' });
    const s = await db.sessions.get(todayStr());
    expect(s?.dayIndex).toBe(1);
    expect(s?.plan?.decode).toEqual({ phase: 'foundation', dozenId: 'd01' });
    expect(s?.plan?.newItems).toEqual(CURRICULUM.slice(0, 5));
  });

  it('numbers the lesson by completed lessons after a gap and switches to maintenance after day 13', async () => {
    await finishDays(1);
    renderToday();
    expect(await screen.findByRole('heading', { name: '第 2 课' })).toBeInTheDocument();
    expect(screen.getByTestId('decode-badge')).toHaveTextContent('骨架 2/13');
  });

  it('day 14 is maintenance: transform first', async () => {
    await finishDays(13);
    renderToday();
    expect(await screen.findByRole('heading', { name: '第 14 课' })).toBeInTheDocument();
    expect(screen.getByTestId('decode-badge')).toHaveTextContent('解码 维护·变形');
    fireEvent.click(screen.getByRole('button', { name: '第 3 步 解码' }));
    expect(await screen.findByTestId('maintenance')).toHaveTextContent('d01/transform');
    fireEvent.click(screen.getByRole('button', { name: '完成维护' }));
    await waitFor(async () => expect((await db.sessions.get(todayStr()))?.stepsDone).toEqual(['decode']));
    expect((await db.cards.get('dozen:d01'))?.reps).toBe(1);
    expect((await db.reviews.toArray())[0]).toMatchObject({ cardId: 'dozen:d01', grade: 3, mode: 'transform' });
  });

  it('upgrades a legacy session without a plan and ignores its v1 step keys', async () => {
    await db.sessions.put({
      id: todayStr(),
      date: todayStr(),
      dayIndex: 1,
      stepsDone: ['warmup', 'deconstruct'] as never,
      activeMs: 5000,
      updatedAt: 1,
    });
    renderToday();
    expect(await screen.findByRole('heading', { name: '第 1 课' })).toBeInTheDocument();
    // legacy keys do not count: nothing is done and the day starts at step 1
    expect(screen.getByRole('progressbar', { name: '今日进度' })).toHaveAttribute('aria-valuenow', '0');
    expect(await screen.findByText('今天没有到期的复习 🎉')).toBeInTheDocument();
    const s = await db.sessions.get(todayStr());
    expect(s?.plan?.newItems).toHaveLength(5);
    expect(s?.plan?.decode.dozenId).toBe('d01');
  });
});

describe('TodayPage v2: step 1 复习', () => {
  it('shows a friendly empty state when nothing is due and records the step on continue', async () => {
    renderToday();
    expect(await screen.findByText('今天没有到期的复习 🎉')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '继续：新语块' }));
    expect(await screen.findByTestId('chunks-progress')).toHaveTextContent('新语块 1 / 5');
    const s = await db.sessions.get(todayStr());
    expect(s?.stepsDone).toEqual(['review']);
    expect(screen.getByRole('button', { name: '第 1 步 复习，已完成' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '今日进度' })).toHaveAttribute('aria-valuenow', '1');
  });

  it('reviews due cards one by one, grading each, with progress n/m', async () => {
    await introduceItems([
      { kind: 'chunk', id: 'c001' },
      { kind: 'chunk', id: 'c002' },
    ]);
    renderToday();
    expect(await screen.findByTestId('review-progress')).toHaveTextContent('复习 1 / 2');
    fireEvent.click(await screen.findByRole('button', { name: /^复习完 c00\d$/ }));
    await waitFor(() => expect(screen.getByTestId('review-progress')).toHaveTextContent('复习 2 / 2'));
    fireEvent.click(screen.getByRole('button', { name: /^复习完 c00\d$/ }));
    expect(await screen.findByText('复习完成')).toBeInTheDocument();
    expect(screen.getByText(/这次复习了 2 条/)).toBeInTheDocument();
    const logs = await db.reviews.toArray();
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.grade === 2 && l.mode === 'recall' && l.durationMs === 500)).toBe(true);
    expect((await db.cards.get('chunk:c001'))?.reps).toBe(1);
  });

  it('今天就复习到这 ends the step early', async () => {
    await ensureCards('chunk', ['c001', 'c002', 'c003']);
    renderToday();
    await screen.findByTestId('review-progress');
    fireEvent.click(screen.getByRole('button', { name: '今天就复习到这' }));
    expect(await screen.findByTestId('chunks-progress')).toBeInTheDocument();
    expect((await db.sessions.get(todayStr()))?.stepsDone).toEqual(['review']);
  });
});

describe('TodayPage v2: step 2 新语块', () => {
  beforeEach(async () => {
    await getOrCreateSession(todayStr());
    await markStepDone(todayStr(), 'review', 1000);
  });

  it('runs the plan items in order, introducing and grading each, then moves on to decode', async () => {
    renderToday();
    const plan = CURRICULUM.slice(0, 5);
    for (let i = 0; i < plan.length; i++) {
      expect(await screen.findByTestId('chunks-progress')).toHaveTextContent(`新语块 ${i + 1} / 5`);
      expect(screen.getByTestId('chunks-title')).toHaveTextContent(plan[i].kind === 'chunk' ? nameOf(plan[i]) : /\S/);
      fireEvent.click(screen.getByRole('button', { name: `学完 ${plan[i].id}` }));
      await waitFor(async () => expect(await db.cards.get(`${plan[i].kind}:${plan[i].id}`)).toBeDefined());
    }
    expect(await screen.findByText('今天的新语块学完了')).toBeInTheDocument();
    expect(await db.cards.filter((c) => c.kind !== 'dozen').count()).toBe(5);
    expect(await db.reviews.count()).toBe(5);
    fireEvent.click(screen.getByRole('button', { name: '继续：解码' }));
    expect(await screen.findByTestId('lesson')).toHaveTextContent('The apple is red.');
    expect((await db.sessions.get(todayStr()))?.stepsDone).toEqual(['review', 'chunks']);
    await waitFor(() => expect(screen.getByTestId('chunk-badge')).toHaveTextContent('已学 5 / 400'));
  });

  it('剩下的明天再学 ends the step; the unlearned items return in tomorrow\'s plan', async () => {
    renderToday();
    const plan = CURRICULUM.slice(0, 5);
    fireEvent.click(await screen.findByRole('button', { name: `学完 ${plan[0].id}` }));
    await waitFor(async () => expect(await db.cards.count()).toBe(1));
    await screen.findByText(/新语块 2 \/ 5/);
    fireEvent.click(screen.getByRole('button', { name: '剩下的明天再学' }));
    expect(await screen.findByTestId('lesson')).toBeInTheDocument();
    expect((await db.sessions.get(todayStr()))?.stepsDone).toContain('chunks');
    expect(await db.cards.count()).toBe(1);
    // tomorrow: 5 new items again, starting at the first one that was not learned
    await db.sessions.update(todayStr(), { completedAt: 1 });
    const tomorrow = await getOrCreateSession('2999-01-01');
    expect(tomorrow.plan?.newItems).toEqual(CURRICULUM.slice(1, 6));
  });

  it('resumes after a reload at the first item that was not learned yet', async () => {
    await introduceItems(CURRICULUM.slice(0, 2));
    renderToday();
    expect(await screen.findByTestId('chunks-progress')).toHaveTextContent('新语块 3 / 5');
    expect(screen.getByRole('button', { name: `学完 ${CURRICULUM[2].id}` })).toBeInTheDocument();
  });

  it('library exhausted: says so and continues', async () => {
    await introduceItems(CURRICULUM);
    await db.sessions.clear(); // the new session's plan is made with everything introduced
    renderToday();
    fireEvent.click(await screen.findByRole('button', { name: '第 2 步 新语块' }));
    expect(await screen.findByText('语块库已经学完了')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '继续：解码' }));
    expect(await screen.findByTestId('lesson')).toBeInTheDocument();
    expect((await db.sessions.get(todayStr()))?.stepsDone).toContain('chunks');
  });
});

describe('TodayPage v2: step 3 解码 and resume', () => {
  it('resumes at the first undone step and shows the separation note and the foundation lesson', async () => {
    const date = todayStr();
    await getOrCreateSession(date);
    await markStepDone(date, 'review', 1000);
    await markStepDone(date, 'chunks', 1000);
    renderToday();
    expect(await screen.findByTestId('lesson')).toHaveTextContent('The apple is red.');
    expect(screen.getByTestId('decode-note')).toHaveTextContent('解码：看懂结构（和语块练习分开，不求脱口而出）');
    expect(screen.getByText(/第 3 步 · 解码/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '第 2 步 新语块，已完成' })).toBeInTheDocument();
  });

  it('grades the skeleton card, marks the step and goes to the output step', async () => {
    const date = todayStr();
    await getOrCreateSession(date);
    await markStepDone(date, 'review', 1000);
    await markStepDone(date, 'chunks', 1000);
    await introduceItems(CURRICULUM.slice(0, 5));
    renderToday();
    fireEvent.click(await screen.findByRole('button', { name: '完成课程' }));
    expect(await screen.findByTestId('output-zh')).toBeInTheDocument();
    expect((await db.sessions.get(date))?.stepsDone).toEqual(['review', 'chunks', 'decode']);
    expect(await db.cards.get('dozen:d01')).toMatchObject({ reps: 1 });
    expect(await db.reviews.filter((r) => r.cardId === 'dozen:d01').first()).toMatchObject({ grade: 2, mode: 'transform', durationMs: 2000 });
  });

  it('finished steps can be reopened', async () => {
    const date = todayStr();
    await getOrCreateSession(date);
    await markStepDone(date, 'review', 1000);
    await markStepDone(date, 'chunks', 1000);
    await markStepDone(date, 'decode', 1000);
    renderToday();
    await screen.findByRole('heading', { name: '第 1 课' });
    fireEvent.click(await screen.findByRole('button', { name: '第 3 步 解码，已完成' }));
    expect(await screen.findByTestId('lesson')).toBeInTheDocument();
  });
});

describe('TodayPage v2: step 4 输出 (offline) and completion', () => {
  it('uses the chunks learned today, self-check against a model sentence, then completes the day', async () => {
    const date = todayStr();
    await getOrCreateSession(date);
    for (const s of ['review', 'chunks', 'decode'] as const) await markStepDone(date, s, 1000);
    await introduceItems(CURRICULUM.slice(0, 5));
    renderToday();
    for (let i = 1; i <= 3; i++) {
      expect(await screen.findByTestId('output-progress')).toHaveTextContent(`第 ${i} / 3 题`);
      expect(screen.getByTestId('output-zh')).toBeInTheDocument();
      expect(screen.getByTestId('output-hint').textContent).toMatch(/^用上：|^用这个句型：/);
      fireEvent.change(screen.getByRole('textbox', { name: '你造的英语句子' }), { target: { value: 'something I would say' } });
      fireEvent.click(screen.getByRole('button', { name: '提交并自查' }));
      expect(await screen.findByTestId('output-reference')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: i === 3 ? '完成今日练习' : '下一题' }));
    }

    expect(await screen.findByRole('heading', { name: '今天的练习完成了！' })).toBeInTheDocument();
    const attempts = await db.attempts.toArray();
    expect(attempts).toHaveLength(3);
    const planKeys = CURRICULUM.slice(0, 5).map((r) => `${r.kind}:${r.id}`);
    for (const a of attempts) {
      expect(['chunk', 'frame']).toContain(a.refKind);
      expect(planKeys).toContain(`${a.refKind}:${a.refId}`);
      expect(a.userEn).toBe('something I would say');
    }
    expect((await db.sessions.get(date))?.completedAt).toBeTypeOf('number');
  });

  it('without anything learned yet it offers to finish instead of failing', async () => {
    const date = todayStr();
    await getOrCreateSession(date);
    for (const s of ['review', 'chunks', 'decode'] as const) await markStepDone(date, s, 1000);
    renderToday();
    expect(await screen.findByText('今天没有可出题的语块')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '完成今日练习' }));
    expect(await screen.findByRole('heading', { name: '今天的练习完成了！' })).toBeInTheDocument();
  });

  it('falls back to the most recently introduced items when today has no new ones', async () => {
    await introduceItems([{ kind: 'chunk', id: 'c010' }]);
    const date = todayStr();
    await getOrCreateSession(date);
    await db.sessions.update(date, { plan: { dayIndex: 1, decode: { phase: 'foundation', dozenId: 'd01' }, newItems: [], outputCount: 3 } });
    for (const s of ['review', 'chunks', 'decode'] as const) await markStepDone(date, s, 1000);
    renderToday();
    expect(await screen.findByTestId('output-progress')).toHaveTextContent('第 1 / 3 题');
    expect(screen.getByTestId('output-hint')).toHaveTextContent(`用上：${getChunk('c010')?.zh}`);
  });

  it('completion screen: summary, streak and the two ways on', async () => {
    const date = todayStr();
    await getOrCreateSession(date);
    await introduceItems(CURRICULUM.slice(0, 5));
    await gradeCard(`${CURRICULUM[0].kind}:${CURRICULUM[0].id}`, 2, 'recall', 1); // learning today: not a review
    await introduceItems([{ kind: 'chunk', id: CHUNKS[100].id }]);
    await gradeCard(`chunk:${CHUNKS[100].id}`, 2, 'recall', 1);
    for (const s of ['review', 'chunks', 'decode', 'output'] as const) await markStepDone(date, s, 30_000);
    renderToday();
    expect(await screen.findByRole('heading', { name: '今天的练习完成了！' })).toBeInTheDocument();
    expect(screen.getByTestId('sum-time')).toHaveTextContent('2 分钟');
    expect(await screen.findByTestId('streak')).toHaveTextContent('连续 1 天');
    expect(screen.getByTestId('sum-decode')).toHaveTextContent('骨架 1/13');
    await waitFor(() => expect(screen.getByTestId('sum-learned')).toHaveTextContent('5 条'));
    expect(screen.getByTestId('sum-reviewed')).toHaveTextContent('1 条');
    expect(screen.getByRole('link', { name: '去语块库' })).toHaveAttribute('href', '/library');
    expect(screen.getByRole('link', { name: '再做一组解码练习' })).toHaveAttribute('href', '/decode/practice');
  });
});
