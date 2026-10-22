import { useParams } from 'react-router-dom';
import { EmptyState, PageHeader } from '../components/ui';
import { ButtonLink } from '../components/ui';

/** PHASE 2 placeholder for /frames/:id/drill/single and /frames/:id/drill/translate. */
export function DrillPlaceholder({ mode }: { mode: 'single' | 'translate' }) {
  const { id = '' } = useParams();
  return (
    <>
      <PageHeader title={mode === 'single' ? '单槽快替' : '中译英'} backTo={`/frames/${id}`} backLabel="母框" />
      <EmptyState
        title="练习即将上线"
        description="这个操练会在下一阶段接入。"
        action={<ButtonLink to={`/frames/${id}`}>返回母框</ButtonLink>}
      />
    </>
  );
}
