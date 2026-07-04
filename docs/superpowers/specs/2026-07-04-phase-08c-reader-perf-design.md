# Phase 08c — Reader Perf (Incremental Reveal) — Design

Part of Phase 08 (UI/UX overhaul, sub-phases A–F). Sub-phase C.
Scrape-independent. Follows 08b (app shell, merged).

## Goal

Cut mobile load lag on large surahs. Today `/surah/[id]` renders every ayah of
the surah as one client component; Al-Baqarah = 286 ayahs ≈ 6100 interactive
word `<button>`s, all in the initial DOM and all hydrated on load. Bound the
initial DOM + hydration to a first chunk, reveal the rest on scroll. Keep the
single continuous scroll (no pagination UI). No new dependency.

## Current state (confirmed in code)

- `app/surah/[id]/page.tsx` — server, `force-dynamic`. Fetches surah/ayahs/
  words/translations/glosses via `Promise.all`, groups into `wordsByAyah`,
  `translationsByAyah`, `glossesByWordId`, renders `<SurahHeader>`,
  `<LanguageBar>`, `<ReaderView ayahs wordsByAyah translationsByAyah
  glossesByWordId lang />` inside `<main className="mx-auto max-w-2xl px-4
  py-8">`.
- `components/reader/ReaderView.tsx` — `'use client'`. Holds `selectedWord`
  state + `useAyahAudio(ayahs)`. Maps ALL `ayahs.map((ayah) => <AyahView … />)`
  then `<WordPopover>`. **The render-all is here.**
- `components/reader/AyahView.tsx` — presentational. `<article className="mb-10">`
  with number badge, `<AyahAudioButton>`, RTL word container, translation `<p>`.
- `components/reader/WordToken.tsx` — one `<button>` per word. ~6100 for Baqarah
  = the hydration cost.
- `hooks/useAyahAudio.ts` — `useAyahAudio(ayahs)`. `audio.onended`: if repeat
  restart, else `idx = list.findIndex(a => a.id === playingAyahIdRef.current)`
  and plays `list[idx+1]` (auto-advance to next ayah). **Advance can target an
  ayah not yet revealed.**
- No virtualization lib installed. Not adding one.

## Decision (locked with user)

- **Problem shape:** measured slow on mobile (not hypothetical).
- **Reading model:** continuous scroll, incremental reveal (append-only). NOT
  windowing/virtualization, NOT page-based nav.
- **Payload:** render-only. Ship all ayah data as today (full JSON), just don't
  render/hydrate it all at once. Cuts DOM + hydration + paint, accepts the
  existing JSON payload size. (On-demand fetch deferred — upgrade path if the
  payload later bites.)

Rejected: virtualization/windowing lib (new dep, unmounts break in-page find +
audio highlight); pagination UI (breaks continuous scroll UX).

## Architecture

Two units.

### 1. `hooks/useIncrementalReveal.ts` (new)

`useIncrementalReveal(total: number, initial: number, step: number)` →
`{ visibleCount: number; sentinelRef: RefObject<HTMLElement>; done: boolean;
revealTo(n: number): void }`.

- State `visibleCount`, initialized `Math.min(initial, total)`.
- `done` = `visibleCount >= total`.
- IntersectionObserver on `sentinelRef.current`: on intersect, bump
  `visibleCount => Math.min(count + step, total)`. Observer created in a
  `useEffect` keyed on `sentinelRef.current` + `done`; disconnect on cleanup and
  once `done` (nothing left to observe).
- `revealTo(n)`: `setVisibleCount(c => Math.max(c, Math.min(n, total)))` —
  monotonic non-shrinking, clamped to total. For audio auto-advance.
- Pure logic + one browser API. Unit-testable with a mocked
  `IntersectionObserver`.

Sole responsibility: "how many of N are visible, grow on scroll or on demand."
Knows nothing about ayahs/audio.

### 2. `components/reader/ReaderView.tsx` (modify)

Constants (module-level): `THRESHOLD = 40`, `INITIAL = 20`, `STEP = 20`.

- `const incremental = ayahs.length > THRESHOLD ? … : null` — but hooks can't be
  conditional. So always call `useIncrementalReveal(ayahs.length, INITIAL,
  STEP)`; derive `const paginate = ayahs.length > THRESHOLD`.
- `const visible = paginate ? ayahs.slice(0, visibleCount) : ayahs`.
- Render `visible.map(ayah => <AyahView … />)`.
- After the list, `paginate && !done` → a `<button ref={sentinelRef}>` "Load
  more ayahs" (Tailwind paper/night tokens, centered). Doubles as the
  IntersectionObserver sentinel AND a manual fallback (`onClick={showMore}` — see
  below). When `done`, it's gone.
- **Audio edge:** effect on `[playingAyahId]` — when set and `paginate`, find its
  index in `ayahs`, `revealTo(index + 1)` so auto-advance never plays a hidden
  ayah. (Reuses the existing `playingAyahId` already surfaced by `useAyahAudio`.)

`showMore` for the button click: expose from the hook too, OR just let the
button's presence-as-sentinel handle it and make the click a no-op-safe
`revealTo(visibleCount + step)`. Decision: hook returns `revealTo`; button
`onClick={() => revealTo(visibleCount + STEP)}`. One public grow method, two
triggers (observer + click). No separate `showMore`.

Small-surah path (Fatiha 7, most surahs ≤ 40 ayahs): `paginate` false → render
all, no sentinel, no observer. Zero behavior change.

## Data flow

Unchanged. `page.tsx` still ships all `wordsByAyah`/translations/glosses.
`ReaderView` only limits how many `AyahView`s mount. No new query, no schema
change, no fetch on scroll.

## Error / edge handling

- **No-JS:** first INITIAL ayahs render (SSR), "Load more" button is dead
  (needs JS). Accept — the app is a JS-required PWA; note it, don't engineer
  around it.
- **Deep-link to an unrendered ayah:** no ayah anchors/hash-scroll exist today →
  out of scope. (If added later, hook `revealTo` covers it.)
- **Audio auto-advance past the chunk:** handled by the `revealTo(index+1)`
  effect above. Audio element is DOM-independent so sound never breaks; the
  effect keeps the *visible* list in sync so the playing ayah is on screen.
- **`total` smaller than `initial`:** `Math.min` guards → `visibleCount = total`,
  `done` immediately, no sentinel.

## Testing

**`useIncrementalReveal.test.ts`** (vitest, mock `IntersectionObserver`):
- initial `visibleCount === min(initial, total)`.
- `total <= initial` → `done` true, `visibleCount === total`.
- triggering the observer callback bumps by `step`, capped at `total`.
- `done` flips true once `visibleCount >= total`; observer disconnected.
- `revealTo(n)` never shrinks (`revealTo(smaller)` = no-op), clamps to `total`.

**`ReaderView.test.tsx`** (extend existing; RTL, mock `useAyahAudio` +
`IntersectionObserver`):
- small surah (≤ THRESHOLD ayahs): all ayahs rendered, no "Load more" button.
- large surah (> THRESHOLD): exactly INITIAL `AyahView`s rendered, "Load more"
  present.
- clicking "Load more" reveals STEP more ayahs.
- (audio-advance effect: assert `revealTo`/reveal reaches a set `playingAyahId`
  beyond the chunk — mock `useAyahAudio` to emit a late id.)

Existing reader/audio suites stay green.

## Out of scope (later)

- Windowing / unmounting off-screen ayahs (payload upgrade path).
- On-demand data fetch per chunk (only if JSON payload becomes the bottleneck).
- Ayah deep-link / hash scroll.
- Page-based navigation UI.

## Acceptance (testable)

- Large surah (Al-Baqarah): initial render mounts only INITIAL ayahs; DOM node +
  hydrated-button count bounded, not ~6100.
- Scrolling to the bottom reveals STEP more ayahs (IntersectionObserver);
  repeats until all shown, then the sentinel/button disappears.
- "Load more" button reveals the next chunk on click (JS fallback / affordance).
- Small surahs (≤ THRESHOLD): render fully, no sentinel, no behavior change.
- Audio auto-advance to an ayah beyond the current chunk reveals it (never plays
  a hidden ayah).
- `useIncrementalReveal` unit tests green; ReaderView tests green; web lint +
  type-check green; existing suites green.

## Risks / rollback

- Risk: IntersectionObserver never fires (short viewport, sentinel already in
  view) → user stuck at INITIAL. Mitigation: the sentinel is a real "Load more"
  button; observer also fires on initial intersection if already visible.
- Risk: audio advance races the reveal effect. Mitigation: `revealTo` is
  idempotent + monotonic; worst case one render lag, audio keeps playing.
- Risk: constants mistuned (chunks too small → many reveals). Mitigation:
  INITIAL/STEP/THRESHOLD are module constants, trivially tunable; defaults
  20/20/40 chosen so most surahs never paginate and Baqarah starts ~20× lighter.
- Rollback: render-only change, no schema/data/query. Revert branch; ReaderView
  returns to mapping all ayahs. `useIncrementalReveal` file deleted.

## Notes

- No `packages/data` change → no rebuild step.
- Follows the 08b pattern: hand-rolled, no new dep (§12).
