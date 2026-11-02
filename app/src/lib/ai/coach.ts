import type { CoachReport, Skill } from '../../types';
import type { CoachInput } from '../coachInput';
import { FUNCTION_CATEGORY_LABELS } from '../labels';
import { BAND_HIGH, BAND_LOW, MIN_SAMPLES, STRUGGLE_ACC } from '../adaptive';
import { speakLimitMs } from '../ladder';
import { chatJson, type ChatMessage } from './deepseek';
import { validateCoachReport } from './validate';

// The weekly AI coach (research/DELIBERATE-PRACTICE.md §八). Input is aggregated statistics only.

const SKILL_ZH: Record<Skill, string> = { listen: '听力', speak: '口语', decode: '解码' };
const SOUND_KIND_ZH: Record<string, string> = {
  reduction: '弱读/缩读',
  linking: '连读',
  elision: '吞音',
  flap: '闪音',
  assimilation: '同化',
  'weak-form': '功能词弱读',
};
const pct = (x: number): string => `${Math.round(x * 100)}%`;
const SECONDS = (ms: number): string => `${(ms / 1000).toFixed(1)} 秒`;

// ---------- AI report ----------

const COACH_SYSTEM = `你是「句型日练」的英语口语与听力教练，学习者是中文母语者，目标是提升日常口语，尤其是日常听力。
学习方法是刻意练习：把每项技能的滚动正确率维持在 70%–88% 的舒适区边缘（高于 88% 就升级难度，低于 70% 就降级）。
你只会收到聚合后的统计数据和语块文本，不会看到学习者写的原句。
规则：
- 全部使用简体中文（引用英语语块时保留英文原文）。
- 只依据给出的数据下结论，不编造数据；每条建议都要对应数据里的具体数字、语块或音变，写成明天就能照做的练习动作。
- 语气鼓励但诚实；不要空话套话。
- 你必须只输出一个合法的 JSON 对象（JSON only），不要输出 Markdown 代码块或多余文字。`;

const COACH_SHAPE = `{
  "summaryZh": "2-3 句总评，包含最关键的 2-3 个数字",
  "strengthsZh": ["做得好的地方，带数字，最多 5 条"],
  "weaknessesZh": ["薄弱点，点名具体技能/类别/音变/语块，最多 5 条"],
  "nextWeekFocusZh": ["下周的 2-3 个重点，最多 4 条"],
  "tipsZh": ["具体可执行的练习建议，例如「每天把 X 语块大声说 3 遍并计时」，3-6 条"],
  "suggestedNewPerDay": 6
}`;

export function buildCoachMessages(input: CoachInput): ChatMessage[] {
  const user = `请根据下面的统计数据，为学习者写本周（第 ${input.lesson} 课）的学习周报，并以 JSON 返回。

数据说明：
- skills：各技能最近 40 次作答的正确率 acc（0-1）、n 为样本数、medianLatencyMs 为答对题的反应时间中位数、trend 为最近 20 次比之前 20 次的正确率变化。
- ladder：当前难度（listen=L0-L8 听力等级，speak=S0-S5 口语限时等级，newPerDay=每天新语块数）；ladderHistory 是难度控制器的调整记录。
- weakCategories：按交际功能归类后正确率最低的类别，examples 是其中答错的语块。
- edgeTexts：处在「将会未会」边缘的语块；soundErrors：出错最多的连读弱读类型。
- goal：目标周期、当前阶段、进度状态（ahead 超前 / on-track 按计划 / behind 落后）；assessments：诊断与周复测记录。

数据（JSON）：
${JSON.stringify(input)}

要求：
1. 正确率落在 0.70–0.88 说明难度合适，高于 0.88 说明偏轻，低于 0.70 说明偏难，据此点评，不要笼统地说「继续努力」。
2. tipsZh 的每一条都必须关联上面数据里的某个具体对象（技能、类别、语块、音变或进度），并给出动作、次数或时长。
3. suggestedNewPerDay 可选：只有数据明确支持调整每天新语块数（3-12 的整数）时才给，否则省略该字段。
4. 数据不足（n < ${MIN_SAMPLES}）的技能，只说明样本不足，不要下结论。

只返回如下形状的 JSON：
${COACH_SHAPE}`;
  return [
    { role: 'system', content: COACH_SYSTEM },
    { role: 'user', content: user },
  ];
}

function reportId(now: number): string {
  return `coach-${now}`;
}

/** Asks the AI for the weekly report. Rejects with AiError when not configured, unreachable or invalid. */
export async function generateCoachReport(input: CoachInput, now: number = Date.now()): Promise<CoachReport> {
  const fields = await chatJson(buildCoachMessages(input), validateCoachReport, { temperature: 0.4, maxTokens: 2500 });
  return { id: reportId(now), createdAt: now, lesson: input.lesson, source: 'ai', ...fields };
}

// ---------- offline fallback ----------

/**
 * A short weekly report built from thresholds only (no AI): comfort-zone verdict per skill, trends, response time
 * against the speaking limit, weakest categories, sound errors, edge items and plan progress.
 */
export function rulesCoachReport(input: CoachInput, now: number = Date.now()): CoachReport {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const focus: string[] = [];
  const tips: string[] = [];
  const parts: string[] = [];
  let struggling = false;
  let allReady = true;
  let measuredSkills = 0;

  for (const skill of ['listen', 'speak', 'decode'] as const) {
    const s = input.skills[skill];
    const name = SKILL_ZH[skill];
    if (!s || s.n < MIN_SAMPLES) {
      if (s) parts.push(`${name} 样本还少（${s.n} 次）`);
      continue;
    }
    measuredSkills++;
    parts.push(`${name}正确率 ${pct(s.acc)}`);
    if (s.acc > BAND_HIGH) {
      strengths.push(`${name}正确率 ${pct(s.acc)}，高于舒适区上限 88%，说明当前难度偏轻，难度会自动提高。`);
      if (skill !== 'decode') tips.push(`${name}已经很稳，下一步把难度往上推：${skill === 'listen' ? '用更快的语速听写，并优先练第 3 档对话' : '把限时再缩短，追求脱口而出'}。`);
    } else if (s.acc >= BAND_LOW) {
      strengths.push(`${name}正确率 ${pct(s.acc)}，落在 70%–88% 的目标区间，难度合适。`);
    } else {
      weaknesses.push(`${name}正确率 ${pct(s.acc)}，低于 70%，目前偏难。`);
      allReady = false;
      if (s.acc < STRUGGLE_ACC) struggling = true;
      focus.push(`先把${name}稳住：难度会自动退一档，别急着往前赶。`);
    }
    if (s.acc < BAND_HIGH) allReady = false;
    if (s.trend !== undefined && Math.abs(s.trend) >= 0.05) {
      if (s.trend > 0) strengths.push(`${name}最近 20 次比之前 20 次提高了 ${Math.round(s.trend * 100)} 个百分点。`);
      else weaknesses.push(`${name}最近 20 次比之前下降了 ${Math.round(-s.trend * 100)} 个百分点，注意休息和复习。`);
    }
  }

  // speaking speed against the current limit
  const speak = input.skills.speak;
  if (speak?.medianLatencyMs !== undefined && speak.n >= MIN_SAMPLES) {
    const limit = speakLimitMs(input.ladder.speak);
    if (speak.medianLatencyMs >= limit * 0.8) {
      weaknesses.push(`口语答对时中位用时 ${SECONDS(speak.medianLatencyMs)}，接近 ${limit / 1000} 秒的限时。`);
      tips.push(`把边缘语块每天大声说 3 遍并计时，目标是中位用时降到 ${SECONDS(limit * 0.7)}以内。`);
    } else {
      strengths.push(`口语答对时中位用时 ${SECONDS(speak.medianLatencyMs)}，离 ${limit / 1000} 秒的限时有余量。`);
    }
  }

  // weakest categories
  for (const c of input.weakCategories.slice(0, 2)) {
    const label = FUNCTION_CATEGORY_LABELS[c.category] ?? c.category;
    const ex = c.examples.length > 0 ? `，如 ${c.examples.map((e) => `"${e}"`).join('、')}` : '';
    weaknesses.push(`「${label}」类语块正确率 ${pct(c.acc)}（${c.n} 次）${ex}。`);
    focus.push(`多练「${label}」类语块。`);
    const first = c.examples[0] ? `（先从 "${c.examples[0]}" 开始）` : '';
    tips.push(`每天挑 2 条「${label}」类语块${first}，先听再说，说完用一句自己的话造句。`);
  }

  // sound errors
  for (const e of input.soundErrors.slice(0, 2)) {
    const kind = SOUND_KIND_ZH[e.kind] ?? e.kind;
    weaknesses.push(`音变 ${e.name}（${kind}）错了 ${e.errors}/${e.attempts} 次。`);
    tips.push(`音变 ${e.name}：先慢速听 3 遍，再按原速听写，最后跟读 2 遍，连读处不要停顿。`);
  }
  if (input.soundErrors.length > 0) focus.push('连读弱读专项：每天 1 个音变，听写 3 句。');

  // edge items
  if (input.edgeTexts.length > 0) {
    const shown = input.edgeTexts.slice(0, 3).map((t) => `"${t}"`).join('、');
    tips.push(`这几条处在「将会未会」的边缘：${shown}。每天口头用它们各造一句话。`);
  }

  // plan progress
  if (input.goal) {
    const g = input.goal;
    const label = g.status === 'ahead' ? '超前' : g.status === 'behind' ? '落后' : '按计划';
    parts.push(`进度${label}（已学 ${g.itemsLearned} 条，计划约 ${g.expectedItems} 条）`);
    if (g.status === 'behind') {
      weaknesses.push(`目标进度落后：已学 ${g.itemsLearned} 条，计划此时约 ${g.expectedItems} 条。`);
      tips.push(g.adviceZh);
    } else if (g.status === 'ahead') {
      strengths.push(`目标进度超前：已学 ${g.itemsLearned} 条，计划此时约 ${g.expectedItems} 条。`);
    } else {
      strengths.push(`目标进度正常：第 ${g.day} 天，处于「${g.phaseNameZh}」阶段。`);
    }
  }

  if (measuredSkills === 0) {
    weaknesses.push('各项技能的练习次数还不够，暂时无法判断难度是否合适。');
    focus.push('先完成每天的 5 个练习块，攒够每项技能 15 次作答。');
  }
  if (focus.length === 0) focus.push('保持现在的节奏，继续每天完成 5 个练习块。');
  if (tips.length === 0) tips.push('保持每天的节奏：先完成复习，再学新语块，听力和口语都要大声练习。');

  let suggestedNewPerDay: number | undefined;
  if (struggling) suggestedNewPerDay = Math.max(3, input.ladder.newPerDay - 2);
  else if (input.goal && input.goal.status !== 'on-track' && allReady && measuredSkills > 0) {
    // accuracy is comfortable while the plan is off: more new chunks catch up (behind) or use the headroom (ahead)
    suggestedNewPerDay = Math.min(12, input.ladder.newPerDay + 1);
  }

  const report: CoachReport = {
    id: reportId(now),
    createdAt: now,
    lesson: input.lesson,
    source: 'rules',
    summaryZh: `第 ${input.lesson} 课周报：${parts.length > 0 ? parts.join('，') : '练习数据还不多'}。` +
      (struggling ? '有技能正确率低于 65%，本周先放慢节奏、减少新内容。' : '目标是让每项技能的正确率稳定在 70%–88%。'),
    strengthsZh: strengths.slice(0, 5),
    weaknessesZh: weaknesses.slice(0, 5),
    nextWeekFocusZh: [...new Set(focus)].slice(0, 4),
    tipsZh: [...new Set(tips)].slice(0, 6),
  };
  if (suggestedNewPerDay !== undefined && suggestedNewPerDay !== input.ladder.newPerDay) {
    report.suggestedNewPerDay = suggestedNewPerDay;
  }
  return report;
}
