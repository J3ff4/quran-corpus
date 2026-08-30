# M6i Settings, About + Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the re-skin — Menu, Settings and About — and make the credits
screen honest about everything M6 added: Newsreader, ten reciters, and the
sources they come from.

**Architecture:** Three screens, no new state beyond what M6d/M6e/M6f already
persist. Settings grows the controls those sub-phases added (reader mode is set
from the reader itself, but reciter, density and continuous play belong here
too). About grows a credits section, which is a §11 obligation, not decoration.

**Tech Stack:** as M6a. `apps/mobile` only. No `packages/data` change, no new
dependency.

**Spec:** `docs/plans/phase-m6-glass-redesign.md`, decision 16.

## Global Constraints

Inherited from the umbrella plan. Sub-phase specifics:

- **No §5 trigger.** UI and copy only.
- **CLAUDE.md §11:** dataset attribution must be surfaced per each source's
  licence terms. This sub-phase is where the M6 additions get theirs. Newsreader
  is SIL OFL 1.1 — the licence requires the notice, and it is not optional.
- Every string in all three locales (en / uz / ru). A missing translation is a
  visible English string in a trilingual app, which is worse than a missing
  feature.
- Decision 11: the theme default stays `system`. Do not change it, and do not
  reorder the picker so that another option reads as the default.
- **No mockup exists for these three screens.** The handoff bundle covers
  `1a`-`1k` and `2a`-`2d`; none is Menu, Settings or About. Owner ruling
  2026-08-24: draw them first. Task 0 below is that, and it gates everything
  after it.
- Branch: `feat/m6i-settings-about`. Device checks 155-159.

---

### Task 0: Mockups

Decision 5, applied to the three screens the bundle never covered.

**Files:**
- Create: `docs/design/m6/menu.html`
- Create: `docs/design/m6/settings.html`
- Create: `docs/design/m6/about.html`

- [ ] **Step 1: Read the source of truth**

Read `~/quran-data/corpus-design-files/Quran Corpus Glass.dc.html` in full. Do
not render or screenshot it. Match its 390x844 frame, its glass recipe and its
type scale exactly -- and match `1k`'s list-and-segmented-control anatomy, since
Settings is closer to that screen than to anything else in the bundle.

- [ ] **Step 2: Draw the three screens**

Self-contained HTML, inline styles, night theme. Real content, not lorem: the
actual settings groups from Task 2's table, the actual credits from Task 3's
list, the three real menu rows. Settings is the one worth care -- it is five
groups of controls and it is where a glass system either holds together or
turns into a wall of pills.

- [ ] **Step 3: Show the owner and get approval**

Do not start Task 1 until they have been seen.

- [x] **Step 4: Commit**

```bash
git add docs/design/m6
git commit -m "docs(design): mock menu, settings and about"
```

---

### Task 1: Menu

**Files:**
- Modify: `apps/mobile/src/screens/MenuScreen.tsx`
- Modify: `apps/mobile/src/screens/MenuScreen.test.tsx`
- Modify: `apps/mobile/app/(tabs)/menu.tsx`

Three glass rows — Bookmarks, Settings, About (decision 16) — each with its
icon, a chevron, `usePressScale` and a label that says where it goes. No new
entries; the tab bar is the navigation and this is its overflow.

- [ ] **Step 1: Restyle; existing suite stays green**
- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/screens/MenuScreen.tsx apps/mobile/src/screens/MenuScreen.test.tsx \
        'apps/mobile/app/(tabs)/menu.tsx'
git commit -m "feat(mobile): glass menu rows"
```

---

### Task 2: Settings

**Files:**
- Modify: `apps/mobile/app/settings.tsx`
- Create: `apps/mobile/src/screens/SettingsScreen.tsx`
- Modify: `apps/mobile/src/screens/SettingsTab.test.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`

Grouped glass cards:

| Group | Controls |
| --- | --- |
| Reading | Arabic size (`arabicScale`), word-by-word density (`wbwDensity`, M6e) |
| Recitation | Reciter (`reciterId`, M6f), continuous play |
| Appearance | Theme (`system` / light / dark), reduce motion |
| Language | UI locale, translation language |
| Privacy | Analytics toggle, with the copy saying plainly that nothing is sent today |

`storageError` keeps its existing treatment — when the settings DB cannot be
opened, the screen must still say so rather than letting changes look saved.
That branch already exists; do not lose it in the restyle.

- [ ] **Step 1: Write the failing test**

```tsx
it('still surfaces a settings storage failure', () => {
  renderSettings({ storageError: 'disk full' });

  // The existing behaviour, re-asserted because a restyle is exactly when an
  // error branch gets dropped: without it a user changes a setting, watches it
  // apply, restarts, and finds it reverted with nothing having said why.
  expect(screen.getByRole('alert').textContent).toContain('disk full');
});

it('offers every control M6 added', () => {
  renderSettings({});
  for (const label of ['Reciter', 'Word-by-word density', 'Continuous play']) {
    expect(screen.getByLabelText(label)).toBeTruthy();
  }
});
```

- [ ] **Step 2: Run them, watch them fail, implement, re-run**

- [ ] **Step 3: Mutation-check (§4)**

Remove the `storageError` branch. Expected: the first test FAILS. Restore by
re-editing.

- [x] **Step 4: Commit**

```bash
git add apps/mobile/app/settings.tsx apps/mobile/src/screens/SettingsScreen.tsx \
        apps/mobile/src/screens/SettingsTab.test.tsx apps/mobile/src/i18n/uiStrings.ts
git commit -m "feat(mobile): grouped glass settings"
```

---

### Task 3: About and credits

**Files:**
- Modify: `apps/mobile/app/about.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`

Credits must name, with licence terms:

- **corpus.quran.com** — morphology and grammar.
- **Tanzil** — Uthmani text.
- **QuranEnc** — translations (and the Kuliev Russian set already in the DB).
- **Lane's Lexicon** via qurandev/roots, **Hans Wehr**, and the fourteen
  editorial glosses tagged `editorial`.
- **everyayah.com** — recitation audio, with each of the ten reciters named
  (M6f Task 1's table is the source; render it, do not retype it).
- **Newsreader** — SIL Open Font Licence 1.1, with the notice.
- **Hafs** — the existing Arabic face, with whatever notice it already carries.

- [ ] **Step 1: Write the failing test**

```tsx
it('names every audio source the app can play', () => {
  render(<About />);

  // Rendered from RECITERS rather than retyped, so adding a reciter cannot
  // leave the credits screen quietly wrong -- which is a licence problem, not
  // a copy problem (CLAUDE.md §11).
  for (const reciter of RECITERS) {
    expect(screen.getByText(new RegExp(reciter.label))).toBeTruthy();
  }
});

it('carries the OFL notice for the display face', () => {
  render(<About />);
  expect(screen.getByText(/SIL Open Font License/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run them, watch them fail, implement, re-run**

- [ ] **Step 3: Mutation-check (§4)**

Hardcode a two-reciter list. Expected: the first test FAILS. Restore by
re-editing.

- [x] **Step 4: Commit**

```bash
git add apps/mobile/app/about.tsx apps/mobile/src/i18n/uiStrings.ts
git commit -m "feat(mobile): credit every M6 source in About"
```

---

### Task 4: Close out M6

**Files:**
- Modify: `README.md`
- Modify: `STATUS.md`
- Modify: `docs/plans/phase-m6-glass-redesign.md`

- [x] **Step 1: Fill the umbrella verification log** — every sub-phase's branch,
  build and device-run result. Verify each against `git log` and the PR list
  rather than against what the ledger says (§14).
- [x] **Step 2: Update README's "Current Status"** with the M6 checklist state,
  and confirm the M2/M3/M4 rows still read as superseded by M6a.
- [x] **Step 3: Update STATUS.md.** Short. Write ledger prose at the end, never
  inside an open PR (`[[ledger-prose-feeds-review-rounds]]`).
- [x] **Step 4: Commit**

```bash
git add README.md STATUS.md docs/plans/phase-m6-glass-redesign.md
git commit -m "docs: close out the M6 glass redesign"
```

---

### Task 5: Build and device run

- [ ] **Step 1: Build.**

```bash
cd apps/mobile && pnpm prebuild:assert-db && eas build --platform android --profile preview
```

- [ ] **Step 2: Run checks 155-159 and record every result below.**

| # | Check | Pass condition |
| --- | --- | --- |
| 155 | Menu, both themes | Three rows, each opening the right screen; matches the Task 0 mockup |
| 156 | Change every setting, kill the app, reopen | Every one persisted |
| 157 | Switch UI locale to Uzbek, then Russian | No English strings anywhere in Menu, Settings or About |
| 158 | About | Every source named; the OFL notice present; nothing truncated |
| 159 | Full pass over all nine sub-phases' screens in one session | Nothing from an earlier sub-phase regressed; the app reads as one design |

## Verification Log

| Check | Build | Date | Result | Notes |
| --- | --- | --- | --- | --- |
| 155 | Expo Go (dev) | 2026-08-29 | PASS | Three rows in both themes; each opened its own screen. Version line present on Menu and About. |
| 156 | Expo Go (dev) | 2026-08-29 | PASS | Eight settings changed at once (Arabic size, word-by-word density, continuous play, theme, reduce animations, interface locale, translation locale, analytics), force-stop, relaunch: all eight came back, and so did the reading position. |
| 157 | Expo Go (dev) | 2026-08-29 | PASS | Uzbek then Russian across Menu, Settings and About. The only Latin left is what should be: proper nouns (reciters, translators, Tanzil, Lane's Lexicon) and licence names quoted verbatim ("GNU General Public License", the SIL OFL notice). |
| 158 | Expo Go (dev) | 2026-08-29 | PASS | Every source named across all four groups, all ten reciters rendered from RECITERS, the OFL notice reproduced in full, nothing truncated. Issue #39 is unchanged by this run: the corpus.quran.com row still states the GPL with no licence text, link or source offer, and carries no pending pill. |
| 159 | Expo Go (dev) | 2026-08-29 | FAIL, then PASS after fixes | Three defects, all fixed and re-checked on device in the same session -- see below. |

### Defects found on the full pass

1. **The tab bar was see-through.** `GlassSurface`'s fill is 45% in dark and 85%
   in light, and the tab pill floats over a scrolling page, so ayah text read
   straight through the labels on Home, Surahs, Morphology and Dictionary --
   worst in light mode. `RecitationBar` had already solved exactly this in M6d
   with an opaque backing under the glass; `GlassTabBar` never got one. Fixed
   the same way, re-checked: the bar now reads as a surface, not a window.
2. **The ayah action row clipped in Russian and Uzbek.** "Bookmark · Play" fits
   in English; "Удалить закладку · Воспроизвести" does not, and `GlassSurface`
   clips its overflow, so the Play control was sliced off at the card edge with
   no warning. Uzbek is longer still ("Xatcho'pni olib tashlash", "Ijro etish").
   The row now shrinks and wraps, in both renderers. Nothing is clipped; the
   audio control drops to a second line when it has to.
3. **The bookmark row's tap target** -- see phase-m6h's log.

Everything else held: nothing from M6a-M6g regressed, and the app reads as one
design in both themes and all three locales.

### Worth the owner's eye, not defects

- With **Translation = Русский** every word-by-word gloss carries `(en)`,
  because the corpus has 77,429 `en` and 75,539 `uz` gloss rows and **zero**
  `ru`. That is PR #41's fallback mark working exactly as designed and telling
  the truth -- but the truth is a screen of `(en)`. The fix is gloss data, not
  the mark.
- The Russian tab label truncates to "Морфолог…". One line is deliberate; the
  word is simply longer than a fifth of the bar.

## Deviations

Recorded at merge, not during the PR (`[[ledger-prose-feeds-review-rounds]]`).

- **The plan's "no §5 trigger" line was wrong.** Task 2 adds `continuousPlay` to
  the on-device settings table, and §5 fires on anything writing the user DB.
  The review ran on the finished branch and found five things; four were fixed
  in `61597ef` and one was escalated to the owner (below).
- **Device checks renumbered 103–107 to 155–159.** 103–107 were already spent on
  M6g, whose run ran past its own header's 89–96 and finished at 107. Same
  collision M6h hit and fixed by moving to 148–154. The renumber happened at
  close-out, so nothing has been run against the old numbers.
- **Continuous play changed owner.** The plan seeded `useRecitation`'s
  `useState` from the setting; the hook remounts on every reader entry, so the
  copy would have reset while Settings still read on. `continuous` is now a
  caller-owned prop and the hook no longer returns `setContinuous` — one stored
  value, two views.
- **Four locale strings deleted** (`settings.analyticsOn`/`Off`,
  `reduceMotionOn`/`Off`). `accessibilityRole="switch"` announces its own state;
  a label that spelled the state out again got read twice and could disagree
  with the knob.
- **Translator credits derived, not typed.** The §5 review found About retyping
  the three names while `selectedTranslators` already exports them — the same
  map `create-m1-reader-db.ts` validates the bundled DB against. The drift had
  started: the uz locale said "Muhammad Sodiq", en and ru said "Muhammad Sodik".

### Open, escalated to the owner

`about.sourceCorpus` names the GPL for corpus.quran.com morphology but the app
ships no licence text, link, or source offer — while Newsreader's OFL notice is
reproduced verbatim and test-guarded on the same screen. A licence-compliance
ruling, not a code call. Issue #39.

Merged as `72a17a5` (squash of PR #40).

**Partly met:** the device run happened on 2026-08-29 and is logged above, but
it went through Expo Go rather than a release APK, which §10 makes the gate for
this milestone. `eas build` is blocked until 2026-09-01.
