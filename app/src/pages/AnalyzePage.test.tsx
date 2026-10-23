import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deconstruction } from '../lib/ai';

const ai = vi.hoisted(() => ({ configured: false, result: null as unknown, error: null as unknown }));
vi.mock('../lib/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/ai')>();
  return {
    ...actual,
    aiConfigured: () => ai.configured,
    deconstruct: vi.fn(() => (ai.error ? Promise.reject(ai.error) : Promise.resolve(ai.result))),
  };
});

import { AiError, deconstruct } from '../lib/ai';
import { db } from '../lib/db';
import { saveSettings } from '../lib/settings';
import { AnalyzePage } from './AnalyzePage';

const RESULT: Deconstruction = {
  en: 'I must give it to him.',
  zh: '我必须把它给他。',
  skeleton: '[主语] must [动作] [宾语] to [宾语]',
  alignment: [
    { en: 'I', zh: '我', role: 'subject' },
    { en: 'must', zh: '必须', role: 'aux', note: '情态动词后接原形' },
    { en: 'give', zh: '给', role: 'verb' },
    { en: 'it', zh: '它', role: 'object' },
    { en: 'to him', zh: '给他', role: 'indirect-object' },
  ],
  grammar: ['modal-must', 'pronoun-order'],
  nearestDozenId: 'd09',
  explanationZh: '情态动词 must 后面接动词原形。',
  frame: {
    id: 'u-test-1',
    title: '必须做某事',
    pattern: '{subject} {aux} {verb}.',
    patternZh: '{subject}{aux}{verb}。',
    slots: [
      { key: 'subject', labelZh: '主语', options: [{ en: 'I', zh: '我' }, { en: 'We', zh: '我们' }, { en: 'They', zh: '他们' }] },
      { key: 'aux', labelZh: '情态', options: [{ en: 'must', zh: '必须' }, { en: 'can', zh: '可以' }, { en: 'will', zh: '将' }] },
      { key: 'verb', labelZh: '动词', options: [{ en: 'go', zh: '去' }, { en: 'stay', zh: '留下' }, { en: 'wait', zh: '等' }] },
    ],
    grammar: ['modal-must'],
    scene: 'daily',
    level: 1,
    examples: [{ en: 'I must go.', zh: '我必须去。' }, { en: 'We can stay.', zh: '我们可以留下。' }],
    source: 'ai',
  },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <AnalyzePage />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  ai.configured = false;
  ai.error = null;
  ai.result = RESULT;
  vi.mocked(deconstruct).mockClear();
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('AnalyzePage', () => {
  it('explains itself and links to settings when AI is not configured', () => {
    renderPage();
    expect(screen.getByText('需要先设置 AI')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /设置 AI/ })).toHaveAttribute('href', '/me');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('deconstructs a sample sentence and renders skeleton pills, alignment and the nearest dozen link', async () => {
    ai.configured = true;
    saveSettings({ deepseekApiKey: 'sk-x' });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '示例 2' }));
    expect(screen.getByRole('textbox', { name: '输入一句英语' })).toHaveValue(
      'Could you send me the updated numbers before the meeting starts?',
    );
    fireEvent.click(screen.getByRole('button', { name: '解构' }));
    expect(await screen.findByTestId('decon-zh')).toHaveTextContent('我必须把它给他。');
    expect(deconstruct).toHaveBeenCalledWith('Could you send me the updated numbers before the meeting starts?');
    expect(screen.getAllByTestId('skeleton-pill').map((p) => p.textContent)).toEqual(['主语', '动作', '宾语', '宾语']);
    expect(screen.getByRole('list', { name: '中英逐字对照' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /I must give it to him\./ }).getAttribute('href')).toBe('/dozen/d09');
    expect(screen.getByText('情态动词 must 后面接动词原形。')).toBeInTheDocument();
    expect(screen.getByText('必须做某事')).toBeInTheDocument();
  });

  it('saves the generated frame as the user\'s frame', async () => {
    ai.configured = true;
    renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: '输入一句英语' }), { target: { value: 'I must give it to him.' } });
    fireEvent.click(screen.getByRole('button', { name: '解构' }));
    fireEvent.click(await screen.findByRole('button', { name: '保存为我的母框' }));
    expect(await screen.findByText('已保存到「母框」')).toBeInTheDocument();
    const rows = await db.userFrames.toArray();
    expect(rows.map((r) => r.id)).toEqual(['u-test-1']);
  });

  it('keeps the last 10 analyses in localStorage and restores them', async () => {
    ai.configured = true;
    const { unmount } = renderPage();
    for (let i = 1; i <= 12; i++) {
      ai.result = { ...RESULT, en: `Sentence number ${i}.`, zh: `第 ${i} 句` };
      fireEvent.change(screen.getByRole('textbox', { name: '输入一句英语' }), { target: { value: `Sentence number ${i}.` } });
      fireEvent.click(screen.getByRole('button', { name: '解构' }));
      await waitFor(() => expect(deconstruct).toHaveBeenCalledTimes(i));
      await screen.findByText(`第 ${i} 句`, { selector: '[data-testid="decon-zh"]' });
    }
    const stored = JSON.parse(localStorage.getItem('pd.analyzeHistory') ?? '[]') as { result: { en: string } }[];
    expect(stored).toHaveLength(10);
    expect(stored[0].result.en).toBe('Sentence number 12.');
    unmount();

    renderPage();
    const history = screen.getByRole('region', { name: '最近解构' });
    expect(history.querySelectorAll('li')).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: /Sentence number 5\./ }));
    expect(screen.getByTestId('decon-zh')).toHaveTextContent('第 5 句');
  });

  it('shows the AI error message', async () => {
    ai.configured = true;
    ai.error = new AiError('auth', 'DeepSeek API Key 无效或没有权限，请在设置中检查。');
    renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: '输入一句英语' }), { target: { value: 'Hello there.' } });
    fireEvent.click(screen.getByRole('button', { name: '解构' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('API Key 无效');
    expect(screen.queryByTestId('deconstruction')).not.toBeInTheDocument();
  });
});
