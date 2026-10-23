import type { DailySession } from '../../types';
import { formatDuration } from '../../lib/drill';
import { Button, ButtonLink, Card } from '../ui';

export interface CompletionScreenProps {
  session: DailySession;
  streak?: number;
  onMoreFrames: () => void;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-100 px-3 py-3 text-center dark:bg-slate-800/70">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

/** Shown when all four steps are done. */
export function CompletionScreen({ session, streak, onMoreFrames }: CompletionScreenProps) {
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
      <div className="grid w-full max-w-sm grid-cols-3 gap-2.5">
        <Stat label="今日用时" value={formatDuration(session.activeMs)} />
        <Stat label="连续天数" value={`${streak ?? 0} 天`} />
        <Stat label="完成步骤" value="4 / 4" />
      </div>
      <div className="grid w-full max-w-sm gap-3">
        <Button variant="primary" size="lg" full onClick={onMoreFrames}>
          再练一轮母框
        </Button>
        <ButtonLink to="/me" size="lg" full>
          查看统计
        </ButtonLink>
      </div>
    </Card>
  );
}
