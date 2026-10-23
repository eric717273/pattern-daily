import { useEffect, useRef, useState } from 'react';
import type { LibraryItem } from '../../content';
import type { FrameCombo } from '../../types';
import { chunkCore, exampleTurn, matchChunkSpoken, maskZh } from '../../lib/chunkDrill';
import { playSuccessCue, primeAudio } from '../../lib/cue';
import { randomCombo, type AnswerToken } from '../../lib/frameEngine';
import { speak, stopSpeaking } from '../../lib/speech';
import { matchVoice, VOICE_THRESHOLD, READ_ALOUD_THRESHOLD } from '../../lib/voiceMatch';
import { AnswerDiff } from '../drills/AnswerDiff';
import { useVoiceListener, useVoicePref } from '../drills/useVoice';
import { VoiceToggle, VoiceUnsupportedNote } from '../drills/VoiceToggle';
import { MicIcon } from '../icons';
import { SpeakButton } from '../SpeakButton';
import { Button, Card, cx } from '../ui';

export const CHUNK_RECALL_MS = 6000;
export const FRAME_RECALL_MS = 8000;

export interface RecallResult {
  /** Said (voice mode: recognised within the time limit; fallback: 说对了). */
  correct: boolean;
  /** Milliseconds until it was said (voice mode: until recognised / the limit; fallback: until 显示答案). */
  ms: number;
  /** Best transcript of what the learner said (voice mode only; '' = nothing heard). */
  heard?: string;
}

export interface RecallDrillProps {
  item: LibraryItem;
  /** Voice mode time limit. Default 6000 ms for a chunk, 8000 ms for a frame sentence. */
  timeLimitMs?: number;
  /** Frames only: the sentence to prompt (default: a random combo). Read once on mount: give the component a `key` per prompt. */
  combo?: FrameCombo;
  /** Fired when the learner taps 继续 (voice mode) or 说对了 / 没说出来 (self-check mode). */
  onDone: (result: RecallResult) => void;
  continueLabel?: string;
}

type Phase = 'idle' | 'listening' | 'success' | 'failed' | 'revealed';

interface Best {
  similarity: number;
  heard: string;
  tokens: AnswerToken[];
}

const seconds = (ms: number) => (ms / 1000).toFixed(1);

interface Prompt {
  /** Chinese to say in English. */
  promptZh: string;
  /** Situation line (chunk only): an example translation with the chunk's Chinese blanked. */
  situationZh?: string;
  /** English answer: the chunk (as written) or the sentence. */
  answer: string;
  /** What is spoken after the reveal. */
  say: string;
}

function buildPrompt(item: LibraryItem, combo: FrameCombo | undefined): Prompt {
  if (item.kind === 'chunk') {
    const { chunk } = item;
    const ex = chunk.examples[0];
    const turn = ex ? exampleTurn(ex, chunk.en) : undefined;
    return {
      promptZh: chunk.zh,
      situationZh: turn ? maskZh(turn.fullZh, chunk.zh) : undefined,
      answer: chunk.en,
      say: chunkCore(chunk.en),
    };
  }
  const c = combo ?? randomCombo(item.frame);
  return { promptZh: c.zh, answer: c.en, say: c.en };
}

/**
 * 说出: the Chinese meaning (and, for chunks, a situation) is shown, the English never is until the reveal.
 * Voice mode (speech recognition supported + 语音验证 on): tap 开始说, say the chunk within the limit; the
 * recognizer judges it (a chunk is also accepted inside a longer utterance; frames need a 0.85 match of the
 * whole sentence). Without recognition (or after a recognition error): 显示答案, then 说对了 / 没说出来.
 */
export function RecallDrill({ item, timeLimitMs, combo, onDone, continueLabel = '继续' }: RecallDrillProps) {
  const limitMs = timeLimitMs ?? (item.kind === 'chunk' ? CHUNK_RECALL_MS : FRAME_RECALL_MS);
  const [prompt] = useState(() => buildPrompt(item, combo));
  const voicePref = useVoicePref();
  const [phase, setPhaseState] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState('');
  const [best, setBest] = useState<Best | null>(null);
  const bestRef = useRef<Best | null>(null);
  const [okMs, setOkMs] = useState(0);
  const [failReason, setFailReason] = useState<'timeout' | 'skipped'>('timeout');
  const [mountedAt] = useState(() => Date.now());
  const [selfMs, setSelfMs] = useState(0);
  const t0 = useRef<number | null>(null);

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };

  // A fatal recognition error drops the drill back to the self-check flow.
  const listener = useVoiceListener(() => {
    if (phaseRef.current === 'listening') {
      setPhase('idle');
      setElapsed(0);
      t0.current = null;
    }
  });
  const voice = voicePref.enabled && !listener.error;

  const judge = (heard: string | readonly string[]) =>
    item.kind === 'chunk'
      ? matchChunkSpoken(heard, item.chunk.en, READ_ALOUD_THRESHOLD)
      : matchVoice(heard, prompt.answer, { threshold: VOICE_THRESHOLD });

  const stopListening = listener.stop;
  const succeed = (heard: string) => {
    if (phaseRef.current !== 'listening') return;
    setOkMs(Math.max(0, Date.now() - (t0.current ?? Date.now())));
    setLive(heard);
    setPhase('success');
    stopListening();
    playSuccessCue();
    void speak(prompt.say);
  };
  const fail = (reason: 'timeout' | 'skipped') => {
    if (phaseRef.current !== 'listening') return;
    setFailReason(reason);
    setPhase('failed');
    stopListening();
    void speak(prompt.say);
  };
  const actions = useRef({ succeed, fail, judge });
  useEffect(() => {
    actions.current = { succeed, fail, judge };
  });

  const { subscribe, mark } = listener;
  useEffect(() => {
    mark();
    return subscribe((u) => {
      if (phaseRef.current !== 'listening') return;
      setLive(u.text);
      const m = actions.current.judge([u.text, ...u.alternatives]);
      const prev = bestRef.current;
      if (!prev || m.similarity >= prev.similarity) {
        const next = { similarity: m.similarity, heard: m.heard, tokens: m.tokens };
        bestRef.current = next;
        setBest(next);
      }
      if (m.matched) actions.current.succeed(m.heard);
    });
  }, [subscribe, mark]);

  // The countdown starts once the microphone is capturing, so the permission prompt does not eat the time.
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

  useEffect(() => () => stopSpeaking(), []);

  const start = () => {
    primeAudio();
    bestRef.current = null;
    setBest(null);
    setLive('');
    setElapsed(0);
    t0.current = null;
    setPhase('listening');
    listener.start();
    listener.mark();
  };

  const reveal = () => {
    setSelfMs(Math.min(120_000, Date.now() - mountedAt));
    setPhase('revealed');
    void speak(prompt.say);
  };

  const toggleVoice = (on: boolean) => {
    voicePref.setEnabled(on);
    if (!on) {
      listener.stop();
      if (phaseRef.current === 'listening') {
        setPhase('idle');
        setElapsed(0);
        t0.current = null;
      }
    }
  };

  const remaining = Math.max(0, limitMs - elapsed);
  const answerShown = phase === 'success' || phase === 'failed' || phase === 'revealed';

  return (
    <Card className="flex flex-col gap-3.5" aria-label="说出">
      <div>
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
          {item.kind === 'chunk' ? '用英语怎么说？' : '用英语说出整句'}
        </p>
        <p className="mt-1 text-2xl leading-snug font-bold text-slate-900 dark:text-white" data-testid="recall-zh">
          {prompt.promptZh}
        </p>
        {prompt.situationZh && (
          <p className="mt-2 rounded-xl bg-slate-100 px-3 py-2 text-sm leading-relaxed text-slate-600 dark:bg-slate-800/70 dark:text-slate-300" data-testid="recall-situation">
            <span className="mr-1.5 font-semibold text-slate-500 dark:text-slate-400">情景</span>
            {prompt.situationZh}
          </p>
        )}
      </div>

      {phase === 'idle' && (
        <div className="flex flex-col gap-2.5">
          {voicePref.supported ? (
            <VoiceToggle enabled={voice} onChange={toggleVoice} className="self-start" />
          ) : (
            <VoiceUnsupportedNote />
          )}
          {listener.error && voicePref.enabled && (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
              {listener.error.message}。已改为自评模式。
            </p>
          )}
          {voice ? (
            <>
              <Button variant="primary" size="lg" full onClick={start}>
                <MicIcon size={20} />
                开始说（限时 {limitMs / 1000} 秒）
              </Button>
              <Button variant="ghost" size="sm" onClick={reveal}>
                想不起来，直接看答案
              </Button>
            </>
          ) : (
            <Button variant="primary" size="lg" full onClick={reveal}>
              显示答案
            </Button>
          )}
        </div>
      )}

      {phase === 'listening' && (
        <>
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
              {ready ? '正在听，请用英语说出来' : '正在启动麦克风…（首次使用请在弹窗里选“允许”）'}
            </span>
            {ready && (
              <span className="shrink-0 text-xs text-slate-400 tabular-nums dark:text-slate-500">
                剩 {seconds(remaining)} 秒
              </span>
            )}
          </div>
          <p
            className="font-en min-h-[2.75rem] rounded-xl bg-slate-100 px-3 py-2 text-base leading-snug text-slate-800 dark:bg-slate-800/70 dark:text-slate-100"
            data-testid="recall-live"
            aria-live="polite"
          >
            {live || <span className="text-slate-400 dark:text-slate-500">你说的会显示在这里…</span>}
          </p>
          <Button variant="secondary" size="lg" full onClick={() => fail('skipped')}>
            跳过 / 显示答案
          </Button>
        </>
      )}

      {phase === 'success' && (
        <p
          role="status"
          className="rounded-xl bg-emerald-100 px-3 py-2 text-base font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
          data-testid="recall-result"
        >
          ✓ 限时说对 · {seconds(okMs)} 秒
        </p>
      )}
      {phase === 'failed' && (
        <p
          role="status"
          className="rounded-xl bg-rose-100 px-3 py-2 text-base font-semibold text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
          data-testid="recall-result"
        >
          ✗ {failReason === 'timeout' ? '超时' : '已跳过'}
        </p>
      )}

      {answerShown && (
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/70">
            <div className="flex items-center gap-3">
              <p className="font-en min-w-0 flex-1 text-xl leading-snug font-semibold text-slate-900 dark:text-white" data-testid="recall-en">
                {prompt.answer}
              </p>
              <SpeakButton text={prompt.say} />
            </div>
          </div>
          {item.kind === 'chunk' && item.chunk.soundZh && (
            <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-300">
              <span className="mr-1.5 font-semibold">听力提示</span>
              {item.chunk.soundZh}
            </p>
          )}

          {phase === 'success' && <p className="font-en text-sm text-slate-500 dark:text-slate-400">你说的：{live}</p>}
          {phase === 'failed' && (
            <div data-testid="recall-heard">
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

          {phase === 'revealed' ? (
            <div role="group" aria-label="自评" className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => onDone({ correct: false, ms: selfMs })}
              >
                没说出来
              </Button>
              <Button variant="primary" size="lg" onClick={() => onDone({ correct: true, ms: selfMs })}>
                说对了
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              size="lg"
              full
              onClick={() =>
                onDone(
                  phase === 'success'
                    ? { correct: true, ms: okMs, heard: live }
                    : { correct: false, ms: failReason === 'timeout' ? limitMs : Math.min(limitMs, elapsed), heard: best?.heard ?? '' },
                )
              }
            >
              {continueLabel}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
