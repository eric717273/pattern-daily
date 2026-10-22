import type { GrammarPoint } from '../types';
import { GRAMMAR_LABELS } from '../lib/labels';
import { Badge } from './ui';

/** Chinese label badge for a grammar point, e.g. 'double-object' -> 双宾语语序. */
export function GrammarTag({ point, className }: { point: GrammarPoint; className?: string }) {
  return (
    <Badge tone="indigo" className={className}>
      {GRAMMAR_LABELS[point] ?? point}
    </Badge>
  );
}

/** A wrapped row of GrammarTags. */
export function GrammarTags({ points, className }: { points: GrammarPoint[]; className?: string }) {
  if (points.length === 0) return null;
  return (
    <div className={className ?? 'flex flex-wrap gap-1.5'}>
      {points.map((p) => (
        <GrammarTag key={p} point={p} />
      ))}
    </div>
  );
}
