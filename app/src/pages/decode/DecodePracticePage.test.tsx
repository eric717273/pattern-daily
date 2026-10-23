import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDozen } from '../../content';
import { db } from '../../lib/db';
import { ensureCards } from '../../lib/repo';
import { pickPracticeDozenId } from '../../lib/decode';
import { DOZEN } from '../../content';
import { DecodePracticePage } from './DecodePracticePage';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DecodePracticePage />
    </MemoryRouter>,
  );
}

const ids = DOZEN.map((d) => d.id);

describe('pickPracticeDozenId', () => {
  it('defaults to d01 and otherwise picks among learned skeletons', async () => {
    expect(pickPracticeDozenId(new Map(), ids)).toBe('d01');
    await ensureCards('dozen', ['d04', 'd07']);
    const cards = new Map((await db.cards.toArray()).map((c) => [c.id, c]));
    expect(pickPracticeDozenId(cards, ids, () => 0)).toBe('d04');
    expect(pickPracticeDozenId(cards, ids, () => 0.99)).toBe('d07');
  });
});

describe('DecodePracticePage', () => {
  it('runs a transform round for ?id=, grades the card and offers another round', async () => {
    renderAt('/decode/practice?mode=transform&id=d02');
    expect(await screen.findByLabelText(/本组骨架：第 2 句/)).toBeInTheDocument();
    for (let i = 0; i < 3; i++) {
      fireEvent.click(await screen.findByRole('button', { name: '不会，看答案' }));
      fireEvent.click(screen.getByRole('button', { name: i === 2 ? '完成' : '下一题' }));
    }
    expect(await screen.findByTestId('practice-summary')).toHaveTextContent('答对 0 / 3');
    await waitFor(async () => {
      const logs = await db.reviews.toArray();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ cardId: 'dozen:d02', mode: 'transform', grade: 0 });
    });
    fireEvent.click(screen.getByRole('button', { name: '再来一组' }));
    expect(await screen.findByTestId('transform-progress')).toHaveTextContent('第 1 / 3 题');
    expect(screen.queryByTestId('practice-summary')).not.toBeInTheDocument();
  });

  it('defaults to d01 when nothing is learned and to a learned skeleton otherwise', async () => {
    const first = renderAt('/decode/practice?mode=transform');
    expect(await screen.findByLabelText(/本组骨架：第 1 句/)).toBeInTheDocument();
    first.unmount();
    await ensureCards('dozen', ['d09']);
    renderAt('/decode/practice?mode=transform');
    expect(await screen.findByLabelText(/本组骨架：第 9 句/)).toBeInTheDocument();
  });

  it('label mode shows the label drill for the skeleton and can switch modes', async () => {
    renderAt('/decode/practice?mode=label&id=d05');
    expect(await screen.findByTestId('label-zh')).toHaveTextContent(getDozen('d05')!.zh);
    fireEvent.click(screen.getByRole('button', { name: '变形练习' }));
    expect(await screen.findByTestId('transform-progress')).toBeInTheDocument();
  });
});
