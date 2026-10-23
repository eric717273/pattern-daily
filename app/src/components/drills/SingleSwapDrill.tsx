import { useEffect, useMemo, useState } from 'react';
import type { FrameCombo, SubstitutionFrame } from '../../types';
import { singleSwapSequence } from '../../lib/frameEngine';
import { speak } from '../../lib/speech';
import { FrameTable } from '../FrameTable';
import { SpeakButton } from '../SpeakButton';
import { Button, Card, Segmented, cx } from '../ui';
import { changedSlot, loadSpeed, saveSpeed, SWAP_SPEEDS, type SwapFeel, type SwapSpeed } from '../../lib/swap';
import { highlightText } from './highlight';

export interface SingleSwapResult {
  ms: number;
  feel: SwapFeel;
}

export interface SingleSwapDrillProps {
  frame: SubstitutionFrame;
  /** Length of the sequence including the starting sentence. Default 8. */
  length?: number;
  onDone: (result: SingleSwapResult) => void;
  doneLabel?: string;
}

/** Palmer step 2 (单槽快替): the Chinese prompt changes one slot at a time; say it before the countdown ends. */
export function SingleSwapDrill({ frame, length = 8, onDone, doneLabel = '完成单槽快替' }: SingleSwapDrillProps) {
  const [startedAt] = useState(() => Date.now());
  const seq = useMemo(() => singleSwapSequence(frame, length), [frame, length]);
  const [speed, setSpeed] = useState<SwapSpeed>(loadSpeed);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [feel, setFeel] = useState<SwapFeel>('ok');
  const speedMs = SWAP_SPEEDS.find((s) => s.value === speed)?.ms ?? 4000;

  const total = seq.length - 1; // swaps after the starting sentence
  const finished = index >= seq.length;
  const cur = seq[index] as FrameCombo | undefined;
  const prev = index > 0 ? seq[index - 1] : undefined;
  const slotKey = cur ? changedSlot(prev, cur) : undefined;
  const slot = frame.slots.find((s) => s.key === slotKey);
  const option = slot && cur ? slot.options[cur.picks[slot.key]] : undefined;

  const reveal = (viaTap: boolean) => {
    setRevealed(true);
    if (viaTap && cur) void speak(cur.en);
  };

  // Countdown for swap prompts (index >= 1). Reveals automatically when it runs out.
  const curEn = cur?.en;
  useEffect(() => {
    if (finished || index === 0 || revealed) return;
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
  }, [index, revealed, finished, speedMs, curEn]);

  const next = () => {
    setRevealed(false);
    setElapsed(0);
    setIndex((i) => i + 1);
  };

  const finish = () => {
    if (feel === 'easy') {
      const i = SWAP_SPEEDS.findIndex((s) => s.value === speed);
      if (i < SWAP_SPEEDS.length - 1) saveSpeed(SWAP_SPEEDS[i + 1].value);
    } else if (feel === 'hard') {
      const i = SWAP_SPEEDS.findIndex((s) => s.value === speed);
      if (i > 0) saveSpeed(SWAP_SPEEDS[i - 1].value);
    }
    onDone({ ms: Math.min(300_000, Date.now() - startedAt), feel });
  };

  const changeSpeed = (v: SwapSpeed) => {
    setSpeed(v);
    saveSpeed(v);
  };

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
          options={SWAP_SPEEDS.map((s) => ({ value: s.value, label: s.label }))}
        />
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
            <Button variant="primary" size="lg" className="flex-1" onClick={next}>
              开始快替
            </Button>
          </div>
        </Card>
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
