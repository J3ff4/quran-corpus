# Phase 08a — Dictionary Letter Fixes (Design)

Part of Phase 08 (UI/UX overhaul, sub-phases A–F). First sub-phase. Scrape-independent.

## Goal

Stop displaying + sorting by raw Buckwalter. Show Arabic letters, correct
Arabic-alphabet order, 3-letter root pill, correct pluralization. Kill the
`$`/`*`/`E`/`H` cluster in one pass.

## Root cause (confirmed in code)

App prints machine transliteration (Buckwalter) as user-facing text and sorts
by it:
- Buckwalter map: ش=`$`, ذ=`*`, ع=`E`, ح=`H`, غ=`g`, ط=`T`… → `$Am`, `H$r`, `dxl`, `Eyn`.
- `getAllRoots` = `ORDER BY root_buckwalter` (ASCII). `$`(0x24)/`*`(0x2A) rank
  before letters → sheen roots float to top ("shiyn first").
- Leak sites: `RootListRow` (subtitle), `RootEntry` (subtitle), `SegmentCard`
  (`segment.root` is Buckwalter, rendered in Arabic font → gibberish).

## Decisions (locked)

1. Display = Arabic letters everywhere. Buckwalter stays ONLY in URL slug
   (`/dictionary/$Am`) — ASCII-safe routing, never shown.
2. 3 root letters in a pill on root page header.
3. Collation = Arabic hijā'ī order. Sort in JS in data-access fn (1642 roots,
   trivial). No new column, no migration.
4. Latin academic translit (ṣād rā ṭā) = DEFERRED (not this sub-phase).
5. Pluralization: "occurs 1 time" / "occurs N times".

## Data source of truth: `root_arabic` vs Buckwalter

- Roots list + root page already have `root.root_arabic` (e.g. `ش أ م`) → just
  stop rendering the Buckwalter subtitle; sort by `root_arabic`.
- `word_segments.root` = Buckwalter only (no Arabic-root column). SegmentCard
  must convert Buckwalter→Arabic for display. → build `buckwalterToArabic`.

## Files

### packages/data (source of truth, portable — no web imports)

- Create `src/text/arabic.ts`:
  - `BUCKWALTER_TO_ARABIC: Record<string,string>` — full Tim Buckwalter map
    (letters, hamza forms, taa marbuta, tanwin/harakat, sukun, shadda).
  - `buckwalterToArabic(bw: string): string` — map each char; unknown char
    passes through unchanged (defensive, no throw).
  - `ARABIC_ALPHABET_ORDER: string[]` — 28-letter hijā'ī order. Hamza variants
    (أ إ آ ء ئ ؤ) fold to alef via existing `normalizeArabic` ALEF handling; use
    normalize before keying so `ش أ م` and `شءم` collate consistently.
  - `compareRootsArabic(a: string, b: string): number` — compares two
    `root_arabic` strings letter-by-letter using `ARABIC_ALPHABET_ORDER`
    (strip spaces first). Unknown letters sort last.
- Modify `src/queries/roots.ts`:
  - `getAllRoots`: drop `ORDER BY root_buckwalter`; after map, `.sort((a,b) =>
    compareRootsArabic(a.root_arabic, b.root_arabic))`.
  - `getRootsByFrequency`: UNCHANGED. Its `root_buckwalter` tiebreak only orders
    equal-frequency roots and is never displayed as Buckwalter — leave it.
- Export new symbols from `src/index.ts`.
- Tests `tests/arabic.test.ts`:
  - `buckwalterToArabic('H$r') === 'حشر'`, `('dxl') === 'دخل'`, `('E') === 'ع'`,
    unknown char passthrough.
  - `compareRootsArabic`: `ء/ا`-initial sorts before `ب`; `ش` sorts after `س`
    not first; spaces ignored; hamza-alef fold equal.

### apps/web

- `components/dictionary/RootListRow.tsx`: remove Buckwalter subtitle
  (`{root.root_buckwalter}`). Keep Arabic root + count. (Arabic already spaced
  in data.)
- `components/dictionary/RootEntry.tsx`: replace
  `{root.root_buckwalter} · occurs {n} times` with:
  - 3-letter pill row: one pill per Arabic letter — `Array.from(root_arabic
    .replace(/\s+/g, ''))` (robust whether stored spaced or not).
  - `occurs {n} time{n === 1 ? '' : 's'}`.
- `components/morphology/SegmentCard.tsx`: render
  `buckwalterToArabic(segment.root)` instead of raw `segment.root`. Import from
  `@quran-corpus/data`. Leave `lemma` as-is (already Arabic). Also hide the
  `raw: …` / internal feature dump? → OUT of scope A (word-page redesign = E).

## Out of scope (later sub-phases)

- Word-page raw-blob redesign, structured grammar (E).
- Latin academic transliteration (deferred).
- Alphabet picker / red-highlight concordance (D).
- Perf (C), shell (B), WbW (F).

## Acceptance (testable)

- Dictionary alpha list first row is a hamza/alef-initial root, NOT `$…`.
- No `$` / `*` / `E` / `H` (Buckwalter) visible on dictionary list, root page,
  or word segment cards.
- Root page header shows 3 separate letter pills.
- Root with count 1 reads "occurs 1 time".
- SegmentCard root shows Arabic (`حشر`), not `H$r`.
- data unit tests green; web lint + type-check green; existing suites green.

## Risks / rollback

- Risk: Buckwalter map incompleteness → a char passes through raw. Mitigation:
  passthrough is visible-but-safe; map covered by tests on real roots.
- Risk: collation edge cases (hamza, waw/ya). Mitigation: normalize-then-key;
  tests assert order. Acceptable if a few rare roots mis-order — cosmetic.
- Rollback: revert branch; display-only + one query sort change, no schema/data
  migration, so revert is clean.

## Rebuild note

`packages/data` must be rebuilt (`pnpm --filter @quran-corpus/data build`)
before web resolves new exports (web resolves against dist).
