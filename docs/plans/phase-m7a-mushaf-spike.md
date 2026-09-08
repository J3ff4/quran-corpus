# Phase M7a — Mushaf Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development
> or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** answer the four questions that decide whether and how a glyph-based paged
mushaf can ship, and let the owner pick the edition from renders on their own phone.

**Architecture:** no production code. Downloads land outside git in
`~/quran-data/refdata/mushaf/`. A throwaway dev-only route in `apps/mobile` proves font
registration and renders the three editions; it is deleted before the PR merges. Only
the findings section of this file and the PRD renumber merge.

**Spec:** `docs/plans/phase-m7-paged-mushaf.md` — rulings 1, 5, 8, 9 and the M7a
deliverable list.

## Global Constraints

- **No schema change, no migration, no importer** in M7a. Those are M7b.
- **Nothing large enters git.** Fonts, layout DBs and raw downloads live in
  `~/quran-data/refdata/mushaf/` (§9, and the temp/ purge precedent).
- The throwaway route is deleted in Task 8. It must never be reachable from the tab bar
  or any Link — dev-only, reached by typing the path.
- Device work needs the owner present: the phone under `adb` is also this session's
  display. Never drive it unattended.
- Metro's file watcher is dead here — every source edit needs `expo start --clear`.
- Never grep the Metro log for `"Android Bundled"` raw; ANSI codes split the words.
  Strip first: `sed 's/\x1b\[[0-9;]*m//g'`.

---

### Task 1: Record the licence terms

**Files:**
- Modify: `docs/plans/phase-m7a-mushaf-spike.md` (Findings §1, at the bottom)

Ruling 9 says we ship regardless. This task documents *what* is being accepted, so the
About/Credits entry in M7c is accurate and the owner's acceptance is on the record.

- [ ] **Step 1: Fetch the terms for each resource**

Fetch and read, in full, each of:
- `https://qul.tarteel.ai/faq` — QUL's general position on resource licensing
- the mushaf-layout resource page for each of KFGQPC V1, V2, V4
- `https://qul.tarteel.ai/resources/font/249` (QPC V2 font) and the V1/V4 equivalents
- whatever "Terms of use" link each font resource page carries

- [ ] **Step 2: Quote, do not summarise**

For each resource write into Findings §1: resource name, URL, the licence string **as
written** (or `NONE STATED` — that is a finding, not a gap), whether redistribution
inside an app binary is addressed at all, and any attribution wording required.

Do not paraphrase a licence into a verdict. A summary is what makes an accepted risk
un-auditable later.

- [ ] **Step 3: State the exposure in one paragraph**

One paragraph, plain: what we are shipping, under what grant or absence of one, and what
the realistic consequence is. This is what the owner accepted.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/phase-m7a-mushaf-spike.md
git commit -m "docs(plans): M7a licence findings for QUL layout and QPC fonts"
```

---

### Task 2: Download the layout data and validate it against our corpus

**Files:**
- Create: `~/quran-data/refdata/mushaf/` (outside git)
- Create: `packages/scraper/tools/check_mushaf_layout.py`
- Modify: `docs/plans/phase-m7a-mushaf-spike.md` (Findings §2)

**Interfaces:**
- Consumes: `apps/web/quran.db` — the live DB (`ayahs.surah_id`, `ayah_number`, `page`)
- Produces: a validation verdict per edition that M7b's exit criterion reuses

- [ ] **Step 1: Download all three layouts**

```bash
mkdir -p ~/quran-data/refdata/mushaf
# one subdir per edition: v1/ v2/ v4/
```

Take the SQLite export where offered, JSON otherwise. Record each file's URL, size and
sha256 in Findings §2.

- [ ] **Step 2: Write the validator**

`packages/scraper/tools/check_mushaf_layout.py`. Read-only against both DBs. It must
report, per edition:

- pages present, and any page in 1..604 missing
- lines per page: the distribution, and every page whose count is not 15
- `line_type` values seen, and counts of each
- word-id ranges: any line where `first_word_id > last_word_id`, any gap or overlap
  between consecutive lines
- **cross-check against our corpus**: for every page, the set of `(surah, ayah)` the
  layout's word ranges cover vs the set our `ayahs.page` says is on that page.
  Report every disagreement with its page number.

The cross-check is the point of the task. Memory
`validate-data-by-alignment-not-count` applies: row counts matching proves nothing.

- [ ] **Step 3: Run it and read the disagreements**

```bash
cd packages/scraper && python tools/check_mushaf_layout.py \
  --layout ~/quran-data/refdata/mushaf/v2/layout.db \
  --corpus ../../apps/web/quran.db
```

Expect *some* disagreement — the layouts differ in edition, and our `ayahs.page` came
from a different source. A handful of boundary pages is normal; a systematic offset is a
finding that changes M7b.

- [ ] **Step 4: Mutation-check the validator**

Flip one page's `last_word_id` in a copy of the layout DB and confirm the checker reports
it. A validator that passes on corrupted input asserts nothing — this has slipped through
twice already (PRs #71, #73).

- [ ] **Step 5: Record and commit**

Findings §2 gets the per-edition table and the disagreement list.

```bash
git add packages/scraper/tools/check_mushaf_layout.py docs/plans/phase-m7a-mushaf-spike.md
git commit -m "feat(scraper): mushaf layout validator, cross-checked against ayahs.page"
```

---

### Task 3: Download the fonts and measure the real byte cost

**Files:**
- Create: `~/quran-data/refdata/mushaf/{v1,v2,v4}/fonts/` (outside git)
- Modify: `docs/plans/phase-m7a-mushaf-spike.md` (Findings §3)

- [ ] **Step 1: Fetch all 604 pages, per edition, per format**

```
https://verses.quran.foundation/fonts/quran/hafs/{v1|v2}/woff2/p{1..604}.woff2
```
and the `.ttf` equivalents. Rate-limit politely (§11 discipline applies to any host, not
just corpus.quran.com): ~1 req/s, resumable, skip what is already on disk.

- [ ] **Step 2: Measure**

Per edition, per format: total bytes, per-file min/median/max, and the count actually
retrieved (a 404 on some page is a finding).

- [ ] **Step 3: Record against the budget**

Findings §3 gets a table: edition × format → total MB, and whether it fits the ~40MB
budget from ruling 8. Add the layout DB's own contribution and the projected `quran.db`
growth from Task 2's row counts.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/phase-m7a-mushaf-spike.md
git commit -m "docs(plans): M7a measured font and layout byte cost per edition"
```

---

### Task 4: Prove RN Android registers a page font at all

**Files:**
- Create: `apps/mobile/app/dev-mushaf-spike.tsx` (deleted in Task 8)
- Modify: `docs/plans/phase-m7a-mushaf-spike.md` (Findings §4)

The highest-risk question in the phase. If this fails, the glyph approach fails and the
fallback in ruling 9's neighbourhood becomes the phase.

- [ ] **Step 1: Copy a handful of fonts into the app's assets**

Three pages per edition only — enough to prove registration, not the full 604. Put them
under `apps/mobile/assets/fonts/spike/` and **add that directory to the root `.gitignore`** in the
same step, so no font is ever staged.

- [ ] **Step 2: Register one lazily and render its glyph string**

In `dev-mushaf-spike.tsx`, use `expo-font`'s runtime `loadAsync` (not the static
`useFonts` manifest) to register `p2` on demand, then render that page's `code_v2` string
in `fontFamily: 'QCF2_002'` or whatever name registration returns.

The two things to prove, separately:
1. runtime `loadAsync` registers a font that was not in the static manifest, and
2. the glyph string renders as words rather than as tofu boxes.

- [ ] **Step 3: Try WOFF2 and TTF side by side**

Same page, both formats, on screen at once. Ruling 8's budget is comfortable for TTF but
WOFF2 is a third the size; the answer decides which we bundle. `hafs.18.woff2` already
ships in this repo, which is weak evidence WOFF2 works — weak because it may be reaching
RN through a different path. Prove it directly.

- [ ] **Step 4: Test per-word tinting for shaping damage**

Render one line twice: as a single `Text`, and as per-word `Text` children with
alternating colours. Memory `rn-android-breaks-shaping-across-nested-text` says nesting
breaks Unicode Arabic. A QCF word is one pre-shaped glyph with no joining to its
neighbours, so it *should* be immune — confirm rather than assume, because ruling 20's
three highlight states all depend on per-word tinting.

Also render the Unicode Hafs fallback the same way. That text is live Arabic and is
expected to break; knowing it breaks tells M7c the fallback must not be tinted.

- [ ] **Step 5: Record**

Findings §4: does runtime registration work, does WOFF2 work, does per-word tinting keep
shaping in glyph text, does it in fallback text. Yes/no each, with a screenshot each.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/dev-mushaf-spike.tsx .gitignore docs/plans/phase-m7a-mushaf-spike.md
git commit -m "spike(mobile): prove runtime page-font registration and per-word tinting"
```

---

### Task 5: Render one real page, three editions

**Files:**
- Modify: `apps/mobile/app/dev-mushaf-spike.tsx`

- [ ] **Step 1: Render a page from layout rows**

Pick three pages that exercise the range: **page 2** (al-Baqarah's opening, a surah band
and a bismillah), **page 106** (two surahs on one sheet), and **page 604** (short surahs,
three surah bands).

Group words by `line_number`, join each line into one `Text`, centre the lines flagged
`is_centered`, and let the page's own font do the fitting. Do not add letter-spacing, do
not stretch, do not justify — the whole premise is that the font already fits the line.

- [ ] **Step 2: Draw all three editions of each page**

Six renders -- V4 is ruled out in Findings 2. A picker at the top switches edition; the page fills the screen at the real
reading size, not scaled down.

- [ ] **Step 3: Confirm lines actually fill the width**

The one thing the spike is really testing visually: do the 15 lines reach both margins
without ragged ends? If they do not, the per-page font is not being applied and Task 4's
answer was a false positive.

---

### Task 6: Device session with the owner

**Files:**
- Modify: `docs/plans/phase-m7a-mushaf-spike.md` (Findings §5)

**Coordinate with the owner before starting.** The phone under `adb` is also this
session's display.

- [ ] **Step 1: Build and install**

Local APK build per memory `local-apk-build-without-eas` — `taskset -c 0,1` is mandatory,
arm64 only. Or run through Expo Go if the fonts register there; note which, because Expo
Go and a real build differ on native font paths.

- [ ] **Step 2: Capture all six renders**

Three pages × two editions, screenshots at native resolution, plus one photo of the
phone in hand for true scale.

- [ ] **Step 3: Send them to the owner and get the edition ruling**

The owner picks V1, V2 or V4 from what they can see. Record the choice and, briefly, the
reason — M7b's column names follow from it (`code_v1` vs `code_v2`).

- [ ] **Step 4: Record the device facts**

Findings §5: which build path was used, whether fonts registered on a real build, how
long a cold page-font load took, and anything that looked wrong at true scale.

- [ ] **Step 5: Commit**

```bash
git add docs/plans/phase-m7a-mushaf-spike.md
git commit -m "docs(plans): M7a device renders and the owner's edition ruling"
```

---

### Task 7: Write the finding

**Files:**
- Modify: `docs/plans/phase-m7a-mushaf-spike.md` (Findings §6)
- Modify: `docs/PRD-android-first-mobile-app.md` (§10 renumbering)

- [ ] **Step 1: Answer the four deliverables explicitly**

One short section each: licence, edition, font registration, byte cost. Each ends in a
decision, not a discussion.

- [ ] **Step 2: State what M7b must build**

Concrete: which edition, which format, which column names, which table shape, what the
importer reads, what the exit criterion checks. M7b's plan is authored from this section,
so anything vague here becomes a guess there.

- [ ] **Step 3: State what M7c must build**

Anything the device session changed about the UI assumptions — fallback tinting, load
latency, band size at true scale.

- [ ] **Step 4: Renumber the PRD**

M7 release hardening → M8, treebank → M9, iOS → M10; new M7 = Paged Mushaf.

- [ ] **Step 5: Commit**

```bash
git add docs/plans/phase-m7a-mushaf-spike.md docs/PRD-android-first-mobile-app.md
git commit -m "docs: M7a finding, and renumber PRD phases for the mushaf phase"
```

---

### Task 8: Remove the spike code

**Files:**
- Delete: `apps/mobile/app/dev-mushaf-spike.tsx`
- Delete: `apps/mobile/assets/fonts/spike/`
- Modify: `.gitignore` (repo root — `apps/mobile` has none)

- [ ] **Step 1: Delete the route and the spike fonts**

- [ ] **Step 2: Verify nothing references them**

```bash
grep -rn "dev-mushaf-spike\|fonts/spike" apps/mobile/src apps/mobile/app
```
Expect no matches.

- [ ] **Step 3: Full quality gate**

```bash
cd apps/mobile && npm run lint && npm run type-check && npm test
```
Type-check is red on main with the two known errors from issue #54; anything beyond those
two is ours.

- [ ] **Step 4: Commit**

```bash
git add -A apps/mobile .gitignore
git commit -m "chore(mobile): remove the M7a spike route and its fonts"
```

---

## Acceptance criteria

M7a is done when all of these hold:

- [ ] Findings §1 quotes a licence string (or `NONE STATED`) for the layout and for all
      three font editions, and states the accepted exposure in one paragraph.
- [ ] `check_mushaf_layout.py` runs clean against the chosen edition, and its
      disagreement list against `ayahs.page` is written down and explained.
- [ ] The validator has been mutation-checked: a corrupted layout row makes it fail.
- [ ] Findings §3 gives measured MB per edition per format, against the ~40MB budget.
- [ ] Findings §4 answers yes/no, with a screenshot each: runtime registration, WOFF2,
      per-word tinting in glyph text, per-word tinting in fallback text.
- [ ] Six renders captured on the owner's GM1917 and sent; the owner has named an
      edition. (Nine before V4 was ruled out in Findings 2.)
- [ ] PRD §10 renumbered.
- [ ] No spike code, no font binary and no layout download is in git.
- [ ] `lint`, `type-check` and `test` pass in `apps/mobile` (modulo issue #54).

Explicitly **not** in M7a: any schema change, any importer, any change to the reader.

---

## Findings

_Filled in as the tasks run. Empty is not a pass._

### §1 Licence

Fetched 2026-09-07. Every string below is quoted as written; `NONE STATED` is
a finding, not a gap.

**QUL FAQ — `https://qul.tarteel.ai/faq`** (the only page on the site that
addresses licensing at all):

> "The resources available on QUL vary in their copyright status. Some are in
> the public domain, while others may be subject to specific licenses."

> "We recommend reviewing the licensing information provided by each
> resource's author before use."

> "Yes, you can use QUL data in commercial projects. However, please review
> the licensing terms for each resource. Some data may have restrictions or
> require attribution, while others are freely available for commercial use."

**Per-resource pages.** The FAQ defers to the resource author. No resource
page carries an author licence:

| Resource | URL | Licence string | Redistribution in a binary | Attribution asked |
|---|---|---|---|---|
| KFGQPC V1 layout (1405H print) | `/resources/mushaf-layout/15` | NONE STATED | not addressed | none stated |
| KFGQPC V2 layout (1421H print) | `/resources/mushaf-layout/10` | NONE STATED | not addressed | none stated |
| KFGQPC V4 layout (1441H print) | `/resources/mushaf-layout/19` | NONE STATED | not addressed | none stated |
| QPC V1 Font | `/resources/font/238` | NONE STATED | not addressed | none stated |
| QPC V2 Font | `/resources/font/249` | NONE STATED | not addressed | none stated |
| QPC V4 Tajweed Font | `/resources/font/240` | NONE STATED | not addressed | none stated |

The mushaf-layout index page lists twelve layouts and shows a licence string
for none of them. The font index lists twenty-two fonts and shows a licence
string for none of them.

The V2 font page attributes the artwork without licensing it: the font is
described as developed by the **King Fahd Complex for the Printing of the Holy
Quran** from calligraphy by **Usman Taha**. That is the upstream rights
holder; QUL is a redistributor, not the author.

**"Terms of use"** — every QUL page footers to `https://www.tarteel.ai/terms`.
That page is a JavaScript shell: it serves a `<title>` of "Terms of Service –
Tarteel AI Quran Memorization" and **no readable body text** without executing
scripts. Two independent fetches returned no clause text. So the terms QUL
points at could not be read, and nothing in them can be quoted here.

**QUL's own code** is separately licensed — `TarteelAI/quranic-universal-library`
on GitHub — but that covers the Rails application, not the hosted data.

#### Exposure, in one paragraph

We intend to bundle, inside a distributed Android binary, two things we did not
author: per-page QCF glyph fonts produced by the King Fahd Complex for the
Printing of the Holy Quran, and page/line layout data describing a KFGQPC
printed edition. Neither carries any grant of any kind — not a permissive
licence, not a restrictive one, not a terms-of-use clause we could even read.
We are shipping under the *absence* of a stated licence, which is not
permission; the default position is that the rights holder retains everything.
The realistic consequence is small and specific: KFGQPC has never, to our
knowledge, pursued a Quran-reading app for using its fonts — dozens of them do,
including quran.com, which serves these exact files from
`verses.quran.foundation` — and the realistic worst case is a takedown request
asking us to stop, which we would honour by falling back to the Unicode
`text_qpc_hafs` rendering the app can already do. There is no user-data or
security dimension. Ruling 9 accepted this; this paragraph is what was
accepted.

### §2 Layout validation

#### Ruling — the source changed, and why

The plan assumed QUL's SQLite exports. **They are login-gated**: every
`Download sqlite` button on `/resources/mushaf-layout/{10,15,19}` is an
`ajax-modal` pointing at `/users/sign_in`, not a file. Rather than create an
account to script against, the layout came from the **open quran.com v4 API**,
which serves the same KFGQPC word data with no key:

```
https://api.quran.com/api/v4/verses/by_page/{1..604}
  ?words=true&word_fields=code_v1,code_v2,line_number,page_number,
   text_uthmani,text_qpc_hafs,char_type_name,position&per_page=300
```

604 JSON files, **32,375,809 bytes**, fetched 2026-09-07 at ~2 req/s into
`~/quran-data/refdata/mushaf/pages/`. sha256 of the files concatenated in page
order: `2ebbfb878ae47755f2801047c6ee2840d045098279d4f47d989efac6702c8cc7`.
The request needs a `User-Agent`; urllib's default gets a flat 403.

What this source does **not** carry is QUL's `line_type` / `is_centered`
columns. It does not need to: line numbers already reserve the lines a surah
band and a bismillah occupy, so those lines show up as gaps in the occupied
set — page 2 occupies 6 lines, page 106 occupies 13. M7b infers band lines
from the gaps rather than importing a column.

**Ruling — V4 is out of the spike.** No open source publishes `code_v4` word
codes: `/quran/verses/code_v4` silently falls back to `text_uthmani`, and the
codes exist only behind the same QUL login. QUL's own V4 pages also say the V4
tajweed fonts are "currently disabled, we're proofreading them". So the edition
choice in Task 6 is **V1 vs V2**, six renders not nine. Cost if wrong: if the
owner wants V4 later, it needs a QUL account and a re-run of Task 2 only.

#### Two traps in the data, both load-bearing for M7b

**1. The API emits duplicate JSON keys.** Every word carries `line_number`
twice. The first is the **V1** line; the second, next to `page_number`, is the
**V2** line. A plain `json.load` keeps only the last, so a naive reader
positions V1 glyphs using V2 line numbers and never sees an error. Confirmed
against the per-script endpoints: 5:77 has `v1_page` 121 and `v2_page` 120, and
the word's two values are line 1 (V1) and page 120 / line 13 (V2). The
validator parses with an `object_pairs_hook` that keeps both.

**2. `by_page` paginates by V1, and returns whole verses.** A verse straddling
a page boundary appears in both request files, so words must be assigned by
their own page, not by the request. For V2 that means regrouping across request
files entirely, because V2's page breaks differ from V1's.

A third trap killed an early version of the checker: **word `id` is not
reading order.** On page 106, 4:176 carries id 83385 while 5:2 on the same page
carries 1544. Payload order is reading order; any sort or arithmetic on ids is
wrong.

#### Results — `check_mushaf_layout.py`, all 604 pages

| Check | V1 | V2 |
|---|---|---|
| pages 1..604 present | 604 / 604 | 604 / 604 |
| words | 83,665 | 83,665 |
| line numbers inside 1..15 | clean | clean |
| lines in reading order, unbroken | clean | **3 problems, page 589** |
| words with no glyph code | none | none |
| **agreement with our `ayahs.page`** | **0 disagreements** | **36 disagreements** |

**V1 validates completely clean.** Our `ayahs.page` matches the V1 layout on
every one of the 604 pages — the corpus is already paged to V1, so choosing V1
costs no re-paging and no migration of existing page data.

**V2 disagrees with our corpus on 18 ayahs**, always as a one-page shift at a
boundary: 5:77, 5:83, 5:90, 6:131, 55:17-18, 55:41, 55:68-69, 68:16, 69:35,
70:40, 74:18, 79:16, 80:41-42, 83:5-6, 83:34, 84:25 and neighbours. This is not
an import bug on either side — it is the two KFGQPC prints genuinely breaking
pages in different places. Choosing V2 means re-paging `ayahs.page`, which
moves page-browse and every stored reading position.

**V2 also carries one upstream defect.** On page 589, ayah 84:21's end-of-ayah
marker (word id 23997) is on **line 13** while the five words of the same ayah
before it are on **line 14**. Rendered literally, the verse number would jump a
line backwards. V1 has no equivalent. (The sajdah mark on 84:21 is also merged
into word 23995 rather than carrying its own id — id 23996 does not appear.)

#### Mutation check

Three corruptions of a copy of page 106, one at a time; each was caught by the
check meant to catch it, and each run exited non-zero:

| Corruption | Reported as |
|---|---|
| a `line_number` set to 99 | `page 106: line numbers outside 1..15: [99]` |
| the page's verses reversed | `line 8 appears after line 15 in reading order`, `line 10 is broken into two runs` |
| verse 5:1 deleted from the page | `page 106: layout-only -, corpus-only [(5, 1)]` |

Script: `$CLAUDE_JOB_DIR/tmp/mutate_check.sh` (throwaway, not committed).

### §3 Byte cost

Fonts came from `https://verses.quran.foundation/fonts/quran/hafs/{ed}/{fmt}/p{N}.{fmt}`,
604 pages per edition per format, into `~/quran-data/refdata/mushaf/fonts/`.
`static-cdn.tarteel.ai/qul/fonts/quran_fonts/...` serves byte-identical files;
a 15-page sample matched on every one, so the host is not a lever.

**As shipped by the upstream CDN.** "in APK" is the raw size times the deflate
ratio measured on a 40-file sample, because Android stores `assets/` deflated;
WOFF2 is already Brotli-compressed, so deflate does nothing to it.

| Edition | Format | Files | Raw | In APK | min / median / max per page |
|---|---|---|---|---|---|
| V1 | WOFF2 | 604 | 47.9 MB | **48.0 MB** | 15 / 79 / 93 KB |
| V1 | TTF | 604 | 94.9 MB | **54.6 MB** | 27 / 155 / 173 KB |
| V2 | WOFF2 | 604 | 97.7 MB | **97.8 MB** | 40 / 167 / 221 KB |
| V2 | TTF | 279 of 604 | — | — | projected 206 MB raw from a 15-page sample |

Every one of them busts ruling 8's ~40 MB budget. The V2 TTF download was
abandoned at 279 files: at ~206 MB raw it is five times the budget, and V2 had
already lost §2 on validation, so finishing it would have bought nothing.

**Subsetting is the lever, and it is enough.** A page font ships **608 glyphs**
but a page uses roughly a quarter of them — `glyf` alone is 136 KB of p300's
159 KB. Subsetting each font to exactly the codepoints its own page's layout
rows use (fontTools, `--layout-features=* --no-hinting --desubroutinize`),
measured over the same 15-page sample and projected to 604:

| Edition | Format | Raw after subsetting | In APK |
|---|---|---|---|
| V1 | WOFF2 | 33.7 MB | **33.7 MB** |
| V1 | TTF | 54.4 MB | **37.2 MB** |

**Both V1 options fit the budget after subsetting**, so the phase survives on
size either way and the WOFF2-vs-TTF question in Task 4 is no longer a budget
question — it is only about whether RN Android will load a WOFF2 at all.

Note `fontTools` is not currently a dependency of `packages/scraper`. Adding it
is a §12 question for M7b, not something M7a does.

**Everything else the bundle grows by.** The layout itself is small: the 604
API responses are 32 MB of JSON, but almost all of that is translation,
transliteration and audio fields we discard. The rows we keep are one per word
— 83,665 rows of (page, line, surah, ayah, position, glyph) — which is roughly
the size of a single existing table in `quran.db` and negligible beside its
current 140 MB.

### §4 Font registration on RN Android

Run on the owner's GM1917 (OnePlus 7 Pro, Android 11), 2026-09-07, through
**Expo Go** over LAN Metro — not a release build. Expo Go resolves an asset
`require()` through the dev server rather than from `assets/` inside an APK, so
the *registration* answers below are Expo Go's; the format answer is a decoder
answer and does not depend on that path. Task 8 leaves nothing behind to
re-check, so M7b's first device run must re-confirm registration from a real
build before the importer is written.

| Question | Answer | Evidence |
| --- | --- | --- |
| Does runtime `loadAsync` register a font that was never in the static manifest? | **Yes** | `spike_v2_ttf_p2` registered and rendered; six page fonts registered in one session, 37-101 ms each |
| Does WOFF2 work? | **No** | `loadAsync` *resolves* on a WOFF2 in 37 ms with no error, and the text renders identically to the not-loaded state — system-font fallback |
| Does per-word tinting keep shaping in glyph text? | **Yes** | alternating-colour words, line breaks and word positions pixel-identical to the untinted render |
| Does it break the Unicode fallback? | **No, at word granularity** | one `Text` per *word* shapes the same as one `Text` for the line |

**The WOFF2 result is the dangerous one, and it fails silently.** `Font.loadAsync`
resolved successfully, the UI said `registered as spike_v2_woff2_p2`, and the
glyphs on screen were the system font's interpretation of the QCF code points —
readable-looking Arabic nonsense, not tofu, so a screenshot alone would not
catch it. Nothing in the promise, the return value, or the console distinguishes
this from success. **M7b bundles TTF.** Ruling: the only safe check for a
registered font is a rendered-pixel comparison against the not-loaded state,
because both the API and the eye pass a font that never loaded.

That kills the WOFF2 half of §3's byte table, which is why subsetting stops
being optional: subset **V1 TTF is 37.2 MB in-APK**, and unsubset TTF (54.6 MB)
is over budget. §3's 33.7 MB WOFF2 figure is now dead.

**Per-word tinting is safe; per-segment is still not.** Memory
`rn-android-breaks-shaping-across-nested-text` holds, but its boundary is
narrower than it reads: a nested `Text` breaks joining *inside* a word, and QCF
glyph words never join to their neighbours anyway. The Unicode fallback survived
per-word nesting too, for the same reason — the split lands on spaces, which
join nothing. So ruling 20's three highlight states are buildable in both glyph
and fallback text, and only sub-word (per-segment) colouring stays banned.

### §5 Device session

Six renders captured (3 pages x V1/V2; V4 ruled out in §2), plus the
comparison sheet `m7a-edition-comparison.png` sent to the owner.

**What the renders prove.** The page font applies: correct KFGQPC letterforms,
correct ayah medallions, and mushaf line breaks — page 2 ends its sixth line on
`hum al-muflihun`, page 604 carries al-Ikhlas, al-Falaq and an-Nas as in print.

**What they also expose — a real M7b requirement.** At a fixed `fontSize: 26`
only page 2 fills the width edge to edge; pages 106 and 604 overflow and wrap
each mushaf line onto a second row, which is visually wrong in a paged mushaf.
The page font fits a line to *its own* nominal width, not to the device's. So
M7b must scale font size per page from the widest line's measured advance
against the available width, and clip rather than wrap (`numberOfLines={1}`) so
an overflow is loud instead of silently re-flowing. This is the visual half of
what M6l's row-estimation work did for the scroll reader.

**The visible difference between the editions.** V1 sets the text wider and more
openly, with ornate crowned ayah medallions; V2 sets tighter, fits more per line,
and uses a plain oval medallion. Both are KFGQPC Hafs; neither is more correct.

**Edition ruling: pending the owner.** The evidence outside taste all points one
way and is recorded in §2 and §3: V1 agrees with our own `ayahs.page` on all 604
pages (V2 disagrees on 18 ayahs and carries an upstream line-number defect on
page 589), and V1 is roughly half V2's byte cost. Choosing V2 costs a re-paging
migration of `ayahs.page` plus every stored reading position.

### §6 Decision
