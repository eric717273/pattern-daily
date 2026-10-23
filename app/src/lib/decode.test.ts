import { describe, expect, it } from 'vitest';
import { DOZEN, SEED_FRAMES } from '../content';
import type { DozenSentence, SubstitutionFrame } from '../types';
import {
  allPresentForms,
  detectTense,
  gradeFromRatio,
  isLabelableFrame,
  labelTaskFromCombo,
  labelTaskFromDozen,
  lessonGrade,
  mergeResults,
  pickFrameLabelTask,
  pickTransformTasks,
  scoreLabeling,
  type LabelRole,
} from './decode';
import { seededRng } from './drill';
import { buildCombo } from './frameEngine';

const d = (id: string): DozenSentence => {
  const found = DOZEN.find((x) => x.id === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
};

const o = (en: string, zh = en) => ({ en, zh });

const FRAME: SubstitutionFrame = {
  id: 'ftest',
  title: 't',
  pattern: '{subject} {verb} {recipient} {thing} {time}.',
  patternZh: '{subject}{time}{verb}{recipient}{thing}。',
  slots: [
    { key: 'subject', labelZh: '主语', options: [o('I'), o('The new manager')] },
    { key: 'verb', labelZh: '动词', options: [o('give'), o('send')] },
    { key: 'recipient', labelZh: '接收者', options: [o('John'), o('my sister')] },
    { key: 'thing', labelZh: '东西', options: [o('the keys'), o('the final report')] },
    { key: 'time', labelZh: '时间', options: [o('every day'), o('before the meeting')] },
  ],
  grammar: ['double-object'],
  scene: 'daily',
  level: 1,
  examples: [o('I give John the keys every day.')],
  source: 'seed',
};

describe('gradeFromRatio / lessonGrade / mergeResults', () => {
  it('maps the share of correct answers to a grade', () => {
    expect(gradeFromRatio(3, 3)).toBe(3);
    expect(gradeFromRatio(2, 3)).toBe(2);
    expect(gradeFromRatio(1, 3)).toBe(1);
    expect(gradeFromRatio(0, 3)).toBe(0);
    expect(gradeFromRatio(0, 0)).toBe(2);
    expect(gradeFromRatio(5, 8)).toBe(2); // 62.5%
    expect(gradeFromRatio(4, 8)).toBe(1);
  });

  it('averages order grade and transform grade for a lesson', () => {
    expect(lessonGrade(2, { correct: 3, total: 3, ms: 1 })).toBe(3);
    expect(lessonGrade(2, { correct: 2, total: 3, ms: 1 })).toBe(2);
    expect(lessonGrade(0, { correct: 0, total: 3, ms: 1 })).toBe(0);
  });

  it('merges results', () => {
    expect(mergeResults([{ correct: 2, total: 4, ms: 10 }, { correct: 3, total: 3, ms: 5 }])).toEqual({
      correct: 5,
      total: 7,
      ms: 15,
    });
  });
});

describe('pickTransformTasks', () => {
  it('prefers base-sentence tasks with distinct operations', () => {
    const dozen = d('d01');
    const tasks = pickTransformTasks(dozen, 3);
    expect(tasks).toHaveLength(3);
    expect(tasks.every((t) => t.from === dozen.en)).toBe(true);
    expect(new Set(tasks.map((t) => t.op)).size).toBe(3);
  });

  it('is deterministic per offset and rotates with it', () => {
    const dozen = d('d03');
    expect(pickTransformTasks(dozen, 3, 2)).toEqual(pickTransformTasks(dozen, 3, 2));
    const a = pickTransformTasks(dozen, 3, 0).map((t) => t.op).join();
    const b = pickTransformTasks(dozen, 3, 1).map((t) => t.op).join();
    expect(a).not.toBe(b);
  });

  it('falls back to variant tasks when there are not enough base tasks, and handles every sentence', () => {
    for (const dozen of DOZEN) {
      for (let off = 0; off < 7; off++) {
        const tasks = pickTransformTasks(dozen, 3, off);
        expect(tasks).toHaveLength(3);
        expect(new Set(tasks).size).toBe(3);
      }
    }
    expect(pickTransformTasks(d('d07'), 6)).toHaveLength(6);
    expect(pickTransformTasks(d('d01'), 0)).toEqual([]);
  });
});

describe('labelTaskFromDozen', () => {
  it('uses the alignment roles exactly, folding determiners and particles into the next word', () => {
    const t = labelTaskFromDozen(d('d05'));
    expect(t.tokens.map((x) => [x.text, x.role])).toEqual([
      ['He', 'subject'],
      ['gives', 'verb'],
      ['it', 'object'],
      ['to John', 'indirect-object'],
    ]);
    expect(t.tense).toBe('present');
    expect(t.en).toBe('He gives it to John.');
  });

  it('drops punctuation tokens and keeps notes', () => {
    const t = labelTaskFromDozen(d('d07'));
    expect(t.tokens.map((x) => x.text)).toEqual(['Is', 'the apple', 'red']);
    expect(t.tokens.map((x) => x.role)).toEqual(['verb', 'subject', 'complement']);
    const d01 = labelTaskFromDozen(d('d01'));
    expect(d01.tokens[0].text).toBe('The apple');
    expect(d01.tokens[0].notes?.[0].en).toBe('The');
  });

  it('covers all 13 sentences: every token has a role, the joined words rebuild the sentence, tense is known', () => {
    for (const dozen of DOZEN) {
      const t = labelTaskFromDozen(dozen);
      expect(t.tokens.length).toBeGreaterThan(2);
      expect(t.tokens.every((x) => x.role !== null)).toBe(true);
      const joined = t.tokens.map((x) => x.text).join(' ').replace(/[?.!]/g, '');
      expect(joined).toBe(dozen.en.replace(/[?.!]/g, ''));
      expect(t.tense).toBeDefined();
    }
    expect(labelTaskFromDozen(d('d09')).tense).toBe('modal');
    expect(labelTaskFromDozen(d('d11')).tense).toBe('future');
    expect(labelTaskFromDozen(d('d13')).tense).toBe('perfect');
  });
});

describe('labelTaskFromCombo', () => {
  it('treats multi-word slot options as one token and keeps fixed words muted', () => {
    const combo = buildCombo(FRAME, { subject: 1, verb: 1, recipient: 1, thing: 1, time: 1 });
    const t = labelTaskFromCombo(FRAME, combo);
    expect(t).not.toBeNull();
    expect(t?.tokens.map((x) => [x.text, x.role])).toEqual([
      ['The new manager', 'subject'],
      ['send', 'verb'],
      ['my sister', 'indirect-object'],
      ['the final report', 'object'],
      ['before the meeting', 'adverbial'],
    ]);
    expect(t?.en).toBe('The new manager send my sister the final report before the meeting.');
    expect(t?.id).toContain('frame:ftest');
  });

  it('marks fixed be-forms and modals as asked, other fixed words as unasked', () => {
    const f: SubstitutionFrame = {
      ...FRAME,
      id: 'fbe',
      pattern: '{subject} is {adjective} and will {verb} to {thing}.',
      patternZh: '{subject}{adjective}{verb}{thing}。',
      slots: [
        { key: 'subject', labelZh: '主语', options: [o('The soup')] },
        { key: 'adjective', labelZh: '形容词', options: [o('hot')] },
        { key: 'verb', labelZh: '动词', options: [o('arrive')] },
        { key: 'thing', labelZh: '东西', options: [o('the party')] },
      ],
    };
    const t = labelTaskFromCombo(f, buildCombo(f, {}));
    expect(t?.tokens.map((x) => [x.text, x.role])).toEqual([
      ['The soup', 'subject'],
      ['is', 'verb'],
      ['hot', 'complement'],
      ['and', null],
      ['will', 'aux'],
      ['arrive', 'verb'],
      ['to', null],
      ['the party', 'object'],
    ]);
  });

  it('refuses frames with a slot whose role is unknown or untrustworthy', () => {
    const odd: SubstitutionFrame = {
      ...FRAME,
      slots: [...FRAME.slots.slice(0, 4), { key: 'tail', labelZh: '结尾', options: [o('as always')] }],
    };
    expect(isLabelableFrame(odd)).toBe(false);
    expect(labelTaskFromCombo(odd, buildCombo(odd, {}))).toBeNull();
    const swallowed: SubstitutionFrame = {
      ...FRAME,
      slots: [{ key: 'subject', labelZh: '主语', options: [o("I'm going to")] }, ...FRAME.slots.slice(1)],
    };
    expect(isLabelableFrame(swallowed)).toBe(false);
  });

  it('seed frames: some are labelable and every produced task is consistent', () => {
    const ok = SEED_FRAMES.filter(isLabelableFrame);
    expect(ok.length).toBeGreaterThanOrEqual(5);
    const rng = seededRng(7);
    for (const f of ok) {
      const t = pickFrameLabelTask([f], rng);
      expect(t).not.toBeNull();
      expect(t?.tokens.some((x) => x.role !== null)).toBe(true);
      expect(t?.tokens.map((x) => x.text).join(' ').replace(/[.,?!]/g, '')).toBe(t?.en.replace(/[.,?!]/g, ''));
    }
    expect(pickFrameLabelTask([], rng)).toBeNull();
  });

  it('pickFrameLabelTask is deterministic for a seed and prefers a shared grammar point', () => {
    const a = pickFrameLabelTask(SEED_FRAMES, seededRng(3), ['double-object']);
    const b = pickFrameLabelTask(SEED_FRAMES, seededRng(3), ['double-object']);
    expect(a).toEqual(b);
    const frame = SEED_FRAMES.find((f) => f.id === a?.refId);
    expect(frame?.grammar).toContain('double-object');
  });
});

describe('detectTense', () => {
  it('only answers when there is explicit evidence', () => {
    expect(detectTense("I'll call you tomorrow.")).toBe('future');
    expect(detectTense("I'm going to leave.")).toBe('future');
    expect(detectTense("I'm going to the store.")).toBeUndefined();
    expect(detectTense('She has already finished the report.', { grammar: ['present-perfect'] })).toBe('perfect');
    expect(detectTense('You must go.')).toBe('modal');
    expect(detectTense("We can't wait.")).toBe('modal');
    expect(detectTense('The report is ready.')).toBe('present');
    expect(detectTense('They did not come.')).toBe('past');
    expect(detectTense('I sent it.', { verbs: ['sent'] })).toBe('past');
    expect(detectTense('She will have to go.')).toBeUndefined(); // two kinds of evidence
    expect(detectTense('We met in May.')).toBeUndefined();
    expect(detectTense('Sarah reviews the report.')).toBeUndefined();
    expect(detectTense('Sarah reviews the report.', { presentVerbs: true })).toBe('present');
  });

  it('allPresentForms rejects past and ambiguous verbs', () => {
    expect(allPresentForms(['give', 'sends'])).toBe(true);
    expect(allPresentForms(['give', 'sent'])).toBe(false);
    expect(allPresentForms(['finished the report'])).toBe(false);
    expect(allPresentForms(['read'])).toBe(false);
    expect(allPresentForms([])).toBe(false);
  });
});

describe('scoreLabeling', () => {
  const task = labelTaskFromDozen(d('d05'));
  const right: LabelRole[] = ['subject', 'verb', 'object', 'indirect-object'];

  it('scores roles plus the tense question', () => {
    expect(scoreLabeling(task, right, 'present')).toMatchObject({ correct: 5, total: 5, tenseCorrect: true });
    const s = scoreLabeling(task, ['subject', 'verb', 'indirect-object', 'object'], 'past');
    expect(s.correct).toBe(2);
    expect(s.total).toBe(5);
    expect(s.tokenCorrect).toEqual([true, true, false, false]);
    expect(s.tenseCorrect).toBe(false);
  });

  it('counts unanswered tokens as wrong and skips fixed words and absent tense questions', () => {
    const combo = buildCombo(FRAME, {});
    const t = labelTaskFromCombo(FRAME, combo);
    if (!t) throw new Error('task');
    const withFixed = { ...t, tokens: [{ text: 'to', role: null }, ...t.tokens] };
    const s = scoreLabeling(withFixed, [undefined, 'subject'], undefined);
    expect(s.tokenCorrect[0]).toBeNull();
    expect(s.tokenCorrect[1]).toBe(true);
    expect(s.correct).toBe(1);
    expect(s.total).toBe(5 + (t.tense ? 1 : 0));
  });
});
