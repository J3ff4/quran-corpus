# STATUS

Live scratch board. Caveman. Update as things move. Not governance (that = CLAUDE.md).
Drifts stale between sessions/accounts — verify anything below against `git log`/
`git merge-base --is-ancestor <c> main`/`gh pr list --state all` before trusting it.
(This file was found stale 2026-07-18: claimed phase-07b search "T11 pending" and
hamza-seat "ready to merge" when both had been merged for days, one iterated further
since. Full rewrite below reflects re-verified ground truth as of today.)

Updated: 2026-07-27

## Now
All work below confirmed via `gh pr list --state all` + `git merge-base --is-ancestor`,
not carried over from prior narrative.
- PRs #1–57 all MERGED into `main`. Current tip `25fffa1` (bookmark nav fixes, #57).
- **Uzbek alignment spike: docs kept, code archived out of git (2026-07-27)**.
  The spike tooling (`uz_text.py`, `uz_align_eval.py`, `tools/uz_align_spike.py`
  + tests) lives at `/home/claude/quran-data/spike/` with a README, NOT in this
  repo — it scores against scraped third-party reference DBs, which reads badly
  in a public repo. PR #58 closed unmerged; only the plan/spec/report landed.
  The islom SQLCipher key was stripped from the design spec and must never be
  re-added: it is a third party's credential, unrotatable by us.
- **Bookmark nav, two bugs (#57)**: rebase-merged, both commits kept (`488b443`,
  `25fffa1`). Greptile pass.
  1. *Tapping a bookmark landed in the wrong place.* `ScrollToAyah` scrolled once on
     mount, against **fallback font metrics** — the Arabic faces load `display: 'swap'`,
     so the real face arrives later and reflows every ayah above the target, sliding it
     out of view. Worst in WBW (grid of Arabic cells re-wraps). Fix = scroll twice:
     immediately, then again after `document.fonts.ready`.
     Also `behavior: 'auto'` → `'instant'`. `'auto'` **defers to the CSS
     `scroll-behavior`**, which `globals.css:52` sets to `smooth`; a smooth scroll picks
     its destination once and never re-aims, so it *caused* the drift. `'instant'` is a
     WebIDL enum member → old engines (Safari <15.4, Chrome <97) *throw* rather than
     ignore it, hence the `try/catch` → `scrollIntoView(true)` fallback.
     Dropped `useReducedMotion`: an instant jump honours the preference by construction
     (the old `'auto'` gave those users a smooth scroll anyway).
     **Reader-intent is read from input events** (`wheel`/`touchstart`/`keydown`,
     passive+once), *not* from `scrollY` drift — the first version used a drift guard and
     `/code-review` killed it: the swap moves `scrollY` by itself (height clamping,
     scroll anchoring is default-on and fires exactly when content above the viewport
     resizes), so the guard would skip the re-aim on precisely the long surahs it exists
     for. Regression test pins this.
     Fixed in the *shared* component, so the reading view gets it too, not just the WBW
     path the bug was reported against.
  2. *Removed bookmark stayed on `/bookmarks` until refresh.* The list is server-rendered
     from the cookie, and the App Router **Client Router Cache** replays a back
     navigation from the RSC payload built *before* the client-side cookie write.
     `BookmarkButton` now calls `router.refresh()` on toggle. Compares `isBookmarked()`
     before/after — cookie truth, not React state, which another tab or MAX_BOOKMARKS
     eviction can desync — and skips the refresh when the write failed (blocked cookies,
     size cap). Verified `router.refresh()` does *not* remount `ScrollToAyah`, so no
     re-jump after tapping a bookmark.
     Declined the `/code-review` finding that this re-runs the whole `force-dynamic`
     surah page: the trade-off was stated in the option text the user picked.
  Test infra: `next/navigation` `useRouter` stubbed once in `test/setup.ts` (spreading
  `importActual` so page suites keep the real `notFound`/`redirect`); `BookmarkButton`'s
  own suite overrides it via `vi.hoisted` to assert on `refresh`.
  Not verified headlessly — no Playwright in the repo yet. Check landing accuracy on a
  long surah, where the swap reflow is largest.
- **Empty states type themselves in (#56)**: new `components/ui/TypingText.tsx`, used
  by bookmarks, search, concordance and the dictionary root list.
  **CSS, not JS** — one span per char carrying its own `animation-delay`, faded in by
  `.typing-char` in `globals.css`. No state, no effect, no timer.
  A JS version (`useState(0)` + self-rescheduling `setTimeout`) was built first and
  killed by `/code-review`: seeding the count at 0 shipped the whole message invisible
  in the server HTML, legible only after hydration — on `/bookmarks`, a `force-dynamic`
  page whose *point* is server rendering, that's a heading over a blank page on a slow
  phone. The obvious patch (visible tail, effect hides it) just trades that for a
  full-text-then-retype flash = the #52 bug. Any JS reveal must pick one; CSS avoids
  both. Same reason `prefers-reduced-motion` is a media query, not `useReducedMotion()`
  — the hook is client-only and would honour it one hydration too late.
  Per-char delays are a fixed jitter cycle, not `Math.random()` (baked into server HTML,
  must match both sides; test pins two renders byte-identical). Untyped tail is
  transparent, not absent → no reflow/re-wrap, and the full string stays in the DOM in
  reading order for AT/find-in-page/copy-paste, no `aria-hidden` duplicate.
  Follow-up commit dropped the punctuation hold (read as a stall) and sped it up:
  90ms start, 12ms/char, 80ms fade → ~1.2s for the 69-char message, was ~2.8s.
  **Greptile pass, zero comments, both rounds.** Declined one `/code-review` finding:
  keeping `text-center` on the centred empty states, since not reserving the tail's
  width makes the sentence re-centre on every character.
  Known cost: per-char spans break `getByText` (3 call-site tests moved to
  `textContent`) and confuse in-page translation tools.
- **Ayah bookmark icons server-rendered (#55)**: closes the gap #54 left open below.
  `bookmarkedAyahsIn(raw, surahId, view)` in `lib/bookmarks.ts` reuses the validating
  `getBookmarksFromCookie`, so cookie input stays sanitized; `/surah/[id]` and
  `/surah/[id]/words` (both already `force-dynamic` + `await cookies()`) thread
  `bookmarkedAyahs` through `ReaderView`/`WbwView`/`WbwAyahs` into each button's
  `initialBookmarked`. `WbwAyahs`'s inline `document.cookie` write swapped for the
  shared `writeCookie`.
  **Greptile 1 round: pass, zero comments.** The one real finding came from
  `/code-review` instead (first run of it on this repo — now CLAUDE.md §4 step 3):
  the WBW card/list switch swaps `WbwAyahBlock` for `WbwAyahListBlock` at the *same
  key*, so React remounts `BookmarkButton` and re-seeds `useState` from the server
  snapshot — stale after any client toggle, painting the wrong icon for one frame.
  Fixed by moving the cookie re-read to a layout effect behind `typeof window ===
  'undefined' ? useEffect : useLayoutEffect` (bare `useLayoutEffect` warns on server
  render). Not #52's band-aid: there the server rendered a guess, here it renders the
  truth and only a client toggle can stale it. Still open from #54: cross-tab
  `storage`-event sync.
- **Bookmarks page server-rendered (#54)**: same fix as #53, applied to `/bookmarks`,
  which rendered *nothing* until hydration and then waited on a `/api/surahs` fetch
  before showing a row. Bookmarks moved localStorage → `bookmarks` cookie; `page.tsx`
  reads it via `cookies()` and joins surah names straight from the DB (`getAllSurahs`),
  so the list is in the initial HTML and `BookmarksView` is presentational. Extras
  pulled in by self-review: `src/lib/cookies.ts` (shared cookie read/write — it was
  about to be copy-pasted into a second lib; verifies writes by read-back, sets
  `Secure` only over https so plain-http dev still works; `reading-history.ts` moved
  onto it too) and `MigrateLegacyBookmarks` (one-time localStorage → cookie migration
  + `router.refresh()`, old key cleared only after a confirmed cookie write, else
  upgrading users silently lose their bookmarks — marked `ponytail:` for deletion
  once everyone has rolled through). `bookmarkedAt` dropped (cookie order carries
  recency), entries capped at 200 (~2KB, cookies ride every request).
  **Greptile 1 round: fail → pass.** P1 was real: the cookie was only range-checked
  Quran-wide (1..286), so `1-8-r` passed even though Al-Fatihah ends at 7 — the page
  linked it and the reader silently opened the surah at the top. Fixed in
  `app/bookmarks/rows.ts` (`toBookmarkRows` filters on each surah's own `ayah_count`).
  Deliberately out of scope: cross-tab `storage`-event sync is GONE (cookies don't
  fire it; mobile PWA, single tab — `BroadcastChannel` if ever wanted). The other gap
  left here — `BookmarkButton`'s icon on ayah rows resolving after mount — was closed
  by #55 above.
- **Home "Read" section — three PRs, one arc (#51 → #52 → #53), all merged:**
  - #51 made it dynamic: no more hardcoded Fatiha/Baqara/Yasin/Mulk — shows the
    user's last 4 distinct visited surahs (most-recent-first), tracked in new
    `src/lib/reading-history.ts`. `RecordSurahVisit` (renders null) mounted on
    `surah/[id]/page.tsx` logs every surah-page visit. New users / empty history:
    4 defaults (Fatiha, Baqara, Kahf, Mulk — Yasin dropped per user's explicit
    pick). Partial history backfills remaining slots with unvisited defaults, no
    dupes. Storage was localStorage; SSR rendered defaults and reconciled on mount.
  - #52 killed the visible flash of that reconcile (`useLayoutEffect` swap, before
    paint) — but the server was still rendering defaults every time.
  - #53 (this session) removed the reconcile entirely: reading history moved from
    localStorage to a `featured-surahs` cookie, so `page.tsx` reads it via
    `cookies()` and renders the real list in the initial HTML. `FeaturedSurahs`
    dropped `'use client'` and is now a plain server component. localStorage was
    deleted rather than kept beside the cookie — the #52-era cookie mirror had
    left it write-only, and two stores for one list can only drift. Cookie is
    user-writable → validated as untrusted input on read (non-integer,
    out-of-range outside 1..114, and duplicate ids dropped; dupes would repeat a
    card and collide on the React `key`). `page.tsx` was already `force-dynamic`,
    so `cookies()` costs nothing. Greptile: pass, 0 comments.
  - Lesson worth keeping: a client-side "correct it after mount" fix is a flash
    waiting to happen. If the server can know the value (cookie), render it server-side
    instead of animating around the swap.
- PR #49 (concordance derived-form filter chips) + PR #50 (alef-madda NFC fix,
  found+fixed live via phone testing; also fixed an unrelated App Router
  remount bug on `/dictionary/[root]`, see [[app-router-dynamic-route-remount-gotcha]])
  both merged 2026-07-24.
- **Russian translations (2026-07-24):** turns out NOT actually empty — Kuliev
  (6236 rows, translator "Elmir Kuliev") was already in the DB via
  `packages/scraper/tools/import_alqurancloud.py`, a phase-01/02 one-shot
  scaffold script pulling from `api.alquran.cloud` (not Tanzil/QuranEnc — its
  license/attribution has never been verified per CLAUDE.md §10/PRD §3.3).
  Added a second Russian translation on top: QuranEnc's "Rowwad Translation
  Center" (`russian_rwwad`, 6236 rows) via the existing `import-quranenc` CLI,
  properly licensed/attributed. **Neither is visible in the app yet** — no
  language switcher exists; the reader hardcodes English (`AyahView`/
  `getTranslationsByAyah` only ever called with `language_code: 'en'` anywhere
  in `apps/web/src`). User decided: keep both translations in the DB as-is,
  verify Kuliev's alquran.cloud licensing before a language-switcher feature
  ever makes it user-facing.
- Bookmarks-flash bug fix (#48): found this session (user report: opening
  /bookmarks briefly flashed "Surah 2 255"-style id-based names before
  correcting to real ones, "couldn't catch it, flashes and switches to normal").
  Root cause: `BookmarksView`'s effect treated an aborted `/api/surahs` fetch
  identically to a real failure — both hit the same `catch { setRows(buildRows()) }`,
  rendering id-based fallback names via the still-empty name map. React Strict
  Mode (dev only) double-invokes the mount effect (mount→cleanup→mount); the
  first request is always aborted by the cleanup, hits that catch, renders the
  flash — the second (surviving) request then resolves for real and corrects
  it. Fix: catch block now bails on `AbortError` without touching state (a
  fresh request already supersedes it); genuine failures (offline) still fall
  back to id-based names so bookmarks aren't dropped. Regression test
  reproduces the exact Strict Mode race (verified it fails pre-fix, passes
  post-fix). Greptile P2 (fake timers only restored after assertions succeeded,
  leaking into later tests on failure) — fixed by moving `vi.useRealTimers()`
  into the shared `afterEach`. Confirmed dev-only trigger (Strict Mode
  double-invoke never happens in prod builds), but underlying abort-vs-failure
  bug was real regardless of trigger.
- Segment-pill redesign + DET hidden (#47): DONE, merged, this session. User
  wanted individual-word-view fix (joined word, pills below) applied to wbw
  list/card views too: `SegmentPills` reworked so segments render as adjacent
  joined Arabic spans (correct letter-joining, no boxes) with POS labels in a
  separate flex-wrap pill row below — `SegmentedWord` (word-detail hero) now
  delegates to `SegmentPills` at `size="lg"` instead of duplicating the layout
  (this reverses part of #46's split, since both views converged back to the
  same treatment). Also: `posColor()` returns `null` for `DET` — corpus.quran.com's
  own wordbyword.jsp doesn't surface an assimilated determiner prefix as its
  own tag either (folded into the preposition's label) — so DET gets no pill
  and no syntax-column line at all (not just muted-gray; fully hidden), while
  its glyph still renders plain-colored as part of the joined word. Also
  small unrelated fix bundled in: wbw page's surah frame had no bottom margin,
  sat flush against the "<Surah> · word by word" caption — added `mb-3`.
  Greptile: pass (no comment findings). NOTE: mid-session, switching branches
  to build #48 on a clean `main` base caused the dev-server working tree to
  temporarily lose #47's uncommitted... no, *committed-but-unmerged* changes,
  which looked like a regression to the user twice (once before #47 merged,
  once after rebasing #48) — not a real revert, just branch-switch visibility;
  worth remembering that unmerged sibling PRs don't coexist in one working tree.
- Reader/word-detail UI polish (#46): DONE, merged. 4 fixes from user
  screenshots: (1) popover Arabic glyph no longer sits under the close button
  (text-4xl + pr-10); (2) Lane's Lexicon "/"-joined text (e.g. abandon/desert/quit)
  no longer overflows its card — break-words CSS + normalize_slash_spacing() at
  import, live DB's 1,386 root_definitions backfilled (633 changed); (3)
  SegmentedWord's SVG per-segment POS labels overlapped (positioned by glyph width,
  not label width) — rewrote to delegate to SegmentPills (same pill wbw list-view
  uses) at a new size="lg", SVG measurement code deleted; (4) `words.pos_tag` was
  the FIRST segment's POS (often a prefix, e.g. "EQ") instead of the STEM's ("V") for
  25.6% of words (19,797/77,429) — fixed both scraper paths (corpus_morphology.py +
  corpus_parser.py, the latter being the one that actually wrote live values) and
  backfilled words.pos_tag directly from word_segments (19,797→485 mismatches, the
  485 being genuine ambiguous double-stem compounds like مِمَّا, not a bug). Greptile:
  pass.
- Full Analysis grammar_note fix (#45): DONE, merged, this session. Word-detail page's
  "Full Analysis" collapsible had the SAME garbled `grammar_arabic` bug #44 fixed in the
  list view (case/verb-form term glued to spelled-out root letters) — #44 wrongly left
  it untouched assuming it was a different, correct use. `WordDetailView.tsx` now passes
  `word.grammar_note` (already selected by `getWordDetail`) to `FullAnalysis`, one line
  per `\n`-clause. `grammar_arabic` confirmed (grep) to have zero remaining UI consumers
  — left as-is, dormant, user's call. Greptile: pass.
  Recent chain: #48 (bookmarks-flash, open) → #47 (joined-word segments + DET
  hidden) → #46 (reader/word-detail UI polish) → #45 (Full Analysis fix) →
  #44 (grammar_note correct-source fix) → #43 (shrink morphology col) →
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
  "/"-spacing normalized 2026-07-23 (#46, 633/1386 rows changed) so unspaced
  "word/word/word" runs wrap instead of overflowing the card.
- `words.pos_tag`: fixed 2026-07-23 (#46) — was first-segment POS (often a prefix)
  for 19,797/77,429 words; backfilled from word_segments.stem. 485 words (genuine
  double-stem compounds, e.g. مِمَّا) keep a deterministic first-stem pick, not a bug.
  Backup: `quran.db.bak-preslashfix-20260723` (pre both this and the lexicon fix).
- `ru` (Russian) **translations**: 12472 rows now (Kuliev via alquran.cloud +
  Rowwad via QuranEnc, 6236 each) — see "Now" above. `ru` **per-word glosses**
  (`word_glosses`, distinct table from `translations`): still none.
- Concordance derived-form join (lemma text match): spiked across all 1,642
  roots with occurrences — 833 roots with >=1 unmatched occurrence, 49,968
  occurrences checked, 6,768 unmatched (13.5447%). Fallback (`form_id: null`,
  untagged under "All", excluded from every filter chip, never drops the row)
  covers the gap; no backfill needed. See `packages/scraper/tools/spike_form_lemma_alignment.py`.

## Jobs
- `scrape-word-details`: **DONE**. 77429/77429 checkpointed, no longer running. (Was
  78% per an older note in this file — finished since.)

## Housekeeping
- Untracked scratch sitting in the working tree, never committed/gitignored: this file,
  `docs/plans/phase-12-hamza-seat-fix.md`, `.superpowers/` (SDD task briefs/reports/
  review diffs, ~2.3M).
- **2026-07-24: dead branches cleaned up.** STATUS.md's prior "already merged via
  squash, safe to delete" claim was WRONG for 4 of them — verified via
  `git diff main...<branch> --stat` before touching anything, not trusted blind:
  - Deleted (confirmed zero diff vs `main`, local+remote): `phase-13-reader-typography`,
    `phase-13b-surah-wide-frame`, `feat/phase-06a-data-acquisition`,
    `feat/phase-06b-morphology-ui`, `feat/phase-06c-dictionary-ui`,
    `fix/csp-nonce-static-prerender`, `fix/scraper-retry-backoff`, plus remote-only
    `fix/dev-500-schema-migration`, `docs/phase-06-plans`, `docs/prd-v2-corpus-port`.
  - The 4 held back on 2026-07-24 as "real unmerged work" are now **resolved and
    deleted** (2026-07-27) — see below. **Zero branches remain** besides `main`.
- **2026-07-27: the last 7 branches deleted, local + remote, and 3 worktrees removed**
  (`.claude/worktrees/phase-14…`, `.claude/worktrees/phase-16…`,
  `.worktrees/drawer-menu-and-ayah-bookmarks`, all clean).
  All 7 had squash-merged PRs, which is *why* `git branch --no-merged` kept listing
  them — squash rewrites the hash, so git cannot tell. **`--no-merged` and
  `git diff main...<branch>` are both useless here**: three-dot diffs from an old
  merge-base show the branch's whole original diff whether or not `main` has the
  content. What actually works: `git log --since=<PR mergedAt> <branch>` for residual
  commits, then `git cat-file -e main:<path>` per file.
  - Fully landed, nothing lost: `drawer-menu-and-ayah-bookmarks` (#38),
    `fix/surah-frame-glyph-centering` (#37), `phase-09-perf-overhaul` (#19),
    `worktree-phase-14-wbw-list-view-verse-nav` (#40),
    `worktree-phase-16-wbw-segment-colors` (#42).
  - `feat/phase-06a-dict-parser-fix` — **obsolete**, see the parked-commit note below.
  - `phase-12-uzbek-wbw-glosses` — had 9 genuinely orphaned files, landed first in
    `chore(scraper): land the orphaned Uzbek alignment spike` (see "Now").
- Orphan commit chain ending at `18d9e7e` ("perf(web/search): one canonical search
  sheet; retire /search page", abandoned, never merged) was reachable via
  `phase-09-perf-overhaul`, now deleted → reflog-only for real this time, and
  garbage-collectable. Deliberate: the search sheet it proposed already shipped.
- ~~Parked commit `65a7a56`~~ — **RESOLVED 2026-07-27, was a false alarm the whole
  time.** Its fix ("parse number-word and comma totals in root pages") has been on
  `main` for a while: `_TOTAL_RE`, `_TOTAL_ONCE_RE` and the `_parse_count`
  comma-strip are byte-identical there, comment included, and `main`'s
  `test_corpus_dictionary.py` has every test the branch added plus one more. It
  landed via a later PR and nobody noticed, so the branch sat "parked" for 25 days.
  Only real difference was a `.gitignore` hunk adding `temp/` + `.worktrees/`, which
  `main` deliberately does *not* ignore. Branch deleted, Queue item dropped.

## Queue
1. Uz gloss gap (1890 words, all short function words) — in talks with Tasnim
   (user's contact) as of 2026-07-24; may not need the review_glosses.py path.
   The alignment spike that informs this (`uz_text.py`, `uz_align_eval.py`,
   `tools/uz_align_spike.py` + the go/no-go report) is now on `main` — it was
   stranded on a deleted branch until 2026-07-27.
2. `ru` per-word glosses (wbw translation, the `word_glosses` table — distinct
   from verse-level `translations`, which is done, see "Now" above) — user
   explicitly wants a human/reviewed source, same as the Uzbek approach via
   Tasnim, NOT raw NLLB machine-translation. Holding until that source exists.
   (`translate_glosses.py`/`mt.py`/`db.upsert_uz_gloss` are all Uzbek-hardcoded
   today — would need generalizing to a target-language param if/when an MT
   path for `ru` is ever wanted instead.)
3. Verify `api.alquran.cloud`/Kuliev licensing before any language-switcher
   feature ships (blocks Russian — and re-check the existing `en`/`uz`
   alquran.cloud-sourced rows from the same script too — same unverified-source
   gap may apply to those).
4. Build a translation-language switcher — both `ru` translations exist in the
   DB but are invisible in the app (reader hardcodes `en`).
5. Housekeeping above — branches are DONE (zero remain, 2026-07-27). Left: the
   untracked scratch (`.superpowers/`, `docs/plans/phase-12-hamza-seat-fix.md`),
   cosmetic, do whenever convenient.

## Notes
- Uzbek edition = Cyrillic (uz.sodik). Latin variant not done.
- Greptile: trial→free-plan transition already happened 2026-07-16 (50/mo cap) — watch
  usage against that cap going forward.
