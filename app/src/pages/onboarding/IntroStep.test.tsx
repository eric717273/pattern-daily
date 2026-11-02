import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveMicFailure, saveMicOk } from '../../lib/micCheck';

const voices = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('../../lib/speech', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/speech')>();
  return { ...actual, listVoices: () => Promise.resolve(actual.rankVoices(voices.list as SpeechSynthesisVoice[])) };
});

import { installRecognition } from '../../components/chunk/fakeRecognition';
import { IntroStep } from './IntroStep';

const v = (name: string, lang: string) => ({ name, lang, voiceURI: name, localService: true, default: false });
const renderIntro = (onStart = vi.fn()) => {
  render(
    <MemoryRouter>
      <IntroStep onStart={onStart} onSkip={() => undefined} onBack={() => undefined} />
    </MemoryRouter>,
  );
  return onStart;
};

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  voices.list = [];
  installRecognition(true);
});

describe('IntroStep microphone preflight and voice tip', () => {
  it('starts with voice verification only after a passed microphone test', () => {
    const onStart = renderIntro();
    fireEvent.click(screen.getByRole('button', { name: '开始诊断' }));
    expect(onStart).toHaveBeenLastCalledWith(false);
  });

  it('a remembered pass allows voice; 跳过，用自评模式 turns it off for this run', () => {
    saveMicOk();
    const onStart = renderIntro();
    fireEvent.click(screen.getByRole('button', { name: '跳过，用自评模式' }));
    expect(screen.getByText(/已选择自评模式/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '开始诊断' }));
    expect(onStart).toHaveBeenLastCalledWith(false);
  });

  it('a remembered pass starts with voice', () => {
    saveMicOk();
    const onStart = renderIntro();
    fireEvent.click(screen.getByRole('button', { name: '开始诊断' }));
    expect(onStart).toHaveBeenLastCalledWith(true);
  });

  it('a remembered failure keeps voice off', () => {
    saveMicFailure('x');
    const onStart = renderIntro();
    fireEvent.click(screen.getByRole('button', { name: '开始诊断' }));
    expect(onStart).toHaveBeenLastCalledWith(false);
  });

  it('shows the voice tip only when just standard voices are installed', async () => {
    voices.list = [v('Samantha', 'en-US')];
    renderIntro();
    expect(await screen.findByTestId('voice-tip')).toHaveTextContent('安装免费的高质量语音');
  });

  it('no tip when a premium voice exists', async () => {
    voices.list = [v('Ava (Premium)', 'en-US')];
    renderIntro();
    await new Promise((r) => setTimeout(r, 30));
    await waitFor(() => expect(screen.queryByTestId('voice-tip')).not.toBeInTheDocument());
  });
});
