// Shared contract for every module. Change only with the lead's approval.

// ---------- Static content (shipped with the app) ----------

/** Grammar points exposed by the Deconstruction Dozen. Frames reference these to link back. */
export type GrammarPoint =
  | 'be-adj' //            1  The apple is red.
  | 'possessive' //        2  It is John's apple.
  | 'double-object' //     3  I give John the apple.
  | 'object-pronoun' //    4  We give him the apple.
  | 'third-person-s' //    5  He gives it to John.
  | 'pronoun-order' //     6  She gives it to him.
  | 'question-inversion' // 7 Is the apple red?
  | 'plural' //            8  The apples are red.
  | 'modal-must' //        9  I must give it to him.
  | 'want-to' //          10  I want to give it to her.
  | 'going-to' //         11  I'm going to know tomorrow.
  | 'negation-modal' //   12  I can't eat the apple.
  | 'present-perfect'; // 13  (I have eaten the apple.)

export type SlotRole =
  | 'subject'
  | 'aux'
  | 'verb'
  | 'object'
  | 'indirect-object'
  | 'complement'
  | 'adverbial'
  | 'determiner'
  | 'particle'
  | 'other';

/** One token pair in the word-by-word Chinese/English alignment (中英逐字对照). */
export interface AlignmentToken {
  en: string; // "gives"
  zh: string; // "给"
  role: SlotRole;
  note?: string; // "第三人称单数要加 -s，中文没有这种变化"
}

export type Level = 'dummy' | 'daily' | 'work';

export interface DozenSentence {
  id: string; // 'd01' .. 'd13'
  order: number; // 1 .. 13 (13 = bonus present perfect)
  en: string;
  zh: string;
  grammar: GrammarPoint[];
  focusZh: string; // what this sentence reveals, 2-4 sentences in Chinese
  alignment: AlignmentToken[]; // in ENGLISH word order
  trapsZh: string[]; // typical mistakes Chinese speakers make, with wrong→right examples
  /** 模组替换: same skeleton, progressively richer vocabulary. At least 2 per level. */
  variants: { en: string; zh: string; level: Level }[];
  frameIds: string[]; // Palmer frames that drill this grammar point
}

export type Scene = 'daily' | 'work' | 'travel' | 'social' | 'study';

export interface SlotOption {
  en: string;
  zh: string;
}

export interface Slot {
  key: string; // matches {key} in pattern / patternZh
  labelZh: string; // "主语"
  options: SlotOption[]; // 3-6 options
}

/**
 * Palmer substitution table (母框). RULE: every combination of one option per slot
 * must be a grammatical, natural English sentence.
 */
export interface SubstitutionFrame {
  id: string; // seed: 'f001'..; ai/user: 'u-<uuid>'
  title: string; // short Chinese name, e.g. "表达打算"
  pattern: string; // "{subject} {aux} {verb} {object} {time}." English order
  patternZh: string; // "{subject}{time}{aux}{verb}{object}。" Chinese order, same keys
  slots: Slot[];
  grammar: GrammarPoint[];
  scene: Scene;
  level: 1 | 2 | 3;
  examples: SlotOption[]; // 2-3 complete model sentences (en/zh)
  tipZh?: string; // usage note
  source: 'seed' | 'ai' | 'user';
}

/** A concrete sentence generated from a frame by picking one option index per slot. */
export interface FrameCombo {
  frameId: string;
  picks: Record<string, number>; // slot key -> option index
  en: string;
  zh: string;
}

// ---------- User data (stored in IndexedDB, synced through Supabase) ----------

export interface SyncedRecord {
  id: string;
  updatedAt: number; // epoch ms, set on every local write; last-write-wins on sync
  deleted?: boolean; // soft delete so deletions sync
  _dirty?: 0 | 1; // 1 = changed locally, not yet pushed. Never sent to the server.
}

export type CardKind = 'dozen' | 'frame';

/** Spaced-repetition state (SM-2). id = `${kind}:${refId}` */
export interface CardState extends SyncedRecord {
  kind: CardKind;
  refId: string;
  due: number; // epoch ms
  interval: number; // days
  ease: number; // starts at 2.5, min 1.3
  reps: number;
  lapses: number;
  lastReviewed?: number;
}

/** 0 = 忘了, 1 = 困难, 2 = 良好, 3 = 简单 */
export type Grade = 0 | 1 | 2 | 3;

export type DrillMode =
  | 'review' // flashcard recall zh -> en
  | 'deconstruct' // reading the alignment of a dozen sentence
  | 'order' // rebuild word order from shuffled tiles
  | 'anchor' // Palmer step 1: listen & repeat the frame
  | 'single-swap' // Palmer step 2: swap one slot at speed
  | 'multi-swap' // Palmer step 3: zh prompt -> produce en with the frame
  | 'output'; // free 模组替换 output, graded by AI

export interface ReviewLog extends SyncedRecord {
  cardId: string;
  grade: Grade;
  mode: DrillMode;
  reviewedAt: number;
  durationMs: number;
}

export interface AiFeedback {
  score: number; // 0-100
  correct: boolean; // grammatical and conveys the prompt
  corrected: string; // corrected / more natural version (same as input if perfect)
  explanationZh: string; // concise Chinese explanation of errors
  alternatives: string[]; // 0-3 other natural ways to say it
}

/** A sentence the learner produced themselves (模组替换输出 / 中译英). */
export interface Attempt extends SyncedRecord {
  refKind: CardKind;
  refId: string;
  promptZh?: string;
  userEn: string;
  feedback?: AiFeedback;
  createdAt: number;
}

export type StepKey = 'warmup' | 'deconstruct' | 'frames' | 'output';

/** One record per calendar day. id = 'YYYY-MM-DD' (local time) */
export interface DailySession extends SyncedRecord {
  date: string;
  dayIndex: number; // 1-based day in the 30-day plan (wraps into maintenance after 30)
  stepsDone: StepKey[];
  activeMs: number;
  completedAt?: number;
}

/** AI- or user-created frames. id = frame.id */
export interface UserFrame extends SyncedRecord {
  frame: SubstitutionFrame;
}

/** Singleton, id = 'profile' */
export interface Profile extends SyncedRecord {
  startDate: string; // 'YYYY-MM-DD', day 1 of the plan
  dailyMinutes: number; // default 15
  scenes: Scene[]; // preferred scenes for frames/AI prompts
}

export type SyncedTable = 'cards' | 'reviews' | 'attempts' | 'sessions' | 'userFrames' | 'profile';

// ---------- Local-only settings (localStorage, never synced) ----------

export interface Settings {
  deepseekApiKey: string;
  deepseekModel: string; // default 'deepseek-chat'
  aiMode: 'direct' | 'proxy'; // proxy = Supabase Edge Function `ai-proxy`
  supabaseUrl: string;
  supabaseAnonKey: string;
  ttsRate: number; // 0.5 - 1.5, default 0.95
  ttsVoiceURI: string; // '' = system default en-US voice
}

// ---------- Daily plan ----------

export interface DayPlan {
  dayIndex: number;
  phase: 'deconstruct' | 'frames' | 'maintenance'; // days 1-13 / 14-30 / 31+
  dozenId: string; // the day's deconstruction sentence (new on days 1-13, review afterwards)
  frameIds: string[]; // 2-3 frames for the day
  outputCount: number; // number of 模组替换 sentences to produce (3)
}
