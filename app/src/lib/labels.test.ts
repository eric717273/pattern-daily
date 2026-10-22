import { describe, expect, it } from 'vitest';
import { DOZEN, SEED_FRAMES } from '../content';
import type { SlotRole } from '../types';
import {
  FRAME_LEVEL_LABELS,
  GRAMMAR_LABELS,
  GRAMMAR_POINTS,
  inferSlotRole,
  ROLE_STYLES,
  SCENE_LABELS,
  SLOT_ROLE_LABELS,
  VARIANT_LEVEL_LABELS,
} from './labels';

const ALL_ROLES: SlotRole[] = [
  'subject',
  'aux',
  'verb',
  'object',
  'indirect-object',
  'complement',
  'adverbial',
  'determiner',
  'particle',
  'other',
];

describe('labels', () => {
  it('labels every grammar point used by the dozen and the frames', () => {
    expect(GRAMMAR_POINTS).toHaveLength(13);
    const used = new Set([...DOZEN.flatMap((d) => d.grammar), ...SEED_FRAMES.flatMap((f) => f.grammar)]);
    for (const g of used) expect(GRAMMAR_LABELS[g], g).toBeTruthy();
    for (const g of GRAMMAR_POINTS) expect(GRAMMAR_LABELS[g].length).toBeGreaterThan(0);
  });

  it('labels every scene, level and variant level', () => {
    for (const s of ['daily', 'work', 'travel', 'social', 'study'] as const) expect(SCENE_LABELS[s]).toBeTruthy();
    expect(SCENE_LABELS).toMatchObject({ work: '职场', daily: '日常', travel: '旅行', social: '社交', study: '学习' });
    expect(FRAME_LEVEL_LABELS).toEqual({ 1: '入门', 2: '进阶', 3: '高阶' });
    expect(VARIANT_LEVEL_LABELS).toEqual({ dummy: '假人词', daily: '日常', work: '职场' });
    for (const f of SEED_FRAMES) expect(SCENE_LABELS[f.scene], f.id).toBeTruthy();
  });

  it('labels and styles every slot role', () => {
    for (const r of ALL_ROLES) {
      expect(SLOT_ROLE_LABELS[r], r).toBeTruthy();
      expect(ROLE_STYLES[r].chip, r).toBeTruthy();
    }
  });

  it('infers slot roles from keys and Chinese labels', () => {
    expect(inferSlotRole({ key: 'subject', labelZh: '主语' })).toBe('subject');
    expect(inferSlotRole({ key: 'modal', labelZh: '情态' })).toBe('aux');
    expect(inferSlotRole({ key: 'verb', labelZh: '动词' })).toBe('verb');
    expect(inferSlotRole({ key: 'time', labelZh: '时间' })).toBe('adverbial');
    expect(inferSlotRole({ key: 'x1', labelZh: '主语+打算' })).toBe('subject');
    expect(inferSlotRole({ key: 'opener', labelZh: '开场白' })).toBe('other');
  });

  it('classifies every seed slot without throwing', () => {
    for (const f of SEED_FRAMES) for (const s of f.slots) expect(ALL_ROLES).toContain(inferSlotRole(s));
  });
});
