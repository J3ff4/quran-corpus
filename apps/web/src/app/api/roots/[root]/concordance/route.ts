import { NextResponse } from 'next/server';
import { getRootConcordancePage, countRootConcordance } from '@quran-corpus/data';
import { getDatabase } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

// Buckwalter root alphabet: ASCII letters plus the hamza/madda/wasla symbols.
// Parametrized queries make injection a non-issue; this rejects junk paths early.
const BUCKWALTER = /^[A-Za-z'`><{}|&*$~]{1,12}$/;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
// Empirically the largest root (qwm) has 22 derived forms -- 50 gives headroom
// while staying far below SQLite's bind-variable ceiling.
const MAX_FORM_IDS = 50;

/** Clamp a query-string integer to [min,max], falling back to `fallback` on junk. */
function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (raw === null || !Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** Parse "3,7,12" into [3,7,12], silently dropping non-numeric entries.
 *  Returns undefined (not []) when nothing valid remains, so callers can
 *  omit the option entirely rather than pass an empty-but-present filter.
 *  Throws FormIdLimitError instead of silently truncating an oversized list
 *  -- a caller asking for N ids must never get a 200 scoped to fewer than N
 *  with no indication anything was dropped. */
class FormIdLimitError extends Error {}

function parseFormIds(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  const ids = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length > MAX_FORM_IDS) throw new FormIdLimitError();
  return ids.length > 0 ? ids : undefined;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ root: string }> },
): Promise<Response> {
  const bw = decodeURIComponent((await params).root);
  if (!BUCKWALTER.test(bw)) {
    return NextResponse.json({ error: 'Invalid root' }, { status: 400 });
  }
  const sp = new URL(request.url).searchParams;
  const limit = clampInt(sp.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(sp.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
  let formIds: number[] | undefined;
  try {
    formIds = parseFormIds(sp.get('forms'));
  } catch (e) {
    if (e instanceof FormIdLimitError) {
      return NextResponse.json(
        { error: `forms accepts at most ${MAX_FORM_IDS} ids` },
        { status: 400 },
      );
    }
    throw e;
  }

  const db = await getDatabase();
  const [entries, total] = await Promise.all([
    getRootConcordancePage(db, bw, { limit, offset, ...(formIds ? { formIds } : {}) }),
    countRootConcordance(db, bw, formIds),
  ]);
  return NextResponse.json(
    { entries, total },
    { headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
