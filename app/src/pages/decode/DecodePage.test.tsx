import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../lib/db';
import { ensureCards } from '../../lib/repo';
import { DecodePage } from './DecodePage';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

function renderPage() {
  return render(
    <MemoryRouter>
      <DecodePage />
    </MemoryRouter>,
  );
}

describe('DecodePage', () => {
  it('explains the purpose and links to the three practice entries', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: '解码' })).toBeInTheDocument();
    expect(screen.getByText(/看懂结构，不追求脱口而出/)).toBeInTheDocument();
    const entries = screen.getByRole('list', { name: '解码练习入口' });
    expect(within(entries).getByRole('link', { name: /变形练习/ })).toHaveAttribute('href', '/decode/practice?mode=transform');
    expect(within(entries).getByRole('link', { name: /成分标注/ })).toHaveAttribute('href', '/decode/practice?mode=label');
    expect(within(entries).getByRole('link', { name: /AI 解构任意句子/ })).toHaveAttribute('href', '/decode/analyze');
  });

  it('lists the 13 skeletons linking to /decode/dozen/:id, with learned status from the cards', async () => {
    await ensureCards('dozen', ['d02']);
    renderPage();
    const links = screen.getAllByRole('link', { name: /^第 \d+ 句/ });
    expect(links).toHaveLength(13);
    expect(links[0]).toHaveAttribute('href', '/decode/dozen/d01');
    expect(links[12]).toHaveAttribute('href', '/decode/dozen/d13');
    expect(screen.getAllByText(/彩蛋句/).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByText('已学 1 个', { exact: false })).toBeInTheDocument());
    expect(within(links[1]).getByText('已学')).toBeInTheDocument();
    expect(within(links[0]).getByText('未学')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /母框/ })).not.toBeInTheDocument();
  });
});
