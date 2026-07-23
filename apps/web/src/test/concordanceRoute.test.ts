// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// Typed with the real call signatures (db, bw, opts?) so `.mock.calls[n][2]`
// type-checks below -- an untyped `vi.fn(async () => [])` infers a 0-arg
// mock and TS rejects indexing a 3rd call argument.
const getRootConcordancePage = vi.fn(async (_db: unknown, _bw: string, _opts?: unknown) => []);
const countRootConcordance = vi.fn(async (_db: unknown, _bw: string, _formIds?: number[]) => 0);
vi.mock('@quran-corpus/data', () => ({ getRootConcordancePage, countRootConcordance }));
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
});
