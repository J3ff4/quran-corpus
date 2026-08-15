import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  opens: [] as string[],
  applied: [] as string[],
  openResult: null as (() => Promise<unknown>) | null,
}));

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: async (name: string) => {
    mocks.opens.push(name);
    if (mocks.openResult) return mocks.openResult();
    return {
      execAsync: async (sql: string) => {
        mocks.applied.push(sql);
      },
    };
  },
}));

// The connection is memoized in module scope, so each case needs a fresh
// module registry -- otherwise the second test inherits the first one's cache
// and passes without exercising anything.
async function freshOpenUserDb() {
  vi.resetModules();
  const mod = await import('./userDb.js');
  return mod.openUserDb;
}

describe('openUserDb', () => {
  beforeEach(() => {
    mocks.opens = [];
    mocks.applied = [];
    mocks.openResult = null;
  });

  it('applies the shared user-DB schema on first open', async () => {
    const openUserDb = await freshOpenUserDb();

    await openUserDb();

    expect(mocks.opens).toEqual(['quran-corpus-user.db']);
    // Asserted on content, not on "execAsync was called": the point of taking
    // the schema from packages/data is that this app cannot define its own, so
    // the test fails if someone reintroduces a local copy that drifts.
    const schema = mocks.applied.join('\n');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS bookmarks');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS reading_history');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS settings');
  });

  it('opens once however many callers ask for it', async () => {
    const openUserDb = await freshOpenUserDb();

    const [first, second] = await Promise.all([openUserDb(), openUserDb()]);
    const third = await openUserDb();

    // Reading positions are written from scroll, so this used to reopen the
    // database and re-run the whole DDL several times a second.
    expect(mocks.opens).toHaveLength(1);
    expect(mocks.applied).toHaveLength(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('retries after a failed open instead of caching the failure', async () => {
    const openUserDb = await freshOpenUserDb();
    mocks.openResult = () => Promise.reject(new Error('database is locked'));

    await expect(openUserDb()).rejects.toThrow('database is locked');

    // A cached rejection would poison every later call for the life of the
    // process -- one transient failure at launch and the app never persists
    // another bookmark until it is force-quit.
    mocks.openResult = null;
    await expect(openUserDb()).resolves.toBeTruthy();
    expect(mocks.opens).toHaveLength(2);
  });
});
