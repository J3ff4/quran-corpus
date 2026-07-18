export function parseScrollAyah(raw: string | undefined, ayahCount: number): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= ayahCount ? n : null;
}
