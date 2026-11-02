import { useLiveQuery } from 'dexie-react-hooks';
import { memo, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DIALOGUES, SOUNDS } from '../../content';
import type { Dialogue, DialogueTier, Scene, SoundPattern } from '../../types';
import { ChevronRightIcon } from '../../components/icons';
import { Badge, Card, PageHeader, Segmented, cx, type Tone } from '../../components/ui';
import { db } from '../../lib/db';
import { SCENES, SCENE_LABELS } from '../../lib/labels';
import { listenRate } from '../../lib/ladder';
import { DEFAULT_PRACTICE_RATE, PRACTICE_RATES, TIER_LABELS, filterDialogues, groupSoundsByLevel, snapRate } from '../../lib/listening';

const TIER_TONE: Record<DialogueTier, Tone> = { 1: 'emerald', 2: 'sky', 3: 'violet' };
const LEVEL_LABELS: Record<1 | 2 | 3, string> = { 1: '最常见 · 先学这些', 2: '常见', 3: '进阶细节' };
const ROW_PERF = '[content-visibility:auto] [contain-intrinsic-size:auto_68px]';

/** Ids of practised dialogues / sounds: a ReviewLog with cardId 'dialogue:<id>' / 'sound:<id>' exists. */
function useHeard(prefix: 'dialogue' | 'sound'): Set<string> | undefined {
  return useLiveQuery(async () => {
    const rows = await db.reviews.where('cardId').startsWith(`${prefix}:`).toArray();
    return new Set(rows.filter((r) => !r.deleted).map((r) => r.cardId.slice(prefix.length + 1)));
  }, [prefix]);
}

/** Listening level the ladder is at (undefined before the first plan). */
function useLadderRate(): number | undefined {
  return useLiveQuery(async () => {
    const profiles = await db.profile.toArray();
    const p = profiles.find((x) => !x.deleted);
    const level = p?.adaptive?.ladder.listen;
    return level === undefined ? undefined : snapRate(listenRate(level));
  }, []);
}

function HeardDot({ heard, label }: { heard: boolean; label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center" title={heard ? `${label}：听过` : `${label}：没听过`}>
      <span
        className={cx('size-2.5 rounded-full', heard ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600')}
        aria-hidden="true"
      />
      <span className="sr-only">{heard ? '练过' : '没练过'}</span>
    </span>
  );
}

const DialogueRow = memo(function DialogueRow({ d, heard, rate }: { d: Dialogue; heard: boolean; rate: number }) {
  return (
    <li className={ROW_PERF}>
      <Link to={`/listening/dialogue/${d.id}?rate=${rate}`} className="block rounded-2xl">
        <Card interactive padded={false} className="flex items-center gap-3 px-4 py-3">
          <HeardDot heard={heard} label={d.title} />
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium text-slate-900 dark:text-slate-100">{d.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone={TIER_TONE[d.tier]}>{TIER_LABELS[d.tier]}</Badge>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {SCENE_LABELS[d.scene]} · {d.turns.length} 句
              </span>
            </div>
          </div>
          <ChevronRightIcon size={20} className="shrink-0 text-slate-300 dark:text-slate-600" />
        </Card>
      </Link>
    </li>
  );
});

function SoundRow({ s, heard, rate }: { s: SoundPattern; heard: boolean; rate: number }) {
  return (
    <li>
      <Link to={`/listening/sound/${s.id}?rate=${rate}`} className="block rounded-2xl">
        <Card interactive padded={false} className="flex items-center gap-3 px-4 py-3">
          <HeardDot heard={heard} label={s.name} />
          <p className="font-en min-w-0 flex-1 text-[16px] font-medium text-slate-900 dark:text-slate-100">{s.name}</p>
          <ChevronRightIcon size={18} className="shrink-0 text-slate-300 dark:text-slate-600" />
        </Card>
      </Link>
    </li>
  );
}

export function ListeningHubPage() {
  const [params] = useSearchParams();
  const ladderRate = useLadderRate();
  const heardDialogues = useHeard('dialogue');
  const heardSounds = useHeard('sound');
  const [tier, setTier] = useState<DialogueTier | 0>(0);
  const [scene, setScene] = useState<Scene | 'all'>('all');
  const [picked, setPicked] = useState<number | null>(() => {
    const r = Number(params.get('rate'));
    return Number.isFinite(r) && r > 0 ? snapRate(r) : null;
  });
  const rate = picked ?? ladderRate ?? DEFAULT_PRACTICE_RATE;

  const dialogues = useMemo(() => filterDialogues(DIALOGUES, { tier, scene }), [tier, scene]);
  const groups = useMemo(() => groupSoundsByLevel(SOUNDS), []);
  const heardD = heardDialogues?.size ?? 0;
  const heardS = heardSounds?.size ?? 0;

  return (
    <>
      <PageHeader title="听力" subtitle="专练日常听力：听整段对话、听写关键语块、听清连读弱读、听懂数字。" />

      <Card className="mb-5">
        <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">
          真实的口语是连着说的：going to 听起来像 gonna，what do you 像 whaddaya。单词都认识却听不出来，多半是不熟悉这些连读和弱读。
        </p>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">
          所以先听大意，再听写关键语块，最后对照原文；单句音变和数字另有专项。
        </p>
      </Card>

      <section className="mb-6" aria-label="听力语速">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">练习语速</h2>
          <Segmented<number>
            ariaLabel="语速"
            value={rate}
            onChange={setPicked}
            options={PRACTICE_RATES.map((r) => ({ value: r, label: `${r.toFixed(2).replace(/0$/, '')}×` }))}
          />
        </div>
        {ladderRate !== undefined && picked === null && (
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">默认按你当前的听力等级。</p>
        )}
      </section>

      <section className="mb-8" aria-label="对话">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">日常对话</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            练过 <span className="tabular-nums">{heardD}</span> / {DIALOGUES.length}
          </p>
        </div>
        <div className="mb-3 flex flex-col gap-2.5">
          <Segmented<DialogueTier | 0>
            ariaLabel="难度"
            value={tier}
            onChange={setTier}
            options={[
              { value: 0, label: '全部' },
              { value: 1, label: TIER_LABELS[1] },
              { value: 2, label: TIER_LABELS[2] },
              { value: 3, label: TIER_LABELS[3] },
            ]}
          />
          <Segmented<Scene | 'all'>
            ariaLabel="场景"
            value={scene}
            onChange={setScene}
            options={[{ value: 'all', label: '全部场景' }, ...SCENES.map((s) => ({ value: s, label: SCENE_LABELS[s] }))]}
          />
        </div>
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400" data-testid="dialogue-count">
          共 {dialogues.length} 段
        </p>
        {dialogues.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">这个组合下没有对话，换个场景试试。</p>
        ) : (
          <ul className="flex flex-col gap-2.5" aria-label="对话列表">
            {dialogues.map((d) => (
              <DialogueRow key={d.id} d={d} heard={heardDialogues?.has(d.id) ?? false} rate={rate} />
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8" aria-label="语流音变">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">连读弱读专项</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            练过 <span className="tabular-nums">{heardS}</span> / {SOUNDS.length}
          </p>
        </div>
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.level}>
              <h3 className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                第 {g.level} 级 · {LEVEL_LABELS[g.level]}
              </h3>
              <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2" aria-label={`第 ${g.level} 级音变`}>
                {g.sounds.map((s) => (
                  <SoundRow key={s.id} s={s} heard={heardSounds?.has(s.id) ?? false} rate={rate} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="数字听写">
        <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">数字听写</h2>
        <Link to={`/listening/numbers?rate=${rate}`} className="block rounded-2xl">
          <Card interactive padded={false} className="flex items-center gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium text-slate-900 dark:text-slate-100">价格、时间、日期、电话、数量、年份</p>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">每次随机生成，写下听到的数字。</p>
            </div>
            <ChevronRightIcon size={20} className="shrink-0 text-slate-300 dark:text-slate-600" />
          </Card>
        </Link>
      </section>
    </>
  );
}
