import type { ReactNode } from 'react';

/** Wrap the first occurrence of `needle` (case-insensitive) in a highlight. Returns the plain text when not found. */
export function highlightText(text: string, needle: string | undefined): ReactNode {
  if (!needle) return text;
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-amber-200 px-1 text-inherit dark:bg-amber-500/30">{text.slice(i, i + needle.length)}</mark>
      {text.slice(i + needle.length)}
    </>
  );
}
