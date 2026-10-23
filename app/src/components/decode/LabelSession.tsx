import { useState } from 'react';
import { mergeResults, type DecodeResult, type LabelTask } from '../../lib/decode';
import { LabelDrill } from './LabelDrill';

export interface LabelSessionProps {
  /** One or more sentences, labeled one after the other. */
  tasks: LabelTask[];
  /** Called after the last sentence with the combined result. */
  onDone: (result: DecodeResult) => void;
}

/** Runs several LabelDrill sentences in sequence and reports the merged score. */
export function LabelSession({ tasks, onDone }: LabelSessionProps) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<DecodeResult[]>([]);
  const task = tasks[index];
  if (!task) return null;
  const last = index >= tasks.length - 1;

  return (
    <div className="flex flex-col gap-3">
      {tasks.length > 1 && (
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500" data-testid="label-progress">
          第 {index + 1} / {tasks.length} 句
        </p>
      )}
      <LabelDrill
        key={task.id}
        sentence={task}
        doneLabel={last ? '完成' : '下一句'}
        onDone={(r) => {
          const all = [...results, r];
          if (last) {
            onDone(mergeResults(all));
          } else {
            setResults(all);
            setIndex(index + 1);
          }
        }}
      />
    </div>
  );
}
