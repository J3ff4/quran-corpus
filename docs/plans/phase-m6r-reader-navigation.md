# Phase M6r — Reader Navigation Repairs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the juz and revealed browse modes navigable, stop the reader
losing the reader's place when the mode changes, and give both reading screens
prev/next surah chevrons.

**Architecture:** Four repairs, one shared spine. `packages/data` gains the
per-surah ranges a juz actually covers, so the juz row can expand instead of
being a bare jump target. `BrowseList` gains disclosure — as a row for juz, as
a section header for the two revelation eras. A module-singleton position store
gives mushaf, translation and word-by-word one current ayah between them.
Surah paging reuses the dictionary's `useEntryPager`, so it changes screen
state rather than navigating.

**Tech Stack:** TypeScript, React Native + Expo, expo-router, Reanimated,
Expo SQLite over the bundled corpus DB, vitest + @testing-library/react with
`@/testing/rnHosts` host stubs.

**Spec:** this file. Owner decisions D41-D50 below were taken 2026-08-28 and
are the spec; there is no separate design doc. `docs/plans/phase-m6-glass-redesign.md`
holds D1-D40 and still governs everything it covers.

**Sequencing:** runs **before** M6h. `phase-m6h-bookmarks-notes.md` and
`phase-m6i-settings-about.md` already exist as files, so this phase takes the
out-of-band letter `r` (reader repairs) rather than renumbering two written
plans and every `STATUS.md` line that names them.

---

## Owner decisions (the spec)

- **D41** — A juz row expands in place to the surah ranges it covers. Tapping
  the row **only** expands; the ranges under it are what open the reader.
- **D42** — Juz rows arrive **collapsed**. *Assumption, not an owner ruling:*
  the tab's job is a 30-row index, and auto-expanding makes it ~120 rows for no
  gain. D41's "expand only" reads as a closed start. Flag on the device run.
- **D43** — The revealed tab's Meccan and Medinan headers become disclosures,
  and both arrive **expanded** — exactly today's list plus a chevron.
- **D44** — Disclosure state is **not** persisted and does not survive leaving
  the tab. No new storage, no settings key, no migration.
- **D45** — Counts on both: `Juz 1 · 148 ayahs`, `MECCAN 86`.
- **D46** — Mushaf, Translation and Words share **one** reading position, in
  both directions. Reading 2:50 and switching mode lands on 2:50; opening Words
  lands on 2:50; paging Words to 2:55 and pressing back leaves the reader on
  2:55.
- **D47** — Prev/next **surah** chevrons flank the surah name in the reader
  header. Disabled at surah 1 and 114. **No wrapping.**
- **D48** — Surah paging happens **in place** — screen state, not navigation —
  sliding the way the dictionary's entry pager does. Back returns to the surah
  list, not to the previous surah.
- **D49** — The word-by-word screen gets the same chevrons.
- **D50** — The reader never crosses a surah boundary by scrolling. Each
  surah's list still ends at its last ayah; moving on is always a deliberate tap.

## Global Constraints

- **§5 fires.** Task 1 changes `packages/data` queries. The agent cannot launch
  `/code-review`; it stops after Task 1 and asks the owner to run it.
- **§2** — the juz-range query lives in `packages/data/src/queries/browse.ts`
  and reaches the app through `@quran-corpus/data/mobile`. No copy in
  `apps/mobile`.
- **No schema change and no new index** (M6c's standing rule). The new query is
  one grouped scan of 6,236 rows, run once per mode switch.
- **No new dependency** (§12). Everything here is already installed.
- **No user-DB write anywhere in this phase.** D44 removes the only candidate.
  M6h still owns the first write to on-device state.
- **Never `router.replace` on a `[param]` screen** — it remounts, killing refs,
  the exit animation, and running a second header transition on top
  (`docs/plans/phase-m6f-audio.md`, and the `/dictionary/[root]` bug on web).
- **WCAG AA (§8)** — every disclosure exposes `accessibilityState.expanded`;
  every chevron keeps a 48dp target; `prefers-reduced-motion` is honoured by
  `pagerAnimation`, which already cross-fades under it.
- **Mutation-check every branch** (§4 step 4). Restore a mutation by re-editing
  or from a scratchpad copy — **never** `git checkout <file>` / `git restore`.
  Python is not involved here, so the `__pycache__` trap does not apply.
- **§10** — `apps/mobile` has no emulator in CI. Task 10's device checklist is
  the gate; "implementation complete, verification pending" is not a pass.

---

### Task 1: juz ranges in `packages/data`

The juz index points at one ayah and says nothing about the juz's extent, so
nothing downstream can render what juz 1 contains. Extend the existing query
rather than adding a second one: the start ayah and the ranges come out of the
same grouping, and two queries over the same rows is where one gains a fix and
the other keeps the bug.

`JuzEntry` keeps every field it has today — web is not a caller now, but the
type is exported from `packages/data/src/mobile.ts` and additive is free here.

**Files:**
- Modify: `packages/data/src/queries/browse.ts:3-71`
- Modify: `packages/data/src/mobile.ts:24-25`
- Test: `packages/data/tests/browse.test.ts:69-100`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `JuzSurahRange { surahId: number; surahName: string; firstAyahNumber: number; lastAyahNumber: number; ayahCount: number }`
  and `JuzEntry.ranges: JuzSurahRange[]`, ordered in mushaf order. Task 3 reads both.

- [x] **Step 1: Write the failing tests**

Append to the existing `describe('getJuzIndex')` in
`packages/data/tests/browse.test.ts`. The fixture at the top of that file
already covers the case that matters — juz 3 runs `2:9 | 3:1 3:2`, so it
crosses a surah boundary and has two ranges.

```ts
  it('reports the surah ranges a juz covers, in mushaf order', async () => {
    const rows = await getJuzIndex(db);

    // Juz 1 is 1:1-1:3 then 2:1-2:2 (see the fixture header).
    expect(rows[0]?.ranges).toEqual([
      { surahId: 1, surahName: 'Al-Fatihah', firstAyahNumber: 1, lastAyahNumber: 3, ayahCount: 3 },
      { surahId: 2, surahName: 'Al-Baqarah', firstAyahNumber: 1, lastAyahNumber: 2, ayahCount: 2 },
    ]);
  });

  it('orders the ranges by surah, not by ayahs.id', async () => {
    const rows = await getJuzIndex(db);

    // Surah 1's ayahs carry ids 20-22, above every other row -- what a
    // delete-and-re-import leaves behind. A query that ordered by id would put
    // Al-Baqarah first here and the juz would claim to open at 2:1.
    expect(rows[0]?.ranges.map((range) => range.surahId)).toEqual([1, 2]);
    // Juz 3 is 2:9 then 3:1-3:2: one ayah of al-Baqarah, then Aal-Imran.
    expect(rows[2]?.ranges).toEqual([
      { surahId: 2, surahName: 'Al-Baqarah', firstAyahNumber: 9, lastAyahNumber: 9, ayahCount: 1 },
      { surahId: 3, surahName: 'Aal-Imran', firstAyahNumber: 1, lastAyahNumber: 2, ayahCount: 2 },
    ]);
  });

  it('keeps the start ayah and the total agreeing with the ranges', async () => {
    const rows = await getJuzIndex(db);

    for (const row of rows) {
      const first = row.ranges[0];
      expect(first).toBeDefined();
      expect(row.startSurahId).toBe(first?.surahId);
      expect(row.startAyahNumber).toBe(first?.firstAyahNumber);
      expect(row.ayahCount).toBe(row.ranges.reduce((total, range) => total + range.ayahCount, 0));
    }
  });
```

- [x] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @quran-corpus/data test -- browse`
Expected: FAIL — `rows[0].ranges` is `undefined`.

- [x] **Step 3: Replace the query**

In `packages/data/src/queries/browse.ts`, add the type above `JuzEntry` and
give `JuzEntry` its new field:

```ts
/** One surah's slice of a juz. Juz are contiguous slabs of the mushaf, so a
 *  (juz, surah) pair is always one unbroken run of ayah numbers -- which is
 *  what makes MIN/MAX safe here and is *not* true of the juz as a whole (see
 *  getJuzIndex below). */
export interface JuzSurahRange {
  surahId: number;
  surahName: string;
  firstAyahNumber: number;
  lastAyahNumber: number;
  ayahCount: number;
}

export interface JuzEntry {
  juz: number;
  startSurahId: number;
  startAyahNumber: number;
  surahName: string;
  ayahCount: number;
  /** Every surah the juz touches, in mushaf order. The browse tab expands a
   *  juz row into these; the first of them is what the other four fields
   *  describe. */
  ranges: JuzSurahRange[];
}
```

Then replace the body of `getJuzIndex` (keep the docstring above it, and add
the paragraph below to it):

```ts
export async function getJuzIndex(client: QueryClient): Promise<JuzEntry[]> {
  // Grouped per (juz, surah) rather than windowed per juz, because the tab now
  // needs both answers and one scan gives them: the ranges are the groups, and
  // the juz's own start is the first group's first ayah.
  //
  // MIN/MAX on ayah_number is correct *because* the group is pinned to one
  // surah -- inside a single surah a juz is one contiguous run. Across a juz
  // it would not be: the two aggregates are independent, and for juz 3
  // (2:253 -> 3:92) they answer 2:1, a real ayah in a different juz. That is
  // what the ORDER BY below protects, and why the first group -- not MIN of
  // anything -- is the start.
  //
  // ORDER BY a.surah_id, not ayahs.id: `id` is AUTOINCREMENT, so re-importing
  // one surah after a delete hands it the highest ids in the table and every
  // juz it touches would report its ranges in the wrong order. `surah_id` is
  // the mushaf number and cannot drift.
  const result = await client.execute(`
    SELECT a.juz              AS juz,
           a.surah_id         AS surah_id,
           s.name_translit    AS surah_name,
           MIN(a.ayah_number) AS first_ayah_number,
           MAX(a.ayah_number) AS last_ayah_number,
           COUNT(*)           AS ayah_count
    FROM ayahs  a
    JOIN surahs s ON s.id = a.surah_id
    WHERE a.juz IS NOT NULL
    GROUP BY a.juz, a.surah_id
    ORDER BY a.juz, a.surah_id
  `);

  const byJuz = new Map<number, JuzEntry>();
  for (const row of result.rows) {
    const juz = Number(row['juz']);
    const range: JuzSurahRange = {
      surahId: Number(row['surah_id']),
      surahName: String(row['surah_name']),
      firstAyahNumber: Number(row['first_ayah_number']),
      lastAyahNumber: Number(row['last_ayah_number']),
      ayahCount: Number(row['ayah_count']),
    };

    const existing = byJuz.get(juz);
    if (existing) {
      existing.ranges.push(range);
      existing.ayahCount += range.ayahCount;
      continue;
    }

    // The first row of a juz is its opening range, because the SQL ordered it
    // so. Nothing below re-derives the start from the accumulated ranges.
    byJuz.set(juz, {
      juz,
      startSurahId: range.surahId,
      startAyahNumber: range.firstAyahNumber,
      surahName: range.surahName,
      ayahCount: range.ayahCount,
      ranges: [range],
    });
  }

  // Insertion order is juz order: the SQL sorted by it and Map preserves it.
  return [...byJuz.values()];
}
```

- [x] **Step 4: Export the new type**

`packages/data/src/mobile.ts:25` — add `JuzSurahRange` to the type export:

```ts
export type { JuzEntry, JuzSurahRange, PageEntry, RevealedEntry } from './queries/browse.js';
```

- [x] **Step 5: Run the whole data suite**

Run: `pnpm --filter @quran-corpus/data test`
Expected: PASS, including the four pre-existing `getJuzIndex` tests — the start
ayah, the mid-surah start, the counts and the null-juz exclusion all still hold.

- [x] **Step 6: Mutation-check the ordering**

Change `ORDER BY a.juz, a.surah_id` to `ORDER BY a.juz, a.surah_id DESC`.

Run: `pnpm --filter @quran-corpus/data test -- browse`
Expected: FAIL on *orders the ranges by surah, not by ayahs.id* **and** on the
pre-existing mid-surah start test. If either passes, the assertion is vacuous —
fix the test before restoring.

Restore by re-editing the line back to `ORDER BY a.juz, a.surah_id`. **Do not**
`git checkout` the file.

- [x] **Step 7: Mutation-check the accumulator**

Change `existing.ayahCount += range.ayahCount;` to `existing.ayahCount = range.ayahCount;`.

Run: `pnpm --filter @quran-corpus/data test -- browse`
Expected: FAIL on *counts the ayahs in each juz* (juz 1 reports 2, not 5) and on
*keeps the start ayah and the total agreeing with the ranges*.

Restore by re-editing.

- [x] **Step 8: Re-export check**

Run: `pnpm --filter @quran-corpus/data test -- mobile-entry`
Expected: PASS. The mobile entry guard asserts the module graph, and this task
adds no runtime import — the new type is erased.

- [x] **Step 9: Commit**

```bash
git add packages/data/src/queries/browse.ts packages/data/src/mobile.ts packages/data/tests/browse.test.ts
git commit -m "feat(data): report the surah ranges each juz covers

The juz index pointed at one ayah and said nothing about the juz's
extent, so the browse tab could only offer a jump to its first ayah --
juz 1 opened al-Fatihah with no path on to its 141 ayahs of al-Baqarah.

One grouped scan replaces the windowed one and answers both: the ranges
are the (juz, surah) groups, and the juz's start is the first group's
first ayah rather than an aggregate over the whole juz."
```

- [x] **Step 10: STOP — §5 gate**

This task changed `packages/data` queries, which is a §5 trigger. The agent
cannot launch `/code-review`. Stop here, tell the owner the trigger and what
changed, and ask them to run plain `/code-review` (Pro plan, local — **not**
`ultra`, which bills). Read the findings, fix what is real, say plainly which
are declined and why. One pass, not a loop to green.

---

### Task 2: disclosure in `BrowseList`

Two disclosures with different chrome: a juz is a **row** that opens into child
rows; an era is a **section header** that opens into its surahs. Both go
through `BrowseList` so a fix to one reaches the other, but they stay two
shapes rather than one configurable disclosure — the visuals genuinely differ
and a single abstraction for two call sites would be a knob, not a saving.

**Files:**
- Modify: `apps/mobile/src/components/icons/Icon.tsx:15-16,74-75`
- Modify: `apps/mobile/src/components/BrowseList.tsx`
- Test: `apps/mobile/src/components/BrowseList.test.tsx` (create — there is no test for this component today)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `BrowseItem.expanded?: boolean` — renders a chevron (down when true, right when false) at the row's trailing edge and sets `accessibilityState={{ expanded }}`. Omitted = no chevron, exactly today's row.
  - `BrowseItem.indent?: boolean` — a child row: extra leading inset, no medallion.
  - `BrowseSection.count?: number` — rendered right-aligned in the header.
  - `BrowseSection.expanded?: boolean` and `BrowseSection.onToggle?: () => void` — together make the header a button; `expanded === false` renders the section with no rows. Omitted = a plain header, exactly today.
  - Icon name `'chevronDown'`.

- [x] **Step 1: Add the chevron glyph**

`apps/mobile/src/components/icons/Icon.tsx` — add `| 'chevronDown'` to
`IconName` after `'chevronRight'`, and to `PATHS`:

```ts
  chevronDown: ['M5 8.5l7 7 7-7'],
```

Same 24-box and same stroke as `chevronLeft`/`chevronRight`, rotated a quarter
turn — drawn rather than a `‹` glyph for the reason recorded in AdjacentNav: a
text chevron sits wherever its font's side bearings put it.

- [x] **Step 2: Write the failing tests**

Create `apps/mobile/src/components/BrowseList.test.tsx`, following
`SurahList.test.tsx`'s host-stub pattern:

```tsx
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowseList, type BrowseItem } from './BrowseList';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
vi.mock('@/theme/themeContext', () => ({ useThemeColors: () => ({ text: '#000', mutedText: '#666', accent: '#a60' }) }));
vi.mock('@/theme/useListBottomPadding', () => ({ useListBottomPadding: () => 0 }));

function item(overrides: Partial<BrowseItem> = {}): BrowseItem {
  return {
    key: 'juz-1',
    leading: '1',
    title: 'Juz 1',
    accessibilityLabel: 'Juz 1',
    onPress: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

describe('BrowseList disclosure rows', () => {
  it('draws no chevron on a row that is not a disclosure', () => {
    render(<BrowseList items={[item()]} />);
    expect(screen.queryByTestId('browse-chevron-juz-1')).toBeNull();
  });

  it('points the chevron down when the row is expanded and right when it is not', () => {
    const { rerender } = render(<BrowseList items={[item({ expanded: false })]} />);
    expect(screen.getByTestId('browse-chevron-juz-1')).toHaveAttribute('data-icon', 'chevronRight');

    rerender(<BrowseList items={[item({ expanded: true })]} />);
    expect(screen.getByTestId('browse-chevron-juz-1')).toHaveAttribute('data-icon', 'chevronDown');
  });

  it('announces the disclosure state to a screen reader', () => {
    render(<BrowseList items={[item({ expanded: false })]} />);
    // Without this a chevron is decoration: TalkBack reads the row as a plain
    // button and never says the surah ranges under it exist.
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');
  });
});

describe('BrowseList collapsible sections', () => {
  const meccan = { title: 'Meccan', count: 2, data: [item({ key: 'a', title: 'Al-Alaq' })] };

  it('renders a plain header when the section is not collapsible', () => {
    render(<BrowseList sections={[{ title: 'Meccan', data: [item({ key: 'a', title: 'Al-Alaq' })] }]} />);
    expect(screen.getByText('Al-Alaq')).toBeTruthy();
    expect(screen.queryByTestId('browse-section-chevron-Meccan')).toBeNull();
  });

  it('shows the count and toggles on press', () => {
    const onToggle = vi.fn();
    render(<BrowseList sections={[{ ...meccan, expanded: true, onToggle }]} />);

    expect(screen.getByText('2')).toBeTruthy();
    fireEvent.click(screen.getByTestId('browse-section-Meccan'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders no rows while the section is collapsed', () => {
    render(<BrowseList sections={[{ ...meccan, expanded: false, onToggle: vi.fn() }]} />);

    expect(screen.getByText('Meccan')).toBeTruthy();
    expect(screen.queryByText('Al-Alaq')).toBeNull();
  });
});
```

If `@/testing/rnHosts`'s `Icon` stub does not already emit `data-icon`, add the
`Icon` mock to this file instead:

```tsx
vi.mock('./icons/Icon', () => ({
  Icon: ({ name, testID }: { name: string; testID?: string }) => <span data-icon={name} data-testid={testID} />,
}));
```

- [x] **Step 3: Run them and watch them fail**

Run: `pnpm --filter @quran-corpus/mobile test -- BrowseList`
Expected: FAIL — the file has no chevron and `BrowseSection` has no `expanded`.

- [x] **Step 4: Extend the types**

In `apps/mobile/src/components/BrowseList.tsx`:

```ts
export interface BrowseItem {
  key: string;
  leading: string;
  title: string;
  subtitle?: string;
  arabic?: string;
  accessibilityLabel: string;
  testID?: string;
  /** Present makes the row a disclosure: it draws a chevron and announces its
   *  state. The row still owns what pressing it does -- BrowseList never
   *  toggles anything itself, because the open set belongs to the screen. */
  expanded?: boolean;
  /** A child of a disclosure row: inset, and no medallion. */
  indent?: boolean;
  onPress: () => void;
}

export interface BrowseSection {
  title: string;
  data: BrowseItem[];
  /** Rendered right-aligned in the header. How many rows are behind it, which
   *  a collapsed header cannot otherwise say. */
  count?: number;
  /** Together these make the header a disclosure button. `false` renders the
   *  section with no rows -- emptied here rather than at the call site so a
   *  collapsed section cannot forget to keep its header. */
  expanded?: boolean;
  onToggle?: () => void;
}
```

- [x] **Step 5: Render the row chevron and the indent**

Inside `Row`, add the import (`import { Icon } from './icons/Icon';`) and pass
the disclosure state to the Pressable:

```tsx
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={item.accessibilityLabel}
      // Named separately from the label: a chevron announces as nothing, and
      // without this TalkBack reads a disclosure exactly like a row that
      // navigates.
      {...(item.expanded === undefined ? {} : { accessibilityState: { expanded: item.expanded } })}
      onPress={item.onPress}
```

and inside the `GlassSurface`, replace the leading `Text` and add the trailing
chevron:

```tsx
        {item.indent ? (
          // No medallion on a child: the number belongs to the juz above it,
          // and repeating it under every range reads as four juz.
          <View style={{ width: 34 }} />
        ) : (
          <Text
            style={{
              color: theme.accent,
              fontFamily: fonts.displaySemiBold,
              fontSize: typography.body,
              minWidth: 34,
              textAlign: 'center',
            }}
          >
            {item.leading}
          </Text>
        )}
```

then after the `item.arabic` block, before `</GlassSurface>`:

```tsx
        {item.expanded === undefined ? null : (
          <Icon
            testID={`browse-chevron-${item.key}`}
            name={item.expanded ? 'chevronDown' : 'chevronRight'}
            color={theme.mutedText}
            size={18}
          />
        )}
```

- [x] **Step 6: Render the section header as a disclosure**

Replace `renderSectionHeader` in the `SectionList` branch:

```tsx
        renderSectionHeader={({ section }) => {
          const label = (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 14, paddingBottom: 6 }}>
              {section.onToggle ? (
                <Icon
                  testID={`browse-section-chevron-${section.title}`}
                  name={section.expanded === false ? 'chevronRight' : 'chevronDown'}
                  color={theme.mutedText}
                  size={16}
                />
              ) : null}
              <Text
                accessibilityRole="header"
                style={{
                  flex: 1,
                  color: theme.mutedText,
                  fontFamily: fonts.displaySemiBold,
                  fontSize: typography.caption,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                }}
              >
                {section.title}
              </Text>
              {section.count === undefined ? null : (
                <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
                  {String(section.count)}
                </Text>
              )}
            </View>
          );

          if (!section.onToggle) return label;
          return (
            <Pressable
              testID={`browse-section-${section.title}`}
              accessibilityRole="button"
              accessibilityLabel={section.title}
              accessibilityState={{ expanded: section.expanded !== false }}
              onPress={section.onToggle}
              // The header is a short strip; the 48dp floor is what makes it a
              // thumb target rather than a 26dp line of small caps.
              style={{ minHeight: touchTargets.minimum, justifyContent: 'center' }}
            >
              {label}
            </Pressable>
          );
        }}
```

and empty a collapsed section's rows where the sections are handed to the list:

```tsx
  if (sections) {
    // Emptied here, not at the call site: a screen that filtered its own rows
    // would have to remember to keep the header, and a section that loses its
    // header can never be reopened.
    const rendered = sections.map((section) =>
      section.expanded === false ? { ...section, data: [] } : section,
    );

    return (
      <SectionList
        sections={rendered}
```

- [x] **Step 7: Run the tests**

Run: `pnpm --filter @quran-corpus/mobile test -- BrowseList`
Expected: PASS, all seven.

- [x] **Step 8: Mutation-check the collapse**

Change `section.expanded === false ? { ...section, data: [] } : section` to
`section`.

Run: `pnpm --filter @quran-corpus/mobile test -- BrowseList`
Expected: FAIL on *renders no rows while the section is collapsed*. A pass here
means the test asserts nothing.

Restore by re-editing.

- [x] **Step 9: Commit**

```bash
git add apps/mobile/src/components/BrowseList.tsx apps/mobile/src/components/BrowseList.test.tsx apps/mobile/src/components/icons/Icon.tsx
git commit -m "feat(mobile): disclosure rows and collapsible sections in BrowseList

Two shapes rather than one configurable disclosure: a juz is a row that
opens into child rows, an era is a section header that opens into its
surahs, and the chrome genuinely differs. Both announce
accessibilityState.expanded -- a chevron on its own is decoration, and
TalkBack would otherwise read a disclosure exactly like a row that
navigates."
```

---

### Task 3: expandable juz rows

**Files:**
- Modify: `apps/mobile/src/screens/SurahsScreen.tsx:107-125` (the `juzItems` memo) and its state block
- Test: `apps/mobile/src/screens/SurahsTab.test.tsx`

**Interfaces:**
- Consumes: `JuzEntry.ranges` (Task 1), `BrowseItem.expanded` / `.indent` (Task 2).
- Produces: nothing later tasks read.

- [x] **Step 1: Write the failing tests**

The existing `juz3` fixture in `SurahsTab.test.tsx` needs `ranges`. Add them,
then append tests. Find the fixture (near line 90) and give it:

```ts
  ranges: [
    { surahId: 2, surahName: 'Al-Baqara', firstAyahNumber: 9, lastAyahNumber: 9, ayahCount: 1 },
    { surahId: 3, surahName: 'Aal-Imran', firstAyahNumber: 1, lastAyahNumber: 2, ayahCount: 2 },
  ],
```

New tests inside `describe('SurahsTab')`:

```tsx
  it('opens the juz tab with every juz collapsed', async () => {
    render(<SurahsTab />);
    fireEvent.click(screen.getByText('Juz'));

    expect(await screen.findByText('Juz 3')).toBeTruthy();
    // The ranges are what navigate; none of them is on screen yet.
    expect(screen.queryByText('Al-Baqara 9–9')).toBeNull();
  });

  it('expands a juz into its surah ranges and does not navigate', async () => {
    render(<SurahsTab />);
    fireEvent.click(screen.getByText('Juz'));
    fireEvent.click(await screen.findByTestId('browse-juz-3'));

    expect(await screen.findByText('Al-Baqara 9–9')).toBeTruthy();
    expect(screen.getByText('Aal-Imran 1–2')).toBeTruthy();
    // D41: the row is a disclosure and nothing else.
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('opens the reader at the range that was tapped', async () => {
    render(<SurahsTab />);
    fireEvent.click(screen.getByText('Juz'));
    fireEvent.click(await screen.findByTestId('browse-juz-3'));
    fireEvent.click(await screen.findByText('Aal-Imran 1–2'));

    expect(mocks.push).toHaveBeenCalledWith({
      pathname: '/surah/[surahId]',
      params: { surahId: '3', ayah: '1' },
    });
  });

  it('collapses a juz that is tapped again', async () => {
    render(<SurahsTab />);
    fireEvent.click(screen.getByText('Juz'));
    fireEvent.click(await screen.findByTestId('browse-juz-3'));
    expect(await screen.findByText('Al-Baqara 9–9')).toBeTruthy();

    fireEvent.click(screen.getByTestId('browse-juz-3'));
    expect(screen.queryByText('Al-Baqara 9–9')).toBeNull();
  });
```

- [x] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @quran-corpus/mobile test -- SurahsTab`
Expected: FAIL — tapping the juz row navigates today, so *does not navigate*
and the two range tests fail.

- [x] **Step 3: Hold the open set**

In `SurahsScreen`, beside the existing `mode` state:

```ts
  // A Set, not a single open juz: an accordion that shuts one juz to open
  // another hides a range the reader was comparing against. D44 keeps this in
  // component state and nowhere else -- leaving the tab resets it, and nothing
  // is persisted.
  const [openJuz, setOpenJuz] = useState<ReadonlySet<number>>(new Set());
```

and reset it wherever the mode changes, so returning to the juz list is the
default view rather than whatever was left open two modes ago:

```ts
  const onChangeMode = useCallback((next: BrowseMode) => {
    setOpenJuz(new Set());
    setOpenEras(new Set());
    setMode(next);
  }, []);
```

(`setOpenEras` arrives in Task 4; write `onChangeMode` with both now and wire
the `SegmentedControl` to `onChangeMode` instead of `setMode`.)

- [x] **Step 4: Build the rows**

Replace the `juzItems` memo:

```ts
  const juzItems = useMemo<BrowseItem[]>(() => {
    const rows: BrowseItem[] = [];
    for (const entry of data.juz ?? []) {
      const expanded = openJuz.has(entry.juz);
      rows.push({
        key: `juz-${entry.juz}`,
        testID: `browse-juz-${entry.juz}`,
        leading: String(entry.juz),
        title: `${t(uiLocale, 'browse.juzLabel')} ${entry.juz}`,
        // The "opens at" subtitle is gone: the ranges under the row say where
        // the juz starts and where it ends, which the old subtitle only half
        // said. D45 keeps the total.
        subtitle: `${entry.ayahCount} ${t(uiLocale, 'surahList.ayahsSuffix')}`,
        accessibilityLabel: `${t(uiLocale, 'browse.juzLabel')} ${entry.juz}, ${entry.ayahCount} ${t(uiLocale, 'surahList.ayahsSuffix')}`,
        expanded,
        onPress: () =>
          setOpenJuz((current) => {
            const next = new Set(current);
            if (!next.delete(entry.juz)) next.add(entry.juz);
            return next;
          }),
      });

      if (!expanded) continue;
      for (const range of entry.ranges) {
        rows.push({
          key: `juz-${entry.juz}-surah-${range.surahId}`,
          testID: `browse-juz-${entry.juz}-surah-${range.surahId}`,
          leading: '',
          indent: true,
          title: `${range.surahName} ${range.firstAyahNumber}–${range.lastAyahNumber}`,
          accessibilityLabel: `${range.surahName}, ${t(uiLocale, 'wbw.rangeLabel')} ${range.firstAyahNumber}–${range.lastAyahNumber}`,
          onPress: () => openAyah(range.surahId, range.firstAyahNumber),
        });
      }
    }
    return rows;
  }, [data.juz, openJuz, uiLocale]);
```

`wbw.rangeLabel` is already "Ayahs" / "Oyatlar" / "Аяты" in all three locales —
reused rather than adding a fourth key that would say the same word.

- [x] **Step 5: Run the tests**

Run: `pnpm --filter @quran-corpus/mobile test -- SurahsTab`
Expected: PASS, including the pre-existing cache and failure tests.

- [x] **Step 6: Mutation-check the toggle**

Change `if (!next.delete(entry.juz)) next.add(entry.juz);` to
`next.add(entry.juz);`.

Run: `pnpm --filter @quran-corpus/mobile test -- SurahsTab`
Expected: FAIL on *collapses a juz that is tapped again*.

Restore by re-editing.

- [x] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/SurahsScreen.tsx apps/mobile/src/screens/SurahsTab.test.tsx
git commit -m "feat(mobile): expand a juz row into the surah ranges it covers

Juz 1 opened al-Fatihah and stopped there -- the reader is surah-scoped,
so the 141 ayahs of al-Baqarah in the same juz were unreachable from the
tab that named them. The row is now a disclosure (D41) and the ranges
under it are what open the reader."
```

---

### Task 4: collapsible revelation eras

**Files:**
- Modify: `apps/mobile/src/screens/SurahsScreen.tsx:135-160` (the `revealedSections` memo)
- Test: `apps/mobile/src/screens/SurahsTab.test.tsx`

**Interfaces:**
- Consumes: `BrowseSection.count` / `.expanded` / `.onToggle` (Task 2), `onChangeMode`/`setOpenEras` (Task 3 Step 3).
- Produces: nothing.

- [x] **Step 1: Write the failing tests**

```tsx
  it('opens the revealed tab with both eras expanded and counted', async () => {
    render(<SurahsTab />);
    fireEvent.click(screen.getByText('Revealed'));

    // D43: exactly today's list, plus a chevron.
    expect(await screen.findByText('Al-Alaq')).toBeTruthy();
    expect(screen.getByText('Al-Baqara')).toBeTruthy();
    expect(screen.getByTestId('browse-section-chevron-Meccan')).toBeTruthy();
  });

  it('collapses one era without touching the other', async () => {
    render(<SurahsTab />);
    fireEvent.click(screen.getByText('Revealed'));
    fireEvent.click(await screen.findByTestId('browse-section-Meccan'));

    expect(screen.queryByText('Al-Alaq')).toBeNull();
    expect(screen.getByText('Al-Baqara')).toBeTruthy();
    // The header survives its own collapse, or there is nothing to reopen.
    expect(screen.getByTestId('browse-section-Meccan')).toBeTruthy();
  });

  it('forgets the collapse when the mode changes and comes back', async () => {
    render(<SurahsTab />);
    fireEvent.click(screen.getByText('Revealed'));
    fireEvent.click(await screen.findByTestId('browse-section-Meccan'));
    expect(screen.queryByText('Al-Alaq')).toBeNull();

    fireEvent.click(screen.getByText('Surah'));
    fireEvent.click(screen.getByText('Revealed'));

    // D44: nothing is persisted, and the tab arrives in its default state.
    expect(await screen.findByText('Al-Alaq')).toBeTruthy();
  });
```

- [x] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @quran-corpus/mobile test -- SurahsTab`
Expected: FAIL — there is no `browse-section-Meccan`.

- [x] **Step 3: Hold the collapsed set**

Beside `openJuz`:

```ts
  // Collapsed, not expanded: D43 arrives with both eras open, so an empty set
  // is the default state and no seeding is needed when the rows load.
  const [openEras, setOpenEras] = useState<ReadonlySet<string>>(new Set());
```

- [x] **Step 4: Wire the sections**

In `revealedSections`, replace the two places a section is created and pushed.
Where the item is built, leave it untouched; change the section push and add the
disclosure fields:

```ts
      if (current?.title === title) current.data.push(item);
      else
        sections.push({
          title,
          data: [item],
          count: 0,
          expanded: !openEras.has(title),
          onToggle: () =>
            setOpenEras((currentSet) => {
              const next = new Set(currentSet);
              if (!next.delete(title)) next.add(title);
              return next;
            }),
        });
    }
    // Counted after the loop rather than incremented alongside the push: the
    // count is the section's length, and two places that both have to be right
    // is one place too many.
    for (const section of sections) section.count = section.data.length;
    return sections;
  }, [data.revealed, openEras, uiLocale]);
```

`openEras` keys on the *translated* era title, which is also the key the
section renders under; a language change clears every cached mode
(`setData({})`) and re-runs this memo, so a stale key cannot outlive its label.

- [x] **Step 5: Run the tests**

Run: `pnpm --filter @quran-corpus/mobile test -- SurahsTab`
Expected: PASS.

- [x] **Step 6: Mutation-check the reset**

In `onChangeMode`, delete `setOpenEras(new Set());`.

Run: `pnpm --filter @quran-corpus/mobile test -- SurahsTab`
Expected: FAIL on *forgets the collapse when the mode changes and comes back*.

Restore by re-editing.

- [x] **Step 7: Full mobile suite**

Run: `pnpm --filter @quran-corpus/mobile test`
Expected: PASS. 654 tests before this phase; the count grows.

- [x] **Step 8: Commit**

```bash
git add apps/mobile/src/screens/SurahsScreen.tsx apps/mobile/src/screens/SurahsTab.test.tsx
git commit -m "feat(mobile): collapsible Meccan and Medinan sections

Both arrive expanded (D43), so the tab is what it was plus a chevron and
a count. Nothing is persisted (D44): leaving the mode resets both this
and the juz open set."
```

---

### Task 5: one reading position, and re-anchoring on a mode switch

`SurahReader.tsx:415` reads `const Plate = readerMode === 'mushaf' ? MushafPlate : Fragment;`.
The *element type* at that position changes on every mode switch, so React
unmounts the whole subtree including the `FlatList`; the replacement starts at
offset 0 and the landing effect only knows `initialAyahNumber`, which is absent
whenever the reader was entered from the surah list.

Keeping the list mounted would not fix it on its own — a mushaf ayah and a
translation card are wildly different heights, so the preserved pixel offset
points at a different ayah. Re-anchoring is the fix either way, so the plate
stays as it is.

**Files:**
- Create: `apps/mobile/src/data/readerPosition.ts`
- Create: `apps/mobile/src/data/readerPosition.test.ts`
- Modify: `apps/mobile/src/components/SurahReader.tsx`
- Test: `apps/mobile/src/components/SurahReader.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `setReaderPosition(surahId: number, ayahNumber: number): void`
  - `getReaderPosition(surahId: number): number | null` — null when the store holds a different surah or nothing.
  - `clearReaderPosition(): void` — tests only.
  Tasks 6 and 9 both read and write it.

- [x] **Step 1: Write the store's failing test**

`apps/mobile/src/data/readerPosition.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { clearReaderPosition, getReaderPosition, setReaderPosition } from './readerPosition';

beforeEach(clearReaderPosition);

describe('readerPosition', () => {
  it('has no position before anything is read', () => {
    expect(getReaderPosition(2)).toBeNull();
  });

  it('answers only for the surah it was written for', () => {
    setReaderPosition(2, 50);

    expect(getReaderPosition(2)).toBe(50);
    // Not 50 for surah 3: an ayah number carried across surahs would open
    // Aal-Imran at 50 because al-Baqarah was left there.
    expect(getReaderPosition(3)).toBeNull();
  });

  it('keeps only the latest position', () => {
    setReaderPosition(2, 50);
    setReaderPosition(2, 55);

    expect(getReaderPosition(2)).toBe(55);
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/mobile test -- readerPosition`
Expected: FAIL — the module does not exist.

- [x] **Step 3: Write the store**

`apps/mobile/src/data/readerPosition.ts`:

```ts
/**
 * Where the reader is, shared between the three ways of reading one surah.
 *
 * Mushaf, translation and word-by-word are one reading in the user's head and
 * three renderings in ours -- two of them behind the same route, one behind
 * another. D46 says the ayah carries between all three in both directions.
 *
 * ponytail: a module singleton, not a context and not the user database. A
 * context would re-render every consumer on a value written from the reader's
 * scroll handler on every frame; the user database is asynchronous, debounced,
 * and is device state a phone keeps across app updates -- far too much
 * machinery for "which ayah is on screen right now". One reader is open at a
 * time, so one slot is enough.
 *
 * Deliberately NOT the saved reading position in SQLite: that one is a
 * durable bookmark written on a debounce, and reading it back would answer
 * with wherever the debounce last landed rather than where the user is.
 */
let current: { surahId: number; ayahNumber: number } | null = null;

export function setReaderPosition(surahId: number, ayahNumber: number): void {
  current = { surahId, ayahNumber };
}

/** The position within `surahId`, or null if the store is on another surah.
 *  Scoped by surah on purpose: an ayah number is only meaningful inside one. */
export function getReaderPosition(surahId: number): number | null {
  return current?.surahId === surahId ? current.ayahNumber : null;
}

/** Tests only. The app has no reason to forget where the reader is. */
export function clearReaderPosition(): void {
  current = null;
}
```

- [x] **Step 4: Run it**

Run: `pnpm --filter @quran-corpus/mobile test -- readerPosition`
Expected: PASS.

- [x] **Step 5: Write the reader's failing test**

Append to `apps/mobile/src/components/SurahReader.test.tsx`. Mock the store so
the assertion is about what the reader does with it, not about the singleton:

```tsx
const positionMocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('@/data/readerPosition', () => ({
  getReaderPosition: (...args: unknown[]) => positionMocks.get(...args),
  setReaderPosition: (...args: unknown[]) => positionMocks.set(...args),
}));
```

```tsx
  it('records the first visible ayah as the shared position', () => {
    renderReader({ readerMode: 'translation' });

    // The same callback that writes the saved reading position -- see
    // onViewableItemsChanged.
    fireViewableItems([{ item: { ayah: { id: 50, ayah_number: 50 } } }]);

    expect(positionMocks.set).toHaveBeenCalledWith(2, 50);
  });

  it('lands on the shared position when the reader mode changes', () => {
    positionMocks.get.mockReturnValue(50);
    const { rerender } = renderReader({ readerMode: 'translation' });

    rerender(reader({ readerMode: 'mushaf' }));

    // The plate component changes type, so React unmounts the FlatList and the
    // replacement starts at offset 0. Without the re-anchor the reader lands
    // on ayah 1 -- which is the bug this task exists for.
    expect(scrollToIndex).toHaveBeenLastCalledWith({ index: 49, animated: false });
  });

  it('does not re-anchor when the store has nothing for this surah', () => {
    positionMocks.get.mockReturnValue(null);
    const { rerender } = renderReader({ readerMode: 'translation', initialAyahNumber: null });
    scrollToIndex.mockClear();

    rerender(reader({ readerMode: 'mushaf', initialAyahNumber: null }));

    expect(scrollToIndex).not.toHaveBeenCalled();
  });
```

Reuse whatever the existing file already has for rendering the reader and for
capturing `scrollToIndex` / firing viewable items; add `renderReader`/`reader`
helpers only if it does not.

- [x] **Step 6: Run them and watch them fail**

Run: `pnpm --filter @quran-corpus/mobile test -- SurahReader`
Expected: FAIL — the reader neither writes nor reads the store.

- [x] **Step 7: Write the position on scroll**

In `SurahReader`, import the store and add a surah-id ref beside the existing
ones (`onViewableItemsChanged` is a `useRef` callback created once, outside the
React tree, so it cannot close over a prop):

```ts
import { getReaderPosition, setReaderPosition } from '@/data/readerPosition';
```

```ts
  const surahIdRef = useRef(data.surah.id);
  // The ayah the list is actually showing. Read by the focus effect below to
  // tell "the word-by-word screen moved us" from "nothing changed".
  const lastVisibleRef = useRef<number | null>(null);
```

and extend the existing ref-sync effect:

```ts
  useEffect(() => {
    onReadingAyahRef.current = onReadingAyah;
    loadWordsRef.current = loadWords;
    ayahsRef.current = data.ayahs;
    surahIdRef.current = data.surah.id;
  }, [onReadingAyah, loadWords, data.ayahs, data.surah.id]);
```

then in `onViewableItemsChanged`, alongside the existing reading-position call:

```ts
    if (positionedRef.current && firstVisibleAyah) {
      const ayahNumber = firstVisibleAyah.ayah.ayah_number;
      lastVisibleRef.current = ayahNumber;
      // Synchronous and in-memory, unlike onReadingAyah, which debounces a
      // SQLite write. This is what the other two renderings read.
      setReaderPosition(surahIdRef.current, ayahNumber);
      onReadingAyahRef.current?.(ayahNumber);
    }
```

Gated on `positionedRef` for exactly the reason the reading-position write is:
the rows visible mid-landing are wherever the list happens to be.

- [x] **Step 8: Re-anchor on a mode switch**

Replace the `initialIndex` memo and add the anchor state above it:

```ts
  // The ayah the list must land on. Seeded from the route param -- a bookmark,
  // the home tab's continue link, a deep link -- and replaced by the shared
  // position whenever the reader has to land again.
  const [anchorAyah, setAnchorAyah] = useState<number | null>(initialAyahNumber ?? null);
  // Bumped to demand a fresh landing even when the target ayah is unchanged:
  // a mode switch lands on the same ayah as before, so an effect keyed only on
  // the index would not re-run and the new list would stay at offset 0.
  const [landingNonce, setLandingNonce] = useState(0);

  useEffect(() => {
    setAnchorAyah(getReaderPosition(data.surah.id) ?? initialAyahNumber ?? null);
    setLandingNonce((nonce) => nonce + 1);
  }, [readerMode, data.surah.id, initialAyahNumber]);

  const initialIndex = useMemo(() => {
    if (!anchorAyah) return -1;
    return data.ayahs.findIndex((item) => item.ayah.ayah_number === anchorAyah);
  }, [data.ayahs, anchorAyah]);
```

and add the nonce to the landing effect's dependency array:

```ts
  }, [initialIndex, landingNonce]);
```

Everything else in that effect is untouched: it already resets `positioned`,
hides the list behind the spinner, retries the scroll and reveals only once
nothing missed and the content height held still.

- [x] **Step 9: Run the tests**

Run: `pnpm --filter @quran-corpus/mobile test -- SurahReader`
Expected: PASS.

- [x] **Step 10: Mutation-check the nonce**

Remove `landingNonce` from the landing effect's dependency array.

Run: `pnpm --filter @quran-corpus/mobile test -- SurahReader`
Expected: FAIL on *lands on the shared position when the reader mode changes* —
the target index is 49 both before and after, so without the nonce the effect
never re-runs. A pass here means the test proves nothing about the actual bug.

Restore by re-editing.

- [x] **Step 11: Commit**

```bash
git add apps/mobile/src/data/readerPosition.ts apps/mobile/src/data/readerPosition.test.ts apps/mobile/src/components/SurahReader.tsx apps/mobile/src/components/SurahReader.test.tsx
git commit -m "fix(mobile): keep the reader's place across a mode switch

The plate wrapping the list is MushafPlate in one mode and Fragment in
the other, so the element type at that position changes and React
unmounts the FlatList. The replacement started at offset 0 with only the
route param to land on -- absent whenever the reader was opened from the
surah list -- so reading 2:50 and tapping Translation landed on 2:1.

Re-anchoring rather than keeping the list mounted, because the pixel
offset would not survive the switch either way: a mushaf ayah and a
translation card are nothing like the same height."
```

---

### Task 6: carry the position into the word-by-word screen and back

`SurahReader.tsx:257` pushes `/surah/{id}/words` with no `from`, and
`app/surah/[surahId]/words.tsx` defaults it to 1.

**Files:**
- Modify: `apps/mobile/src/components/SurahReader.tsx` (the `onOpenWbw` handler, plus a focus effect)
- Modify: `apps/mobile/src/screens/WbwScreen.tsx` (the `setFrom` writer)
- Test: `apps/mobile/src/components/SurahReader.test.tsx`, `apps/mobile/src/screens/WbwScreen.test.tsx`

**Interfaces:**
- Consumes: `getReaderPosition` / `setReaderPosition` (Task 5).
- Produces: nothing.

- [x] **Step 1: Write the failing tests**

In `SurahReader.test.tsx`:

```tsx
  it('opens word-by-word at the ayah on screen', () => {
    positionMocks.get.mockReturnValue(50);
    renderReader({ readerMode: 'translation' });

    fireEvent.click(screen.getByTestId('reader-mode-wbw'));

    expect(push).toHaveBeenCalledWith('/surah/2/words?from=50');
  });

  it('opens word-by-word at ayah 1 when nothing has been read yet', () => {
    positionMocks.get.mockReturnValue(null);
    renderReader({ readerMode: 'translation', initialAyahNumber: null });

    fireEvent.click(screen.getByTestId('reader-mode-wbw'));

    expect(push).toHaveBeenCalledWith('/surah/2/words?from=1');
  });

  it('re-lands on the ayah the word-by-word screen was left at', () => {
    positionMocks.get.mockReturnValue(null);
    renderReader({ readerMode: 'translation' });
    fireViewableItems([{ item: { ayah: { id: 50, ayah_number: 50 } } }]);
    scrollToIndex.mockClear();

    // The screen stays mounted behind the pushed one, so returning to it is a
    // focus event and nothing else -- no remount, no new props.
    positionMocks.get.mockReturnValue(55);
    fireFocus();

    expect(scrollToIndex).toHaveBeenLastCalledWith({ index: 54, animated: false });
  });

  it('does not re-land when the position is the ayah already on screen', () => {
    positionMocks.get.mockReturnValue(null);
    renderReader({ readerMode: 'translation' });
    fireViewableItems([{ item: { ayah: { id: 50, ayah_number: 50 } } }]);
    scrollToIndex.mockClear();

    positionMocks.get.mockReturnValue(50);
    fireFocus();

    // Otherwise every return to the reader jerks the list to the top of the
    // ayah it is already showing.
    expect(scrollToIndex).not.toHaveBeenCalled();
  });
```

`fireFocus` invokes the callback the component handed `useFocusEffect`; add
`useFocusEffect` to the file's `expo-router` mock, capturing the callback:

```tsx
  useFocusEffect: (callback: () => void) => { focusMocks.callback = callback; },
```

In `WbwScreen.test.tsx`:

```tsx
  it('publishes the range it moves to as the shared reading position', async () => {
    render(<WbwScreen surahId={2} from={50} />);

    fireEvent.click(await screen.findByTestId('wbw-next'));

    // So pressing back leaves the reader where the word-by-word screen ended
    // up, not where it started (D46).
    expect(positionMocks.set).toHaveBeenCalledWith(2, 60);
  });
```

Adjust `60` to whatever `wbwPageRange(51, ayahCount)` yields for the fixture in
that file; the assertion is that the *new* `from` is published, not the old one.

- [x] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @quran-corpus/mobile test -- SurahReader WbwScreen`
Expected: FAIL — the push carries no query and nothing writes the store.

- [x] **Step 3: Carry the ayah out**

In `SurahReader`'s header effect, replace the `onOpenWbw` handler:

```tsx
          onOpenWbw={() => {
            closeSheet();
            // The ayah on screen, not the route param: the param is where the
            // reader was *opened*, which after any scrolling is not where the
            // reader is.
            const ayah = getReaderPosition(data.surah.id) ?? 1;
            router.push(`/surah/${data.surah.id}/words?from=${ayah}`);
          }}
```

`from` is validated at the route by `parseAyahNumber` exactly as before —
writing our own link changes nothing about it being untrusted input at the
boundary (§3, OWASP).

- [x] **Step 4: Carry the ayah back**

Add the focus effect to `SurahReader`, after the mode-switch effect:

```ts
  // Returning from the word-by-word screen is a focus event: this screen stays
  // mounted behind the pushed one, so no prop changes and no effect above
  // re-runs. Comparing against the ayah actually on screen is what keeps this
  // from re-landing the list on itself every time the reader is focused.
  useFocusEffect(
    useCallback(() => {
      const position = getReaderPosition(data.surah.id);
      if (position === null || position === lastVisibleRef.current) return;
      setAnchorAyah(position);
      setLandingNonce((nonce) => nonce + 1);
    }, [data.surah.id]),
  );
```

with `import { router, useFocusEffect, useNavigation } from 'expo-router';`.

- [x] **Step 5: Publish the range from the word-by-word screen**

In `WbwScreen`, replace `setFrom`:

```ts
  const setFrom = (next: number) => {
    setPage({ key: paramKey, from: next });
    // D46: the reader lands here when this screen is popped. Guarded on
    // surahId because the store is scoped by surah and a null id has no
    // position to publish.
    if (surahId !== null) setReaderPosition(surahId, next);
  };
```

with `import { setReaderPosition } from '@/data/readerPosition';`.

- [x] **Step 6: Run the tests**

Run: `pnpm --filter @quran-corpus/mobile test -- SurahReader WbwScreen`
Expected: PASS.

- [x] **Step 7: Mutation-check the focus guard**

Change `if (position === null || position === lastVisibleRef.current) return;`
to `if (position === null) return;`.

Run: `pnpm --filter @quran-corpus/mobile test -- SurahReader`
Expected: FAIL on *does not re-land when the position is the ayah already on
screen*.

Restore by re-editing.

- [x] **Step 8: Commit**

```bash
git add apps/mobile/src/components/SurahReader.tsx apps/mobile/src/screens/WbwScreen.tsx apps/mobile/src/components/SurahReader.test.tsx apps/mobile/src/screens/WbwScreen.test.tsx
git commit -m "fix(mobile): carry the reading position into word-by-word and back

The Words chip pushed /surah/[id]/words with no from, and the route
defaults it to 1, so reading 2:50 and tapping Words opened 2:1-2:10.
Both directions now, per D46: the push carries the ayah on screen, and
the reader re-lands on focus when the word-by-word screen moved on."
```

---

### Task 7: a surah variant of the pager button

`AdjacentNav` already draws exactly this control for the dictionary's two entry
screens: a circular chevron, disabled at the ends, with the accessible name a
bare chevron cannot provide. Export the button so the reader header and the
word-by-word heading can compose it into their own rows, and leave `AdjacentNav`
itself — the two-button toolbar — alone for the entry screens.

**Files:**
- Modify: `apps/mobile/src/components/AdjacentNav.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`
- Test: `apps/mobile/src/components/AdjacentNav.test.tsx`, `apps/mobile/src/i18n/uiStrings.test.ts` (no edit — it must simply keep passing)

**Interfaces:**
- Consumes: nothing.
- Produces: `AdjacentNavButton` (the renamed `PagerButton`), exported, with
  `testIDPrefix: 'root' | 'lemma' | 'surah'`. Tasks 8 and 9 both render it.

- [x] **Step 1: Write the failing test**

```tsx
  it('names a surah chevron for a screen reader', () => {
    render(
      <AdjacentNavButton side="prev" target="1" onNavigate={vi.fn()} uiLocale="en" testIDPrefix="surah" />,
    );

    expect(screen.getByTestId('surah-previous')).toBeTruthy();
    expect(screen.getByLabelText('Previous surah')).toBeTruthy();
  });

  it('disables a surah chevron with no target', () => {
    const onNavigate = vi.fn();
    render(
      <AdjacentNavButton side="next" target={null} onNavigate={onNavigate} uiLocale="en" testIDPrefix="surah" />,
    );

    fireEvent.click(screen.getByTestId('surah-next'));
    expect(onNavigate).not.toHaveBeenCalled();
  });
```

- [x] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/mobile test -- AdjacentNav`
Expected: FAIL — `AdjacentNavButton` is not exported.

- [x] **Step 3: Add the strings**

In `apps/mobile/src/i18n/uiStrings.ts`, add to `UiStringKey` beside the other
`surah`-prefixed keys (or beside `surahList.*` if there are none):

```ts
  | 'surah.previous'
  | 'surah.next'
```

and to each of the three locale tables:

```ts
    // en
    'surah.previous': 'Previous surah',
    'surah.next': 'Next surah',
    // uz
    'surah.previous': 'Oldingi sura',
    'surah.next': 'Keyingi sura',
    // ru
    'surah.previous': 'Предыдущая сура',
    'surah.next': 'Следующая сура',
```

Russian inflects for gender — сура is feminine, so `Предыдущая`/`Следующая`,
not the masculine forms `root.previous` carries for корень.

- [x] **Step 4: Export the button**

In `AdjacentNav.tsx`, extend the label map and rename the component:

```ts
const LABEL_KEYS = {
  root: { prev: 'root.previous', next: 'root.next' },
  lemma: { prev: 'lemma.previous', next: 'lemma.next' },
  surah: { prev: 'surah.previous', next: 'surah.next' },
} as const;
```

Rename `PagerButton` to `AdjacentNavButton`, `export` it, widen every
`testIDPrefix: 'root' | 'lemma'` to `'root' | 'lemma' | 'surah'` (both in the
button's props and in `AdjacentNavProps`), and update the two call sites inside
`AdjacentNav`.

The literal key strings stay written out per screen rather than assembled from
`testIDPrefix` — `uiStrings.test.ts` greps the sources for the literal, and a
runtime-built key is invisible to that dead-key check.

- [x] **Step 5: Run the tests**

Run: `pnpm --filter @quran-corpus/mobile test -- AdjacentNav uiStrings`
Expected: PASS. The dead-key check confirms both new keys are referenced and
that all three locales carry them.

- [x] **Step 6: Commit**

```bash
git add apps/mobile/src/components/AdjacentNav.tsx apps/mobile/src/i18n/uiStrings.ts apps/mobile/src/components/AdjacentNav.test.tsx
git commit -m "refactor(mobile): export the pager button for a surah variant

Both reading screens need this control in a row that already has other
content in it, which AdjacentNav's two-button toolbar cannot host. The
button is now composable; AdjacentNav keeps its own shape for the
dictionary entries."
```

---

### Task 8: prev/next surah in the reader, paging in place

**Files:**
- Modify: `apps/mobile/app/surah/[surahId].tsx`
- Modify: `apps/mobile/src/components/ReaderHeader.tsx`
- Modify: `apps/mobile/src/components/SurahReader.tsx` (two new props, forwarded to the header)
- Modify: `apps/mobile/src/audio/ayahAudio.ts`
- Test: `apps/mobile/src/components/ReaderHeader.test.tsx`, `apps/mobile/src/audio/ayahAudio.test.ts`

**Interfaces:**
- Consumes: `AdjacentNavButton` (Task 7), `useEntryPager` / `pagerAnimation` from `@/motion/entryPager`.
- Produces: `ReaderHeaderProps.prevSurahId?: number | null`, `.nextSurahId?: number | null`, `.onPageSurah?: (surahId: number, side: 'prev' | 'next') => void`; the same three forwarded through `SurahReaderProps`.

- [x] **Step 1: Write the failing tests**

`ReaderHeader.test.tsx`:

```tsx
  it('pages to the next surah', () => {
    const onPageSurah = vi.fn();
    render(header({ prevSurahId: 1, nextSurahId: 3, onPageSurah }));

    fireEvent.click(screen.getByTestId('surah-next'));

    expect(onPageSurah).toHaveBeenCalledWith(3, 'next');
  });

  it('dims the chevron at the ends of the mushaf', () => {
    const onPageSurah = vi.fn();
    render(header({ prevSurahId: null, nextSurahId: 2, onPageSurah }));

    fireEvent.click(screen.getByTestId('surah-previous'));

    // D47: disabled, not hidden. An arrow that vanishes slides the other one
    // under the thumb.
    expect(onPageSurah).not.toHaveBeenCalled();
    expect(screen.getByTestId('surah-next')).toBeTruthy();
  });
```

`ayahAudio.test.ts`:

```ts
  it('stops the recitation when the surah changes under it', async () => {
    const { result, rerender } = renderRecitation({ surah: 2, ayahCount: 286 });
    act(() => result.current.toggleAyah(50));
    await waitFor(() => expect(result.current.playing).toBe(true));

    rerender({ surah: 3, ayahCount: 200 });

    // Paging in place does not remount the hook, so without this the driver
    // keeps sounding al-Baqarah 50 under Aal-Imran, and the bar offers a pause
    // for an ayah that is no longer on screen.
    expect(driver.pause).toHaveBeenCalled();
    expect(result.current.playing).toBe(false);
    expect(result.current.ayah).toBeNull();
  });
```

Match `renderRecitation`/`driver` to whatever that file already uses.

- [x] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @quran-corpus/mobile test -- ReaderHeader ayahAudio`
Expected: FAIL on all three.

- [x] **Step 3: Stop the audio when the surah changes**

In `apps/mobile/src/audio/ayahAudio.ts`, add above the existing unmount effect:

```ts
  // Paging to another surah is a state change, not a remount (D48), so the
  // driver survives it still loaded with the previous surah's ayah. Left
  // alone it keeps sounding under the new surah, and `startAyah` would then be
  // building URLs for a coordinate the listener never chose.
  //
  // The driver is paused, not destroyed: destroying it belongs to unmount, and
  // rebuilding a player for the next tap costs a visible delay before the
  // first syllable.
  useEffect(() => {
    return () => {
      driverRef.current?.pause();
      ayahRef.current = null;
      finishedRef.current = false;
      soundedRef.current = false;
      setState(IDLE);
    };
  }, [surah]);
```

- [x] **Step 4: Draw the chevrons in the header**

In `ReaderHeader.tsx`, add to `ReaderHeaderProps`:

```ts
  /** The surah either side of this one in mushaf order, or null at 1 and 114.
   *  Numbers rather than a boolean pair so the header hands the caller the
   *  surah it means and nothing has to re-derive it. */
  prevSurahId?: number | null;
  nextSurahId?: number | null;
  onPageSurah?: (surahId: number, side: 'prev' | 'next') => void;
```

and place them either side of the title, inside the existing top row, between
the back button and the animated title / between the title and the search
button:

```tsx
          {onPageSurah ? (
            <AdjacentNavButton
              side="prev"
              target={prevSurahId === null || prevSurahId === undefined ? null : String(prevSurahId)}
              onNavigate={(target, side) => onPageSurah(Number(target), side)}
              uiLocale={uiLocale}
              testIDPrefix="surah"
            />
          ) : null}
```

(and the mirror with `side="next"` / `nextSurahId` after the title). The title
already carries `flex: 1` and `numberOfLines={1}`, so it takes what the six
controls leave and truncates rather than pushing anything off the edge.

**Risk, to be judged on the device (check 123):** the row now holds back,
two 34dp chevrons, the title, search and the globe. At 390dp with the OS font
scale at maximum the name may clip to a few characters. If it does, the
fallback is to move the two chevrons onto the second row, flanking the mode
chip — the bar is already two rows and stays one glass surface either way. Do
not pre-emptively build the fallback.

- [x] **Step 5: Forward the props through `SurahReader`**

Add the same three to `SurahReaderProps`, destructure them, and pass them to
`<ReaderHeader>` in the header effect — adding `prevSurahId`, `nextSurahId` and
`onPageSurah` to that effect's dependency array.

- [x] **Step 6: Page in place at the route**

In `apps/mobile/app/surah/[surahId].tsx`, seed the pager from the validated
route param and read the surah off it:

```tsx
  const routeSurahId = useMemo(() => parseSurahId(params.surahId), [params.surahId]);
  // The same pager the dictionary entries use, for the same reason: expo-router
  // remounts a [param] screen when `replace` changes the param, which destroys
  // the outgoing screen before the incoming one renders and runs the
  // navigator's own transition over the top. Paging is state, not navigation
  // (D48), so back returns to the surah list rather than walking every surah
  // paged through.
  const pager = useEntryPager(routeSurahId === null ? null : String(routeSurahId));
  const surahId = pager.current === null ? null : Number(pager.current);
```

Everything below already keys on `surahId` — the reader load effect, the
bookmark set, `useRecitation`, and the `readingRecorder` memo — so each follows
the pager without further change.

The chevron targets, and the reader wrapped so the two halves of a page turn
can play:

```tsx
      <Animated.View
        // Keyed by surah so reanimated sees one view leave and another arrive.
        key={surahId}
        entering={pager.animation.entering}
        exiting={pager.animation.exiting}
        style={{ flex: 1 }}
      >
        <SurahReader
          ...
          prevSurahId={surahId !== null && surahId > 1 ? surahId - 1 : null}
          nextSurahId={surahId !== null && surahId < 114 ? surahId + 1 : null}
          onPageSurah={(target, side) => pager.goTo(String(target), side)}
        />
      </Animated.View>
```

with `import Animated from 'react-native-reanimated';` and
`import { useEntryPager } from '@/motion/entryPager';`.

D47 is the two bounds: 1 and 114, no wrap. They are literals here rather than a
query because 114 is a fact about the mushaf, and `parseSurahId` already
enforces the same bound on the route.

- [x] **Step 7: Run the tests**

Run: `pnpm --filter @quran-corpus/mobile test -- ReaderHeader ayahAudio SurahReader`
Expected: PASS.

- [x] **Step 8: Mutation-check the bounds**

Change `surahId < 114` to `surahId <= 114`.

Run: `pnpm --filter @quran-corpus/mobile test -- ReaderHeader`
Expected: this does **not** exercise the route, so if nothing fails, add a test
for the route's bounds before moving on — surah 115 is not a surah, and a
chevron offering it would open a reader that can only fail to load:

```tsx
  it('offers no next surah at 114', () => {
    render(<SurahRoute />, { params: { surahId: '114' } });
    expect(screen.getByTestId('surah-next')).toHaveAttribute('aria-disabled', 'true');
  });
```

Restore by re-editing, and confirm the new test fails under the mutation.

- [x] **Step 9: Commit**

```bash
git add apps/mobile/app/surah/\[surahId\].tsx apps/mobile/src/components/ReaderHeader.tsx apps/mobile/src/components/SurahReader.tsx apps/mobile/src/audio/ayahAudio.ts apps/mobile/src/components/ReaderHeader.test.tsx apps/mobile/src/audio/ayahAudio.test.ts
git commit -m "feat(mobile): page between surahs from the reader header

Chevrons flank the surah name and change the screen's own state rather
than navigating (D48), so back returns to the surah list instead of
walking every surah paged through. Disabled at 1 and 114, no wrap (D47).

useRecitation is not remounted by a state change, so it gained a stop on
surah change -- without it the driver kept sounding the previous surah's
ayah under the new one."
```

---

### Task 9: prev/next surah in the word-by-word screen

**Files:**
- Modify: `apps/mobile/src/screens/WbwScreen.tsx`
- Test: `apps/mobile/src/screens/WbwScreen.test.tsx`

**Interfaces:**
- Consumes: `AdjacentNavButton` (Task 7), `useEntryPager` (Task 8's pattern).
- Produces: nothing.

- [x] **Step 1: Write the failing tests**

```tsx
  it('pages to the next surah and restarts at its first ayah', async () => {
    render(<WbwScreen surahId={2} from={50} />);
    await screen.findByText('Al-Baqara');

    fireEvent.click(screen.getByTestId('surah-next'));

    await waitFor(() =>
      // Not 3:50: the range belongs to the surah it was read in, and Aal-Imran
      // is 200 ayahs -- a surah shorter than the range would render empty.
      expect(mocks.getWbwScreen).toHaveBeenLastCalledWith(expect.anything(), 3, 1),
    );
  });

  it('dims the previous chevron in al-Fatihah', async () => {
    render(<WbwScreen surahId={1} from={1} />);
    await screen.findByTestId('surah-previous');

    fireEvent.click(screen.getByTestId('surah-previous'));

    expect(mocks.getWbwScreen).toHaveBeenCalledTimes(1);
  });
```

- [x] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @quran-corpus/mobile test -- WbwScreen`
Expected: FAIL — there is no `surah-next`.

- [x] **Step 3: Page the surah**

In `WbwScreen`, seed the pager from the prop and fold it into the existing
param-key reset — the key already resets `from` when the route params change,
and paging is one more reason the surah can change:

```ts
  const pager = useEntryPager(surahId === null ? null : String(surahId));
  const currentSurahId = pager.current === null ? null : Number(pager.current);

  // Keyed on the surah the pager is on rather than the prop: paging is state,
  // not a route change, so the prop stays where the screen was opened. Reset
  // during render for the reason the comment above this line already gives.
  const paramKey = `${currentSurahId}:${initialFrom}`;
```

Replace every remaining use of `surahId` in the load effect, `setFrom`,
`loadWordSummary` and the word-detail push with `currentSurahId`, and add it to
the load effect's dependency array. A paged surah arrives with `from` at
`initialFrom` — which is the ayah the *previous* surah was on — so clamp it at
the page boundary:

```ts
  const setSurah = (target: number, side: 'prev' | 'next') => {
    pager.goTo(String(target), side);
    // A new surah starts at its beginning: the range belongs to the surah it
    // was read in, and Aal-Imran has no ayah 250.
    setPage({ key: `${target}:${initialFrom}`, from: 1 });
  };
```

- [x] **Step 4: Draw the chevrons**

In the heading row, put the previous chevron before the surah name and the next
one after the `VersePicker`, so the row is bounded by surah navigation with the
ayah pager inside it:

```tsx
            <AdjacentNavButton
              side="prev"
              target={currentSurahId !== null && currentSurahId > 1 ? String(currentSurahId - 1) : null}
              onNavigate={(target, side) => setSurah(Number(target), side)}
              uiLocale={uiLocale}
              testIDPrefix="surah"
            />
```

(and the mirror, `side="next"`, bounded at 114). The name keeps
`flexShrink: 1` and `numberOfLines={1}`, so it truncates rather than pushing a
chevron off the edge.

- [x] **Step 5: Run the tests**

Run: `pnpm --filter @quran-corpus/mobile test -- WbwScreen`
Expected: PASS.

- [x] **Step 6: Mutation-check the reset**

Change the reset in `setSurah` so the paged surah keeps the previous one's range:

```ts
    setPage({ key: `${target}:${initialFrom}`, from: initialFrom });
```

Run: `pnpm --filter @quran-corpus/mobile test -- WbwScreen`
Expected: FAIL on *pages to the next surah and restarts at its first ayah* —
it would ask for 3:50.

Restore by re-editing.

- [x] **Step 7: Full gate**

There is no CI (issue #1), so this is the gate, run by hand:

```bash
pnpm --filter @quran-corpus/mobile test
pnpm --filter @quran-corpus/mobile lint
pnpm --filter @quran-corpus/mobile type-check
pnpm --filter @quran-corpus/data test
```

All four must be clean. `type-check` is `tsc --noEmit && tsc --noEmit -p tsconfig.test.json` — both halves.

- [x] **Step 8: Commit**

```bash
git add apps/mobile/src/screens/WbwScreen.tsx apps/mobile/src/screens/WbwScreen.test.tsx
git commit -m "feat(mobile): page between surahs from word-by-word (D49)

Same chevrons as the reader, same in-place paging. A paged surah opens
at its first ayah rather than carrying the previous surah's range across
-- Aal-Imran has no ayah 250."
```

---

### Task 10: device verification

`apps/mobile` has no emulator in CI, so §10 makes this the gate. Nothing here
is complete until the checks below have run on the owner's OnePlus 7 Pro
(Android 12, SDK 31) over Expo Go and the results are written into the log at
the foot of this file.

The device loop is in `README.md` and in memory: Metro's watcher is dead in this
environment, so **every** edit needs `expo start --clear`, and the phone is
reached by `adb` over wifi at an IP that moves. `input tap` does not register on
these `Pressable`s — use `input swipe X Y X Y 140`. The segmented control and
the sort chips are the exception and take a plain `tap`.

**Files:**
- Modify: `docs/plans/phase-m6r-reader-navigation.md` (the verification log below)

- [ ] **Step 1: Run the checks**

| # | Check | Pass when |
|---|---|---|
| 124 | Surahs tab → Juz | Thirty rows, every one collapsed (D42 — the one assumption in this plan, confirm it reads right), each subtitle a count (`148 ayahs`) |
| 125 | Tap Juz 1 | Expands to `Al-Fatihah 1–7` and `Al-Baqarah 1–141`; the reader does **not** open |
| 126 | Tap `Al-Baqarah 1–141` | Reader opens at 2:1 |
| 127 | Expand Juz 2 with Juz 1 open | Both stay open |
| 128 | Tap Juz 1 again | Collapses; ranges gone, row stays |
| 129 | Juz → Surah → Juz | Every juz collapsed again (D44) |
| 130 | Surahs tab → Revealed | Both eras expanded, `86` and `28` on the headers |
| 131 | Collapse Meccan | Medinan rises to just under the Meccan header; Meccan's header stays |
| 132 | Expand Meccan again | List is exactly what it was |
| 133 | Read 2:50 in Mushaf → Translation | Lands on 2:50, not 2:1 |
| 134 | …→ back to Mushaf | Still 2:50 |
| 135 | 2:50 → Words chip | Opens on the page containing ayah 50 |
| 136 | Page Words to 2:55, press back | Reader is on 2:55 |
| 137 | Open 2:1 from the surah list, immediately switch mode | Stays at 2:1; no jump |
| 138 | Next-surah chevron in al-Baqarah | Aal-Imran slides in from the right; the back arrow does not animate |
| 139 | Press back after paging three surahs | One press returns to the surah list (D48) |
| 140 | Chevrons in al-Fatihah and an-Nas | Previous dimmed at 1, next dimmed at 114; neither vanishes |
| 141 | Play 2:50, then page to Aal-Imran | Playback stops, the bar clears, no audio under the new surah |
| 142 | Words screen chevrons | Page to the next surah; it opens at ayah 1 |
| 143 | TalkBack on a juz row | Announces the juz, its count, and collapsed/expanded |
| 144 | TalkBack on an era header | Announces the era and collapsed/expanded |
| 145 | Reduce animations on, page a surah | Cross-fade, no slide |
| 146 | OS font scale at maximum, reader header | Surah name still legible beside the two chevrons — **the risk from Task 8 Step 4** |
| 147 | Dark theme, both new chevrons | Visible against the glass; not the invisible-on-dark case |

- [ ] **Step 2: Restore every device setting changed**

Reduce animations, the OS font scale (Display & brightness → Font & display
size; slider stop 2 is Default 1.0) and the theme all go back to what they
were. `settings put system font_scale` is blocked on this device without root,
and applying a font scale kills Expo Go — re-fire the
`exp://<host>:8081` intent afterwards.

- [ ] **Step 3: Write the log**

Fill in the verification log below: the date, the bundle SHA, every check's
result, and any finding raised as a GitHub issue rather than fixed. A check
that did not run is not a pass.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/phase-m6r-reader-navigation.md
git commit -m "docs(mobile): record the M6r device run"
```

---

## Risks and rollbacks

| Risk | Signal | Rollback |
|---|---|---|
| The reader header cannot hold six controls at a large font scale | Check 146: the surah name clips to two or three characters | Move both chevrons to the second row, flanking the mode chip. The bar is already two rows and stays one glass surface. Task 8 Step 4 only. |
| The mode switch shows the positioning spinner on every toggle | Visible flash between mushaf and translation | Expected and accepted: the list genuinely remounts and the landing has to complete before the reader is revealed, or the switch lands mid-scroll. If it reads badly, the alternative is a `MushafPlate` that renders a plain `View` in translation mode — but the pixel offset still would not survive, so the anchor stays either way. |
| In-place surah paging leaves a stale word-sheet or bookmark set | A sheet from the previous surah stays open across a page turn | `SurahRoute`'s load effect already keys on `surahId` and resets bookmarks; if the sheet survives, close it in `onPageSurah` the way the header's other actions call `closeSheet`. |
| The juz query is slower than the windowed one | Visible lag on the first switch to Juz | It is the same single scan of 6,236 rows with a smaller GROUP BY; if it does lag, the mode cache already means it runs once per mount. No index — that is a schema change. |
| `useFocusEffect` is unavailable or unmocked in tests | Task 6 fails at import | It is re-exported by expo-router from `@react-navigation/native`; add it to each affected test file's `expo-router` mock. |

## Out of scope

- Cross-surah scrolling (D50 — explicitly declined).
- Wrapping 114 → 1 (D47 — explicitly declined).
- A true paged mushaf; the page browse mode still jumps to a page's first ayah
  and renders a scrolling surah (decision 20, unchanged).
- Persisting disclosure state (D44), which is what keeps this phase clear of
  the on-device user DB. M6h still owns the first write there.
- Issue #31 (the dictionary's meaning search matches nothing), #32, #33, #28 —
  all filed, none of them touched here.

## What changed against the plan

Tasks 1-9 are implemented and committed; task 10 is the device run and has not
happened. Seven things went differently from what this plan said, all folded in:

- **Task 2** — asserting *which* chevron is drawn needed a handle. `Icon` gained
  an optional `testID` and the shared `react-native-svg` stub now maps it to
  `data-testid`, the way `rnHosts` already maps every other host. The
  alternative was hard-coding glyph path data in a test, which is retuned
  whenever a chevron is re-centred.
- **Task 3** — the plan did not notice that *switches to the juz index and opens
  the juz at the ayah it starts on* asserts the behaviour D41 removes. It was
  rewritten to assert the row expands, and the navigation it moved to got its
  own test.
- **Task 5** — resolving the anchor in an effect was wrong, and the existing
  retry-cap test caught it: state set after the landing effect had already run
  against the seed made **every mount land twice**, the second scroll restarting
  a sequence the first had begun (26 scrolls where the cap is 25). Replaced with
  the render-phase reset `WbwScreen` already uses, plus a test that a mount
  lands exactly once.
- **Task 5** — the anchor is seeded from the route param only, never the store.
  Consulting the store on mount would change what a fresh reader opens on, which
  is beyond D46 and is what the existing landing tests encode.
- **Task 6** — `WbwScreen` has no suite of its own; it is covered by
  `src/test/routes/words.test.tsx`. Its tests went there.
- **Task 7** — implementation landed before the tests, so the tests were
  mutation-checked immediately rather than watched to fail first. Swapping the
  `surah` label keys for the `lemma` ones fails both the label test and the
  dead-key check. Locale completeness turns out to be enforced by `tsc`, not by
  the suite -- verified by deleting the Uzbek pair, which type-check rejects.
- **Task 8** — `SurahRoute.test.tsx` needed `AccessibilityInfo` and a
  `react-native-reanimated` stub: the route now reaches `useEntryPager`, which
  asks `useReducedMotion` which way a page turn should travel. The route also
  gained the two paging tests the plan left as a conditional step.
- Note for anyone running these commands: `pnpm --filter <pkg> test -- <name>`
  does **not** filter to a suite -- it runs all of them. Read the summary line.

Every mutation-check named in tasks 1-9 was run and bit, plus six the plan did
not ask for (the `aria-expanded` guard, the era-count derivation, the audio
stop, the two word-by-word bounds, and the load reading the paged surah rather
than the prop).

## §5 independent review — one pass, run 2026-08-28

Ran on the branch as a whole (the §5 trigger was Task 1's `packages/data`
change). Seven findings, all real, all fixed in `288b460`, `0f81489`,
`2d11a8f`, `0ca1fff`. None declined. Nothing was raised against the juz query
itself.

- **Paging carried `?ayah=`** — a bookmark opening 2:50, then the next chevron,
  landed Aal-Imran on 3:50. The param belongs to the surah the route named.
- **`useFocusEffect` fires on mount** — and the shared position is a module
  singleton that outlives the screen, so a bookmark for 2:5 opened after
  reading 2:200 jumped straight back to 2:200. The suite's expo-router double
  only captured the callback, so no test could have seen it; it now runs on
  mount as the real hook does.
- **`onPageSurah` was an inline closure** in the dependency array of the effect
  that publishes the reader's header, on a route that re-renders on every
  playback tick.
- **The page turn never had two halves** — both screens returned a spinner
  while loading, so the outgoing surah was gone before the incoming one
  existed. The reader additionally remounted the old surah at its top for a
  frame, because the key changes a render before the load effect fires. Fixed
  with `useHeldEntry`, which the dictionary entries already used.
- **Word-by-word never used `pager.animation`** — D48's claim was false; the
  screen now renders inside the animated view.
- **`useEntryPager` reset in an effect**, so one committed render still
  reported the entry the route had left, and both screens fired a query for it.
- **`collapsedEras` was keyed on the translated label**, and the comment saying
  a language change cleared it was wrong. Keyed on `revelationType` now.

Two things the fixes dragged in, neither reported: the held copy now carries
the surah it was loaded FOR (the payload's own id is not evidence of which
request it answers), and bookmark/reading-position writes name the surah on
screen rather than the one the pager has moved to. Six new tests, every one
mutation-checked. Gate after the fixes: mobile 75 files / 702 tests, data 30 /
415, lint and type-check clean.

## Verification log — pending

Task 10 has not run. No device was connected during implementation, so **§10's
gate is unmet** and this phase is not complete.
