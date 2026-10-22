import type { DozenSentence, GrammarPoint, Scene, SubstitutionFrame } from '../../types';
import type { ChatMessage } from './deepseek';
import { GRAMMAR_POINTS, SCENES, SLOT_ROLES } from './validate';

export const SYSTEM_PROMPT = `你是一位面向中文母语者的英语教练，教学法来自两位大师：
1. Tim Ferriss 的「12 句解构法」：用最简单的词汇暴露英语的底层骨架（语序、代词、时态、倒装、否定、情态动词），再用中英逐字对照看清中英文差异。
2. Harold Palmer 的「替换表（母框）」：固定句子骨架，把词块换成同一语法家族的其他成员，通过大量替换把句型变成脱口而出的习惯。
规则：
- 所有解释一律使用简体中文，简洁、具体、不说空话；英文例句必须地道自然。
- 你必须只输出一个合法的 JSON 对象（JSON only），不要输出 Markdown 代码块、前言或任何多余文字。
- 面向学习者的语气要鼓励，但对语法错误要严格、准确。`;

const GRAMMAR_LIST = GRAMMAR_POINTS.join(' | ');
const ROLE_LIST = SLOT_ROLES.join(' | ');
const SCENE_LIST = SCENES.join(' | ');

const GRAMMAR_GLOSS = `GrammarPoint 取值含义：
be-adj=be 动词+形容词；possessive=所有格 's；double-object=双宾语（give John the apple）；object-pronoun=宾格代词；third-person-s=第三人称单数 -s；pronoun-order=代词宾语语序（give it to him）；question-inversion=疑问句倒装；plural=名词复数与一致；modal-must=情态动词+原形；want-to=want to+原形；going-to=be going to 将来时；negation-modal=情态否定（can't）；present-perfect=现在完成时。`;

const FRAME_SHAPE = `{
  "title": "简短中文名，如「表达打算」",
  "pattern": "{subject} {aux} {verb} {object} {time}.",
  "patternZh": "{subject}{time}{aux}{verb}{object}。",
  "slots": [
    { "key": "subject", "labelZh": "主语", "options": [ { "en": "I", "zh": "我" }, { "en": "We", "zh": "我们" }, { "en": "They", "zh": "他们" } ] }
  ],
  "grammar": ["going-to"],
  "scene": "work",
  "level": 2,
  "examples": [ { "en": "We are going to review the plan tomorrow.", "zh": "我们明天要回顾这个计划。" }, { "en": "...", "zh": "..." } ],
  "tipZh": "可选，一句用法提示"
}`;

const FRAME_RULES = `母框（substitution frame）的硬性规则：
1. 【最重要】从每个槽位各任选一个选项，所有组合都必须是语法正确且自然的英语句子。若选项会互相冲突（如主语单复数影响 be 动词、第三人称 -s、a/an、及物与不及物、可数与不可数），就把冲突的部分并入同一个槽位（例如把「主语+助动词」合成一个槽位），或改写选项，直到任意组合都成立。
2. pattern 与 patternZh 使用花括号占位符 {key}，两者的占位符集合必须与 slots 的 key 完全一致（每个 key 都出现，且没有多余的）。key 只用英文字母/数字/下划线。
3. 每个槽位 3-6 个选项，每个选项都有 en 与 zh；整句的中文语序按中文习惯写在 patternZh。
4. examples 给出 2-3 个完整示范句（en/zh），应是某个组合的实际结果。
5. grammar 只能使用这些值：${GRAMMAR_LIST}。scene 只能是：${SCENE_LIST}。level 为 1（最简单）、2、3（较复杂）。`;

// ---------- gradeOutput ----------

export interface GradeInput {
  promptZh?: string;
  skeletonEn?: string;
  grammar: GrammarPoint[];
  userEn: string;
}

export function buildGradeMessages(i: GradeInput): ChatMessage[] {
  const lines: string[] = ['请批改学习者写的这句英语，并以 JSON 返回结果。', ''];
  if (i.promptZh) lines.push(`中文题目（学习者要表达的意思）：${i.promptZh}`);
  if (i.skeletonEn) lines.push(`要求使用的句型骨架：${i.skeletonEn}`);
  if (i.grammar.length) lines.push(`要求练习的语法点：${i.grammar.join(', ')}`);
  lines.push(`学习者的句子：${i.userEn}`, '');
  lines.push(
    `评判标准：
1. 语法是否正确；2. 是否用了给定的句型骨架/语法点（若给出）；3. 是否准确表达了中文题目的意思（若给出）；4. 是否自然地道。
评分 0-100：90 以上=正确且自然；70-89=基本正确但有小问题；50-69=有明显错误；50 以下=严重错误或偏题。鼓励但要严格，不要为了好听而放水。
correct：语法正确且表达了题意时为 true。corrected：修正后或更自然的版本（若原句已完美，则与原句相同）。explanationZh：用简体中文简要指出错误和原因（完美时给一句简短肯定），不超过 120 字。alternatives：0-3 个其他自然说法。`,
    '',
    '只返回如下形状的 JSON：',
    `{
  "score": 85,
  "correct": true,
  "corrected": "I am going to finish the report tomorrow.",
  "explanationZh": "语法正确。tomorrow 放句尾更自然。",
  "alternatives": ["I'm going to finish the report tomorrow."]
}`,
  );
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: lines.join('\n') },
  ];
}

// ---------- deconstruct ----------

export function buildDeconstructMessages(sentenceEn: string, dozen: DozenSentence[]): ChatMessage[] {
  const dozenList = dozen.map((d) => `${d.id}: ${d.en}（${d.zh}）`).join('\n');
  const user = `请对下面这句英语做「骨架解构」，并以 JSON 返回结果。

目标句：${sentenceEn}

要求：
1. zh：自然的中文翻译。
2. skeleton：把句中的实词替换成方括号槽位标签后得到的骨架，保留功能词和语法结构，例如 "[主语] must [动作] [宾语]"。
3. alignment：按【英文语序】逐词（或逐个固定词块）给出中英逐字对照。每项 { "en", "zh", "role", "note" }；role 只能是：${ROLE_LIST}；note 可选，用于指出中英文差异或易错点（简体中文）。
4. grammar：这句话涉及的语法点，只能使用：${GRAMMAR_LIST}。
${GRAMMAR_GLOSS}
5. nearestDozenId：从下面 13 个「解构句」中选出骨架最接近的一个的 id。
${dozenList}
6. explanationZh：用简体中文解释这句话的骨架、与中文的主要差异、以及中文母语者最容易犯的错，不超过 200 字。
7. frame（可选）：以这句话的骨架为基础造一个替换母框。
${FRAME_RULES}

只返回如下形状的 JSON（frame 可省略；其内部形状见 frame 示例）：
{
  "zh": "我必须把它给他。",
  "skeleton": "[主语] must [动作] [宾语] to [宾语]",
  "alignment": [
    { "en": "I", "zh": "我", "role": "subject" },
    { "en": "must", "zh": "必须", "role": "aux", "note": "情态动词后面直接接动词原形" },
    { "en": "give", "zh": "给", "role": "verb" },
    { "en": "it", "zh": "它", "role": "object" },
    { "en": "to him", "zh": "给他", "role": "indirect-object", "note": "代词做宾语时用 to 结构" }
  ],
  "grammar": ["modal-must", "pronoun-order"],
  "nearestDozenId": "d09",
  "explanationZh": "……",
  "frame": ${FRAME_SHAPE}
}`;
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
}

// ---------- generateFrame ----------

export interface FrameInput {
  topic: string;
  scene: Scene;
  level: 1 | 2 | 3;
  grammar?: GrammarPoint[];
}

export function buildFrameMessages(i: FrameInput): ChatMessage[] {
  const grammarLine = i.grammar?.length
    ? `必须围绕这些语法点设计：${i.grammar.join(', ')}。`
    : '语法点 grammar 由你根据主题选择合适的取值（至少一个）。';
  const levelHint = ['', '最简单：短句、高频词', '中等：常见日常/职场表达', '较复杂：更长的句子、更丰富的词汇'][i.level];
  const user = `请设计一个英语「替换表母框」，并以 JSON 返回。

主题：${i.topic}
场景 scene：${i.scene}
难度 level：${i.level}（${levelHint}）
${grammarLine}
${GRAMMAR_GLOSS}

${FRAME_RULES}

只返回一个 JSON 对象，形状如下（scene 与 level 请使用上面指定的值）：
${FRAME_SHAPE}`;
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
}

// ---------- generateOutputPrompts ----------

export interface OutputPromptsInput {
  dozen: DozenSentence;
  frames: SubstitutionFrame[];
  scenes: Scene[];
  count: number;
}

export function buildOutputPromptsMessages(i: OutputPromptsInput): ChatMessage[] {
  const frames = i.frames
    .map((f) => {
      const slots = f.slots.map((s) => `${s.key}(${s.labelZh}): ${s.options.map((o) => o.en).join(' / ')}`).join('; ');
      return `- ${f.title}：${f.pattern}  槽位 ${slots}`;
    })
    .join('\n');
  const user = `请为学习者出 ${i.count} 道「每天模组替换」输出题，并以 JSON 返回。

今日解构句：${i.dozen.en}（${i.dozen.zh}）
今日骨架要点：${i.dozen.focusZh}
今日母框：
${frames || '（无）'}
学习者偏好的场景：${i.scenes.length ? i.scenes.join(', ') : 'daily'}

要求：
1. 每道题给出一句【中文提示】promptZh，是学习者在上述场景里真实会说的话；学习者需要用今日解构句的骨架或今日母框把它翻译/说成英语。
2. 同一批题目要覆盖不同的场景和不同的母框/槽位组合，难度循序渐进，每题都不同。
3. promptZh 不要出现英文答案；hintEn 只给 2-4 个目标词汇/短语（英文，逗号分隔），不要给出整句答案。
4. 题目数量必须正好是 ${i.count}。

只返回如下形状的 JSON：
{
  "prompts": [
    { "promptZh": "告诉同事你明天必须把报告交给经理。", "hintEn": "submit, report, manager" }
  ]
}`;
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
}

// ---------- testConnection ----------

export function buildPingMessages(): ChatMessage[] {
  return [
    { role: 'system', content: 'You are a connectivity probe. Reply with a json object only.' },
    { role: 'user', content: 'Reply with this json exactly: {"ok": true}' },
  ];
}
