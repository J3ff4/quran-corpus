# Hamza-Seat Encoding Fix Implementation Plan

> **STATUS: IMPLEMENTED AND MERGED — do not execute this plan.** Shipped in
> `be0d7ef` (PR #34). Re-verified against the live DB on 2026-07-29: 2:8 reads
> `ٱلْـَٔاخ` (U+0640 + U+0654), 646 ayahs carry the seat, and 3:91 `مِّلْءُ`
> correctly keeps its bare hamza — the one deliberate exclusion. Kept only as
> the decision record, chiefly the Rejected Alternatives section (the QPC-text
> swap and its 2721/6236 alignment break) so that research is not redone.
>
> One reference below is stale: the plan cites "Greptile ≥ 5/5" as the review
> gate. CodeRabbit replaced Greptile as of PR #59 — see CLAUDE.md §5.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix visible gap in hamza+alef rendering (e.g. 2:8 "ٱلْءَاخِرِ") by correcting Unicode encoding, not swapping fonts.

**Architecture:** Root cause = wrong character. Our Tanzil-derived text uses bare HAMZA (U+0621) where the KFGQPC Hafs Uthmanic Script font's GSUB rules require TATWEEL+COMBINING-HAMZA-ABOVE (U+0640+U+0654) as a "seat" — this is quran.com's own "QPC Uthmani" text convention, verified against the same font. Fix = targeted character-level rewrite in existing DB text, not a data-source swap (full QPC-text swap breaks word/morphology position alignment in ~2721/6236 ayahs — rejected, see Rejected Alternatives). Scope: exactly the definite-article + hamza-initial-root pattern (لْء → لْـٔ), verified 207/208 correct against QPC ground truth across the *entire* Quran, with the 1 exception (root-internal لء, e.g. 3:91 "مِّلْءُ") excluded by a preceding-letter check.

**Tech Stack:** Python 3.12, sqlite3 (via existing `ScraperDatabase`), pytest, ruff, mypy, click CLI (existing `scraper` command).

## Global Constraints

- DRY: one shared `fix_seatless_hamza()` function, used by (a) future imports (`tanzil.py`, `import_alqurancloud.py`) so re-imports stay correct, and (b) the one-shot backfill for the already-populated DB. No duplicate regex logic.
- Idempotent: re-running the fix on already-fixed text must be a no-op (existing repo convention, see `fix_root_data.py`).
- No `// @ts-ignore` / disabled lint rules without inline justification. Lint (`ruff`) + type-check (`mypy`) + `pytest` must all pass (5-step loop §3).
- Back up the live DB before any write (existing convention per `fix_root_data.py` docstring: "Back up the DB (.bak) before running against the canonical DB").
- Real DB path: `apps/web/quran.db` is a symlink → `/home/claude/quran-data/quran.db`. Back up the **resolved target**, not the symlink.
- Greptile ≥ 5/5 hard gate before commit (CLAUDE.md §5). Re-run after any fix.
- License: KFGQPC-family text/font already has an accepted permissive EULA in this repo (2010 KFGQPC, free-of-cost, per existing font). This plan does **not** import any new third-party text — it only corrects our own existing Tanzil-sourced text to use standard Unicode combining characters. No new license to validate.

---

## Rejected Alternatives (context for future readers — don't redo this research)

1. **Swap font to Amiri Quran.** User rejected: doesn't look good, and font isn't the bug.
2. **Wholesale swap `ayahs.text_uthmani`/`words.text_arabic` to quran.com's QPC Uthmani text.** Tested: whitespace-split word count mismatches existing morphology-aligned `words` table in **2721/6236 ayahs** (standalone waqf-mark tokens, different tanween/dagger-alef conventions inflate QPC's per-ayah token count). Would require a much bigger alignment-repair project for zero benefit over the targeted fix below. Rejected.
3. **Blanket regex `لْء` → `لْـٔ` with no context check.** Verified against QPC ground truth for all 208 DB occurrences: 1 false positive — root-internal لء (3:91, "مِّلْءُ", root م-ل-ء, hamza is the 3rd radical, QPC keeps it as bare hamza). Must exclude via preceding-letter check (see Task 1).

---

## Task 1: Pure fix function + unit tests

**Files:**
- Create: `packages/scraper/scraper/hamza_seat.py`
- Test: `packages/scraper/tests/test_hamza_seat.py`

**Interfaces:**
- Produces: `fix_seatless_hamza(text: str) -> str` — pure string transform, no DB dependency. Used by Task 2 (DB method) and Task 3 (importers).

- [ ] **Step 1: Write the failing tests**

```python
# packages/scraper/tests/test_hamza_seat.py
from __future__ import annotations

from scraper.hamza_seat import fix_seatless_hamza


def test_28_alakhiri_gets_tatweel_seat() -> None:
    """Baqara 2:8 word 8 -- the bug word. Definite article + hamza-initial root."""
    assert fix_seatless_hamza("ٱلْءَاخِرِ") == "ٱلْـَٔاخِرِ"


def test_assimilated_lam_form_gets_tatweel_seat() -> None:
    """'لِّلْءَاكِلِينَ' -- assimilated lam (لِّ) still IS the definite article."""
    assert fix_seatless_hamza("لِّلْءَاكِلِينَ") == "لِّلْـَٔاكِلِينَ"


def test_la_prefix_assimilated_form_gets_tatweel_seat() -> None:
    """'وَلَلْءَاخِرَةُ' -- لَ prefix + assimilated ال, still the definite article."""
    assert fix_seatless_hamza("وَلَلْءَاخِرَةُ") == "وَلَلْـَٔاخِرَةُ"


def test_root_internal_lam_sukun_hamza_untouched() -> None:
    """3:91 'مِّلْءُ' (root م-ل-ء) -- hamza is the 3rd root letter, not a
    definite-article seatless-hamza. Must NOT be rewritten (verified against
    quran.com QPC Uthmani text: QPC keeps this as bare hamza too)."""
    assert fix_seatless_hamza("مِّلْءُ") == "مِّلْءُ"


def test_no_match_passthrough() -> None:
    assert fix_seatless_hamza("ءَامَنَّا") == "ءَامَنَّا"


def test_idempotent() -> None:
    once = fix_seatless_hamza("ٱلْءَاخِرِ")
    assert fix_seatless_hamza(once) == once


def test_empty_string() -> None:
    assert fix_seatless_hamza("") == ""
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/scraper && uv run pytest tests/test_hamza_seat.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'scraper.hamza_seat'`

- [ ] **Step 3: Write the implementation**

```python
# packages/scraper/scraper/hamza_seat.py
"""Fix seatless-hamza encoding to match KFGQPC Hafs Uthmanic Script's rules.

Our Tanzil-derived Quran text (imported via tools/import_alqurancloud.py,
edition "quran-uthmani") encodes the hamza in words like "the last/hereafter"
(2:8 al-akhir) as a bare HAMZA LETTER (U+0621) directly followed by ALEF
(U+0627): "ٱلْءَاخِرِ".

The KFGQPC Hafs Uthmanic Script font (bundled as hafs.18.woff2, and every
KFGQPC build tested including v2.2) only attaches this hamza correctly when
it is encoded as TATWEEL (U+0640, a seat) + ARABIC HAMZA ABOVE (U+0654, a
combining mark) -- this is quran.com's own "QPC Uthmani" text convention,
confirmed via their public API (api.quran.com) against the same font file.
With the bare-hamza encoding, the font renders the hamza and the following
alef with a visible gap (no attachment) -- verified via HarfBuzz shaping,
not just a static font-table read.

This only applies to hamza that has NO natural seat letter to sit on: the
definite article ('al-') immediately followed by a hamza-initial root, e.g.
"ٱلْء..." (al-akhir, al-ayat) whether the article is spelled with its own
alef ('ٱل'/'ال') or assimilated into a preceding lam ('لِّ', 'لَلْ' etc, after
a prefix particle). It must NOT touch a hamza that is genuinely a root
letter and happens to follow lam+sukun for unrelated reasons, e.g. 3:91
"مِّلْءُ" (root م-ل-ء -- hamza is the 3rd radical, preceded by meem, not the
definite article). Verified against quran.com's QPC Uthmani API text across
every ayah in the Quran containing "لْء" (208 occurrences): 207 are the
definite-article case and get rewritten; the one exception (3:91) is
excluded by the preceding-letter check below, and QPC's own text confirms it
should stay as bare hamza too.
"""

from __future__ import annotations

import re

# Harakat, small Quranic signs, dagger alef, waqf marks, tatweel, BOM --
# stripped only to find the *base letter* immediately preceding a match,
# never applied to the returned text itself.
_MARKS_RE = re.compile(
    r"[ؐ-ًؚ-ٰٟۖ-ۭـ﻿]"
)

# LAM + SUKUN + HAMZA -- the candidate pattern. Whether this is a
# definite-article seatless-hamza or a root-internal hamza is decided by
# what precedes it (see _is_definite_article_context).
_LAM_SUKUN_HAMZA_RE = re.compile("لْء")

# Base letters that mean "this lam is (part of) the definite article":
# ا / ٱ (the article's own alef, plain or elided-hamza-wasl) or ل itself
# (assimilated article after a prefix particle, e.g. لِّ, لَلْ).
_DEFINITE_ARTICLE_PRECEDERS = ("ا", "ٱ", "ل")


def fix_seatless_hamza(text: str) -> str:
    """Rewrite definite-article seatless-hamza to the KFGQPC tatweel-seat form.

    Idempotent -- re-running on already-fixed text is a no-op (the pattern
    this matches no longer exists once fixed).
    """

    def repl(m: re.Match[str]) -> str:
        prefix_skeleton = _MARKS_RE.sub("", text[: m.start()])
        prev_letter = prefix_skeleton[-1] if prefix_skeleton else ""
        if prev_letter in _DEFINITE_ARTICLE_PRECEDERS:
            return "لْـٔ"  # ل + ْ + ـ (tatweel seat) + ٔ
        return m.group(0)  # root-internal لء (e.g. مِّلْءُ) -- leave as-is

    return _LAM_SUKUN_HAMZA_RE.sub(repl, text)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/scraper && uv run pytest tests/test_hamza_seat.py -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Lint + type-check**

Run: `cd packages/scraper && uv run ruff check scraper/hamza_seat.py tests/test_hamza_seat.py && uv run mypy scraper/hamza_seat.py`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add packages/scraper/scraper/hamza_seat.py packages/scraper/tests/test_hamza_seat.py
git commit -m "$(cat <<'EOF'
fix(scraper): add seatless-hamza encoding fix for KFGQPC attachment bug

KFGQPC Hafs Uthmanic Script only attaches hamza correctly (e.g. 2:8
al-akhir) when encoded as tatweel+combining-hamza-above, not bare hamza.
Verified against quran.com's QPC Uthmani API text and HarfBuzz shaping.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: DB-level apply method + one-shot CLI command

**Files:**
- Modify: `packages/scraper/scraper/db.py` (add method near `delete_null_arabic_root_forms`, ~line 463)
- Create: `packages/scraper/scraper/fix_hamza_seat.py` (thin wrapper, mirrors `fix_root_data.py`)
- Modify: `packages/scraper/scraper/cli.py` (add command near `fix_root_data_cmd`, ~line 114)
- Test: `packages/scraper/tests/test_fix_hamza_seat.py`

**Interfaces:**
- Consumes: `fix_seatless_hamza(text: str) -> str` from Task 1.
- Produces: `ScraperDatabase.apply_hamza_seat_fix() -> tuple[int, int]` (ayahs changed, words changed); `fix_hamza_seat(db: ScraperDatabase) -> tuple[int, int]`; CLI command `scraper fix-hamza-seat --db <path>`.

- [ ] **Step 1: Write the failing test**

```python
# packages/scraper/tests/test_fix_hamza_seat.py
from __future__ import annotations

from scraper.db import ScraperDatabase
from scraper.fix_hamza_seat import fix_hamza_seat
from scraper.models import AyahModel, SurahModel, WordModel


def _db(tmp_path) -> ScraperDatabase:
    db = ScraperDatabase(str(tmp_path / "s.db"))
    db.upsert_surah(
        SurahModel(
            id=2,
            name_arabic="ا",
            name_translit="a",
            name_translation="a",
            revelation_type="medinan",
            ayah_count=286,
            order_number=2,
        )
    )
    return db


def test_fixes_ayah_and_word_text(tmp_path) -> None:
    db = _db(tmp_path)
    aid = db.upsert_ayah(
        AyahModel(surah_id=2, ayah_number=8, text_uthmani="وَبِٱلْيَوْمِ ٱلْءَاخِرِ")
    )
    db.upsert_word(WordModel(ayah_id=aid, position=8, text_arabic="ٱلْءَاخِرِ"))
    db.upsert_word(WordModel(ayah_id=aid, position=7, text_arabic="وَبِٱلْيَوْمِ"))

    ayahs_changed, words_changed = fix_hamza_seat(db)

    assert ayahs_changed == 1
    assert words_changed == 1
    ayah = db.get_ayah(2, 8)
    assert ayah["text_uthmani"] == "وَبِٱلْيَوْمِ ٱلْـَٔاخِرِ"
    rows = db._conn.execute(
        "SELECT position, text_arabic FROM words WHERE ayah_id = ?", (aid,)
    ).fetchall()
    words = {r["position"]: r["text_arabic"] for r in rows}
    assert words[8] == "ٱلْـَٔاخِرِ"
    assert words[7] == "وَبِٱلْيَوْمِ"  # untouched


def test_root_internal_hamza_untouched(tmp_path) -> None:
    db = _db(tmp_path)
    aid = db.upsert_ayah(
        AyahModel(surah_id=2, ayah_number=1, text_uthmani="مِّلْءُ ٱلْأَرْضِ")
    )
    db.upsert_word(WordModel(ayah_id=aid, position=1, text_arabic="مِّلْءُ"))

    ayahs_changed, words_changed = fix_hamza_seat(db)

    assert ayahs_changed == 0
    assert words_changed == 0


def test_idempotent_second_run_is_noop(tmp_path) -> None:
    db = _db(tmp_path)
    aid = db.upsert_ayah(
        AyahModel(surah_id=2, ayah_number=8, text_uthmani="ٱلْءَاخِرِ")
    )
    db.upsert_word(WordModel(ayah_id=aid, position=1, text_arabic="ٱلْءَاخِرِ"))
    assert fix_hamza_seat(db) == (1, 1)
    assert fix_hamza_seat(db) == (0, 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/scraper && uv run pytest tests/test_fix_hamza_seat.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'scraper.fix_hamza_seat'`

- [ ] **Step 3: Add the DB method**

Insert into `packages/scraper/scraper/db.py` directly after `delete_null_arabic_root_forms` (after line 463):

```python
    def apply_hamza_seat_fix(self) -> tuple[int, int]:
        """Rewrite definite-article seatless-hamza in ayahs/words text.

        See scraper.hamza_seat for the full rationale. Idempotent -- returns
        (0, 0) on a second run. Returns (ayahs changed, words changed).
        """
        from .hamza_seat import fix_seatless_hamza

        ayahs_changed = 0
        for row in self._conn.execute(
            "SELECT id, text_uthmani FROM ayahs WHERE text_uthmani LIKE '%لْء%'"
        ):
            fixed = fix_seatless_hamza(row["text_uthmani"])
            if fixed != row["text_uthmani"]:
                self._conn.execute(
                    "UPDATE ayahs SET text_uthmani = ? WHERE id = ?",
                    (fixed, row["id"]),
                )
                ayahs_changed += 1

        words_changed = 0
        for row in self._conn.execute(
            "SELECT id, text_arabic FROM words WHERE text_arabic LIKE '%لْء%'"
        ):
            fixed = fix_seatless_hamza(row["text_arabic"])
            if fixed != row["text_arabic"]:
                self._conn.execute(
                    "UPDATE words SET text_arabic = ? WHERE id = ?",
                    (fixed, row["id"]),
                )
                words_changed += 1

        self._conn.commit()
        return ayahs_changed, words_changed
```

- [ ] **Step 4: Add the thin wrapper**

```python
# packages/scraper/scraper/fix_hamza_seat.py
"""Repeatable fix for seatless-hamza encoding (idempotent).

Rewrites bare hamza -> tatweel+combining-hamza-above wherever it's a
definite-article seatless-hamza (e.g. 2:8 al-akhir), matching the KFGQPC
Hafs Uthmanic Script's attachment rules. See scraper.hamza_seat for the
character-level rule and scraper.db.apply_hamza_seat_fix for the SQL.

Back up the DB (.bak) before running against the canonical DB.
"""

from __future__ import annotations

from .db import ScraperDatabase


def fix_hamza_seat(db: ScraperDatabase) -> tuple[int, int]:
    """Return (ayahs changed, words changed)."""
    return db.apply_hamza_seat_fix()
```

- [ ] **Step 5: Add the CLI command**

Insert into `packages/scraper/scraper/cli.py` directly after `fix_root_data_cmd` (after line 114):

```python
@main.command("fix-hamza-seat")
@click.option("--db", default="quran.db", show_default=True, help="SQLite output path")
def fix_hamza_seat_cmd(db: str) -> None:
    """Rewrite definite-article seatless-hamza to KFGQPC's tatweel-seat form (idempotent)."""
    from .fix_hamza_seat import fix_hamza_seat

    database = ScraperDatabase(db)
    ayahs, words = fix_hamza_seat(database)
    database.close()
    click.echo(f"fix-hamza-seat: {ayahs} ayahs updated, {words} words updated.")
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/scraper && uv run pytest tests/test_fix_hamza_seat.py -v`
Expected: PASS (3 tests)

- [ ] **Step 7: Lint + type-check**

Run: `cd packages/scraper && uv run ruff check scraper/db.py scraper/fix_hamza_seat.py scraper/cli.py tests/test_fix_hamza_seat.py && uv run mypy scraper/db.py scraper/fix_hamza_seat.py scraper/cli.py`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add packages/scraper/scraper/db.py packages/scraper/scraper/fix_hamza_seat.py packages/scraper/scraper/cli.py packages/scraper/tests/test_fix_hamza_seat.py
git commit -m "$(cat <<'EOF'
fix(scraper): wire seatless-hamza fix into DB layer + CLI

Adds `scraper fix-hamza-seat --db <path>`, idempotent, mirrors the
existing fix-root-data command pattern.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Apply fix at import time (future re-imports stay correct)

**Files:**
- Modify: `packages/scraper/scraper/sources/tanzil.py:22`
- Modify: `packages/scraper/tools/import_alqurancloud.py:53`

**Interfaces:**
- Consumes: `fix_seatless_hamza` from Task 1.

- [ ] **Step 1: Patch `tanzil.py`**

Change line 22 from:
```python
            text_uthmani = aya.attrib["text"]
```
to:
```python
            text_uthmani = fix_seatless_hamza(aya.attrib["text"])
```
And add the import at the top of the file:
```python
from ..hamza_seat import fix_seatless_hamza
```

- [ ] **Step 2: Patch `import_alqurancloud.py`**

Change line 53 from:
```python
                    text_uthmani=ayah["text"],
```
to:
```python
                    text_uthmani=fix_seatless_hamza(ayah["text"]),
```
And add the import near the top (after the `from scraper.models import ...` line):
```python
from scraper.hamza_seat import fix_seatless_hamza
```

- [ ] **Step 3: Run existing test suites to check no regression**

Run: `cd packages/scraper && uv run pytest tests/ -v -k "tanzil or alqurancloud"`
Expected: PASS (no existing tests reference these files by name if none exist yet — confirm no failures; these two files currently have no dedicated test file, this step is a repo-wide safety check, not new coverage)

Run full suite too: `cd packages/scraper && uv run pytest -q`
Expected: all pass, no new failures introduced

- [ ] **Step 4: Lint + type-check**

Run: `cd packages/scraper && uv run ruff check scraper/sources/tanzil.py tools/import_alqurancloud.py && uv run mypy scraper/sources/tanzil.py`
Expected: no errors (tools/ scripts may be excluded from mypy per existing config — check `packages/scraper/pyproject.toml` `[tool.mypy]` exclude list before worrying about a failure here)

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/scraper/sources/tanzil.py packages/scraper/tools/import_alqurancloud.py
git commit -m "$(cat <<'EOF'
fix(scraper): apply seatless-hamza fix at import time

Future re-imports from Tanzil XML or alquran.cloud would otherwise
reintroduce the bare-hamza encoding this phase just fixed.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Back up + run the one-shot backfill against the live DB

**Files:** none created/modified — operational task against `/home/claude/quran-data/quran.db`.

- [ ] **Step 1: Resolve symlink and back up**

```bash
readlink -f apps/web/quran.db
cp "$(readlink -f apps/web/quran.db)" "$(readlink -f apps/web/quran.db).bak-$(date +%Y%m%d)"
ls -la /home/claude/quran-data/
```
Expected: a new `.bak-YYYYMMDD` file next to `quran.db`, same size as the original.

- [ ] **Step 2: Dry-run count check before writing**

```bash
python3 -c "
import sqlite3
con = sqlite3.connect('$(readlink -f apps/web/quran.db)')
cur = con.cursor()
cur.execute(\"SELECT COUNT(*) FROM ayahs WHERE text_uthmani LIKE '%لْء%'\")
print('ayahs candidates:', cur.fetchone()[0])
cur.execute(\"SELECT COUNT(*) FROM words WHERE text_arabic LIKE '%لْء%'\")
print('words candidates:', cur.fetchone()[0])
"
```
Expected: `ayahs candidates: 205`, `words candidates: 208` (these are *candidates* — the exact-match count before the preceding-letter filter; the real number of rows actually rewritten will be 1 less per table, since the 3:91 exception is included in these raw LIKE-counts but excluded by `fix_seatless_hamza`'s own logic).

- [ ] **Step 3: Run the fix**

```bash
cd packages/scraper
uv run scraper fix-hamza-seat --db "$(readlink -f ../../apps/web/quran.db)"
```
Expected output: `fix-hamza-seat: 204 ayahs updated, 207 words updated.` (candidates minus the 3:91 exception per table, per Step 2's note.)

If the numbers differ from this, STOP — do not proceed to Task 5. Diff `apps/web/quran.db` against the `.bak` for the `ayahs`/`words` tables and investigate before continuing (do not just re-run).

- [ ] **Step 4: Spot-check the bug verse directly**

```bash
python3 -c "
import sqlite3
con = sqlite3.connect('$(readlink -f apps/web/quran.db)')
cur = con.cursor()
cur.execute(\"SELECT text_uthmani FROM ayahs WHERE surah_id=2 AND ayah_number=8\")
print(cur.fetchone()[0])
cur.execute('''SELECT w.text_arabic FROM words w JOIN ayahs a ON w.ayah_id=a.id
               WHERE a.surah_id=2 AND a.ayah_number=8 AND w.position=8''')
print(cur.fetchone()[0])
"
```
Expected: both print `...ٱلْـَٔاخِرِ...` (contains U+0640 TATWEEL + U+0654 HAMZA ABOVE, not bare U+0621).

- [ ] **Step 5: No commit this step** — this is a live-data operation, not a code change. Note the run (row counts, timestamp) in the PR description for Task 5's commit.

---

## Task 5: Visual acceptance check + regression guard test

**Files:**
- Test: `packages/scraper/tests/test_hamza_seat_regression.py` (guards against the fix silently regressing on a fresh full-DB run)

**Interfaces:**
- Consumes: real DB at `apps/web/quran.db` (skips if not present — this test is a live-data guard, not a unit test; mark accordingly).

- [ ] **Step 1: Write the regression guard test**

```python
# packages/scraper/tests/test_hamza_seat_regression.py
"""Guards against the seatless-hamza fix regressing on the real DB.

Not a unit test (Task 1's tests cover the pure function in isolation) --
this asserts the *live* DB has zero remaining un-fixed occurrences and
the known bug word (2:8) is specifically correct. Skips if the DB isn't
present (e.g. CI without the data artifact).
"""

from __future__ import annotations

import os
import sqlite3

import pytest

DB_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "apps", "web", "quran.db"
)


@pytest.mark.skipif(not os.path.exists(DB_PATH), reason="live DB not present")
def test_no_remaining_definite_article_seatless_hamza() -> None:
    from scraper.hamza_seat import fix_seatless_hamza

    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("SELECT id, text_uthmani FROM ayahs WHERE text_uthmani LIKE '%لْء%'")
    rows = cur.fetchall()
    unfixed = [(rid, t) for rid, t in rows if fix_seatless_hamza(t) != t]
    assert unfixed == [], f"{len(unfixed)} ayahs still need the fix: {unfixed[:5]}"


@pytest.mark.skipif(not os.path.exists(DB_PATH), reason="live DB not present")
def test_28_word_8_is_correct() -> None:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute(
        """SELECT w.text_arabic FROM words w JOIN ayahs a ON w.ayah_id = a.id
           WHERE a.surah_id = 2 AND a.ayah_number = 8 AND w.position = 8"""
    )
    text = cur.fetchone()[0]
    assert text == "ٱلْـَٔاخِرِ"
    assert "ء" not in text  # no bare hamza left
    assert "ـٔ" in text  # tatweel-seat present
```

- [ ] **Step 2: Run it against the live DB (post-Task-4)**

Run: `cd packages/scraper && uv run pytest tests/test_hamza_seat_regression.py -v`
Expected: PASS (2 tests, not skipped)

- [ ] **Step 3: Visual confirmation (manual, not automated)**

Re-render the fixed word through the existing HarfBuzz+FreeType pipeline built earlier in this investigation (`render.py` in the scratch dir) against the real KFGQPC font, and visually confirm the gap is gone:

```bash
python3 -c "
import sqlite3
con = sqlite3.connect('apps/web/quran.db')
print(con.execute('''SELECT w.text_arabic FROM words w JOIN ayahs a ON w.ayah_id=a.id
                      WHERE a.surah_id=2 AND a.ayah_number=8 AND w.position=8''').fetchone()[0])
"
# feed that exact string into render.py against the bundled font + quranws_v22.ttf, view both PNGs
```
Expected: hamza sits attached against the alef, no gap, matching the quran.com reference render already confirmed earlier in this investigation.

- [ ] **Step 4: Lint + type-check + full suite**

Run: `cd packages/scraper && uv run ruff check tests/test_hamza_seat_regression.py && uv run mypy tests/test_hamza_seat_regression.py && uv run pytest -q`
Expected: no errors, full suite green

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/tests/test_hamza_seat_regression.py
git commit -m "$(cat <<'EOF'
test(scraper): guard against seatless-hamza fix regressing on live DB

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final review + Greptile gate (CLAUDE.md §4/§5 — mandatory, no override)

- [x] **Step 1:** Self-review full diff against DRY/SOLID/OWASP + this file. Confirm: no duplicated regex logic (Task 1's function is the single source), no schema changes, no new dependencies, no secrets touched.
- [x] **Step 2:** Run Greptile on the full branch diff.
- [x] **Step 3:** If score < 5/5, fix every finding (or document a false-positive justification in the commit body) and re-run Greptile. Repeat until 5/5 — no override per CLAUDE.md §5. (Round 1 = 4/5, P1: `derive_word_arabic`'s segment-concat rebuild bypassed the fix and could regress it. Fixed in `56e4312` — extracted `_fix_seatless_hamza_in` helper, re-applied after rebuild, regression test added. Round 2 = 5/5, 0 comments.)
- [x] **Step 4:** Once 5/5, open PR summarizing: root cause (font requires tatweel-seat encoding, not a font defect), scope (204 ayahs / 207 words corrected — note: this line originally said 207/207, corrected to match Task 4's verified real counts), and the live-DB backup location/timestamp from Task 4. → PR #34.
