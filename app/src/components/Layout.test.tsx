import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Layout } from './Layout';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<p>content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Layout tabs', () => {
  it('bottom nav is 今日 / 语块库 / 计划 / 解码 / 我的 and 计划 links to /plan', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: '底部导航' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['今日', '语块库', '计划', '解码', '我的']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/library', '/plan', '/decode', '/me']);
  });

  it('the sidebar has the same tabs and 计划 is current on /plan', () => {
    renderAt('/plan');
    const side = screen.getByRole('navigation', { name: '主导航' });
    expect(within(side).getAllByRole('link').map((a) => a.textContent)).toEqual(['今日', '语块库', '计划', '解码', '我的']);
    expect(within(side).getByRole('link', { name: '计划' })).toHaveAttribute('aria-current', 'page');
    expect(within(side).getByRole('link', { name: '今日' })).not.toHaveAttribute('aria-current');
  });
});
