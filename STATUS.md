# STATUS

Live scratch board. Caveman. Update as things move. Not governance (that = CLAUDE.md).
Drifts stale between sessions/accounts — verify anything below against `git log`/
`git merge-base --is-ancestor <c> main`/`gh pr list --state all` before trusting it.
(This file was found stale 2026-07-18: claimed phase-07b search "T11 pending" and
hamza-seat "ready to merge" when both had been merged for days, one iterated further
since. Full rewrite below reflects re-verified ground truth as of today.)

Updated: 2026-07-30

## Now
All work below confirmed via `gh pr list --state all` + `git merge-base --is-ancestor`,
not carried over from prior narrative.
- PRs #1–57 MERGED. **#58 CLOSED unmerged** (payload split, see below). **#59 MERGED**
  (`0095c2c`, 2026-07-28 19:01Z — CodeRabbit gate). **#60 MERGED** (phase 17).
  **#61 MERGED** (phase 18, `6113fd3`). **#62 MERGED** (`97d78bb`, sort_order
  invalidation). Current `main` tip `7c5b322`. Nothing open.
  **Commit SHAs before 2026-07-27 are all dead** — history was rewritten, see purge.
- **Phase 18 (930-root re-scrape) DONE + MERGED.** All six phase-17 carry items
  closed. **The 930-root crawl itself has been run** (see Phase 18 below) — nothing
  is pending there.
- **PR #63 (lemma pages + clickable frequency) OPEN, BLOCKED on CodeRabbit
  rate limit** as of 2026-07-30. Branch `feat/lemma-pages`, head `4b26c90`,
  14 commits off `main`. SDD-built (7 tasks, final opus review VERDICT ship,
  0 Critical/Important) + 4 local `/code-review` passes + CodeRabbit round.
  See its own section below. Not merged — gate not cleared.
- **#62's triggers are LIVE as of 2026-07-29.** `trg_roots_sort_order_ai` / `_au`
  installed by running `ScraperDatabase('~/quran-data/quran.db')` — schema.sql is all
  `IF NOT EXISTS`, so applying it is idempotent and needs no web-app restart. Live DB
  after: 1642 roots, 0 NULL ranks (installing a trigger does not fire it), integrity
  ok. Backup `~/quran-data/quran.db.bak-pre-trg-20260729` (`VACUUM INTO`, 99M).
  Firing verified on a throwaway copy, not live: a no-op respell
  (`SET root_arabic = root_arabic`) leaves 0 NULLs — the `WHEN` clause holds, so an
  idempotent 1642-root re-scrape keeps the cache; a real respell nulls all 1642; an
  INSERT nulls every pre-existing rank.
- **CodeRabbit is the gate as of #59.** Two lapse signatures learned the hard way,
  both now in CLAUDE.md §5: a quota-refused review posts a **green `success`** status
  reading `Review rate limited`, and a failed error-mode pre-merge check pins
  requested-changes with the reason buried in the walkthrough's collapsed block.
- **Next: the GitHub Support GC** (`~/quran-data/github-support-request.md`, still
  unsubmitted). Longest-lead blocker — the repo cannot go public until the
  pre-rewrite objects are gone, and branch protection (which is what would make §5
  enforceable rather than conventional) needs public.

### Phase 17 — single-form root_forms fix, DONE + MERGED (PR #60, `edea0a0`)

Cause: corpus.quran.com omits `<ul class="also">` when a root has exactly
one derived form — names it inline in prose instead. Old parser only read
the list → 712/1642 roots (43.4%) had zero `root_forms` rows. Fixed:
`_extract_forms(soup) or <prose fallback>`, fallback only fires when the
list is genuinely empty (structurally can't clobber a multi-form page).
Re-scraped all 712 zero-form roots against live corpus.quran.com (1.5s/req,
resumable checkpoint `dict_checkpoint_phase17.json`, separate from the main
one). Raw HTML snapshotted gzipped to `~/quran-data/.snapshots/roots/`
(one `.html.gz` per root, `.snapshots/` gitignored, outside repo in
practice — regenerable, referenced by nothing).
Result, re-verified live: **0 zero-form roots** (was 712), `1 form` bucket
= **712** exactly, no residue to explain. `ArD` → `('Noun', 'أَرْض', 461)`.
`FormFilterChips` needed no code change (already renders any non-empty
`forms`) — added a regression test pinning a single-form root still
renders its chip, so a future "optimize away the useless 1-option filter"
PR can't silently hide it. `/dictionary/ArD` spot-checked via curl: exactly
one chip, `Noun` / `أَرْض` / `461`.
Side effect surfaced by the re-scrape: **`roots.root_arabic` had
inter-letter spaces on 846 rows** (603 introduced by this phase's
re-scrape, 243 pre-existing from earlier scrapes) — e.g. `أ ر ض` instead
of `أرض`. New `scraper normalize-root-arabic` CLI command strips them;
ran once, live DB now has 0 rows with a space in `root_arabic`. For 58 of
those roots the corpus spelling *also* differs from ours in hamza seat —
kept deliberately (`ArD` stays `أرض`, not `ارض`), so hamza is inconsistent
across the table **by design**. Safe because `foldLetter` in
`packages/data/src/text/arabic.ts` folds hamza variants before sorting,
letter-bucket lookup, and search — the inconsistency is invisible to every
consumer that matters.
Web suite: 402 tests pass (401 + 1 new), `tsc --noEmit` clean, `eslint`
clean.

**Review rounds before merge.** `/code-review` raised 5 findings; 4 fixed
(`bdd7e7b`), 1 deferred. The two MEDIUMs were both in the new prose
fallback: reading translit+Arabic out of `soup.get_text()` lost the tag
boundary, so a multi-word translit (`banī isrāīl`) kept only its last token
and glued the rest onto the POS label, and the forward `.+?` match could
fabricate a form from an unrelated parenthesis later on the page. Fix reads
both from the `<i class="ab">` / `<span class="at">` tags like
`_extract_forms` already does; only the POS comes from text. Third MEDIUM:
snapshot filenames collided on case — Buckwalter separates roots by letter
case alone (t/T, d/D, s/S, z/Z, h/H, y/Y), 137 collision groups across 1642
roots, so on APFS/NTFS each group would silently collapse to one file.
Filenames now percent-encode everything outside `[a-z0-9-_.]`.
The `nwn` catch: the first structural fix derived the lead clause by
splitting the sentence on the translit, which breaks when the form translit
also appears in the root header (`root nūn wāw nūn ... as the noun nūn`) —
the split cut at the header and dropped the root's only form. **Every unit
test stayed green.** What caught it was re-parsing all 712 saved snapshots
old-parser vs new. Lead now walks `previous_siblings`. Post-fix the
712-snapshot diff is identical, so no already-scraped data needs re-parsing.
CodeRabbit: CHANGES_REQUESTED → 2 findings (rescrape command tested only its
no-op path; MD022 here) → fixed `61c244a` → **APPROVED**.
Final: 223 python tests, ruff 10 pre-existing / 0 new, mypy 1 pre-existing
(`mt.py:37`) / 0 new.

#### Carry into the 930-root re-scrape phase
All six closed by phase 18 below.
1. **No snapshot replay path.** Snapshots are written but nothing reads
   them, so the next parser fix still costs a live re-fetch — exactly what
   phase 17 paid. CLAUDE.md §11 wants "re-parsing never requires
   re-scraping"; only the write half exists. Deferred `/code-review`
   finding.
2. **Resume skips done roots BEFORE the snapshot write**, so turning
   `--snapshot-dir` on mid-run yields a partial archive with no signal it is
   incomplete. Archive today holds 712 of 1642.
3. **Filename encoding changed in this PR.** The 712 snapshots already on
   disk keep their old names; any key with an uppercase letter gets
   rewritten under a new name and leaves an orphan. Re-encode or wipe
   `~/quran-data/.snapshots/roots` before the re-scrape.
4. **`lane.py` `import-lane` reverts all 74 hamza seats and zeroes every
   root's `occurrence_count`.** Fix before any re-import.
5. `cli.py` `rescrape-formless-roots --checkpoint` still defaults to the
   main `dict_checkpoint.json`; phase 17 passed the phase-specific one
   explicitly. Easy footgun.
6. Per the 2026-07-28 ruling, `root_arabic` hamza seats get levelled **up**
   during this re-scrape (930 roots), never folded down.

### Phase 18 — 930-root re-scrape, DONE + MERGED (PR #61, `6113fd3`)

Branch `feat/phase-18-remaining-roots` off `edea0a0`… (`1c4d1e8`). Six
commits, SDD run, every task reviewed clean on the first round.
Squash-merged 2026-07-28T10:43Z; branch deleted.

**Code (tasks 1–4).** `migrate-snapshot-names` re-encodes pre-`bdd7e7b`
filenames (carry 3). `reparse-snapshots` + `scraper/replay.py` re-parse the
archive with no network reachable from the import chain (carry 1).
`has_snapshot` joins the resume condition, so a done-but-unarchived root is
fetched exactly once (carry 2). `delete_root_forms` before each re-insert
kills the stale-tail bug `ON CONFLICT(root_id, sort_order)` left behind.
`get_or_create_root` gives `lane.py` a creation-only path so `import-lane`
can no longer clobber scraped spellings or zero `occurrence_count` — the
dictionary scrape stays the authority via `upsert_root` (carry 4).
`rescrape-formless-roots --checkpoint` is now `required=True` (carry 5).
245 python tests (223 + 22 new), ruff 10 pre-existing / 0 new, mypy 1
pre-existing / 0 new.

**Live differential before crawling (task 5).** 348 legacy filenames
renamed, archive count held at 712, second run a no-op. Then all 712
snapshots replayed into a copy of the live DB and diffed: **0 root rows
differing, 0 form rows only-in-live, 0 only-in-replay, 0 differing.** The
replay path reproduces the scrape exactly — the same technique that caught
`root_nwn` in phase 17. Backup: `~/quran-data/quran.db.bak-phase18-20260728`
(`VACUUM INTO`, integrity ok), checkpoint backup
`dict_checkpoint.json.pre-phase18-20260728`.

**Live crawl (task 6).** 930 roots at `--rate-limit 1.5` in three
foreground `timeout 540` chunks, ~24 min. **Archive 712 → 1642 — every root
in the corpus is now snapshotted**, so no future parser fix needs the
network.

Result, all acceptance criteria met:
- **`root_arabic` changed on exactly 61 roots, all bare alif → hamza seat**
  (`ا` → `أ`), asserted programmatically: 0 level-downs, 0 length changes,
  0 unexpected substitutions (carry 6). Bare-alif roots remaining: **0** —
  in root notation alif is always a seat, never a radical.
- `occurrence_count` changed on **0** roots; mismatches vs
  `COUNT(word_segments.root)` = **0**. The re-scrape did not undo
  `fix-root-data`; corpus page totals agree with our derived counts.
- Form counts changed on **0** roots. Roots with 0 forms: **0**. Roots with
  a space in `root_arabic`: **0**. No new roots appeared.
- Five levelled-up roots spot-checked against live pages (`Alh` `Ajr` `Akl`
  `qrA` `sAl`) — every seat matches the page header, spaces stripped as
  required.
- Web 403 tests pass, data 176 pass, `tsc --noEmit` clean. (Phase 17's note
  said 402; 403 is the current count and this branch touches no web code.)
  `foldLetter` still folds hamza variants, so the 61 spelling changes are
  invisible to sorting, bucket lookup, and search.

Deferred minors, **still open after merge** (verified 2026-07-28):
`_ONE_FORM_HTML` byte-duplicated in `test_dictionary_scrape.py` and
`test_replay.py`; redundant local re-imports in `test_lane.py`. Cosmetic.

Two plan defects were caught by reviewing subagents and fixed in the plan:
the ruff baseline needed its scope pinned (`scraper tests` = 10, `.` = 12),
and a snapshot filename literal was wrong (`_encode_key` escapes **every**
uppercase letter, so `root_ArD` → `root_%41r%44`, not `root_%41rD`).

**One finding was deferred out of #61 rather than fixed: finding 6,
`roots.sort_order` invalidation.** That is #62 below.

### #62 — `roots.sort_order` cache invalidation, APPROVED, NOT merged

Branch `fix/root-sort-order-invalidation` off `6113fd3`. Three commits
(`5df0700`, `e004162`, `7edac44`). Cross-package: TS cache + Python writers.

**The bug.** `roots.sort_order` is a materialized hijāʾī rank, and
`backfillRootSortOrder` had **zero production callers** while
`upsert_root` / `get_or_create_root` insert and respell roots freely.
`getRootNeighbors` navigates with `sort_order < ?` / `> ?`, and **SQL
comparison silently skips NULLs** — so one NULL rank among live ones is
*worse* than an all-NULL column: that root's own arrows degrade correctly
to the full sort, but every other root's arrows step clean over it. No
error, no log. That is why the invalidation nulls the **whole** column.

**Fix.** Two triggers in `packages/data/schema.sql`, not a call per writer
— the writers are in two languages plus manual `sqlite3` sessions, and an
invalidation binding only the writers who remembered it is the bug itself.
The scraper re-applies `schema.sql` on every `ScraperDatabase.__init__`, so
they self-install before any scrape write. Two load-bearing details:
`WHEN NEW.root_arabic <> OLD.root_arabic` (bare `UPDATE OF` fires when the
column is merely *listed* in SET, and `upsert_root`'s `ON CONFLICT DO
UPDATE` always lists it → an idempotent 1642-root re-scrape would discard
the cache every row), and `WHERE sort_order IS NOT NULL` in the body (every
firing after the first is an indexed no-op). No DELETE trigger — a rank gap
is harmless. `backfillRootSortOrderIfStale` rebuilds on web cold start.

**Preventive, not a repair.** Live ranks were already correct — 0/1642
mismatched vs `compareRootsArabic` — so no manual live-DB step is needed.
Dry-run on a *copy* of the real DB: triggers self-install on connect, an
idempotent re-scrape preserves all 1642 ranks, one respelling drops the
cache to 0.

**Review.** `/code-review` found 3, all real, and the sharpest was
self-inflicted: putting the backfill on an automatic path against the file
the scraper writes, while its read and write were two statements,
**reintroduced the exact bug the PR fixes** (insert lands between them →
trigger fires against an already-NULL column, a no-op → row missed by the
stale snapshot → one NULL stranded, no trigger left to fire). Now one
`db.transaction('write')`. Also: the self-heal was inert under
`DB_SKIP_MIGRATIONS=true` (it depends on the trigger DDL that flag skips —
the `normalizeLemmaMadda` analogy I reasoned from is invalid, that one is
pure data), and an unguarded `await` in the memoized init would have let a
`SQLITE_BUSY` warm-up 500 every SSR page.
CodeRabbit: 5 findings, all 🔵 Trivial → 4 taken (`tx.batch` for the
~1642 UPDATEs, `newFileDb()` for the last `file::memory:` test, an
init-continued assertion, a `ranked_db` pytest fixture that closes in a
`finally`), **1 declined** — timing metrics with no metrics sink to emit
to; rationale in the `7edac44` body and on the resolved thread → **APPROVED**.

**Mutation-checked**, since these tests assert an *absence*: dropping the
`WHEN` guard, nulling only the touched row, deleting either trigger, and
reverting the transaction to a two-step read/write each kill their own
named test (the race test 5 runs out of 5, deterministic).
Gate: 185 data / 404 web / 262 scraper; ruff 10 / mypy 1 unchanged.

Test-only gotcha worth keeping: libsql opens `file::memory:` **per
connection**, so anything touching a transaction needs a file-backed temp
DB or the transaction sees an empty database.

### PR #63 — lemma pages + clickable frequency, OPEN, BLOCKED on rate limit

Branch `feat/lemma-pages` off `main`. 14 commits, head `4b26c90`. Makes
`/dictionary/lemma-frequency` + `/dictionary/verb-concordance` rows clickable
→ new per-lemma page `/dictionary/lemma/[lemma_buckwalter]` (header, top gloss,
root's Lane's Lexicon def with up-link — omitted for 175 rootless lemmas,
paged concordance). Row count == destination total (kept promise:
reviewer ran live DB, 0 divergent verb buckets, 0 multi-root lemmas).

**Built via SDD** (user's pick): 7 tasks, fresh subagent each, task review each,
final whole-branch review on opus → **VERDICT ship, 0 Critical/Important**.
Ledger: `.superpowers/sdd/2026-07-29-lemma-pages/progress.md`.

**Then 4 local `/code-review` passes** (commits `7d29158` `fdd0e75` `a6a05d2`
`d8d31a1` `72decc6`). The run-1 find was CRITICAL and real: the Buckwalter
charset regex (supplied verbatim by the plan, checked against nothing, stubbed
away in route tests) **omitted digits + `^ # , . @ [ ] _`** → ~280 lemmas
would 400. Fix = single shared validator `packages/data/src/text/buckwalter.ts`
(charset re-derived from live DB, 0 rejected), caps `LEMMA_BUCKWALTER_MAX=32` /
`ROOT_BUCKWALTER_MAX=24`, both routes call it, tests use `importActual` so the
real validator runs. Other passes: DRY'd the verse-rebuild into
`buildVerseWordsByAyah` (root concordance now shares it, ~30 dup lines gone),
one shared `CONCORDANCE_PAGE_SIZE`, whole-row links, deterministic root-def
(`ORDER BY rd.source LIMIT 1`, matches root page), dropped a redundant count.

**CodeRabbit round:** 6 inline findings on `72decc6`/`08ea720`, all ✅ addressed.
`08ea720` = the fix commit; `4b26c90` = last Trivial (typed the root-route mocks
from the real query signatures, `vi.fn<typeof fn>` + `vi.hoisted` for the TDZ).

🔴 **GATE NOT CLEARED — CodeRabbit rate-limited** (verified 2026-07-30 via API):
latest review is **CHANGES_REQUESTED @ `08ea720`** (06:26Z); **no review exists
for head `4b26c90`**. Walkthrough (06:11Z push) reads *"Review limit reached —
Next review available in: 28 minutes."* Per CLAUDE.md §5 a rate-limited review
is **blocked, never passed** — indistinguishable from a pass unless the body is
read, which it was. `mergeable_state: clean` and any green commit-status are the
misleading signals §5 warns about; the **review decision** governs and it is
stale-CHANGES_REQUESTED.
**To clear (the 3-step dance from #62):** wait for quota → comment
`@coderabbitai full review` so it submits a **superseding APPROVED for
`4b26c90`** (GitHub pins `reviewDecision` to the last *submitted* review; a clean
incremental pass submits none and won't move it) → confirm APPROVED on the head
SHA → merge. No code changes pending.
Local gate on `4b26c90` fully green: type-check data+web clean, lint clean,
**data 198/198, web 414/414** (`roots.test.ts` file-level EPERM = pre-existing
Windows afterAll teardown, not a test failure).

### GOING PUBLIC — in progress, BLOCKED (2026-07-27)
Decision: repo goes public, review bot switches Greptile → CodeRabbit.

- **`temp/` PURGED from all history.** Was 98 MB of third-party proprietary
  material: islom.uz APK (22 MB, embeds a live SQLCipher key), its encrypted
  `database.db`, `TasnimDatabase.db`, `hilol.zip`, an iOS extract, `.so` binaries,
  mixed-provenance fonts. Publishing = redistributing two commercial apps + a
  decryption credential. `git filter-repo --path temp/ --invert-paths`, force-pushed
  **while still private** (order matters — rewriting after going public would expose
  the objects permanently).
  `.git` 117 MB → 2.0 MB. 291 → 241 commits (50 were upload-only). Verified: 0
  commits contain the key, 0 touch `temp/`, no blob > 2 MB.
- **Nothing lost.** Reference data → `~/quran-data/refdata/` (98 MB). Spike code →
  `~/quran-data/spike/` + README. Verified backup bundle →
  `~/quran-data/qcp-backup-20260727-183938.bundle` ("records a complete history").
- 🔴 **BLOCKER — do NOT flip visibility.** GitHub still serves the pre-rewrite blobs
  by SHA, and **all 58 PR timelines still list those SHAs**, so the purged key is
  discoverable, not merely guessable:
  ```
  gh api "repos/J3ff4/quran-corpus-pwa/contents/temp/split_config.arm64_v8a.apk?ref=8ce09b6" --jq .size
  → 23257744
  ```
  Only GitHub Support can GC it. Request drafted:
  `~/quran-data/github-support-request.md` — ends with the two commands that must
  BOTH 404 before visibility changes.
- Also unlocked by going public: **branch protection**, unavailable on free private
  repos (403 "Upgrade to GitHub Pro or make this repository public"). Until then
  §5 is convention, not a mechanical block.
- Fonts: user's call — **no attribution needed**, do not re-raise.

### Review gate: CodeRabbit (#59, OPEN)
Greptile blew its 50/mo free cap **mid-review** on #58 → 0 check-runs on the fixed
head. A quota-limited reviewer **fails open**; silence looked like a pass. Switched.
Greptile stays installed as advisory (user's call), no longer gates.
- **No N/5 score exists.** Gate = `reviewDecision` (APPROVED/CHANGES_REQUESTED) +
  **pre-merge checks** (`error` blocks, `warning` annotates).
- `.coderabbit.yaml` points `knowledge_base` at CLAUDE.md → **rules added there are
  enforced by the bot.** Keep the two in sync.
- All these default to fail-open and are now set: `fail_commit_status: true`,
  `auto_pause_after_reviewed_commits: 0` (default 5 stops reviewing *fix* commits),
  `override_requested_reviewers_only: true` (else the author self-grants an override).
- **Clearing a CHANGES_REQUESTED takes three steps** (learned on #62, 2026-07-28).
  Pushing fixes is not enough and neither is resolving threads:
  1. Push the fix. CodeRabbit re-reviews and **auto-resolves what it considers
     addressed** — but a clean incremental pass submits **no new review**, so
     `reviewDecision` does not move. Check-run `SUCCESS` + no new review = clean,
     and it looks *identical* to "nothing ran". Verify the head SHA.
  2. A thread you **declined** stays unresolved and holds the decision alone.
     Reply with the rationale, then resolve via the GraphQL `resolveReviewThread`
     mutation — `gh pr` has no command for it.
  3. Even with every thread resolved `reviewDecision` stays put: GitHub pins the
     last *submitted review* state. Comment `@coderabbitai full review` to make it
     submit a superseding APPROVED.
  `reviewDecision`, `mergeStateStatus` and the unresolved-thread count disagree
  with each other constantly — check all three.
- CLAUDE.md §5 rewritten. New rule: **0 check-runs is a lapse signature, not a pass.**
  "Unlimited repos/PRs" is a *volume* cap, not a *rate* cap — public OSS reviews are
  still rate-limited hourly, so this rule survives going public.
- **#59 still CHANGES_REQUESTED. 1 real finding open:** *"Make these checks
  blocking"* — wants `docstrings` / `issue_assessment` / *New logic ships with tests*
  moved `warning` → `error`. **User decision:** `error` on docstrings at 80% would
  block a docs-only PR. The other unresolved thread is already fixed in `a4f9bbf`,
  just not marked resolved.
- CodeRabbit's first outing caught a fail-open **in the config written to prevent
  fail-open**. Good signal for the switch.

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
- `roots`: 1642 rows. Verified live 2026-07-28 — `sort_order` ranked on all 1642
  (0 NULL, 0 mismatched vs `compareRootsArabic`), 0 rows with a space in
  `root_arabic`, and **0 `trg_roots_sort_order_*` triggers installed**: they
  arrive with #62, which is unmerged. Until then nothing invalidates that cache,
  so any scrape or `import-lane` run before #62 lands leaves stale ranks that
  *look* healthy. Every root is snapshotted (1642 `.html.gz` in
  `~/quran-data/.snapshots/roots/`), so no parser fix needs the network again.
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
- ~~Untracked scratch: this file, the phase-12 plan, `.superpowers/`~~ — **two of
  the three were wrong, corrected 2026-07-28.** `git status` says: **STATUS.md is
  tracked and in `main`** (last written by `6113fd3`), and **`.superpowers/` is
  gitignored** (`.gitignore:62`). Only `docs/plans/phase-12-hamza-seat-fix.md` is
  genuinely untracked-and-unignored. Checked with `git cat-file -e main:<path>`
  and `git check-ignore -v`, not by reading this file's own prior claim.
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
  Only real difference was a `.gitignore` hunk for `temp/` + `.worktrees/`, which
  `main` already covers. Branch deleted, Queue item dropped.
- **`.gitignore` has ignored `temp/` since PR #9 (`7f515b1`) — the 98 MB got in
  anyway.** Every one of those commits is titled "Add files via upload", i.e. dragged
  into GitHub's web UI, **which does not honour `.gitignore`**. Nothing was
  misconfigured and no rule was missing; the browser upload path simply bypasses the
  check. Worth knowing before assuming an ignore rule protects anything.

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
5. **Going public — next actions, in order:**
   a. Decide the #59 blocking-mode question (warning → error?), land #59.
   b. Submit `~/quran-data/github-support-request.md`; wait for GC confirmation.
   c. Re-run the two verification commands — BOTH must 404.
   d. Only then flip visibility.
   e. After public: enable branch protection (free once public) requiring the
      CodeRabbit check, or §5 stays convention-only.
6. Housekeeping — branches DONE (zero remain, 2026-07-27). Left: one genuinely
   untracked file, `docs/plans/phase-12-hamza-seat-fix.md` (cosmetic; the other
   two in the old claim were tracked/ignored all along — see Housekeeping).
   Plus `fix/root-sort-order-invalidation`, alive on purpose until #62 merges.
7. **#62 merge decision** — APPROVED and green, unmerged pending the user's call.
   Note the approval is **advisory**: branch protection needs a public repo (5e),
   so nothing mechanically enforces §5 yet.
8. Phase 18's deferred cosmetic minors, still open: `_ONE_FORM_HTML` duplicated
   across `test_dictionary_scrape.py` / `test_replay.py`, local re-imports in
   `test_lane.py`.
9. **PR #63 (lemma pages) — clear the CodeRabbit gate + merge.** Blocked only on
   the rate limit (all findings addressed). Steps: wait for quota →
   `@coderabbitai full review` → confirm APPROVED on head `4b26c90` → merge.
   See the #63 section above. No code work left.

## Notes
- Uzbek edition = Cyrillic (uz.sodik). Latin variant not done.
- Greptile: DEMOTED to advisory 2026-07-27 (see "Review gate" above). Free plan
  50/mo cap, blown mid-review on #58 — that fail-open is why it no longer gates.
