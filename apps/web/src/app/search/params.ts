// Kept out of page.tsx: Next route modules may only export reserved names.
export function parseSearchQuery(q: string | string[] | undefined): string | null {
  const raw = Array.isArray(q) ? q[0] : q;
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, 100);
}
