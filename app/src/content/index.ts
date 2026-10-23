import type { Chunk, DozenSentence, ItemRef, SubstitutionFrame } from '../types';
import { buildCurriculum } from '../lib/curriculum';
import { DOZEN_RAW } from './dozen';
import { FRAMES_CORE } from './frames-core';
import { FRAMES_SCENES } from './frames-scenes';
import { FRAMES_MORE } from './frames-more';
import { FRAMES_EXTRA } from './frames-extra';
import { CHUNKS_1 } from './chunks-1';
import { CHUNKS_2 } from './chunks-2';
import { CHUNKS_3 } from './chunks-3';
import { CHUNKS_4 } from './chunks-4';
import { CHUNKS_5 } from './chunks-5';

export const DOZEN: DozenSentence[] = [...DOZEN_RAW].sort((a, b) => a.order - b.order);
export const SEED_FRAMES: SubstitutionFrame[] = [...FRAMES_CORE, ...FRAMES_SCENES, ...FRAMES_MORE, ...FRAMES_EXTRA];

/** The 250 fixed expressions, sorted by id (c001..c250). */
export const CHUNKS: Chunk[] = [...CHUNKS_1, ...CHUNKS_2, ...CHUNKS_3, ...CHUNKS_4, ...CHUNKS_5].sort((a, b) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
);

/** Learning order of the chunk track over all seed content (deterministic, see lib/curriculum.ts). */
export const CURRICULUM: ItemRef[] = buildCurriculum(SEED_FRAMES, CHUNKS);

const DOZEN_BY_ID = new Map(DOZEN.map((d) => [d.id, d]));
const CHUNK_BY_ID = new Map(CHUNKS.map((c) => [c.id, c]));
const FRAME_BY_ID = new Map(SEED_FRAMES.map((f) => [f.id, f]));

export function getDozen(id: string): DozenSentence | undefined {
  return DOZEN_BY_ID.get(id);
}

export function getChunk(id: string): Chunk | undefined {
  return CHUNK_BY_ID.get(id);
}

export function getSeedFrame(id: string): SubstitutionFrame | undefined {
  return FRAME_BY_ID.get(id);
}

export type LibraryItem = { kind: 'chunk'; chunk: Chunk } | { kind: 'frame'; frame: SubstitutionFrame };

/**
 * Resolve an ItemRef to its content. Frames are looked up in the seed set first, then in `userFrames`
 * (AI/user-created frames, e.g. `await getAllFrames()`), when given.
 */
export function getItem(ref: ItemRef, userFrames: readonly SubstitutionFrame[] = []): LibraryItem | undefined {
  if (ref.kind === 'chunk') {
    const chunk = CHUNK_BY_ID.get(ref.id);
    return chunk ? { kind: 'chunk', chunk } : undefined;
  }
  const frame = FRAME_BY_ID.get(ref.id) ?? userFrames.find((f) => f.id === ref.id);
  return frame ? { kind: 'frame', frame } : undefined;
}
