import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../lib/db';
import { listenRate } from '../../lib/ladder';
import { todayStr } from '../../lib/plan';
import { getOrCreateProfile, setGoal } from '../../lib/repo';

vi.setConfig({ testTimeout: 30_000 });

const seen = vi.hoisted(() => ({ listenRates: [] as (number | undefined)[], recallLimits: [] as (number | undefined)[], dialogueGistOnly: [] as (boolean | undefined)[], verified: true }));

// One-click stubs for the drills: ListenDrill answers right, RecallDrill says it in 2 s, dialogues are gist-only.
vi.mock('../../components/chunk/ListenDrill', () => ({
  ListenDrill: (p: { rate?: number; onDone: (r: { correct: boolean; replays: number; ms: number }) => void }) => {
    seen.listenRates.push(p.rate);
    return (
      <button type="button" onClick={() => p.onDone({ correct: true, replays: 0, ms: 1000 })}>
        听对了
      </button>
    );
  },
}));
vi.mock('../../components/chunk/RecallDrill', () => ({
  RecallDrill: (p: { timeLimitMs?: number; onDone: (r: { correct: boolean; ms: number; verified: boolean }) => void }) => {
    seen.recallLimits.push(p.timeLimitMs);
    return (
      <button type="button" onClick={() => p.onDone({ correct: true, ms: 2000, verified: seen.verified })}>
        说对了
      </button>
    );
  },
}));
vi.mock('../../components/listening/DialogueListen', () => ({
  DialogueListen: (p: { gistOnly?: boolean; onDone: (r: { gistCorrect: boolean; blanks: never[]; replays: number; ms: number }) => void }) => {
    seen.dialogueGistOnly.push(p.gistOnly);
    return (
      <button type="button" onClick={() => p.onDone({ gistCorrect: true, blanks: [], replays: 0, ms: 1000 })}>
        主旨对了
      </button>
    );
  },
}));

import { OnboardingPage } from './OnboardingPage';

beforeEach(async () => {
  seen.listenRates.length = 0;
  seen.recallLimits.length = 0;
  seen.dialogueGistOnly.length = 0;
  seen.verified = true;
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  await Promise.all(db.tables.map((t) => t.clear()));
});

function renderAt(path = '/onboarding') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/plan" element={<p>PLAN PAGE</p>} />
        <Route path="/" element={<p>TODAY PAGE</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('onboarding', () => {
  it('step 1 explains the four elements and preselects the recommended horizon and minutes', async () => {
    renderAt();
    expect(await screen.findByLabelText('刻意练习的四个要素')).toHaveTextContent('走出舒适区');
    expect(screen.getByRole('button', { name: /100 天/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /20 分钟/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '日常口语与听力' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('skip path: sets the goal with the default ladder and shows the plan', async () => {
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: /60 天/ }));
    fireEvent.click(screen.getByRole('button', { name: /25 分钟/ }));
    fireEvent.click(screen.getByRole('button', { name: '下一步：诊断测试' }));
    expect(screen.getByText(/大约 8–10 分钟/)).toBeInTheDocument();
    expect(screen.getByText(/不会“不及格”/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '先跳过诊断' }));

    expect(await screen.findByTestId('result-skipped')).toBeInTheDocument();
    const profile = await getOrCreateProfile();
    expect(profile.goal).toMatchObject({ focus: 'speaking-listening', horizonDays: 60, dailyMinutes: 25, startDate: todayStr(), startLesson: 1 });
    expect(profile.adaptive?.ladder).toMatchObject({ listen: 1, speak: 1 });
    expect(profile.assessments ?? []).toHaveLength(0);
    // plan with three phases is shown
    expect(await screen.findByLabelText('阶段时间线')).toBeInTheDocument();
    expect(screen.getByTestId('phase-foundation')).toBeInTheDocument();
    expect(screen.getByTestId('phase-sprint')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '开始第一课' }));
    expect(await screen.findByText('TODAY PAGE')).toBeInTheDocument();
  });

  it('full placement: staircase at ladder rates, gist-only dialogues, 10 s speaking, result with honest note and plan', async () => {
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: '下一步：诊断测试' }));
    fireEvent.click(screen.getByRole('button', { name: '开始诊断' }));

    // 12 listening items: all right -> level climbs from L2 and is clamped at L8
    for (let i = 0; i < 12; i++) fireEvent.click(await screen.findByRole('button', { name: '听对了' }));
    // 2 dialogues
    for (let i = 0; i < 2; i++) fireEvent.click(await screen.findByRole('button', { name: '主旨对了' }));
    // 8 speaking items
    for (let i = 0; i < 8; i++) fireEvent.click(await screen.findByRole('button', { name: '说对了' }));

    expect(await screen.findByTestId('result-level')).toHaveTextContent(/^(入门|基础|进阶|熟练)$/);
    expect(screen.getByText(/不是标准化考试/)).toBeInTheDocument();
    expect(screen.queryByTestId('result-self-estimate')).not.toBeInTheDocument();
    expect(screen.getByText('直接记为已学').parentElement).toHaveTextContent('4 条');
    expect(screen.getByLabelText('阶段时间线')).toBeInTheDocument();

    expect(seen.listenRates.slice(0, 4)).toEqual([listenRate(2), listenRate(3), listenRate(4), listenRate(5)]);
    expect(seen.listenRates).toHaveLength(12);
    expect(seen.dialogueGistOnly).toEqual([true, true]);
    expect(seen.recallLimits).toEqual(Array(8).fill(10_000));

    const profile = await getOrCreateProfile();
    expect(profile.assessments).toHaveLength(1);
    expect(profile.assessments?.[0].kind).toBe('placement');
    expect(profile.assessments?.[0].fastTracked).toHaveLength(4);
    expect(profile.adaptive?.ladder.listen).toBe(profile.assessments?.[0].listenLevel);
    expect(profile.goal).toMatchObject({ horizonDays: 100, dailyMinutes: 20, startDate: todayStr() });
    expect(await db.cards.count()).toBe(4); // the fast-tracked chunks became known cards
  });

  it('self-check placement: no fast-track, conservative speaking level and the self-estimate note', async () => {
    seen.verified = false;
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: '下一步：诊断测试' }));
    fireEvent.click(screen.getByRole('button', { name: '开始诊断' }));
    for (let i = 0; i < 12; i++) fireEvent.click(await screen.findByRole('button', { name: '听对了' }));
    for (let i = 0; i < 2; i++) fireEvent.click(await screen.findByRole('button', { name: '主旨对了' }));
    for (let i = 0; i < 8; i++) fireEvent.click(await screen.findByRole('button', { name: '说对了' }));

    expect(await screen.findByTestId('result-self-estimate')).toHaveTextContent('口语等级按自评估算；开启语音验证后会更准');
    expect(screen.getByText('直接记为已学').parentElement).toHaveTextContent('0 条');
    const a = (await getOrCreateProfile()).assessments?.[0];
    expect(a).toMatchObject({ speakLevel: 2, speakAcc: 1 });
    expect(a?.fastTracked).toBeUndefined();
    expect(await db.cards.count()).toBe(0);
  });

  it('edit mode keeps the start of the goal; 只保存目标 updates it and goes to /plan', async () => {
    await setGoal({ focus: 'speaking-listening', horizonDays: 30, dailyMinutes: 15, startDate: '2026-10-01', startLesson: 4 });
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: /60 天/ }));
    expect(screen.getByRole('button', { name: /15 分钟/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /30 分钟/ }));
    fireEvent.click(screen.getByRole('button', { name: '只保存目标' }));
    expect(await screen.findByText('PLAN PAGE')).toBeInTheDocument();
    const goal = (await getOrCreateProfile()).goal;
    expect(goal).toEqual({ focus: 'speaking-listening', horizonDays: 60, dailyMinutes: 30, startDate: '2026-10-01', startLesson: 4 });
  });

  it('?step=diagnosis with a goal starts at the diagnosis intro and keeps the goal', async () => {
    await setGoal({ focus: 'speaking-listening', horizonDays: 30, dailyMinutes: 20, startDate: '2026-10-01', startLesson: 4 });
    renderAt('/onboarding?step=diagnosis');
    expect(await screen.findByRole('button', { name: '开始诊断' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '先跳过诊断' }));
    await waitFor(() => expect(screen.getByTestId('result-skipped')).toBeInTheDocument());
    expect((await getOrCreateProfile()).goal?.startDate).toBe('2026-10-01');
  });
});
