# WbW Data Alignment Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `words.text_arabic` correctly match `transliteration`/`word_glosses`/`word_segments` for every word, fill Fatiha's 29 missing translit/gloss, and add an alignment validator so misalignment can't ship again.

**Architecture:** Per-word Arabic's single source of truth = `word_segments` (GPL, corpus-position-aligned). Stop deriving `text_arabic` from `text_uthmani.split()` (mismatched tokenization → 42% drift). Instead: fix the scraper to not guess it, derive `text_arabic` from segments as a pipeline step, re-scrape Fatiha for translit, and gate the result with a validator asserting alignment (not row counts).

**Tech Stack:** Python 3.11, pydantic models, sqlite3, click CLI, pytest. Package `packages/scraper`, venv `.venv` (has bs4). Run tests: `.venv/bin/python -m pytest`.

## Global Constraints

- Single source of truth for per-word Arabic = `word_segments.form_arabic` concat by `segment_index`. Never re-derive from `text_uthmani`.
- Strict execution order: B → C → A → D → E (code tasks 1–4; then ops runbook). B before C or the re-scrape re-injects the bug.
- Re-scrape respects robots.txt / rate-limit ~1.5s (CLAUDE.md §11).
- No schema change (data-only). App consumes `file:quran.db` directly via `createDatabase` — Component E = place the repaired file where the app reads it.
- Every code task: 5-step loop + Greptile 5/5 hard block (CLAUDE.md §5).
- Compact after phase approval (§13).
- Ground-truth anchors (verified 2026-07-05): 112:1:1 translit=`qul` arabic=`قُلْ`; 36:1:1 translit=`ya-seen` arabic=`يسٓ`; 2:2:5 translit=`fīhi`.

## File Structure

- `packages/scraper/scraper/sources/corpus_quran.py` — MODIFY `_process_page` (drop text_uthmani derivation).
- `packages/scraper/scraper/checkpoint.py` — ADD `clear(key)`.
- `packages/scraper/scraper/cli.py` — ADD `--force` to `scrape`; ADD `derive-word-arabic`, `validate-alignment` commands.
- `packages/scraper/scraper/db.py` — ADD `rebuild_text_arabic_from_segments`, `count_words_without_segments`, `count_text_arabic_misaligned`, `count_words_missing_translit`, `get_word_align(surah,ayah,position)`.
- `packages/scraper/scraper/word_arabic.py` — CREATE `derive_word_arabic(db)`.
- `packages/scraper/scraper/validate_alignment.py` — CREATE `validate_alignment(db)` + `GROUND_TRUTH`.
- Tests: `tests/test_corpus_quran_process.py`, `tests/test_checkpoint.py`, `tests/test_word_arabic.py`, `tests/test_validate_alignment.py`.

---

### Task 1 (Component B): stop deriving text_arabic from text_uthmani

**Files:**
- Modify: `packages/scraper/scraper/sources/corpus_quran.py:55-88` (`_process_page`)
- Test: `packages/scraper/tests/test_corpus_quran_process.py`

**Interfaces:**
- Consumes: `parse_verse_words(html) -> list[ParsedWord]`; `ParsedWord(verse_number,position,transliteration,pos_tag,english_gloss,morphology_json)`; `db.get_ayah`, `db.upsert_word(WordModel)->int`, `db.upsert_word_gloss(WordGlossModel)`.
- Produces: word rows with `text_arabic=""` (filled later by Task 3).

- [ ] **Step 1: Write failing test**

```python
# packages/scraper/tests/test_corpus_quran_process.py
from scraper.sources import corpus_quran
from scraper.sources.corpus_parser import ParsedWord


def test_process_page_leaves_text_arabic_empty(monkeypatch):
    pw = ParsedWord(
        verse_number=1, position=1, transliteration="qul",
        pos_tag="V", english_gloss="Say", morphology_json=None,
    )
    monkeypatch.setattr(corpus_quran, "parse_verse_words", lambda html: [pw])
    captured = {}

    class FakeDB:
        def get_ayah(self, chapter, verse):
            return {"id": 42, "text_uthmani": "بِسْمِ ٱللَّهِ"}
        def upsert_word(self, word):
            captured["word"] = word
            return 7
        def upsert_word_gloss(self, gloss):
            captured["gloss"] = gloss

    corpus_quran._process_page("<html/>", 1, FakeDB())
    assert captured["word"].text_arabic == ""
    assert captured["word"].transliteration == "qul"
    assert captured["gloss"].gloss_text == "Say"
```

- [ ] **Step 2: Run — verify fail**

Run: `cd packages/scraper && .venv/bin/python -m pytest tests/test_corpus_quran_process.py -v`
Expected: FAIL (`text_arabic` is currently `'بِسْمِ'`, not `''`).

- [ ] **Step 3: Implement**

Replace `_process_page` body (drop `text_uthmani`/`word_texts`/index lookup):

```python
def _process_page(html: str, chapter_id: int, db: ScraperDatabase) -> None:
    """Parse one page of words and upsert into the database.

    text_arabic is intentionally left empty here — it is derived from
    word_segments (the corpus-aligned source of truth) by the
    derive-word-arabic step. Deriving it from text_uthmani.split() misaligns
    with corpus word positions (Basmala + pause-mark tokens shift the index).
    """
    for pw in parse_verse_words(html):
        ayah_row = db.get_ayah(chapter_id, pw.verse_number)
        if ayah_row is None:
            continue
        ayah_id: int = ayah_row["id"]

        word_id = db.upsert_word(
            WordModel(
                ayah_id=ayah_id,
                position=pw.position,
                text_arabic="",
                transliteration=pw.transliteration,
                pos_tag=pw.pos_tag,
                morphology_json=pw.morphology_json,
            )
        )
        if pw.english_gloss:
            db.upsert_word_gloss(
                WordGlossModel(
                    word_id=word_id,
                    language_code="en",
                    gloss_text=pw.english_gloss,
                )
            )
```

Also fix `scrape_chapter` docstring: replace the "Derives text_arabic from text_uthmani…" line with "Word text_arabic is filled later from word_segments (see derive-word-arabic)."

- [ ] **Step 4: Run — verify pass**

Run: `cd packages/scraper && .venv/bin/python -m pytest tests/test_corpus_quran_process.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/scraper/sources/corpus_quran.py packages/scraper/tests/test_corpus_quran_process.py
git commit -m "fix(scraper): stop deriving text_arabic from text_uthmani"
```

---

### Task 2 (Component C infra): Checkpoint.clear + scrape --force

**Files:**
- Modify: `packages/scraper/scraper/checkpoint.py`
- Modify: `packages/scraper/scraper/cli.py:23-45` (`scrape` command)
- Test: `packages/scraper/tests/test_checkpoint.py`

**Interfaces:**
- Produces: `Checkpoint.clear(key: str) -> None`; `scrape --force` flag that clears each target chapter's checkpoint key before scraping.

- [ ] **Step 1: Write failing test**

```python
# packages/scraper/tests/test_checkpoint.py
from scraper.checkpoint import Checkpoint


def test_clear_removes_one_key_keeps_others(tmp_path):
    p = tmp_path / "ck.json"
    ck = Checkpoint(str(p))
    ck.mark_done("chapter_1")
    ck.mark_done("chapter_2")
    ck.clear("chapter_1")
    assert ck.is_done("chapter_1") is False
    assert ck.is_done("chapter_2") is True
    # persisted
    assert Checkpoint(str(p)).is_done("chapter_1") is False


def test_clear_missing_key_is_noop(tmp_path):
    ck = Checkpoint(str(tmp_path / "ck.json"))
    ck.clear("chapter_9")  # no raise
    assert ck.is_done("chapter_9") is False
```

- [ ] **Step 2: Run — verify fail**

Run: `cd packages/scraper && .venv/bin/python -m pytest tests/test_checkpoint.py -v`
Expected: FAIL (`Checkpoint` has no `clear`).

- [ ] **Step 3: Implement clear**

Add to `Checkpoint`:

```python
    def clear(self, key: str) -> None:
        """Remove a single checkpoint key so its unit re-runs. Persists."""
        if key in self._state:
            del self._state[key]
            self._path.write_text(json.dumps(self._state, indent=2))
```

- [ ] **Step 4: Add --force to scrape**

In `cli.py`, add the option decorator to the `scrape` command and clear per chapter:

```python
@click.option("--force", is_flag=True, help="Re-scrape even if checkpoint marks a chapter done")
def scrape(db: str, checkpoint: str, surah: int | None, rate_limit: float, force: bool) -> None:
    """Scrape corpus.quran.com morphology data (rate-limited, resumable)."""
    from .sources.corpus_quran import scrape_chapter

    database = ScraperDatabase(db)
    ckpt = Checkpoint(checkpoint)
    seed_database(database)

    surah_range = [surah] if surah else list(range(1, 115))
    for chapter_id in surah_range:
        if force:
            ckpt.clear(f"chapter_{chapter_id}")
        click.echo(f"Scraping surah {chapter_id}...")
        scrape_chapter(chapter_id, database, ckpt, rate_limit=rate_limit)

    click.echo("Done.")
    database.close()
```

- [ ] **Step 5: Run — verify pass**

Run: `cd packages/scraper && .venv/bin/python -m pytest tests/test_checkpoint.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/scraper/scraper/checkpoint.py packages/scraper/scraper/cli.py packages/scraper/tests/test_checkpoint.py
git commit -m "feat(scraper): add Checkpoint.clear and scrape --force"
```

---

### Task 3 (Component A): derive text_arabic from segments

**Files:**
- Modify: `packages/scraper/scraper/db.py` (add methods)
- Create: `packages/scraper/scraper/word_arabic.py`
- Modify: `packages/scraper/scraper/cli.py` (add `derive-word-arabic`)
- Test: `packages/scraper/tests/test_word_arabic.py`

**Interfaces:**
- Consumes: `ScraperDatabase(db_path)`, applies `packages/data/schema.sql`.
- Produces: `db.rebuild_text_arabic_from_segments() -> int` (rows changed); `db.count_words_without_segments() -> int`; `derive_word_arabic(db) -> int`.

- [ ] **Step 1: Write failing test**

```python
# packages/scraper/tests/test_word_arabic.py
import pytest
from scraper.db import ScraperDatabase
from scraper.models import (
    AyahModel, SurahModel, WordModel, WordSegmentModel,
)
from scraper.word_arabic import derive_word_arabic


def _mkdb(tmp_path):
    db = ScraperDatabase(str(tmp_path / "t.db"))
    db.upsert_surah(SurahModel(id=1, name_arabic="x", name_translit="x",
        name_translation="x", revelation_type="meccan", ayah_count=1, order_number=1))
    db.upsert_ayah(AyahModel(id=1, surah_id=1, ayah_number=1, text_uthmani="x"))
    return db


def _word(db, position, text_arabic):
    return db.upsert_word(WordModel(ayah_id=1, position=position, text_arabic=text_arabic))


def _seg(db, word_id, idx, form):
    db.upsert_word_segment(WordSegmentModel(word_id=word_id, segment_index=idx, form_arabic=form))


def test_derive_fixes_drift_and_leaves_aligned(tmp_path):
    db = _mkdb(tmp_path)
    drift = _word(db, 1, "بِسْمِ")       # wrong
    _seg(db, drift, 0, "قُلْ")           # truth
    ok = _word(db, 2, "ٱلْكِتَٰبُ")       # already right (2 segments)
    _seg(db, ok, 0, "ٱلْ"); _seg(db, ok, 1, "كِتَٰبُ")
    changed = derive_word_arabic(db)
    assert changed == 1
    rows = {r["position"]: r["text_arabic"] for r in
            db._conn.execute("SELECT position,text_arabic FROM words")}
    assert rows[1] == "قُلْ"
    assert rows[2] == "ٱلْكِتَٰبُ"
    # idempotent
    assert derive_word_arabic(db) == 0


def test_derive_raises_when_word_lacks_segments(tmp_path):
    db = _mkdb(tmp_path)
    _word(db, 1, "x")  # no segment
    with pytest.raises(ValueError, match="lack segments"):
        derive_word_arabic(db)
```

- [ ] **Step 2: Run — verify fail**

Run: `cd packages/scraper && .venv/bin/python -m pytest tests/test_word_arabic.py -v`
Expected: FAIL (`scraper.word_arabic` missing).

- [ ] **Step 3: Add db methods**

In `db.py` add:

```python
    def count_words_without_segments(self) -> int:
        return int(self._conn.execute(
            "SELECT count(*) FROM words WHERE id NOT IN "
            "(SELECT DISTINCT word_id FROM word_segments)"
        ).fetchone()[0])

    def rebuild_text_arabic_from_segments(self) -> int:
        """Set words.text_arabic = concat(form_arabic ORDER BY segment_index).
        Segments are the corpus-aligned source of truth. Returns rows changed."""
        cur = self._conn.execute(
            """WITH concat AS (
                 SELECT word_id, group_concat(form_arabic, '') AS ta FROM (
                   SELECT word_id, form_arabic FROM word_segments
                   ORDER BY word_id, segment_index
                 ) GROUP BY word_id
               )
               UPDATE words
                  SET text_arabic = (SELECT ta FROM concat WHERE concat.word_id = words.id)
                WHERE EXISTS (SELECT 1 FROM concat WHERE concat.word_id = words.id)
                  AND text_arabic IS NOT
                      (SELECT ta FROM concat WHERE concat.word_id = words.id)"""
        )
        self._conn.commit()
        return cur.rowcount
```

- [ ] **Step 4: Create word_arabic.py**

```python
# packages/scraper/scraper/word_arabic.py
"""Derive words.text_arabic from word_segments — the corpus-aligned source of
truth. Fixes misalignment left by any positional guess; idempotent."""

from __future__ import annotations

from .db import ScraperDatabase


def derive_word_arabic(db: ScraperDatabase) -> int:
    """Rebuild every word's text_arabic from its segments. Returns rows changed.
    Raises ValueError if any word has no segments (cannot derive its Arabic)."""
    missing = db.count_words_without_segments()
    if missing:
        raise ValueError(f"{missing} words lack segments; cannot derive text_arabic")
    return db.rebuild_text_arabic_from_segments()
```

- [ ] **Step 5: Add CLI command**

In `cli.py`:

```python
@main.command("derive-word-arabic")
@click.option("--db", default="quran.db", show_default=True)
def derive_word_arabic_cmd(db: str) -> None:
    """Rebuild words.text_arabic from word_segments (corpus-aligned)."""
    from .word_arabic import derive_word_arabic

    database = ScraperDatabase(db)
    changed = derive_word_arabic(database)
    database.close()
    click.echo(f"derive-word-arabic: {changed} words updated.")
```

- [ ] **Step 6: Run — verify pass**

Run: `cd packages/scraper && .venv/bin/python -m pytest tests/test_word_arabic.py -v`
Expected: PASS (both tests).

- [ ] **Step 7: Commit**

```bash
git add packages/scraper/scraper/db.py packages/scraper/scraper/word_arabic.py packages/scraper/scraper/cli.py packages/scraper/tests/test_word_arabic.py
git commit -m "feat(scraper): derive text_arabic from word_segments"
```

---

### Task 4 (Component D): alignment validator

**Files:**
- Modify: `packages/scraper/scraper/db.py` (add read helpers)
- Create: `packages/scraper/scraper/validate_alignment.py`
- Modify: `packages/scraper/scraper/cli.py` (add `validate-alignment`)
- Test: `packages/scraper/tests/test_validate_alignment.py`

**Interfaces:**
- Consumes: `ScraperDatabase`.
- Produces: `db.count_text_arabic_misaligned() -> int`; `db.count_words_missing_translit() -> int`; `db.get_word_align(surah,ayah,position) -> sqlite3.Row | None` (columns `text_arabic`, `transliteration`); `validate_alignment(db) -> list[str]` (empty = pass); `GROUND_TRUTH`.

- [ ] **Step 1: Write failing test**

```python
# packages/scraper/tests/test_validate_alignment.py
from scraper.db import ScraperDatabase
from scraper.models import AyahModel, SurahModel, WordModel, WordSegmentModel
from scraper.validate_alignment import GROUND_TRUTH, validate_alignment

_AYAH_ID = {}  # (surah,ayah) -> ayah_id


def _mkdb(tmp_path):
    """Seed a DB that satisfies every GROUND_TRUTH anchor (so the aligned case
    can assert []). Extra anchors beyond 112:1:1 matter because validate checks
    all of them."""
    db = ScraperDatabase(str(tmp_path / "t.db"))
    _AYAH_ID.clear()
    seen_surah = set()
    aid = 0
    for surah, ayah, pos, exp_ar, exp_tr in GROUND_TRUTH:
        if surah not in seen_surah:
            db.upsert_surah(SurahModel(id=surah, name_arabic="x", name_translit="x",
                name_translation="x", revelation_type="meccan", ayah_count=ayah,
                order_number=surah))
            seen_surah.add(surah)
        if (surah, ayah) not in _AYAH_ID:
            aid += 1
            db.upsert_ayah(AyahModel(id=aid, surah_id=surah, ayah_number=ayah, text_uthmani="x"))
            _AYAH_ID[(surah, ayah)] = aid
        _w(db, _AYAH_ID[(surah, ayah)], pos, exp_ar, exp_tr)
    return db


def _w(db, ayah_id, position, ta, tr):
    wid = db.upsert_word(WordModel(ayah_id=ayah_id, position=position,
        text_arabic=ta, transliteration=tr))
    db.upsert_word_segment(WordSegmentModel(word_id=wid, segment_index=0, form_arabic=ta))
    return wid


def test_passes_when_aligned(tmp_path):
    db = _mkdb(tmp_path)  # all ground-truth anchors seeded correctly
    assert validate_alignment(db) == []


def test_flags_text_arabic_drift(tmp_path):
    db = _mkdb(tmp_path)
    db._conn.execute("UPDATE words SET text_arabic='بِسْمِ' "
                     "WHERE id=(SELECT w.id FROM words w JOIN ayahs a ON a.id=w.ayah_id "
                     "WHERE a.surah_id=112 AND a.ayah_number=1 AND w.position=1)")
    db._conn.commit()
    errs = validate_alignment(db)
    assert any("segment concat" in e for e in errs)


def test_flags_missing_translit(tmp_path):
    db = _mkdb(tmp_path)
    db._conn.execute("UPDATE words SET transliteration=NULL "
                     "WHERE id=(SELECT w.id FROM words w JOIN ayahs a ON a.id=w.ayah_id "
                     "WHERE a.surah_id=112 AND a.ayah_number=1 AND w.position=1)")
    db._conn.commit()
    errs = validate_alignment(db)
    assert any("transliteration" in e for e in errs)


def test_flags_ground_truth_mismatch(tmp_path):
    db = _mkdb(tmp_path)
    db._conn.execute("UPDATE words SET transliteration='xxx' "
                     "WHERE id=(SELECT w.id FROM words w JOIN ayahs a ON a.id=w.ayah_id "
                     "WHERE a.surah_id=112 AND a.ayah_number=1 AND w.position=1)")
    db._conn.commit()
    errs = validate_alignment(db)
    assert any("112:1:1" in e for e in errs)
```

- [ ] **Step 2: Run — verify fail**

Run: `cd packages/scraper && .venv/bin/python -m pytest tests/test_validate_alignment.py -v`
Expected: FAIL (`scraper.validate_alignment` missing).

- [ ] **Step 3: Add db read helpers**

In `db.py`:

```python
    def count_text_arabic_misaligned(self) -> int:
        return int(self._conn.execute(
            """WITH concat AS (
                 SELECT word_id, group_concat(form_arabic, '') AS ta FROM (
                   SELECT word_id, form_arabic FROM word_segments
                   ORDER BY word_id, segment_index
                 ) GROUP BY word_id
               )
               SELECT count(*) FROM words w JOIN concat c ON c.word_id = w.id
               WHERE w.text_arabic IS NOT c.ta"""
        ).fetchone()[0])

    def count_words_missing_translit(self) -> int:
        return int(self._conn.execute(
            "SELECT count(*) FROM words "
            "WHERE transliteration IS NULL OR transliteration = ''"
        ).fetchone()[0])

    def get_word_align(self, surah_id: int, ayah_number: int, position: int):
        return self._conn.execute(
            """SELECT w.text_arabic, w.transliteration
               FROM words w JOIN ayahs a ON a.id = w.ayah_id
               WHERE a.surah_id = ? AND a.ayah_number = ? AND w.position = ?""",
            (surah_id, ayah_number, position),
        ).fetchone()
```

- [ ] **Step 4: Create validate_alignment.py**

```python
# packages/scraper/scraper/validate_alignment.py
"""Alignment gate: text_arabic must correspond to translit/segments for every
word. Row counts prove existence, not correspondence — so this checks both a
whole-DB invariant and hard-coded ground-truth anchors."""

from __future__ import annotations

from .db import ScraperDatabase

# (surah, ayah, position, expected_arabic, expected_translit) — verified 2026-07-05
GROUND_TRUTH = [
    (112, 1, 1, "قُلْ", "qul"),
    (36, 1, 1, "يسٓ", "ya-seen"),
    (2, 2, 5, "فِيهِ", "fīhi"),
]


def validate_alignment(db: ScraperDatabase) -> list[str]:
    """Return a list of human-readable failures. Empty list = aligned."""
    errs: list[str] = []

    misaligned = db.count_text_arabic_misaligned()
    if misaligned:
        errs.append(f"{misaligned} words: text_arabic != segment concat")

    no_translit = db.count_words_missing_translit()
    if no_translit:
        errs.append(f"{no_translit} words missing transliteration")

    for surah, ayah, pos, exp_ar, exp_tr in GROUND_TRUTH:
        row = db.get_word_align(surah, ayah, pos)
        if row is None:
            errs.append(f"{surah}:{ayah}:{pos} not found")
            continue
        if row["text_arabic"] != exp_ar:
            errs.append(f"{surah}:{ayah}:{pos} arabic {row['text_arabic']!r} != {exp_ar!r}")
        if row["transliteration"] != exp_tr:
            errs.append(f"{surah}:{ayah}:{pos} translit {row['transliteration']!r} != {exp_tr!r}")

    return errs
```

- [ ] **Step 5: Add CLI command (exits nonzero on failure)**

```python
@main.command("validate-alignment")
@click.option("--db", default="quran.db", show_default=True)
def validate_alignment_cmd(db: str) -> None:
    """Assert text_arabic aligns with translit/segments. Exit 1 on any failure."""
    import sys
    from .validate_alignment import validate_alignment

    database = ScraperDatabase(db)
    errs = validate_alignment(database)
    database.close()
    if errs:
        for e in errs:
            click.echo(f"FAIL: {e}")
        sys.exit(1)
    click.echo("validate-alignment: OK")
```

- [ ] **Step 6: Run — verify pass**

Run: `cd packages/scraper && .venv/bin/python -m pytest tests/test_validate_alignment.py -v`
Expected: PASS (4 tests).

- [ ] **Step 7: Full scraper suite + commit**

Run: `cd packages/scraper && .venv/bin/python -m pytest -q`
Expected: all pass.

```bash
git add packages/scraper/scraper/db.py packages/scraper/scraper/validate_alignment.py packages/scraper/scraper/cli.py packages/scraper/tests/test_validate_alignment.py
git commit -m "feat(scraper): add alignment validator + CLI gate"
```

---

## Ops Runbook (Components C, A, D, E on the real DB)

Run by the controller after Tasks 1–4 are merged (Greptile 5/5). Not unit tests — the validator is the gate. `DB=/home/claude/quran-data/quran.db`.

- [ ] **1. Snapshot (rollback):** `cp "$DB" "$DB.pre-align.bak"`
- [ ] **2. Re-scrape Fatiha (C):** `cd packages/scraper && .venv/bin/python -c "import sys;from scraper.cli import main;sys.argv=['s','scrape','--db','$DB','--surah','1','--force'];main()"` — expect `Scraping surah 1... Done.` (rate-limited, ~7 verses).
- [ ] **3. Derive (A):** `... sys.argv=['s','derive-word-arabic','--db','$DB'];main()` — expect `~32764 words updated` (first run over the real DB fixes the drift + fills ch.1 blanks from segments).
- [ ] **4. Validate (D):** `... sys.argv=['s','validate-alignment','--db','$DB'];main()` — expect `validate-alignment: OK` (exit 0). If FAIL lines print, STOP; investigate (esp. persistent translit gap → re-scrape parser issue).
- [ ] **5. Spot-confirm (independent):** query 112:1:1→قُلْ, 36:1:1→يسٓ, 1:1:1 translit non-null; eyeball 5 more random words' arabic↔translit.
- [ ] **6. Place app DB (E):** copy the repaired `$DB` to the path the web app reads (`file:quran.db`; confirm the deployed/dev location). Re-run web suite: `pnpm --filter web test` — expect green (text_arabic now correct; no interface change).

## Acceptance Criteria (testable)

1. `validate-alignment` exits 0 on the real DB.
2. `count_text_arabic_misaligned() == 0`.
3. `count_words_missing_translit() == 0` (Fatiha filled).
4. Ground truth: 112:1:1 arabic=قُلْ/translit=qul; 36:1:1=يسٓ/ya-seen; 2:2:5=فِيهِ/fīhi.
5. `corpus_quran._process_page` no longer reads `text_uthmani` for `text_arabic`.
6. Full scraper pytest green; web suite green.

## Risks / Rollback

- Overwrites text_arabic on ~32764 rows — snapshot in Ops step 1; re-derive is deterministic from segments (fully reversible).
- Derive is idempotent; safe to re-run.
- Re-scrape ch.1 network: if corpus page shape changed, translit stays null → validator FAILs (step 4) before shipping.
- `group_concat` ordering relies on the ordered subquery (verified in spike); if a future SQLite change breaks it, the validator's misalignment count catches it.
