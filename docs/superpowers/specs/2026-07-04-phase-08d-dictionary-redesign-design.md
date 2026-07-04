# Phase 08d — Dictionary Redesign — Design

Part of Phase 08 (UI/UX overhaul, sub-phases A–F). Sub-phase D.
Scrape-independent. Follows 08c (reader perf, merged).

## Goal

Two dictionary upgrades, corpus.quran.com-style but better:
1. **Alphabet picker** — Arabic letter grid on `/dictionary` to jump to roots by
   first letter. Today the page is a flat list of ~1600 roots, no letter nav.
2. **Concordance word highlight** — mark the matched word inside each root
   concordance verse (corpus renders it red; we use a warm soft-wash).

No schema change. Queries + render + one design token only.

## Current state (confirmed in code)

- `app/dictionary/page.tsx` — server, `force-dynamic`. Reads `q`, `sort`.
  `searchRoots` | `getRootsByFrequency` (top 200) | `getAllRoots` (all, alpha).
  Renders `<DictionaryIndex roots sort query />`.
- `components/dictionary/DictionaryIndex.tsx` — search box, alpha/freq toggle
  links, tool links, flat `RootListRow` list. No letter nav.
- `app/dictionary/[root]/page.tsx` — server. `getRootEntry` + `getRootConcordance`
  → `<RootEntry entry concordance />`.
- `components/dictionary/ConcordanceList.tsx` — server, presentational. Per
  matched word: verse-ref link, arabic word, translit, gloss, and the **full
  `verse_text` Uthmani string** (one text node, no highlight). Renders ALL
  entries (no pagination).
- `queries/roots.ts::getRootConcordance` — one query, returns per matched word:
  surah/ayah/position/word_id/text_arabic/transliteration/gloss + `verse_text`
  (`a.text_uthmani`).
- `text/arabic.ts` — `ARABIC_ALPHABET_ORDER` (29 letters, ء first), private
  `FOLD` (أ إ آ ٱ → ا, ى → ي), `compareRootsArabic`.
- `hooks/useIncrementalReveal.ts` — from 08c. `(total, initial, step)` →
  `{ visibleCount, sentinelRef, done, revealTo }`. IntersectionObserver, no dep.
- `packages/config/tailwind/preset.ts` — colors: `paper` (warm neutral),
  `night` (dark neutral). **No accent/warm hue.**

## Data findings (measured, drove decisions)

- Highlighting by splitting `verse_text` on whitespace and indexing `position`
  is **unreliable**: word rows and `text_uthmani` tokenize differently (waqf
  marks `ۛ ۖ` are their own word rows; surah-opening verses carry a Basmala
  prefix; word-form vs Uthmani orthography differ). ~33% of words land on the
  wrong token. No clean offset fixes it. **Rejected.**
- The **words table is the exact tokenization** (`position` is authoritative).
  Reconstructing the verse from its words highlights the exact match. **Chosen
  (option C).** Verse then renders in word-form orthography — same as the reader.
- Worst-case concordance = root الله (`Alh`), 2851 occurrences over 1879 ayahs =
  36 770 sibling words. `WHERE ayah_id IN (…)` fetch+order = **40 ms**. Query is
  cheap; the cost is rendering ~1879 verses → bound it by reusing the 08c
  incremental-reveal hook.
- Root first letters: 28 distinct. `FOLD` collapses the 68 `أ`-initial roots
  under `ا`; `ء` bucket is empty. Grid disables empty letters.

## Decisions (locked with user)

- **Picker = URL param, server-rendered link grid.** Letter → `/dictionary?letter=ب`
  (same route, Next soft-nav, zero client JS, shareable, back-button-correct).
  Overrides the earlier "client-side" idea — the only way "tap forces alpha +
  full set" works without shipping ~1600 roots on every visit. Grid always
  visible (incl. freq/search modes).
- **Highlight source = option C** (reconstruct verse from words table).
- **Highlight style = soft wash** — matched word: `font-semibold` + accent text
  on a light accent tint, rounded. Not a hard pill (chops the RTL line down a
  long list).
- **Concordance pagination** = reuse 08c `useIncrementalReveal`, `INITIAL=20`,
  `STEP=20`, `THRESHOLD=40` (identical to reader).
- **New `accent` color ramp** (terracotta) added to the preset.

## Architecture

### 1. `packages/data/src/text/arabic.ts` (modify)

Export `rootFirstLetter(rootArabic: string): string`:
- First non-space char of the root string, run through the same fold used by
  collation (أ إ آ ٱ → ا, ى → ي). Returns a member of `ARABIC_ALPHABET_ORDER`
  (or the raw char if unknown).
- Refactor: lift `FOLD` lookup into a tiny `foldLetter(ch)` used by both
  `orderKey` and `rootFirstLetter` (DRY — no second fold map).

### 2. `packages/data/src/types.ts` (modify)

- New `VerseWord = { id: number; position: number; text_arabic: string }`.
- `ConcordanceEntry`: **remove** `verse_text: string`; **add**
  `verse_words: VerseWord[]`. Keep `word_id` (the matched word). All other
  fields unchanged (surah_id, ayah_number, position, text_arabic,
  transliteration, gloss).

### 3. `packages/data/src/queries/roots.ts` (modify)

Rewrite `getRootConcordance(db, bw, lang='en')`:
- Query A (as today, minus `verse_text`): matched words for the root, ordered
  surah/ayah/position — gives surah/ayah/position/word_id/text_arabic/
  transliteration/gloss.
- Collect distinct `ayah_id`s from A. (Need `ayah_id` in A now.)
- Query B: `SELECT ayah_id, id, position, text_arabic FROM words WHERE ayah_id
  IN (<placeholders>) ORDER BY ayah_id, position`. Build
  `Map<ayah_id, VerseWord[]>`.
- Map each A row → `ConcordanceEntry` with `verse_words = map.get(ayah_id)`.
- Empty root → `[]` (no Query B, guard empty IN-list).
- Export `VerseWord` from `index.ts`.

### 4. `packages/config/tailwind/preset.ts` (modify)

Add `accent` (terracotta, warm, pairs with paper/night):
```
accent: {
  50:  '#fdf3ee', 100: '#f8e0d1', 200: '#eec0a3', 300: '#e19d74',
  400: '#d17a48', 500: '#bd5f30', 600: '#9c4d27', 700: '#7a3d20',
  800: '#572c18', 900: '#351a0e',
}
```
Sole design-system change. Used by the concordance wash (and available to E later).

### 5. `apps/web/src/components/dictionary/AlphabetGrid.tsx` (new, server)

Props: `{ counts: Record<string, number>; activeLetter?: string }`.
- Maps `ARABIC_ALPHABET_ORDER`. Each letter with `counts[letter] > 0` → `<Link
  href={/dictionary?letter=<letter>}>`; `=== activeLetter` → accent-highlighted
  and its href points to `/dictionary` (clear). `counts[letter] === 0` →
  disabled `<span>` (dimmed, no link).
- RTL grid, wraps, `font-arabic`, ~28px tap targets, paper/night tokens.
- Pure presentational, no client JS.

### 6. `apps/web/src/app/dictionary/page.tsx` (modify)

- Read `letter` from `searchParams` (alongside `q`, `sort`).
- Always `const allRoots = await getAllRoots(db)` → build `counts` via
  `rootFirstLetter` (one pass). (getAllRoots is already the alpha path; extra
  cost in freq/search mode is one ~1600-row sorted read, negligible.)
- Resolve the list:
  - `letter` present → `allRoots.filter(r => rootFirstLetter(r.root_arabic) ===
    letter)`, sort forced alpha (allRoots already alpha). Ignore `q`/`sort`.
  - else existing behavior: `q` → searchRoots; `sort==='freq'` →
    getRootsByFrequency; else allRoots.
- Render `<AlphabetGrid counts activeLetter={letter} />` above
  `<DictionaryIndex roots sort={effectiveSort} query />`. `effectiveSort =
  letter ? 'alpha' : sort`.

### 7. `apps/web/src/components/dictionary/ConcordanceList.tsx` (modify → client)

- `'use client'`.
- `useIncrementalReveal(entries.length, 20, 20)`; `paginate = entries.length >
  40`; `visible = paginate ? entries.slice(0, visibleCount) : entries`.
- Per entry: verse-ref link + arabic/translit/gloss as today, then the verse
  built from `entry.verse_words`: `map(w => <span>)`, joined by spaces; the
  `w.id === entry.word_id` span gets the wash:
  `rounded-md px-1 font-semibold text-accent-700 bg-accent-100
   dark:text-accent-300 dark:bg-accent-900/40`.
- `paginate && !done` → sentinel `<button ref={sentinelRef} onClick={() =>
  revealTo(visibleCount + 20)}>Load more</button>` (paper/night). Same pattern
  as `ReaderView`.
- Empty entries → existing "No occurrences." message.

## Data flow

- Dictionary index: `getAllRoots` (counts + alpha/letter list) + existing
  freq/search queries. No schema change.
- Concordance: `getRootConcordance` two queries, grouped in the data layer.
  `RootEntry` (server) still fetches and passes `concordance` to the now-client
  `ConcordanceList` (props are serializable).

## Error / edge handling

- **`letter` with 0 roots** (e.g. ء, or a bogus value) → filtered list empty →
  existing "No roots found." AlphabetGrid disables the empty ones so this is
  only reachable via a hand-typed URL.
- **Ayah with the root twice** → two entries, same `verse_words`, different
  `word_id` — each highlights its own word. Correct.
- **`verse_words` missing** (map miss) → render nothing for the verse line;
  never throw. Guard with `?? []`.
- **No-JS** concordance: first 20 render (SSR), "Load more" dead — accept
  (JS-required PWA), same stance as 08c.
- **Empty IN-list** in Query B → skip the query, return `[]`.

## Testing

**data — `arabic.test.ts` (extend):** `rootFirstLetter`:
- `'ب أ ر'` → `'ب'`; folds `'أ ك ل'` → `'ا'`; `'ى ...'` → `'ي'`; leading space
  tolerated.

**data — `roots.test.ts` (extend, in-memory libSQL):** `getRootConcordance`:
- matched entry carries `verse_words` in position order and a `word_id` that
  appears among them.
- ayah with two matches → two entries, same `verse_words`, distinct `word_id`.
- unknown root → `[]`.

**web — `AlphabetGrid.test.tsx` (new, RTL):**
- letters with `counts>0` render as links to `/dictionary?letter=X`; `counts===0`
  render disabled (no link).
- `activeLetter` letter is highlighted and links to `/dictionary` (clear).

**web — `ConcordanceList.test.tsx` (new/extend, RTL, mock `IntersectionObserver`):**
- verse rendered from `verse_words`; exactly the `word_id` span has the wash
  class; siblings don't.
- >40 entries → 20 rendered, "Load more" present; click → +20.
- ≤40 entries → all rendered, no "Load more".
- empty entries → "No occurrences.".

Existing dictionary/reader suites stay green. `useIncrementalReveal` unchanged
(reused as-is).

## Acceptance (testable)

- `/dictionary` shows an Arabic letter grid above the list; empty letters (ء)
  disabled.
- Tapping a letter → `/dictionary?letter=<letter>`, list filtered to roots whose
  folded first letter matches, alpha order, grid marks it active; tapping it
  again returns to `/dictionary`.
- Grid visible in freq/search modes too; tapping a letter switches to the
  alpha-filtered view.
- Each concordance verse renders word-by-word; the matched word carries the
  accent soft-wash; the rest don't.
- Long concordance (root الله) renders 20 verses, reveals +20 on scroll / "Load
  more"; only visible verses build word-spans.
- `accent` ramp present in the preset.
- All new + existing unit tests green; web + data lint + type-check green.

## Risks / rollback

- **Risk:** `ConcordanceEntry.verse_text` removal breaks another consumer.
  Mitigation: only `getRootConcordance` + `ConcordanceList` use it
  (verb-concordance uses a separate `VerbConcordanceEntry`). Grep before commit.
- **Risk:** two-query concordance N+1 feel. Mitigation: it's exactly two queries
  regardless of size; measured 40 ms worst-case.
- **Risk:** grid `getAllRoots` on every dictionary hit. Mitigation: ~1600 rows,
  already the alpha path; one sorted read, negligible.
- **Risk:** accent hues clash with palette. Mitigation: terracotta chosen warm;
  reviewable at spec gate; single-file ramp, trivially tuned.
- **Rollback:** queries + render + one token, no schema/data. Revert branch;
  restore `verse_text`; drop grid + accent.

## Out of scope (later)

- Word-detail page structured grammar (E).
- WbW redesign (F).
- Search/freq behavior unchanged beyond grid presence.
- Per-letter section headers / sticky rail (rejected model).

## Notes

- `packages/data` + `packages/config` change → rebuild before web type-check.
- Reuses 08c `useIncrementalReveal` verbatim (DRY, §3).
- No new dependency (§12).
