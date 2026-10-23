import { useMemo, useState, type FormEvent } from 'react';
import type { Grade, SubstitutionFrame } from '../../types';
import { averageGrade, suggestGrade } from '../../lib/drill';
import { compareAnswer, randomCombo } from '../../lib/frameEngine';
import { FramePattern } from '../FramePattern';
import { SpeakButton } from '../SpeakButton';
import { Button, Card, inputClass } from '../ui';
import { AnswerDiff } from './AnswerDiff';
import { GradeButtons } from './GradeButtons';

export interface TranslateResult {
  grades: Grade[];
  average: Grade;
  ms: number;
}

export interface TranslateDrillProps {
  frame: SubstitutionFrame;
  /** Number of Chinese prompts. Default 3. */
  count?: number;
  onDone: (result: TranslateResult) => void;
}

/** Pick `count` different random combos (as different as the frame allows). */
function pickPrompts(frame: SubstitutionFrame, count: number) {
  const seen = new Set<string>();
  const out = [];
  for (let tries = 0; out.length < count && tries < count * 20; tries++) {
    const c = randomCombo(frame);
    if (seen.has(c.en)) continue;
    seen.add(c.en);
    out.push(c);
  }
  while (out.length < count) out.push(randomCombo(frame));
  return out;
}

/** Palmer step 3 (中译英 multi-swap): Chinese prompt -> type the English -> diff -> self-grade. */
export function TranslateDrill({ frame, count = 3, onDone }: TranslateDrillProps) {
  const [startedAt] = useState(() => Date.now());
  const prompts = useMemo(() => pickPrompts(frame, count), [frame, count]);
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [showPattern, setShowPattern] = useState(false);
  const [grades, setGrades] = useState<Grade[]>([]);

  const combo = prompts[index];
  const comparison = useMemo(
    () => (submitted !== null && combo ? compareAnswer(submitted, combo.en) : null),
    [submitted, combo],
  );

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (submitted !== null || text.trim() === '') return;
    setSubmitted(text.trim());
  };

  const giveUp = () => {
    if (submitted === null) setSubmitted('');
  };

  const grade = (g: Grade) => {
    const all = [...grades, g];
    if (index + 1 >= prompts.length) {
      onDone({
        grades: all,
        average: averageGrade(all),
        ms: Math.min(600_000, Date.now() - startedAt),
      });
      return;
    }
    setGrades(all);
    setIndex(index + 1);
    setText('');
    setSubmitted(null);
    setShowPattern(false);
  };

  if (!combo) return null;

  return (
    <Card className="flex flex-col gap-4" aria-label="中译英">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400" aria-live="polite">
          第 {index + 1} / {prompts.length} 句
        </p>
        {submitted === null && (
          <button
            type="button"
            onClick={() => setShowPattern((v) => !v)}
            aria-pressed={showPattern}
            className="min-h-11 rounded-lg px-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            {showPattern ? '隐藏母框提示' : '看母框提示'}
          </button>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500">用母框「{frame.title}」译成英语</p>
        <p className="mt-1 text-2xl leading-snug font-bold text-slate-900 dark:text-white" data-testid="translate-zh">
          {combo.zh}
        </p>
      </div>

      {showPattern && submitted === null && <FramePattern frame={frame} />}

      {submitted === null ? (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="你的英语答案"
            placeholder="在这里输入英语，回车提交"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="send"
            lang="en"
            className={`${inputClass} font-en`}
          />
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Button type="submit" variant="primary" size="lg" disabled={text.trim() === ''}>
              提交
            </Button>
            <Button size="lg" onClick={giveUp}>
              不会，看答案
            </Button>
          </div>
        </form>
      ) : (
        comparison && (
          <div className="flex flex-col gap-4" role="status" aria-live="polite">
            {submitted !== '' && (
              <div>
                <p className="mb-1.5 text-sm text-slate-600 dark:text-slate-300">
                  你写的：<span className="font-en font-medium">{submitted}</span>
                </p>
                <AnswerDiff tokens={comparison.tokens} similarity={comparison.similarity} />
              </div>
            )}
            <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/70">
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500">参考答案</p>
              <div className="mt-1 flex items-center gap-3">
                <p className="font-en min-w-0 flex-1 text-xl leading-snug font-semibold text-slate-900 dark:text-white" data-testid="translate-answer">
                  {combo.en}
                </p>
                <SpeakButton text={combo.en} />
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">自评一下：</p>
              <GradeButtons suggested={suggestGrade(comparison.similarity)} onGrade={grade} />
            </div>
          </div>
        )
      )}
    </Card>
  );
}
