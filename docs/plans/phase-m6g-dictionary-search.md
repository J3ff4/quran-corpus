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

- [x] **Step 1: Restyle, running `pnpm --filter @quran-corpus/mobile test` after each file**
- [x] **Step 2: Add a contrast assertion in `tokens.test.ts` for any new colour pairing** —
      none needed. Every pairing used (accent on the wash, body/muted/accent on
      glass) is already measured in `tokens.test.ts`.
- [x] **Step 3: Commit** — `fc2d76b`

Two things this task settled that the later ones inherit:

- `SlimHeader` is the D1 bar, shared. Tasks 3 and 4 take it rather than
  drawing their own.
- The dead `setOptions({ headerRight })` search button is gone (tab screens
  run `headerShown: false`). **Open for the owner:** whether the Dictionary
  tab needs its own global-search affordance, or whether Home and the reader
  are enough. Not invented inside a restyle.
- `FrequencyList`'s column-header row still uses the old flush-row padding, so
  its labels no longer sit over the card columns. Task 4 fixes it -- the row
  it labels is `DictionaryRow`, which moved in this task.

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

- [x] **Step 1: Restyle, suite green after each file**
- [x] **Step 2: Re-run the M5c chip and nav tests specifically** — PASS (7/7).
- [x] **Step 3: Commit** — `43f156f`

`EntryHeader` gained a `pager` slot for D3 and draws it as an overlay on the
headword's own row. Threading the headword between the two buttons instead
would have put a heading inside `AdjacentNav`'s labelled toolbar. The
headword keeps a 46pt gutter each side so a long lemma cannot run under a
chevron.

Icon-only chevrons mean the inflected Russian labels are the accessible name
now, not visible text. `AdjacentNav.test.tsx` moved with them, from
`textContent` to `aria-label` — same assertion, right attribute.

**Not built, and deliberately:** mockup m6g-4 draws an "All" chip at the head
of the form row. That is new behaviour (today an empty selection *is* All,
with no control that clears several chips at once), and this sub-phase is a
restyle. It is a good affordance and about fifteen minutes' work — owner's
call.

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

- [x] **Step 1: Restyle, suite green after each file**
- [x] **Step 2: Scroll-test the 1000-row list in the device run (check 93)** — PASS, see the log. Rank 1000 (محو) sits clear of the tab pill; the sticky header holds and no row blanks while flinging.
      Task 6, on the owner's device.
- [x] **Step 3: Commit** — `aae3f94`

Two corrections to this task as written:

- `SnippetText` is a **search** component (`SearchScreen` is its only caller),
  so it moved to Task 5.
- D3 wanted frame 3's "rank 41 of 200" in the slim bar. That rank is not on
  the lemma screen: `getAdjacentLemmas` returns neighbours, not a position,
  and M6g adds no queries. The bar is captioned with the reading instead. The
  rank belongs to whoever adds the query.

`DictionaryRow` is flat glass (`shadowOpacity: 0`, `elevation: 0`), set in
Task 2 because Browse renders 1642 of the same row.

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

- [x] **Step 1: Write the failing test**

```tsx
it('labels each result kind distinctly', async () => {
  renderSearch({ query: 'qwl' });

  const headers = await screen.findAllByRole('header');
  // Mockup 1i's whole point: three kinds, three affordances. Before this they
  // were three lists of near-identical rows.
  expect(headers.map((h) => h.textContent)).toEqual(['Ayahs', 'Roots', 'Words']);
});
```

- [x] **Step 2: Run it, watch it fail, implement, re-run**

Arabic hits keep `fonts.arabic`; the existing `hit.source === 'ar'` branch in
`SearchScreen.tsx:196` is what decides that — keep it.

- [x] **Step 3: Mutation-check (§4)** — two mutants, both caught: every kind
      under one header, and the root card without its count.
- [x] **Step 4: Commit** — `90b3c0c`

**The test above, as this plan drafted it, asserts a screen that cannot
exist.** It expects `['Ayahs', 'Roots', 'Words']`, but `SearchResult` carries
`jump`, `verses` and `roots` — there is no lemma/"Words" arm in the data.
Adding one is a `packages/data` query, which this sub-phase forbids outright
and §5 would gate. The shipped test asserts the three kinds that do exist
(`GO TO`, `VERSES`, `ROOTS`) and that each has its own affordance, which is
what mockup `1i` is actually about.

That is the second time a brief has specified a literal assertion nobody
could satisfy (`[[sdd-brief-can-specify-vacuous-tests]]`). Read a brief's
test against the types before writing it.

**Not built, and deliberately:** `1i` draws a "Clear" control in the search
field. Skipped as new behaviour in a restyle — the keyboard already clears
the box. Owner's call, like the All chip.

---

### Task 5b: The pager's directional transition (D4)

**Files:**
- Create: `apps/mobile/src/motion/useEntryTransition.ts` + its test
- Modify: `apps/mobile/src/components/AdjacentNav.tsx`
- Modify: `apps/mobile/app/root/[buckwalter].tsx`
- Modify: `apps/mobile/src/screens/LemmaScreen.tsx`

D4 is the only ruling that is behaviour rather than paint, and it had no task
of its own. Commit `97bb956`.

- [x] In-screen, not through the navigator. `router.replace` animates in no
      direction and `push` is what M5c defect 10 forbids, so the screen
      animates its own content on an entry-key change — which is also what
      makes header and list move as one thing.
- [x] `AdjacentNav` reports the side alongside the target; a replaced route
      arrives with no direction of its own. The side is consumed once and
      cleared, so a deep link or a concordance tap does not inherit it.
- [x] Enter-only. Both screens already show a full-screen spinner while the
      next entry loads, so there is no outgoing content left to animate.
- [x] Reduced motion cross-fades (§8). The direction lives in a pure
      `enterOffset()`; swapping the signs and dropping the reduced-motion
      guard each fail a test.

```bash
git add apps/mobile/src/screens/SearchScreen.tsx apps/mobile/app/search.tsx \
        apps/mobile/src/components/SearchHeaderButton.tsx apps/mobile/src/screens/SearchScreen.test.tsx
git commit -m "feat(mobile): glass search with three distinct result kinds"
```

---

### Task 6: Build and device run

- [x] **Step 1: Build.** Skipped, as this section allows: run over Expo Go
  instead (`expo start --clear` + `exp://192.168.0.103:8081`), since none of
  89-96 needs a native module Expo Go lacks. EAS stays parked to 2026-09-01.

```bash
cd apps/mobile && pnpm prebuild:assert-db && eas build --platform android --profile preview
```

EAS is quota-parked to **2026-09-01** (`[[expo-go-device-loop]]`). Nothing in
89–96 needs a native module Expo Go lacks — they are all layout, motion and
navigation — so run them over Expo Go rather than waiting for the build:
`expo start --clear`, then the LAN URL. Only checks that need a real build
(82, 83) stay parked.

- [x] **Step 2: Run checks 89–96 and record every result below.** Run
  2026-08-27 over adb (wireless debugging) on the owner's OnePlus 7 Pro
  (GM1917, Android 12). Check 92 failed first time and is recorded twice: the
  failure, and the re-run after `c4f9780`.

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
| 89 | Expo Go, `562ebea` | 2026-08-27 | PASS | Both themes. Slim bar reads `DICTIONARY / Roots · 1642`; ten-across letter tiles and the row cards read as glass on the warm ground and on night. Arabic crisp at every size. ء renders dimmed (no roots), as designed. |
| 90 | Expo Go, `562ebea` | 2026-08-27 | PASS | ق-و-ل: entry plate, Hans Wehr card, Lane collapsible with Show more, chevrons flanking the headword (D3). The compound-root count is checked on أ-م-م, which is the 119 root: 119 occurrences, and its six form chips sum to 119. |
| 91 | Expo Go, `562ebea` | 2026-08-27 | PASS | Tapping *Verbal noun qawl 92* cut the concordance from 1722 to 92 and every row came back `qawl`. No dim on the unselected chips, and the chip positions are pixel-identical before and after the tap — no layout shift. |
| 92 | Expo Go, `562ebea` | 2026-08-27 | **FAIL** | Back is correct: five Nexts then one Back left the pager chain in one step rather than walking all five. The slide did not happen at all — no direction, no fade. Traced to expo-router remounting the screen on `replace`, plus both screens keying the transition on the route param, plus LemmaScreen never forwarding the side. See the note below. |
| 92 | Expo Go, `c4f9780` | 2026-08-27 | PASS | Re-run after the fix, with `ENTER_MS` temporarily at 20s so a screenshot can catch the transition mid-flight: Next brings the incoming root in from the right, Previous from the left. Back still leaves the chain once. |
| 93 | Expo Go, `562ebea` | 2026-08-27 | PASS | Flung to rank 1000 (محو, count 3). Smooth throughout, no blank rows, sticky header holds, and the last row clears the tab pill. |
| 94 | Expo Go, `562ebea` | 2026-08-27 | PASS | Russian UI. The lemma bar reads `ЛЕММА / qāla` and the count reads `1618 вхождений` — the right genitive plural. The pager's accessible names agree with their nouns: `Предыдущая / Следующая` on the lemma screen (лемма, feminine) and `Предыдущий / Следующий` on the root screen (корень, masculine). |
| 95 | Expo Go, `562ebea` | 2026-08-27 | PASS, with a deviation | Each of the three kinds renders under its own labelled eyebrow and opens the right screen: `qwl` → **ROOTS** → the ق-و-ل screen; `16:90` → **GO TO** (the tinted accent card) → the reader at An-Nahl 90; `mercy` → **VERSES** with the match highlighted on the accent wash → the reader at Luqmān 3. The check as written expects all three sections from `qwl` alone, which cannot happen: a Buckwalter root is neither a verse reference nor translation text, so it returns the roots arm only. Three queries, not one. |
| 96 | Expo Go, `562ebea` | 2026-08-27 | PASS | Ran on ف-ح-ش rather than ق-و-ل so 16:90 is reachable without paging 1722 rows: row `16:90:11` lands on An-Nahl with ayah 90 at the top of the screen. The M5c fix holds. |

### What check 92 found

The suite was green and the transition was dead on hardware. Three separate
causes, all fixed in `c4f9780`:

1. **expo-router remounts a `[param]` screen when `replace` changes the
   param.** The direction was held in a `useRef` on the outgoing instance,
   which no longer exists by the time the incoming one renders. Traced by
   logging the effect's own state on device: it ran with the new key already
   recorded as shown and the side back at `null`, and returned without
   animating. The side now lives at module scope — it belongs to the
   navigation event, not to a component instance.
2. **Both screens keyed the transition on the route param**, which is
   available on the first render, while the screen is still showing its
   spinner. Even once the side survived, the slide played out under the
   spinner and the entry faded in with no direction. They now key on what is
   actually drawn, and the hook holds the pending side while the key is null.
3. **`LemmaScreen` never forwarded the side to `markSide`** — its `onNavigate`
   took only the target. The lemma pager could not have been directional even
   with the first two fixed.

Three regression tests, each mutation-checked. The first two are hook-level
(a remount with a pending side; a null key that must not consume it); the
third asserts LemmaScreen forwards the pressed side, and dies if the side is
hardcoded.

Worth carrying forward: **a screen-level transition keyed on a route param
cannot be trusted on expo-router**, and no jsdom test can see it, because the
remount is the navigator's behaviour and not the component's.

### Observed but out of scope

The tab bar is translucent enough that list rows read through it — visible in
both themes on the Dictionary browse list, and on Home behind the ayah
reference. That bar is M6a's, not M6g's, and this is the same class as
`[[rn-glass-bar-must-be-opaque]]` (M6d, fixed there for the reader's docked
bar). Not fixed here: it is a different sub-phase's component and every tab
screen shows it. Worth an issue before M7.

---

## Owner review of the built screens, 2026-08-27

Four notes after using the branch on device. Answers taken with
`AskUserQuestion` before any code was written; the rulings are recorded here
because three of them overturn decisions this plan made.

1. **The pager blanked, then slid, and stuttered — and the back arrow moved
   with it.** Ruling: a *true* pager, both entries moving together. Superseded
   check 92's fix rather than extending it, and the diagnosis there was
   incomplete: `replace` was the root cause of more than the lost direction.
   The navigator remounts the screen, which destroyed the outgoing entry
   before the incoming one rendered (so there was never anything to slide
   out), blanked the screen to a spinner in between (the "content
   disappears"), and ran the navigator's own push transition over the top —
   that is what animated the back arrow, and what the entry's own slide was
   fighting for the same frames.

   So paging no longer navigates at all. `useEntryPager` seeds from the route
   parameter and Previous/Next move its own state; `useHeldEntry` keeps the
   previous entry drawn until its replacement has fully loaded; reanimated's
   layout animations (`SlideInRight`/`SlideOutLeft`, mirrored, `FadeIn`/
   `FadeOut` under reduced motion) run both halves over one duration.
   `useEntryTransition` is deleted — the module-level pending side it needed
   existed only to survive the remount that no longer happens.

   **Not applied, and deliberately:** the owner also chose `animation: 'none'`
   on the two entry routes. That was picked on the premise that the navigator
   animates on every page turn, which is no longer true — the only navigations
   left are genuine pushes from the reader or the frequency list, where the
   transition is wanted. Setting it would remove a wanted animation to fix one
   that can no longer occur. One line in `app/_layout.tsx` if the owner
   disagrees.

2. **The slim headers go.** All three (D1 is reversed). Their captions stay:
   the dictionary count moves onto the segmented control's row, the root's
   Buckwalter spelling onto the headword plate, and the lemma's reading was
   already under its headword, so nothing moved there. `root.heading` and
   `lemma.heading` are gone.

3. **The m6g-4 form chips, applied properly.** Task 3 restyled the row but
   kept the old chip contents; the mockup's chip is the Arabic form and its
   count, tinted by part of speech at all times. The label, reading and gloss
   are the accessible name now — a tint says nothing to a screen reader, and
   this is the one place the redesign could have cost information. The All
   chip is built (Task 3 had deferred it as owner's call).

4. **The frequency kind chips touched the column labels.** Padding.

### Verification log — pending

| Check | Build | Date | Result | Notes |
| --- | --- | --- | --- | --- |
| 97 | Expo Go, `6498d63` | 2026-08-27 | PASS | Root قول → قوم and back. Captured with `PAGE_MS` temporarily at 4000 so `screencap` lands mid-flight (restored after). Both halves are on screen at once and moving together: قول (1722) travelling left while قوم (660) enters from the right, mirrored on Previous. No blank frame, no spinner, no stutter. The back arrow's bright pixels measure x 81..143 in **all six** frames of the burst — it does not move. |
| 98 | Expo Go, `6498d63` | 2026-08-27 | PASS | Same, on the lemma screen entered from Most used → Lemmas: ٱللَّه (2699) → مَا (2177), frequency-rank order, both halves moving together. |
| 99 | Expo Go, `6498d63` | 2026-08-27 | PASS | In-app Reduce animations on (the OS toggle is not reachable on this device — see `useReducedMotion`'s docstring), `FADE_MS` temporarily at 3000. Mid-transition frame shows قول and قوم **superimposed at the same position**, "1722 occurrences" and "660 occurrences" cross-fading over each other with zero horizontal displacement. Neither slides. |
| 100 | Expo Go, `6498d63` | 2026-08-27 | PASS | No slim bar on any of the three. Dictionary: `Roots · 1642` hangs off the right end of the Alphabetical/By frequency row. Root: `qwl` sits on the headword plate beside the ق و ل tiles, `1722 occurrences` under it. Lemma: the reading `l-lahi` is under the headword, where it already was. |
| 101 | Expo Go, `6498d63` | 2026-08-27 | PASS | ق-و-ل, six chips. All lit with no filter; chips tinted per part of speech (verbs warm, nouns blue, participle teal) and the tint is kept in the selected state. Multi-select قِيل 4 + قَآئِل 5 → concordance 9; tapping All cleared both and returned 1722. |
| 102 | Expo Go, `6498d63` | 2026-08-27 | PARTIAL | Night theme: the Roots/Lemmas/Verbs row is clear of the `# COUNT FORM` labels, no touching. **Light theme not exercised** — the device dropped off wireless debugging before the theme switch. |

Run 2026-08-27 over Expo Go, driven through `adb` on the owner's OnePlus 7 Pro
(Android 12). §10's gate is met for 97-101; 102 is half-recorded.

## Owner review of the built screens, round 2 — 2026-08-27

Three more notes from the same device session. Clarified with
`AskUserQuestion` before any code; note 1 needed a second round because
"lemma pages" turned out to mean the ranked pane, not the lemma screen.

1. **The pane caption still takes a whole line.** Round 1 moved it out of the
   slim bar onto its own row; the owner wants it inline. Ruling: each pane
   hangs it off the right end of its own chip row — Browse's alphabetical/by
   frequency row, Most used' roots/lemmas/verbs row. Outside the toolbar
   element in both, so TalkBack does not count a caption among the controls
   the toolbar holds.

2. **The pager arrows sit off centre in their circles.** They were a `‹` / `›`
   text glyph, which lands wherever its font's side bearings put it — the
   layout was centring the glyph's box, not the mark inside it. Drawn as an
   Svg through the existing icon set instead, both paths centred on the 24
   viewBox in both axes.

3. **Filtering is slow — "way slow" against a release build of this app.**
   Symptom, per the owner: the tap itself feels dead, letter cells slow to
   react *and* to filter. No debounce wanted; the search box stays instant.

   Two causes, both measured over the real 1642-root corpus rather than
   guessed at:

   - **Browse re-derived its whole list on every tap.** It folded all 1642
     `root_arabic` strings, then sorted the survivors with
     `compareRootsArabic`, which allocates two key arrays per comparison. 4.3ms
     per alphabetical pass, 9.1ms per frequency pass on V8 — Hermes on the
     phone is an order of magnitude behind that, on the thread that dispatches
     the next touch. Now indexed once when the payload lands and both orders
     sorted once from it; every later tap is one filter pass. Same three
     measurements after: 0.015ms, 0.000ms, 0.054ms.
   - **Nothing was memoized.** Every row, alphabet cell and form chip is an
     `Animated.Pressable` with a shared value behind it, and a letter tap
     re-rendered all 29 cells to change `selected` on two.

   The frequency order is now sorted *from* the alphabetical one, leaning on
   `Array.sort` being stable (ES2019; Hermes complies) for the hijāʾī
   tie-break. The Browse fixture gained a tie listed in the wrong order so
   that assumption is under test.

   Also folded in: the ranked pane cached its rows per kind. It unmounts on
   every flip to Browse and was re-running a 1000-row query and flashing a
   spinner over a list it had already drawn. The DB is bundled and opened
   `query_only`, so a repeat query can only return what the first one did.

   **Not established, by owner's choice:** how much of the felt slowness was
   Expo Go's dev bundle rather than this code. The offer was
   `expo start --no-dev --minify`, which gives a production-mode bundle
   without EAS; the owner chose to skip the measurement and optimize
   regardless. So the numbers above are the JS cost removed, not a device
   before/after.

### Verification log — pending

| Check | Build | Date | Result | Notes |
| --- | --- | --- | --- | --- |
| 103 | Expo Go, `6498d63` | 2026-08-27 | PARTIAL | Both panes carry the caption inline at the right end of their own chip row, no row of its own: `Roots · 1642` on Browse's alphabetical/by frequency row, `By frequency` on Most used' roots/lemmas/verbs row. **Largest font scale not exercised** — device dropped off before the font-scale pass. |
| 104 | Expo Go, `6498d63` | 2026-08-27 | PARTIAL | Night theme, measured rather than eyeballed: the chevron's bright-pixel bounding box centres on (75.5, 73.5) and (73.5, 73.5) against a circle centre of (75.0, 75.0) — under 1.5 physical px at 640dpi, i.e. **under half a dp** in both axes, both directions. **Light theme not exercised.** |
| 105 | Expo Go, `6498d63` | 2026-08-27 | PASS | ق lights with the accent border and wash and the list filters with it: 1642 → 80 roots, قبح/قبر at the top. Alphabetical ↔ By frequency switches with no perceptible stall (أله 2851, قول 1722, كون 1390 land immediately); gfxinfo over a letter tap shows 3 janky frames of 45, 90th percentile 18ms. Browse ↔ Most used likewise — see 107. |
| 106 | — | — | **PENDING** | Typing in the search box keeps up with the keyboard, no dropped characters. Device dropped off wireless debugging before this ran. |
| 107 | Expo Go, `6498d63` | 2026-08-27 | PASS | Kind chips switch the list (Roots → Lemmas مِن 3226 → Verbs قَالَ 1618). Flipping to Browse and back redrew the ranked rows **within 1s with no spinner** and with the Lemmas selection intact — the round-2 per-kind cache doing its job. |

### What this run found

**A blank pane on a kind's first load.** Selecting Lemmas for the first time
left the pane empty — no rows, no header, **no spinner and no skeleton** — for
somewhere between 2 and 7 seconds before the 1000 rows appeared. The cache
means it only happens once per kind per launch, and check 107's re-flip is
instant, so this is not the cached path regressing; it is the uncached path
having no loading state at all. Expo Go's dev bundle is part of it (round 2
left that unmeasured by owner's choice), but an empty pane is the wrong answer
at any speed. Worth an issue before M7.

**The alef-madda fix, confirmed on device.** ق-و-ل's `قَآئِل 5` chip filters the
concordance to exactly 5 rows (12:10:2, 18:19:6, …). That chip is the class PR
#29 repaired — the bundled DB was regenerated after that merge, and this is the
end-to-end proof on hardware.

**Harness note for the next run.** `adb shell input tap` sends down and up in
the same event batch, and these `Pressable`s ignore it — a letter cell and a
form chip both needed `input swipe X Y X Y 140` (200ms for the chips) to
register. Two taps that looked like app defects were the harness. The
segmented control and the sort chips do respond to a plain `tap`.
