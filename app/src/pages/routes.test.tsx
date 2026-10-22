import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../routes';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('routes smoke', () => {
  it('/dozen lists the 13 sentences', async () => {
    renderAt('/dozen');
    expect(await screen.findByText('The apple is red.')).toBeInTheDocument();
    expect(screen.getAllByText(/彩蛋句/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /^第 \d+ 句/ })).toHaveLength(13);
  });

  it('/dozen/d05 shows the sentence, alignment and traps', async () => {
    renderAt('/dozen/d05');
    expect(await screen.findByRole('heading', { name: '第 5 句' })).toBeInTheDocument();
    expect(screen.getAllByText('He gives it to John.').length).toBeGreaterThan(0);
    expect(screen.getByText('中英逐字对照')).toBeInTheDocument();
    expect(screen.getByText('文法陷阱')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '加入复习' })).toBeInTheDocument();
  });

  it('/frames lists frames with filters', async () => {
    renderAt('/frames');
    expect(await screen.findByText(/共 \d+ 个母框/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /AI 生成/ })).toBeInTheDocument();
    expect(screen.getByLabelText('搜索母框')).toBeInTheDocument();
  });

  it('/frames/f001 shows the interactive table and practice links', async () => {
    renderAt('/frames/f001');
    expect(await screen.findByRole('group', { name: '替换表' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '单槽快替' })).toHaveAttribute('href', '/frames/f001/drill/single');
    expect(screen.getByRole('link', { name: '中译英' })).toHaveAttribute('href', '/frames/f001/drill/translate');
  });
});
