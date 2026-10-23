import { describe, expect, it } from 'vitest';
import { skeletonSlotRole, splitSkeleton } from './skeleton';

describe('splitSkeleton', () => {
  it('splits [slot] parts from plain text', () => {
    expect(splitSkeleton('[Subject] must [verb] [object].')).toEqual([
      { text: 'Subject', slot: true },
      { text: ' must ', slot: false },
      { text: 'verb', slot: true },
      { text: ' ', slot: false },
      { text: 'object', slot: true },
      { text: '.', slot: false },
    ]);
  });

  it('handles Chinese labels and text without slots', () => {
    expect(splitSkeleton('[主语] must [动作]').filter((p) => p.slot).map((p) => p.text)).toEqual(['主语', '动作']);
    expect(splitSkeleton('no slots here')).toEqual([{ text: 'no slots here', slot: false }]);
    expect(splitSkeleton('')).toEqual([]);
  });
});

describe('skeletonSlotRole', () => {
  it('maps English and Chinese labels to roles', () => {
    expect(skeletonSlotRole('Subject')).toBe('subject');
    expect(skeletonSlotRole('主语')).toBe('subject');
    expect(skeletonSlotRole('verb')).toBe('verb');
    expect(skeletonSlotRole('动作')).toBe('verb');
    expect(skeletonSlotRole('indirect object')).toBe('indirect-object');
    expect(skeletonSlotRole('间接宾语')).toBe('indirect-object');
    expect(skeletonSlotRole('object')).toBe('object');
    expect(skeletonSlotRole('宾语')).toBe('object');
    expect(skeletonSlotRole('time')).toBe('adverbial');
    expect(skeletonSlotRole('modal')).toBe('aux');
    expect(skeletonSlotRole('adjective')).toBe('complement');
    expect(skeletonSlotRole('???')).toBe('other');
  });
});
