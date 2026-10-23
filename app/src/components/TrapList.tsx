/** Parse "✗ wrong → ✓ right（note）" into parts; falls back to the raw string. */
function parseTrap(raw: string): { wrong?: string; right?: string; note?: string; raw: string } {
  const m = /^\s*✗\s*(.+?)\s*(?:→|->)\s*✓\s*(.+?)\s*(?:（(.+)）)?\s*$/.exec(raw);
  if (!m) return { raw };
  return { wrong: m[1], right: m[2], note: m[3], raw };
}

/** The "文法陷阱" list of a dozen sentence: wrong (struck through) vs. right, with the note. */
export function TrapList({ traps }: { traps: string[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {traps.map((raw, i) => {
        const t = parseTrap(raw);
        return (
          <li key={i} className="text-[15px] leading-relaxed">
            {t.wrong && t.right ? (
              <>
                <p className="font-en flex items-baseline gap-2 text-rose-600 dark:text-rose-400">
                  <span aria-label="错误" className="shrink-0 font-sans font-bold">
                    ✗
                  </span>
                  <span className="line-through decoration-rose-300 dark:decoration-rose-800">{t.wrong}</span>
                </p>
                <p className="font-en mt-0.5 flex items-baseline gap-2 font-medium text-emerald-700 dark:text-emerald-400">
                  <span aria-label="正确" className="shrink-0 font-sans font-bold">
                    ✓
                  </span>
                  <span>{t.right}</span>
                </p>
                {t.note && <p className="mt-1 pl-6 text-sm text-slate-500 dark:text-slate-400">{t.note}</p>}
              </>
            ) : (
              <p className="text-slate-700 dark:text-slate-300">{t.raw}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
