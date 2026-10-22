import { describe, expect, it } from 'vitest';
import type { CardState, Grade } from '../types';
import { isDue, newCard, schedule } from './srs';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

function card(over: Partial<CardState> = {}): CardState {
  return { ...newCard('dozen', 'd01', NOW), ...over };
}

describe('newCard', () => {
  it('creates a due card with the contract id', () => {
    const c = newCard('frame', 'f001', NOW);
    expect(c.id).toBe('frame:f001');
    expect(c.kind).toBe('frame');
    expect(c.refId).toBe('f001');
    expect(c.due).toBe(NOW);
    expect(c.ease).toBe(2.5);
    expect(c.reps).toBe(0);
    expect(c.lapses).toBe(0);
    expect(c.interval).toBe(0);
    expect(isDue(c, NOW)).toBe(true);
  });
});

describe('schedule', () => {
  it('does not mutate the input', () => {
    const c = card();
    const copy = { ...c };
    const next = schedule(c, 2, NOW);
    expect(c).toEqual(copy);
    expect(next).not.toBe(c);
  });

  it('forgetting resets progress and is due in 10 minutes', () => {
    const c = card({ reps: 4, interval: 20, ease: 2.5, lapses: 1 });
    const n = schedule(c, 0, NOW);
    expect(n.reps).toBe(0);
    expect(n.interval).toBe(0);
    expect(n.lapses).toBe(2);
    expect(n.ease).toBeCloseTo(2.3, 5);
    expect(n.due).toBe(NOW + 10 * 60 * 1000);
    expect(n.lastReviewed).toBe(NOW);
    expect(n.updatedAt).toBe(NOW);
  });

  it('first success is 1 day, easy gets a bonus', () => {
    expect(schedule(card(), 2, NOW).interval).toBe(1);
    expect(schedule(card(), 1, NOW).interval).toBe(1);
    expect(schedule(card(), 3, NOW).interval).toBeGreaterThan(1);
    expect(schedule(card(), 2, NOW).due).toBe(NOW + DAY);
  });

  it('second success is 3 days (good), easy gets a bonus', () => {
    const c = card({ reps: 1, interval: 1 });
    expect(schedule(c, 2, NOW).interval).toBe(3);
    expect(schedule(c, 3, NOW).interval).toBeGreaterThan(3);
    expect(schedule(c, 1, NOW).interval).toBeLessThanOrEqual(3);
  });

  it('later reviews multiply by ease', () => {
    const c = card({ reps: 2, interval: 3, ease: 2.5 });
    const n = schedule(c, 2, NOW);
    expect(n.interval).toBe(8); // round(3 * 2.5)
    expect(n.ease).toBe(2.5);
    expect(n.reps).toBe(3);
    expect(n.due).toBe(NOW + 8 * DAY);
  });

  it('hard uses x1.2 and ease -0.15', () => {
    const c = card({ reps: 2, interval: 10, ease: 2.5 });
    const n = schedule(c, 1, NOW);
    expect(n.interval).toBe(12);
    expect(n.ease).toBeCloseTo(2.35, 5);
  });

  it('easy uses ease*1.3 and ease +0.15', () => {
    const c = card({ reps: 2, interval: 10, ease: 2.0 });
    const n = schedule(c, 3, NOW);
    expect(n.interval).toBe(26); // 10 * 2.0 * 1.3
    expect(n.ease).toBeCloseTo(2.15, 5);
  });

  it('intervals always grow by at least one day on success', () => {
    const c = card({ reps: 5, interval: 1, ease: 1.3 });
    expect(schedule(c, 1, NOW).interval).toBeGreaterThanOrEqual(2);
  });

  it('ease never drops below 1.3', () => {
    let c = card({ reps: 3, interval: 5, ease: 1.35 });
    for (let i = 0; i < 5; i++) {
      c = schedule(c, 0, NOW);
      expect(c.ease).toBeGreaterThanOrEqual(1.3);
    }
    expect(c.ease).toBe(1.3);
    const h = schedule(card({ reps: 3, interval: 5, ease: 1.3 }), 1, NOW);
    expect(h.ease).toBe(1.3);
  });

  it('recovers after a lapse: starts again at 1 day', () => {
    const lapsed = schedule(card({ reps: 6, interval: 40 }), 0, NOW);
    const next = schedule(lapsed, 2, NOW + 1000);
    expect(next.interval).toBe(1);
    expect(next.reps).toBe(1);
    expect(next.lapses).toBe(1);
  });

  it('is monotone: a better grade never gives a shorter interval', () => {
    const states: CardState[] = [
      card(),
      card({ reps: 1, interval: 1 }),
      card({ reps: 4, interval: 15, ease: 2.2 }),
    ];
    for (const s of states) {
      const intervals = ([1, 2, 3] as Grade[]).map((g) => schedule(s, g, NOW).interval);
      expect(intervals[0]).toBeLessThanOrEqual(intervals[1]);
      expect(intervals[1]).toBeLessThanOrEqual(intervals[2]);
    }
  });
});

describe('isDue', () => {
  it('compares due with now', () => {
    const c = card({ due: NOW + 1000 });
    expect(isDue(c, NOW)).toBe(false);
    expect(isDue(c, NOW + 1000)).toBe(true);
    expect(isDue(c, NOW + 2000)).toBe(true);
  });
});
