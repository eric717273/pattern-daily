import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AiFeedback, DozenSentence, Scene, SubstitutionFrame } from '../../types';
import { useActiveTimer } from '../../lib/activeTimer';
import { offlineOutputPrompts, type OutputPrompt } from '../../lib/drill';
import { AiError, aiConfigured, generateOutputPrompts, gradeOutput } from '../../lib/ai';
import { compareAnswer } from '../../lib/frameEngine';
import { saveAttempt } from '../../lib/repo';
import { useSettings } from '../../lib/settings';
import { AnswerDiff } from '../drills/AnswerDiff';
import { FramePattern } from '../FramePattern';
import { SpeakButton } from '../SpeakButton';
import { Badge, Button, Card, Spinner, cx, inputClass } from '../ui';

export interface OutputStepProps {
  dozen: DozenSentence;
  /** The day's frames. */
  frames: SubstitutionFrame[];
  scenes: Scene[];
  /** Date key: prompts are cached per day so a re-render never refetches. */
  dayKey: string;
  count: number;
  onComplete: (activeMs: number) => void | Promise<void>;
}

interface LoadedPrompts {
  prompts: OutputPrompt[];
  source: 'ai' | 'offline';
  notice?: string;
}

function cacheKey(dayKey: string, dozenId: string, frames: SubstitutionFrame[]): string {
  return `pd.output.${dayKey}.${dozenId}.${frames.map((f) => f.id).join(',')}`;
}

function readCache(key: string): OutputPrompt[] | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const ok = parsed.every(
      (p) => typeof p === 'object' && p !== null && typeof (p as { promptZh?: unknown }).promptZh === 'string',
    );
    return ok ? (parsed as OutputPrompt[]) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, prompts: OutputPrompt[]): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(prompts));
  } catch {
    // storage unavailable: the prompts are simply fetched again after a reload
  }
}

const inflight = new Map<string, Promise<OutputPrompt[]>>();

/** Ask the AI for today's prompts once per key, even if the component mounts twice (StrictMode). */
function fetchAiPrompts(
  key: string,
  input: { dozen: DozenSentence; frames: SubstitutionFrame[]; scenes: Scene[]; count: number },
): Promise<OutputPrompt[]> {
  const running = inflight.get(key);
  if (running) return running;
  const p = generateOutputPrompts(input)
    .then((items) => {
      const prompts: OutputPrompt[] = items.map((x) => ({
        promptZh: x.promptZh,
        skeletonEn: x.hintEn || input.dozen.en,
        vocabHint: x.hintEn !== '',
        refKind: 'dozen',
        refId: input.dozen.id,
      }));
      writeCache(key, prompts);
      return prompts;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

function scoreTone(score: number): 'emerald' | 'amber' | 'rose' {
  return score >= 85 ? 'emerald' : score >= 60 ? 'amber' : 'rose';
}

/** Step 4: write `count` own sentences on today's skeleton; graded by AI when configured, otherwise self-checked. */
export function OutputStep({ dozen, frames, scenes, dayKey, count, onComplete }: OutputStepProps) {
  const timer = useActiveTimer();
  const [settings] = useSettings();
  const aiOn = aiConfigured(settings);
  const key = useMemo(() => cacheKey(dayKey, dozen.id, frames), [dayKey, dozen.id, frames]);

  const [loaded, setLoaded] = useState<LoadedPrompts | null>(null);
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'write' | 'grading' | 'result'>('write');
  const [feedback, setFeedback] = useState<AiFeedback | null>(null);
  const [submitted, setSubmitted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load (or restore) today's prompts once.
  useEffect(() => {
    let cancelled = false;
    const offline = (notice?: string): LoadedPrompts => ({
      prompts: offlineOutputPrompts(dozen, frames, count, `${dayKey}|${dozen.id}`),
      source: 'offline',
      notice,
    });
    void (async () => {
      const cached = readCache(key);
      if (cached && cached.length >= count) {
        if (!cancelled) setLoaded({ prompts: cached.slice(0, count), source: 'ai' });
        return;
      }
      if (!aiConfigured()) {
        if (!cancelled) setLoaded(offline());
        return;
      }
      try {
        const prompts = await fetchAiPrompts(key, { dozen, frames, scenes, count });
        if (!cancelled) setLoaded({ prompts, source: 'ai' });
      } catch (e) {
        const why = e instanceof AiError ? e.message : 'AI 出题失败。';
        if (!cancelled) setLoaded(offline(`${why}已改用离线题目。`));
      }
    })();
    return () => {
      cancelled = true;
    };
    // The prompt set is fixed for the day; only reload if the day's content changes.
  }, [key, count, dozen, frames, scenes, dayKey]);

  if (!loaded) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center" aria-busy="true">
        <Spinner size={28} label="正在生成今日题目" />
        <p className="text-sm text-slate-500 dark:text-slate-400">AI 正在根据今天的骨架出题…</p>
      </Card>
    );
  }

  const prompt = loaded.prompts[index];
  const last = index + 1 >= loaded.prompts.length;
  const promptFrame = prompt?.frameId ? frames.find((f) => f.id === prompt.frameId) : undefined;
  const gradingAvailable = aiOn;

  const goNext = async () => {
    if (!last) {
      setIndex(index + 1);
      setText('');
      setPhase('write');
      setFeedback(null);
      setSubmitted('');
      setError(null);
      return;
    }
    setSaving(true);
    try {
      await onComplete(timer.read());
    } finally {
      setSaving(false);
    }
  };

  const persist = async (userEn: string, fb?: AiFeedback) => {
    await saveAttempt({
      refKind: prompt.refKind,
      refId: prompt.refId,
      promptZh: prompt.promptZh,
      userEn,
      feedback: fb,
    });
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const userEn = text.trim();
    if (!userEn || phase !== 'write') return;
    setSubmitted(userEn);
    setError(null);
    if (!gradingAvailable) {
      try {
        await persist(userEn);
      } catch {
        setError('保存失败，但不影响继续。');
      }
      setPhase('result');
      return;
    }
    setPhase('grading');
    try {
      const fb = await gradeOutput({
        promptZh: prompt.promptZh,
        skeletonEn: prompt.skeletonEn,
        grammar: dozen.grammar,
        userEn,
      });
      setFeedback(fb);
      try {
        await persist(userEn, fb);
      } catch {
        setError('保存失败，但不影响继续。');
      }
      setPhase('result');
    } catch (err) {
      setError(err instanceof AiError ? err.message : 'AI 批改失败，请重试。');
      setPhase('write');
    }
  };

  const skipGrading = async () => {
    const userEn = text.trim();
    if (!userEn) return;
    setSubmitted(userEn);
    setError(null);
    try {
      await persist(userEn);
    } catch {
      setError('保存失败，但不影响继续。');
    }
    setPhase('result');
  };

  const selfCheck = prompt.referenceEn !== undefined ? compareAnswer(submitted, prompt.referenceEn) : null;

  return (
    <div className="flex flex-col gap-4">
      {loaded.notice && (
        <p role="note" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {loaded.notice}
        </p>
      )}

      <Card className="flex flex-col gap-4" aria-label="模组替换输出">
        <div className="flex items-center justify-between gap-2">
          <Badge tone="violet">
            第 {index + 1} / {loaded.prompts.length} 句
          </Badge>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {gradingAvailable ? 'AI 批改' : '自查模式'}
          </span>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-400 dark:text-slate-500">用今天的骨架，把这句话说成英语</p>
          <p className="mt-1 text-2xl leading-snug font-bold text-slate-900 dark:text-white" data-testid="output-zh">
            {prompt.promptZh}
          </p>
          <div className="mt-3 rounded-xl bg-slate-100 px-3.5 py-2.5 dark:bg-slate-800/70">
            {prompt.vocabHint ? (
              <>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">提示词汇</p>
                <p className="font-en mt-0.5 text-[17px] font-medium text-slate-800 dark:text-slate-100">{prompt.skeletonEn}</p>
                <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">今日骨架</p>
                <p className="font-en mt-0.5 text-[17px] font-medium text-slate-800 dark:text-slate-100">
                  骨架：{dozen.en}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">用这个骨架</p>
                {promptFrame ? (
                  <FramePattern frame={promptFrame} className="mt-0.5" />
                ) : (
                  <p className="font-en mt-0.5 text-[17px] font-medium text-slate-800 dark:text-slate-100">{prompt.skeletonEn}</p>
                )}
              </>
            )}
          </div>
        </div>

        {phase !== 'result' && (
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
            <input
              type="text"
              value={text}
              disabled={phase === 'grading'}
              onChange={(e) => setText(e.target.value)}
              aria-label="你造的英语句子"
              placeholder="在这里写英语句子"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="send"
              lang="en"
              className={cx(inputClass, 'font-en')}
            />
            <Button type="submit" variant="primary" size="lg" full disabled={text.trim() === '' || phase === 'grading'}>
              {phase === 'grading' ? (
                <>
                  <Spinner size={18} label="AI 批改中" />
                  AI 批改中…
                </>
              ) : gradingAvailable ? (
                'AI 批改'
              ) : (
                '提交并自查'
              )}
            </Button>
            {error && (
              <div role="alert" className="flex flex-col gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                <p>{error}</p>
                {gradingAvailable && (
                  <Button size="sm" onClick={() => void skipGrading()} disabled={text.trim() === ''}>
                    跳过批改，直接保存
                  </Button>
                )}
              </div>
            )}
          </form>
        )}

        {phase === 'result' && (
          <div className="flex flex-col gap-4" role="status" aria-live="polite">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              你写的：<span className="font-en font-medium">{submitted}</span>
            </p>

            {feedback && (
              <div className="flex flex-col gap-3" data-testid="ai-feedback">
                <div className="flex items-center gap-3">
                  <Badge tone={scoreTone(feedback.score)} className="px-3 py-1 text-sm">
                    得分 {feedback.score}
                  </Badge>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {feedback.correct ? '语法正确' : '有需要修改的地方'}
                  </span>
                </div>
                <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/30">
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">修改后</p>
                  <div className="mt-1 flex items-center gap-3">
                    <p className="font-en min-w-0 flex-1 text-xl leading-snug font-semibold text-slate-900 dark:text-white" data-testid="ai-corrected">
                      {feedback.corrected}
                    </p>
                    <SpeakButton text={feedback.corrected} />
                  </div>
                </div>
                <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">{feedback.explanationZh}</p>
                {feedback.alternatives.length > 0 && (
                  <div>
                    <p className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">其他自然的说法</p>
                    <ul className="flex flex-col gap-1">
                      {feedback.alternatives.map((a, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="font-en min-w-0 flex-1 text-[15px] text-slate-800 dark:text-slate-200">{a}</span>
                          <SpeakButton text={a} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {!feedback && (
              <div className="flex flex-col gap-3">
                {prompt.referenceEn !== undefined && selfCheck ? (
                  <>
                    <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/70">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">参考句子</p>
                      <div className="mt-1 flex items-center gap-3">
                        <p className="font-en min-w-0 flex-1 text-xl leading-snug font-semibold text-slate-900 dark:text-white" data-testid="output-reference">
                          {prompt.referenceEn}
                        </p>
                        <SpeakButton text={prompt.referenceEn} />
                      </div>
                    </div>
                    <AnswerDiff tokens={selfCheck.tokens} similarity={selfCheck.similarity} />
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      用词不同没关系，只要骨架和语法对就行。对照一下：主语、动词形式、语序有没有错？
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    自己检查一下：骨架对吗？动词形式、语序有没有错？
                  </p>
                )}
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
                {error}
              </p>
            )}

            <Button variant="primary" size="lg" full disabled={saving} onClick={() => void goNext()}>
              {last ? '完成今日练习' : '下一句'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
