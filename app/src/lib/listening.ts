import type { Dialogue, DialogueTier, Grade, Scene, SoundPattern } from '../types';
import type { DialogueListenResult } from '../components/listening/DialogueListen';
import type { NumbersDrillResult } from '../components/listening/NumbersDrill';
import type { SoundDrillResult } from '../components/listening/SoundDrill';
import { LISTEN_LEVELS, clampListenLevel } from './ladder';
import { gradeCard, introduceSound, logMeasurement } from './repo';

export const TIER_LABELS: Record<DialogueTier, string> = { 1: '入门', 2: '进阶', 3: '挑战' };

/** Standalone practice rates (research §四 ladder spans 0.85-1.2). */
export const PRACTICE_RATES: readonly number[] = [0.85, 0.95, 1.0, 1.1, 1.2];
export const DEFAULT_PRACTICE_RATE = 1.0;

/** Snap a free number (e.g. a ladder rate or a ?rate= param) to a selectable practice rate. */
export function snapRate(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_PRACTICE_RATE;
  return PRACTICE_RATES.reduce((best, r) => (Math.abs(r - rate) < Math.abs(best - rate) ? r : best), PRACTICE_RATES[0]);
}

export interface DialogueFilter {
  tier: DialogueTier | 0;
  scene: Scene | 'all';
}

export function filterDialogues(list: readonly Dialogue[], f: DialogueFilter): Dialogue[] {
  return list.filter((d) => (f.tier === 0 || d.tier === f.tier) && (f.scene === 'all' || d.scene === f.scene));
}

export function groupSoundsByLevel(list: readonly SoundPattern[]): { level: 1 | 2 | 3; sounds: SoundPattern[] }[] {
  return ([1, 2, 3] as const)
    .map((level) => ({ level, sounds: list.filter((s) => s.level === level) }))
    .filter((g) => g.sounds.length > 0);
}

/** A dialogue counts as correct when the gist was right and at least half of the blanks were. */
export function dialogueCorrect(r: DialogueListenResult): boolean {
  const ok = r.blanks.filter((b) => b.correct).length;
  return r.gistCorrect && r.blanks.length > 0 && ok / r.blanks.length >= 0.5;
}

/** The ladder level whose rate equals `rate` (nearest, within 0.01), else undefined: standalone practice at an odd rate carries no level. */
export function levelForRate(rate: number, preferred: number | undefined): number | undefined {
  const matches = LISTEN_LEVELS.map((l, i) => (Math.abs(l.rate - rate) < 0.01 ? i : -1)).filter((i) => i >= 0);
  if (matches.length === 0) return undefined;
  if (preferred !== undefined && matches.includes(clampListenLevel(preferred))) return clampListenLevel(preferred);
  return matches[0];
}

export async function logDialogue(id: string, r: DialogueListenResult, level?: number): Promise<void> {
  await logMeasurement({
    cardId: `dialogue:${id}`,
    skill: 'listen',
    correct: dialogueCorrect(r),
    mode: 'dialogue',
    durationMs: r.ms,
    latencyMs: r.ms,
    ...(level !== undefined ? { level } : {}),
  });
}

/** Introduces the sound card and grades it (3/3 good, 2/3 hard, else forgot); the review log carries the measurement. */
export async function logSound(id: string, r: SoundDrillResult, level?: number): Promise<void> {
  await introduceSound(id);
  const grade: Grade = r.correct >= r.total ? 2 : r.correct * 3 >= r.total * 2 ? 1 : 0;
  await gradeCard(`sound:${id}`, grade, 'sound', r.ms, {
    skill: 'listen',
    correct: r.total > 0 && r.correct / r.total >= 2 / 3,
    latencyMs: r.total > 0 ? Math.round(r.ms / r.total) : r.ms,
    ...(level !== undefined ? { level } : {}),
  });
}

/** One log per number kind that appeared (correct = all items of that kind right). */
export async function logNumbers(r: NumbersDrillResult, level?: number): Promise<void> {
  const byKind = new Map<string, { ok: number; n: number }>();
  for (const it of r.items) {
    const e = byKind.get(it.kind) ?? { ok: 0, n: 0 };
    e.n++;
    if (it.correct) e.ok++;
    byKind.set(it.kind, e);
  }
  const per = r.items.length > 0 ? Math.round(r.ms / r.items.length) : r.ms;
  for (const [kind, e] of byKind) {
    await logMeasurement({
      cardId: `numbers:${kind}`,
      skill: 'listen',
      correct: e.ok === e.n,
      mode: 'numbers',
      durationMs: per * e.n,
      latencyMs: per,
      ...(level !== undefined ? { level } : {}),
    });
  }
}
