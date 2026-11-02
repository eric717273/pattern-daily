import type {
  AdaptiveChange,
  Assessment,
  FunctionCategory,
  ItemRef,
  Ladder,
  Profile,
  Skill,
  SoundKind,
} from '../types';
import { getChunk, getSeedFrame } from '../content';
import type { GoalPlan, ProgressReport } from './goalPlan';
import type { SkillStats } from './skills';

/**
 * Aggregated, privacy-safe input of the weekly coach report: statistics and library texts only,
 * never the learner's own sentences (research/DELIBERATE-PRACTICE.md §八).
 */
export interface CoachInput {
  /** Lesson number the report is for. */
  lesson: number;
  skills: Partial<Record<Skill, { n: number; acc: number; medianLatencyMs?: number; trend?: number }>>;
  ladder: Ladder;
  /** Recent controller changes (newest last, at most 10). */
  ladderHistory: AdaptiveChange[];
  weakCategories: { category: FunctionCategory; acc: number; n: number; examples: string[] }[];
  /** English texts of the edge items (at most 5). */
  edgeTexts: string[];
  soundErrors: { name: string; kind: SoundKind; errors: number; attempts: number }[];
  goal?: {
    horizonDays: number;
    dailyMinutes: number;
    day: number;
    phaseNameZh: string;
    status: ProgressReport['status'];
    adviceZh: string;
    itemsLearned: number;
    expectedItems: number;
  };
  /** Latest assessments, oldest first (at most 4). */
  assessments: Pick<Assessment, 'date' | 'kind' | 'listenLevel' | 'speakLevel' | 'listenAcc' | 'speakAcc' | 'levelZh'>[];
}

export interface CoachInputArgs {
  lesson: number;
  stats: SkillStats;
  profile: Profile;
  ladder: Ladder;
  edge: ItemRef[];
  itemsLearned: number;
  /** Plan + progress, when the learner has a goal. */
  goal?: { plan: GoalPlan; progress: ProgressReport };
}

const EXAMPLES_PER_CATEGORY = 3;

function textOf(ref: ItemRef): string | undefined {
  if (ref.kind === 'chunk') return getChunk(ref.id)?.en;
  return getSeedFrame(ref.id)?.pattern;
}

function textOfCard(cardId: string): string | undefined {
  const [kind, id] = cardId.split(':');
  return kind === 'chunk' || kind === 'frame' ? textOf({ kind, id }) : undefined;
}

/** Condenses statistics, profile and plan progress into the report input (texts resolved from the library). */
export function buildCoachInput(a: CoachInputArgs): CoachInput {
  const skills: CoachInput['skills'] = {};
  for (const skill of ['listen', 'speak', 'decode'] as const) {
    const s = a.stats.bySkill[skill];
    if (s.n === 0) continue;
    skills[skill] = {
      n: s.n,
      acc: s.acc,
      ...(s.medianLatencyMs !== undefined ? { medianLatencyMs: s.medianLatencyMs } : {}),
      ...(s.trend !== undefined ? { trend: s.trend } : {}),
    };
  }

  const weakCategories = a.stats.weakestCategories.map((c) => ({
    category: c.category,
    acc: c.acc,
    n: c.n,
    examples: c.missedCardIds
      .map(textOfCard)
      .filter((t): t is string => t !== undefined)
      .slice(0, EXAMPLES_PER_CATEGORY),
  }));

  const out: CoachInput = {
    lesson: a.lesson,
    skills,
    ladder: a.ladder,
    ladderHistory: (a.profile.adaptive?.history ?? []).slice(-10),
    weakCategories,
    edgeTexts: a.edge.map(textOf).filter((t): t is string => t !== undefined).slice(0, 5),
    soundErrors: a.stats.soundErrors
      .slice(0, 5)
      .map((s) => ({ name: s.name, kind: s.kind, errors: s.errors, attempts: s.attempts })),
    assessments: (a.profile.assessments ?? []).slice(-4).map((x) => ({
      date: x.date,
      kind: x.kind,
      listenLevel: x.listenLevel,
      speakLevel: x.speakLevel,
      listenAcc: x.listenAcc,
      speakAcc: x.speakAcc,
      levelZh: x.levelZh,
    })),
  };
  if (a.goal) {
    const { plan, progress } = a.goal;
    out.goal = {
      horizonDays: plan.horizonDays,
      dailyMinutes: plan.dailyMinutes,
      day: plan.currentDay,
      phaseNameZh: plan.phases[plan.currentPhase].nameZh,
      status: progress.status,
      adviceZh: progress.adviceZh,
      itemsLearned: a.itemsLearned,
      expectedItems: progress.expected.itemsLearned,
    };
  }
  return out;
}
