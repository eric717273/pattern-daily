import type { DozenSentence, SubstitutionFrame } from '../types';
import { DOZEN_RAW } from './dozen';
import { FRAMES_CORE } from './frames-core';
import { FRAMES_SCENES } from './frames-scenes';

export const DOZEN: DozenSentence[] = [...DOZEN_RAW].sort((a, b) => a.order - b.order);
export const SEED_FRAMES: SubstitutionFrame[] = [...FRAMES_CORE, ...FRAMES_SCENES];

export function getDozen(id: string): DozenSentence | undefined {
  return DOZEN.find((d) => d.id === id);
}
