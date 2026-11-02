import { useState } from 'react';
import type { AdaptiveChange } from '../../types';
import { Button } from '../ui';

const DIM_ZH: Record<AdaptiveChange['dimension'], string> = { listen: '听力', speak: '口语', newPerDay: '新语块' };
const SHOWN = 6;

export function AdjustmentLog({ history }: { history: readonly AdaptiveChange[] }) {
  const [all, setAll] = useState(false);
  const rows = [...history].reverse();
  if (rows.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400" data-testid="history-empty">
        还没有调整记录。每项技能积累 15 次作答后，系统才会开始自动调节难度。
      </p>
    );
  }
  const shown = all ? rows : rows.slice(0, SHOWN);
  return (
    <div>
      <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800" aria-label="调整记录">
        {shown.map((c, i) => (
          <li key={`${c.date}-${c.dimension}-${i}`} className="flex gap-3 py-2.5 text-sm" data-testid="history-row">
            <span className="w-24 shrink-0 whitespace-nowrap text-slate-400 tabular-nums dark:text-slate-500">{c.date}</span>
            <span className="min-w-0 flex-1 text-slate-700 dark:text-slate-200">
              <span className="mr-1.5 font-medium text-slate-900 dark:text-white">{DIM_ZH[c.dimension]}</span>
              {c.reasonZh}
            </span>
          </li>
        ))}
      </ul>
      {rows.length > SHOWN && (
        <Button variant="ghost" size="sm" className="mt-1" onClick={() => setAll((v) => !v)}>
          {all ? '收起' : `显示全部 ${rows.length} 条`}
        </Button>
      )}
    </div>
  );
}
