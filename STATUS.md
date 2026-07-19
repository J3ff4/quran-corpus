# STATUS

Live scratch board. Caveman. Update as things move. Not governance (that = CLAUDE.md).
Drifts stale between sessions/accounts — verify anything below against `git log`/
`git merge-base --is-ancestor <c> main`/`gh pr list --state all` before trusting it.
(This file was found stale 2026-07-18: claimed phase-07b search "T11 pending" and
hamza-seat "ready to merge" when both had been merged for days, one iterated further
since. Full rewrite below reflects re-verified ground truth as of today.)

Updated: 2026-07-18

## Now
All work below confirmed via `gh pr list --state all` + `git merge-base --is-ancestor`,
not carried over from prior narrative.
- PRs #1–38 all MERGED into `main`. Current tip `fac2a80` (drawer menu + per-ayah
  bookmarks, #38). Recent chain: #37 (surah-name glyph centering) → #36 (scraper retry
  w/ backoff) → #35 (phase-13b wide arabesque frame) → #34 (hamza-seat fix) → #6
  (phase-07b global search, FTS5) → ... back through phases 06–01.
- Global search (#6): DONE, merged long ago — iterated further afterward (greptile
  fixes on `fix/greptile-search-findings`, a search-sheet consolidation pass). The old
  "T11 review pending / T12 next" note here was stale; ignore, it already shipped.
- Hamza-seat fix (#34): DONE, merged, confirmed (`b0ec7cc` is an ancestor of main).
- Scraper retry-w/-backoff (#36), phase-13b frame (#35): DONE, merged.
- Drawer menu + per-ayah bookmarks (#38): DONE, merged, this session.

## Data DB (`/home/claude/quran-data/quran.db`, ~113MB; several `.bak` snapshots)
Re-queried directly 2026-07-18 (do not trust older counts in this file's history):
- `words` (77429 rows): transliteration 77429/77429 ✓. morphology_description
  77429/77429 ✓. grammar_arabic 70125/77429 — remaining 7304 are legitimate bare-particle
  cases (no case/construction to label on the source page), not a bug — see
  [[qurandev-roots-source-decision]] / word-detail-single-segment-parser-gotcha memory.
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
