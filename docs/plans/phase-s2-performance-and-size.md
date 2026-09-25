# Phase S2 — Performance and Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the Android build under a distributable size and make every performance claim a measured number rather than an impression.

**Architecture:** Measure first, then cut. Task 1 builds the baseline and nothing else, so every later task has to move a number it did not choose after the fact. The size work is all in the **build pipeline** (`packages/mobile-data/scripts`), not in app code — the bundled DB is currently a byte-for-byte copy of the web DB, so the app ships five translator sets it cannot display. The fonts are a distribution-model problem, not a compression one: Task 5 moves them into a Play Asset Delivery install-time pack (owner ruling, 2026-09-24), while the F-Droid artefact keeps them inline.

**Tech Stack:** SQLite / libsql (`packages/data`, `packages/mobile-data`), Expo RN + Metro, Gradle, `adb shell dumpsys gfxinfo … framestats`, Next.js App Router (`apps/web`), Lighthouse.

**Spec:** This file. Upstream authority: `CLAUDE.md` §2 (package boundaries — `packages/data` is the single source of truth), §3, §7, §8 (60fps target), §10. Baseline measurements taken 2026-09-24 are recorded inline; they are starting points, not acceptance criteria.

## Global Constraints

- Ship scope is **both** `apps/mobile` and `apps/web` (owner, 2026-09-24).
- **Measure-first** (owner, 2026-09-24): no optimisation task may be marked done without a before/after number from the same instrument.
- **Measure the number Play measures.** Every size cap is on the *compressed download*, not on bytes on disk. The APK already deflates 356 MB of `assets/` down to 219 MB, and the DB's 165 MB become 41.6 MB inside it — so a raw-byte saving is worth roughly a quarter of itself, and a table that mixes the two units argues for the wrong lever. Record both.
- `packages/data` is the single source of truth for schema and queries. Pruning happens in the **mobile export script**, never by editing the canonical DB. `apps/web/quran.db` → `/home/claude/quran-data/quran.db` is the live corpus and is **never written** by this phase. (`syncM1ReaderDbAsset` does run `checkpointWal` on it, which folds the WAL into the main file — that predates this phase, is deliberate, and nothing here adds to it.)
- `packages/scraper/quran.db` is a stale 0-root stub. Never read it, never write it.
- Reference DBs live outside git at `~/quran-data/refdata/`; never copy them into the repo.
- `taskset -c 7,8` is mandatory for every Gradle invocation (an unconstrained run hit load 136). Never run Gradle while `expo start` is running.
- Never `npm run build` in `apps/web` while `next dev` is running — shared `.next`, and recovery costs a `rm -rf .next`.
- Metro's watcher is dead in this container: every edit needs `expo start --clear`.
- `adb install -r --user 0`, always.
- The phone under `adb` is also this session's display: coordinate every device run with the owner.
- §5 independent review is required for **Tasks 2 and 3** — they change what `packages/data`'s export pipeline hands every mobile consumer. Task 4 triggers it only if it is not declined. `/code-review` is user-triggered; the agent stops and asks.
- Conventional Commits. Scopes: `mobile-data`, `data`, `mobile`, `web`.

---

## Baseline, as measured 2026-09-24

Recorded so the plan argues from numbers. Task 1 re-takes them properly. The
`zip` column is the entry's compressed size inside the release APK, read with
`python3 -m zipfile`/`zipfile.ZipFile(...).infolist()` — that is the column
the Play cap applies to.

| Thing | On disk | In the APK |
| --- | --- | --- |
| Release APK (vc54, arm64-v8a only) | — | **219.0 MB** (219,017,783 B) |
| `assets/db/quran.db` | 164.8 MB | **41.6 MB** |
| `assets/fonts` (613 TTFs) | 191.0 MB | **127.3 MB** |
| — of which `assets/fonts/mushaf`, 604 per-page TTFs | 189.7 MB | ~126 MB |
| Everything else in `assets/` | ~1.3 MB | — |
| `lib/arm64-v8a` + dex + JS bundle + res | — | ~50 MB |

Per-table `pgsize` / `unused` from `dbstat` (MB):

| Table | pgsize | unused |
| --- | --- | --- |
| `words` | 65.0 | **36.1** |
| `search_fts_content` | 20.6 | 1.4 |
| `translations` | 20.0 | 1.5 |
| `search_fts_data` | 10.3 | 0.1 |
| `word_glosses` | 9.8 | 0.2 |

`translations` carries **9 translator sets** at 6236 ayahs each; the reader can
render **4** (`packages/mobile-data/src/translators.ts`). The five it cannot:
Elmir Kuliev, Ministry of Awqaf Egypt, Rowwad Translation Center, Alauddin
Mansour, Muhammad Sodik Muhammad Yusuf.

Measured on a copy of the bundled DB, each step cumulative:

| Step | Raw | Deflated | Cost |
| --- | --- | --- | --- |
| as shipped | 164.8 MB | 42.2 MB | — |
| `VACUUM` | 127.0 MB | 36.1 MB | 2.3 s |
| + prune the 5 unreadable sets | 101.3 MB | 30.4 MB | **7.5 min** (the FTS delete trigger fires per row) |
| + drop `search_fts_content` | 93.1 MB | 28.0 MB | query rewrite, see Task 4 |

**The finding that shapes this phase.** Play stopped accepting new APK uploads
in August 2021; the shippable artefact is an **app bundle**, whose cap is a
**200 MB compressed download** for the initial install. (The old bare-APK cap
was 100 MB, not 150 — a plan that budgets against 150 MB is budgeting against
a number that never applied to this artefact.)

The current build is 219.0 MB. Every DB lever above, landed perfectly, takes
**14.2 MB** off the download: 219.0 → ~205 MB. Still over. The 604 page fonts
are 126 MB of the download — 58% of it — and nothing compresses them further,
because the TTFs are already per-page subsets and WOFF2 is a dead end here
(`Font.loadAsync` resolves with no error, silently falls back to the system
face, and only a pixel diff catches it).

So Task 5 is not an optimisation; it is the thing that makes the app
distributable. But note what the corrected arithmetic does *not* say: the
fonts are not impossible to ship. Play Asset Delivery **install-time** packs
raise the ceiling to roughly 1 GB and are present before first launch, so
option A below is not "fetch them later" — it is "ship them, outside the
200 MB base". That is the trade-off the owner ruled on: an install-time pack (Task 5).

Distribution is Play **and** F-Droid. F-Droid has no size cap and no asset
packs, so it ships the fonts inline — the build we have today. Task 5 is
therefore a Play flavour, and the inline path has to keep working.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `docs/plans/phase-s2-performance-and-size.md` (this file) | Baseline table and verification log. |
| `$CLAUDE_JOB_DIR/tmp/s2-measure.sh` (create, scratch) | One script that takes every mobile number, so before and after come from the same instrument. |
| `packages/mobile-data/scripts/sealDb.ts` (modify) | Gains the VACUUM step. Sealing already owns "make this file fit to ship"; repacking belongs with it. |
| `packages/mobile-data/scripts/pruneForMobile.ts` (create) | Drops the translator sets the app cannot read. Pure SQL against the *copy*, never the source. |
| `packages/mobile-data/scripts/create-m1-reader-db.ts` (modify) | Calls the prune between `copyFile` and `sealDbForBundling`. |
| `packages/mobile-data/tests/pruneForMobile.test.ts` (create) | Proves the prune keeps every selected translator, drops every other one, and takes their search rows with them. |
| `apps/mobile/plugins/withMushafAssetPack.js` (create, Task 5) | Config plugin that builds the install-time asset pack on every prebuild — `android/` is gitignored prebuild output, so the pack module cannot be committed. |
| `apps/mobile/src/data/mushafFontSource.ts` (create, Task 5) | One place the Play and F-Droid font paths differ. |
| `apps/web/src/app/**` (modify, Task 6) | Web-side wins, scoped by Task 1's web baseline. |

---

### Task 1: Build the instrument and take the baseline

Nothing is optimised in this task. Its entire deliverable is numbers that a
later task can be measured against, taken by a script so that "after" is not
quietly measured a different way than "before" — which is how the reader-jump
correlator produced a confident −97 for a commanded +100.

**Files:**
- Create: `$CLAUDE_JOB_DIR/tmp/s2-measure.sh`
- Modify: `docs/plans/phase-s2-performance-and-size.md` (Baseline Log)

**Interfaces:**
- Produces: `s2-measure.sh` writing a TSV to
  `$CLAUDE_JOB_DIR/tmp/s2-<label>.tsv` with columns
  `metric<TAB>value<TAB>unit`. Every later task re-runs it with a new label
  and diffs.

- [ ] **Step 1: Write the measurement script**

```bash
cat > "$CLAUDE_JOB_DIR/tmp/s2-measure.sh" <<'SH'
#!/usr/bin/env bash
# One instrument for every mobile number in phase S2. Usage: s2-measure.sh <label>
set -euo pipefail
LABEL="${1:?usage: s2-measure.sh <label>}"
OUT="$CLAUDE_JOB_DIR/tmp/s2-$LABEL.tsv"
PKG=com.qurancorpus.mobile
REPO=/home/claude/projects/quran-corpus-pwa
APK="$REPO/apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
: > "$OUT"

emit() { printf '%s\t%s\t%s\n' "$1" "$2" "$3" >> "$OUT"; }

# --- static sizes: no device needed ---
emit apk_bytes "$(stat -c%s "$APK")" bytes
emit db_bytes  "$(stat -c%s "$REPO/apps/mobile/assets/db/quran.db")" bytes
emit fonts_bytes "$(du -sb "$REPO/apps/mobile/assets/fonts" | cut -f1)" bytes

# --- compressed sizes: the column Play's cap is actually about ---
# stat -c%s on the asset measures bytes we never ship. The APK is a zip; the
# entry's compress_size is the byte count that lands on a user's connection.
python3 - "$APK" >> "$OUT" <<'PY'
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
db = fonts = 0
for i in z.infolist():
    if i.filename.endswith('.db'):
        db += i.compress_size
    elif i.filename.endswith('.ttf'):
        fonts += i.compress_size
print(f"apk_db_zip_bytes\t{db}\tbytes")
print(f"apk_fonts_zip_bytes\t{fonts}\tbytes")
PY

# --- cold start: force-stop, launch, read the framework's own TotalTime ---
# Three runs. One is noise; the median of three is a number.
for i in 1 2 3; do
  adb shell am force-stop "$PKG"
  sleep 2
  # tr -d ' \r': adb shell returns CRLF, and a trailing \r turns the value into
  # a string no later arithmetic can use.
  T=$(adb shell am start -W -n "$PKG/.MainActivity" 2>/dev/null \
      | awk -F: '/^TotalTime/{print $2}' | tr -d ' \r')
  emit "cold_start_run$i" "$T" ms
done

# --- jank: framestats GAPS, not durations ---
# A stalled UI thread produces a long gap BETWEEN frames while each frame it
# does emit still looks fast, so percentiles and frame durations are both
# blind to exactly the stall we care about.
#
# gfxinfo keeps only the LAST 120 frames, so the swipe below has to be short
# enough to fit -- at 60fps that is two seconds. A ten-page swipe overflows the
# buffer and silently reports the tail of it.
adb shell dumpsys gfxinfo "$PKG" reset > /dev/null
echo "INTERACT NOW: swipe the mushaf 3 pages (~2s), then press enter" >&2
read -r _
adb shell dumpsys gfxinfo "$PKG" framestats \
  > "$CLAUDE_JOB_DIR/tmp/s2-$LABEL-framestats.csv"
python3 - "$CLAUDE_JOB_DIR/tmp/s2-$LABEL-framestats.csv" >> "$OUT" <<'PY'
import sys
# The PROFILEDATA header is
#   Flags,IntendedVsync,Vsync,OldestInputEvent,...  (19 columns)
# so parts[0] is Flags and parts[1] is IntendedVsync (ns). The gap between
# consecutive intended vsyncs is what a UI-thread stall actually widens.
#
# Flags != 0 rows are frames the framework itself marks as not comparable
# (window layout changed, etc). Dropping them is why the p95 means something.
ts = []
for line in open(sys.argv[1]):
    parts = line.strip().split(',')
    if len(parts) < 19 or not parts[0].isdigit():
        continue
    if parts[0] != '0':
        continue
    ts.append(int(parts[1]))
ts.sort()
gaps = [(b - a) / 1e6 for a, b in zip(ts, ts[1:])]
if gaps:
    gaps.sort()
    print(f"frame_gap_p50\t{gaps[len(gaps)//2]:.1f}\tms")
    print(f"frame_gap_p95\t{gaps[int(len(gaps)*0.95)]:.1f}\tms")
    print(f"frame_gap_max\t{gaps[-1]:.1f}\tms")
    print(f"frames_over_32ms\t{sum(1 for g in gaps if g > 32)}\tcount")
    print(f"frames_total\t{len(gaps)}\tcount")
else:
    print("frames_total\t0\tcount")   # loudly, rather than an empty TSV
PY
echo "wrote $OUT" >&2
SH
chmod +x "$CLAUDE_JOB_DIR/tmp/s2-measure.sh"
```

- [ ] **Step 2: Prove the instrument is not vacuous**

An instrument that reports the same number whatever it is pointed at measures
nothing. Before trusting it, make it report a difference you already know is
there.

Run the framestats arm twice: once swiping the mushaf (known-heavy, ~146
texture uploads per frame before the hardware-layer fix), once sitting still
on the About screen.

Expected: `frames_over_32ms` is materially higher on the mushaf arm, and
`frames_total` is non-zero on both. If the two arms report the same thing, or
either reports zero frames, the instrument is broken — fix it before taking
any baseline, and record what was wrong.

- [ ] **Step 3: Take the mobile baseline**

```bash
"$CLAUDE_JOB_DIR/tmp/s2-measure.sh" baseline
cat "$CLAUDE_JOB_DIR/tmp/s2-baseline.tsv"
```

Coordinate with the owner — the script asks for a manual swipe, and the phone
is their display.

- [ ] **Step 4: Take the artefact Play would actually receive**

The APK is a proxy. The shipped artefact is an app bundle, and the 200 MB cap
is on the download Play generates from it, which is not the same number.

```bash
# same env as build54.sh; taskset is mandatory
taskset -c 7,8 nice -n 19 ./gradlew bundleRelease -x lint \
  -PreactNativeArchitectures=arm64-v8a --max-workers=2 --no-daemon --console=plain
ls -l app/build/outputs/bundle/release/app-release.aab
```

If `bundletool` is available, `bundletool build-apks --mode=default` then
`bundletool get-size total` gives the real download figure. If it is not,
**say so in the log and carry the AAB's own size as an upper bound** — do not
quietly substitute the APK number and call it the download size.

This step may be declined if the owner does not want a second 40-minute build
this phase. Declining it is fine; asserting a download size without it is not.

- [ ] **Step 5: Take the web baseline**

```bash
cd apps/web
# Never while `next dev` is running: shared .next, and recovery is rm -rf .next
pnpm build 2>&1 | tee "$CLAUDE_JOB_DIR/tmp/s2-web-build.txt"
```

Record from the build output, per route: First Load JS, and which routes are
static vs dynamic. Then, against a running production server:

```bash
npx lighthouse http://localhost:3000/surah/2 \
  --preset=desktop --output=json \
  --output-path="$CLAUDE_JOB_DIR/tmp/s2-web-baseline.json" --quiet
python3 -c "
import json;a=json.load(open('$CLAUDE_JOB_DIR/tmp/s2-web-baseline.json'))['audits']
for k in ('largest-contentful-paint','total-blocking-time','cumulative-layout-shift','server-response-time'):
    print(k, a[k]['displayValue'])"
```

Lighthouse is not a dependency of this repo and drives headless Chrome. If
`npx` cannot get it running in this container, fall back to the build output's
First Load JS plus a hand-timed TTFB (`curl -o /dev/null -w '%{time_starttransfer}'`)
and record which instrument was used — Task 6's "after" must then use the same
one.

Al-Baqara is the right route to measure: 286 ayahs, the worst real page.

**Note for whoever reads the result:** every page is `force-dynamic` because
a strict CSP nonce cannot be baked into a static prerender (the app-wide
flash-then-blank fixed in PR #25). So a poor TTFB here is expected and is
*architectural*, not a missing cache — do not "fix" it by removing
`force-dynamic` without re-reading that decision.

- [ ] **Step 6: Write both baselines into the log and commit**

```bash
git add docs/plans/phase-s2-performance-and-size.md
git commit -m "docs(mobile): record the S2 performance baseline"
```

**Acceptance criteria:**
- `s2-baseline.tsv` exists with all of: `apk_bytes`, `db_bytes`,
  `fonts_bytes`, `apk_db_zip_bytes`, `apk_fonts_zip_bytes`, three
  `cold_start_run*`, and the five frame-gap metrics.
- Step 2's non-vacuity check is recorded, with both arms' numbers.
- The AAB download size is recorded, or Step 4 is recorded as declined.
- The web baseline names per-route First Load JS and the four audits above,
  or names the fallback instrument used instead.

**Risk:** Measuring on a phone that is also the display, with the owner
driving the swipe, gives a human-timed interaction window.
**Mitigation:** Three repeats, and report gaps rather than totals — the metric
is insensitive to how long the window was, only to what happened inside it.

---

### Task 2: VACUUM the bundled database at seal time

The cheapest win in the phase: 37.8 MB on disk, **6.0 MB of download**, in
2.3 s, measured and reproducible. Note the gap between those two numbers — it
is the reason Task 5 exists.

**Files:**
- Modify: `packages/mobile-data/scripts/sealDb.ts`
- Create: `packages/mobile-data/tests/sealDb.vacuum.test.ts`

**Interfaces:**
- Consumes: `sealOpenDb(db: SealableDb): Promise<void>` and
  `checkpointWal(db: SealableDb): Promise<void>`, both already exported from
  `packages/mobile-data/scripts/sealDb.ts`.
- Produces: no new export. `sealOpenDb`'s contract widens from "make this file
  self-contained" to "make this file self-contained and compact".

**Why here:** `sealDbForBundling` already owns "make this copy fit to ship",
and it runs on the copy, after `copyFile`, with nothing else holding the file.
That is exactly the one moment a VACUUM is safe and free of consequence for
the canonical DB.

**Why the file is fragmented at all:** 36.1 MB of the `words` table's 65.0 MB
is unused space *inside* allocated pages, not on the freelist (`freelist_count`
is 149) — the signature of rows grown by UPDATE. `morphology_description`,
`grammar_note` and `pos_tag` were each backfilled after the rows existed.

**`sealOpenDb` has a second caller.** `create-m0-fixture-db.ts:259` seals the
M0 fixture on its own connection. Vacuuming a 180 KB fixture is harmless, but
it is a behaviour change to a second consumer: run
`npx vitest run tests/m0Fixture.test.ts` as part of Step 4, not only the new
file.

- [ ] **Step 1: Write the failing test**

Create `packages/mobile-data/tests/sealDb.vacuum.test.ts`:

```ts
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createDatabase } from '@quran-corpus/data';
import { sealDbForBundling } from '../scripts/sealDb.js';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'seal-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

it('repacks a fragmented database instead of shipping its holes', async () => {
  const path = join(dir, 'frag.db');
  const db = createDatabase(`file:${path}`);
  // Real fragmentation, built the way the corpus got it: insert short rows,
  // then grow every one of them with an UPDATE. A plain delete-then-insert
  // would land on the freelist, which is NOT what the corpus DB has.
  //
  // Three statements, not 4000 awaited round-trips. The loop version of this
  // took 59 s and blew vitest's 5 s default timeout -- a test that has to be
  // given a timeout to run at all is one nobody will keep.
  await db.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, body TEXT)');
  await db.execute(`WITH RECURSIVE s(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM s WHERE i<4000)
                    INSERT INTO t SELECT i, 'x' FROM s`);
  await db.execute("UPDATE t SET body = hex(zeroblob(1500))");
  await db.execute('DELETE FROM t WHERE id % 2 = 0');
  db.close();

  const before = (await stat(path)).size;
  await sealDbForBundling(path);
  const after = (await stat(path)).size;

  // Measured on this fixture: 16.4 MB -> 8.2 MB, exactly 0.50.
  expect(after).toBeLessThan(before * 0.8);
});

it('is still self-contained after the repack', async () => {
  const path = join(dir, 'sealed.db');
  const db = createDatabase(`file:${path}`);
  await db.execute('CREATE TABLE t (id INTEGER PRIMARY KEY)');
  db.close();
  await sealDbForBundling(path);

  const reopened = createDatabase(`file:${path}`);
  const mode = await reopened.execute('PRAGMA journal_mode');
  reopened.close();
  // The whole reason sealing exists: a WAL-mode header sends SQLite looking
  // for a -wal sidecar that never travels inside the APK, and it fails with a
  // null handle before serving one statement.
  expect(String(mode.rows[0]?.journal_mode).toLowerCase()).toBe('delete');
});
```

- [ ] **Step 2: Run it and watch the first test fail**

```bash
cd packages/mobile-data && npx vitest run tests/sealDb.vacuum.test.ts
```

Expected: the repack test FAILS (`after` is not below `before * 0.8`); the
self-contained test PASSES, because sealing already does that half.

- [ ] **Step 3: Add the VACUUM**

In `packages/mobile-data/scripts/sealDb.ts`, inside `sealOpenDb`, **after** the
`journal_mode = DELETE` check:

```ts
  // Repack. 36 of the corpus DB's 65 MB `words` table is unused space inside
  // allocated pages -- rows grown by the morphology_description, grammar_note
  // and pos_tag backfills -- and a bundled asset pays for every hole it ships.
  // Measured 2026-09-24: 164.8 MB -> 127.0 MB in 2.3 s (6.0 MB of download).
  //
  // Last, because VACUUM cannot run inside a transaction and must own the
  // file: this is the one point in sealing where both hold. (The ORDER does
  // not decide the journal mode -- vacuum-then-seal and seal-then-vacuum were
  // both measured to end in DELETE, because the mode switch rewrites the
  // header either way. Do not justify the placement on that.)
  await db.execute('VACUUM');
```

- [ ] **Step 4: Run both tests, and the M0 fixture's**

```bash
cd packages/mobile-data && npx vitest run tests/sealDb.vacuum.test.ts tests/m0Fixture.test.ts
```

Expected: PASS.

- [ ] **Step 5: Mutation-check**

```bash
cp packages/mobile-data/scripts/sealDb.ts "$CLAUDE_JOB_DIR/tmp/mut-seal.ts"
# comment out the VACUUM line
cd packages/mobile-data && npx vitest run tests/sealDb.vacuum.test.ts
```

Expected: the repack test FAILS. A test that passes both ways asserts nothing —
that has slipped through twice already (PRs #71, #73).

```bash
cp "$CLAUDE_JOB_DIR/tmp/mut-seal.ts" packages/mobile-data/scripts/sealDb.ts
```

Never `git checkout` to restore a mutation edit.

Also confirm the bytecode/module cache is not serving a stale copy: an edit of
equal length within the same second has silently kept a mutant running before.
Check the file with `grep -c VACUUM packages/mobile-data/scripts/sealDb.ts`
after restoring; expect `1`.

- [ ] **Step 6: Regenerate the bundled DB and measure**

```bash
cd /home/claude/projects/quran-corpus-pwa && pnpm generate:m1-db
ls -la apps/mobile/assets/db/quran.db
```

`pnpm generate:m1-db` → turbo → `packages/mobile-data` `tsx scripts/create-m1-reader-db.ts`,
with `^build` first, so an edit to `packages/data` is compiled before the
script reads it. It checkpoints the canonical DB, copies it, seals the copy,
and re-validates 114 surahs / 6236 ayahs / 6236 rows per selected translator.

Expected: ~127 MB, down from 164.8 MB.

- [ ] **Step 7: Verify the regenerated DB still answers**

```bash
python3 -c "
import sqlite3;d=sqlite3.connect('apps/mobile/assets/db/quran.db')
print('ayahs', d.execute('SELECT count(*) FROM ayahs').fetchone()[0])
print('words', d.execute('SELECT count(*) FROM words').fetchone()[0])
print('segments', d.execute('SELECT count(*) FROM word_segments').fetchone()[0])
print('fts ar', d.execute(\"SELECT count(*) FROM search_fts WHERE search_fts MATCH 'الله'\").fetchone()[0])
print('fts en', d.execute(\"SELECT count(*) FROM search_fts WHERE search_fts MATCH 'merciful'\").fetchone()[0])
print('fts ru', d.execute(\"SELECT count(*) FROM search_fts WHERE search_fts MATCH 'Милостивый'\").fetchone()[0])
print('mushaf p1', d.execute('SELECT count(*) FROM mushaf_layout WHERE page=1').fetchone()[0])
"
```

Expected: 6236 ayahs, 77429 words, non-zero segments, **1663 / 172 / 65** FTS
hits, non-zero page-1 lines. **A size win that lost rows is not a win** — the
gloss gate was blind to exactly this, passing its shape buckets while text had
been deleted.

Three real terms, not one: `'rahman'` returns **0 on the untouched DB** (the
Arabic body is normalized Arabic, and the English set renders it "Merciful"),
so a smoke test on it reports the same zero before and after — which is both
vacuous and indistinguishable from having broken search. The column is `page`,
not `page_number`.

- [ ] **Step 8: Commit**

```bash
git add packages/mobile-data/scripts/sealDb.ts packages/mobile-data/tests/sealDb.vacuum.test.ts
git commit -m "perf(mobile-data): vacuum the bundled corpus before shipping it

36 of the words table's 65 MB is unused space inside allocated pages, left by
the morphology_description, grammar_note and pos_tag backfills growing rows
that were already on disk. The APK paid for every hole.

Measured: 164.8 MB -> 127.0 MB on disk in 2.3 s, which is 6.0 MB off the
compressed download. Runs on the copy at seal time, where nothing else holds
the file and no transaction is open -- the canonical DB that apps/web reads is
never touched."
```

**Acceptance criteria:** bundled DB ≈ 127 MB; row counts and the three FTS hit
counts in Step 7 unchanged; the mutation-check in Step 5 actually failed.

**§5:** this changes what every mobile consumer receives from `packages/data`'s
export pipeline → **stop and ask the owner to run `/code-review`** before
moving on.

**Risk:** a VACUUM that fails halfway leaves a truncated bundled asset.
**Rollback:** the bundled DB is a generated artefact; delete it and re-run
`pnpm generate:m1-db`. The canonical source is never written.

---

### Task 3: Stop shipping translations the app cannot display

**Files:**
- Create: `packages/mobile-data/scripts/pruneForMobile.ts`
- Create: `packages/mobile-data/tests/pruneForMobile.test.ts`
- Modify: `packages/mobile-data/scripts/create-m1-reader-db.ts`

**Interfaces:**
- Consumes: `selectedTranslators` from `packages/mobile-data/src/translators.ts`
  — `{ en: 'Saheeh International', ru: 'Abu Adel', uz: 'Tasnim', 'uz-Cyrl': 'Tasnim' }`.
- Produces: `export async function pruneForMobile(dbPath: string): Promise<{ translationsDeleted: number }>`.
  Called by `syncM1ReaderDbAsset` between `copyFile` and `sealDbForBundling`.

**Why:** the bundled DB carries 9 translator sets at 6236 ayahs each; the
reader can render 4. The other five — Elmir Kuliev, Ministry of Awqaf Egypt,
Rowwad Translation Center, Alauddin Mansour, Muhammad Sodik Muhammad Yusuf —
are unreachable by any code path.
`packages/mobile-data/src/translators.ts:6` already names this: *"The DB is
copied whole, so it also carries the translator sets no language selects —
filtering it down is a bundle-size question, not a correctness one."*

Measured, on top of Task 2's vacuum: 127.0 → 101.3 MB on disk, 36.1 → 30.4 MB
of download.

**The FTS rows go on their own.** `schema.sql` already carries
`trg_translations_ad`, which deletes the matching `search_fts` row on every
`translations` delete. Measured on a copy: 62,360 FTS rows → 31,180, exactly
the five sets, with no FTS statement written by hand. Do not write one — an
explicit `DELETE FROM search_fts WHERE source = 'translation' AND ref_id = ?`
would match **nothing**, because `search_fts.source` holds the *language code*
(`ar`/`en`/`ru`/`uz`/`uz-Cyrl`) and `ref_id` holds `translations.id`. A second
delete on top of the trigger is at best a no-op and at worst a second answer
to the same question.

**Cost:** the delete takes **~7.5 minutes** on the real DB — 31,180 rows each
firing an FTS delete. `generate:m1-db` already costs minutes; budget for it
rather than assuming the script hung.

**Ordering:** the prune must run **before** the VACUUM from Task 2, or the
freed pages ship as holes. `sealDbForBundling` is called after
`pruneForMobile`, so the call order in Step 5 gives that — Step 6 proves it
rather than assuming it.

- [x] **Step 1: Write the failing test**

Create `packages/mobile-data/tests/pruneForMobile.test.ts`. It seeds from the
**real** `packages/data/schema.sql`, the way `create-m0-fixture-db.ts` does —
a hand-written mini-schema would omit `trg_translations_ad`, and the FTS
assertion below would then be testing a table nothing maintains.

```ts
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createDatabase } from '@quran-corpus/data';
import { pruneForMobile } from '../scripts/pruneForMobile.js';

const schemaPath = resolve(
  dirname(fileURLToPath(import.meta.url)), '../../data/schema.sql',
);

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'prune-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

const SETS: [string, string][] = [
  ['en', 'Saheeh International'],
  ['ru', 'Abu Adel'],
  ['ru', 'Elmir Kuliev'],
  ['ru', 'Rowwad Translation Center'],
  ['uz', 'Tasnim'],
  ['uz', 'Alauddin Mansour'],
  ['uz-Cyrl', 'Tasnim'],
];

async function seed(path: string) {
  const db = createDatabase(`file:${path}`);
  await db.executeMultiple(await readFile(schemaPath, 'utf8'));
  for (const code of ['en', 'ru', 'uz', 'uz-Cyrl']) {
    await db.execute({ sql: 'INSERT INTO languages VALUES (?,?,?,?)', args: [code, code, code, 'ltr'] });
  }
  await db.execute("INSERT INTO surahs VALUES (1,'الفاتحة','Al-Fatihah','The Opener','meccan',7,5)");
  await db.execute("INSERT INTO ayahs (id, surah_id, ayah_number, text_uthmani) VALUES (1,1,1,'بسم الله')");
  for (const [lang, who] of SETS) {
    // trg_translations_ai indexes this into search_fts for us -- which is the
    // same trigger pair the prune relies on for the delete side.
    await db.execute({
      sql: 'INSERT INTO translations (ayah_id, language_code, translator, text) VALUES (1,?,?,?)',
      args: [lang, who, `body of ${who}`],
    });
  }
  db.close();
}

it('keeps every translator the reader can select and drops every other one', async () => {
  const path = join(dir, 'p.db');
  await seed(path);

  const result = await pruneForMobile(path);

  const db = createDatabase(`file:${path}`);
  const kept = await db.execute(
    'SELECT language_code, translator FROM translations ORDER BY 1, 2',
  );
  db.close();

  expect(kept.rows.map((r) => `${r.language_code}/${r.translator}`)).toEqual([
    'en/Saheeh International',
    'ru/Abu Adel',
    'uz/Tasnim',
    'uz-Cyrl/Tasnim',
  ]);
  expect(result.translationsDeleted).toBe(3);
});

it('lets the delete trigger take the search rows with them', async () => {
  const path = join(dir, 'q.db');
  await seed(path);

  await pruneForMobile(path);

  const db = createDatabase(`file:${path}`);
  const orphan = await db.execute(
    "SELECT count(*) AS n FROM search_fts WHERE search_fts MATCH 'Kuliev'",
  );
  const survivor = await db.execute(
    "SELECT count(*) AS n FROM search_fts WHERE search_fts MATCH 'Saheeh'",
  );
  db.close();

  // A search hit pointing at a translation that is no longer in the database
  // renders as a result the reader taps and gets nothing from.
  expect(orphan.rows[0]?.n).toBe(0);
  expect(survivor.rows[0]?.n).toBe(1);
});
```

- [x] **Step 2: Run it and watch it fail**

```bash
cd packages/mobile-data && npx vitest run tests/pruneForMobile.test.ts
```

Expected: FAIL — `Failed to resolve import "../scripts/pruneForMobile.js"`.

- [x] **Step 3: Implement the prune**

Create `packages/mobile-data/scripts/pruneForMobile.ts`:

```ts
import { createDatabase } from '@quran-corpus/data';
import { selectedTranslators } from '../src/translators.js';

/**
 * Remove from a *copy* of the corpus the translator sets the mobile app has no
 * code path to reach.
 *
 * The bundled DB is a whole-file copy of the one apps/web reads, which carries
 * nine translator sets at 6236 ayahs each while the reader can render four.
 * translators.ts has named this as a bundle-size question since M1; this is
 * the answer to it. Measured: 25.7 MB on disk, 5.7 MB of download.
 *
 * search_fts is NOT touched here. schema.sql's trg_translations_ad deletes the
 * matching index row for every translation deleted, and it is the only thing
 * that can: search_fts.source holds the language code and ref_id holds
 * translations.id, so there is no (source, translator) key to delete by. A
 * second, hand-written delete would be a second answer to the same question.
 *
 * Runs on the copy, before sealing, and never against the canonical DB: the
 * web app reads that file and shows every translation this one drops.
 *
 * Must run BEFORE the VACUUM in sealDbForBundling, or the pages these deletes
 * free ship inside the APK as holes.
 */
export async function pruneForMobile(
  dbPath: string,
): Promise<{ translationsDeleted: number }> {
  const db = createDatabase(`file:${dbPath}`);
  try {
    const pairs = Object.entries(selectedTranslators);
    // An OR of equality pairs, not two independent IN lists:
    // `language_code IN (...) AND translator IN (...)` would keep ru/Tasnim,
    // a combination that does not exist, and -- more to the point -- would
    // keep uz/'Abu Adel' if it ever did. Same shape as
    // validateM1ReaderDbContract's own selection clause, for the same reason.
    const keep = pairs.map(() => '(language_code = ? AND translator = ?)').join(' OR ');

    const removed = await db.execute({
      sql: `DELETE FROM translations WHERE NOT (${keep})`,
      args: pairs.flat(),
    });

    return { translationsDeleted: Number(removed.rowsAffected ?? 0) };
  } finally {
    db.close();
  }
}
```

- [x] **Step 4: Run the tests**

```bash
cd packages/mobile-data && npx vitest run tests/pruneForMobile.test.ts
```

Expected: PASS, 2 tests. Then mutation-check the first one: change `NOT (…)`
to `(…)` and confirm it fails naming the surviving set, rather than passing
because `.toEqual` was handed an empty list both ways.

- [x] **Step 5: Wire it into the export, before sealing**

In `packages/mobile-data/scripts/create-m1-reader-db.ts`, inside
`syncM1ReaderDbAsset`, between `copyFile` and `sealDbForBundling`:

```ts
  await copyFile(sourceDbPath, targetDbPath);
  // Before the seal, because sealDbForBundling vacuums: pages freed after the
  // repack would ship as holes. Takes ~7.5 minutes -- the FTS delete trigger
  // fires once per row, 31k times.
  const pruned = await pruneForMobile(targetDbPath);
  console.log(
    `[m1] pruned ${pruned.translationsDeleted} translation rows the app cannot display`,
  );
  await sealDbForBundling(targetDbPath);
```

Add `import { pruneForMobile } from './pruneForMobile.js';` at the top.

`validateM1ReaderDbContract` runs after this and already asserts 6236 rows for
each of the four selected translators, so a prune that took one of them out
fails the generator rather than reaching a device.

- [x] **Step 6: Mutation-check the ordering claim**

Move the `pruneForMobile` call to *after* `sealDbForBundling`, regenerate, and
record the resulting file size. Expected: materially larger than the
prune-then-seal order — which is what makes the comment in Step 5 a fact
rather than a belief. Restore the order by re-editing.

(Two full regenerations at ~10 minutes each. If that is not affordable, run the
same experiment on a copy of the bundled DB with a short script and record
*that* — the claim needs a number, not necessarily a full pipeline run.)

- [x] **Step 7: Regenerate and verify**

```bash
cd /home/claude/projects/quran-corpus-pwa && pnpm generate:m1-db
python3 -c "
import sqlite3;d=sqlite3.connect('apps/mobile/assets/db/quran.db')
for r in d.execute('SELECT language_code, translator, count(*) FROM translations GROUP BY 1,2'): print(r)
print('ayahs', d.execute('SELECT count(*) FROM ayahs').fetchone()[0])
for src, n in d.execute('SELECT source, count(*) FROM search_fts GROUP BY 1'): print('fts', src, n)
print('ar', d.execute(\"SELECT count(*) FROM search_fts WHERE search_fts MATCH 'الله'\").fetchone()[0])
print('en', d.execute(\"SELECT count(*) FROM search_fts WHERE search_fts MATCH 'merciful'\").fetchone()[0])
print('ru', d.execute(\"SELECT count(*) FROM search_fts WHERE search_fts MATCH 'Милостивый'\").fetchone()[0])"
ls -la apps/mobile/assets/db/quran.db
```

Expected: exactly the four selected sets, 6236 rows each; 6236 ayahs; 6236 FTS
rows per source and five sources; **1663 / 172 / 23** hits. The Russian count
drops from 65 to 23 *because* the other three Russian sets are gone — that is
the assertion that the prune did anything, and 172 and 1663 unchanged is the
assertion that it did nothing else. DB ≈ 101 MB.

- [x] **Step 8: Run the whole suite and commit**

```bash
pnpm test && pnpm type-check && pnpm lint   # root scripts are turbo tasks; there is no `typecheck`
git add packages/mobile-data/scripts/pruneForMobile.ts \
  packages/mobile-data/tests/pruneForMobile.test.ts \
  packages/mobile-data/scripts/create-m1-reader-db.ts
git commit -m "perf(mobile-data): drop translator sets the app cannot display

The bundled DB is a whole-file copy of the one apps/web reads, so it shipped
nine translator sets at 6236 ayahs each while the reader can render four.
translators.ts has named this a bundle-size question since M1.

Their search rows go with them through schema.sql's trg_translations_ad --
an FTS hit pointing at a translation that is no longer in the database is a
result the reader taps and gets nothing from, and the trigger is the only
thing that can find those rows: search_fts keys on language code and
translations.id, not on translator.

Runs on the copy, before the seal-time vacuum so the freed pages do not ship
as holes. 127.0 -> 101.3 MB on disk, 5.7 MB off the download. The canonical DB
is untouched and apps/web still shows all nine."
```

**Acceptance criteria:** four translator sets remain; 6236 ayahs; the three
FTS hit counts are 1663 / 172 / 23; full suite green.

**§5:** changes what mobile receives from the shared data layer →
**stop and ask for `/code-review`.**

**Risk:** the reader shows a blank translation pane if a selected translator is
pruned by a name mismatch. **Mitigation:** the prune reads `selectedTranslators`
— the same constant `corpusRepository.ts` matches against and
`validateM1ReaderDbContract` re-checks after — so a mismatch fails the
generator. **Rollback:** regenerate from the canonical DB; it is untouched.

---

### Task 4: Stop storing search text twice — **declined unless the owner overrules**

**Recommendation: do not do this.** The task was written on the assumption
that `search_fts_content` is 20.6 MB of pure waste and that a contentless
FTS5 table would cost only a body lookup. Both halves are wrong, and the
measurements say so.

**What it is worth.** After Task 3 the shadow table is **8.2 MB on disk**, not
20.6 — the prune already took 60% of it. Dropping the rest, measured end to
end on a copy: 101.3 → 93.1 MB on disk, 30.4 → **28.0 MB of download. 2.5 MB.**
That is 1.1% of the current 219 MB build.

**What it costs.** `content=''` does not merely stop returning `body`. Every
column of a contentless FTS5 table reads back NULL — including the four
`UNINDEXED` ones — and they cannot be used in a `WHERE` clause either.
Verified against SQLite 3.40.1:

```
SELECT a, b FROM f WHERE f MATCH 'rahman'                -> (None, None)
SELECT snippet(f, 2, …) FROM f WHERE f MATCH 'rahman'    -> (None,)
SELECT rowid FROM f WHERE f MATCH 'rahman' AND a = 'ar'  -> []          <- no rows
SELECT rowid, bm25(f) FROM f WHERE f MATCH 'rahman'      -> [(1, -1e-06)]
```

`rowid` and `bm25()` are all that survive. `packages/data/src/queries/search.ts`
needs every one of the rest:

- `SNIPPET_SELECT` (`search.ts:157`) selects `surah_id, ayah_number, source` and
  `snippet(search_fts, 4, …)` — the entire hit shape, gone.
- `sourceFilter` filters `AND source IN (?, ?)` and
  `AND ref_id IN (SELECT id FROM translations …)` — both silently return
  nothing, so a language-filtered search would yield zero hits with no error.
- `uzTranslatorFilter` does the same for the Cyrillic pass.
- `backfillSearchIndex` reads `SELECT source, ref_id FROM search_fts` to avoid
  re-inserting what the triggers already indexed.

Making it work means a side table keyed by `rowid` carrying the four metadata
columns, a join on every query, and snippets built in application code from
`translations.text` / `ayahs.text_uthmani`. That is a rewrite of the one query
path the app's whole search depends on, reaching web, mobile and scraper at
once (§2), for 2.5 MB.

- [ ] **Step 1: Record the decline, or the owner's overrule**

Record as `Ruling: <decision> — <why> — <what it costs if wrong>` under
Rulings. Declining is a complete outcome, not a skipped one.

Revisit only if Task 5 lands the install *just* over the cap and 2.5 MB is
the difference — and then budget it as a query-layer rewrite with its own
plan, not as a step inside a size phase.

---

### Task 5: Move the 604 page fonts into a Play Asset Delivery install-time pack

**Ruled by the owner, 2026-09-24:** Play Asset Delivery, **install-time** pack.
Distribution is **Play and F-Droid** (F-Droid as its own later phase — it needs
licence clearance across the eight `pending: true` sources in `AboutScreen` and
a build the DB and fonts can be reproduced from, neither of which is this
phase's work).

**F-Droid keeps the fonts inline.** It has no size cap and no asset-pack
mechanism, so its artefact is the build we have today. That makes this task a
*Play flavour*, not a replacement: the inline path must keep working, and
Step 2 is where that is guaranteed rather than hoped for.

**Files:**
- Create: `apps/mobile/plugins/withMushafAssetPack.js` — config plugin. The
  `android/` directory is `expo prebuild` output and gitignored (§7), so the
  pack module cannot be committed; it has to be generated on every prebuild.
- Create: `apps/mobile/src/data/mushafFontSource.ts` — resolves a page font to
  a loadable source, from the asset pack or from the bundled assets.
- Modify: `apps/mobile/src/theme/useCorpusFonts.ts` (or wherever
  `Font.loadAsync` takes the per-page `require()` — confirm the path first).
- Modify: `apps/mobile/app.json` — register the plugin.

**Interfaces:**
- Produces: `export async function mushafFontSource(page: number): Promise<string | number>`
  — an asset-pack file path where a pack is present, otherwise the existing
  `require()` handle. One function, so the two channels differ in one place.

- [ ] **Step 1: Spike the runtime load before writing any Gradle**

**This step can invalidate the whole task, so it runs first.** Metro resolves
`require('../../assets/fonts/mushaf/p001.ttf')` to an entry in the APK; an
install-time asset pack is a *different* container, reached through
`AssetManager`, and `expo-font` is not obliged to accept a path from it.

The failure mode here is the one this project has already paid for: WOFF2
`loadAsync` resolves with **no error**, silently falls back to the system
face, and only a pixel diff catches it. So this spike is not "does the call
resolve" — it is a screenshot of a mushaf page, diffed against the same page
rendered from the inline build.

Deliverable: a recorded yes/no on whether `Font.loadAsync` can load a TTF from
an install-time pack path, with the pixel diff as evidence.

If the answer is no, stop and re-scope to a **fast-follow or on-demand** pack
(whose files land in the app's own file storage and are loadable by path),
and record that as a ruling. Do not proceed on the assumption it works.

- [ ] **Step 2: Pin the inline path with a test before changing it**

The F-Droid artefact depends on the current behaviour, and nothing asserts it
today.

Add to the existing font test (find it with
`grep -rn "loadAsync" apps/mobile/src --include=*.test.tsx`), or create
`apps/mobile/src/data/mushafFontSource.test.ts`:

```ts
it('falls back to the bundled asset when no pack is present', async () => {
  // The F-Droid artefact ships every font inline and has no asset pack at
  // all, so this is not a degraded path -- it is one of the two shipping
  // configurations, and the only one nothing else in the suite covers.
  const source = await mushafFontSource(1);
  expect(typeof source).toBe('number'); // a Metro asset handle, not a path
});
```

- [ ] **Step 3: Write the config plugin**

`apps/mobile/plugins/withMushafAssetPack.js` must, on prebuild:

1. create `android/mushaf_fonts/build.gradle` applying
   `com.android.asset-pack` with `packName = "mushaf_fonts"` and
   `deliveryType = "install-time"`;
2. copy or symlink `assets/fonts/mushaf/*.ttf` into
   `android/mushaf_fonts/src/main/assets/`;
3. add `include ':mushaf_fonts'` to `android/settings.gradle`;
4. add `assetPacks = [":mushaf_fonts"]` to the app module's `android {}` block;
5. **exclude the same fonts from the main APK's assets**, or they ship twice
   and the download goes up rather than down.

Point 5 is the one that silently fails: a pack that adds 126 MB without
removing 126 MB is a regression the size check in Step 5 is there to catch.

- [ ] **Step 4: Build an app bundle and install it locally — no Play Console needed**

`bundletool` tests asset packs on a real device without any Play listing. This
is why the task's verification is **not** deferred; only the upload is.

```bash
cd apps/mobile/android
taskset -c 7,8 nice -n 19 ./gradlew bundleRelease -x lint \
  -PreactNativeArchitectures=arm64-v8a --max-workers=2 --no-daemon --console=plain
# --local-testing makes install-apks serve the asset packs from local storage
java -jar "$CLAUDE_JOB_DIR/tmp/bundletool.jar" build-apks \
  --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output="$CLAUDE_JOB_DIR/tmp/app.apks" --local-testing
java -jar "$CLAUDE_JOB_DIR/tmp/bundletool.jar" install-apks \
  --apks="$CLAUDE_JOB_DIR/tmp/app.apks"
```

`taskset -c 7,8` is mandatory. Coordinate the install with the owner — it is
their phone and this session's display.

- [ ] **Step 5: Measure the download Play would actually generate**

```bash
java -jar "$CLAUDE_JOB_DIR/tmp/bundletool.jar" get-size total \
  --apks="$CLAUDE_JOB_DIR/tmp/app.apks" --dimensions=ABI
```

Expected: base download well under 200 MB (projection: ~81 MB). Record it in
the Verification Log beside the 219.0 MB baseline.

A size that did not drop means point 5 of Step 3 did not take effect. Check
before concluding the pack works.

- [ ] **Step 6: Device checks**

| # | Check | Pass |
| --- | --- | --- |
| 433 | Mushaf renders pages 1, 50, 302 and 604 with correct glyphs, not tofu and not a fallback face | |
| 434 | Page 1 pixel-diffs clean against the same page from the inline build | |
| 435 | Airplane mode, fresh install via `install-apks`: the mushaf still renders (install-time packs must never need the network) | |
| 436 | The inline (F-Droid) build still renders the mushaf | |

433 spot-checks across the render bands deliberately: 54 pages have
header/bismillah line gaps and the per-page scale runs 11.91–18.17em, so page 1
alone proves nothing.

434 exists because a silent fallback to the system face is this project's
known failure mode for font loading, and it looks like success.

- [ ] **Step 7: Commit, and record what is still unverified**

The Play **upload** remains untested — there is no Play Console listing yet
(owner, 2026-09-24). Say so in the Verification Log explicitly. An untested
upload path is open debt, not a pass; §10's rule against "implementation
complete, verification pending" applies to the half that was not run, not to
the half that was.

**Acceptance criteria:** `get-size total` under 200 MB; checks 433-436 all
pass; the inline path still works; the Play upload is recorded as unverified
with its reason.

**Risk:** the pack ships alongside the inline fonts and the download grows.
**Mitigation:** Step 5 measures rather than assumes. **Rollback:** the plugin
is additive and `android/` is regenerated by prebuild — remove it from
`app.json` and the next prebuild is the F-Droid build.

---

### Task 6: Web wins, scoped by the Task 1 baseline

**Files:** decided by the baseline. Do not pre-commit to a change here.

- [x] **Step 1: Read the Task 1 web baseline and pick the two worst numbers**

Only two. A web performance pass with no budget becomes a rewrite.

- [x] **Step 2: For each, write the fix and re-run the same instrument on the same route**

```bash
npx lighthouse http://localhost:3000/surah/2 --preset=desktop \
  --output=json --output-path="$CLAUDE_JOB_DIR/tmp/s2-web-after.json" --quiet
```

If Task 1 Step 5 fell back to build output plus `curl` timing, use that here —
the rule is one instrument, not one tool.

Record before/after side by side in the log.

- [x] **Step 3: Do not remove `force-dynamic` to improve TTFB**

Stated as a step because it is the obvious move and it is wrong. Static
prerendering bakes nonce-less inline scripts that a strict CSP then blocks,
which blanked the whole app until PR #25. If TTFB is the worst number, fix it
with caching *inside* the dynamic render, not by making the route static.

- [x] **Step 4: Commit each fix separately, with its numbers in the body**

**Acceptance criteria:** two measured improvements, each with before/after from
the same instrument and route. A change with no number attached does not ship
in this phase.

---

### Task 7: Re-measure, and close the phase

- [ ] **Step 1: Rebuild the APK**

```bash
bash "$CLAUDE_JOB_DIR/tmp/build56.sh"   # copy of build54.sh, versionCode bumped in app.json
# build54.sh already ends with: aapt2 dump badging <apk> | grep -o "versionCode='[0-9]*'"
```

- [ ] **Step 2: Re-run the same instrument**

```bash
"$CLAUDE_JOB_DIR/tmp/s2-measure.sh" after
diff -y "$CLAUDE_JOB_DIR/tmp/s2-baseline.tsv" "$CLAUDE_JOB_DIR/tmp/s2-after.tsv"
```

- [ ] **Step 3: Bump `corpusDbVersion` before the build**

`apps/mobile/src/data/openCorpusDb.ts` skips the extract when a file of that
name already exists, so a phone that has run the app keeps its **old** DB —
with all nine translator sets and none of this phase's work — and nothing
anywhere says so. This has been missed three times (M7b, M9, M11). Tasks 2 and
3 both change the bundled DB's contents: bump it in the same commit, and check
on device that the reader is reading the new file.

- [ ] **Step 4: Device checks**

| # | Check | Pass |
| --- | --- | --- |
| 425 | Reader shows the correct translation in EN, RU, UZ and UZ-Cyrl | |
| 426 | Search returns hits for an Arabic term, an English term and a Russian term | |
| 427 | A search hit opens the ayah it names | |
| 428 | Mushaf renders pages 1, 50, 302 and 604 with correct glyphs | |
| 429 | Word-by-word grid renders segments and glosses | |
| 430 | Cold start is not worse than baseline | |
| 431 | Dictionary root entry shows Hans Wehr and Lane definitions | |
| 432 | A Russian search returns Abu Adel's wording and no other Russian set's | |

426 and 427 exist because search is the feature a size win can break while
every number improves. 432 is the positive half of Task 3: the sets are gone
*and* the one that stayed is the one the reader shows.

- [ ] **Step 5: Fill the Verification Log, update STATUS.md at merge, commit**

STATUS.md prose is written **at merge, never inside an open PR** — 30 of PR
#75's 60 findings were against ledger prose.

**Acceptance criteria:** every check has a result; the after-TSV is in the log
beside the baseline; no metric regressed without a recorded reason.

---

## Risks and Rollbacks (phase level)

| Risk | Mitigation | Rollback |
| --- | --- | --- |
| A size win that silently deleted rows | Step 7 of Task 2 and Step 7 of Task 3 count rows and three real FTS terms, not bytes; Task 7 checks 426-427 and 432 exercise search | Regenerate from the canonical DB, which is never written |
| The device keeps its old extract and shows the pre-prune DB | Task 7 Step 3 bumps `corpusDbVersion`; nothing in the suite can catch this | Bump and rebuild |
| Arguing from raw bytes and shipping a build still over the cap | Every size claim carries its compressed number too | n/a |
| `sealOpenDb`'s new VACUUM reaches the M0 fixture builder as well | `tests/m0Fixture.test.ts` runs in Task 2 Step 4 | Revert the one line |
| Font delivery change breaks the local debug-APK loop | Recommendation B keeps it; A is explicitly flagged as losing it | Ruling is recorded before any code is written |
| Measuring after with a different instrument than before | One script, two labels, diffed | n/a |
| Gradle under an unconstrained run | `taskset -c 7,8` in every build script | Kill the build |

## Verification Log

*(Empty until the runs. §10: an unmet log is an unmet exit criterion.)*

### Baseline (Task 1)

Taken 2026-09-25 on the vc55 release APK (the S1 build), OnePlus 7 Pro /
Android 12, via `$CLAUDE_JOB_DIR/tmp/s2-measure.sh baseline`.

| Metric | Value | Unit |
| --- | --- | --- |
| `apk_bytes` | 219,036,359 | bytes |
| `db_bytes` | 164,765,696 | bytes |
| `fonts_bytes` | 190,990,690 | bytes |
| `apk_db_zip_bytes` | 41,614,227 | bytes |
| `apk_fonts_zip_bytes` | 127,322,246 | bytes |
| `cold_start_run1` | 964 | ms |
| `cold_start_run2` | 877 | ms |
| `cold_start_run3` | 851 | ms |
| `frame_gap_p50` | 11.1 | ms |
| `frame_gap_p95` | 22.3 | ms |
| `frame_gap_max` | 1137.9 | ms |
| `frames_over_32ms` | 4 | count |
| `frames_total` | 118 | count |

Cold-start median **877 ms**. The compressed columns reproduce the
2026-09-24 table, so the baseline and the plan's premise agree.

`frame_gap_p50` is **11.1 ms, not 16.7** — this panel runs at 90 Hz, so the
frame budget on this device is 11.1 ms. A later task must not read 16.7 as
"on budget" here.

**Instrument non-vacuity check (Task 1 Step 2):** RUN, and it **found the
instrument broken**.

*Defect 1 — the parser read the wrong column.* The plan's script hardcodes
`parts[1]` as `IntendedVsync` on a stated 19-column `PROFILEDATA` layout.
Android 12 emits **22 columns with `FrameTimelineVsyncId` inserted at index
1**, so `parts[1]` was a vsync *id*; consecutive ids differ by 2, and
`2 / 1e6` rounds to 0.0 ms. First run reported `p50 0.0 / p95 0.0 /
max 0.0` across 118 frames — an instrument that could never move. Fixed by
locating the column by name from the header line
(`$CLAUDE_JOB_DIR/tmp/s2-gaps.py`); the script now shells out to that file
rather than carrying its own copy.

*Arms, after the fix:*

| Arm | n | p50 | **p95** | max | over-32 ms | over-32 ms, idle gaps removed |
| --- | --- | --- | --- | --- | --- | --- |
| A — mushaf, 3-page swipe | 118 | 11.1 | **22.3** | 1137.9 | 4 | **1** |
| B — About, scrolled | 119 | 11.1 | **11.2** | 1525.8 | 3 | **2** |

*Ruling — arm B is a scroll, not a still screen.* The plan asked for the
control arm to sit still on About. A still screen redraws nothing, so
`frames_total` would be 0, and the plan's own criterion ("`frames_total`
non-zero on both") could not be met by the interaction it specified. Arm B
scrolls About instead: same interaction shape, lighter content.

*Ruling — `frame_gap_p95` is this phase's jank metric.* p95 doubles between
the arms (22.3 vs 11.2 ms), so the instrument discriminates. `frame_gap_max`
and `frames_over_32ms` do **not**: their values are the idle gaps while a
human walked to the phone between `reset` and the first touch (arm A carries
423 / 1103 / 1138 ms, arm B 1526 ms). Strip gaps >=200 ms and the counts are
1 and 2 — noise, and in the wrong direction. Both stay in the TSV for the
record; neither is an acceptance criterion, because a human-timed window
sets them.

**AAB download size (Task 1 Step 4), or the reason it was declined:** built
2026-09-25 (owner chose to take it now). `bundleRelease -x lint
-PreactNativeArchitectures=arm64-v8a`, and it took **1 m 21 s**, not the ~40 min
budgeted — 544 of 573 tasks were up-to-date from the vc55 APK build.

`app-release.aab` = **206,349,349 B (206.3 MB)**.

| Entry class | Raw | Compressed |
| --- | --- | --- |
| `.db` | 164.8 MB | 42.2 MB |
| `.ttf` | 192.6 MB | 127.5 MB |
| everything else (lib, dex, res, JS bundle) | 110.2 MB | 36.3 MB |
| **total** | 467.6 MB | **206.0 MB** |

**This is an upper bound on the download, not the download.** `bundletool` was
not run (the owner chose the build-only option), and Play's cap applies to the
per-device split it generates from this bundle, which is smaller than the
bundle itself. So 206.3 MB is the number to beat, and the true figure is some
unknown amount below it.

That matters more than it looks: the cap is 200 MB and the bound is 206.3 MB,
**6.3 MB over**. Task 2 alone has already taken 5.4 MB off the compressed
download. So the question of whether the font pack in Task 5 is *required* —
as opposed to merely worthwhile — now turns on a margin narrower than the
measurement error, and `bundletool get-size total` is the only instrument that
settles it. Flagged for the owner rather than assumed in either direction.


**Web baseline, and which instrument took it:** Lighthouse **12.8.2**,
`--preset=desktop`, against `next start -p 3000` on the production build of
`6d566fb`. Lighthouse is not a repo dependency and `npx` could not find a
browser (`CHROME_PATH must be set`); it was pointed at the Chromium
Playwright already has at
`~/.cache/ms-playwright/chromium-1232/chrome-linux64/chrome`. **Task 6's
"after" must use the same version, preset and browser.** TTFB figures are
`curl -w %{time_starttransfer}`, warmed once then three reads.

Per-route First Load JS, from the build output:

| Route | Size | First Load JS | Render |
| --- | --- | --- | --- |
| `/` | 627 B | 151 kB | dynamic |
| `/surah/[id]` | 6.19 kB | **154 kB** | dynamic |
| `/word/[surah]/[ayah]/[position]` | 828 B | 145 kB | dynamic |
| `/surah/[id]/words` | 5.39 kB | 116 kB | dynamic |
| `/dictionary/[root]` | 875 B | 115 kB | dynamic |
| `/dictionary` | 2.23 kB | 113 kB | dynamic |
| `/bookmarks` | 1.21 kB | 108 kB | dynamic |
| `/about`, `/surah`, `/offline`, `/dictionary/lemma-frequency`, `/dictionary/verb-concordance` | <=170 B | 107 kB | dynamic (`/offline` static) |
| shared by all | — | **104 kB** | — |
| middleware | — | 34.2 kB | — |

Only `/manifest.webmanifest` and `/offline` are static. Everything else is
`force-dynamic`, which is the CSP-nonce decision from PR #25 and is
**architectural** — see the plan's own note; do not "fix" the TTFB by
removing it.

Lighthouse on `/surah/2` (286 ayahs, the worst real page) — **performance 93**:

| Audit | Value |
| --- | --- |
| First Contentful Paint | 0.7 s |
| Speed Index | 0.7 s |
| Largest Contentful Paint | 1.5 s |
| Time to Interactive | 1.5 s |
| Total Blocking Time | 120 ms |
| Cumulative Layout Shift | 0 |
| Server response time | 270 ms |
| Total byte weight | 1,389 KiB |
| DOM size | 633 elements |

TTFB by route (three reads each, after one warm-up):

| Route | TTFB | HTML on the wire |
| --- | --- | --- |
| `/` | 9.8 / 10.0 / 9.0 ms | 42.6 kB |
| `/surah/2` | 234 / 221 / 251 ms | **4.82 MB raw, 537 kB gzipped** |
| `/surah/2/words` | 51.9 / 51.5 / 49.5 ms | 392 kB |
| `/dictionary` | 32.3 / 28.9 / 28.8 ms | 657 kB |

**The web finding Task 6 should argue from.** `/surah/2` serves **4.82 MB of
HTML** while rendering only 633 DOM elements — the bulk is the inline RSC
flight payload, not markup, so it is not addressable by trimming the DOM.
Gzip takes it to 537 kB, so as with the APK the raw number overstates the
prize by roughly 9x. CLS is already 0 and the score is 93; the lever here is
payload, not rendering.

### Task 2 — VACUUM at seal time

| Metric | Baseline | After | Delta |
| --- | --- | --- | --- |
| bundled `quran.db` on disk | 164,765,696 B | 126,955,520 B | **−37.8 MB** |
| bundled `quran.db` deflated | 41,614,227 B | 36,224,881 B | **−5.4 MB of download** |

The plan predicted ~127 MB on disk and 6.0 MB of download; on-disk landed
exactly, download came in at 5.4 MB. Regeneration took 4.5 s total.

Content gate (Step 7), all matching the plan's expected values: 6236 ayahs,
77,429 words, 128,219 segments, FTS hits **1663 / 172 / 65** for the Arabic,
English and Russian probes, 36 mushaf lines on page 1. `PRAGMA
integrity_check` = ok, `journal_mode` = delete, no `-wal`/`-shm` sidecars.
Canonical `/home/claude/quran-data/quran.db` unchanged at 164,765,696 B.

Mutation-check (Step 5): commenting out the `VACUUM` made the repack test fail
(`expected 16429056 to be less than 13143244.8`); restoring it by re-edit
produced a file byte-identical to the pre-mutation copy, and both tests pass
again. Full `packages/mobile-data` suite 16/16, `tsc --noEmit` clean.

### Task 3 — prune the unreachable translator sets

**Ordering, measured rather than assumed (Step 6).** Two copies of the
already-vacuumed bundled DB, the same two operations, opposite order:

| Order | Final size |
| --- | --- |
| A — prune, then VACUUM | 101,306,368 B |
| B — VACUUM, then prune | 126,955,520 B |

**25.6 MB.** Order B ends at exactly the size it started, because the pages the
delete frees are inside a file nothing repacks afterwards — they ship in the
APK as holes. So the comment in `create-m1-reader-db.ts` is a measured fact,
not a belief, and `pruneForMobile` must stay above `sealDbForBundling`. Each
order took ~452 s, which also confirms the plan's ~7.5 min estimate for the
delete: the FTS delete trigger fires once per row.

Mutation-check (Step 4): flipping `WHERE NOT (…)` to `WHERE (…)` failed both
tests, the first naming the three sets left alive
(`expected [ 'ru/Elmir Kuliev', …(2) ]`) rather than passing on an empty list
both ways. Restored by re-edit, verified byte-identical by `diff`.

**Result (Step 7).**

| Metric | After Task 2 | After Task 3 | Delta |
| --- | --- | --- | --- |
| bundled `quran.db` on disk | 126,955,520 B | 101,486,592 B | **-25.5 MB** |
| bundled `quran.db` deflated | 36,224,881 B | 30,260,155 B | **-6.0 MB of download** |

Cumulative against the Task 1 baseline: **164.77 -> 101.49 MB on disk**
(-63.3 MB) and **41.61 -> 30.26 MB of download** (-11.35 MB). The plan
predicted 101.3 MB and 5.7 MB; both landed slightly better.

Content gate, every value as predicted: the four selected sets at 6236 rows
each and no others, 6236 ayahs, 77,429 words, 128,219 segments, 6236 FTS rows
across five sources, 36 layout rows on mushaf page 1, `integrity_check` ok,
`journal_mode` delete, no sidecars, header bytes 18/19 = 1/1. FTS probes
**1663 / 172 / 23**: Russian falls 65 -> 23 because the other three Russian
sets are gone, and Arabic and English unchanged says the prune did nothing
else. Canonical `/home/claude/quran-data/quran.db` untouched at 164,765,696 B,
mtime still 2026-09-21.

*(Correction, added 2026-09-25: this entry recorded probe **numbers** and not
the probe **terms**, which made it useless as a baseline -- a later gate using
different terms got 1663/143/56 and looked like data loss until a control was
built to disprove it. Record the terms. Task 3b below does.)*

**A defect the plan's Step 5 walked into.** Pruning by path and then sealing by
path is two connections, and libsql holds the WAL lock past `close()` -- the
copy is in WAL because `schema.sql:2` puts the database it was copied from
there. The first regeneration ran the whole 31,180-row delete and then threw
`SQLITE_BUSY` at `journal_mode = DELETE`, six minutes in, leaving an
unvacuumed 164.8 MB asset on disk. `sealDb.ts` already documents exactly this
and answers it with the `sealOpenDb` split; `pruneForMobile` now carries the
same split (`pruneOpenDb`), and the generator prunes and seals on one
connection.

`m1-reader-db-contract.test.ts`'s "overwrites a stale mobile DB and seals the
copy out of WAL mode" case *should* have caught it in 57 ms -- its fixture
source is WAL, which is the whole premise of the case -- and did not, because
that fixture had no `translations` table, so the prune threw `no such table`
before reaching the seal. With the table added it now fails with `database is
locked` when the generator is reverted to the by-path seal. Mutation-checked
in both directions.

The artifact test `is a single self-contained file` caught the broken asset
the aborted run left behind (header `[2, 2]`), which is what kept it from
reaching a build.

### The Play download, measured with bundletool

The baseline log recorded the AAB's own 206,349,349 B as an **upper bound**,
because Play's 200 MB cap is on the per-device compressed download it
generates, not on the bundle. bundletool 1.18.1 (`build-apks --mode=default`
then `get-size total`) settles it:

| Artefact | AAB on disk | Real download (MIN-MAX) | Margin under 200 MB |
| --- | --- | --- | --- |
| baseline, vc55 pre-S2 | 206,349,349 B | 196,960,597 - 197,145,089 B | **2.9 MB (1.4%)** |
| after Tasks 2 + 3 | 194,905,825 B | 183,953,121 - 184,137,954 B | **15.9 MB (7.9%)** |

**The baseline was never over the cap.** The AAB overstated the download by
~9.2 MB, so the "6.3 MB over" figure the Task 1 log flagged as unverified was
an artefact of measuring the wrong thing -- exactly the reason it was written
down as a bound rather than a number. The app shipped under the cap with a
1.4% margin, which is thin enough that any content addition would have
breached it without warning.

Tasks 2 and 3 took **13.0 MB** off the real download (more than the 11.35 MB
the deflated DB predicted, because Play's split compression differs from a raw
deflate), and moved the margin from 1.4% to 7.9%.

**What this does to Task 5.** The install-time font pack was scoped as the
thing that gets the app *under* the cap. It never was that. It is now
headroom: 604 TTFs are 127.3 MB of the download, and moving them into an
asset pack takes the base download to roughly 57 MB. That is still worth
doing -- a 1.4% margin was one content addition from a blocked release, and
7.9% is not much better against a corpus that grows -- but it is no longer a
ship blocker, and it can be sequenced behind the web work in Task 6 rather
than ahead of it.

Reproduce: `java -jar bundletool-all-1.18.1.jar build-apks --bundle=<aab>
--output=x.apks --mode=default` then `get-size total --apks=x.apks`. The
Gradle cache's `bundletool-1.18.1.jar` is the library jar and has no main
manifest; `bundletool-all` from the GitHub release is the runnable one. JDK 17
is at `/home/claude/tools/jdk-17.0.20.1+1` and is not on PATH. Each `.apks` is
~444 MB, so delete it after reading the size -- this box runs at 92% full.

### §5 review of Tasks 2+3 (2026-09-25)

Plain `/code-review`, one pass. Five findings, all acted on.

**Fixed (`c29cc99`):**

1. *The contract could not tell a pruned DB from an unpruned one.* It counted
   only the four SELECTED sets, so every assertion held on a 164.8 MB unpruned
   file, on one where the prune ran after the VACUUM, and on one where the
   DELETE matched nothing -- and the prune's own row count went to a
   `console.log` and nowhere else. The exact failure the reviewer named is one
   this plan describes doing on purpose at line 783 as a mutation-check. Now
   checks total rows against `6236 x selected sets`. Mutation-checked: set to
   an unpruned count (`6236 * 9`), it rejects the real asset.
2. *"ships every alternative translator" asserted a guarantee the bundle no
   longer makes.* Those alternatives are exactly what the prune deletes; the
   case still passed only by iterating the same four sets the case above it
   checks. Rewritten to assert the pair list -- four sets summing to 24944 can
   still be four *wrong* sets.
3. *`pruneForMobile(dbPath)` deleted, not guarded.* No production caller (the
   pipeline cannot use it -- libsql's WAL lock is why `pruneOpenDb` exists),
   and an exported irreversible 31,180-row delete taking any path has nothing
   between it and the canonical DB `apps/web` reads.

**Checked, and the reviewer was right (no code change):** the `quran-m0.db`
growth in `1821974` is not the VACUUM. Verified here: the old fixture is 44
pages with `freelist_count = 0` and VACUUMing it leaves it at 180,224 B
exactly. The committed 208,896 B file is 51 pages because regenerating it
picked up three tables it was missing -- `mushaf_layout`, `root_glosses`,
`surah_names`. A real staleness fix, but an unrelated one, and the commit body
does not say so; recorded here instead of amending a landed commit.

### Task 3b -- compacting the search index (from the review)

The review's third finding, measured on the real corpus rather than ported
from its fixture. An fts5 delete does not remove the term's entry: it writes a
tombstone into a new segment, reclaimed only by a segment merge. VACUUM
reclaims database *pages* and cannot see inside a segment, so the 31,180-row
prune left the search index at very nearly its original size, full of markers
for rows that no longer exist.

Two arms, each a fresh copy of the canonical DB, python3 `sqlite3` so the WAL
lock is not in play:

| Arm | fts5 tables | sealed file | time |
|---|---|---|---|
| prune + VACUUM | 20,504,576 B | 101,306,368 B | 467 s |
| prune + `optimize` + VACUUM | 12,763,136 B | **93,564,928 B** | 469 s |

**7,741,440 B (-37.8% of the index) for two seconds.** The reviewer's fixture
said 47%; the real corpus says 37.8%, which is still larger than Task 2's
whole VACUUM win of 6.0 MB. Arm A reproduced the ordering experiment's
101,306,368 B to the byte, so the two measurements are on the same footing.

`INSERT INTO search_fts(search_fts) VALUES('optimize')` now runs in
`pruneOpenDb`, after the DELETE and before sealing's VACUUM -- the merge frees
pages, and unrepacked they ship as holes just as the deletes' own pages would.

Tested comparatively, because nothing in the post-state alone proves a merge
ran: on a fixture this small the file does not shrink at all, and at 300 ayahs
the optimized copy is briefly *larger* (page granularity), so a size assertion
would have passed with the optimize deleted. The test prunes two identical
fixtures, one through `pruneOpenDb` and one through the bare DELETE it wraps,
and compares `search_fts_data` row counts. Mutation-checked: removing the
optimize gives `expected 10 to be less than 10`.

### Task 3b content gate, and proof the merge is lossless

Regenerated asset: **93,564,928 B**, matching the arm-C prediction to the
byte. 31,180 rows pruned. Deflated **30,260,155 -> 26,447,687 B**, another
**3.81 MB off the download**.

Structural gate: four selected sets at 6236 and no others, 6236 ayahs, 77,429
words, 128,219 segments, 31,180 FTS rows across five sources at 6236 each, 36
layout rows on mushaf page 1, `PRAGMA integrity_check` ok, **fts5's own
`integrity-check` ok**, `journal_mode` delete, no sidecars, header bytes 18/19
= 1/1. Canonical untouched at 164,765,696 B, mtime 2026-09-21.

Structure is not the gate that matters here. A segment merge rewrites the
index, and every count above is satisfied by an index that merged *wrongly* --
the row counts live in `search_fts_content`, which `optimize` does not touch.
So the check is a differential one against a control copy taken through prune
+ VACUUM with no optimize, both probed with identical terms:

| Probe | no-optimize | optimized |
|---|---|---|
| `الله` | 1663 | 1663 |
| `رحمن` | 0 | 0 |
| `mercy` | 143 | 143 |
| `Allah` | 2021 | 2021 |
| `God` | 27 | 27 |
| `милость` | 56 | 56 |
| `Аллах` | 1449 | 1449 |
| `Tasnim` | 1 | 1 |
| `rahmat` | 47 | 47 |

Nine terms across Arabic, English, Russian and Latin-script Uzbek, identical
on both sides, at 101,306,368 B vs 93,564,928 B. The merge is lossless.

### Task 6 -- web wins

The baseline named one finding to argue from: `/surah/2` served **4.82 MB of
HTML for 633 DOM elements**, the bulk being the RSC flight payload rather than
markup. Cause, found by measuring the columns rather than guessing: the page
passes `wordsByAyah` into `ReaderView`, a client component, so every column of
all 6116 words is serialized across the boundary -- and `getWordsBySurah`
selects `w.*`.

Measured on surah 2, the words payload is 2.00 MB of JSON:

| Column | Bytes | Share |
|---|---|---|
| `morphology_description` | 1,326,585 | 66.2% |
| `grammar_note` | 144,121 | 7.2% |
| `morphology_json` | 91,705 | 4.6% |
| `grammar_arabic` | 83,234 | 4.2% |
| *(the eight the reader renders)* | 260,885 | 13.0% |
| `root_buckwalter` + `lemma_buckwalter` + `audio_url` | 98,061 | 4.9% |

**1.74 MB of it (87%) is columns nothing on the page reads.** Not a judgement
call: `MorphologySummary` is the reader popover's entire body and reads
transliteration, pos_tag, root and lemma, and its own docstring already said
the verbatim prose and Arabic grammar had moved to the FullAnalysis
collapsible on `/word/...`, which fetches its own row.

**The fix** is a projection at the boundary -- `lib/readerWord.ts`, a
`ReaderWord = Pick<Word, ...>` plus `toReaderWord`, threaded through
ReaderView / AyahView / WordToken / WordPopover / MorphologySummary. A type
rather than a convention, so the boundary cannot quietly widen again; `Word`
stays assignable to it, so the word-detail page reuses the same components
with its full row.

Deliberately **not** done in `packages/data`: `getWordsBySurah` has exactly one
production caller, but it is exported from the barrel and `./mobile`, so
narrowing it is a §5 shared-surface change reaching web, mobile and scraper for
a win that is entirely web-side and entirely about serialization. Doing it in
`apps/web` keeps the blast radius at one app (§5: UI ships on self-review).

**Results, same instrument as the baseline** -- Lighthouse 12.8.2,
`--preset=desktop`, the Playwright Chromium at `chromium-1232`, against
`next start -p 3000` on a production build:

| Audit | Before | After |
|---|---|---|
| **Performance** | 93 | **97** |
| Total Blocking Time | 120 ms | **0 ms** |
| First Contentful Paint | 0.7 s | 0.5 s |
| Speed Index | 0.7 s | 0.5 s |
| Largest Contentful Paint | 1.5 s | 1.3 s |
| Time to Interactive | 1.5 s | 1.3 s |
| Server response time | 270 ms | 230 ms |
| Total byte weight | 1,389 KiB | 1,129 KiB |
| Cumulative Layout Shift | 0 | 0 |
| DOM size | 633 | 633 |

DOM size unchanged is the confirmation that the baseline read the cause
correctly: this removed payload, not markup.

`curl`, three reads after a warm-up:

| Route | HTML before | HTML after | TTFB before | TTFB after |
|---|---|---|---|---|
| `/surah/2` | 4.82 MB / 537 kB gz | **1.84 MB / 271 kB gz** | 234/221/251 ms | **176/170/170 ms** |
| `/` | 42.6 kB | 42.6 kB | 9.8/10.0/9.0 ms | 8.2/7.3/7.4 ms |
| `/surah/2/words` | 392 kB | 392 kB | 51.9/51.5/49.5 ms | 50.0/48.9/50.5 ms |
| `/dictionary` | 657 kB | 657 kB | 32.3/28.9/28.8 ms | 29.9/29.8/29.8 ms |

**-62% raw, -50% gzipped, -28% TTFB, TBT to zero.** First Load JS is unchanged
at 154 kB, as expected -- this is payload, not bundle.

**One fix, both of the baseline's worst numbers.** The plan budgeted two; the
payload cut took TTFB and blocking time with it, so a second change would have
been manufactured rather than found. Stopping here is the budget being
respected, not skipped.

**Where the remaining 1.84 MB goes**, since it is 3.7x the 498 kB of data
behind it (words 261 kB, glosses 98 kB, translations 77 kB, ayahs 62 kB): the
RSC flight stream escapes Arabic as `\uXXXX`, six bytes per character against
two in UTF-8. That is Next's serialization, not ours, and gzip already takes
most of it back.

**The next-worst route, and why it is not in this phase.** `/dictionary` ships
570 kB of JSON, 396 kB of which is dictionary prose held client-side so the
meaning filter runs without a round-trip. The lever is documented in
`dictionary/page.tsx` already: move the meaning arm server-side, debounced, via
`searchRoots`. That is a behaviour change -- instant local filter becomes a
network round-trip -- and belongs in its own task with its own UX call, not in
a size phase.

### Task 5 -- the font pack (partial: size proven, device owed)

**Step 1 was answered by reading the installed modules, not on device.** The
spike asked whether `Font.loadAsync` can load a TTF from an install-time pack.
Traced 2026-09-25 through `expo-font` and `expo-asset`:

- `expo-font`'s Android `FontLoaderModule.loadAsync` branches on an `asset://`
  prefix and calls `Typeface.createFromAsset(context.assets, ...)`. So the
  AssetManager *is* a supported source.
- Getting there from JS is the catch. `loadAsync` routes its source through
  `Asset.fromURI(...).downloadAsync()`, and expo-asset's Android
  `downloadAsync` returns early **only** for `file://`. Everything else goes
  to `URI.toInputStream()`, which sends a string **with no colon in it** to
  `openAssetResourceStream(context, ...)` -- the app's own AssetManager --
  copying it to a cache file returned as `file://`. Anything else containing a
  `:` that is not `file:///android_res/` falls through to `openRemoteStream`.

So the one loadable form is a **scheme-less, asset-relative path**:
`mushaf_fonts/p001.ttf` is read from the pack, while `asset://mushaf_fonts/p001.ttf`
would be fetched over the network and fail -- in airplane mode, which is
precisely what check 435 tests. That is asserted in
`mushafFontSource.test.ts` ("never yields a path containing a colon").

One assumption survives that reading and source cannot settle: **install-time
pack assets are merged into the app's AssetManager namespace.** Checks 433-436
are what settle it. No conclusion is recorded here that they work.

**The plan's Step 3 point 5 was wrong, and measuring found it.** It said to
exclude the fonts from "the main APK's assets". They are not in `assets/`:
React Native's asset pipeline puts non-image assets in `res/raw/` with
flattened names. Counted on the vc55 bundle: **613 `.ttf` entries under
`base/res/raw/`, 192,600,256 bytes.** aapt's `ignoreAssetsPattern` cannot
reach `res/raw`, so nothing downstream of Metro can remove them.

The exclusion therefore happens upstream: `metro.config.js` resolves
`fontManifest.generated` to `fontManifest.pack.ts` -- an empty map -- when
`EXPO_MUSHAF_ASSET_PACK=1`. Metro bundles what it can see, so the 604
`require()` calls have to never exist rather than be stripped later.

**Design notes worth keeping:**

- `MUSHAF_FONTS_INLINE` is checked with `=== false`, not `!`. An absent flag
  (an older manifest, a fixture predating it) must mean the *inline* build:
  falling to the pack branch on `undefined` renders a mushaf of tofu in the
  one build that has no pack to read. Mutation-checked -- swapping to `!`
  fails "an older manifest with no delivery flag".
- The existing `pageFont.test.ts` manifest mock had to gain the flag. Same
  shape as the m1 contract fixture in Task 3: a fixture that does not carry
  what the new code reads.

### Task 5 Step 5 -- the measurement that reopens the owner's ruling

The pack mechanism works. Verified on the built bundle, not assumed:

| Module | `.ttf` entries | Bytes |
|---|---|---|
| `base/` | 7 (the UI faces) | 2,235,684 |
| `mushaf_fonts/` | **604** | **189,691,644** |

So Step 3's point 5 -- the one the plan flagged as the silent failure -- took
effect: the fonts **moved** rather than duplicated. The pack's asset root also
puts them at `mushaf_fonts/p001.ttf` in the AssetManager, which is exactly the
string `mushafFontSource` returns.

**And the download barely moved.** `get-size total`:

| `--modules` | Download (MIN-MAX) |
|---|---|
| `base` alone | **53,245,398 - 53,426,566** |
| `base,mushaf_fonts` | 179,117,098 - 179,298,266 |
| *(default: the modules of the first download)* | **179,117,098 - 179,298,266** |

The default equals base+pack, and that is not a bundletool quirk -- it is what
**install-time** means. An install-time pack is delivered with the app, so it
is part of the initial download and counts against the 200 MB cap the same as
the base. The task moved 189.7 MB out of the base module and Play still
downloads it first.

Against the post-Task-3 build: **183.95-184.14 MB -> 179.12-179.30 MB**, a gain
of **4.9 MB** -- real (pack assets store better than `res/raw` entries) but not
the ~127 MB this task was scoped to win. Margin under the cap: 15.9 MB -> 20.7 MB.

**Re-measured with `deliveryType = "fast-follow"`**, the generated gradle only,
the plugin left on the owner's ruling:

| deliveryType | First download | Margin under 200 MB |
|---|---|---|
| install-time | 179,117,098 - 179,298,266 | 20.7 MB (10.4%) |
| **fast-follow** | **53,245,398 - 53,426,566** | **146.6 MB (73%)** |

Fast-follow's first download *is* the base, to the byte. That is the 130.6 MB.

**This is an owner's ruling to revisit, not a decision to take here.** The
2026-09-24 ruling chose install-time explicitly for what it buys -- present
before first launch, no progress UI, no resumption, no integrity checking for
us to write. That reasoning is intact; what has changed is the price, which is
now known to be 125.7 MB of first download rather than the nothing the plan
assumed.

Fast-follow is not a one-line change:

- Its files land in app file storage, reached via
  `AssetPackManager.getPackLocation(...).assetsPath()`, **not** the
  AssetManager. So the whole Step 1 finding above inverts: `mushafFontSource`
  would return a `file://` path, which is the one form expo-asset short-
  circuits, rather than a scheme-less asset path.
- That needs the Play Asset Delivery library and native glue to call it from
  JS -- a new dependency, so §12 applies.
- The pack downloads *after* install, so the mushaf can be unavailable on a
  first run with no network. Check 435 (airplane mode) becomes a real risk
  rather than a formality, and the tab needs a state for "fonts still
  arriving".

**Recorded as unverified:** the Play upload (no Console listing exists) and
device checks 433-436. Nothing here claims the fonts load on device -- only
that the bundle is shaped correctly and what each delivery type costs.

### After (Task 7)

| Metric | Baseline | After | Delta |
| --- | --- | --- | --- |

### Device checks 425-432

| # | Result | Note |
| --- | --- | --- |
| 425 | | |
| 426 | | |
| 427 | | |
| 428 | | |
| 429 | | |
| 430 | | |
| 431 | | |
| 432 | | |

## Rulings

*(Recorded as they are made.)*

- **Task 4 — FTS content mode:** recommended DECLINE (2.5 MB of download; a
  contentless table returns NULL for every column including UNINDEXED ones, so
  the whole of `search.ts`'s hit shape and both source filters would have to be
  rebuilt around `rowid`). **Owner's call, 2026-09-25: DECLINE accepted.**
  Cost if wrong: 8.2 MB on disk / ~2.5 MB of download stays in the bundle, and
  if Task 5's pack ever lands the install *just* over the cap this is the 2.5
  MB that would have to come from somewhere else. Revisit then, as a
  query-layer rewrite with its own plan -- not as a step inside a size phase.
  Note the share shifted after Task 3b: `search_fts_content` is untouched by
  `optimize`, so it is unchanged at 8,212,480 B but now 64% of the FTS
  footprint rather than 40%. Same win, smaller haystack; the decline rests on
  the rewrite cost, which did not move.
- **Task 5 — font delivery model:** *Play Asset Delivery, install-time pack*
  (owner, 2026-09-24). Ships all 604 fonts with the app, outside the 200 MB
  base download, present before first launch, with no progress UI, resumption
  or integrity checking for us to write. Cost: AAB-only for the Play artefact,
  and the Play upload itself stays unverified until a Console listing exists —
  `bundletool --local-testing` covers everything short of the upload.
- **Distribution channels:** *Play and F-Droid* (owner, 2026-09-24). F-Droid is
  its own later phase: it needs the eight `pending: true` sources in
  `AboutScreen` cleared, and a build its server can reproduce — `quran.db` and
  the 604 mushaf TTFs are gitignored (`.gitignore:34`, `:110`), so today there
  is nothing for it to build. Nothing in S2 blocks on it; the inline font path
  this phase preserves is what F-Droid will ship.
