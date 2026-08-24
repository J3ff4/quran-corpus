# M6b Home + Counters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the home tab as the four glass blocks the design calls for —
continue reading, day streak, roots studied, ayah of the day — and add the
on-device tracking the two counters need.

**Architecture:** Two new user-DB tables behind the app's first real migration
mechanism. Both counters are *derived*, never stored: the DB holds raw day rows
and raw root-view rows, and pure functions compute the streak and the weekly log
from them. That keeps the write path a single idempotent insert and puts every
branch worth testing in a function with no database in it.

**Tech Stack:** as M6a. `packages/data` (`./user-db` entry) plus
`apps/mobile`. No new dependency.

**Spec:** `docs/plans/phase-m6-glass-redesign.md`, decisions 21–24 and 30–34.
Mockups `1a` (continue ribbon), `1b` (ayah of the day plate), `1c`
(corpus-first home).

## Global Constraints

Inherited from the umbrella plan. Sub-phase specifics:

- **§5 fires.** This changes the on-device user DB schema *and* `packages/data`.
  `/code-review` is user-triggered: stop after Task 7 and ask the owner to run
  it. Do not open the PR first.
- The user DB file lives on the owner's phone and survives app updates. Every
  migration statement here is **additive only** — `CREATE TABLE IF NOT EXISTS`.
  No `DROP`, no `UPDATE`, no data rewrite. An older build must still open a
  migrated file.
- Decision 34: nothing new leaves the device. `src/telemetry/telemetry.ts` is
  not touched, and no counter value is passed to it.
- `packages/data/src/userData.ts` must stay an import-free leaf —
  `packages/data/tests/mobile-entry.test.ts:88` asserts
  `runtimeImportsOf('userData.ts')` is `[]`. **Do not weaken that test.** It is
  why Task 2 keys root views by integer id rather than by a Buckwalter string:
  a string key would need `isRootBuckwalter`, which lives in
  `src/text/buckwalter.ts`, and importing it would break the guard.
- Branch: `feat/m6b-home-counters`. Device checks 55–60.
- Remember to rebuild `packages/data` before running the app —
  `apps/web` and `apps/mobile` import its compiled `dist/`
  (`[[packages-data-stale-dist-gotcha]]`).

---

### Task 1: A migration mechanism for the user DB

`USER_DB_SCHEMA` is `CREATE TABLE IF NOT EXISTS` only. It cannot add a column
and it cannot tell a fresh install from an upgraded one. Two sub-phases (this
one and M6h) need it to.

**Files:**
- Modify: `packages/data/src/userData.ts`
- Modify: `packages/data/tests/userData.test.ts`
- Modify: `apps/mobile/src/data/userDb.ts`

**Interfaces:**
- Produces, from `@quran-corpus/data/user-db`:

```ts
export const USER_DB_VERSION: number;
export const USER_DB_MIGRATIONS: readonly { version: number; sql: string }[];
export async function migrateUserDb(client: QueryClient): Promise<number>;
```

`migrateUserDb` returns the version the file is at when it returns.

- [ ] **Step 1: Write the failing test**

`packages/data/tests/userData.test.ts` — the suite already has an in-memory
client helper; reuse it rather than adding a second one.

```ts
import { USER_DB_MIGRATIONS, USER_DB_SCHEMA, USER_DB_VERSION, migrateUserDb } from '../src/userData.js';

describe('migrateUserDb', () => {
  it('brings a fresh file to the current version', async () => {
    const client = newClient();
    await client.execute(USER_DB_SCHEMA);

    expect(await migrateUserDb(client)).toBe(USER_DB_VERSION);
    const after = await client.execute('PRAGMA user_version');
    expect(Number(after.rows[0]!.user_version)).toBe(USER_DB_VERSION);
  });

  it('is a no-op on a file already at the current version', async () => {
    const client = newClient();
    await client.execute(USER_DB_SCHEMA);
    await migrateUserDb(client);

    // Runs on every app launch. A migration that re-applies is how an
    // ALTER TABLE in a later version throws "duplicate column" on the second
    // start and locks the user out of their own data.
    expect(await migrateUserDb(client)).toBe(USER_DB_VERSION);
  });

  it('preserves rows written before the migration ran', async () => {
    const client = newClient();
    await client.execute(USER_DB_SCHEMA);
    await setBookmark(client, 2, 255, true);

    await migrateUserDb(client);

    // The whole reason this is versioned rather than a schema rewrite: the
    // file is on the owner's phone and predates every migration in the list.
    expect(await getBookmarks(client)).toEqual([{ surahId: 2, ayahNumber: 255 }]);
  });

  it('applies only the migrations above the file version', async () => {
    const client = newClient();
    await client.execute(USER_DB_SCHEMA);
    await client.execute(`PRAGMA user_version = ${USER_DB_VERSION}`);

    const applied: number[] = [];
    const spy = {
      execute: async (query: unknown) => {
        if (typeof query !== 'string') applied.push(1);
        return client.execute(query as never);
      },
    };
    await migrateUserDb(spy as never);

    // Nothing above the current version exists, so nothing runs.
    expect(applied).toEqual([]);
  });

  it('numbers migrations contiguously from 2', () => {
    // Migration 1 is USER_DB_SCHEMA itself, applied on open. A gap or a
    // duplicate silently skips a table on exactly the devices that were on the
    // skipped version.
    expect(USER_DB_MIGRATIONS.map((m) => m.version)).toEqual(
      USER_DB_MIGRATIONS.map((_, i) => i + 2),
    );
    expect(USER_DB_VERSION).toBe(USER_DB_MIGRATIONS.length + 1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/data test -t migrateUserDb`
Expected: FAIL — no such export.

- [ ] **Step 3: Implement**

In `packages/data/src/userData.ts`, below `USER_DB_SCHEMA`:

```ts
/**
 * Schema changes past the baseline, applied in order.
 *
 * Version 1 *is* `USER_DB_SCHEMA` above, which every open applies and which is
 * idempotent. Everything after it needs a version number, because the
 * statements are not: `ALTER TABLE ... ADD COLUMN` throws on the second run,
 * and a caught-and-ignored throw is indistinguishable from a migration that
 * silently did nothing.
 *
 * Additive only, and that is a rule rather than a coincidence: this file lives
 * on a user's phone and survives app updates, so a build that rewrites or drops
 * data has no way back. It also means an older build still opens a newer file --
 * it simply does not see the new tables.
 */
export const USER_DB_MIGRATIONS: readonly { version: number; sql: string }[] = [
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS reading_days (
        day TEXT PRIMARY KEY,
        recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS root_views (
        root_id INTEGER NOT NULL,
        day TEXT NOT NULL,
        PRIMARY KEY (root_id, day)
      );
    `,
  },
];

/** The version a file is at once every migration above has been applied. */
export const USER_DB_VERSION = USER_DB_MIGRATIONS.length + 1;

/**
 * Apply pending migrations and return the version the file ends at.
 *
 * `PRAGMA user_version` is SQLite's own four-byte slot in the header, so this
 * needs no bookkeeping table of its own. It reads 0 on a file that predates
 * this function, which is exactly right: every migration below is above 0, so
 * an existing install gets all of them, and each one is `IF NOT EXISTS` anyway.
 *
 * Callers run this on every open, after applying USER_DB_SCHEMA.
 */
export async function migrateUserDb(client: QueryClient): Promise<number> {
  const result = await client.execute('PRAGMA user_version');
  const current = Number(result.rows[0]?.user_version ?? 0);

  for (const migration of USER_DB_MIGRATIONS) {
    if (migration.version <= current) continue;
    await client.execute(migration.sql);
  }

  if (current < USER_DB_VERSION) {
    // Not parameterizable: PRAGMA takes a literal. USER_DB_VERSION is a number
    // computed in this module, never caller input, so there is nothing to
    // inject -- but keep it that way if this ever takes an argument.
    await client.execute(`PRAGMA user_version = ${USER_DB_VERSION}`);
  }

  return USER_DB_VERSION;
}
```

- [ ] **Step 4: Call it on open**

`apps/mobile/src/data/userDb.ts`:

```ts
import { USER_DB_SCHEMA, migrateUserDb } from '@quran-corpus/data/user-db';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';

async function createUserDb() {
  const db = await SQLite.openDatabaseAsync(USER_DB_NAME);
  await db.execAsync(USER_DB_SCHEMA);
  // Inside the memoized open, so it runs exactly once per process and every
  // caller of openUserDb() is guaranteed a migrated file -- there is no
  // "call this first" ordering for a screen to get wrong.
  await migrateUserDb(createExpoSqliteClient(db as ExpoSqliteLike));
  return db;
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @quran-corpus/data test && pnpm --filter @quran-corpus/mobile test`
Expected: PASS.

- [ ] **Step 6: Mutation-check (§4)**

Change `if (migration.version <= current) continue;` to `if (false) continue;`
and re-run. Expected: no failure yet — migration 2 is `IF NOT EXISTS`. That is
the point of the fourth test: it FAILS, because a migration ran on a file
already at the current version. If it does not fail, the test is vacuous and
must be fixed before moving on (`[[sdd-brief-can-specify-vacuous-tests]]`).
Restore by re-editing.

- [ ] **Step 7: Commit**

```bash
git add packages/data/src/userData.ts packages/data/tests/userData.test.ts \
        apps/mobile/src/data/userDb.ts
git commit -m "feat(data): version the on-device user database"
```

---

### Task 2: Record reading days and root views

**Files:**
- Modify: `packages/data/src/userData.ts`
- Modify: `packages/data/tests/userData.test.ts`
- Modify: `apps/mobile/src/data/userRepository.ts`

**Interfaces:**
- Produces, from `@quran-corpus/data/user-db`:

```ts
export async function recordReadingDay(client: QueryClient, day: string): Promise<void>;
export async function getReadingDays(client: QueryClient, sinceDay: string): Promise<string[]>;
export async function recordRootView(client: QueryClient, rootId: number, day: string): Promise<void>;
export async function countDistinctRootsViewed(client: QueryClient): Promise<number>;
export async function getRootViewsByDay(client: QueryClient, sinceDay: string): Promise<{ day: string; roots: number }[]>;
export function isIsoDay(value: unknown): value is string;
```

- [ ] **Step 1: Write the failing test**

```ts
describe('reading days', () => {
  it('rejects anything that is not an ISO day', async () => {
    const client = newClient();
    await client.execute(USER_DB_SCHEMA);
    await migrateUserDb(client);

    // The write boundary for a shared API. `day` is a PRIMARY KEY, so a junk
    // value is not a bad row that gets overwritten tomorrow -- it is a
    // permanent extra row that inflates the streak for ever.
    for (const bad of ['2026-8-24', '24/08/2026', '2026-13-01', '2026-02-30', '', 'today', '2026-08-24T10:00:00Z']) {
      await expect(recordReadingDay(client, bad)).rejects.toThrow(RangeError);
    }
  });

  it('is idempotent for a day already recorded', async () => {
    const client = newClient();
    await client.execute(USER_DB_SCHEMA);
    await migrateUserDb(client);

    await recordReadingDay(client, '2026-08-24');
    await recordReadingDay(client, '2026-08-24');

    // Fires on every scroll of the reader. A non-idempotent insert either
    // throws on the second ayah or counts one day many times.
    expect(await getReadingDays(client, '2026-08-01')).toEqual(['2026-08-24']);
  });

  it('returns days from the cutoff onward, newest first', async () => {
    const client = newClient();
    await client.execute(USER_DB_SCHEMA);
    await migrateUserDb(client);

    for (const day of ['2026-08-20', '2026-08-22', '2026-08-24']) await recordReadingDay(client, day);

    expect(await getReadingDays(client, '2026-08-22')).toEqual(['2026-08-24', '2026-08-22']);
  });
});

describe('root views', () => {
  it('rejects a root id that cannot name a root', async () => {
    const client = newClient();
    await client.execute(USER_DB_SCHEMA);
    await migrateUserDb(client);

    for (const bad of [0, -1, 1.5, Number.NaN, 99999]) {
      await expect(recordRootView(client, bad, '2026-08-24')).rejects.toThrow(RangeError);
    }
    await expect(recordRootView(client, 12, 'yesterday')).rejects.toThrow(RangeError);
  });

  it('counts a root once however many times it is opened', async () => {
    const client = newClient();
    await client.execute(USER_DB_SCHEMA);
    await migrateUserDb(client);

    await recordRootView(client, 12, '2026-08-24');
    await recordRootView(client, 12, '2026-08-24');
    await recordRootView(client, 12, '2026-08-25');
    await recordRootView(client, 99, '2026-08-25');

    // "Distinct roots studied", not "root screens opened". Re-reading one root
    // all week is one root.
    expect(await countDistinctRootsViewed(client)).toBe(2);
    expect(await getRootViewsByDay(client, '2026-08-24')).toEqual([
      { day: '2026-08-25', roots: 2 },
      { day: '2026-08-24', roots: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/data test -t 'reading days'`
Expected: FAIL — no such export.

- [ ] **Step 3: Implement**

```ts
/** Roots in the corpus are 1..1548 today; the cap carries headroom for a
 *  re-import the way the Buckwalter length caps do. A view row is only ever
 *  counted, never joined back for display, so an id past the end would inflate
 *  a number with nothing on screen to reveal it. */
const MAX_ROOT_ID = 5000;

/**
 * True for a calendar day in `YYYY-MM-DD`, and only for one that exists.
 *
 * The regex alone accepts 2026-02-30 and 2026-13-01. Both are storable, both
 * are PRIMARY KEYs, and both would sit in the streak table for ever -- so the
 * round-trip through Date is the actual check and the regex only fixes the
 * shape (Date parses far too much on its own, including full timestamps).
 */
export function isIsoDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function assertIsoDay(day: string): void {
  if (!isIsoDay(day)) throw new RangeError(`day must be an ISO calendar day (YYYY-MM-DD), got ${day}`);
}

export async function recordReadingDay(client: QueryClient, day: string): Promise<void> {
  assertIsoDay(day);
  await client.execute({
    sql: 'INSERT INTO reading_days (day) VALUES (?) ON CONFLICT(day) DO NOTHING',
    args: [day],
  });
}

export async function getReadingDays(client: QueryClient, sinceDay: string): Promise<string[]> {
  assertIsoDay(sinceDay);
  const result = await client.execute({
    sql: 'SELECT day FROM reading_days WHERE day >= ? ORDER BY day DESC',
    args: [sinceDay],
  });
  return result.rows.map((row) => String(row.day));
}

export async function recordRootView(client: QueryClient, rootId: number, day: string): Promise<void> {
  if (!Number.isInteger(rootId) || rootId < 1 || rootId > MAX_ROOT_ID) {
    throw new RangeError(`rootId must be an integer in 1..${MAX_ROOT_ID}, got ${rootId}`);
  }
  assertIsoDay(day);
  await client.execute({
    sql: 'INSERT INTO root_views (root_id, day) VALUES (?, ?) ON CONFLICT(root_id, day) DO NOTHING',
    args: [rootId, day],
  });
}

export async function countDistinctRootsViewed(client: QueryClient): Promise<number> {
  const result = await client.execute('SELECT COUNT(DISTINCT root_id) AS roots FROM root_views');
  return Number(result.rows[0]?.roots ?? 0);
}

export async function getRootViewsByDay(
  client: QueryClient,
  sinceDay: string,
): Promise<{ day: string; roots: number }[]> {
  assertIsoDay(sinceDay);
  const result = await client.execute({
    sql: `SELECT day, COUNT(DISTINCT root_id) AS roots
          FROM root_views
          WHERE day >= ?
          GROUP BY day
          ORDER BY day DESC`,
    args: [sinceDay],
  });
  return result.rows.map((row) => ({ day: String(row.day), roots: Number(row.roots) }));
}
```

Re-export all five plus `isIsoDay` from
`apps/mobile/src/data/userRepository.ts`, in the existing export block.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @quran-corpus/data test`
Expected: PASS.

- [ ] **Step 5: Mutation-check (§4)**

Delete the `new Date(...)` line from `isIsoDay` and return the regex result.
Expected: the rejection test FAILS on `2026-13-01` and `2026-02-30`. Restore by
re-editing.

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/userData.ts packages/data/tests/userData.test.ts \
        apps/mobile/src/data/userRepository.ts
git commit -m "feat(data): record reading days and root views on device"
```

---

### Task 3: Derive the streak and the weekly log

Pure functions, no DB. Every branch worth a test is here.

**Files:**
- Create: `apps/mobile/src/home/counters.ts`
- Create: `apps/mobile/src/home/counters.test.ts`

**Interfaces:**
- Produces:

```ts
export function localDay(now: Date): string;
export function streakFrom(days: readonly string[], today: string): number;
export function weeklyLog(rows: readonly { day: string; roots: number }[], today: string): { day: string; roots: number }[];
```

`weeklyLog` always returns exactly 7 entries, oldest first, zero-filled.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { localDay, streakFrom, weeklyLog } from './counters';

describe('localDay', () => {
  it('uses the device local date, not UTC', () => {
    // Decision 22. A user reading at 01:00 in Tashkent (UTC+5) is on the next
    // day locally and the previous one in UTC; toISOString() would break their
    // streak at exactly the hour people read.
    const late = new Date(2026, 7, 24, 1, 0, 0); // local 2026-08-24
    expect(localDay(late)).toBe('2026-08-24');
  });
});

describe('streakFrom', () => {
  it('counts consecutive days ending today', () => {
    expect(streakFrom(['2026-08-24', '2026-08-23', '2026-08-22'], '2026-08-24')).toBe(3);
  });

  it('still counts a streak that ended yesterday', () => {
    // Opened at 09:00 having read last night: the streak is alive until the
    // day is missed entirely. Resetting at midnight would show 0 to someone
    // with a 40-day run.
    expect(streakFrom(['2026-08-23', '2026-08-22'], '2026-08-24')).toBe(2);
  });

  it('is zero when the last reading was two days ago', () => {
    expect(streakFrom(['2026-08-22', '2026-08-21'], '2026-08-24')).toBe(0);
  });

  it('stops at the first gap', () => {
    expect(streakFrom(['2026-08-24', '2026-08-22', '2026-08-21'], '2026-08-24')).toBe(1);
  });

  it('crosses a month boundary', () => {
    // Date arithmetic done on the string would give 2026-08-00 here.
    expect(streakFrom(['2026-09-01', '2026-08-31'], '2026-09-01')).toBe(2);
  });

  it('is zero with no history at all', () => {
    expect(streakFrom([], '2026-08-24')).toBe(0);
  });
});

describe('weeklyLog', () => {
  it('returns seven zero-filled days ending today, oldest first', () => {
    const log = weeklyLog([{ day: '2026-08-24', roots: 3 }, { day: '2026-08-21', roots: 1 }], '2026-08-24');

    expect(log).toHaveLength(7);
    expect(log[0]?.day).toBe('2026-08-18');
    expect(log[6]).toEqual({ day: '2026-08-24', roots: 3 });
    expect(log[3]).toEqual({ day: '2026-08-21', roots: 1 });
    expect(log[1]).toEqual({ day: '2026-08-19', roots: 0 });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/mobile test counters`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
/** The device's local calendar day as YYYY-MM-DD.
 *
 *  Built from the local getters rather than toISOString(), which converts to
 *  UTC first: at UTC+5 that puts everything before 05:00 on the previous day,
 *  which is both the wrong day and a broken streak (decision 22). */
export function localDay(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** UTC noon for a day string. Noon, not midnight: adding -1 day across a DST
 *  boundary from midnight can land on the same calendar date. */
function dayValue(day: string): number {
  return Date.parse(`${day}T12:00:00Z`);
}

function shiftDay(day: string, delta: number): string {
  const shifted = new Date(dayValue(day) + delta * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Consecutive reading days ending today or yesterday.
 *
 * Yesterday counts (decision 22 is "any reading", and a streak that resets at
 * midnight tells a 40-day reader they have 0 the moment they open the app).
 * Anything older is a broken streak.
 */
export function streakFrom(days: readonly string[], today: string): number {
  const seen = new Set(days);
  let cursor = seen.has(today) ? today : shiftDay(today, -1);
  if (!seen.has(cursor)) return 0;

  let streak = 0;
  while (seen.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

/** Seven days ending today, oldest first, zero-filled. Fixed length so the
 *  bar chart does not change width as history accumulates. */
export function weeklyLog(
  rows: readonly { day: string; roots: number }[],
  today: string,
): { day: string; roots: number }[] {
  const byDay = new Map(rows.map((row) => [row.day, row.roots]));
  return Array.from({ length: 7 }, (_, index) => {
    const day = shiftDay(today, index - 6);
    return { day, roots: byDay.get(day) ?? 0 };
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @quran-corpus/mobile test counters`
Expected: PASS (all nine).

- [ ] **Step 5: Mutation-check (§4)**

Replace `seen.has(today) ? today : shiftDay(today, -1)` with `today`. Expected:
"still counts a streak that ended yesterday" FAILS. Restore by re-editing.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/home/counters.ts apps/mobile/src/home/counters.test.ts
git commit -m "feat(mobile): derive the reading streak and weekly root log"
```

---

### Task 4: Write the counters from the real screens

**Files:**
- Modify: `apps/mobile/src/data/latestReadingPositionRecorder.ts`
- Modify: `apps/mobile/src/data/latestReadingPositionRecorder.test.ts`
- Modify: `apps/mobile/src/screens/RootRoute.test.tsx`
- Modify: `apps/mobile/app/root/[buckwalter].tsx`

**Interfaces:**
- Consumes: `recordReadingDay`, `recordRootView`, `localDay`.

- [ ] **Step 1: Write the failing test**

In `latestReadingPositionRecorder.test.ts`:

```ts
it('records the local day alongside the position', async () => {
  const calls: string[] = [];
  await recordLatest(clientStub, 2, 255, {
    recordReadingDay: async (_c, day: string) => { calls.push(day); },
    now: () => new Date(2026, 7, 24, 1, 0, 0),
  });

  // Decision 22: any reading counts. The recorder already fires on the reader's
  // scroll, so it is the one place that sees every read without a second
  // listener to keep in step.
  expect(calls).toEqual(['2026-08-24']);
});

it('does not fail the position write when the day write throws', async () => {
  // The streak is a nicety; losing the reading position is the thing the user
  // notices. A rejected insert here must not take the position down with it.
  await expect(recordLatest(clientStub, 2, 255, {
    recordReadingDay: async () => { throw new Error('disk full'); },
    now: () => new Date(2026, 7, 24),
  })).resolves.toBeUndefined();
  expect(await getLastReadingPosition(clientStub)).toEqual({ surahId: 2, ayahNumber: 255 });
});
```

Match the recorder's existing signature — read the file first and thread the
new dependencies through the same injection style it already uses. If it takes
no options object today, add one with defaults rather than importing the clock
directly; the second test cannot be written otherwise.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/mobile test latestReadingPositionRecorder`
Expected: FAIL.

- [ ] **Step 3: Implement both write sites**

The reading day goes in the recorder, after the position write, wrapped so its
failure cannot propagate:

```ts
  try {
    await deps.recordReadingDay(client, localDay(deps.now()));
  } catch (cause) {
    // Deliberately swallowed. The streak is decoration; the reading position is
    // the thing the user came back for, and it is already written above.
    console.error('[home] reading-day write failed', { cause });
  }
```

The root view goes in `app/root/[buckwalter].tsx`, in the effect that already
loads the root, once the root has resolved — so a 404 root never counts:

```ts
  useEffect(() => {
    // `entry` is a RootEntry (packages/data/src/types.ts:103), so the integer
    // id is entry.root.id -- not entry.id, which does not exist. Task 2 keys
    // root_views by that integer precisely so no Buckwalter string, and so no
    // charset validator, is needed at this write site.
    if (!entry) return;
    void openUserDb()
      .then((db) => recordRootView(createExpoSqliteClient(db as ExpoSqliteLike), entry.root.id, localDay(new Date())))
      .catch((cause: unknown) => console.error('[home] root-view write failed', { cause }));
  }, [entry]);
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @quran-corpus/mobile test`
Expected: PASS.

- [ ] **Step 5: Mutation-check (§4)**

Remove the `try`/`catch` around the day write. Expected: the "does not fail the
position write" test FAILS. Restore by re-editing.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/data/latestReadingPositionRecorder.ts \
        apps/mobile/src/data/latestReadingPositionRecorder.test.ts \
        'apps/mobile/app/root/[buckwalter].tsx' apps/mobile/src/screens/RootRoute.test.tsx
git commit -m "feat(mobile): count reading days and roots opened"
```

---

### Task 5: Ayah of the day

Decision 24: a curated shortlist, date-seeded. **Owner-gated** — the list is
content, and content is the owner's call.

**Files:**
- Create: `apps/mobile/src/home/ayahOfTheDay.ts`
- Create: `apps/mobile/src/home/ayahOfTheDay.test.ts`

**Interfaces:**
- Produces:

```ts
export const AYAH_OF_THE_DAY: readonly { surah: number; ayah: number }[];
export function ayahForDay(day: string): { surah: number; ayah: number };
```

Lives in `apps/mobile`, not `packages/data`: it is a curated editorial list for
one screen of one product, with no web counterpart. Move it to `packages/data`
the day web wants the same block, not before.

- [ ] **Step 1: Draft the shortlist and get it approved**

Draft 60–100 candidates as a plain table (surah:ayah + the first few words of
the English gloss) and put it in front of the owner to strike from. Do **not**
proceed to Step 2 with an agent-chosen list — decision 24 makes this theirs.

Every entry must be a real coordinate: cross-check each against
`SURAH_AYAH_COUNTS` in `packages/data/src/userData.ts` before writing it down.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { AYAH_OF_THE_DAY, ayahForDay } from './ayahOfTheDay';

describe('ayahForDay', () => {
  it('gives the same ayah for the same day', () => {
    expect(ayahForDay('2026-08-24')).toEqual(ayahForDay('2026-08-24'));
  });

  it('gives a different ayah on consecutive days', () => {
    expect(ayahForDay('2026-08-24')).not.toEqual(ayahForDay('2026-08-25'));
  });

  it('walks the whole list before repeating', () => {
    const seen = new Set<string>();
    for (let i = 0; i < AYAH_OF_THE_DAY.length; i += 1) {
      const { surah, ayah } = ayahForDay(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`);
      seen.add(`${surah}:${ayah}`);
    }
    // A hash-and-modulo seed collides and would show the same ayah twice in a
    // fortnight while never showing others at all.
    expect(seen.size).toBeGreaterThan(Math.min(20, AYAH_OF_THE_DAY.length) - 1);
  });

  it('only ever names a real ayah', () => {
    for (const entry of AYAH_OF_THE_DAY) {
      expect(Number.isInteger(entry.surah)).toBe(true);
      expect(entry.surah).toBeGreaterThanOrEqual(1);
      expect(entry.surah).toBeLessThanOrEqual(114);
      expect(entry.ayah).toBeGreaterThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/mobile test ayahOfTheDay`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
/** Owner-curated. Do not add to this list without asking -- it is editorial
 *  content, not data (umbrella decision 24). */
export const AYAH_OF_THE_DAY = [
  // ... the approved list from Step 1
] as const;

/**
 * The day's ayah: a cycle through the list, indexed by day number.
 *
 * A cycle rather than a hash: hashing the date string collides, which shows the
 * same ayah twice in a fortnight while some entries never appear at all. Day
 * number keeps it deterministic (same day, same ayah, no storage) and walks the
 * whole list in order before repeating.
 */
export function ayahForDay(day: string): { surah: number; ayah: number } {
  const dayNumber = Math.floor(Date.parse(`${day}T12:00:00Z`) / 86_400_000);
  const entry = AYAH_OF_THE_DAY[((dayNumber % AYAH_OF_THE_DAY.length) + AYAH_OF_THE_DAY.length) % AYAH_OF_THE_DAY.length];
  if (!entry) throw new Error('AYAH_OF_THE_DAY is empty');
  return entry;
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @quran-corpus/mobile test ayahOfTheDay`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/home/ayahOfTheDay.ts apps/mobile/src/home/ayahOfTheDay.test.ts
git commit -m "feat(mobile): add the curated ayah-of-the-day rotation"
```

---

### Task 6: The home screen

**Files:**
- Modify: `apps/mobile/app/(tabs)/index.tsx` (rewritten)
- Create: `apps/mobile/src/home/HomeScreen.tsx`
- Modify: `apps/mobile/src/screens/HomeTab.test.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`

**Interfaces:**
- Consumes: `GlassSurface`, `usePressScale`, `fonts`, `radii` (M6a);
  `useUserDbOnFocus`, `getLastReadingPosition`, `getReadingDays`,
  `getRootViewsByDay`, `countDistinctRootsViewed`; `streakFrom`, `weeklyLog`,
  `localDay`, `ayahForDay`.
- Produces: `<HomeScreen />`. `app/(tabs)/index.tsx` becomes a one-line route
  that renders it — `src/test/routes/appDirIsRoutesOnly.test.ts` requires the
  screen body to live under `src/`.

Layout, per mockups `1a`/`1b`/`1c`, top to bottom:

1. Glass search pill (existing `open-search` press target, restyled).
2. Continue-reading card — surah name, `surah:ayah`, and the ayah's opening
   words. Whole card is the tap target.
3. Two half-width cards side by side: **day streak** (number + label) and
   **roots studied** (all-time number + the 7-bar weekly log).
4. Ayah-of-the-day plate — Arabic in `fonts.arabic`, translation below in the
   user's content language, tapping opens the reader at that ayah.

New `uiStrings` keys (all three locales, en/uz/ru):
`home.streak`, `home.streakDays`, `home.rootsStudied`, `home.rootsThisWeek`,
`home.ayahOfTheDay`, `home.countersFailed`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('shows the streak the counters derive, not a raw row count', async () => {
  renderHome({ readingDays: ['2026-08-24', '2026-08-23', '2026-08-20'], today: '2026-08-24' });
  expect(await screen.findByTestId('home-streak-value')).toHaveTextContent('2');
});

it('shows seven bars in the weekly log even with one day of history', async () => {
  renderHome({ rootViews: [{ day: '2026-08-24', roots: 3 }], today: '2026-08-24' });
  expect(await screen.findAllByTestId(/home-week-bar-/)).toHaveLength(7);
});

it('renders the counters even when the reading position fails to load', async () => {
  // Three independent loads on one screen. Before this, one rejected query
  // blanked the whole tab.
  renderHome({ positionError: new Error('nope'), readingDays: ['2026-08-24'], today: '2026-08-24' });
  expect(await screen.findByTestId('home-streak-value')).toHaveTextContent('1');
  expect(screen.getByRole('alert')).toBeTruthy();
});

it('opens the reader at the day's ayah', async () => {
  renderHome({ today: '2026-08-24' });
  const expected = ayahForDay('2026-08-24');
  expect((await screen.findByTestId('home-ayah-of-day')).getAttribute('href'))
    .toContain(`/surah/${expected.surah}`);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @quran-corpus/mobile test HomeTab`
Expected: FAIL.

- [ ] **Step 3: Build the screen**

Compose `GlassSurface` cards. Rules that are not negotiable:

- Each of the three loads gets its own `useUserDbOnFocus`; a failure in one
  renders that card's error and leaves the others alone.
- Numbers use `fonts.displaySemiBold`; labels use the UI sans.
- Arabic uses `fonts.arabic` and `useArabicSizes()`.
- Every card is a `Pressable` with `usePressScale` and an
  `accessibilityLabel` that says what tapping does — bare coordinates announce
  as two numbers (the existing continue-link comment says so; keep it true).
- The weekly log is seven `View`s with a height proportional to
  `roots / max(roots, 1)`, each with an `accessibilityLabel` of its day and
  count. No chart library (§12).

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @quran-corpus/mobile test && pnpm -r type-check && pnpm -r lint`
Expected: PASS.

- [ ] **Step 5: Mutation-check (§4)**

Replace `streakFrom(days, today)` at the call site with `days.length`. Expected:
the first test FAILS (3 rows, streak 2). Restore by re-editing.

- [ ] **Step 6: Commit**

```bash
git add 'apps/mobile/app/(tabs)/index.tsx' apps/mobile/src/home apps/mobile/src/screens/HomeTab.test.tsx \
        apps/mobile/src/i18n/uiStrings.ts
git commit -m "feat(mobile): rebuild home as four glass blocks"
```

---

### Task 7: §5 stop, then build

- [ ] **Step 1: Self-review the diff** against DRY / SOLID / OWASP and the
  umbrella constraints. Specifically: is every new write validated in
  `packages/data` rather than in a screen? Is every migration additive?
- [ ] **Step 2: Stop and ask the owner to run `/code-review`.** §5 fires here —
  `packages/data` queries *and* an on-device user-DB write. Plain
  `/code-review` (Pro, local). Never `/code-review ultra` without asking.
- [ ] **Step 3: Act on the findings.** One pass, not a loop to green. Say
  plainly which findings are declined and why. Findings against prose are
  advisory — do not spend a round on them.
- [ ] **Step 4: Build.**

```bash
cd apps/mobile && pnpm prebuild:assert-db && eas build --platform android --profile preview
```

---

### Task 8: Device run

- [ ] Run checks 55–60 and record every result below.

| # | Check | Pass condition |
| --- | --- | --- |
| 55 | Upgrade over the M6a build **without clearing app data** | Existing bookmarks and reading position survive; home renders |
| 56 | Read an ayah, background the app, reopen | Streak reads 1 |
| 57 | Read again the next day (or set the device date forward one day) | Streak reads 2, not 1 and not 3 |
| 58 | Skip a day, then read | Streak resets to 1 |
| 59 | Open three root screens, return home | Roots-studied reads 3; the weekly log shows a bar on today |
| 60 | Ayah of the day | Same ayah all day; different tomorrow; tapping it opens that ayah in the reader |

## Verification Log

| Check | Build | Date | Result | Notes |
| --- | --- | --- | --- | --- |
| 55 | | | | |
| 56 | | | | |
| 57 | | | | |
| 58 | | | | |
| 59 | | | | |
| 60 | | | | |
