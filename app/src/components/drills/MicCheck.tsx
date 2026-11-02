import { useCallback, useEffect, useRef, useState } from 'react';
import { loadMicStatus, saveMicFailure, saveMicOk, type MicStatus } from '../../lib/micCheck';
import { recognitionSupported, speechError, startListening, stopSpeaking, type ListenHandle } from '../../lib/speech';
import { MicIcon } from '../icons';
import { Button, cx } from '../ui';

export const MIC_CHECK_LIMIT_MS = 6000;

export interface MicCheckResult {
  ok: boolean;
  /** Chinese reason when the test failed. */
  reason?: string;
}

export interface MicCheckProps {
  /** Fired when a test ends (ok or failed). */
  onResult?: (r: MicCheckResult) => void;
  /** When set, a "跳过，用自评模式" button is offered before / after a failed test. */
  onSkip?: () => void;
  className?: string;
}

type State = { kind: 'idle' } | { kind: 'listening'; started: boolean } | { kind: 'ok'; heard: string } | { kind: 'failed'; reason: string };

const HOW_TO_ENABLE =
  'Mac：系统设置 → 键盘 → 听写，打开“听写”；iPhone：设置 → 通用 → 键盘 → 启用听写；并在 Safari 网站设置 → 麦克风 中选“允许”。';

const when = (at: number) => {
  const d = new Date(at);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
};

/**
 * 测试麦克风：说一句 hello（限时 6 秒），用和练习相同的语音识别模块检查这台设备能不能用语音验证。
 * 通过后在本机记下 localStorage 'pd.micOk'；失败则记下原因，语音验证暂时关闭，可以重试。
 * Must start from a tap (Safari asks for the microphone permission then).
 */
export function MicCheck({ onResult, onSkip, className }: MicCheckProps) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [saved, setSaved] = useState<MicStatus | null>(() => loadMicStatus());
  const handle = useRef<ListenHandle | null>(null);
  const limit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(true);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  });

  const teardown = useCallback(() => {
    if (limit.current) clearTimeout(limit.current);
    limit.current = null;
    const h = handle.current;
    handle.current = null;
    try {
      h?.abort();
    } catch {
      // never throw out of a handler
    }
  }, []);

  const finish = useCallback(
    (result: MicCheckResult, heard = '') => {
      if (done.current) return;
      done.current = true;
      // state first, then tear the microphone down
      if (result.ok) {
        saveMicOk();
        setState({ kind: 'ok', heard });
      } else {
        saveMicFailure(result.reason ?? '');
        setState({ kind: 'failed', reason: result.reason ?? '麦克风测试没有通过' });
      }
      setSaved(loadMicStatus());
      teardown();
      onResultRef.current?.(result);
    },
    [teardown],
  );

  useEffect(
    () => () => {
      done.current = true;
      teardown();
    },
    [teardown],
  );

  const begin = () => {
    teardown();
    if (!recognitionSupported()) {
      done.current = false;
      finish({ ok: false, reason: speechError('unsupported').message + '，将使用自评模式' });
      return;
    }
    done.current = false;
    setState({ kind: 'listening', started: false });
    try {
      stopSpeaking();
    } catch {
      // ignore
    }
    limit.current = setTimeout(() => {
      limit.current = null;
      finish({ ok: false, reason: `${MIC_CHECK_LIMIT_MS / 1000} 秒内没有听到声音。请靠近麦克风再试一次，并检查：${HOW_TO_ENABLE}` });
    }, MIC_CHECK_LIMIT_MS);
    handle.current = startListening({
      startTimeoutMs: 4000,
      onStart: () => setState((s) => (s.kind === 'listening' ? { kind: 'listening', started: true } : s)),
      onResult: (text) => {
        const heard = text.trim();
        if (heard) finish({ ok: true }, heard);
      },
      onError: (err) => {
        if (!err.fatal) return;
        finish({ ok: false, reason: err.code === 'start-timeout' ? err.message : `${err.message}。检查：${HOW_TO_ENABLE}` });
      },
      onEnd: () => finish({ ok: false, reason: '语音识别提前结束了，请重试。' }),
    });
  };

  const cancel = () => {
    // escape hatch: state first, never throws
    done.current = true;
    setState({ kind: 'idle' });
    teardown();
  };

  return (
    <div className={cx('flex flex-col gap-2.5', className)} data-testid="mic-check">
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-white">测试麦克风</p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          点“开始测试”，在 {MIC_CHECK_LIMIT_MS / 1000} 秒内对着设备说一句 hello。首次使用请在弹窗里选“允许”。
        </p>
      </div>

      {state.kind === 'idle' && (
        <>
          {saved?.ok === true && (
            <p className="text-xs text-emerald-700 dark:text-emerald-300">上次测试（{when(saved.at)}）通过，可以使用语音验证。</p>
          )}
          {saved?.ok === false && (
            <p className="text-xs text-rose-700 dark:text-rose-300">上次测试没有通过，语音验证暂时关闭。可以重试。</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="md" onClick={begin}>
              <MicIcon size={18} />
              {saved ? '重新测试' : '开始测试'}
            </Button>
            {onSkip && (
              <Button variant="ghost" size="md" onClick={onSkip}>
                跳过，用自评模式
              </Button>
            )}
          </div>
        </>
      )}

      {state.kind === 'listening' && (
        <div className="flex flex-col gap-2">
          <p role="status" className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <span
              className={cx(
                'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-white',
                state.started ? 'animate-pulse bg-rose-600' : 'bg-slate-400 dark:bg-slate-600',
              )}
            >
              <MicIcon size={16} />
            </span>
            {state.started ? '正在听，请说 hello' : '正在启动麦克风…（首次使用请在弹窗里选“允许”）'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="md" onClick={cancel}>
              取消
            </Button>
            {onSkip && (
              <Button variant="ghost" size="md" onClick={onSkip}>
                跳过，用自评模式
              </Button>
            )}
          </div>
        </div>
      )}

      {state.kind === 'ok' && (
        <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          ✓ 麦克风正常（听到：<span className="font-en">{state.heard}</span>），可以使用语音验证。
        </p>
      )}

      {state.kind === 'failed' && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm leading-relaxed text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
            ✗ 麦克风测试没有通过：{state.reason}
            <span className="mt-1 block text-xs">语音验证暂时关闭，口语题会改为自评。</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="md" onClick={begin}>
              重试
            </Button>
            {onSkip && (
              <Button variant="ghost" size="md" onClick={onSkip}>
                跳过，用自评模式
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
