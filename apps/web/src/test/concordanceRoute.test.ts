// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import type { getRootConcordancePage as GetRootConcordancePage, countRootConcordance as CountRootConcordance } from '@quran-corpus/data';

// Hoisted so the vi.mock factory (itself hoisted above module-body consts) can
// reference these without hitting the temporal dead zone. Typed from the REAL
// exported signatures (via vi.fn<typeof fn>) so a change to either query's
// args or return shape breaks this test instead of silently compiling -- and
// so `.mock.calls[n][2]` still type-checks below.
const { getRootConcordancePage, countRootConcordance } = vi.hoisted(() => ({
  getRootConcordancePage: vi.fn<typeof GetRootConcordancePage>(async () => []),
  countRootConcordance: vi.fn<typeof CountRootConcordance>(async () => 0),
}));
// Keep the real isRootBuckwalter (the route validates with it); stub only the
// two DB query fns.
vi.mock('@quran-corpus/data', async (importActual) => {
  const actual = await importActual<typeof import('@quran-corpus/data')>();
  return { ...actual, getRootConcordancePage, countRootConcordance };
});
vi.mock('../lib/db', () => ({ getDatabase: vi.fn(async () => ({})) }));

const { GET } = await import('../app/api/roots/[root]/concordance/route');

function req(url: string): Request {
  return new Request(url);
}

describe('GET /api/roots/[root]/concordance', () => {
  it('parses a valid forms= param into formIds passed to both queries', async () => {
    await GET(req('http://x/api/roots/ktb/concordance?forms=3,7,12'), {
      params: Promise.resolve({ root: 'ktb' }),
    });
    expect(getRootConcordancePage).toHaveBeenCalledWith(
      expect.anything(),
      'ktb',
      expect.objectContaining({ formIds: [3, 7, 12] }),
    );
    expect(countRootConcordance).toHaveBeenCalledWith(expect.anything(), 'ktb', [3, 7, 12]);
  });

  it('omits formIds entirely when forms= is absent', async () => {
    await GET(req('http://x/api/roots/ktb/concordance'), {
      params: Promise.resolve({ root: 'ktb' }),
    });
    const lastPageCall = getRootConcordancePage.mock.calls.at(-1)!;
    expect(lastPageCall[2]).not.toHaveProperty('formIds');
    const lastCountCall = countRootConcordance.mock.calls.at(-1)!;
    expect(lastCountCall[2]).toBeUndefined();
  });

  it('drops non-numeric junk from forms= instead of erroring', async () => {
    const res = await GET(req('http://x/api/roots/ktb/concordance?forms=3,abc,7'), {
      params: Promise.resolve({ root: 'ktb' }),
    });
    expect(res.status).toBe(200);
    const lastPageCall = getRootConcordancePage.mock.calls.at(-1)!;
    expect(lastPageCall[2]).toMatchObject({ formIds: [3, 7] });
  });

  it('empty forms= (no valid ids) behaves like no filter', async () => {
    await GET(req('http://x/api/roots/ktb/concordance?forms=abc,def'), {
      params: Promise.resolve({ root: 'ktb' }),
    });
    const lastPageCall = getRootConcordancePage.mock.calls.at(-1)!;
    expect(lastPageCall[2]).not.toHaveProperty('formIds');
  });

  it('rejects an oversized forms= list with 400 instead of silently truncating it', async () => {
    const callsBefore = getRootConcordancePage.mock.calls.length;
    const oversized = Array.from({ length: 500 }, (_, i) => i + 1).join(',');
    const res = await GET(req(`http://x/api/roots/ktb/concordance?forms=${oversized}`), {
      params: Promise.resolve({ root: 'ktb' }),
    });
    expect(res.status).toBe(400);
    // Never reaches the DB layer with a silently-scoped-down filter.
    expect(getRootConcordancePage.mock.calls.length).toBe(callsBefore);
  });

  // Pin the root endpoint's accepted charset. The validator is now shared with
  // the lemma route (isRootBuckwalter), so this guards against a future
  // lemma-charset edit silently changing what the root endpoint accepts.
  it('accepts a valid root buckwalter and rejects junk', async () => {
    const ok = await GET(req('http://x/api/roots/ktb/concordance'), {
      params: Promise.resolve({ root: 'ktb' }),
    });
    expect(ok.status).toBe(200);

    for (const junk of ['  ', 'has space', 'a'.repeat(25)]) {
      const res = await GET(req(`http://x/api/roots/${encodeURIComponent(junk)}/concordance`), {
        params: Promise.resolve({ root: junk }),
      });
      expect(res.status).toBe(400);
    }
  });
});
