import type { GrammarPoint, Level, Scene, Slot, SlotRole } from '../types';

/** Chinese labels for every grammar point of the Deconstruction Dozen. */
export const GRAMMAR_LABELS: Record<GrammarPoint, string> = {
  'be-adj': 'be + 形容词',
  possessive: "所有格 's",
  'double-object': '双宾语语序',
  'object-pronoun': '宾格代词',
  'third-person-s': '第三人称 -s',
  'pronoun-order': '代词语序',
  'question-inversion': '疑问倒装',
  plural: '名词复数',
  'modal-must': '情态动词',
  'want-to': 'want to + 动词',
  'going-to': 'be going to 将来',
  'negation-modal': '情态否定',
  'present-perfect': '现在完成时',
};

export const GRAMMAR_POINTS = Object.keys(GRAMMAR_LABELS) as GrammarPoint[];

export const SCENE_LABELS: Record<Scene, string> = {
  work: '职场',
  daily: '日常',
  travel: '旅行',
  social: '社交',
  study: '学习',
};

export const SCENES = Object.keys(SCENE_LABELS) as Scene[];

/** Frame difficulty (SubstitutionFrame.level). */
export const FRAME_LEVEL_LABELS: Record<1 | 2 | 3, string> = {
  1: '入门',
  2: '进阶',
  3: '高阶',
};

export const FRAME_LEVELS: (1 | 2 | 3)[] = [1, 2, 3];

/** Vocabulary level of a 模组替换 variant (DozenSentence.variants[].level). */
export const VARIANT_LEVEL_LABELS: Record<Level, string> = {
  dummy: '假人词',
  daily: '日常',
  work: '职场',
};

export const VARIANT_LEVELS: Level[] = ['dummy', 'daily', 'work'];

export const SLOT_ROLE_LABELS: Record<SlotRole, string> = {
  subject: '主语',
  aux: '助动词/情态',
  verb: '动词',
  object: '宾语',
  'indirect-object': '间接宾语',
  complement: '表语/补语',
  adverbial: '状语/时间',
  determiner: '限定词',
  particle: '小品词',
  other: '其他',
};

/**
 * Tailwind class bundles for each role. They are written out in full so the Tailwind scanner sees them.
 * Colour language (used everywhere): subject=sky, aux/modal=violet, verb=emerald,
 * object/indirect-object=amber, adverbial/time=rose, everything else=slate.
 */
export interface RoleStyle {
  /** Stacked token chip (AlignmentView). */
  chip: string;
  /** Small inline pill (patterns). */
  pill: string;
  /** Column header (FrameTable). */
  header: string;
  /** Selected cell. */
  selected: string;
  /** Idle cell (hover state included). */
  cell: string;
  /** Legend dot. */
  dot: string;
  /** Focus ring colour for emphasis. */
  ring: string;
}

const SKY: RoleStyle = {
  chip: 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-800/70 dark:bg-sky-950/50 dark:text-sky-50',
  pill: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
  header: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
  selected: 'border-sky-500 bg-sky-500 text-white dark:border-sky-400 dark:bg-sky-500',
  cell: 'hover:border-sky-300 hover:bg-sky-50 dark:hover:border-sky-700 dark:hover:bg-sky-950/40',
  dot: 'bg-sky-500',
  ring: 'ring-sky-400',
};

const VIOLET: RoleStyle = {
  chip: 'border-violet-200 bg-violet-50 text-violet-950 dark:border-violet-800/70 dark:bg-violet-950/50 dark:text-violet-50',
  pill: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200',
  header: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200',
  selected: 'border-violet-500 bg-violet-500 text-white dark:border-violet-400 dark:bg-violet-500',
  cell: 'hover:border-violet-300 hover:bg-violet-50 dark:hover:border-violet-700 dark:hover:bg-violet-950/40',
  dot: 'bg-violet-500',
  ring: 'ring-violet-400',
};

const EMERALD: RoleStyle = {
  chip: 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-50',
  pill: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  header: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  selected: 'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-600',
  cell: 'hover:border-emerald-300 hover:bg-emerald-50 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/40',
  dot: 'bg-emerald-500',
  ring: 'ring-emerald-400',
};

const AMBER: RoleStyle = {
  chip: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-50',
  pill: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  header: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  selected: 'border-amber-600 bg-amber-600 text-white dark:border-amber-500 dark:bg-amber-600',
  cell: 'hover:border-amber-300 hover:bg-amber-50 dark:hover:border-amber-700 dark:hover:bg-amber-950/40',
  dot: 'bg-amber-500',
  ring: 'ring-amber-400',
};

const ROSE: RoleStyle = {
  chip: 'border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-800/70 dark:bg-rose-950/50 dark:text-rose-50',
  pill: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
  header: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
  selected: 'border-rose-500 bg-rose-500 text-white dark:border-rose-400 dark:bg-rose-500',
  cell: 'hover:border-rose-300 hover:bg-rose-50 dark:hover:border-rose-700 dark:hover:bg-rose-950/40',
  dot: 'bg-rose-500',
  ring: 'ring-rose-400',
};

const SLATE: RoleStyle = {
  chip: 'border-slate-200 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-50',
  pill: 'bg-slate-200 text-slate-700 dark:bg-slate-700/70 dark:text-slate-200',
  header: 'bg-slate-200 text-slate-700 dark:bg-slate-700/70 dark:text-slate-200',
  selected: 'border-slate-600 bg-slate-600 text-white dark:border-slate-400 dark:bg-slate-500',
  cell: 'hover:border-slate-300 hover:bg-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-800/60',
  dot: 'bg-slate-400',
  ring: 'ring-slate-400',
};

export const ROLE_STYLES: Record<SlotRole, RoleStyle> = {
  subject: SKY,
  aux: VIOLET,
  verb: EMERALD,
  object: AMBER,
  'indirect-object': AMBER,
  complement: SLATE,
  adverbial: ROSE,
  determiner: SLATE,
  particle: SLATE,
  other: SLATE,
};

const KEY_ROLES: Record<string, SlotRole> = {
  subject: 'subject',
  who: 'subject',
  noun: 'subject',
  aux: 'aux',
  modal: 'aux',
  verb: 'verb',
  action: 'verb',
  done: 'verb',
  habit: 'verb',
  task: 'verb',
  object: 'object',
  thing: 'object',
  item: 'object',
  pronoun: 'object',
  person: 'object',
  request: 'object',
  topic: 'object',
  recipient: 'indirect-object',
  owner: 'indirect-object',
  time: 'adverbial',
  place: 'adverbial',
  adverb: 'adverbial',
  duration: 'adverbial',
  reason: 'adverbial',
  purpose: 'adverbial',
  condition: 'adverbial',
  method: 'adverbial',
  mode: 'adverbial',
  situation: 'adverbial',
  adjective: 'complement',
  adj: 'complement',
  status: 'complement',
  state: 'complement',
  degree: 'complement',
};

/** [pattern on labelZh, role], checked in order when the slot key is not decisive. */
const LABEL_ROLES: [RegExp, SlotRole][] = [
  [/^(主语|复数主语|某人|Be\+主语)/, 'subject'],
  [/接收|对象|为了谁/, 'indirect-object'],
  [/情态|助动词/, 'aux'],
  [/时间|地点|目的|理由|原因|频率|期限|时长|方式|条件|情况|程度|副词/, 'adverbial'],
  [/动词|动作|完成|活动|想做|没做|不想做|更想做|承诺/, 'verb'],
  [/形容词|状态|状况/, 'complement'],
  [/东西|物品|资料|商品|宾语|宾格|内容|问题|请求|工作|技能|语言|计划/, 'object'],
];

/**
 * Guess the grammatical role of a substitution slot from its key and Chinese label, so tables can
 * be colour-coded like the 中英逐字对照. Unknown slots (openers, tails, ...) fall back to 'other' (slate).
 */
export function inferSlotRole(slot: Pick<Slot, 'key' | 'labelZh'>): SlotRole {
  const byKey = KEY_ROLES[slot.key];
  if (byKey) return byKey;
  for (const [re, role] of LABEL_ROLES) if (re.test(slot.labelZh)) return role;
  return 'other';
}
