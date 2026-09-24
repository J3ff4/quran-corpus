# Phase S2 — Performance and Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the Android build under a distributable size and make every performance claim a measured number rather than an impression.

**Architecture:** Measure first, then cut. Task 1 builds the baseline and nothing else, so every later task has to move a number it did not choose after the fact. The size work is all in the **build pipeline** (`packages/mobile-data/scripts`), not in app code — the bundled DB is currently a byte-for-byte copy of the web DB, so the app ships five translator sets it cannot display and an FTS content table that duplicates text already in the database. The fonts are a distribution-model problem, not a compression one, and they need an owner ruling before Task 5 can start.

**Tech Stack:** SQLite / libsql (`packages/data`, `packages/mobile-data`), Expo RN + Metro, Gradle, `adb shell dumpsys gfxinfo … framestats`, Next.js App Router (`apps/web`), Lighthouse.

**Spec:** This file. Upstream authority: `CLAUDE.md` §2 (package boundaries — `packages/data` is the single source of truth), §3, §7, §8 (60fps target), §10. Baseline measurements taken 2026-09-24 are recorded inline; they are starting points, not acceptance criteria.

## Global Constraints

- Ship scope is **both** `apps/mobile` and `apps/web` (owner, 2026-09-24).
- **Measure-first** (owner, 2026-09-24): no optimisation task may be marked done without a before/after number from the same instrument.
- `packages/data` is the single source of truth for schema and queries. Pruning happens in the **mobile export script**, never by editing the canonical DB. `apps/web/quran.db` → `/home/claude/quran-data/quran.db` is the live corpus and is **never written** by this phase.
- `packages/scraper/quran.db` is a stale 0-root stub. Never read it, never write it.
- Reference DBs live outside git at `~/quran-data/refdata/`; never copy them into the repo.
- `taskset -c 7,8` is mandatory for every Gradle invocation (an unconstrained run hit load 136). Never run Gradle while `expo start` is running.
- Never `npm run build` in `apps/web` while `next dev` is running — shared `.next`, and recovery costs a `rm -rf .next`.
- Metro's watcher is dead in this container: every edit needs `expo start --clear`.
- `adb install -r --user 0`, always.
- The phone under `adb` is also this session's display: coordinate every device run with the owner.
- §5 independent review is required for **Tasks 2, 3 and 4** — they change what `packages/data`'s consumers receive. `/code-review` is user-triggered; the agent stops and asks.
- Conventional Commits. Scopes: `mobile-data`, `data`, `mobile`, `web`.

---

## Baseline, as measured 2026-09-24

Recorded so the plan argues from numbers. Task 1 re-takes them properly.

| Thing | Value |
| --- | --- |
| Release APK (vc54, arm64-v8a only) | **219.0 MB** (219,017,783 B) |
| `assets/db/quran.db` | **164.8 MB** |
| `assets/fonts/mushaf` — 604 per-page TTFs | **183 MB** |
| Everything else in `assets/` | ~1.2 MB |
| `words` table | 65.0 MB pgsize, of which **36.1 MB is unused in-page space** |
| `search_fts_content` | 20.6 MB |
| `translations` | 20.0 MB, **9 translator sets, 4 of them readable by the app** |
| `word_glosses` | 9.8 MB |
| DB after a plain `VACUUM` (measured, 2.1 s) | **127.0 MB — 37.8 MB reclaimed** |

**The finding that shapes this phase.** Google Play caps a base APK's download
size at 150 MB and an app bundle's at 200 MB. Even if every DB lever below
lands perfectly — vacuum, prune the five unreadable translator sets, drop the
FTS content duplication — the DB falls to roughly 90 MB and the fonts do not
move at all. 90 + 183 = 273 MB of raw assets. **The 604 page fonts cannot ship
inside the install.** Task 5 is therefore not an optimisation; it is the thing
that makes the app distributable, and it needs an owner ruling before it can
be written.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `docs/plans/phase-s2-performance-and-size.md` (this file) | Baseline table and verification log. |
| `$CLAUDE_JOB_DIR/tmp/s2-measure.sh` (create, scratch) | One script that takes every mobile number, so before and after come from the same instrument. |
| `packages/mobile-data/scripts/sealDb.ts` (modify) | Gains the VACUUM step. Sealing already owns "make this file fit to ship"; repacking belongs with it. |
| `packages/mobile-data/scripts/pruneForMobile.ts` (create) | Drops what the app cannot read: unselected translator sets, and their FTS rows. Pure SQL against the *copy*, never the source. |
| `packages/mobile-data/scripts/create-m1-reader-db.ts` (modify) | Calls the prune between copy and seal. |
| `packages/mobile-data/tests/pruneForMobile.test.ts` (create) | Proves the prune keeps every selected translator and drops every other one. |
| `packages/data/src/queries/search.ts` (modify, Task 4) | Reads bodies from the source tables once FTS stops storing them. |
| `apps/mobile/app.json` (modify, Task 5) | Asset-pack / font-delivery configuration. |
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

# --- cold start: force-stop, launch, read the framework's own TotalTime ---
# Three runs. One is noise; the median of three is a number.
for i in 1 2 3; do
  adb shell am force-stop "$PKG"
  sleep 2
  T=$(adb shell am start -W -n "$PKG/.MainActivity" 2>/dev/null \
      | awk -F: '/^TotalTime/{print $2}' | tr -d ' ')
  emit "cold_start_run$i" "$T" ms
done

# --- jank: framestats GAPS, not durations ---
# A stalled UI thread produces a long gap BETWEEN frames while each frame it
# does emit still looks fast, so percentiles and frame durations are both
# blind to exactly the stall we care about.
adb shell dumpsys gfxinfo "$PKG" reset > /dev/null
echo "INTERACT NOW: swipe the mushaf 10 pages, then press enter" >&2
read -r _
adb shell dumpsys gfxinfo "$PKG" framestats \
  > "$CLAUDE_JOB_DIR/tmp/s2-$LABEL-framestats.csv"
python3 - "$CLAUDE_JOB_DIR/tmp/s2-$LABEL-framestats.csv" >> "$OUT" <<'PY'
import sys
# Column 2 of a framestats row is INTENDED_VSYNC (ns). The gap between
# consecutive intended vsyncs is what a UI-thread stall actually widens.
ts = []
for line in open(sys.argv[1]):
    parts = line.strip().split(',')
    if len(parts) > 13 and parts[0].isdigit():
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

Expected: `frames_over_32ms` is materially higher on the mushaf arm. If the
two arms report the same thing, the instrument is broken — fix it before
taking any baseline, and record what was wrong.

- [ ] **Step 3: Take the mobile baseline**

```bash
"$CLAUDE_JOB_DIR/tmp/s2-measure.sh" baseline
cat "$CLAUDE_JOB_DIR/tmp/s2-baseline.tsv"
```

Coordinate with the owner — the script asks for a manual swipe, and the phone
is their display.

- [ ] **Step 4: Take the web baseline**

```bash
cd apps/web
# Never while `next dev` is running: shared .next, and recovery is rm -rf .next
npm run build 2>&1 | tee "$CLAUDE_JOB_DIR/tmp/s2-web-build.txt"
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

Al-Baqara is the right route to measure: 286 ayahs, the worst real page.

**Note for whoever reads the result:** every page is `force-dynamic` because
a strict CSP nonce cannot be baked into a static prerender (the app-wide
flash-then-blank fixed in PR #25). So a poor TTFB here is expected and is
*architectural*, not a missing cache — do not "fix" it by removing
`force-dynamic` without re-reading that decision.

- [ ] **Step 5: Write both baselines into the log and commit**

```bash
git add docs/plans/phase-s2-performance-and-size.md
git commit -m "docs(mobile): record the S2 performance baseline"
```

**Acceptance criteria:**
- `s2-baseline.tsv` exists with all of: `apk_bytes`, `db_bytes`,
  `fonts_bytes`, three `cold_start_run*`, and the five frame-gap metrics.
- Step 2's non-vacuity check is recorded, with both arms' numbers.
- The web baseline names per-route First Load JS and the four Lighthouse
  audits above.

**Risk:** Measuring on a phone that is also the display, with the owner
driving the swipe, gives a human-timed interaction window.
**Mitigation:** Three repeats, and report gaps rather than totals — the metric
is insensitive to how long the window was, only to what happened inside it.

---

### Task 2: VACUUM the bundled database at seal time

The cheapest 37.8 MB in the phase, measured and reproducible.

**Files:**
- Modify: `packages/mobile-data/scripts/sealDb.ts`
- Modify: `packages/mobile-data/tests/` — add `sealDb.vacuum.test.ts`

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
is unused space *inside* allocated pages, not on the freelist — the signature
of rows grown by UPDATE. `morphology_description`, `grammar_note` and
`pos_tag` were each backfilled after the rows existed.

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
  // Build real fragmentation the way the corpus got it: insert short rows,
  // then grow every one of them with an UPDATE. A plain delete-then-insert
  // would land on the freelist, which is NOT what the corpus DB has.
  await db.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, body TEXT)');
  for (let i = 0; i < 2000; i++) {
    await db.execute({ sql: 'INSERT INTO t VALUES (?, ?)', args: [i, 'x'] });
  }
  for (let i = 0; i < 2000; i++) {
    await db.execute({ sql: 'UPDATE t SET body = ? WHERE id = ?', args: ['y'.repeat(3000), i] });
  }
  await db.execute('DELETE FROM t WHERE id % 2 = 0');
  db.close();

  const before = (await stat(path)).size;
  await sealDbForBundling(path);
  const after = (await stat(path)).size;

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
  // Measured 2026-09-24: 164.8 MB -> 127.0 MB in 2.1 s.
  //
  // After the journal_mode switch, not before: VACUUM rebuilds the file in the
  // mode currently in force, so vacuuming a WAL database would repack it and
  // hand back a file that still expects a sidecar.
  await db.execute('VACUUM');
```

- [ ] **Step 4: Run both tests**

```bash
cd packages/mobile-data && npx vitest run tests/sealDb.vacuum.test.ts
```

Expected: PASS, 2 tests.

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

Expected: ~127 MB, down from 164.8 MB.

- [ ] **Step 7: Verify the regenerated DB still answers**

```bash
python3 -c "
import sqlite3;d=sqlite3.connect('apps/mobile/assets/db/quran.db')
print('ayahs', d.execute('SELECT count(*) FROM ayahs').fetchone()[0])
print('words', d.execute('SELECT count(*) FROM words').fetchone()[0])
print('segments', d.execute('SELECT count(*) FROM word_segments').fetchone()[0])
print('fts', d.execute(\"SELECT count(*) FROM search_fts WHERE search_fts MATCH 'rahman'\").fetchone()[0])
print('mushaf p1', d.execute('SELECT count(*) FROM mushaf_layout WHERE page_number=1').fetchone()[0])
"
```

Expected: 6236 ayahs, 77429 words, non-zero segments, non-zero FTS hits,
non-zero page-1 lines. **A size win that lost rows is not a win** — the gloss
gate was blind to exactly this, passing its shape buckets while text had been
deleted.

- [ ] **Step 8: Commit**

```bash
git add packages/mobile-data/scripts/sealDb.ts packages/mobile-data/tests/sealDb.vacuum.test.ts
git commit -m "perf(mobile-data): vacuum the bundled corpus before shipping it

36 of the words table's 65 MB is unused space inside allocated pages, left by
the morphology_description, grammar_note and pos_tag backfills growing rows
that were already on disk. The APK paid for every hole.

Measured: 164.8 MB -> 127.0 MB, 2.1 s. Runs on the copy at seal time, after
the journal_mode switch so the repack inherits DELETE mode -- the canonical
DB that apps/web reads is never touched."
```

**Acceptance criteria:** bundled DB ≈ 127 MB; row counts in Step 7 unchanged;
the mutation-check in Step 5 actually failed.

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
- Consumes: `selectedTranslators` and `SelectedTranslatorLanguage` from
  `packages/mobile-data/src/translators.ts` — `{ en: 'Saheeh International',
  ru: 'Abu Adel', uz: 'Tasnim', 'uz-Cyrl': 'Tasnim' }`.
- Produces: `export async function pruneForMobile(dbPath: string):
  Promise<{ translationsDeleted: number; ftsRowsDeleted: number }>`.
  Called by `syncM1ReaderDbAsset` between `copyFile` and `sealDbForBundling`.

**Why:** the bundled DB carries 9 translator sets at 6236 ayahs each; the
reader can render 4. The other five — Kuliev, Ministry of Awqaf, Rowwad,
Alauddin Mansour, Muhammad Sodik Muhammad Yusuf — are unreachable by any code
path and cost roughly 11 MB plus their FTS rows.
`packages/mobile-data/src/translators.ts:8` already names this: *"The DB is
copied whole, so it also carries the translator sets no language selects —
filtering it down is a bundle-size question, not a correctness one."*

**Ordering:** the prune must run **before** the VACUUM from Task 2, or the
freed pages ship as holes. `sealDbForBundling` is called after
`pruneForMobile`, so the existing call order already gives that — verify it in
Step 5 rather than assuming it.

- [ ] **Step 1: Write the failing test**

Create `packages/mobile-data/tests/pruneForMobile.test.ts`:

```ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createDatabase } from '@quran-corpus/data';
import { pruneForMobile } from '../scripts/pruneForMobile.js';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'prune-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

async function seed(path: string) {
  const db = createDatabase(`file:${path}`);
  await db.execute(`CREATE TABLE translations (
    ayah_id INTEGER, language_code TEXT, translator TEXT, body TEXT,
    PRIMARY KEY (ayah_id, language_code, translator))`);
  await db.execute(`CREATE VIRTUAL TABLE search_fts USING fts5(
    surah_id UNINDEXED, ayah_number UNINDEXED, source UNINDEXED,
    ref_id UNINDEXED, body, tokenize = 'unicode61 remove_diacritics 2')`);
  const sets: [string, string][] = [
    ['en', 'Saheeh International'],
    ['ru', 'Abu Adel'],
    ['ru', 'Elmir Kuliev'],
    ['ru', 'Rowwad Translation Center'],
    ['uz', 'Tasnim'],
    ['uz', 'Alauddin Mansour'],
    ['uz-Cyrl', 'Tasnim'],
  ];
  for (const [lang, who] of sets) {
    await db.execute({
      sql: 'INSERT INTO translations VALUES (1, ?, ?, ?)',
      args: [lang, who, `body of ${who}`],
    });
    await db.execute({
      sql: "INSERT INTO search_fts VALUES (1, 1, 'translation', ?, ?)",
      args: [`${lang}:${who}`, `body of ${who}`],
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

it('drops the search rows for the translations it removed', async () => {
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

- [ ] **Step 2: Run it and watch it fail**

```bash
cd packages/mobile-data && npx vitest run tests/pruneForMobile.test.ts
```

Expected: FAIL — `Failed to resolve import "../scripts/pruneForMobile.js"`.

- [ ] **Step 3: Implement the prune**

Create `packages/mobile-data/scripts/pruneForMobile.ts`:

```ts
import { createDatabase } from '@quran-corpus/data';
import { selectedTranslators } from '../src/translators.js';

/**
 * Remove from a *copy* of the corpus everything the mobile app has no code
 * path to reach.
 *
 * Only translator sets today. The bundled DB is a whole-file copy of the one
 * apps/web reads, which carries nine translator sets at 6236 ayahs each while
 * the reader can render four -- roughly 11 MB of rows no screen can ask for,
 * plus their FTS entries. translators.ts has named this as a bundle-size
 * question since M1; this is the answer to it.
 *
 * Runs on the copy, before sealing, and never against the canonical DB: the
 * web app reads that file and shows every translation this one drops.
 *
 * Must run BEFORE the VACUUM in sealDbForBundling, or the pages these deletes
 * free ship inside the APK as holes.
 */
export async function pruneForMobile(
  dbPath: string,
): Promise<{ translationsDeleted: number; ftsRowsDeleted: number }> {
  const db = createDatabase(`file:${dbPath}`);
  try {
    const pairs = Object.entries(selectedTranslators);
    // Built as an OR of equality pairs rather than two independent IN lists:
    // `language_code IN (...) AND translator IN (...)` would keep ru/Tasnim,
    // a combination that does not exist, and -- more to the point -- would
    // keep uz/'Abu Adel' if it ever did.
    const keep = pairs.map(() => '(language_code = ? AND translator = ?)').join(' OR ');
    const args = pairs.flat();

    const doomed = await db.execute({
      sql: `SELECT language_code, translator FROM translations
            WHERE NOT (${keep}) GROUP BY 1, 2`,
      args,
    });

    let ftsRowsDeleted = 0;
    for (const row of doomed.rows) {
      const deleted = await db.execute({
        sql: `DELETE FROM search_fts
              WHERE source = 'translation' AND ref_id = ?`,
        args: [`${String(row.language_code)}:${String(row.translator)}`],
      });
      ftsRowsDeleted += Number(deleted.rowsAffected ?? 0);
    }

    const removed = await db.execute({
      sql: `DELETE FROM translations WHERE NOT (${keep})`,
      args,
    });

    return {
      translationsDeleted: Number(removed.rowsAffected ?? 0),
      ftsRowsDeleted,
    };
  } finally {
    db.close();
  }
}
```

**Before writing this, confirm the real `search_fts.ref_id` format** for
translation rows in the live bundled DB:

```bash
python3 -c "
import sqlite3;d=sqlite3.connect('apps/mobile/assets/db/quran.db')
for r in d.execute(\"SELECT DISTINCT source, ref_id FROM search_fts LIMIT 10\"): print(r)"
```

If `ref_id` is not `language_code:translator`, change the two `ref_id` lines
and the test's seed together — they must agree, and the test is worthless if
it seeds a shape the real DB does not have.

- [ ] **Step 4: Run the tests**

```bash
cd packages/mobile-data && npx vitest run tests/pruneForMobile.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Wire it into the export, before sealing**

In `packages/mobile-data/scripts/create-m1-reader-db.ts`, inside
`syncM1ReaderDbAsset`, between `copyFile` and `sealDbForBundling`:

```ts
  await copyFile(sourceDbPath, targetDbPath);
  // Before the seal, because sealDbForBundling vacuums: pages freed after the
  // repack would ship as holes.
  const pruned = await pruneForMobile(targetDbPath);
  console.log(
    `[m1] pruned ${pruned.translationsDeleted} translation rows and ` +
      `${pruned.ftsRowsDeleted} search rows the app cannot display`,
  );
  await sealDbForBundling(targetDbPath);
```

Add `import { pruneForMobile } from './pruneForMobile.js';` at the top.

- [ ] **Step 6: Mutation-check the ordering claim**

Move the `pruneForMobile` call to *after* `sealDbForBundling`, regenerate, and
record the resulting file size. Expected: materially larger than the
prune-then-seal order — which is what makes the comment in Step 5 a fact
rather than a belief. Restore the order by re-editing.

- [ ] **Step 7: Regenerate and verify**

```bash
cd /home/claude/projects/quran-corpus-pwa && pnpm generate:m1-db
python3 -c "
import sqlite3;d=sqlite3.connect('apps/mobile/assets/db/quran.db')
for r in d.execute('SELECT language_code, translator, count(*) FROM translations GROUP BY 1,2'): print(r)
print('ayahs', d.execute('SELECT count(*) FROM ayahs').fetchone()[0])
print('fts rahman', d.execute(\"SELECT count(*) FROM search_fts WHERE search_fts MATCH 'rahman'\").fetchone()[0])"
ls -la apps/mobile/assets/db/quran.db
```

Expected: exactly the four selected sets, 6236 rows each; 6236 ayahs; non-zero
FTS hits.

- [ ] **Step 8: Run the whole suite and commit**

```bash
pnpm -r test && pnpm -r typecheck && pnpm -r lint
git add packages/mobile-data/scripts/pruneForMobile.ts \
  packages/mobile-data/tests/pruneForMobile.test.ts \
  packages/mobile-data/scripts/create-m1-reader-db.ts
git commit -m "perf(mobile-data): drop translator sets the app cannot display

The bundled DB is a whole-file copy of the one apps/web reads, so it shipped
nine translator sets at 6236 ayahs each while the reader can render four.
translators.ts has named this a bundle-size question since M1.

Their search rows go with them: an FTS hit pointing at a translation that is
no longer in the database is a result the reader taps and gets nothing from.

Runs on the copy, before the seal-time vacuum so the freed pages do not ship
as holes. The canonical DB is untouched and apps/web still shows all nine."
```

**Acceptance criteria:** four translator sets remain; 6236 ayahs; FTS still
answers; full suite green.

**§5:** changes what mobile receives from the shared data layer →
**stop and ask for `/code-review`.**

**Risk:** the reader shows a blank translation pane if a selected translator is
pruned by a name mismatch. **Mitigation:** the prune reads `selectedTranslators`
— the same constant `corpusRepository.ts` matches against — so a mismatch is
impossible without changing both. **Rollback:** regenerate from the canonical
DB; it is untouched.

---

### Task 4: Stop storing search text twice

**Files:**
- Modify: `packages/mobile-data/scripts/pruneForMobile.ts`
- Modify: `packages/data/src/queries/search.ts`
- Modify: `packages/data/src/schema.generated.ts` (regenerate, do not hand-edit)
- Modify: `packages/mobile-data/tests/pruneForMobile.test.ts`

**Interfaces:**
- Consumes: `pruneForMobile(dbPath: string)` from Task 3.
- Produces: no signature change. `search_fts` becomes an **external-content**
  FTS5 table (`content='...'`), so `search_fts_content` stops duplicating
  text that already lives in `translations` and `ayahs`.

`search_fts_content` is 20.6 MB — a byte-for-byte second copy of every indexed
body. FTS5 supports external content precisely so an application does not pay
twice.

- [ ] **Step 1: Establish the real cost and the real shape**

```bash
python3 -c "
import sqlite3;d=sqlite3.connect('apps/mobile/assets/db/quran.db')
print(d.execute(\"SELECT sql FROM sqlite_master WHERE name='search_fts'\").fetchone()[0])
for r in d.execute('SELECT source, count(*) FROM search_fts GROUP BY 1'): print(r)
print('content MB', d.execute(\"SELECT SUM(pgsize)/1e6 FROM dbstat WHERE name='search_fts_content'\").fetchone()[0])"
```

Record the per-`source` breakdown. Multi-source FTS is what decides between
external content and contentless.

- [ ] **Step 2: Rule on which form to use, and record the ruling**

`search_fts` indexes **more than one source** (`translation`, and others the
Step-1 output names). FTS5 external content binds to exactly one content
table, so a multi-source index cannot use it directly.

Two honest options:

1. **`content=''` (contentless).** The 20.6 MB goes entirely. Cost: FTS can no
   longer return column values, so `search.ts` must fetch bodies by
   `(source, ref_id)` from the source tables after matching — and snippet
   generation, which needs the text, must move with it.
2. **Leave it.** 20.6 MB is under 10% of the target and the query rewrite
   touches the one query path the app's whole search depends on.

Record the choice as `Ruling: <decision> — <why> — <what it costs if wrong>`.
**Recommendation:** decide by what Task 5 produces. If the font ruling gets
the install under the cap with room to spare, take option 2 and leave a
working search alone. If it is marginal, take option 1.

If the ruling is option 2, mark this task **declined with reason**, record it,
and go to Task 5. That is a complete outcome, not a skipped one.

- [ ] **Step 3 (option 1 only): Write the failing test**

Append to `packages/mobile-data/tests/pruneForMobile.test.ts`:

```ts
it('indexes search text without storing a second copy of it', async () => {
  const path = join(dir, 'r.db');
  await seed(path);

  await pruneForMobile(path);

  const db = createDatabase(`file:${path}`);
  const content = await db.execute(
    "SELECT count(*) AS n FROM sqlite_master WHERE name = 'search_fts_content'",
  );
  const hit = await db.execute(
    "SELECT ref_id FROM search_fts WHERE search_fts MATCH 'Saheeh'",
  );
  db.close();

  // A contentless FTS5 table has no _content shadow at all.
  expect(content.rows[0]?.n).toBe(0);
  // ...and it must still match, or we saved space by breaking search.
  expect(hit.rows[0]?.ref_id).toBe('en:Saheeh International');
});
```

- [ ] **Step 4 (option 1 only): Run it and watch it fail**

```bash
cd packages/mobile-data && npx vitest run tests/pruneForMobile.test.ts
```

Expected: FAIL — `expected 1 to be 0`.

- [ ] **Step 5 (option 1 only): Rebuild the index contentless in the prune**

Append to `pruneForMobile`, after the translation deletes and before the
`return`:

```ts
    // Rebuild search_fts without its content shadow. FTS5 stores a verbatim
    // second copy of every indexed body in <name>_content -- 20.6 MB of text
    // that already sits in `translations` and `ayahs`. Contentless keeps the
    // index and drops the copy; search.ts fetches bodies by (source, ref_id)
    // after matching.
    //
    // Rebuilt rather than altered: FTS5 has no way to change a table's content
    // mode in place.
    const indexed = await db.execute(
      'SELECT surah_id, ayah_number, source, ref_id, body FROM search_fts',
    );
    await db.execute('DROP TABLE search_fts');
    await db.execute(`CREATE VIRTUAL TABLE search_fts USING fts5(
      surah_id UNINDEXED, ayah_number UNINDEXED, source UNINDEXED,
      ref_id UNINDEXED, body, content = '',
      tokenize = 'unicode61 remove_diacritics 2')`);
    for (const row of indexed.rows) {
      await db.execute({
        sql: 'INSERT INTO search_fts (surah_id, ayah_number, source, ref_id, body) VALUES (?, ?, ?, ?, ?)',
        args: [row.surah_id, row.ayah_number, row.source, row.ref_id, row.body],
      });
    }
```

- [ ] **Step 6 (option 1 only): Fix the query path**

In `packages/data/src/queries/search.ts`, every place that reads `body` or
calls `snippet()` on `search_fts` must instead join back to the source table
on `(source, ref_id)`. Read the file fully before editing — mobile and web
share this query, and `search` is exported from **both** `./mobile` and the
barrel, so a change here reaches all three consumers (§2).

Run the existing search tests after: `cd packages/data && npx vitest run tests/queries/search`.
Expected: all green. If snippets regress, that is the cost the ruling in Step 2
accepted — fix it, do not weaken the test.

- [ ] **Step 7: Regenerate, verify, commit**

```bash
pnpm generate:m1-db && ls -la apps/mobile/assets/db/quran.db
python3 -c "
import sqlite3;d=sqlite3.connect('apps/mobile/assets/db/quran.db')
print('rahman', d.execute(\"SELECT count(*) FROM search_fts WHERE search_fts MATCH 'rahman'\").fetchone()[0])"
pnpm -r test
```

```bash
git commit -am "perf(data): index search text without a second copy of it"
```

**Acceptance criteria:** FTS still returns the same hit counts as the baseline
for three sample queries; DB smaller by roughly the recorded
`search_fts_content` size; full suite green.

**§5:** touches `packages/data` queries — **the strongest trigger in §5.
Stop and ask for `/code-review`.**

**Risk:** search is the feature most likely to break silently. **Mitigation:**
compare hit counts against the baseline DB for the same queries, not just
"non-zero". **Rollback:** revert; regenerate.

---

### Task 5: Get the 604 page fonts out of the install

**This task cannot start without an owner ruling.** 183 MB of per-page TTFs
cannot ship inside a Play-distributable install, and the three ways out differ
in cost, offline behaviour and infrastructure. Present them, get a decision,
then write the steps.

**Files (pending the ruling):** `apps/mobile/app.json`, `apps/mobile/eas.json`,
and either a new asset-pack module under `apps/mobile/android/` or a new
`apps/mobile/src/data/ensureMushafFonts.ts`.

- [ ] **Step 1: Put the arithmetic in front of the owner**

| | Size |
| --- | --- |
| Play base-APK download cap | 150 MB |
| Play app-bundle download cap | 200 MB |
| DB after Tasks 2-4 (projected) | ~90 MB |
| Mushaf fonts | 183 MB |
| **Projected install** | **~273 MB of assets** |

The fonts are ~67% of it. No compression closes that gap — the TTFs are
already per-page subsets, and WOFF2 is a dead end here: `Font.loadAsync`
resolves with no error, silently falls back to the system face, and only a
pixel diff catches it.

- [ ] **Step 2: Get a ruling on the delivery model**

- **A — Play Asset Delivery, on-demand pack.** Fonts move into an Android
  asset pack fetched after install. Native, no server of ours, works with the
  Play installer. Cost: AAB-only (kills the debug-signed local APK loop this
  project depends on), needs a Play Console listing before it can be tested
  end to end, and `expo prebuild` output is gitignored so the pack module needs
  a config plugin.
- **B — download on first mushaf open, from our own endpoint.** Served from the
  existing Caddy + Cloudflare Tunnel. Full control, testable today, keeps the
  local APK loop. Cost: we host 183 MB and pay the egress; the mushaf is unusable
  offline until the first fetch; needs progress UI, resumption, and integrity
  checking on 604 files.
- **C — ship a subset, fetch the rest.** The ~30 most-read pages install with
  the app, the other 574 download on demand. Best first-run feel; most code.

**Recommendation: B.** It is the only one testable end to end this session,
it keeps the local build loop that every device check in this project depends
on, and the infrastructure already exists. A is better long-term and should be
revisited when the app actually goes to the Play Console.

- [ ] **Step 3: Write the implementation steps for the chosen option**

Do not write them before the ruling. Whichever is chosen, the steps must
cover: integrity verification per file (a truncated font renders as tofu, not
as an error), the offline path, the progress UI, and what happens when the
fetch fails mid-way.

**Acceptance criteria:** projected install under 150 MB; the mushaf renders
correctly on device for a page in each of the render bands (54 pages have
header/bismillah line gaps and the per-page scale runs 11.91–18.17em, so
spot-check across that range, not just page 1).

---

### Task 6: Web wins, scoped by the Task 1 baseline

**Files:** decided by the baseline. Do not pre-commit to a change here.

- [ ] **Step 1: Read the Task 1 web baseline and pick the two worst numbers**

Only two. A web performance pass with no budget becomes a rewrite.

- [ ] **Step 2: For each, write the fix and re-run Lighthouse on the same route**

```bash
npx lighthouse http://localhost:3000/surah/2 --preset=desktop \
  --output=json --output-path="$CLAUDE_JOB_DIR/tmp/s2-web-after.json" --quiet
```

Record before/after side by side in the log.

- [ ] **Step 3: Do not remove `force-dynamic` to improve TTFB**

Stated as a step because it is the obvious move and it is wrong. Static
prerendering bakes nonce-less inline scripts that a strict CSP then blocks,
which blanked the whole app until PR #25. If TTFB is the worst number, fix it
with caching *inside* the dynamic render, not by making the route static.

- [ ] **Step 4: Commit each fix separately, with its numbers in the body**

**Acceptance criteria:** two measured improvements, each with before/after from
the same instrument and route. A change with no number attached does not ship
in this phase.

---

### Task 7: Re-measure, and close the phase

- [ ] **Step 1: Rebuild the APK**

```bash
bash "$CLAUDE_JOB_DIR/tmp/build56.sh"   # versionCode bumped in app.json
aapt2 dump badging <apk> | grep versionCode
```

- [ ] **Step 2: Re-run the same instrument**

```bash
"$CLAUDE_JOB_DIR/tmp/s2-measure.sh" after
diff -y "$CLAUDE_JOB_DIR/tmp/s2-baseline.tsv" "$CLAUDE_JOB_DIR/tmp/s2-after.tsv"
```

- [ ] **Step 3: Device checks**

| # | Check | Pass |
| --- | --- | --- |
| 425 | Reader shows the correct translation in EN, RU, UZ and UZ-Cyrl | |
| 426 | Search returns hits for an Arabic term, an English term and a Russian term | |
| 427 | A search hit opens the ayah it names | |
| 428 | Mushaf renders pages 1, 50, 302 and 604 with correct glyphs | |
| 429 | Word-by-word grid renders segments and glosses | |
| 430 | Cold start is not worse than baseline | |
| 431 | Dictionary root entry shows Hans Wehr and Lane definitions | |

426 and 427 exist because Task 4 is the one change that can break search
while every size number improves.

- [ ] **Step 4: Fill the Verification Log, update STATUS.md at merge, commit**

STATUS.md prose is written **at merge, never inside an open PR** — 30 of PR
#75's 60 findings were against ledger prose.

**Acceptance criteria:** every check has a result; the after-TSV is in the log
beside the baseline; no metric regressed without a recorded reason.

---

## Risks and Rollbacks (phase level)

| Risk | Mitigation | Rollback |
| --- | --- | --- |
| A size win that silently deleted rows | Step 7 of Task 2 and Step 7 of Task 3 count rows, not bytes; Task 7 checks 426-427 exercise search | Regenerate from the canonical DB, which is never written |
| `search.ts` change reaches web and mobile at once (§2) | §5 review on Tasks 2-4; full `pnpm -r test` | `git revert`; the query layer holds no state |
| Font delivery change breaks the local debug-APK loop | Recommendation B keeps it; A is explicitly flagged as losing it | Ruling is recorded before any code is written |
| Measuring after with a different instrument than before | One script, two labels, diffed | n/a |
| Gradle under an unconstrained run | `taskset -c 7,8` in every build script | Kill the build |

## Verification Log

*(Empty until the runs. §10: an unmet log is an unmet exit criterion.)*

### Baseline (Task 1)

| Metric | Value | Unit |
| --- | --- | --- |

**Instrument non-vacuity check (Task 1 Step 2):**

**Web baseline:**

### After (Task 7)

| Metric | Baseline | After | Delta |
| --- | --- | --- | --- |

### Device checks 425-431

| # | Result | Note |
| --- | --- | --- |
| 425 | | |
| 426 | | |
| 427 | | |
| 428 | | |
| 429 | | |
| 430 | | |
| 431 | | |

## Rulings

*(Recorded as they are made.)*

- **Task 4 Step 2 — FTS content mode:**
- **Task 5 Step 2 — font delivery model:**
