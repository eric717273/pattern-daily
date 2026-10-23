import { describe, expect, it } from 'vitest';
import { canonicalizeSpoken, matchVoice, READ_ALOUD_THRESHOLD, VOICE_THRESHOLD } from './voiceMatch';

describe('canonicalizeSpoken', () => {
  it('drops filler sounds but keeps them when the target has them', () => {
    expect(canonicalizeSpoken('Uh, the soup is, um, hot')).toBe('the soup is hot');
    expect(canonicalizeSpoken('um hello', new Set(['um']))).toBe('um hello');
  });

  it('turns digits into words and informal forms into standard ones', () => {
    expect(canonicalizeSpoken('I need 3 tickets')).toBe('i need three tickets');
    expect(canonicalizeSpoken('21 people')).toBe('twenty one people');
    expect(canonicalizeSpoken("I'm gonna go")).toBe('i am going to go');
    expect(canonicalizeSpoken('Okay')).toBe('ok');
  });
});

describe('matchVoice', () => {
  const target = 'The soup is hot right now.';

  it('accepts an exact answer, ignoring case and punctuation', () => {
    const m = matchVoice('the soup is hot right now', target, { slotEn: 'hot' });
    expect(m.matched).toBe(true);
    expect(m.similarity).toBe(1);
    expect(m.slotOk).toBe(true);
  });

  it('is lenient on contractions', () => {
    const t = "I can't eat the apple.";
    expect(matchVoice('I cannot eat the apple', t, { slotEn: "can't" }).matched).toBe(true);
    expect(matchVoice('I can not eat the apple', t, { slotEn: "can't" }).matched).toBe(true);
    expect(matchVoice("I'm going to know tomorrow", 'I am going to know tomorrow.', { slotEn: "I'm" }).matched).toBe(true);
    expect(matchVoice('She is here', "She's here.", { slotEn: "She's" }).matched).toBe(true);
  });

  it('ignores filler words such as uh and um', () => {
    expect(matchVoice('uh the soup is um hot right now', target, { slotEn: 'hot' }).matched).toBe(true);
  });

  it('tolerates one extra spoken word in a longer sentence', () => {
    // 6 target words + 1 extra: 2*6/13 = 0.92
    const m = matchVoice('so the soup is hot right now', target, { slotEn: 'hot' });
    expect(m.similarity).toBeGreaterThanOrEqual(VOICE_THRESHOLD);
    expect(m.matched).toBe(true);
  });

  it('treats number words and digits as the same', () => {
    expect(matchVoice('I need 3 tickets', 'I need three tickets.', { slotEn: 'three tickets' }).matched).toBe(true);
    expect(matchVoice('I need three tickets', 'I need 3 tickets.', { slotEn: '3 tickets' }).matched).toBe(true);
  });

  it('fails when the swapped chunk is wrong even though the similarity is high', () => {
    // a long sentence keeps the similarity high (9 of 10 words) although the swapped word is wrong
    const t = 'The soup is really hot right now at the table.';
    const m = matchVoice('The soup is really cold right now at the table', t, { slotEn: 'hot' });
    expect(m.similarity).toBeGreaterThanOrEqual(VOICE_THRESHOLD);
    expect(m.slotOk).toBe(false);
    expect(m.matched).toBe(false);
    // without naming the slot the same transcript would pass
    expect(matchVoice('The soup is really cold right now at the table', t).matched).toBe(true);
  });

  it('requires every word of a multi-word slot option', () => {
    const t = 'I will send the report to the team tomorrow morning.';
    expect(matchVoice('I will send the report to the team tomorrow morning', t, { slotEn: 'the report' }).matched).toBe(true);
    const m = matchVoice('I will send the plan to the team tomorrow morning', t, { slotEn: 'the report' });
    expect(m.slotOk).toBe(false);
    expect(m.matched).toBe(false);
  });

  it('fails when the swapped chunk is missing', () => {
    const t = 'We will send the report to the team on Friday afternoon.';
    const m = matchVoice('We will send to the team on Friday afternoon', t, { slotEn: 'the report' });
    expect(m.slotOk).toBe(false);
    expect(m.matched).toBe(false);
  });

  it('rejects low similarity', () => {
    const m = matchVoice('hello there', target, { slotEn: 'hot' });
    expect(m.matched).toBe(false);
    expect(m.similarity).toBeLessThan(0.5);
    expect(matchVoice('', target, { slotEn: 'hot' })).toMatchObject({ matched: false, similarity: 0 });
  });

  it('judges the best of several alternatives', () => {
    const m = matchVoice(['the soup is cold right now', 'the soup is hot right now', 'the soup is hot right how'], target, {
      slotEn: 'hot',
    });
    expect(m.matched).toBe(true);
    expect(m.heard).toBe('the soup is hot right now');
    // none match: reports the closest one for the diff
    const none = matchVoice(['the soup is cold right now', 'a soup is cold right'], target, { slotEn: 'hot' });
    expect(none.matched).toBe(false);
    expect(none.heard).toBe('the soup is cold right now');
  });

  it('supports a custom threshold (read-aloud uses 0.8)', () => {
    const t = 'I give him the apple.'; // 5 words
    const heard = 'I give him an apple'; // 4 of 5 right: 0.8
    expect(matchVoice(heard, t).matched).toBe(false);
    expect(matchVoice(heard, t, { threshold: READ_ALOUD_THRESHOLD }).matched).toBe(true);
  });

  it('exposes the diff tokens for the closest transcript', () => {
    const m = matchVoice('the soup is cold right now', target, { slotEn: 'hot' });
    expect(m.tokens.find((t) => t.status === 'missing')?.text).toBe('hot');
    expect(m.tokens.find((t) => t.status === 'extra')?.text).toBe('cold');
  });
});
