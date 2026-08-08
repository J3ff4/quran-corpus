# Phase 24 — Hans Wehr Gloss Quality (+ Salmoné Import, abandoned mid-phase)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Steps use `- [ ]` checkboxes. §13 model floor: Sonnet, never Haiku. Compact after every task.

> **This is a plan, not a manual — it records intent as of authoring (2026-08-06) and the code is the contract.** Two kinds of drift are marked in place rather than rewritten. **(1) Salmoné was dropped mid-phase** (see Task 9): Tasks 8–9 and every Salmoné mention are **historical and non-operative** — do not execute them, and do not add Salmoné automation. Its replacement is 14 hand-written editorial glosses at rank -1. **(2) Interface blocks, CLI examples and counts below predate the implementation** they describe: Task 1's `audit()`/`main()` contract (superseded by `tools/hanswehr_baseline.py`), the `--show` example, the `select_gloss`/`candidates` signatures (both now take `root`), and the known-gap counts at the end (a pre-editorial-import snapshot). Where a block could mislead an operator running live commands it has been corrected instead; everything else stands as written.

**Goal:** Phase 23 shipped 1476 Hans Wehr glosses live as the rank-0 (top) root definition with its human reject gate un-run. 336 of 1476 (23% of roots, 8362 of 47193 word occurrences) carry a defective gloss. Fix the mechanical defects in the extractor, run the semantic gate the user now wants, and ~~finish the Salmoné import phase 22 left half-done~~ — *superseded: Salmoné was dropped and the 14 uncovered roots got hand-written editorial glosses instead.*

**Architecture:** Three parts, sequential. **A** fixes `hanswehr_gloss.py` against a fixture corpus of named failing roots, gated by a new audit script that classifies every generated gloss into defect buckets — mechanical buckets must hit zero. **B** adds an overrides file so the user's eyeball decisions (semantic, not automatable) survive re-runs, then re-imports. ~~**C** re-fetches Salmoné's XML, runs its existing prepare tool, takes the user's reject review, imports at rank 2.~~ — *superseded: **C** became a hand-written editorial gloss set at rank -1 covering the roots no dictionary reaches.*

**Tech Stack:** Python 3.12 (`packages/scraper/.venv/bin/python`), pytest, sqlite3 stdlib, click CLI. No new dependencies.

## Global Constraints

- **§5 CodeRabbit gate is a HARD BLOCK.** Author never overrides, never self-dismisses. Read the pre-merge check table, not just the verdict. Rate-limited review posts a GREEN status — read the description.
- **§4 6-step loop per task.** Step 3 (`/code-review`) is user-triggered: stop and ask.
- **Live `quran.db` writes are GATED**: require (a) explicit per-moment user permission, (b) a fresh backup, (c) the completed human review for that part. Tasks A and C-prep write no DB.
- **§10 validate by alignment, not count.** Row counts prove nothing; spot-check root↔gloss joins.
- Read-only access to source DBs: `sqlite3.connect(f"file:{path}?mode=ro", uri=True)`. Never open `hanswehr.sqlite` writable.
- Hans Wehr is under copyright — ship-public risk accepted, attribution already at `apps/web/src/app/about/page.tsx:63`. Do not remove it.
- Scraper commands run under `packages/scraper/.venv/bin/python -m scraper.cli`. System `python3` lacks pydantic.
- Conventional Commits, scope `scraper` / `data` / `web`.
- No new npm/pip dependency without asking (§12).

## Ground truth measured 2026-08-06 (live `~/quran-data/quran.db`)

| bucket | n roots | cause | fixable how |
|---|---|---|---|
| `frag` | 142 | `_strip_head` breaks at an unclassified token, leaving the transliteration head | mechanical (Task 2) |
| `arabic` | 117 | Arabic script survives past the head; `_ARABIC_PAREN` only strips parenthesised runs | mechanical (Task 3) |
| `disagree` | 76 | wrong entry or wrong sense picked — **not automatable** | human gate (Task 5/6) |
| `long` | 53 | `max_senses=3` caps sense *count*, not length; one sense reaches 260 chars | mechanical (Task 4) |
| `pageno` | 7 | HW inlines page numbers mid-definition (`"mountain 571"`, `"to 632 renege"`) | mechanical (Task 4) |

Distinct roots with ≥1 flag: **336**. Buckets overlap.

## Why `disagree` is not automatable

Two independent causes, both needing semantics:

1. **Entry pick.** `prepare_hanswehr_glosses.py:87` sets `prefer_nominal=True` when a root's `word_segments` nominal share > 0.8, and `select_gloss` then takes the first `is_root == 0` entry. Measured: this changes the gloss on a large set and is right about as often as it is wrong.
   - Right: `nfs` → "soul; psyche; spirit, mind" (vs "be precious, valuable"), `jnn` → "jinn, demons", `xyr` → "good; excellent", `Hsn` → "beauty".
   - Wrong: `ArD` → "termite; woodworm" (`is_root=1` entry says "earth; land, country, region"), `rHm` → "uterus; womb" (verbal entry says "have mercy, have compassion"), `EZm` → "bone", `mrA` → "hypocrite".
2. **Sense pick inside the right entry.** `select_gloss` cuts at the first `<b>` / `│` / `" -- "` (`hanswehr_gloss.py:128-141`) — which is exactly where HW puts the Quranic sense for some roots.
   - `kfr` (525): entry reads `"to cover, hide (هـ s.th.); -- (kufr...) to be irreligious, be an infidel, not to believe"`. The cut at `--` keeps "cover, hide" and discards the Quranic sense.
   - `rsl` (513): `"rasila a to be long and flowing (hair) <b>III</b> ... <b>IV</b> (أَرْسَلَ) to send out, dispatch"`. The cut at `<b>` discards "send".

`hanswehr.sqlite`'s `quran_occurrence` column does **not** discriminate senses: 1497 non-null values, all on `is_root=1` rows, one value per headword (all three من entries share 4097). It confirms *which head* is Quranic, never *which sense*. There is no signal in the source that picks the sense. Hence Task 5's review TSV emits candidates and the user picks.

## Part C scope note

**No UI work needed.** `RootEntry.tsx:82-118` already maps every definition to its own collapsible `ClampedText` block with a source credit, ordered by `DEFINITION_SOURCE_RANK` (`packages/data/src/queries/roots.ts:277`), where `salmone` is 2 — already below `lane`/`qurandev-lane` at 1. Importing rows is the whole job.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/scraper/tools/audit_hanswehr_glosses.py` | **new.** Classify every generated gloss into defect buckets. Was the gate for Tasks 2-4 via bucket ceilings; **demoted to a classifier library after round 7** — its ceilings caused 2 of the phase's bugs. | 1 |
| `packages/scraper/tests/test_audit_hanswehr_glosses.py` | **new.** Unit tests for each classifier. | 1 |
| `packages/scraper/tools/hanswehr_baseline.py` | **new (post-round-7).** Regenerate all 1642 roots and diff against a committed per-root baseline; exit 1 on any added/removed/changed row. **The gate.** Buckets ride along as a column. | — |
| `packages/scraper/tools/hanswehr_baseline.tsv` | **new (post-round-7).** The baseline: `root  status  buckets  gloss`, sorted by root. Moved only by `--update`, so every gloss change lands in a reviewed diff. | — |
| `packages/scraper/tests/test_hanswehr_baseline.py` | **new (post-round-7).** Unit tests for generate/read/compare/CLI. | — |
| `packages/scraper/scraper/hanswehr_gloss.py` | **modify.** `_strip_head` (frag), Arabic-tail cut (arabic), `max_chars` + page-number strip (long/pageno). | 2,3,4 |
| `packages/scraper/tests/test_hanswehr_gloss.py` | **modify.** One test per named failing root, expected gloss asserted in full. | 2,3,4 |
| `packages/scraper/tools/hanswehr_overrides.tsv` | **new.** `root<TAB>gloss`. Empty gloss = drop the root's HW row. The user's semantic decisions. | 5 |
| `packages/scraper/tools/prepare_hanswehr_glosses.py` | **modify.** Load overrides, apply them, emit a candidate-bearing review TSV. | 5 |
| `packages/scraper/tests/test_prepare_hanswehr_glosses.py` | **modify.** Override application + candidate emission. | 5 |
| `packages/scraper/scraper/cli.py` | **modify.** `prune-definitions` command for the delete path `import-lane` lacks. | 6 |
| `packages/scraper/tests/test_cli.py` | **modify.** Prune command test. | 6 |
| `STATUS.md` | **modify.** Record each landed part. | 4,7,9 |

---

## Task 1: audit script — the gate for Parts A

**Files:**
- Create: `packages/scraper/tools/audit_hanswehr_glosses.py`
- Test: `packages/scraper/tests/test_audit_hanswehr_glosses.py`

**Interfaces:**
- Consumes: `scraper.sources.hanswehr.build_index`, `lookup`; `scraper.hanswehr_gloss.select_gloss`; `tools.prepare_hanswehr_glosses.load_nominal_shares`.
- Produces: `classify(gloss: str) -> set[str]` returning any of `{"frag","arabic","long","pageno"}` (empty set = clean). `audit(db_path: Path, hw_path: Path) -> dict[str, list[str]]` mapping bucket → sorted root list. `main()` prints per-bucket counts and exits 1 if `frag|arabic|long|pageno` is non-empty.

Bucket `disagree` is deliberately **not** in `classify` — it needs the corpus-forms comparison and a human, and it must never gate a mechanical fix.

- [ ] **Step 1: Write the failing test**

```python
# packages/scraper/tests/test_audit_hanswehr_glosses.py
import pytest

from tools.audit_hanswehr_glosses import classify


@pytest.mark.parametrize(
    "gloss,expected",
    [
        ("earth; land, country", set()),
        ("u a and na‘ima a to live in comfort", {"frag"}),
        ("and", {"frag"}),
        ("and II, III", {"frag"}),
        ("tajara u and", {"frag"}),
        ("kalal, كلال kalāl weariness", {"arabic"}),
        ("mountain 571", {"pageno"}),
        ("x" * 151, {"long"}),
        ("x" * 150, set()),
    ],
)
def test_classify_buckets(gloss, expected):
    assert classify(gloss) == expected


def test_classify_does_not_flag_a_spelled_out_number():
    assert classify("one fifth") == set()


def test_classify_combines_buckets():
    assert classify("u and كلال " + "x" * 160) == {"frag", "arabic", "long"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/scraper && .venv/bin/python -m pytest tests/test_audit_hanswehr_glosses.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'tools.audit_hanswehr_glosses'`

- [ ] **Step 3: Write the implementation**

```python
# packages/scraper/tools/audit_hanswehr_glosses.py
"""Classify generated Hans Wehr glosses into defect buckets, and gate on them.

Phase 23 shipped 1476 glosses with its human review gate un-run; 336 carried a
defect. This is the regression gate for the mechanical ones: `main()` exits 1
while any of frag/arabic/long/pageno is non-empty, so a fix to
`hanswehr_gloss.select_gloss` is only done when this prints zeros.

The semantic bucket (wrong entry / wrong sense) is NOT classified here -- no
signal in the source picks a sense (see docs/plans/phase-24-gloss-quality.md),
so it goes to a human via prepare_hanswehr_glosses' review TSV instead.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scraper.hanswehr_gloss import select_gloss  # noqa: E402
from scraper.sources.hanswehr import build_index, lookup  # noqa: E402
from tools.prepare_hanswehr_glosses import (  # noqa: E402
    _NOMINAL_THRESHOLD,
    load_nominal_shares,
)

MAX_GLOSS_CHARS = 150

# Arabic block; a surviving Arabic char past the head means an untrimmed
# idiom/variant-spelling tail leaked into an English gloss slot.
_ARABIC = re.compile(r"[؀-ۿ]")
# A bare 2-4 digit integer token is a Hans Wehr page number ("mountain 571").
# Bounded to 2-4 digits so a legitimate "1 of 5" style gloss is untouched.
_PAGENO = re.compile(r"(?:^|\s)\d{2,4}(?=\s|$)")
# Leftovers of the transliteration head: a Form-I vowel marker or a bare "and"
# standing where English should be -- at the start, or joined to a marker.
_FRAG = re.compile(
    r"""^(?:and\b|[aiu]\b|see\s+\d|=|\()   # opens with a head leftover
        |\b[aiu]\s+and\b                    # "...u and..." marker pair
        |\band\s*$                          # trails off after "and"
    """,
    re.VERBOSE,
)


def classify(gloss: str) -> set[str]:
    """Defect buckets for one generated gloss; empty set means clean."""
    text = gloss.strip()
    buckets: set[str] = set()
    if _FRAG.search(text):
        buckets.add("frag")
    if _ARABIC.search(text):
        buckets.add("arabic")
    if _PAGENO.search(text):
        buckets.add("pageno")
    if len(text) > MAX_GLOSS_CHARS:
        buckets.add("long")
    return buckets


def audit(db_path: Path, hw_path: Path) -> dict[str, list[str]]:
    """Bucket -> sorted Buckwalter roots whose generated gloss lands in it."""
    import sqlite3

    index = build_index(hw_path)
    shares = load_nominal_shares(db_path)
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        roots = [
            r[0]
            for r in conn.execute(
                "SELECT root_buckwalter FROM roots WHERE root_arabic IS NOT NULL"
            )
        ]
    finally:
        conn.close()

    out: dict[str, list[str]] = {}
    for bw in roots:
        entries = lookup(index, bw)
        if not entries:
            continue
        gloss = select_gloss(
            entries, prefer_nominal=shares.get(bw, 0.0) > _NOMINAL_THRESHOLD
        )
        if not gloss:
            continue
        for bucket in classify(gloss):
            out.setdefault(bucket, []).append(bw)
    return {k: sorted(v) for k, v in out.items()}


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--hw", type=Path, required=True)
    parser.add_argument("--show", type=int, default=10, help="roots to print per bucket")
    args = parser.parse_args()

    result = audit(args.db, args.hw)
    for bucket in ("frag", "arabic", "pageno", "long"):
        roots = result.get(bucket, [])
        print(f"{bucket:8} {len(roots):>4}  {' '.join(roots[: args.show])}")
    if result:
        sys.exit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/scraper && .venv/bin/python -m pytest tests/test_audit_hanswehr_glosses.py -v`
Expected: PASS (10 tests)

- [ ] **Step 5: Run the audit against the real source to record the baseline**

```bash
cd packages/scraper
.venv/bin/python tools/audit_hanswehr_glosses.py \
  --db ~/quran-data/quran.db --hw ~/quran-data/hanswehr.sqlite
```

Expected: non-zero counts in all four buckets, exit 1. Paste the output into the commit body — it is the before-number Tasks 2-4 are measured against.

- [ ] **Step 6: Commit**

```bash
git add packages/scraper/tools/audit_hanswehr_glosses.py \
        packages/scraper/tests/test_audit_hanswehr_glosses.py
git commit -m "test(scraper): add Hans Wehr gloss defect audit gate"
```

**Risks:** `_FRAG` over-matching real English ("a and b"). Mitigated by Task 2 asserting full expected glosses for known-good roots (`Alh`, `qwl`, `jEl`, `ktb`) stay clean.
**Rollback:** delete both files. Writes no DB.
**Acceptance (testable):** `classify` returns the exact bucket set for each parametrised case; `main()` exits 1 on the real source today.

---

## Task 2: fix the `frag` bucket — head-strip leftovers

**Files:**
- Modify: `packages/scraper/scraper/hanswehr_gloss.py:57-104` (`_strip_head`)
- Test: `packages/scraper/tests/test_hanswehr_gloss.py`

**Interfaces:**
- Consumes: Task 1's `classify`.
- Produces: no signature change. `select_gloss(entries, *, prefer_nominal=False, max_senses=3)` keeps its shape.

Real failing inputs, taken from `hanswehr.sqlite` (assert the full expected string, never `is not None` — see memory `sdd-brief-can-specify-vacuous-tests`; two vacuous assertions were caught in phase 21):

| root | current output | why it breaks |
|---|---|---|
| `End` | `"u i, ‘anida a (‘anad) and ‘anuda u to swerve, deviate…"` | `"i,"` carries a comma, so it misses `_VOWEL_MARKER`; loop breaks |
| `nEm` | `"u a and na‘ima a to live in comfort…"` | `"and"` joins two head variants; not a head-continuation token |
| `Erw` | `"and"` | whole gloss consumed, `"and"` survives |
| `zyl` | `"and II, III"` | ditto |
| `tjr` | `"tajara u and"` | trailing head, no gloss body |

- [ ] **Step 1: Write the failing tests**

```python
# append to packages/scraper/tests/test_hanswehr_gloss.py
import pytest

from scraper.hanswehr_gloss import select_gloss
from tools.audit_hanswehr_glosses import classify


def _entry(definition: str) -> list[tuple[int, str]]:
    return [(1, definition)]


def test_strips_a_comma_punctuated_vowel_marker():
    gloss = select_gloss(
        _entry("عند ‘anida u i, ‘anida a (‘anad) to swerve, deviate, diverge")
    )
    assert gloss == "swerve, deviate, diverge"


def test_strips_and_joined_head_variants():
    gloss = select_gloss(
        _entry("نعم na‘ima u a and na‘ima a to live in comfort and luxury")
    )
    assert gloss == "live in comfort and luxury"


def test_head_only_entry_yields_no_gloss_rather_than_a_conjunction():
    assert select_gloss(_entry("تجر tajara u and")) is None


@pytest.mark.parametrize(
    "definition",
    [
        "عند ‘anida u i, ‘anida a (‘anad) to swerve, deviate, diverge",
        "نعم na‘ima u a and na‘ima a to live in comfort and luxury",
    ],
)
def test_fixed_glosses_are_clean_by_the_audit(definition):
    assert classify(select_gloss(_entry(definition)) or "") == set()


def test_a_real_english_gloss_is_untouched():
    # Regression guard: the head-strip must not eat English that merely looks
    # like a marker. "a" here is an article, "and" is real prose.
    assert select_gloss(_entry("جعل ja‘ala a to make a promise and to place")) == (
        "make a promise and to place"
    )
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/scraper && .venv/bin/python -m pytest tests/test_hanswehr_gloss.py -v -k "comma or and_joined or head_only or clean_by or untouched"`
Expected: FAIL — `test_strips_a_comma_punctuated_vowel_marker` returns the un-stripped head; `test_head_only_entry` returns `"and"` not `None`.

- [ ] **Step 3: Implement**

In `hanswehr_gloss.py`, add a punctuation-tolerant marker test and treat `"and"` as head-continuation only when what follows keeps the head run going:

```python
def _is_vowel_marker(tok: str) -> bool:
    """True for a Form-I imperfect-vowel marker, comma/semicolon tolerant.

    HW punctuates a marker run inline ("‘anida u i, ‘anida a"), so the bare
    membership test missed every marker carrying a trailing comma and left the
    whole head in the gloss.
    """
    return tok.rstrip(",;") in _VOWEL_MARKER
```

Replace the `tok in _VOWEL_MARKER` branch in `_strip_head` with `_is_vowel_marker(tok)`, apply the same to the `marker = nxt in _VOWEL_MARKER and (...)` lookahead, and add a head-continuation branch for `"and"`:

```python
        if tok == "and":
            # HW joins two spellings of the same head with "and" ("na‘ima u a
            # and na‘ima a to live ..."). It is head only when more head
            # follows -- otherwise it is real English ("comfort and luxury"),
            # and eating it would strip the gloss down to a conjunction.
            nxt = tokens[i + 1] if i + 1 < n else ""
            if nxt and (_is_transliteration(nxt) or _is_vowel_marker(nxt)):
                i += 1
                continue
            break
```

Place this branch **before** the `_is_abbrev(tok) or _is_transliteration(tok)` branch and after the `_is_vowel_marker` branch.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/scraper && .venv/bin/python -m pytest tests/test_hanswehr_gloss.py -v`
Expected: PASS, all tests including the pre-existing phase-23 ones.

- [ ] **Step 5: Mutation-check the new tests**

Revert `_is_vowel_marker` to `tok in _VOWEL_MARKER` and re-run. The comma test MUST fail. Restore. A test that passes with the fix disabled is vacuous and does not count (memory: `sdd-brief-can-specify-vacuous-tests`).

- [ ] **Step 6: Run the audit**

```bash
cd packages/scraper && .venv/bin/python tools/audit_hanswehr_glosses.py \
  --db ~/quran-data/quran.db --hw ~/quran-data/hanswehr.sqlite --show 25
```

Expected: `frag` count materially down from Task 1's baseline. If any root remains, add it as a named test case and repeat steps 1-5 — do not lower the bar in `_FRAG`.

- [ ] **Step 7: Commit**

```bash
git add packages/scraper/scraper/hanswehr_gloss.py \
        packages/scraper/tests/test_hanswehr_gloss.py
git commit -m "fix(scraper): stop Hans Wehr head-strip leaking transliteration markers"
```

**Risks:** eating real English `"and"`. Guarded by `test_a_real_english_gloss_is_untouched` and the control roots in Task 4 step 5.
**Rollback:** `git revert`. No DB written.
**Acceptance (testable):** the five named roots produce the asserted glosses; `audit --show 25` reports `frag 0`; mutation check fails without the fix.

---

## Task 3: fix the `arabic` bucket — Arabic tail past the head

**Files:**
- Modify: `packages/scraper/scraper/hanswehr_gloss.py` (`select_gloss`, after `_strip_head`)
- Test: `packages/scraper/tests/test_hanswehr_gloss.py`

**Interfaces:** unchanged.

Ordering matters and is the whole trick: **strip the head first, then cut at the first surviving Arabic character.** Head-first means `kll`'s `"kalal, كلال kalāl and كلالة kalāla weariness, tiredness"` has its variant-spelling run removed by Task 2's `"and"` branch before the cut runs, leaving `"weariness, tiredness"`. Cutting first would leave `"kalal,"` and lose the gloss.

Past the head, a surviving Arabic char always introduces an idiom or sub-entry (`Aty`: `"i, arrive; ب اتى to bring, bring forward"` → keep `"arrive"`).

- [ ] **Step 1: Write the failing tests**

```python
def test_cuts_at_an_arabic_idiom_marker_past_the_head():
    gloss = select_gloss(
        _entry("اتى atā i to come, arrive; ب اتى to bring, bring forward, produce")
    )
    assert gloss == "come, arrive"


def test_head_variant_spellings_are_removed_before_the_arabic_cut():
    gloss = select_gloss(
        _entry("كلل kalal, كلال kalāl and كلالة kalāla weariness, tiredness, fatigue")
    )
    assert gloss == "weariness, tiredness, fatigue"


def test_no_arabic_survives_any_generated_gloss():
    for definition in (
        "اتى atā i to come, arrive; ب اتى to bring, bring forward, produce",
        "كلل kalal, كلال kalāl and كلالة kalāla weariness, tiredness, fatigue",
    ):
        assert "arabic" not in classify(select_gloss(_entry(definition)) or "")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/scraper && .venv/bin/python -m pytest tests/test_hanswehr_gloss.py -v -k "arabic or variant_spellings"`
Expected: FAIL — output still holds `ب` / `كلال`.

- [ ] **Step 3: Implement**

Add the constant beside `_ARABIC_PAREN`:

```python
# Past the head, a surviving Arabic char opens an idiom or sub-entry
# ("...; ب اتى to bring...") -- everything from it on is out of scope for a
# concise gloss. Runs AFTER _strip_head, which removes the leading Arabic
# headword and its "and"-joined variant spellings; running it first would cut
# a gloss down to its own transliterated head.
_ARABIC_TAIL = re.compile(r"[؀-ۿ].*$", re.DOTALL)
```

In `select_gloss`, immediately after the `_strip_head` call and before the `"to "` prefix drop:

```python
    definition = _ARABIC_TAIL.sub("", definition)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/scraper && .venv/bin/python -m pytest tests/test_hanswehr_gloss.py -v`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Comment out the `_ARABIC_TAIL.sub` line, re-run. `test_cuts_at_an_arabic_idiom_marker_past_the_head` MUST fail. Restore.

- [ ] **Step 6: Run the audit**

```bash
cd packages/scraper && .venv/bin/python tools/audit_hanswehr_glosses.py \
  --db ~/quran-data/quran.db --hw ~/quran-data/hanswehr.sqlite --show 25
```

Expected: `arabic 0`. Any remaining root becomes a named test; repeat.

- [ ] **Step 7: Commit**

```bash
git add packages/scraper/scraper/hanswehr_gloss.py \
        packages/scraper/tests/test_hanswehr_gloss.py
git commit -m "fix(scraper): cut Hans Wehr gloss at the first Arabic idiom marker"
```

**Risks:** a root whose only English sits after an Arabic char now yields `None` and gets quarantined to the review TSV instead of shipping garbage — acceptable, and visible in the audit's `no_gloss` count.
**Rollback:** `git revert`.
**Acceptance (testable):** the two named roots produce the asserted glosses; `audit` reports `arabic 0`; mutation check fails without the fix.

---

## Task 4: fix `long` + `pageno`, and land Part A

**Files:**
- Modify: `packages/scraper/scraper/hanswehr_gloss.py` (`select_gloss` signature + tail)
- Test: `packages/scraper/tests/test_hanswehr_gloss.py`
- Modify: `STATUS.md`

**Interfaces:**
- Produces: `select_gloss(entries, *, prefer_nominal=False, max_senses=3, max_chars=150)`. `max_chars` is new; callers that omit it are unaffected.

Truncation cuts at a `;` sense boundary, never mid-word — a gloss chopped mid-word reads as a bug to the user and the current p90 is 119 chars, so 150 costs almost nothing.

- [ ] **Step 1: Write the failing tests**

```python
def test_drops_an_inlined_page_number():
    assert select_gloss(_entry("طود ṭaud mountain 571")) == "mountain"


def test_keeps_a_number_that_is_part_of_the_gloss():
    assert select_gloss(_entry("خمس ḫums one fifth")) == "one fifth"


def test_truncates_at_a_sense_boundary_not_mid_word():
    long_entry = "علم ‘alima a to know, have knowledge; " + "; ".join(
        ["be cognizant of a great many different things"] * 5
    )
    gloss = select_gloss(_entry(long_entry))
    assert len(gloss) <= 150
    assert not gloss.endswith(";")
    assert gloss.startswith("know, have knowledge")
    # cut landed on a boundary: every retained sense is whole
    assert all(s.strip() for s in gloss.split(";"))


def test_short_gloss_is_not_truncated():
    assert select_gloss(_entry("ارض arḍ earth; land, country")) == (
        "earth; land, country"
    )
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/scraper && .venv/bin/python -m pytest tests/test_hanswehr_gloss.py -v -k "page_number or truncates or not_truncated or part_of_the_gloss"`
Expected: FAIL — `"mountain 571"` keeps the number; the long gloss exceeds 150.

- [ ] **Step 3: Implement**

Add beside the other constants:

```python
# HW inlines its own page numbers mid-definition ("mountain 571", "to 632
# renege one's faith"). A bare 2-4 digit token is always one of those; a
# quantity in a real gloss is spelled out ("one fifth"), so nothing legitimate
# is lost.
_PAGE_NUMBER = re.compile(r"(?:^|\s)\d{2,4}(?=\s|$)")
```

Add `max_chars: int = 150` to `select_gloss`'s keyword-only parameters, document it in the docstring, and replace the final `return cleaned or None` with:

```python
    cleaned = _WS.sub(" ", _PAGE_NUMBER.sub(" ", cleaned)).strip(" ,;")
    if len(cleaned) > max_chars:
        # Cut on a sense boundary: a gloss chopped mid-word reads as a bug.
        # rfind on the truncation window finds the last complete sense; if
        # there is none (one very long sense), keep it whole rather than
        # emitting a fragment -- the review TSV surfaces it for a human.
        boundary = cleaned.rfind(";", 0, max_chars)
        if boundary > 0:
            cleaned = cleaned[:boundary].strip(" ,;")
    return cleaned or None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/scraper && .venv/bin/python -m pytest tests/ -v`
Expected: PASS, whole scraper suite.

- [ ] **Step 5: Run the audit + eyeball the control roots**

```bash
cd packages/scraper
.venv/bin/python tools/audit_hanswehr_glosses.py \
  --db ~/quran-data/quran.db --hw ~/quran-data/hanswehr.sqlite
```

Expected: `frag 0  arabic 0  pageno 0  long 0`, exit 0.

Then confirm the fixes did not damage roots that were already good:

```bash
.venv/bin/python - <<'PY'
from pathlib import Path
from scraper.sources.hanswehr import build_index, lookup
from scraper.hanswehr_gloss import select_gloss
idx = build_index(Path.home() / "quran-data" / "hanswehr.sqlite")
for bw in ("Alh", "qwl", "jEl", "ktb", "kwn", "Elm"):
    print(f"{bw:5} {select_gloss(lookup(idx, bw))}")
PY
```

Expected: `Alh` → "god, deity, godhead", `qwl` → starts "speak, say, tell", `jEl` → "make; to put, place, lay", `ktb` → starts "write". Any regression here is a Task 2/3 bug — go back, do not proceed.

- [ ] **Step 6: Quality review (§4 step 4)**

```bash
cd packages/scraper && .venv/bin/python -m pytest tests/ -q && .venv/bin/python -m ruff check .
```
Expected: all pass, no lint errors.

- [ ] **Step 7: Commit + push, then STOP for §4 step 3 and §5**

```bash
git add packages/scraper/scraper/hanswehr_gloss.py \
        packages/scraper/tests/test_hanswehr_gloss.py
git commit -m "fix(scraper): cap Hans Wehr gloss length and strip inlined page numbers"
git push -u origin feat/phase-24-gloss-quality
```

**Ask the user to run `/code-review`** (§4 step 3 is user-triggered — never skip it silently). Then **ask before opening the PR** (memory: `ask-before-opening-pr`; never `gh pr create` unprompted). Clear the §5 CodeRabbit gate before Part B touches the live DB.

**Risks:** `_PAGE_NUMBER` eating a legitimate figure. Guarded by `test_keeps_a_number_that_is_part_of_the_gloss`.
**Rollback:** `git revert`. Part A writes no DB — the live 1476 rows are untouched until Task 7.
**Acceptance (testable):** audit exits 0 with four zero buckets; full scraper suite green; the six control roots unchanged. *(Superseded post-round-7: `hanswehr_baseline` is the gate — see the file map and Self-Review. The audit's buckets pass on a deleted gloss, so they gate shape only.)*

---

## Task 5: overrides file + candidate-bearing review TSV

**Files:**
- Create: `packages/scraper/tools/hanswehr_overrides.tsv`
- Modify: `packages/scraper/tools/prepare_hanswehr_glosses.py`
- Test: `packages/scraper/tests/test_prepare_hanswehr_glosses.py`

**Interfaces:**
- Produces:
  - `load_overrides(path: Path = _OVERRIDES) -> dict[str, str]` — `root -> gloss`; a row with an empty gloss maps to `""`, meaning *drop this root's HW row*.
  - `candidates(entries: list[tuple[int, str]]) -> list[str]` — up to four distinct gloss options for one root: verbal (`prefer_nominal=False`), nominal (`prefer_nominal=True`), and the glosses of the blocks `select_gloss` cuts away at `" -- "` and at `<b>`.
  - `review_rows(rows, quarantined, flagged)` gains a `flagged` argument: `(root, status, gloss, *candidates)`.

**Why an overrides file and not more rejects.** A reject only deletes; the measured failures need a *different* gloss (`ArD` wants "earth; land, country", not nothing). One file with `root<TAB>gloss` covers both — empty gloss means drop. `hanswehr_rejects.txt` stays as-is for roots to skip entirely; it is already loaded by `load_hanswehr_targets` and is currently empty.

- [ ] **Step 1: Write the failing tests**

```python
# packages/scraper/tests/test_prepare_hanswehr_glosses.py
def test_load_overrides_reads_root_and_gloss(tmp_path):
    from tools.prepare_hanswehr_glosses import load_overrides

    p = tmp_path / "ov.tsv"
    p.write_text("# comment\nArD\tearth; land, country\nEZm\t\n", encoding="utf-8")
    assert load_overrides(p) == {"ArD": "earth; land, country", "EZm": ""}


def test_candidates_offer_the_verbal_and_the_cut_away_blocks():
    from tools.prepare_hanswehr_glosses import candidates

    entries = [
        (1, "كفر kafara i (kafr) to cover, hide; -- (kufr) to be irreligious, "
            "be an infidel, not to believe"),
        (0, "كفر kafr small village, hamlet"),
    ]
    got = candidates(entries)
    assert "cover, hide" in got
    assert any("infidel" in c for c in got)
    assert any("village" in c for c in got)


def test_candidates_are_distinct():
    from tools.prepare_hanswehr_glosses import candidates

    entries = [(1, "طود ṭaud mountain")]
    assert candidates(entries) == ["mountain"]


def test_build_rows_applies_an_override(tmp_path):
    from tools.prepare_hanswehr_glosses import build_rows

    index = {"ارض": [(1, "ارض arḍ termite")]}
    rows, quarantined, stats = build_rows(
        index, ["ArD"], {}, {}, overrides={"ArD": "earth; land, country"}
    )
    assert rows == [("ArD", "earth; land, country")]


def test_build_rows_drops_a_root_whose_override_is_empty(tmp_path):
    from tools.prepare_hanswehr_glosses import build_rows

    index = {"ارض": [(1, "ارض arḍ termite")]}
    rows, quarantined, stats = build_rows(index, ["ArD"], {}, {}, overrides={"ArD": ""})
    assert rows == []
    assert ("ArD", "dropped_by_override", "") in quarantined


def test_an_override_gloss_with_a_tab_raises(tmp_path):
    from tools.prepare_hanswehr_glosses import build_rows

    index = {"ارض": [(1, "ارض arḍ termite")]}
    with pytest.raises(ValueError):
        build_rows(index, ["ArD"], {}, {}, overrides={"ArD": "earth\tland"})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/scraper && .venv/bin/python -m pytest tests/test_prepare_hanswehr_glosses.py -v`
Expected: FAIL — `ImportError: cannot import name 'load_overrides'`.

- [ ] **Step 3: Create the overrides file**

```
# packages/scraper/tools/hanswehr_overrides.tsv
# root<TAB>gloss -- the human decision for a root whose auto-selected Hans Wehr
# gloss is the wrong entry or the wrong sense. No signal in the source picks a
# sense (see docs/plans/phase-24-gloss-quality.md), so this file is the only
# place that knowledge lives.
#
# An EMPTY gloss drops the root's hanswehr row entirely, letting Lane lead.
# `import-lane` upserts and never deletes, so dropping also needs
# `scraper prune-definitions --source hanswehr` -- see Task 6.
#
# Populated by the Task 5 human gate. Empty until then.
```

- [ ] **Step 4: Implement**

In `prepare_hanswehr_glosses.py`:

```python
_OVERRIDES = Path(__file__).with_name("hanswehr_overrides.tsv")


def load_overrides(path: Path = _OVERRIDES) -> dict[str, str]:
    """Human gloss decisions: root -> gloss. Empty gloss means drop the root.

    Unlike `load_rejects` (a set of roots to skip), this carries replacement
    text, because the measured failures need a different gloss rather than no
    gloss (`ArD` should read "earth; land, country", not vanish).
    """
    out: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        root, _, gloss = line.partition("\t")
        out[root.strip()] = gloss.strip()
    return out


def candidates(entries: list[tuple[int, str]]) -> list[str]:
    """Distinct gloss options for one root, for the human to choose between.

    `select_gloss` cuts at the first `<b>` (derived form) and `" -- "` (second
    Form-I headword); for some roots that is exactly where the Quranic sense
    lives (`kfr`'s "be an infidel" sits after the `--`, `rsl`'s "send out"
    after `<b>IV</b>`). Emitting the cut-away blocks as candidates puts those
    senses in front of the reviewer instead of hiding them.
    """
    out: list[str] = []
    for gloss in (
        select_gloss(entries, prefer_nominal=False),
        select_gloss(entries, prefer_nominal=True),
    ):
        if gloss and gloss not in out:
            out.append(gloss)
    head = entries[0][1]
    for marker in (" -- ", "<b>"):
        idx = head.find(marker)
        if idx == -1:
            continue
        gloss = select_gloss([(entries[0][0], head[idx + len(marker) :])])
        if gloss and gloss not in out:
            out.append(gloss)
    return out
```

Give `build_rows` an `overrides: dict[str, str] | None = None` keyword. Inside the loop, after the `lookup` and the delimiter check, before `select_gloss`:

```python
        if overrides is not None and bw in overrides:
            override = overrides[bw]
            if not override:
                stats["dropped_by_override"] = stats.get("dropped_by_override", 0) + 1
                quarantined.append((bw, "dropped_by_override", ""))
                continue
            if any(ch in override for ch in "\t\n\r"):
                raise ValueError(f"override for {bw!r} contains a TSV delimiter")
            rows.append((bw, override))
            stats["overridden"] = stats.get("overridden", 0) + 1
            continue
```

Wire `load_overrides()` into `main()` and pass it to `build_rows`. Add the candidate columns to the review TSV for every row whose gloss `classify`s non-clean **or** whose `candidates()` returns more than one option — those are the rows worth a human's time.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/scraper && .venv/bin/python -m pytest tests/test_prepare_hanswehr_glosses.py -v`
Expected: PASS.

- [ ] **Step 6: Generate the review TSV (read-only, writes no DB)**

```bash
cd packages/scraper
.venv/bin/python tools/prepare_hanswehr_glosses.py \
  --db ~/quran-data/quran.db --hw ~/quran-data/hanswehr.sqlite \
  --out /tmp/hw24.tsv --review ~/quran-data/hw24_review.tsv \
  --prune-out /tmp/hw24_prune.txt
```

- [ ] **Step 7: Commit**

```bash
git add packages/scraper/tools/hanswehr_overrides.tsv \
        packages/scraper/tools/prepare_hanswehr_glosses.py \
        packages/scraper/tests/test_prepare_hanswehr_glosses.py
git commit -m "feat(scraper): add Hans Wehr gloss overrides and candidate review columns"
```

**Risks:** an override row silently mistyped (wrong Buckwalter) is a no-op. Task 7 step 3 verifies every override root actually landed.
**Rollback:** `git revert`; the overrides file writes no DB.
**Acceptance (testable):** overrides load, apply, drop-on-empty, and raise on a delimiter; `candidates()` surfaces `kfr`'s post-`--` infidel sense; review TSV lands in `~/quran-data/` where the user can read it off a phone.

---

## Task 6: `prune-definitions` — the delete path `import-lane` lacks

**Files:**
- Modify: `packages/scraper/scraper/cli.py` (after `import-lane`, `cli.py:290-306`)
- Test: `packages/scraper/tests/test_cli.py`

**Interfaces:**
- Produces: `scraper prune-definitions --db <path> --source <tag> --roots <tsv> [--pair <tsv>]` — deletes `root_definitions` rows for the listed Buckwalter roots at that source only. Prints the delete count and the roots it did not recognise.

`import-lane` upserts on `(root_id, source)` and never deletes, so a root the user drops in the overrides file keeps its old bad gloss forever without this.

**As shipped, validation runs before SQLite is opened at all** — the point is to fail before the delete, not report it after. `--roots` must carry the `# source:` header the generating run wrote, and a tag disagreeing with `--source` is refused. `--pair` names the other half of that run and compares the run stamps in both headers, which is the only thing that stops run A's prune list being applied alongside run B's glosses. The step-by-step code below predates both checks; the shipped `cli.py` and `scraper/source_header.py` are the contract.

- [ ] **Step 1: Write the failing test**

```python
def test_prune_definitions_deletes_only_the_named_source(tmp_path):
    import sqlite3

    from click.testing import CliRunner

    from scraper.cli import main

    db = tmp_path / "q.db"
    conn = sqlite3.connect(db)
    conn.executescript(
        """
        CREATE TABLE roots (id INTEGER PRIMARY KEY, root_buckwalter TEXT);
        CREATE TABLE root_definitions (
            id INTEGER PRIMARY KEY, root_id INTEGER, source TEXT, definition TEXT);
        INSERT INTO roots VALUES (1, 'ArD');
        INSERT INTO root_definitions VALUES (1, 1, 'hanswehr', 'termite');
        INSERT INTO root_definitions VALUES (2, 1, 'qurandev-lane', 'earth');
        """
    )
    conn.commit()
    conn.close()

    roots = tmp_path / "drop.tsv"
    roots.write_text("ArD\n", encoding="utf-8")

    result = CliRunner().invoke(
        main,
        ["prune-definitions", "--db", str(db), "--source", "hanswehr",
         "--roots", str(roots)],
    )
    assert result.exit_code == 0

    conn = sqlite3.connect(db)
    rows = conn.execute("SELECT source FROM root_definitions").fetchall()
    conn.close()
    assert rows == [("qurandev-lane",)]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/scraper && .venv/bin/python -m pytest tests/test_cli.py -v -k prune`
Expected: FAIL — `No such command 'prune-definitions'`.

- [ ] **Step 3: Implement**

```python
@main.command("prune-definitions")
@click.option("--db", default="quran.db", show_default=True)
@click.option("--source", required=True, help="root_definitions.source tag to delete")
@click.option(
    "--roots",
    required=True,
    type=click.Path(exists=True),
    help="File of Buckwalter roots, one per line (first TAB field).",
)
def prune_definitions(db: str, source: str, roots: str) -> None:
    """Delete this source's definitions for the listed roots.

    `import-lane` upserts and never deletes, so a root dropped by the human
    override gate would keep its old gloss forever without this.
    """
    import sqlite3

    wanted = [
        line.split("\t", 1)[0].strip()
        for line in Path(roots).read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]
    if not wanted:
        click.echo("No roots listed; nothing to prune.")
        return

    conn = sqlite3.connect(db)
    try:
        placeholders = ",".join("?" * len(wanted))
        # S608: only `placeholders` is interpolated, built from a list length;
        # source and every root are bound parameters.
        cur = conn.execute(
            f"""DELETE FROM root_definitions
                 WHERE source = ?
                   AND root_id IN (SELECT id FROM roots
                                    WHERE root_buckwalter IN ({placeholders}))""",  # noqa: S608
            [source, *wanted],
        )
        conn.commit()
        click.echo(f"Pruned {cur.rowcount} definitions (source={source}).")
    finally:
        conn.close()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/scraper && .venv/bin/python -m pytest tests/test_cli.py -v -k prune`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/scraper/cli.py packages/scraper/tests/test_cli.py
git commit -m "feat(scraper): add prune-definitions for the override drop path"
```

**Risks:** a wrong `--source` deleting good rows. Mitigated: `--source` is required (no default), the test asserts sibling sources survive, and Task 7 takes a backup first.
**Rollback:** `git revert`; restore the DB from the Task 7 backup.
**Acceptance (testable):** deletes only the named source's rows for the named roots; leaves siblings intact.

---

## Task 7: human gate + live re-import (GATED)

**Files:**
- Modify: `packages/scraper/tools/hanswehr_overrides.tsv` (populated by the user)
- Write: `~/quran-data/quran.db` (live)
- Modify: `STATUS.md`

**GATE — do not run without: (a) explicit per-moment user permission to write live `quran.db`, (b) the user's completed review of `hw24_review.tsv`, (c) the §5 CodeRabbit gate cleared on Tasks 1-6. The SDD controller STOPS here and hands to the user.**

- [ ] **Step 1: Back up first**

Not `cp`. Task 6 Step 6 leaves a dev server holding this DB open, so a byte copy
taken beside a live `-wal` is not a snapshot — it can restore to a state that
never existed. The sqlite `.backup()` API reads through the WAL:

```bash
python3 - <<'PY'
import sqlite3
from pathlib import Path
src = sqlite3.connect(Path.home() / "quran-data" / "quran.db")
dst = sqlite3.connect(Path.home() / "quran-data" / "quran.db.bak-phase24")
with dst:
    src.backup(dst)
dst.close()
src.close()
PY
ls -la ~/quran-data/quran.db.bak-phase24
```
The backup MUST exist and be non-zero before anything below runs.

- [ ] **Step 2: User reviews and populates the overrides**

The user reads `~/quran-data/hw24_review.tsv` and writes decisions into
`packages/scraper/tools/hanswehr_overrides.tsv`. The 76 `disagree` roots are the
required set; the known-wrong ones to expect, highest-traffic first:

| root | occ | current | HW has |
|---|---|---|---|
| `rsl` | 513 | be long and flowing (hair) | to send out, dispatch (Form IV) |
| `ArD` | 461 | termite; woodworm | earth; land, country, region |
| `rHm` | 339 | uterus; womb | have mercy, have compassion |
| `EZm` | 128 | bone | to honor, to make great |
| `Hbb` | 95 | blister | — |
| `bAs` | 73 | kiss | — |
| `jwb` | 43 | skirt | — |
| `mrA` | 38 | hypocrite | — |

`kfr` (525, "cover, hide") is the user's call: HW's literal Form-I sense is
honest, and the post-`--` block offers "be irreligious, be an infidel, not to
believe". The user ruled that HW does carry the Quranic sense, so prefer the
post-`--` candidate.

- [ ] **Step 3: Regenerate the TSVs with overrides applied**

```bash
cd packages/scraper
.venv/bin/python tools/prepare_hanswehr_glosses.py \
  --db ~/quran-data/quran.db --hw ~/quran-data/hanswehr.sqlite \
  --out /tmp/hw24.tsv --review ~/quran-data/hw24_review.tsv \
  --prune-out /tmp/hw24_prune.txt
# Both artifacts open with `# source: hanswehr`, so every count below is
# gloss-rows + 1. That line is what makes `prune-definitions` and `import-lane`
# refuse a --source disagreeing with the run that produced the file.
grep -c . /tmp/hw24.tsv
```
Confirm every override root appears in `/tmp/hw24.tsv` with the intended text — a
mistyped Buckwalter root is a silent no-op:

```bash
# -qxF, not a "^$r<tab>" pattern: Buckwalter is not regex-safe. 48 target roots
# carry `*` (ذ) and a leading one -- `*Ab`, `*b*b` -- makes grep exit 2, which
# `||` reads as MISSING. Compare the first field literally instead.
cut -f1 packages/scraper/tools/hanswehr_overrides.tsv | grep -v '^#' | grep . \
  | while IFS= read -r r; do cut -f1 /tmp/hw24.tsv | grep -qxF -- "$r" \
    || echo "MISSING FROM OUTPUT: $r"; done
```
Expected: no `MISSING` lines except roots the user deliberately dropped (empty gloss).

- [ ] **Step 4: Prune the dropped roots, then import**

```bash
cd packages/scraper
# /tmp/hw24_prune.txt is Step 3's --prune-out: every root holding a hanswehr row
# that run did not re-produce. NOT the overrides file -- that names only the
# roots a human chose, while the run also quarantines roots nothing chose
# (`no_gloss`, `not_in_hanswehr`), which keep their stale phase-23 gloss
# otherwise. Measured before this fix: 26 such roots, incl. `$fh -> "see 2 شف"`
# and thirteen glossed `"and"`.
# Header included: expect prune-roots + 1. Both commands below take the same
# --source, and both now refuse a file generated for a different one -- a bare
# root list matches any source's rows, so pruning `corpus-forms` while importing
# `hanswehr` would delete one dictionary and install the other in its place.
#
# --source alone is not enough: every run of this tool writes `hanswehr`, so run
# A's prune list pairs cleanly with run B's glosses and leaves the source
# holding neither -- a root B dropped survives the prune that never listed it.
# --pair names the other half of the SAME run, and the shared run stamp in both
# headers is what is compared. Pass it on BOTH commands, each naming the other's
# file. Never run import-lane alone: it upserts, so a skipped prune keeps every
# stale row.
wc -l < /tmp/hw24_prune.txt   # sanity: non-zero, and << the 1476 live rows
.venv/bin/python -m scraper.cli prune-definitions \
  --db ~/quran-data/quran.db --source hanswehr --roots /tmp/hw24_prune.txt \
  --pair /tmp/hw24.tsv
.venv/bin/python -m scraper.cli import-lane /tmp/hw24.tsv \
  --db ~/quran-data/quran.db --source hanswehr --pair /tmp/hw24_prune.txt
```

- [ ] **Step 5: Verify by alignment, not count (§10)**

```bash
cd ~/quran-data && python3 - <<'PY'
import sqlite3
db = sqlite3.connect("file:quran.db?mode=ro", uri=True)
c = db.cursor()
print("by source:", c.execute(
    "SELECT source, COUNT(*) FROM root_definitions GROUP BY source").fetchall())
for bw in ("ArD", "rHm", "kfr", "rsl", "EZm", "Alh", "qwl"):
    rows = c.execute(
        """SELECT d.source, SUBSTR(d.definition,1,70) FROM root_definitions d
             JOIN roots r ON r.id = d.root_id WHERE r.root_buckwalter = ?""",
        (bw,)).fetchall()
    print(bw, rows)
PY
```
Expected: each override root joined to **its own** gloss (not a neighbour's — that
is the alignment check row counts cannot give); `Alh`/`qwl` unchanged.

- [ ] **Step 6: Smoke on a real render**

```bash
cd apps/web && npx next dev -H 0.0.0.0 -p 3939
```
Visit `http://192.168.0.103:3939/dictionary/ArD`, `/rHm`, `/kfr`, `/rsl`, `/Alh`.
Expected: the HW card leads with the corrected gloss, Lane below it.
**Never run `npm run build` while this dev server runs** — they share `.next` and
it breaks the running server (memory: `next-build-wipes-dev-server-dotnext`).

- [ ] **Step 7: Commit**

```bash
git add packages/scraper/tools/hanswehr_overrides.tsv STATUS.md
git commit -m "chore(scraper): record the Hans Wehr override review and live re-import"
```

**Risks:** a bad override going live. Mitigated by the backup, the alignment check, and the render smoke.
**Rollback:** stop the dev server first, then `cp ~/quran-data/quran.db.bak-phase24 ~/quran-data/quran.db` and delete any `quran.db-wal`/`quran.db-shm` left beside it — a copy over a DB something holds open leaves the old WAL to replay on top of the restored file. Both `prune-definitions` and `import-lane` touch only `source='hanswehr'` rows, so the blast radius is one source.
**Acceptance (testable):** every override root renders its intended gloss; no override root is missing from the output TSV; `Alh`/`qwl` unchanged; sibling sources' row counts unchanged.

---

## Task 8: Salmoné — fetch, prepare, review — **HISTORICAL, NEVER EXECUTED**

> **Do not run any command in this task.** Salmoné was dropped 2026-08-08 before
> the fetch. Nothing below was carried out: no XML was fetched, no TSV produced,
> no review taken, and `salmone_rejects.txt` is still empty. Task 9 records the
> decision and what replaced it. Kept as the record of the rejected option, and
> because the phase-22 tooling it describes is still installed and still tested.

**Files:**
- Modify: `packages/scraper/tools/salmone_rejects.txt` (populated by the user)
- Writes: `~/quran-data/refdata/salmone/salmone.xml` (outside the repo, §9)

Phase 22 (PR #73) shipped the extractor, the prepare tool, the rank-2 slot and an
empty `salmone_rejects.txt`, then stopped at its own human gate. Live `quran.db`
holds **0** `salmone` rows today — the source is dead in production.
`~/quran-data/refdata/salmone/` does not exist, so the XML must be re-fetched.

- [ ] **Step 1: Fetch the XML (28.9 MB, one network call)**

```bash
cd packages/scraper && .venv/bin/python -m scraper.cli fetch-salmone
ls -la ~/quran-data/refdata/salmone/
```
Expected: `salmone.xml` present, ~28.9 MB. §11: it lands outside the repo, never committed.

- [ ] **Step 2: Generate the TSVs (read-only, writes no DB)**

```bash
cd packages/scraper
.venv/bin/python tools/prepare_salmone_glosses.py \
  ~/quran-data/refdata/salmone/salmone.xml \
  --db ~/quran-data/quran.db \
  --out /tmp/salmone.tsv --review ~/quran-data/salmone_review.tsv
wc -l /tmp/salmone.tsv ~/quran-data/salmone_review.tsv
```

- [ ] **Step 3: Sanity-check the output before asking for review**

```bash
head -20 /tmp/salmone.tsv
```
Read twenty rows. If they carry the same head-leak or Arabic-tail defects Tasks 2-3
fixed for HW, **stop and report** — the two extractors are separate modules and
Salmoné may need the same treatment before a human wastes time reviewing it.

- [ ] **Step 4: Hand `~/quran-data/salmone_review.tsv` to the user**

The user populates `packages/scraper/tools/salmone_rejects.txt` (`root<TAB>reason`)
for any root whose Salmoné sense is not the Quranic one. Re-run step 2 after edits —
`load_salmone_targets` subtracts rejects, and `import-lane` upserts, so a reject not
listed here is silently reinstated on any re-run.

- [ ] **Step 5: Commit whatever the review produced**

```bash
git add packages/scraper/tools/salmone_rejects.txt
git commit -m "chore(scraper): record the Salmoné reject review"
```

**Risks:** the upstream XML has moved or changed shape since phase 22. If `fetch-salmone`
fails or the prepare tool's row count is wildly off phase 22's, stop and report — do not
paper over it.
**Rollback:** delete the XML and the TSVs. Writes no DB.
**Acceptance (testable):** `salmone.xml` fetched; prepare tool emits both TSVs without
raising; twenty sampled rows read as clean English glosses.

---

## Task 9: Salmoné live import (GATED) — **HISTORICAL, REPLACED**

> **Do not run any command in this task.** After Task 7 the user dropped Salmoné
> outright (2026-08-08) rather than spend a second reject review on a source that
> would sit at rank 2 under Hans Wehr and Lane. No `salmone` row has ever been
> live; live `quran.db` still holds 0.
>
> **What shipped instead:** 14 hand-written editorial glosses — one per root that
> no dictionary in the pipeline covers — from `tools/editorial_glosses.tsv`,
> imported at source tag `editorial`, `DEFINITION_SOURCE_RANK` **-1** so a
> hand-written gloss outranks Hans Wehr for the roots that have nothing else.
> Every root in the corpus now carries a definition. Credited on the About page
> as original wording derived from the corpus's own word-by-word glosses.
>
> The phase-22 Salmoné *scraper* tooling (`fetch-salmone`,
> `prepare_salmone_glosses.py`) stays installed, inert and tested — revivable,
> not wired to anything. Its rank-2 slot is gone: `salmone` no longer appears in
> `DEFINITION_SOURCE_RANK` or `definitionSources.ts`, so the tag would fall to
> `ELSE 5` and render uncredited. Reviving it means restoring both. Steps below
> are kept as the record of the rejected option.

**Files:**
- Writes: `~/quran-data/quran.db` (live)
- Modify: `STATUS.md`

**GATE — same three conditions as Task 7: explicit per-moment user permission, the
completed Task 8 reject review, and a fresh backup.**

- [ ] **Step 1: Back up**

Same `.backup()` reasoning as Task 7 Step 1 — never `cp` a DB a dev server holds.

```bash
python3 - <<'PY'
import sqlite3
from pathlib import Path
src = sqlite3.connect(Path.home() / "quran-data" / "quran.db")
dst = sqlite3.connect(Path.home() / "quran-data" / "quran.db.bak-phase24-salmone")
with dst:
    src.backup(dst)
dst.close()
src.close()
PY
ls -la ~/quran-data/quran.db.bak-phase24-salmone
```

- [ ] **Step 2: Import at rank 2**

```bash
cd packages/scraper && .venv/bin/python -m scraper.cli import-lane /tmp/salmone.tsv \
  --db ~/quran-data/quran.db --source salmone
```

`DEFINITION_SOURCE_RANK` (`packages/data/src/queries/roots.ts:281`) already maps
`salmone` to 2 — below `lane`/`qurandev-lane` at 1, above `corpus-forms` at 3. No
code change is needed for the ordering the user asked for.

- [ ] **Step 3: Verify by alignment**

```bash
cd ~/quran-data && python3 - <<'PY'
import sqlite3
db = sqlite3.connect("file:quran.db?mode=ro", uri=True)
c = db.cursor()
print("by source:", c.execute(
    "SELECT source, COUNT(*) FROM root_definitions GROUP BY source").fetchall())
print("dups:", c.execute(
    "SELECT COUNT(*) FROM (SELECT root_id, source, COUNT(*) n "
    "FROM root_definitions GROUP BY 1,2 HAVING n>1)").fetchone()[0])
for bw, in c.execute(
    """SELECT r.root_buckwalter FROM roots r JOIN root_definitions d
         ON d.root_id = r.id AND d.source = 'salmone'
        ORDER BY r.occurrence_count DESC LIMIT 6"""):
    print(bw, c.execute(
        """SELECT SUBSTR(definition,1,60) FROM root_definitions d
             JOIN roots r ON r.id = d.root_id
            WHERE r.root_buckwalter = ? AND d.source = 'salmone'""",
        (bw,)).fetchone())
PY
```
Expected: `salmone` count equals `/tmp/salmone.tsv`'s line count, `dups: 0`, and each
sampled root joined to its own gloss.

- [ ] **Step 4: Smoke the collapsible ordering**

Dev server on `:3939`, open a root that now has all three sources. Expected top to
bottom: **Hans Wehr → Lane → Salmoné**, each in its own collapsible `ClampedText`
block with its source credit (`RootEntry.tsx:82-118`).

- [ ] **Step 5: Add the Salmoné credit if the About page lacks it**

```bash
grep -n "Salmon" apps/web/src/app/about/page.tsx
```
If absent, add it beside the Hans Wehr entry at `page.tsx:63` — §11 requires
attribution for every shipped dataset, and rows are now live.

- [ ] **Step 6: Update STATUS.md and commit**

```bash
git add STATUS.md apps/web/src/app/about/page.tsx
git commit -m "docs(status): record phase 24 gloss remediation and Salmoné import"
```

**Risks:** Salmoné rows crowding the entry with a third long block. If it reads badly,
the fix is a UI decision for the user, not a data rollback.
**Rollback:** stop the dev server, `cp ~/quran-data/quran.db.bak-phase24-salmone ~/quran-data/quran.db`, remove any stale `-wal`/`-shm`; or
`prune-definitions --source salmone` with the full root list.
**Acceptance (testable):** `salmone` row count matches the TSV; zero dups; a three-source
root renders HW → Lane → Salmoné; About page credits Salmoné.

---

## Self-Review

**Spec coverage.** Part A (mechanical): Tasks 1-4 cover `frag`, `arabic`, `long`,
`pageno`, gated by `hanswehr_baseline` exiting 0 — a per-root differential over all
1642 targets, `added`/`removed`/`changed` all zero. Not the audit's bucket counts,
which round 3 replaced: a bucket ceiling passes just as happily when a gloss is
*deleted* as when it is correct, so it cannot gate content loss. Buckets survive as
a column in the baseline, not as a pass condition. Part B (semantic, "eyeball all 76"): Tasks 5-7
give the user candidate-bearing rows, an overrides file that survives re-runs, and the
delete path the drop decision needs. Part C (Salmoné, "below Lane as collapsible"):
Tasks 8-9 — and the ordering already exists, so it is import-only.

**Q1 resolved.** The user ruled Hans Wehr does carry the Quranic sense, so `kfr` is not
rejected — Task 5's `candidates()` surfaces the post-`--` "be an infidel" block and
Task 7 lets the user select it. Task 2/3's cuts were never the right place to fix this:
the cut is correct for most roots and wrong for some, which is a semantic call.

**Type consistency.** `classify` (Task 1) is reused by Tasks 2, 3 and 5. `select_gloss`
gains exactly one keyword (`max_chars`, Task 4) and no caller is broken.
`load_overrides` / `candidates` / `build_rows(..., overrides=)` (Task 5) are consumed by
Task 7. `prune-definitions` (Task 6) is consumed by Task 7 step 4 and Task 9's rollback.

**Known gap, deliberately out of scope.** The 24 roots in `~/quran-data/hw_gap_24.tsv`
still have no lexicon definition, and `$yA` شيأ (519 occurrences) has no Hans Wehr entry
at all and is *not* in that file — the "gap 256→24" figure counted `perseus-lane` as
not-a-lexicon. Measured on the live DB: 8 roots have no definition from any source, 13
have only `corpus-forms`. Filling these needs manual glossing, which is a separate
phase.
