import { getChunk, getDialogue, getSeedFrame, getSound } from '../../content';
import type { AccuracyBand, DaySummaryV3, MistakeEntry } from '../../lib/repo';
import { listenRate, speakLimitMs } from '../../lib/ladder';
import type { Skill } from '../../types';

export const COMFORT_LOW = 0.7;
export const COMFORT_HIGH = 0.88;

export const SKILL_LABEL: Record<Skill, string> = { listen: '听力', speak: '口语', decode: '解码' };

/** Where an accuracy sits against the 70%-88% comfort-zone band (same rule as repo.getDaySummaryV3). */
export function classifyBand(acc: number, n: number, low: number = COMFORT_LOW, high: number = COMFORT_HIGH): AccuracyBand {
  if (n <= 0) return 'none';
  return acc > high ? 'above' : acc < low ? 'below' : 'in';
}

export interface BandLabel {
  text: string;
  tone: 'rose' | 'emerald' | 'sky' | 'slate';
}

/** 太难 / 刚好 / 太容易 for the band. */
export function bandLabel(band: AccuracyBand): BandLabel {
  switch (band) {
    case 'below':
      return { text: '太难', tone: 'rose' };
    case 'in':
      return { text: '刚好', tone: 'emerald' };
    case 'above':
      return { text: '太容易', tone: 'sky' };
    default:
      return { text: '今天没有测量', tone: 'slate' };
  }
}

const NUMBER_KIND_ZH: Record<string, string> = {
  price: '价格',
  time: '时间',
  date: '日期',
  phone: '电话',
  quantity: '数量',
  year: '年份',
};

export interface MistakeView {
  key: string;
  label: string;
  sub?: string;
  /** Route to the item's page; numbers have none. */
  to?: string;
  count: number;
}

/** A mistake as the 今日反馈 screen shows it: a name and, where the item has a page, the link to it. */
export function mistakeView(m: MistakeEntry): MistakeView {
  const id = m.cardId.slice(m.cardId.indexOf(':') + 1);
  switch (m.kind) {
    case 'chunk': {
      const c = getChunk(id);
      return { key: m.cardId, label: c?.en ?? id, sub: c?.zh, to: `/library/chunk/${id}`, count: m.count };
    }
    case 'frame': {
      const f = getSeedFrame(id);
      return { key: m.cardId, label: f?.title ?? id, sub: '母框', to: `/frames/${id}`, count: m.count };
    }
    case 'sound': {
      const s = getSound(id);
      return { key: m.cardId, label: s?.name ?? id, sub: '音变', to: `/listening/sound/${id}`, count: m.count };
    }
    case 'dialogue': {
      const d = getDialogue(id);
      return { key: m.cardId, label: d?.title ?? id, sub: '对话', to: `/listening/dialogue/${id}`, count: m.count };
    }
    case 'numbers':
      return { key: m.cardId, label: `数字听写 · ${NUMBER_KIND_ZH[id] ?? id}`, count: m.count };
    default:
      return { key: m.cardId, label: m.cardId, count: m.count };
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * One targeted tip from the day's numbers (rule based, most specific first): too hard -> go back a step on that
 * skill; too easy -> say what tomorrow changes; slow but right -> speed; a sound pattern missed -> redo it.
 */
export function feedbackTip(summary: DaySummaryV3): string {
  const { listen, speak } = summary.skills;
  const ladder = summary.ladder;
  if (listen.band === 'below') {
    // one notch slower than today's speed (0.85 is the slowest on the ladder)
    const today = listenRate(ladder?.listen ?? 1);
    const lower = today <= 0.95 ? 0.85 : 0.95;
    return `听力正确率 ${pct(listen.acc)}，低于 70%：明天先用 ${lower.toFixed(2)} 倍速重听今天的对话，听写时先抓住句子重音，再补全弱读的词。`;
  }
  if (speak.band === 'below') {
    return `口语正确率 ${pct(speak.acc)}，低于 70%：明天复习时先看中文在心里默说一遍，再点开始说；今天说错的语块各大声读三遍。`;
  }
  const sound = summary.mistakes.find((m) => m.kind === 'sound');
  if (sound) {
    const v = mistakeView(sound);
    return `今天在音变「${v.label}」上出了错：明天开始前去听力页把这一条再做一遍，注意听它在句子里被「吞掉」或连起来的地方。`;
  }
  if (listen.band === 'above') {
    return `听力正确率 ${pct(listen.acc)}，高于 88%，今天偏容易：明天会自动加快语速；想更快进步，可以去听力页挑一段「挑战」档对话。`;
  }
  if (speak.band === 'above') {
    const limit = ladder ? speakLimitMs(Math.min(5, ladder.speak + 1)) / 1000 : undefined;
    return `口语正确率 ${pct(speak.acc)}，高于 88%：明天会缩短限时${limit ? `到 ${limit} 秒` : ''}，试着不看提示、一口气说完整句。`;
  }
  if (speak.medianLatencyMs !== undefined && ladder && speak.medianLatencyMs > speakLimitMs(ladder.speak) * 0.8) {
    return `口语说得对但偏慢（中位 ${(speak.medianLatencyMs / 1000).toFixed(1)} 秒）：明天多练「边缘语块」，目标是在限时的一半内开口。`;
  }
  if (listen.n === 0 && speak.n === 0) return '今天没有记录到可测量的作答。下一次完整做完复习、新语块和听力，这里就会出现正确率和建议。';
  return '今天的难度正好落在舒适区边缘：保持这个节奏，明天继续。';
}

/** m.s as seconds with one decimal ("1.8 秒"). */
export function latencyText(ms: number | undefined): string {
  return ms === undefined ? '–' : `${(ms / 1000).toFixed(1)} 秒`;
}
