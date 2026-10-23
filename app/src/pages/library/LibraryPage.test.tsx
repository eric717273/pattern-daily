import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHUNKS, SEED_FRAMES } from '../../content';
import type { SubstitutionFrame } from '../../types';
import { db } from '../../lib/db';
import { FUNCTION_CATEGORIES, FUNCTION_CATEGORY_LABELS } from '../../lib/labels';
import { introduceItems, saveUserFrame } from '../../lib/repo';
import { LibraryPage } from './LibraryPage';

// 400 rows in jsdom are slow to render and to query.
vi.setConfig({ testTimeout: 30_000 });

function renderPage(path = '/library') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LibraryPage />
    </MemoryRouter>,
  );
}

const count = () => screen.getByTestId('library-count').textContent;
const press = (group: string, label: string) =>
  fireEvent.click(within(screen.getByRole('group', { name: group })).getByRole('button', { name: label }));

beforeEach(async () => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  await Promise.all(db.tables.map((t) => t.clear()));
});

const TOTAL = CHUNKS.length + SEED_FRAMES.length;

describe('LibraryPage', () => {
  it('shows overall progress, the 20 category cards and the whole library', async () => {
    renderPage();
    expect(await screen.findByLabelText('学习进度', {}, { timeout: 10_000 })).toHaveTextContent(`已学 0 / ${TOTAL}`);
    expect(screen.getByLabelText('学习进度')).toHaveTextContent('已掌握 0');
    const cats = screen.getByRole('region', { name: '按功能分类' });
    expect(within(cats).getAllByRole('button')).toHaveLength(FUNCTION_CATEGORIES.length);
    for (const c of FUNCTION_CATEGORIES) {
      expect(within(cats).getByRole('button', { name: new RegExp(FUNCTION_CATEGORY_LABELS[c]) })).toBeInTheDocument();
    }
    expect(count()).toBe(`共 ${TOTAL} 条`);
    expect(screen.getByRole('button', { name: /AI 生成母框/ })).toBeInTheDocument();
  });

  it('progress and the status dots follow the learner’s cards', async () => {
    await introduceItems([
      { kind: 'chunk', id: 'c001' },
      { kind: 'chunk', id: 'c002' },
      { kind: 'frame', id: SEED_FRAMES[0].id },
    ]);
    await db.cards.update('chunk:c001', { interval: 30, reps: 5 });
    await db.cards.update('chunk:c002', { interval: 3, reps: 1 });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('学习进度')).toHaveTextContent(`已学 3 / ${TOTAL}`), { timeout: 10_000 });
    expect(screen.getByLabelText('学习进度')).toHaveTextContent('已掌握 1');

    press('状态', '已掌握');
    expect(count()).toBe('共 1 条');
    expect(screen.getByRole('link', { name: /How's it going/ })).toBeInTheDocument();
    press('状态', '学习中');
    expect(count()).toBe('共 2 条');
    press('状态', '未学');
    expect(count()).toBe(`共 ${TOTAL - 3} 条`);
  });

  it('a category card filters the list and collapses into a chip', async () => {
    renderPage();
    const label = FUNCTION_CATEGORY_LABELS.greeting;
    const expected =
      CHUNKS.filter((c) => c.category === 'greeting').length + SEED_FRAMES.filter((f) => f.category === 'greeting').length;
    fireEvent.click(within(screen.getByRole('region', { name: '按功能分类' })).getByRole('button', { name: new RegExp(label) }));
    expect(count()).toBe(`共 ${expected} 条`);
    expect(screen.getByRole('button', { name: '换一个分类' })).toBeInTheDocument();
    // only greeting rows are listed
    expect(screen.queryByRole('link', { name: /It's up to you/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示全部' }));
    expect(count()).toBe(`共 ${TOTAL} 条`);
  });

  it('?cat= preselects a category', () => {
    renderPage('/library?cat=work');
    const n = CHUNKS.filter((c) => c.category === 'work').length + SEED_FRAMES.filter((f) => f.category === 'work').length;
    expect(count()).toBe(`共 ${n} 条`);
  });

  it('filters by kind and frequency', () => {
    renderPage();
    press('类型', '固定表达');
    expect(count()).toBe(`共 ${CHUNKS.length} 条`);
    press('类型', '母框');
    expect(count()).toBe(`共 ${SEED_FRAMES.length} 条`);
    press('类型', '全部');
    press('频率', '最高频');
    const top = CHUNKS.filter((c) => c.freq === 1).length + SEED_FRAMES.filter((f) => f.freq === 1).length;
    expect(count()).toBe(`共 ${top} 条`);
    press('频率', '进阶');
    const adv = CHUNKS.filter((c) => c.freq === 3).length + SEED_FRAMES.filter((f) => f.freq === 3).length;
    expect(count()).toBe(`共 ${adv} 条`);
  });

  it('searches English, Chinese and frame titles', () => {
    renderPage();
    const search = screen.getByLabelText('搜索语块');
    fireEvent.change(search, { target: { value: 'long time no' } });
    expect(screen.getByRole('link', { name: /Long time no see/ })).toHaveAttribute('href', '/library/chunk/c003');
    fireEvent.change(search, { target: { value: '好久不见' } });
    expect(screen.getByRole('link', { name: /Long time no see/ })).toBeInTheDocument();
    const frame = SEED_FRAMES[0];
    fireEvent.change(search, { target: { value: frame.title } });
    expect(screen.getByRole('link', { name: frame.title })).toHaveAttribute('href', `/frames/${frame.id}`);
    fireEvent.change(search, { target: { value: 'zzzzqqq' } });
    expect(count()).toBe('共 0 条');
    expect(screen.getByText('没有符合条件的内容')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }));
    expect(count()).toBe(`共 ${TOTAL} 条`);
  });

  it('lists the learner’s own and AI frames under 我的母框', async () => {
    const mine: SubstitutionFrame = {
      ...SEED_FRAMES[0],
      id: 'u-test-1',
      title: '我的测试母框',
      source: 'ai',
      category: undefined,
      freq: undefined,
    };
    await saveUserFrame(mine);
    renderPage();
    await waitFor(() => expect(count()).toBe(`共 ${TOTAL + 1} 条`), { timeout: 10_000 });
    press('类型', '我的母框 1');
    expect(count()).toBe('共 1 条');
    expect(screen.getByRole('link', { name: '我的测试母框' })).toHaveAttribute('href', '/frames/u-test-1');
    expect(screen.getByText('AI 生成')).toBeInTheDocument();
  });

  it('chunk rows have a speak button that does not navigate', () => {
    renderPage();
    press('类型', '固定表达');
    fireEvent.change(screen.getByLabelText('搜索语块'), { target: { value: 'long time no see' } });
    expect(screen.getByRole('button', { name: /朗读：Long time no see/ })).toBeInTheDocument();
  });
});
