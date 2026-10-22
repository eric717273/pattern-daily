import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { GrammarPoint, Scene, SubstitutionFrame } from '../types';
import { AiError, aiConfigured, generateFrame } from '../lib/ai';
import {
  FRAME_LEVEL_LABELS,
  FRAME_LEVELS,
  GRAMMAR_LABELS,
  GRAMMAR_POINTS,
  SCENE_LABELS,
  SCENES,
} from '../lib/labels';
import { saveUserFrame } from '../lib/repo';
import { useSettings } from '../lib/settings';
import { FramePattern } from './FramePattern';
import { FrameTable } from './FrameTable';
import { GrammarTags } from './GrammarTag';
import { Badge, Button, Field, Segmented, Sheet, Spinner, inputClass } from './ui';

export interface GenerateFrameSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called after the generated frame was saved to the user's frames. */
  onSaved: (frame: SubstitutionFrame) => void;
}

/** Bottom sheet: topic + scene + level (+ grammar) -> AI generates a frame -> preview -> save. */
export function GenerateFrameSheet({ open, onClose, onSaved }: GenerateFrameSheetProps) {
  const [settings] = useSettings();
  const configured = aiConfigured(settings);

  const [topic, setTopic] = useState('');
  const [scene, setScene] = useState<Scene>('work');
  const [level, setLevel] = useState<1 | 2 | 3>(2);
  const [grammar, setGrammar] = useState<GrammarPoint | ''>('');
  const [busy, setBusy] = useState<'generating' | 'saving' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<SubstitutionFrame | null>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});

  const generate = async () => {
    if (!topic.trim()) {
      setError('请先写一个主题，比如“向老板汇报进度”。');
      return;
    }
    setBusy('generating');
    setError(null);
    try {
      const f = await generateFrame({
        topic: topic.trim(),
        scene,
        level,
        grammar: grammar ? [grammar] : undefined,
      });
      setFrame(f);
      setPicks({});
    } catch (e) {
      setError(e instanceof AiError ? e.message : '生成失败，请稍后重试。');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!frame) return;
    setBusy('saving');
    setError(null);
    try {
      await saveUserFrame(frame);
      onSaved(frame);
      setFrame(null);
      setTopic('');
    } catch {
      setError('保存失败，请重试。');
    } finally {
      setBusy(null);
    }
  };

  let footer = null;
  if (configured && frame) {
    footer = (
      <div className="flex gap-3">
        <Button full disabled={busy !== null} onClick={() => void generate()}>
          {busy === 'generating' ? '生成中…' : '重新生成'}
        </Button>
        <Button variant="primary" full disabled={busy !== null} onClick={() => void save()}>
          保存
        </Button>
      </div>
    );
  } else if (configured) {
    footer = (
      <Button variant="primary" full disabled={busy !== null} onClick={() => void generate()}>
        {busy === 'generating' ? (
          <>
            <Spinner size={18} label="生成中" />
            生成中…
          </>
        ) : (
          '生成母框'
        )}
      </Button>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title="AI 生成母框" footer={footer}>
      {!configured ? (
        <div className="rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">还没有配置 AI</p>
          <p className="mt-1">
            生成母框需要 DeepSeek。请先到“我的”页面填写 API Key（或接入 Supabase 代理），再回来生成。
          </p>
          <Link
            to="/me"
            onClick={onClose}
            className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-amber-600 px-4 font-medium text-white"
          >
            去设置
          </Link>
        </div>
      ) : frame ? (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-base font-semibold text-slate-900 dark:text-white">{frame.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone="slate">{SCENE_LABELS[frame.scene]}</Badge>
              <Badge tone="slate">{FRAME_LEVEL_LABELS[frame.level]}</Badge>
              <GrammarTags points={frame.grammar} className="contents" />
            </div>
          </div>
          <FramePattern frame={frame} />
          <FrameTable frame={frame} picks={picks} onChange={setPicks} />
          {frame.tipZh && <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{frame.tipZh}</p>}
          {error && <ErrorNote message={error} />}
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
        >
          <Field label="主题" hint="用中文或英文描述你想说的场景">
            <input
              className={inputClass}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="例如：向老板汇报项目进度"
              maxLength={80}
              autoFocus
            />
          </Field>
          <Field label="场景">
            <Segmented
              ariaLabel="场景"
              options={SCENES.map((s) => ({ value: s, label: SCENE_LABELS[s] }))}
              value={scene}
              onChange={setScene}
            />
          </Field>
          <Field label="难度">
            <Segmented
              ariaLabel="难度"
              options={FRAME_LEVELS.map((l) => ({ value: l, label: FRAME_LEVEL_LABELS[l] }))}
              value={level}
              onChange={setLevel}
            />
          </Field>
          <Field label="语法点（可选）">
            <select
              className={inputClass}
              value={grammar}
              onChange={(e) => setGrammar(e.target.value as GrammarPoint | '')}
            >
              <option value="">不限</option>
              {GRAMMAR_POINTS.map((g) => (
                <option key={g} value={g}>
                  {GRAMMAR_LABELS[g]}
                </option>
              ))}
            </select>
          </Field>
          {error && <ErrorNote message={error} />}
        </form>
      )}
    </Sheet>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm leading-relaxed text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
      {message}
    </p>
  );
}
