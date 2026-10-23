import { useEffect, useRef, useState } from 'react';
import type { FrameCombo, Slot, SlotOption } from '../../types';
import type { AnswerToken } from '../../lib/frameEngine';
import { playSuccessCue } from '../../lib/cue';
import { speak, stopSpeaking } from '../../lib/speech';
import { matchVoice, type VoiceMatch } from '../../lib/voiceMatch';
import { SpeakButton } from '../SpeakButton';
import { MicIcon } from '../icons';
import { Button, Card, cx } from '../ui';
import { AnswerDiff } from './AnswerDiff';
import { highlightText } from './highlight';
import type { VoiceListener } from './useVoice';

/** What happened on one prompt of a voice-verified round. */
export interface VoiceItem {
  /** Said correctly before the time ran out. */
  ok: boolean;
  /** Time until the correct answer was recognized (ok only). */
  ms?: number;
  reason?: 'timeout' | 'skipped';
  /** Best transcript of what the user said ('' = nothing heard). */
  heard: string;
  /** The target sentence. */
  en: string;
}

export interface VoiceSwapPromptProps {
  combo: FrameCombo;
  slot: Slot | undefined;
  option: SlotOption | undefined;
  limitMs: number;
  listener: VoiceListener;
  isLast: boolean;
  /** The English answer is now on screen: the parent may unmask the table. */
  onReveal: () => void;
  /** Fired once when the prompt is decided (said correctly / timed out / skipped). */
  onResolved: (item: VoiceItem) => void;
  onNext: () => void;
}

type Phase = 'listening' | 'success' | 'failed' | 'retry';

interface Best {
  similarity: number;
  heard: string;
  tokens: AnswerToken[];
}

/** After a correct answer: how long to show it before moving on (counted from the end of the TTS playback). */
const ADVANCE_MS = 1200;
/** Some browsers never report the end of speech synthesis. */
const TTS_WAIT_CAP_MS = 5000;

const seconds = (ms: number) => (ms / 1000).toFixed(1);

/** One voice-verified prompt: countdown + live transcript; correct speech stops the clock. */
export function VoiceSwapPrompt(props: VoiceSwapPromptProps) {
  const { combo, slot, option, limitMs, listener, isLast } = props;
  const [phase, setPhaseState] = useState<Phase>('listening');
  const phaseRef = useRef<Phase>('listening');
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState('');
  const [best, setBest] = useState<Best | null>(null);
  const bestRef = useRef<Best | null>(null);
  const [okMs, setOkMs] = useState(0);
  const [failReason, setFailReason] = useState<'timeout' | 'skipped'>('timeout');
  const [retried, setRetried] = useState(false);
  const [retryOk, setRetryOk] = useState(false);
  const t0 = useRef<number | null>(null);

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };

  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  const succeed = (m: VoiceMatch) => {
    if (phaseRef.current !== 'listening') return;
    const ms = Math.max(0, Date.now() - (t0.current ?? Date.now()));
    setOkMs(ms);
    setLive(m.heard);
    setPhase('success');
    playSuccessCue();
    propsRef.current.onReveal();
    propsRef.current.onResolved({ ok: true, ms, heard: m.heard, en: combo.en });
  };

  const fail = (reason: 'timeout' | 'skipped') => {
    if (phaseRef.current !== 'listening') return;
    setFailReason(reason);
    setPhase('failed');
    propsRef.current.onReveal();
    propsRef.current.onResolved({ ok: false, reason, heard: bestRef.current?.heard ?? '', en: combo.en });
    void speak(combo.en);
  };

  const actions = useRef({ succeed, fail });
  useEffect(() => {
    actions.current = { succeed, fail };
  });

  // Listen: every interim / final update is matched against the target.
  const { mark, subscribe } = listener;
  const optionEn = option?.en;
  useEffect(() => {
    mark();
    return subscribe((u) => {
      const p = phaseRef.current;
      if (p !== 'listening' && p !== 'retry') return;
      setLive(u.text);
      const m = matchVoice([u.text, ...u.alternatives], combo.en, { slotEn: optionEn });
      const prev = bestRef.current;
      // the diff always shows the attempt made against the clock, not the practice run after it
      if (p === 'listening' && (!prev || m.similarity >= prev.similarity)) {
        const next = { similarity: m.similarity, heard: m.heard, tokens: m.tokens };
        bestRef.current = next;
        setBest(next);
      }
      if (!m.matched) return;
      if (p === 'listening') {
        actions.current.succeed(m);
      } else {
        setLive(m.heard);
        setRetryOk(true);
        setPhase('failed');
      }
    });
  }, [mark, subscribe, combo.en, optionEn]);

  // Countdown: starts once the microphone is capturing, so the permission prompt does not eat the time.
  const ready = listener.ready;
  useEffect(() => {
    if (phase !== 'listening' || !ready) return;
    if (t0.current === null) t0.current = Date.now();
    const timer = setInterval(() => {
      const e = Date.now() - (t0.current ?? Date.now());
      setElapsed(e);
      if (e >= limitMs) {
        clearInterval(timer);
        actions.current.fail('timeout');
      }
    }, 100);
    return () => clearInterval(timer);
  }, [phase, ready, limitMs]);

  // Success: play the sentence, then move on by itself.
  useEffect(() => {
    if (phase !== 'success') return;
    let cancelled = false;
    let capTimer: ReturnType<typeof setTimeout> | null = null;
    let nextTimer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();
    const capped = new Promise<void>((resolve) => {
      capTimer = setTimeout(resolve, TTS_WAIT_CAP_MS);
    });
    void Promise.race([speak(combo.en), capped]).then(() => {
      if (cancelled) return;
      nextTimer = setTimeout(() => propsRef.current.onNext(), Math.max(400, ADVANCE_MS - (Date.now() - startedAt)));
    });
    return () => {
      cancelled = true;
      if (capTimer) clearTimeout(capTimer);
      if (nextTimer) clearTimeout(nextTimer);
    };
  }, [phase, combo.en]);

  useEffect(() => () => stopSpeaking(), []);

  const retry = () => {
    stopSpeaking();
    mark();
    setLive('');
    setRetried(true);
    setRetryOk(false);
    setPhase('retry');
  };

  const revealed = phase !== 'listening';
  const remaining = Math.max(0, limitMs - elapsed);
  const nextLabel = isLast ? '完成这一轮' : '下一句';

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
          {slot ? `换的是「${slot.labelZh}」，快速用英语说出整句` : '快速用英语说出整句'}
        </p>
        <p className="mt-1 text-2xl leading-snug font-bold text-slate-900 dark:text-white" data-testid="swap-zh">
          {highlightText(combo.zh, option?.zh)}
        </p>
      </div>

      {phase === 'listening' && (
        <div
          role="progressbar"
          aria-label="倒计时"
          aria-valuemin={0}
          aria-valuemax={limitMs}
          aria-valuenow={Math.min(limitMs, elapsed)}
          className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        >
          <div
            className={cx(
              'h-full rounded-full transition-[width] duration-100 ease-linear',
              elapsed / limitMs > 0.7 ? 'bg-rose-500' : 'bg-indigo-500',
            )}
            style={{ width: `${Math.max(0, 100 - (elapsed / limitMs) * 100)}%` }}
          />
        </div>
      )}

      {(phase === 'listening' || phase === 'retry') && (
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300" role="status">
          <span
            className={cx(
              'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-white',
              ready ? 'animate-pulse bg-rose-600' : 'bg-slate-400 dark:bg-slate-600',
            )}
          >
            <MicIcon size={16} />
          </span>
          <span className="min-w-0 flex-1">
            {!ready
              ? '正在启动麦克风…（首次使用请在弹窗里选“允许”）'
              : phase === 'retry'
                ? '正在听，再说一次（不限时）'
                : '正在听，请说出完整的句子'}
          </span>
          {phase === 'listening' && ready && (
            <span className="shrink-0 text-xs text-slate-400 tabular-nums dark:text-slate-500">
              剩 {seconds(remaining)} 秒
            </span>
          )}
        </div>
      )}

      {(phase === 'listening' || phase === 'retry') && (
        <p
          className="font-en min-h-[2.75rem] rounded-xl bg-slate-100 px-3 py-2 text-base leading-snug text-slate-800 dark:bg-slate-800/70 dark:text-slate-100"
          data-testid="swap-live"
          aria-live="polite"
        >
          {live || <span className="text-slate-400 dark:text-slate-500">你说的会显示在这里…</span>}
        </p>
      )}

      {phase === 'listening' && (
        <Button variant="secondary" size="lg" full onClick={() => fail('skipped')}>
          跳过 / 显示答案
        </Button>
      )}

      {phase === 'success' && (
        <p
          role="status"
          className="rounded-xl bg-emerald-100 px-3 py-2 text-base font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
          data-testid="swap-result"
        >
          ✓ 限时说对 · {seconds(okMs)} 秒
        </p>
      )}
      {phase === 'failed' && (
        <p
          role="status"
          className={cx(
            'rounded-xl px-3 py-2 text-base font-semibold',
            'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
          )}
          data-testid="swap-result"
        >
          ✗ {failReason === 'timeout' ? '超时' : '已跳过'}
          {retryOk && <span className="ml-2 text-sm font-medium">再说一次：说对了（不计入限时）</span>}
        </p>
      )}

      {revealed && (
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/70">
            <div className="flex items-center gap-3">
              <p
                className="font-en min-w-0 flex-1 text-xl leading-snug font-semibold text-slate-900 dark:text-white"
                data-testid="swap-en"
              >
                {highlightText(combo.en, option?.en)}
              </p>
              <SpeakButton text={combo.en} />
            </div>
          </div>

          {phase === 'success' && (
            <p className="font-en text-sm text-slate-500 dark:text-slate-400">你说的：{live}</p>
          )}

          {phase !== 'success' && (
            <div data-testid="swap-heard">
              {best && best.heard ? (
                <>
                  <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
                    你说的：<span className="font-en font-medium">{best.heard}</span>
                  </p>
                  <AnswerDiff tokens={best.tokens} similarity={best.similarity} />
                </>
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-300">没有听到</p>
              )}
            </div>
          )}

          <div className="flex gap-3">
            {phase === 'failed' && !retried && (
              <Button variant="secondary" size="lg" onClick={retry}>
                再说一次
              </Button>
            )}
            <Button variant="primary" size="lg" className="flex-1" onClick={props.onNext}>
              {nextLabel}
            </Button>
          </div>
          {phase === 'success' && (
            <p className="text-center text-xs text-slate-400 dark:text-slate-500">马上自动进入下一句</p>
          )}
        </div>
      )}
    </Card>
  );
}
