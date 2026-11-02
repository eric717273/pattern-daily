import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const voices = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('../../lib/speech', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/speech')>();
  return {
    ...actual,
    listVoices: () => Promise.resolve(actual.rankVoices(voices.list as SpeechSynthesisVoice[])),
    speak: () => Promise.resolve(),
  };
});

import { SpeechSection } from './SpeechSection';

const v = (name: string, lang: string, uri = name) => ({ name, lang, voiceURI: uri, localService: true, default: false });

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});

describe('SpeechSection voices', () => {
  it('only standard voices: shows the install card with the Mac and iPhone steps', async () => {
    voices.list = [v('Samantha', 'en-US'), v('Daniel', 'en-GB'), v('Fred', 'en-US')];
    render(<SpeechSection />);
    const card = await screen.findByTestId('install-voices');
    expect(card).toHaveTextContent('安装免费的高质量语音（约 1 分钟）');
    expect(card).toHaveTextContent('系统设置 → 辅助功能 → 朗读内容');
    expect(card).toHaveTextContent('Ava（高级）');
    expect(card).toHaveTextContent('设置 → 辅助功能 → 朗读内容 → 声音 → 英语');
    expect(card).toHaveTextContent('重新打开');
    expect(screen.getByRole('group', { name: '普通' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '高质量' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Fred/)).not.toBeInTheDocument();
  });

  it('a premium / enhanced voice installed: no card, voices grouped 高质量 / 普通 with a 试听 button each', async () => {
    voices.list = [v('Samantha', 'en-US'), v('Ava (Premium)', 'en-US'), v('Evan (Enhanced)', 'en-US')];
    render(<SpeechSection />);
    await waitFor(() => expect(screen.getByRole('group', { name: '高质量' })).toBeInTheDocument());
    expect(screen.queryByTestId('install-voices')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '试听 Ava (Premium)（en-US）' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '试听 Samantha（en-US）' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /自动选择（推荐，当前：Ava \(Premium\)）/ })).toBeChecked();
  });

  it('offers the microphone test when recognition exists', async () => {
    voices.list = [];
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = class {};
    render(<SpeechSection />);
    expect(await screen.findByRole('button', { name: '开始测试' })).toBeInTheDocument();
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  });
});
