# Phase 08b — App Shell (Home + Bottom Nav) — Design

Part of Phase 08 (UI/UX overhaul, sub-phases A–F). Sub-phase B.
Scrape-independent. Follows 08a (dictionary letters, merged).

## Goal

Give the PWA a real shell: a proper Home/landing page (stop redirecting `/`
→ `/surah`) and a persistent bottom tab bar so the core areas are one thumb-tap
apart. Corpus.quran.com-style entry, but nicer.

## Current state (confirmed in code)

- `app/page.tsx` = `redirect('/surah')`. No home.
- No app bottom nav. The bar in the reference screenshots is Brave browser
  chrome, not ours.
- Search = floating `SearchTrigger` FAB (🔍), rendered globally in `layout.tsx`,
  opens `SearchSheet` overlay.
- Routes: `/surah` (list), `/surah/[id]` (reader), `/dictionary`,
  `/dictionary/[root]`, `/dictionary/lemma-frequency`,
  `/dictionary/verb-concordance`, `/word/[surah]/[ayah]/[position]`, `/about`,
  `/search`.
- `getAllSurahs(db)` exists in `@quran-corpus/data`; `SurahCard` component
  exists.

## Decisions (recommended defaults — user vetoes at review gate)

1. **Bottom nav = 4 tabs**: Home (`/`), Read (`/surah`), Dictionary
   (`/dictionary`), Search (`/search`). Persistent, fixed bottom.
2. **Middle tab = "Read" → surah list** (not a new WbW picker). Wires to real
   pages today; sub-phase F upgrades the reader in place. (Alt options — WbW
   picker, resume-last-read — rejected for B: bigger scope / needs new state.)
3. **Search = 4th tab, absorbs the FAB's role**: the nav's Search item is a
   button that opens the existing `SearchSheet` overlay (instant, keeps
   context, Emil-style motion per §8). NOT a route change. Drop the floating
   `SearchTrigger` FAB — its behaviour moves into the nav. `/search` page stays
   as a deep-link fallback (unchanged). (Rationale: `SearchSheet` is used only
   by the FAB today; routing the tab to `/search` would orphan a working
   overlay. Reusing it keeps the better UX and deletes only the FAB wrapper.)
4. **Icons = hand-written inline SVG** (4 tiny paths). No icon-library
   dependency (§12: don't add a dep for what a few lines do). No emoji (§8:
   no AI slop).
5. **Home blocks**: Hero+search, Browse-surahs preview, Quick tiles. **Defer**
   Continue-reading card (needs localStorage last-read state; YAGNI for B).
6. Home search bar = a styled `Link` to `/search` (looks like an input, no
   client JS). Keeps Home a server component.

## Architecture

- **`components/shell/BottomNav.tsx`** (client — needs `usePathname` for active
  state + `useState` for the search sheet). The only new stateful/logic unit.
  Fixed bottom bar, 4 items: 3 are `next/link` (Home/Read/Dictionary), the 4th
  (Search) is a `button` that toggles `SearchSheet` open. Renders `SearchSheet`
  itself (reuse). Active-tab highlight derived from pathname; Search active
  while its sheet is open. Safe-area inset.
- **`app/page.tsx`** (server, `force-dynamic`) — real Home. Fetches
  `getAllSurahs` for the preview block. Renders Hero + Browse preview + Quick
  tiles. Replaces the redirect.
- **`app/layout.tsx`** — swap `<SearchTrigger/>` → `<BottomNav/>`; add bottom
  padding to `<body>` so page content clears the fixed nav.
- **`app/manifest.ts`** — change `start_url` `'/surah'` → `'/'` (PWA now lands
  on the real Home).
- Delete `components/search/SearchTrigger.tsx` and its test — the FAB's role
  moves into `BottomNav`. `SearchSheet` stays (now consumed by `BottomNav`).

Home markup blocks stay inline in `page.tsx` (presentational, no logic worth a
separate file). One small exception if a block needs client behaviour — none do.

## Component detail

### BottomNav

- Three link items via a `LINK_ITEMS` array
  `{ href; label; match(pathname): boolean; icon: ReactNode }[]`:
  - Home — `href '/'`, active when `pathname === '/'`.
  - Read — `href '/surah'`, active when `pathname.startsWith('/surah')` OR
    `pathname.startsWith('/word')` (word view belongs to reading).
  - Dictionary — `href '/dictionary'`, active when
    `pathname.startsWith('/dictionary')`.
  - (`/about` and `/search` match nothing → no link-tab active. Acceptable.)
- Fourth item = Search `button` (not a link): `onClick` sets `searchOpen`
  state true; active-styled while `searchOpen`. Renders `<SearchSheet
  open={searchOpen} onClose={() => setSearchOpen(false)} />`.
- Container: `fixed inset-x-0 bottom-0 z-40`, border-top, paper/night bg,
  `pb-[env(safe-area-inset-bottom)]`, height ~`h-16`. Grid of 4 equal columns.
- Each item: icon (SVG, ~22px) stacked over label (`text-xs`). Active =
  accent colour (reuse existing paper-900 / night accent tokens); inactive =
  muted (paper-500). `aria-current="page"` on the active link item.
- Icons: inline `<svg>` — house, book, book-open (dictionary), magnifier.
  `stroke="currentColor" fill="none"`, 24px viewBox. Hand-written paths.

### Home (`app/page.tsx`)

- `export const dynamic = 'force-dynamic'` (DB-dependent, matches `/surah`).
- Hero: app title, Bismillah (`بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ`, font-arabic,
  dir rtl), one-line tagline. Below: search bar = `<Link href="/search">`
  styled as a rounded input with a magnifier glyph + placeholder text
  "Search the Quran…".
- Browse preview: heading "Read" + a short list. Curated surah ids
  `[1, 2, 36, 67]` (Al-Fatiha, Al-Baqarah, Ya-Sin, Al-Mulk) rendered via the
  existing `SurahCard` (DRY), filtered from `getAllSurahs`. Then a
  `<Link href="/surah">` "All 114 surahs →".
- Quick tiles: 2-col grid of `Link` tiles → `/dictionary`,
  `/dictionary/lemma-frequency`, `/dictionary/verb-concordance`, `/about`.
  Each tile: label + one-line subtitle.
- Wrap in `<main className="mx-auto max-w-2xl px-4 py-8">` to match `/surah`.

## Data flow

Home: `getDatabase()` → `getAllSurahs(db)` → filter to curated ids for preview.
No new queries, no schema change. Nav: no data, pure client from pathname.

## Error / edge handling

- Empty DB (no surahs): Browse-preview shows nothing extra; keep the same
  "seed the database" hint pattern `/surah` uses, or simply render the hero +
  tiles (which don't need data). Home must not crash when `getAllSurahs` returns
  `[]` — guard the `.filter`.
- Missing curated surah (id not present): filter just yields fewer cards; fine.

## Testing

- `BottomNav.test.tsx` (vitest + RTL, mock `next/navigation` `usePathname`;
  `SearchSheet` may be shallow-mocked to a marker to avoid its fetch path):
  - renders 3 link items (hrefs `/`, `/surah`, `/dictionary`) + a Search button.
  - given `usePathname` `/surah/2`, the Read link has `aria-current="page"` and
    the other links don't.
  - given `/word/2/255/1`, Read is active (word ⊂ reading).
  - given `/dictionary/ktb`, Dictionary is active.
  - clicking the Search button opens `SearchSheet` (dialog/marker appears);
    it's absent before the click.
- Home page: light. Extract nothing extra; assert via a small render test on
  the static tile links is optional. Primary coverage = BottomNav logic.
  (Home is presentational + one constant array; a heavy server-component-with-DB
  test isn't worth it — Playwright reading-flow smoke, already planned in §10,
  covers navigation.)
- Existing suites must stay green. Delete `SearchTrigger.test.tsx` with the
  component. `SearchSheet.test.tsx` stays (component still exists).

## Out of scope (later sub-phases)

- Reader perf / large-surah pagination (C).
- Dictionary alphabet picker + red-highlight concordance (D).
- Word-page structured grammar (E).
- WbW multi-word redesign + friendly picker (F).
- Continue-reading / last-read persistence (deferred; revisit after F).

## Acceptance (testable)

- Visiting `/` renders the Home page (hero, search bar, browse preview, tiles) —
  NOT a redirect to `/surah`.
- A bottom tab bar is visible on every page, fixed to the bottom, clear of
  content, with 4 tabs Home · Read · Dictionary · Search.
- The tab matching the current route is visually highlighted and carries
  `aria-current="page"`; on `/word/...` the Read tab is active.
- Tapping Home/Read/Dictionary navigates to `/`, `/surah`, `/dictionary`;
  tapping Search opens the `SearchSheet` overlay.
- The old floating 🔍 FAB is gone (its role now lives in the Search tab).
- Home search bar navigates to `/search`.
- `BottomNav` unit tests green; web lint + type-check green; existing suites
  green.

## Risks / rollback

- Risk: fixed bottom nav overlaps content on short pages / with the mobile URL
  bar. Mitigation: body bottom padding = nav height; `env(safe-area-inset)`.
- Risk: active-state logic mis-highlights (e.g. `/surah` prefix also matching a
  future `/surahs-x`). Mitigation: exact `/` for Home, prefix for others is
  acceptable given the known route set; covered by tests.
- Rollback: display/routing only — no schema, no data, no query change. Revert
  the branch cleanly. (Restore `page.tsx` redirect + `SearchTrigger` in layout.)

## Notes

- No `packages/data` change → no rebuild step needed (unlike 08a).
- Manifest `start_url` changes `'/surah'` → `'/'` so a PWA install lands on the
  real Home.
