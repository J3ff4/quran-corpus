# Phase 08f — Word-by-Word Page + Verse Picker — Design

Part of Phase 08 (UI/UX overhaul, sub-phases A–F). Sub-phase F, last one.
Was BLOCKED on the main scrape (transliteration + English `word_glosses`);
that data is now scraped AND repaired by the WbW data-alignment fix
(`2026-07-05-wbw-data-alignment-fix-design.md`, merged 0b66879). Unblocked.

## Goal

Two features:

1. **Dedicated word-by-word page** per surah — every word as a stacked
   cell (Arabic / transliteration / gloss / POS chip), corpus.quran.com
   coverage, nicer. Separate from the mushaf reader, which stays untouched.
2. **Global verse picker** — pick surah:ayah, jump straight to that ayah on
   the WbW page.

## Current state (confirmed in code)

- Reader: `/surah/[id]` → `ReaderView` → `AyahView` (RTL flex-wrap of
  `WordToken`) → tap word → `WordPopover`. Single-word detail at
  `/word/[surah]/[ayah]/[position]` (`WordDetailView`).
- No WbW multi-word grid. No verse/jump picker.
- BottomNav: Home `/` · Read `/surah` · Dictionary · Search (opens
  `SearchSheet`). 4 tabs.
- `SearchSheet` = client component, debounced `/api/search` fetch. No surah
  list in scope.
- Home `app/page.tsx` = RSC landing (89 lines).
- Reveal hook `hooks/useIncrementalReveal.ts` — `useIncrementalReveal(total,
  initial, step)` → `{visibleCount, sentinelRef, done, revealTo}`.
  IntersectionObserver, render-only, no dep. Used by `ReaderView` (08c).

**Data layer — one new windowed query:**
- **NEW** `getWordsBySurahAyahRange(db, id, loAyah, hiAyah)` → words in ayah
  range, ordered `ayah_number, position`. Same SELECT as `getWordsBySurah`
  plus `AND a.ayah_number BETWEEN ? AND ?`. (Server-side window; page never
  ships whole surah.) `packages/data`, sibling of `getWordsBySurah`.
- `getGlossesBySurahAndLang(db, id, 'en')` → glosses joinable by `word_id`.
  Glosses filtered in-memory to the page's `word_id` set (114-surah gloss
  fetch is small; no ranged gloss query needed). ponytail: revisit only if
  gloss fetch shows up in a trace.
- `getAllSurahs(db)` → surah meta incl. `ayah_count`.
- `getSurahById(db, id)` → one surah (404 target + `ayah_count` for paging).
- POS decode: `packages/data` morphology tags (used by 08e `SegmentCard`).

## Decisions (locked in brainstorm; user vetoes at review gate)

1. **Dedicated route, reader untouched** — `/surah/[id]/words`. Not a reader
   toggle, not a replacement. (Reader mushaf flow stays as-is.)
2. **Server-side paged**, `PAGE_SIZE=15` ayahs/page, words grouped by ayah.
   RSC renders one page; Prev/Next links (`?page=N`) re-render server-side.
   No client fetch, no reveal hook for WbW (smallest client JS).
3. **Cell = Arabic + translit + gloss + POS chip**; tap → existing
   `/word/[surah]/[ayah]/[position]` detail page (no new detail surface).
4. **Global verse picker → WbW page.** Pick surah:ayah → `/surah/[id]/words?
   ayah=N` scrolled to that ayah. WbW is the jump target (not the reader).
5. **Picker entry points: Home + SearchSheet.** No new bottom-nav item.
6. **Route pagination `?page=N`** (server-side window) — small payload even for
   Baqarah. Deep-link `?ayah=N` resolves to its page server-side; a thin
   client component scrolls to the ayah anchor after paint.
7. **Native `<select>` picker** — no dep, accessible, mobile-first (§8).
8. **SearchSheet surah list via new `GET /api/surahs`** (id/translit/
   ayah_count). Reusable, cacheable, ~15 lines. (Alts rejected: static const
   duplicates DB data; prop-threading through global shell awkward.)

## Architecture & data flow

```
/surah/[id]/words/page.tsx  (RSC, force-dynamic)
  parse+validate id (1–114) → notFound() on bad
  load getSurahById(id) → null → notFound(). gives ayah_count.
  totalPages = ceil(ayah_count / PAGE_SIZE)
  resolve page:
    ?ayah=N valid 1..ayah_count → page = ceil(N/PAGE_SIZE), scrollAyah=N
    else page = clamp(parseInt(?page)||1, 1, totalPages), scrollAyah=null
  lo = (page-1)*PAGE_SIZE + 1 ;  hi = min(page*PAGE_SIZE, ayah_count)
  parallel load: getWordsBySurahAyahRange(id, lo, hi),
                 getGlossesBySurahAndLang(id,'en')
  server-side shape:
    glosses → Map<word_id, gloss_text> (only page word_ids used)
    words grouped by ayah_number, each word → { word, gloss, posLabel }
    posLabel decoded from word.pos_tag via packages/data morphology tags
  → <WbwView surah ayahs=[{ayah_number, cells:[...]}]
             page totalPages scrollAyah />
```

Flow: **RSC resolve-page + windowed fetch + join + POS-decode + serialize →
mostly-server render.** No API route for the page, no client fetch. Only client
JS = thin `ScrollToAyah` (deep-link) + `VersePicker`/`Pager` links. Cell is a
dumb renderer (all decode server-side).

`words/params.ts` mirrors existing `word/.../params.ts`: validate numeric
`id` ∈ 1..114; invalid → `notFound()`. `page`/`ayah` parsed in `page.tsx`
(out-of-range clamped/ignored, never 404 — bad `?page` → page 1).

## Components (new, `apps/web/src/components/wbw/`)

```
WbwView.tsx     Server component. Header: surah name + link back to /surah/[id].
                Renders WbwAyahBlock[] for the page, <Pager>, and (if scrollAyah)
                <ScrollToAyah ayah={scrollAyah}/>. No reveal, no hook, no state.
WbwAyahBlock.tsx  one ayah. id=`ayah-${n}` (scroll anchor). ayah-number badge +
                  RTL flex-wrap of WbwWordCell. Empty cells → text_uthmani
                  fallback (mirror AyahView).
WbwWordCell.tsx   next/link → /word/[surah]/[ayah]/[position]. Stacks:
                  Arabic (font-arabic, large) / translit / gloss / POS chip.
                  null translit|gloss → '—'; null posLabel → chip hidden.
                  POS chip reuses 08e SegmentCard chip class (no new token).
Pager.tsx         Server. Props: surahId, page, totalPages. Prev/Next as
                  next/link → ?page=N (disabled/omitted at ends). "Page N / M".
                  aria-labels. Hidden when totalPages===1.
ScrollToAyah.tsx  'use client', renders null. Props: ayah. useEffect on mount:
                  getElementById(`ayah-${ayah}`)?.scrollIntoView(behavior
                  'smooth'|'auto' per prefers-reduced-motion). Only client JS
                  on the page path.
VersePicker.tsx   'use client'. Props: surahs:[{id,name_translit,ayah_count}].
                  Two <select>: surah → ayah (options 1..ayah_count, rebuilt on
                  surah change, reset to 1). "Go" → router.push(
                  `/surah/${sid}/words?ayah=${ayah}`). <label>s for a11y.
```

**Paging params:** `PAGE_SIZE=15` ayahs. Surah ≤15 ayahs → single page, Pager
hidden. `?page` out-of-range → clamped to 1..totalPages.

**Reader cross-link:** `SurahHeader.tsx` gains "Word by word →" link →
`/surah/[id]/words`.

Styling: existing paper/night tokens + `font-arabic`. No new design token.

## Verse picker wiring

- **Home** (`app/page.tsx`, RSC): fetch `getAllSurahs`, render `<VersePicker>`
  in a "Go to verse" card.
- **SearchSheet** (client): add "Go to verse" affordance. Fetches surah list
  from `GET /api/surahs` (lazy, on first open; cached after). Mounts
  `<VersePicker>` with the result.

**`GET /api/surahs`** (`app/api/surahs/route.ts`): returns
`[{id, name_translit, ayah_count}]` (114 rows). `Cache-Control` immutable-ish
(static Quran metadata). DB error → 500 JSON `{error}`, picker degrades to
disabled (never white-screen).

## Deep-link (solved server-side)

`?ayah=N` resolved in `page.tsx`: `page = ceil(N/PAGE_SIZE)`, so the target
block is server-rendered on that page. `<ScrollToAyah ayah={N}/>` (client,
mount effect) scrolls to `#ayah-${N}` after paint — block already in DOM, no
race. Out-of-range / non-numeric `ayah` → ignored (no scroll), page 1.
`?ayah` beats `?page` when both present (picker always sends `?ayah`).

## Error handling & edges

- Bad / >114 surah id → `notFound()`.
- `?ayah` invalid → ignore, no crash.
- null translit/gloss/POS → '—' / hidden chip. (Post-repair data fills these;
  Fatiha-style nulls still degrade gracefully.)
- Empty words for surah (shouldn't happen post-repair) → block text_uthmani
  fallback.
- `/api/surahs` DB error → 500 JSON, picker disabled state.

## Testing (§10)

- Data: `getWordsBySurahAyahRange` — returns only in-range ayahs, ordered;
  empty range → []. (packages/data unit test.)
- Component:
  - `WbwWordCell` — renders 4 fields; null degradation ('—' / no chip);
    correct `/word/[s]/[a]/[p]` href.
  - `VersePicker` — ayah options track selected surah; Go pushes `?ayah=N` URL.
  - `Pager` — Prev/Next hrefs + disabled at ends; hidden when totalPages===1.
  - `ScrollToAyah` — mount effect calls scrollIntoView on `#ayah-N` (mock
    getElementById/scrollIntoView).
- Route: `/api/surahs` — shape + count 114.
- Page (`page.tsx`) page-resolution: `?ayah=N` → correct page + scrollAyah;
  `?page` clamp; both present → ayah wins. (unit-test the resolver helper.)
- Playwright smoke (mobile viewport): Home picker → `/surah/2/words?ayah=255`
  → lands on ayah 255's page, cell 2:255:1 visible + aligned (arabic ٱللَّهُ /
  translit al-lahu); Next link advances page.

## Non-goals

- No reader (mushaf) change beyond the one cross-link.
- No new word-detail surface (reuse `/word/...`).
- No audio on WbW page (reader owns audio).
- No translation-language switch on WbW cell (English gloss only; matches
  corpus coverage; multi-lang gloss is future work).
- No bottom-nav change.

## Files

New:
- `packages/data/src/queries/words.ts` — add `getWordsBySurahAyahRange`
  (+ export). Data test in `packages/data`.
- `apps/web/src/app/surah/[id]/words/page.tsx` (+ page-resolver helper)
- `apps/web/src/app/surah/[id]/words/params.ts`
- `apps/web/src/app/api/surahs/route.ts`
- `apps/web/src/components/wbw/WbwView.tsx`
- `apps/web/src/components/wbw/WbwAyahBlock.tsx`
- `apps/web/src/components/wbw/WbwWordCell.tsx`
- `apps/web/src/components/wbw/Pager.tsx`
- `apps/web/src/components/wbw/ScrollToAyah.tsx`
- `apps/web/src/components/wbw/VersePicker.tsx`
- tests: `getWordsBySurahAyahRange` data test, `WbwWordCell.test.tsx`,
  `VersePicker.test.tsx`, `Pager.test.tsx`, `ScrollToAyah.test.tsx`,
  page-resolver test, `api-surahs.test.ts`, WbW e2e smoke.

Modified:
- `apps/web/src/app/page.tsx` (Home picker card)
- `apps/web/src/components/search/SearchSheet.tsx` ("Go to verse" mode)
- `apps/web/src/components/reader/SurahHeader.tsx` (WbW cross-link)

## Risks / rollback

- **Deep-link scroll before paint** → solved server-side: target ayah's page is
  server-rendered, `ScrollToAyah` runs after mount (block already in DOM).
- **Big-surah perf/payload** (Baqarah ~6000 words) → server-side window ships
  only ≤15 ayahs/page; both payload and DOM bounded. Cells cheap (Link only).
- **POS decode mismatch** with 08e labels → reuse the same `packages/data`
  tag source, one code path.
- Rollback: purely additive (one new query + route + components + one endpoint
  + 3 small edits). Revert removes WbW page + picker; reader unaffected.

## Acceptance criteria (testable)

1. `/surah/1/words` renders all 29 Fatiha words, grouped by 7 ayahs, each cell
   Arabic+translit+gloss+POS, arabic↔translit aligned (1:1:1 بِسْمِ/bis'mi).
2. Tap a cell → `/word/[surah]/[ayah]/[position]` detail.
3. Long surah (id=2): each page renders ≤ PAGE_SIZE (15) ayahs; Pager shows
   "Page N / M"; Next/Prev navigate `?page=N` server-side. Payload bounded.
4. `/surah/2/words?ayah=255` server-renders ayah 255's page (page 17) and
   scrolls to it (`#ayah-255`).
5. Home + SearchSheet pickers navigate to `/surah/[id]/words?ayah=N`.
6. `GET /api/surahs` returns 114 rows {id,name_translit,ayah_count}.
7. Invalid surah id → 404; invalid ?ayah → page 1 no scroll; bad ?page →
   clamped; no crash.
8. lint + type-check + tests pass; Greptile 5/5; a11y (labels, RTL) intact.
