import { describe, expect, it } from 'vitest';
import type { DaySummaryV3, SkillDaySummary } from '../../lib/repo';
import { bandLabel, classifyBand, feedbackTip, mistakeView } from './feedback';

const skill = (n: number, acc: number, band: SkillDaySummary['band'], medianLatencyMs?: number): SkillDaySummary => ({
  n,
  correct: Math.round(n * acc),
  acc,
  band,
  ...(medianLatencyMs !== undefined ? { medianLatencyMs } : {}),
});

const summary = (over: Partial<DaySummaryV3['skills']> = {}, extra: Partial<DaySummaryV3> = {}): DaySummaryV3 => ({
  date: '2026-11-02',
  skills: { listen: skill(0, 0, 'none'), speak: skill(0, 0, 'none'), decode: skill(0, 0, 'none'), ...over },
  band: { low: 0.7, high: 0.88 },
  mistakes: [],
  adjustments: [],
  ladder: { listen: 2, speak: 2, newPerDay: 5 },
  ...extra,
});

describe('classifyBand', () => {
  it('none without answers; below 70, in 70-88 (inclusive), above 88', () => {
    expect(classifyBand(0, 0)).toBe('none');
    expect(classifyBand(0.69, 20)).toBe('below');
    expect(classifyBand(0.7, 20)).toBe('in');
    expect(classifyBand(0.88, 25)).toBe('in');
    expect(classifyBand(0.89, 20)).toBe('above');
    expect(classifyBand(1, 3)).toBe('above');
  });
  it('labels', () => {
    expect(bandLabel('below').text).toBe('太难');
    expect(bandLabel('in').text).toBe('刚好');
    expect(bandLabel('above').text).toBe('太容易');
    expect(bandLabel('none').text).toBe('今天没有测量');
  });
});

describe('feedbackTip', () => {
  it('listening below band: replay at a slower speed', () => {
    expect(feedbackTip(summary({ listen: skill(10, 0.5, 'below') }))).toContain('0.95 倍速重听今天的对话'); // L2 = 1.05x today
    expect(feedbackTip(summary({ listen: skill(10, 0.5, 'below') }, { ladder: { listen: 3, speak: 1, newPerDay: 5 } }))).toContain('0.85 倍速');
  });
  it('speaking below band', () => {
    expect(feedbackTip(summary({ speak: skill(10, 0.4, 'below') }))).toContain('口语正确率 40%');
  });
  it('a missed sound pattern is named', () => {
    const tip = feedbackTip(summary({}, { mistakes: [{ cardId: 'sound:s01', kind: 'sound', count: 1 }] }));
    expect(tip).toContain('音变');
  });
  it('too easy listening says tomorrow gets faster', () => {
    expect(feedbackTip(summary({ listen: skill(10, 1, 'above') }))).toContain('明天会自动加快语速');
  });
  it('slow but right speaking', () => {
    const tip = feedbackTip(summary({ speak: skill(10, 0.8, 'in', 5500) }));
    expect(tip).toContain('偏慢');
  });
  it('in the zone / no data', () => {
    expect(feedbackTip(summary({ listen: skill(10, 0.8, 'in'), speak: skill(10, 0.8, 'in', 2000) }))).toContain('舒适区边缘');
    expect(feedbackTip(summary())).toContain('没有记录到可测量');
  });
});

describe('mistakeView', () => {
  it('links chunks, sounds and dialogues to their pages', () => {
    expect(mistakeView({ cardId: 'chunk:c001', kind: 'chunk', ref: { kind: 'chunk', id: 'c001' }, count: 2 })).toMatchObject({
      to: '/library/chunk/c001',
      count: 2,
    });
    expect(mistakeView({ cardId: 'sound:s03', kind: 'sound', count: 1 }).to).toBe('/listening/sound/s03');
    expect(mistakeView({ cardId: 'dialogue:dl002', kind: 'dialogue', count: 1 }).to).toBe('/listening/dialogue/dl002');
  });
  it('numbers have no page', () => {
    const v = mistakeView({ cardId: 'numbers:price', kind: 'numbers', count: 1 });
    expect(v.to).toBeUndefined();
    expect(v.label).toContain('价格');
  });
});
