import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { ensureCards } from './repo';
import { saveReview, speakMeasurement } from './today';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('speakMeasurement', () => {
  it('latency is the mean of the verified right answers only', () => {
    expect(
      speakMeasurement([
        { correct: true, ms: 2000, verified: true },
        { correct: true, ms: 4000, verified: true },
        { correct: true, ms: 100, verified: false },
      ]),
    ).toEqual({ skill: 'speak', correct: true, latencyMs: 3000 });
  });

  it('self-check answers are measured for accuracy but carry no latency', () => {
    const m = speakMeasurement([{ correct: true, ms: 1500, verified: false }], 2);
    expect(m).toEqual({ skill: 'speak', correct: true, level: 2 });
    expect(m && 'latencyMs' in m).toBe(false);
    expect(speakMeasurement([{ correct: true, ms: 1500 }])).toEqual({ skill: 'speak', correct: true }); // unknown = not verified
  });
});

describe('saveReview', () => {
  it('a due card is graded with the measurement; a self-checked answer logs no latency', async () => {
    await ensureCards('chunk', ['c001']);
    await db.cards.update('chunk:c001', { due: Date.now() - 1000 });
    await saveReview('chunk:c001', 2, 'recall', 5000, { recall: [{ correct: true, ms: 1200, verified: false }] });
    const logs = await db.reviews.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ skill: 'speak', correct: true, grade: 2, durationMs: 5000 });
    expect('latencyMs' in logs[0]).toBe(false);
    expect((await db.cards.get('chunk:c001'))?.reps).toBe(1);
  });

  it('a card that is not due keeps its schedule; only the measurement is logged', async () => {
    await ensureCards('chunk', ['c002']);
    await db.cards.update('chunk:c002', { due: Date.now() + 3 * 86_400_000, interval: 3, reps: 2 });
    const before = await db.cards.get('chunk:c002');
    await saveReview('chunk:c002', 3, 'recall', 5000, { listen: { correct: true, ms: 800 }, recall: [{ correct: false, ms: 6000, verified: true }] });
    expect(await db.cards.get('chunk:c002')).toEqual(before);
    const logs = await db.reviews.toArray();
    expect(logs.map((l) => l.skill).sort()).toEqual(['listen', 'speak']);
    expect(logs.find((l) => l.skill === 'speak')).toMatchObject({ correct: false, durationMs: 0 });
  });
});
