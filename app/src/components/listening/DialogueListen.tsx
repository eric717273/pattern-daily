import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getChunk } from '../../content';
import { compareAnswer } from '../../lib/frameEngine';
import { pairPitches, pickVoicePair, speakSequence, stopSpeaking } from '../../lib/speech';
import type { Dialogue } from '../../types';
import { AnswerDiff } from '../drills/AnswerDiff';
import { StepIndicator } from '../chunk/StepIndicator';
import { CheckIcon, CloseIcon } from '../icons';
import { SpeakButton } from '../SpeakButton';
import { Button, Card, cx } from '../ui';
import { Avatar, MaskedLine, PlayButton, ResultBanner, TypedAnswer } from './shared';
import { clock, splitAround } from './util';

export interface DialogueBlankResult {
  text: string;
  correct: boolean;
  heard: string;
}

export interface DialogueListenResult {
  gistCorrect: boolean;
  blanks: DialogueBlankResult[];
  /** Extra plays beyond the first: gist replays + per-blank replays (slow play counts). */
  replays: number;
  /** Milliseconds from mount until the last blank was answered (the 对照 step is not timed). */
  ms: number;
}

export interface DialogueListenProps {
  dialogue: Dialogue;
  /** TTS rate, e.g. from the ladder. */
  rate: number;
  onDone: (result: DialogueListenResult) => void;
  /** Only the gist question (no dictation, no transcript step): 继续 ends it with `blanks: []`. Used by the placement test. */
  gistOnly?: boolean;
}

const STEPS = ['听主旨', '听写关键语块', '对照'] as const;
const MAX_GIST_REPLAYS = 2;
const SLOW_RATE = 0.8;

type Voices = Parameters<typeof pairPitches>[0];

/** Audio for a dialogue: one voice per speaker, `activeTurn` says whose turn is playing. */
function useDialogueAudio(dialogue: Dialogue) {
  const [pair, setPair] = useState<Voices>([null, null]);
  const [activeTurn, setActiveTurn] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const handle = useRef<{ stop(): void } | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void pickVoicePair().then((p) => {
      if (mounted.current) setPair(p);
    });
    return () => {
      mounted.current = false;
      handle.current?.stop();
      stopSpeaking();
    };
  }, []);

  const play = (turns: number[], rate: number) => {
    handle.current?.stop();
    const pitches = pairPitches(pair);
    const lines = turns.map((t) => {
      const isA = dialogue.turns[t].speaker === 'A';
      return { text: dialogue.turns[t].en, voice: isA ? pair[0] : pair[1], pitch: isA ? pitches[0] : pitches[1] };
    });
    setPlaying(true);
    const h = speakSequence(lines, { rate, onLine: (i) => mounted.current && setActiveTurn(turns[i]) });
    handle.current = h;
    void h.done.then(() => {
      if (!mounted.current || handle.current !== h) return;
      handle.current = null;
      setPlaying(false);
      setActiveTurn(null);
    });
  };
  const stop = () => {
    handle.current?.stop();
    handle.current = null;
    setPlaying(false);
    setActiveTurn(null);
  };
  return { play, stop, playing, activeTurn };
}

/**
 * Listening with real dialogue: 听主旨 (two voices, no text, <= 2 replays, Chinese gist question) ->
 * 听写关键语块 (the line with one chunk masked, type what you hear) -> 对照 (transcript). Pure presentation:
 * the caller logs the measurement from `onDone`.
 */
export function DialogueListen({ dialogue, rate, onDone, gistOnly = false }: DialogueListenProps) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const audio = useDialogueAudio(dialogue);
  const startedAt = useRef(clock());

  // step 1
  const [gistPlays, setGistPlays] = useState(0);
  const [gistPick, setGistPick] = useState<number | null>(null);
  // step 2
  const [blankIdx, setBlankIdx] = useState(0);
  const [blankPlays, setBlankPlays] = useState(0); // plays of the current blank
  const [replays, setReplays] = useState(0); // blank replays so far
  const [answered, setAnswered] = useState<DialogueBlankResult[]>([]);
  const [shown, setShown] = useState<{ result: DialogueBlankResult; input: string } | null>(null);
  const [result, setResult] = useState<DialogueListenResult | null>(null);
  const [showZh, setShowZh] = useState(false);

  const { gist, blanks, turns } = dialogue;
  const gistCorrect = gistPick === gist.answer;

  const playGist = () => {
    if (gistPlays > MAX_GIST_REPLAYS) return;
    setGistPlays((n) => n + 1);
    audio.play(
      turns.map((_, i) => i),
      rate,
    );
  };

  const playBlank = (r: number) => {
    setBlankPlays((n) => n + 1);
    if (blankPlays > 0 || r === SLOW_RATE) setReplays((n) => n + 1);
    audio.play([blanks[blankIdx].turn], r);
  };

  const pickGist = (i: number) => {
    if (gistPick !== null || gistPlays === 0) return;
    audio.stop();
    setGistPick(i);
  };

  const goDictation = () => {
    audio.stop();
    setStep(1);
  };

  const finishBlank = (input: string, correct: boolean) => {
    audio.stop();
    const r: DialogueBlankResult = { text: blanks[blankIdx].text, correct, heard: input.trim() };
    setShown({ result: r, input });
  };

  const submitBlank = (input: string) => finishBlank(input, compareAnswer(input, blanks[blankIdx].text).exact);

  const nextBlank = () => {
    if (!shown) return;
    const all = [...answered, shown.result];
    setAnswered(all);
    setShown(null);
    if (blankIdx + 1 < blanks.length) {
      setBlankIdx(blankIdx + 1);
      setBlankPlays(0);
      return;
    }
    setResult({
      gistCorrect,
      blanks: all,
      replays: Math.max(0, gistPlays - 1) + replays,
      ms: Math.max(0, clock() - startedAt.current),
    });
    setStep(2);
  };

  const gistReplaysLeft = Math.max(0, MAX_GIST_REPLAYS + 1 - gistPlays);

  return (
    <div className="flex flex-col gap-4">
      {!gistOnly && <StepIndicator steps={STEPS} current={step} />}

      {step === 0 && (
        <Card className="flex flex-col gap-4" aria-label="听主旨">
          <div>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">先整段听一遍，抓住大意</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              文字不会显示。最多重听 {MAX_GIST_REPLAYS} 次，听完回答下面的问题。
            </p>
          </div>

          <div className="flex items-center justify-center gap-6 py-2" aria-label="说话人">
            <Avatar speaker="A" size="lg" active={audio.activeTurn !== null && turns[audio.activeTurn].speaker === 'A'} />
            <Avatar speaker="B" size="lg" active={audio.activeTurn !== null && turns[audio.activeTurn].speaker === 'B'} />
          </div>

          {gistPick === null && (
            <div className="flex flex-wrap items-center gap-3">
              <PlayButton
                onClick={playGist}
                playing={audio.playing}
                variant={gistPlays === 0 ? 'primary' : 'secondary'}
                disabled={gistPlays > MAX_GIST_REPLAYS}
                label={gistPlays === 0 ? '播放对话' : '再听一遍'}
              />
              {gistPlays > 0 && (
                <span className="text-sm text-slate-500 dark:text-slate-400" data-testid="replays-left">
                  还可重听 {gistReplaysLeft} 次
                </span>
              )}
            </div>
          )}

          <div>
            <p className="text-base font-semibold text-slate-900 dark:text-white">{gist.questionZh}</p>
            <div role="group" aria-label="主旨选项" className="mt-2.5 flex flex-col gap-2.5">
              {gist.optionsZh.map((opt, i) => {
                const revealed = gistPick !== null;
                const isAnswer = i === gist.answer;
                const isPicked = i === gistPick;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={gistPlays === 0 || revealed}
                    onClick={() => pickGist(i)}
                    data-state={revealed ? (isAnswer ? 'answer' : isPicked ? 'wrong' : 'other') : 'idle'}
                    className={cx(
                      'flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-left text-base leading-snug transition active:scale-[0.99]',
                      !revealed &&
                        'border-slate-300 bg-white text-slate-900 hover:border-indigo-400 hover:bg-indigo-50/60 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-indigo-950/30',
                      revealed && isAnswer && 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100',
                      revealed && isPicked && !isAnswer && 'border-rose-400 bg-rose-50 text-rose-900 dark:border-rose-500 dark:bg-rose-950/40 dark:text-rose-100',
                      revealed && !isAnswer && !isPicked && 'border-slate-200 bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500',
                    )}
                  >
                    <span className="min-w-0 flex-1">{opt}</span>
                    {revealed && isAnswer && <CheckIcon size={20} className="shrink-0 text-emerald-600 dark:text-emerald-400" />}
                    {revealed && isPicked && !isAnswer && <CloseIcon size={20} className="shrink-0 text-rose-600 dark:text-rose-400" />}
                  </button>
                );
              })}
            </div>
            {gistPlays === 0 && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">先播放，再选答案。</p>}
          </div>

          {gistPick !== null && (
            <>
              <ResultBanner correct={gistCorrect}>{gistCorrect ? '✓ 主旨听对了' : '✗ 主旨没听对，下一步慢慢找原因'}</ResultBanner>
              {gistOnly ? (
                <Button
                  variant="primary"
                  size="lg"
                  full
                  onClick={() => {
                    audio.stop();
                    onDone({
                      gistCorrect,
                      blanks: [],
                      replays: Math.max(0, gistPlays - 1),
                      ms: Math.max(0, clock() - startedAt.current),
                    });
                  }}
                >
                  继续
                </Button>
              ) : (
                <Button variant="primary" size="lg" full onClick={goDictation}>
                  下一步：听写关键语块
                </Button>
              )}
            </>
          )}
        </Card>
      )}

      {step === 1 && (
        <Card className="flex flex-col gap-4" aria-label="听写关键语块" key={blankIdx}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-lg font-semibold text-slate-900 dark:text-white">听写空白处的词</p>
            <p className="text-sm text-slate-500 tabular-nums dark:text-slate-400">
              {blankIdx + 1} / {blanks.length}
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-2xl bg-slate-100 p-4 dark:bg-slate-800/70">
            <Avatar speaker={turns[blanks[blankIdx].turn].speaker} active={audio.playing} />
            <p className="font-en text-xl leading-snug font-medium text-slate-900 dark:text-white" data-testid="masked-line">
              <MaskedLine text={turns[blanks[blankIdx].turn].en} hidden={blanks[blankIdx].text} />
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <PlayButton
              onClick={() => playBlank(rate)}
              playing={audio.playing}
              variant={blankPlays === 0 ? 'primary' : 'secondary'}
              label={blankPlays === 0 ? '播放这句' : '再听一遍'}
            />
            <Button variant="secondary" size="lg" onClick={() => playBlank(SLOW_RATE)} aria-label="慢速播放">
              慢速 0.8×
            </Button>
          </div>

          {!shown ? (
            <TypedAnswer
              label="空白处的词"
              placeholder="输入听到的词"
              onSubmit={submitBlank}
              onGiveUp={() => finishBlank('', false)}
            />
          ) : (
            <div className="flex flex-col gap-3" data-testid="blank-feedback">
              <ResultBanner correct={shown.result.correct}>
                {shown.result.correct ? '✓ 听对了' : shown.input.trim() === '' ? '看答案' : '✗ 再对照一下'}
              </ResultBanner>
              {!shown.result.correct && shown.input.trim() !== '' && (
                <AnswerDiff
                  tokens={compareAnswer(shown.input, shown.result.text).tokens}
                  similarity={compareAnswer(shown.input, shown.result.text).similarity}
                />
              )}
              <p className="text-sm text-slate-600 dark:text-slate-300">
                正确答案：<span className="font-en text-lg font-semibold text-slate-900 dark:text-white">{shown.result.text}</span>
              </p>
              <Button variant="primary" size="lg" full onClick={nextBlank}>
                {blankIdx + 1 < blanks.length ? '下一个' : '下一步：对照原文'}
              </Button>
            </div>
          )}
        </Card>
      )}

      {step === 2 && result && (
        <Card className="flex flex-col gap-4" aria-label="对照">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-lg font-semibold text-slate-900 dark:text-white">对照原文</p>
            <Button variant="ghost" size="sm" aria-pressed={showZh} onClick={() => setShowZh((v) => !v)}>
              {showZh ? '隐藏中文' : '显示中文'}
            </Button>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="listen-summary">
            主旨 {result.gistCorrect ? '✓' : '✗'} · 听写 {result.blanks.filter((b) => b.correct).length}/{result.blanks.length} · 重听{' '}
            {result.replays} 次
          </p>

          <ol className="flex flex-col gap-3" aria-label="对话原文">
            {turns.map((t, i) => (
              <li key={i} className="flex items-start gap-3" data-testid="transcript-turn">
                <Avatar speaker={t.speaker} />
                <div className="min-w-0 flex-1">
                  <p className="font-en text-[17px] leading-snug text-slate-900 dark:text-slate-100">
                    <Highlighted text={t.en} hidden={blanks.filter((b) => b.turn === i).map((b) => b.text)} />
                  </p>
                  {showZh && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t.zh}</p>}
                </div>
                <SpeakButton text={t.en} rate={rate} className="-mt-1" />
              </li>
            ))}
          </ol>

          {dialogue.chunkIds.length > 0 && (
            <div>
              <p className="mb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">对话里的语块</p>
              <ul className="flex flex-wrap gap-2">
                {dialogue.chunkIds.map((id) => {
                  const c = getChunk(id);
                  return (
                    <li key={id}>
                      <Link
                        to={`/library/chunk/${id}`}
                        className="font-en inline-flex min-h-11 items-center rounded-full border border-indigo-200 bg-indigo-50 px-3.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200"
                      >
                        {c ? c.en : id}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <Button variant="primary" size="lg" full onClick={() => onDone(result)}>
            完成
          </Button>
        </Card>
      )}
    </div>
  );
}

/** Line with each blank text marked. */
function Highlighted({ text, hidden }: { text: string; hidden: string[] }) {
  let nodes: (string | { mark: string })[] = [text];
  for (const h of hidden) {
    const next: (string | { mark: string })[] = [];
    let done = false;
    for (const n of nodes) {
      const parts = typeof n === 'string' && !done ? splitAround(n, h) : null;
      if (parts) {
        done = true;
        next.push(parts.before, { mark: parts.match }, parts.after);
      } else next.push(n);
    }
    nodes = next;
  }
  return (
    <>
      {nodes.map((n, i) =>
        typeof n === 'string' ? (
          n
        ) : (
          <mark key={i} className="rounded bg-amber-200 px-1 text-inherit dark:bg-amber-500/30">
            {n.mark}
          </mark>
        ),
      )}
    </>
  );
}
