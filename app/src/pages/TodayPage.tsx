import { EmptyState, PageHeader } from '../components/ui';
import { TodayIcon } from '../components/icons';

/** PHASE 2 placeholder: the daily 15-minute flow (warm-up -> deconstruct -> frames -> output). */
export function TodayPage() {
  return (
    <>
      <PageHeader title="今日" subtitle="每天 15 分钟：热身、解构、母框替换、模组输出。" />
      <EmptyState icon={<TodayIcon size={36} />} title="今日练习即将上线" description="每日流程页面将在下一阶段接入。" />
    </>
  );
}
