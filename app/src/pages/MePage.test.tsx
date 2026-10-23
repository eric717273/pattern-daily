import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ai = vi.hoisted(() => ({ fail: false }));
vi.mock('../lib/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/ai')>();
  return {
    ...actual,
    testConnection: vi.fn(() =>
      ai.fail ? Promise.reject(new actual.AiError('auth', 'DeepSeek API Key 无效或没有权限，请在设置中检查。')) : Promise.resolve(),
    ),
  };
});

import { db } from '../lib/db';
import { getOrCreateProfile, getOrCreateSession, gradeCard, introduceItems, markStepDone, saveAttempt, updateProfile } from '../lib/repo';
import { getSettings } from '../lib/settings';
import { todayStr } from '../lib/plan';
import { MePage } from './MePage';

function renderMe() {
  return render(
    <MemoryRouter>
      <MePage />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  ai.fail = false;
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('MePage settings', () => {
  it('persists the DeepSeek key through settings, with a show/hide toggle', async () => {
    renderMe();
    const key = screen.getByLabelText('DeepSeek API Key');
    expect(key).toHaveAttribute('type', 'password');
    fireEvent.change(key, { target: { value: ' sk-abc123 ' } });
    expect(getSettings().deepseekApiKey).toBe('sk-abc123');
    expect(JSON.parse(localStorage.getItem('pd.settings') ?? '{}').deepseekApiKey).toBe('sk-abc123');

    fireEvent.click(screen.getByRole('button', { name: '显示 Key' }));
    expect(screen.getByLabelText('DeepSeek API Key')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('DeepSeek API Key')).toHaveValue('sk-abc123');
    fireEvent.click(screen.getByRole('button', { name: '隐藏 Key' }));
    expect(screen.getByLabelText('DeepSeek API Key')).toHaveAttribute('type', 'password');
  });

  it('saves the model and the connection mode', () => {
    renderMe();
    fireEvent.change(screen.getByRole('combobox', { name: '模型' }), { target: { value: 'deepseek-reasoner' } });
    expect(getSettings().deepseekModel).toBe('deepseek-reasoner');
    fireEvent.click(screen.getByRole('button', { name: '通过 Supabase 代理' }));
    expect(getSettings().aiMode).toBe('proxy');
    expect(screen.getByText(/Key 存在服务器端/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '直连' }));
    expect(getSettings().aiMode).toBe('direct');
    expect(screen.getByText(/Key 只保存在这台设备上/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /platform\.deepseek\.com\/api_keys/ })).toHaveAttribute(
      'href',
      'https://platform.deepseek.com/api_keys',
    );
  });

  it('测试连接 needs a key, then reports success or the error', async () => {
    renderMe();
    const button = screen.getByRole('button', { name: '测试连接' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('DeepSeek API Key'), { target: { value: 'sk-1' } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(await screen.findByText('连接成功，AI 功能可以使用了。')).toBeInTheDocument();

    ai.fail = true;
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('API Key 无效');
    expect(screen.queryByText('连接成功，AI 功能可以使用了。')).not.toBeInTheDocument();
  });

  it('sync section: without Supabase config it shows the URL / key fields and points to docs/SETUP.md', () => {
    renderMe();
    expect(screen.getByRole('textbox', { name: 'Supabase 项目 URL' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Supabase anon key' })).toBeInTheDocument();
    expect(screen.getByText('docs/SETUP.md')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Supabase 项目 URL' }), { target: { value: 'https://abc.supabase.co' } });
    expect(getSettings().supabaseUrl).toBe('https://abc.supabase.co');
  });

  it('speech section: rate slider saves to settings', () => {
    renderMe();
    fireEvent.change(screen.getByRole('slider', { name: '朗读语速' }), { target: { value: '1.25' } });
    expect(getSettings().ttsRate).toBeCloseTo(1.25);
    expect(screen.getByText('语速 1.25×')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '试听朗读' })).toBeInTheDocument();
  });

  it('plan section: daily minutes and scene chips update the profile (at least one scene stays)', async () => {
    await getOrCreateProfile();
    renderMe();
    fireEvent.click(await screen.findByRole('button', { name: '20 分钟' }));
    await waitFor(async () => expect((await db.profile.get('profile'))?.dailyMinutes).toBe(20));
    fireEvent.click(screen.getByRole('button', { name: '旅行' }));
    await waitFor(async () => expect((await db.profile.get('profile'))?.scenes).toEqual(['work', 'daily', 'travel']));
    fireEvent.click(screen.getByRole('button', { name: '职场' }));
    fireEvent.click(screen.getByRole('button', { name: '日常' }));
    await waitFor(async () => expect((await db.profile.get('profile'))?.scenes).toEqual(['travel']));
    fireEvent.click(screen.getByRole('button', { name: '旅行' })); // would leave none: ignored
    await new Promise((r) => setTimeout(r, 50));
    expect((await db.profile.get('profile'))?.scenes).toEqual(['travel']);
  });

  it('backup: an invalid file shows an error, a valid one reports success', async () => {
    renderMe();
    const input = screen.getByLabelText('选择备份文件');
    fireEvent.change(input, { target: { files: [new File(['nope'], 'bad.json', { type: 'application/json' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('备份文件不是有效的 JSON');
    fireEvent.change(input, {
      target: { files: [new File([JSON.stringify({ version: 1, cards: [] })], 'ok.json', { type: 'application/json' })] },
    });
    expect(await screen.findByText(/导入成功：ok\.json/)).toBeInTheDocument();
  });

  it('install instructions show when not running standalone', () => {
    renderMe();
    expect(screen.getByRole('heading', { name: '安装到设备' })).toBeInTheDocument();
    expect(screen.getByText(/添加到主屏幕/)).toBeInTheDocument();
    expect(screen.getByText(/添加到程序坞/)).toBeInTheDocument();
  });

  it('install instructions are hidden in standalone mode', () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('standalone'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      renderMe();
      expect(screen.queryByRole('heading', { name: '安装到设备' })).not.toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('MePage stats and attempts', () => {
  it('shows zeros and an empty heatmap on a fresh install', async () => {
    renderMe();
    expect(await screen.findByText('已完成 0 课，下一课是第 1 课', { exact: false })).toBeInTheDocument();
    const heat = screen.getByRole('group', { name: '近 12 周学习热力图' });
    const cells = within(heat).getAllByRole('img');
    expect(cells.length).toBeGreaterThan(70);
    expect(cells.length).toBeLessThanOrEqual(84);
    expect(cells.every((c) => c.getAttribute('data-level') === '0')).toBe(true);
    expect(screen.getByText(/还没有造句记录/)).toBeInTheDocument();
  });

  it('counts finished days, shows heatmap intensity with accessible titles and the last attempts with scores', async () => {
    const today = todayStr();
    for (const step of ['review', 'chunks', 'decode', 'output'] as const) {
      await markStepDone(today, step, step === 'review' ? 12 * 60_000 : 0);
    }
    await saveAttempt({
      refKind: 'dozen',
      refId: 'd01',
      promptZh: '告诉他苹果是红的。',
      userEn: 'The apple red.',
      feedback: { score: 62, correct: false, corrected: 'The apple is red.', explanationZh: '少了 be 动词。', alternatives: [] },
    });
    await saveAttempt({ refKind: 'dozen', refId: 'd01', userEn: 'I give him the apple.' });

    renderMe();
    expect(await screen.findByText('已完成 1 课，下一课是第 2 课', { exact: false })).toBeInTheDocument();
    const heat = screen.getByRole('group', { name: '近 12 周学习热力图' });
    const todayCell = within(heat).getByRole('img', { name: `${today}，学习 12 分钟` });
    expect(todayCell).toHaveAttribute('data-level', '3');
    expect(todayCell).toHaveAttribute('title', `${today} · 12 分钟`);

    expect(await screen.findByText('62 分')).toBeInTheDocument();
    expect(screen.getByText('The apple is red.')).toBeInTheDocument();
    expect(screen.getByText('未批改')).toBeInTheDocument();
  });
});

describe('MePage two-track plan and library progress', () => {
  it('shows the chunk library progress with the categories learned most', async () => {
    renderMe();
    expect(await screen.findByText(/还没有学过语块/)).toBeInTheDocument();
    const section = screen.getByRole('region', { name: '语块库进度' });
    expect(within(section).getByText('已学').nextElementSibling).toHaveTextContent('0');
    expect(within(section).getByText('总数').nextElementSibling).toHaveTextContent('400');
  });

  it('counts learned and mastered items and lists categories', async () => {
    await introduceItems([
      { kind: 'chunk', id: 'c001' },
      { kind: 'chunk', id: 'c002' },
      { kind: 'frame', id: 'f001' },
    ]);
    // an easy second success pushes the interval to 5 days, the third to > 21 days
    for (let i = 0; i < 4; i++) await gradeCard('chunk:c001', 3, 'recall', 1000);
    renderMe();
    const section = await screen.findByRole('region', { name: '语块库进度' });
    await waitFor(() => expect(within(section).getByText('已学').nextElementSibling).toHaveTextContent('3'));
    expect(within(section).getByText('已掌握').nextElementSibling).toHaveTextContent('1');
    const list = within(section).getByRole('list', { name: '按类别的进度' });
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(within(list).getAllByRole('link')[0]).toHaveAttribute('href', expect.stringContaining('/library?cat='));
  });

  it('new items per day: default 5, stepper stays within 3-10 and saves to the profile', async () => {
    await getOrCreateProfile();
    renderMe();
    expect(await screen.findByTestId('new-per-day')).toHaveTextContent('5 条');
    expect(screen.getByText(/从下一课开始生效/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '增加每天新语块数量' }));
    fireEvent.click(screen.getByRole('button', { name: '增加每天新语块数量' }));
    await waitFor(async () => expect((await db.profile.get('profile'))?.newPerDay).toBe(7));
    expect(await screen.findByTestId('new-per-day')).toHaveTextContent('7 条');
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole('button', { name: '增加每天新语块数量' }));
    await waitFor(async () => expect((await db.profile.get('profile'))?.newPerDay).toBe(10));
    expect(screen.getByRole('button', { name: '增加每天新语块数量' })).toBeDisabled();
    for (let i = 0; i < 9; i++) fireEvent.click(screen.getByRole('button', { name: '减少每天新语块数量' }));
    await waitFor(async () => expect((await db.profile.get('profile'))?.newPerDay).toBe(3));
    expect(screen.getByRole('button', { name: '减少每天新语块数量' })).toBeDisabled();
  });

  it("does not change today's frozen plan when the number changes", async () => {
    const before = await getOrCreateSession(todayStr());
    expect(before.plan?.newItems).toHaveLength(5);
    await updateProfile({ newPerDay: 8 });
    const after = await getOrCreateSession(todayStr());
    expect(after.plan?.newItems).toHaveLength(5);
  });

  it('explains the two tracks', async () => {
    await getOrCreateProfile();
    renderMe();
    const box = await screen.findByTestId('plan-explain');
    expect(box).toHaveTextContent('前 13 课每天学一个骨架句');
    expect(box).toHaveTextContent('每天 5 条新语块');
    expect(box).toHaveTextContent('约 400 条');
  });
});
