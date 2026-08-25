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

- [x] **Step 1: Write the failing test**

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

- [x] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/data test -t migrateUserDb`
Expected: FAIL — no such export.

- [x] **Step 3: Implement**

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

- [x] **Step 4: Call it on open**

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

- [x] **Step 5: Run the tests**

Run: `pnpm --filter @quran-corpus/data test && pnpm --filter @quran-corpus/mobile test`
Expected: PASS.

- [x] **Step 6: Mutation-check (§4)**

Change `if (migration.version <= current) continue;` to `if (false) continue;`
and re-run. Expected: no failure yet — migration 2 is `IF NOT EXISTS`. That is
the point of the fourth test: it FAILS, because a migration ran on a file
already at the current version. If it does not fail, the test is vacuous and
must be fixed before moving on (`[[sdd-brief-can-specify-vacuous-tests]]`).
Restore by re-editing.


**Deviations from this brief, taken during execution:**

- **Migrations hold `statements: readonly string[]`, not one `sql` string.**
  Both drivers execute a single statement -- libsql's `execute` rejects the
  rest, and `createExpoSqliteClient` routes through expo's `getAllAsync`, which
  prepares one. The brief's two-`CREATE TABLE` string would have created
  `reading_days` and silently skipped `root_views` on every device. A test
  asserts the one-statement-per-entry rule so the next migration cannot
  reintroduce it.
- **The brief's `newClient()` helper does not exist.** `userData.test.ts` has
  `recordingClient()`, a double with no SQLite in it, which cannot answer a
  `PRAGMA user_version` or show a table exists. These tests use
  `createDatabase('file::memory:')`, as every other suite in the package does.
- **The brief's fourth test was vacuous.** Its spy pushed only when the query
  was *not* a string, and every statement migrateUserDb runs is a string, so
  `applied` was `[]` no matter what the code did. It now records what reaches
  the driver and asserts no migration statement is among it -- and that is the
  test the Step 6 mutation kills (`[[sdd-brief-can-specify-vacuous-tests]]`).

Two additions beyond the brief, each with its own test and mutation-check: a
file from a *newer* build is returned as-is rather than stamped back down, and a
non-integer `user_version` is treated as 0 rather than left to poison every
comparison with NaN.

- [x] **Step 7: Commit**

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

- [x] **Step 1: Write the failing test**

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

- [x] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/data test -t 'reading days'`
Expected: FAIL — no such export.

- [x] **Step 3: Implement**

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

- [x] **Step 4: Run the tests**

Run: `pnpm --filter @quran-corpus/data test`
Expected: PASS.

- [x] **Step 5: Mutation-check (§4)**

Delete the `new Date(...)` line from `isIsoDay` and return the regex result.
Expected: the rejection test FAILS on `2026-13-01` and `2026-02-30`. Restore by
re-editing.


**Deviations from this brief, taken during execution**

- **`isIsoDay` as written throws instead of returning false.** `2026-13-01`
  parses to an Invalid Date, and `toISOString()` on one throws
  `RangeError: Invalid time value` -- so the predicate crashed on exactly the
  input it exists to reject, and every `if (isIsoDay(x))` caller would crash
  with it. A `Number.isNaN(parsed.getTime())` guard returns false instead. The
  brief's own rejection test could not see this: `recordReadingDay` rejects with
  a `RangeError` either way (`[[sdd-brief-can-specify-vacuous-tests]]` again).
  `isIsoDay` now has its own three tests, and mutation B below is the brief's
  original line.
- **`newClient()` still does not exist** (same as Task 1). These tests use a
  `migratedUserDb()` helper over `createDatabase('file::memory:')`, since the
  two tables only exist after `migrateUserDb` has run, and apply the schema with
  `executeMultiple` because `USER_DB_SCHEMA` is three statements.
- **Rejection tests assert no statement reached the driver**, via the existing
  `recordingProxy`, rather than only that a `RangeError` was thrown. A validator
  that throws *after* writing would pass the brief's version.

Three tests beyond the brief: a cutoff that is not an ISO day is rejected on the
read side too, `countDistinctRootsViewed` returns 0 rather than NaN on a file
with no views, and the leap day 2024-02-29 is accepted.

Mutations run, each killed, each restored by re-editing and verified identical
against a scratchpad copy:

- A: `isIsoDay` returns the regex result only -> 3 tests fail (both `isIsoDay`
  validity tests and the reading-day rejection test).
- B: drop the NaN guard, i.e. the brief's original line -> `returns false for an
  impossible date rather than throwing` fails with `RangeError: Invalid time value`.
- C: drop `assertIsoDay(sinceDay)` from `getReadingDays` -> `rejects a cutoff
  that is not an ISO day` fails.

Gates: lint clean, type-check clean, `pnpm -r test` = data 389, mobile-data 12,
web 479, mobile 507.

- [x] **Step 6: Commit**

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

- [x] **Step 1: Write the failing test**

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

- [x] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/mobile test counters`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

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

- [x] **Step 4: Run the tests**

Run: `pnpm --filter @quran-corpus/mobile test counters`
Expected: PASS (all nine).

- [x] **Step 5: Mutation-check (§4)**

Replace `seen.has(today) ? today : shiftDay(today, -1)` with `today`. Expected:
"still counts a streak that ended yesterday" FAILS. Restore by re-editing.

- [x] **Step 6: Commit**

```bash
git add apps/mobile/src/home/counters.ts apps/mobile/src/home/counters.test.ts
git commit -m "feat(mobile): derive the reading streak and weekly root log"
```

---


**Deviations from this brief, taken during execution**

- **The `localDay` test as written was vacuous.** This runner sits at
  `America/Chicago` (UTC-5), where `new Date(2026, 7, 24, 1, 0, 0)` is
  `2026-08-24T06:00Z` -- so a `toISOString().slice(0, 10)` implementation, the
  exact bug decision 22 is about, returns `'2026-08-24'` and the assertion
  passes. Verified directly in node. The test now pins `TZ=Asia/Tashkent` with
  `vi.stubEnv` (node honours a runtime `process.env.TZ` change) and asserts the
  UTC date is `2026-08-23` first, so it fails for that implementation on any
  machine, not only on a positive-offset one. Third brief in this phase to
  specify a test that cannot fail.
- The brief says "all nine"; it lists eight. Twelve shipped -- added digit
  padding for `localDay`, a year boundary for `streakFrom`, and two for
  `weeklyLog`: rows older than the window are dropped, and an empty history is
  seven zeroes rather than a short chart.
- `dayValue`'s comment justified midday UTC by DST. The arithmetic here is
  entirely UTC, where DST does not exist, so the comment now says what the hour
  is actually insurance against.
- No validation on `day` inputs: both callers are `localDay` and days already
  validated by `assertIsoDay` on the way into the user DB. A malformed day
  throws `RangeError` from `toISOString()` rather than returning a wrong number.
- Mutations run, each killed and restored byte-identically from a scratchpad
  copy (never `git restore`):
  - **A** (the brief's) -- `cursor = today` -> "still counts a streak that ended
    yesterday" fails.
  - **B** -- `localDay` via `toISOString()` -> the pinned-TZ test fails,
    `expected '2026-08-23' to be '2026-08-24'`. The brief's unpinned version
    survives this mutation here.
  - **C** -- `weeklyLog` keyed by `rows.slice(-7)` index instead of by day -> 2 fail.

Gate: lint clean, type-check clean, `pnpm -r test` = data 389, mobile-data 12,
web 479, mobile 519.

### Task 4: Write the counters from the real screens

**Files:**
- Modify: `apps/mobile/src/data/latestReadingPositionRecorder.ts`
- Modify: `apps/mobile/src/data/latestReadingPositionRecorder.test.ts`
- Modify: `apps/mobile/src/screens/RootRoute.test.tsx`
- Modify: `apps/mobile/app/root/[buckwalter].tsx`

**Interfaces:**
- Consumes: `recordReadingDay`, `recordRootView`, `localDay`.

- [x] **Step 1: Write the failing test**

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

- [x] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/mobile test latestReadingPositionRecorder`
Expected: FAIL.

- [x] **Step 3: Implement both write sites**

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

- [x] **Step 4: Run the tests**

Run: `pnpm --filter @quran-corpus/mobile test`
Expected: PASS.

- [x] **Step 5: Mutation-check (§4)**

Remove the `try`/`catch` around the day write. Expected: the "does not fail the
position write" test FAILS. Restore by re-editing.

- [x] **Step 6: Commit**

```bash
git add apps/mobile/src/data/latestReadingPositionRecorder.ts \
        apps/mobile/src/data/latestReadingPositionRecorder.test.ts \
        'apps/mobile/app/root/[buckwalter].tsx' apps/mobile/src/screens/RootRoute.test.tsx
git commit -m "feat(mobile): count reading days and roots opened"
```

---


**Deviations from this brief, taken during execution**

- **The recorder does not have the signature the brief assumed.**
  `latestReadingPositionRecorder` is
  `createLatestReadingPositionRecorder(persist, onError)` -- a serializing queue
  over an injected write, with no client, no surah id and no clock. There is no
  `recordLatest(client, surah, ayah, deps)` to extend. Adding a client and a
  clock to it to host the day write would have given a queue a second
  responsibility for the sake of a test.
- **Both writes went in at their call sites, and both existing route suites
  already had the mocks for them.** `SurahRoute.test.tsx` mocks
  `@/data/userRepository` and `@/data/userDb`, and drives the recorder through
  the mocked `SurahReader`; `RootRoute.test.tsx` mocks the same. So no new
  module, no options object, no default-dependency injection: the day write is
  in the `persist` closure in `app/surah/[surahId].tsx`, the root-view write is
  the effect in `app/root/[buckwalter].tsx`, and the tests assert through the
  mocks that already existed.
- The clock is not injected either. Both tests compute the expected day from
  `new Date()` the same way `localDay` does, which is a stronger assertion than
  a pinned fake would be: a UTC implementation still fails it on this runner
  between 19:00 and midnight, and it can never go stale.
- `src/test/routes/root.test.tsx` needed `@/data/userDb` and
  `@/data/userRepository` stubbed. It renders the same route, so the new import
  pulled real `expo-sqlite` into jsdom and the file failed to collect.
- Two tests beyond the brief on the root side: the id written is `entry.root.id`
  rather than any other integer on the entry, and a root the corpus does not
  carry is not counted at all.
- Mutations run, each killed and restored byte-identically from a scratchpad
  copy (never `git restore`):
  - **A** (the brief's) -- drop the `try`/`catch` around the day write -> "does
    not report a position failure when only the reading-day write throws" fails.
  - **B** -- `if (!entry) return` -> `entry?.root.id ?? 0` -> "does not count a
    root the corpus does not carry" fails.
  - **C** -- write `entry.root.occurrence_count` instead of `entry.root.id` ->
    "counts the root as viewed once it has resolved" fails.

Gate: lint clean, type-check clean, `pnpm -r test` = data 389, mobile-data 12,
web 479, mobile 523.

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

- [ ] **Step 1: Get the drafted shortlist approved**

The draft is written: `docs/design/m6/ayah-of-the-day-draft.md`, 118 candidates.
Every coordinate was validated against `surahs.ayah_count` in the live corpus DB
and every one has an English translation row, so none can render blank.

Take the owner's strike-through and use exactly what survives. Do **not** add to
it — decision 24 makes the list theirs. If an entry is added later, validate the
coordinate the same way first.

- [x] **Step 2: Write the failing test**

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

- [x] **Step 3: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/mobile test ayahOfTheDay`
Expected: FAIL — module not found.

- [x] **Step 4: Implement**

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

- [x] **Step 5: Run the tests**

Run: `pnpm --filter @quran-corpus/mobile test ayahOfTheDay`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add apps/mobile/src/home/ayahOfTheDay.ts apps/mobile/src/home/ayahOfTheDay.test.ts
git commit -m "feat(mobile): add the curated ayah-of-the-day rotation"
```

---


**Deviations from this brief, taken during execution**

- **Step 1 is not done, and it is the owner's to do.**
  `docs/design/m6/ayah-of-the-day-draft.md` is untouched since the M6a commit:
  all 118 `Keep` boxes are still `[ ]` and nothing is struck. The list shipped
  here is therefore the **full 118 candidates, pending the owner's
  strike-through**, and the module says so at the top. Deleting a line is all a
  strike takes. Decision 24 makes the selection editorial and the owner's, so
  nothing was added, reordered, or removed on the agent's judgement.
- Correctness was re-verified rather than taken from the draft's claim: all 118
  coordinates were re-queried against the live corpus DB (`apps/web/quran.db`).
  Every ayah exists and every one has an `en` translation row -- 0 missing, 0
  duplicate coordinates. That is correctness, not approval.
- The brief's third test asserts `seen.size > min(20, length) - 1` while looping
  `length` times over only 28 distinct day strings, so it never tested the
  property it describes. Replaced with the actual claim: over
  `AYAH_OF_THE_DAY.length` consecutive days every entry appears exactly once,
  plus a wrap test for the day after a full cycle.
- Three tests beyond the brief: the pre-1970 case the twice-modulo exists for,
  integer-ness of `ayah` (the brief checked it only for `surah`), and no
  duplicate coordinate in the list.
- Mutations run, each killed and restored byte-identically from a scratchpad
  copy (never `git restore`):
  - **A** -- single modulo -> "does not fall off the list for a day before 1970"
    fails.
  - **B** -- hash the date string instead of cycling -> 2 fail, which is the
    collision the doc comment describes.

Gate: lint clean, type-check clean, `pnpm -r test` = data 389, mobile-data 12,
web 479, mobile 530.

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

- [x] **Step 1: Write the failing tests**

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

- [x] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @quran-corpus/mobile test HomeTab`
Expected: FAIL.

- [x] **Step 3: Build the screen**

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

- [x] **Step 4: Run the tests**

Run: `pnpm --filter @quran-corpus/mobile test && pnpm -r type-check && pnpm -r lint`
Expected: PASS.

- [x] **Step 5: Mutation-check (§4)**

Replace `streakFrom(days, today)` at the call site with `days.length`. Expected:
the first test FAILS (3 rows, streak 2). Restore by re-editing.

- [x] **Step 6: Commit**

```bash
git add 'apps/mobile/app/(tabs)/index.tsx' apps/mobile/src/home apps/mobile/src/screens/HomeTab.test.tsx \
        apps/mobile/src/i18n/uiStrings.ts
git commit -m "feat(mobile): rebuild home as four glass blocks"
```

**Deviations from this brief, taken during execution**

- The brief cites `src/test/routes/appDirIsRoutesOnly.test.ts` as requiring the
  screen body under `src/`. It does not -- that test only bans *test* files
  under `app/`. The one-line route was kept anyway (it is the pattern
  `menu.tsx`/`MenuScreen.tsx` already established), but not for the stated
  reason.
- The brief's tests inject `today` through a `renderHome({ today })` option
  with no production counterpart -- a clock parameter on the screen for the
  tests' sake. Fixtures are computed from the real `localDay(new Date())`
  instead (the Task 4 pattern): a streak fixture pinned to 2026-08-24 would
  become a *broken* streak the day after this was written and every assertion
  would keep passing, against 0.
- The brief asserts an `href` on `home-ayah-of-day` while Step 3 requires every
  card to be a `Pressable` -- a Pressable has no href. The tests assert
  `router.push` instead.
- The brief's "Consumes" list carries no corpus read, but the layout needs the
  surah name, the ayah's opening words, and the day's ayah with its
  translation. `getAyahReaderLocation` (which existed with no production
  caller) gained the surah and became that reader; `useCorpusAyah` is a local
  hook over it. Its ceiling is commented: it loads a whole surah for one ayah.
- `getReadingDays(client, sinceDay)` takes a *window*, which the brief does not
  mention. A seven-day cutoff would silently cap a 40-day streak at 7, so the
  streak load asks for the whole history and a test pins that.
- The brief's bar height `roots / max(roots, 1)` is `1` for every non-empty
  day. Bars scale against the week's peak, and a test distinguishes the two.
- The streak and roots cards are not `Pressable`s: neither has a destination,
  and a button that does nothing announces worse to TalkBack than a labelled
  panel. Both are still labelled as one phrase ("Day streak: 2").
- `home.streakDays` was not added -- nothing renders it. The other five keys
  ship in all three locales.
- The brief's `toHaveTextContent` needs jest-dom, which is not installed;
  assertions read `.textContent`.
- `src/testing/rnHosts.ts` drops `onPressIn`/`onPressOut`. Home is the first
  screen to use `usePressScale` (M6a shipped it with no caller), and spreading
  them logs a React unknown-prop warning per card per render.

**Tests beyond the brief:** whole-history window; bars scale against the week's
peak; all-time roots rather than this week's; counters failing leaves the
reading position alone; the day's ayah is read from the corpus; the ayah card
survives a failed corpus read; search still opens; the saved position opens at
its own ayah. 14 in the suite, up from 2.

**Mutations run (§4):** A `streakFrom(...)` -> `days.length` (streak test
fails); B the brief's `roots / max(roots, 1)` bar formula (scaling test fails);
C the streak's window -> `weekStart(today)` (history-window test fails); D hide
the ayah card when its corpus read fails (tap-target test fails). All four
killed; `HomeScreen.tsx` restored from a scratchpad copy and `diff -q` clean.

**Gate:** lint clean, type-check clean, `pnpm -r test` = data 389, mobile-data
12, web 479, mobile 542.

---

### Task 7: §5 stop, then build

- [x] **Step 1: Self-review the diff** against DRY / SOLID / OWASP and the
  umbrella constraints. Specifically: is every new write validated in
  `packages/data` rather than in a screen? Is every migration additive?

  Done over `git diff main...HEAD`, 1915 insertions across 21 files. Findings:

  - **Writes are validated in `packages/data`.** `recordReadingDay` and
    `recordRootView` both `assertIsoDay`, and `recordRootView` range-checks the
    id (`1..MAX_ROOT_ID`, integer). Neither screen validates anything of its
    own: `app/surah/[surahId].tsx` passes `localDay(new Date())` and
    `app/root/[buckwalter].tsx` passes `entry.root.id`, an integer that only
    exists because the corpus resolved the root -- no Buckwalter string reaches
    a write, so there is no second charset validator to keep in step.
  - **Every migration is additive.** `USER_DB_MIGRATIONS` v2 is two
    `CREATE TABLE IF NOT EXISTS`; no `DROP`, no `UPDATE`, no rewrite. A file
    from a newer build is left alone rather than stamped back down.
  - **Injection.** Every value is a bound parameter. The one interpolation is
    `PRAGMA user_version = ${USER_DB_VERSION}`, which PRAGMA cannot
    parameterize; the value is computed in that module from the migration list
    and never comes from a caller. Commented as such.
  - **DRY.** No SQL in an app: `src/data/userRepository.ts` re-exports from
    `@quran-corpus/data/user-db`. The home screen composes `GlassSurface`,
    `usePressScale`, `useUserDbOnFocus`, `useListBottomPadding` and
    `getAyahReaderLocation` rather than growing its own.
  - **Nothing leaves the device** (decision 34): no telemetry call was added.
  - One accepted cost, commented at the call site rather than fixed:
    `getAyahReaderLocation` reads a whole surah to render one ayah. The upgrade
    is a by-coordinate query in `packages/data`, which is deliberately not
    being written on a hunch before the device run says the launch feels slow.
- [x] **Step 2: Stop and ask the owner to run `/code-review`.** §5 fires here —
  `packages/data` queries *and* an on-device user-DB write. Plain
  `/code-review` (Pro, local). Never `/code-review ultra` without asking.

  Run 2026-08-24 over `main...HEAD` (8 commits, 21 files). **No data-layer
  findings**: the reviewer re-derived the migration runner, both write paths and
  the `isIsoDay` NaN guard, mutation-checked those tests itself, and
  independently re-validated all 118 `AYAH_OF_THE_DAY` coordinates against
  `SURAH_AYAH_COUNTS`. All 8 findings are in the new Home UI.
- [x] **Step 3: Act on the findings.** One pass, not a loop to green. Say
  plainly which findings are declined and why. Findings against prose are
  advisory — do not spend a round on them.

  **Fixed (5):**

  - `WeekLog`'s row carried an `accessibilityLabel` without `accessible`, so RN
    never exposed it and the `home.rootsThisWeek` string was dead, while each of
    the seven bars announced a raw ISO date. Row is now one accessible node
    labelled with the week's total; the bars are decorative and keep their
    testIDs.
  - The counters rendered `0` for the whole first load, so a reader with a
    40-day streak was shown 0 on every launch — the wrong number, not an empty
    one. `CounterCard` takes `number | null` and shows `—` while loading.
  - `continueAyah.error` was discarded, so a corpus failure left an empty row
    where the surah name goes and a double-spaced a11y label, with nothing
    saying anything had failed. The card now takes the same `error` prop the
    ayah card already had, and the label is joined rather than interpolated.
  - `WEEK = 7` in the screen duplicated `weeklyLog`'s own `length: 7`: two
    copies of one window, where changing either would make the fetched range and
    the drawn range disagree with no test failing. `WEEK_DAYS` is exported from
    `counters.ts` and used by both.

  Three tests added (545 mobile, up from 542), each mutation-checked: restoring
  the labelled bars, the eager `0`, and the swallowed error each fails exactly
  one test. `HomeScreen.tsx` restored byte-identically after all three.

  **Declined (4):**

  - *No `accessibilityRole="header"` anywhere on the tab.* True, and it is a
    design decision, not an oversight: the redesign turned the old screen's
    "Continue reading" heading into an in-card caption, and every caption now
    sits inside a `Pressable` that RN collapses into a single a11y node — a
    header role in there would be just as unexposed as the WeekLog label was.
    Restoring heading navigation means adding a visible screen title, which is
    §8 owner territory, not a review fix. All four blocks are reachable in one
    swipe pass.
  - *`getAyahReaderLocation` returning `null` renders a silent blank forever.*
    The bundled corpus ships complete and all 118 coordinates were verified in
    range twice; distinguishing "missing row" from "still loading" costs a third
    state on a case that cannot currently occur. Revisit if a future build ever
    ships a partial DB.
  - *`ayahForDay` can throw during render on a device clock past year 9999.*
    The realistic bad clock is the other direction — an RTC reset to 1970 — and
    the twice-modulo already handles it, with a test. A throw for a year-10000
    clock is a loud failure for an impossible input; swapping it for a silent
    fallback to index 0 makes the real bug harder to find.
  - *The reading-day write sits inside the position-write callback, which
    short-circuits on the same ayah, so crossing midnight without scrolling
    skips a day.* Real, but absorbed: `streakFrom` counts a streak ending
    yesterday precisely so a day boundary does not zero a live streak, and any
    scroll to a different ayah records the day. Gating the insert behind a
    `lastRecordedDay` ref adds state to save one idempotent
    `INSERT OR IGNORE`.
- [x] **Step 4: Build.** EAS is unavailable until 2026-09-01, so this is very
  likely Expo Go again, as M6a's run was. If so, say so in the verification log
  rather than implying an APK, and note what a Go run cannot cover: Hermes and
  ProGuard behaviour, and the bundled DB asset path. **Check 55 is the one that
  suffers** — "upgrade over the M6a build without clearing app data" is a
  release-binary property, and Expo Go does not exercise it. Either defer 55
  until the build window opens, or run it as an approximation and mark it as
  one; do not tick it off a Go run.

```bash
cd apps/mobile && pnpm prebuild:assert-db && npx expo start --clear --lan
```

**No APK.** EAS is closed until 2026-09-01, so this is Expo Go over the LAN, as
M6a's run was -- same JS, same device, not a release binary. `prebuild:assert-db`
passed (`assets/db/quran.db`, 139,923,456 bytes) and the Android bundle built
clean: 2066 modules, 10,284,575 bytes of Hermes bytecode, no warnings.

Not covered by a Go run, and re-checked when the APK is built:

- **Release Hermes and ProGuard.** The Go bundle is Hermes, but a dev bundle:
  unminified, no shrinking, no `-keep` rules. Anything reflection-shaped that
  ProGuard could strip is untested.
- **The bundled DB asset path.** In Expo Go the 140MB corpus is served by Metro
  over the wire; in an APK it is packaged and resolved from the asset bundle.
  These are different code paths and only the first one runs here.
- **Check 55**, which is exactly the release-binary property: "upgrade over the
  M6a build without clearing app data". Expo Go never installs over anything.
  **Deferred to the build window, not approximated and not ticked.** The
  migration runner is additive-only and unit-tested, but that is evidence about
  the SQL, not about an upgrade install.

Launched on the owner's OnePlus 7 Pro (GM1917, Android, 1440x3120) over
adb-wifi at `6fdd970`, night theme. Home rendered on first paint -- search
field, continue card at Al-Baqara 2:1, both counters, the weekly log, and the
ayah-of-the-day card at Yunus 10:62. `logcat` clean: no JS exception, no
SQLite error. Check results are Task 8's, below.

`expo start` rewrites `apps/mobile/tsconfig.json` on launch (reformats it and
drops `expo-env.d.ts` from `include`). Reverted; it is Expo's doing, not a
change this milestone wants.

---

### Task 8: Device run

- [ ] Run checks 55–60 **and the carried-over check 48** , and record every
  result below.

Check 48 failed on M6a's device run and the owner parked it here rather than
opening a fix task there: the only `GlassSurface` in that build was the tab
pill, which floats below the bloom's reach with nothing behind it, so
translucency had nothing to show. This sub-phase puts real cards in the top half
of the home screen, over the wash -- the composition the glass tokens were
calibrated against. That is the honest test.

If it reads flat *there*, the tokens are wrong rather than the test surface, and
`expo-blur` returns as a live §12 dependency question (umbrella decision 8).
Stop and ask; do not install it.

| # | Check | Pass condition |
| --- | --- | --- |
| 48 (re-run) | The home cards, **both themes** | Cards read as translucent panels over the wash, not as flat rectangles; the hairline and the 1px top highlight are both visible at arm's length. **Fail = stop and ask about `expo-blur`** |
| 55 | Upgrade over the M6a build **without clearing app data** | Existing bookmarks and reading position survive; home renders |
| 56 | Read an ayah, background the app, reopen | Streak reads 1 |
| 57 | Read again the next day (or set the device date forward one day) | Streak reads 2, not 1 and not 3 |
| 58 | Skip a day, then read | Streak resets to 1 |
| 59 | Open three root screens, return home | Roots-studied reads 3; the weekly log shows a bar on today |
| 60 | Ayah of the day | Same ayah all day; different tomorrow; tapping it opens that ayah in the reader |

## Verification Log

| Check | Build | Date | Result | Notes |
| --- | --- | --- | --- | --- |
| 48 (re-run) | | | | |
| 55 | -- | -- | **deferred** | Release-binary property; Expo Go does not install over a prior build. Runs when EAS opens (2026-09-01) |
| 56 | | | | |
| 57 | | | | |
| 58 | | | | |
| 59 | | | | |
| 60 | | | | |
