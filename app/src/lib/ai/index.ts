import type {
  AiFeedback,
  AlignmentToken,
  DozenSentence,
  GrammarPoint,
  Scene,
  Settings,
  SubstitutionFrame,
} from '../../types';
import { DOZEN } from '../../content';
import { getSettings } from '../settings';
import { supabaseConfigured } from '../sync/client';
import { AiError, chatJson } from './deepseek';
import {
  buildDeconstructMessages,
  buildFrameMessages,
  buildGradeMessages,
  buildOutputPromptsMessages,
  buildPingMessages,
} from './prompts';
import {
  isRecord,
  validateDeconstruction,
  validateFeedback,
  validateFrame,
  validateOutputPrompts,
} from './validate';

export { AiError } from './deepseek';
export type { AiErrorCode } from './deepseek';

export interface Deconstruction {
  en: string;
  zh: string;
  skeleton: string;
  alignment: AlignmentToken[];
  grammar: GrammarPoint[];
  nearestDozenId: string;
  explanationZh: string;
  frame?: SubstitutionFrame;
}

/** True when the selected AI mode has what it needs (direct: a key; proxy: Supabase configured). */
export function aiConfigured(s: Settings = getSettings()): boolean {
  if (s.aiMode === 'proxy') return supabaseConfigured(s);
  return s.deepseekApiKey.trim() !== '';
}

export function gradeOutput(i: {
  promptZh?: string;
  skeletonEn?: string;
  grammar: GrammarPoint[];
  userEn: string;
}): Promise<AiFeedback> {
  return chatJson(buildGradeMessages(i), validateFeedback, { temperature: 0.2 });
}

/** 视频 AI 指令 1：10 分钟看清骨架 */
export function deconstruct(sentenceEn: string): Promise<Deconstruction> {
  const en = sentenceEn.trim();
  if (!en) return Promise.reject(new AiError('bad-response', '请先输入一句英语。'));
  const dozenIds = DOZEN.map((d) => d.id);
  return chatJson(
    buildDeconstructMessages(en, DOZEN),
    (u) => validateDeconstruction(u, { en, dozenIds }),
    { temperature: 0.2, maxTokens: 1900 },
  );
}

export async function generateFrame(i: {
  topic: string;
  scene: Scene;
  level: 1 | 2 | 3;
  grammar?: GrammarPoint[];
}): Promise<SubstitutionFrame> {
  const frame = await chatJson(buildFrameMessages(i), validateFrame, { temperature: 0.7, maxTokens: 1900 });
  return {
    ...frame,
    scene: i.scene,
    level: i.level,
    grammar: frame.grammar.length === 0 && i.grammar ? [...i.grammar] : frame.grammar,
  };
}

/** 视频 AI 指令 2：每天 3 句模组替换 */
export function generateOutputPrompts(i: {
  dozen: DozenSentence;
  frames: SubstitutionFrame[];
  scenes: Scene[];
  count: number;
}): Promise<{ promptZh: string; hintEn: string }[]> {
  return chatJson(buildOutputPromptsMessages(i), (u) => validateOutputPrompts(u, i.count), {
    temperature: 0.8,
  });
}

/** Minimal request that verifies the key / proxy / connectivity. Resolves when the API answered. */
export async function testConnection(): Promise<void> {
  await chatJson(buildPingMessages(), (u) => {
    if (!isRecord(u)) throw new Error('not an object');
    return u;
  }, { temperature: 0, maxTokens: 20 });
}
