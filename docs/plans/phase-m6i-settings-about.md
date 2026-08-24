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
- Branch: `feat/m6i-settings-about`. Device checks 103-107.

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

- [ ] **Step 4: Commit**

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

- [ ] **Step 4: Commit**

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

- [ ] **Step 4: Commit**

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

- [ ] **Step 1: Fill the umbrella verification log** — every sub-phase's branch,
  build and device-run result. Verify each against `git log` and the PR list
  rather than against what the ledger says (§14).
- [ ] **Step 2: Update README's "Current Status"** with the M6 checklist state,
  and confirm the M2/M3/M4 rows still read as superseded by M6a.
- [ ] **Step 3: Update STATUS.md.** Short. Write ledger prose at the end, never
  inside an open PR (`[[ledger-prose-feeds-review-rounds]]`).
- [ ] **Step 4: Commit**

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

- [ ] **Step 2: Run checks 103-107 and record every result below.**

| # | Check | Pass condition |
| --- | --- | --- |
| 103 | Menu, both themes | Three rows, each opening the right screen; matches the Task 0 mockup |
| 104 | Change every setting, kill the app, reopen | Every one persisted |
| 105 | Switch UI locale to Uzbek, then Russian | No English strings anywhere in Menu, Settings or About |
| 106 | About | Every source named; the OFL notice present; nothing truncated |
| 107 | Full pass over all nine sub-phases' screens in one session | Nothing from an earlier sub-phase regressed; the app reads as one design |

## Verification Log

| Check | Build | Date | Result | Notes |
| --- | --- | --- | --- | --- |
| 103 | | | | |
| 104 | | | | |
| 105 | | | | |
| 106 | | | | |
| 107 | | | | |
