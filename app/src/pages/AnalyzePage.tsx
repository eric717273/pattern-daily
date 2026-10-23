import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DeconstructionView } from '../components/analyze/DeconstructionView';
import { AnalyzeIcon, SparklesIcon } from '../components/icons';
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  SectionTitle,
  Spinner,
  inputClass,
} from '../components/ui';
import { AiError, aiConfigured, deconstruct, type Deconstruction } from '../lib/ai';
import { useSettings } from '../lib/settings';

const SAMPLES = [
  'I would like to schedule a meeting with the team to discuss the project timeline next week.',
  'Could you send me the updated numbers before the meeting starts?',
  'She told me that the report would have been finished if they had given her more time.',
];

const HISTORY_KEY = 'pd.analyzeHistory';
const HISTORY_MAX = 10;

interface HistoryItem {
  at: number;
  result: Deconstruction;
}

function isHistoryItem(v: unknown): v is HistoryItem {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as { at?: unknown; result?: unknown };
  if (typeof o.at !== 'number' || typeof o.result !== 'object' || o.result === null) return false;
  const r = o.result as Record<string, unknown>;
  return (
    typeof r.en === 'string' &&
    typeof r.zh === 'string' &&
    typeof r.skeleton === 'string' &&
    Array.isArray(r.alignment) &&
    Array.isArray(r.grammar) &&
    typeof r.nearestDozenId === 'string' &&
    typeof r.explanationZh === 'string'
  );
}

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isHistoryItem).slice(0, HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_MAX)));
  } catch {
    // storage unavailable: history is simply not kept
  }
}

/** 解构: AI 指令 ① - break any English sentence into its skeleton. */
export function AnalyzePage() {
  const [settings] = useSettings();
  const configured = aiConfigured(settings);
  const [params] = useSearchParams();
  const prefill = (params.get('s') ?? '').trim();
  // ?s=<sentence> (e.g. the chunk track's "看结构" button): prefill the box and analyse right away
  const autoStart = configured && prefill !== '';
  const autoRan = useRef(false);
  const [text, setText] = useState(prefill);
  const [busy, setBusy] = useState(autoStart);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Deconstruction | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);

  const execute = async (en: string) => {
    try {
      const r = await deconstruct(en);
      setResult(r);
      const next = [{ at: Date.now(), result: r }, ...history.filter((h) => h.result.en !== r.en)].slice(0, HISTORY_MAX);
      setHistory(next);
      saveHistory(next);
    } catch (e) {
      setError(e instanceof AiError ? e.message : '解构失败，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  const run = () => {
    const en = text.trim();
    if (!en || busy) return;
    setBusy(true);
    setError(null);
    void execute(en);
  };

  useEffect(() => {
    if (!autoStart || autoRan.current) return;
    autoRan.current = true;
    void execute(prefill);
    // once per page visit, with the sentence the page was opened with
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subtitle = '把任何一句英语拆成骨架：逐字对照、语法点和最接近的解构句。';

  if (!configured) {
    return (
      <>
        <PageHeader title="AI 解构" subtitle={subtitle} backTo="/decode" backLabel="解码" />
        <Card>
          <EmptyState
            icon={<AnalyzeIcon size={36} />}
            title="需要先设置 AI"
            description={
              <>
                解构由 DeepSeek 完成：贴一句你在工作或电影里遇到的长句，几秒钟就能看到它的骨架、逐字中英对照和对应的语法点。
                填入你自己的 DeepSeek API Key 后即可使用（Key 只保存在本机）。
                {prefill && (
                  <span className="font-en mt-2 block rounded-lg bg-slate-100 px-3 py-2 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {prefill}
                  </span>
                )}
              </>
            }
            action={
              <ButtonLink to="/me" variant="primary">
                去「我的」设置 AI
              </ButtonLink>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="AI 解构" subtitle={subtitle} backTo="/decode" backLabel="解码" />

      <Card className="mb-5">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <label htmlFor="analyze-input" className="text-sm font-medium text-slate-700 dark:text-slate-300">
            输入一句英语
          </label>
          <textarea
            id="analyze-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="例如：I would like to schedule a meeting with the team…"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            lang="en"
            className={`${inputClass} font-en min-h-24 resize-y py-2.5 leading-relaxed`}
          />
          <div className="flex flex-wrap gap-2" aria-label="示例句子" role="group">
            {SAMPLES.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => setText(s)}
                className="min-h-11 rounded-full border border-slate-300 bg-white px-3.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                示例 {i + 1}
              </button>
            ))}
          </div>
          <Button type="submit" variant="primary" size="lg" full disabled={busy || text.trim() === ''}>
            {busy ? (
              <>
                <Spinner size={18} label="解构中" />
                解构中…
              </>
            ) : (
              <>
                <SparklesIcon size={18} />
                解构
              </>
            )}
          </Button>
          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </p>
          )}
        </form>
      </Card>

      {result && <DeconstructionView key={result.en + result.skeleton} result={result} />}

      {history.length > 0 && (
        <section className="mt-8" aria-label="最近解构">
          <SectionTitle
            aside={
              <button
                type="button"
                onClick={() => {
                  setHistory([]);
                  saveHistory([]);
                }}
                className="-mr-2 min-h-11 rounded-lg px-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                清空
              </button>
            }
          >
            最近解构
          </SectionTitle>
          <Card as="ul" padded={false} className="divide-y divide-slate-100 dark:divide-slate-800">
            {history.map((h) => (
              <li key={h.at}>
                <button
                  type="button"
                  onClick={() => {
                    setResult(h.result);
                    setText(h.result.en);
                    window.scrollTo?.({ top: 0, behavior: 'smooth' });
                  }}
                  className="block min-h-14 w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <span className="font-en block truncate text-[15px] font-medium text-slate-900 dark:text-slate-100">
                    {h.result.en}
                  </span>
                  <span className="block truncate text-sm text-slate-500 dark:text-slate-400">{h.result.zh}</span>
                </button>
              </li>
            ))}
          </Card>
        </section>
      )}
    </>
  );
}
