import { useState } from 'react';
import type { LibraryItem } from '../../content';
import { getChunk, getDialogue } from '../../content';
import type {
  CheckpointPlan,
  CheckpointResults,
  ChunkProbe,
  DialogueResult,
  ListenResult,
  PlacementPlan,
  PlacementResults,
  SpeakResult,
} from '../../lib/assessment';
import { nextListenLevel } from '../../lib/assessment';
import { listenRate } from '../../lib/ladder';
import { ListenDrill } from '../chunk/ListenDrill';
import { RecallDrill, type RecallResult } from '../chunk/RecallDrill';
import { DialogueListen } from '../listening/DialogueListen';
import { Card, EmptyState } from '../ui';

// The UI side of the placement test and the weekly checkpoint: renders one item at a time with the existing drills
// and collects the results the scoring functions in lib/assessment.ts expect. Nothing is saved here.

function chunkItem(id: string): LibraryItem | undefined {
  const chunk = getChunk(id);
  return chunk ? { kind: 'chunk', chunk } : undefined;
}

function speakResult(probe: ChunkProbe, r: RecallResult): SpeakResult {
  const out: SpeakResult = { chunkId: probe.chunkId, freq: probe.freq, correct: r.correct };
  if (r.correct) out.latencyMs = Math.max(0, Math.round(r.ms));
  return out;
}

export function RunHeader({ section, index, total, note }: { section: string; index: number; total: number; note?: string }) {
  const pct = Math.round((index / total) * 100);
  return (
    <div className="mb-4" data-testid="run-header">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold text-slate-800 dark:text-slate-100">
          {section}
          {note && <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">{note}</span>}
        </span>
        <span className="text-slate-500 tabular-nums dark:text-slate-400">
          第 {Math.min(index + 1, total)} / {total} 题
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="测试进度"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={index}
        className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
      >
        <div className="h-full rounded-full bg-indigo-500 transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MissingItem({ id }: { id: string }) {
  return (
    <Card>
      <EmptyState title="题目缺失" description={`找不到内容 ${id}，请重新开始测试。`} />
    </Card>
  );
}

// ---------- placement ----------

interface PlacementState {
  idx: number;
  level: number;
  listen: ListenResult[];
  dialogues: DialogueResult[];
  speak: SpeakResult[];
}

export interface PlacementRunnerProps {
  plan: PlacementPlan;
  onDone: (results: PlacementResults) => void;
}

/** Listening staircase -> 2 gist-only dialogues -> speaking items (timed, latency measured). */
export function PlacementRunner({ plan, onDone }: PlacementRunnerProps) {
  const nL = plan.listen.items.length;
  const nD = plan.dialogues.length;
  const nS = plan.speak.items.length;
  const total = nL + nD + nS;
  const [st, setSt] = useState<PlacementState>({ idx: 0, level: plan.listen.startLevel, listen: [], dialogues: [], speak: [] });

  const advance = (next: PlacementState) => {
    if (next.idx >= total) onDone({ listen: next.listen, dialogues: next.dialogues, speak: next.speak });
    else setSt(next);
  };

  const { idx } = st;
  if (idx < nL) {
    const probe = plan.listen.items[idx];
    const item = chunkItem(probe.chunkId);
    return (
      <div>
        <RunHeader section="听力" index={idx} total={total} note="听一句话，选出听到的语块" />
        {item ? (
          <ListenDrill
            key={`listen-${idx}`}
            item={item}
            rate={listenRate(st.level)}
            continueLabel={idx + 1 < total ? '下一题' : '完成'}
            onDone={(r) =>
              advance({
                ...st,
                idx: idx + 1,
                level: nextListenLevel(st.level, r.correct),
                listen: [...st.listen, { chunkId: probe.chunkId, freq: probe.freq, level: st.level, correct: r.correct }],
              })
            }
          />
        ) : (
          <MissingItem id={probe.chunkId} />
        )}
      </div>
    );
  }

  if (idx < nL + nD) {
    const id = plan.dialogues[idx - nL];
    const dialogue = getDialogue(id);
    return (
      <div>
        <RunHeader section="对话" index={idx} total={total} note="只回答一道主旨题" />
        {dialogue ? (
          <DialogueListen
            key={`dialogue-${idx}`}
            dialogue={dialogue}
            rate={listenRate(st.level)}
            gistOnly
            onDone={(r) =>
              advance({
                ...st,
                idx: idx + 1,
                dialogues: [...st.dialogues, { id: dialogue.id, tier: dialogue.tier, correct: r.gistCorrect }],
              })
            }
          />
        ) : (
          <MissingItem id={id} />
        )}
      </div>
    );
  }

  const probe = plan.speak.items[idx - nL - nD];
  const item = chunkItem(probe.chunkId);
  return (
    <div>
      <RunHeader section="口语" index={idx} total={total} note={`限时 ${plan.speak.limitMs / 1000} 秒说出`} />
      {item ? (
        <RecallDrill
          key={`speak-${idx}`}
          item={item}
          timeLimitMs={plan.speak.limitMs}
          continueLabel={idx + 1 < total ? '下一题' : '完成'}
          onDone={(r) => advance({ ...st, idx: idx + 1, speak: [...st.speak, speakResult(probe, r)] })}
        />
      ) : (
        <MissingItem id={probe.chunkId} />
      )}
    </div>
  );
}

// ---------- checkpoint ----------

export interface CheckpointRunnerProps {
  plan: CheckpointPlan;
  onDone: (results: CheckpointResults) => void;
}

/** 6 listening items (each at its own level) then 4 speaking items. */
export function CheckpointRunner({ plan, onDone }: CheckpointRunnerProps) {
  const nL = plan.listen.length;
  const total = nL + plan.speak.items.length;
  const [st, setSt] = useState<{ idx: number; listen: ListenResult[]; speak: SpeakResult[] }>({ idx: 0, listen: [], speak: [] });
  const { idx } = st;

  const advance = (next: typeof st) => {
    if (next.idx >= total) onDone({ listen: next.listen, speak: next.speak });
    else setSt(next);
  };

  if (idx < nL) {
    const probe = plan.listen[idx];
    const item = chunkItem(probe.chunkId);
    return (
      <div>
        <RunHeader section="听力" index={idx} total={total} note="听一句话，选出听到的语块" />
        {item ? (
          <ListenDrill
            key={`listen-${idx}`}
            item={item}
            rate={listenRate(probe.level)}
            continueLabel="下一题"
            onDone={(r) =>
              advance({
                ...st,
                idx: idx + 1,
                listen: [...st.listen, { chunkId: probe.chunkId, freq: probe.freq, level: probe.level, correct: r.correct }],
              })
            }
          />
        ) : (
          <MissingItem id={probe.chunkId} />
        )}
      </div>
    );
  }

  const probe = plan.speak.items[idx - nL];
  const item = chunkItem(probe.chunkId);
  return (
    <div>
      <RunHeader section="口语" index={idx} total={total} note={`限时 ${plan.speak.limitMs / 1000} 秒说出`} />
      {item ? (
        <RecallDrill
          key={`speak-${idx}`}
          item={item}
          timeLimitMs={plan.speak.limitMs}
          continueLabel={idx + 1 < total ? '下一题' : '完成'}
          onDone={(r) => advance({ ...st, idx: idx + 1, speak: [...st.speak, speakResult(probe, r)] })}
        />
      ) : (
        <MissingItem id={probe.chunkId} />
      )}
    </div>
  );
}
