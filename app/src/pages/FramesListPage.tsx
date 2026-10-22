import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { GrammarPoint, Scene, SubstitutionFrame } from '../types';
import { FramePattern } from '../components/FramePattern';
import { GenerateFrameSheet } from '../components/GenerateFrameSheet';
import { ChevronRightIcon, SearchIcon, SparklesIcon } from '../components/icons';
import { Badge, Button, Card, EmptyState, PageHeader, PageLoading, Segmented, inputClass } from '../components/ui';
import { countCombos } from '../lib/frameEngine';
import { useAllFrames } from '../lib/hooks';
import {
  FRAME_LEVEL_LABELS,
  FRAME_LEVELS,
  GRAMMAR_LABELS,
  GRAMMAR_POINTS,
  SCENE_LABELS,
  SCENES,
} from '../lib/labels';

type SceneFilter = Scene | 'all';
type LevelFilter = 1 | 2 | 3 | 0;

function matches(f: SubstitutionFrame, q: string): boolean {
  if (!q) return true;
  const hay = [f.title, f.pattern, f.patternZh, ...f.examples.flatMap((e) => [e.en, e.zh])].join('\n').toLowerCase();
  return hay.includes(q);
}

export function FramesListPage() {
  const frames = useAllFrames();
  const navigate = useNavigate();
  const [scene, setScene] = useState<SceneFilter>('all');
  const [level, setLevel] = useState<LevelFilter>(0);
  const [grammar, setGrammar] = useState<GrammarPoint | 'all'>('all');
  const [query, setQuery] = useState('');
  const [aiOpen, setAiOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (frames ?? []).filter(
        (f) =>
          (scene === 'all' || f.scene === scene) &&
          (level === 0 || f.level === level) &&
          (grammar === 'all' || f.grammar.includes(grammar)) &&
          matches(f, q),
      ),
    [frames, scene, level, grammar, q],
  );

  return (
    <>
      <PageHeader
        title="母框"
        subtitle="帕默替换表：固定骨架，每列换词，组合出成百上千句。"
        actions={
          <Button variant="primary" size="sm" onClick={() => setAiOpen(true)}>
            <SparklesIcon size={18} />
            AI 生成
          </Button>
        }
      />

      <div className="mb-5 flex flex-col gap-3">
        <div className="relative">
          <SearchIcon size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            className={`${inputClass} pl-10`}
            placeholder="搜索标题、句型或例句"
            aria-label="搜索母框"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Segmented
          ariaLabel="场景"
          options={[{ value: 'all' as SceneFilter, label: '全部场景' }, ...SCENES.map((s) => ({ value: s as SceneFilter, label: SCENE_LABELS[s] }))]}
          value={scene}
          onChange={setScene}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            ariaLabel="难度"
            options={[{ value: 0 as LevelFilter, label: '全部难度' }, ...FRAME_LEVELS.map((l) => ({ value: l as LevelFilter, label: FRAME_LEVEL_LABELS[l] }))]}
            value={level}
            onChange={setLevel}
          />
          <select
            aria-label="语法点"
            className={`${inputClass} w-auto! min-w-0 flex-1 basis-40`}
            value={grammar}
            onChange={(e) => setGrammar(e.target.value as GrammarPoint | 'all')}
          >
            <option value="all">全部语法点</option>
            {GRAMMAR_POINTS.map((g) => (
              <option key={g} value={g}>
                {GRAMMAR_LABELS[g]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!frames ? (
        <PageLoading />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="没有符合条件的母框"
          description="换个筛选条件，或者让 AI 按你的主题生成一个。"
          action={
            <Button
              onClick={() => {
                setScene('all');
                setLevel(0);
                setGrammar('all');
                setQuery('');
              }}
            >
              清除筛选
            </Button>
          }
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">共 {filtered.length} 个母框</p>
          <ul className="flex flex-col gap-3">
            {filtered.map((f) => (
              <li key={f.id}>
                <Link to={`/frames/${f.id}`} className="block rounded-2xl" aria-label={f.title}>
                  <Card interactive className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="mr-1 text-base font-semibold text-slate-900 dark:text-white">{f.title}</p>
                        <Badge tone="slate">{SCENE_LABELS[f.scene]}</Badge>
                        <Badge tone={f.level === 1 ? 'emerald' : f.level === 2 ? 'amber' : 'rose'}>
                          {FRAME_LEVEL_LABELS[f.level]}
                        </Badge>
                        {f.source !== 'seed' && <Badge tone="violet">{f.source === 'ai' ? 'AI 生成' : '自建'}</Badge>}
                      </div>
                      <FramePattern frame={f} className="mt-2" />
                      <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                        可组合 {countCombos(f).toLocaleString('en-US')} 句
                      </p>
                    </div>
                    <ChevronRightIcon size={20} className="mt-1 shrink-0 text-slate-300 dark:text-slate-600" />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <GenerateFrameSheet
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onSaved={(f) => {
          setAiOpen(false);
          void navigate(`/frames/${f.id}`);
        }}
      />
    </>
  );
}
