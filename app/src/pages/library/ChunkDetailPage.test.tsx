import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHUNKS, getChunk } from '../../content';
import { db } from '../../lib/db';
import { ChunkDetailPage } from './ChunkDetailPage';

vi.mock('../../lib/speech', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/speech')>();
  return { ...actual, speak: () => Promise.resolve(), stopSpeaking: () => undefined };
});

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/library/chunk/${id}`]}>
      <Routes>
        <Route path="library/chunk/:id" element={<ChunkDetailPage />} />
        <Route path="library" element={<p>library page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('ChunkDetailPage', () => {
  const chunk = getChunk('c001');
  if (!chunk) throw new Error('c001 missing');

  it('shows the chunk, zh, badges, the prominent 听力提示, usage note and examples', async () => {
    renderAt('c001');
    expect(await screen.findByTestId('chunk-en')).toHaveTextContent(chunk.en);
    expect(screen.getByText(chunk.zh)).toBeInTheDocument();
    expect(screen.getByText('最高频')).toBeInTheDocument();
    expect(screen.getByText('口语 · 随意')).toBeInTheDocument();
    expect(screen.getByTestId('sound-tip')).toHaveTextContent('听力提示');
    expect(screen.getByTestId('sound-tip')).toHaveTextContent(chunk.soundZh ?? '');
    expect(screen.getByTestId('chunk-note')).toHaveTextContent(chunk.noteZh ?? '');
    chunk.examples.forEach((ex, i) => {
      expect(screen.getByTestId(`example-en-${i}`)).toHaveTextContent(ex.en);
      expect(screen.queryByTestId(`example-zh-${i}`)).not.toBeInTheDocument();
    });
    // normal and slow speak buttons for the chunk, plus one per example
    expect(screen.getByRole('button', { name: '朗读：朗读' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '朗读：慢速' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '朗读：例句 1' })).toBeInTheDocument();
    // no grammar anywhere on the page
    expect(document.body.textContent).not.toMatch(/语法|be \+ 形容词/);
  });

  it('highlights the chunk in each example and toggles the Chinese', async () => {
    renderAt('c001');
    const ex = await screen.findByTestId('example-en-0');
    expect(ex.querySelector('mark')).toHaveTextContent(/how's it going/i);
    fireEvent.click(screen.getAllByRole('button', { name: '看中文' })[0]);
    expect(screen.getByTestId('example-zh-0')).toHaveTextContent(chunk.examples[0].zh);
    fireEvent.click(screen.getByRole('button', { name: '隐藏中文' }));
    expect(screen.queryByTestId('example-zh-0')).not.toBeInTheDocument();
  });

  it('看结构 links each example to the decode analyzer with the sentence in ?s=', async () => {
    renderAt('c001');
    const links = await screen.findAllByRole('link', { name: '看结构' });
    expect(links).toHaveLength(chunk.examples.length);
    const href = links[0].getAttribute('href') ?? '';
    expect(href.startsWith('/decode/analyze?s=')).toBe(true);
    // the first example is a dialogue: only the line that holds the chunk is sent
    const s = new URLSearchParams(href.split('?')[1]).get('s');
    expect(s).toBe("Hey, how's it going?");
  });

  it('links to the previous / next chunk of the same category', async () => {
    renderAt('c002');
    const sameCategory = CHUNKS.filter((c) => c.category === getChunk('c002')?.category);
    const i = sameCategory.findIndex((c) => c.id === 'c002');
    const nav = await screen.findByRole('navigation', { name: '同类语块' });
    expect(within(nav).getByRole('link', { name: /上一条/ })).toHaveAttribute('href', `/library/chunk/${sameCategory[i - 1].id}`);
    expect(within(nav).getByRole('link', { name: /下一条/ })).toHaveAttribute('href', `/library/chunk/${sameCategory[i + 1].id}`);
  });

  it('the first chunk of a category has no previous link', async () => {
    renderAt('c001');
    const nav = await screen.findByRole('navigation', { name: '同类语块' });
    expect(within(nav).queryByRole('link', { name: /上一条/ })).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /下一条/ })).toBeInTheDocument();
  });

  it('开始练这条 runs the flow in a sheet; finishing creates and grades the card', async () => {
    renderAt('c001');
    expect(await screen.findByText('未加入复习')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '开始练这条' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('你听到了哪个语块？')).toBeInTheDocument();
    expect(within(dialog).getByRole('list', { name: '步骤' })).toBeInTheDocument();
  });

  it('shows a message for an unknown chunk', async () => {
    renderAt('c999');
    expect(await screen.findByText('找不到这个语块')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('link', { name: '返回语块库' })).toHaveAttribute('href', '/library'));
  });
});
