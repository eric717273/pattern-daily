import { useState } from 'react';
import type { Grade } from '../../types';
import { suggestGrade, type FlashPrompt } from '../../lib/drill';
import { compareAnswer } from '../../lib/frameEngine';
import { gradeCard } from '../../lib/repo';
import { SpeakButton } from '../SpeakButton';
import { Badge, Button, Card } from '../ui';
import { AnswerDiff } from './AnswerDiff';
import { GradeButtons } from './GradeButtons';
import { MicButton } from './MicButton';

export interface FlashcardProps {
  prompt: FlashPrompt;
  /** 1-based position in the queue, for the "3 / 10" label. */
  index: number;
  total: number;
  /** Called after the grade was written through repo.gradeCard. */
  onGraded: (grade: Grade, ms: number) => void;
}

/** Recall drill: Chinese prompt -> say it aloud -> reveal English -> grade (writes the review through the repo). */
export function Flashcard({ prompt, index, total, onGraded }: FlashcardProps) {
  const [startedAt] = useState(() => Date.now());
  const [revealed, setRevealed] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const comparison = heard !== null ? compareAnswer(heard, prompt.answerEn) : null;

  const grade = async (g: Grade) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const ms = Math.min(120_000, Date.now() - startedAt);
    try {
      await gradeCard(prompt.cardId, g, 'review', ms);
    } catch {
      setError('保存复习结果失败，已跳过这张卡片。');
    }
    setBusy(false);
    onGraded(g, ms);
  };

  return (
    <Card className="flex flex-col gap-4" aria-label="复习卡片">
      <div className="flex items-center justify-between gap-2">
        <Badge tone={prompt.kind === 'dozen' ? 'indigo' : 'emerald'}>{prompt.title}</Badge>
        <span className="text-sm text-slate-500 dark:text-slate-400" aria-label={`第 ${index} 张，共 ${total} 张`}>
          {index} / {total}
        </span>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500">用英语说出这句话</p>
        <p className="mt-1 text-2xl leading-snug font-bold text-slate-900 dark:text-white" data-testid="flash-prompt">
          {prompt.promptZh}
        </p>
        {prompt.skeletonEn && (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            骨架: <span className="font-en font-medium text-slate-700 dark:text-slate-200">{prompt.skeletonEn}</span>
          </p>
        )}
      </div>

      {!revealed && (
        <div className="flex flex-col gap-3">
          <MicButton onResult={(t) => setHeard(t)} label="说出来" />
          {comparison && heard !== null && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              识别到：<span className="font-en font-medium">{heard}</span>
            </p>
          )}
          <Button variant="primary" size="lg" full onClick={() => setRevealed(true)}>
            显示答案
          </Button>
        </div>
      )}

      {revealed && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/70">
            <div className="flex items-start gap-3">
              <p className="font-en min-w-0 flex-1 text-xl leading-snug font-semibold text-slate-900 dark:text-white" data-testid="flash-answer">
                {prompt.answerEn}
              </p>
              <SpeakButton text={prompt.answerEn} />
            </div>
          </div>
          {comparison && heard !== null && (
            <div>
              <p className="mb-1.5 text-sm text-slate-600 dark:text-slate-300">
                你说的：<span className="font-en font-medium">{heard}</span>
              </p>
              <AnswerDiff tokens={comparison.tokens} similarity={comparison.similarity} />
            </div>
          )}
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">想起来了吗？</p>
            <GradeButtons
              disabled={busy}
              suggested={comparison ? suggestGrade(comparison.similarity) : undefined}
              onGrade={(g) => void grade(g)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
