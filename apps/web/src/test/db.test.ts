import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@quran-corpus/data', () => ({
  createDatabase: vi.fn(() => ({ mock: 'client' })),
  runMigrations: vi.fn(async () => undefined),
  backfillSearchIndex: vi.fn(async () => undefined),
  normalizeArabicJoinKeys: vi.fn(async () => undefined),
  backfillRootSortOrderIfStale: vi.fn(async () => 0),
}));

// getDatabase memoizes in module state — fresh module per test.
async function freshGetDatabase() {
  vi.resetModules();
  const mod = await import('../lib/db');
  return mod.getDatabase;
}

describe('getDatabase', () => {
  beforeEach(async () => {
    const data = await import('@quran-corpus/data');
    vi.mocked(data.createDatabase).mockClear();
    vi.mocked(data.runMigrations).mockClear().mockResolvedValue(undefined);
    vi.mocked(data.normalizeArabicJoinKeys).mockClear().mockResolvedValue(undefined);
    vi.mocked(data.backfillRootSortOrderIfStale).mockClear().mockResolvedValue(0);
  });

  it('a failed root-rank backfill does not fail init', async () => {
    const getDatabase = await freshGetDatabase();
    const data = await import('@quran-corpus/data');
    // SQLITE_BUSY is routine here: the scraper commits per row against the
    // same file. It costs a slower sort, so it must not 500 every SSR page.
    vi.mocked(data.backfillRootSortOrderIfStale).mockRejectedValueOnce(
      new Error('SQLITE_BUSY: database is locked'),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await expect(getDatabase()).resolves.toEqual({ mock: 'client' });
      expect(warn).toHaveBeenCalled();
      // Resolving proves init did not reject; this proves it carried on past
      // the catch rather than skipping the remaining steps.
      expect(data.normalizeArabicJoinKeys).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('a failed join-key normalization does not fail init', async () => {
    const getDatabase = await freshGetDatabase();
    const data = await import('@quran-corpus/data');
    // This pass is the one issuing write transactions now, so it is the call
    // that loses the race for the write lock -- against the scraper, or against
    // a second worker cold-starting on the same file. Unguarded it rejected the
    // memoized init and 500'd every SSR page; the degraded state it replaces
    // that with is the mismatched chips the app had before it ever ran.
    vi.mocked(data.normalizeArabicJoinKeys).mockRejectedValueOnce(
      new Error('SQLITE_BUSY: database is locked'),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await expect(getDatabase()).resolves.toEqual({ mock: 'client' });
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('memoizes: repeated calls share one init', async () => {
    const getDatabase = await freshGetDatabase();
    const data = await import('@quran-corpus/data');
    const a = await getDatabase();
    const b = await getDatabase();
    expect(a).toBe(b);
    expect(data.createDatabase).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed init — next call retries and succeeds', async () => {
    const getDatabase = await freshGetDatabase();
    const data = await import('@quran-corpus/data');
    vi.mocked(data.runMigrations).mockRejectedValueOnce(new Error('transient DB error'));

    await expect(getDatabase()).rejects.toThrow('transient DB error');
    // Poisoned-cache regression guard: before the fix this second call
    // replayed the same rejected promise until process restart.
    await expect(getDatabase()).resolves.toEqual({ mock: 'client' });
    expect(data.createDatabase).toHaveBeenCalledTimes(2);
  });

  it('runs the data-only self-heals even when DB_SKIP_MIGRATIONS=true skips runMigrations', async () => {
    const prev = process.env['DB_SKIP_MIGRATIONS'];
    process.env['DB_SKIP_MIGRATIONS'] = 'true';
    try {
      const getDatabase = await freshGetDatabase();
      const data = await import('@quran-corpus/data');
      await getDatabase();
      expect(data.runMigrations).not.toHaveBeenCalled();
      expect(data.normalizeArabicJoinKeys).toHaveBeenCalledTimes(1);
      // But NOT the root-rank backfill: the triggers that dirty that cache are
      // DDL this flag skips, so it could only ever find a clean cache and
      // pretend to heal. (The self-heal above does write under this flag, and
      // `next build` sets it — that is deliberate and noted at the call site.
      // The backfill is excluded on its own merits, not to keep the build
      // read-only, which it no longer is.)
      expect(data.backfillRootSortOrderIfStale).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env['DB_SKIP_MIGRATIONS'];
      else process.env['DB_SKIP_MIGRATIONS'] = prev;
    }
  });
});
