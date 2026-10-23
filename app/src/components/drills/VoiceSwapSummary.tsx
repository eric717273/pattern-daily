import { useState } from 'react';
import { shiftSpeed, speedAdvice, speedOptions, type SwapSpeed } from '../../lib/swap';
import { Button, Card, Segmented, cx } from '../ui';
import type { VoiceItem } from './VoiceSwapPrompt';

export interface VoiceSwapSummaryProps {
  items: (VoiceItem | undefined)[];
  /** Number of swap prompts in the round. */
  total: number;
  /** The voice-mode speed preset used in this round. */
  speed: SwapSpeed;
  doneLabel: string;
  /** Called with the preset chosen for the next round. */
  onFinish: (nextSpeed: SwapSpeed) => void;
}

const seconds = (ms: number) => (ms / 1000).toFixed(1);

/** End of a voice-verified round: score, average time, per-prompt list and speed advice. */
export function VoiceSwapSummary({ items, total, speed, doneLabel, onFinish }: VoiceSwapSummaryProps) {
  const correct = items.filter((i) => i?.ok).length;
  const okTimes = items.flatMap((i) => (i?.ok && i.ms !== undefined ? [i.ms] : []));
  const avg = okTimes.length > 0 ? okTimes.reduce((a, b) => a + b, 0) / okTimes.length : null;
  const advice = speedAdvice(correct, total);
  const suggested = shiftSpeed(speed, advice);
  const [next, setNext] = useState<SwapSpeed>(suggested);
  const opts = speedOptions(true);
  const label = (v: SwapSpeed) => opts.find((o) => o.value === v)?.label ?? v;

  const adviceText =
    advice === 'faster'
      ? suggested === speed
        ? `说对了 ${correct} / ${total}，而且已经是最快一档，保持！`
        : `说对了 ${correct} / ${total}，已经很熟了：建议加速到「${label(suggested)}」。`
      : advice === 'slower'
        ? suggested === speed
          ? `只说对了 ${correct} / ${total}，已经是最慢一档：多读几遍起点句，再来一轮。`
          : `只说对了 ${correct} / ${total}：建议放慢到「${label(suggested)}」，先求说对再求快。`
        : `速度合适：保持「${label(speed)}」再练一轮。`;

  return (
    <Card className="flex flex-col gap-4" aria-label="单槽快替完成">
      <div>
        <p className="text-lg font-semibold text-slate-900 dark:text-white">这一轮练完了</p>
        <p className="mt-2 text-3xl font-bold text-slate-900 tabular-nums dark:text-white" data-testid="voice-score">
          限时说对 {correct} / {total}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400" data-testid="voice-avg">
          {avg === null ? '没有说对的句子，暂无平均用时' : `说对的句子平均用时 ${seconds(avg)} 秒`}
        </p>
      </div>

      <ol className="flex flex-col divide-y divide-slate-200 dark:divide-slate-800" aria-label="每一句的结果">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3 py-2.5" data-ok={item ? String(item.ok) : undefined}>
            <span
              className={cx(
                'mt-0.5 inline-flex w-12 shrink-0 text-sm font-semibold',
                item?.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
              )}
            >
              {item?.ok ? '✓' : '✗'} {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-en text-[15px] leading-snug font-medium text-slate-900 dark:text-white">
                {item?.en}
              </p>
              <p className="font-en mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                {item ? (item.heard ? `你说：${item.heard}` : '没有听到') : '未作答'}
              </p>
            </div>
            <span className="shrink-0 text-sm text-slate-500 tabular-nums dark:text-slate-400">
              {item?.ok && item.ms !== undefined ? `${seconds(item.ms)} 秒` : item?.reason === 'skipped' ? '跳过' : '超时'}
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-2">
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300" data-testid="voice-advice">
          {adviceText}
        </p>
        <Segmented<SwapSpeed>
          ariaLabel="下一轮速度"
          full
          value={next}
          onChange={setNext}
          options={opts.map((o) => ({ value: o.value, label: o.label }))}
        />
        <p className="text-xs text-slate-400 dark:text-slate-500">选好的速度会记住，下次直接用。</p>
      </div>

      <Button variant="primary" size="lg" full onClick={() => onFinish(next)}>
        {doneLabel}
      </Button>
    </Card>
  );
}

