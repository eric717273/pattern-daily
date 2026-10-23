import type { SlotRole } from '../types';

/** Split "[Subject] [verb] [object]." into plain and [slot] parts. */
export function splitSkeleton(skeleton: string): { text: string; slot: boolean }[] {
  return skeleton
    .split(/(\[[^\]]*\])/g)
    .filter((p) => p !== '')
    .map((p) => (/^\[[^\]]*\]$/.test(p) ? { text: p.slice(1, -1).trim(), slot: true } : { text: p, slot: false }));
}

const ROLE_PATTERNS: [RegExp, SlotRole][] = [
  [/间接|indirect|recipient|\bio\b/i, 'indirect-object'],
  [/主语|subj|\bsub\b/i, 'subject'],
  [/助动|情态|aux|modal|\bbe\b/i, 'aux'],
  [/动词|动作|verb|\bv\b|\bvp\b/i, 'verb'],
  [/宾语|obj|\bdo\b|noun|名词/i, 'object'],
  [/时间|地点|状语|adv|time|place|when|where|adjunct/i, 'adverbial'],
  [/形容词|表语|补语|adj|compl|predicate/i, 'complement'],
  [/限定|冠词|det|article|possess/i, 'determiner'],
];

/** Guess the grammatical role of a skeleton slot label ("Subject", "主语", "indirect object" ...). */
export function skeletonSlotRole(label: string): SlotRole {
  for (const [re, role] of ROLE_PATTERNS) if (re.test(label)) return role;
  return 'other';
}
