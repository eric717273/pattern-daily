import { useLiveQuery } from 'dexie-react-hooks';
import type { DailySession, DayPlan } from '../../types';
import { getDozen } from '../../content';
import { formatDuration } from '../../lib/drill';
import { getDaySummary } from '../../lib/today';
import { ButtonLink, Card } from '../ui';
import { decodeBadge } from './steps';

export interface CompletionScreenProps {
  session: DailySession;
  plan: DayPlan;
  streak?: number;
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-2xl bg-slate-100 px-3 py-3 text-center dark:bg-slate-800/70">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

/** Shown when all four steps are done: what was learned today, the streak and where to go next. */
export function CompletionScreen({ session, plan, streak }: CompletionScreenProps) {
  const summary = useLiveQuery(() => getDaySummary(session.date, plan), [session.date, plan, session.updatedAt]);
  const order = getDozen(plan.decode.dozenId)?.order ?? plan.dayIndex;
  return (
    <Card className="flex flex-col items-center gap-5 py-8 text-center" aria-label="今日完成">
      <p className="text-6xl" aria-hidden="true">
        🎉
      </p>
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">今天的练习完成了！</h2>
        <p className="mt-1.5 text-[15px] text-slate-500 dark:text-slate-400">
          第 {session.dayIndex} 课完成。明天继续第 {session.dayIndex + 1} 课，每天 15 分钟就够了。
        </p>
      </div>
      <div className="grid w-full max-w-sm grid-cols-2 gap-2.5">
        <Stat label="今日新学语块" value={summary ? `${summary.learned} 条` : '–'} testId="sum-learned" />
        <Stat label="复习语块" value={summary ? `${summary.reviewed} 条` : '–'} testId="sum-reviewed" />
        <Stat label="解码" value={decodeBadge(plan.decode, order)} testId="sum-decode" />
        <Stat label="今日用时" value={formatDuration(session.activeMs)} testId="sum-time" />
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        🔥 连续 <span className="font-semibold text-slate-800 dark:text-slate-100">{streak ?? 0}</span> 天
      </p>
      <div className="grid w-full max-w-sm gap-3">
        <ButtonLink to="/library" variant="primary" size="lg" full>
          去语块库
        </ButtonLink>
        <ButtonLink to="/decode/practice" size="lg" full>
          再做一组解码练习
        </ButtonLink>
        <ButtonLink to="/me" variant="ghost" full>
          查看统计
        </ButtonLink>
      </div>
    </Card>
  );
}
