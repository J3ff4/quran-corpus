# STATUS

Live scratch board. Caveman. Update as things move. Not governance (that = CLAUDE.md).
Drifts stale between sessions/accounts — verify anything below against `git log`/
`git merge-base --is-ancestor <c> main`/`gh pr list --state all` before trusting it.
(This file was found stale 2026-07-18: claimed phase-07b search "T11 pending" and
hamza-seat "ready to merge" when both had been merged for days, one iterated further
since. Full rewrite below reflects re-verified ground truth as of today.)

Updated: 2026-08-04

## Now
Evidence differs per claim; none of it is carried over from prior narrative.
- Merge state, merge SHAs, timestamps, open/closed: `gh pr list --state all` and
  `gh pr view <n> --json mergedAt,mergeCommit`, cross-checked with
  `git merge-base --is-ancestor`.
- Review rounds, verdicts, the reviewed head SHA: `gh api
  repos/.../pulls/<n>/reviews` (`state` + `commit_id`), plus
  `/commits/<sha>/status` for the run itself — where the *description* is read,
  not the colour (§5).
- **Pre-merge check results are not GitHub check runs.** `/commits/<sha>/status`
  returns one `CodeRabbit` context and nothing else, so it can neither confirm
  nor deny them. They live only in the check table inside CodeRabbit's
  walkthrough comment (`gh api repos/.../issues/<n>/comments`), which is
  editable and re-targeted every round — a snapshot of what it said at a named
  SHA, not an immutable artifact. Quote it as such.
- Branch deletion: `git ls-remote --heads origin` — absence of the ref, not the
  PR timeline.
- Gate results (type-check, lint, test counts): **local runs only.** This repo
  has no CI workflow, so no immutable record of them exists anywhere — not in
  the commit status, not in check runs. A gate line here is a transcript
  claim tied to a SHA and a date, and that is its ceiling; re-run rather than
  trust it. Never infer these from GitHub metadata, which does not carry them.
- "Nothing open" means no **open GitHub PR**, per `gh pr list --state open`. It
  says nothing about unmerged local branches, which are listed separately.
- **IN REVIEW 2026-08-04: `perseus-lane` demoted below `corpus-forms` in
  `DEFINITION_SOURCE_RANK`** — **PR #72 open**, branch
  `fix/demote-perseus-lane-below-corpus-forms`. Phase 21's
  extractor takes Lane's leading form-I block — a past-tense verb sense — and
  **175 of the 217** imported rows open with He/It/She/They (re-measured against
  the live DB; the first draft of the comment said 179, which does not
  reproduce). The Quran often uses those roots nominally, so بين ships as "It a
  thing became separated, severed, disunited, or cut off" where its
  `corpus-forms` gloss says "to make clear". **134 roots carry both sources** and
  are fixed by the rank swap; the remaining **83 perseus-only + 18 with no
  definition = the 101 targets of phase 22** — صبع ("He pointed at him … with his
  finger") is one of those 83 and is *not* fixed here. Curated `lane` /
  `qurandev-lane` stay at rank 0. The `/about` corpus credit was reworded in the
  same change: it claimed the corpus glosses show "where Lane has no entry",
  false for the 134 once they lead (§11). `/code-review` ran and found 4 issues —
  all four fixed, the ranking test now carries a third `qurandev-lane` row so its
  expected order disagrees with plain alphabetical (mutation-checked: deleting
  the `CASE` fails 3 tests). Gates local, 2026-08-04: lint ✓, type-check ✓,
  478 web tests + 57 data tests ✓.
  - **§5 CodeRabbit: `CHANGES_REQUESTED` on `e38c936`**, 06:43:15Z. Pre-merge
    table read, not inferred — **9/9 passed**, so no `mode: error` check is
    hiding in the walkthrough; the verdict comes purely from 8 inline findings.
    **All 8 are on `docs/plans/phase-22-…md` and `STATUS.md`; zero on the code
    change** (`roots.ts`, `roots.test.ts`, `about/page.tsx` drew none). Three
    Major: an order-dependent `<div2>` regex that fails by matching nothing, a
    completeness gate that only rejects an *empty* index (truncation is this
    source's normal failure), and a Step 7 smoke check ordering by `d.source`
    (alphabetical) which cannot prove which gloss leads. All 8 addressed in the
    fourth commit. **Note: CodeRabbit's ESLint tool errored** (`/tsconfig.json`
    missing at repo root), so its lint-based pass did not run on this PR —
    narrows coverage, not a failure signature.
  - **Four rounds, 15 findings, all addressed — "addressed", not "fixed": a
    commit that answers a finding is not the same as a re-review confirming the
    head is clean, and this PR has now proved that twice.** `e38c936` → 8; `c9d5d9b` → 2 more
    (the coverage table's `211 / 217` is the whole perseus cohort, not the 101
    import targets — now spelled out as `96 / 101 = 81 / 83 + 15 / 18`,
    re-measured; and the `18 → 3` empty-root criterion counted definitions
    without checking `source='salmone'`, which a partial import satisfies);
    `01d746d` → 1 more (a hard-coded `/home/claude/...` in a mutation-check,
    now `git rev-parse --show-toplevel`); `0d1cee1` → 4 more, of which 3 taken
    and 1 answered as a false positive (see below).
  - **Round 4 on `0d1cee1`, 10:25:30Z, `CHANGES_REQUESTED` again.** Taken: the
    mutation-check backup now uses `mktemp` + an `EXIT` trap instead of a fixed
    `/tmp` path (a Task 3 implementer was killed by an API session limit between
    flip and restore that same morning and left the mutation in the tree — the
    finding described a hazard that had already fired); Task 3's Step 4 said
    "5 tests" for a block holding 8; and this ledger's "all fixed" became
    "addressed". **Answered, not taken:** the Major on plan line 16 asked the
    plan to *reference* CLAUDE.md §4 rather than duplicate the six-step loop —
    line 16 already is a one-line reference by section number (`CLAUDE.md §4:
    every task runs the 6-step loop`), and duplicates none of the six steps.
    Replied to the bot with that reading rather than dismissing it silently.
  - **Execution found a plan defect no reviewer had:** the Task 4 code block's
    `_IRREGULAR_PAST` omitted `stung`, so the plan's own Step 3 implementation
    failed the plan's own Step 1 test (`is_verb_sense("Stung ( mosquito ).")`).
    Caught by the Task 4 implementer running the literal brief code. Fixed in
    the plan text, not only in the implementation, so the two do not diverge.
  - **The commit status went green — `success`, description `Review completed` —
    while the review object was still `CHANGES_REQUESTED`.** Not the rate-limit
    signature (that reads `Review rate limited`); the review genuinely ran and
    genuinely wanted changes. Third distinct way this gate looks passed when it
    is not: read the review verdict, not just the status.
  - **§5 PASSED 2026-08-04 10:34:49Z on head `7cb176d`** — `APPROVED` review
    object with an empty body, pre-merge table read at **9/9 passed**, status
    description `Review completed` (not `Review rate limited`). Verified as
    three separate reads — review state, check table, status description —
    because this PR produced all three of the gate's known fail-open
    signatures. No unresolved findings. **Not merged: that is the user's
    call and has not been given.**
- **IN PROGRESS 2026-08-04: phase 22, Salmoné form-keyed glosses** — branch
  `feat/phase-22-salmone-glosses`, pushed 2026-08-04. **PR #73, DRAFT, base
  `main`.** Draft on purpose: Task 7's gate is uncleared and Task 8 does not
  exist, so nothing here is mergeable. `.coderabbit.yaml` sets `drafts: true`,
  so the §5 gate still reviews a draft — **§5 has NOT passed on this branch
  yet.**
  - **NEW §5 FAIL-OPEN SIGNATURE, found here 2026-08-04 — a stacked PR is
    skipped entirely, with a green status.** #73 was first opened against #72's
    branch (`fix/demote-perseus-lane-below-corpus-forms`) so the diff would show
    phase 22 only. CodeRabbit posted state `success`, description
    **`Review skipped: reviews are disabled for this base branch`**, zero
    check-runs, zero review objects — and never reviewed. `.coderabbit.yaml`
    sets no `base_branches`, so the default applies: only PRs targeting the
    *default* branch are reviewed. Held for 7 polls over 3½ min; it never
    starts. Fixed by retargeting to `main`
    (`gh api -X PATCH .../pulls/73 -f base=main`; `gh pr edit --base` fails on
    an unrelated Projects-classic GraphQL deprecation). Adding `base_branches`
    to `.coderabbit.yaml` was **rejected as barred by §5** — a gate change may
    never ride with the work that benefits from it. Cost: #72's seven
    already-gated plan commits re-entered the diff, 8 → 18 commits.
    **§5 documents only two fail-open signatures and should gain this third
    one — proposed as its own change, deliberately not in this PR.**
  Run under subagent-driven development, fresh implementer +
  independent task review per task. Tasks 1-6 complete and reviewed:
  `ca27a32` skeleton keys, `bfd5b3d` gloss extraction, `9f6df7b` the Salmoné
  source module, `6581955` POS-filtered sense selection, `7aa0e18` + `77963af`
  the review-TSV prep tool, `36db197` the `fetch-salmone` CLI command. 432
  scraper tests pass; ruff clean on every file phase 22 touched; mypy at its
  2-error pre-existing baseline.
  - **§4 step 3 `/code-review` ran 2026-08-04 on the whole branch** — the one
    loop step phase 22 had skipped until then. 5 findings (4 Medium, 1 Low),
    all re-measured against the real `salmone.xml` before any fix was
    dispatched, all fixed in `bdf2019`: (1) `entry_senses` never called
    `html.unescape`, so 119 entries — **4 of the 101 live target rows** —
    carried `&amp;c.` through to the root card; (2) `_LEADING_GRAM` cut only
    the first of Salmoné's stacked government notes (13 entries); (3)
    `build_index` keyed spaced headings verbatim, leaving 16 lead tokens
    unreachable — `lookup("wqY")` missed though وقي is one of the commonest
    Quranic roots; (4) the cross-reference filter ran only on the
    `prefer_nominal` branch, so a verb-dominant root could be glossed with a
    bare "see supra." pointer (106 entries); (5) an unreachable
    `member is None` guard in `download_salmone`. **`EXPECTED_ROOTS`
    re-measured 6351 → 6365** — it is the truncation gate, so it was
    re-derived with `build_index(expected=None)`, not adjusted by hand.
    Findings 2-4 changed **no** row in this phase's target set; only finding 1
    did. Bucket counts are unchanged after the fix (40 kept / 51 unmatched /
    10 not in Salmoné), so the gate's review set is the same size — but the
    TSVs were regenerated and the 4 entity rows are now clean.
  - **§5 CodeRabbit gate, round 1 on `58c01e9` (2026-08-04 17:06Z):**
    `CHANGES_REQUESTED`, status `success | Review completed` — a real review,
    the skip cleared by the retarget. 1 Major + 1 nitpick, both fixed in
    `2dbee46`. The Major: `build_rows`' TSV-delimiter guard covered `key` and
    `gloss` but not `bw`, which is column one of both files. The nitpick asked
    the plan's constraints block to point at CLAUDE.md §4 rather than restate
    it — taken, but **not** with the bot's verbatim text, which drops "step 3
    is user-triggered"; that is exactly what went unnoticed on this phase, so
    the line keeps it, and the thread carries the reasoning.
    **Pre-merge checks were ✅ 4 / ❌ 5, and 4 of the failures were
    `❓ Inconclusive — "Repository clone failed"`** (No Secrets Or Credentials,
    No Duplicated Data Logic, Client Bundle Stays Clean, New Logic Ships With
    Tests). Inconclusive is not a pass: the four substantive checks never ran
    with code access. Re-requested citing that explicitly.
  - **§5 round 2 on `2dbee46` (2026-08-04 17:20Z):** `CHANGES_REQUESTED`
    again — **but the four inconclusive checks re-ran and passed, so the table
    is now ✅ 8 / ❌ 1**, the one failure being the codebase-wide
    `Docstring Coverage` warning that no per-PR change moves. 3 Major +
    1 Minor, all fixed in this commit:
    (1) the round-1 `bw` guard sat *after* `lookup`/`select_sense`, so both
    early exits still put an unvalidated root into `quarantined` → the review
    TSV — moved to the first statement in the loop, with a test per exit;
    (2) `download_salmone` gave every writer the same `salmone.xml.part`, so
    two `--force` runs could publish a half-written file under the final name
    — now `tempfile.mkstemp` per call, cleaned up on failure;
    (3) `build_index` validated the source on key **count** alone, which is
    the "never verify by row count" rule this repo already carries — added
    `ANCHORS`, four roots whose entry text must still contain a literal
    excerpt, verified against the pinned artefact (real file: 6365 keys, all
    four anchors hold);
    (4) this ledger's `Updated:` date and PR state were stale.
    Each new guard was checked non-vacuous by reverting it and watching the
    test fail. 436 scraper tests pass (was 433).
  - **§5 GATE PASSED on `7f880ed` (2026-08-04 17:36:47Z).** `APPROVED` review
    object carrying `commit_id=7f880ed`, 6/6 threads resolved, pre-merge checks
    **✅ 8 / ❌ 1** — the one failure the codebase-wide `Docstring Coverage`
    warning that no per-PR change moves. CodeRabbit re-read the code rather
    than the replies: its last thread reply shows it running `git show 7f880ed`
    and `rg` over `download_salmone` before confirming, and each of the four
    findings got an explicit `<review_comment_addressed>`.
  - **FOURTH §5 FAIL-OPEN SIGNATURE — inverted this time: a green
    `Review rate limited` status sat on an APPROVED head.** Pushing `7f880ed`
    auto-triggered the incremental review, which approved at 17:36:47. The
    `@coderabbitai full review` comment posted **8 seconds later** was a
    redundant *second* request; it was refused for quota, and the refusal
    overwrote the commit status. So the status description read the signature
    for "never ran" while the review had in fact just passed. Reading the
    status alone would have called a genuine pass a lapse — the exact inverse
    of the known signature. **Lesson: a push already triggers a review; only
    re-request when the head has no review object.** Disambiguate on
    `reviews[].commit_id` plus `<review_comment_addressed>` replies, never on
    the status alone.
  - **Task 8 code half done, `d70e02b` + `54b02b3` + `63c0c72`.** Rank, label
    and credit only: `DEFINITION_SOURCE_RANK` gains `WHEN 'salmone' THEN 1`
    (curated Lane 0 stays above; `corpus-forms` and `perseus-lane` drop to 2/3),
    the source-label map gains the Salmoné name, and the About page gains its
    credit while the Perseus entry now names both works it supplies. **Steps 6-8
    — the live-DB import, the alignment verification and the browser smoke —
    were NOT run:** they need Task 7's sign-off and explicit permission to write
    `~/quran-data/quran.db`. Nothing was imported; the DB was not opened.
  - The task review caught a vacuous test **that my own task brief specified**:
    "keeps curated Lane above Salmoné" passed with `WHEN 'salmone' THEN 1`
    deleted, because curated Lane is rank 0 and an unmapped source falls to the
    `ELSE` arm, so the assertion held either way. `54b02b3` adds `corpus-forms`
    to pin the lower edge, and both new cases now fail with the branch removed.
    A brief that dictates test code can hand the implementer a vacuous
    assertion; mutation-check the brief's tests, not just the written ones.
  - **§5 round on `54b02b3`: CHANGES_REQUESTED, 3 findings + 1 failing
    `mode: error` pre-merge check** (`New Logic Ships With Tests` —
    `prepare_salmone_glosses.main()` had no test at all; helpers were covered,
    the wiring between them was not). All addressed in `63c0c72`:
    - Fixed: an integration test runs `main()` over a synthetic XML + SQLite
      pair and asserts both TSVs and the printed summary.
    - Fixed: `MAX_MEMBER_BYTES` (64 MiB) rejects an oversized *declared* member
      size before extraction. A tar header states its member's size and
      `extractfile().read()` believes it, so a small archive can name a huge
      member — that is the real bomb, and it is now refused unread.
    - Fixed: the About-page test asserts the credit link's `href`, not only its
      accessible name.
    - **Declined, with reasoning posted to the bot:** bounded *streaming* of the
      compressed response. It means rewriting the shared
      `http_retry.get_with_retry` that every scraper calls, for a one-shot
      operator CLI against a timestamp-pinned URL; `tarfile` needs a seekable
      object so the bytes are buffered by design; §12 says shared-logic changes
      are raised, not smuggled into a feature PR. **DEBT, tracked here.**
    - Declined: deferring the Salmoné About credit until the import runs. The
      import is Steps 6-8 of this same task in this same branch and the PR is a
      draft until it lands, so the credit is never live without the data —
      whereas splitting it risks the worse failure of shipping the text
      uncredited, which is the actual §11 breach.
  - **§5 round on `63c0c72`: CHANGES_REQUESTED, 2 Minor.** The blocking
    `New Logic Ships With Tests` check cleared; the table is now ✅ 8 / ⚠️ 1,
    the one warning the codebase-wide docstring percentage no per-PR change
    moves. Fixed in `1ed4eb0`: the `main()` test now asserts the *unmatched*
    count the summary prints — the one figure in that line recomputed from the
    review rows instead of carried in `stats`, so the only one that can drift
    from the file the test already checks. **Declined:** a `robots.txt` check
    and 1-2 s pacing before the Wayback fetch. §11's rate limit binds crawls;
    this module issues at most one request per call for one archived file, an
    ordinary run short-circuits on the file already being on disk, and only
    `force=True` re-fetches — an operator re-running the command by hand, not
    an automated sequence. Recorded in the module docstring so the next reader
    does not re-derive it.
  - **§5 gate PASSED on `7d5c157`.** Verified on all four signals, because this
    PR has now produced every known fail-open signature: an `APPROVED` review
    object whose `commit_id` is the head, 11/11 threads resolved, a status
    *description* reading `Review approved` (not the green `Review rate
    limited`), and a pre-merge table ✅ 8 / ⚠️ 1 whose walkthrough `updated_at`
    is from the same round. Five rounds: 3 findings + a blocking check → 2
    Minor → 2 prose accuracy → clean.
  - **§4 step 3 `/code-review` (2026-08-04): 5 findings, all confirmed against
    the live DB, all fixed.** The first independent read of the *output*, not
    the diff — and the three material findings were all in sense selection,
    the thing the phase exists to get right. CodeRabbit had passed the same
    code five times; it reviews diffs, and none of these are visible in one.
    1. **Ties were invisible and frequently wrong.** Two `entryFree` keys that
       share a consonant skeleton are credited the *same* corpus count, so the
       frequency signal contributed nothing and Salmoné's document order
       decided — for exactly the noun-vs-noun collisions the ranking was built
       to resolve. 16 of the 91 glossed rows sat on such a tie, and they were
       written as status `kept`, so the gate below deprioritised precisely the
       rows that were wrong. Fixed with two finer comparisons before document
       order gets it: `fold` (hamza seats only — matches a corpus form spelt
       exactly as Salmoné keys it) then `vowelled` (short vowels kept, minus
       the marks the two sources disagree on and the final case inflection).
       Both are strictly narrower than `skeleton`, so they can only split a tie
       it left, never create one. 16 → 3, and the surviving 3 now carry a `tie`
       status of their own into the review TSV.
    2. **Invariant English past tenses defeated the nominal filter.** `hit`,
       `slit`, `shut`, `beat`, `built`, `rent`, `shed`, `rose`, `hurt`,
       `brought`, `fought` are spelt like their infinitives, so they end in
       neither `-ed` nor anything `_IRREGULAR_PAST` held. بحر was glossed
       "Slit, ripped open." with `baHor` "Sea." sitting in the same entry, on a
       root the corpus uses nominally in all 42 occurrences — the phase-21
       failure reproduced by the new code. The 11 added words were measured
       against the 101 targets, not guessed.
    3. **Sun-letter shadda blocked matching.** `skeleton` keeps shadda to
       separate Form I from Form II, but the corpus's `form_buckwalter` also
       carries the assimilated definite article's gemination, which is the
       surrounding sentence, not the word. الطور is spelt `T~uwra`, skeletons
       to `T~wr`, and matched nothing. Form II geminates the *middle* radical,
       so a shadda in first position is never gemination and can be dropped
       unambiguously — 61 occurrences recovered across 28 of the 101 targets.
    4. `-ed` is a heuristic and بغض's own gloss is "Hatred." — the one right
       answer for a nominal root, filtered out as a verb. `_NOT_PAST` guards it.
    5. `assert "2.0 KB" in out or "2048" in out` — the command prints raw
       bytes, so the first arm can never be true and the `or` pins neither.
       Replaced with the whole expected line.

    **Net, measured end to end against the live DB:** still 91 glossed of 101, but
    verb-lead glosses 12 → 7, unmatched 51 → 48, ties 16 → 3, and every named
    wrong pick corrected — كيف "Enjoyment." → "How? In what way?", بحر → "Sea.",
    طور "A time; once." → "Mountain.", مصر "Remains of milk." → "Town, city.",
    قطر → "Copper; brass; molten iron." (18:96), عضد → "Help, support, aid"
    (18:51), بضع → "Any small number ( under ten )". Every new assertion was
    mutation-checked: nine reverts, nine matching failures, including one that
    drops each tie rung separately so neither test passes on the other's rung.
  - **Task 7 is a blocking human gate and is where the phase now sits.** The
    TSV is regenerated on the fixed selector — **91 glossed of 101 targets** (10
    not in Salmoné, 0 with no sense, **48 `unmatched` and 4 `tie`**).
    `unmatched` means Salmoné's leading sense was taken with no corpus form
    behind it: the exact failure mode that made the phase-21 Lane import wrong.
    `tie` means the corpus scored two senses equally and document order broke
    it — deterministic, and still a pick no evidence supports, so it needs a
    human read. Both are priority queues; read all
    52 before the `kept` rows. The plan's Task 7 Step 2 carries an amendment
    noting كيف no longer needs rejecting. Nothing is imported until the
    rejections are recorded in `tools/salmone_rejects.txt` and signed off.
  - **DEBT, user ruling 2026-08-04 — 7 recoverable roots deliberately left
    empty.** 7 of the 10 "not in Salmoné" roots *are* in Salmoné under a
    different final-radical spelling: the corpus root ends `A`/`w` where
    Salmoné keys a hamza seat `'` or a `y`. Confirmed present: `HmA`→`Hm'`/
    `Hmy`/`Hmw`, `nsA`→`ns'`/`nsy`/`nsw`, `jzA`→`jz'`/`jzy`, `klw`→`kl'`/
    `kly`, `hnA`→`hn'`, `dmw`→`dmy`, `fAy`→`fy`. Genuinely absent, no entry to
    find: `Ayy`, `Hyv`, `trq` (أيّ / حيث / ترق — particles and a rare root).
    Same defect class as the alef-madda lemma mismatch fixed in PR #50, and it
    is a **lookup-key** normalization, not the sense-selection widening that
    Task 7 forbids. Normalizing would take the phase from 91 to ~98 of 101.
    Ruled out of phase 22 to keep the gate to one review pass; fix it in its
    own change with its own review.
  - **DEBT: 3 glosses open on a verbal-noun apparatus** — `wTn`, `why`, `wq*`
    come through as `( n. ac. waTon 1 ) [ Bi ], Lived, dwelt, …`. Same family
    as the bracketed government notes finding 2 fixed, but parenthesised, so
    `_LEADING_GRAM` does not reach it. Pre-existing, not introduced by the
    fix round; all 3 land in the `unmatched` bucket the gate reads row by row,
    so Task 7 can simply reject them. Not widened in code because a leading
    parenthetical is not always apparatus (`Onion, ( allium cepa ).`), and
    widening the extractor mid-gate is what Task 7 explicitly forbids.
  - **DEBT: `tools/prepare_lane_glosses.py`'s `review_rows` has the same
    unchecked-`via_key` TSV-delimiter gap** that Task 5 closed in the Salmoné
    tool (`77963af`). Pre-existing, same defect class, left alone to keep
    phase 22 scoped.
- **MERGED 2026-08-01 21:40Z: segment POS colour-coding on the word page —
  PR #70, squashed to `26521eb`** (branch `feat/segment-pos-colors`, reviewed
  head `2b7bf81`, deleted local + remote — `git ls-remote --heads origin`
  returns no matching ref). Seven commits. Four decisions fixed the scope up
  front: reuse `posColor` as-is (no new tokens, REL/REM/CONJ stay in the grey
  `other` bucket), coloured text with no fill, Arabic label stays neutral,
  colours only with no layout change. Plus a one-line `InfoPopover` glyph
  shrink to 14px.
  - **§5 passed on its own merits, no override.** `APPROVED` 21:17:34Z with
    `commit_id` = `2b7bf81` = the head that merged, after a
    `CHANGES_REQUESTED` at 21:11:48Z on `fa7d938`. Commit status description
    reads `Review completed`, not `Review rate limited` — read, not inferred
    from the colour. Pre-merge table 8 passed / 1 warning; the ❌ is
    `Docstring Coverage` 33.33% vs 80.00%, **`mode: warning`, does not block**.
  - **The docstring warning does not respond to per-PR work, and a commit body
    on this branch wrongly claimed it did.** `2b7bf81` added headers to the
    three components in the diff that had none and asserted that cleared it;
    the figure stayed 33.33% on the new head. The check measures the codebase,
    not the diff — `.coderabbit.yaml:51-63` already records ~25% in
    `packages/data` and ~44% in `apps/web`, which is why it is `warning` and
    not `error`. Corrected in a PR comment rather than a force-push, which
    would have dropped the approval. Same shape as #69's 50.00%: adding
    docstrings did not move that one either. **Treat this check as
    non-actionable per-PR** until a dedicated coverage pass runs.
  - CodeRabbit's one finding: the DET test asserted
    `not.toContain('bg-paper-200')`, which is only the shade `chip` uses today
    — a later `bg-paper-100` or any `dark:bg-*` would restore the forbidden
    filled label and still pass. Now `/\bbg-paper-\d+\b/`; the leading `\b`
    matches after a variant's `:`. Verified the assertion bites by temporarily
    swapping the label's `dark:text-paper-400` for `dark:bg-paper-100` — new
    assertion fails, old one passed.
  - **§4 step 3 (`/code-review`) ran five rounds.** The palette turned out to
    have been calibrated against the page background rather than its worst call
    site: small label text on a 16% tint **of its own hue** (`SegmentPills`).
    Same-hue tint pulls the background toward the text and costs ~20% of the
    ratio, so page-background figures flatter every token by roughly a whole AA
    grade. All `--pos-*`/`--form-*` light tokens re-measured against that case;
    `globals.css` now carries both numbers inline as `(page / tint)`.
  - **Knock-on, and the part that took three commits to get right:** the tint is
    transparent, so anything painted *behind* a pill composites into that
    pill's own contrast. A `paper-100` fill on cell hover dropped every pill
    label ~4.6:1 → ~4.3:1, in the exact interaction used to pick a word. Both
    `wbw` hover states moved from fill to border/ring, which sit outside the
    pills. Then `8677110` left an un-varianted `hover:border-paper-600` beside
    `dark:border-night-100`: Tailwind emits `.dark\:…:is(.dark *)` **after**
    `.hover\:…:hover`, `:is(.dark *)` scores as one class, so the two tie at
    (0,2,0) and the resting dark border wins on source order — **dark hover
    applied nothing at all**. Fixed in `3a63cd9` with an explicit
    `dark:hover:`. The class list looks correct, types check, lint passes, and
    no test asserts hover classes; it is only visible in the generated CSS or a
    live computed style, which is how it survived two commits.
  - Colour choice: the indicator is one token in both themes, so it must clear
    the 3:1 non-text floor against `paper-50` **and** `night-300`. Only
    `paper-500` (3.08 / 5.44) and `paper-600` (4.73 / 3.54) do; `paper-600`
    wins on the stronger worse side. An earlier comment claimed it was the
    only step that clears both — false, corrected in `fa7d938`.
  - Gates (local, 2026-08-01): `tsc --noEmit` clean, `next lint` clean,
    **476 tests / 81 files** green (2 new, both `SegmentCard`).
  - **Carried forward, deliberately not in this PR:**
    - `text-paper-500` is under AA at **54 uses across 29 components** — 3.08:1
      on the page, 2.57–2.61:1 inside a selected `FormFilterChips` chip once
      the tint is behind it. This PR nudged one case the wrong way by a hair
      (`--form-adjective` 2.70 → 2.61). It is a neutral-token fix, not a
      palette one. Documented in `globals.css`.
    - **Three pre-existing dead dark hovers**, same cascade fault as `8677110`,
      found by sweeping every `className` for `hover:<prop>` + `dark:<prop>`
      with no `dark:hover:<prop>`: `WordPopover.tsx:48`, `WordPopover.tsx:73`,
      `WordDetailView.tsx:67`.
- **MERGED 2026-08-01 13:39Z: gloss caveat behind an info icon + inline clamp
  toggle — PR #69, squashed to `4ace0df`** (branch
  `feat/dictionary-note-and-clamp-polish`, reviewed head `ae0938b`, deleted
  local + remote). Three of the user's screenshot notes; the third (homograph
  concordance mis-tag) was **deferred by the user** and is Queue item 10 below,
  not fixed here. Shipped: the "from word-by-word translations…" caveat moved
  off the page into a new `InfoPopover` (tap/click, not hover — mobile-first,
  §8), and `ClampedText`'s toggle moved inline to the right of the lexicon at
  6 lines instead of 8.
  - **§5 passed on its own merits, no override.** `APPROVED` 11:30:05Z with
    `commit_id` = `ae0938b` = the head that merged, zero unresolved
    non-outdated review threads, pre-merge table 8 passed / 1 warning. The one
    ❌ is `Docstring Coverage` 50.00% vs an 80.00% threshold — **`mode: warning`,
    which does not block**. Adding a docstring to `renderOne` did **not** move
    the number (walkthrough re-edited 11:30:14Z, after the approval, still
    50.00%); the uncounted functions are the nested closures `onKey`/`onClick`
    (InfoPopover.tsx) and `measure`/`toggle` (ClampedText.tsx), documented in
    prose above them rather than in doc comments. Left as-is, deliberately.
  - **§4 step 3 (`/code-review`) RAN** and returned 5 findings, all fixed in
    `ebda911` with the reasoning in the commit body. The one that mattered:
    dismissing on `pointerdown` **swallowed the first tap** on anything under
    the note. The panel is in the flow, so closing it shifts the content below
    up ~30px *between* a tap's down and up; the finger lifts over a different
    element and the browser dispatches the click to the nearest common
    ancestor. Now on `click`, where the layout is stable for the whole gesture.
    Verified end-to-end in a 393×850 headless Chromium run — "View root"
    navigated on the first tap. Regression test asserts the panel survives a
    `pointerDown`.
  - CodeRabbit's own finding: the panel rendered as `<p>` while its slot is
    typed `React.ReactNode`, so a block-level child would make the browser
    auto-close the tag and split the DOM — detaching content from `panelRef`
    and silently breaking outside-click containment. Now a `<div>` (`ae0938b`).
  - Gates (local, 2026-08-01): `tsc --noEmit` clean, `eslint` clean on touched
    files, **474 tests / 81 files** green (7 new).
- **MERGED 2026-08-01 01:24Z: percent-encoded dictionary params — PR #65,
  squashed to `19ebfc0`** (branch `fix/dictionary-identifier-decoding`, reviewed
  head `5daee92`, deleted). `/dictionary/lemma/[lemma]` and `/dictionary/[root]` were
  validating the **raw** path segment: Next hands the page the segment
  un-decoded, and `{ > < | $` all survive URL normalization percent-encoded, so
  every identifier containing one 404'd — **1669 of 4832 lemmas, 97 of 1642
  roots**. Both pages now go through `parseLemmaParam`/`parseRootParam`
  (decode-then-validate, the rule the concordance routes already enforced); the
  route handlers keep validating raw, since Next decodes query strings but not
  path segments. `%` is outside the Buckwalter charset, which is what makes the
  single decode provably non-aliasing. **§5 passed on its own merits, no
  override.** Three rounds: `e49e67a` generated no findings but failed the
  `Client Bundle Stays Clean` pre-merge check on seven pre-existing `'use
  client'` files the PR never touched (fixed separately in #66, then rebased);
  `0d6a327` cleared that check and returned CHANGES_REQUESTED on this file's own
  drift; `5daee92` APPROVED. The dead SHAs `8febee3` and `e49e67a` predate the
  rebase. **Both failing rounds were pre-merge checks or ledger drift, never the
  code** — and the first one was invisible in the commit status, which read a
  green `Review completed` throughout (§5).
  §4 step 3 (`/code-review`) run once: 3 Low findings, all fixed —
  a `ClampedText` re-open inheriting the previous open's release timer (React
  bails on the equal measured height, so the effect never re-armed; state is
  now boxed so every open is a fresh identity), **no page-level test for this
  branch's own headline fix** (the parser was unit-tested but not the wiring —
  reverting `page.tsx` left all 683 green; now `LemmaPage.test.tsx` +
  new `RootPage.test.tsx` assert the decoded value reaches the query, and all
  three new tests were verified to fail against the un-fixed code), and this
  block's own staleness.
- **MERGED 2026-07-31 17:41Z: dictionary UI truth pass — PR #64, squashed to
  `f44d296`** (branch `feat/dictionary-truth-pass`, reviewed head `5d8b220`).
  Four fixes on the lemma/root pages, from screenshots. §4 step 3 (`/code-review`)
  run three times: 5 findings, 5 findings, then 6 — all fixed, plus two the
  third round missed (a `paper-600` chip that fails AA on `bg-paper-100`, and a
  2.20:1 caption this branch still carried after the header branch had already
  fixed it). §5 CodeRabbit reviewed `b9159a5` and returned CHANGES_REQUESTED:
  14 inline findings plus a failed `New Logic Ships With Tests` pre-merge
  check, all addressed. CodeRabbit reviewed head `0bf4d0a` 2026-07-31 15:59Z
  with one Minor finding — this file's own staleness — and that round was still
  CHANGES_REQUESTED. Final round: **APPROVED at head `5d8b220`** 17:40:31Z, the
  commit that fixed it; PR merged at 17:41Z. The commit status was a green
  `Review completed`; the review verdict is the gate, not the status colour (§5). **Verify against
  `gh pr view 64` before acting on any of this** (§14).
- **MERGED: PR #67, the entry-header redesign.** Squashed to `a08b7f9` on `main`
  2026-08-01 04:02Z (`gh pr view 67 --json mergedAt,mergeCommit`); remote branch
  deleted. **Merged with the §5 gate outstanding, on the owner's explicit
  instruction** — see the round-4 note below. Second override on record after
  #63; the merge commit body carries the same account. Branch was
  `feat/dictionary-entry-header`, based on `19ebfc0` — the shared `EntryHeader`,
  both rewritten entry headers, both `loading.tsx` skeletons. §4 step 3
  (`/code-review`) run once: findings fixed in `32ca182` (skeletons + card meta
  aligned to the real header). §5 CodeRabbit reviewed `32ca182`
  2026-08-01 02:15Z: **CHANGES_REQUESTED with 3 inline findings**
  (`reviews[].state` at `commit_id` `32ca182`; the commit status read
  `success | Review completed` — the verdict is the gate, not the colour). Its
  walkthrough comment showed 9 pre-merge checks passing at that SHA; that table
  is a comment, re-targeted each round, so it is quoted as a snapshot and not as
  a check run — no check run exists to confirm it.
  Two findings fixed in `9477296`: the duplicated header skeleton is now
  `EntryHeaderSkeleton` beside `EntryHeader` (§3), and this file's evidence
  block above now names a source per claim. One rejected as a false positive and
  replied to on the PR: it read "single-sense lemmas suppress the chip", but
  `Senses` drops the *count inside* the chip at that cardinality, never the chip
  — so the skeleton's one chip is the right majority shape for 4528 of 4832
  lemmas. **CodeRabbit withdrew that finding on the reply** and recorded it as a
  learning. Round 2 on `9477296` returned CHANGES_REQUESTED with one Minor
  finding, this block's own evidence claims — which is what the wording above
  now answers. Round 3 on `c7ae10f` raised no finding but failed the
  `New Logic Ships With Tests` pre-merge check — `EntryHeaderSkeleton`'s two
  optional branches had no test. That failure carries no inline comment and
  lives only in the walkthrough's collapsed table, exactly the §5 signature.
  Four tests added to `loadingSkeletons.test.tsx`; the empty-slot one was
  verified to fail against an unguarded children row. Round 4 on `8956cdf` never
  ran: the commit status read **`success | Review rate limited`**, the §5
  fail-open signature — a green status that is not a pass, so that head carries
  no verdict and the round-3 ❌ still shown in the walkthrough is stale, raised
  before the tests that answer it. `reviewDecision` was still
  `CHANGES_REQUESTED` at merge, since a clean round submits no APPROVED review
  to clear it. **Open debt: the only never-reviewed change is `eb65659` +
  `8956cdf`** — the four `EntryHeaderSkeleton` tests and this file's SHA
  de-reference. Everything earlier on the branch was reviewed and answered.
  The rebase off the squashed #64 base is **done** — it was
  `git rebase --onto origin/main 5d8b220 feat/dictionary-entry-header`, replayed
  clean. Recorded because the form matters: replaying from `origin/main..`
  instead would have re-applied all 16 truth-pass commits already squashed into
  `main` (see squash-merge-hides-branch-state). A SHA is now safe to write down
  precisely because the branch no longer trails a moving base.
  Gates re-run per round, and each commit body records its own result rather
  than a SHA written here — a line naming its own commit cannot survive an
  amend. Latest local run, 2026-08-01: `pnpm -r type-check` clean,
  `pnpm -r lint` clean, **700 tests** (459 web + 241 data). Local is the
  only place these ever ran — no CI, so nothing on GitHub corroborates them;
  re-run before relying on the numbers.
  - **Lemma "meaning" line was a contextual gloss posing as a definition.**
    `top_gloss` = most frequent word-by-word gloss; those are per-verse
    translations, so they carry subjects, prefixes, pronoun suffixes and quote
    marks. `Daraba` read **"Allah sets forth"**. Audited all 4833 lemmas: **63.4%
    of top glosses defective** (40.4% 3+ words, 28.7% parenthetical scaffolding,
    16.2% leading conjunction, 15.0% pronoun-suffixed, 5.3% stray quote).
    Fix: `top_gloss` → `top_glosses: string[]`, rendered as chips under
    **"Translated as"** + a "not dictionary definitions" note. New
    `packages/data/src/text/gloss.ts` cleans edge quotes/punctuation and drops a
    leading wa-/fa- conjunction (guarded: a bare "and" survives, for wa- lemmas).
  - **مَا header lied.** Tagged 6 ways (REL 1266, NEG 704, INTG 92, SUB 79, COND 23,
    SUP 13) but labelled flatly "Relative pronoun" — wrong for 911 of 2177
    occurrences. `LemmaEntry.pos_tag` → `senses: LemmaSense[]`, header renders all
    with counts. **No concordance filtering** (chosen: header-only, no API change).
  - **Long definitions collapse.** New `apps/web/src/components/ui/ClampedText.tsx`:
    8-line clamp + fade mask + Show more/less, on both the root Lane box and the
    lemma root-definition box. Lane defs run to 1479 chars (p50 124, p90 401).
    Clamp is server-rendered CSS (no flash); only the toggle is client-measured.
  - **بعث had no lexicon entry** → now an explicit "No lexicon entry for this root
    yet" card instead of silence. **256 of 1642 roots affected; all upstream gaps**
    (141 root codes absent from `qurandev/roots`, 102 present-but-empty, 13 pure
    Lane apparatus). `clean_meaning()` is CORRECT — do not "fix" it.
  - **`/code-review` round 1 — 5 findings, all fixed.** (1) HIGH: under
    `prefers-reduced-motion` (`transition: none`) no `transitionend` fires, so the
    px ceiling measured at click time stayed pinned forever and a later reflow
    cropped the tail unreachably → timeout fallback releases it. (2) collapse never
    animated (`none` is not an interpolable length) → stop measuring a start height
    it cannot use; comment now says what actually happens. (3) with JS off the
    server-rendered clamp was permanent and unopenable → `<noscript>` override.
    (4) `posLabelEn(tag)!` laundered a null → `?? tag`. (5) `RootEntry.test.tsx`
    still asserted the old "omits definition block" behaviour → now covers the
    empty state. Findings 1–3 all traced to one cause: `animatingTo` had exactly
    one release path.
  - **CodeRabbit round 1 (§5) — 14 findings + 1 failed pre-merge check, all
    addressed.** Sharpest: while collapsed, `max-height` pins the box, so a
    late font swap changes content height *without* firing the ResizeObserver —
    text that fit in the fallback face and overflows in the real one would be
    cropped with no toggle. Re-measure on `document.fonts.ready` (the same
    lesson as the #57 mount-scroll bug). Also: empty-state contrast failed WCAG
    AA (paper-400 at 2.20:1 on `bg-paper-50`, dark paper-600 at 3.54:1 — §8
    requires 4.5:1); identical failing tokens in `LemmaEntry`'s sense counts,
    which CodeRabbit did not flag, fixed too. The `noscript` fallback moved to
    the root layout (was emitted per instance). Plan fixes: test fixtures were
    trimmed *real* scraped HTML, which §9 forbids committing — now synthetic
    inline markup; live-DB `cp` → `VACUUM INTO`; decision option (c) now states
    the query contract it silently depended on.
  - **CodeRabbit round 2 — 6 findings, all addressed.** Note the gate signature:
    the commit status went **green `success` / "Review completed"** while the
    review object was `CHANGES_REQUESTED`. Green status is not a pass (§5) —
    read the review, not the check colour. Substantive one: `ClampedText`'s
    measure effect omitted `children` from its deps, so swapping the content of
    a *mounted* instance kept the mount-time verdict. Not reachable today (the
    dictionary routes key on the param, definitions key on their id) but it is
    the component's contract, so the dep was added rather than only tested;
    confirmed the new test fails without it. CodeRabbit filed this as a trivial
    "add a test" nitpick. Rest were the phase-20 plan contradicting itself: the
    file table still ordered three trimmed real-snapshot fixtures the Global
    Constraints forbid, and "no changes to `packages/data`" contradicted option
    (c)'s own requirement — both now conditional/forbidden explicitly. Plus a
    TSV delimiter guard and a `--only-missing` race (root set is chosen at TSV
    generation, import commits later) now covered by a post-condition query.
  - Gates are **local, 2026-07-31** (no CI configured), and measured per
    branch — the two numbers are not interchangeable:
    - **PR #64 at `0bf4d0a`: 236 data + 442 web tests pass**, lint clean,
      type-check clean. This is the only figure that verifies the PR. Measured
      one commit below the merged head `5d8b220`, which is `STATUS.md`-only
      (`git diff --stat 0bf4d0a 5d8b220`), so the numbers carry.
    - `feat/dictionary-entry-header` (superset, see above): 236 + 448. The
      extra 6 cover `EntryHeader`, which is not in #64 — so quoting 684 as
      #64's result overstates it by six tests of unrelated code.

    Verified visually at 412px on the live dev server, not just by test.
- **`docs/plans/phase-20-root-definition-coverage.md` — SHIPPED, see the entry
  below.** Kept for the measured starting state; its Task 4 "BLOCKED" and the
  965 count are **historical** and annotated as such in the file itself. Fills
  155 of those 256 roots from the **snapshots phase 18 already archived — zero
  network requests**. corpus root pages carry a per-form lexical gloss the
  dictionary parser never read (`Drb` → "to strike, to set forth", `Zlm` → "to
  oppress, to wrong"). Measured: 965/1642 roots yield a gloss; 155 of the def-less
  256; **101 stay empty** (noun-only roots print a bare `Noun` header with no gloss
  — upstream absence, do not widen the regex). **Task 4 is BLOCKED on a user
  decision**: `corpus-forms` sorts before `qurandev-lane`, so importing it would
  silently promote it to "the" definition on 810 pages that are currently fine.
- **MERGED 2026-08-01 07:00Z: phase 20 root definitions — PR #68, squashed to
  `e8d8f23`** (branch `feat/phase-20-root-definition-coverage`, reviewed head
  `c37a37a`, deleted local + remote). **First branch in this repo to actually
  pass the §5 gate rather than override it** — `APPROVED`, commit_id equal to
  the head, status description `Review approved` (read, not inferred from the
  colour), pre-merge table 8 passed / 1 warning. Four review rounds, 12
  findings, no override checkbox ticked. Option **(b)** as chosen by the user:
  fill only the definition-less roots, leave Lane-covered ones alone. Zero
  network requests — parsed from the phase 18 snapshots.
  - **Live DB already imported.** `root_definitions` now holds
    `corpus-forms` 155 + `qurandev-lane` 1386. Roots with no definition went
    **256 → 101**, covering **5545 occurrences**. The 101 remaining are
    noun/particle roots the corpus publishes no gloss for (أيي، بعض، دون، كيف،
    عين) — upstream absence, they keep the empty state. Backup:
    `~/quran-data/quran.db.bak-phase20` (`VACUUM INTO`, not `cp`).
  - Post-condition **passed**: 0 roots hold `corpus-forms` alongside any other
    source, which is the machine-checkable proof option (b) held and the
    generate→import race did not fire. 1642 roots, none created.
  - **The plan's parser was wrong and was not used.** It keyed on an allowlist
    of POS labels over flattened text, terminating the gloss at the first `(`.
    Both assumptions are false against the archive: 7 headers use labels absent
    from the list (`Nominal`, `Time adverb`, `Form of address`) and 5 glosses
    contain parentheses (`to come (time)`, `to break (oath)`). Shipped parser
    keys on the `h4.dxe` element instead — repo convention, and no second list
    to keep in sync. Both defects have regression tests. This is why the plan
    said 965 roots and the truth is 969.
  - **§4 step 3 (`/code-review`) RAN 2026-07-31** and returned 6 findings, all
    real, all fixed in one follow-up commit. It re-verified every figure above
    against the live DB and the archive independently. What it caught:
    - The tool re-implemented snapshot filename decoding instead of using
      `scraper/snapshots.py` (§3 DRY). That fork dropped
      `iter_snapshot_paths`' duplicate-key handling: one root can own both a
      legacy and a canonical filename, and `%` sorts before `A`, so a
      name-sorted walk yields the **stale** copy last and lets it win the
      upsert. 0 such pairs in today's archive — latent, not live.
    - `--only-missing` was opt-in, so the **default run was option (a)**, the
      one the user rejected. Inverted: `--all` is now the explicit flag.
    - The lemma page rendered `root_definition` with **no credit at all**
      (§11), and `ORDER BY rd.source LIMIT 1` let `'corpus-forms'` outrank
      `'qurandev-lane'` alphabetically. Ordering is now an explicit shared
      rank; the label map moved to `apps/web/src/lib/definitionSources.ts`,
      which prints an unmapped tag as itself — a visible wrong-looking credit
      is what gets a forgotten `SOURCE_LABELS` entry noticed, where rendering
      nothing ships licensed text uncredited and says so nowhere (§11).
    - `get_text(strip=True)` would silently drop every gloss on a page if the
      corpus ever wrapped a header side in a tag — the `" -"` separator loses
      its space. Now `get_text(" ", strip=True)`.
    - No `docs/plans/phase-20-*.md` on this branch (§6). Added, with an
      **As-Built** section recording the deviations below. **It also exists on
      `feat/dictionary-truth-pass`**, whose copy lacks that section — whichever
      lands second resolves by keeping the superset.
    - Also added: `build_rows` raises on an empty archive. The snapshot dir is
      nested (`.snapshots/roots`), and pointing one level high wrote an empty
      TSV and printed success. Hit for real while verifying the fix.
  - The **byte-identical** claim was wrong when written, and is true now.
    What was verified was the *refactor* — same output before and after — but
    the live rows had been imported before the per-sense de-duplication landed,
    so 7 of the 155 still read `to turn away, to avert, to hinder; to hinder`.
    Regenerated and re-imported 2026-08-01: 0 of 155 now differ from what the
    generator produces (`A*n`, `Ax*`, `Sdd`, `Srf`, `Zhr`, `bdA`, `bgy` were
    the seven). Post-conditions re-checked after the write — `corpus-forms`
    155, `qurandev-lane` 1386, 0 roots holding both, 1642 roots, 101 still
    definition-less. Backup before the write:
    `~/quran-data/quran.db.bak-phase20-refresh-20260801` (`VACUUM INTO`).
  - Also re-rendered live: `/dictionary/lemma/hadaY` credits "Quranic Arabic
    Corpus", `/dictionary/lemma/Hamod` credits "Lane's Lexicon", no raw tag
    visible on either.
  - **Rebased onto `a08b7f9` (post-#67 `main`) 2026-08-01**, backup ref
    `backup/phase-20-prerebase`. Five files conflicted. The plan file was an
    **add/add**: #64 had already landed a revised copy on `main`, so the
    resolution keeps `main`'s text plus this branch's `As-Built` section.
    `LemmaEntry`/`RootEntry` were rewritten twice under the branch (#64, #67);
    resolution keeps `main`'s structure — `ClampedText`, the explicit empty
    state, and the AA-safe card tokens — and grafts phase 20's credit line and
    shared `definitionSourceLabel` onto it. The branch would otherwise have
    reintroduced `text-paper-500` on card interiors (2.85:1 light, 4.40:1 dark,
    both under AA).
  - Three findings from the pre-rebase review, all fixed 2026-08-01:
    - **The live-DB mismatch above** (was the highest-severity one).
    - `prepare_corpus_form_glosses.py` was **not safe to re-run**, which is
      also what made the above hard to fix: the rows a first import writes are
      exactly what the default filter then excludes. New `--refresh SOURCE`
      re-admits roots whose *only* definitions came from that source (never
      ones also holding another, which would be the option-(a) promotion), and
      `build_rows` now raises when it keeps nothing rather than overwriting a
      good TSV with an empty one and printing success.
    - `definitionSourceLabel` used a plain index lookup, so
      `SOURCE_LABELS['constructor']` resolved up the prototype chain to a
      function — truthy, so `??` never fired — typed `string`, and React throws
      when handed one as a child. `source` is a DB column, so those keys are
      reachable input. Now a `Map`, which has no prototype keys to shadow —
      `Object.hasOwn` was the first fix and tripped `noUncheckedIndexedAccess`,
      needing a second lookup to satisfy it. Test fails against the old
      expression.
  - Folded in while here: **three `node_modules` symlinks were tracked in
    git**, each pointing at its own absolute path. `.gitignore` said
    `node_modules/`, and the trailing slash matches directories only, so
    symlinks slipped past. A fresh clone got a symlink loop where the install
    should be — `pnpm -r type-check` dies with `ELOOP`. Untracked, and the
    pattern lost its slash.
  - **Second `/code-review` round** (post-rebase, 2026-08-01) — 5 findings, all
    fixed. One real gap plus four places where prose had drifted from the code:
    - **`--refresh` could strand a definition.** A root that once yielded a
      gloss and now parses to none was dropped at `no_gloss` and left out of
      the TSV; `import_lane_definitions` only upserts, so the stale text stayed
      live while the run printed success. `build_rows` takes `must_yield` and
      raises, naming the roots. Not hypothetical — tightening the parser is
      exactly what the per-sense de-duplication did. Verified against the real
      archive: 155 kept, guard does not trip, because all 101 gloss-less roots
      are definition-less and so outside the regenerated set. (First cut of
      this guard was itself incomplete — see the CodeRabbit round below.)
    - `RootEntry`'s comment claimed an unmapped tag renders as nothing. It
      renders as itself, by design — the comment said the opposite of the code
      and would have talked a maintainer out of adding a `SOURCE_LABELS` entry.
    - Both empty-state comments still cited **256 of 1642** and named بعث as
      uncovered; this branch's own import made it 101, and بعث now shows a
      corpus gloss. Both corrected, with the cause (noun-only roots).
    - The empty-state copy read "Lane's Lexicon has no meaning recorded",
      naming one of the two sources the page now draws on.
    - The two `STATUS.md` lines corrected above — both authored in this PR and
      already wrong (§14).
  - **§5 gate: PASSED on round 4** — `APPROVED` at 06:54:22Z against
    `c37a37a`, the exact head merged. Rounds 1–3 below; round 4 raised nothing
    and cleared the `New Logic Ships With Tests` error check that had held the
    PR through all three. Remaining: docstring coverage 27.59% vs an 80%
    threshold, **warning mode, non-blocking** — left deliberately, the
    functions pulling it down are one-line test helpers where a docstring
    restates the name. Reasoning is on the PR, not just here (§5: replying
    teaches it, a silent dismissal does not).
  - **Round 1: PR #68 opened 2026-08-01, CodeRabbit's first look at this
    branch.** Verdict `CHANGES_REQUESTED`, 7 findings, plus a failed
    `mode: error` pre-merge check ("New Logic Ships With Tests") that carried
    no comment and lived only in the collapsed `<details>` of the walkthrough —
    the §5 signature, read rather than guessed at this time. All addressed:
    - **The `must_yield` guard was blind to the case it existed for** (Major,
      and correct). `lost` was appended from inside the `if not definition`
      branch, so a root was only checked if the archive still held its snapshot
      *and* it passed `valid_roots`. `must_yield` is derived from the DB while
      the archive is an independent untracked directory: the two diverge with
      no error, and a regenerating root whose snapshot went missing was never
      visited, so the run succeeded with the stale definition still live. Now a
      `fulfilled` set differenced against `must_yield` — the test is what
      reached the output, not what took one branch. Two tests added for the
      routes the old guard missed (no snapshot; not a DB root).
    - **`main` had no tests at all** — the failed error check. Flag conflict,
      default/`--all`/`--refresh` selection, the `regenerating` derivation and
      TSV writing were only exercised through helpers. Five CLI tests added,
      driving the real `argparse` through `sys.argv` (the wiring is the thing
      under test, so a `main(argv)` refactor would have tested the wrong
      object).
    - Plan doc: `--only-missing` marked NOT SHIPPED at both sites, Task 4
      `BLOCKED` → `RESOLVED`, `--all` row count 965 → 969, stale `6 passed`
      annotated, and the acceptance criterion forbidding `packages/data` /
      `apps/web` changes struck through and replaced with three testable ones
      naming the tests that check them. New "Guards shipped beyond the plan"
      section records the five raises and the `must_yield` contract, so a later
      re-run cannot reinstate the plan's one-guard sketch.
    - Test DDL was duplicated across two setups; the second now calls
      `_defs_db`, moved above its first user. Ruff S608 on that helper carries
      a `# noqa` with the justification §4 requires (test-local literal, throw-
      away `tmp_path` DB, no external input). **The directive sits on the first
      SQL string, not on `con.executescript(`** — ruff anchors S608 to the
      start of the concatenated SQL, so on the call line it is silently inert.
      Third round caught it; verified by deleting the directive and watching
      the finding not change.
    - Not fixed: docstring coverage 28.57% vs an 80% threshold. Warning, not
      error; the missing docstrings are one-line test helpers where a docstring
      would restate the name.
    Gates re-run after the fixes, **all local — this repo has no GitHub
    Actions workflow, so the only thing GitHub reports on a commit is the
    `CodeRabbit` status**:

    | Command | Result |
    |---|---|
    | `packages/scraper$ .venv/bin/python -m pytest -q` | 302 passed |
    | `pnpm -r test` (vitest) | 467 web / 80 files, 243 data / 21 files |
    | `pnpm -r type-check` (`tsc --noEmit`) | clean |
    | `pnpm -r lint` (eslint, `apps/web` only) | clean |
    | `packages/scraper$ .venv/bin/python -m ruff check .` | **12 errors** |

    Ruff is **not** part of `pnpm -r lint` — that task is eslint over
    `apps/web/src`, so "lint clean" and "ruff has 12 errors" describe different
    tools and do not contradict. All 12 pre-exist on `main` (E501 + I001 in
    `cli.py`, `replay.py`, `sources/`), in files this branch does not touch,
    and are not addressed here.

    **The count was wrong twice in this PR — 14, then "14 = baseline".** Both
    came from comparing against a remembered number instead of measuring. The
    real baseline is 12, and the branch was carrying two of its own: the S608
    below, and an 89-char test name. Diffing HEAD against the `main` worktree
    is what settled it; a clean `git stash` on a committed tree compares
    nothing and reports "Already up to date", which is what hid it the first
    time. Both are now fixed, and the finding sets are identical modulo
    line-number shifts in `cli.py`.
  - Unrelated pre-existing bug confirmed while verifying: `/dictionary/$hw`
    and lemma routes with non-alphanumeric Buckwalter 404 on `main`. That is
    what the unmerged `fix/dictionary-identifier-decoding` branch fixes.
- PRs #1–57 MERGED. **#58 CLOSED unmerged** (payload split, see below). **#59 MERGED**
  (`0095c2c`, 2026-07-28 19:01Z — CodeRabbit gate). **#60 MERGED** (phase 17).
  **#61 MERGED** (phase 18, `6113fd3`). **#62 MERGED** (`97d78bb`, sort_order
  invalidation). **#63 MERGED** (`7b86214`, 2026-07-31 03:24Z — lemma pages,
  squashed, **§5 gate overridden**, see below). **#64 MERGED** (`f44d296`,
  2026-07-31 17:41Z, squashed — dictionary truth pass). **#66 MERGED**
  (`5ce6fdf`, 2026-08-01 01:12Z, squashed — client-component type imports moved
  onto `@quran-corpus/data/client`, plus the guard test that keeps them there).
  **#65 MERGED** (`19ebfc0`, 2026-08-01 01:24Z, squashed — percent-encoded
  dictionary params; APPROVED at `5daee92` after two rounds, no override).
  **#67 MERGED** (`a08b7f9`, 2026-08-01 04:02Z, squashed — entry-header
  redesign, **§5 gate overridden**, see above).
  Current `origin/main` tip `a08b7f9`; a local `main` last fetched before that
  still reads an older SHA, so check the remote ref, not the local one.
  Nothing open.
  **Commit SHAs before 2026-07-27 are all dead** — history was rewritten, see purge.
- **Phase 18 (930-root re-scrape) DONE + MERGED.** All six phase-17 carry items
  closed. **The 930-root crawl itself has been run** (see Phase 18 below) — nothing
  is pending there.
- **PR #63 (lemma pages + clickable frequency) MERGED 2026-07-31 with the §5 gate
  UNRUN.** Owner's explicit call after the conflict was surfaced. CodeRabbit never
  reviewed head `bc5425f` — quota dead ~3h, status `success | Review rate limited`.
  **This is the only override in the repo's history; do not cite it as precedent.**
  Reason + evidence are in the merge commit body (`git show 7b86214`). See its own
  section below.
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

### PR #63 — lemma pages + clickable frequency, MERGED `7b86214` (§5 OVERRIDDEN)

Branch `feat/lemma-pages` (deleted), squashed onto `main` 2026-07-31 03:24Z from
head `bc5425f`. 17 commits. Makes
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

**CodeRabbit rounds:** 9 rounds ground down, findings 9→7→6→1→4→0. Fix commits
`08ea720` `4b26c90` `5cd2a03` `9d34fab` `bc5425f`. Last three closed pre-merge
check *New Logic Ships With Tests*, which **re-targets every round** — title check
→ `buildVerseWordsByAyah`'s untested batchSize guard → `LemmaPage` having no page
test. `bc5425f` added `apps/web/src/test/LemmaPage.test.tsx` for the third.

🔴 **MERGED WITH §5 UNRUN — the repo's only gate override.**
CodeRabbit **never reviewed head `bc5425f`**. Quota died for ~3h; the commit
status read `success | Review rate limited` @ 2026-07-31T00:03:28Z, which §5
defines as **blocked, never passed**. `reviewDecision` was CHANGES_REQUESTED,
held by a *New Logic Ships With Tests* failure evaluated against the **previous**
head `9d34fab` — its stated reason (LemmaPage untested) is what `bc5425f` fixed.
Believed stale, never re-evaluated by the bot. 90 polls over 3h + one
`@coderabbitai full review` re-request all returned rate-limited.
Merged on the owner's explicit instruction after the conflict was surfaced.
§5 says the author may never override; `mergeState=CLEAN` did not stop it because
branch protection needs a public repo. Full reasoning in `git show 7b86214`.
**What did run:** 7/8 pre-merge checks passing, 0 unresolved threads, local gate
green on `bc5425f` and re-verified on `main` after merge — **data 213/213,
web 423/423**, `tsc --noEmit` + eslint clean.
**Carry-forward:** re-request a CodeRabbit review against `main` once quota lifts;
anything it finds ships as a follow-up PR.

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
- `root_definitions`: **1758 rows as of 2026-08-02** — `qurandev-lane` 1386,
  `perseus-lane` 217 (phase 21), `corpus-forms` 155 (phase 20). Roots with no
  definition at all: 101 → **18**. Re-query before trusting; these are live counts.
  "/"-spacing normalized 2026-07-23 (#46, 633/1386 rows changed) so unspaced
  "word/word/word" runs wrap instead of overflowing the card.
- Phase 21 (2026-08-02, **MERGED** 2026-08-03 — PR #71 squashed to `fbe0f6c`,
  branch deleted): filled 217 of the 256 Lane-less roots from the Perseus TEI of
  Lane's Lexicon, deterministic extraction, no LLM. 14 roots Lane genuinely lacks
  are left to the empty-state card; **25** were dropped across two human gates as
  correct Lane extractions of a **form-I sense the Quran does not use** (بعض →
  "the gnats bit him", صلو → "struck the small of the back", فئة → "I split his
  head"). That failure mode is the phase's real limit — `key_candidates` matched
  correctly in all 38 non-direct cases. The rejects are checked in at
  `packages/scraper/tools/lane_rejects.txt` and subtracted from the target list,
  because `import-lane` upserts and a re-run would otherwise reinstate them.
  Five writes, five backups: `quran.db.bak-phase21` (213 rows),
  `quran.db.bak-phase21b` (the 863ec2f refresh — 213 re-derived at the raised
  1500-char cap, plus g$w Sgw gTw THw), `quran.db.bak-phase21c` (the da8d708
  refresh — 106 of 217 rows re-derived with the seam/dangling-tail/bracket
  fixes), `quran.db.bak-phase21d` (the 4c15092 refresh — 32 more rows, the
  second `/code-review` pass), and `quran.db.bak-phase21e` (the 53d68d9 refresh
  — 52 more rows from the third pass: a bracket half in `between` was defeating
  the connective test and seaming mid-clause, so أتى read "He; it; came;" for
  "He [or it] came", and spaced `<itype>` values (`Q. 1`, `R. Q. 1`, 846 of
  14238) were parsing as form 0 and outranking the blocks tried first).
  Live rows match the 53d68d9 extractor exactly.
  A fourth `/code-review` pass found three more, all latent: a root's own
  `<div2>` losing to a joined `X and Y` heading (Hyw, jr*q — neither a corpus
  root), a seam thrown away with the roman prose in front of a dropped apparatus
  run (0 of the 231 targets), and `perseus-lane` tied with `qurandev-lane` in
  `DEFINITION_SOURCE_RANK` so the `rd.source` tie-break picked the
  machine-extracted gloss alphabetically (no root holds both today). Fixed; the
  re-derived TSV is byte-identical to the imported one, so **no sixth write**.
  PR **#71**. CodeRabbit's first pass requested changes: the `mode: error`
  **New Logic Ships With Tests** check failed on `fetch-lane-tei` and
  `prepare_lane_glosses`'s argparse having no CLI test — the same gap phase 20
  hit on the sibling tool. Fixed with 5 tests, plus three real code findings:
  the §11 rate limit was missing from `download_volumes` (36 GETs back to back;
  `get_with_retry` only spaces out *failures*), `part.rename` → `part.replace`
  so `--force` does not raise on Windows, and `RAW_BASE` pinned from `master` to
  commit `f3c19fb` — all 36 local volumes hash-match that tree, so the 217 rows
  stand and no re-derive is owed. Seven rounds ran in all — **29 findings, 11
  withdrawn** once shown the code, 18 fixed — ending in an explicit
  `APPROVED` review on `551fb1c` with 8/8 `mode: error` pre-merge checks
  passing (Docstring Coverage stayed a `mode: warning` ❌, non-actionable as on
  #69/#70). Later rounds also caught `isdigit` → `isdecimal` on the `<itype>`
  parse (latent, 0 of 14238), `set -euo pipefail` plus an atomic rename in the
  import runbook, and **two vacuous assertions** — a `tmp_path` that already
  existed so the guard test proved nothing, and a reject-list check against
  `out.tsv` where a quarantined root can never appear. Both now mutation-checked.
  The plan's own dry-run expectations were stale by the end (`233 of 256`
  predates the joined-heading recovery and the reject list) and were
  re-measured, not recomputed.
  Quota is the real cost here: ~30 min between allowed reviews, and a refusal
  posts a **green** `Review rate limited` status — never read that as a pass.
  Rollback: `DELETE FROM root_definitions WHERE source='perseus-lane'`.
  Vendored TEI volumes live outside the repo at `~/quran-data/refdata/lane-tei`.
  **Open debt:** the `―` cut does **not** bound a gloss to one sense — Lane
  also separates senses inside one sub-sense with roman prose, so one segment
  can hold a dozen italic runs. 64 rows exceed 300 chars and 25 exceed 600
  (بتر, 1336), some carrying proverb and verse translations. No cap value cuts
  cleanly; the fix is to collect fewer senses. Re-run with
  `prepare_lane_glosses --refresh` when that lands.
  **Also open:** 2 rows (أخذ, طلل) still carry a function word in front of a
  semicolon Lane wrote himself ("he took hold of;") — trimming those means
  rewriting his punctuation, not the extractor's, so they are left alone.
  **Accepted, not open:** a bracket-only gap between two italic runs now fuses
  them bare, so بين reads "It a thing became separated" for "It (a thing) became
  separated". 40 of those 52 rows fuse this way and the rest read cleanly ("He
  sold it: and he bought it:"); keeping the bracket would mean threading its
  state through the join, against the extractor's standing rule that a
  straddling bracket is noise.
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
- **2026-08-01: still zero branches and one worktree after #70 merged**, but
  `gh pr merge --squash --delete-branch` failed *differently* this time and the
  failure is worth knowing. The remote deletion succeeded before the local half
  ran; the local half aborted on `fatal: Not possible to fast-forward` because
  local `main` carried an unpushed `docs(status)` commit. `gh` had already
  switched the checkout to that stale `main`, so **the working tree briefly read
  as pre-PR** — files showing old content after a merge is this, not data loss.
  Recovery: `git rebase origin/main` (which dropped the local commit as "patch
  contents already upstream" — the same STATUS.md text had landed via another
  route), then `git remote prune origin` for the stale tracking ref. Verify with
  `git ls-remote --heads origin` and by grepping the merged content, never from
  the PR timeline.
- **2026-08-01: back to zero branches and one worktree, after #68 merged.**
  Deleted local `feat/phase-20-root-definition-coverage` (+ its remote ref —
  `gh pr merge --delete-branch` did the remote but failed local cleanup, the
  known worktree gotcha), `feat/dictionary-entry-header`, and
  `backup/phase-20-prerebase`. Removed the `qcp-header` worktree and the
  `qcp-fix` directory (25 files, all `.next` build output, no git, orphaned
  from an aborted run — a stale `next-server` was still serving it from a
  deleted cwd).
  Verified per branch before deleting, since squash merges make `--merged`
  lie: `feat/phase-20…` diffed **zero** against `main`;
  `feat/dictionary-entry-header`'s 61 apparently-unique lines were all *older*
  text (pre-#67 STATUS.md, the pre-phase-20 `RootEntry`, the `--only-missing`
  plan, and the `node_modules` symlinks `61ecf51` untracked); and
  `backup/phase-20-prerebase`'s skeleton loaders, `buckwalter.ts` and route
  guards are all on `main` in *newer* form — `main` validates via
  `bw === null` (the #65 decode fix), the backup carried the older
  `isRootBuckwalter` guard.
- **Gotcha from `61ecf51`: the first checkout after it deletes your root
  `node_modules`.** The three self-symlinks were *tracked*, so a branch switch
  onto a commit that no longer has them removes the working-tree entries — and
  `apps/web/node_modules/*` are pnpm links into `<repo>/node_modules/.pnpm`,
  so every one of them dangles. Symptom is `next dev` dying with
  `Cannot find module .../apps/web/node_modules/next/dist/bin/next` while
  `apps/web/node_modules` still looks present. Fix is one `pnpm install`
  (1.2s — the store is intact, only the links are gone). One-time, per
  checkout that crosses `61ecf51`.
- **`.claude/settings.json` is now tracked**, swept into #68's squash by a
  `git add -A`. Contents are innocuous (`enabledPlugins: firecrawl`), but it
  is a personal tool setting that landed in a scraper PR. Untrack + ignore if
  that is not wanted; flagged to the user 2026-08-01, no decision yet.
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
9. **#63's unrun review — re-request CodeRabbit against `main` once quota lifts.**
   #63 merged 2026-07-31 with §5 overridden; the diff has still never been read by
   the bot. Not blocking anything, but it is an open debt: run it, and ship any
   finding as a follow-up PR. See the #63 section above.
10. **Homograph forms mis-tag the concordance — DEFERRED by the user 2026-08-01,
    needs its own phase plan (§6).** Reported from a phone: on `/dictionary/SlH`
    the "Active participle ṣāliḥ 65" chip is green but every one of those 65
    concordance rows carries a blue "ṣāliḥ" tag.

    Cause: the corpus disambiguates homograph lemmas with a trailing numeral,
    and only the morphology file carries it — `word_segments.lemma` is `صَٰلِح2`
    for the 9 Ṣāliḥ-the-prophet occurrences, while the root page prints a plain
    `<span class="at">صَٰلِح</span>` for both forms (checked the phase 18
    snapshot: no numeral, no lemma link, so it is NOT recoverable by re-parsing).
    So `root_forms` holds two rows with identical `form_arabic`, and
    `getRootConcordancePage`'s `MIN(rf.id)` tie-break (`roots.ts:373`) hands all
    65 active participles the proper noun's id.

    Second symptom, unreported: `صَٰلِح2` matches no form row at all, so tapping
    the "Proper noun 9" chip filters to **zero** results and those 9 occurrences
    render untagged.

    Blast radius — 8 roots, every `(root_id, form_arabic)` group with more than
    one row and disagreeing labels: `SlH`, `mlk` (Proper noun / Active
    participle), `jhl`, `bEl` (Noun / Proper noun), `HSy`, `wfy` (verb /
    nominal), `Hyv` (Nominal / Conditional particle), `ESf` (Noun / Verbal noun).

    Fix shape when it is picked up: materialize `root_forms.lemma_key` and join
    on it exactly, dropping the MIN. Segment `pos_tag` resolves 7 of the 8 but
    **not `ESf`** — both `عَصْف` and `عَصْف2` are tagged `N`, so only the
    occurrence counts separate them. Counts are unique inside all 8 groups
    (verified), which makes them the resolver's primary key with `pos_tag` as
    the cross-check. Schema change + migration + backfill + a live-DB write, so
    §12 and §6 both apply.

11. **`text-paper-500` is under AA at 54 uses across 29 components** — 3.08:1 on
    the page, 2.57–2.61:1 on a tinted chip interior. Measured 2026-08-01 during
    #70, which documented it in `globals.css` rather than fixing it: it is a
    neutral-token sweep across the app, not a palette change, and wants its own
    change so the diff is reviewable. Pick the replacement per background — see
    the `paper-*` contrast table; the AA-safe token differs on the page vs. on a
    card vs. behind a 12–16% tint.

12. **Three dead dark hovers**, all pre-existing: `WordPopover.tsx:48`,
    `WordPopover.tsx:73`, `WordDetailView.tsx:67`. Each pairs `hover:<prop>`
    with `dark:<prop>` and no `dark:hover:<prop>`, so Tailwind's variant order
    lets the resting dark rule win and the dark hover does nothing — the exact
    bug #70 fixed in `WbwWordCell` (`3a63cd9`). Found by sweeping every
    `className` in `src/**/*.tsx`; that sweep is the way to confirm the list is
    still complete before fixing.

    **Re-verified 2026-08-02, all three still live**, exact resting/hover pairs:

    | File:line | Resting dark | Hover (light-only today) |
    | --- | --- | --- |
    | `reader/WordPopover.tsx:48` (close button) | `dark:bg-night-100` | `hover:bg-paper-300` |
    | `reader/WordPopover.tsx:73` (full-analysis link) | `dark:bg-paper-100` | `hover:bg-paper-700` |
    | `morphology/WordDetailView.tsx:67` (same link, page version) | `dark:bg-paper-100` | `hover:bg-paper-700` |

    Note `:73` / `:67` are an inverted button — `bg-paper-900` in light,
    `bg-paper-100` in dark — so the dark hover step must go *darker* toward
    `paper-200/300`, not reuse `paper-700`. Deferred by the user 2026-08-02:
    fix wants a PC to verify, since the only proof is the computed style after
    a real hover in dark mode (the class list looks correct while broken, and
    no test asserts hover classes). Three `dark:hover:bg-*` additions, one
    commit, no schema or data impact.

## Notes
- Uzbek edition = Cyrillic (uz.sodik). Latin variant not done.
- Greptile: DEMOTED to advisory 2026-07-27 (see "Review gate" above). Free plan
  50/mo cap, blown mid-review on #58 — that fail-open is why it no longer gates.
