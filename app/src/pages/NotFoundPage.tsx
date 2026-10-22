import { ButtonLink, EmptyState } from '../components/ui';

export function NotFoundPage() {
  return (
    <EmptyState
      title="找不到这个页面"
      description="链接可能已经失效。"
      action={<ButtonLink to="/" variant="primary">回到今日</ButtonLink>}
    />
  );
}
