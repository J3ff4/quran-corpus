# M6g Dictionary + Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the whole corpus half of the app — dictionary browse, root
entry, lemma entry, concordance, frequency and search — to the glass system, and
draw the mockups for the screens the handoff bundle never covered.

**Architecture:** No behaviour changes and no new queries. This is the largest
sub-phase by file count and the smallest by risk: every screen here already
works, has tests, and survived M4/M5's device runs. The work is `GlassSurface`,
`fonts.display`, the bloom showing through, and the shared row/press primitives
from M6a — plus mockups first for the four screens nobody has designed yet.

**Tech Stack:** as M6a. `apps/mobile` only. No `packages/data` change, no new
query, no new dependency.

**Spec:** `docs/plans/phase-m6-glass-redesign.md`. Mockups `1h` (root entry) and
`1i` (search, three result kinds) exist; Task 1 draws the rest.

## Global Constraints

Inherited from the umbrella plan. Sub-phase specifics:

- **No §5 trigger.** UI only. If a task starts wanting a query change, stop —
  that is a different sub-phase and a different review.
- Behaviour is frozen. The derived-form filter (PR #49), the compound-root fix
  (PR #22), the hijāʾī arrows, the clause-trim, the concordance fan-out fix and
  the `key={param}` remount guard (`[[app-router-dynamic-route-remount-gotcha]]`)
  all stay exactly as they are. Restyle around them.
- `aria-controls` pairs with every `aria-expanded`
  (`[[aria-controls-disclosure-pattern]]`).
- The in-flow dictionary note panel dismisses on **click**, not `pointerDown`
  (`[[dictionary-note-and-clamp-polish]]`) — do not "improve" that to a
  pointer handler while restyling it.
- Branch: `feat/m6g-dictionary-search`. Device checks 89–96.

---

### Task 1: Mockups for the undesigned screens

Decision 5: mockups first, drawn per sub-phase, reviewed by the owner.

**Files:**
- Create: `docs/design/m6/lemma-entry.html`
- Create: `docs/design/m6/frequency.html`
- Create: `docs/design/m6/dictionary-browse.html`
- Create: `docs/design/m6/concordance.html`

- [x] **Step 1: Read the source of truth**

Read `~/quran-data/corpus-design-files/Quran Corpus Glass.dc.html` in full
(mockups `1h` and `1i` especially). Do not render or screenshot it. Match its
frame (390×844), its glass recipe and its type scale exactly — these four pages
have to sit beside the owner's own without looking like a different hand drew
them.

- [x] **Step 2: Draw the four screens**

Each as a self-contained HTML file, inline styles, one 390×844 frame, night
theme (the bundle's own default). Content comes from the real app, not from
lorem: use root ق-و-ل, lemma `qawol`, and the frequency table's top rows, so the
owner is reviewing real densities.

- [x] **Step 3: Show the owner and get approval** — APPROVED 2026-08-26 with
      five changes, all applied to the frames

Sent as a review page carrying all four frames at 1:1 plus the data behind
each: https://claude.ai/code/artifact/93c4c8ce-fa97-4861-a55e-bbc1d75ebaf8

Owner rulings, binding on Tasks 2-6:

- **D1 — no masthead on either dictionary pane.** The big "Dictionary /
  1,642 roots" block is redundant and ugly. Both panes take the slim glass
  bar frame 3 uses (`.qc-nav`: eyebrow left, count right). Buys back ~90dp,
  which is one more root row above the fold.
- **D2 — no proportional rail in the frequency table.** Rows carry rank,
  count and form, nothing else. This answers the open question with a no.
- **D3 — Previous/Next flanks the headword.** Chevrons sit either side of
  the Arabic word inside the header; the docked bottom pager is gone. This
  is `AdjacentNav`, shared, so the root screen changes with it. Frame 3's
  "rank 41 of 200" moves into the slim bar, which is what it captions now.
- **D4 — the pager animates directionally, whole screen.** Next slides the
  incoming entry in from the right, Previous from the left. Header and list
  move together, like a native pager. `router.replace` animates in no
  direction, so the route has to change; `react-native-reanimated@4.5.1` and
  `react-native-screens` are both already installed, so no §12 dependency
  question. Respect `prefers-reduced-motion` (§8) — reduced motion falls
  back to a cross-fade.
- **D5 — the root screen keeps today's header.** Slim bar on top, then the
  existing `EntryHeader`: big Arabic root, ق و ل letter pills in row-reverse,
  occurrence count. Only the form chips take the new look, which the owner
  called out as the better-looking part of the frame.

Two open questions were answered by these and need no separate ruling: the
frequency rail is out (D2), and the docked pager is out (D3). The chip-wrap
question is moot — six chips over two rows is what the approved frame shows.

**Correction to the browse-gloss question as it was originally asked.** It
claimed enriching browse rows needs a new query and a §5 review, citing
`getAllRoots`. Wrong function: `DictionaryScreen` calls
`getAllRootsForBrowse` → `getRootSearchList`, whose payload already carries
`gloss_blob`. The screen matches search against it and never renders it.
`gloss_blob` is `GROUP_CONCAT(f.gloss, ' ')` over every form of the root, so
it is a search haystack, not a display string — showing it raw would be
worse than showing nothing. Displaying it *well* is the part that needs a
query. Not in this sub-phase either way; recorded so the next reader does
not re-derive it.

- [x] **Step 4: Commit** — `4a592d2`

```bash
git add docs/design/m6
git commit -m "docs(design): mock the four undesigned dictionary screens"
```

---

### Task 2: Dictionary browse

**Files:**
- Modify: `apps/mobile/src/screens/DictionaryScreen.tsx`
- Modify: `apps/mobile/src/components/AlphabetGrid.tsx`
- Modify: `apps/mobile/src/components/DictionaryRow.tsx`
- Modify: the matching `.test.tsx` files

- Letter grid becomes glass tiles; the active letter takes `accentWash`.
- Rows become `GlassSurface` cards: root in `fonts.arabic`, transliteration and
  gloss in the UI face, occurrence count as a muted pill.
- `usePressScale` on tiles and rows.
- `useListBottomPadding()` on the list — the floating tab pill is over this
  screen.

No new logic, so no new unit test and no mutation-check (§4's step applies to
branches, loops, parsers and validators). The gate is the existing suites
staying green plus device check 89.

- [ ] **Step 1: Restyle, running `pnpm --filter @quran-corpus/mobile test` after each file**
- [ ] **Step 2: Add a contrast assertion in `tokens.test.ts` for any new colour pairing**
- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/DictionaryScreen.tsx apps/mobile/src/components/AlphabetGrid.tsx \
        apps/mobile/src/components/DictionaryRow.tsx apps/mobile/src/components
git commit -m "feat(mobile): glass dictionary browse"
```

---

### Task 3: Root entry

**Files:**
- Modify: `apps/mobile/app/root/[buckwalter].tsx`
- Modify: `apps/mobile/src/components/EntryHeader.tsx`
- Modify: `apps/mobile/src/components/DefinitionCard.tsx`
- Modify: `apps/mobile/src/components/FormFilterChips.tsx`
- Modify: `apps/mobile/src/components/ConcordanceList.tsx`
- Modify: `apps/mobile/src/components/AdjacentNav.tsx`
- Modify: `apps/mobile/src/components/ClampedText.tsx`
- Modify: the matching `.test.tsx` files

Per mockup `1h`: a glass entry plate (root in `fonts.arabic`, transliteration in
`fonts.display`, occurrence count), the Hans Wehr gloss as the top card with
Lane collapsible beneath it, form chips as a glass row, concordance rows as
cards.

Two things that must not change while this is restyled:

- `FormFilterChips` keeps M5b's frozen scroll and does **not** get its dim back
  (`[[dictionary-note-and-clamp-polish]]`, M5c defect 9).
- `AdjacentNav` keeps `router.replace`, not `push` (M5c defect 10) — otherwise
  back walks every root the user browsed.

- [ ] **Step 1: Restyle, suite green after each file**
- [ ] **Step 2: Re-run the M5c chip and nav tests specifically**

Run: `pnpm --filter @quran-corpus/mobile test FormFilterChips AdjacentNav`
Expected: PASS, unchanged.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/root apps/mobile/src/components
git commit -m "feat(mobile): glass root entry and concordance"
```

---

### Task 4: Lemma entry and frequency

**Files:**
- Modify: `apps/mobile/src/screens/LemmaScreen.tsx`
- Modify: `apps/mobile/app/lemma/[lemma].tsx`
- Modify: `apps/mobile/src/components/FrequencyList.tsx`
- Modify: `apps/mobile/src/components/SnippetText.tsx`
- Modify: the matching `.test.tsx` files

Follow the Task 1 mockups. The Russian Previous/Next inflection fix
(`1820e3b`) is in `LemmaScreen`'s labels — keep the inflected strings, do not
collapse them back to one key while touching the header.

`FrequencyList` renders up to `FREQUENCY_LIMIT` (1000) rows: keep it
virtualised, and keep `useListBottomPadding()`. A glass card per row is fine;
a shadow per row at 1000 rows is not — use the flat variant (`GlassSurface` with
`style={{ shadowOpacity: 0 }}`) for list rows and reserve the shadow for
plates. Note that in a comment.

- [ ] **Step 1: Restyle, suite green after each file**
- [ ] **Step 2: Scroll-test the 1000-row list in the device run (check 93)**
- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/screens/LemmaScreen.tsx apps/mobile/app/lemma \
        apps/mobile/src/components/FrequencyList.tsx apps/mobile/src/components/SnippetText.tsx
git commit -m "feat(mobile): glass lemma entry and frequency list"
```

---

### Task 5: Search

**Files:**
- Modify: `apps/mobile/src/screens/SearchScreen.tsx`
- Modify: `apps/mobile/app/search.tsx`
- Modify: `apps/mobile/src/components/SearchHeaderButton.tsx`
- Modify: `apps/mobile/src/screens/SearchScreen.test.tsx`

Per mockup `1i`: a glass search field pinned under the header, then results in
three visually distinct kinds — ayah hits, root hits, lemma hits — each kind
with its own icon and its own section header. The three kinds already exist in
the data; today they are styled almost identically.

- [ ] **Step 1: Write the failing test**

```tsx
it('labels each result kind distinctly', async () => {
  renderSearch({ query: 'qwl' });

  const headers = await screen.findAllByRole('header');
  // Mockup 1i's whole point: three kinds, three affordances. Before this they
  // were three lists of near-identical rows.
  expect(headers.map((h) => h.textContent)).toEqual(['Ayahs', 'Roots', 'Words']);
});
```

- [ ] **Step 2: Run it, watch it fail, implement, re-run**

Arabic hits keep `fonts.arabic`; the existing `hit.source === 'ar'` branch in
`SearchScreen.tsx:196` is what decides that — keep it.

- [ ] **Step 3: Mutation-check (§4)**

Render every kind under one header. Expected: the test FAILS. Restore by
re-editing.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/screens/SearchScreen.tsx apps/mobile/app/search.tsx \
        apps/mobile/src/components/SearchHeaderButton.tsx apps/mobile/src/screens/SearchScreen.test.tsx
git commit -m "feat(mobile): glass search with three distinct result kinds"
```

---

### Task 6: Build and device run

- [ ] **Step 1: Build.**

```bash
cd apps/mobile && pnpm prebuild:assert-db && eas build --platform android --profile preview
```

- [ ] **Step 2: Run checks 89–96 and record every result below.**

| # | Check | Pass condition |
| --- | --- | --- |
| 89 | Dictionary browse, both themes | Letter tiles and rows read as glass; Arabic is crisp at every size |
| 90 | Root ق-و-ل | Entry plate, Hans Wehr card, Lane collapsible; the compound-root count is still 119 |
| 91 | Derived-form chips | Filter still works; **no dim**, no layout shift on tap |
| 92 | Root Previous/Next through five roots, then back | Back leaves the root screen once — it does not walk all five |
| 93 | Frequency list, scrolled to the bottom (1000 rows) | Smooth; last row clears the tab pill |
| 94 | Lemma entry in Russian UI | Previous/Next read with the correct inflection |
| 95 | Search "qwl" | Three labelled sections; each result kind opens the right screen |
| 96 | Concordance tap into 16:90 | Lands on 16:90 (the M5c fix, again — this screen is its caller) |

## Verification Log

| Check | Build | Date | Result | Notes |
| --- | --- | --- | --- | --- |
| 89 | | | | |
| 90 | | | | |
| 91 | | | | |
| 92 | | | | |
| 93 | | | | |
| 94 | | | | |
| 95 | | | | |
| 96 | | | | |
