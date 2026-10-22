import { EmptyState, PageHeader } from '../components/ui';
import { AnalyzeIcon } from '../components/icons';

/** PHASE 2 placeholder: paste any English sentence -> AI deconstruction (ai.deconstruct). */
export function AnalyzePage() {
  return (
    <>
      <PageHeader title="解构" subtitle="输入任意英文句子，看清它的骨架。" />
      <EmptyState icon={<AnalyzeIcon size={36} />} title="AI 解构即将上线" description="粘贴一句英语，得到中英逐字对照和同骨架的母框。" />
    </>
  );
}
