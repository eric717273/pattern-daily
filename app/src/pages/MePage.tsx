import { AiSection } from '../components/me/AiSection';
import { AttemptsSection } from '../components/me/AttemptsSection';
import { BackupSection } from '../components/me/BackupSection';
import { InstallSection } from '../components/me/InstallSection';
import { PlanSection } from '../components/me/PlanSection';
import { SpeechSection } from '../components/me/SpeechSection';
import { StatsSection } from '../components/me/StatsSection';
import { SyncSection } from '../components/me/SyncSection';
import { PageHeader } from '../components/ui';

/** 我的: statistics, recent attempts and all settings. */
export function MePage() {
  return (
    <>
      <PageHeader title="我的" subtitle="学习统计、AI 与同步设置、数据备份。" />
      <StatsSection />
      <AttemptsSection />
      <AiSection />
      <SyncSection />
      <SpeechSection />
      <PlanSection />
      <BackupSection />
      <InstallSection />
    </>
  );
}
