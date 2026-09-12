# Phase M7g — Mushaf Player

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`. Steps use `- [ ]` checkboxes.

**Goal:** Mushaf tab gets recitation of its own — a one-line compact bar at rest that
grows into the reader's full transport when sound starts, and a page that turns itself
as the voice runs past its last ayah.

**Architecture:** Reuse `RecitationBar` verbatim as the full state. New `MushafPlayer`
owns compact↔full and the chrome fade. New pure `pageAudio.ts` answers "which ayah does
this page start at" and "has the playhead left this page". `MushafScreen` wires them;
the pager never sees player state.

**Tech Stack:** RN + Reanimated 3, `useRecitation` (expo-audio), `react-native-pager-view`.

**Spec:** owner rulings, 2026-09-12, recorded below. No separate spec doc.

**Prereq:** `24e026f` — pause now reports paused. Every ruling here assumes
`audio.playing` is the sound and `playing` is the parking spot.

---

## Global Constraints

- `packages/data` untouched. No schema, no query. Page words already carry
  `surahId` / `ayahNumber` / `position`.
- No new dependency (§12). Everything exists.
- Player state MUST NOT reach `MushafPager` props. PagerView re-renders all 604
  children on any prop change; `positionSec` ticks ~1Hz and would re-render the
  whole Quran every second.
- No `withTiming` called inside a worklet body — shared value + effect. Re-issued
  every render, the curve restarts mid-flight.
- Reduced motion: grow/shrink and page-turn are instant, never skipped.
- WCAG AA. Every control named. A hidden bar leaves the reading order
  (`accessibilityElementsHidden` + `importantForAccessibility`), the pattern
  `GlassTabBar` and `MushafChrome` already use.
- Additive only if anything touches the user DB. Nothing here should.

## Rulings

| # | Ruling |
|---|---|
| R1 | Player hides with the chrome. **Always** — one rule for header, tab bar, player. Idle 3.5s takes it too. |
| R2 | Compact play with nothing parked = first ayah that **begins** on the page. Not the carried-over tail from the page before. |
| R3 | Continuous reaching the page's last ayah → **turn the page and keep playing**. |
| R4 | Compact bar is always on screen whenever the chrome is. Mushaf furniture. |
| R5 | Pause **shrinks** full → compact. Strictly symmetric with sound. |
| R6 | *Derived from R2+R5, agent ruling:* compact play **resumes** when the player is parked on an ayah printed on the page in view; page-start otherwise. Without this, R5 makes pause a trap — pause then play would restart the page. |
| R7 | *Agent ruling, shipped in `24e026f`:* the green ink tracks **sounding**, not parking. Under R1 it is the only cue left once the chrome goes. |
| R8 | Ink stays green (`theme.accent`). No new wash, no new token — owner confirmed the existing mark is right. |

## Findings that shape the work

- **F1 — the index cannot answer R2.** `PageEntry.startAyahNumber` is the ayah the page
  *opens in*, carried over or not. `pageForAyah(pages, s, a)` is vacuous for a page's own
  opener: page P opens exactly at (s,a), so it always answers P. Long ayahs span pages,
  so no index-only rule exists. Read the **composed page**: first word with
  `position === 1` is the first ayah that begins there. Already in hand — the pager has
  the lines for the page in view.
- **F2 — `useRecitation` continuous stops at the surah's last ayah**, by design
  (`ayahAudio.ts`, matching the reader). 51 pages cross a surah boundary, so R3 at such a
  seam needs the screen to start the next surah itself; the hook will not.
- **F3 — `RecitationBar` is reusable as-is.** Props: `ayahNumber, playing, positionSec,
  durationSec, continuous, reciterLabel` + `onTogglePlay / onSkipNext / onSkipPrevious /
  onSeek / onToggleContinuous / onOpenReciters`. Its doc says it outlives the sound; R5
  overrides that for the mushaf only, by unmounting it, not by changing the bar.
- **F4 — dock geometry.** `GlassTabBar` sits `bottom: insets.bottom + 12`, inset 16 each
  side. The player docks above it; the tab bar's height is not exported, so the player
  measures itself and stacks rather than guessing a constant.
- **F5 — a collapsible starves its own `onLayout`.** Measure the full bar with
  `position: absolute` before animating, or the first grow runs 0→0.
- **F6 — the auto page-turn must not fight a manual swipe.** The pager is the source of
  truth for the page in view; the turn is a request, and a user swipe during it wins.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/mushaf/pageAudio.ts` **(new)** | Pure. `firstAyahOnPage(lines)`, `playheadLeftPage(lines, playing)`. No React. |
| `src/mushaf/pageAudio.test.ts` **(new)** | Unit, including the carried-over-tail case F1 names. |
| `src/components/mushaf/MushafPlayer.tsx` **(new)** | Compact↔full, the grow, the chrome fade. Owns no audio. |
| `src/components/mushaf/MushafPlayer.test.tsx` **(new)** | States, a11y, reduced motion. |
| `src/screens/MushafScreen.tsx` | Wiring: mount the player, R2/R6 start, R3 turn, reciter sheet. |
| `src/screens/MushafScreen.test.tsx` | R3 and R6 at the screen level. |
| `src/i18n/uiStrings.ts` | Compact bar labels, 3 locales. |

---

### Task 1: `pageAudio.ts` — which ayah, and has the playhead left

**Files:** Create `src/mushaf/pageAudio.ts`, `src/mushaf/pageAudio.test.ts`

**Interfaces — Produces:**
```ts
export interface PageWord { surahId: number; ayahNumber: number; position: number }
export interface PageLine { words: PageWord[] }
export interface AyahRef { surahId: number; ayahNumber: number }

/** First ayah that BEGINS on the page (F1), or null on a page that is one
 *  long carried-over ayah. */
export function firstAyahOnPage(lines: readonly PageLine[]): AyahRef | null;

/** Is `playhead` printed anywhere on this page? Drives R3's turn and R6's resume. */
export function ayahOnPage(lines: readonly PageLine[], playhead: AyahRef): boolean;
```

- [ ] **Step 1: failing test**
```ts
it('skips the tail carried over from the previous page', () => {
  // Page opens mid-2:25 -- its words start at position 40 -- and 2:26 is the
  // first thing that actually begins here. Starting on the tail would play an
  // ayah whose opening is on the page before (R2).
  const lines = [
    { words: [{ surahId: 2, ayahNumber: 25, position: 40 }] },
    { words: [{ surahId: 2, ayahNumber: 26, position: 1 }] },
  ];
  expect(firstAyahOnPage(lines)).toEqual({ surahId: 2, ayahNumber: 26 });
});

it('answers null on a page that begins nothing', () => {
  // 2:282 alone fills more than a page. There is no ayah to start.
  const lines = [{ words: [{ surahId: 2, ayahNumber: 282, position: 60 }] }];
  expect(firstAyahOnPage(lines)).toBeNull();
});

it('finds a surah that begins part-way down the page', () => {
  // 17 surahs are never any page's opener (see pageJump). A rule keyed on the
  // page's startSurahId misses every one of them.
  const lines = [
    { words: [{ surahId: 93, ayahNumber: 11, position: 3 }] },
    { words: [{ surahId: 94, ayahNumber: 1, position: 1 }] },
  ];
  expect(firstAyahOnPage(lines)).toEqual({ surahId: 94, ayahNumber: 1 });
});
```
- [ ] **Step 2:** `npx vitest run src/mushaf/pageAudio.test.ts` — FAIL, no module.
- [ ] **Step 3:** implement. Scan lines in order, first `position === 1` wins. `ayahOnPage` = any word matching both ids.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: mutation-check.** Change `position === 1` to `position <= 1`, then to
      `position >= 1`. The second must fail test 1. A test that passes both ways
      asserts nothing (§4.4).
- [ ] **Step 6:** commit `feat(mobile/mushaf): name the ayah a page actually begins`

---

### Task 2: `MushafPlayer` — compact, full, and the grow between them

**Files:** Create `src/components/mushaf/MushafPlayer.tsx`, `.test.tsx`. Modify `uiStrings.ts`.

**Interfaces — Consumes:** `RecitationBar` (F3), `useChromeVisible`, `useReducedMotion`.
**Produces:**
```ts
export interface MushafPlayerProps {
  /** Sound is coming out. The ONLY thing that picks compact vs full (R5). */
  playing: boolean;
  /** Parked ayah, for the full bar's label. Null before the first play. */
  ayahNumber: number | null;
  positionSec: number; durationSec: number; continuous: boolean;
  reciterLabel: string; uiLocale: UiLocaleCode;
  onTogglePlay: () => void; onSkipNext: () => void; onSkipPrevious: () => void;
  onSeek: (sec: number) => void; onToggleContinuous: () => void;
  onOpenReciters: () => void;
  /** Where the tab bar ends, so the player docks above it (F4). */
  bottomOffset: number;
}
```

Compact row: reciter label + `chevronDown` (opens the picker, same control as the
reader's) + one play button. testIDs `mushaf-player-compact`, `mushaf-player-play`.
Full: `RecitationBar` under testID `mushaf-player-full`.

- [ ] **Step 1: failing tests**
```ts
it('shows one line at rest and the transport while playing', () => {
  const { rerender } = render(<MushafPlayer {...props} playing={false} />);
  expect(screen.getByTestId('mushaf-player-compact')).toBeTruthy();
  expect(screen.queryByTestId('mushaf-player-full')).toBeNull();

  rerender(<MushafPlayer {...props} playing />);
  expect(screen.getByTestId('mushaf-player-full')).toBeTruthy();
});

it('goes back to one line when the sound stops', () => {
  // R5, and the half a symmetric rule gets wrong: `ayahNumber` survives a
  // pause, so a bar keyed on it would never shrink.
  const { rerender } = render(<MushafPlayer {...props} playing ayahNumber={5} />);
  rerender(<MushafPlayer {...props} playing={false} ayahNumber={5} />);
  expect(screen.getByTestId('mushaf-player-compact')).toBeTruthy();
});

it('names the reciter on the compact bar, not just the control', () => {
  render(<MushafPlayer {...props} playing={false} reciterLabel="Al-Husary" />);
  expect(screen.getByTestId('mushaf-player-compact').textContent).toContain('Al-Husary');
});

it('leaves the reading order with the chrome', () => {
  mocks.chromeVisible = false;
  render(<MushafPlayer {...props} playing={false} />);
  // R1. A bar TalkBack reaches is a bar the user cannot see to know they
  // reached -- and its tap-to-restore lands on the bar, not the page.
  expect(screen.getByTestId('mushaf-player').getAttribute('data-hidden-from-a11y')).toBe('true');
});
```
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** implement. Chrome fade copies `GlassTabBar` (opacity + translateY,
      `pointerEvents` none while hidden). Grow: shared value driven from an effect
      (never `withTiming` in a worklet), duration 0 under reduced motion. Measure the
      full bar absolutely first (F5).
- [ ] **Step 4:** PASS.
- [ ] **Step 5: mutation-check.** Key the compact/full switch on `ayahNumber !== null`
      instead of `playing` — test 2 must fail.
- [ ] **Step 6:** commit `feat(mobile/mushaf): a player that rests on one line`

---

### Task 3: wire it into the screen — R2, R6, the picker

**Files:** Modify `src/screens/MushafScreen.tsx`, `src/screens/MushafScreen.test.tsx`

The screen already holds `audio`, `playing`, `reciterId`, `continuousPlay`. It needs the
**lines of the page in view** to apply R2/R6 — pass them up from the pager's focused page,
or read them from the page cache the pager already fills. **Do not** push player state
down into the pager (Global Constraints).

- [ ] **Step 1: failing tests**
```ts
it('starts the page at the first ayah that begins on it', () => {
  // R2. The page opens on a carried-over tail; the tail is not what plays.
  ...
  expect(mocks.toggleAyah).toHaveBeenCalledWith(26, 2);
});

it('resumes the parked ayah instead of restarting the page', () => {
  // R6. Pause shrinks to compact (R5), so compact's play IS the resume
  // control. Without this, pause-then-play throws the reader back to the top
  // of the page -- pausing would be a trap.
  mocks.audio = { ayah: 30, playing: false };
  ...
  expect(mocks.toggleAyah).toHaveBeenCalledWith(30, 2);
});

it('starts the page over when the parked ayah is not printed here', () => {
  // Paused, then swiped two pages on. Resuming an ayah that is not on screen
  // would play something the reader cannot see.
  ...
});
```
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5: mutation-check.** Drop the `ayahOnPage` guard from R6 — test 3 must fail.
- [ ] **Step 6:** commit `feat(mobile/mushaf): play the page from the top, or resume it`

---

### Task 4: R3 — the page follows the voice

**Files:** Modify `src/screens/MushafScreen.tsx`, `src/screens/MushafScreen.test.tsx`

- [ ] **Step 1: failing tests**
```ts
it('turns the page when the playhead runs off it', () => {
  // R3: the mushaf follows the voice.
  ...
  expect(props()['focusPage']).toBe(107);
});

it('does not turn the page for an ayah still printed on it', () => {
  // Continuous advances ayah by ayah; most advances stay on the page. A turn
  // per ayah would flip the whole juz during one page's recitation.
  ...
});

it('leaves the page alone once the reader swipes away mid-recitation', () => {
  // F6. The pager is the truth about which page is in view; the turn is a
  // request, and a finger outranks it.
  ...
});
```
- [ ] **Step 2:** FAIL. **Step 3:** implement — watch `audio.ayah`, `ayahOnPage` false →
      request `focusPage + 1`. **F2:** at a surah seam the hook stops; the screen starts
      the next page's first ayah itself, in that page's own surah.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: mutation-check.** Remove the `ayahOnPage` guard — test 2 must fail.
- [ ] **Step 6:** commit `feat(mobile/mushaf): the page turns with the recitation`

---

### Task 5: device run (§10)

No emulator in CI; the on-device checklist is the gate. A milestone is not complete
until these are run on hardware and recorded here.

| # | Check |
|---|---|
| 325 | Compact bar sits above the tab bar on every page, both themes. Reciter name legible, not clipped. |
| 326 | Tap play on a page opening mid-ayah → the first ayah that *begins* there sounds, not the tail. |
| 327 | Compact grows to the full transport when sound starts. One motion, no flash of a 0-height bar (F5). |
| 328 | Pause → shrinks back to one line (R5). Press play → **resumes that ayah**, does not restart the page (R6). |
| 329 | Pause, swipe two pages on, play → starts *that* page's first ayah. |
| 330 | Continuous on: the page turns itself at the page's last ayah and recitation runs on (R3). |
| 331 | Same at a page that crosses a surah boundary (F2) — e.g. the end of 93 into 94. |
| 332 | Swipe manually while reciting: the page you swiped to is the page that stays (F6). |
| 333 | Tap the page → header, tab bar **and** player all go, playing or not (R1). Tap again → all three back. |
| 334 | Idle 3.5s while playing → the same. Green ink is then the only sign of audio (R7). |
| 335 | Chevron on the compact bar opens the reciter picker; choosing one keeps the playhead. |
| 336 | Scrub, skip next, skip previous, continuous toggle all work in the mushaf's full bar. |
| 337 | Reduced motion: no grow, no page-turn animation, nothing stuck half-open. |
| 338 | TalkBack: compact bar announces reciter + play; hidden chrome removes all three bars from the order. |
| 339 | Swipe fast through 20 pages while playing — no jank. Confirms player state never reached the pager. |

**Verification log:** _(unrun)_

---

## Risks & rollback

| Risk | Mitigation |
|---|---|
| Player state re-renders all 604 pager children | Global Constraint; check 339 is the proof on glass. |
| Auto-turn fights a manual swipe | F6 — pager wins; check 332. |
| Continuous dies at a surah seam | F2 — screen restarts it; check 331. |
| Two bars stack over a short page | Player measures and docks above the tab bar (F4); check 325. |
| Grow animates 0→0 on first open | F5 absolute measure; check 327. |

**Rollback:** every task is its own commit, and `MushafPlayer` is mounted in one place.
Dropping the mount restores today's mushaf; Task 1 is pure and harmless if left.

## Not in scope

- Word-level highlighting during recitation.
- Reciter change mid-ayah restarting the ayah — it keeps the playhead (check 335).
- Any change to the reader's own `RecitationBar` behaviour (R5 is mushaf-only, done by
  unmounting, not by editing the bar).
