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
  frameIds: string[]; // legacy link to frames sharing this grammar point (display only, never used for scheduling)
  /** 变形练习: Tim-style transformations of the base sentence (decode track). 5-7 per sentence. */
  transforms: TransformTask[];
}

export type TransformOp =
  | 'question' // → yes/no question
  | 'negative' // → negative
  | 'past' // → simple past
  | 'future' // → be going to / will
  | 'perfect' // → present perfect
  | 'third-person' // change subject to he/she (verb agreement)
  | 'plural' // singular ↔ plural
  | 'pronoun' // replace nouns with pronouns (word-order change!)
  | 'modal'; // add must / can / want to

export interface TransformTask {
  op: TransformOp;
  instructionZh: string; // "改成疑问句"
  from: string; // source sentence (the base sentence or a variant)
  to: string; // the single best answer
  alt?: string[]; // other fully-correct answers (contractions etc. are already normalized)
  noteZh?: string; // what changed in the skeleton, 1 sentence
}

// ---------- Chunk track (Palmer + lexical approach): automatic recall & recognition ----------

/** Communicative function — the organising axis of the chunk library (NOT grammar). */
export type FunctionCategory =
  | 'greeting' //    寒暄开场与告别
  | 'response' //    回应与附和
  | 'filler' //      思考缓冲与争取时间
  | 'connector' //   连接转折与组织语言
  | 'opinion' //     表达观点
  | 'agree' //       同意与反对
  | 'request' //     请求与求助
  | 'offer' //       提议、邀请与回应
  | 'thanks' //      感谢、道歉与客套
  | 'question' //    询问信息
  | 'clarify' //     澄清、确认与听不懂时
  | 'feeling' //     情绪与感受
  | 'plan' //        计划与安排
  | 'experience' //  经历与讲述过去
  | 'describe' //    描述与评价
  | 'advice' //      建议、提醒与鼓励
  | 'problem' //     问题、抱怨与解决
  | 'work' //        职场沟通
  | 'travel' //      出行与生活服务
  | 'social'; //     社交闲聊

/** 1 = 最高频（每天都会听到/用到）, 2 = 常用, 3 = 进阶 */
export type Freq = 1 | 2 | 3;

/** A fixed or semi-fixed expression learned and recalled as ONE unit (no slots). */
export interface Chunk {
  id: string; // 'c001'..'c250'
  en: string; // "It's up to you." / "I was wondering if …" (… marks an open continuation)
  zh: string;
  category: FunctionCategory;
  freq: Freq;
  register: 'casual' | 'neutral' | 'formal';
  /** 2 natural lines (mini dialogue or real-life sentence) containing `en` VERBATIM (case-insensitive, minus trailing punctuation/…). */
  examples: SlotOption[];
  noteZh?: string; // when/how to use it, nuance, common misuse
  soundZh?: string; // listening tip: linking/reduction, e.g. "what do you → whaddya"
}

export type ItemKind = 'frame' | 'chunk';
export interface ItemRef {
  kind: ItemKind;
  id: string;
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
  category?: FunctionCategory; // required for seed frames
  freq?: Freq; // required for seed frames
  soundZh?: string; // optional listening tip for the fixed part of the frame
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

export type CardKind = 'dozen' | 'frame' | 'chunk';

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
  | 'output' // free output using today's chunks, graded by AI
  | 'listen' // chunk track: hear it at natural speed, recognise the chunk
  | 'shadow' // chunk track: repeat after audio, voice-verified
  | 'recall' // chunk track: zh/situation → say the chunk
  | 'transform' // decode track: transform a sentence (question/negative/past…)
  | 'label'; // decode track: mark subject/verb/object/time in a sentence

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

/** v2 daily flow. Old sessions may still contain legacy keys ('warmup'|'deconstruct'|'frames'); ignore them. */
export type StepKey = 'review' | 'chunks' | 'decode' | 'output';

/** One record per calendar day. id = 'YYYY-MM-DD' (local time) */
export interface DailySession extends SyncedRecord {
  date: string;
  dayIndex: number; // 1-based lesson number = completed lessons before this day + 1
  stepsDone: StepKey[];
  /** Today's plan, frozen when the session is created so it never reshuffles mid-day or across devices. */
  plan?: DayPlan;
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
  newPerDay?: number; // new chunk-track items per day, default 5 (range 3-10)
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

/**
 * Two independent tracks:
 * - decode (Tim): days 1-13 learn one skeleton per day ('foundation'); afterwards a ~3-minute
 *   'maintenance' exercise per day (transform or label), rotating through the 13 skeletons.
 * - chunks (Palmer + lexical approach): `newItems` = the next N not-yet-introduced library items
 *   in curriculum order (by frequency, interleaving categories and frames/chunks). Reviews come from SRS.
 */
export interface DayPlan {
  dayIndex: number;
  decode:
    | { phase: 'foundation'; dozenId: string }
    | { phase: 'maintenance'; dozenId: string; mode: 'transform' | 'label' };
  newItems: ItemRef[];
  outputCount: number; // AI/offline output prompts using today's chunks (3)
}
