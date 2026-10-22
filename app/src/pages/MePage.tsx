import { EmptyState, PageHeader } from '../components/ui';
import { MeIcon } from '../components/icons';

/** PHASE 2 placeholder: stats, settings (AI key, voice, Supabase sync), backup. */
export function MePage() {
  return (
    <>
      <PageHeader title="我的" subtitle="学习统计、AI 与同步设置、数据备份。" />
      <EmptyState icon={<MeIcon size={36} />} title="设置页即将上线" description="AI 密钥、发音、云同步和备份都会放在这里。" />
    </>
  );
}
