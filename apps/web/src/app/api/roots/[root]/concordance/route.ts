import { NextResponse } from 'next/server';
import { getRootConcordancePage, countRootConcordance } from '@quran-corpus/data';
import { getDatabase } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

// Buckwalter root alphabet: ASCII letters plus the hamza/madda/wasla symbols.
// Parametrized queries make injection a non-issue; this rejects junk paths early.
const BUCKWALTER = /^[A-Za-z'`><{}|&*$~]{1,12}$/;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/** Clamp a query-string integer to [min,max], falling back to `fallback` on junk. */
function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (raw === null || !Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
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

  const db = await getDatabase();
  const [entries, total] = await Promise.all([
    getRootConcordancePage(db, bw, { limit, offset }),
    countRootConcordance(db, bw),
  ]);
  return NextResponse.json(
    { entries, total },
    { headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
