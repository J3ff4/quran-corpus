# Phase 20 — Root Definition Coverage from Corpus Form Glosses

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill 155 of the 256 roots that render "No lexicon entry for this root yet", by parsing per-form lexical glosses out of the root snapshots phase 18 already archived.

**Architecture:** Parse-only phase, **zero network requests**. All 1642 root snapshots are on disk from phase 18. `corpus.quran.com/qurandictionary.jsp` prints a lexical gloss per derived form ("Verb (form I) - to strike, to set forth"); the existing dictionary parser never extracted it. New pure parser function + a prepare script emitting the TSV that the **existing** `import-lane --source corpus-forms` command already consumes. No schema change, no new importer, no web changes.

**Tech Stack:** Python 3.12, BeautifulSoup4 + lxml, click, pytest, uv. SQLite. No new dependencies.

## Global Constraints

- **Zero network requests.** Snapshots are the input. Any task reaching for httpx is wrong.
- No new dependencies. No schema change (`root_definitions` already has `source`).
- `import_lane_definitions` is reused unchanged — it is source-tagged and additive (`get_or_create_root` + `upsert_root_definition`). Do not write a second importer (DRY, §3).
- Parser stays pure `str -> list[FormGloss]`: network-free, fixture-tested.
- Snapshots and TSVs never enter git (§9) — **including as test fixtures.** A
  trimmed slice of a snapshot is still a scraped HTML dump. Tests use synthetic
  inline HTML; real snapshots are only ever read, never staged or committed.
  Real-snapshot behaviour is covered by the Task 2 spike, which runs against
  `~/quran-data/.snapshots/` in place.
- Conventional Commits, one logical change per commit (§9).
- `apps/web` untouched. The UI already renders multiple definitions and already
  has the empty state for what stays uncovered. `packages/data` is untouched too
  **unless the Decision below resolves to option (c)**, which requires an
  explicit source-priority contract there — see File Structure.

---

## Measured starting state (2026-07-31, live `~/quran-data/quran.db` + snapshots)

Queried, not assumed. Re-verify before acting — the DB is outside git.

| Fact | Value |
|---|---|
| `roots` rows | 1642 |
| snapshots on disk `~/quran-data/.snapshots/roots/` | **1642** (complete, phase 18) |
| roots with ≥1 `root_definitions` row | 1386 |
| roots with **none** | **256** |
| `root_definitions.source` values present | `qurandev-lane` only (1386 rows) |
| snapshots yielding ≥1 form gloss | **965** (58.8%) |
| of the 256 def-less roots, snapshot has a gloss | **155** |
| of the 256 def-less roots, still nothing anywhere | **101** |

### Why the 256 are empty (diagnosed, do not re-derive)

`qurandev/roots` `meanings.json` has 1523 entries vs our 1642 roots.

| cause | count | example |
|---|---|---|
| RootCode absent from source | 141 | ظلم `Zlm` 315x, ضلل `Dll` 191x, صلح `SlH` 180x |
| RootCode present, `Meanings` empty upstream | 102 | بعث `bEv` 67x, أتي `Aty` 549x, بين `byn` 523x |
| present but pure Lane apparatus, no English gloss | 13 | عين `Eyn` 65x → `"ayn n.f. (pl. uyun) 3:13, …"` |

All three are **upstream gaps**. `clean_meaning()` in `prepare_qurandev_roots.py` is correct — do not "fix" it.

### Why 101 stay uncovered

Noun-only roots print a bare `Noun` header and go straight to occurrences, no
gloss. Verified on أهل `Ahl` (127x): `"… correction. Noun (2:105:6) ahli (the)
People …"`. Upstream absence, not a parser miss. **Do not widen the regex to
chase these** — there is no gloss text there to find. They keep the
"No lexicon entry" empty state.

### Sample parser output (from real snapshots)

| root | extracted |
|---|---|
| `Drb` ضرب | `Verb (form I)` → `to strike, to set forth` |
| `bEv` بعث | `Verb (form I)` → `to raise, to resurrect, to send`; `Verb (form VII)` → `to send forth` |
| `Zlm` ظلم | `Verb (form I)` → `to oppress, to wrong`; `Verb (form IV)` → `to darken` |
| `qwl` قول | `Verb (form I)` → `to say`; `Verb (form V)` → `to fabricate, to make up` |

---

## Decision required before Task 4 — ASK THE USER, do not pick

`corpus-forms` sorts before `qurandev-lane` alphabetically. `getLemmaEntry`
(`packages/data/src/queries/lemma.ts`) and `getRootDefinitions` both use
`ORDER BY rd.source LIMIT 1`, so importing this source **silently promotes it
to "the" definition on the lemma page** for all 965 covered roots — including
the 810 that already have a Lane definition today.

For ضرب that swaps a 1479-char Lane wall for `to strike, to set forth`.
Arguably better, definitely a visible change to pages that were not broken.

Options:

- **(a)** import for all 965, accept the promotion.
- **(b)** import only the 155 def-less roots, leave existing pages untouched.
  Implemented by `--only-missing`; needs no query change.
- **(c)** import all 965 but keep Lane winning where it exists. This is **not**
  free: `ORDER BY rd.source` is a lexical sort, so it only holds if the tag is
  chosen to sort after `qurandev-lane` — `zz-corpus-forms` does, `corpus-forms`
  does not. That makes correctness depend on an unwritten naming convention
  that the next source can silently break. Choosing (c) therefore also requires:
  1. an explicit priority contract in `packages/data/src/queries/lemma.ts` —
     a `CASE` rank over `rd.source`, not alphabetical luck;
  2. a test in `packages/data/tests/lemma.test.ts` seeding both sources for one
     root and asserting the Lane text is the one returned;
  3. the same for `getRootDefinitions`, which orders identically.

  Do not pick (c) and skip 1–3 — an untested lexical-ordering assumption is how
  the `zzz-other` case in the existing lemma test got written in the first place.

**Task 4 is blocked until this is answered.**

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/scraper/scraper/sources/corpus_form_glosses.py` | **Create.** Pure parser: snapshot HTML → `list[FormGloss]`. |
| `packages/scraper/tests/test_corpus_form_glosses.py` | **Create.** Parser tests. HTML is synthetic and **inline** — the three cases a real snapshot would have covered (verb root/1 form, 2 forms, noun-only/no gloss) are hand-written in the test body. |
| `packages/scraper/tests/fixtures/root_*.html` | **Forbidden.** Never create. A trimmed snapshot is still a scraped HTML dump (§9); see Global Constraints. Task 1 Step 5 fails if `git status` shows anything here. |
| `packages/scraper/tools/prepare_corpus_form_glosses.py` | **Create.** Snapshots dir + DB → TSV for `import-lane`. |
| `packages/scraper/tests/test_prepare_corpus_form_glosses.py` | **Create.** Tests for filtering/joining/stats. |
| `STATUS.md` | **Modify.** Record the run. |

No changes to `sources/lane.py` or `cli.py`.

`packages/data` and `apps/web` are untouched **for options (a) and (b)**.
Option (c) is the exception and pulls both files below into scope — it is the
whole reason (c) costs more than a flag:

| File | Responsibility — **option (c) only** |
|---|---|
| `packages/data/src/queries/lemma.ts` | **Modify.** Replace `ORDER BY rd.source` with an explicit `CASE` rank in both `getLemmaEntry` and `getRootDefinitions`. |
| `packages/data/tests/lemma.test.ts` | **Modify.** Seed Lane + `corpus-forms` on one root; assert Lane wins, for both queries. |

---

### Task 1: Form-gloss parser

**Files:**
- Create: `packages/scraper/scraper/sources/corpus_form_glosses.py`
- Create: `packages/scraper/tests/test_corpus_form_glosses.py`
- No fixture files. Test HTML is synthetic and inline (see Step 1).

**Interfaces:**
- Consumes: nothing.
- Produces: `FormGloss` (NamedTuple: `pos_label: str`, `gloss: str`), and
  `parse_form_glosses(html: str) -> list[FormGloss]`.

- [ ] **Step 1: Read the real markup locally — do not save it**

A trimmed slice of a real snapshot is still a scraped HTML dump, and §9 forbids
committing those. Staging one under `tests/fixtures/` puts corpus.quran.com
markup into git history permanently, which is exactly the mistake that cost a
history purge in the `temp/` incident. So: **read** the shape, **write**
synthetic HTML.

Inspect (prints to the terminal, writes nothing):

```bash
cd packages/scraper && python3 - <<'PY'
import gzip, urllib.parse, pathlib, sys
d = pathlib.Path.home() / 'quran-data/.snapshots/roots'
m = {urllib.parse.unquote(p.name[5:-8]): p for p in d.iterdir()}
for bw in ['Drb', 'bEv', 'Ahl']:
    p = m.get(bw)
    if p is None:
        sys.exit(f'no snapshot for {bw} -- re-check the snapshot dir before continuing')
    s = gzip.open(p, 'rt', encoding='utf-8', errors='replace').read()
    i = s.find('brief glosses')
    if i == -1:
        sys.exit(f'{bw}: marker "brief glosses" absent -- the page shape changed, '
                 'do not guess a window; re-derive the selector first')
    print(f'===== {bw} =====')
    print(s[max(0, i - 1500):i + 2500])
PY
```

The `-1` guard matters: `str.find` returns -1 on a miss and `s[max(0,-1-1500):-1+2500]`
silently yields a window from the top of the page, so a changed page shape would
hand you a plausible-looking fixture of the wrong region.

- [ ] **Step 2: Write the failing test**

```python
# packages/scraper/tests/test_corpus_form_glosses.py
from scraper.sources.corpus_form_glosses import FormGloss, parse_form_glosses

# Synthetic, not scraped. These reproduce the shape confirmed in Step 1 -- a
# POS header, a dash, the gloss, then the first occurrence reference -- which is
# all the parser keys on. Hand-written markup also documents the contract far
# better than a 9KB slice of real page chrome would, and keeps corpus HTML out
# of git (§9).
DRB = """
<html><body><div class="qref">brief glosses</div>
<p><b>Verb (form I)</b> - to strike, to set forth
   <a href="/x">(2:26:6)</a> yadriba</p>
</body></html>
"""

BEV = """
<html><body><div class="qref">brief glosses</div>
<p><b>Verb (form I)</b> - to raise, to resurrect, to send
   <a href="/x">(2:56:2)</a> baAvanaAkum</p>
<p><b>Verb (form VII)</b> - to send forth
   <a href="/x">(7:14:2)</a> yubEavuwna</p>
</body></html>
"""

# A bare POS header, no dash and no gloss, straight to the occurrence.
AHL = """
<html><body><div class="qref">brief glosses</div>
<p><b>Noun</b> <a href="/x">(2:49:1)</a> Ahol</p>
</body></html>
"""


def test_single_form_verb_root():
    assert parse_form_glosses(DRB) == [FormGloss("Verb (form I)", "to strike, to set forth")]


def test_multi_form_root_keeps_document_order():
    assert parse_form_glosses(BEV) == [
        FormGloss("Verb (form I)", "to raise, to resurrect, to send"),
        FormGloss("Verb (form VII)", "to send forth"),
    ]


def test_noun_only_root_has_no_gloss():
    # The corpus prints a bare "Noun" header and goes straight to occurrences.
    # There is no gloss text to find -- returning [] is correct, and is what
    # leaves this root on the "No lexicon entry" empty state.
    assert parse_form_glosses(AHL) == []


def test_empty_and_garbage_input_never_raise():
    assert parse_form_glosses("") == []
    assert parse_form_glosses("<html><body>nothing here</body></html>") == []
```

- [ ] **Step 3: Run it, verify it fails**

Run: `cd packages/scraper && uv run pytest tests/test_corpus_form_glosses.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'scraper.sources.corpus_form_glosses'`

- [ ] **Step 4: Implement the parser**

```python
# packages/scraper/scraper/sources/corpus_form_glosses.py
"""Extract per-form lexical glosses from an archived corpus root page.

corpus.quran.com/qurandictionary.jsp prints, for each derived form, a POS
header and a short lexical gloss before the occurrence list::

    Verb (form I) - to strike, to set forth   (2:26:6) yadriba ...

That gloss is a real dictionary sense -- unlike the word-by-word glosses in
``word_glosses``, which are contextual and carry the surrounding sentence.
The dictionary scrape never captured it. This parser reads it back out of the
snapshots phase 18 archived, so recovering it costs no requests.

Noun-only roots print a bare ``Noun`` header with no gloss at all (verified on
أهل, 127 occurrences). Those yield ``[]`` -- an upstream absence, not a miss.
"""

from __future__ import annotations

import html as _html
import re
from typing import NamedTuple


class FormGloss(NamedTuple):
    pos_label: str
    gloss: str


# POS headers the corpus uses. Anchored as a full alternation so a stray
# "Verbal noun" is not matched as "Verb".
_POS = (
    r"(?:Active participle|Passive participle|Verbal noun|Proper noun|"
    r"Adjective|Adverb|Preposition|Pronoun|Particle|Verb|Noun)"
)

# "<POS>[ (form X)] - <gloss>" terminated by the first occurrence reference
# "(2:26:6)". The gloss itself never contains "(", which is what makes the
# reference a safe terminator.
_GLOSS = re.compile(
    rf"({_POS}(?:\s*\(form\s+[IVX]+\))?)\s*-\s*([^(]{{2,120}}?)\s*\(\d+:\d+"
)

_TAGS = re.compile(r"<[^>]+>")
_SCRIPTS = re.compile(r"<script.*?</script>|<style.*?</style>", re.S)


def _to_text(raw: str) -> str:
    stripped = _SCRIPTS.sub("", raw)
    return re.sub(r"\s+", " ", _html.unescape(_TAGS.sub(" ", stripped)))


def parse_form_glosses(raw_html: str) -> list[FormGloss]:
    """Pure: snapshot HTML -> form glosses in document order. Never raises."""
    if not raw_html:
        return []
    text = _to_text(raw_html)
    out: list[FormGloss] = []
    seen: set[tuple[str, str]] = set()
    for pos_label, gloss in _GLOSS.findall(text):
        pos_label = pos_label.strip()
        gloss = gloss.strip(" ,;:-")
        if not gloss:
            continue
        key = (pos_label, gloss)
        if key in seen:
            continue
        seen.add(key)
        out.append(FormGloss(pos_label, gloss))
    return out
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `cd packages/scraper && uv run pytest tests/test_corpus_form_glosses.py -v`
Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
git add packages/scraper/scraper/sources/corpus_form_glosses.py \
        packages/scraper/tests/test_corpus_form_glosses.py
git commit -m "feat(scraper): parse per-form lexical glosses from root snapshots"
```

No fixture files are staged — the test HTML is inline and synthetic. If
`git status` shows anything under `tests/fixtures/`, Step 1 was done wrong:
delete it rather than committing it.

**Dependencies:** none (first task; parser is pure `str -> list[FormGloss]`).
**Risks:** synthetic HTML can drift from the real page, so the parser passes its
tests and finds nothing in production. Task 2 is the check — it runs the parser
over all 1642 real snapshots, and a coverage number near zero means the
selector, not the corpus, is wrong.
**Rollback:** delete both new files. Nothing imports them yet; no DB touched.
**Acceptance:** `uv run pytest tests/test_corpus_form_glosses.py -v` → 4 passed;
`parse_form_glosses("")` and garbage input return `[]` without raising;
`git status` clean of `tests/fixtures/`.

---

### Task 2: Coverage spike — measure before importing anything

**Files:**
- Create: `packages/scraper/tools/prepare_corpus_form_glosses.py` (spike mode only; TSV output lands in Task 3)

**Interfaces:**
- Consumes: `parse_form_glosses` from Task 1.
- Produces: `iter_root_glosses(snapshot_dir: Path) -> Iterator[tuple[str, list[FormGloss]]]`
  yielding `(root_buckwalter, glosses)`; and `join_glosses(glosses: list[FormGloss]) -> str`.

Per §14 and the validate-by-alignment rule: **never accept a row count as
proof.** This task exists so the numbers in this plan are re-confirmed against
live data before any write.

- [ ] **Step 1: Write the failing test**

```python
# packages/scraper/tests/test_prepare_corpus_form_glosses.py
import gzip
from pathlib import Path

from scraper.sources.corpus_form_glosses import FormGloss
from tools.prepare_corpus_form_glosses import iter_root_glosses, join_glosses


def test_join_glosses_dedupes_and_orders():
    # Two forms sharing a sense must not print it twice (نصر: form I and form
    # VI are both "to help").
    got = join_glosses([
        FormGloss("Verb (form I)", "to help"),
        FormGloss("Verb (form VI)", "to help"),
        FormGloss("Verb (form X)", "to seek help"),
    ])
    assert got == "to help; to seek help"


def test_join_glosses_empty():
    assert join_glosses([]) == ""


def test_iter_root_glosses_decodes_percent_encoded_filenames(tmp_path: Path):
    # Snapshot filenames are percent-encoded Buckwalter; "$Am" is stored as
    # "root_%24%41m.html.gz". Reading them back requires unquoting, and getting
    # this wrong silently yields zero roots.
    body = b'<html>Verb (form I) - to strike (2:26:6) x</html>'
    (tmp_path / "root_%24%41m.html.gz").write_bytes(gzip.compress(body))
    got = dict(iter_root_glosses(tmp_path))
    assert list(got) == ["$Am"]
    assert got["$Am"] == [FormGloss("Verb (form I)", "to strike")]
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd packages/scraper && uv run pytest tests/test_prepare_corpus_form_glosses.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'tools.prepare_corpus_form_glosses'`

- [ ] **Step 3: Implement the two helpers**

```python
# packages/scraper/tools/prepare_corpus_form_glosses.py
"""Snapshot archive -> Lane-importer TSV of root definitions.

Reads the root snapshots phase 18 archived (no network), extracts each root's
per-form lexical glosses, and joins them into one definition string per root.
Output feeds the EXISTING ``import-lane --source corpus-forms``.
"""

from __future__ import annotations

import gzip
import urllib.parse
from collections.abc import Iterator
from pathlib import Path

from scraper.sources.corpus_form_glosses import FormGloss, parse_form_glosses


def iter_root_glosses(snapshot_dir: Path) -> Iterator[tuple[str, list[FormGloss]]]:
    """Yield (root_buckwalter, glosses) for every snapshot, in filename order.

    Filenames are ``root_<percent-encoded-buckwalter>.html.gz``; the encoding
    is not URL-safe-default, so unquote is mandatory -- skipping it yields a
    key that matches no root and the whole run silently imports nothing.
    """
    for path in sorted(snapshot_dir.iterdir()):
        name = path.name
        if not name.startswith("root_") or not name.endswith(".html.gz"):
            continue
        bw = urllib.parse.unquote(name[len("root_"):-len(".html.gz")])
        raw = gzip.open(path, "rt", encoding="utf-8", errors="replace").read()
        yield bw, parse_form_glosses(raw)


def join_glosses(glosses: list[FormGloss]) -> str:
    """One definition string per root: distinct senses, document order.

    Form labels are dropped -- ``root_definitions`` is per-root, and the form
    breakdown is already on the page as the derived-form chips.
    """
    seen: set[str] = set()
    out: list[str] = []
    for g in glosses:
        if g.gloss in seen:
            continue
        seen.add(g.gloss)
        out.append(g.gloss)
    return "; ".join(out)
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd packages/scraper && uv run pytest tests/test_prepare_corpus_form_glosses.py -v`
Expected: 3 passed

- [ ] **Step 5: Run the live spike and confirm this plan's numbers**

Run:

```bash
cd packages/scraper && python3 - <<'PY'
import sqlite3, pathlib
from tools.prepare_corpus_form_glosses import iter_root_glosses, join_glosses

snaps = pathlib.Path.home() / "quran-data/.snapshots/roots"
con = sqlite3.connect(pathlib.Path.home() / "quran-data/quran.db")
defless = {r[0] for r in con.execute(
    "SELECT r.root_buckwalter FROM roots r LEFT JOIN root_definitions rd "
    "ON rd.root_id=r.id WHERE rd.id IS NULL")}
known = {r[0] for r in con.execute("SELECT root_buckwalter FROM roots")}

covered = fills = unknown = 0
for bw, gl in iter_root_glosses(snaps):
    if bw not in known:
        unknown += 1
        continue
    if gl:
        covered += 1
        if bw in defless:
            fills += 1
print(f"def-less roots: {len(defless)}  (expect 256)")
print(f"roots with a parsed gloss: {covered}  (expect 965)")
print(f"def-less roots this fills: {fills}  (expect 155)")
print(f"snapshot roots not in DB: {unknown}  (expect 0)")
PY
```

Expected: `256 / 965 / 155 / 0`.

**Gate:** if any number differs by more than ±5, STOP and report. The DB
changed under the plan; do not import against unverified numbers.

- [ ] **Step 6: Spot-check 10 definitions by hand, not by count**

Run:

```bash
cd packages/scraper && python3 - <<'PY'
import pathlib
from tools.prepare_corpus_form_glosses import iter_root_glosses, join_glosses
want = {"Drb","bEv","Zlm","Aty","byn","nSr","qwl","Dll","SlH","bSr"}
snaps = pathlib.Path.home() / "quran-data/.snapshots/roots"
for bw, gl in iter_root_glosses(snaps):
    if bw in want:
        print(f"{bw:6} {join_glosses(gl)!r}")
PY
```

Read every line. Each must be a plausible lexical meaning of that root
(`Drb` → `to strike, to set forth`). A wrong-but-well-formed string is the
failure mode row counts cannot catch (§14, validate-by-alignment).

- [ ] **Step 7: Commit**

```bash
git add packages/scraper/tools/prepare_corpus_form_glosses.py \
        packages/scraper/tests/test_prepare_corpus_form_glosses.py
git commit -m "feat(scraper): add corpus form-gloss extraction helpers"
```

**Dependencies:** Task 1 (`parse_form_glosses`, `FormGloss`). Reads
`~/quran-data/.snapshots/roots` and `~/quran-data/quran.db` — both outside git,
so re-verify they exist before starting rather than trusting the numbers below.
**Risks:** the measured coverage (965/1642 roots, 155 of the 256 def-less ones)
was taken 2026-07-31 against a DB that changes outside version control. A
materially different number means the input moved, not that the parser is
broken — stop and re-measure before continuing to Task 3.
**Rollback:** spike only, no writes. Delete the scratch script.
**Acceptance:** spike prints a coverage table; ≥900 roots yield ≥1 gloss; the
four hand-checked roots (`Drb`, `bEv`, `Zlm`, `qwl`) return the exact strings in
"Measured starting state"; every printed gloss is a plausible lexical meaning
read line by line, not a row count (§14, validate-by-alignment).

---

### Task 3: TSV emitter with CLI

**Files:**
- Modify: `packages/scraper/tools/prepare_corpus_form_glosses.py`
- Modify: `packages/scraper/tests/test_prepare_corpus_form_glosses.py`

**Interfaces:**
- Consumes: `iter_root_glosses`, `join_glosses` from Task 2.
- Produces: `build_rows(snapshot_dir, valid_roots, only_roots=None) -> tuple[list[tuple[str, str]], dict[str, int]]`
  and a `__main__` CLI writing `root_buckwalter<TAB>definition`.

- [ ] **Step 1: Write the failing test**

```python
from pathlib import Path

import pytest


def test_build_rows_filters_to_known_roots(tmp_path: Path):
    import gzip
    body = b'<html>Verb (form I) - to strike (2:26:6) x</html>'
    (tmp_path / "root_Drb.html.gz").write_bytes(gzip.compress(body))
    (tmp_path / "root_zzz.html.gz").write_bytes(gzip.compress(body))
    from tools.prepare_corpus_form_glosses import build_rows
    rows, stats = build_rows(tmp_path, valid_roots={"Drb"})
    assert rows == [("Drb", "to strike")]
    assert stats["unknown_root"] == 1
    assert stats["kept"] == 1


def test_build_rows_drops_roots_with_no_gloss(tmp_path: Path):
    import gzip
    (tmp_path / "root_Ahl.html.gz").write_bytes(
        gzip.compress(b"<html>Noun (2:105:6) ahli</html>"))
    from tools.prepare_corpus_form_glosses import build_rows
    rows, stats = build_rows(tmp_path, valid_roots={"Ahl"})
    assert rows == []
    assert stats["no_gloss"] == 1


def test_build_rows_only_roots_narrows_output(tmp_path: Path):
    # Supports the "import only the def-less 155" decision without a second
    # code path.
    import gzip
    body = b'<html>Verb (form I) - to strike (2:26:6) x</html>'
    for bw in ("Drb", "qwl"):
        (tmp_path / f"root_{bw}.html.gz").write_bytes(gzip.compress(body))
    from tools.prepare_corpus_form_glosses import build_rows
    rows, _ = build_rows(tmp_path, valid_roots={"Drb", "qwl"}, only_roots={"qwl"})
    assert [r[0] for r in rows] == ["qwl"]


@pytest.mark.parametrize("bad", ["\t", "\n", "\r"])
def test_build_rows_rejects_tsv_delimiters(tmp_path: Path, bad: str, monkeypatch):
    # The TSV has no quoting, so a delimiter inside a definition shifts every
    # column after it and `import-lane` writes one root's text onto another.
    # `join_glosses` normalises whitespace today, so the only way to reach the
    # guard is to bypass it -- which is the point: the guard must not depend on
    # the normaliser staying as it is.
    import gzip
    import tools.prepare_corpus_form_glosses as mod
    (tmp_path / "root_Drb.html.gz").write_bytes(
        gzip.compress(b'<html>Verb (form I) - to strike (2:26:6) x</html>')
    )
    monkeypatch.setattr(mod, "join_glosses", lambda _g: f"to strike{bad}to set forth")
    with pytest.raises(ValueError, match="TSV delimiter"):
        mod.build_rows(tmp_path, valid_roots={"Drb"})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd packages/scraper && uv run pytest tests/test_prepare_corpus_form_glosses.py -v`
Expected: FAIL, `ImportError: cannot import name 'build_rows'`

- [ ] **Step 3: Implement `build_rows` + CLI**

```python
def build_rows(
    snapshot_dir: Path,
    valid_roots: set[str],
    only_roots: set[str] | None = None,
) -> tuple[list[tuple[str, str]], dict[str, int]]:
    """Snapshots -> (buckwalter, definition) rows, plus drop statistics.

    Filters to roots already in the DB so a stray snapshot can never create a
    junk root, and optionally narrows to ``only_roots`` (the def-less set).
    """
    rows: list[tuple[str, str]] = []
    stats = {"total": 0, "unknown_root": 0, "no_gloss": 0, "skipped": 0, "kept": 0}
    for bw, glosses in iter_root_glosses(snapshot_dir):
        stats["total"] += 1
        if bw not in valid_roots:
            stats["unknown_root"] += 1
            continue
        if only_roots is not None and bw not in only_roots:
            stats["skipped"] += 1
            continue
        definition = join_glosses(glosses)
        if not definition:
            stats["no_gloss"] += 1
            continue
        # The output format is delimiter-separated with no quoting, so a literal
        # tab or newline in a definition does not corrupt one row -- it shifts
        # every column after it, and `import-lane` would write the tail of one
        # definition into the next root. Today `join_glosses` normalises
        # whitespace and this can never fire; that is exactly why it is asserted
        # here rather than assumed, since the check costs nothing and the
        # normaliser is free to change. Raise, never escape: a definition
        # containing a tab means the parser is wrong upstream.
        if any(ch in definition for ch in "\t\n\r"):
            raise ValueError(f"definition for {bw!r} contains a TSV delimiter")
        rows.append((bw, definition))
        stats["kept"] += 1
    return rows, stats


def _main() -> None:
    import argparse
    import sqlite3

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--snapshots", required=True, type=Path)
    ap.add_argument("--db", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument(
        "--only-missing",
        action="store_true",
        help="restrict to roots that currently have no definition at all",
    )
    args = ap.parse_args()

    con = sqlite3.connect(args.db)
    valid = {r[0] for r in con.execute("SELECT root_buckwalter FROM roots")}
    only = None
    if args.only_missing:
        only = {
            r[0]
            for r in con.execute(
                "SELECT r.root_buckwalter FROM roots r "
                "LEFT JOIN root_definitions rd ON rd.root_id = r.id "
                "WHERE rd.id IS NULL"
            )
        }
    con.close()

    rows, stats = build_rows(args.snapshots, valid, only)
    with args.out.open("w", encoding="utf-8") as fh:
        for bw, definition in rows:
            fh.write(f"{bw}\t{definition}\n")
    print(stats)


if __name__ == "__main__":
    _main()
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd packages/scraper && uv run pytest tests/test_prepare_corpus_form_glosses.py -v`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/tools/prepare_corpus_form_glosses.py \
        packages/scraper/tests/test_prepare_corpus_form_glosses.py
git commit -m "feat(scraper): emit root-definition TSV from corpus form glosses"
```

**Dependencies:** Tasks 1 and 2 (`parse_form_glosses`, `iter_root_glosses`,
`join_glosses`). Needs `roots.root_buckwalter` from the live DB for the
valid-root filter.
**Risks:** a root code present in the snapshots but absent from `roots` would be
inserted as a new root by `get_or_create_root`, inventing entries the corpus
never had. `build_rows` filters against `valid_roots` for exactly this reason —
the `unknown_root` stat must be asserted, not just computed. Emitting a TSV is
also where a stray tab or newline inside a gloss would corrupt the file; the
emitter must reject rather than escape those.
**Rollback:** delete the tool and its test, and the generated TSV. Still no DB
writes at this point — the TSV is an artifact, not an import.
**Acceptance:** `uv run pytest tests/test_prepare_corpus_form_glosses.py -v` →
6 passed; `build_rows` drops unknown roots and gloss-less roots with the counts
surfacing in `stats`; the CLI writes `root_buckwalter<TAB>definition` with one
row per kept root and no row containing a literal tab or newline; the TSV is
untracked.

---

### Task 4: Import against a DB copy, verify, then import live

**BLOCKED** until the "Decision required" section above is answered. `--only-missing`
implements option (b); dropping the flag implements option (a).

**Files:**
- Modify: `STATUS.md`

- [ ] **Step 1: Back up the live DB**

`cp` on a live SQLite file can capture a torn page set — the dev server holds a
connection and WAL content sits outside the main file, so a plain copy is only
sound if every writer is stopped. `VACUUM INTO` takes a consistent snapshot
through SQLite itself, with no such precondition:

```bash
sqlite3 ~/quran-data/quran.db "VACUUM INTO '$HOME/quran-data/quran.db.bak-phase20'"
```

- [ ] **Step 2: Generate the TSV against a COPY**

Same reason, same mechanism — this copy is what the import is rehearsed against,
so a torn one would invalidate the rehearsal:

```bash
sqlite3 ~/quran-data/quran.db "VACUUM INTO '/tmp/phase20-test.db'"
cd packages/scraper && python3 tools/prepare_corpus_form_glosses.py \
  --snapshots ~/quran-data/.snapshots/roots \
  --db /tmp/phase20-test.db \
  --out /tmp/phase20.tsv \
  --only-missing          # omit iff decision (a) was chosen
wc -l /tmp/phase20.tsv    # expect 155 for (b), 965 for (a)
```

- [ ] **Step 3: Import into the copy using the EXISTING command**

```bash
cd packages/scraper && uv run scraper import-lane /tmp/phase20.tsv \
  --db /tmp/phase20-test.db --source corpus-forms
```

Expected: `Lane import complete: 155 definitions (source=corpus-forms).`

- [ ] **Step 4: Verify on the copy by alignment, not count**

```bash
python3 - <<'PY'
import sqlite3
con = sqlite3.connect("/tmp/phase20-test.db")
before_missing = 256
now = con.execute(
    "SELECT COUNT(*) FROM roots r LEFT JOIN root_definitions rd "
    "ON rd.root_id=r.id WHERE rd.id IS NULL").fetchone()[0]
print("roots still with no definition:", now, "(expect 101)")
print("no root rows created:", con.execute("SELECT COUNT(*) FROM roots").fetchone()[0], "(expect 1642)")
for bw in ("bEv", "Zlm", "Aty", "byn", "nSr"):
    row = con.execute(
        "SELECT rd.source, rd.definition FROM roots r JOIN root_definitions rd "
        "ON rd.root_id=r.id WHERE r.root_buckwalter=?", (bw,)).fetchall()
    print(bw, row)
PY
```

Gate: `101` remaining, `1642` roots (nothing created), and every printed
definition reads as a real meaning of that root.

- [ ] **Step 5: Import live**

`--only-missing` picks its root set when the TSV is *generated*, but the import
happens later and commits per row. Anything that writes a definition in between
— a re-run of `import-qurandev-roots`, a manual fix — leaves the TSV stale, and
the import then adds `corpus-forms` to a root that acquired Lane text meanwhile,
which is the exact promotion option (b) was chosen to avoid. Two operators are
not the threat here; a second terminal is.

So: **generate and import back to back, with no other writer running**, and then
prove it held rather than assume it. Do not rely on the gap being short.

```bash
# Nothing else may write ~/quran-data/quran.db between these two commands.
cd packages/scraper && python3 tools/prepare_corpus_form_glosses.py \
  --snapshots ~/quran-data/.snapshots/roots \
  --db ~/quran-data/quran.db --out /tmp/phase20-live.tsv --only-missing
uv run scraper import-lane /tmp/phase20-live.tsv \
  --db ~/quran-data/quran.db --source corpus-forms
```

Post-condition, run immediately after (option (b) only) — this is what actually
detects the race, since a root holding both sources is precisely its outcome:

Written against **any** other source, not against `qurandev-lane` specifically:
`qurandev-lane` is merely the only source present today (see the starting-state
table), and a check naming it would return `0` for a root that acquired some
third source in the window — reporting success for the exact violation it exists
to catch.

```bash
sqlite3 ~/quran-data/quran.db "
SELECT COUNT(*) FROM root_definitions a
  JOIN root_definitions b ON b.root_id = a.root_id
 WHERE a.source = 'corpus-forms' AND b.source <> 'corpus-forms';"
```

Must print `0`. Non-zero means a root received `corpus-forms` despite already
having a definition — i.e. a writer landed inside the window, or the TSV was
generated without `--only-missing`. Roll back with the `DELETE` below, then
regenerate and re-import.

- [ ] **Step 6: Verify in the running app**

Rebuild `packages/data` and restart the dev server first — `apps/web` imports
the compiled `dist/`, and a stale build makes a correct fix look like a no-op.

```bash
cd packages/data && npm run build
```

Load `/dictionary/bEv`, `/dictionary/Zlm`, `/dictionary/Aty`. Each must now
show a definition card sourced `corpus-forms` instead of the "No lexicon
entry" note. Load `/dictionary/Ahl` — it must STILL show the empty state
(one of the 101).

- [ ] **Step 7: Update `STATUS.md` and commit**

Record: roots with definitions before/after, the 101 that remain and why, the
source tag used, and which import option the user chose.

```bash
git add STATUS.md
git commit -m "docs(status): record phase 20 root-definition import"
```

**Dependencies:** Tasks 1–3, the existing `import-lane --source` CLI, and **the
blocking decision above** — this task cannot start without it.
**Risks:** the only task that writes to the live DB. Three distinct failure
modes: the import runs against a torn copy (Step 1 `VACUUM INTO`, not `cp`); the
source tag promotes `corpus-forms` over Lane on 810 pages that were fine (the
decision; `--only-missing` avoids it outright); and under (b), a writer landing
between TSV generation and import makes the root set stale, re-introducing that
same promotion through the back door — Step 5's post-condition query is what
catches it. `packages/data` ships as
compiled `dist/`, so a correct import can look like a no-op in the browser until
Step 6's rebuild — do not diagnose that as a data failure.
**Rollback:** `DELETE FROM root_definitions WHERE source='corpus-forms'` undoes
the import without touching Lane rows; the Step 1 snapshot is the fallback if
the file itself is damaged. Restore it with
`cp ~/quran-data/quran.db.bak-phase20 ~/quran-data/quran.db` after stopping the
dev server.
**Acceptance:** rehearsal on `/tmp/phase20-test.db` reports exactly the expected
insert count before the live run; after the live import, `/dictionary/bEv`,
`/dictionary/Zlm` and `/dictionary/Aty` each render a definition card sourced
`corpus-forms`; `/dictionary/Ahl` still renders the "No lexicon entry" empty
state; roots-with-definitions rises by the count the spike predicted and by no
more; `STATUS.md` records before/after, the remaining 101, the source tag and
the option chosen.

---

## Risks & Rollback

| Risk | Mitigation | Rollback |
|---|---|---|
| Import promotes `corpus-forms` over Lane on 810 pages that were fine | The blocking decision above; `--only-missing` avoids it entirely | `DELETE FROM root_definitions WHERE source='corpus-forms'` |
| Live DB corrupted mid-import | Step 1 backup; Steps 2–4 run against a copy first | `cp ~/quran-data/quran.db.bak-phase20 ~/quran-data/quran.db` |
| Filename unquote wrong → silently imports 0 | Task 2 test pins the percent-encoded case; Step 5 gate expects exact counts | n/a, nothing written |
| Regex widened to chase the 101 noun-only roots, inventing text | Stated non-goal; `test_noun_only_root_has_no_gloss` fails if widened | revert |
| Parsed gloss is well-formed but wrong | Task 2 Step 6 + Task 4 Step 4 hand spot-checks (§14) | delete by source tag |

## Acceptance Criteria

- [ ] `parse_form_glosses` is pure, network-free, and returns `[]` for noun-only roots.
- [ ] All scraper tests pass: `cd packages/scraper && uv run pytest`.
- [ ] Live spike reproduces 256 / 965 / 155 / 0 within ±5.
- [ ] After import, roots with no definition drops 256 → 101.
- [ ] `SELECT COUNT(*) FROM roots` is still 1642 — no root created.
- [ ] `/dictionary/bEv` shows a definition; `/dictionary/Ahl` still shows the empty state.
- [ ] Zero network requests made in the whole phase.
- [ ] No changes under `packages/data/` or `apps/web/`.
