import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Goal, Grade, ItemRef } from '../types';
import type { ItemParts } from '../lib/today';

const PARTS: ItemParts = { listen: { correct: true, ms: 900 }, recall: [{ correct: true, ms: 2000 }] };

vi.mock('../components/chunk', () => ({
  NewItemFlow: ({
    ref,
    onDone,
    speakLimitMs,
  }: {
    ref: ItemRef;
    onDone: (g: Grade, i: { ms: number; mode: 'recall'; parts: ItemParts }) => void;
    speakLimitMs?: number;
  }) => (
    <button type="button" data-limit={speakLimitMs} onClick={() => onDone(2, { ms: 1000, mode: 'recall', parts: PARTS })}>
      学完 {ref.id}
    </button>
  ),
  ReviewItem: ({
    card,
    onDone,
    speakLimitMs,
  }: {
    card: { refId: string };
    onDone: (g: Grade, m: 'recall', i: { ms: number; parts: ItemParts }) => void;
    speakLimitMs?: number;
  }) => (
    <button type="button" data-limit={speakLimitMs} onClick={() => onDone(2, 'recall', { ms: 500, parts: PARTS })}>
      复习完 {card.refId}
    </button>
  ),
}));
vi.mock('../components/decode', () => ({
  DecodeLesson: ({ onDone }: { onDone: (g: Grade, i: { ms: number }) => void }) => (
    <button type="button" onClick={() => onDone(2, { ms: 2000 })}>
      完成课程
    </button>
  ),
  DecodeMaintenance: ({ onDone }: { onDone: (g: Grade, i: { ms: number }) => void }) => (
    <button type="button" onClick={() => onDone(3, { ms: 3000 })}>
      完成维护
    </button>
  ),
}));
vi.mock('../components/listening', () => ({
  DialogueListen: ({ dialogue, rate, onDone }: { dialogue: { id: string }; rate: number; onDone: (r: unknown) => void }) => (
    <button
      type="button"
      data-rate={rate}
      onClick={() => onDone({ gistCorrect: true, blanks: [{ text: 'a', correct: true, heard: 'a' }], replays: 0, ms: 6000 })}
    >
      对话完成 {dialogue.id}
    </button>
  ),
  SoundDrill: ({ pattern, onDone }: { pattern: { id: string }; onDone: (r: unknown) => void }) => (
    <button type="button" onClick={() => onDone({ correct: 3, total: 3, items: [], ms: 9000 })}>
      音变完成 {pattern.id}
    </button>
  ),
  NumbersDrill: ({ count, onDone }: { count: number; onDone: (r: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onDone({
          correct: 2,
          total: 3,
          ms: 12000,
          items: [
            { kind: 'price', spoken: 'x', answer: '1', input: '1', correct: true },
            { kind: 'price', spoken: 'x', answer: '2', input: '2', correct: true },
            { kind: 'time', spoken: 'x', answer: '3', input: '4', correct: false },
          ],
        })
      }
    >
      数字完成 {count}
    </button>
  ),
}));
vi.mock('../lib/speech', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/speech')>()),
  speak: () => Promise.resolve(),
  stopSpeaking: () => undefined,
}));

import { db } from '../lib/db';
import { todayStr } from '../lib/plan';
import { getOrCreateSession, logMeasurement, markStepDone, setGoal } from '../lib/repo';
import { TodayPage } from './TodayPage';

function renderToday() {
  return render(
    <MemoryRouter>
      <TodayPage />
    </MemoryRouter>,
  );
}

const goal = (over: Partial<Goal> = {}): Goal => ({
  focus: 'speaking-listening',
  horizonDays: 30,
  dailyMinutes: 20,
  startDate: todayStr(),
  startLesson: 1,
  ...over,
});

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

describe('TodayPage v3: header, budgets, goal', () => {
  beforeEach(async () => {
    await setGoal(goal());
  });

  it('five steps with minute budgets and the 今日目标 line', async () => {
    renderToday();
    expect(await screen.findByRole('heading', { name: '第 1 课' })).toBeInTheDocument();
    const tabs = within(screen.getByRole('list', { name: '今日五步' })).getAllByRole('button');
    expect(tabs.map((t) => t.getAttribute('aria-label'))).toEqual([
      '第 1 步 复习',
      '第 2 步 新语块',
      '第 3 步 听力',
      '第 4 步 解码',
      '第 5 步 输出',
    ]);
    // 20 minutes: review 5, chunks 5, listening 5, decode 2, output 3
    expect(tabs.map((t) => t.textContent)).toEqual(['1复习5 分钟', '2新语块5 分钟', '3听力5 分钟', '4解码2 分钟', '5输出3 分钟']);
    const goalLine = screen.getByTestId('today-goal');
    expect(goalLine).toHaveTextContent('今日目标');
    expect(within(goalLine).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '新学 5 条',
      '听力语速 0.95',
      '口语 8 秒内说出',
      '正确率保持在 70–88%',
    ]);
    expect(screen.getByText(/预计还需约 20 分钟/)).toBeInTheDocument();
    expect(screen.queryByTestId('goal-card')).not.toBeInTheDocument();
    // the running block shows its budget and a live countdown
    expect(await screen.findByTestId('step-budget')).toHaveTextContent('约 5 分钟');
    expect(screen.getByTestId('step-clock')).toHaveTextContent(/^⏱ 剩 [45]:\d\d$/);
  });

  it('checkpointDue shows an optional card linking to the checkpoint', async () => {
    await getOrCreateSession(todayStr());
    const s = await db.sessions.get(todayStr());
    await db.sessions.update(todayStr(), { plan: { ...s!.plan!, checkpointDue: true } });
    renderToday();
    const card = await screen.findByTestId('checkpoint-card');
    expect(within(card).getByRole('link', { name: '去复测' })).toHaveAttribute('href', '/assessment/checkpoint');
  });
});

describe('TodayPage v3: review and new chunks record measurements', () => {
  beforeEach(async () => {
    await setGoal(goal());
  });

  it('review: edge items come first, labelled, with the ladder speak limit; measurements are logged', async () => {
    const date = todayStr();
    const s = await getOrCreateSession(date);
    await db.sessions.update(date, { plan: { ...s.plan!, edge: [{ kind: 'chunk', id: 'c002' }] } });
    await db.cards.bulkPut(
      ['c001', 'c002', 'c003'].map((id, i) => ({
        id: `chunk:${id}`,
        kind: 'chunk' as const,
        refId: id,
        due: Date.now() - 1000 * (3 - i),
        interval: 1,
        ease: 2.5,
        reps: 1,
        lapses: 0,
        updatedAt: 1,
      })),
    );
    renderToday();
    expect(await screen.findByTestId('review-progress')).toHaveTextContent('复习 1 / 3');
    expect(screen.getByTestId('edge-badge')).toHaveTextContent('边缘语块');
    const first = screen.getByRole('button', { name: /^复习完 / });
    expect(first).toHaveTextContent('复习完 c002');
    expect(first).toHaveAttribute('data-limit', '8000'); // S1 = 8 s
    fireEvent.click(first);
    await waitFor(() => expect(screen.getByTestId('review-progress')).toHaveTextContent('复习 2 / 3'));
    expect(screen.queryByTestId('edge-badge')).not.toBeInTheDocument();
    const logs = (await db.reviews.toArray()).filter((l) => l.cardId === 'chunk:c002');
    expect(logs.find((l) => l.skill === 'listen')).toMatchObject({ correct: true, level: 1, latencyMs: 900 });
    expect(logs.find((l) => l.skill === 'speak')).toMatchObject({ correct: true, level: 1, latencyMs: 2000, mode: 'recall', grade: 2 });
  });

  it('new chunks: the speak limit is passed and listen/speak measurements are logged', async () => {
    const date = todayStr();
    await markStepDone(date, 'review', 1000);
    renderToday();
    const items = (await db.sessions.get(date))!.plan!.newItems;
    const btn = await screen.findByRole('button', { name: `学完 ${items[0].id}` });
    expect(btn).toHaveAttribute('data-limit', '8000');
    fireEvent.click(btn);
    await waitFor(async () => expect(await db.cards.get(`${items[0].kind}:${items[0].id}`)).toBeDefined());
    await waitFor(async () => {
      const logs = (await db.reviews.toArray()).filter((l) => l.cardId === `${items[0].kind}:${items[0].id}`);
      expect(logs.map((l) => l.skill).sort()).toEqual(['listen', 'speak']);
    });
  });
});

describe('TodayPage v3: step 3 听力', () => {
  beforeEach(async () => {
    await setGoal(goal());
    await markStepDone(todayStr(), 'review', 1000);
    await markStepDone(todayStr(), 'chunks', 1000);
  });

  it('runs the dialogues, the sound and the numbers; every result is logged as a listening measurement', async () => {
    renderToday();
    const plan = (await db.sessions.get(todayStr()))!.plan!;
    const total = plan.listening!.dialogueIds.length + 2;
    expect(await screen.findByTestId('listening-progress')).toHaveTextContent(`听力 1 / ${total}`);
    for (const id of plan.listening!.dialogueIds) {
      const btn = await screen.findByRole('button', { name: `对话完成 ${id}` });
      expect(btn).toHaveAttribute('data-rate', '0.95'); // L1
      fireEvent.click(btn);
    }
    fireEvent.click(await screen.findByRole('button', { name: `音变完成 ${plan.listening!.soundId}` }));
    fireEvent.click(await screen.findByRole('button', { name: `数字完成 ${plan.listening!.numbers}` }));
    expect(await screen.findByText('听力完成')).toBeInTheDocument();

    const logs = await db.reviews.toArray();
    for (const id of plan.listening!.dialogueIds) {
      expect(logs.find((l) => l.cardId === `dialogue:${id}`)).toMatchObject({ skill: 'listen', correct: true, level: 1, mode: 'dialogue' });
    }
    expect(logs.find((l) => l.cardId === `sound:${plan.listening!.soundId}`)).toMatchObject({ skill: 'listen', correct: true, mode: 'sound' });
    expect((await db.cards.get(`sound:${plan.listening!.soundId}`))?.reps).toBe(1);
    expect(logs.find((l) => l.cardId === 'numbers:price')).toMatchObject({ skill: 'listen', correct: true });
    expect(logs.find((l) => l.cardId === 'numbers:time')).toMatchObject({ skill: 'listen', correct: false });

    fireEvent.click(screen.getByRole('button', { name: '继续：解码' }));
    expect(await screen.findByRole('button', { name: '完成课程' })).toBeInTheDocument();
    expect((await db.sessions.get(todayStr()))?.stepsDone).toEqual(['review', 'chunks', 'listening']);
  });

  it('今天先到这 ends the block early', async () => {
    renderToday();
    await screen.findByTestId('listening-progress');
    fireEvent.click(screen.getByRole('button', { name: '今天先到这' }));
    expect(await screen.findByRole('button', { name: '完成课程' })).toBeInTheDocument();
    expect((await db.sessions.get(todayStr()))?.stepsDone).toContain('listening');
  });
});

describe('TodayPage v3: 专注模式', () => {
  beforeEach(async () => {
    await setGoal(goal());
  });

  it('toggles, persists per device and exits', async () => {
    const { unmount } = renderToday();
    fireEvent.click(await screen.findByRole('button', { name: '专注模式' }));
    const bar = await screen.findByTestId('focus-bar');
    expect(bar).toHaveTextContent('专注 · 复习');
    expect(localStorage.getItem('pd.focus')).toBe('1');
    unmount();

    renderToday(); // a new visit starts in focus mode
    expect(await screen.findByTestId('focus-bar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '退出专注' }));
    expect(screen.queryByTestId('focus-bar')).not.toBeInTheDocument();
    expect(localStorage.getItem('pd.focus')).toBeNull();
  });
});

describe('TodayPage v3: 今日反馈', () => {
  async function finishDay(): Promise<void> {
    const date = todayStr();
    for (const s of ['review', 'chunks', 'listening', 'decode', 'output'] as const) await markStepDone(date, s, 30_000);
  }

  beforeEach(async () => {
    await setGoal(goal());
    await getOrCreateSession(todayStr());
  });

  it('no adjustment: bars against the band, 保持当前难度, a tip, and the three ways on', async () => {
    // a change today blocks further changes (2-day rule): the controller leaves the ladder alone
    const today = todayStr();
    await db.profile.update('profile', {
      adaptive: { ladder: { listen: 1, speak: 1, newPerDay: 5 }, lastChange: { listen: today, speak: today, newPerDay: today }, history: [] },
    });
    for (let i = 0; i < 10; i++) {
      await logMeasurement({ cardId: 'dialogue:dl001', skill: 'listen', correct: i < 8, mode: 'dialogue', durationMs: 5000, latencyMs: 5000 });
      await logMeasurement({ cardId: 'chunk:c001', skill: 'speak', correct: i < 4, mode: 'recall', durationMs: 2000, latencyMs: 2000 });
    }
    await finishDay();
    renderToday();
    expect(await screen.findByRole('heading', { name: '今天的练习完成了！' })).toBeInTheDocument();
    expect(await screen.findByTestId('day-feedback')).toBeInTheDocument();
    expect(screen.getByTestId('acc-listen')).toHaveTextContent('80%');
    expect(screen.getByTestId('band-listen')).toHaveTextContent('刚好');
    expect(screen.getByTestId('acc-speak')).toHaveTextContent('40%');
    expect(screen.getByTestId('band-speak')).toHaveTextContent('太难');
    expect(screen.getByTestId('no-adjustments')).toHaveTextContent('保持当前难度');
    expect(screen.getByTestId('day-tip')).toHaveTextContent('口语正确率 40%');
    // the chunks answered wrong today are listed, linked to their pages
    expect(within(screen.getByLabelText('今天的错题')).getByRole('link', { name: "How's it going?" })).toBeDefined();
    expect(screen.getByRole('link', { name: '查看计划' })).toHaveAttribute('href', '/plan');
    expect(screen.getByRole('link', { name: '去语块库' })).toHaveAttribute('href', '/library');
    expect(screen.getByRole('link', { name: '再做一组解码练习' })).toHaveAttribute('href', '/decode/practice');
  });

  it('runs the controller once on completion and lists the adjustments with their reasons', async () => {
    for (let i = 0; i < 16; i++) {
      await logMeasurement({ cardId: 'dialogue:dl001', skill: 'listen', correct: true, mode: 'dialogue', durationMs: 5000, latencyMs: 5000 });
    }
    await finishDay();
    renderToday();
    const list = await screen.findByTestId('adjustments');
    expect(list).toHaveTextContent('听力');
    const profile = await db.profile.get('profile');
    expect(profile?.adaptive?.ladder.listen).toBe(2);
    expect(profile?.adaptive?.history.some((c) => c.date === todayStr() && c.dimension === 'listen')).toBe(true);
    expect(screen.getByTestId('band-listen')).toHaveTextContent('太容易');
    expect(screen.getByTestId('day-tip')).toHaveTextContent('明天会自动加快语速');
  });

  it('mistakes link to the chunk, sound and dialogue pages', async () => {
    await logMeasurement({ cardId: 'chunk:c001', skill: 'speak', correct: false, mode: 'recall', durationMs: 100 });
    await logMeasurement({ cardId: 'sound:s01', skill: 'listen', correct: false, mode: 'sound', durationMs: 100 });
    await logMeasurement({ cardId: 'dialogue:dl001', skill: 'listen', correct: false, mode: 'dialogue', durationMs: 100 });
    await finishDay();
    renderToday();
    const card = await screen.findByLabelText('今天的错题');
    const hrefs = within(card)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/library/chunk/c001', '/listening/sound/s01', '/listening/dialogue/dl001']));
  });
});

describe('TodayPage without a goal (v2 flow)', () => {
  it('shows the onboarding card and the four-step flow', async () => {
    renderToday();
    expect(await screen.findByRole('heading', { name: '第 1 课' })).toBeInTheDocument();
    const card = screen.getByTestId('goal-card');
    expect(card).toHaveTextContent('设定目标并做 10 分钟诊断，开启自适应训练');
    expect(within(card).getByRole('link', { name: '设定目标' })).toHaveAttribute('href', '/onboarding');
    expect(within(screen.getByRole('list', { name: '今日四步' })).getAllByRole('button')).toHaveLength(4);
    expect(screen.queryByTestId('today-goal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('step-clock')).not.toBeInTheDocument();
    expect(await screen.findByText('今天没有到期的复习 🎉')).toBeInTheDocument();
  });

  it('completion has no 今日反馈 and does not run the controller', async () => {
    const date = todayStr();
    for (const s of ['review', 'chunks', 'decode', 'output'] as const) await markStepDone(date, s, 1000);
    renderToday();
    expect(await screen.findByRole('heading', { name: '今天的练习完成了！' })).toBeInTheDocument();
    expect(screen.queryByTestId('day-feedback')).not.toBeInTheDocument();
    expect((await db.profile.get('profile'))?.adaptive).toBeUndefined();
  });
});
