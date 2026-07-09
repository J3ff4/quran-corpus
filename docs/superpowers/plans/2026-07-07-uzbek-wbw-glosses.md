# Uzbek Word-by-Word Glosses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uzbek per-word glosses for all corpus words, machine-translated (NLLB-200 local) from the English glosses, provenance-tagged, lightly human-reviewed, surfaced under the existing `?lang=uz` path.

**Architecture:** ~80% data. Scraper (Python) generates `uz` `word_glosses` rows: translate the 28,264 DISTINCT English glosses once via a swappable `MtProvider` (concrete `NllbMt`), fan out to all 77,429 words (`source='mt'`). A file export/import CLI flips reviewed top-N to `source='mt-reviewed'`. Web already renders any `word_glosses` row for the selected lang; add an EN-fallback query + `(en)` hint + a Credits line.

**Spike findings (2026-07-07, 67 real glosses through NLLB) — drive two code guards:**
- Tail (content words/phrases) MT is good (~70%+ usable): `and believes→va ishonadi`, `they invent→ular ixtiro qiladilar`, `earth→yer`. → MT the tail.
- Head (top function words) MT fails hard: `from`/`except`→**empty**, `of`→`(b)`, `in`→garbled, `on`→wrong. Highest-occurrence = worst output. → hand-curate the head via the review round-trip (Task 4 export is occurrence-ordered = the head; human overwrites). **MT-all + review-head ≡ MT-tail + curate-head — same outcome, no code split.**
- Corpus editorial notation `[...]`/`(...)` mangles NLLB in both buckets (`(do) not→(do) yo'q`, `any [way] (accountability)→(Murojaatnoma)`). → strip notation before MT (Task 3).
- Empty MT output is real and common. → never insert an empty uz gloss; skip so the EN fallback covers it (Task 3).

**Tech Stack:** Python 3.12 + click + sqlite3 (scraper); transformers + torch (NLLB, optional extra); TypeScript + libSQL (`packages/data`); Next.js App Router (web); vitest + pytest.

## Global Constraints

- Canonical DB: `/home/claude/quran-data/quran.db`; `apps/web/quran.db` symlinks it. **`.bak` before any data write; no concurrent scraper writer.**
- `schema.sql` is the SINGLE shared DDL — read by TS (`generate:schema` → `schema.generated.ts`) AND the Python scraper (`db.py:20`). Edit it, never duplicate DDL.
- `packages/data` stays web/Next-agnostic. Client comps import `@quran-corpus/data/client`, never the barrel.
- Commit NAMED paths only, never `git add -A`. Never commit `STATUS.md`, `docs/handoff-*`, `.superpowers/`, `dist/`, model weights, or DB/`.bak` files.
- Provenance values: `corpus` (existing EN), `mt`, `mt-reviewed`. Target Uzbek lang = Latin (`uzn_Latn`).
- Provenance surfaced in Credits ONLY (no per-gloss marker). Missing-uz → fall back to EN with a `(en)` hint.
- TDD RED→GREEN→COMMIT. Conventional Commits. Commit msgs end:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Greptile 5/5 hard block before merge (§5).

## File Structure

- `packages/data/schema.sql` — add `source` col to `word_glosses` (+ comment).
- `packages/scraper/scraper/db.py` — `_migrate_add_gloss_source()` (ALTER+backfill legacy); distinct-gloss read; uz-gloss upsert-with-source; review read/update.
- `packages/scraper/scraper/mt.py` — NEW: `MtProvider` protocol + `NllbMt`.
- `packages/scraper/scraper/translate_glosses.py` — NEW: dedup→translate→fan-out.
- `packages/scraper/scraper/review_glosses.py` — NEW: export/import round-trip.
- `packages/scraper/scraper/cli.py` — 3 new commands.
- `packages/scraper/pyproject.toml` — optional `mt` extra (transformers, torch).
- `packages/data/src/queries/glosses.ts` — `getGlossesWithFallback` + type.
- `packages/data/src/index.ts` — export it.
- `apps/web/src/app/surah/[id]/page.tsx`, `.../words/page.tsx` — use fallback, carry lang.
- `apps/web/src/components/reader/ReaderView.tsx`, `WordPopover.tsx`, `wbw/WbwWordCell.tsx`, `wbw/types.ts` — `(en)` hint.
- `apps/web/src/app/about/page.tsx` — Credits entry.

---

### Task 1: Provenance column + legacy migration

**Files:**
- Modify: `packages/data/schema.sql` (word_glosses block)
- Modify: `packages/scraper/scraper/db.py` (`_apply_schema`, new `_migrate_add_gloss_source`)
- Test: `packages/scraper/tests/test_db.py`

**Interfaces:**
- Produces: `word_glosses.source TEXT` column; opening `ScraperDatabase` on any DB backfills legacy EN rows to `'corpus'`.

- [ ] **Step 1: Failing test** — append to `tests/test_db.py`:

```python
def test_gloss_source_column_and_backfill(tmp_path) -> None:
    p = str(tmp_path / "s.db")
    # simulate a legacy DB: create word_glosses WITHOUT source, insert an EN row
    import sqlite3
    raw = sqlite3.connect(p)
    raw.executescript(
        """CREATE TABLE word_glosses(
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             word_id INTEGER NOT NULL, language_code TEXT NOT NULL,
             gloss_text TEXT NOT NULL, UNIQUE(word_id, language_code));
           INSERT INTO word_glosses(word_id,language_code,gloss_text)
             VALUES (1,'en','from');"""
    )
    raw.commit(); raw.close()

    db = ScraperDatabase(p)  # _apply_schema runs the migration
    cols = {r["name"] for r in db._conn.execute("PRAGMA table_info(word_glosses)")}
    assert "source" in cols
    src = db._conn.execute(
        "SELECT source FROM word_glosses WHERE word_id=1 AND language_code='en'"
    ).fetchone()["source"]
    assert src == "corpus"
    db.close()
```

- [ ] **Step 2: Run — expect FAIL** (`source` missing / None)

Run: `cd packages/scraper && uv run pytest tests/test_db.py::test_gloss_source_column_and_backfill -v`
Expected: FAIL (no such column: source, or source is None).

- [ ] **Step 3: schema.sql** — replace the `word_glosses` CREATE block:

```sql
CREATE TABLE IF NOT EXISTS word_glosses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id       INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  language_code TEXT    NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
  gloss_text    TEXT    NOT NULL,
  -- Provenance: 'corpus' (scraped EN), 'mt' (machine-translated, unreviewed),
  -- 'mt-reviewed' (MT then human-checked). NULL only on pre-provenance rows
  -- until backfilled; legacy DBs backfilled to 'corpus' by db.py.
  source        TEXT,
  UNIQUE(word_id, language_code)
);
```

- [ ] **Step 4: db.py** — add migration + call it. In `_apply_schema`, after `self._migrate_add_word_columns()` add `self._migrate_add_gloss_source()`. Then add the method:

```python
    def _migrate_add_gloss_source(self) -> None:
        """Add word_glosses.source on legacy DBs + backfill existing rows.

        Fresh DBs get the column from schema.sql; CREATE TABLE IF NOT EXISTS
        will not alter an older table, so add it and mark pre-existing rows
        'corpus' (all such rows are the scraped English glosses).
        """
        cols = {
            row["name"] for row in self._conn.execute("PRAGMA table_info(word_glosses)")
        }
        if "source" not in cols:
            self._conn.execute("ALTER TABLE word_glosses ADD COLUMN source TEXT")
        self._conn.execute(
            "UPDATE word_glosses SET source = 'corpus' WHERE source IS NULL"
        )
```

- [ ] **Step 5: Run — expect PASS** (data-side too: `cd packages/data && pnpm generate:schema` regenerates `schema.generated.ts` with the new col; it is gitignored).

Run: `cd packages/scraper && uv run pytest tests/test_db.py -v`
Expected: PASS (all `test_db` green).

- [ ] **Step 6: Commit**

```bash
git add packages/data/schema.sql packages/scraper/scraper/db.py packages/scraper/tests/test_db.py
git commit -m "feat(data): add word_glosses.source provenance column + legacy backfill

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: MtProvider interface + NllbMt

**Files:**
- Create: `packages/scraper/scraper/mt.py`
- Modify: `packages/scraper/pyproject.toml` (optional `mt` extra)
- Test: `packages/scraper/tests/test_mt.py`

**Interfaces:**
- Produces: `MtProvider` (Protocol, `translate(self, texts: list[str]) -> list[str]`); `NllbMt` concrete (English→Uzbek Latin). Later tasks accept any `MtProvider` (tests pass a fake).

- [ ] **Step 1: Failing test** — `tests/test_mt.py`:

```python
from __future__ import annotations
from scraper.mt import MtProvider


class FakeMt:
    """Deterministic stand-in used across gloss tests."""
    def translate(self, texts: list[str]) -> list[str]:
        return [f"uz:{t}" for t in texts]


def test_fake_satisfies_protocol() -> None:
    p: MtProvider = FakeMt()
    assert p.translate(["from", "Allah"]) == ["uz:from", "uz:Allah"]


def test_nllb_importable_without_torch() -> None:
    # Module must import even when transformers/torch absent (lazy load).
    from scraper.mt import NllbMt
    assert NllbMt is not None
```

- [ ] **Step 2: Run — expect FAIL** (`No module named 'scraper.mt'`)

Run: `cd packages/scraper && uv run pytest tests/test_mt.py -v`
Expected: FAIL (import error).

- [ ] **Step 3: mt.py**:

```python
"""Machine-translation providers for word glosses (swappable, SOLID).

MtProvider is the seam: gloss tooling depends on the protocol, not a vendor.
NllbMt is the one concrete impl — Meta NLLB-200 distilled-600M, run locally
(free, offline, no key). Heavy deps (transformers, torch) are imported lazily
so the module and the fast tests never need them; install with the `mt` extra.
"""
from __future__ import annotations

from typing import Protocol


class MtProvider(Protocol):
    def translate(self, texts: list[str]) -> list[str]:
        """English strings -> Uzbek (Latin). len(out) == len(texts)."""
        ...


class NllbMt:
    """NLLB-200 distilled-600M, English (eng_Latn) -> Uzbek Latin (uzn_Latn)."""

    _MODEL = "facebook/nllb-200-distilled-600M"
    _SRC = "eng_Latn"
    _TGT = "uzn_Latn"

    def __init__(self, batch_size: int = 32) -> None:
        self._batch_size = batch_size
        self._tok = None
        self._model = None

    def _load(self) -> None:
        if self._model is not None:
            return
        # Lazy: only paid when a real translation runs.
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer  # noqa: PLC0415

        self._tok = AutoTokenizer.from_pretrained(self._MODEL, src_lang=self._SRC)
        self._model = AutoModelForSeq2SeqLM.from_pretrained(self._MODEL)

    def translate(self, texts: list[str]) -> list[str]:
        if not texts:
            return []
        self._load()
        assert self._tok is not None and self._model is not None
        bos = self._tok.convert_tokens_to_ids(self._TGT)
        out: list[str] = []
        for i in range(0, len(texts), self._batch_size):
            chunk = texts[i : i + self._batch_size]
            enc = self._tok(chunk, return_tensors="pt", padding=True, truncation=True)
            gen = self._model.generate(
                **enc, forced_bos_token_id=bos, max_length=128
            )
            out.extend(self._tok.batch_decode(gen, skip_special_tokens=True))
        return out
```

- [ ] **Step 4: pyproject.toml** — add after `[project]` dependencies block:

```toml
[project.optional-dependencies]
mt = ["transformers>=4.44.0", "torch>=2.2.0"]
```

- [ ] **Step 5: Run — expect PASS**

Run: `cd packages/scraper && uv run pytest tests/test_mt.py -v`
Expected: PASS (both tests; no torch needed).

- [ ] **Step 6: Commit**

```bash
git add packages/scraper/scraper/mt.py packages/scraper/tests/test_mt.py packages/scraper/pyproject.toml
git commit -m "feat(scraper): MtProvider interface + local NLLB-200 provider

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: translate-glosses (dedup → fan-out)

**Files:**
- Create: `packages/scraper/scraper/translate_glosses.py`
- Modify: `packages/scraper/scraper/db.py` (2 methods)
- Modify: `packages/scraper/scraper/cli.py` (command)
- Test: `packages/scraper/tests/test_translate_glosses.py`

**Interfaces:**
- Consumes: `MtProvider` (Task 2); `word_glosses.source` (Task 1).
- Produces: `translate_glosses(db, provider, batch_size=256) -> int` (uz rows written); db `distinct_en_glosses() -> list[str]`, `upsert_uz_gloss(word_id, gloss_text, source) -> None`.

- [ ] **Step 1: Failing test** — `tests/test_translate_glosses.py`:

```python
from __future__ import annotations
from scraper.db import ScraperDatabase
from scraper.models import AyahModel, SurahModel, WordGlossModel, WordModel
from scraper.translate_glosses import translate_glosses
from tests.test_mt import FakeMt


def _db(tmp_path) -> ScraperDatabase:
    db = ScraperDatabase(str(tmp_path / "s.db"))
    db.upsert_surah(SurahModel(id=1, name_arabic="ا", name_translit="a",
        name_translation="a", revelation_type="meccan", ayah_count=1, order_number=1))
    return db


def _word_en(db, pos, gloss) -> None:
    aid = db.upsert_ayah(AyahModel(surah_id=1, ayah_number=1, text_uthmani="x"))
    wid = db.upsert_word(WordModel(ayah_id=aid, position=pos, text_arabic="x"))
    db.upsert_word_gloss(WordGlossModel(word_id=wid, language_code="en", gloss_text=gloss))


def test_dedup_fanout_and_idempotent(tmp_path) -> None:
    db = _db(tmp_path)
    _word_en(db, 1, "from"); _word_en(db, 2, "from"); _word_en(db, 3, "Allah")

    n = translate_glosses(db, FakeMt())
    assert n == 3  # 3 words got a uz row
    rows = db._conn.execute(
        "SELECT gloss_text, source FROM word_glosses WHERE language_code='uz' ORDER BY gloss_text"
    ).fetchall()
    assert [r["gloss_text"] for r in rows] == ["uz:Allah", "uz:from", "uz:from"]
    assert {r["source"] for r in rows} == {"mt"}

    # provider called once per DISTINCT gloss (2), not per word (3)
    assert db._conn.execute(
        "SELECT COUNT(DISTINCT gloss_text) FROM word_glosses WHERE language_code='uz'"
    ).fetchone()[0] == 2

    assert translate_glosses(db, FakeMt()) == 0  # idempotent: nothing new
    db.close()


def test_normalize_strips_corpus_notation() -> None:
    from scraper.translate_glosses import _normalize_for_mt

    assert _normalize_for_mt("(of) Allah") == "of Allah"
    assert _normalize_for_mt("[the] right,") == "the right,"
    assert _normalize_for_mt("(is) in") == "is in"


class _BlankMt:
    """NLLB really returns '' for words like 'from'/'except' (spike-observed)."""

    def translate(self, texts: list[str]) -> list[str]:
        return ["" if t == "from" else f"uz:{t}" for t in texts]


def test_empty_mt_output_is_skipped(tmp_path) -> None:
    db = _db(tmp_path)
    _word_en(db, 1, "from"); _word_en(db, 2, "Allah")
    n = translate_glosses(db, _BlankMt())
    assert n == 1  # only 'Allah' written; empty 'from' skipped -> EN fallback covers it
    rows = db._conn.execute(
        "SELECT gloss_text FROM word_glosses WHERE language_code='uz'"
    ).fetchall()
    assert [r["gloss_text"] for r in rows] == ["uz:Allah"]
    db.close()
```

- [ ] **Step 2: Run — expect FAIL** (no module)

Run: `cd packages/scraper && uv run pytest tests/test_translate_glosses.py -v`
Expected: FAIL (import error).

- [ ] **Step 3: db.py methods** — add:

```python
    def distinct_en_glosses(self) -> list[str]:
        return [
            row["gloss_text"]
            for row in self._conn.execute(
                "SELECT DISTINCT gloss_text FROM word_glosses WHERE language_code='en'"
            )
        ]

    def upsert_uz_gloss(self, word_id: int, gloss_text: str, source: str) -> None:
        self._conn.execute(
            """INSERT INTO word_glosses (word_id, language_code, gloss_text, source)
               VALUES (?, 'uz', ?, ?)
               ON CONFLICT(word_id, language_code) DO UPDATE SET
                 gloss_text = excluded.gloss_text, source = excluded.source""",
            (word_id, gloss_text, source),
        )
```

- [ ] **Step 4: translate_glosses.py**:

```python
"""Generate Uzbek word glosses from the English ones (idempotent, checkpointed).

Translate each DISTINCT English gloss once (28k, not 77k), then fan the map
out to every word lacking a uz row. source='mt'. Re-run adds only missing rows.
Back up the DB (.bak) before running against the canonical DB.

Two spike-driven guards (see plan): corpus editorial notation is stripped
before MT (NLLB mangles it), and empty MT output is skipped (NLLB returns ''
for words like 'from'/'except') so the word keeps its EN fallback instead of a
blank uz gloss.
"""
from __future__ import annotations

import re

from .db import ScraperDatabase
from .mt import MtProvider

_NOTATION = re.compile(r"[\[\]()]")


def _normalize_for_mt(text: str) -> str:
    """Strip corpus editorial brackets/parens so NLLB sees plain English.

    '(of) Allah'->'of Allah', '[the] right,'->'the right,'. The uz gloss is
    machine-assisted; dropping the notation lifts MT quality (spike-confirmed).
    ponytail: char-strip, not a parser — the corpus only uses () and [].
    """
    return re.sub(r"\s+", " ", _NOTATION.sub("", text)).strip()


def translate_glosses(
    db: ScraperDatabase, provider: MtProvider, batch_size: int = 256
) -> int:
    """Fan uz glosses out to every English-glossed word missing one. Returns rows written."""
    # words needing a uz gloss, with their EN source text
    todo = db._conn.execute(
        """SELECT en.word_id AS word_id, en.gloss_text AS en_gloss
           FROM word_glosses en
           WHERE en.language_code='en'
             AND NOT EXISTS (SELECT 1 FROM word_glosses uz
                             WHERE uz.word_id=en.word_id AND uz.language_code='uz')"""
    ).fetchall()
    if not todo:
        return 0

    distinct = sorted({r["en_gloss"] for r in todo})
    mapping: dict[str, str] = {}
    for i in range(0, len(distinct), batch_size):
        chunk = distinct[i : i + batch_size]
        translated = provider.translate([_normalize_for_mt(en) for en in chunk])
        for en, uz in zip(chunk, translated, strict=True):
            mapping[en] = uz.strip()
        db._conn.commit()  # checkpoint after each batch

    written = 0
    for r in todo:
        uz = mapping[r["en_gloss"]]
        if not uz:  # NLLB gave nothing — leave the word to its EN fallback
            continue
        db.upsert_uz_gloss(r["word_id"], uz, "mt")
        written += 1
    db._conn.commit()
    return written
```

- [ ] **Step 5: cli.py command** — add:

```python
@main.command("translate-glosses")
@click.option("--db", default="quran.db", show_default=True, help="SQLite output path")
@click.option("--batch-size", default=256, show_default=True)
def translate_glosses_cmd(db: str, batch_size: int) -> None:
    """Generate Uzbek word glosses via NLLB-200 (idempotent). Needs the `mt` extra."""
    from .mt import NllbMt
    from .translate_glosses import translate_glosses

    database = ScraperDatabase(db)
    n = translate_glosses(database, NllbMt(), batch_size=batch_size)
    database.close()
    click.echo(f"translate-glosses: {n} uz rows written.")
```

- [ ] **Step 6: Run — expect PASS**

Run: `cd packages/scraper && uv run pytest tests/test_translate_glosses.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/scraper/scraper/translate_glosses.py packages/scraper/scraper/db.py packages/scraper/scraper/cli.py packages/scraper/tests/test_translate_glosses.py
git commit -m "feat(scraper): translate-glosses — dedup EN glosses to Uzbek via NLLB

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Review export / import round-trip

**Files:**
- Create: `packages/scraper/scraper/review_glosses.py`
- Modify: `packages/scraper/scraper/cli.py` (2 commands)
- Test: `packages/scraper/tests/test_review_glosses.py`

**Interfaces:**
- Consumes: uz `word_glosses` rows with `source='mt'` (Task 3).
- Produces: `export_top(db, n) -> list[dict]` (keys `en`, `uz`, `occ`); `import_reviewed(db, entries) -> int` (rows flipped to `mt-reviewed`).

- [ ] **Step 1: Failing test** — `tests/test_review_glosses.py`:

```python
from __future__ import annotations
from scraper.db import ScraperDatabase
from scraper.models import AyahModel, SurahModel, WordGlossModel, WordModel
from scraper.review_glosses import export_top, import_reviewed
from scraper.translate_glosses import translate_glosses
from tests.test_mt import FakeMt


def _db(tmp_path):
    db = ScraperDatabase(str(tmp_path / "s.db"))
    db.upsert_surah(SurahModel(id=1, name_arabic="ا", name_translit="a",
        name_translation="a", revelation_type="meccan", ayah_count=1, order_number=1))
    for pos, g in [(1, "from"), (2, "from"), (3, "Allah")]:
        aid = db.upsert_ayah(AyahModel(surah_id=1, ayah_number=1, text_uthmani="x"))
        wid = db.upsert_word(WordModel(ayah_id=aid, position=pos, text_arabic="x"))
        db.upsert_word_gloss(WordGlossModel(word_id=wid, language_code="en", gloss_text=g))
    translate_glosses(db, FakeMt())
    return db


def test_export_orders_by_occurrence(tmp_path):
    db = _db(tmp_path)
    rows = export_top(db, 10)
    assert rows[0] == {"en": "from", "uz": "uz:from", "occ": 2}
    assert {r["en"] for r in rows} == {"from", "Allah"}


def test_import_flips_only_reviewed_and_is_idempotent(tmp_path):
    db = _db(tmp_path)
    n = import_reviewed(db, [{"en": "from", "uz": "dan"}])
    assert n == 2  # both 'from' words updated
    rows = db._conn.execute(
        "SELECT gloss_text, source FROM word_glosses WHERE language_code='uz'"
    ).fetchall()
    by = {(r["gloss_text"], r["source"]) for r in rows}
    assert ("dan", "mt-reviewed") in by
    assert ("uz:Allah", "mt") in by  # untouched stays mt
    assert import_reviewed(db, [{"en": "from", "uz": "dan"}]) == 0  # no-op re-run
    db.close()
```

- [ ] **Step 2: Run — expect FAIL** (no module)

Run: `cd packages/scraper && uv run pytest tests/test_review_glosses.py -v`
Expected: FAIL (import error).

- [ ] **Step 3: review_glosses.py**:

```python
"""Human review round-trip for Uzbek glosses (file export/edit/import).

export_top writes the highest-occurrence distinct glosses (EN + current MT UZ)
for a human to correct in any editor. import_reviewed writes the corrected UZ
back to every word sharing that EN gloss and flips source to 'mt-reviewed'.
Both idempotent. source values: mt -> mt-reviewed.
"""
from __future__ import annotations

from .db import ScraperDatabase


def export_top(db: ScraperDatabase, n: int) -> list[dict]:
    """Top-n distinct EN glosses by word occurrence, with their current UZ gloss."""
    rows = db._conn.execute(
        """SELECT en.gloss_text AS en, uz.gloss_text AS uz, COUNT(*) AS occ
           FROM word_glosses en
           JOIN word_glosses uz ON uz.word_id=en.word_id AND uz.language_code='uz'
           WHERE en.language_code='en'
           GROUP BY en.gloss_text, uz.gloss_text
           ORDER BY occ DESC, en.gloss_text
           LIMIT ?""",
        (n,),
    ).fetchall()
    return [{"en": r["en"], "uz": r["uz"], "occ": r["occ"]} for r in rows]


def import_reviewed(db: ScraperDatabase, entries: list[dict]) -> int:
    """Apply corrected UZ glosses; flip matching uz rows to 'mt-reviewed'.

    Matches by EN gloss. Only rows whose (gloss_text, source) actually change
    count — so a re-run with the same file writes nothing.
    """
    changed = 0
    for e in entries:
        cur = db._conn.execute(
            """UPDATE word_glosses SET gloss_text=?, source='mt-reviewed'
               WHERE language_code='uz' AND word_id IN (
                 SELECT word_id FROM word_glosses
                 WHERE language_code='en' AND gloss_text=?)
               AND NOT (gloss_text=? AND source='mt-reviewed')""",
            (e["uz"], e["en"], e["uz"]),
        )
        changed += cur.rowcount
    db._conn.commit()
    return changed
```

- [ ] **Step 4: cli.py commands** — add:

```python
@main.command("glosses-export")
@click.option("--db", default="quran.db", show_default=True)
@click.option("--top", default=500, show_default=True, help="How many distinct glosses")
@click.option("--out", default="gloss-review.json", show_default=True)
def glosses_export_cmd(db: str, top: int, out: str) -> None:
    """Export top-N Uzbek glosses for human review (JSON)."""
    import json
    from .review_glosses import export_top

    database = ScraperDatabase(db)
    rows = export_top(database, top)
    database.close()
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(rows, fh, ensure_ascii=False, indent=2)
    click.echo(f"glosses-export: {len(rows)} rows -> {out}")


@main.command("glosses-import")
@click.argument("path")
@click.option("--db", default="quran.db", show_default=True)
def glosses_import_cmd(path: str, db: str) -> None:
    """Import reviewed Uzbek glosses; flips them to mt-reviewed (idempotent)."""
    import json
    from .review_glosses import import_reviewed

    with open(path, encoding="utf-8") as fh:
        entries = json.load(fh)
    database = ScraperDatabase(db)
    n = import_reviewed(database, entries)
    database.close()
    click.echo(f"glosses-import: {n} uz rows reviewed.")
```

- [ ] **Step 5: Run — expect PASS**

Run: `cd packages/scraper && uv run pytest tests/test_review_glosses.py -v`
Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add packages/scraper/scraper/review_glosses.py packages/scraper/scraper/cli.py packages/scraper/tests/test_review_glosses.py
git commit -m "feat(scraper): gloss review export/import round-trip (mt -> mt-reviewed)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: EN-fallback gloss query (packages/data)

**Files:**
- Modify: `packages/data/src/queries/glosses.ts`
- Modify: `packages/data/src/index.ts`
- Test: `packages/data/tests/glosses.test.ts`

**Interfaces:**
- Produces: `type GlossWithLang = { word_id: number; gloss_text: string; gloss_lang: string }`; `getGlossesWithFallback(db, surahId, lang, fallback='en') -> Promise<GlossWithLang[]>`. `gloss_lang` is `lang` when a row exists for it, else `fallback`.

- [ ] **Step 1: Failing test** — append to `tests/glosses.test.ts` (follow the file's existing setup for seeding a surah/word/gloss; add a `source` value on inserts is not required — column defaults NULL):

```ts
import { getGlossesWithFallback } from '../src/queries/glosses.js';

it('returns uz gloss where present, EN fallback where missing', async () => {
  // seed: word 1 has en+uz, word 2 has en only (reuse this file's seed helpers)
  //   INSERT word_glosses (word 1,'en','from'),(1,'uz','dan'),(2,'en','Allah')
  const rows = await getGlossesWithFallback(db, /*surahId*/ 1, 'uz');
  const byWord = Object.fromEntries(rows.map((r) => [r.word_id, r]));
  expect(byWord[1]).toMatchObject({ gloss_text: 'dan', gloss_lang: 'uz' });
  expect(byWord[2]).toMatchObject({ gloss_text: 'Allah', gloss_lang: 'en' });
});

it('lang=en yields all gloss_lang=en', async () => {
  const rows = await getGlossesWithFallback(db, 1, 'en');
  expect(rows.every((r) => r.gloss_lang === 'en')).toBe(true);
});
```

- [ ] **Step 2: Run — expect FAIL** (not exported)

Run: `cd packages/data && pnpm test -- glosses`
Expected: FAIL (`getGlossesWithFallback is not a function`).

- [ ] **Step 3: glosses.ts** — add type + query:

```ts
export interface GlossWithLang {
  word_id: number;
  gloss_text: string;
  gloss_lang: string;
}

/** One gloss per word for a surah: the requested lang where a row exists,
 *  else the fallback lang (default 'en'), tagged with which lang was used so
 *  the UI can mark a fallback. When lang === fallback the tag is always that. */
export async function getGlossesWithFallback(
  db: Client,
  surahId: number,
  lang: string,
  fallback = 'en',
): Promise<GlossWithLang[]> {
  const result = await db.execute({
    sql: `SELECT w.id AS word_id,
                 COALESCE(pref.gloss_text, fb.gloss_text) AS gloss_text,
                 CASE WHEN pref.gloss_text IS NOT NULL THEN ? ELSE ? END AS gloss_lang
          FROM words w
          JOIN ayahs a ON a.id = w.ayah_id
          LEFT JOIN word_glosses pref ON pref.word_id = w.id AND pref.language_code = ?
          LEFT JOIN word_glosses fb   ON fb.word_id   = w.id AND fb.language_code = ?
          WHERE a.surah_id = ?
            AND COALESCE(pref.gloss_text, fb.gloss_text) IS NOT NULL`,
    args: [lang, fallback, lang, fallback, surahId],
  });
  return result.rows.map((r) => ({
    word_id: r['word_id'] as number,
    gloss_text: r['gloss_text'] as string,
    gloss_lang: r['gloss_lang'] as string,
  }));
}
```

- [ ] **Step 4: index.ts** — in the `./queries/glosses.js` export block add `getGlossesWithFallback,` and `export type { GlossWithLang } from './queries/glosses.js';` (match existing type-export style in the file).

- [ ] **Step 5: Run — expect PASS**

Run: `cd packages/data && pnpm test -- glosses`
Expected: PASS.

- [ ] **Step 6: Build + commit** (web resolves `dist/`):

```bash
cd packages/data && pnpm build && cd ../..
git add packages/data/src/queries/glosses.ts packages/data/src/index.ts packages/data/tests/glosses.test.ts
git commit -m "feat(data): getGlossesWithFallback — per-word gloss with EN fallback + lang tag

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Web wiring — lang + (en) hint

**Files:**
- Modify: `apps/web/src/app/surah/[id]/page.tsx`
- Modify: `apps/web/src/app/surah/[id]/words/page.tsx`
- Modify: `apps/web/src/components/reader/ReaderView.tsx`
- Modify: `apps/web/src/components/reader/WordPopover.tsx`
- Modify: `apps/web/src/components/wbw/types.ts`, `wbw/WbwWordCell.tsx`
- Test: `apps/web/src/test/WordPopover.test.tsx`, `apps/web/src/test/WbwWordCell.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `getGlossesWithFallback`, `GlossWithLang` (Task 5).
- Produces: gloss maps keyed word_id → `{ text, lang }`; `WordPopover` + `WbwWordCell` render a muted `(en)` when the gloss lang ≠ the page lang.

- [ ] **Step 1: Failing component test** — `WordPopover.test.tsx`, add:

```tsx
it('shows (en) hint when gloss language differs from page lang', () => {
  render(
    <WordPopover word={sampleWord} gloss="Allah" glossLang="en" pageLang="uz"
      onClose={() => {}} />,
  );
  expect(screen.getByText(/\(en\)/i)).toBeInTheDocument();
});

it('no hint when gloss lang matches page lang', () => {
  render(
    <WordPopover word={sampleWord} gloss="dan" glossLang="uz" pageLang="uz"
      onClose={() => {}} />,
  );
  expect(screen.queryByText(/\(en\)/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run — expect FAIL** (props don't exist)

Run: `cd apps/web && pnpm test -- WordPopover`
Expected: FAIL (hint not rendered / TS error on new props).

- [ ] **Step 3: WordPopover.tsx** — add optional props + render hint. Extend the interface:

```tsx
interface WordPopoverProps {
  word: Word | null;
  gloss?: string;
  glossLang?: string;
  pageLang?: string;
  href?: string;
  onClose: () => void;
}
```

In the signature add `glossLang, pageLang,` and where the gloss is passed to `MorphologySummary`, render the hint beside it:

```tsx
{gloss && glossLang && pageLang && glossLang !== pageLang && (
  <span className="ml-1 text-xs text-paper-400" aria-label={`in ${glossLang}`}>
    ({glossLang})
  </span>
)}
```

- [ ] **Step 4: ReaderView.tsx** — change the prop type and thread lang through:

```tsx
  glossesByWordId: Record<number, { text: string; lang: string }>;
```

Use the page `lang` (rename `_lang` → `lang`), and where `WordPopover` is rendered pass the selected word's gloss entry:

```tsx
gloss={selectedWord ? glossesByWordId[selectedWord.id]?.text : undefined}
glossLang={selectedWord ? glossesByWordId[selectedWord.id]?.lang : undefined}
pageLang={lang}
```

- [ ] **Step 5: surah/[id]/page.tsx** — swap the query + map:

```tsx
import { getGlossesWithFallback } from '@quran-corpus/data';
// ...in Promise.all replace getGlossesBySurahAndLang(...) with:
getGlossesWithFallback(db, surahId, lang),
// ...build the map:
const glossesByWordId: Record<number, { text: string; lang: string }> = {};
for (const g of glosses) glossesByWordId[g.word_id] = { text: g.gloss_text, lang: g.gloss_lang };
```

- [ ] **Step 6: words/page.tsx** — add lang from searchParams + fallback query + WbwCell lang. Update `searchParams` type to `{ page?: string; ayah?: string; lang?: string }`, resolve `lang` with the same `VALID_LANG_CODES`/`isValidLang` guard as the reader (import from `components/reader/languages`), replace the `getGlossesBySurahAndLang(db, surahId, 'en')` call with `getGlossesWithFallback(db, surahId, lang)`, and set `cell.glossLang`:

```tsx
const glossByWordId = new Map<number, { text: string; lang: string }>();
for (const g of glosses) glossByWordId.set(g.word_id, { text: g.gloss_text, lang: g.gloss_lang });
// where the cell is built:
gloss: glossByWordId.get(w.id)?.text ?? null,
glossLang: glossByWordId.get(w.id)?.lang ?? null,
```

- [ ] **Step 7: wbw/types.ts** — add `glossLang: string | null;` to `WbwCell`.

- [ ] **Step 8: WbwWordCell.test.tsx + WbwWordCell.tsx** — RED test then render hint. Test:

```tsx
it('marks an EN-fallback gloss while viewing uz', () => {
  render(<WbwWordCell cell={{ surahId:1, ayahNumber:1, position:1, arabic:'x',
    translit:null, gloss:'Allah', glossLang:'en', posLabel:null }} pageLang="uz" />);
  expect(screen.getByText(/\(en\)/i)).toBeInTheDocument();
});
```

Then give `WbwWordCell` a `pageLang` prop and render `({cell.glossLang})` (muted) when `cell.glossLang && cell.glossLang !== pageLang`. Thread `pageLang` down from `WbwView` (add the prop through its chain; pass the page `lang`).

- [ ] **Step 9: Run all touched suites — expect PASS**

Run: `cd apps/web && pnpm test -- WordPopover WbwWordCell ReaderView`
Expected: PASS. Then `pnpm type-check` clean.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/app/surah apps/web/src/components/reader/ReaderView.tsx apps/web/src/components/reader/WordPopover.tsx apps/web/src/components/wbw
git commit -m "feat(web): Uzbek glosses with EN fallback + (en) hint; WbW honors ?lang

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Credits entry

**Files:**
- Modify: `apps/web/src/app/about/page.tsx`
- Test: `apps/web/src/test/AboutPage.test.tsx` (create if absent)

**Interfaces:**
- Consumes: nothing. Produces: a Credits row disclosing machine-assisted Uzbek glosses.

- [ ] **Step 1: Failing test** — `AboutPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import AboutPage from '../app/about/page';

it('credits machine-assisted Uzbek glosses (NLLB)', () => {
  render(<AboutPage />);
  expect(screen.getByText(/NLLB/i)).toBeInTheDocument();
  expect(screen.getByText(/machine-assisted/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/web && pnpm test -- AboutPage`
Expected: FAIL (no NLLB text).

- [ ] **Step 3: about/page.tsx** — add to the `sources` array:

```tsx
  {
    name: 'NLLB-200 (Meta AI)',
    href: 'https://huggingface.co/facebook/nllb-200-distilled-600M',
    provides: 'Uzbek word-by-word glosses, machine-translated from the English glosses.',
    license: 'CC-BY-NC 4.0 (model)',
    note: 'Uzbek per-word glosses are machine-assisted (NLLB-200), generated from the corpus English glosses and partially human-reviewed. Marked (en) where an Uzbek gloss is not yet available.',
  },
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd apps/web && pnpm test -- AboutPage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/about/page.tsx apps/web/src/test/AboutPage.test.tsx
git commit -m "docs(web): credit machine-assisted Uzbek glosses (NLLB-200)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Operational run (after Task 7, NOT a code task — human-run, one-time)

The tasks above ship tested code with `FakeMt`. Populating the canonical DB is an operational step; do it once creds-free NLLB is installed. **Back up first; no concurrent scraper.**

```bash
cp /home/claude/quran-data/quran.db /home/claude/quran-data/quran.db.bak-2026-07-07-uzglosses
cd packages/scraper && uv sync --extra mt                       # torch + transformers (+ ~2.4GB model on first run)
uv run scraper translate-glosses --db /home/claude/quran-data/quran.db   # slow, CPU-only, resumable
uv run scraper glosses-export --db /home/claude/quran-data/quran.db --top 500 --out gloss-review.json
#   ... human edits gloss-review.json (uz fields) ...
uv run scraper glosses-import gloss-review.json --db /home/claude/quran-data/quran.db
```

Verify: `SELECT source, COUNT(*) FROM word_glosses WHERE language_code='uz' GROUP BY source;`
Expect `mt` + `mt-reviewed` rows. uz coverage is **slightly below** EN coverage by design — words whose EN gloss returned empty MT have no uz row and fall back to EN (many are the top function words the review pass hand-fills). After review, `from`/`except`/`of` etc. should exist as `mt-reviewed`. Spot-check a few reviewed glosses read sane; confirm no *blank* uz gloss anywhere. `gloss-review.json` is scratch — do NOT commit.

## Self-Review notes

- Spec coverage: schema+provenance (T1), MtProvider/NllbMt (T2), dedup+fan-out MT (T3), review round-trip (T4), EN-fallback query (T5), web lang+hint (T6), Credits (T7), canonical run (Operational). All spec sections mapped.
- `source` values consistent (`corpus`/`mt`/`mt-reviewed`) across T1/T3/T4.
- Type consistency: `GlossWithLang{word_id,gloss_text,gloss_lang}` (T5) → web maps to `{text,lang}` (T6); `WbwCell.glossLang` (T6/T7 wbw).
- `db._conn` used in tests/tools mirrors existing scraper code (`fix_root_data`, `test_db`) — same convention, not new leakage.
- Risk: NLLB real-model run is slow/unattended + heavy deps → isolated to the optional `mt` extra + Operational step, off the code path; all logic tested via `FakeMt`.
- Spike-driven guards (T3): `_normalize_for_mt` strips corpus `()`/`[]` before MT; empty MT output skipped (word keeps EN fallback). Both unit+integration tested (`test_normalize_strips_corpus_notation`, `test_empty_mt_output_is_skipped`). Head (worst MT) hand-fixed via the T4 review round-trip; no head/tail code split needed.
```
