# Design — Drawer menu + ayah-level bookmarks

**Date:** 2026-07-18. Scope: `apps/web`. No `packages/data` schema change (bookmarks are
client-only, localStorage — no server/DB storage).

Separate follow-up project (not in this spec): surah-number medallions in
`SurahFrame.tsx`'s two circular cutouts. Independent of everything here.

---

## 01 · Problem

- `ThemeToggle` is a fixed top-right button; `layout.tsx` reserves
  `pt-[calc(3.5rem+env(safe-area-inset-top))]` of body padding solely to avoid
  overlapping it. Wasted vertical space on every page.
- No way to bookmark a verse. User wants to mark individual ayahs (not whole
  surahs) from both the word-by-word page and reading mode, and see them
  listed later.
- `BottomNav` has 4 slots (Home / Read / Dictionary / Search). Adding a menu
  needs a 5th surface without necessarily adding a 5th icon.

## 02 · Decisions (from brainstorm Q&A)

| Question | Decision |
|---|---|
| Menu trigger | Replace **Search** in `BottomNav`; search moves inside the drawer |
| Drawer style | Right-side slide-in panel (not a bottom sheet) |
| Drawer contents | Search, Theme, Bookmarks (link), About & Credits |
| Bookmark granularity | **Per-ayah**, not per-surah. No surah-level bookmark. |
| Bookmark surfaces | Each ayah in `AyahView` (reading) and `WbwAyahBlock` (WbW) |
| Bookmark identity | `(surahId, ayahNumber, view)` — a verse bookmarked from both views is two independent entries |
| `/bookmarks` link target | Whichever view it was bookmarked from — reading mode gains ayah-scroll support to make this true |
| `/bookmarks` order | Most-recently-bookmarked first |

## 03 · Architecture

**Drawer trigger & mount.** `BottomNav` owns `menuOpen` state directly (no
context/provider — nothing else needs to trigger the drawer, unlike search
which `SearchProvider` shares across the home page and the nav). Renders
`<DrawerMenu open={menuOpen} onClose={...} />`.

**`DrawerMenu` (new, `components/shell/DrawerMenu.tsx`).** Same
overlay+spring mechanics as `SearchSheet` (scrim `motion.div` + panel
`motion.div`, `AnimatePresence`, `useReducedMotion` fallback to opacity-only),
but the panel slides on the X axis from the right (`x: '100%' → 0`) instead of
Y from the bottom, and is `inset-y-0 right-0` instead of `inset-x-0 bottom-0`.
Esc-to-close, same as `SearchSheet`.

Rows, top to bottom:
1. **Search** — button, calls `useSearch().open()` then closes the drawer.
2. **Theme** — sun/moon icon + "Light/Dark mode" label, click toggles.
3. **Bookmarks** — `<Link href="/bookmarks">`.
4. **About & Credits** — `<Link href="/about">` (moved from `/surah` page header).

**Theme toggle relocation.** `ThemeToggle.tsx` stops rendering a fixed
button. Its state/effects (`resolveTheme`, `applyTheme`, mount-time
localStorage read, `storage`-event cross-tab sync) move into a hook
`useTheme()` (same file or a new `hooks/useTheme.ts` — implementer's call,
no new abstraction beyond extracting what already exists). `DrawerMenu`
renders the Theme row using that hook; the icon swap animation
(`AnimatePresence` rotate/fade) is preserved on the row.

**Layout.** `app/layout.tsx` drops the `pt-[calc(3.5rem+...)]` body padding —
confirmed via grep that `ThemeToggle` was the only `fixed top-*` element in
the app, so nothing else needs the reserved space.

**`/surah` page header.** Drops the "About & Credits" nav link (now
drawer-only). "Dictionary" link stays (redundant with bottom nav, but
pre-existing — out of scope to touch).

## 04 · Bookmarks

**Storage — `lib/bookmarks.ts` (new).** Plain functions, no hook/context/
external library:

```ts
export interface Bookmark {
  surahId: number;
  ayahNumber: number;
  view: 'reading' | 'wbw';
  bookmarkedAt: number; // Date.now()
}

export function getBookmarks(): Bookmark[]        // sorted bookmarkedAt desc
export function isBookmarked(surahId: number, ayahNumber: number, view: Bookmark['view']): boolean
export function toggleBookmark(surahId: number, ayahNumber: number, view: Bookmark['view']): boolean // returns new state
```

Key: `localStorage['bookmarks']`, JSON array. All localStorage access
wrapped in try/catch (matches `ThemeToggle`'s existing pattern) — a
private-mode/quota failure means the toggle silently no-ops, not a thrown
error. Malformed/missing JSON on read → treated as `[]`.

**Why no context:** each ayah's bookmark button only needs its own
`(surahId, ayahNumber, view)` state — there's no cross-component value that
needs to propagate on toggle (unlike search, which multiple distant triggers
share one sheet for). Each button reads its own state on mount and updates
its own local `useState` on click; no other component on the page needs to
react.

**`AyahView.tsx` (reading mode).**
- Bookmark icon button added to the header row (alongside `AyahMedallion` +
  `AyahAudioButton`), toggling `(surah_id, ayah.ayah_number, 'reading')`.
  `ayah.surah_id` already exists on the `Ayah` type — no new prop needed.
- `<article>` gains `id={`ayah-${ayah.ayah_number}`}` (doesn't have one
  today; required for scroll-to-ayah, see below).

**`WbwAyahBlock.tsx`.**
- Bookmark icon button added alongside `AyahMedallion`, toggling
  `(surahId, ayah.ayahNumber, 'wbw')`.
- Needs a new `surahId: number` prop — `WbwAyah` carries no surah id.
  `WbwView.tsx` already has `surah.id` in scope; threads it down as one extra
  prop on `<WbwAyahBlock surahId={surah.id} ... />`.

**Reading-mode ayah-scroll (new capability).** WbW already supports
`?ayah=` → scroll via `components/wbw/ScrollToAyah.tsx`. Reading mode has no
equivalent today. To make "link to whichever view it was bookmarked from"
true for reading-mode bookmarks:
- Move `ScrollToAyah.tsx` to `components/shared/ScrollToAyah.tsx` (DRY — it
  becomes a second caller, so it stops being WbW-specific). Update the WbW
  import path.
- `ReaderView.tsx` gains an optional `scrollAyah?: number` prop. On mount, if
  set, `revealTo` enough of the incrementally-revealed list to cover that
  ayah index (same pattern already used for the audio auto-advance effect a
  few lines above it), then mount `<ScrollToAyah ayah={scrollAyah} />`.
- `app/surah/[id]/page.tsx` reads `ayah?: string` from `searchParams`
  (mirrors the WbW page's existing `PageProps.searchParams` shape exactly),
  parses it, passes `scrollAyah` down to `ReaderView`.

**`app/bookmarks/page.tsx` (new).** Client page (bookmark data is
localStorage-only, unreachable from a server component):
- Fetch `/api/surahs` (same endpoint `SearchSheet` already uses) once on
  mount, for surah id → name/translit lookup.
- Read `getBookmarks()`, join against the surah list.
- Render a flat list, most-recent-first: surah name + ayah number + a small
  "Reading" / "Word-by-word" tag, linking to
  `/surah/{surahId}?ayah={ayahNumber}` or `/surah/{surahId}/words?ayah={ayahNumber}`
  per the entry's `view`.
- Empty state: short message, no bookmarks yet.
- Same abort-on-unmount fetch pattern as `SearchSheet` (`AbortController` in
  the effect cleanup).

## 05 · Error handling

- localStorage read/write: try/catch everywhere, silent no-op fallback
  (matches existing `ThemeToggle` convention) — never throws into the UI.
- `/bookmarks` and `/api/surahs` fetch: abort-on-unmount, failed fetch →
  empty list rather than an error state (consistent with `SearchSheet`).
- Malformed `ayah` query param (non-numeric, out of range) on the reading
  page: parse failure → `scrollAyah` stays `undefined`, page renders
  normally with no scroll (no error thrown) — same tolerance the WbW page's
  `resolvePage` already has for its own `ayah` param.

## 06 · Testing

- `lib/bookmarks.ts`: unit tests — toggle on/off, sort order, malformed/
  missing localStorage JSON, independence of `(surahId, ayahNumber, view)`
  keys (bookmarking the same verse in both views doesn't collide).
- `AyahView` / `WbwAyahBlock`: component test that the bookmark button
  toggles its own icon state and doesn't interfere with word-click/audio
  handlers already on the row.
- `ReaderView`: test that a `scrollAyah` beyond the initial `INITIAL` window
  reveals enough ayahs before `ScrollToAyah` fires (regression guard for the
  revealTo-before-scroll ordering).
- `DrawerMenu`: renders all 4 rows; Esc and scrim-click both close it; Theme
  row toggles `document.documentElement`'s `dark` class.
- Existing `SurahFrame`, nav, and `SearchSheet` tests unaffected — not
  touched by this project.

## 07 · Files touched

| File | Change |
|---|---|
| `components/shell/BottomNav.tsx` | Search button → Menu button; owns drawer open state |
| `components/shell/DrawerMenu.tsx` | **new** |
| `components/shell/ThemeToggle.tsx` | fixed button removed; logic extracted to `useTheme()` |
| `app/layout.tsx` | drop reserved top padding |
| `lib/bookmarks.ts` | **new** |
| `components/reader/AyahView.tsx` | bookmark button; `id` on `<article>` |
| `components/wbw/WbwAyahBlock.tsx` | bookmark button; new `surahId` prop |
| `components/wbw/WbwView.tsx` | pass `surahId` to `WbwAyahBlock` |
| `components/wbw/ScrollToAyah.tsx` → `components/shared/ScrollToAyah.tsx` | moved, import paths updated |
| `components/reader/ReaderView.tsx` | new `scrollAyah` prop + reveal-then-scroll effect |
| `app/surah/[id]/page.tsx` | read `?ayah=` searchParam, pass `scrollAyah` |
| `app/bookmarks/page.tsx` | **new** |
| `app/surah/page.tsx` | drop "About & Credits" link |

## 08 · Out of scope

- Surah-number medallions in `SurahFrame.tsx` — separate spec.
- Bookmark sync across devices/accounts — localStorage only, per-device.
- Editing/annotating a bookmark (e.g. a note) — just add/remove.
- Any change to `packages/data` — nothing here touches the DB.
