# Phase 10 — Dictionary Data Correctness (design)

Date: 2026-07-06. Status: approved, ready for writing-plans.

## Problem

Dictionary shows wrong data:

- **Occurrence counts wrong.** 1,399 of 1,642 roots show `0` occurrences. Real
  counts exist in `word_segments`. Verified: root `Abd` stored `0`, actual `28`;
  `Aty` stored `549`, actual `549`. Only 243 roots ever got a scraped total; the
  rest kept the `0` default. (screenshots 3026, 405 header)
- **Derived forms polluted.** 712 roots (714 rows) have a junk `root_forms` row:
  `pos_label = "Lane's Lexicon - Classical Arabic dictionary"`, `form_arabic =
  NULL`. Renders as an empty/broken "Derived forms" section. (screenshot 405)

## Root causes (both confirmed in code)

1. **Parser** `packages/scraper/scraper/sources/corpus_dictionary.py:_extract_forms`
   does `soup.find("ul", class_="also")`. The corpus root page reuses
   `class="also"` for the **"See Also"** box. Roots WITH real derived forms have
   the forms `ul` first → parsed correctly. Roots WITHOUT derived forms have only
   the See-Also `ul` → its single `<li>` (the Lane's Lexicon link, no `span.at`)
   becomes a fake form with `form_arabic = NULL`.
2. **occurrence_count** is a denormalized column only written when the corpus
   dictionary scrape produced an "occurs N times" total. Non-scraped roots kept
   `0`. Authoritative signal is `word_segments.root` (the actual morphology),
   not the scrape text.

## Decisions (user-approved)

- Junk-form roots are fixed by **deletion** — they genuinely have no derived
  forms; do not re-scrape them.
- `occurrence_count` is sourced from **`word_segments`**, not the corpus
  "occurs N times" text.
- Data lives in the scraper-owned canonical DB (`/home/claude/quran-data/quran.db`,
  gitignored; `apps/web/quran.db` is a symlink to it — single DB). Fixes run as a
  repeatable script with a `.bak` first (existing habit). `runMigrations` only
  applies idempotent schema DDL — NOT a data-fix vehicle.

## Units (each = one 5-step + TDD loop)

### U1 — Parser fix (durable root cause) · packages/scraper · pytest
`_extract_forms` must select the **derived-forms** list, not See-Also. Approach:
take the `ul.also` associated with the "…in N derived forms:" sentence, OR skip
any `<li>` lacking a `span.at` / containing a `lexicon` link.
- RED: new fixture — root page whose ONLY `ul.also` is See-Also → `forms == []`.
- Keep existing `corpus_dict_ktb` fixture green (real forms still parse).

### U2 — Data-fix script (repeatable, idempotent) · packages/scraper
Against canonical DB, after writing a `.bak`:
- (a) `UPDATE roots SET occurrence_count = (SELECT COUNT(*) FROM word_segments
  WHERE root = roots.root_buckwalter)` for all roots.
- (b) `DELETE FROM root_forms WHERE form_arabic IS NULL`.
- Idempotent (re-runnable, same result). Leaves one runnable verification.
- Verify by **alignment, not row count** (see [[validate-data-by-alignment-not-count]]):
  spot-check Aty=549, Abd=28, and ~12 more roots against a fresh `word_segments`
  count; assert zero rows where stored `occurrence_count` != real count; assert
  no `root_forms` row has `form_arabic IS NULL`.

### U3 — Query / UI guard · packages/data + apps/web · vitest
- Root page hides the "Derived forms" section entirely when the root has no real
  forms (no stray label/row).
- Occurrence header + dictionary-list counts read the corrected column (verify
  the query returns the recomputed value — no separate code change expected, but
  test-locked).

### U4 — Regression test · packages/data · vitest
- Seeded root's `occurrence_count` equals its `word_segments` count.
- A root whose only `root_forms` rows are null-form yields an empty derived-forms
  query result.

## Out of scope (→ docs/AGENDA.md)

Perf (compare prod build first), clause-trim verse truncation, prev/next root
arrows, pill-letter centering, dictionary load-more re-test.

## Acceptance criteria (testable)

1. `SELECT COUNT(*) FROM roots WHERE occurrence_count != (real word_segments
   count)` returns `0`.
2. `SELECT COUNT(*) FROM root_forms WHERE form_arabic IS NULL` returns `0`.
3. Parser returns `[]` for a See-Also-only page (new fixture) and unchanged real
   forms for `ktb`.
4. Root page with no real forms renders no "Derived forms" heading.
5. Dictionary list + root header show non-zero counts for roots that have
   occurrences (Abd shows 28, not 0).
6. All existing scraper + data + web tests stay green; lint + typecheck clean.

## Risks / rollback

- **Risk:** data-fix script run against wrong/live DB. **Mitigation:** `.bak`
  first; no concurrent scraper writers (checkpoint idle); idempotent so a re-run
  is safe.
- **Risk:** `word_segments.root` has blanks/variants inflating/deflating counts.
  **Mitigation:** U2 alignment spot-checks catch this before commit.
- **Rollback:** restore the `.bak`; parser/UI code changes revert via git.
