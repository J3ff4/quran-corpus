# Phase M8 — One player, everywhere

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (or `superpowers:executing-plans`). Steps are checkboxes.

**Goal:** Recitation stops being a property of the screen that started it. One engine app-wide; a docked mini-player on every tab while it sounds; a player card on Home that resumes the last-read ayah. Plus three mushaf chrome fixes: the status bar leaves with the rest of the chrome, the idle timer restarts on player touch, and the grow animation slows to 280ms.

**Architecture:** `useRecitation` moves behind `RecitationProvider` in `app/_layout.tsx`. The hook keeps its whole body; what changes is *who* supplies `surah` / `ayahCount` / `surahName` / `continuous` — today the rendering screen, after this a **track context** the caller hands over at start time. The track carries an `owner` so only the screen that started a recitation paints its highlight. Every surface — reader bar, mushaf player, mini-player, home card — is a view over that one engine.

**Tech Stack:** expo-audio (unchanged), expo-status-bar (already a dependency), expo-navigation-bar (landed vc13), Reanimated, Expo Router tabs.

**Spec:** owner rulings, §0 below. Given live 2026-09-15; this file is their record.

## Global Constraints

- **No new dependency** (§12). `expo-status-bar@~57.0.1` and `expo-navigation-bar@~57.0.2` are already in `package.json`.
- User DB: **read-only this phase**. No migration, no new write path. Nothing here trips §5.
- §5 triggers (`packages/data`, trust boundaries, on-device DB writes): **none apply**. Ships on §4 self-review + lint/type-check/tests. Do not escalate.
- `@quran-corpus/data/mobile` for corpus reads. Never the barrel.
- Every task: lint + type-check + all suites green, **mutation-check every new branch**, conventional commit.
- Device gate is real hardware (§10). Metro watcher is dead here — every edit needs `expo start --clear`.
- Baseline at plan time: **1168 mobile tests / 104 files**, branch `fix/s24-navbar-playing-band-stutter`, versionCode 13.

---

## §0 Rulings (owner, 2026-09-15)

1. **Mushaf hides the top system bar too**, on the same rule as the rest of the chrome; touch brings it back.
2. **No reflow.** The page does not move when either system bar hides. "Starts from the very top" means nothing is *drawn over* it, not that the page grows.
3. **Skip system-bar colour work entirely.** Both bars are already `@android:color/transparent` in `android/app/src/main/res/values/styles.xml:5-6`; hiding them on the mushaf is the whole ask.
4. **One engine app-wide.** Mushaf and reader share one playhead. Starting one stops the other.
5. **X on the mini-player = stop and dismiss.** Audio halts. No hidden still-playing state.
6. **Mini-player on tab screens only.** Not on pushed stack screens. Not over sheets.
7. **Home gets its own card, under Continue reading.** Continue keeps its current behaviour untouched.
8. **Home's card grows in place** to the full transport while sounding. The mini-player is suppressed on Home — never two transports on one screen.
9. **Home's play is always continuous** from that ayah onward, regardless of the Continuous setting. It is a resume-listening control.
10. **Chrome still auto-hides while playing.** 3.5s from the *last touch* of the player or the tab bar, not from the last page turn.
11. **Grow/retract: 180ms → 280ms.**

### Ruling 3 as scoped

No colour code ships. If the owner later reports a grey strip behind the buttons, that is Android 15's forced nav-bar scrim and the fix is a window opt-out, not a colour — `setBackgroundColorAsync` is a no-op on Android 15+. Recorded here so the next session does not re-derive it.

### Ruling 2 is load-bearing, and not free

`useSafeAreaInsets().top` **drops to ~0 when the status bar hides**. Any layout reading it live moves the page — which is exactly ruling 2's "no". The mushaf must therefore paint against a *frozen* top inset, captured while the chrome is up. Same hazard already exists on the bottom (vc13 hid the nav bar) but was invisible because the tab bar hides in the same frame. Task 1 freezes both.

---

## §1 File structure

**New**
- `apps/mobile/src/audio/recitationContext.tsx` — `RecitationProvider`, `useRecitationController`, the `TrackContext` type. The single owner of the engine.
- `apps/mobile/src/components/PlayerShell.tsx` — the measured compact↔full grow box, lifted verbatim out of `MushafPlayer` so Home can use it too.
- `apps/mobile/src/components/MiniPlayer.tsx` — the docked bar for tab screens, with the X.
- `apps/mobile/src/home/HomePlayerCard.tsx` — Home's card: compact starter, grows to full transport.
- `apps/mobile/src/theme/useFrozenInsets.ts` — safe-area insets captured while the system bars are up.

**Modified**
- `apps/mobile/app/_layout.tsx` — mount `RecitationProvider` inside the settings provider.
- `apps/mobile/app/(tabs)/_layout.tsx` — render `MiniPlayer`.
- `apps/mobile/app/surah/[surahId].tsx` — drop its own `useRecitation`; consume the controller.
- `apps/mobile/src/screens/MushafScreen.tsx` — same, plus `<StatusBar>`, frozen insets, owner-gated highlight.
- `apps/mobile/src/audio/ayahAudio.ts` — add `stop()`. Nothing else changes.
- `apps/mobile/src/components/RecitationBar.tsx` — `onInteract`, `onDismiss` props.
- `apps/mobile/src/components/mushaf/MushafPlayer.tsx` — grow box extracted out; `GROW_MS` 280; touch resets the timer.
- `apps/mobile/src/components/GlassTabBar.tsx` — touch resets the timer.
- `apps/mobile/src/home/HomeScreen.tsx` — mount the card under Continue.
- `apps/mobile/src/i18n/uiStrings.ts` — `player.stop`, `home.listen`.
- `apps/mobile/app.json` + `android/app/build.gradle:95` — versionCode 14.

**Deleted** — nothing.

---

## §2 The track context

The one new idea in this phase. Everything else is plumbing.

```ts
// src/audio/recitationContext.tsx
export type RecitationOwner = 'reader' | 'mushaf' | 'home';

export interface TrackContext {
  /** Who started it. A screen paints its playing-highlight only for its own. */
  owner: RecitationOwner;
  surahId: number;
  /** Where continuous play stops. */
  ayahCount: number;
  /** Lock-screen title. */
  surahName: string;
  continuous: boolean;
}
```

Why an `owner` and not just `surahId`: the reader and the mushaf can both be showing surah 2 at the same time — reader mounted in the stack, mushaf mounted behind it as a tab. Without the owner, starting the reader's 2:255 paints a green band on a mushaf page nobody is looking at, and pausing from the mini-player would leave two screens disagreeing about which of them is the player.

Why the *caller* supplies `ayahCount` and `surahName` rather than the provider looking them up: the provider would need the corpus DB, which would put a database open on the app's root layout and on every cold start. The two screens that start recitation have that data loaded already.

---

## Task 1: System bars leave with the chrome, page stays put

**Files:** create `src/theme/useFrozenInsets.ts`, `src/theme/useFrozenInsets.test.ts`; modify `src/screens/MushafScreen.tsx`; test `src/screens/MushafScreen.test.tsx`.

**Interfaces:** produces `useFrozenInsets(live: boolean): EdgeInsets` — returns the live insets while `live` is true, and the last live value while it is false.

- [ ] **Step 1 — failing test** in `useFrozenInsets.test.ts`:

```ts
it('holds the last live inset once the bars are down', () => {
  insets = { top: 28, bottom: 48, left: 0, right: 0 };
  const view = renderHook(({ live }: { live: boolean }) => useFrozenInsets(live), {
    initialProps: { live: true },
  });
  expect(view.result.current.top).toBe(28);

  insets = { top: 0, bottom: 0, left: 0, right: 0 };
  view.rerender({ live: false });
  expect(view.result.current.top).toBe(28);
  expect(view.result.current.bottom).toBe(48);
});
```

- [ ] **Step 2 — run it.** Expect FAIL: module not found.

- [ ] **Step 3 — implement**:

```ts
import { useRef } from 'react';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

/**
 * Safe-area insets as they were while the system bars were up.
 *
 * Hiding a system bar collapses its inset to 0, so any layout reading the live
 * value reflows the moment the bar leaves -- which is precisely what ruling 2
 * says must not happen. Held in a ref rather than state: it is read during the
 * same render that writes it, and a setState here would render the page once at
 * the collapsed inset before correcting itself.
 */
export function useFrozenInsets(live: boolean): EdgeInsets {
  const insets = useSafeAreaInsets();
  const held = useRef(insets);
  if (live) held.current = insets;
  return held.current;
}
```

- [ ] **Step 4 — run it.** Expect PASS.

- [ ] **Step 5 — mutation-check.** Delete the `if (live)` guard so it always writes. Re-run: the second assertion must fail. Restore by re-editing (never `git checkout`).

- [ ] **Step 6 — failing test** in `MushafScreen.test.tsx`: with `chromeVisible: false` and `isFocused: true`, `getByTestId('system-status-bar')` carries `data-hidden="true"`; with `chromeVisible: true` it is `"false"`. Extend the `expo-status-bar` mock in `src/test/setup.ts` alongside the existing `expo-navigation-bar` one:

```ts
vi.mock('expo-status-bar', async () => {
  const React = await import('react');
  return {
    StatusBar: ({ hidden }: { hidden?: boolean }) =>
      React.createElement('div', {
        'data-testid': 'system-status-bar',
        'data-hidden': hidden ? 'true' : 'false',
      }),
  };
});
```

- [ ] **Step 7 — run it.** Expect FAIL: no such testID.

- [ ] **Step 8 — implement** in `MushafScreen.tsx`, on the line below the existing `NavigationBar`:

```tsx
{/* Same gate as the nav bar: focused AND chrome down. The status bar is
    app-wide state, so an unfocused tab asking for it hidden would take the
    clock off every other screen (the #80 class of defect). */}
<StatusBar hidden={mushafFocused && !chromeVisible} />
```

and swap every `useSafeAreaInsets()` read in this screen for `useFrozenInsets(chromeVisible)`.

- [ ] **Step 9 — run it.** Expect PASS. Full mobile suite green.

- [ ] **Step 10 — mutation-check.** Flip the gate to `!mushafFocused && !chromeVisible`. The focus test must fail. Restore.

- [ ] **Step 11 — commit.** `feat(mobile/mushaf): take the status bar down with the rest of the chrome`

---

## Task 2: The idle timer restarts on the last touch, and the grow slows

**Files:** modify `src/components/RecitationBar.tsx`, `src/components/mushaf/MushafPlayer.tsx`, `src/components/GlassTabBar.tsx`; test `src/components/RecitationBar.test.tsx`, `src/components/mushaf/MushafPlayer.test.tsx`, `src/components/GlassTabBar.test.tsx`.

**Interfaces:** produces `RecitationBarProps.onInteract?: (() => void) | undefined` — called on every transport press and on the scrub gesture's begin **and** end.

- [ ] **Step 1 — failing test** in `RecitationBar.test.tsx`: pressing Play calls `onInteract`; a scrub `onEnd` calls it too. Assert the **end**, not only the begin: ruling 10 says the countdown starts at the last touch, and a 3-second drag that only reported its start would hide the chrome under the finger still holding it.

- [ ] **Step 2 — run it.** Expect FAIL: prop ignored.

- [ ] **Step 3 — implement.** Add the optional prop; call it at the top of each `TransportButton`'s `onPress` (wrap, do not replace), in the scrub gesture's `.onBegin` and `.onEnd`.

- [ ] **Step 4 — run it.** Expect PASS.

- [ ] **Step 5 — mutation-check.** Remove the `.onEnd` call. The end assertion must fail. Restore.

- [ ] **Step 6 — failing test** in `MushafPlayer.test.tsx`: a touch anywhere on `mushaf-player` calls `showChrome`. Mock `@/mushaf/chromeVisibility`.

- [ ] **Step 7 — run it.** Expect FAIL.

- [ ] **Step 8 — implement** on the `MushafPlayer` root `Animated.View`, and on `GlassTabBar`'s container:

```tsx
// Capture-phase, returning false: this observes every touch that starts
// anywhere inside without claiming the responder, so the transport buttons
// and the scrub pan keep working exactly as they did. `onTouchStart` would
// not do -- gesture-handler's scrub track does not route through RN's
// responder system on the way down.
onStartShouldSetResponderCapture={() => {
  showChrome();
  return false;
}}
```

and pass `onInteract={showChrome}` to the `RecitationBar` inside `MushafPlayer`, which covers the gesture-handler path the capture misses.

- [ ] **Step 9 — run it.** Expect PASS.

- [ ] **Step 10 — mutation-check.** Return `true` from the capture handler. The transport-press tests must fail (the container swallows the tap). Restore.

- [ ] **Step 11 — implement** `const GROW_MS = 280;` in `MushafPlayer.tsx`, and update its doc comment — it currently argues *for* 180ms ("anything slower reads as lag"), which is now false. Replace with: owner, 2026-09-15, 180ms read as a snap rather than a motion.

- [ ] **Step 12 — run the suite.** Green.

- [ ] **Step 13 — commit.** `fix(mobile/mushaf): restart the idle timer from the last touch of the player`

---

## Task 3: The engine gets a stop, and a provider

**Files:** create `src/audio/recitationContext.tsx`, `src/audio/recitationContext.test.tsx`; modify `src/audio/ayahAudio.ts`, `app/_layout.tsx`; test `src/audio/ayahAudio.test.ts`.

**Interfaces:** produces
```ts
export function useRecitationController(): {
  track: TrackContext | null;
  ayah: number | null;
  playing: boolean;
  positionSec: number;
  durationSec: number;
  finished: boolean;
  error: UiStringKey | null;
  /** Start (or toggle) an ayah under a track. Replaces whatever was sounding. */
  toggle: (track: TrackContext, ayah: number) => void;
  seekTo: (sec: number) => void;
  skipNext: () => void;
  skipPrevious: () => void;
  /** Halt and forget the track. The X, and nothing else. */
  stop: () => void;
};
```

- [ ] **Step 1 — failing test** in `ayahAudio.test.ts`: after `stop()`, the driver was paused, `ayah` is null and `playing` is false.

- [ ] **Step 2 — run it.** Expect FAIL: no `stop`.

- [ ] **Step 3 — implement** `stop()` in `useRecitation`: pause the driver, clear `ayahRef` / `loadedSurahRef` / `finishedRef` / `soundedRef`, `setState(IDLE)`. Leave the driver **alive** — destroying it here would make the next play re-create a player and lose the lock-screen session for no reason. Export it from the return object.

- [ ] **Step 4 — run it.** Expect PASS.

- [ ] **Step 5 — mutation-check.** Drop the `ayahRef.current = null` line. Assert a subsequent `skipNext()` does nothing rather than advancing from the stopped ayah — if that test passes both ways, it asserts nothing; strengthen it until it does not.

- [ ] **Step 6 — failing test** in `recitationContext.test.tsx`: a consumer calling `toggle(readerTrack, 255)` reports `track.owner === 'reader'`; a second consumer calling `toggle(mushafTrack, 1)` moves `track.owner` to `'mushaf'` and the reader consumer sees the same single state.

- [ ] **Step 7 — run it.** Expect FAIL.

- [ ] **Step 8 — implement**:

```tsx
const RecitationContext = createContext<RecitationController | null>(null);

export function RecitationProvider({ children }: { children: ReactNode }) {
  const { reciterId } = useAppSettings();
  const [track, setTrack] = useState<TrackContext | null>(null);
  const audio = useRecitation(track?.surahId ?? null, track?.ayahCount ?? 0, reciterId, {
    continuous: track?.continuous ?? false,
    ...(track ? { surahName: track.surahName } : {}),
  });

  // The track is set and the ayah started in the same tick, so `startAyah`
  // runs against the PREVIOUS render's `continuous` and `ayahCount`. Harmless
  // in both places it is read: `ayahCount` only gates a preload one ayah
  // ahead, and `continuous` is not consulted until `didJustFinish` -- seconds
  // later, long after the re-render has landed. `surahId` is not affected: it
  // is passed explicitly as the override argument for exactly this reason.
  const toggle = useCallback(
    (next: TrackContext, ayah: number) => {
      setTrack(next);
      audio.toggleAyah(ayah, next.surahId);
    },
    [audio],
  );

  const stop = useCallback(() => {
    audio.stop();
    setTrack(null);
  }, [audio]);

  const value = useMemo(() => ({ ...audio, track, toggle, stop }), [audio, track, toggle, stop]);
  return <RecitationContext.Provider value={value}>{children}</RecitationContext.Provider>;
}

export function useRecitationController(): RecitationController {
  const value = useContext(RecitationContext);
  // Throw rather than return a null-object. A screen that renders outside the
  // provider would otherwise show a transport whose buttons silently do
  // nothing, which is the failure mode issue #63 was filed for.
  if (value === null) throw new Error('useRecitationController outside RecitationProvider');
  return value;
}
```

- [ ] **Step 9 — run it.** Expect PASS.

- [ ] **Step 10 — mutation-check.** Remove the `setTrack(next)` from `toggle`. The owner-switch test must fail.

- [ ] **Step 11 — mount it** in `app/_layout.tsx`, **inside** the settings provider (it reads `reciterId`) and outside the router stack, so a tab switch never remounts it. Add a test asserting the nesting order — a provider mounted above settings throws on first render, and that is a crash on cold start, not a styling bug.

- [ ] **Step 12 — run the suite.** Green. `toggleAyah` still has no second caller yet; that is Task 4.

- [ ] **Step 13 — commit.** `feat(mobile/audio): one recitation engine behind a provider`

---

## Task 4: Reader and mushaf move onto the shared engine

**Files:** modify `app/surah/[surahId].tsx`, `src/screens/MushafScreen.tsx`; test both their suites.

**Interfaces:** consumes `useRecitationController` from Task 3. Produces nothing new.

- [ ] **Step 1 — failing test** in `MushafScreen.test.tsx`: with the controller reporting a live track owned by `'reader'` on surah 2 ayah 255, the mushaf page paints **no** playing highlight, even when that ayah is on the open page.

- [ ] **Step 2 — run it.** Expect FAIL — today the screen paints whatever `audio.ayah` says.

- [ ] **Step 3 — implement.** In both screens, replace the `useRecitation(...)` call with `useRecitationController()`, and gate every highlight and every transport-state read on `track?.owner === 'mushaf'` (resp. `'reader'`). Each screen builds its `TrackContext` at the call site it already has the data in:

```ts
// MushafScreen — continuous: true unconditionally, unchanged from M7g. A
// button that says "play this page" and stops after one ayah is broken
// however the setting reads.
audio.toggle(
  {
    owner: 'mushaf',
    surahId,
    ayahCount: index.ayahCounts.get(surahId) ?? 0,
    surahName: index.surahNames.get(surahId) ?? '',
    continuous: true,
  },
  ayahNumber,
);
```

```ts
// SurahRoute — the saved setting governs here, where play is per-ayah and
// "just this one" is a coherent request.
audio.toggle(
  {
    owner: 'reader',
    surahId,
    ayahCount: reader?.data.surah.ayah_count ?? 0,
    surahName: reader?.data.surah.name_translit ?? '',
    continuous: continuousPlay,
  },
  ayahNumber,
);
```

- [ ] **Step 4 — run it.** Expect PASS.

- [ ] **Step 5 — mutation-check.** Drop the owner gate in `MushafScreen`. The cross-paint test must fail.

- [ ] **Step 6 — failing test** in the reader suite, mirrored: a track owned by `'mushaf'` leaves the reader's cards unhighlighted and its bar hidden.

- [ ] **Step 7 — run, implement if red, re-run.**

- [ ] **Step 8 — full suite.** Green. Both screens' existing audio tests must still pass **unchanged in intent** — if one needed rewriting to something weaker, that is a regression, not a test fix.

- [ ] **Step 9 — commit.** `refactor(mobile): reader and mushaf share one playhead`

---

## Task 5: Extract the grow box

**Files:** create `src/components/PlayerShell.tsx`, `src/components/PlayerShell.test.tsx`; modify `src/components/mushaf/MushafPlayer.tsx`.

**Interfaces:** produces

```tsx
export interface PlayerShellProps {
  /** Which child is showing. The only thing that picks a height. */
  expanded: boolean;
  compact: ReactNode;
  full: ReactNode;
  /** Duration of the height curve. 0 under reduced motion. */
  growMs: number;
}
```

Pure layout. It measures both children, animates the clip's height between them, and keeps `SHADOW_ROOM` around the box so the surface's drop shadow is never shaved. Everything about chrome fade, docking and position stays with the caller.

- [ ] **Step 1 — failing test**: mounting with `expanded: false` renders the compact child; rerendering with `expanded: true` renders the full one, and the box's animated height is the full child's measured height plus `SHADOW_ROOM * 2`.

- [ ] **Step 2 — run it.** Expect FAIL.

- [ ] **Step 3 — implement** by moving the existing block out of `MushafPlayer` **verbatim** — the two measured heights, the first-measurement snap, the absolute bottom-anchored inner view, and every comment explaining why each exists. Those comments are the record of three separate device defects; do not paraphrase them.

- [ ] **Step 4 — run it.** Expect PASS.

- [ ] **Step 5 — rewire** `MushafPlayer` to render `<PlayerShell expanded={playing} … />`. Its own tests must pass **untouched**. A test that needed editing here means the extraction changed behaviour.

- [ ] **Step 6 — mutation-check.** Delete the first-measurement snap (`if (height.value === 0) height.value = target`). A test must fail on the unasked-for 0→full entrance; if none does, write one — this is the shim-vacuity trap from `reanimated-shim-hands-back-a-fresh-box`.

- [ ] **Step 7 — commit.** `refactor(mobile): lift the player's grow box out of the mushaf`

---

## Task 6: The mini-player

**Files:** create `src/components/MiniPlayer.tsx`, `src/components/MiniPlayer.test.tsx`; modify `src/components/RecitationBar.tsx`, `app/(tabs)/_layout.tsx`, `src/i18n/uiStrings.ts`; test `src/components/RecitationBar.test.tsx`.

**Interfaces:** consumes `useRecitationController`. Produces `RecitationBarProps.onDismiss?: (() => void) | undefined` — renders a trailing X when supplied, nothing when omitted.

- [ ] **Step 1 — failing test** in `RecitationBar.test.tsx`: with `onDismiss`, an X button labelled `player.stop` renders and calls it; without, `queryByLabelText` is null.

- [ ] **Step 2 — run it.** Expect FAIL.

- [ ] **Step 3 — implement** as one more `TransportButton` after the continuous toggle: `icon: 'close'` (already in the set, `Icon.tsx:171`), `color: theme.mutedText`. Muted, not `danger`: it stops a recitation, it does not destroy anything.

- [ ] **Step 4 — run it.** Expect PASS.

- [ ] **Step 5 — failing test** in `MiniPlayer.test.tsx`, four cases:
  - no track → renders nothing;
  - track playing, route `surahs` → renders the bar;
  - route `mushaf` → renders nothing (that screen has its own player);
  - route `index` → renders nothing (Home's card grows instead, ruling 8).

- [ ] **Step 6 — run it.** Expect FAIL.

- [ ] **Step 7 — implement**:

```tsx
/**
 * The transport, docked over whichever tab you walked to while it was
 * sounding.
 *
 * Rendered by the tabs layout, so it is a tab-screen thing by construction --
 * a pushed stack screen draws above this layout and never sees it (ruling 6).
 * Sheets need no suppression either: `BottomSheet` is a RN `<Modal>`, which
 * gets its own window above every view in this one.
 *
 * Gone entirely when nothing is playing. Not faded, not disabled: ruling 6
 * says it appears only if recitation is already live, and a parked bar on
 * five tabs is five screens of furniture for a sound that stopped.
 */
export function MiniPlayer({ bottomOffset }: { bottomOffset: number }) {
  const audio = useRecitationController();
  const route = useSegments();
  const onOwnPlayer = route.at(-1) === 'mushaf' || route.at(-1) === 'index';
  if (audio.track === null || !audio.playing || onOwnPlayer) return null;
  return <RecitationBar dock={false} onDismiss={audio.stop} … />;
}
```

(Confirm the segment values against `app/(tabs)/` before relying on them — `index.tsx` is Home. Assert both in the test.)

- [ ] **Step 8 — run it.** Expect PASS.

- [ ] **Step 9 — mutation-check.** Flip `onOwnPlayer` to `false`. The mushaf and Home cases must fail.

- [ ] **Step 10 — mount** in `app/(tabs)/_layout.tsx` above `GlassTabBar`, docked at the same `tabBarTop + 8` offset the mushaf player uses. Do **not** re-derive that number — read how `MushafScreen.tsx:526` gets it and take the same route.

- [ ] **Step 11 — suite green. Commit.** `feat(mobile): a docked mini-player on every tab while it recites`

---

## Task 7: The Home player card

**Files:** create `src/home/HomePlayerCard.tsx`, `src/home/HomePlayerCard.test.tsx`; modify `src/home/HomeScreen.tsx`, `src/i18n/uiStrings.ts`; test `src/home/HomeScreen.test.tsx`.

**Interfaces:** consumes `useRecitationController`, `PlayerShell`, and Home's existing `position` / `continueAyah` loads. Adds no new query.

- [ ] **Step 1 — failing test**: with a reading position at 2:255 and nothing playing, the card renders compact — reciter name plus a play control. Pressing it calls `toggle` with `{ owner: 'home', surahId: 2, ayahCount: 286, continuous: true }` and ayah 255. **Assert `continuous: true` while the settings mock says `continuousPlay: false`** — that is ruling 9, and a test that leaves the setting at its default asserts nothing.

- [ ] **Step 2 — run it.** Expect FAIL.

- [ ] **Step 3 — implement.** `ayahCount` and `surahName` come from `continueAyah.data` — the same `ReaderLocation` the Continue card already renders, so there is no second load. If it has not resolved yet, the card renders compact with its play control **disabled**: starting a track with `ayahCount: 0` would stop continuous play dead after one ayah.

- [ ] **Step 4 — run it.** Expect PASS.

- [ ] **Step 5 — mutation-check.** Change `continuous: true` to `continuousPlay`. The ruling-9 test must fail.

- [ ] **Step 6 — failing test**: while `track.owner === 'home'` and playing, the card renders the full transport; while a **reader**-owned track plays, the card stays compact. (It is Home's card, not a mirror of whatever is sounding — and the mini-player is suppressed here, so this case is the one where Home shows no transport at all. That is intended: the reader is one tap away and owns its own bar.)

- [ ] **Step 7 — run, implement with `PlayerShell`, re-run.**

- [ ] **Step 8 — mount** in `HomeScreen.tsx` directly below `home-continue`. No reordering of the existing cards.

- [ ] **Step 9 — suite green. Commit.** `feat(mobile/home): a player card that resumes the last-read ayah`

---

## Task 8: Ship it

**Files:** modify `app.json`, `android/app/build.gradle:95`, `README.md` (device checklist).

- [ ] **Step 1** — versionCode 13 → **14**, both files in step. `build.gradle` is gitignored prebuild output; bump it by hand, as vc12 and vc13 were.
- [ ] **Step 2** — append checks **340-352** to the README checklist (below).
- [ ] **Step 3** — full gate: `pnpm -r run test`, lint, type-check. All exit 0.
- [ ] **Step 4** — `pnpm audit --prod`. Expect the same 52 pre-existing `@expo/cli` advisories and **no new** ones — this phase adds no dependency, so any new advisory means one crept in.
- [ ] **Step 5** — build the release APK. `taskset -c 7,8` is mandatory (`Cpus_allowed_list` is 7-10 in this container; an unconstrained Gradle run hit load 136). Kill Metro first.
- [ ] **Step 6** — verify `versionCode='14'` with aapt2 before serving. Remove the stale vc13 symlink — it points at the Gradle output this build overwrites, and would serve vc14 bytes under the vc13 name.
- [ ] **Step 7 — commit.** `chore(mobile): bump versionCode to 14 for the M8 device run`

### Device checks (owner, on the S24 and the OnePlus)

| # | Check | Pass |
|---|---|---|
| 340 | Mushaf, chrome down: status bar gone, page number and juz fully visible, **nothing on the page moved** |  PASS — chrome-down vs chrome-up screenshots are **pixel-identical across rows 900-2400** (mean abs diff 0.000, best alignment dy=0). Status bar absent (top-band max 20), juz and page number both fully visible. The chrome overlays; the page does not reflow. |
| 341 | Tap: both system bars and the chrome all return together |  PASS — one tap restores status bar, Go-to bar, player line and tab bar together. |
| 342 | Leave the mushaf while the chrome is down → status bar and nav buttons are back on the other tab |  PASS — mushaf chrome-down top-band max **20**; after an external `qurancorpus://menu` intent, max **255** and the real Menu screen. (`--/menu` is a dev-client form and lands on Expo Router's Unmatched Route in a release build — use the plain scheme.) |
| 343 | Play a page, touch the player repeatedly: chrome never hides while you keep touching, hides 3.5s after you stop |  PASS — touched the player every 2s for 10s: status bar stayed present (max 255) at every sample; gone (max 20) ~4s after the last touch. |
| 344 | Drag the scrub bar for >4s: chrome stays up for the whole drag |  **BLOCKED** — `adb shell input swipe` is refused on this device (`SecurityException: Injecting to another application requires INJECT_EVENTS`). Taps inject fine, drags do not. Needs a real finger. |
| 345 | Grow/retract at 280ms reads as motion, not a snap |  NOT RUN — motion judgment, not measurable through adb. M8a already measured the 280ms grow frame by frame; left to the owner. |
| 346 | Start the reader playing, walk to Surahs: mini-player is docked above the tab pill and still sounding |  PASS — reader playing, walked to Surahs: mini-player docked above the tab bar reading **Al-Baqara · 17 / Abu Bakr Al-Shatri / 0:05 / -0:16**, with prev/pause/next and an X, still sounding (piid active at that sample). |
| 347 | Mini-player X: audio stops, bar goes, nothing resumes |  PASS — X cut the ayah at ~7s of 22s and the bar left; **26 further seconds sampled silent**, nothing resumed. |
| 348 | Open a word sheet while the mini-player is up: the sheet covers it, nothing overlaps |  NOT RUN — could not open a word sheet through adb taps on the mushaf (taps toggled chrome instead), and the Morphology screen is pushed, so no player docks there. Owner-owed. |
| 349 | Start the mushaf page playing, walk to Home: **no** mini-player; Home's card is compact (reader-owned rule) |  **FAIL** — mushaf page playing, walked to Home: Home shows a **full grown transport** for the mushaf-owned track (`Al-Baqara · 20`, scrub 0:26 / -0:05, pause, prev/next). The check requires no mini-player and a compact card. Reproduced twice. |
| 350 | Home card play: starts the last-read ayah and **runs on** into the next with Continuous OFF in Settings |  PASS — `toggle-continuous` read `checked="false"`, then one tap on the compact Home card played **four consecutive ayahs** (19s/8s/25s/12s = 2:17→2:20) with no further input. |
| 351 | Home card grows in place while sounding; no second transport anywhere on Home |  PASS — exactly one transport on Home while sounding; the card grows in place and no mini-player docks alongside it. |
| 352 | Start the reader, then start the mushaf: the reader's sound stops. One voice at a time |  **FAIL (unreachable)** — with the reader sounding, the mushaf tab replaces its **"Play this page" resting line with the reader's transport**, so the page has no start control at all. Four attempts, the tap never started anything and the reader ran to its natural end. The one-voice invariant itself never broke: **no run ever sampled two concurrent piids**. |

---

## §3 Risks and rollbacks

| Risk | Signal | Rollback |
|---|---|---|
| Frozen insets go stale across a rotation or a fold | Page painted against the wrong inset on a foldable | Portrait-only today, so unreachable; if a large-screen build lands, re-run the freeze on a dimensions change |
| The provider re-renders every screen on each audio tick (~1/s) | Jank on the S24 during playback | `useMemo` on the context value (Task 3) is the first defence; if it is not enough, split into two contexts — a stable command object and a ticking state object. Measure with framestats before splitting, per `ui-thread-jank-measure-framestats` |
| `toggle` reads stale `continuous` / `ayahCount` | Continuous play stops after one ayah on the very first start | Documented in Task 3; only reachable for a track shorter than one frame. If seen, move both into refs written inside `toggle` |
| One engine breaks lock-screen controls mid-hand-off | Notification shows the wrong surah after switching screens | `setLockScreen` is already re-asserted on every ayah; verify with check 352, and Expo Go cannot test it — release APK only |
| Mini-player collides with a screen's own docked furniture | Two bars stacked on a tab | Only Home and mushaf dock anything, and both are excluded by name (Task 6) |

## §4 Review

No §5 trigger fires: no `packages/data`, no trust boundary, no on-device DB write. Ships on §4 self-review plus lint, type-check and tests. **Do not escalate on a hunch** — if the executor believes a task has drifted into one of those three classes, stop and ask rather than assuming.


---

## Device run 2026-09-18 — vc22, OnePlus 7 Pro, adb over wifi

Checks 340-352, owed since the M8 merge (`2996092`) and M8a (`d0d51ab`).
**9 PASS, 2 FAIL, 1 blocked, 2 not run.** Build under test is vc22, the M9 APK,
which contains M8 and M8a; M10 adds only behaviour-neutral re-export shims to
mobile.

### Method

Audio was sampled **on-device**, once a second, by an `adb shell` loop writing
`dumpsys audio | grep u/pid:10355 | grep state:started` piids to a file. That
matters: the round-trip latency between two `adb` calls from this session runs
15-25s, which is longer than one ayah (2:17 is 21.8s), so any "is it still
sounding" question asked across two calls answers about a track that has already
ended. Three early runs were thrown away for exactly that reason. Chrome state
was read from the status-bar band of a screencap (`max 20` = absent, `max 255` =
present) rather than from a dump, because the mushaf idle-hides in 3.5s and a
`uiautomator dump` alone takes ~2s.

Two traps worth keeping: on the mushaf a tap **toggles** chrome, so a "wake" tap
issued when the chrome is already up hides it and the next tap lands on the page
— that silently ate three attempts at 352. And the tab bar is part of the chrome,
so a tab-bar tap taken while the chrome is down does nothing at all. Deep links
(`qurancorpus://mushaf`, `://menu`, `://`) navigate deterministically and are the
better instrument.

### The one defect, seen from two sides

349 and 352 are the same bug: **a screen's player surface renders whatever the
engine is playing, without consulting the track's `owner`.**

- On **Home**, a mushaf-owned track grows the compact listen card into a full
  transport — 349 requires the opposite.
- On the **mushaf**, a reader-owned track replaces the "Play this page" resting
  line with the reader's transport. That line is the only way to start a page,
  so while the reader sounds the mushaf cannot be started at all — which is why
  352 could not even be performed, rather than failing on its assertion.

The one-voice invariant the checks were protecting was never violated: across
every run, the sampler never once recorded two concurrent piids, and the mushaf
advanced ayah to ayah one player at a time.

This is the open design question the M8 review already raised — ruling 8 says the
mini-player is suppressed on Home flatly, CodeRabbit argued for suppression
scoped to *home-owned* tracks. The device run says the cost is larger than the
review thought: not only does a reader-owned track have no transport on Home, a
foreign track **takes over** the surface and, on the mushaf, removes the control
that starts a page. **Owner ruling needed before a fix lands** — suppressing by
owner and restoring each screen's own resting control is one shape; letting any
screen drive the engine is another.

### Still owed

344 (needs a real finger — adb cannot inject drags), 345 (motion judgment), 348
(word sheet over a docked player), and the three-button-navigation check from
M8a, which stays blocked because `adb shell settings put` is denied and this
phone is on gesture nav.

### Device run on the release APK — vc23, 2026-09-19

First run of these checks on a real signed build (all earlier M8 evidence came
from Expo Go). Device OnePlus 7Pro / GM1917, gesture nav, dark theme.

| # | Result | Evidence |
|---|--------|----------|
| 344 | PASS | `input swipe 590 2885 → 950 2885` over 5000ms. Reader top chrome and the docked player both still on screen mid-drag and after release. The player's reset to `0:00 / --:--` after the drag is not a scrub defect: logcat shows the track reached `position=14448` of a 14.4s ayah and `abandonAudioFocus`, i.e. it ended normally with Continuous play off. |
| 345 | FAIL at 280ms, re-run owed at 400ms | Motion judgment. No `ffmpeg`/`cv2` in this container, and `screencap` is far too slow to sample the curve, so there is no way to substitute a measurement for the eye. The owner watched it on 2026-09-19: 280ms still reads as a snap, the same verdict 180ms got on 2026-09-15. Raised to 400ms in `PLAYER_GROW_MS` (`b2fec38`), which also collapsed the duplicate per-caller constants into one in `PlayerShell`. The check re-runs on the next build. |
| 348 | BLOCKED — premise absent | The check assumes a docked mini-player under the word sheet. **The morphology/WbW screen docks no player surface at all.** Verified with audio confirmed live: `requestAudioFocus` at 02:27:12, screenshot at 02:27:1x, word sheet open, nothing behind it. The sheet renders clean either way, but the overlap this check exists to catch cannot occur until a bar is put there. |
| M8a three-button nav | OWED | `adb shell settings put` is denied, the phone is on gesture nav, and it is also this session's display. |

348's result is direct evidence for the open #87 question above: it is not only
Home and the mushaf that handle a foreign track oddly — WbW renders no transport
for one at all. Whichever shape the ruling takes, "each screen keeps its own
resting control" has to say what WbW's is.
