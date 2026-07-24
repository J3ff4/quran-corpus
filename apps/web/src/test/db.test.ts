import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@quran-corpus/data', () => ({
  createDatabase: vi.fn(() => ({ mock: 'client' })),
  runMigrations: vi.fn(async () => undefined),
  backfillSearchIndex: vi.fn(async () => undefined),
  normalizeLemmaMadda: vi.fn(async () => undefined),
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
    vi.mocked(data.normalizeLemmaMadda).mockClear().mockResolvedValue(undefined);
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

  it('runs the lemma-madda self-heal even when DB_SKIP_MIGRATIONS=true skips runMigrations', async () => {
    const prev = process.env['DB_SKIP_MIGRATIONS'];
    process.env['DB_SKIP_MIGRATIONS'] = 'true';
    try {
      const getDatabase = await freshGetDatabase();
      const data = await import('@quran-corpus/data');
      await getDatabase();
      expect(data.runMigrations).not.toHaveBeenCalled();
      expect(data.normalizeLemmaMadda).toHaveBeenCalledTimes(1);
    } finally {
      if (prev === undefined) delete process.env['DB_SKIP_MIGRATIONS'];
      else process.env['DB_SKIP_MIGRATIONS'] = prev;
    }
  });
});
