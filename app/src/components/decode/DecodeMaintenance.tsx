import { useMemo } from 'react';
import type { Grade } from '../../types';
import { getDozen, SEED_FRAMES } from '../../content';
import {
  dayOffset,
  dayRng,
  gradeFromRatio,
  labelTaskFromDozen,
  pickFrameLabelTask,
  pickTransformTasks,
  type DecodeResult,
  type LabelTask,
} from '../../lib/decode';
import { todayStr } from '../../lib/plan';
import { Card } from '../ui';
import { LabelSession } from './LabelSession';
import { TransformDrill } from './TransformDrill';

export interface DecodeMaintenanceProps {
  /** Which skeleton ('d01'..'d13'), normally `plan.decode.dozenId`. */
  dozenId: string;
  mode: 'transform' | 'label';
  /**
   * Called once at the end. Grade mapping (share of correct answers): all right 3 (简单), >= 60% 2 (良好),
   * >= 30% 1 (困难), else 0 (忘了). transform = 3 tasks, label = 2 sentences (tense question included in the count).
   * The caller writes to the repo: ensureCards('dozen', [id]) + gradeCard(`dozen:${id}`, grade, mode, info.ms).
   */
  onDone: (grade: Grade, info: DecodeResult) => void;
  /** Date key that rotates the exercises (different days show different tasks); default today. */
  dayKey?: string;
}

/**
 * Daily ~3 minute maintenance (day 14+): either three transformations of the day's skeleton, or two
 * 成分标注 sentences (the skeleton itself + one frame combo that shares its grammar when possible).
 */
export function DecodeMaintenance({ dozenId, mode, onDone, dayKey }: DecodeMaintenanceProps) {
  const dozen = getDozen(dozenId);
  const key = dayKey ?? todayStr();

  const transformTasks = useMemo(
    () => (dozen && mode === 'transform' ? pickTransformTasks(dozen, 3, dayOffset(key, dozen.id)) : []),
    [dozen, mode, key],
  );
  const labelTasks = useMemo<LabelTask[]>(() => {
    if (!dozen || mode !== 'label') return [];
    const tasks = [labelTaskFromDozen(dozen)];
    const combo = pickFrameLabelTask(SEED_FRAMES, dayRng(key, dozen.id, 'label'), dozen.grammar);
    if (combo) tasks.push(combo);
    return tasks;
  }, [dozen, mode, key]);

  if (!dozen) return <Card>没有找到这个骨架句。</Card>;

  const finish = (r: DecodeResult) => onDone(gradeFromRatio(r.correct, r.total), r);

  return mode === 'transform' ? (
    <TransformDrill key={`${dozen.id}|${key}`} tasks={transformTasks} onDone={finish} />
  ) : (
    <LabelSession key={`${dozen.id}|${key}`} tasks={labelTasks} onDone={finish} />
  );
}
