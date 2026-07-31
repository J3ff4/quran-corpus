import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/db', () => ({ getDatabase: vi.fn(async () => ({} as never)) }));
// Keep the REAL Buckwalter validator; only stub the two DB query fns. The whole
// point of the regression is that a wrong charset silently 400s valid lemmas,
// so validation must be exercised for real, never behind a permissive stub.
vi.mock('@quran-corpus/data', async (importActual) => {
  const actual = await importActual<typeof import('@quran-corpus/data')>();
  return {
    ...actual,
    getLemmaConcordancePage: vi.fn(async () => [{ word_id: 1 }]),
    countLemmaConcordance: vi.fn(async () => 42),
  };
});
import { GET } from '../app/api/lemma/[lemma]/concordance/route';
import { CONCORDANCE_MAX_LIMIT, CONCORDANCE_PAGE_SIZE } from '@quran-corpus/data';

function req(url: string) {
  return new Request(url);
}
const ctx = (lemma: string) => ({ params: Promise.resolve({ lemma }) });

describe('GET /api/lemma/[lemma]/concordance', () => {
  it('returns entries + total', async () => {
    const res = await GET(
      req('http://x/api/lemma/qaAla/concordance?offset=0&limit=20'),
      ctx('qaAla'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(42);
    expect(body.entries).toHaveLength(1);
  });

  it("accepts a lemma with corpus special chars (^) the old regex wrongly rejected", async () => {
    // samaA^' (310 occurrences) -- the pre-fix regex omitted `^` and 400ed
    // this common word's Load-more paging.
    const bw = "samaA^'";
    const res = await GET(
      req(`http://x/api/lemma/${encodeURIComponent(bw)}/concordance`),
      ctx(bw),
    );
    expect(res.status).toBe(200);
  });

  it('rejects junk lemma with 400', async () => {
    const res = await GET(req('http://x/api/lemma/%20%20/concordance'), ctx('  '));
    expect(res.status).toBe(400);
  });

  it('400s (never throws) on an undecodable segment', async () => {
    // A lone `%` is not valid percent-encoding: decodeURIComponent throws
    // URIError. Uncaught that is a 500 on what is just an invalid identifier.
    const res = await GET(req('http://x/api/lemma/%/concordance'), ctx('%'));
    expect(res.status).toBe(400);
  });

  it('clamps an oversized limit to the shared page ceiling', async () => {
    const { getLemmaConcordancePage } = await import('@quran-corpus/data');
    await GET(req('http://x/api/lemma/qaAla/concordance?limit=9999'), ctx('qaAla'));
    expect(vi.mocked(getLemmaConcordancePage).mock.lastCall?.[2]).toMatchObject({
      limit: CONCORDANCE_MAX_LIMIT,
    });
  });

  it('clamps a non-positive limit up to 1, never passing it through', async () => {
    // SQLite reads a negative LIMIT as "no limit" -- it must never reach SQL.
    // A numeric out-of-range limit CLAMPS rather than falling back, so
    // `limit=-1` and `limit=0` yield a 1-row page, not the default.
    const { getLemmaConcordancePage } = await import('@quran-corpus/data');
    for (const raw of ['-1', '0']) {
      await GET(req(`http://x/api/lemma/qaAla/concordance?limit=${raw}`), ctx('qaAla'));
      expect(vi.mocked(getLemmaConcordancePage).mock.lastCall?.[2]).toMatchObject({ limit: 1 });
    }
    // Absent or blank both take the default. `limit=` used to clamp to 1
    // instead -- `Number('')` is 0, not NaN, so an empty value passed the
    // integer check and hit the floor, paging the concordance one occurrence
    // at a time. parseConcordancePaging now rejects blanks before converting.
    for (const url of [
      'http://x/api/lemma/qaAla/concordance',
      'http://x/api/lemma/qaAla/concordance?limit=',
    ]) {
      await GET(req(url), ctx('qaAla'));
      expect(vi.mocked(getLemmaConcordancePage).mock.lastCall?.[2]).toMatchObject({
        limit: CONCORDANCE_PAGE_SIZE,
      });
    }
  });
});
