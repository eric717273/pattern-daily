import { Link } from 'react-router-dom';
import { getChunk, getSeedFrame } from '../../content';
import type { ItemRef } from '../../types';
import { FUNCTION_CATEGORY_LABELS } from '../../lib/labels';
import type { SkillStats } from '../../lib/skills';

const LINK =
  'inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-indigo-950/40';

function edgeLink(ref: ItemRef): { to: string; text: string } | undefined {
  if (ref.kind === 'chunk') {
    const c = getChunk(ref.id);
    return c ? { to: `/library/chunk/${ref.id}`, text: c.en } : undefined;
  }
  if (ref.kind === 'frame') {
    const f = getSeedFrame(ref.id);
    return f ? { to: `/frames/${ref.id}`, text: f.pattern } : undefined;
  }
  return undefined;
}

export function WeakSpots({ stats, edge }: { stats: SkillStats; edge: readonly ItemRef[] }) {
  const edgeLinks = edge.map(edgeLink).filter((x): x is { to: string; text: string } => x !== undefined);
  const sounds = stats.soundErrors.slice(0, 5);
  const none = stats.weakestCategories.length === 0 && edgeLinks.length === 0 && sounds.length === 0;
  return (
    <div className="flex flex-col gap-4">
      {none && (
        <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400" data-testid="weak-empty">
          暂时没有发现明显的薄弱环节。练习几天后，这里会列出正确率偏低的类别、边缘语块和容易听错的音变。
        </p>
      )}
      {stats.weakestCategories.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">正确率偏低的类别</h3>
          <ul className="flex flex-wrap gap-2">
            {stats.weakestCategories.map((c) => (
              <li key={c.category}>
                <Link to={`/library?cat=${c.category}`} className={LINK}>
                  {FUNCTION_CATEGORY_LABELS[c.category]}
                  <span className="ml-1.5 text-xs font-normal text-slate-500 tabular-nums dark:text-slate-400">
                    {Math.round(c.acc * 100)}%（{c.n} 次）
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {edgeLinks.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">边缘语块（将会未会）</h3>
          <ul className="flex flex-wrap gap-2">
            {edgeLinks.map((e) => (
              <li key={e.to}>
                <Link to={e.to} className={`font-en ${LINK}`}>
                  {e.text}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sounds.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">容易听错的音变</h3>
          <ul className="flex flex-wrap gap-2">
            {sounds.map((s) => (
              <li key={s.soundId}>
                <Link to={`/listening/sound/${s.soundId}`} className={LINK}>
                  {s.name}
                  <span className="ml-1.5 text-xs font-normal text-slate-500 tabular-nums dark:text-slate-400">错 {s.errors} / {s.attempts}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
