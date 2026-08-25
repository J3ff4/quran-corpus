# M6c Surah Index + Browse Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the surah index as glass rows and give it the four-way
segmented control from mockup `1d`: Surah, Juz, Page, Revealed.

**Architecture:** All four modes are views over data the corpus DB already
holds — `ayahs.juz` (1–30, fully populated), `ayahs.page` (1–604, fully
populated), `surahs.order_number` (revelation order) and
`surahs.revelation_type`. Nothing is imported and nothing is derived at build
time; each mode is one indexed query in `packages/data`. Every mode's row
navigates to the existing reader route with a surah and an ayah, so no new
route and no new screen state.

**Tech Stack:** as M6a. `packages/data` (`./mobile` entry) plus `apps/mobile`.
No new dependency.

**Spec:** `docs/plans/phase-m6-glass-redesign.md`, decisions 18–20. Mockup `1d`.

## Global Constraints

Inherited from the umbrella plan. Sub-phase specifics:

- **§5 fires.** New `packages/data` queries. Stop after Task 4 and ask the
  owner to run `/code-review`.
- Decision 20: **page browse scrolls to the page's first ayah.** A true paged
  mushaf — fixed 15-line pages, justified Uthmani, no scroll — is explicitly
  deferred. Do not start it here, do not "partially" start it.
- Decision 19: Revealed = chronological order (`order_number`), grouped
  Meccan / Medinan.
- No new corpus data, no DB regeneration, no schema change. If a mode appears
  to need one, stop and ask (§12).
- Rebuild `packages/data` before running the app
  (`[[packages-data-stale-dist-gotcha]]`).
- Branch: `feat/m6c-browse-modes`. Device checks 61–64.

---

### Task 1: The three new browse queries

**Files:**
- Create: `packages/data/src/queries/browse.ts`
- Create: `packages/data/tests/browse.test.ts`
- Modify: `packages/data/src/mobile.ts` (re-export)
- Modify: `packages/data/tests/mobile-entry.test.ts`

**Interfaces:**
- Produces, from `@quran-corpus/data/mobile`:

```ts
export interface JuzEntry { juz: number; startSurahId: number; startAyahNumber: number; surahName: string; ayahCount: number }
export interface PageEntry { page: number; startSurahId: number; startAyahNumber: number; surahName: string }
export interface RevealedEntry { surahId: number; orderNumber: number; revelationType: 'meccan' | 'medinan'; nameArabic: string; nameTranslit: string }

export async function getJuzIndex(client: QueryClient): Promise<JuzEntry[]>;
export async function getPageIndex(client: QueryClient): Promise<PageEntry[]>;
export async function getRevealedIndex(client: QueryClient): Promise<RevealedEntry[]>;
```

- [x] **Step 1: Write the failing test**

`packages/data/tests/browse.test.ts`, against the fixture DB the other query
suites already build:

```ts
describe('getJuzIndex', () => {
  it('returns all thirty juz in order, each with its first ayah', async () => {
    const rows = await getJuzIndex(client);

    expect(rows).toHaveLength(30);
    expect(rows[0]).toMatchObject({ juz: 1, startSurahId: 1, startAyahNumber: 1 });
    // CORRECTED 2026-08-25, see the note under Step 6. Juz 3 (2:253 -> 3:92),
    // not juz 2: juz 2 never leaves al-Baqarah, so the broken query answers
    // 2:142 as well and this assertion passes either way.
    expect(rows[2]).toMatchObject({ juz: 3, startSurahId: 2, startAyahNumber: 253 });
    expect(rows.map((r) => r.juz)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });
});

describe('getPageIndex', () => {
  it('returns all 604 pages, each with its first ayah', async () => {
    const rows = await getPageIndex(client);

    expect(rows).toHaveLength(604);
    expect(rows[0]).toMatchObject({ page: 1, startSurahId: 1, startAyahNumber: 1 });
    expect(rows[1]).toMatchObject({ page: 2, startSurahId: 2, startAyahNumber: 1 });
    expect(rows.at(-1)?.page).toBe(604);
  });
});

describe('getRevealedIndex', () => {
  it('orders by revelation, not by mushaf order', async () => {
    const rows = await getRevealedIndex(client);

    expect(rows).toHaveLength(114);
    // 96 (al-Alaq) was revealed first; al-Fatiha is 5th. Ordering by id would
    // put surah 1 at the top and look entirely plausible.
    //
    // NOTE 2026-08-25: order_number did NOT hold this. See Step 3 below.
    expect(rows[0]).toMatchObject({ surahId: 96, orderNumber: 1, revelationType: 'meccan' });
    expect(rows.map((r) => r.orderNumber)).toEqual(Array.from({ length: 114 }, (_, i) => i + 1));
  });

  it('carries the revelation type for every surah', async () => {
    const rows = await getRevealedIndex(client);
    expect(rows.filter((r) => r.revelationType === 'meccan')).toHaveLength(86);
    expect(rows.every((r) => r.revelationType === 'meccan' || r.revelationType === 'medinan')).toBe(true);
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/data test browse`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

```ts
/**
 * The juz index: thirty rows, each pointing at the ayah the juz opens on.
 *
 * The start ayah comes from the row with the smallest `ayahs.id` in the juz,
 * not from MIN(surah_id) and MIN(ayah_number) taken separately -- those are
 * independent aggregates and would answer 2:1 for juz 2, which actually starts
 * at 2:142. `ayahs.id` is AUTOINCREMENT in mushaf order, so it is the ordering
 * the whole file already relies on.
 */
export async function getJuzIndex(client: QueryClient): Promise<JuzEntry[]> {
  const result = await client.execute(`
    SELECT j.juz,
           a.surah_id      AS start_surah_id,
           a.ayah_number   AS start_ayah_number,
           s.name_translit AS surah_name,
           j.ayah_count
    FROM (
      SELECT juz, MIN(id) AS first_id, COUNT(*) AS ayah_count
      FROM ayahs
      WHERE juz IS NOT NULL
      GROUP BY juz
    ) j
    JOIN ayahs  a ON a.id = j.first_id
    JOIN surahs s ON s.id = a.surah_id
    ORDER BY j.juz
  `);

  return result.rows.map((row) => ({
    juz: Number(row.juz),
    startSurahId: Number(row.start_surah_id),
    startAyahNumber: Number(row.start_ayah_number),
    surahName: String(row.surah_name),
    ayahCount: Number(row.ayah_count),
  }));
}
```

`getPageIndex` is the same shape over `ayahs.page` (604 rows, no ayah count).
`getRevealedIndex` is a plain `SELECT ... FROM surahs ORDER BY order_number`.

**Blocked and resolved, 2026-08-25.** This task's architecture claims all four
modes are views over data the corpus DB already holds. That was false for
Revealed: `surahs.order_number` held a copy of `id` in all 114 rows -- mushaf
order, not tartib an-nuzul. Nothing read the column, so nothing was visibly
wrong, and Revealed mode would have rendered the surah index under a different
heading. Raised as the §12 stop this plan's Global Constraints call for; the
owner chose to backfill the column rather than carry a constant in
`packages/data` or cut the mode.

Done in `8efd005`: the ranks are the standard Egyptian (1924 Cairo) chronology,
written into `packages/scraper/scraper/surah_meta.py` because `db.py`'s upsert
is what writes the column -- a hand-edited DB is undone by the next
`scraper seed`. `seed_database` gained a parking pass, since UNIQUE(order_number)
rejects every intermediate state of a permutation. Live DB re-seeded (backup at
`~/quran-data/quran.db.bak-m6c-revelation-order`) and the bundled mobile DB
regenerated; both verified to open on 96 al-Alaq with a clean hijra split and
unchanged ayah/word counts.
Write all three; do not factor the two index queries into one parameterized
helper that interpolates a column name — a column name cannot be a bound
parameter and the "shared" version would be string-built SQL for no gain.

- [x] **Step 4: Re-export and guard**

Add all three to `packages/data/src/mobile.ts`, and to the export assertions in
`packages/data/tests/mobile-entry.test.ts` — that suite is what stops a mobile
query from quietly acquiring a node-only import.

- [x] **Step 5: Run the tests**

Run: `pnpm --filter @quran-corpus/data test`
Expected: PASS.

- [x] **Step 6: Mutation-check (§4)**

In `getJuzIndex`, swap the subquery for
`SELECT juz, MIN(surah_id) AS s, MIN(ayah_number) AS n, COUNT(*) ... GROUP BY juz`
and join on those. Expected: the **juz-3** assertion FAILS with `2:1`.

**This step as originally written was vacuous.** It named juz 2, which runs
2:142 to 2:252 and never leaves al-Baqarah -- so the independent-MIN version
answers 2:142 there too and the test passes against both. Only a juz that
crosses a surah boundary distinguishes them. Same class as the brief-specified
vacuous tests in PRs #71 and #73: the defect was upstream of the implementer.

Run 2026-08-25 against a synthetic fixture rather than the real corpus (see the
commit body). Three mutations, each failing exactly the intended test:
independent MINs -> the boundary-crossing juz assertion; dropping
`WHERE juz IS NOT NULL` -> all seven; `ORDER BY order_number` -> `ORDER BY id`
-> both revealed assertions. Restored by re-editing from a scratchpad copy.

- [x] **Step 7: Commit**

```bash
git add packages/data/src/queries/browse.ts packages/data/tests/browse.test.ts \
        packages/data/src/mobile.ts packages/data/tests/mobile-entry.test.ts
git commit -m "feat(data): add juz, page and revelation browse indexes"
```

---

### Task 2: The segmented control

**Files:**
- Create: `apps/mobile/src/components/SegmentedControl.tsx`
- Create: `apps/mobile/src/components/SegmentedControl.test.tsx`

**Interfaces:**
- Produces:

```ts
export interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  testID?: string;
}
export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>): JSX.Element;
```

Generic and content-free — M6d's reader mode chip and M6e's density chip both
use it. That is why it is a component and not four buttons inside the surah
screen.

- [ ] **Step 1: Write the failing test**

```tsx
it('marks exactly one option selected', () => {
  render(<SegmentedControl options={OPTS} value="juz" onChange={() => {}} accessibilityLabel="Browse by" />);

  const tabs = screen.getAllByRole('tab');
  expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
  expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
});

it('reports the value, not the index', () => {
  // An index-based callback silently breaks the moment an option is inserted,
  // and every screen using this passes the value straight into a query.
  const onChange = vi.fn();
  render(<SegmentedControl options={OPTS} value="surah" onChange={onChange} accessibilityLabel="Browse by" />);

  fireEvent.click(screen.getAllByRole('tab')[2]!);
  expect(onChange).toHaveBeenCalledWith('page');
});

it('does not fire when the selected option is tapped again', () => {
  const onChange = vi.fn();
  render(<SegmentedControl options={OPTS} value="surah" onChange={onChange} accessibilityLabel="Browse by" />);

  fireEvent.click(screen.getAllByRole('tab')[0]!);
  expect(onChange).not.toHaveBeenCalled();
});

it('names the group for a screen reader', () => {
  render(<SegmentedControl options={OPTS} value="surah" onChange={() => {}} accessibilityLabel="Browse by" />);
  expect(screen.getByLabelText('Browse by')).toBeTruthy();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/mobile test SegmentedControl`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

A `GlassSurface radius="pill"` row of `Pressable`s. The selected one gets a
filled `theme.accentWash` pill behind it and `theme.accent` text; the rest are
`theme.mutedText`. `accessibilityRole="tab"` on each, `"tablist"` on the row,
`usePressScale` on each. Minimum height `touchTargets.compact`, because four
segments in a row cannot each be 48 wide on a 390pt frame — the *row* is 48
tall, which is what the guideline measures.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @quran-corpus/mobile test SegmentedControl`
Expected: PASS.

- [ ] **Step 5: Mutation-check (§4)**

Remove the "already selected" guard. Expected: the third test FAILS. Restore by
re-editing.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/SegmentedControl.tsx apps/mobile/src/components/SegmentedControl.test.tsx
git commit -m "feat(mobile): add the glass segmented control"
```

---

### Task 3: The four browse modes

**Files:**
- Modify: `apps/mobile/app/(tabs)/surahs.tsx`
- Create: `apps/mobile/src/screens/SurahsScreen.tsx`
- Modify: `apps/mobile/src/components/SurahList.tsx`
- Modify: `apps/mobile/src/screens/SurahsTab.test.tsx`
- Modify: `apps/mobile/src/data/corpusRepository.ts`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`

**Interfaces:**
- Consumes: `getJuzIndex`, `getPageIndex`, `getRevealedIndex` (Task 1);
  `SegmentedControl` (Task 2); `GlassSurface`, `usePressScale`, `fonts` (M6a).
- Produces: `<SurahsScreen />`; `app/(tabs)/surahs.tsx` becomes a one-line
  route (`appDirIsRoutesOnly.test.ts`).

New `uiStrings` keys, all three locales: `browse.surah`, `browse.juz`,
`browse.page`, `browse.revealed`, `browse.meccan`, `browse.medinan`,
`browse.mode`, `browse.juzLabel`, `browse.pageLabel`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('lists surahs by default', async () => {
  renderSurahs();
  expect(await screen.findByText('Al-Fatihah')).toBeTruthy();
});

it('switches to the juz index and navigates to the juz opening ayah', async () => {
  renderSurahs();
  fireEvent.click(screen.getByLabelText('Juz'));

  const juz2 = await screen.findByTestId('browse-juz-2');
  // Decision 18/20: every mode lands on a real ayah in the existing reader.
  expect(juz2.getAttribute('href')).toContain('/surah/2');
  expect(juz2.getAttribute('href')).toContain('ayah=142');
});

it('groups the revealed list by Meccan and Medinan', async () => {
  renderSurahs();
  fireEvent.click(screen.getByLabelText('Revealed'));

  const headers = await screen.findAllByRole('header');
  expect(headers.map((h) => h.textContent)).toContain('Meccan');
  expect(headers.map((h) => h.textContent)).toContain('Medinan');
});

it('keeps the chosen mode while the tab stays mounted', async () => {
  // Local state, not a persisted setting: decision 26 makes the *WBW density*
  // global, and says nothing about browse mode. Do not persist this one.
  renderSurahs();
  fireEvent.click(screen.getByLabelText('Page'));
  expect(await screen.findByTestId('browse-page-1')).toBeTruthy();
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @quran-corpus/mobile test SurahsTab`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Mode lives in `useState`, defaulting to `'surah'`.
- Each mode's data loads lazily on first switch and is memoized for the mount —
  604 page rows is not a query to re-run on every re-render.
- One `FlatList` per mode. `keyExtractor` uses the mode's own key so switching
  modes cannot reuse a row.
- Revealed mode uses `SectionList` with two sections built from
  `revelationType`; the section headers get `accessibilityRole="header"`.
- Rows are `GlassSurface` cards with `usePressScale`, Arabic in `fonts.arabic`,
  the number in `fonts.displaySemiBold`.
- Every row's `accessibilityLabel` says what it opens ("Juz 2, opens at
  al-Baqarah 142") — a bare number announces as a number.
- `contentContainerStyle.paddingBottom` uses `useListBottomPadding()`; the
  floating tab pill is over this screen.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @quran-corpus/mobile test && pnpm -r type-check && pnpm -r lint`
Expected: PASS.

- [ ] **Step 5: Mutation-check (§4)**

Change the juz row's link params to `ayah: '1'`. Expected: the juz-2 test
FAILS. Restore by re-editing.

- [ ] **Step 6: Commit**

```bash
git add 'apps/mobile/app/(tabs)/surahs.tsx' apps/mobile/src/screens/SurahsScreen.tsx \
        apps/mobile/src/screens/SurahsTab.test.tsx apps/mobile/src/components/SurahList.tsx \
        apps/mobile/src/data/corpusRepository.ts apps/mobile/src/i18n/uiStrings.ts
git commit -m "feat(mobile): browse by surah, juz, page or revelation order"
```

---

### Task 4: §5 stop, then build

- [ ] **Step 1: Self-review** the diff against DRY / SOLID / OWASP.
- [ ] **Step 2: Stop and ask the owner to run `/code-review`** — new
  `packages/data` queries (§5). Plain `/code-review`, never `ultra` unprompted.
- [ ] **Step 3: Act on the findings.** One pass. Say what is declined and why.
- [ ] **Step 4: Build.**

```bash
cd apps/mobile && pnpm prebuild:assert-db && eas build --platform android --profile preview
```

---

### Task 5: Device run

| # | Check | Pass condition |
| --- | --- | --- |
| 61 | Switch through all four modes | Each list renders; switching is instant after the first load |
| 62 | Juz 2, juz 15, juz 30 | Open at 2:142, 17:1 and 78:1 respectively — not at ayah 1 of the surah |
| 63 | Page 1, page 300, page 604 | Reader opens on that page's first ayah |
| 64 | Revealed mode | al-Alaq first; Meccan and Medinan headers present; 86 surahs under Meccan |

## Verification Log

| Check | Build | Date | Result | Notes |
| --- | --- | --- | --- | --- |
| 61 | | | | |
| 62 | | | | |
| 63 | | | | |
| 64 | | | | |
