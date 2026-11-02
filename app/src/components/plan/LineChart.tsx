export interface LineChartProps {
  title: string;
  values: number[];
  /** Highest value on the axis (levels start at 0). */
  max: number;
  colorClass: string;
  labels?: string[];
}

const W = 300;
const H = 120;
const PAD = { l: 26, r: 12, t: 10, b: 22 };

/** Small dependency-free SVG line chart of a level over time (x = test number). */
export function LineChart({ title, values, max, colorClass, labels }: LineChartProps) {
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (values.length <= 1 ? innerW / 2 : (i / (values.length - 1)) * innerW);
  const y = (v: number) => PAD.t + innerH - (Math.min(max, Math.max(0, v)) / max) * innerH;
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const ticks = [0, Math.round(max / 2), max];
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">{title}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${title}：${values.map((v, i) => `${labels?.[i] ?? `第 ${i + 1} 次`} ${v}`).join('，')}`}
        className={`h-auto w-full ${colorClass}`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" className="fill-slate-400 dark:fill-slate-500" fontSize={9}>
              {t}
            </text>
          </g>
        ))}
        {values.length > 1 && <polyline points={points} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {values.map((v, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(v)} r={3.5} fill="currentColor" />
            <text x={x(i)} y={y(v) - 7} textAnchor="middle" className="fill-slate-600 dark:fill-slate-300" fontSize={9} fontWeight={600}>
              {v}
            </text>
            {labels?.[i] && (
              <text x={x(i)} y={H - 6} textAnchor="middle" className="fill-slate-400 dark:fill-slate-500" fontSize={8}>
                {labels[i]}
              </text>
            )}
          </g>
        ))}
      </svg>
    </figure>
  );
}
