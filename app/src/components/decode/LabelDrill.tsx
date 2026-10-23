import { useMemo, useState } from 'react';
import {
  LABEL_ROLES,
  LABEL_ROLE_NAMES,
  TENSES,
  TENSE_LABELS,
  scoreLabeling,
  type DecodeResult,
  type LabelRole,
  type LabelTask,
  type Tense,
} from '../../lib/decode';
import { ROLE_STYLES } from '../../lib/labels';
import { SpeakButton } from '../SpeakButton';
import { Badge, Button, Card, cx } from '../ui';

export interface LabelDrillProps {
  /** The sentence to label, e.g. `labelTaskFromDozen(dozen)` or `pickFrameLabelTask(SEED_FRAMES)`. Remount with a `key` to start a new sentence. */
  sentence: LabelTask;
  /**
   * Called once, after the learner leaves the result screen. `correct / total` counts every asked token plus
   * the tense question (when the task has one).
   */
  onDone: (result: DecodeResult) => void;
  /** Label of the final button. Default "继续". */
  doneLabel?: string;
}

/** Index of the next scored token after `from` that has no answer yet (wrapping); -1 when all are answered. */
function nextOpen(task: LabelTask, answers: (LabelRole | undefined)[], from: number): number {
  const n = task.tokens.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (task.tokens[i].role !== null && answers[i] === undefined) return i;
  }
  return -1;
}

/**
 * 成分标注 (decode track): tap a word, then tap its role. One tense question follows when the task has one.
 * After 检查 the correct labeling is shown in the role colours with the learner's mistakes marked.
 */
export function LabelDrill({ sentence, onDone, doneLabel = '继续' }: LabelDrillProps) {
  const [startedAt] = useState(() => Date.now());
  const firstScored = useMemo(() => sentence.tokens.findIndex((t) => t.role !== null), [sentence]);
  const [answers, setAnswers] = useState<(LabelRole | undefined)[]>(() => sentence.tokens.map(() => undefined));
  const [selected, setSelected] = useState(firstScored);
  const [tense, setTense] = useState<Tense | undefined>(undefined);
  const [checked, setChecked] = useState(false);

  const asked = sentence.tokens.filter((t) => t.role !== null).length;
  const answered = sentence.tokens.filter((t, i) => t.role !== null && answers[i] !== undefined).length;
  const tenseNeeded = sentence.tense !== undefined;
  const complete = answered === asked && (!tenseNeeded || tense !== undefined);
  const score = useMemo(() => scoreLabeling(sentence, answers, tense), [sentence, answers, tense]);

  const assign = (role: LabelRole) => {
    if (checked || selected < 0) return;
    const next = answers.map((a, i) => (i === selected ? role : a));
    setAnswers(next);
    const open = nextOpen(sentence, next, selected);
    if (open >= 0) setSelected(open);
  };

  const finish = () => {
    onDone({ correct: score.correct, total: score.total, ms: Math.min(300_000, Date.now() - startedAt) });
  };

  const wrongNotes = checked
    ? sentence.tokens
        .map((t, i) => ({ t, i }))
        .filter(({ t, i }) => t.role !== null && t.notes && score.tokenCorrect[i] === false)
    : [];

  return (
    <Card className="flex flex-col gap-4" aria-label="成分标注">
      <div>
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
          成分标注：点一个词，再点它的成分
        </p>
        <div className="mt-1 flex items-start gap-2">
          <p className="min-w-0 flex-1 text-lg leading-snug font-bold text-slate-900 dark:text-white" data-testid="label-zh">
            {sentence.zh}
          </p>
          {checked && <SpeakButton text={sentence.en} />}
        </div>
      </div>

      <ul className="flex flex-wrap gap-2" aria-label="句子成分">
        {sentence.tokens.map((t, i) => {
          if (t.role === null) {
            return (
              <li key={i}>
                <span
                  data-token="fixed"
                  className="font-en flex min-h-12 items-center rounded-xl border border-dashed border-slate-300 px-3 text-lg text-slate-400 dark:border-slate-700 dark:text-slate-500"
                >
                  {t.text}
                </span>
              </li>
            );
          }
          const mine = answers[i];
          const ok = score.tokenCorrect[i];
          const shownRole: LabelRole | undefined = checked ? t.role : mine;
          const style = shownRole ? ROLE_STYLES[shownRole] : undefined;
          const isSelected = !checked && selected === i;
          return (
            <li key={i}>
              <button
                type="button"
                data-token="asked"
                data-state={checked ? (ok ? 'right' : 'wrong') : mine ? 'set' : 'open'}
                disabled={checked}
                aria-pressed={isSelected}
                aria-label={
                  checked
                    ? `${t.text}：应为${LABEL_ROLE_NAMES[t.role]}，${ok ? '你答对了' : '你选了' + (mine ? LABEL_ROLE_NAMES[mine] : '空')}`
                    : `${t.text}${mine ? '，已选' + LABEL_ROLE_NAMES[mine] : '，未标注'}`
                }
                onClick={() => setSelected(i)}
                className={cx(
                  'relative flex min-h-[3.75rem] min-w-12 flex-col items-center justify-center rounded-xl border px-3 py-1.5 text-center transition disabled:opacity-100',
                  style ? style.chip : 'border-slate-300 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50',
                  isSelected && 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-950',
                  checked && ok === false && 'ring-2 ring-rose-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-950',
                )}
              >
                <span className="font-en text-lg leading-tight font-semibold">{t.text}</span>
                <span className="mt-0.5 text-xs leading-tight opacity-80">
                  {shownRole ? LABEL_ROLE_NAMES[shownRole] : '···'}
                </span>
                {checked && ok === false && (
                  <span className="mt-0.5 text-[11px] leading-tight font-medium text-rose-700 dark:text-rose-300">
                    你选：{mine ? LABEL_ROLE_NAMES[mine] : '空'}
                  </span>
                )}
                {checked && (
                  <span
                    aria-hidden="true"
                    className={cx(
                      'absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full text-xs font-bold text-white',
                      ok ? 'bg-emerald-600' : 'bg-rose-600',
                    )}
                  >
                    {ok ? '✓' : '✗'}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {!checked && (
        <div role="group" aria-label="选择成分" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LABEL_ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => assign(r)}
              disabled={selected < 0}
              className={cx(
                'flex min-h-11 items-center justify-center gap-2 rounded-xl border px-2 text-sm font-medium transition active:scale-[0.97]',
                ROLE_STYLES[r].chip,
              )}
            >
              <span className={cx('size-2.5 shrink-0 rounded-full', ROLE_STYLES[r].dot)} aria-hidden="true" />
              {LABEL_ROLE_NAMES[r]}
            </button>
          ))}
        </div>
      )}

      {tenseNeeded && (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300" id="tense-q">
            这句话的时态 / 形式是？
          </p>
          <div role="group" aria-labelledby="tense-q" className="flex flex-wrap gap-2">
            {TENSES.map((t) => {
              const isMine = tense === t;
              const isRight = sentence.tense === t;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={isMine}
                  disabled={checked}
                  onClick={() => setTense(t)}
                  className={cx(
                    'min-h-11 rounded-full border px-4 text-sm font-medium transition disabled:opacity-100',
                    checked && isRight
                      ? 'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-600'
                      : checked && isMine
                        ? 'border-rose-500 bg-rose-100 text-rose-800 dark:border-rose-500 dark:bg-rose-950/50 dark:text-rose-200'
                        : isMine
                          ? 'border-indigo-600 bg-indigo-600 text-white dark:border-indigo-500 dark:bg-indigo-500'
                          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                  )}
                >
                  {TENSE_LABELS[t]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!checked && (
        <Button variant="primary" size="lg" full disabled={!complete} onClick={() => setChecked(true)}>
          检查
        </Button>
      )}

      {checked && (
        <div className="flex flex-col gap-3" role="status" aria-live="polite" data-testid="label-result">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-slate-900 dark:text-white" data-testid="label-score">
              答对 {score.correct} / {score.total}
            </p>
            {score.correct === score.total && <Badge tone="emerald">全对</Badge>}
            {score.tenseCorrect === false && sentence.tense && (
              <Badge tone="amber">时态应为：{TENSE_LABELS[sentence.tense]}</Badge>
            )}
          </div>
          <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/70">
            <p className="font-en text-lg leading-snug font-semibold text-slate-900 dark:text-white">{sentence.en}</p>
          </div>
          {wrongNotes.length > 0 && (
            <ul className="flex flex-col gap-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {wrongNotes.flatMap(({ t, i }) =>
                (t.notes ?? []).map((n, k) => (
                  <li key={`${i}-${k}`}>
                    <span className="font-en font-semibold">{n.en}</span>
                    <span className="mx-1.5 text-slate-400">·</span>
                    {n.note}
                  </li>
                )),
              )}
            </ul>
          )}
          <Button variant="primary" size="lg" full onClick={finish}>
            {doneLabel}
          </Button>
        </div>
      )}
    </Card>
  );
}
