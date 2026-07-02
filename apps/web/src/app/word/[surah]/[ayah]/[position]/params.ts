// Kept out of page.tsx: Next route modules may only export reserved names
// (default, dynamic, metadata, ...). Exporting a helper there fails the
// generated route-type check, so this lives in a sibling module the page and
// its unit test both import.
export function parseWordParams(p: { surah: string; ayah: string; position: string }) {
  // Require plain decimal digit strings; rejects "1e2", "0x1", "  1", etc.
  if (![p.surah, p.ayah, p.position].every((s) => /^\d+$/.test(s))) return null;
  const surah = Number(p.surah);
  const ayah = Number(p.ayah);
  const position = Number(p.position);
  if (surah < 1 || surah > 114 || ayah < 1 || position < 1) return null;
  return { surah, ayah, position };
}
