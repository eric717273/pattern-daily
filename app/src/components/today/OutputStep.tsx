import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getItem, type LibraryItem } from '../../content';
import type { AiFeedback, DayPlan, ItemRef, Scene } from '../../types';
import { useActiveTimer } from '../../lib/activeTimer';
import { AiError, aiConfigured, generateChunkPrompts, gradeOutput } from '../../lib/ai';
import { compareAnswer } from '../../lib/frameEngine';
import { useAllFrames } from '../../lib/hooks';
import { saveAttempt } from '../../lib/repo';
import { useSettings } from '../../lib/settings';
import { idOf, offlineChunkPrompts, pickOutputTargets, targetChunkOf, type ChunkOutputPrompt } from '../../lib/today';
import { AnswerDiff } from '../drills/AnswerDiff';
import { MicButton } from '../drills/MicButton';
import { FramePattern } from '../FramePattern';
import { SpeakButton } from '../SpeakButton';
import { Badge, Button, Card, EmptyState, PageLoading, Spinner, cx, inputClass } from '../ui';

export interface OutputStepProps {
  plan: DayPlan;
  scenes: Scene[];
  /** Date key: AI prompts are cached per day so a re-render or reload never refetches. */
  dayKey: string;
  onComplete: (activeMs: number) => void | Promise<void>;
}

interface Loaded {
  prompts: ChunkOutputPrompt[];
  source: 'ai' | 'offline';
  notice?: string;
}

interface CachedPrompt {
  promptZh: string;
  hintEn: string;
  targetId: string;
}

// ---------- AI prompts: cached for the day, one request in flight per key ----------

function cacheKey(dayKey: string, ids: readonly string[]): string {
  return `pd.output2.${dayKey}.${ids.join(',')}`;
}

function readCache(key: string): CachedPrompt[] | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const ok = parsed.every((p) => {
      const o = p as Partial<CachedPrompt> | null;
      return typeof o === 'object' && o !== null && typeof o.promptZh === 'string' && typeof o.targetId === 'string';
    });
    return ok ? (parsed as CachedPrompt[]) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, prompts: CachedPrompt[]): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(prompts));
  } catch {
    // storage unavailable: the prompts are simply fetched again after a reload
  }
}

const inflight = new Map<string, Promise<CachedPrompt[]>>();

function fetchAiPrompts(
  key: string,
  items: LibraryItem[],
  scenes: Scene[],
  count: number,
): Promise<CachedPrompt[]> {
  const running = inflight.get(key);
  if (running) return running;
  const p = generateChunkPrompts({ items, scenes, count })
    .then((list) => {
      writeCache(key, list);
      return list;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

function fromCached(cached: CachedPrompt[], items: LibraryItem[]): ChunkOutputPrompt[] | null {
  const out: ChunkOutputPrompt[] = [];
  for (const c of cached) {
    const item = items.find((it) => idOf(it) === c.targetId);
    if (!item) return null;
    out.push({
      promptZh: c.promptZh,
      hintEn: c.hintEn,
      target: item.kind === 'chunk' ? { kind: 'chunk', id: item.chunk.id } : { kind: 'frame', id: item.frame.id },
      targetChunk: targetChunkOf(item),
      frame: item.kind === 'frame' ? item.frame : undefined,
    });
  }
  return out;
}

function scoreTone(score: number): 'emerald' | 'amber' | 'rose' {
  return score >= 85 ? 'emerald' : score >= 60 ? 'amber' : 'rose';
}

/**
 * Step 4 输出: `plan.outputCount` small situations that need today's new chunks. With AI configured the situations are
 * generated and the answers graded for how naturally the chunk was used (no grammar analysis); otherwise the
 * questions are built offline and the learner checks themselves against a model sentence.
 */
export function OutputStep({ plan, scenes, dayKey, onComplete }: OutputStepProps) {
  const timer = useActiveTimer();
  const [settings] = useSettings();
  const gradingAvailable = aiConfigured(settings);
  const frames = useAllFrames();
  const count = plan.outputCount;

  const [targets, setTargets] = useState<ItemRef[] | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'write' | 'grading' | 'result'>('write');
  const [feedback, setFeedback] = useState<AiFeedback | null>(null);
  const [submitted, setSubmitted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Today's targets are read once when the step opens.
  useEffect(() => {
    let cancelled = false;
    pickOutputTargets(plan)
      .then((t) => {
        if (!cancelled) setTargets(t);
      })
      .catch(() => {
        if (!cancelled) setTargets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [plan]);

  const items = useMemo<LibraryItem[] | null>(() => {
    if (!targets || !frames) return null;
    return targets.flatMap((t) => {
      const it = getItem(t, frames);
      return it ? [it] : [];
    });
  }, [targets, frames]);

  // Build (or restore) the day's questions once the items are known.
  const itemsKey = items ? items.map(idOf).join(',') : null;
  useEffect(() => {
    if (!items || items.length === 0) return;
    let cancelled = false;
    const key = cacheKey(dayKey, items.map(idOf));
    const offline = (notice?: string): Loaded => ({
      prompts: offlineChunkPrompts(items, count, `${dayKey}|${items.map(idOf).join(',')}`),
      source: 'offline',
      notice,
    });
    void (async () => {
      if (aiConfigured()) {
        const cached = readCache(key);
        const restored = cached && cached.length >= count ? fromCached(cached.slice(0, count), items) : null;
        if (restored) {
          if (!cancelled) setLoaded({ prompts: restored, source: 'ai' });
          return;
        }
        try {
          const list = await fetchAiPrompts(key, items, scenes, count);
          const prompts = fromCached(list, items);
          if (!prompts) throw new AiError('bad-response', 'AI 返回的题目不完整。');
          if (!cancelled) setLoaded({ prompts, source: 'ai' });
        } catch (e) {
          const why = e instanceof AiError ? e.message : 'AI 出题失败。';
          if (!cancelled) setLoaded(offline(`${why}已改用离线题目。`));
        }
        return;
      }
      if (!cancelled) setLoaded(offline());
    })();
    return () => {
      cancelled = true;
    };
    // The set of questions is fixed for the day; reload only when the targets themselves change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, count, dayKey, scenes]);

  const finish = async () => {
    setSaving(true);
    try {
      await onComplete(timer.read());
    } finally {
      setSaving(false);
    }
  };

  if (!targets || !items) return <PageLoading />;

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          title="今天没有可出题的语块"
          description="先学几条新语块，输出练习才有东西可用。"
          action={
            <Button variant="primary" size="lg" disabled={saving} onClick={() => void finish()}>
              完成今日练习
            </Button>
          }
        />
      </Card>
    );
  }

  if (!loaded) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center" aria-busy="true">
        <Spinner size={28} label="正在生成今日题目" />
        <p className="text-sm text-slate-500 dark:text-slate-400">AI 正在根据今天的语块出题…</p>
      </Card>
    );
  }

  const prompt = loaded.prompts[index];
  if (!prompt) return <EmptyState title="没有题目" description="请刷新页面重试。" />;
  const last = index + 1 >= loaded.prompts.length;

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
    await finish();
  };

  const persist = async (userEn: string, fb?: AiFeedback) => {
    await saveAttempt({
      refKind: prompt.target.kind,
      refId: prompt.target.id,
      promptZh: prompt.promptZh,
      userEn,
      feedback: fb,
    });
  };

  const saveOnly = async (userEn: string) => {
    setSubmitted(userEn);
    setError(null);
    try {
      await persist(userEn);
    } catch {
      setError('保存失败，但不影响继续。');
    }
    setPhase('result');
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const userEn = text.trim();
    if (!userEn || phase !== 'write') return;
    if (!gradingAvailable) {
      await saveOnly(userEn);
      return;
    }
    setSubmitted(userEn);
    setError(null);
    setPhase('grading');
    try {
      const fb = await gradeOutput({ promptZh: prompt.promptZh, userEn, targetChunk: prompt.targetChunk });
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

  const selfCheck = prompt.referenceEn !== undefined ? compareAnswer(submitted, prompt.referenceEn) : null;

  return (
    <div className="flex flex-col gap-4">
      {loaded.notice && (
        <p role="note" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {loaded.notice}
        </p>
      )}

      <Card className="flex flex-col gap-4" aria-label="情景输出">
        <div className="flex items-center justify-between gap-2">
          <Badge tone="violet" data-testid="output-progress">
            第 {index + 1} / {loaded.prompts.length} 题
          </Badge>
          <span className="text-xs text-slate-400 dark:text-slate-500">{gradingAvailable ? 'AI 批改' : '自查模式'}</span>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-400 dark:text-slate-500">用今天学的语块，把这句话说成英语</p>
          <p className="mt-1 text-2xl leading-snug font-bold text-slate-900 dark:text-white" data-testid="output-zh">
            {prompt.promptZh}
          </p>
          {(prompt.hintEn || prompt.hintZh || prompt.frame) && (
            <div className="mt-3 rounded-xl bg-slate-100 px-3.5 py-2.5 dark:bg-slate-800/70">
              {prompt.hintZh && (
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200" data-testid="output-hint">
                  {prompt.hintZh}
                </p>
              )}
              {prompt.hintEn && (
                <>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">提示词汇</p>
                  <p className="font-en mt-0.5 text-[17px] font-medium text-slate-800 dark:text-slate-100" data-testid="output-hint">
                    {prompt.hintEn}
                  </p>
                </>
              )}
              {prompt.frame && <FramePattern frame={prompt.frame} className="mt-1" />}
            </div>
          )}
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
            <MicButton onResult={(t) => setText(t)} label="用说的" />
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
                  <Button size="sm" onClick={() => void saveOnly(text.trim())} disabled={text.trim() === ''}>
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
                    {feedback.correct ? '语块用得自然' : '有可以改进的地方'}
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
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">参考说法</p>
                      <div className="mt-1 flex items-center gap-3">
                        <p className="font-en min-w-0 flex-1 text-xl leading-snug font-semibold text-slate-900 dark:text-white" data-testid="output-reference">
                          {prompt.referenceEn}
                        </p>
                        <SpeakButton text={prompt.referenceEn} />
                      </div>
                    </div>
                    <AnswerDiff tokens={selfCheck.tokens} similarity={selfCheck.similarity} />
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      用词不同没关系，对照一下：目标语块有没有用上？说得顺不顺？
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">自己检查一下：目标语块用上了吗？说得自然吗？</p>
                )}
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
                {error}
              </p>
            )}

            <Button variant="primary" size="lg" full disabled={saving} onClick={() => void goNext()}>
              {last ? '完成今日练习' : '下一题'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
