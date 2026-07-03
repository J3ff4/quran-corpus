# Phase 07b — Global Search · Design Spec

Date: 2026-07-03 · Style: caveman (terse, complete). Governance: CLAUDE.md. Product: PRD §2.4, §8.

## Goal
Global search for the corpus PWA. One entry, four match kinds, ranked + highlighted results. Mobile-first.

## Scope
IN:
- Verse-ref jump: `2:255`, `2`, `2:255:3` (word), surah-name (`Al-Baqarah 255`).
- Root/meaning: reuse existing `searchRoots` (buckwalter/arabic/gloss). No change to it.
- Translation-text search (en/ru/uz) via FTS5.
- Arabic verse-text search, harakat-free via `normalizeArabic(ayahs.text_uthmani)` indexed in FTS5.
- Two surfaces: `/search` route (SSR, shareable) + header bottom-sheet (live).
- Deterministic ranking + match highlight.

OUT (deferred, not this phase):
- Learned/popularity ranking (PARKED → device-local later, global at Phase 09; needs analytics + privacy review, conflicts w/ no-accounts default).
- Word/morphology feature search beyond root/meaning.
- Per-word gloss search (07c dependency).

## Confirmed decisions
1. Surfaces = BOTH `/search` route + header bottom-sheet. Share one query layer + one result component (DRY).
2. Arabic match = harakat-free via **app-side normalization** (NOT tokenizer — see §Verified constraints). Both FTS body + query pass through `normalizeArabic()`.
3. Ranking = deterministic: Jump → Verses (bm25) → Roots (occurrence_count). Smart-rank parked.
4. Engine = **Unified SQLite FTS5** (native; free bm25 rank + `snippet()` highlight). One `search_fts` table holds normalized Arabic AND translation text. LIKE rejected (no rank, mid-word, hand-rolled highlight).

## Verified constraints (probed 2026-07-03 against real DB + @libsql/client)
- FTS5 **available** in libSQL (RISK-1 resolved). ✓
- FTS5 tokenizer `remove_diacritics` folds Latin only; **does NOT strip Arabic harakat** (stored `كَتَبَ`, query `كتب` → no match). Harakat are combining marks between letters, so `LIKE '%كتب%'` fails too. ⇒ Arabic must be normalized in app code before indexing + before querying.
- `ayahs.text_simple` is **NULL** in the built DB — cannot be the search source. Arabic FTS body = `normalizeArabic(ayahs.text_uthmani)`.
- `runMigrations` splits `schema.sql` on `;` — shreds `BEGIN…END;` triggers. Splitter must be made statement-aware (BEGIN…END block tracking) before any trigger ships.
- Quran Arabic text is fixed (6236 ayahs, never re-written) ⇒ Arabic FTS rows populated once by backfill; no Arabic sync trigger needed. Translations grow (new editions) ⇒ translation sync triggers required.

## Architecture

### 1. Data layer — `packages/data` (stays Next-free, portable)
New `src/text/normalize.ts` (pure, no db):
- `normalizeArabic(s): string` — strip harakat U+064B–0652, superscript alef U+0670, tatweel U+0640, BOM U+FEFF; fold alef variants (ٱ إ أ آ → ا). Applied identically to FTS body (backfill) + user query. Deterministic, unit-tested against known verse pairs.
- `escapeFtsQuery(s): string` — wrap user term as FTS5 quoted string ("...", inner `"`→`""`) so FTS operators (`*`, `:`, `NEAR`, `-`, `^`) can't inject. Used by every `MATCH`.

New `src/queries/search.ts`:
- `parseVerseRef(db, q): Promise<VerseRef | null>` — detects `S`, `S:A`, `S:A:W`, surah-name (+ opt ayah). Surah-name → id via `surahs` lookup (normalized, case-insensitive, matches name_translit/name_translation/name_arabic). Returns `{ surah, ayah?, position? }` or null.
- `searchVerses(db, q, opts?): Promise<VerseHit[]>` — FTS5 `MATCH escapeFtsQuery(...)`, Arabic term also `normalizeArabic()`'d, `ORDER BY bm25(...)`. Returns `{ surah_id, ayah_number, source: 'ar'|'en'|'ru'|'uz', snippet }`. `snippet` = FTS5 `snippet()` w/ sentinel markers (`char(2)`/`char(3)`), NOT HTML.
- `search(db, q): Promise<SearchResult>` — orchestrator → `{ jump: VerseRef | null, verses: VerseHit[], roots: Root[] }`. Roots via existing `searchRoots`.
Types (`VerseRef`, `VerseHit`, `SearchResult`) exported from `packages/data` index.

### 2. Schema / FTS5 — `packages/data/schema.sql` + migrate.ts upgrade
- **Migrate splitter upgrade (prereq):** `runMigrations` currently `.split(';')` — breaks `BEGIN…END;` triggers. Replace with a statement splitter that tracks `BEGIN`/`END` depth so a trigger body is one statement. Ships with its own test.
- FTS5 **contentless-ish external table** `search_fts` with **stored columns** (not external-content — bodies are derived/normalized, not 1:1 to a source column). Columns: `surah_id UNINDEXED`, `ayah_number UNINDEXED`, `source UNINDEXED`, `body`. Tokenizer: `unicode61 remove_diacritics 2` (folds Latin/Cyrillic for translations; Arabic already normalized in `body` before insert).
- `body` = **`normalizeArabic(text_uthmani)`** for `source='ar'` rows (computed in JS at backfill), and raw `translations.text` for `source=lang` rows.
- **Triggers** AFTER INSERT/UPDATE/DELETE on **`translations`** only → keep `search_fts` translation rows synced (new editions arrive later). Trigger body is pure column copy (SQL-expressible). **No Arabic trigger** — Quran text is fixed; Arabic rows populated once at backfill.
- **One-time backfill** (JS, in migrate path): normalize + insert 6236 Arabic rows + copy 18708 translation rows. Idempotent (guard: skip if `search_fts` already has rows / use `INSERT`-after-`DELETE` keyed by source).
- Migration additive. Rollback = `DROP TABLE search_fts` + drop translation triggers (source tables untouched).

### 3. Surfaces — `apps/web`
Shared component: `components/search/SearchResults.tsx` — renders `SearchResult`: sections Jump → Verses → Roots. Each verse row = ref link + highlighted snippet. Empty-state per section.
- `app/search/page.tsx` — SSR. `export const dynamic = 'force-dynamic'`. Reads `?q=`. Calls `search(db, q)` directly. Renders `SearchResults`. Shareable URL.
  - Param parse in sibling `search/params.ts` (App Router: page.tsx exports only default+allowed — see 06b/06c precedent).
- `components/search/SearchSheet.tsx` — bottom-sheet (Framer Motion, Emil Kowalski easing; `prefers-reduced-motion` respected). Debounced live input (~200ms). Fetches `/api/search?q=`. Renders same `SearchResults`. "See all" → `/search?q=`.
- `app/api/search/route.ts` — thin GET handler. Validates+trims `q` (len bounds), calls `packages/data` `search`, returns JSON. No secrets. Rate-safe (read-only).
- Header entry: 🔍 icon (in `/surah` + reader nav) → opens `SearchSheet`.

### 4. Ranking + highlight
- Order fixed: Jump (if `parseVerseRef` hit) → Verses (bm25 asc) → Roots (occurrence_count desc). Whole-word/exact naturally out-ranks partial via FTS.
- Highlight: `snippet()` emits sentinel-delimited match (e.g. `\x02…\x03`), parsed into React nodes → `<mark>`. NO `dangerouslySetInnerHTML` on raw DB text (OWASP output-encoding). Word-ref `S:A:W` → highlight word at `position` in rendered verse.
- Interpretation of user req "matched word highlighted in verse": text hits → highlight matched term (snippet); word-ref → highlight that word.

## Security (OWASP)
- Input validation at every boundary: `/api/search` + page trim/length-cap `q`; reject over-long. FTS query terms escaped/quoted to avoid FTS syntax injection (wrap user term as a phrase / strip FTS operators).
- Output encoding: snippet rendered as text nodes, never raw HTML.
- No PII, no query logging (privacy-first; no learned-rank).
- `packages/data` stays Next-free (portable to mobile).

## Testing (ships with logic — CLAUDE.md §10)
- `packages/data` unit: `parseVerseRef` (all forms + junk→null + surah-name), `searchVerses` (harakat-free hit, bm25 order, FTS-operator injection neutralized), `search` orchestrator shape, migration backfill count.
- `apps/web` component: `SearchResults` (three sections, empty states, highlight → `<mark>`), `SearchSheet` (open/close, debounce, reduced-motion), `/api/search` handler (validation, JSON shape).
- E2E smoke (mobile viewport): type `2:255` → Jump → tap → lands verse; type `throne` → Verses highlighted.

## Acceptance criteria (testable)
- `2:255` / `Al-Baqarah 255` → Jump result to correct ayah.
- Plain Arabic (no harakat) matches diacritized verses.
- `throne` returns en-translation verses, matched term highlighted, ranked by relevance.
- Roots section still works (reused searchRoots).
- Bottom-sheet live results < ~300ms on local DB; `/search?q=` SSR shareable.
- Lint + type-check + tests green. Greptile ≥ 4/5 per commit (CLAUDE.md §5).

## Risks / rollback
- ~~RISK-1 FTS5 availability~~ — RESOLVED: FTS5 present in libSQL (probed 2026-07-03).
- Arabic normalization coverage: `normalizeArabic` must fold every mark/alef-variant the Uthmani text uses. Mitigate: unit tests over real verse samples (1:1, 2:255, 112:1) asserting normalized Arabic query hits diacritized verse.
- Migrate splitter regression: statement splitter change touches all migrations. Mitigate: test asserts existing tables still create + a BEGIN…END trigger survives intact.
- Translation-trigger sync on bulk import (new editions add many rows): backfill + trigger paths both tested.
- Rollback: drop `search_fts` + translation triggers; revert migrate splitter; remove `/search`, `/api/search`, search components. Source tables untouched.

## Dependencies / sequencing
- Data ready NOW (ayahs + translations loaded). 07b needs no scrape.
- Independent of reader UI-change report (07b = new surfaces) → low rework, chosen first.
- Files: `packages/data/src/queries/search.ts`, `schema.sql`(+migration); `apps/web` `app/search/{page,params}.tsx`, `app/api/search/route.ts`, `components/search/{SearchResults,SearchSheet}.tsx`, header entry.

## Open / to confirm in plan
- Surah-name matching source: match against `name_translit` + `name_translation` + normalized `name_arabic`. Confirmed in plan.
