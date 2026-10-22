import type { CardKind, CardState, Grade } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const RELEARN_MS = 10 * 60 * 1000;
const MIN_EASE = 1.3;
const START_EASE = 2.5;

/** Round to 2 decimals so repeated +/-0.15 steps do not accumulate float noise. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clampEase(n: number): number {
  return round2(Math.max(MIN_EASE, n));
}

/** A brand-new card, due immediately. */
export function newCard(kind: CardKind, refId: string, now: number): CardState {
  return {
    id: `${kind}:${refId}`,
    kind,
    refId,
    due: now,
    interval: 0,
    ease: START_EASE,
    reps: 0,
    lapses: 0,
    updatedAt: now,
  };
}

/**
 * SM-2 variant. Grades: 0 forgot, 1 hard, 2 good, 3 easy.
 *
 * - 0: lapses+1, reps=0, interval=0, due in 10 minutes, ease -0.2
 * - first success (reps 0):  1 day (easy: 2 days)
 * - second success (reps 1): 3 days (hard: 2, easy: 5)
 * - later: interval * ease (hard: * 1.2, ease -0.15; easy: * ease * 1.3, ease +0.15)
 * Ease never drops below 1.3. Returns a new object; the input is untouched.
 */
export function schedule(card: CardState, grade: Grade, now: number): CardState {
  if (grade === 0) {
    return {
      ...card,
      lapses: card.lapses + 1,
      reps: 0,
      interval: 0,
      ease: clampEase(card.ease - 0.2),
      due: now + RELEARN_MS,
      lastReviewed: now,
      updatedAt: now,
    };
  }

  let interval: number;
  if (card.reps <= 0) {
    interval = grade === 3 ? 2 : 1;
  } else if (card.reps === 1) {
    interval = grade === 1 ? 2 : grade === 3 ? 5 : 3;
  } else {
    const base = Math.max(1, card.interval);
    const factor = grade === 1 ? 1.2 : grade === 3 ? card.ease * 1.3 : card.ease;
    // Always move forward by at least one day so intervals never stall.
    interval = Math.max(card.interval + 1, Math.round(base * factor));
  }

  const easeDelta = grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0;

  return {
    ...card,
    reps: card.reps + 1,
    interval,
    ease: clampEase(card.ease + easeDelta),
    due: now + interval * DAY_MS,
    lastReviewed: now,
    updatedAt: now,
  };
}

export function isDue(card: CardState, now: number): boolean {
  return card.due <= now;
}
