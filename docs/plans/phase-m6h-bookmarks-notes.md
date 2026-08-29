# M6h Bookmarks + Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the bookmarks screen to mockup `1k` — three tabs, a note on
every bookmark, and a list that actually scrolls — on top of the app's first
column-adding migration.

**Architecture:** `bookmarks` gains a nullable `note` column through migration 3
of the mechanism M6b built. The note is user-generated content, so it is
stripped and capped in `packages/data` at the write boundary, not in the screen
— the screen is one caller of a shared API and the next caller will not
remember. The list moves from a plain `View` to a `FlatList`, which is the fix
for rows past the first screenful being unreachable.

**Tech Stack:** as M6a. `packages/data` (`./user-db`) plus `apps/mobile`. No new
dependency.

**Spec:** `docs/plans/phase-m6-glass-redesign.md`, decisions 30-34. Mockup `1k`.

## Global Constraints

Inherited from the umbrella plan. Sub-phase specifics:

- **§5 fires, hardest of any sub-phase.** A schema change to the on-device user
  DB *and* a user-generated-content trust boundary. Stop after Task 5 and ask
  the owner to run `/code-review`.
- **The user DB is on the owner's phone and holds real bookmarks.** Migration 3
  is `ALTER TABLE ... ADD COLUMN`, which is additive and non-destructive. There
  is no `UPDATE`, no rebuild-and-copy, no `DROP`. An older build must still open
  a migrated file — a new nullable column satisfies that.
- **Decision 34: nothing new leaves the device.** A note is exactly the kind of
  string telemetry has swallowed before —
  `src/telemetry/telemetry.ts`'s own comment records `source: <a user's note>`
  passing a key-only filter. Do not touch that file, do not log a note, do not
  put a note in an error message or an `accessibilityLabel` built from a
  template that reaches a logger.
- **Decision 30/31:** one note per bookmark, 500 characters, plain text,
  stripped and capped in `packages/data`.
- Branch: `feat/m6h-bookmarks-notes`. Device checks 148-153.

---

### Task 1: The three tabs (settled)

Owner ruling 2026-08-24, and mockup `1k` is the authority — its segmented
control reads **Recent · By surah · With notes**:

| Tab | Contents | Ordering |
| --- | --- | --- |
| Recent | Every bookmark | `created_at` DESC — most recently saved first |
| By surah | Every bookmark | Grouped by surah, mushaf order, ayah order inside each group |
| With notes | Only bookmarks whose note is non-null | `created_at` DESC |

Not "History" — reading history is the home tab's continue-reading card and does
not belong here. All three tabs list the same rows; only the order and the
filter differ.

`1k`'s header caption reads "23 ayahs · 5 surahs · synced offline". Render the
two counts, but **not the word "synced"** — nothing syncs, nothing leaves the
device (decision 34), and a caption claiming otherwise is a promise the app does
not keep. Use the locale's equivalent of "on this device".

This changes `getBookmarks`: Recent needs `created_at`, which the table already
stores but the query does not return. Task 2 adds it.

---

### Task 2: The note column

**Files:**
- Modify: `packages/data/src/userData.ts`
- Modify: `packages/data/tests/userData.test.ts`
- Modify: `apps/mobile/src/data/userRepository.ts`

**Interfaces:**
- Produces, from `@quran-corpus/data/user-db`:

```ts
export const NOTE_MAX_LENGTH: 500;
export interface Bookmark { surahId: number; ayahNumber: number; note: string | null; createdAt: string }
export function normalizeNote(raw: unknown): string | null;
export async function setBookmarkNote(client: QueryClient, surahId: number, ayahNumber: number, note: string | null): Promise<void>;
```

`getBookmarks` grows `note` and `createdAt` (the existing `created_at` column,
never returned before — Task 1's Recent tab needs it). Its `ORDER BY surah_id,
ayah_number` stays: that is exactly the By-surah tab's order, and the Recent tab
sorts the same rows in the screen rather than paying for a second query.
`setBookmark`'s signature is unchanged.

- [x] **Step 1: Write the failing test**

```ts
describe('normalizeNote', () => {
  it('trims and keeps ordinary text', () => {
    expect(normalizeNote('  a note about 2:255  ')).toBe('a note about 2:255');
  });

  it('treats an empty or whitespace-only note as no note', () => {
    // Otherwise "clear the note" writes a row that the Notes tab then lists as
    // a note with nothing in it.
    for (const blank of ['', '   ', '\n\t ', null, undefined]) {
      expect(normalizeNote(blank)).toBeNull();
    }
  });

  it('caps at 500 characters', () => {
    expect(normalizeNote('x'.repeat(600))).toHaveLength(NOTE_MAX_LENGTH);
  });

  it('strips control characters but keeps Arabic, Cyrillic and newlines', () => {
    // Plain text (decision 30). A note is rendered straight into a <Text>, so
    // this is not an escaping problem -- it is about not persisting bytes that
    // make the row unreadable or unsearchable later.
    expect(normalizeNote('note\u0007here')).toBe('notehere');
    expect(normalizeNote('Заметка ملاحظة')).toBe('Заметка ملاحظة');
    expect(normalizeNote('line one\nline two')).toBe('line one\nline two');
  });

  it('refuses a non-string that is not null', () => {
    for (const bad of [42, {}, [], true]) {
      expect(() => normalizeNote(bad as never)).toThrow(TypeError);
    }
  });
});

describe('setBookmarkNote', () => {
  it('validates the coordinate like every other write', async () => {
    await expect(setBookmarkNote(client, 1, 286, 'x')).rejects.toThrow(RangeError);
  });

  it('does not create a bookmark that does not exist', async () => {
    await setBookmarkNote(client, 2, 255, 'orphan');
    // A note is an attribute of a bookmark. Writing one for an unbookmarked
    // ayah would make it invisible in every tab and undeletable from the UI.
    expect(await getBookmarks(client)).toEqual([]);
  });

  it('round-trips a note on an existing bookmark', async () => {
    await setBookmark(client, 2, 255, true);
    await setBookmarkNote(client, 2, 255, '  the throne verse  ');

    expect(await getBookmarks(client)).toEqual([
      { surahId: 2, ayahNumber: 255, note: 'the throne verse', createdAt: expect.any(String) },
    ]);
  });

  it('clears a note without removing the bookmark', async () => {
    await setBookmark(client, 2, 255, true);
    await setBookmarkNote(client, 2, 255, 'temp');
    await setBookmarkNote(client, 2, 255, null);

    expect(await getBookmarks(client)).toEqual([
      { surahId: 2, ayahNumber: 255, note: null, createdAt: expect.any(String) },
    ]);
  });
});

describe('migration 3', () => {
  it('adds the note column to a populated pre-migration file', async () => {
    const client = newClient();
    await client.execute(USER_DB_SCHEMA);          // v1 shape
    await setBookmark(client, 2, 255, true);       // the owner's real data
    await client.execute('PRAGMA user_version = 2');

    await migrateUserDb(client);

    // The whole point of versioning it: this ALTER throws if it runs twice, and
    // the row must survive.
    expect(await getBookmarks(client)).toEqual([
      { surahId: 2, ayahNumber: 255, note: null, createdAt: expect.any(String) },
    ]);
    await expect(migrateUserDb(client)).resolves.toBe(USER_DB_VERSION);
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/data test -t normalizeNote`
Expected: FAIL — no such export.

- [x] **Step 3: Implement**

```ts
export const NOTE_MAX_LENGTH = 500;

/** C0 and C1 control characters, minus the two whitespace ones a note may
 *  legitimately contain. Written as escapes, never as literal bytes. */
const CONTROL_CHARS = new RegExp('[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]', 'g');

/**
 * Clean a user-supplied note into what may be stored, or null for "no note".
 *
 * This is the write boundary for a shared API (CLAUDE.md §3, §5). The screen
 * is one caller; a later caller -- an import, a sync, a share target -- will
 * not repeat the checks, and a note is the only untrusted string this database
 * holds.
 *
 * Control characters go because a note is rendered into a <Text> and stored in
 * a column a future search may index. \n and \t are deliberately kept: a
 * multi-line note is a normal thing to write. The cap is applied after
 * trimming, so trailing whitespace cannot eat the allowance.
 */
export function normalizeNote(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') throw new TypeError(`note must be a string or null, got ${typeof raw}`);

  const cleaned = raw.replace(CONTROL_CHARS, '').trim();

  if (cleaned.length === 0) return null;
  return cleaned.slice(0, NOTE_MAX_LENGTH);
}

export async function setBookmarkNote(
  client: QueryClient,
  surahId: number,
  ayahNumber: number,
  note: string | null,
): Promise<void> {
  assertAyahCoordinate(surahId, ayahNumber);
  const value = normalizeNote(note);

  // UPDATE, not upsert: a note belongs to a bookmark that already exists.
  // An INSERT here would create a bookmark the user never made, visible
  // nowhere and removable from nothing.
  await client.execute({
    sql: 'UPDATE bookmarks SET note = ? WHERE surah_id = ? AND ayah_number = ?',
    args: [value, surahId, ayahNumber],
  });
}
```

Add migration 3 to `USER_DB_MIGRATIONS`:

```ts
  {
    version: 3,
    sql: 'ALTER TABLE bookmarks ADD COLUMN note TEXT',
  },
```

`ALTER TABLE ADD COLUMN` is the one statement in this file that is **not**
idempotent — it throws `duplicate column name` on a second run. That is exactly
what the version gate is for, and why `migrateUserDb` must never be made to
swallow an error.

Update `getBookmarks` to select and map `note`.

- [x] **Step 4: Run the tests, then mutation-check (§4)**

Run: `pnpm --filter @quran-corpus/data test` -> PASS.
Then change `.slice(0, NOTE_MAX_LENGTH)` to return `cleaned`. Expected: the cap
test FAILS. Restore by re-editing. Repeat for the UPDATE-not-upsert choice:
change it to an upsert and confirm "does not create a bookmark that does not
exist" FAILS.

- [x] **Step 5: Commit**

```bash
git add packages/data/src/userData.ts packages/data/tests/userData.test.ts \
        apps/mobile/src/data/userRepository.ts
git commit -m "feat(data): add a validated note to a bookmark"
```

---

### Task 3: The bookmarks screen

**Files:**
- Modify: `apps/mobile/app/bookmarks.tsx`
- Create: `apps/mobile/src/screens/BookmarksScreen.tsx`
- Modify: `apps/mobile/src/screens/BookmarksTab.test.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`

**Interfaces:**
- Consumes: `SegmentedControl` (M6c), `GlassSurface`, `usePressScale`,
  `useListBottomPadding`, `getBookmarks`, `getLastReadingPosition`.
- Produces: `<BookmarksScreen />`; `app/bookmarks.tsx` becomes a one-line route.

New `uiStrings` keys: `bookmarks.tabRecent`, `bookmarks.tabBySurah`,
`bookmarks.tabWithNotes`, `bookmarks.countCaption`, `bookmarks.noNotes`,
`bookmarks.addNote`, `bookmarks.editNote`, `bookmarks.noteFailed`,
`bookmarks.noteCounter` (all three locales).

- [x] **Step 1: Write the failing tests**

```tsx
it('scrolls past the first screenful', async () => {
  renderBookmarks({ bookmarks: manyBookmarks(60) });

  // The defect found during the M5c device run: rows lived in a plain <View>,
  // so everything past the fold was unreachable on a real phone. A FlatList is
  // the fix, and this asserts the container, not the styling.
  expect(await screen.findByTestId('bookmarks-list')).toBeTruthy();
  expect(screen.queryByTestId('bookmarks-static-view')).toBeNull();
});

it('shows only noted bookmarks under the With-notes tab', async () => {
  renderBookmarks({ bookmarks: [
    { surahId: 2, ayahNumber: 255, note: 'throne' },
    { surahId: 1, ayahNumber: 1, note: null },
  ] });

  fireEvent.click(screen.getByLabelText('With notes'));
  expect(await screen.findAllByTestId(/bookmark-row-/)).toHaveLength(1);
});

it('orders Recent by when the bookmark was saved, not by surah', async () => {
  renderBookmarks({ bookmarks: [
    { surahId: 1, ayahNumber: 1, note: null, createdAt: '2026-08-20T10:00:00Z' },
    { surahId: 2, ayahNumber: 255, note: null, createdAt: '2026-08-24T10:00:00Z' },
  ] });

  // getBookmarks returns mushaf order, which is the By-surah tab's order. A
  // Recent tab that forgets to re-sort is indistinguishable from it until the
  // user saves something out of order -- which is the normal case.
  const rows = await screen.findAllByTestId(/bookmark-row-/);
  expect(rows[0]?.getAttribute('data-testid')).toBe('bookmark-row-2-255');
});

it('groups the By-surah tab under surah headers', async () => {
  renderBookmarks({ bookmarks: [
    { surahId: 1, ayahNumber: 1, note: null, createdAt: '2026-08-20T10:00:00Z' },
    { surahId: 2, ayahNumber: 255, note: null, createdAt: '2026-08-24T10:00:00Z' },
  ] });

  fireEvent.click(screen.getByLabelText('By surah'));
  const headers = await screen.findAllByRole('header');
  expect(headers.map((h) => h.textContent)).toEqual(['Al-Fatiha', 'Al-Baqara']);
});

it('counts down the remaining characters while editing', async () => {
  renderBookmarks({ bookmarks: [{ surahId: 2, ayahNumber: 255, note: null }] });

  fireEvent.click(await screen.findByLabelText('Add note'));
  fireEvent.change(screen.getByTestId('note-input'), { target: { value: 'x'.repeat(495) } });

  // Silently truncating at the boundary is the version where a user loses the
  // end of a long note with nothing on screen having said so.
  expect(screen.getByTestId('note-counter').textContent).toBe('5');
});

it('keeps the bookmark when a note is cleared', async () => {
  const setBookmarkNote = vi.fn();
  renderBookmarks({ bookmarks: [{ surahId: 2, ayahNumber: 255, note: 'throne' }], setBookmarkNote });

  fireEvent.click(await screen.findByLabelText('Edit note'));
  fireEvent.change(screen.getByTestId('note-input'), { target: { value: '' } });
  fireEvent.click(screen.getByLabelText('Save'));

  expect(setBookmarkNote).toHaveBeenCalledWith(expect.anything(), 2, 255, '');
  expect(await screen.findAllByTestId(/bookmark-row-/)).toHaveLength(1);
});
```

- [x] **Step 2: Run them, watch them fail, implement, re-run**

- Three tabs via `SegmentedControl`: Recent, By surah, With notes (Task 1).
- Recent and With notes are `FlatList`s; By surah is a `SectionList` with a
  surah-name header per group. `keyExtractor` includes the tab so a switch
  cannot reuse rows; `contentContainerStyle.paddingBottom = useListBottomPadding()`.
- The header caption shows the ayah and surah counts, and says the data is on
  this device -- never "synced" (Task 1).
- Each row is a `GlassSurface` card: coordinate, the ayah's opening words, and
  the note beneath in the muted colour, clamped to three lines with the existing
  `ClampedText`.
- The note editor is the existing `BottomSheet` with a `TextInput`
  (`maxLength={NOTE_MAX_LENGTH}`, `multiline`), a live counter, Save and Cancel.
  `maxLength` is a convenience, **not** the validation — `normalizeNote` is.
- After a note write, refresh the list from the DB rather than patching local
  state, so what is on screen is what was stored after normalisation.

- [x] **Step 3: Mutation-check (§4)**

Make the Notes tab render every bookmark. Expected: the second test FAILS.
Restore by re-editing.

- [x] **Step 4: Commit**

```bash
git add apps/mobile/app/bookmarks.tsx apps/mobile/src/screens/BookmarksScreen.tsx \
        apps/mobile/src/screens/BookmarksTab.test.tsx apps/mobile/src/i18n/uiStrings.ts
git commit -m "feat(mobile): three-tab bookmarks with notes and a scrolling list"
```

---

### Task 4: Note affordance in the reader

**Files:**
- Modify: `apps/mobile/src/components/AyahCard.tsx`
- Modify: `apps/mobile/src/components/MushafAyah.tsx`
- Modify: `apps/mobile/src/components/SurahReader.tsx`

A bookmarked ayah's card gets a note affordance — an outline pen when there is
no note, a filled one when there is, opening the same editor sheet. Reuse the
component from Task 3; do not build a second editor.

- [x] **Step 1: Write the failing test**

```tsx
it('offers a note only on a bookmarked ayah', () => {
  render(<AyahCard ayah={AYAH} bookmarked={false} {...noop} />);
  expect(screen.queryByLabelText('Add note')).toBeNull();

  cleanup();
  render(<AyahCard ayah={AYAH} bookmarked {...noop} />);
  // A note is an attribute of a bookmark (Task 2's UPDATE-not-upsert), so
  // offering one on an unbookmarked ayah is an affordance that silently does
  // nothing.
  expect(screen.getByLabelText('Add note')).toBeTruthy();
});
```

- [x] **Step 2: Run it, watch it fail, implement, re-run, mutation-check**

Render the affordance unconditionally. Expected: the test FAILS. Restore.

- [x] **Step 3: Commit**

```bash
git add apps/mobile/src/components
git commit -m "feat(mobile): add a note from the reader"
```

---

### Task 5: §5 stop, then build

- [x] **Step 1: Self-review.** Three questions, answered out loud in the commit
  or the PR body: is the migration additive; is every note write normalised in
  `packages/data`; can a note reach telemetry, a log line or a crash report?
- [x] **Step 2: Stop and ask the owner to run `/code-review`** — user-DB schema
  change plus a UGC trust boundary (§5). Plain `/code-review`; never `ultra`
  unprompted.
- [x] **Step 3: Act on the findings.** One pass.
- [ ] **Step 4: Build.** BLOCKED — EAS quota parked until 2026-09-01.

```bash
cd apps/mobile && pnpm prebuild:assert-db && eas build --platform android --profile preview
```

---

### Task 6: Device run

| # | Check | Pass condition |
| --- | --- | --- |
| 148 | **Upgrade over the M6r build without clearing app data** | Every existing bookmark is still there, now with an empty note. This is the migration's real test |
| 149 | Scroll a list of 60+ bookmarks | Every row is reachable; the last clears the tab pill |
| 150 | Add, edit and clear a note | Persists across an app restart; clearing keeps the bookmark |
| 151 | Type past 500 characters | Input stops at 500; the counter reaches 0; nothing is silently lost |
| 152 | A note in Arabic, Uzbek and Russian | Stored and redisplayed intact, correct direction |
| 153 | All three tabs | Recent is newest-first; By surah is grouped under surah headers; With notes lists only noted bookmarks |
| 154 | Un-bookmark an ayah that carries a note | A confirm appears; Cancel keeps both the bookmark and its text; Delete removes both. No dialog when the bookmark has no note |

## Verification Log

| Check | Build | Date | Result | Notes |
| --- | --- | --- | --- | --- |
| 148 | Expo Go (dev) | 2026-08-29 | BLOCKED | Not exercisable off an APK. The Expo Go sandbox holds no pre-M6h user DB, so there is nothing for the migration to migrate. Owed to the EAS window (opens 2026-09-01). The 66 bookmarks this run left on the device are deliberate: they are the "before" state that run needs. |
| 149 | Expo Go (dev) | 2026-08-29 | PASS | 66 bookmarks across Al-Baqara. Every row reachable by scroll; the last (2:1) clears the bottom inset with room to spare. |
| 150 | Expo Go (dev) | 2026-08-29 | PASS | Added, edited and cleared. Survived a force-stop and relaunch. Clearing kept the bookmark (count held at 66) and dropped the row from With notes. |
| 151 | Expo Go (dev) | 2026-08-29 | PASS | 600 characters typed in 100-char runs; the field stopped at exactly 500 (the sixth run never landed), the counter reached 0, nothing was trimmed out of the middle. |
| 152 | Expo Go (dev) | 2026-08-29 | PASS after fix | Arabic, Russian and Uzbek all stored and redisplayed intact. Direction was wrong: an Arabic note rendered flush left, because Android takes a Text's gravity from the layout direction and all three UI locales are LTR. Fixed by aligning the note on its own first-strong character (`i18n/textDirection.ts`); re-checked on device, Arabic right, Cyrillic and Latin left. |
| 153 | Expo Go (dev) | 2026-08-29 | PASS | Recent is `created_at` DESC. Note that `CURRENT_TIMESTAMP` is second-granular, so a burst of bookmarks ties; the comparator's ascending-ayah tie-break is what makes the order deterministic, and it was visibly doing so. By surah grouped under an Al-Baqara header, ascending. With notes listed only the noted rows. |
| 154 | Expo Go (dev) | 2026-08-29 | PASS | Confirm appeared on a noted bookmark; Cancel kept both; Delete removed both, and re-bookmarking the same ayah came back with an empty note. No dialog on a note-less bookmark -- it went straight through. |

### Defects found and fixed in this run

- **Bookmark row's only tap target is the coordinate.** Measured 81x76px on a
  640dpi device -- 20x19dp, under Android's 48dp and under WCAG 2.2 SC 2.5.8's
  24x24 -- and tapping the card itself does nothing, so the row looks inert.
  Padded to the 48dp floor (192x192px re-measured).
- **Note direction** -- see check 152.
- **Ayah action row clipped in Russian and Uzbek** (found on the M6i sweep,
  fixed in the same pass): see phase-m6i's log.

### Open, for the owner

The delete confirm is the stock Android `Alert` -- a white system dialog over
the glass design, in the OS's own type. Functionally correct; visually it is the
one surface in the app that does not belong to it. Replacing it means owning a
modal, which is a design call rather than a defect.

## Deviations

Recorded at merge, not during the PR — ledger prose inside an open PR drew 30
of 60 findings on #75.

- **Task 3 had no query for the ayah text it specified.** Nothing in
  `packages/data` answered "text for a scattered list of coordinates", and the
  only existing path loads a whole surah per bookmark. Owner chose a batch
  query: `getAyahPreviews` (`4a94994`), which widened the §5 scope.
- **Migration literal shape.** Plan wrote `{version, sql}`; the real type is
  `{version, statements[]}`.
- **`useUserDbOnFocus` gained `reload`.** First screen that writes what it
  reads. The alternative was a fourth private copy of the load logic.
- **`NoteEditor` extracted to its own component** so the reader and the list
  open the same sheet rather than two that drift (§3).
- **`rnHosts` list shims now forward `testID`**, so a suite can assert which
  container a screen mounted.
- **Device checks renumbered** 97–102 to 148–153; 97–107 were already spent on
  M6g. Check 148's upgrade baseline is the M6r build (`8c3da7f`).
- **Check 154 added at merge** for the delete confirm, which did not exist when
  the plan was written.

## Review Log

`/code-review` (plain, §5) on `feat/m6h-bookmarks-notes`, 2026-08-29. Eight
findings, all real, all fixed in one pass (`2bf488e`, `628ecf9`). Nothing
declined.

| Finding | Fix |
| --- | --- |
| `saveNote` wrote against the pager's target surah, not the one on screen | `displayedSurahId`, like every other write in the file |
| The note sheet survived a page turn | Cleared when the surah changes |
| A failed delete rolled the note back as empty | Restores the captured note |
| Un-bookmarking destroyed a note with one tap, no undo | Confirm when the row carries a note |
| `getAyahPreviews` ordering held only within a chunk | Sorted once after the loop |
| The note cap could cut an emoji in half | Drops the whole surrogate pair |
| A note-write error rendered behind the sheet's `<Modal>` | Rendered inside the sheet |
| Both bookmarks-list pens were the same glyph and colour | The reader's own pair |

The confirm dialog is a product decision taken during the review pass rather
than asked about. Reversible in one commit if the owner wants it out.

Merged as `37fa508` (squash of PR #38).

**Not met:** the device run has not happened, and §10 makes it the gate for this
milestone. `eas build` is blocked until 2026-09-01.
