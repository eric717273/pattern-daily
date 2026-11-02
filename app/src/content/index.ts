import type { Chunk, Dialogue, DozenSentence, ItemRef, SoundPattern, SubstitutionFrame } from '../types';
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
import { CHUNKS_6 } from './chunks-6';
import { CHUNKS_7 } from './chunks-7';
import { DIALOGUES_1 } from './dialogues-1';
import { DIALOGUES_2 } from './dialogues-2';
import { DIALOGUES_3 } from './dialogues-3';
import { SOUNDS as SOUNDS_RAW } from './sounds';

export const DOZEN: DozenSentence[] = [...DOZEN_RAW].sort((a, b) => a.order - b.order);
export const SEED_FRAMES: SubstitutionFrame[] = [...FRAMES_CORE, ...FRAMES_SCENES, ...FRAMES_MORE, ...FRAMES_EXTRA];

const byId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The 350 fixed expressions, sorted by id: c001..c250 core, c251..c300 phrasal verbs, c301..c350 collocations. */
export const CHUNKS: Chunk[] = [
  ...CHUNKS_1,
  ...CHUNKS_2,
  ...CHUNKS_3,
  ...CHUNKS_4,
  ...CHUNKS_5,
  ...CHUNKS_6,
  ...CHUNKS_7,
].sort(byId);

/** The 120 listening dialogues dl001..dl120 (3 tiers), sorted by id. */
export const DIALOGUES: Dialogue[] = [...DIALOGUES_1, ...DIALOGUES_2, ...DIALOGUES_3].sort(byId);

/** The 40 connected-speech patterns s01..s40, sorted by id. */
export const SOUNDS: SoundPattern[] = [...SOUNDS_RAW].sort(byId);

/** Learning order of the chunk track over all seed content (deterministic, see lib/curriculum.ts). */
export const CURRICULUM: ItemRef[] = buildCurriculum(SEED_FRAMES, CHUNKS);

const DOZEN_BY_ID = new Map(DOZEN.map((d) => [d.id, d]));
const CHUNK_BY_ID = new Map(CHUNKS.map((c) => [c.id, c]));
const FRAME_BY_ID = new Map(SEED_FRAMES.map((f) => [f.id, f]));
const DIALOGUE_BY_ID = new Map(DIALOGUES.map((d) => [d.id, d]));
const SOUND_BY_ID = new Map(SOUNDS.map((s) => [s.id, s]));

export function getDozen(id: string): DozenSentence | undefined {
  return DOZEN_BY_ID.get(id);
}

export function getChunk(id: string): Chunk | undefined {
  return CHUNK_BY_ID.get(id);
}

export function getDialogue(id: string): Dialogue | undefined {
  return DIALOGUE_BY_ID.get(id);
}

export function getSound(id: string): SoundPattern | undefined {
  return SOUND_BY_ID.get(id);
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
