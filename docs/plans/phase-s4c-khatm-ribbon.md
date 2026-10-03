# Phase S4c — Khatm Ribbon and the Font Stepper

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One ribbon marks where a khatm reading stopped, and the Arabic size is reachable from the reader and morphology kebabs instead of only from Settings.

**Architecture:** The mark is a single page number on the existing `reading_history` row — deliberate, moved only by a tap, and distinct from the automatic position that row already carries. The ribbon lives on the mushaf page it marks and is dropped from a button in the chrome. The size stepper reuses the `arabicScale` setting that Settings already writes, so there is one stored value and two ways in.

**Tech Stack:** `packages/data` (`userData.ts`) + expo-sqlite via `packages/mobile-data`, Reanimated 4.5.1 for the drop, existing `HeaderCard` actions curtain.

**Spec:** No separate spec. Owner rulings below, collected 2026-09-28 in session `session_019jJdHkf1ugay9RMWAkYPMy`. Independent of S4a and S4b — it can land before either, though the ribbon's visual check is easier once the spread exists.

---

## ⚠ This phase needs an independent review (§5)

Two of §5's three triggers fire:

- **It writes the on-device user DB.** That file lives on the owner's phone and survives app updates; a bad row is not fixed by shipping a new build. "We are pre-production" does not apply.
- **It validates input at a trust boundary** — a page number arriving from a pager index and from stored text.

So: after Task 2 and again after Task 3, **stop and ask the owner to run `/code-review`.** The agent cannot launch it (§4). Plain `/code-review` is Pro-included and runs locally; **`ultra` bills $5-25/run and must never be launched without asking.** One pass, not a loop to green: fix what is real, say plainly what is being declined and why.

## Global Constraints

- **Every migration is additive.** `ALTER TABLE ... ADD COLUMN` only. No rewrite, no drop, no backfill that touches existing values. An older build must still open a newer file.
- **One statement per `statements` entry** in `USER_DB_MIGRATIONS`. Both drivers execute a single statement — a multi-statement string creates its first object and silently skips the rest, on every device.
- The mark is **one** page. Setting it anywhere clears it everywhere else (R-C1).
- Mushaf gets **no kebab** (R-C5). The ribbon is a button beside search.
- Font stepper: reader and morphology only. **Not the mushaf** (R-C6) — its scale is per-page and band-constrained.
- Paper is clean at rest: no ribbon furniture on an unmarked page (R-C2).
- Reduced motion respected on the drop (§8). 48dp targets.
- `DB_SKIP_MIGRATIONS` convention: an idempotent data-only self-heal runs unconditionally in `db.ts`, never nested inside `runMigrations`. Nothing here needs one, but do not add one nested if that changes.
- Commits carry the `Co-Authored-By` / `Claude-Session` trailers.

## Owner rulings

| # | Ruling |
|---|---|
| R-C1 | One mark only, for resuming a khatm. Not a second bookmark list |
| R-C2 | Nothing at rest — paper stays clean; the control lives in the chrome |
| R-C3 | Mushaf page only. Not the reader |
| R-C4 | Stored as a column on `reading_history` |
| R-C5 | A ribbon button beside search. No kebab on the mushaf |
| R-C6 | Font size in the reader and morphology kebabs. That's it |
| R-C7 | Ribbon at top-left of the page; tap animates it downward and it takes a red colour |

### Rulings I made, with their cost

- **Top-left, as asked — recorded as a deliberate override.** In a mushaf the spine is on the **right**, so a real silk ribbon hangs from the top-right; top-left is the fore-edge. The owner named top-left explicitly and that is what ships. *Cost if wrong:* the ribbon reads as hanging off the open edge rather than the binding; one style constant flips it.
- **Deep madder crimson, not pure red.** Pure red fights the warm-paper palette and this app already uses red for danger (delete). A madder reads as silk. *Cost if wrong:* not the red the owner pictured; one token value.
- **`setKhatmPage` takes the page's first ayah too.** `reading_history` is a single row with `surah_id`/`ayah_number` `NOT NULL` and no defaults, so the first-ever write has to supply them. Taking them from the page being marked keeps the automatic position coherent instead of inventing a 1:1. *Cost if wrong:* a slightly larger signature than the feature needs.

## Traps

- **`reading_history` is one row, `CHECK (id = 1)`.** An `UPDATE` on a file where nothing has been read yet affects zero rows and silently does nothing. Upsert, and test the empty-table path first.
- **`startAyahNumber` is the ayah a page OPENS IN**, which for a page that opens mid-ayah is the previous page's ayah. To name a page's own first ayah use the row with `position === 1` (`mushaf-index-cannot-name-a-pages-first-ayah`).
- **A closing keyword in a commit body auto-closes issues, and the parser ignores negation.** Audit every `#NN` after a squash merge (`status-commit-body-autocloses-issues`).
- **`packages/data` compiles to `dist/`** and consumers import that, not `src/` — rebuild after every edit or "the fix does nothing live" is a false lead (`packages-data-stale-dist-gotcha`).
- **Regenerate `schema.generated.ts`** after a schema change or a schema mutation-check is vacuous (`never-git-stash-for-a-baseline`).
- **`withTiming` in a worklet restarts** — shared value + effect.

---

## File Structure

**New**
- `apps/mobile/src/components/mushaf/KhatmRibbon.tsx` — the ribbon and its drop animation.
- `apps/mobile/src/components/mushaf/KhatmRibbon.test.tsx`
- `apps/mobile/src/mushaf/useKhatmMark.ts` — read/write hook over the user DB.
- `apps/mobile/src/mushaf/useKhatmMark.test.ts`
- `apps/mobile/src/components/ArabicSizeStepper.tsx` — the kebab row.
- `apps/mobile/src/components/ArabicSizeStepper.test.tsx`

**Modified**
- `packages/data/src/userData.ts` — migration v5, `getKhatmPage`, `setKhatmPage`.
- `packages/data/tests/userData.test.ts`
- `apps/mobile/src/components/mushaf/MushafChrome.tsx:117` — ribbon button beside search.
- `apps/mobile/src/theme/tokens.ts` — the `ribbon` colour, both themes.
- `apps/mobile/src/components/ReaderHeader.tsx` — stepper in the curtain.
- `apps/mobile/app/morphology.tsx` — stepper in the curtain.

---

### Task 1: Migration and the typed accessors

**Files:**
- Modify: `packages/data/src/userData.ts`
- Modify: `packages/data/tests/userData.test.ts`

**Interfaces:**
- Consumes: `USER_PAGE_MIN`, `USER_PAGE_MAX`, `assertAyahCoordinate` — all already in this file. The existing test suite's helper is `migratedUserDb()` and the migration runner is `migrateUserDb(client)`; the position getter is `getLastReadingPosition(client)`. Use those names — do not invent `freshUserDb`, `runMigrations` or `getReadingPosition`.
- Produces:
  - `getKhatmPage(client: QueryClient): Promise<number | null>`
  - `setKhatmPage(client: QueryClient, input: { page: number | null; surahId: number; ayahNumber: number }): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
describe('khatm mark', () => {
  it('is null on a fresh database', async () => {
    const db = await migratedUserDb();
    await expect(getKhatmPage(db)).resolves.toBeNull();
  });

  it('writes and reads back a page', async () => {
    const db = await migratedUserDb();
    await setKhatmPage(db, { page: 123, surahId: 2, ayahNumber: 260 });
    await expect(getKhatmPage(db)).resolves.toBe(123);
  });

  it('writes on a database where nothing has been read yet', async () => {
    // reading_history is a single row with CHECK (id = 1) and NOT NULL
    // coordinates. An UPDATE here touches zero rows and silently does nothing,
    // which is the shape of bug that looks like "the ribbon does not stick".
    const db = await migratedUserDb();
    await setKhatmPage(db, { page: 5, surahId: 1, ayahNumber: 1 });
    await expect(getKhatmPage(db)).resolves.toBe(5);
  });

  it('replaces the previous mark rather than adding one', async () => {
    // R-C1: exactly one mark.
    const db = await migratedUserDb();
    await setKhatmPage(db, { page: 5, surahId: 1, ayahNumber: 1 });
    await setKhatmPage(db, { page: 300, surahId: 25, ayahNumber: 1 });
    await expect(getKhatmPage(db)).resolves.toBe(300);
  });

  it('clears the mark on null', async () => {
    const db = await migratedUserDb();
    await setKhatmPage(db, { page: 5, surahId: 1, ayahNumber: 1 });
    await setKhatmPage(db, { page: null, surahId: 1, ayahNumber: 1 });
    await expect(getKhatmPage(db)).resolves.toBeNull();
  });

  it('does not disturb the automatic reading position', async () => {
    // The two values share a row and mean different things: one moves as you
    // scroll, one only when you tap. A write that clobbers the other is a
    // silent data loss on a file that survives app updates.
    const db = await migratedUserDb();
    await recordReadingPosition(db, { surahId: 2, ayahNumber: 255, page: 42 });
    await setKhatmPage(db, { page: 123, surahId: 2, ayahNumber: 255 });
    await expect(getLastReadingPosition(db)).resolves.toEqual({ surahId: 2, ayahNumber: 255, page: 42 });
    await expect(getKhatmPage(db)).resolves.toBe(123);
  });

  it('does not let the automatic position clear the mark', async () => {
    // The other direction, which is the one that actually bites: every scroll
    // calls recordReadingPosition, so an upsert there that omits khatm_page
    // wipes the ribbon on the next swipe.
    const db = await migratedUserDb();
    await setKhatmPage(db, { page: 123, surahId: 2, ayahNumber: 255 });
    await recordReadingPosition(db, { surahId: 3, ayahNumber: 1, page: 50 });
    await expect(getKhatmPage(db)).resolves.toBe(123);
  });

  it('rejects a page outside the mushaf', async () => {
    // The page comes from a pager index; nothing upstream range-checks it, and
    // INTEGER accepts every wrong value there is. Last boundary before a file
    // that survives app updates.
    const db = await migratedUserDb();
    for (const page of [0, 605, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(setKhatmPage(db, { page, surahId: 1, ayahNumber: 1 })).rejects.toThrow(RangeError);
    }
    await expect(getKhatmPage(db)).resolves.toBeNull();
  });

  it('rejects a bad ayah coordinate', async () => {
    const db = await migratedUserDb();
    await expect(setKhatmPage(db, { page: 5, surahId: 115, ayahNumber: 1 })).rejects.toThrow();
    await expect(setKhatmPage(db, { page: 5, surahId: 1, ayahNumber: 0 })).rejects.toThrow();
  });

  it('survives the migration running twice', async () => {
    // Every open applies the schema and the migrations. ADD COLUMN throws on
    // the second run, and a caught-and-ignored throw is indistinguishable from
    // a migration that did nothing.
    const db = await migratedUserDb();
    await setKhatmPage(db, { page: 77, surahId: 4, ayahNumber: 1 });
    await migrateUserDb(db);
    await expect(getKhatmPage(db)).resolves.toBe(77);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/data && npx vitest run tests/userData.test.ts`
Expected: FAIL — `getKhatmPage` is not exported.

- [ ] **Step 3: Implement**

Append to `USER_DB_MIGRATIONS` (current highest version is 4, so this is 5) — one statement per entry.

`USER_DB_VERSION` is `USER_DB_MIGRATIONS.length + 1`, so it bumps itself when the entry is added. **Do not touch it**, and do not hardcode a version anywhere — `migrateUserDb` compares against it and returns early when the file is already current.

```ts
  {
    version: 5,
    statements: [
      // The khatm mark: where a reader deliberately stopped, as against the
      // automatic position in the same row. Nullable with no default, so an
      // existing row keeps meaning "no mark" without being rewritten.
      `ALTER TABLE reading_history ADD COLUMN khatm_page INTEGER`,
    ],
  },
```

```ts
/**
 * The deliberate reading mark -- the ribbon -- or null when none is set.
 *
 * Distinct from `getReadingPosition`, which moves on its own as the reader
 * scrolls. This one moves only when someone taps the ribbon, which is what
 * makes it usable for a khatm across days.
 */
export async function getKhatmPage(client: QueryClient): Promise<number | null> {
  const rows = await client.execute(`SELECT khatm_page FROM reading_history WHERE id = 1`);
  const value = rows.rows[0]?.['khatm_page'];
  return value === null || value === undefined ? null : Number(value);
}

export interface KhatmPageInput {
  /** 1..604, or null to lift the ribbon. */
  page: number | null;
  /** The marked page's own first ayah. Required because `reading_history` has
   *  NOT NULL coordinates and no defaults, so the first write to a database
   *  where nothing has been read has to supply them -- and taking them from the
   *  page being marked keeps the row coherent instead of inventing 1:1. */
  surahId: number;
  ayahNumber: number;
}

export async function setKhatmPage(
  client: QueryClient,
  { page, surahId, ayahNumber }: KhatmPageInput,
): Promise<void> {
  assertAyahCoordinate(surahId, ayahNumber);
  if (page !== null && (!Number.isInteger(page) || page < USER_PAGE_MIN || page > USER_PAGE_MAX)) {
    throw new RangeError(
      `khatm page must be an integer in ${USER_PAGE_MIN}..${USER_PAGE_MAX} or null, got ${String(page)}`,
    );
  }

  // Upsert, not UPDATE: the row does not exist until something has been read,
  // and an UPDATE would affect zero rows and report success.
  await client.execute({
    sql: `INSERT INTO reading_history (id, surah_id, ayah_number, khatm_page)
          VALUES (1, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET khatm_page = excluded.khatm_page`,
    args: [surahId, ayahNumber, page],
  });
}
```

Note what the `DO UPDATE` deliberately does **not** touch: `surah_id`, `ayah_number`, `updated_at`. Dropping the ribbon must not move the automatic position. Confirm `recordReadingPosition`'s own upsert likewise does not mention `khatm_page` — if it uses `INSERT OR REPLACE`, it will wipe the mark on every scroll, and that must be changed to an explicit `ON CONFLICT ... DO UPDATE` naming only the position columns.

- [ ] **Step 4: Run the tests and rebuild `dist/`**

```bash
cd packages/data && npx vitest run && npx tsc --noEmit && pnpm build
```
Expected: PASS. The build is not optional — `apps/mobile` imports the compiled output.

Regenerate `schema.generated.ts` if this repo's generator covers the user DB, or the schema mutation-check below is vacuous.

- [ ] **Step 5: Mutation-check**

- Delete the `page` range check → the out-of-range test must FAIL.
- Delete the `assertAyahCoordinate` call → the bad-coordinate test must FAIL.
- Change `ON CONFLICT(id) DO UPDATE SET khatm_page = excluded.khatm_page` to `INSERT OR REPLACE` → "does not disturb the automatic reading position" must FAIL.
- Change version 5 to 4 → the run-twice test must FAIL.

Restore each by editing or from a scratchpad copy. **Never** `git checkout`/`git restore` a mutation edit. If `__pycache__`-style staleness applies anywhere in the loop, remember a same-size same-second edit can leave stale bytecode running the mutant.

- [ ] **Step 6: Commit, then stop**

```bash
git add packages/data/src/userData.ts packages/data/tests/userData.test.ts
git commit -m "feat(data): store a deliberate khatm page beside the automatic position"
```

**Stop here and ask the owner to run `/code-review`** (§5: `packages/data` + input validation + on-device DB write — all three triggers). Act on the findings before Task 2.

---

### Task 2: The mark, wired to the app

**Files:**
- Create: `apps/mobile/src/mushaf/useKhatmMark.ts`
- Create: `apps/mobile/src/mushaf/useKhatmMark.test.ts`

**Interfaces:**
- Consumes: `getKhatmPage`, `setKhatmPage` from `@quran-corpus/data/user-db`.
- Produces: `useKhatmMark(): { markedPage: number | null; mark: (page: number, firstAyah: { surahId: number; ayahNumber: number }) => Promise<void>; lift: () => Promise<void>; loading: boolean }`

Import from `@quran-corpus/data/user-db` — **not** the barrel (which drags libsql) and **not** `./mobile` (which is the read-only subset). `./user-db` is the write-capable leaf with no runtime imports, which is why it exists (§2).

- [ ] **Step 1: Write the failing test**

```ts
  it('reports no mark before anything is stored', async () => {
    const { result } = renderHook(() => useKhatmMark(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.markedPage).toBeNull();
  });

  it('marks a page and reports it without a reload', async () => {
    // The ribbon has to appear on the tap, not on the next mount -- otherwise
    // the animation plays against a page that still looks unmarked.
    const { result } = renderHook(() => useKhatmMark(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.mark(123, { surahId: 2, ayahNumber: 260 }));
    expect(result.current.markedPage).toBe(123);
  });

  it('moves the mark rather than keeping both', async () => {
    const { result } = renderHook(() => useKhatmMark(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.mark(5, { surahId: 1, ayahNumber: 1 }));
    await act(() => result.current.mark(300, { surahId: 25, ayahNumber: 1 }));
    expect(result.current.markedPage).toBe(300);
  });

  it('lifts the mark', async () => {
    const { result } = renderHook(() => useKhatmMark(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.mark(5, { surahId: 1, ayahNumber: 1 }));
    await act(() => result.current.lift());
    expect(result.current.markedPage).toBeNull();
  });

  it('keeps the previous mark when a write rejects', async () => {
    // An optimistic update that does not roll back shows a ribbon the database
    // does not have, and it survives until the next mount.
    const { result } = renderHook(() => useKhatmMark(), { wrapper: failingWriteWrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.mark(5, { surahId: 1, ayahNumber: 1 }).catch(() => {}));
    expect(result.current.markedPage).toBeNull();
  });

  it('loading means nothing-to-show-yet, not no-mark', async () => {
    // A ribbon that renders "unmarked" during the read flashes off and on at
    // every mount -- the same class as the bookmark delete jump.
    const { result } = renderHook(() => useKhatmMark(), { wrapper });
    expect(result.current.loading).toBe(true);
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/mobile && npx vitest run src/mushaf/useKhatmMark.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

State + the two writers, optimistic with a rollback on rejection. Gate the consumer on `loading` — do not let module state be the only writer of what the UI reads (`module-state-needs-a-second-writer`).

- [ ] **Step 4: Run the tests**

Run: `cd apps/mobile && npx vitest run src/mushaf && npx tsc --noEmit`
Expected: PASS. Confirm the client-entry and mobile-entry guard tests still pass — they exist precisely to catch an import from the wrong entry point, and must not be weakened.

- [ ] **Step 5: Mutation-check**

Remove the rollback: the reject test must FAIL. Initialise `loading` to `false`: the loading test must FAIL. Restore by editing.

- [ ] **Step 6: Commit, then stop**

```bash
git add apps/mobile/src/mushaf/useKhatmMark.ts apps/mobile/src/mushaf/useKhatmMark.test.ts
git commit -m "feat(mobile/mushaf): read and write the khatm mark"
```

**Second `/code-review` checkpoint** — this is the write path as the app actually calls it. Ask the owner; do not launch it yourself.

---

### Task 3: The ribbon

**Files:**
- Create: `apps/mobile/src/components/mushaf/KhatmRibbon.tsx`
- Create: `apps/mobile/src/components/mushaf/KhatmRibbon.test.tsx`
- Modify: `apps/mobile/src/theme/tokens.ts`
- Modify: `apps/mobile/src/components/mushaf/MushafChrome.tsx:117`

**Interfaces:**
- Consumes: `useKhatmMark`; `themeColors.*.ribbon`.
- Produces: `<KhatmRibbon marked={boolean} reduceMotion={boolean} />` — draws nothing when `marked` is false.

- [ ] **Step 1: Write the failing test**

```tsx
  it('draws nothing on an unmarked page', () => {
    // R-C2: paper is clean at rest. A faint stub on all 604 pages is 604
    // pieces of furniture on the one surface the design treats as paper.
    render(<KhatmRibbon marked={false} reduceMotion={false} />);
    expect(screen.queryByTestId('khatm-ribbon')).toBeNull();
  });

  it('draws the ribbon on the marked page in the ribbon colour', () => {
    render(<KhatmRibbon marked reduceMotion={false} />);
    const ribbon = screen.getByTestId('khatm-ribbon');
    expect(ribbon.style.backgroundColor).toBe(themeColors.light.ribbon);
  });

  it('hangs from the top leading corner', () => {
    // R-C7: top-left, as asked. Recorded as a deliberate override -- the spine
    // of a mushaf is on the right, so a real ribbon would hang top-right.
    render(<KhatmRibbon marked reduceMotion={false} />);
    const ribbon = screen.getByTestId('khatm-ribbon');
    expect(ribbon.style.position).toBe('absolute');
    expect(ribbon.style.top).toBe('0px');
    expect(ribbon.style.left).toBe('0px');
  });

  it('drops downward when it becomes marked', () => {
    // The animation is the feedback for the tap. Seeded from the prop, so it
    // must start above its resting place and settle down to it.
    const { rerender } = render(<KhatmRibbon marked={false} reduceMotion={false} />);
    rerender(<KhatmRibbon marked reduceMotion={false} />);
    expect(dropTargetOf(screen.getByTestId('khatm-ribbon'))).toBeGreaterThan(0);
  });

  it('appears without animating under reduced motion', () => {
    // §8. The mark is the function; the drop is the flourish.
    render(<KhatmRibbon marked reduceMotion />);
    expect(screen.getByTestId('khatm-ribbon').style.transform).toBe('');
  });

  it('is not an accessibility node of its own', () => {
    // It is decoration for state the chrome button already announces. A second
    // node repeats it, and `accessible` on the container would hide children
    // from TalkBack with no test able to see it.
    render(<KhatmRibbon marked reduceMotion={false} />);
    expect(screen.getByTestId('khatm-ribbon').getAttribute('aria-hidden')).toBe('true');
  });
```

The drop assertion must read a **stable** shared value — verify the Reanimated test shim returns the same box across renders before trusting it, or this test passes whatever the component does (`reanimated-shim-hands-back-a-fresh-box`).

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/mobile && npx vitest run src/components/mushaf/KhatmRibbon.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Add the token**

In `tokens.ts`, both themes:

```ts
  /** The khatm ribbon. A deep madder rather than a pure red: red is this app's
   *  danger colour (delete is a red fill) and a saturated red fights warm
   *  paper. Madder reads as silk. */
  ribbon: '#A8323C',   // light
  ribbon: '#C4515A',   // dark -- lifted, because a deep madder on night paper
                       // reads as brown
```

Use the existing palette discipline: measure the token against its **worst** call site — a same-hue tint, not the page — and nothing may paint behind it (`palette-calibrate-against-worst-call-site`). The worst site here is the printed page's own off-white.

- [ ] **Step 4: Implement the ribbon and the chrome button**

The ribbon: an absolutely-positioned strip at the page's top-left with a notched tail (two triangles, or a `borderBottomWidth` trick — no SVG needed for a notch). `aria-hidden`. Animate `translateY` from a shared value **set in an effect**, never `withTiming` in a worklet, and skip the animation under `reduceMotion`.

The chrome button in `MushafChrome.tsx`, beside `SearchHeaderButton`: `testID="mushaf-ribbon-button"`, 48dp target, `accessibilityRole="button"`, and a label that says which way it goes — "Mark this page" when unmarked, "Lift the mark" when this page is the marked one. Marking calls `mark(page, firstAyah)`, where `firstAyah` is the page's **own** first ayah — the row with `position === 1`, **not** `startAyahNumber`, which is the ayah the page opens *in* and may belong to the previous page.

No kebab (R-C5).

- [ ] **Step 5: Run the tests**

Run: `cd apps/mobile && npx vitest run src/components/mushaf src/theme && npx tsc --noEmit && npx eslint .`
Expected: PASS.

- [ ] **Step 6: Mutation-check**

Make the component render the ribbon regardless of `marked`: the unmarked test must FAIL. Remove the `reduceMotion` branch: that test must FAIL. Swap `position === 1` for `startAyahNumber` — no unit test catches it, so record that device check 703 is the gate (mark a page that opens mid-ayah and confirm the stored coordinate is that page's own first ayah).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/mushaf apps/mobile/src/theme/tokens.ts
git commit -m "feat(mobile/mushaf): a khatm ribbon, dropped from the chrome"
```

---

### Task 4: The Arabic size stepper

**Files:**
- Create: `apps/mobile/src/components/ArabicSizeStepper.tsx`
- Create: `apps/mobile/src/components/ArabicSizeStepper.test.tsx`
- Modify: `apps/mobile/src/components/ReaderHeader.tsx`
- Modify: `apps/mobile/app/morphology.tsx`

**Interfaces:**
- Consumes: `arabicScales` and `ArabicScale` from `@/theme/tokens`; `useAppSettings()` and `setArabicScale` from the settings store.
- Produces:
  - `stepArabicScale(current: ArabicScale, direction: 1 | -1): ArabicScale`
  - `<ArabicSizeStepper uiLocale={UiLocale} />`

R-C6: reader and morphology only. One stored value — the same `arabicScale` Settings writes — so no new persistence and no second source of truth.

- [ ] **Step 1: Write the failing test**

```tsx
describe('stepArabicScale', () => {
  it('steps up and down through the four steps in order', () => {
    // The order is the object's declaration order in tokens.ts, which is the
    // ascending order of the multipliers. Asserted so a reordering there is
    // caught here rather than as a stepper that jumps about.
    expect(stepArabicScale('small', 1)).toBe('medium');
    expect(stepArabicScale('medium', 1)).toBe('large');
    expect(stepArabicScale('large', 1)).toBe('xlarge');
    expect(stepArabicScale('xlarge', -1)).toBe('large');
  });

  it('clamps at both ends rather than wrapping', () => {
    // Wrapping would take the largest step to the smallest on one more tap,
    // which reads as the control breaking.
    expect(stepArabicScale('xlarge', 1)).toBe('xlarge');
    expect(stepArabicScale('small', -1)).toBe('small');
  });
});

describe('ArabicSizeStepper', () => {
  it('disables the up control at the largest step', () => {
    // A control that is enabled and does nothing is worse than a disabled one.
    renderStepper({ arabicScale: 'xlarge' });
    expect(screen.getByTestId('arabic-size-up').getAttribute('aria-disabled')).toBe('true');
  });

  it('disables the down control at the smallest step', () => {
    renderStepper({ arabicScale: 'small' });
    expect(screen.getByTestId('arabic-size-down').getAttribute('aria-disabled')).toBe('true');
  });

  it('writes the stepped value to the one setting Settings uses', () => {
    // Two ways in, one stored value. A second key would drift and the two
    // screens would disagree about the size.
    const setArabicScale = vi.fn();
    renderStepper({ arabicScale: 'medium', setArabicScale });
    fireEvent.click(screen.getByTestId('arabic-size-up'));
    expect(setArabicScale).toHaveBeenCalledWith('large');
  });

  it('gives both controls a 48dp target', () => {
    renderStepper({ arabicScale: 'medium' });
    for (const id of ['arabic-size-up', 'arabic-size-down']) {
      expect(Number.parseFloat(screen.getByTestId(id).style.minHeight)).toBeGreaterThanOrEqual(48);
    }
  });

  it('announces the current step, not just the controls', () => {
    // Without this TalkBack reads "increase, decrease" and never says where
    // you are.
    renderStepper({ arabicScale: 'large' });
    expect(screen.getByTestId('arabic-size-value').textContent).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/mobile && npx vitest run src/components/ArabicSizeStepper.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
const STEPS = Object.keys(arabicScales) as ArabicScale[];

/** Clamped, not wrapped: one more tap at the largest step must not jump to the
 *  smallest, which reads as the control breaking. */
export function stepArabicScale(current: ArabicScale, direction: 1 | -1): ArabicScale {
  const at = STEPS.indexOf(current);
  const next = Math.min(STEPS.length - 1, Math.max(0, at + direction));
  return STEPS[next]!;
}
```

The component is a row of two `Pressable`s with the current step between them, `minHeight: touchTargets.minimum`, `accessibilityState={{ disabled }}` on each end. Render it inside the `actions` prop of each screen's `HeaderCard` — the curtain already exists on both, and `actions` is exactly the extension point for this (`HeaderCard` draws no kebab at all when `actions` is omitted).

Do not touch the mushaf (R-C6). Do not add a second stored key.

- [ ] **Step 4: Run the tests**

Run: `cd apps/mobile && npx vitest run src/components src/screens && npx tsc --noEmit && npx eslint .`
Expected: PASS, including `ReaderHeader.test.tsx` and the morphology route tests.

- [ ] **Step 5: Mutation-check**

Replace the clamp with a modulo wrap: the clamp test must FAIL. Remove the `disabled` state: both disabled tests must FAIL. Restore by editing.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/ArabicSizeStepper.tsx apps/mobile/src/components/ArabicSizeStepper.test.tsx apps/mobile/src/components/ReaderHeader.tsx apps/mobile/app/morphology.tsx
git commit -m "feat(mobile): step the Arabic size from the reader and morphology kebabs"
```

---

### Task 5: Build, device run, and the verification log

Build and install as in S4a Task 11 — no native dependency is added here, so `assembleRelease` is enough; `taskset -c 7,8` mandatory, `adb install -r --user 0` mandatory, APK served as a copy named for the versionCode verified with an explicitly-resolved `aapt2`.

| # | Check | Result |
|---|---|---|
| 700 | Unmarked pages show no ribbon anywhere in the book | **PASS** — swept 414-419; ribbon drawn only on the marked page, 0 ribbon px elsewhere |
| 701 | Tap the ribbon button → ribbon drops onto the page in madder crimson | **PASS** — ribbon appears in `rgb(194,81,90)` = `#C4515A`, the dark-paper token |
| 702 | Kill the app, reopen → ribbon still on the same page | **PASS** — `am force-stop` + relaunch, ribbon still on the same page |
| 703 | Mark a page that opens mid-ayah; stored coordinate is that page's own first ayah, not the previous page's | **BLOCKED** — see note below; no device with a virgin `reading_history` |
| 704 | Mark a second page → the first ribbon is gone (one mark, R-C1) | **PASS** — marked 416, 414's ribbon gone; one mark only |
| 705 | Tap the button on the marked page → ribbon lifts | **PASS** — button flips to "Lift the mark"; ribbon gone, and still gone after a restart |
| 706 | Reading on past the mark does not move it (it is deliberate, not automatic) | **PASS** — marked 416, read on to 419, returned: mark still exactly on 416 |
| 707 | The automatic continue-reading position still works and is unaffected | **PASS** — read to 418, Home shows "Al-Ahzab 33:1" (page 418), not the marked 416 |
| 708 | Ribbon colour reads as silk on both light and dark paper | **PASS** (measured) — `#A8323C` on `#FAF8F3` = **6.21:1**; `#C4515A` on `#151412` = **4.10:1**; both clear AA non-text. "Reads as silk" is the owner's call |
| 709 | Reduced motion → ribbon appears with no drop | **PARTIAL** — mark and lift both correct with Reduce animations on; the absence of the 220ms drop is below screencap resolution (~200ms), owner's eye needed |
| 710 | TalkBack: the button says mark/lift; the ribbon is not a second node | **NOT RUN** — TalkBack needs the owner's ears |
| 711 | Font stepper in the reader: four steps, both ends disabled correctly | **PASS** — Small/Medium/Large/Extra large; up disabled at top, down at bottom, no wrap |
| 712 | Font stepper in morphology: same four steps, same stored value | **PASS** — same stepper on the WbW screen, carrying the value set in the reader |
| 713 | Change the size in the kebab → Settings shows the new value, and vice versa | **PASS** both ways — morphology → Settings showed Large; Settings → reader showed Extra large |
| 714 | Mushaf has **no** kebab and **no** size control (R-C5, R-C6) | **PASS** — mushaf chrome exposes only Go to / Mark / Search / Reciter / Play |
| 715 | Upgrade path: install over the previous build — existing bookmarks, notes and position all survive | **PASS** — vc87→vc88 in place; bookmark, note text and position all survived the v5 migration |

**Device run 2026-10-03, vc89, OnePlus GM1917 (`adb-358b6f97`).** 13 PASS, 1 PARTIAL,
1 BLOCKED, 1 NOT RUN.

**A crash fixed first (`d02c5ce`).** vc88 killed the process outright on opening the
Mushaf tab: `khatmRibbonTranslateY` was a plain module function called from inside
`useAnimatedStyle`'s body, which runs on the UI thread, and Worklets throws fatally
rather than hopping threads. `'worklet';` on the helper, as `bookmarkExit`'s `rowExit`
has carried since the identical crash on Bookmarks in September. **No test can catch
this class:** vitest does not run `react-native-reanimated/plugin`, so the directive is
an inert string literal under test and its absence fails nothing. Verified instead in
the shipped bundle — two worklets from `KhatmRibbon.tsx` where the crashing build had
one.

**Why 703 is blocked, and why that is not a defect.** `setKhatmPage`'s `ON CONFLICT`
branch updates `khatm_page` alone, by design and by its own docstring: on a database
that has been read, the automatic position is not ours to move. The `surahId`/`ayahNumber`
it takes therefore reach the file only through the INSERT branch, which exists to satisfy
`reading_history`'s NOT NULL coordinates on a virgin row. So the `position === 1` choice
has observable consequences **only on a device that has never recorded a reading
position** — and the phone under test has years of one. The tablet dropped off the adb
bridge mid-run. This check needs a fresh install on a second device; it cannot be run by
wiping the owner's phone.

**One unexplained observation, not reproducing.** On the very first launch of vc89 the
ribbon was drawn on page 414, and after navigating two pages away and back it was gone,
with the button reading "Mark this page" and enabled (so the read had succeeded and
returned null, not errored). Every subsequent mark survived navigation, a force-stop and
a cold start. The only `clearKhatmPage` caller is `lift`, which was not tapped. The
likeliest origin is the vc88 crash loop that immediately preceded it — the process was
dying on every mushaf mount. Flagged rather than buried; worth one look if it recurs.

Check 715 is not optional. The user DB survives app updates and this phase migrates it; installing over a previous build is the only way to test the migration that will actually run on the owner's phone. A debug-signed local APK **cannot** upgrade over an EAS build — if the installed build is an EAS one, this check needs a matching signature or it is recorded as **not run**, not as a pass.

- [x] Record every result, fill the Verification Log, commit, push. **Do not open the PR.**

### Task 6: The ribbon's exit, and a khatm entry on Home (follow-up, 2026-10-03)

Owner asked for two things after the device run:

1. **The ribbon had no exit.** `if (!marked) return null` unmounted the view in the
   same render that cleared the mark, so the retract animated a shared value nothing
   was drawing — a lift read as the ribbon blinking out. Fix: keep it drawn until the
   exit lands (`drawn` state + `withTiming`'s completion through `runOnJS`, the shape
   `BookmarksScreen`'s row exit already uses), and make the exit a **retract**, not a
   reverse drop: the silk rises its whole 56dp length under a clipping parent, no
   fade, 280ms — pulled out of the book rather than evaporating (owner's call over a
   symmetric 24dp rise and over a fade-only exit).
   `khatmRibbonTranslateY` is **deleted**: offset and opacity are now plain shared
   values the style worklet reads directly, so there is no imported call inside
   `useAnimatedStyle` and no way back to the vc88 crash class.
2. **A khatm entry on Home.** Owner ruling: it **replaces the day-streak counter**
   (half-width, beside Roots studied) rather than taking a card of its own. Streak
   display, its `getReadingDays` read and `counters.ts`'s `streakFrom` are deleted —
   git holds them if it comes back. Marked → the page number over "Khatm page";
   read landed with no mark → "Start khatm"; still loading or unreadable → a dash,
   never the invitation (an unreadable mark is not an absent one).
   The page reaches the mushaf through `src/mushaf/pageRequest.ts`, a one-shot module
   store in the shape of `chromeVisibility` beside it, **not** a route param: the
   mushaf is a tab and stays mounted, so a param sticks to the route and a second tap
   on the same card would be a value that never changes. `router.navigate`, not
   `push` — pushing a tab stacks a second copy of it.

| # | Check | Result |
|---|---|---|
| 716 | Lift the mark → the ribbon RETRACTS upward under the page's top edge; no blink, no fade | |
| 717 | Mark again right after a lift → the drop is the short 24dp fall, not a 56dp one | |
| 718 | Reduced motion → a lift removes the ribbon at once, with no retract | |
| 719 | Home shows the marked page as a number over "Khatm page", where the streak used to be | |
| 720 | No mark on the file → the card reads "Start khatm"; tapping opens the mushaf where it would have opened anyway | |
| 721 | Marked → tap the card: the mushaf opens on exactly that page. Back to Home, tap again: it jumps again | |
| 722 | Roots studied is untouched — same half-width card, same weekly bars | |

Gates on the implementation: mobile `type-check` 0 (**both halves** — `tsconfig.json`
AND `tsconfig.test.json`, which is what CI runs; an earlier pass ran only the first and
reported 0 while 109 errors stood in four mushaf suites), `eslint` 0, 134 files /
1651 tests green. Mutation-checked: the retract distance, the `drawn` mount, the
invitation's error gate, the request's clearing (which caught a vacuous test of its own
first), the cold-vs-warm branch, `useUserDbOnFocus`'s settled flag and `getKhatmPage`'s
read-side range check each break a named test when reverted.

**§5 DOES need an independent review, and it ran.** The earlier waiver here was scoped
to Task 6 and written as though it covered the branch: Task 6 alone touches no data
layer, but the branch carries migration 5, `setKhatmPage`/`clearKhatmPage` and a new
`RangeError` validator — all three §5 triggers at once. `/code-review` ran 2026-10-03
on the whole branch; findings and dispositions below.

### `/code-review` 2026-10-03 — dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | `type-check` red: `khatmPage` and `reduceMotion` made required, 4 suites not updated (109 errors) | **Fixed.** `highlights.test.ts` literals + `marks()`, `MushafPager`/`MushafReader`/`MushafRotation` prop objects. Real, mine, CI-blocking — the earlier gate ran only `tsc --noEmit`, not the `-p tsconfig.test.json` half the script and CI both run. |
| 3 | Home card swaps "Start khatm" for the placeholder on every focus/resume | **Fixed in the shared hook.** `useUserDbOnFocus` narrowed `loading` on `data === null`, a proxy for "never resolved" that is wrong for any load whose own answer is null. Now a `settled` flag. Fixes every future null-answering consumer, not just this card. |
| 4 | `getKhatmPage` returns the row unvalidated; `pageRequest`'s docstring claims a guarantee it lacks | **Fixed.** Symmetric range check on read, out-of-range/non-numeric read as no mark rather than thrown (a corrupt row must not take Home down). Docstring now credits the read guard, not the write guard. |
| 7 | `onToggleMark`'s `useCallback` is inert — depends on `khatm`, a fresh object each render | **Fixed.** Depends on `khatm.mark`/`khatm.lift`, which are `useCallback`-stable. |
| 5 | §5 waiver scoped to Task 6, written as if it covered the PR; checks 716-722 blank | **Fixed** (waiver above). Checks still genuinely owed — vc90 is installed on both devices and the run is scheduled with the owner. |
| 2 | `KhatmRibbon` animates inside the page's hardware layer | **Deferred to the device run, not declined.** The claim is plausible and the counter-argument in the inline comment is weak — a turn animates the pager, not the ribbon. But the only honest verdict is a framestats gap measurement (3 repeats, gaps inside the animation window), and that needs the owner's phone. Added as check 723. |
| 6 | Arabic size stepper rebuilds the reader's offset table with no re-anchor | **Real, out of scope here.** Pre-existing in kind — reachable from Settings before this branch — but the new stepper puts it one tap away mid-read. Filed as its own issue rather than fixed inside a branch already carrying three §5 triggers. |
| 8 | `reading_days` is now write-only | **Accepted, no change.** One row per reading day costs nothing and the plan deliberately keeps the write so a returning streak needs no backfill. The dead `getReadingDays` re-export through `userRepository` goes when something next touches that file. |

| 723 | Mark and lift on a dense page → framestats gaps inside the 220/280ms window, 3 repeats, vs. the same page untouched | |

## Acceptance criteria

- [ ] `reading_history` gains `khatm_page` by an additive migration that is safe to run twice.
- [ ] The mark survives a restart, and there is only ever one.
- [ ] Neither value in the row clobbers the other, asserted in both directions.
- [ ] Page numbers are range-checked before they reach the file; ayah coordinates validated.
- [ ] Paper is clean on every unmarked page.
- [ ] Size stepper in the reader and morphology, sharing Settings' one stored value.
- [ ] Mushaf has no kebab and no size control.
- [ ] `/code-review` run at both §5 checkpoints, findings addressed or declined in writing.
- [ ] Checks 700-715 run and recorded, 715 with a real upgrade.

## Risks and rollbacks

| Risk | Mitigation | Rollback |
|---|---|---|
| `recordReadingPosition` wipes the mark on every scroll | Asserted in both directions in Task 1; fix its upsert to name only the position columns | The column is additive — an older build ignores it |
| An `UPDATE` on an empty `reading_history` silently does nothing | Upsert, with the empty-database test written first | — |
| Migration runs twice and throws | Versioned entry, one statement, run-twice test | An older build still opens the file; it just does not see the column |
| Ribbon colour reads as danger or as brown on night paper | Two tokens, calibrated against the page's own off-white | One token value each |
| Top-left ribbon reads as hanging off the fore-edge | Owner ruling R-C7, recorded as a deliberate override | One style constant flips it to top-right |
| Debug-signed APK cannot upgrade over an EAS build → 715 unrun | Flagged in the check itself | Record as not run; do not record a pass |

## Out of scope

- A ribbon in the surah reader (R-C3).
- More than one mark (R-C1).
- A size control on the mushaf (R-C6).
- Any mushaf kebab (R-C5).
- Khatm progress tracking, streaks or a daily target — not asked for.

## Verification log

*(empty — Task 5 fills this)*
