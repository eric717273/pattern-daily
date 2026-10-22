import type { CardState } from '../types';
import { Badge, type Tone } from './ui';

const DAY_MS = 86_400_000;

/** Short Chinese description of a card's review status. */
export function describeCard(card: CardState | undefined, now: number = Date.now()): { label: string; tone: Tone } {
  if (!card) return { label: '未加入复习', tone: 'slate' };
  if (card.reps === 0) return { label: '新卡 · 待首次复习', tone: 'sky' };
  if (card.due <= now) return { label: `已复习 ${card.reps} 次 · 今天到期`, tone: 'amber' };
  const days = Math.ceil((card.due - now) / DAY_MS);
  return { label: `已复习 ${card.reps} 次 · ${days} 天后复习`, tone: 'emerald' };
}

/** Badge showing whether (and when) a card is up for review. Pass `undefined` for "not in review". */
export function CardStatus({ card, className }: { card: CardState | undefined; className?: string }) {
  const { label, tone } = describeCard(card);
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
}
