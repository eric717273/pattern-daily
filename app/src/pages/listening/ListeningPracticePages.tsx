import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getDialogue, getSound } from '../../content';
import { DialogueListen, type DialogueListenResult } from '../../components/listening/DialogueListen';
import { NumbersDrill, type NumbersDrillResult } from '../../components/listening/NumbersDrill';
import { SoundDrill, type SoundDrillResult } from '../../components/listening/SoundDrill';
import { Badge, Button, ButtonLink, Card, EmptyState, PageHeader, Segmented } from '../../components/ui';
import { db } from '../../lib/db';
import { SCENE_LABELS } from '../../lib/labels';
import { listenRate } from '../../lib/ladder';
import {
  DEFAULT_PRACTICE_RATE,
  PRACTICE_RATES,
  TIER_LABELS,
  dialogueCorrect,
  levelForRate,
  logDialogue,
  logNumbers,
  logSound,
  snapRate,
} from '../../lib/listening';

const HUB = '/listening';

/** The ladder listening level (undefined before a plan exists), used to tag measurements and to pick the default rate. */
function useLadderLevel(): number | undefined {
  return useLiveQuery(async () => {
    const p = (await db.profile.toArray()).find((x) => !x.deleted);
    return p?.adaptive?.ladder.listen;
  }, []);
}

/** Start screen (rate choice) -> practice -> summary. `render` receives the chosen rate and an onDone. */
function usePracticeRate(): { rate: number; setRate: (r: number) => void; ladderLevel: number | undefined } {
  const [params] = useSearchParams();
  const ladderLevel = useLadderLevel();
  const fromUrl = Number(params.get('rate'));
  const [picked, setPicked] = useState<number | null>(null);
  const rate = picked ?? (Number.isFinite(fromUrl) && fromUrl > 0 ? snapRate(fromUrl) : ladderLevel !== undefined ? snapRate(listenRate(ladderLevel)) : DEFAULT_PRACTICE_RATE);
  return { rate, setRate: setPicked, ladderLevel };
}

function RatePicker({ rate, onChange }: { rate: number; onChange: (r: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">语速</p>
      <Segmented<number>
        ariaLabel="语速"
        value={rate}
        onChange={onChange}
        options={PRACTICE_RATES.map((r) => ({ value: r, label: `${r.toFixed(2).replace(/0$/, '')}×` }))}
      />
    </div>
  );
}

function Summary({ title, lines, again, children }: { title: string; lines: ReactNode[]; again: () => void; children?: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3" aria-label="练习结果">
      <p className="text-lg font-semibold text-slate-900 dark:text-white">{title}</p>
      <ul className="flex flex-col gap-1 text-[15px] text-slate-600 dark:text-slate-300">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      {children}
      <div className="flex flex-wrap gap-2.5">
        <Button variant="secondary" onClick={again}>
          再练一次
        </Button>
        <ButtonLink to={HUB} variant="primary">
          回到听力
        </ButtonLink>
      </div>
    </Card>
  );
}

function NotFound() {
  return (
    <EmptyState
      title="没有找到这个练习"
      description="链接可能已失效。"
      action={
        <ButtonLink to={HUB} variant="primary">
          回到听力
        </ButtonLink>
      }
    />
  );
}

export function ListeningDialoguePage() {
  const { id = '' } = useParams();
  const dialogue = getDialogue(id);
  const { rate, setRate, ladderLevel } = usePracticeRate();
  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<DialogueListenResult | null>(null);
  const logged = useRef(false);

  if (!dialogue) return <NotFound />;

  const finish = (r: DialogueListenResult) => {
    setResult(r);
    if (logged.current) return;
    logged.current = true;
    void logDialogue(dialogue.id, r, levelForRate(rate, ladderLevel));
  };
  const again = () => {
    logged.current = false;
    setResult(null);
    setStarted(false);
    setRound((n) => n + 1);
  };

  return (
    <>
      <PageHeader title={dialogue.title} subtitle={`${TIER_LABELS[dialogue.tier]} · ${SCENE_LABELS[dialogue.scene]}`} backTo={HUB} backLabel="听力" />
      {result ? (
        <Summary
          title={dialogueCorrect(result) ? '这段听懂了' : '这段还需要再听'}
          again={again}
          lines={[
            `主旨：${result.gistCorrect ? '答对' : '答错'}`,
            `听写：${result.blanks.filter((b) => b.correct).length} / ${result.blanks.length}`,
            `重听 ${result.replays} 次 · 用时 ${Math.round(result.ms / 1000)} 秒`,
          ]}
        />
      ) : !started ? (
        <Card className="flex flex-col gap-4">
          <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
            先不看文字，整段听一遍回答大意；再听写 {dialogue.blanks.length} 处关键语块；最后对照原文。
          </p>
          <RatePicker rate={rate} onChange={setRate} />
          <Button variant="primary" size="lg" full onClick={() => setStarted(true)}>
            开始
          </Button>
        </Card>
      ) : (
        <DialogueListen key={round} dialogue={dialogue} rate={rate} onDone={finish} />
      )}
    </>
  );
}

export function ListeningSoundPage() {
  const { id = '' } = useParams();
  const pattern = getSound(id);
  const { rate, setRate, ladderLevel } = usePracticeRate();
  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<SoundDrillResult | null>(null);
  const logged = useRef(false);

  if (!pattern) return <NotFound />;

  const finish = (r: SoundDrillResult) => {
    setResult(r);
    if (logged.current) return;
    logged.current = true;
    void logSound(pattern.id, r, levelForRate(rate, ladderLevel));
  };
  const again = () => {
    logged.current = false;
    setResult(null);
    setStarted(false);
    setRound((n) => n + 1);
  };

  return (
    <>
      <PageHeader title="连读弱读" subtitle={`第 ${pattern.level} 级`} backTo={HUB} backLabel="听力" />
      {result ? (
        <Summary
          title={`${result.correct} / ${result.total} 听对`}
          again={again}
          lines={[`用时 ${Math.round(result.ms / 1000)} 秒`, '这个音变已加入复习。']}
        />
      ) : !started ? (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-en text-xl font-bold text-slate-900 dark:text-white">{pattern.name}</h2>
            <Badge tone="violet">{pattern.examples.length} 个例句</Badge>
          </div>
          <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">{pattern.explanationZh}</p>
          <RatePicker rate={rate} onChange={setRate} />
          <Button variant="primary" size="lg" full onClick={() => setStarted(true)}>
            开始听写
          </Button>
        </Card>
      ) : (
        <SoundDrill key={round} pattern={pattern} rate={rate} onDone={finish} />
      )}
    </>
  );
}

const NUMBER_COUNT = 6;

export function ListeningNumbersPage() {
  const { rate, setRate, ladderLevel } = usePracticeRate();
  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<NumbersDrillResult | null>(null);
  const logged = useRef(false);

  const finish = (r: NumbersDrillResult) => {
    setResult(r);
    if (logged.current) return;
    logged.current = true;
    void logNumbers(r, levelForRate(rate, ladderLevel));
  };
  const again = () => {
    logged.current = false;
    setResult(null);
    setStarted(false);
    setRound((n) => n + 1);
  };

  return (
    <>
      <PageHeader title="数字听写" subtitle="价格、时间、日期、电话、数量、年份" backTo={HUB} backLabel="听力" />
      {result ? (
        <Summary
          title={`${result.correct} / ${result.total} 听对`}
          again={again}
          lines={result.items.map((it) => `${it.correct ? '✓' : '✗'} ${it.answer}${it.correct || it.input === '' ? '' : `（你写的 ${it.input}）`}`)}
        />
      ) : !started ? (
        <Card className="flex flex-col gap-4">
          <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
            {NUMBER_COUNT} 题，每题听一个数字，用数字写下来。
          </p>
          <RatePicker rate={rate} onChange={setRate} />
          <Button variant="primary" size="lg" full onClick={() => setStarted(true)}>
            开始
          </Button>
        </Card>
      ) : (
        <NumbersDrill key={round} count={NUMBER_COUNT} rate={rate} onDone={finish} />
      )}
    </>
  );
}
