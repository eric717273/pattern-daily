import { describe, expect, it } from 'vitest';
import type { AdaptiveChange, AdaptiveState, CardState, ReviewLog } from '../types';
import {
  BAND_HIGH,
  BAND_LOW,
  HISTORY_LIMIT,
  adjust,
  budgetNewPerDay,
  daysBetween,
  defaultAdaptiveState,
  findEdgeItems,
  type AdaptiveContext,
} from './adaptive';

const TODAY = '2026-05-10';

function state(over: Partial<AdaptiveState['ladder']> = {}, lastChange: AdaptiveState['lastChange'] = {}): AdaptiveState {
  return { ladder: { listen: 3, speak: 2, newPerDay: 5, ...over }, lastChange, history: [] };
}

/** Context whose budget gives exactly `n` new chunks (default 5): 30 min - 15 fixed = 900 s; 18 due x 25 = 450 -> 450/90 = 5. */
function ctx(over: Partial<AdaptiveContext> = {}): AdaptiveContext {
  return { dueCount: 18, dailyMinutes: 30, fixedBlocksMin: 15, ...over };
}

function stats(listen?: [number, number], speak?: [number, number], decode?: [number, number]) {
  const row = (x?: [number, number]) => (x ? { n: x[0], acc: x[1] } : undefined);
  return { bySkill: { listen: row(listen), speak: row(speak), decode: row(decode) } };
}

describe('constants', () => {
  it('uses the spec band', () => {
    expect(BAND_LOW).toBe(0.7);
    expect(BAND_HIGH).toBe(0.88);
  });
});

describe('daysBetween', () => {
  it('counts whole days and handles month boundaries', () => {
    expect(daysBetween('2026-05-08', '2026-05-10')).toBe(2);
    expect(daysBetween('2026-04-30', '2026-05-01')).toBe(1);
    expect(daysBetween('2026-05-10', '2026-05-10')).toBe(0);
    expect(daysBetween('2026-05-12', '2026-05-10')).toBe(-2);
    expect(daysBetween('bad', '2026-05-10')).toBeNaN();
  });
});

describe('budgetNewPerDay', () => {
  it('fills the time budget: (daily - fixed) / avgNew after the reviews', () => {
    expect(budgetNewPerDay(ctx())).toBe(5);
    expect(budgetNewPerDay(ctx({ dueCount: 0 }))).toBe(10); // 900 / 90
    expect(budgetNewPerDay(ctx({ dueCount: 0, avgNewSec: 60 }))).toBe(12); // 15 clamped to 12
  });

  it('uses averages from the logs instead of the 25 s / 90 s defaults', () => {
    expect(budgetNewPerDay(ctx({ dueCount: 20, avgReviewSec: 10 }))).toBe(7); // (900-200)/90 = 7.7
    expect(budgetNewPerDay(ctx({ dueCount: 18, avgNewSec: 45 }))).toBe(10); // 450/45
    expect(budgetNewPerDay(ctx({ avgReviewSec: 0, avgNewSec: -1 }))).toBe(5); // non-positive -> defaults
  });

  it('clamps to 3-12', () => {
    expect(budgetNewPerDay(ctx({ dueCount: 200 }))).toBe(3);
    expect(budgetNewPerDay(ctx({ dailyMinutes: 15, fixedBlocksMin: 20, dueCount: 0 }))).toBe(3);
    expect(budgetNewPerDay(ctx({ dueCount: 0, dailyMinutes: 60 }))).toBe(12);
    expect(budgetNewPerDay(ctx({ dueCount: NaN }))).toBeGreaterThanOrEqual(3);
  });

  it('floors partial items', () => {
    expect(budgetNewPerDay({ dueCount: 0, dailyMinutes: 10, fixedBlocksMin: 5 })).toBe(3); // 300/90 = 3.33 -> 3
    expect(budgetNewPerDay({ dueCount: 0, dailyMinutes: 12, fixedBlocksMin: 5 })).toBe(4); // 420/90 = 4.66 -> 4
  });
});

describe('adjust: listening and speaking', () => {
  it('raises a skill above 88% by one level', () => {
    const r = adjust(state(), stats([30, 0.92], [30, 0.8]), TODAY, ctx());
    expect(r.state.ladder.listen).toBe(4);
    expect(r.state.ladder.speak).toBe(2);
    expect(r.changes).toEqual([
      { date: TODAY, dimension: 'listen', from: 3, to: 4, reasonZh: '听力正确率 92% > 88%，语速 0.95 → 1.05' },
    ]);
    expect(r.state.lastChange.listen).toBe(TODAY);
    expect(r.state.history).toEqual(r.changes);
  });

  it('gives the spec example reason for L4 -> L5', () => {
    const r = adjust(state({ listen: 4 }), stats([40, 0.92]), TODAY, ctx());
    expect(r.changes[0].reasonZh).toBe('听力正确率 92% > 88%，语速 1.05 → 1.15');
  });

  it('mentions the tier when a step crosses tiers', () => {
    const up = adjust(state({ listen: 2 }), stats([30, 0.95]), TODAY, ctx());
    expect(up.changes[0].reasonZh).toBe('听力正确率 95% > 88%，对话升到第 2 档（语速 1.05 → 0.95）');
    const down = adjust(state({ listen: 3 }), stats([30, 0.6]), TODAY, ctx());
    expect(down.changes[0].reasonZh).toBe('听力正确率 60% < 70%，对话退回第 1 档（语速 0.95 → 1.05）');
  });

  it('lowers a skill below 70% by one level', () => {
    const r = adjust(state(), stats([30, 0.5], [30, 0.6]), TODAY, ctx());
    expect(r.state.ladder.listen).toBe(2);
    expect(r.state.ladder.speak).toBe(1);
    const levels = r.changes.filter((c) => c.dimension !== 'newPerDay');
    expect(levels.map((c) => c.dimension)).toEqual(['listen', 'speak']);
    expect(levels[1].reasonZh).toBe('口语正确率 60% < 70%，限时 6 秒 → 8 秒');
  });

  it('speaking up shortens the time limit', () => {
    const r = adjust(state({ speak: 2 }), stats(undefined, [20, 0.95]), TODAY, ctx());
    expect(r.changes[0]).toMatchObject({ dimension: 'speak', from: 2, to: 3, reasonZh: '口语正确率 95% > 88%，限时 6 秒 → 5 秒' });
  });

  it('boundaries are strict: exactly 0.88 and exactly 0.70 do not move', () => {
    expect(adjust(state(), stats([25, 22 / 25]), TODAY, ctx()).changes).toEqual([]);
    expect(adjust(state(), stats([20, 14 / 20]), TODAY, ctx()).changes).toEqual([]);
    expect(adjust(state(), stats([25, 23 / 25]), TODAY, ctx()).changes).toHaveLength(1); // 0.92
    expect(adjust(state(), stats([20, 13 / 20]), TODAY, ctx()).changes).toHaveLength(1); // 0.65
  });

  it('shows one decimal when whole-percent rounding would hide the threshold', () => {
    const r = adjust(state(), stats([1000, 0.881]), TODAY, ctx());
    expect(r.changes[0].reasonZh).toBe('听力正确率 88.1% > 88%，语速 0.95 → 1.05');
  });

  it('needs at least 15 answers', () => {
    expect(adjust(state(), stats([14, 1], [14, 0]), TODAY, ctx()).changes).toEqual([]);
    expect(adjust(state(), stats([15, 1]), TODAY, ctx()).changes).toHaveLength(1);
    expect(adjust(state(), stats([0, 0]), TODAY, ctx()).changes).toEqual([]);
    expect(adjust(state(), stats(), TODAY, ctx()).changes).toEqual([]);
  });

  it('never leaves the ladder: L8 / S5 stay, L0 / S0 stay', () => {
    const top = adjust(state({ listen: 8, speak: 5 }), stats([40, 0.99], [40, 0.99]), TODAY, ctx());
    expect(top.changes).toEqual([]);
    expect(top.state).toBe(top.state);
    const bottom = adjust(state({ listen: 0, speak: 0 }), stats([40, 0.1], [40, 0.1]), TODAY, ctx());
    expect(bottom.state.ladder.listen).toBe(0);
    expect(bottom.state.ladder.speak).toBe(0);
    expect(bottom.changes.filter((c) => c.dimension !== 'newPerDay')).toEqual([]);
  });

  it('decode accuracy never changes a level', () => {
    const r = adjust(state(), stats(undefined, undefined, [40, 0.99]), TODAY, ctx());
    expect(r.changes).toEqual([]);
  });

  it('moves one step only, even for 100% or 0%', () => {
    expect(adjust(state(), stats([40, 1]), TODAY, ctx()).state.ladder.listen).toBe(4);
    expect(adjust(state(), stats([40, 0]), TODAY, ctx()).state.ladder.listen).toBe(2);
  });
});

describe('adjust: hysteresis (>= 2 days between changes per dimension)', () => {
  it('blocks a change the day after and on the same day', () => {
    expect(adjust(state({}, { listen: '2026-05-09' }), stats([40, 0.95]), TODAY, ctx()).changes).toEqual([]);
    expect(adjust(state({}, { listen: TODAY }), stats([40, 0.95]), TODAY, ctx()).changes).toEqual([]);
  });

  it('allows it exactly 2 days later and after longer gaps', () => {
    expect(adjust(state({}, { listen: '2026-05-08' }), stats([40, 0.95]), TODAY, ctx()).changes).toHaveLength(1);
    expect(adjust(state({}, { listen: '2026-04-01' }), stats([40, 0.95]), TODAY, ctx()).changes).toHaveLength(1);
  });

  it('dimensions are independent', () => {
    const r = adjust(state({}, { listen: '2026-05-09' }), stats([40, 0.95], [40, 0.95]), TODAY, ctx());
    expect(r.changes.map((c) => c.dimension)).toEqual(['speak']);
    expect(r.state.lastChange).toEqual({ listen: '2026-05-09', speak: TODAY });
  });

  it('running twice on the same day does not change twice', () => {
    const first = adjust(state(), stats([40, 0.95]), TODAY, ctx());
    const second = adjust(first.state, stats([40, 0.95]), TODAY, ctx());
    expect(second.changes).toEqual([]);
    expect(second.state.ladder.listen).toBe(4);
  });

  it('an unparseable last-change date does not block', () => {
    expect(adjust(state({}, { listen: 'garbage' }), stats([40, 0.95]), TODAY, ctx()).changes).toHaveLength(1);
  });
});

describe('adjust: new chunks per day', () => {
  it('moves to the time-budget value; falls straight, rises at most 2 per change', () => {
    // budget 10 (no reviews due) from 5 -> +2
    const up = adjust(state({ newPerDay: 5 }), stats(), TODAY, ctx({ dueCount: 0 }));
    expect(up.state.ladder.newPerDay).toBe(7);
    expect(up.changes[0]).toMatchObject({ dimension: 'newPerDay', from: 5, to: 7 });
    expect(up.changes[0].reasonZh).toContain('每次最多增加 2 条');
    // budget 3 from 10 -> 3 directly
    const down = adjust(state({ newPerDay: 10 }), stats(), TODAY, ctx({ dueCount: 100 }));
    expect(down.state.ladder.newPerDay).toBe(3);
    expect(down.changes[0].reasonZh).toContain('新语块 10 → 3 条/天');
    expect(down.changes[0].reasonZh).toContain('每天 30 分钟');
    expect(down.changes[0].reasonZh).toContain('到期复习 100 条');
  });

  it('no change when the budget equals the current value', () => {
    expect(adjust(state({ newPerDay: 5 }), stats(), TODAY, ctx()).changes).toEqual([]);
  });

  it('takes 2 off when any skill is below 65% (with >= 15 answers)', () => {
    const r = adjust(state({ newPerDay: 5 }), stats([30, 0.8], [30, 0.6]), TODAY, ctx());
    // budget 5 - 2 = 3
    expect(r.state.ladder.newPerDay).toBe(3);
    const c = r.changes.find((x) => x.dimension === 'newPerDay');
    expect(c?.reasonZh).toContain('口语正确率 60% < 65%，再减 2 条');
  });

  it('exactly 65% is not struggling; too few answers is not struggling', () => {
    expect(adjust(state({ newPerDay: 5 }), stats([20, 13 / 20]), TODAY, ctx()).changes.filter((c) => c.dimension === 'newPerDay')).toEqual([]);
    expect(adjust(state({ newPerDay: 5 }), stats([14, 0.1]), TODAY, ctx()).changes).toEqual([]);
  });

  it('never goes below 3 even with the penalty', () => {
    const r = adjust(state({ newPerDay: 4 }), stats([30, 0.5]), TODAY, ctx({ dueCount: 100 }));
    expect(r.state.ladder.newPerDay).toBe(3);
  });

  it('respects the 2-day rule for newPerDay too', () => {
    const blocked = adjust(state({ newPerDay: 5 }, { newPerDay: '2026-05-09' }), stats(), TODAY, ctx({ dueCount: 0 }));
    expect(blocked.changes).toEqual([]);
    const free = adjust(state({ newPerDay: 5 }, { newPerDay: '2026-05-08' }), stats(), TODAY, ctx({ dueCount: 0 }));
    expect(free.changes).toHaveLength(1);
  });

  it('a lower accuracy and a lower budget can change several dimensions on one day', () => {
    const r = adjust(state({ newPerDay: 8 }), stats([30, 0.5], [30, 0.95]), TODAY, ctx());
    expect(r.changes.map((c) => c.dimension)).toEqual(['listen', 'speak', 'newPerDay']);
    expect(r.state.ladder).toEqual({ listen: 2, speak: 3, newPerDay: 3 });
  });
});

describe('adjust: state handling', () => {
  it('does not mutate its input and returns the same object when nothing changed', () => {
    const s = state();
    const copy = JSON.parse(JSON.stringify(s)) as AdaptiveState;
    const none = adjust(s, stats([20, 0.8]), TODAY, ctx());
    expect(none.state).toBe(s);
    adjust(s, stats([40, 0.95]), TODAY, ctx());
    expect(s).toEqual(copy);
  });

  it('appends to history and keeps only the newest 60', () => {
    const old: AdaptiveChange[] = Array.from({ length: 60 }, (_, i) => ({
      date: '2026-01-01',
      dimension: 'listen',
      from: 1,
      to: 2,
      reasonZh: `old ${i}`,
    }));
    const s: AdaptiveState = { ...state(), history: old };
    const r = adjust(s, stats([40, 0.95]), TODAY, ctx());
    expect(r.state.history).toHaveLength(HISTORY_LIMIT);
    expect(r.state.history[r.state.history.length - 1]).toEqual(r.changes[0]);
    expect(r.state.history[0].reasonZh).toBe('old 1');
  });

  it('defaultAdaptiveState starts at the default ladder with no history', () => {
    expect(defaultAdaptiveState()).toEqual({ ladder: { listen: 1, speak: 1, newPerDay: 5 }, lastChange: {}, history: [] });
  });
});

// ---------- edge items ----------

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

function card(refId: string, kind: CardState['kind'] = 'chunk', extra: Partial<CardState> = {}): CardState {
  return { id: `${kind}:${refId}`, kind, refId, due: NOW, interval: 3, ease: 2.5, reps: 2, lapses: 0, updatedAt: 0, ...extra };
}
let n = 0;
function rev(cardId: string, ago: number, extra: Partial<ReviewLog> = {}): ReviewLog {
  n++;
  return { id: `r${n}`, cardId, grade: 2, mode: 'review', reviewedAt: NOW - ago, durationMs: 3000, updatedAt: 0, ...extra };
}

describe('findEdgeItems', () => {
  it('returns nothing without logs', () => {
    expect(findEdgeItems([card('c001')], [], NOW)).toEqual([]);
  });

  it('flags a lapse (grade 0) within 14 days, not older ones', () => {
    const cards = [card('c001'), card('c002')];
    const logs = [rev('chunk:c001', 5 * DAY, { grade: 0 }), rev('chunk:c002', 20 * DAY, { grade: 0 }), rev('chunk:c002', 19 * DAY, { grade: 0 })];
    expect(findEdgeItems(cards, logs, NOW)).toEqual([{ kind: 'chunk', id: 'c001' }]);
  });

  it('the 14-day boundary is inclusive', () => {
    const logs = [rev('chunk:c001', 14 * DAY, { grade: 0 })];
    expect(findEdgeItems([card('c001')], logs, NOW)).toHaveLength(1);
    expect(findEdgeItems([card('c001')], [rev('chunk:c001', 14 * DAY + 1, { grade: 0 })], NOW)).toHaveLength(0);
  });

  it('flags mixed right/wrong in the last 3 answers (uses correct, falls back to grade)', () => {
    const cards = [card('c001'), card('c002'), card('c003'), card('c004')];
    const logs = [
      // c001: old failure then 3 clean answers -> not mixed (last 3 all right), lapse is older than 14 days
      rev('chunk:c001', 40 * DAY, { grade: 0 }),
      rev('chunk:c001', 30 * DAY),
      rev('chunk:c001', 20 * DAY),
      rev('chunk:c001', 16 * DAY),
      // c002: right, wrong (measured), right in the last 3 -> mixed even though no recent grade 0
      rev('chunk:c002', 30 * DAY, { skill: 'speak', correct: true }),
      rev('chunk:c002', 25 * DAY, { skill: 'speak', correct: false, grade: 1 }),
      rev('chunk:c002', 20 * DAY, { skill: 'speak', correct: true }),
      // c003: a single answer cannot be mixed
      rev('chunk:c003', 20 * DAY, { grade: 1 }),
      // c004: all wrong, 20 days ago
      rev('chunk:c004', 20 * DAY, { grade: 0 }),
      rev('chunk:c004', 21 * DAY, { grade: 0 }),
    ];
    expect(findEdgeItems(cards, logs, NOW).map((r) => r.id)).toEqual(['c002']);
  });

  it('flags a correct but slow spoken answer (>= 80% of the limit)', () => {
    const cards = [card('c001'), card('c002'), card('c003')];
    const logs = [
      // limit at S3 = 5000 ms; 4000 = 80% -> slow
      rev('chunk:c001', DAY, { skill: 'speak', correct: true, latencyMs: 4000, level: 3 }),
      rev('chunk:c002', DAY, { skill: 'speak', correct: true, latencyMs: 3999, level: 3 }),
      // a wrong answer is not "slow"
      rev('chunk:c003', DAY, { skill: 'speak', correct: false, latencyMs: 9000, level: 3, grade: 2 }),
    ];
    expect(findEdgeItems(cards, logs, NOW).map((r) => r.id)).toEqual(['c001']);
  });

  it('slow test uses the logged level, or opts.speakLevel (default S1 = 8 s) when absent', () => {
    const cards = [card('c001')];
    const logs = [rev('chunk:c001', DAY, { skill: 'speak', correct: true, latencyMs: 5000 })];
    expect(findEdgeItems(cards, logs, NOW)).toEqual([]); // 5000 < 6400
    expect(findEdgeItems(cards, logs, NOW, { speakLevel: 3 })).toHaveLength(1); // 5000 >= 4000
  });

  it('only chunk and frame cards, never deleted ones', () => {
    const cards = [card('c001'), card('f001', 'frame'), card('d01', 'dozen'), card('s01', 'sound'), card('c009', 'chunk', { deleted: true })];
    const logs = ['chunk:c001', 'frame:f001', 'dozen:d01', 'sound:s01', 'chunk:c009'].map((id) => rev(id, DAY, { grade: 0 }));
    expect(findEdgeItems(cards, logs, NOW)).toEqual([
      { kind: 'chunk', id: 'c001' },
      { kind: 'frame', id: 'f001' },
    ]);
  });

  it('ignores deleted and future logs', () => {
    const logs = [rev('chunk:c001', DAY, { grade: 0, deleted: true }), rev('chunk:c001', -DAY, { grade: 0 })];
    expect(findEdgeItems([card('c001')], logs, NOW)).toEqual([]);
  });

  it('ranks by number of reasons, then recency, and honours the limit', () => {
    const cards = [card('c001'), card('c002'), card('c003')];
    const logs = [
      rev('chunk:c001', 5 * DAY, { grade: 0 }), // lapse only
      rev('chunk:c002', 2 * DAY, { grade: 0 }), // lapse only, more recent
      // c003: lapse + mixed + slow
      rev('chunk:c003', 9 * DAY, { skill: 'speak', correct: true, latencyMs: 9000, level: 1 }),
      rev('chunk:c003', 8 * DAY, { grade: 0 }),
      rev('chunk:c003', 7 * DAY, { skill: 'speak', correct: true, latencyMs: 7000, level: 1 }),
    ];
    expect(findEdgeItems(cards, logs, NOW).map((r) => r.id)).toEqual(['c003', 'c002', 'c001']);
    expect(findEdgeItems(cards, logs, NOW, { limit: 2 }).map((r) => r.id)).toEqual(['c003', 'c002']);
    expect(findEdgeItems(cards, logs, NOW, { limit: 0 })).toEqual([]);
  });
});
