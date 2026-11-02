import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DIALOGUES, SOUNDS } from '../../content';
import { db } from '../../lib/db';
import { dialogueCorrect, filterDialogues, groupSoundsByLevel, levelForRate, snapRate } from '../../lib/listening';
import { logMeasurement } from '../../lib/repo';

vi.setConfig({ testTimeout: 20_000 });

vi.mock('../../lib/speech', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/speech')>();
  return {
    ...actual,
    speak: () => Promise.resolve(),
    speakSequence: () => ({ done: Promise.resolve(), stop: () => undefined }),
    pickVoicePair: () => Promise.resolve([null, null]),
    stopSpeaking: () => undefined,
  };
});

import { ListeningHubPage } from './ListeningHubPage';
import { ListeningDialoguePage, ListeningNumbersPage, ListeningSoundPage } from './ListeningPracticePages';

beforeEach(async () => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  await Promise.all(db.tables.map((t) => t.clear()));
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/listening" element={<ListeningHubPage />} />
        <Route path="/listening/dialogue/:id" element={<ListeningDialoguePage />} />
        <Route path="/listening/sound/:id" element={<ListeningSoundPage />} />
        <Route path="/listening/numbers" element={<ListeningNumbersPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('listening helpers', () => {
  it('filters dialogues by tier and scene', () => {
    expect(filterDialogues(DIALOGUES, { tier: 0, scene: 'all' })).toHaveLength(DIALOGUES.length);
    const t2 = filterDialogues(DIALOGUES, { tier: 2, scene: 'all' });
    expect(t2.length).toBeGreaterThan(0);
    expect(t2.every((d) => d.tier === 2)).toBe(true);
    const work3 = filterDialogues(DIALOGUES, { tier: 3, scene: 'work' });
    expect(work3.every((d) => d.tier === 3 && d.scene === 'work')).toBe(true);
  });

  it('groups sounds by level, snaps rates and derives a level only at ladder rates', () => {
    expect(groupSoundsByLevel(SOUNDS).reduce((n, g) => n + g.sounds.length, 0)).toBe(SOUNDS.length);
    expect(snapRate(1.04)).toBe(1.0);
    expect(snapRate(NaN)).toBe(1.0);
    expect(levelForRate(0.85, undefined)).toBe(0);
    expect(levelForRate(1.0, 8)).toBe(6);
    expect(levelForRate(0.95, 3)).toBe(3); // 0.95 is both L1 and L3: the ladder level wins
    expect(levelForRate(1.3, undefined)).toBeUndefined();
  });

  it('dialogue is correct only with the right gist and at least half of the blanks', () => {
    const b = (correct: boolean) => ({ text: 'x', heard: 'x', correct });
    expect(dialogueCorrect({ gistCorrect: true, blanks: [b(true), b(false), b(false)], replays: 0, ms: 1 })).toBe(false);
    expect(dialogueCorrect({ gistCorrect: true, blanks: [b(true), b(false)], replays: 0, ms: 1 })).toBe(true);
    expect(dialogueCorrect({ gistCorrect: false, blanks: [b(true), b(true)], replays: 0, ms: 1 })).toBe(false);
  });
});

describe('ListeningHubPage', () => {
  it('lists all dialogues, filters by tier and scene, and shows heard status from the review logs', async () => {
    renderAt('/listening');
    expect(await screen.findByTestId('dialogue-count')).toHaveTextContent(`共 ${DIALOGUES.length} 段`);
    const tier = (label: string) => fireEvent.click(within(screen.getByRole('group', { name: '难度' })).getByRole('button', { name: label }));
    tier('入门');
    const n1 = DIALOGUES.filter((d) => d.tier === 1).length;
    expect(screen.getByTestId('dialogue-count')).toHaveTextContent(`共 ${n1} 段`);
    const first = DIALOGUES.find((d) => d.tier === 1);
    if (!first) throw new Error('no tier 1');
    fireEvent.click(within(screen.getByRole('group', { name: '场景' })).getByRole('button', { name: '职场' }));
    const nWork = DIALOGUES.filter((d) => d.tier === 1 && d.scene === 'work').length;
    expect(screen.getByTestId('dialogue-count')).toHaveTextContent(`共 ${nWork} 段`);
    fireEvent.click(within(screen.getByRole('group', { name: '场景' })).getByRole('button', { name: '全部场景' }));

    // heard status
    const list = screen.getByRole('list', { name: '对话列表' });
    const link = within(list).getAllByRole('link')[0];
    expect(link).toHaveAttribute('href', expect.stringMatching(/^\/listening\/dialogue\/dl\d+\?rate=/));
    expect(within(link).getByText('没练过')).toBeInTheDocument();
    const id = link.getAttribute('href')?.match(/dialogue\/(dl\d+)/)?.[1] ?? '';
    await act(async () => {
      await logMeasurement({ cardId: `dialogue:${id}`, skill: 'listen', correct: true, mode: 'dialogue', durationMs: 1000 });
    });
    await waitFor(() => expect(within(within(screen.getByRole('list', { name: '对话列表' })).getAllByRole('link')[0]).getByText('练过')).toBeInTheDocument());
    expect(screen.getByLabelText('对话')).toHaveTextContent(`练过 1 / ${DIALOGUES.length}`);
  });

  it('shows sound patterns by level and the numbers entry; the rate selector feeds the links', async () => {
    renderAt('/listening');
    expect(await screen.findByRole('list', { name: '第 1 级音变' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /价格、时间/ })).toHaveAttribute('href', '/listening/numbers?rate=1');
    fireEvent.click(within(screen.getByRole('group', { name: '语速' })).getByRole('button', { name: '1.2×' }));
    expect(screen.getByRole('link', { name: /价格、时间/ })).toHaveAttribute('href', '/listening/numbers?rate=1.2');
  });
});

describe('practice pages log measurements', () => {
  it('numbers: gives up all and logs numbers:<kind> as listen/incorrect', async () => {
    renderAt('/listening/numbers?rate=0.95');
    fireEvent.click(await screen.findByRole('button', { name: '开始' }));
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '不会，看答案' }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: i < 5 ? '下一题' : '完成' }));
      });
    }
    expect(await screen.findByLabelText('练习结果')).toHaveTextContent('0 / 6 听对');
    await waitFor(async () => {
      const logs = await db.reviews.toArray();
      expect(logs).toHaveLength(6);
      expect(logs.every((l) => l.cardId.startsWith('numbers:') && l.skill === 'listen' && l.correct === false && l.mode === 'numbers')).toBe(true);
    });
  });

  it('sound: introduces the card and logs sound:<id>', async () => {
    renderAt('/listening/sound/s01?rate=1');
    fireEvent.click(await screen.findByRole('button', { name: '开始听写' }));
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '不会，看答案' }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: i < 2 ? '下一句' : '完成' }));
      });
    }
    await waitFor(async () => {
      expect(await db.cards.get('sound:s01')).toBeTruthy();
      const logs = await db.reviews.where('cardId').equals('sound:s01').toArray();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ skill: 'listen', correct: false, mode: 'sound' });
    });
  });

  it('dialogue: logs dialogue:<id>; an unknown id shows a not-found state', async () => {
    renderAt('/listening/dialogue/dl001?rate=0.95');
    fireEvent.click(await screen.findByRole('button', { name: '开始' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '播放对话' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '洗车' }));
    });
    fireEvent.click(screen.getByRole('button', { name: '下一步：听写关键语块' }));
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '不会，看答案' }));
      });
      fireEvent.click(screen.getByRole('button', { name: i < 2 ? '下一个' : '下一步：对照原文' }));
    }
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '完成' }));
    });
    await waitFor(async () => {
      const logs = await db.reviews.where('cardId').equals('dialogue:dl001').toArray();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ skill: 'listen', correct: false, mode: 'dialogue', level: 1 });
    });
  });

  it('shows not-found for an unknown dialogue', async () => {
    renderAt('/listening/dialogue/nope');
    expect(await screen.findByText('没有找到这个练习')).toBeInTheDocument();
  });
});
