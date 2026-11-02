import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../lib/db';
import { listenRate } from '../lib/ladder';
import { todayStr } from '../lib/plan';
import { getOrCreateProfile, introduceKnown, saveAssessment, setGoal } from '../lib/repo';

vi.setConfig({ testTimeout: 30_000 });

const seen = vi.hoisted(() => ({ rates: [] as (number | undefined)[], limits: [] as (number | undefined)[], ids: [] as string[], wrongAt: new Set<number>(), verified: true }));

vi.mock('../components/chunk/ListenDrill', () => ({
  ListenDrill: (p: { rate?: number; item: { kind: string; chunk?: { id: string } }; onDone: (r: { correct: boolean; replays: number; ms: number }) => void }) => {
    const n = seen.rates.length;
    seen.rates.push(p.rate);
    seen.ids.push(p.item.chunk?.id ?? '');
    return (
      <button type="button" onClick={() => p.onDone({ correct: !seen.wrongAt.has(n), replays: 0, ms: 1000 })}>
        听
      </button>
    );
  },
}));
vi.mock('../components/chunk/RecallDrill', () => ({
  RecallDrill: (p: { timeLimitMs?: number; onDone: (r: { correct: boolean; ms: number; verified: boolean }) => void }) => {
    seen.limits.push(p.timeLimitMs);
    return (
      <button type="button" onClick={() => p.onDone({ correct: true, ms: 3500, verified: seen.verified })}>
        说
      </button>
    );
  },
}));

import { CheckpointPage } from './CheckpointPage';

beforeEach(async () => {
  seen.rates.length = 0;
  seen.limits.length = 0;
  seen.ids.length = 0;
  seen.wrongAt.clear();
  seen.verified = true;
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  await Promise.all(db.tables.map((t) => t.clear()));
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/assessment/checkpoint']}>
      <Routes>
        <Route path="/assessment/checkpoint" element={<CheckpointPage />} />
        <Route path="/plan" element={<p>PLAN PAGE</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CheckpointPage', () => {
  it('without a goal asks to set one first', async () => {
    renderPage();
    expect(await screen.findByText('先设定目标')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '去设定目标' })).toHaveAttribute('href', '/onboarding');
  });

  it('runs 6 listening items (current and one level higher) + 4 speaking items, saves a checkpoint and compares with the previous test', async () => {
    await setGoal({ focus: 'speaking-listening', horizonDays: 100, dailyMinutes: 20, startDate: todayStr(), startLesson: 1 });
    await saveAssessment({ id: 'placement-2026-10-01', date: '2026-10-01', kind: 'placement', listenLevel: 1, listenAcc: 0.6, speakLevel: 1, speakAcc: 0.6, bandAcc: {}, levelZh: '基础' });
    // learned chunks are preferred as items
    const learned = ['c001', 'c002', 'c003', 'c004', 'c005', 'c006', 'c007', 'c008', 'c009', 'c010', 'c011', 'c012'];
    await introduceKnown(learned.map((id) => ({ kind: 'chunk' as const, id })), 7);
    const ladder = (await getOrCreateProfile()).adaptive?.ladder;
    expect(ladder).toMatchObject({ listen: 1, speak: 1 });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '开始复测' }));
    for (let i = 0; i < 6; i++) fireEvent.click(await screen.findByRole('button', { name: '听' }));
    for (let i = 0; i < 4; i++) fireEvent.click(await screen.findByRole('button', { name: '说' }));

    expect(await screen.findByTestId('checkpoint-level')).toBeInTheDocument();
    expect(seen.rates).toEqual([listenRate(1), listenRate(2), listenRate(1), listenRate(2), listenRate(1), listenRate(2)]);
    expect(seen.limits).toEqual([8000, 8000, 8000, 8000]);
    expect(seen.ids.every((id) => learned.includes(id))).toBe(true);

    // all right at L1 and L2 -> L2; speaking median 3.5 s -> S4
    expect(screen.getByTestId('checkpoint-listen')).toHaveTextContent('L2 · 正确率 100%');
    expect(screen.getByTestId('checkpoint-speak')).toHaveTextContent('S4 · 正确率 100%');
    expect(screen.getByText('比上次高 1 级', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('比上次高 3 级', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/对比诊断（2026-10-01）：听力 L1，口语 S1/)).toBeInTheDocument();

    const profile = await getOrCreateProfile();
    expect(profile.assessments).toHaveLength(2);
    expect(profile.assessments?.[1]).toMatchObject({ kind: 'checkpoint', listenLevel: 2, speakLevel: 4 });
    // a checkpoint never moves the ladder
    expect(profile.adaptive?.ladder).toMatchObject({ listen: 1, speak: 1 });
  });

  it('self-check speaking: accuracy-based level (not latency) and the self-estimate note', async () => {
    seen.verified = false;
    await setGoal({ focus: 'speaking-listening', horizonDays: 100, dailyMinutes: 20, startDate: todayStr(), startLesson: 1 });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '开始复测' }));
    for (let i = 0; i < 6; i++) fireEvent.click(await screen.findByRole('button', { name: '听' }));
    for (let i = 0; i < 4; i++) fireEvent.click(await screen.findByRole('button', { name: '说' }));
    expect(await screen.findByTestId('checkpoint-level')).toBeInTheDocument();
    expect(screen.getByTestId('checkpoint-speak')).toHaveTextContent('S2 · 正确率 100%'); // 3.5 s would have been S4
    expect(screen.getByTestId('result-self-estimate')).toHaveTextContent('口语等级按自评估算');
    const a = (await getOrCreateProfile()).assessments?.[0];
    expect(a?.speakMedianMs).toBeUndefined();
  });

  it('lower-than-before results show a drop (one level below the current when neither level passes)', async () => {
    await setGoal({ focus: 'speaking-listening', horizonDays: 30, dailyMinutes: 20, startDate: todayStr(), startLesson: 1 });
    await saveAssessment({ id: 'placement-2026-10-01', date: '2026-10-01', kind: 'placement', listenLevel: 1, listenAcc: 0.6, speakLevel: 1, speakAcc: 0.6, bandAcc: {}, levelZh: '基础' });
    for (let i = 0; i < 6; i++) seen.wrongAt.add(i);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '开始复测' }));
    for (let i = 0; i < 6; i++) fireEvent.click(await screen.findByRole('button', { name: '听' }));
    for (let i = 0; i < 4; i++) fireEvent.click(await screen.findByRole('button', { name: '说' }));
    expect(await screen.findByTestId('checkpoint-listen')).toHaveTextContent('L0 · 正确率 0%');
    expect(screen.getByText('比上次低 1 级', { selector: 'span' })).toBeInTheDocument();
  });
});
