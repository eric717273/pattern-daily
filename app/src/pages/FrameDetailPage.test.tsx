import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SEED_FRAMES } from '../content';
import { FREQ_LABELS, FUNCTION_CATEGORY_LABELS, GRAMMAR_LABELS } from '../lib/labels';
import { AppRoutes } from '../routes';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('FrameDetailPage (chunk track)', () => {
  const found = SEED_FRAMES.find((f) => f.soundZh && f.grammar.length > 0 && f.category && f.freq);
  if (!found || !found.category || !found.freq) throw new Error('no suitable seed frame');
  const frame = found;
  const category = found.category;
  const freq = found.freq;

  it('shows category, frequency and the listening tip; grammar lives in a collapsed 看结构 section', async () => {
    renderAt(`/frames/${frame.id}`);
    expect(await screen.findByRole('heading', { name: frame.title }, { timeout: 10_000 })).toBeInTheDocument();
    const header = screen.getByRole('banner');
    expect(within(header).getByText(FUNCTION_CATEGORY_LABELS[category])).toBeInTheDocument();
    expect(within(header).getByText(FREQ_LABELS[freq])).toBeInTheDocument();
    expect(screen.getByTestId('sound-tip')).toHaveTextContent(frame.soundZh ?? '');

    // no grammar tag outside the collapsed section
    const details = document.querySelector('details') as HTMLDetailsElement;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(within(details).getByText('看结构')).toBeInTheDocument();
    for (const g of frame.grammar) {
      const hits = screen.getAllByText(GRAMMAR_LABELS[g]);
      expect(hits.every((el) => details.contains(el))).toBe(true);
    }
  });

  it('goes back to the library', async () => {
    renderAt(`/frames/${frame.id}`);
    await screen.findByRole('heading', { name: frame.title }, { timeout: 10_000 });
    expect(within(screen.getByRole('banner')).getByRole('link', { name: /语块库/ })).toHaveAttribute('href', '/library');
  });

  it('links related skeleton sentences to the decode track', async () => {
    renderAt(`/frames/${frame.id}`);
    await screen.findByRole('heading', { name: frame.title }, { timeout: 10_000 });
    const links = Array.from(document.querySelectorAll('details a')).map((a) => a.getAttribute('href'));
    expect(links.every((h) => h?.startsWith('/decode/dozen/'))).toBe(true);
  });

  it('unknown frame points back to the library', async () => {
    renderAt('/frames/nope');
    expect(await screen.findByRole('link', { name: '返回语块库' }, { timeout: 10_000 })).toHaveAttribute('href', '/library');
  });
});
