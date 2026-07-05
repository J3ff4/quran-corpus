// Kept out of page.tsx: Next route modules may only export reserved names.
// This sibling holds the pure, unit-tested param logic (page + its test import it).

export const PAGE_SIZE = 15;

export function parseSurahId(p: { id: string }): number | null {
  if (!/^\d+$/.test(p.id)) return null;
  const n = Number(p.id);
  return n >= 1 && n <= 114 ? n : null;
}

export interface PageResolution {
  page: number;
  lo: number;
  hi: number;
  scrollAyah: number | null;
  totalPages: number;
}

export function resolvePage(
  ayahCount: number,
  rawPage: string | undefined,
  rawAyah: string | undefined,
): PageResolution {
  const totalPages = Math.max(1, Math.ceil(ayahCount / PAGE_SIZE));

  let page: number;
  let scrollAyah: number | null = null;

  const ayahNum = rawAyah !== undefined && /^\d+$/.test(rawAyah) ? Number(rawAyah) : NaN;
  if (Number.isInteger(ayahNum) && ayahNum >= 1 && ayahNum <= ayahCount) {
    page = Math.ceil(ayahNum / PAGE_SIZE);
    scrollAyah = ayahNum;
  } else {
    const p = rawPage !== undefined && /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
    page = Math.min(Math.max(p, 1), totalPages);
  }

  const lo = (page - 1) * PAGE_SIZE + 1;
  const hi = Math.min(page * PAGE_SIZE, ayahCount);
  return { page, lo, hi, scrollAyah, totalPages };
}
