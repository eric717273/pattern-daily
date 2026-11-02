import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDialogue, getSound } from '../../content';
import { seededRng } from '../../lib/drill';
import { makeNumberItem, NUMBER_KINDS } from '../../lib/numbers';

const spoken = vi.hoisted(() => [] as { text: string; rate?: number }[]);
const sequences = vi.hoisted(() => [] as { texts: string[]; rate: number; pitches: (number | undefined)[] }[]);
vi.mock('../../lib/speech', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/speech')>();
  return {
    ...actual,
    speak: (text: string, opts?: { rate?: number }) => {
      spoken.push({ text, rate: opts?.rate });
      return Promise.resolve();
    },
    speakSequence: (
      lines: { text: string; pitch?: number }[],
      opts: { rate: number; onLine?: (i: number) => void },
    ) => {
      sequences.push({ texts: lines.map((l) => l.text), rate: opts.rate, pitches: lines.map((l) => l.pitch) });
      opts.onLine?.(0);
      return { done: Promise.resolve(), stop: () => undefined };
    },
    pickVoicePair: () => Promise.resolve([null, null]),
    stopSpeaking: () => undefined,
  };
});

import { DialogueListen, type DialogueListenResult } from './DialogueListen';
import { NumbersDrill, type NumbersDrillResult } from './NumbersDrill';
import { SoundDrill, type SoundDrillResult } from './SoundDrill';

beforeEach(() => {
  spoken.length = 0;
  sequences.length = 0;
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});

const click = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = async (label: string, value: string) => {
  type(label, value);
  await act(async () => {
    fireEvent.submit(screen.getByLabelText(label).closest('form') as HTMLFormElement);
  });
};

const dl = getDialogue('dl001');
if (!dl) throw new Error('dl001');
// dl001: gist answer 3; blanks "How's it going" / "taking out the trash" / "I'd better get going"

function renderDialogue(onDone: (r: DialogueListenResult) => void = () => undefined) {
  return render(
    <MemoryRouter>
      <DialogueListen dialogue={dl as NonNullable<typeof dl>} rate={0.95} onDone={onDone} />
    </MemoryRouter>,
  );
}

describe('DialogueListen', () => {
  it('shows no dialogue text while listening for the gist and locks the options until the first play', async () => {
    renderDialogue();
    const body = document.body.textContent ?? '';
    for (const t of dl.turns) expect(body).not.toContain(t.en);
    expect(body).not.toContain('taking out the trash');
    const options = within(screen.getByRole('group', { name: '主旨选项' })).getAllByRole('button');
    expect(options).toHaveLength(4);
    options.forEach((o) => expect(o).toBeDisabled());
    await click('播放对话');
    expect(sequences).toHaveLength(1);
    expect(sequences[0].texts).toEqual(dl.turns.map((t) => t.en));
    expect(sequences[0].rate).toBe(0.95);
    expect(screen.getAllByRole('button', { name: /^[^\s]/ }).length).toBeGreaterThan(0);
    within(screen.getByRole('group', { name: '主旨选项' }))
      .getAllByRole('button')
      .forEach((o) => expect(o).toBeEnabled());
    expect(document.body.textContent).not.toContain(dl.turns[0].en);
  });

  it('allows at most 2 replays of the whole dialogue', async () => {
    renderDialogue();
    await click('播放对话');
    expect(screen.getByTestId('replays-left')).toHaveTextContent('还可重听 2 次');
    await click('再听一遍');
    await click('再听一遍');
    expect(screen.getByTestId('replays-left')).toHaveTextContent('还可重听 0 次');
    expect(screen.getByRole('button', { name: '再听一遍' })).toBeDisabled();
    expect(sequences).toHaveLength(3);
  });

  it('runs gist -> dictation (contractions, wrong, give up) -> transcript and reports the measurement', async () => {
    const done = vi.fn();
    renderDialogue(done);
    await click('播放对话');
    await click('再听一遍'); // 1 replay
    await click(dl.gist.optionsZh[dl.gist.answer]);
    expect(screen.getByRole('status')).toHaveTextContent('主旨听对了');
    await click('下一步：听写关键语块');

    // blank 1: the line is shown masked, the answer is not in the DOM
    expect(screen.getByTestId('masked-line')).toHaveTextContent('Hey, Maria! ____ ____ ____?');
    expect(screen.queryByText(/How's it going/)).not.toBeInTheDocument();
    await click('慢速播放'); // slow counts as a replay
    expect(sequences.at(-1)).toMatchObject({ texts: [dl.turns[0].en], rate: 0.8 });
    await submit('空白处的词', 'how is it going'); // "How's" == "how is"
    expect(screen.getByRole('status')).toHaveTextContent('听对了');
    await click('下一个');

    // blank 2: wrong -> diff
    await submit('空白处的词', 'taking the trash');
    expect(screen.getByRole('status')).toHaveTextContent('再对照');
    expect(screen.getByRole('list', { name: '答案对比' })).toBeInTheDocument();
    await click('下一个');

    // blank 3: give up
    await click('不会，看答案');
    expect(screen.getByTestId('blank-feedback')).toHaveTextContent("I'd better get going");
    await click('下一步：对照原文');

    // transcript
    expect(screen.getByLabelText('对照')).toBeInTheDocument();
    expect(screen.getAllByTestId('transcript-turn')).toHaveLength(3);
    expect(screen.queryByText('嘿，Maria！最近怎么样？')).not.toBeInTheDocument();
    await click('显示中文');
    expect(screen.getByText('嘿，Maria！最近怎么样？')).toBeInTheDocument();
    const link = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/library/chunk/c001');
    expect(link).toBeTruthy();
    await click('完成');

    expect(done).toHaveBeenCalledTimes(1);
    const r: DialogueListenResult = done.mock.calls[0][0];
    expect(r.gistCorrect).toBe(true);
    expect(r.blanks).toEqual([
      { text: "How's it going", correct: true, heard: 'how is it going' },
      { text: 'taking out the trash', correct: false, heard: 'taking the trash' },
      { text: "I'd better get going", correct: false, heard: '' },
    ]);
    expect(r.replays).toBe(2); // 1 gist replay + 1 slow play
    expect(r.ms).toBeGreaterThanOrEqual(0);
  });

  it('reports a wrong gist answer', async () => {
    const done = vi.fn();
    renderDialogue(done);
    await click('播放对话');
    await click(dl.gist.optionsZh[0]);
    expect(screen.getByRole('status')).toHaveTextContent('主旨没听对');
    await click('下一步：听写关键语块');
    for (let i = 0; i < 3; i++) {
      await click('不会，看答案');
      await click(i < 2 ? '下一个' : '下一步：对照原文');
    }
    await click('完成');
    expect(done.mock.calls[0][0]).toMatchObject({ gistCorrect: false, replays: 0 });
  });

  it('inputs are mobile-friendly', async () => {
    renderDialogue();
    await click('播放对话');
    await click(dl.gist.optionsZh[3]);
    await click('下一步：听写关键语块');
    const input = screen.getByLabelText('空白处的词');
    expect(input).toHaveAttribute('autocapitalize', 'off');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
  });
});

describe('DialogueListen gistOnly', () => {
  it('ends after the gist question with 继续: no dictation, no blanks', async () => {
    const done = vi.fn();
    render(
      <MemoryRouter>
        <DialogueListen dialogue={dl as NonNullable<typeof dl>} rate={0.95} gistOnly onDone={done} />
      </MemoryRouter>,
    );
    await click('播放对话');
    const options = within(screen.getByRole('group', { name: '主旨选项' })).getAllByRole('button');
    await act(async () => {
      fireEvent.click(options[3]);
    });
    expect(screen.queryByRole('button', { name: /下一步/ })).not.toBeInTheDocument();
    await click('继续');
    expect(done).toHaveBeenCalledTimes(1);
    const r: DialogueListenResult = done.mock.calls[0][0];
    expect(r.gistCorrect).toBe(true);
    expect(r.blanks).toEqual([]);
  });
});

describe('SoundDrill', () => {
  const pattern = getSound('s01');
  if (!pattern) throw new Error('s01');
  const p = pattern;

  it('masks the target, hides the heard spelling until the first attempt, and reports results', async () => {
    const done = vi.fn();
    render(<SoundDrill pattern={p} rate={1.05} onDone={done} />);
    expect(screen.getByText('going to → gonna')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '听感' })).not.toBeInTheDocument();
    // sentence is shown with the target masked from the start; heard spelling absent
    const line = screen.getByTestId('sound-line');
    expect(line.textContent).not.toContain(p.examples[0].target);
    expect(line).toContainElement(screen.getAllByTestId('blank')[0]);
    expect(screen.queryByTestId('heard-spelling')).not.toBeInTheDocument();

    await click('播放');
    expect(spoken[0]).toEqual({ text: p.examples[0].en, rate: 1.05 });

    await submit('空白处的词', p.examples[0].target.toUpperCase() + '.');
    expect(screen.getByTestId('heard-spelling')).toHaveTextContent(p.examples[0].heard);
    expect(screen.getByTestId('sound-line')).toHaveTextContent(p.examples[0].en);
    expect(screen.getByRole('button', { name: '听感' })).toBeInTheDocument();
    await click('下一句');

    await submit('空白处的词', 'nothing like it');
    expect(screen.getByRole('list', { name: '答案对比' })).toBeInTheDocument();
    await click('下一句');

    await click('不会，看答案');
    await click('完成');
    const r: SoundDrillResult = done.mock.calls[0][0];
    expect(r.total).toBe(3);
    expect(r.correct).toBe(1);
    expect(r.items.map((i) => i.correct)).toEqual([true, false, false]);
    expect(r.items[0].target).toBe(p.examples[0].target);
    expect(r.items[2].input).toBe('');
  });

  it('Enter in the input submits', async () => {
    render(<SoundDrill pattern={p} rate={1} onDone={() => undefined} />);
    const input = screen.getByLabelText('空白处的词');
    fireEvent.change(input, { target: { value: p.examples[0].target } });
    await act(async () => {
      fireEvent.submit(input.closest('form') as HTMLFormElement);
    });
    expect(screen.getByTestId('sound-feedback')).toBeInTheDocument();
  });
});

describe('NumbersDrill', () => {
  it('plays the spoken form, checks leniently and never shows the answer before submitting', async () => {
    const done = vi.fn();
    const seed = 5;
    // Reproduce the first item the component will draw.
    const rng = seededRng(seed);
    const start = Math.floor(rng() * NUMBER_KINDS.length);
    const first = makeNumberItem(NUMBER_KINDS[start], rng);
    render(<NumbersDrill count={2} rate={1} rng={seededRng(seed)} onDone={done} />);
    expect(document.body.textContent).not.toContain(first.answer);
    await click('播放');
    expect(spoken[0]).toEqual({ text: first.spoken, rate: 1 });

    await submit('听到的数字', first.answer);
    expect(screen.getByTestId('numbers-feedback')).toHaveTextContent('听对了');
    expect(screen.getByTestId('numbers-feedback')).toHaveTextContent(first.answer);
    await click('下一题');

    await click('不会，看答案');
    await click('完成');
    const r: NumbersDrillResult = done.mock.calls[0][0];
    expect(r).toMatchObject({ correct: 1, total: 2 });
    expect(r.items[0]).toMatchObject({ kind: NUMBER_KINDS[start], correct: true, spoken: first.spoken });
    expect(r.items[1]).toMatchObject({ correct: false, input: '' });
  });

  it('marks a wrong number wrong', async () => {
    render(<NumbersDrill count={1} rate={1} rng={seededRng(9)} kinds={['year']} onDone={() => undefined} />);
    await submit('听到的数字', '1');
    expect(screen.getByTestId('numbers-feedback')).toHaveTextContent('你写的是 1');
  });
});
