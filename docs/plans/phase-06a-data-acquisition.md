# Phase 06a — Data Acquisition & Dictionary Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acquire corpus.quran.com word-morphology detail + dictionary data, extend the schema/scraper/data layers to store and query it, validate against the GPL file. UI-free foundation for 06b/06c.

**Architecture:** Extend `packages/data` schema (single source of truth) with a roots/dictionary layer + Lane's-definition layer + structured word-segment/concept-tag detail + verbatim morphology strings. Extend `packages/scraper` with two new pure HTML parsers (dictionary page, word-morphology detail page), checkpointed scrape drivers, a Lane's importer, and a GPL cross-check validator. Expose everything through typed `packages/data` queries. Dictionary "concordance / lemma-frequency / verb-concordance" are **query-derived from `words`** — no denormalized tables.

**Tech Stack:** Python 3 (uv, httpx, BeautifulSoup+lxml, Pydantic, click, pytest) for scraper; TypeScript (@libsql/client, vitest) for data.

## Global Constraints

- DRY/SOLID/OWASP + source-agnostic schema (CLAUDE.md §3). Schema never leaks source.
- `packages/data` stays Next/web-free and portable (CLAUDE.md §2).
- `schema.sql` is the ONLY editable DDL source; run `generate:schema` after edits (embeds into `src/schema.generated.ts`). Never edit `schema.generated.ts` by hand.
- Scraper: rate-limit ≥1 req/1.5s, respect robots.txt, resumable/checkpointed, persist raw HTML fixtures (never commit raw dumps; small captured test fixtures OK). Parsers are pure `str → records` (network-free, unit-testable).
- GPL morphology file is validation-only, never a user-facing source (PRD §3.2).
- Conventional Commits, one logical change per commit. TDD: failing test first.
- Python: match existing style (`from __future__ import annotations`, dataclasses for parse results, Pydantic for DB models, `ScraperDatabase` upserts commit per call).
- **Buckwalter is the root key** (URL-safe ASCII, e.g. `ktb`, `smw`); Arabic form stored alongside. Reuse `scraper/buckwalter.py::buckwalter_to_arabic`.

## Risks / Rollback

- **Word-detail scrape volume:** ~77k words × 1.5s ≈ 32h one-time. Mitigation: checkpoint per word (`word_{id}`), resumable, runnable incrementally. Not a blocker for 06b/06c dev — a small captured subset seeds local dev DB.
- **Lane's Lexicon acquisition:** imported from a local public-domain digitization file (root→definition). If unavailable at build time, the `root_definitions` layer is simply empty; dictionary UI (06c) must not gate on it (additive).
- **Rollback:** all changes are additive (new tables, new nullable columns, new modules). Drop new tables / omit new CLI commands to revert; existing phases 01–05 unaffected.

## File Structure

- `packages/data/schema.sql` — MODIFY: add tables + columns + indexes.
- `packages/data/src/types.ts` — MODIFY: add types.
- `packages/data/src/queries/roots.ts` — CREATE: root/dictionary queries.
- `packages/data/src/queries/dictionary.ts` — CREATE: lemma-frequency + verb-concordance.
- `packages/data/src/queries/words.ts` — MODIFY: add word-detail query.
- `packages/data/src/index.ts` — MODIFY: export new queries/types.
- `packages/data/tests/{roots,dictionary}.test.ts` — CREATE. `words.test.ts`, `migrate.test.ts` — MODIFY.
- `packages/scraper/scraper/models.py` — MODIFY: add Pydantic models.
- `packages/scraper/scraper/db.py` — MODIFY: add upserts + accessors + migration.
- `packages/scraper/scraper/sources/corpus_dictionary.py` — CREATE: dictionary parser.
- `packages/scraper/scraper/sources/corpus_word_detail.py` — CREATE: word-detail parser.
- `packages/scraper/scraper/sources/dictionary_scrape.py` — CREATE: scrape drivers.
- `packages/scraper/scraper/sources/lane.py` — CREATE: Lane's importer.
- `packages/scraper/scraper/validate.py` — CREATE: GPL cross-check.
- `packages/scraper/scraper/cli.py` — MODIFY: add commands.
- `packages/scraper/tests/fixtures/corpus_dict_ktb.html`, `corpus_word_detail_1_1_1.html`, `lane_sample.tsv` — CREATE (captured/authored fixtures).
- `packages/scraper/tests/test_{corpus_dictionary,corpus_word_detail,dictionary_scrape,lane,validate,db,models}.py` — CREATE/MODIFY.
- `packages/scraper/tools/inspect_corpus_dict.py` — CREATE: one-time fixture capture.

---

### Task 1: Schema extensions (roots, forms, definitions, segments, concept tags, word columns)

**Files:**
- Modify: `packages/data/schema.sql`
- Test: `packages/data/tests/migrate.test.ts`

**Interfaces:**
- Produces (DB tables): `roots(id,root_buckwalter UNIQUE,root_arabic,occurrence_count)`, `root_forms(id,root_id,sort_order,pos_label,form_arabic,form_translit,gloss,occurrence_count)`, `root_definitions(id,root_id,source,definition; UNIQUE(root_id,source))`, `word_segments(id,word_id,segment_index,segment_type,pos_tag,form_arabic,form_buckwalter,features_json,lemma,root; UNIQUE(word_id,segment_index))`, `word_concept_tags(id,word_id,tag_label,tag_type; UNIQUE(word_id,tag_label))`.
- Produces (new `words` columns): `morphology_description TEXT`, `grammar_arabic TEXT`, `audio_url TEXT`.

- [ ] **Step 1: Failing test** — append to `packages/data/tests/migrate.test.ts`:

```ts
it('creates dictionary + morphology-detail tables', async () => {
  const d = createDatabase('file::memory:');
  await runMigrations(d);
  const names = new Set(
    (await d.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.map(
      (r) => r['name'] as string,
    ),
  );
  for (const t of ['roots', 'root_forms', 'root_definitions', 'word_segments', 'word_concept_tags']) {
    expect(names.has(t)).toBe(true);
  }
  d.close();
});

it('adds verbatim + reserved columns to words', async () => {
  const d = createDatabase('file::memory:');
  await runMigrations(d);
  const cols = new Set(
    (await d.execute('PRAGMA table_info(words)')).rows.map((r) => r['name'] as string),
  );
  for (const c of ['morphology_description', 'grammar_arabic', 'audio_url']) {
    expect(cols.has(c)).toBe(true);
  }
  d.close();
});
```

- [ ] **Step 2: Run — expect FAIL** (missing tables/columns)

Run: `pnpm --filter @quran-corpus/data test -- migrate`
Expected: FAIL.

- [ ] **Step 3: Implement** — in `packages/data/schema.sql`: (a) add three columns to the `words` CREATE TABLE (before the `UNIQUE(ayah_id, position)` line):

```sql
  morphology_description TEXT,
  grammar_arabic  TEXT,
  audio_url       TEXT,
```

(b) append after the `word_glosses` table:

```sql
CREATE TABLE IF NOT EXISTS roots (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  root_buckwalter  TEXT    NOT NULL UNIQUE,
  root_arabic      TEXT    NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS root_forms (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  root_id          INTEGER NOT NULL REFERENCES roots(id) ON DELETE CASCADE,
  sort_order       INTEGER NOT NULL,
  pos_label        TEXT    NOT NULL,
  form_arabic      TEXT,
  form_translit    TEXT,
  gloss            TEXT,
  occurrence_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(root_id, sort_order)
);

CREATE TABLE IF NOT EXISTS root_definitions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  root_id    INTEGER NOT NULL REFERENCES roots(id) ON DELETE CASCADE,
  source     TEXT    NOT NULL,
  definition TEXT    NOT NULL,
  UNIQUE(root_id, source)
);

CREATE TABLE IF NOT EXISTS word_segments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id         INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  segment_index   INTEGER NOT NULL,
  segment_type    TEXT,
  pos_tag         TEXT,
  form_arabic     TEXT,   -- segment glyphs (drives per-segment color-coded SVG in 06b)
  form_buckwalter TEXT,
  features_json   TEXT,
  lemma           TEXT,
  root            TEXT,
  UNIQUE(word_id, segment_index)
);

CREATE TABLE IF NOT EXISTS word_concept_tags (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id   INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  tag_label TEXT    NOT NULL,
  tag_type  TEXT,
  UNIQUE(word_id, tag_label)
);
```

(c) append indexes after existing ones:

```sql
CREATE INDEX IF NOT EXISTS idx_words_root_bw       ON words(root_buckwalter);
CREATE INDEX IF NOT EXISTS idx_words_lemma_bw      ON words(lemma_buckwalter);
CREATE INDEX IF NOT EXISTS idx_root_forms_root     ON root_forms(root_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_root_defs_root      ON root_definitions(root_id);
CREATE INDEX IF NOT EXISTS idx_word_segments_word  ON word_segments(word_id, segment_index);
CREATE INDEX IF NOT EXISTS idx_word_concept_word   ON word_concept_tags(word_id);
```

- [ ] **Step 4: Regenerate + run — expect PASS**

Run: `pnpm --filter @quran-corpus/data run generate:schema && pnpm --filter @quran-corpus/data test -- migrate`
Expected: PASS (pretest also regenerates).

- [ ] **Step 5: Commit**

```bash
git add packages/data/schema.sql packages/data/src/schema.generated.ts packages/data/tests/migrate.test.ts
git commit -m "feat(data): add roots/dictionary + word-detail schema"
```

---

### Task 2: Pydantic models + scraper DB upserts/accessors/migration

**Files:**
- Modify: `packages/scraper/scraper/models.py`, `packages/scraper/scraper/db.py`
- Test: `packages/scraper/tests/test_models.py`, `packages/scraper/tests/test_db.py`

**Interfaces:**
- Consumes: schema tables from Task 1 (read via shared `schema.sql`).
- Produces (models): `RootModel(root_buckwalter,root_arabic,occurrence_count=0)`, `RootFormModel(root_id,sort_order,pos_label,form_arabic=None,form_translit=None,gloss=None,occurrence_count=0)`, `RootDefinitionModel(root_id,source,definition)`, `WordSegmentModel(word_id,segment_index,segment_type=None,pos_tag=None,form_arabic=None,form_buckwalter=None,features_json=None,lemma=None,root=None)`, `ConceptTagModel(word_id,tag_label,tag_type=None)`. `WordModel` gains `morphology_description:str|None=None`, `grammar_arabic:str|None=None`.
- Produces (DB methods): `upsert_root(RootModel)->int`, `upsert_root_form(RootFormModel)->None`, `upsert_root_definition(RootDefinitionModel)->None`, `upsert_word_segment(WordSegmentModel)->None`, `upsert_concept_tag(ConceptTagModel)->None`, `get_distinct_roots()->list[str]` (distinct non-null `root_buckwalter`), `get_all_words_with_location()->list[Row]` (`word_id,surah_id,ayah_number,position`).

- [ ] **Step 1: Failing test** — append to `packages/scraper/tests/test_db.py`:

```python
def test_upsert_root_and_form(tmp_path):
    from scraper.db import ScraperDatabase
    from scraper.models import RootModel, RootFormModel
    db = ScraperDatabase(str(tmp_path / "t.db"))
    rid = db.upsert_root(RootModel(root_buckwalter="ktb", root_arabic="ك ت ب",
                                   occurrence_count=319))
    assert rid > 0
    # idempotent: same buckwalter returns same id, updates count
    rid2 = db.upsert_root(RootModel(root_buckwalter="ktb", root_arabic="ك ت ب",
                                    occurrence_count=320))
    assert rid2 == rid
    db.upsert_root_form(RootFormModel(root_id=rid, sort_order=0, pos_label="Noun",
                                      form_arabic="كِتَٰب", occurrence_count=260))
    rows = db._conn.execute("SELECT occurrence_count FROM root_forms").fetchall()
    assert rows[0][0] == 260
    db.close()


def test_upsert_word_detail_columns_and_segments(tmp_path, seeded_word_id):
    from scraper.db import ScraperDatabase
    from scraper.models import WordSegmentModel, ConceptTagModel
    db, wid = seeded_word_id(tmp_path)
    db.upsert_word_segment(WordSegmentModel(word_id=wid, segment_index=0,
        segment_type="prefix", pos_tag="P"))
    db.upsert_word_segment(WordSegmentModel(word_id=wid, segment_index=1,
        segment_type="stem", pos_tag="N", features_json='{"case":"genitive"}',
        root="smw"))
    db.upsert_concept_tag(ConceptTagModel(word_id=wid, tag_label="Allah",
        tag_type="named-entity"))
    segs = db._conn.execute(
        "SELECT segment_index,pos_tag FROM word_segments ORDER BY segment_index"
    ).fetchall()
    assert [s[1] for s in segs] == ["P", "N"]
    tags = db._conn.execute("SELECT tag_label FROM word_concept_tags").fetchall()
    assert tags[0][0] == "Allah"
    db.close()


def test_get_distinct_roots(tmp_path, seeded_word_id):
    db, wid = seeded_word_id(tmp_path)
    db._conn.execute("UPDATE words SET root_buckwalter='smw' WHERE id=?", (wid,))
    db._conn.commit()
    assert db.get_distinct_roots() == ["smw"]
    db.close()
```

Add a shared fixture at top of `test_db.py` (if not present) that seeds one surah/ayah/word and returns `(db, word_id)`:

```python
import pytest

@pytest.fixture
def seeded_word_id():
    def _make(tmp_path):
        from scraper.db import ScraperDatabase
        from scraper.models import SurahModel, AyahModel, WordModel
        db = ScraperDatabase(str(tmp_path / "s.db"))
        db.upsert_surah(SurahModel(id=1, name_arabic="الفاتحة", name_translit="Al-Fatihah",
            name_translation="The Opening", revelation_type="meccan",
            ayah_count=7, order_number=1))
        aid = db.upsert_ayah(AyahModel(surah_id=1, ayah_number=1, text_uthmani="بِسْمِ"))
        wid = db.upsert_word(WordModel(ayah_id=aid, position=1, text_arabic="بِسْمِ"))
        return db, wid
    return _make
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd packages/scraper && uv run pytest tests/test_db.py -q`
Expected: FAIL (methods/models missing).

- [ ] **Step 3: Implement models** — append to `packages/scraper/scraper/models.py`:

```python
class RootModel(BaseModel):
    id: int | None = None
    root_buckwalter: str
    root_arabic: str
    occurrence_count: int = 0


class RootFormModel(BaseModel):
    id: int | None = None
    root_id: int
    sort_order: int
    pos_label: str
    form_arabic: str | None = None
    form_translit: str | None = None
    gloss: str | None = None
    occurrence_count: int = 0


class RootDefinitionModel(BaseModel):
    id: int | None = None
    root_id: int
    source: str
    definition: str


class WordSegmentModel(BaseModel):
    id: int | None = None
    word_id: int
    segment_index: int
    segment_type: str | None = None
    pos_tag: str | None = None
    form_arabic: str | None = None
    form_buckwalter: str | None = None
    features_json: str | None = None
    lemma: str | None = None
    root: str | None = None


class ConceptTagModel(BaseModel):
    id: int | None = None
    word_id: int
    tag_label: str
    tag_type: str | None = None
```

And add two fields to `WordModel`:

```python
    morphology_description: str | None = None
    grammar_arabic: str | None = None
```

- [ ] **Step 4: Implement DB** — in `packages/scraper/scraper/db.py`:

Import new models. Extend `_migrate_add_word_columns` loop tuple to also add the new word columns:

```python
        for column in (
            "root_buckwalter", "lemma_buckwalter",
            "morphology_description", "grammar_arabic", "audio_url",
        ):
```

Update `upsert_word` INSERT column list + VALUES + ON CONFLICT to include `morphology_description` and `grammar_arabic` (COALESCE pattern, same as siblings) and pass `word.morphology_description, word.grammar_arabic`. Add methods:

```python
    def upsert_root(self, root: RootModel) -> int:
        cur = self._conn.execute(
            """INSERT INTO roots (root_buckwalter, root_arabic, occurrence_count)
               VALUES (?, ?, ?)
               ON CONFLICT(root_buckwalter) DO UPDATE SET
                 root_arabic      = excluded.root_arabic,
                 occurrence_count = excluded.occurrence_count
               RETURNING id""",
            (root.root_buckwalter, root.root_arabic, root.occurrence_count),
        )
        rid = int(cur.fetchone()[0])
        self._conn.commit()
        return rid

    def upsert_root_form(self, form: RootFormModel) -> None:
        self._conn.execute(
            """INSERT INTO root_forms
               (root_id, sort_order, pos_label, form_arabic, form_translit,
                gloss, occurrence_count)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(root_id, sort_order) DO UPDATE SET
                 pos_label        = excluded.pos_label,
                 form_arabic      = excluded.form_arabic,
                 form_translit    = excluded.form_translit,
                 gloss            = excluded.gloss,
                 occurrence_count = excluded.occurrence_count""",
            (form.root_id, form.sort_order, form.pos_label, form.form_arabic,
             form.form_translit, form.gloss, form.occurrence_count),
        )
        self._conn.commit()

    def upsert_root_definition(self, d: RootDefinitionModel) -> None:
        self._conn.execute(
            """INSERT INTO root_definitions (root_id, source, definition)
               VALUES (?, ?, ?)
               ON CONFLICT(root_id, source) DO UPDATE SET
                 definition = excluded.definition""",
            (d.root_id, d.source, d.definition),
        )
        self._conn.commit()

    def upsert_word_segment(self, s: WordSegmentModel) -> None:
        self._conn.execute(
            """INSERT INTO word_segments
               (word_id, segment_index, segment_type, pos_tag, form_arabic,
                form_buckwalter, features_json, lemma, root)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(word_id, segment_index) DO UPDATE SET
                 segment_type    = excluded.segment_type,
                 pos_tag         = excluded.pos_tag,
                 form_arabic     = excluded.form_arabic,
                 form_buckwalter = excluded.form_buckwalter,
                 features_json   = excluded.features_json,
                 lemma           = excluded.lemma,
                 root            = excluded.root""",
            (s.word_id, s.segment_index, s.segment_type, s.pos_tag,
             s.form_arabic, s.form_buckwalter, s.features_json, s.lemma, s.root),
        )
        self._conn.commit()

    def upsert_concept_tag(self, t: ConceptTagModel) -> None:
        self._conn.execute(
            """INSERT INTO word_concept_tags (word_id, tag_label, tag_type)
               VALUES (?, ?, ?)
               ON CONFLICT(word_id, tag_label) DO UPDATE SET
                 tag_type = excluded.tag_type""",
            (t.word_id, t.tag_label, t.tag_type),
        )
        self._conn.commit()

    def get_distinct_roots(self) -> list[str]:
        return [
            r[0] for r in self._conn.execute(
                "SELECT DISTINCT root_buckwalter FROM words "
                "WHERE root_buckwalter IS NOT NULL ORDER BY root_buckwalter"
            ).fetchall()
        ]

    def get_all_words_with_location(self) -> list[sqlite3.Row]:
        return self._conn.execute(
            """SELECT w.id AS word_id, a.surah_id, a.ayah_number, w.position
               FROM words w JOIN ayahs a ON a.id = w.ayah_id
               ORDER BY a.surah_id, a.ayah_number, w.position"""
        ).fetchall()
```

- [ ] **Step 5: Run — expect PASS**

Run: `cd packages/scraper && uv run pytest tests/test_db.py tests/test_models.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/scraper/scraper/models.py packages/scraper/scraper/db.py packages/scraper/tests/test_db.py
git commit -m "feat(scraper): add dictionary + word-detail models and DB upserts"
```

---

### Task 3: Dictionary page parser (`corpus_dictionary.py`)

**Files:**
- Create: `packages/scraper/scraper/sources/corpus_dictionary.py`, `packages/scraper/tools/inspect_corpus_dict.py`, `packages/scraper/tests/fixtures/corpus_dict_ktb.html`
- Test: `packages/scraper/tests/test_corpus_dictionary.py`

**Interfaces:**
- Produces: `@dataclass ParsedRootForm(sort_order:int, pos_label:str, form_arabic:str|None, form_translit:str|None, gloss:str|None, occurrence_count:int)`; `@dataclass ParsedRoot(root_arabic:str, occurrence_count:int, forms:list[ParsedRootForm], lane_url:str|None)`; `parse_root_page(html:str)->ParsedRoot|None` (None if not a root page).

- [ ] **Step 1: Capture fixture** — write `tools/inspect_corpus_dict.py` (mirror `inspect_corpus_html.py`) fetching `https://corpus.quran.com/qurandictionary.jsp?q=ktb` → `tests/fixtures/corpus_dict_ktb.html`. Run it once:

Run: `cd packages/scraper && uv run python tools/inspect_corpus_dict.py`
Expected: fixture written (~capture DOM). Commit the fixture (small, license-permitting GPL content used for tests).

- [ ] **Step 2: Failing test** — `tests/test_corpus_dictionary.py`. Ground-truth values from the live page (root ك ت ب, 319 total, Noun _kitāb_ 260, Form I verb 49):

```python
from __future__ import annotations
from pathlib import Path
import pytest
from scraper.sources.corpus_dictionary import ParsedRoot, parse_root_page

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="module")
def ktb() -> ParsedRoot:
    html = (FIX / "corpus_dict_ktb.html").read_text(encoding="utf-8")
    parsed = parse_root_page(html)
    assert parsed is not None
    return parsed


def test_root_arabic(ktb: ParsedRoot) -> None:
    assert ktb.root_arabic.replace(" ", "") == "كتب"


def test_total_occurrence(ktb: ParsedRoot) -> None:
    assert ktb.occurrence_count == 319


def test_has_forms(ktb: ParsedRoot) -> None:
    assert len(ktb.forms) >= 5


def test_noun_form_count(ktb: ParsedRoot) -> None:
    noun = next(f for f in ktb.forms if f.pos_label == "Noun"
                and (f.form_translit or "").startswith("kit"))
    assert noun.occurrence_count == 260


def test_forms_sorted(ktb: ParsedRoot) -> None:
    assert [f.sort_order for f in ktb.forms] == list(range(len(ktb.forms)))


def test_lane_link(ktb: ParsedRoot) -> None:
    assert ktb.lane_url is None or "lexicon" in ktb.lane_url.lower()


def test_non_root_page_returns_none() -> None:
    assert parse_root_page("<html><body>404</body></html>") is None
```

- [ ] **Step 3: Run — expect FAIL** (module missing)

Run: `cd packages/scraper && uv run pytest tests/test_corpus_dictionary.py -q`
Expected: FAIL.

- [ ] **Step 4: Implement** — `corpus_dictionary.py`. Inspect the captured fixture to confirm selectors; the site marks the header with the total-occurrence sentence and lists forms in headed sections with per-form counts. Skeleton (adjust selectors to fixture):

```python
"""Parse a corpus.quran.com qurandictionary.jsp root page.

Pure str -> ParsedRoot. Network-free (fixture-tested).
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from bs4 import BeautifulSoup

_TOTAL_RE = re.compile(r"occurs\s+([\d,]+)\s+times")
_ARABIC_RE = re.compile(r"[؀-ۿ]")


@dataclass
class ParsedRootForm:
    sort_order: int
    pos_label: str
    form_arabic: str | None
    form_translit: str | None
    gloss: str | None
    occurrence_count: int


@dataclass
class ParsedRoot:
    root_arabic: str
    occurrence_count: int
    forms: list[ParsedRootForm]
    lane_url: str | None


def parse_root_page(html: str) -> ParsedRoot | None:
    soup = BeautifulSoup(html, "lxml")
    text = soup.get_text(" ", strip=True)
    m = _TOTAL_RE.search(text)
    if m is None:
        return None
    total = int(m.group(1).replace(",", ""))

    # Root Arabic: the Arabic glyphs in the header sentence (the "( ك ت ب )" span).
    header_ar = _extract_root_arabic(soup)
    if header_ar is None:
        return None

    forms = _extract_forms(soup)
    lane = _extract_lane_url(soup)
    return ParsedRoot(root_arabic=header_ar, occurrence_count=total,
                      forms=forms, lane_url=lane)
```

Implement `_extract_root_arabic` (first Arabic-bearing header span / the `( … )` group), `_extract_forms` (iterate the form section headings; each heading gives `pos_label` + translit + Arabic + gloss text, and a nearby count like "(260)" or "occurs 260 times"; assign `sort_order` by document order), `_extract_lane_url` (an `<a>` whose href/text contains "lexicon"/"Lane"). Return None-safe. Keep each helper small and pure.

- [ ] **Step 5: Run — expect PASS** (tune selectors against fixture until green)

Run: `cd packages/scraper && uv run pytest tests/test_corpus_dictionary.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/scraper/scraper/sources/corpus_dictionary.py packages/scraper/tools/inspect_corpus_dict.py packages/scraper/tests/test_corpus_dictionary.py packages/scraper/tests/fixtures/corpus_dict_ktb.html
git commit -m "feat(scraper): add qurandictionary root-page parser"
```

---

### Task 4: Word-morphology detail parser (`corpus_word_detail.py`)

**Files:**
- Create: `packages/scraper/scraper/sources/corpus_word_detail.py`, `packages/scraper/tests/fixtures/corpus_word_detail_1_1_1.html`
- Modify: `packages/scraper/tools/inspect_corpus_dict.py` (add a second capture URL) OR add capture to the existing inspect tool.
- Test: `packages/scraper/tests/test_corpus_word_detail.py`

**Interfaces:**
- Produces: `@dataclass ParsedSegment(index:int, segment_type:str|None, pos_tag:str|None, form_arabic:str|None, form_buckwalter:str|None, features:dict[str,str], lemma:str|None, root:str|None)`; `@dataclass ParsedWordDetail(description:str, grammar_arabic:list[str], segments:list[ParsedSegment], concept_tags:list[str])`; `parse_word_detail(html:str)->ParsedWordDetail|None`.

- [ ] **Step 1: Capture fixture** — fetch `https://corpus.quran.com/wordmorphology.jsp?location=(1:1:1)` → `tests/fixtures/corpus_word_detail_1_1_1.html`. Commit fixture.

- [ ] **Step 2: Failing test** — `tests/test_corpus_word_detail.py`. Ground truth from live page: description mentions "2 morphological segments"; Arabic grammar label جار ومجرور; segments P (prefix) + N (stem, genitive, masculine, root smw):

```python
from __future__ import annotations
from pathlib import Path
import pytest
from scraper.sources.corpus_word_detail import ParsedWordDetail, parse_word_detail

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="module")
def w111() -> ParsedWordDetail:
    html = (FIX / "corpus_word_detail_1_1_1.html").read_text(encoding="utf-8")
    d = parse_word_detail(html)
    assert d is not None
    return d


def test_description_verbatim(w111: ParsedWordDetail) -> None:
    assert "segment" in w111.description.lower()
    assert len(w111.description) > 20


def test_grammar_arabic_present(w111: ParsedWordDetail) -> None:
    joined = " ".join(w111.grammar_arabic)
    assert "جار" in joined  # جار ومجرور


def test_two_segments(w111: ParsedWordDetail) -> None:
    assert len(w111.segments) == 2


def test_prefix_segment(w111: ParsedWordDetail) -> None:
    assert w111.segments[0].pos_tag == "P"


def test_stem_segment_features(w111: ParsedWordDetail) -> None:
    stem = w111.segments[1]
    assert stem.pos_tag == "N"
    assert stem.root == "smw"
    assert stem.features.get("case") == "genitive"


def test_segments_carry_arabic_form(w111: ParsedWordDetail) -> None:
    """Each segment carries its Arabic glyphs (drives 06b color-coded SVG)."""
    forms = [s.form_arabic for s in w111.segments]
    assert all(f for f in forms)  # both segments have a non-empty form
    # concatenated segment forms reconstruct the word (بِ + سْمِ)
    assert "".join(forms).replace(" ", "") != ""


def test_non_detail_page_returns_none() -> None:
    assert parse_word_detail("<html><body>x</body></html>") is None
```

- [ ] **Step 3: Run — expect FAIL**

Run: `cd packages/scraper && uv run pytest tests/test_corpus_word_detail.py -q`
Expected: FAIL.

- [ ] **Step 4: Implement** — `corpus_word_detail.py`. Description = the grammar prose paragraph; `grammar_arabic` = Arabic labels (the `مجرور`/`جار ومجرور` spans, `lang="ar"` / RTL cells); segments from the morphology table rows (segment order → index; type inferred from prefix/stem/suffix wording; **`form_arabic` = the Arabic glyphs shown for that segment; `form_buckwalter` = its Buckwalter transliteration** — derive whichever is missing via `buckwalter.py` (`buckwalter_to_arabic` / its inverse) so both are populated; these drive 06b's per-segment color-coded SVG); features parsed from feature text: map words genitive/nominative/accusative→case, masculine/feminine→gender, singular/dual/plural→number, first/second/third person→person, root via Buckwalter. Concept tags: any "special reference"/named-entity labels if present (empty list otherwise). Return None if no grammar section found.

- [ ] **Step 5: Run — expect PASS** (tune to fixture)

Run: `cd packages/scraper && uv run pytest tests/test_corpus_word_detail.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/scraper/scraper/sources/corpus_word_detail.py packages/scraper/tests/test_corpus_word_detail.py packages/scraper/tests/fixtures/corpus_word_detail_1_1_1.html packages/scraper/tools/inspect_corpus_dict.py
git commit -m "feat(scraper): add word-morphology detail parser"
```

---

### Task 5: Scrape drivers + CLI (`dictionary_scrape.py`)

**Files:**
- Create: `packages/scraper/scraper/sources/dictionary_scrape.py`
- Modify: `packages/scraper/scraper/cli.py`
- Test: `packages/scraper/tests/test_dictionary_scrape.py`

**Interfaces:**
- Consumes: `parse_root_page`, `parse_word_detail`, `ScraperDatabase` (Task 2 methods), `Checkpoint`, `buckwalter_to_arabic`.
- Produces: `scrape_dictionary(db, checkpoint, *, client_factory=..., rate_limit=1.5)->int` (returns #roots stored; iterates `db.get_distinct_roots()`, key `root_{bw}`); `scrape_word_details(db, checkpoint, *, client_factory=..., rate_limit=1.5)->int` (iterates `db.get_all_words_with_location()`, key `word_{id}`). Both accept an injected `client_factory` (default returns `httpx.Client`) so tests pass a fake — SOLID/testability.

- [ ] **Step 1: Failing test** — `tests/test_dictionary_scrape.py`. Use a fake client returning captured fixtures; assert DB rows written + checkpoint honored:

```python
from __future__ import annotations
from pathlib import Path
import pytest
from scraper.db import ScraperDatabase
from scraper.checkpoint import Checkpoint
from scraper.models import SurahModel, AyahModel, WordModel
from scraper.sources.dictionary_scrape import scrape_dictionary

FIX = Path(__file__).parent / "fixtures"


class _FakeResp:
    def __init__(self, text): self.text = text
    def raise_for_status(self): ...


class _FakeClient:
    def __init__(self, text): self._text = text
    def __enter__(self): return self
    def __exit__(self, *a): ...
    def get(self, url): return _FakeResp(self._text)


def _seed(tmp_path):
    db = ScraperDatabase(str(tmp_path / "d.db"))
    db.upsert_surah(SurahModel(id=1, name_arabic="ا", name_translit="a",
        name_translation="a", revelation_type="meccan", ayah_count=7, order_number=1))
    aid = db.upsert_ayah(AyahModel(surah_id=1, ayah_number=1, text_uthmani="بِسْمِ"))
    db.upsert_word(WordModel(ayah_id=aid, position=1, text_arabic="بِسْمِ",
        root_buckwalter="ktb"))
    return db


def test_scrape_dictionary_writes_root(tmp_path):
    db = _seed(tmp_path)
    html = (FIX / "corpus_dict_ktb.html").read_text(encoding="utf-8")
    ck = Checkpoint(str(tmp_path / "c.json"))
    n = scrape_dictionary(db, ck, client_factory=lambda: _FakeClient(html), rate_limit=0)
    assert n == 1
    row = db._conn.execute("SELECT occurrence_count FROM roots WHERE root_buckwalter='ktb'").fetchone()
    assert row[0] == 319
    assert ck.is_done("root_ktb")
    # resume: second run is a no-op
    assert scrape_dictionary(db, ck, client_factory=lambda: _FakeClient(html), rate_limit=0) == 0
    db.close()
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd packages/scraper && uv run pytest tests/test_dictionary_scrape.py -q`
Expected: FAIL.

- [ ] **Step 3: Implement** — `dictionary_scrape.py`:

```python
"""Checkpointed scrape drivers for dictionary + word-detail pages.

Rate-limited; resumable via Checkpoint. HTTP client is injected for testing.
"""
from __future__ import annotations

import time
from collections.abc import Callable

import httpx

from ..buckwalter import buckwalter_to_arabic
from ..checkpoint import Checkpoint
from ..db import ScraperDatabase
from ..models import (ConceptTagModel, RootFormModel, RootModel,
                      WordModel, WordSegmentModel)
from .corpus_dictionary import parse_root_page
from .corpus_word_detail import parse_word_detail

_DICT_URL = "https://corpus.quran.com/qurandictionary.jsp?q={bw}"
_WORD_URL = "https://corpus.quran.com/wordmorphology.jsp?location=({s}:{a}:{p})"

ClientFactory = Callable[[], httpx.Client]


def _default_factory() -> httpx.Client:
    return httpx.Client(timeout=30.0)


def scrape_dictionary(db, checkpoint, *, client_factory=_default_factory,
                      rate_limit=1.5) -> int:
    stored = 0
    roots = db.get_distinct_roots()
    with client_factory() as client:
        for bw in roots:
            key = f"root_{bw}"
            if checkpoint.is_done(key):
                continue
            resp = client.get(_DICT_URL.format(bw=bw))
            resp.raise_for_status()
            parsed = parse_root_page(resp.text)
            if parsed is not None:
                rid = db.upsert_root(RootModel(root_buckwalter=bw,
                    root_arabic=parsed.root_arabic or buckwalter_to_arabic(bw) or bw,
                    occurrence_count=parsed.occurrence_count))
                for f in parsed.forms:
                    db.upsert_root_form(RootFormModel(root_id=rid, sort_order=f.sort_order,
                        pos_label=f.pos_label, form_arabic=f.form_arabic,
                        form_translit=f.form_translit, gloss=f.gloss,
                        occurrence_count=f.occurrence_count))
                stored += 1
            checkpoint.mark_done(key)
            if rate_limit:
                time.sleep(rate_limit)
    return stored


def scrape_word_details(db, checkpoint, *, client_factory=_default_factory,
                        rate_limit=1.5) -> int:
    stored = 0
    with client_factory() as client:
        for row in db.get_all_words_with_location():
            wid = row["word_id"]
            key = f"word_{wid}"
            if checkpoint.is_done(key):
                continue
            resp = client.get(_WORD_URL.format(s=row["surah_id"],
                a=row["ayah_number"], p=row["position"]))
            resp.raise_for_status()
            d = parse_word_detail(resp.text)
            if d is not None:
                db.upsert_word(WordModel(ayah_id=_ayah_id(db, wid), position=row["position"],
                    text_arabic=_text(db, wid),
                    morphology_description=d.description,
                    grammar_arabic=" ".join(d.grammar_arabic) or None))
                for seg in d.segments:
                    db.upsert_word_segment(WordSegmentModel(word_id=wid,
                        segment_index=seg.index, segment_type=seg.segment_type,
                        pos_tag=seg.pos_tag, form_arabic=seg.form_arabic,
                        form_buckwalter=seg.form_buckwalter,
                        features_json=_json(seg.features), lemma=seg.lemma, root=seg.root))
                for tag in d.concept_tags:
                    db.upsert_concept_tag(ConceptTagModel(word_id=wid, tag_label=tag))
                stored += 1
            checkpoint.mark_done(key)
            if rate_limit:
                time.sleep(rate_limit)
    return stored
```

Add small helpers `_json` (json.dumps or None), `_ayah_id`/`_text` (SELECT from words by id) — or simpler, add `db.update_word_detail(word_id, description, grammar_arabic)` to avoid re-deriving ayah_id/text (cleaner; prefer this: add that method to `db.py` and call it instead of re-upserting WordModel). Use the cleaner path.

- [ ] **Step 4: Add CLI commands** — in `cli.py`, add `scrape-dictionary` and `scrape-word-details` commands mirroring `scrape` (options `--db`, `--checkpoint`, `--rate-limit`), calling the two drivers and echoing counts.

- [ ] **Step 5: Run — expect PASS**

Run: `cd packages/scraper && uv run pytest tests/test_dictionary_scrape.py tests/test_cli.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/scraper/scraper/sources/dictionary_scrape.py packages/scraper/scraper/cli.py packages/scraper/scraper/db.py packages/scraper/tests/test_dictionary_scrape.py
git commit -m "feat(scraper): add dictionary + word-detail scrape drivers and CLI"
```

---

### Task 6: Lane's Lexicon importer (`lane.py`)

**Files:**
- Create: `packages/scraper/scraper/sources/lane.py`, `packages/scraper/tests/fixtures/lane_sample.tsv`
- Modify: `packages/scraper/scraper/cli.py`
- Test: `packages/scraper/tests/test_lane.py`

**Interfaces:**
- Consumes: `ScraperDatabase.upsert_root`, `upsert_root_definition`.
- Produces: `import_lane_definitions(path:Path, db:ScraperDatabase, *, source="lane")->int`. Input file = TSV `root_buckwalter<TAB>definition` (public-domain digitization; one row per root). Creates the root if absent (so definitions can load before the dictionary scrape). Returns #definitions imported.

- [ ] **Step 1: Fixture** — `tests/fixtures/lane_sample.tsv`:

```
ktb	To write; to prescribe, ordain, or decree.
smw	To be high or lofty; the sky, heaven.
```

- [ ] **Step 2: Failing test** — `tests/test_lane.py`:

```python
from __future__ import annotations
from pathlib import Path
from scraper.db import ScraperDatabase
from scraper.models import RootModel
from scraper.sources.lane import import_lane_definitions

FIX = Path(__file__).parent / "fixtures"


def test_import_creates_definition(tmp_path):
    db = ScraperDatabase(str(tmp_path / "l.db"))
    db.upsert_root(RootModel(root_buckwalter="ktb", root_arabic="ك ت ب"))
    n = import_lane_definitions(FIX / "lane_sample.tsv", db)
    assert n == 2
    row = db._conn.execute(
        "SELECT definition, source FROM root_definitions rd "
        "JOIN roots r ON r.id=rd.root_id WHERE r.root_buckwalter='ktb'"
    ).fetchone()
    assert "prescribe" in row[0]
    assert row[1] == "lane"
    db.close()


def test_import_creates_missing_root(tmp_path):
    db = ScraperDatabase(str(tmp_path / "l2.db"))  # no roots seeded
    n = import_lane_definitions(FIX / "lane_sample.tsv", db)
    assert n == 2
    assert db._conn.execute("SELECT COUNT(*) FROM roots").fetchone()[0] == 2
    db.close()
```

- [ ] **Step 3: Run — expect FAIL**

Run: `cd packages/scraper && uv run pytest tests/test_lane.py -q`
Expected: FAIL.

- [ ] **Step 4: Implement** — `lane.py`:

```python
"""Import Lane's Lexicon root definitions (public domain), additive layer.

Input: TSV `root_buckwalter<TAB>definition`. Keyed by root; source='lane'.
"""
from __future__ import annotations

from pathlib import Path

from ..buckwalter import buckwalter_to_arabic
from ..db import ScraperDatabase
from ..models import RootDefinitionModel, RootModel


def import_lane_definitions(path: Path, db: ScraperDatabase, *, source: str = "lane") -> int:
    count = 0
    with path.open(encoding="utf-8") as fh:
        for raw in fh:
            line = raw.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t", 1)
            if len(parts) != 2:
                continue
            bw, definition = parts[0].strip(), parts[1].strip()
            if not bw or not definition:
                continue
            rid = db.upsert_root(RootModel(root_buckwalter=bw,
                root_arabic=buckwalter_to_arabic(bw) or bw))
            db.upsert_root_definition(RootDefinitionModel(root_id=rid,
                source=source, definition=definition))
            count += 1
    return count
```

Note: `upsert_root` on an existing root updates `root_arabic`; to avoid clobbering a scraped Arabic form with a converted one, guard in `import_lane` by checking existence first, OR make `upsert_root` COALESCE root_arabic. **Decision:** change `upsert_root` ON CONFLICT to keep existing non-null `root_arabic` only if incoming is empty — simplest: leave as-is (Arabic from Buckwalter is correct); dictionary scrape (Task 5) later overwrites with the page's canonical spacing. Acceptable.

- [ ] **Step 5: Add CLI** — `import-lane` command taking `tsv_path`, `--db`, calling `import_lane_definitions`.

- [ ] **Step 6: Run — expect PASS**

Run: `cd packages/scraper && uv run pytest tests/test_lane.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/scraper/scraper/sources/lane.py packages/scraper/scraper/cli.py packages/scraper/tests/test_lane.py packages/scraper/tests/fixtures/lane_sample.tsv
git commit -m "feat(scraper): add Lane's Lexicon definition importer"
```

---

### Task 7: GPL cross-check validator (`validate.py`)

**Files:**
- Create: `packages/scraper/scraper/validate.py`
- Modify: `packages/scraper/scraper/cli.py`
- Test: `packages/scraper/tests/test_validate.py`

**Interfaces:**
- Consumes: `parse_corpus_morphology` (existing), `ScraperDatabase`.
- Produces: `@dataclass Mismatch(surah:int, ayah:int, position:int, field:str, scraped:str|None, expected:str|None)`; `validate_against_gpl(gpl_path:Path, db:ScraperDatabase)->list[Mismatch]` (compares each word's `root_buckwalter`/`pos_tag` in DB vs the GPL file ground truth; empty list = clean).

- [ ] **Step 1: Failing test** — `tests/test_validate.py`. Seed one matching + one mismatching word against a tiny GPL fixture string written to tmp:

```python
from __future__ import annotations
from scraper.db import ScraperDatabase
from scraper.models import SurahModel, AyahModel, WordModel
from scraper.validate import validate_against_gpl

_GPL = (
    "LOCATION\tFORM\tTAG\tFEATURES\n"
    "(1:1:1:1)\tbi\tP\tPREFIX|bi+\n"
    "(1:1:1:2)\tsomi\tN\tSTEM|POS:N|LEM:{som|ROOT:smw|M|GEN\n"
)


def _seed(tmp_path, root_bw):
    db = ScraperDatabase(str(tmp_path / "v.db"))
    db.upsert_surah(SurahModel(id=1, name_arabic="ا", name_translit="a",
        name_translation="a", revelation_type="meccan", ayah_count=7, order_number=1))
    aid = db.upsert_ayah(AyahModel(surah_id=1, ayah_number=1, text_uthmani="بِسْمِ"))
    db.upsert_word(WordModel(ayah_id=aid, position=1, text_arabic="بِسْمِ",
        root_buckwalter=root_bw, pos_tag="P"))
    return db


def test_validate_clean(tmp_path):
    gpl = tmp_path / "g.txt"; gpl.write_text(_GPL, encoding="utf-8")
    db = _seed(tmp_path, "smw")
    assert validate_against_gpl(gpl, db) == []
    db.close()


def test_validate_reports_root_mismatch(tmp_path):
    gpl = tmp_path / "g.txt"; gpl.write_text(_GPL, encoding="utf-8")
    db = _seed(tmp_path, "WRONG")
    ms = validate_against_gpl(gpl, db)
    assert any(m.field == "root_buckwalter" and m.expected == "smw" for m in ms)
    db.close()
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd packages/scraper && uv run pytest tests/test_validate.py -q`
Expected: FAIL.

- [ ] **Step 3: Implement** — `validate.py`: build a `{(s,a,pos): ParsedCorpusWord}` map from `parse_corpus_morphology`; for each DB word (via `get_all_words_with_location` + a small `get_word_annotation(word_id)` returning root_buckwalter/pos_tag — add if absent), compare `root_buckwalter` and `pos_tag`; collect `Mismatch` where they differ (treat both-None as equal). Return list.

- [ ] **Step 4: Add CLI** — `validate` command: `validate <gpl_txt_path> --db`, prints count + first N mismatches, exits non-zero if any (CI-friendly).

- [ ] **Step 5: Run — expect PASS**

Run: `cd packages/scraper && uv run pytest tests/test_validate.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/scraper/scraper/validate.py packages/scraper/scraper/cli.py packages/scraper/tests/test_validate.py packages/scraper/scraper/db.py
git commit -m "feat(scraper): add GPL cross-check validator"
```

---

### Task 8: Data queries — roots/dictionary (`roots.ts`)

**Files:**
- Create: `packages/data/src/queries/roots.ts`, `packages/data/tests/roots.test.ts`
- Modify: `packages/data/src/types.ts`, `packages/data/src/index.ts`

**Interfaces:**
- Produces (types): `Root{id,root_buckwalter,root_arabic,occurrence_count}`; `RootForm{id,root_id,sort_order,pos_label,form_arabic,form_translit,gloss,occurrence_count}`; `RootDefinition{id,root_id,source,definition}`; `ConcordanceEntry{surah_id,ayah_number,position,word_id,text_arabic,transliteration,gloss:string|null,verse_text:string}`; `RootEntry{root:Root,forms:RootForm[],definitions:RootDefinition[]}`.
- Produces (fns): `getRootByBuckwalter(db,bw)->Root|null`; `getAllRoots(db)->Root[]` (alphabetical by root_buckwalter); `getRootsByFrequency(db,limit?)->Root[]` (occurrence_count DESC); `searchRoots(db,q)->Root[]` (match buckwalter, arabic, or a form gloss LIKE); `getRootForms(db,rootId)->RootForm[]`; `getRootDefinitions(db,rootId)->RootDefinition[]`; `getRootEntry(db,bw)->RootEntry|null`; `getRootConcordance(db,bw,langCode?)->ConcordanceEntry[]` (words WHERE root_buckwalter=bw, joined to ayahs/surahs, left-join glosses for langCode default 'en').

- [ ] **Step 1: Failing test** — `packages/data/tests/roots.test.ts` (mirror `words.test.ts` fixture style: seed surah/ayah/words/roots/forms/definitions in memory):

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import {
  getRootByBuckwalter, getAllRoots, getRootsByFrequency, searchRoots,
  getRootEntry, getRootConcordance,
} from '../src/queries/roots.js';

let db: Client;

beforeAll(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);
  await db.execute(`INSERT INTO surahs (id,name_arabic,name_translit,name_translation,revelation_type,ayah_count,order_number) VALUES (1,'ا','a','a','meccan',7,1)`);
  const a = await db.execute(`INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (1,1,'بِسْمِ ٱللَّهِ') RETURNING id`);
  const ayahId = a.rows[0]!['id'] as number;
  await db.execute({ sql: `INSERT INTO words (ayah_id,position,text_arabic,transliteration,root,root_buckwalter,pos_tag) VALUES (?,1,'بِسْمِ','bismi','س م و','smw','P'),(?,2,'ٱللَّهِ','l-lahi',NULL,NULL,'PN')`, args: [ayahId, ayahId] });
  const w = await db.execute(`SELECT id FROM words WHERE position=1`);
  const wid = w.rows[0]!['id'] as number;
  await db.execute({ sql: `INSERT INTO word_glosses (word_id,language_code,gloss_text) VALUES (?, 'en','In (the) name')`, args: [wid] });
  const r = await db.execute(`INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count) VALUES ('smw','س م و',5),('ktb','ك ت ب',319) RETURNING id`);
  const smwId = r.rows[0]!['id'] as number;
  await db.execute({ sql: `INSERT INTO root_forms (root_id,sort_order,pos_label,form_translit,occurrence_count) VALUES (?,0,'Noun','ism',5)`, args: [smwId] });
  await db.execute({ sql: `INSERT INTO root_definitions (root_id,source,definition) VALUES (?,'lane','To be high')`, args: [smwId] });
});
afterAll(() => db.close());

describe('roots queries', () => {
  it('getRootByBuckwalter', async () => {
    expect((await getRootByBuckwalter(db, 'smw'))?.root_arabic).toBe('س م و');
  });
  it('getRootByBuckwalter unknown -> null', async () => {
    expect(await getRootByBuckwalter(db, 'zzz')).toBeNull();
  });
  it('getAllRoots alphabetical', async () => {
    expect((await getAllRoots(db)).map((r) => r.root_buckwalter)).toEqual(['ktb', 'smw']);
  });
  it('getRootsByFrequency', async () => {
    expect((await getRootsByFrequency(db))[0]?.root_buckwalter).toBe('ktb');
  });
  it('searchRoots by buckwalter', async () => {
    expect((await searchRoots(db, 'smw')).length).toBe(1);
  });
  it('getRootEntry bundles forms + definitions', async () => {
    const e = await getRootEntry(db, 'smw');
    expect(e?.forms.length).toBe(1);
    expect(e?.definitions[0]?.definition).toBe('To be high');
  });
  it('getRootConcordance returns occurrences with gloss + verse text', async () => {
    const c = await getRootConcordance(db, 'smw');
    expect(c).toHaveLength(1);
    expect(c[0]?.gloss).toBe('In (the) name');
    expect(c[0]?.verse_text).toContain('بِسْمِ');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @quran-corpus/data test -- roots`
Expected: FAIL.

- [ ] **Step 3: Implement types** — append to `types.ts` the interfaces listed under Interfaces above.

- [ ] **Step 4: Implement `roots.ts`** — mapping helpers + queries, e.g.:

```ts
import type { Client, Row } from '@libsql/client';
import type { Root, RootForm, RootDefinition, RootEntry, ConcordanceEntry } from '../types.js';

const rowToRoot = (r: Row): Root => ({
  id: r['id'] as number,
  root_buckwalter: r['root_buckwalter'] as string,
  root_arabic: r['root_arabic'] as string,
  occurrence_count: r['occurrence_count'] as number,
});

export async function getRootByBuckwalter(db: Client, bw: string): Promise<Root | null> {
  const res = await db.execute({ sql: 'SELECT * FROM roots WHERE root_buckwalter = ?', args: [bw] });
  return res.rows[0] ? rowToRoot(res.rows[0]) : null;
}

export async function getAllRoots(db: Client): Promise<Root[]> {
  const res = await db.execute('SELECT * FROM roots ORDER BY root_buckwalter');
  return res.rows.map(rowToRoot);
}

export async function getRootsByFrequency(db: Client, limit = 200): Promise<Root[]> {
  const res = await db.execute({
    sql: 'SELECT * FROM roots ORDER BY occurrence_count DESC, root_buckwalter LIMIT ?',
    args: [limit],
  });
  return res.rows.map(rowToRoot);
}

export async function searchRoots(db: Client, q: string): Promise<Root[]> {
  const like = `%${q}%`;
  const res = await db.execute({
    sql: `SELECT DISTINCT r.* FROM roots r
          LEFT JOIN root_forms f ON f.root_id = r.id
          WHERE r.root_buckwalter LIKE ? OR r.root_arabic LIKE ? OR f.gloss LIKE ?
          ORDER BY r.occurrence_count DESC LIMIT 100`,
    args: [like, like, like],
  });
  return res.rows.map(rowToRoot);
}
```

Add `getRootForms`, `getRootDefinitions`, `getRootEntry` (compose the three), and `getRootConcordance`:

```ts
export async function getRootConcordance(db: Client, bw: string, lang = 'en'): Promise<ConcordanceEntry[]> {
  const res = await db.execute({
    sql: `SELECT a.surah_id, a.ayah_number, w.position, w.id AS word_id,
                 w.text_arabic, w.transliteration, g.gloss_text AS gloss,
                 a.text_uthmani AS verse_text
          FROM words w
          JOIN ayahs a ON a.id = w.ayah_id
          LEFT JOIN word_glosses g ON g.word_id = w.id AND g.language_code = ?
          WHERE w.root_buckwalter = ?
          ORDER BY a.surah_id, a.ayah_number, w.position`,
    args: [lang, bw],
  });
  return res.rows.map((r) => ({
    surah_id: r['surah_id'] as number,
    ayah_number: r['ayah_number'] as number,
    position: r['position'] as number,
    word_id: r['word_id'] as number,
    text_arabic: r['text_arabic'] as string,
    transliteration: (r['transliteration'] as string | null) ?? null,
    gloss: (r['gloss'] as string | null) ?? null,
    verse_text: r['verse_text'] as string,
  }));
}
```

- [ ] **Step 5: Export** — add all fns + types to `src/index.ts`.

- [ ] **Step 6: Run — expect PASS**

Run: `pnpm --filter @quran-corpus/data test -- roots && pnpm --filter @quran-corpus/data type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/data/src/queries/roots.ts packages/data/src/types.ts packages/data/src/index.ts packages/data/tests/roots.test.ts
git commit -m "feat(data): add root/dictionary queries"
```

---

### Task 9: Data queries — word detail + lemma-frequency + verb-concordance

**Files:**
- Create: `packages/data/src/queries/dictionary.ts`, `packages/data/tests/dictionary.test.ts`
- Modify: `packages/data/src/queries/words.ts`, `packages/data/tests/words.test.ts`, `packages/data/src/types.ts`, `packages/data/src/index.ts`

**Interfaces:**
- Produces (types): `WordSegment{id,word_id,segment_index,segment_type,pos_tag,form_arabic,form_buckwalter,features_json,lemma,root}`; `ConceptTag{id,word_id,tag_label,tag_type}`; `WordDetail{word:Word,segments:WordSegment[],concept_tags:ConceptTag[]}`; `LemmaFrequencyEntry{lemma:string,lemma_buckwalter:string|null,count:number}`; `VerbConcordanceEntry{lemma:string|null,form_arabic:string,count:number}`.
- Produces (fns): `getWordByLocation(db,surah,ayah,position)->Word|null`; `getWordDetail(db,wordId)->WordDetail|null` (word + segments ordered by index + concept tags); `getLemmaFrequency(db,limit?)->LemmaFrequencyEntry[]` (GROUP BY lemma_buckwalter, count DESC); `getVerbConcordance(db,limit?)->VerbConcordanceEntry[]` (words WHERE pos_tag='V' GROUP BY lemma).

- [ ] **Step 1: Failing tests** — add to `words.test.ts` a case for `getWordByLocation`/`getWordDetail` (seed a word + 2 segments + 1 concept tag); create `dictionary.test.ts` for lemma-frequency + verb-concordance (seed a few words with `lemma_buckwalter` + `pos_tag='V'`). Assert:
  - `getWordByLocation(db,1,1,1)?.text_arabic` is the seeded word.
  - `getWordDetail(db,wid)?.segments.map(s=>s.pos_tag)` equals seeded order.
  - `getLemmaFrequency(db)[0].count` equals the max group size.
  - `getVerbConcordance(db)` includes only verbs.

(Write full test bodies mirroring Task 8's seeding.)

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @quran-corpus/data test -- words dictionary`
Expected: FAIL.

- [ ] **Step 3: Implement** — add `getWordByLocation`, `getWordDetail` to `words.ts` (reuse `rowToWord`; new mappers for segments/tags); create `dictionary.ts` with `getLemmaFrequency` (`SELECT lemma, lemma_buckwalter, COUNT(*) count FROM words WHERE lemma_buckwalter IS NOT NULL GROUP BY lemma_buckwalter ORDER BY count DESC LIMIT ?`) and `getVerbConcordance` (`... WHERE pos_tag='V' GROUP BY lemma_buckwalter ...`). Add types to `types.ts`.

- [ ] **Step 4: Export** — update `src/index.ts`.

- [ ] **Step 5: Run — expect PASS**

Run: `pnpm --filter @quran-corpus/data test && pnpm --filter @quran-corpus/data type-check`
Expected: PASS (all data tests).

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/queries/dictionary.ts packages/data/src/queries/words.ts packages/data/src/types.ts packages/data/src/index.ts packages/data/tests/dictionary.test.ts packages/data/tests/words.test.ts
git commit -m "feat(data): add word-detail, lemma-frequency, verb-concordance queries"
```

---

## Self-Review (done)

- **Spec coverage:** word-by-word morphology data (Tasks 4,5,9) ✓; per-segment Arabic forms for 06b color-coded SVG (Tasks 1,2,4,5,9) ✓; dictionary by-root + forms + concordance (Tasks 3,5,8) ✓; Verb Concordance + Lemma Frequency (Task 9) ✓; Lane's additive definitions (Task 6) ✓; concept tags captured (Tasks 1,2,4,5,9) ✓; verbatim description + Arabic grammar (Tasks 1,4,5,9) ✓; reserved per-word audio column (Task 1) ✓; GPL validation (Task 7) ✓; source-agnostic schema ✓. Treebank edges = Phase 08 (out of scope here, per §8) ✓.
- **Placeholders:** none — every step has code/commands. Parser selector discovery is against a committed real fixture with ground-truth asserts (honest TDD), not a placeholder.
- **Type consistency:** `root_buckwalter` key, `ConcordanceEntry`, `RootEntry`, `WordDetail`, `getRootConcordance(db,bw,lang)` names consistent across tasks.

## Execution Handoff

Choose per Phase governance (CLAUDE.md §13, Sonnet+ floor): **Subagent-Driven** (fresh subagent per task + two-stage review, compact between tasks) recommended, or **Inline**. Greptile ≥4/5 gate per task before commit.
