import { useEffect, useMemo, useState } from 'react';
import type { FrameCombo, Grade, SubstitutionFrame } from '../../types';
import { primeAudio } from '../../lib/cue';
import { singleSwapSequence } from '../../lib/frameEngine';
import { speak } from '../../lib/speech';
import { FrameTable } from '../FrameTable';
import { SpeakButton } from '../SpeakButton';
import { Button, Card, Segmented, cx } from '../ui';
import {
  changedSlot,
  loadSpeed,
  saveSpeed,
  speedAdvice,
  speedOptions,
  SWAP_SPEEDS,
  voiceGrade,
  type SwapFeel,
  type SwapSpeed,
} from '../../lib/swap';
import { highlightText } from './highlight';
import { useVoiceListener, useVoicePref } from './useVoice';
import { VoiceToggle, VoiceUnsupportedNote } from './VoiceToggle';
import { VoiceSwapPrompt, type VoiceItem } from './VoiceSwapPrompt';
import { VoiceSwapSummary } from './VoiceSwapSummary';

export interface SingleSwapResult {
  ms: number;
  feel: SwapFeel;
  /** Voice-verified rounds only: the grade from the accuracy (callers prefer it over the one derived from `feel`). */
  grade?: Grade;
  /** Voice-verified rounds only: prompts said correctly within the time limit, out of `total`. */
  correct?: number;
  total?: number;
}

export interface SingleSwapDrillProps {
  frame: SubstitutionFrame;
  /** Length of the sequence including the starting sentence. Default 8. */
  length?: number;
  onDone: (result: SingleSwapResult) => void;
  doneLabel?: string;
}

/**
 * Palmer step 2 (单槽快替): the Chinese prompt changes one slot at a time; say it before the countdown ends.
 * With speech recognition the microphone checks the spoken sentence (语音验证); without it the learner
 * reveals the answer and rates the round themselves.
 */
export function SingleSwapDrill({ frame, length = 8, onDone, doneLabel = '完成单槽快替' }: SingleSwapDrillProps) {
  const [startedAt] = useState(() => Date.now());
  const seq = useMemo(() => singleSwapSequence(frame, length), [frame, length]);
  const voicePref = useVoicePref();
  const [revealed, setRevealed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  /** Bumped when the mode changes mid-prompt so the prompt starts over. */
  const [promptKey, setPromptKey] = useState(0);
  // A fatal recognition error drops the drill back to self-grading: start the current prompt afresh.
  const listener = useVoiceListener(() => {
    setRevealed(false);
    setElapsed(0);
    setPromptKey((k) => k + 1);
  });
  /** Voice verification is on and has not failed (permission denied, offline, ...). */
  const voice = voicePref.enabled && !listener.error;
  const [speeds, setSpeeds] = useState<{ plain: SwapSpeed; voice: SwapSpeed }>(() => ({
    plain: loadSpeed(false),
    voice: loadSpeed(true),
  }));
  const speed = voice ? speeds.voice : speeds.plain;
  const [index, setIndex] = useState(0);
  const [voiceItems, setVoiceItems] = useState<(VoiceItem | undefined)[]>([]);
  const [feel, setFeel] = useState<SwapFeel>('ok');
  const speedOpts = speedOptions(voice);
  const speedMs = speedOpts.find((s) => s.value === speed)?.ms ?? speedOpts[0].ms;

  const total = seq.length - 1; // swaps after the starting sentence
  const finished = index >= seq.length;
  const cur = seq[index] as FrameCombo | undefined;
  const prev = index > 0 ? seq[index - 1] : undefined;
  const slotKey = cur ? changedSlot(prev, cur) : undefined;
  const slot = frame.slots.find((s) => s.key === slotKey);
  const option = slot && cur ? slot.options[cur.picks[slot.key]] : undefined;

  const stopListening = listener.stop;
  useEffect(() => {
    if (finished) stopListening();
  }, [finished, stopListening]);

  const reveal = (viaTap: boolean) => {
    setRevealed(true);
    if (viaTap && cur) void speak(cur.en);
  };

  // Countdown for swap prompts (index >= 1). Reveals automatically when it runs out.
  const curEn = cur?.en;
  useEffect(() => {
    if (voice || finished || index === 0 || revealed) return;
    const t0 = Date.now();
    const timer = setInterval(() => {
      const e = Date.now() - t0;
      setElapsed(e);
      if (e >= speedMs) {
        clearInterval(timer);
        setRevealed(true);
        if (curEn) void speak(curEn);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [voice, index, revealed, finished, speedMs, curEn, promptKey]);

  const next = () => {
    setRevealed(false);
    setElapsed(0);
    setIndex((i) => i + 1);
  };

  const startDrill = () => {
    if (voice) {
      // first tap of the drill: Safari only allows the microphone / audio inside a user gesture
      primeAudio();
      listener.start();
    }
    next();
  };

  const toggleVoice = (on: boolean) => {
    voicePref.setEnabled(on);
    if (on) {
      primeAudio();
      if (index >= 1 && !finished) listener.start();
    } else {
      listener.stop();
    }
    if (index >= 1 && !finished) {
      setRevealed(false);
      setElapsed(0);
      setPromptKey((k) => k + 1);
    }
  };

  const finish = () => {
    if (feel === 'easy') {
      const i = SWAP_SPEEDS.findIndex((s) => s.value === speeds.plain);
      if (i < SWAP_SPEEDS.length - 1) saveSpeed(SWAP_SPEEDS[i + 1].value);
    } else if (feel === 'hard') {
      const i = SWAP_SPEEDS.findIndex((s) => s.value === speeds.plain);
      if (i > 0) saveSpeed(SWAP_SPEEDS[i - 1].value);
    }
    onDone({ ms: Math.min(300_000, Date.now() - startedAt), feel });
  };

  const finishVoice = (nextSpeed: SwapSpeed) => {
    saveSpeed(nextSpeed, true);
    const correct = voiceItems.filter((i) => i?.ok).length;
    const advice = speedAdvice(correct, total);
    onDone({
      ms: Math.min(300_000, Date.now() - startedAt),
      feel: advice === 'faster' ? 'easy' : advice === 'slower' ? 'hard' : 'ok',
      grade: voiceGrade(correct, total),
      correct,
      total,
    });
  };

  const changeSpeed = (v: SwapSpeed) => {
    setSpeeds((s) => ({ ...s, [voice ? 'voice' : 'plain']: v }));
    saveSpeed(v, voice);
  };

  const resolveVoice = (item: VoiceItem) => {
    setVoiceItems((items) => {
      const copy = [...items];
      copy[index - 1] = item;
      return copy;
    });
  };

  if (finished && voice && voiceItems.some(Boolean)) {
    return (
      <VoiceSwapSummary
        items={Array.from({ length: total }, (_, i) => voiceItems[i])}
        total={total}
        speed={speeds.voice}
        doneLabel={doneLabel}
        onFinish={finishVoice}
      />
    );
  }

  if (finished) {
    return (
      <Card className="flex flex-col gap-4" aria-label="单槽快替完成">
        <div>
          <p className="text-lg font-semibold text-slate-900 dark:text-white">这一轮练完了</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            帕默的原则：熟练以后就加快速度。这一轮感觉怎么样？
          </p>
        </div>
        <Segmented<SwapFeel>
          ariaLabel="这一轮的感觉"
          full
          value={feel}
          onChange={setFeel}
          options={[
            { value: 'hard', label: '吃力' },
            { value: 'ok', label: '刚好' },
            { value: 'easy', label: '轻松' },
          ]}
        />
        <p className="text-xs text-slate-400 dark:text-slate-500">
          选「轻松」下次自动加快一档，「吃力」则放慢一档。
        </p>
        <Button variant="primary" size="lg" full onClick={finish}>
          {doneLabel}
        </Button>
      </Card>
    );
  }

  if (!cur) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400" aria-live="polite">
          {index === 0 ? '起点句' : `第 ${index} / ${total} 句`}
        </p>
        <Segmented<SwapSpeed>
          ariaLabel="替换速度"
          value={speed}
          onChange={changeSpeed}
          options={speedOpts.map((s) => ({ value: s.value, label: s.label }))}
        />
      </div>

      <div className="flex flex-col items-start gap-1.5">
        {voicePref.supported ? (
          <VoiceToggle enabled={voice} onChange={toggleVoice} />
        ) : (
          <VoiceUnsupportedNote />
        )}
        {listener.error && voicePref.enabled && (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
            {listener.error.message}。已改为自评模式。
          </p>
        )}
      </div>

      <FrameTable
        frame={frame}
        picks={cur.picks}
        onChange={() => undefined}
        highlightSlot={slotKey}
        maskEnSlot={index > 0 && !revealed ? slotKey : undefined}
        compact
        readOnly
        showSentence={false}
      />

      {index === 0 ? (
        <Card className="flex flex-col gap-3">
          <p className="text-xs font-medium text-slate-400 dark:text-slate-500">先读一遍起点句，然后开始快替</p>
          <p className="font-en text-2xl leading-snug font-bold text-slate-900 dark:text-white">{cur.en}</p>
          <p className="text-[15px] text-slate-500 dark:text-slate-400">{cur.zh}</p>
          <div className="flex items-center gap-3">
            <SpeakButton text={cur.en} />
            <Button variant="primary" size="lg" className="flex-1" onClick={startDrill}>
              开始快替
            </Button>
          </div>
          {voice && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              语音验证已开启：点「开始快替」后浏览器会请求麦克风权限；每句限时 {speedMs / 1000} 秒，对着麦克风说出整句英语。
            </p>
          )}
        </Card>
      ) : voice ? (
        <VoiceSwapPrompt
          key={`${index}-${promptKey}`}
          combo={cur}
          slot={slot}
          option={option}
          limitMs={speedMs}
          listener={listener}
          isLast={index >= total}
          onReveal={() => setRevealed(true)}
          onResolved={resolveVoice}
          onNext={next}
        />
      ) : (
        <Card className="flex flex-col gap-3">
          <div>
            <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
              {slot ? `换的是「${slot.labelZh}」，快速用英语说出来` : '快速用英语说出来'}
            </p>
            <p className="mt-1 text-2xl leading-snug font-bold text-slate-900 dark:text-white" data-testid="swap-zh">
              {highlightText(cur.zh, option?.zh)}
            </p>
          </div>

          {!revealed && (
            <>
              <div
                role="progressbar"
                aria-label="倒计时"
                aria-valuemin={0}
                aria-valuemax={speedMs}
                aria-valuenow={Math.min(speedMs, elapsed)}
                className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
              >
                <div
                  className={cx(
                    'h-full rounded-full transition-[width] duration-100 ease-linear',
                    elapsed / speedMs > 0.7 ? 'bg-rose-500' : 'bg-indigo-500',
                  )}
                  style={{ width: `${Math.max(0, 100 - (elapsed / speedMs) * 100)}%` }}
                />
              </div>
              <Button variant="primary" size="lg" full onClick={() => reveal(true)}>
                显示答案
              </Button>
            </>
          )}

          {revealed && (
            <div className="flex flex-col gap-3">
              <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/70">
                <div className="flex items-center gap-3">
                  <p className="font-en min-w-0 flex-1 text-xl leading-snug font-semibold text-slate-900 dark:text-white" data-testid="swap-en">
                    {highlightText(cur.en, option?.en)}
                  </p>
                  <SpeakButton text={cur.en} />
                </div>
              </div>
              <Button variant="primary" size="lg" full onClick={next}>
                {index >= total ? '完成这一轮' : '下一句'}
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
