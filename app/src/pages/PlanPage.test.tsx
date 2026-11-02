import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdaptiveState, Assessment, CoachReport } from '../types';
import { db } from '../lib/db';
import { todayStr } from '../lib/plan';
import { getOrCreateProfile, logMeasurement, saveAssessment, setGoal, updateProfile } from '../lib/repo';

vi.setConfig({ testTimeout: 30_000 });

const ai = vi.hoisted(() => ({ configured: false, report: null as unknown, fail: false }));
vi.mock('../lib/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/ai')>();
  return {
    ...actual,
    aiConfigured: () => ai.configured,
    generateCoachReport: async () => {
      if (ai.fail) throw new actual.AiError('network', '网络不通');
      return ai.report as CoachReport;
    },
  };
});

import { PlanPage } from './PlanPage';

beforeEach(async () => {
  ai.configured = false;
  ai.fail = false;
  ai.report = null;
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  await Promise.all(db.tables.map((t) => t.clear()));
});

function renderPlan() {
  return render(
    <MemoryRouter>
      <PlanPage />
    </MemoryRouter>,
  );
}

const GOAL = { focus: 'speaking-listening', horizonDays: 100, dailyMinutes: 20, startDate: todayStr(), startLesson: 1 } as const;

async function seedAnswers(skill: 'listen' | 'speak', right: number, wrong: number, cardId = 'chunk:c001') {
  for (let i = 0; i < right + wrong; i++) {
    await logMeasurement({ cardId, skill, correct: i < right, mode: skill === 'listen' ? 'listen' : 'recall', durationMs: 3000, level: 1 });
  }
}

describe('PlanPage', () => {
  it('without a goal shows an empty state with a CTA to /onboarding', async () => {
    renderPlan();
    expect(await screen.findByText('还没有设定学习目标')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '设定目标' })).toHaveAttribute('href', '/onboarding');
    expect(screen.queryByText('舒适区仪表')).not.toBeInTheDocument();
  });

  it('shows the goal card with day, status and the edit / re-test links', async () => {
    await setGoal(GOAL);
    renderPlan();
    expect(await screen.findByLabelText('我的目标')).toHaveTextContent('日常口语与听力');
    expect(screen.getByLabelText('我的目标')).toHaveTextContent('100 天 · 每天 20 分钟');
    expect(screen.getByTestId('goal-day')).toHaveTextContent('第 1 / 100 天');
    expect(screen.getByTestId('goal-status')).toHaveTextContent('按计划');
    expect(screen.getByRole('link', { name: '修改目标' })).toHaveAttribute('href', '/onboarding');
    expect(screen.getAllByRole('link', { name: '重新做诊断' })[0]).toHaveAttribute('href', '/onboarding?step=diagnosis');
  });

  it('phase timeline lists the 3 phases, marks the current one and shows milestones in words', async () => {
    await setGoal(GOAL);
    renderPlan();
    expect(await screen.findByRole('list', { name: '阶段时间线' })).toBeInTheDocument();
    expect(screen.getByTestId('phase-foundation')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('phase-current')).toHaveTextContent('第 1 天');
    expect(screen.getByTestId('phase-foundation')).toHaveTextContent('第 1–30 天');
    expect(screen.getByTestId('phase-expand')).toHaveTextContent('第 31–70 天');
    expect(screen.getByTestId('phase-sprint')).toHaveTextContent('第 71–100 天');
    expect(screen.getByTestId('phase-foundation')).toHaveTextContent(/听力 L3 · 第 2 档对话 · 0\.95×/);
    expect(screen.getByTestId('phase-foundation')).toHaveTextContent(/口语 S2 · 限时 6 秒/);
  });

  it('comfort gauges: the 70-88% band is shaded, the marker sits at the rolling accuracy, with n and level words', async () => {
    await setGoal(GOAL);
    await seedAnswers('listen', 17, 3); // 85%
    await seedAnswers('speak', 10, 10); // 50% -> below the band
    renderPlan();
    const gauge = await screen.findByTestId('gauge-listen');
    const band = within(gauge).getByTestId('gauge-band-listen');
    expect(band.style.left).toBe('70%');
    expect(band.style.width).toBe('18%');
    expect(within(gauge).getByTestId('gauge-marker-listen').style.left).toBe('85%');
    expect(gauge).toHaveTextContent('85% · 舒适区边缘');
    expect(within(gauge).getByTestId('gauge-n-listen')).toHaveTextContent('最近 20 次');
    expect(gauge).toHaveTextContent('当前 L1 · 第 1 档对话 · 0.95×');
    expect(within(gauge).getByRole('img')).toHaveAccessibleName(/滚动正确率 85%/);

    const speak = screen.getByTestId('gauge-speak');
    expect(speak).toHaveTextContent('50% · 偏难');
    expect(within(speak).getByTestId('gauge-marker-speak').style.left).toBe('50%');
    expect(speak).toHaveTextContent('当前 S1 · 限时 8 秒');

    // no decode data yet
    expect(screen.getByTestId('gauge-decode')).toHaveTextContent('还没有数据');
    expect(screen.getByTestId('gauge-decode').querySelector('[data-testid="gauge-marker-decode"]')).toBeNull();
    expect(screen.getByText(/正确率在绿色区间 = 练在舒适区边缘，进步最快；系统会自动调节难度把你保持在这里/)).toBeInTheDocument();
  });

  it('lists adjustments newest first', async () => {
    await setGoal(GOAL);
    const profile = await getOrCreateProfile();
    const adaptive = profile.adaptive as AdaptiveState;
    await updateProfile({
      adaptive: {
        ...adaptive,
        history: [
          { date: '2026-10-20', dimension: 'listen', from: 1, to: 2, reasonZh: '听力正确率 92% > 88%，语速升到 1.05' },
          { date: '2026-10-25', dimension: 'speak', from: 1, to: 0, reasonZh: '口语正确率 60% < 70%，限时放宽到 10 秒' },
        ],
      },
    });
    renderPlan();
    const rows = await screen.findAllByTestId('history-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('2026-10-25');
    expect(rows[0]).toHaveTextContent('口语正确率 60% < 70%');
    expect(rows[1]).toHaveTextContent('2026-10-20');
  });

  it('shows weak spots with links: weakest category, sound pattern errors', async () => {
    await setGoal(GOAL);
    // 5 wrong answers in a category + a sound pattern with errors
    for (let i = 0; i < 5; i++) await logMeasurement({ cardId: 'chunk:c001', skill: 'speak', correct: false, mode: 'recall', durationMs: 2000, level: 1 });
    for (let i = 0; i < 3; i++) await logMeasurement({ cardId: 'sound:s01', skill: 'listen', correct: false, mode: 'sound', durationMs: 2000, level: 1 });
    renderPlan();
    const links = await screen.findAllByRole('link');
    const hrefs = links.map((a) => a.getAttribute('href'));
    expect(hrefs.some((h) => h?.startsWith('/library?cat='))).toBe(true);
    expect(hrefs).toContain('/listening/sound/s01');
  });

  it('assessments: chart, list and the checkpoint button', async () => {
    await setGoal(GOAL);
    const base: Omit<Assessment, 'id' | 'date' | 'kind' | 'listenLevel' | 'speakLevel'> = { listenAcc: 0.7, speakAcc: 0.8, bandAcc: {}, levelZh: '基础' };
    await saveAssessment({ ...base, id: 'placement-2026-10-01', date: '2026-10-01', kind: 'placement', listenLevel: 2, speakLevel: 1 });
    await saveAssessment({ ...base, id: 'checkpoint-2026-10-08', date: '2026-10-08', kind: 'checkpoint', listenLevel: 3, speakLevel: 2 });
    renderPlan();
    expect(await screen.findByTestId('assess-chart')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /听力等级.*2026|听力等级.*10-01 2/ })).toBeInTheDocument();
    const rows = screen.getAllByTestId('assess-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('周复测');
    expect(rows[1]).toHaveTextContent('诊断');
    expect(screen.getByRole('link', { name: '做一次周复测' })).toHaveAttribute('href', '/assessment/checkpoint');
  });

  describe('AI coach', () => {
    it('without AI generates a rules report, saves it and says so', async () => {
      await setGoal(GOAL);
      renderPlan();
      expect(await screen.findByTestId('coach-empty')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '生成本周报告' }));
      expect(await screen.findByTestId('coach-latest')).toBeInTheDocument();
      expect(screen.getByTestId('coach-notice')).toHaveTextContent('还没有配置 AI');
      expect(screen.getByTestId('coach-latest')).toHaveTextContent('规则简版');
      const saved = (await getOrCreateProfile()).coachReports;
      expect(saved).toHaveLength(1);
      expect(saved?.[0].source).toBe('rules');
      expect(screen.getByTestId('coach-summary')).toHaveTextContent(saved?.[0].summaryZh ?? 'x');
    });

    it('with AI configured but failing (AiError) falls back to rules with a notice', async () => {
      await setGoal(GOAL);
      ai.configured = true;
      ai.fail = true;
      renderPlan();
      fireEvent.click(await screen.findByRole('button', { name: '生成本周报告' }));
      expect(await screen.findByTestId('coach-notice')).toHaveTextContent('AI 教练暂时不可用');
      expect((await getOrCreateProfile()).coachReports?.[0].source).toBe('rules');
    });

    it('with AI returns the AI report; 采纳建议 updates newPerDay, records the change; older reports are collapsed', async () => {
      await setGoal(GOAL);
      const old: CoachReport = {
        id: 'coach-1',
        createdAt: new Date(2026, 9, 1).getTime(),
        lesson: 3,
        source: 'rules',
        summaryZh: '上周的小结',
        strengthsZh: [],
        weaknessesZh: [],
        nextWeekFocusZh: [],
        tipsZh: [],
      };
      await updateProfile({ coachReports: [old] });
      ai.configured = true;
      ai.report = {
        id: 'coach-2',
        createdAt: Date.now(),
        lesson: 8,
        source: 'ai',
        summaryZh: '本周听力稳定。',
        strengthsZh: ['听力稳定'],
        weaknessesZh: ['口语偏慢'],
        nextWeekFocusZh: ['多练限时'],
        tipsZh: ['每天跟读 5 句'],
        suggestedNewPerDay: 8,
      } satisfies CoachReport;
      renderPlan();
      fireEvent.click(await screen.findByRole('button', { name: '生成本周报告' }));
      const latest = await screen.findByTestId('coach-latest');
      await waitFor(() => expect(latest).toHaveTextContent('本周听力稳定。'));
      expect(latest).toHaveTextContent('AI 教练');
      expect(latest).toHaveTextContent('每天跟读 5 句');
      expect(screen.queryByTestId('coach-notice')).not.toBeInTheDocument();
      // older report collapsed in <details>
      const older = screen.getByTestId('coach-older');
      expect(older.tagName).toBe('DETAILS');
      expect(older).not.toHaveAttribute('open');

      fireEvent.click(screen.getByRole('button', { name: '采纳建议' }));
      await waitFor(async () => expect((await getOrCreateProfile()).adaptive?.ladder.newPerDay).toBe(8));
      const p = await getOrCreateProfile();
      expect(p.newPerDay).toBe(8);
      expect(p.adaptive?.history.at(-1)).toMatchObject({ dimension: 'newPerDay', from: 5, to: 8 });
      expect(p.adaptive?.ladder).toMatchObject({ listen: 1, speak: 1 });
      expect(await screen.findByText(/已采纳/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '采纳建议' })).not.toBeInTheDocument();
    });
  });
});
