import { useLiveQuery } from 'dexie-react-hooks';
import type { CardKind, CardState, SubstitutionFrame } from '../types';
import { db } from './db';
import { getAllFrames } from './repo';

/** Seed + user frames, live-updating when user frames change. `undefined` while loading. */
export function useAllFrames(): SubstitutionFrame[] | undefined {
  return useLiveQuery(() => getAllFrames(), []);
}

/** All non-deleted cards keyed by card id (`dozen:d01`). `undefined` while loading. */
export function useCardMap(): Map<string, CardState> | undefined {
  return useLiveQuery(async () => {
    const rows = await db.cards.toArray();
    return new Map(rows.filter((c) => !c.deleted).map((c) => [c.id, c]));
  }, []);
}

/** One card: `{ loading: true }` first, then `{ loading: false, card }` (card undefined = not in review). */
export function useCard(kind: CardKind, refId: string): { loading: boolean; card?: CardState } {
  const result = useLiveQuery(
    async () => {
      const card = await db.cards.get(`${kind}:${refId}`);
      return { card: card && !card.deleted ? card : undefined };
    },
    [kind, refId],
  );
  return result ? { loading: false, card: result.card } : { loading: true };
}
