# STATUS

Live scratch board. Caveman. Update as things move. Not governance (that = CLAUDE.md).
Drifts stale between sessions/accounts — verify anything below against `git log`/
`git merge-base --is-ancestor <c> main`/`gh pr list --state all` before trusting it.
(This file was found stale 2026-07-18: claimed phase-07b search "T11 pending" and
hamza-seat "ready to merge" when both had been merged for days, one iterated further
since. Full rewrite below reflects re-verified ground truth as of today.)

Updated: 2026-07-23

## Now
All work below confirmed via `gh pr list --state all` + `git merge-base --is-ancestor`,
not carried over from prior narrative.
- PRs #1–45 all MERGED into `main`. Current tip `2e6d513` (Full Analysis grammar_note
  fix, #45).
- Full Analysis grammar_note fix (#45): DONE, merged, this session. Word-detail page's
  "Full Analysis" collapsible had the SAME garbled `grammar_arabic` bug #44 fixed in the
  list view (case/verb-form term glued to spelled-out root letters) — #44 wrongly left
  it untouched assuming it was a different, correct use. `WordDetailView.tsx` now passes
  `word.grammar_note` (already selected by `getWordDetail`) to `FullAnalysis`, one line
  per `\n`-clause. `grammar_arabic` confirmed (grep) to have zero remaining UI consumers
  — left as-is, dormant, user's call. Greptile: pass.
  Recent chain: #45 (Full Analysis fix) → #44 (grammar_note correct-source fix) → #43 (shrink morphology col) →
  #42 (phase-16 per-segment color-coding) → #41 (sajdah mark) → #40 (wbw list view +
  go-to-verse) → #39 (search nav/uz fixes) → #38 (drawer menu + bookmarks) → back
  through phases 06–01.
- Global search (#6): DONE, merged long ago — iterated further afterward (greptile
  fixes on `fix/greptile-search-findings`, a search-sheet consolidation pass). The old
  "T11 review pending / T12 next" note here was stale; ignore, it already shipped.
- Hamza-seat fix (#34): DONE, merged, confirmed (`b0ec7cc` is an ancestor of main).
- WbW grammar-note fix (#44): DONE, merged, this session. New `words.grammar_note`
  column sourced from `wordbyword.jsp`'s `arabicGrammar` div (list-view 3rd column) —
  old `grammar_arabic` column (word-detail "Full analysis") untouched, still scraped
  from `wordmorphology.jsp` prose. Greptile 4→5/5 after 2 fixes: added a self-healing
  `ALTER TABLE` for `grammar_note` on the TS side (`packages/data/src/migrate.ts`,
  mirrors the scraper's own `_migrate_add_word_columns`) + accepted-tradeoff reply on
  the `COALESCE` staleness finding (matches sibling optional fields, kept as-is).

## Data DB (`/home/claude/quran-data/quran.db`, ~113MB; several `.bak` snapshots)
Re-queried directly 2026-07-22 (do not trust older counts in this file's history):
- `words` (77429 rows): transliteration 77429/77429 ✓. morphology_description
  77429/77429 ✓. grammar_arabic 70125/77429 — remaining 7304 are legitimate bare-particle
  cases (no case/construction to label on the source page), not a bug — see
  [[qurandev-roots-source-decision]] / word-detail-single-segment-parser-gotcha memory.
- `grammar_note` (new, #44): 77429/77429 ✓ — full backfill via `scraper scrape` with a
  fresh checkpoint (`.superpowers/sdd/grammar_backfill_checkpoint.json`, 114/114
  chapters). **Footgun found+fixed same session**: that re-scrape also wiped
  `text_arabic` to `''` for all 77429 rows (scraper always writes `text_arabic=""`,
  meant to be patched by a later step, but `upsert_word`'s `ON CONFLICT` overwrites it
  unconditionally instead of `COALESCE` like `grammar_note` does) — repaired via the
  existing `scraper derive-word-arabic` CLI (rebuilds from `word_segments`, untouched
  by the scrape). Confirmed clean after: hamza-seat regression test + full suite green.
  **Any future re-run of `scraper scrape` against an existing DB will hit the same
  text_arabic wipe — always follow it with `scraper derive-word-arabic`.**
- `word_glosses`: en 77429/77429 (source=`corpus`) ✓. uz 75539/77429 (source=`mt`) —
  1890-word gap: NLLB-200 returns `''` for short function words ("from"/"except"),
  confirmed in commit `44b9022`. Review round-trip (`review_glosses.py` export_top/
  import_reviewed) exists and was itself bug-fixed but **never actually run** — 0 rows
  with source=`mt-reviewed`.
- `root_definitions`: 1386 rows (qurandev/roots → Lane's Lexicon import). Done.
- `ru` (Russian) glosses: **none** — no rows, no language_code entry at all yet, despite
  being a named target language (CLAUDE.md §1).

## Jobs
- `scrape-word-details`: **DONE**. 77429/77429 checkpointed, no longer running. (Was
  78% per an older note in this file — finished since.)

## Housekeeping (found drifted 2026-07-18, not yet cleaned — flagging, no action taken)
- Untracked scratch sitting in the working tree, never committed/gitignored: this file,
  `docs/plans/phase-12-hamza-seat-fix.md`, `.superpowers/` (SDD task briefs/reports/
  review diffs, ~2.3M).
- Stale local branches (already merged via squash — their tips aren't ancestors of
  `main`, just leftover refs): `phase-09-perf-overhaul`, `phase-12-uzbek-wbw-glosses`,
  `phase-13-reader-typography`, `phase-13b-surah-wide-frame`, `feat/phase-06a/b/c`,
  `fix/csp-nonce-static-prerender`, `fix/surah-frame-glyph-centering`.
- Orphan commit chain, reflog-only (no branch, will eventually gc): ends at `18d9e7e`
  "perf(web/search): one canonical search sheet; retire /search page" — an abandoned
  consolidation attempt, never merged. Possibly superseded by the drawer-menu's
  Search-moved-into-menu change. Recover from reflog before it expires if wanted.
- Parked commit `65a7a56` ("fix(scraper): parse number-word and comma totals in root
  pages") still not landed on `main` — landing method still TBD.

## Queue
1. Uz gloss gap (1890 words, all short function words) — run the existing
   `review_glosses.py` export/import round-trip, or accept the gap as-is.
2. `ru` glosses — source + import path not decided yet.
3. Land parked commit `65a7a56` — ride next scraper PR vs. standalone push, still TBD.
4. Housekeeping above (stale branches, untracked scratch, orphan commit) — cosmetic,
   do whenever convenient.

## Notes
- Uzbek edition = Cyrillic (uz.sodik). Latin variant not done.
- Greptile: trial→free-plan transition already happened 2026-07-16 (50/mo cap) — watch
  usage against that cap going forward.
