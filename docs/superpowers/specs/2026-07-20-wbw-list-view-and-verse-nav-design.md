# WbW List View + Verse Nav — Design

Extends 08f (`2026-07-05-phase-08f-wbw-and-verse-picker-design.md`). Adds a
second render mode to the existing WbW page, plus a verse picker on the WbW
page itself (currently only on Home + SearchSheet).

## Goal

1. **List view** — alt render of `/surah/[id]/words`, corpus.quran.com-style
   table (Translation | Arabic | Syntax & morphology) instead of word-cards.
   Toggle via 2 pills (Card / List) at top of page. Choice persists
   (localStorage).
2. **Go-to-verse on the WbW page itself** — reuse existing `VersePicker`
   (already used Home + SearchSheet), place at top of `/surah/[id]/words`.

## Decisions (locked in brainstorm; user vetoes at review gate)

1. List columns mirror corpus.quran.com: Translation | Arabic word | Syntax
   and morphology. Not a re-layout of card fields — new column set.
2. Scope unchanged: list view renders the *same* 15-ayah page card view
   shows now. No pagination change. (Corpus scrolls a whole surah
   continuously; we don't — perf/complexity not worth it here.)
3. Ayah grouping kept in list view (medallion + bookmark header per ayah,
   same as card) — not a fully flat corpus-style table.
4. VersePicker reused as-is on the WbW page: same push-based nav
   (`/surah/[id]/words?ayah=N`), which re-renders the page at the new
   location. No special-casing for "already on this route."
5. View mode persists via `localStorage['wbw-view-mode']`, default `'card'`.
   No blocking init script (unlike theme) — mode doesn't affect layout
   dimensions/color, so a possible one-tick flash on load is acceptable.

## Current state (confirmed in code)

- `page.tsx` (`app/surah/[id]/words/page.tsx`) already fetches full `Word`
  rows via `getWordsBySurahAyahRange` — including `morphology_description`
  and `grammar_arabic` — but drops both when mapping down to `WbwCell`
  (`components/wbw/types.ts`). List view needs these two fields; **zero new
  queries**, just thread them through.
- `WbwView.tsx` maps `ayahs` directly to `WbwAyahBlock` (server component,
  card only). No client state on this page today.
- `VersePicker.tsx` (`'use client'`) already does Surah+Ayah `<select>` +
  Go, pushes `/surah/${id}/words?ayah=${ayah}`. Used on Home
  (`getAllSurahs` fetched server-side) and SearchSheet (`/api/surahs`
  fetch). WbW page doesn't fetch `getAllSurahs` today — needs adding.
- No generic pill/segmented-toggle component exists. `chip` (`ui/chip.ts`)
  is a static non-interactive pill class only.

## Architecture & data flow

```
page.tsx (RSC, unchanged fetch shape + one addition)
  + getAllSurahs(db) → pickerSurahs (mirrors Home's fetch)
  WbwCell gains: morphologyDescription (w.morphology_description),
                 grammarArabic (w.grammar_arabic)
  → <WbwView surah ayahs page totalPages scrollAyah pageLang pickerSurahs />

WbwView.tsx (server, thin)
  "Go to verse" section → <VersePicker surahs={pickerSurahs} />
  ayah rendering delegated → <WbwAyahs surahId={surah.id} ayahs pageLang />
  (Pager, ScrollToAyah unchanged)

WbwAyahs.tsx  NEW, 'use client'
  state: viewMode: 'card'|'list', useState('card')
  useEffect on mount: try { read localStorage['wbw-view-mode'] } catch {}
    → setViewMode if valid value found
  on toggle: setViewMode + try { localStorage.setItem } catch {}
  renders <ViewToggle mode={viewMode} onChange={...} />
  renders ayahs.map(ayah =>
    viewMode === 'card' ? <WbwAyahBlock .../> : <WbwAyahListBlock .../>)

ViewToggle.tsx  NEW, 'use client' (or plain, receives mode+onChange as props
  — no internal state, parent owns it)
  two buttons "Card"/"List", aria-pressed={mode===x}, pill-group styling
  (paper/night tokens, rounded-full container, active segment highlighted)

WbwAyahListBlock.tsx  NEW, server component (no client state of its own)
  same header as WbwAyahBlock: <AyahMedallion/> + <BookmarkButton/>
  body: <table> (or role="table" div-grid) of <WbwWordRow/> per cell
  empty cells → same text_uthmani fallback as WbwAyahBlock

WbwWordRow.tsx  NEW
  <tr>: 
    td.translation  → gloss ?? '—' (+ translit below, + glossLang badge,
                       same rules as WbwWordCell) + "(surah:ayah:position)"
                       small label
    td.arabic       → <Link href=/word/[s]/[a]/[p]> arabic text (font-arabic)
                       + POS chip below (reuse `chip` class + posLabel,
                       same as card — no new color system)
    td.morphology   → morphologyDescription (en) above,
                       grammarArabic (ar, dir="rtl") below; both '—' if null
```

## Components (new/changed, `apps/web/src/components/wbw/`)

```
WbwView.tsx          CHANGED. Adds VersePicker section; delegates ayah
                     loop to WbwAyahs instead of mapping WbwAyahBlock itself.
WbwAyahs.tsx         NEW, 'use client'. Owns viewMode + localStorage.
ViewToggle.tsx       NEW. Controlled 2-option pill, no own state.
WbwAyahListBlock.tsx NEW, server. List-mode ayah section (mirrors
                     WbwAyahBlock's header, table body).
WbwWordRow.tsx       NEW, server. One <tr>, 3 columns.
types.ts             CHANGED. WbwCell + morphologyDescription, grammarArabic.
```

`page.tsx` changed: + `getAllSurahs` call, + 2 field assignments when
building `WbwCell` from `w`, + pass `pickerSurahs` prop to `WbwView`.

Styling: existing paper/night tokens, `font-arabic`, existing `chip` class
for POS. No new design tokens, no new dependency (no table/grid library —
plain `<table>` or CSS grid, whichever renders cleaner at mobile width;
implementer's call, same visual result either way).

## Error handling & edges

- `morphologyDescription`/`grammarArabic` null (pre-repair data gaps, same
  class as existing null translit/gloss/POS) → render '—', same degrade
  pattern as `WbwWordCell` already uses.
- `localStorage` unavailable/throws (private browsing, storage disabled) →
  try/catch swallows, stays on default `'card'`. Same pattern as
  `theme-init.js`.
- Invalid/stale stored value (not `'card'|'list'`) → ignored, default holds.
- No new 404/validation surface — `getAllSurahs` for the picker uses the
  same call Home already makes successfully; no new failure mode introduced.

## Testing

- `types.ts`/`page.tsx`: extend existing WbW page test (if present) to
  assert `morphologyDescription`/`grammarArabic` flow from `Word` into
  `WbwCell`, and that `VersePicker` renders on the page.
- `ViewToggle.test.tsx`: renders both options; click fires `onChange` with
  the other mode; `aria-pressed` reflects current mode.
- `WbwAyahs.test.tsx`: mocks `localStorage` — (a) no stored value → default
  card render; (b) stored `'list'` → mounts into list render; (c) toggle
  click both switches render AND writes the new value back.
- `WbwWordRow.test.tsx` / `WbwAyahListBlock.test.tsx`: stub cell with all
  fields populated → all 3 columns render expected text; stub with nulls →
  '—' fallbacks, no crash.
- Playwright smoke (mobile viewport, extend existing WbW smoke if any):
  toggle to List, confirm table renders; toggle back to Card; reload page,
  confirm last-picked mode persisted.

## Non-goals

- No change to card view's own fields/behavior.
- No change to pagination, deep-link (`?ayah=`) resolution, or `Pager`.
- No corpus-matching color system for POS tags — reuse existing `chip`.
- No whole-surah continuous scroll (rejected in brainstorm — see Decisions).
- No new API route — WbW page is already server-rendered, fetches
  `getAllSurahs` directly like Home does (no `/api/surahs` round trip
  needed here, unlike SearchSheet which is a client component).

## Files

New:
- `apps/web/src/components/wbw/WbwAyahs.tsx`
- `apps/web/src/components/wbw/ViewToggle.tsx`
- `apps/web/src/components/wbw/WbwAyahListBlock.tsx`
- `apps/web/src/components/wbw/WbwWordRow.tsx`
- tests: `ViewToggle.test.tsx`, `WbwAyahs.test.tsx`,
  `WbwAyahListBlock.test.tsx` (or folded into `WbwWordRow.test.tsx`)

Modified:
- `apps/web/src/components/wbw/types.ts` (`WbwCell` + 2 fields)
- `apps/web/src/app/surah/[id]/words/page.tsx` (+`getAllSurahs`, +2 field
  mappings, +`pickerSurahs` prop)
- `apps/web/src/components/wbw/WbwView.tsx` (+VersePicker section,
  delegate ayah loop to `WbwAyahs`)

## Risks / rollback

- **Hydration flash** (default card → possibly list after mount-effect
  read) — accepted per Decision 5; not a layout-shift, just a content swap
  behind a toggle the user already set once.
- **Table width on narrow mobile viewports** — 3-column table is denser
  than wrapped cards; implementer should check it doesn't force horizontal
  scroll on a 375px viewport (Playwright smoke covers this).
- Rollback: purely additive (2 new fields + 4 new components + 3 small
  edits to existing files). Revert removes list view + on-page picker;
  card view / existing nav entry points (Home, SearchSheet) unaffected.

## Acceptance criteria (testable)

1. `/surah/1/words` in Card mode renders exactly as it does today
   (unchanged).
2. Toggling to List mode on the same page renders a table per ayah:
   Translation | Arabic | Syntax & morphology columns, ayah medallion
   header kept, same 15-ayah page window.
3. List mode's Arabic cell links to `/word/[s]/[a]/[p]` (same target as
   card's cell).
4. Null `morphology_description`/`grammar_arabic` → '—', no crash.
5. `/surah/[id]/words` shows a "Go to verse" `VersePicker`; picking a new
   surah/ayah navigates to `/surah/[id]/words?ayah=N` and lands there with
   the previously-chosen view mode still active.
6. Reload the page after choosing List → still List (localStorage read).
   Private-browsing / storage-disabled → no crash, defaults to Card.
7. lint + type-check + tests pass; Greptile 5/5; a11y (labels, RTL,
   aria-pressed on toggle) intact.
