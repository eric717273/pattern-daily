// Exports all static learning content to JSON for other clients (e.g. a native iOS/macOS app).
// Run from the repo root: npx -y tsx export/export-content.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { CHUNKS, CURRICULUM, DIALOGUES, DOZEN, SEED_FRAMES, SOUNDS } from '../app/src/content/index';

const out = 'export/content';
mkdirSync(out, { recursive: true });
const files: Record<string, unknown> = {
  'dozen.json': DOZEN,
  'frames.json': SEED_FRAMES,
  'chunks.json': CHUNKS,
  'dialogues.json': DIALOGUES,
  'sounds.json': SOUNDS,
  'curriculum.json': CURRICULUM,
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(`${out}/${name}`, JSON.stringify(data, null, 1) + '\n');
  console.log(name, Array.isArray(data) ? data.length : '');
}
