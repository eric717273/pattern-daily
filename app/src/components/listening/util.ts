export const clock = (): number => Date.now();

/** Case-insensitive split of `line` around the first occurrence of `needle`; null when not found. */
export function splitAround(line: string, needle: string): { before: string; match: string; after: string } | null {
  const i = line.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0 || needle === '') return null;
  return { before: line.slice(0, i), match: line.slice(i, i + needle.length), after: line.slice(i + needle.length) };
}
