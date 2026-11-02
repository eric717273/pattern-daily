import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getChunk } from '../../content';
import type { PlacementPlan } from '../../lib/assessment';

vi.mock('../../lib/speech', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/speech')>();
  return { ...actual, speak: () => Promise.resolve(), isSpeaking: () => false };
});

import { PlacementRunner } from '../assessment/Runners';
import { MicCheck } from '../drills/MicCheck';
import { loadMicStatus } from '../../lib/micCheck';
import { FakeRecognition, installRecognition, liveRecognition } from './fakeRecognition';
import { RecallDrill } from './RecallDrill';

const chunk = getChunk('c003');
if (!chunk) throw new Error('c003');
const item = { kind: 'chunk' as const, chunk };

const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const start = () => fireEvent.click(screen.getByRole('button', { name: /开始说/ }));

function install(Ctor: new () => unknown) {
  FakeRecognition.instances = [];
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition = Ctor;
}

/** start() works but neither onstart nor onaudiostart ever fire (Safari with Dictation off, stuck permission, ...). */
class NeverStarts extends FakeRecognition {
  start() {
    // silence
  }
}
/** start() throws InvalidStateError, abort() throws too. */
class ThrowingStart extends FakeRecognition {
  start(): void {
    throw new DOMException('already started', 'InvalidStateError');
  }
  abort(): void {
    throw new DOMException('nope', 'InvalidStateError');
  }
}
/** Starts, then ends immediately every time: an onend storm. */
class EndStorm extends FakeRecognition {
  start() {
    this.onstart?.();
    setTimeout(() => this.onend?.(), 0);
  }
}
/** Only fires onaudiostart (no onstart). */
class AudioStartOnly extends FakeRecognition {
  onaudiostart: (() => void) | null = null;
  start() {
    this.onaudiostart?.();
  }
}

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  installRecognition(true);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  installRecognition(false);
});

describe('RecallDrill when the microphone misbehaves', () => {
  it('no onstart ever: after 4 s it falls back to self-check with a clear message, and the drill still works', async () => {
    install(NeverStarts);
    const onVoiceFailed = vi.fn();
    const onDone = vi.fn();
    render(<RecallDrill item={item} onDone={onDone} onVoiceFailed={onVoiceFailed} />);
    start();
    await tick(3500);
    expect(screen.getByText(/正在启动麦克风/)).toBeInTheDocument();
    await tick(700);
    expect(onVoiceFailed).toHaveBeenCalledWith(expect.objectContaining({ code: 'start-timeout' }));
    expect(screen.getByRole('alert')).toHaveTextContent('麦克风没有启动');
    expect(screen.getByRole('alert')).toHaveTextContent('听写');
    expect(liveRecognition().aborted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: '说对了' }));
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ correct: true, verified: false }));
  });

  it('onaudiostart alone counts as started (no watchdog fallback)', async () => {
    install(AudioStartOnly);
    render(<RecallDrill item={item} onDone={() => undefined} />);
    start();
    await tick(5000);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/正在听/)).toBeInTheDocument();
  });

  it('start() and abort() throwing InvalidStateError: falls back to self-check and every button works', async () => {
    install(ThrowingStart);
    render(<RecallDrill item={item} onDone={() => undefined} />);
    expect(() => start()).not.toThrow();
    await tick(10);
    expect(screen.getByRole('alert')).toHaveTextContent('无法启动语音识别');
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    expect(screen.getByTestId('recall-en')).toBeInTheDocument();
  });

  it('an onend storm is capped and ends in self-check without spinning', async () => {
    install(EndStorm);
    render(<RecallDrill item={item} onDone={() => undefined} />);
    start();
    await tick(30_000);
    expect(FakeRecognition.instances.length).toBeLessThan(12);
    expect(screen.getByRole('alert')).toHaveTextContent('无法启动语音识别');
    expect(screen.getByRole('button', { name: '显示答案' })).toBeInTheDocument();
  });

  it('跳过 / 显示答案 works while the microphone is still "starting", even if abort() throws', async () => {
    class SlowAndThrowing extends NeverStarts {
      abort(): void {
        throw new DOMException('nope', 'InvalidStateError');
      }
    }
    install(SlowAndThrowing);
    render(<RecallDrill item={item} onDone={() => undefined} />);
    start();
    await tick(1000);
    expect(screen.getByText(/正在启动麦克风/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /跳过/ }));
    expect(screen.getByTestId('recall-result')).toHaveTextContent('已跳过');
    expect(screen.getByTestId('recall-en')).toBeInTheDocument();
  });

  it('麦克风没反应？改用自评 works during "starting"', async () => {
    install(NeverStarts);
    render(<RecallDrill item={item} onDone={() => undefined} />);
    start();
    await tick(500);
    fireEvent.click(screen.getByRole('button', { name: /改用自评/ }));
    expect(screen.getByRole('button', { name: '显示答案' })).toBeInTheDocument();
  });
});

describe('PlacementRunner after a microphone failure', () => {
  const plan: PlacementPlan = {
    listen: { startLevel: 1, items: [] },
    dialogues: [],
    speak: {
      limitMs: 6000,
      items: [
        { chunkId: 'c003', freq: 1 },
        { chunkId: 'c004', freq: 1 },
      ],
    },
  };

  it('the failing item falls back to self-check, progress is kept, and later items skip the microphone', async () => {
    install(NeverStarts);
    const onDone = vi.fn();
    render(<PlacementRunner plan={plan} onDone={onDone} />);
    start();
    await tick(4200);
    expect(screen.getByRole('alert')).toHaveTextContent('麦克风没有启动');
    expect(screen.getByText('第 1 / 2 题')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: '说对了' }));
    // item 2: no microphone, no 4 s wait
    expect(screen.getByText('第 2 / 2 题')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /开始说/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: '没说出来' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0].speak).toHaveLength(2);
    expect(onDone.mock.calls[0][0].speak.every((s: { verified: boolean }) => !s.verified)).toBe(true);
  });

  it('voiceAllowed=false (microphone test not passed) never touches the recognizer', () => {
    render(<PlacementRunner plan={plan} voiceAllowed={false} onDone={() => undefined} />);
    expect(screen.queryByRole('button', { name: /开始说/ })).not.toBeInTheDocument();
    expect(FakeRecognition.instances).toHaveLength(0);
    expect(screen.getByRole('button', { name: '显示答案' })).toBeInTheDocument();
  });
});

describe('MicCheck', () => {
  it('ok: hearing speech stores pd.micOk with a timestamp', async () => {
    const onResult = vi.fn();
    render(<MicCheck onResult={onResult} />);
    fireEvent.click(screen.getByRole('button', { name: '开始测试' }));
    expect(screen.getByText(/正在听，请说 hello/)).toBeInTheDocument();
    liveRecognition().say('hello');
    expect(screen.getByRole('status')).toHaveTextContent('麦克风正常');
    expect(onResult).toHaveBeenCalledWith({ ok: true });
    expect(loadMicStatus()).toMatchObject({ ok: true });
    expect(JSON.parse(localStorage.getItem('pd.micOk') ?? '{}').at).toEqual(expect.any(Number));
    expect(liveRecognition().aborted).toBe(true);
  });

  it('fail: no start within 4 s shows the reason and how to enable, stores the failure, and 重试 works', async () => {
    install(NeverStarts);
    const onResult = vi.fn();
    render(<MicCheck onResult={onResult} />);
    fireEvent.click(screen.getByRole('button', { name: '开始测试' }));
    await tick(4200);
    expect(screen.getByRole('alert')).toHaveTextContent('麦克风没有启动');
    expect(screen.getByRole('alert')).toHaveTextContent('语音验证暂时关闭');
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
    expect(loadMicStatus()).toMatchObject({ ok: false });
    expect(localStorage.getItem('pd.micOk')).toBeNull();

    install(FakeRecognition);
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    liveRecognition().say('hello there');
    expect(screen.getByRole('status')).toHaveTextContent('麦克风正常');
    expect(loadMicStatus()).toMatchObject({ ok: true });
  });

  it('fail: silence for 6 s after a successful start', async () => {
    render(<MicCheck />);
    fireEvent.click(screen.getByRole('button', { name: '开始测试' }));
    await tick(5800);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await tick(400);
    expect(screen.getByRole('alert')).toHaveTextContent('6 秒内没有听到声音');
  });

  it('fail: service-not-allowed points at Dictation; 取消 and 跳过 never throw', async () => {
    const onSkip = vi.fn();
    render(<MicCheck onSkip={onSkip} />);
    fireEvent.click(screen.getByRole('button', { name: '开始测试' }));
    liveRecognition().fail('service-not-allowed');
    expect(screen.getByRole('alert')).toHaveTextContent('听写');
    fireEvent.click(screen.getByRole('button', { name: '跳过，用自评模式' }));
    expect(onSkip).toHaveBeenCalled();
  });

  it('fail: start() throwing is reported, not thrown', async () => {
    install(ThrowingStart);
    render(<MicCheck />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: '开始测试' }))).not.toThrow();
    expect(screen.getByRole('alert')).toHaveTextContent('无法启动语音识别');
  });
});
