# Hans Wehr Root Glosses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import Hans Wehr as concise top gloss per root; Lane's Lexicon stays as full definition collapsible below.

**Architecture:** New source `hanswehr` from vendored `hanswehr.sqlite` (FTS5). Matcher: bw→arabic + normalize (geminate/weak/hamza) + derived-head fallback. Extractor: Form-I first sense cluster, nominal roots take the noun head. Rank `hanswehr`=0 (above Lane) in shared `DEFINITION_SOURCE_RANK`; existing RootEntry renders rank-order → HW first, Lane clamped below. Import via existing generic `import-lane --source hanswehr`. Supersedes Salmoné (never imported).

**Tech Stack:** Python 3.12 (scraper, pytest), TypeScript (packages/data, apps/web, vitest), SQLite/libSQL.

## Global Constraints

- Source DB read-only: `/home/claude/quran-data/hanswehr.sqlite`. Never write it.
- §11 licensing: Hans Wehr is under active copyright (Harrassowitz / Spoken Language Services), NOT public-domain like Lane/Salmoné. User ruled 2026-08-05: ship publicly with About credit; risk accepted. About credit is mandatory (§11).
- No network. hanswehr.sqlite already on disk (§11 vendored-artefact pattern, like perseus XML).
- `packages/data` stays free of web/Next imports (§2). Ships compiled `dist/` — rebuild after edits ([[packages-data-stale-dist-gotcha]]).
- TSV contract (import-lane): `bw\tgloss`, split on first tab, no quoting. prepare RAISES on any `\t\n\r` in bw/gloss (never escapes) — mirror `prepare_salmone_glosses`.
- import-lane is `get_or_create` root + upsert on (root_id, source): idempotent per root; re-run reinstates any reject not in `hanswehr_rejects.txt`.
- Live `quran.db` write (Task 6) needs explicit per-moment user permission; back up first.
- Conventional Commits; one logical change per commit.

---

### Task 1: Hans Wehr matcher — read sqlite, normalize, look up by root

**Files:**
- Create: `packages/scraper/scraper/sources/hanswehr.py`
- Test: `packages/scraper/tests/test_hanswehr.py`

**Interfaces:**
- Consumes: `scraper.buckwalter.buckwalter_to_arabic(bw) -> str | None`.
- Produces:
  - `build_index(db_path: Path, *, expected: int | None = EXPECTED_HEADS, anchors=ANCHORS) -> dict[str, list[tuple[int,str]]]` — normalized-arabic-key → list of `(is_root, definition)`, is_root=1 first. Raises `ValueError` on empty / below-expected / anchor miss.
  - `lookup(index, bw: str) -> list[tuple[int,str]] | None` — entries for `bw`, trying normalization variants in order; None if no variant hits.
  - `normalize_key(ar: str) -> str` — the ONE fold path (diacritics + hamza seats + alef-maksura), applied to BOTH index keys and lookup candidates. Hamza is folded HERE only.
  - `key_candidates(ar: str) -> list[str]` — ordered raw-arabic *structural* variants (pre-normalize): exact, geminate-collapse, weak-final. No hamza copy — `normalize_key` folds hamza idempotently on both sides, so a hamza-stripped candidate would collapse to a key its source already yields (dead work).
  - `EXPECTED_HEADS: int`, `ANCHORS: dict[str,str]`.

**Normalization rules (verified in spike 2026-08-05):**
- `normalize_key`: strip Arabic diacritics (harakat U+064B–U+0652); fold hamza seats `أإآ→ا`, `ء→''`, `ئ→ي`, `ؤ→و`; map `ى→ي`.
- `key_candidates(ar)`: `[ar]`; if `len==3 and ar[1]==ar[2]` add `ar[:2]` (geminate طفف→طف); if ends `ي/ى` add `…و`. NO hamza copy — `normalize_key` (run on every candidate in `lookup`) folds hamza on both sides, so a hamza-stripped candidate is redundant. Candidates are distinct by construction; no de-dup pass.
- Index build: for every DICTIONARY row, `index.setdefault(normalize_key(word), []).append((is_root, definition))`; sort each list is_root desc (root head before derived). First-writer-wins per (key,is_root) not needed — keep all, extractor picks.

**Deps:** `scraper.buckwalter`; vendored `hanswehr.sqlite` (read-only).
**Risks:** source-DB drift (rows/schema) silently changes glosses → guarded by EXPECTED_HEADS count gate + 4 ANCHORS alignment gate.
**Rollback:** delete the new module; nothing persisted (offline, `mode=ro`).
**Acceptance (testable):** count + anchor gates raise on drift; `lookup(build_index(real),"Trf")` yields a "blink" sense; geminate/hamza/weak-final variants resolve.

- [ ] **Step 1: Write failing tests**

```python
# packages/scraper/tests/test_hanswehr.py
import sqlite3
import pytest
from pathlib import Path
from scraper.sources import hanswehr

def _db(tmp_path, rows):
    p = tmp_path / "hw.sqlite"
    c = sqlite3.connect(p)
    c.execute("CREATE VIRTUAL TABLE DICTIONARY USING FTS5(id, word, definition, is_root, parent_id, quran_occurrence, favorite_flag)")
    for i,(w,d,ir) in enumerate(rows,1):
        c.execute("INSERT INTO DICTIONARY(id,word,definition,is_root,parent_id,quran_occurrence,favorite_flag) VALUES(?,?,?,?,?,?,?)",(i,w,d,ir,i,None,0))
    c.commit(); c.close()
    return p

def test_normalize_folds_hamza_and_diacritics():
    assert hanswehr.normalize_key("أَخَذَ") == hanswehr.normalize_key("اخذ")
    assert hanswehr.normalize_key("ناصِية") == hanswehr.normalize_key("ناصية")

def test_key_candidates_geminate():
    cands = hanswehr.key_candidates("طفف")
    assert "طف" in cands            # geminate collapse (structural variant)

def test_hamza_folds_via_normalize_not_candidates():
    # hamza is NOT a key_candidate; normalize_key folds it on both sides
    assert hanswehr.normalize_key("أله") == hanswehr.normalize_key("اله")

def test_lookup_exact(tmp_path):
    idx = hanswehr.build_index(_db(tmp_path,[("طرف","to blink",1)]), expected=None, anchors={})
    assert hanswehr.lookup(idx,"Trf")[0] == (1,"to blink")   # Trf -> طرف

def test_lookup_via_geminate(tmp_path):
    idx = hanswehr.build_index(_db(tmp_path,[("طف","to make deficient",1)]), expected=None, anchors={})
    assert hanswehr.lookup(idx,"Tff") is not None            # Tff=طفف -> طف

def test_lookup_via_hamza(tmp_path):
    idx = hanswehr.build_index(_db(tmp_path,[("اخذ","to take",1)]), expected=None, anchors={})
    assert hanswehr.lookup(idx,">x*") is not None            # >x*=أخذ (hamza-alif) -> اخذ

def test_lookup_miss_returns_none(tmp_path):
    idx = hanswehr.build_index(_db(tmp_path,[("طرف","x",1)]), expected=None, anchors={})
    assert hanswehr.lookup(idx,"qtl") is None

def test_build_index_expected_gate(tmp_path):
    with pytest.raises(ValueError, match="expected"):
        hanswehr.build_index(_db(tmp_path,[("طرف","x",1)]), expected=99, anchors={})

def test_build_index_anchor_gate(tmp_path):
    with pytest.raises(ValueError, match="anchor|does not hold"):
        hanswehr.build_index(_db(tmp_path,[("طرف","x",1)]), expected=None, anchors={"Trf":"NOPE"})

def test_index_keeps_root_and_derived_root_first(tmp_path):
    # لوح: verb head (is_root=1) + noun head (is_root=0) share the key
    idx = hanswehr.build_index(_db(tmp_path,[("لوح","to shine",1),("لوح","board, tablet",0)]), expected=None, anchors={})
    entries = hanswehr.lookup(idx,"lwH")
    assert entries[0][0] == 1 and entries[1][0] == 0
```

- [ ] **Step 2: Run — expect fail** `cd packages/scraper && PYTHONPATH=. .venv/bin/pytest tests/test_hanswehr.py -v` → FAIL (module missing)

- [ ] **Step 3: Implement `hanswehr.py`.** Mirror `sources/salmone.py` structure (module docstring cites §11 vendored artefact + licensing; `build_index`/`lookup`/`normalize_key`/`key_candidates`; `EXPECTED_HEADS`/`ANCHORS` completeness+alignment gates). Read DB with `sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)`. Diacritic strip via `str.maketrans("","", "".join(chr(c) for c in range(0x064B,0x0653)))`. `ANCHORS` and `EXPECTED_HEADS`: compute real values in Step 3a below, do not guess.

- [ ] **Step 3a: Measure the gates against the real DB (one-off).** Run:
```bash
cd packages/scraper && .venv/bin/python - <<'PY'
import sqlite3
from scraper.sources import hanswehr  # normalize_key must exist by now
c=sqlite3.connect("file:/home/claude/quran-data/hanswehr.sqlite?mode=ro",uri=True)
keys={hanswehr.normalize_key(w) for (w,) in c.execute("SELECT word FROM DICTIONARY")}
print("EXPECTED_HEADS =", len(keys))
for bw,ar,anc in [("Trf","طرف","blink"),("hrb","هرب","flee"),("nDd","نضد","pile"),("gTw","غطو","cover")]:
    e=hanswehr.lookup(hanswehr.build_index("/home/claude/quran-data/hanswehr.sqlite",expected=None,anchors={}),bw)
    print(bw, anc in (e[0][1].lower() if e else ""))
PY
```
Set `EXPECTED_HEADS` to the printed count; set `ANCHORS = {"Trf":"blink","hrb":"flee","nDd":"pile","gTw":"cover"}` (all printed True). Store these as module constants.

- [ ] **Step 4: Run — expect pass** (same pytest cmd). Then a real-DB smoke assert inside a new test `test_real_db_coverage` (skip if `hanswehr.sqlite` absent via `pytest.mark.skipif(not Path(...).exists())`): `lookup(build_index(real), "Trf")` returns a blink sense.

- [ ] **Step 5: Commit** `git add packages/scraper/scraper/sources/hanswehr.py packages/scraper/tests/test_hanswehr.py && git commit -m "feat(scraper): add Hans Wehr sqlite matcher with hamza/geminate normalization"`

---

### Task 2: Hans Wehr gloss extractor — Form-I first sense, noun head for nominal roots

**Files:**
- Create: `packages/scraper/scraper/hanswehr_gloss.py`
- Test: `packages/scraper/tests/test_hanswehr_gloss.py`

**Interfaces:**
- Consumes: `list[tuple[int,str]]` (entries from `hanswehr.lookup`).
- Produces: `select_gloss(entries, *, prefer_nominal: bool = False, max_senses: int = 3) -> str | None`.

**Extractor rules (verified in spike 2026-08-05):**
- Choose entry: if `prefer_nominal` pick first `is_root==0` entry, else first entry; never empty (fall back to entries[0]).
- From chosen `definition`: cut at first `<b>` (drops Form II+ derived-form blocks) and first `│` (drops idioms/examples), whichever earlier.
- Strip leading Arabic head word + transliteration + any `(…)` verbal-noun parenthetical up to the first English gloss. Heuristic: drop leading tokens until a token is pure-ASCII-letters AND not a known transliteration (transliteration tokens carry combining/latin-diacritic chars: ṭ ṣ ā ī ū ḥ ‘ ’ etc — detect via `unicodedata.normalize('NFD',tok)` containing combining marks, or non-ASCII). Then drop a leading `to `.
- ALSO drop a bare Form-I imperfect-vowel marker `a`/`i`/`u` — but ONLY when it is a marker, i.e. followed by the verbal-noun `(…)`, the `to` infinitive, or more transliteration ("lāḥa **u** (lauḥ) to appear" → skip the `u`). A leading `a` NOT so followed is the English article and stays ("a thing"). Without this a gloss can start with a stray `u`, so the test asserts `startswith`, never `in`.
- Keep first `max_senses` `;`-separated sense phrases; strip HTML tags, unescape entities, collapse whitespace (reuse the `_TAG`/`html.unescape`/`_WS` ordering from `salmone_gloss.entry_senses`).
- Return None if result empty after stripping.

**Deps:** Task 1 (`hanswehr.lookup` entry shape); stdlib `html`/`re`/`unicodedata` only.
**Risks:** head-strip heuristic eats a real gloss ("a thing"→"thing") or leaks Arabic sense-body markers → mitigated by article-vs-marker guard + global Arabic-paren drop.
**Rollback:** delete the new module; no persisted state.
**Acceptance (testable):** TARAFA→starts "blink", no Form-IV/Arabic; idiom after `│` dropped; nominal picks noun head; empty-after-strip→None.

- [ ] **Step 1: Write failing tests**

```python
# packages/scraper/tests/test_hanswehr_gloss.py
from scraper.hanswehr_gloss import select_gloss

TARAFA = "طرف ṭarafa, (ṭarf) to blink, twinkle, wink, squint (also بعينيه bi-‘ainaihi); -- ṭarufa u to be newly acquired <b>IV</b> (أَطْرَفَ) to feature"
LAWH_V = "لاح lāḥa u (lauḥ) to appear, show, loom, emerge; to shine, gleam"
LAWH_N = "لوح lauḥ pl. الواح alwāḥ board, blackboard; slate; tablet; plank"
KHADD = "خضد kaḍada i (kaḍd) to cut off, break off (هـ thorns) │ خضد شوكته to tame s.o."

def test_first_sense_cluster_drops_derived_forms():
    g = select_gloss([(1, TARAFA)])
    assert g.startswith("blink")
    assert "IV" not in g and "أَطْرَفَ" not in g   # Form IV block cut

def test_idiom_after_bar_dropped():
    g = select_gloss([(1, KHADD)])
    assert "cut off" in g and "tame" not in g       # │ idiom cut

def test_prefer_nominal_takes_noun_head():
    g = select_gloss([(1, LAWH_V),(0, LAWH_N)], prefer_nominal=True)
    assert g.startswith("board")                    # noun head, plural stripped
    g2 = select_gloss([(1, LAWH_V),(0, LAWH_N)], prefer_nominal=False)
    assert g2.startswith("appear")                  # verb head, "lāḥa u (lauḥ) to" stripped

def test_verb_vowel_marker_still_stripped():
    # bare "u" before "(lauḥ)" is the Form-I marker, not gloss text
    assert select_gloss([(1, LAWH_V)]).startswith("appear")

def test_max_senses_caps_length():
    g = select_gloss([(0, LAWH_N)], max_senses=2)
    assert g.count(";") <= 1

def test_empty_returns_none():
    assert select_gloss([(1, "طرف ṭarafa")]) is None   # no English after strip
```

- [ ] **Step 2: Run — expect fail** `PYTHONPATH=. .venv/bin/pytest tests/test_hanswehr_gloss.py -v`
- [ ] **Step 3: Implement `hanswehr_gloss.py`** per rules above; reuse tag/entity/ws helpers pattern from `salmone_gloss`.
- [ ] **Step 4: Run — expect pass.**
- [ ] **Step 5: Commit** `git commit -m "feat(scraper): extract short Hans Wehr gloss (Form-I sense, noun head for nominal roots)"`

---

### Task 3: prepare tool — targets = all roots, emit importer TSV + review TSV

**Files:**
- Create: `packages/scraper/tools/prepare_hanswehr_glosses.py`
- Create: `packages/scraper/tools/hanswehr_rejects.txt` (comment-only header; format `root<TAB>reason`)
- Test: `packages/scraper/tests/test_prepare_hanswehr_glosses.py`

**Interfaces:**
- Consumes: `hanswehr.build_index/lookup`, `hanswehr_gloss.select_gloss`, and corpus stats `load_form_counts`/`load_nominal_share` imported from `tools.prepare_salmone_glosses` (generic word_segments queries; DRY — do not re-copy). `# ponytail: reuse salmone stat loaders; extract to shared module only if salmone tooling is deleted.`
- Produces:
  - `load_hanswehr_targets(db_path, rejects=None) -> list[str]` — SQL `SELECT root_buckwalter FROM roots WHERE root_arabic IS NOT NULL ORDER BY occurrence_count DESC`, minus rejects. (ALL roots — HW is top gloss everywhere it matches, not just weak roots.)
  - `build_rows(index, targets, form_counts, nominal_shares) -> (rows, quarantined, stats)` — per root: delimiter-guard bw; `lookup` None → quarantine `not_in_hanswehr`; `select_gloss(entries, prefer_nominal=share>0.8)` None → quarantine `no_gloss`; else delimiter-guard gloss, append `(bw,gloss)`. `stats={total,not_in_hanswehr,no_gloss,glossed}`.
  - `review_rows(rows, quarantined) -> list[(root,status,gloss)]` — glossed rows status `kept`; quarantined appended with empty gloss. (No tie/unmatched status — HW Form-I-first needs no per-sense corroboration; that was Salmoné's problem, not HW's.)
  - `main()` — argparse `--db --hw <sqlite> --out <tsv> --review <tsv>`; writes `bw\tgloss` and `root\tstatus\tgloss`; prints `Hans Wehr -> TSV: N glossed of T targets (M not in HW, K no gloss) -> out; review …`.

**Deps:** Tasks 1+2; `tools.prepare_salmone_glosses` stat loaders (DRY reuse); read-only `quran.db` + `hanswehr.sqlite`.
**Risks:** TSV delimiter injection in bw/gloss → RAISES (never escapes); unglossed root silently lost → quarantined to review TSV, never dropped.
**Rollback:** delete new tool + `hanswehr_rejects.txt`; produces files only, writes no DB.
**Acceptance (testable):** targets = all roots minus rejects; miss→`not_in_hanswehr`, empty gloss→`no_gloss`; RAISES on `\t\n\r`; review TSV lists kept+quarantined.

- [ ] **Step 1: Write failing tests** (mirror `test_prepare_salmone_glosses.py` fixture shape; use tmp sqlite for both HW and quran):

```python
def test_targets_all_roots_minus_rejects(tmp_path):
    from tools.prepare_hanswehr_glosses import load_hanswehr_targets
    db = _quran_db(tmp_path, [("Trf","طرف",11),("lwH","لوح",6)])
    assert load_hanswehr_targets(db, rejects={"lwH"}) == ["Trf"]

def test_build_rows_glosses_and_quarantines(tmp_path):
    from tools.prepare_hanswehr_glosses import build_rows
    idx = {hanswehr.normalize_key("طرف"): [(1,"طرف ṭarafa to blink, wink")]}
    rows,quar,stats = build_rows(idx, ["Trf","qtl"], {"Trf":{}}, {"Trf":0.0,"qtl":0.0})
    assert ("Trf","blink, wink") in [(b,g) for b,g in rows] or rows[0][0]=="Trf"
    assert ("qtl","not_in_hanswehr","") in [(*q,) if len(q)==3 else q for q in [(*x,"") for x in quar]] or any(q[0]=="qtl" for q in quar)
    assert stats["total"]==2 and stats["glossed"]==1

def test_build_rows_raises_on_delimiter(tmp_path):
    from tools.prepare_hanswehr_glosses import build_rows
    with pytest.raises(ValueError, match="delimiter"):
        build_rows({}, ["Tr\tf"], {}, {})

def test_review_rows_kept_and_quarantined():
    from tools.prepare_hanswehr_glosses import review_rows
    out = review_rows([("Trf","blink")], [("qtl","not_in_hanswehr","")])
    assert ("Trf","kept","blink") in out
    assert ("qtl","not_in_hanswehr","") in out
```

- [ ] **Step 2: Run — expect fail** `PYTHONPATH=.:tools .venv/bin/pytest tests/test_prepare_hanswehr_glosses.py -v`
- [ ] **Step 3: Implement tool + `hanswehr_rejects.txt`.** Rejects header (verbatim intent): `# One root per line: root<TAB>reason. Subtracted from targets by load_hanswehr_targets. import-lane UPSERTS, so a re-run reinstates any gloss not listed here. Populated by the Task 6 human gate. Empty until then.`
- [ ] **Step 4: Run — expect pass.**
- [ ] **Step 5: Commit** `git commit -m "feat(scraper): prepare Hans Wehr gloss TSV for all roots with review + rejects gate"`

---

### Task 4: rank Hans Wehr top in shared DEFINITION_SOURCE_RANK

**Files:**
- Modify: `packages/data/src/queries/roots.ts:270-277`
- Test: `packages/data/tests/roots.test.ts` (add rank-order case to the existing suite — the repo keeps data tests under `packages/data/tests/`, not `src/test/`)

**Interfaces:**
- Produces: `DEFINITION_SOURCE_RANK` with `hanswehr` at 0; lane/qurandev-lane→1, salmone→2, corpus-forms→3, perseus-lane→4, ELSE→5. Consumed unchanged by `getRootDefinitions` (root page, all sources) and `getLemmaEntry` `LIMIT 1` (lemma page → now HW).

**Deps:** none (pure SQL CASE); downstream consumers `getRootDefinitions`/`getLemmaEntry` unchanged.
**Risks:** mis-renumber silently drops a source's rank → pinned by an ordering test asserting the full sequence incl. a direct `lane` row (alpha tie-break masks a single-source test).
**Rollback:** `git revert` the one file + `npm run build` (apps/web imports `dist/`).
**Acceptance (testable):** `getRootDefinitions` returns `[hanswehr, lane, qurandev-lane, salmone, corpus-forms, perseus-lane]` order; test at `packages/data/tests/roots.test.ts`.

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { DEFINITION_SOURCE_RANK } from '../queries/roots.js';
describe('DEFINITION_SOURCE_RANK', () => {
  it('ranks hanswehr above lane', () => {
    const s = DEFINITION_SOURCE_RANK;
    const hw = s.indexOf("'hanswehr'"), lane = s.indexOf("'lane'");
    expect(hw).toBeGreaterThan(-1);
    expect(s).toMatch(/WHEN 'hanswehr' THEN 0/);
    expect(s).toMatch(/WHEN 'lane' THEN 1/);
  });
});
```

- [ ] **Step 2: Run — expect fail** `cd packages/data && npx vitest run tests/roots.test.ts`
- [ ] **Step 3: Edit `DEFINITION_SOURCE_RANK`**: insert `WHEN 'hanswehr' THEN 0`, renumber lane/qurandev-lane→1, salmone→2, corpus-forms→3, perseus-lane→4, ELSE→5. Update the docstring block above it: add a paragraph — Hans Wehr is the concise modern gloss shown first; Lane's full classical entry renders below it (root page) and remains the lemma-page fallback for roots HW misses. Keep the existing Lane-vs-corpus-forms rationale.
- [ ] **Step 4: Run — expect pass.** Then `npm run build` in packages/data (apps/web imports dist/, [[packages-data-stale-dist-gotcha]]).
- [ ] **Step 5: Commit** `git add packages/data/src/queries/roots.ts packages/data/tests/roots.test.ts && git commit -m "feat(data): rank Hans Wehr above Lane in definition source order"`

---

### Task 5: web label + About credit + render verification

**Files:**
- Modify: `apps/web/src/lib/definitionSources.ts:14-20` (add `hanswehr` to SOURCE_LABELS)
- Modify: `apps/web/src/app/about/page.tsx` (add Hans Wehr credit entry)
- Test: `apps/web/src/test/definitionSources.test.ts`

**Interfaces:**
- Produces: `SOURCE_LABELS.get('hanswehr') === "Hans Wehr Dictionary of Modern Written Arabic"`.

**Deps:** Task 4 rank (HW renders first); `SOURCE_LABELS` map; About sources array.
**Risks:** §11 attribution wrong/missing for an in-copyright source → About note states © Harrassowitz + active copyright, not PD.
**Rollback:** `git revert` the two web files.
**Acceptance (testable):** `definitionSourceLabel('hanswehr')` returns the label; About page shows the HW credit with the copyright note; RootEntry renders HW-first, Lane collapsible below (rank-order, no RootEntry change).

- [ ] **Step 1: Write failing test**

```typescript
import { definitionSourceLabel } from '../lib/definitionSources';
it('labels hanswehr', () => {
  expect(definitionSourceLabel('hanswehr')).toBe('Hans Wehr Dictionary of Modern Written Arabic');
});
```

- [ ] **Step 2: Run — expect fail** `cd apps/web && npx vitest run src/test/definitionSources.test.ts`
- [ ] **Step 3a: Add label** to `SOURCE_LABELS` Map: `['hanswehr', 'Hans Wehr Dictionary of Modern Written Arabic']`.
- [ ] **Step 3b: Add About credit** entry in `about/page.tsx` sources array (§11): name "Hans Wehr Dictionary of Modern Written Arabic (Cowan ed.)", license "© Harrassowitz Verlag / Spoken Language Services — used with attribution", note describing it as the concise modern gloss shown first per root, Lane below. Copy tone/shape from the existing Salmoné/Lane entries.
- [ ] **Step 4: Run — expect pass.** Render check (manual, note in report): root page shows HW card first (short, unclamped), Lane card below with ClampedText show-more = the "collapsible full" the spec asks; no code change needed in RootEntry (renders rank order). `apps/web` typecheck + lint.
- [ ] **Step 5: Commit** `git add apps/web/src/lib/definitionSources.ts apps/web/src/app/about/page.tsx apps/web/src/test/definitionSources.test.ts && git commit -m "feat(web): credit Hans Wehr and label it as the primary root gloss"`

---

### Task 6: live import — reject review + write quran.db (GATED)

**Files:**
- Modify: `packages/scraper/tools/hanswehr_rejects.txt` (populated by human gate)
- No code change; runs the tool + existing `import-lane`.

**GATE — do not run without: (a) explicit per-moment user permission to write live `quran.db`, (b) completed reject review. This task is user-driven; the SDD controller STOPS here and hands to the user.**

**Deps:** Tasks 1-5 green + §5 CodeRabbit gate clear; explicit user write permission; backup taken.
**Risks:** a wrong-sense gloss ships live; a gloss lands on the wrong root (bw→arabic mismatch) — count parity alone would not catch either.
**Rollback (restore procedure):** `cp /home/claude/quran-data/quran.db.bak-phase23 /home/claude/quran-data/quran.db` restores pre-import state (import-lane upserts on (root_id,source), so it touches only `source='hanswehr'` rows); revert any `hanswehr_rejects.txt` edit. Backup MUST exist before the import runs.
**Acceptance (testable, alignment not count):** `SELECT count(*) … WHERE source='hanswehr'` equals TSV line count AND ≥5 spot-checked roots show the TSV gloss joined to the correct root_buckwalter (root↔gloss alignment, per [[validate-data-by-alignment-not-count]]) and render HW-first on a local build.

- [ ] **Step 1: Generate review** (read-only):
```bash
cd packages/scraper && PYTHONPATH=.:tools .venv/bin/python -m tools.prepare_hanswehr_glosses \
  --db /home/claude/quran-data/quran.db --hw /home/claude/quran-data/hanswehr.sqlite \
  --out /tmp/hw.tsv --review /tmp/hw_review.tsv
```
- [ ] **Step 2: Human reject review.** User inspects `hw_review.tsv` (esp. `not_in_hanswehr` for manual-fill candidates, and any wrong-sense glosses), populates `hanswehr_rejects.txt`. Re-run Step 1 after edits.
- [ ] **Step 3: Back up + import** (only after permission):
```bash
cp /home/claude/quran-data/quran.db /home/claude/quran-data/quran.db.bak-phase23
cd packages/scraper && .venv/bin/python -m scraper.cli import-lane /tmp/hw.tsv \
  --db /home/claude/quran-data/quran.db --source hanswehr
```
- [ ] **Step 4: Verify** live: `SELECT count(*) FROM root_definitions WHERE source='hanswehr'` matches TSV line count; spot-check 5 roots render HW-first on a local dev build. Update STATUS.md.
- [ ] **Step 5: Commit** rejects file + STATUS `git commit -m "chore(scraper): record Hans Wehr reject review and live import"`

---

## Self-Review

**Spec coverage:** HW import (T1–T3), rank HW>Lane (T4), label+credit §11 (T5), live gate (T6), Lane-collapsible-below (existing RootEntry rank-order render, verified T5 step 4), Salmoné superseded (not imported; rank keeps a harmless entry). Nominal noun-head (T2). Hamza/geminate coverage (T1). ✓
**Placeholder scan:** gate values (EXPECTED_HEADS, ANCHORS) measured in T1 Step 3a, not guessed. No TBD. ✓
**Type consistency:** `build_index`→`dict[str,list[tuple[int,str]]]`; `lookup`→`list[tuple[int,str]]|None`; `select_gloss(entries,…)` consumes that list; `build_rows` consumes both. Rank string keys quoted `'hanswehr'` consistent across T4 test + edit + T5 label. ✓
