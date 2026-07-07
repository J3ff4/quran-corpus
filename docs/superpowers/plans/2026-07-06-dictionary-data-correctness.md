# Dictionary Data Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Root pages show correct occurrence counts and no junk "Derived forms" rows.

**Architecture:** Fix the scraper parser that fabricated junk forms (durable root cause). Re-derive `roots.occurrence_count` from `word_segments` and delete the junk `root_forms` rows via a repeatable, idempotent script run against the canonical DB. Add a query-level guard so a null-form row can never render again.

**Tech Stack:** Python 3.12 + BeautifulSoup + pytest (scraper); TypeScript + libSQL + vitest (data); SQLite.

## Global Constraints

- **Canonical DB:** `/home/claude/quran-data/quran.db` (gitignored). `apps/web/quran.db` is a symlink to it — single DB. Back it up (`.bak`) before any data write. No concurrent scraper writers during the fix.
- **occurrence_count source = `word_segments.root`** (NOT `words.root_buckwalter`, NOT the corpus "occurs N times" text). Corpus-verified: root `Amm` (أ م م) occurs 119 per corpus.quran.com and `word_segments` counts 119; `words.root_buckwalter` counts 118 because the compound word يَبْنَؤُمَّ (20:94:2) has primary root `bny` but a real `Amm` segment. All 243 already-scraped roots equal `word_segments` exactly. Blank/NULL segment roots match no root row, so no filter needed.
- **`runMigrations` is schema DDL only** — never a data-fix vehicle. Data fixes are a standalone script.
- **`packages/data` stays web/Next-agnostic** — no Next imports.
- **Deletion criterion is `form_arabic IS NULL`** — verified to hit exactly the 714 See-Also junk rows (Lane's Lexicon / Ontology / Wikipedia external links), none of which have `form_translit`; leaves all 3,945 real forms.
- Greptile must reach 5/5 before merge. Conventional Commits. Commit **named paths only** — never `git add -A`. Never commit `STATUS.md` or `docs/handoff-2026-07-05-scraper-data-fill.md`.
- TDD: write the failing test, watch it fail, minimal code to pass.

---

### Task 1: Parser — stop fabricating junk forms

The corpus root page reuses `<ul class="also">` for the "See Also" box. `_extract_forms` does `soup.find("ul", class_="also")` (first match) and parses every `<li>`. Roots with real derived forms have the forms `ul` first (correct); roots without have only the See-Also `ul`, whose `<li>` (a Lane's Lexicon link, no `<span class="at">`) becomes a fake form with `form_arabic=None`. Fix: scan **all** `ul.also`, skip any `<li>` lacking a `<span class="at">` (only real derived-form entries carry Arabic).

**Files:**
- Modify: `packages/scraper/scraper/sources/corpus_dictionary.py` (`_extract_forms`, lines 72-102)
- Test: `packages/scraper/tests/test_corpus_dictionary.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `_extract_forms(soup)` unchanged signature → `list[ParsedRootForm]`; now excludes non-Arabic `<li>`s.

- [ ] **Step 1: Write the failing test**

Add to `packages/scraper/tests/test_corpus_dictionary.py`:

```python
# A root with NO derived forms: its only <ul class="also"> is the See-Also box.
# Its <li> (a Lane's Lexicon link, no <span class="at">) must NOT become a form.
_SEE_ALSO_ONLY_HTML = (
    '<html><body>The triliteral root hamza bā dāl '
    '(<span class="at">أ ب د</span>) occurs 28 times in the Quran.'
    '<h4>See Also</h4><ul class="also"><li>'
    '<a href="https://lexicon.quranic-research.net/">Lane\'s Lexicon</a>'
    " - Classical Arabic dictionary</li></ul>"
    "</body></html>"
)


def test_see_also_only_page_has_no_forms() -> None:
    parsed = parse_root_page(_SEE_ALSO_ONLY_HTML)
    assert parsed is not None
    assert parsed.occurrence_count == 28
    assert parsed.forms == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/scraper && .venv/bin/pytest tests/test_corpus_dictionary.py::test_see_also_only_page_has_no_forms -v`
Expected: FAIL — `assert parsed.forms == []` fails; `forms` has one junk entry with `form_arabic=None`, `pos_label="Lane's Lexicon - Classical Arabic dictionary"`.

- [ ] **Step 3: Write minimal implementation**

Replace `_extract_forms` (lines 72-102) in `packages/scraper/scraper/sources/corpus_dictionary.py`:

```python
def _extract_forms(soup: BeautifulSoup) -> list[ParsedRootForm]:
    forms: list[ParsedRootForm] = []
    # The page reuses class="also" for both the derived-forms list and the
    # "See Also" box. Real derived-form <li>s carry a <span class="at"> (the
    # form's Arabic); See-Also <li>s (external dictionary links) do not. Scan
    # every ul.also and keep only Arabic-bearing entries — this drops the
    # See-Also junk whether or not a forms list is present.
    for ul in soup.find_all("ul", class_="also"):
        if not isinstance(ul, Tag):
            continue
        for li in ul.find_all("li"):
            arabic_el = li.find("span", class_="at")
            if arabic_el is None:
                continue
            translit_el = li.find("i", class_="ab")
            form_translit = translit_el.get_text(strip=True) if translit_el else None
            form_arabic = arabic_el.get_text(strip=True)
            # Text before the translit tag: "49 times as the form I verb"
            lead = li.get_text(" ", strip=True)
            if form_translit:
                lead = lead.split(form_translit)[0]
            m = _FORM_RE.match(lead)
            if m:
                count = _parse_count(m.group(1))
                pos_label = _cap_first(m.group(2).strip())
            else:
                count, pos_label = 0, lead.strip()
            forms.append(
                ParsedRootForm(
                    sort_order=len(forms),
                    pos_label=pos_label,
                    form_arabic=form_arabic,
                    form_translit=form_translit,
                    gloss=None,
                    occurrence_count=count,
                )
            )
    return forms
```

- [ ] **Step 4: Run tests to verify pass (new + regression)**

Run: `cd packages/scraper && .venv/bin/pytest tests/test_corpus_dictionary.py -v`
Expected: PASS — new test green; `ktb` fixture still yields 7 forms (`test_has_forms`, `test_form_i_verb_count`, `test_forms_sorted`, etc. unchanged). `sort_order` stays `0..n-1` (now `len(forms)` instead of enumerate index — identical result because only kept entries append).

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/scraper/sources/corpus_dictionary.py packages/scraper/tests/test_corpus_dictionary.py
git commit -m "fix(scraper/dictionary): skip See-Also links when parsing derived forms"
```

---

### Task 2: Data-fix operations + idempotent script

Add two public methods to `ScraperDatabase` (mirroring the `backfill_descriptions` pattern) and a thin orchestrator module. `recompute_occurrence_counts` sets every root's count from `word_segments`; `delete_null_arabic_root_forms` removes the junk rows. Both idempotent. A pytest seeds a temp DB and verifies by alignment (spot-checks + zero-mismatch assertions), not row totals.

**Files:**
- Modify: `packages/scraper/scraper/db.py` (add two methods after `update_word_descriptions_bulk`, ~line 411)
- Create: `packages/scraper/scraper/fix_root_data.py`
- Modify: `packages/scraper/scraper/cli.py` (add `fix-root-data` command after `trim-word-descriptions`, ~line 102)
- Test: `packages/scraper/tests/test_fix_root_data.py`

**Interfaces:**
- Consumes: `ScraperDatabase(db_path)`, `upsert_surah`, `upsert_ayah`, `upsert_word`, `upsert_root`, `upsert_root_form`, `upsert_word_segment` (all existing).
- Produces:
  - `ScraperDatabase.recompute_occurrence_counts() -> int` (rows whose count changed)
  - `ScraperDatabase.delete_null_arabic_root_forms() -> int` (rows deleted)
  - `fix_root_data.fix_root_data(db: ScraperDatabase) -> tuple[int, int]` returns `(counts_changed, forms_deleted)`

- [ ] **Step 1: Write the failing test**

Create `packages/scraper/tests/test_fix_root_data.py`:

```python
from __future__ import annotations

from scraper.db import ScraperDatabase
from scraper.fix_root_data import fix_root_data
from scraper.models import (
    AyahModel,
    RootFormModel,
    RootModel,
    SurahModel,
    WordModel,
    WordSegmentModel,
)


def _db(tmp_path) -> ScraperDatabase:
    db = ScraperDatabase(str(tmp_path / "s.db"))
    db.upsert_surah(
        SurahModel(
            id=1,
            name_arabic="ا",
            name_translit="a",
            name_translation="a",
            revelation_type="meccan",
            ayah_count=7,
            order_number=1,
        )
    )
    return db


def _seed_word_with_root(db: ScraperDatabase, position: int, root: str) -> None:
    """One word whose single stem segment carries `root`."""
    aid = db.upsert_ayah(AyahModel(surah_id=1, ayah_number=1, text_uthmani="x"))
    wid = db.upsert_word(WordModel(ayah_id=aid, position=position, text_arabic="x"))
    db.upsert_word_segment(
        WordSegmentModel(word_id=wid, segment_index=0, segment_type="stem", root=root)
    )


def test_recomputes_counts_and_deletes_junk_forms(tmp_path) -> None:
    db = _db(tmp_path)
    # root ktb: stored 0, but 3 word_segments carry it -> should become 3
    kid = db.upsert_root(RootModel(root_buckwalter="ktb", root_arabic="ك ت ب", occurrence_count=0))
    for pos in (1, 2, 3):
        _seed_word_with_root(db, pos, "ktb")
    # a real derived form (has Arabic) and a junk one (form_arabic=None)
    db.upsert_root_form(
        RootFormModel(root_id=kid, sort_order=0, pos_label="Noun", form_arabic="كِتَٰب", occurrence_count=3)
    )
    db.upsert_root_form(
        RootFormModel(root_id=kid, sort_order=1, pos_label="Lane's Lexicon", form_arabic=None)
    )
    # root with no segments at all: count stays 0
    db.upsert_root(RootModel(root_buckwalter="zzz", root_arabic="ز", occurrence_count=99))

    counts_changed, forms_deleted = fix_root_data(db)

    assert forms_deleted == 1
    # ktb 0->3 and zzz 99->0 both changed
    assert counts_changed == 2
    ktb = db.get_root_by_buckwalter("ktb")
    assert ktb["occurrence_count"] == 3
    assert db.get_root_by_buckwalter("zzz")["occurrence_count"] == 0
    forms = db.get_root_forms_raw(kid)
    assert len(forms) == 1
    assert forms[0]["form_arabic"] == "كِتَٰب"


def test_idempotent_second_run_is_noop(tmp_path) -> None:
    db = _db(tmp_path)
    kid = db.upsert_root(RootModel(root_buckwalter="ktb", root_arabic="ك ت ب", occurrence_count=0))
    _seed_word_with_root(db, 1, "ktb")
    db.upsert_root_form(
        RootFormModel(root_id=kid, sort_order=0, pos_label="junk", form_arabic=None)
    )
    assert fix_root_data(db) == (1, 1)
    assert fix_root_data(db) == (0, 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/scraper && .venv/bin/pytest tests/test_fix_root_data.py -v`
Expected: FAIL — `ModuleNotFoundError: scraper.fix_root_data` (and `ScraperDatabase` lacks the new methods).

- [ ] **Step 3a: Add the two DB methods + two read helpers**

Append to `packages/scraper/scraper/db.py` after `update_word_descriptions_bulk` (before the class ends):

```python
    def recompute_occurrence_counts(self) -> int:
        """Set every root's occurrence_count to its word_segments count.

        word_segments.root is the corpus-aligned occurrence signal (it counts
        a compound word's secondary root, which words.root_buckwalter misses).
        Idempotent: re-running yields the same counts. Returns rows changed.
        """
        cur = self._conn.execute(
            """UPDATE roots SET occurrence_count = (
                   SELECT COUNT(*) FROM word_segments
                   WHERE word_segments.root = roots.root_buckwalter)
               WHERE occurrence_count != (
                   SELECT COUNT(*) FROM word_segments
                   WHERE word_segments.root = roots.root_buckwalter)"""
        )
        self._conn.commit()
        return cur.rowcount

    def delete_null_arabic_root_forms(self) -> int:
        """Delete root_forms rows with no Arabic (See-Also junk). Idempotent."""
        cur = self._conn.execute(
            "DELETE FROM root_forms WHERE form_arabic IS NULL"
        )
        self._conn.commit()
        return cur.rowcount

    def get_root_by_buckwalter(self, bw: str) -> sqlite3.Row | None:
        return self._conn.execute(
            "SELECT * FROM roots WHERE root_buckwalter = ?", (bw,)
        ).fetchone()

    def get_root_forms_raw(self, root_id: int) -> list[sqlite3.Row]:
        return self._conn.execute(
            "SELECT * FROM root_forms WHERE root_id = ? ORDER BY sort_order",
            (root_id,),
        ).fetchall()
```

- [ ] **Step 3b: Create the orchestrator module**

Create `packages/scraper/scraper/fix_root_data.py`:

```python
"""Repeatable fix for dictionary root data (idempotent).

Two corrections, both safe to re-run:
  1. occurrence_count re-derived from word_segments (many roots kept the 0
     default because only ~243 roots ever got a scraped corpus total).
  2. Junk root_forms rows removed — the pre-fix parser turned each "See Also"
     external link into a fake derived form with form_arabic=None.

Back up the DB (.bak) before running against the canonical DB.
"""

from __future__ import annotations

from .db import ScraperDatabase


def fix_root_data(db: ScraperDatabase) -> tuple[int, int]:
    """Return (occurrence counts changed, junk form rows deleted)."""
    counts_changed = db.recompute_occurrence_counts()
    forms_deleted = db.delete_null_arabic_root_forms()
    return counts_changed, forms_deleted
```

- [ ] **Step 3c: Wire the CLI command**

Add to `packages/scraper/scraper/cli.py` after `trim_word_descriptions_cmd` (~line 102):

```python
@main.command("fix-root-data")
@click.option("--db", default="quran.db", show_default=True, help="SQLite output path")
def fix_root_data_cmd(db: str) -> None:
    """Re-derive occurrence_count from word_segments + drop junk forms (idempotent)."""
    from .fix_root_data import fix_root_data

    database = ScraperDatabase(db)
    counts, forms = fix_root_data(database)
    database.close()
    click.echo(f"fix-root-data: {counts} counts updated, {forms} junk forms deleted.")
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd packages/scraper && .venv/bin/pytest tests/test_fix_root_data.py -v`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/scraper/db.py packages/scraper/scraper/fix_root_data.py packages/scraper/scraper/cli.py packages/scraper/tests/test_fix_root_data.py
git commit -m "feat(scraper): fix-root-data — re-derive counts + drop junk forms"
```

---

### Task 3: Query guard — never render a null-form row

Defense-in-depth at the data boundary: `getRootForms` filters out `form_arabic IS NULL` so even if a junk row survived, the UI's existing `forms.length > 0` guard hides the section correctly and no broken pill renders. `RootEntry.tsx` already omits the "Derived forms" section when `forms.length === 0` — no component change needed.

**Files:**
- Modify: `packages/data/src/queries/roots.ts` (`getRootForms`, lines 105-111)
- Test: `packages/data/tests/roots.test.ts`

**Interfaces:**
- Consumes: existing `getRootForms(db, rootId)`.
- Produces: `getRootForms` now returns only rows with non-null `form_arabic`; `getRootEntry` inherits the filter.

- [ ] **Step 1: Write the failing test**

Add inside `describe('roots queries', ...)` in `packages/data/tests/roots.test.ts`:

```python
  it('getRootForms excludes null-arabic (junk) rows', async () => {
    const smwId = (await getRootByBuckwalter(db, 'smw'))!.id;
    // a See-Also-style junk row: pos_label set, form_arabic NULL
    await db.execute({
      sql: `INSERT INTO root_forms (root_id,sort_order,pos_label,form_arabic,occurrence_count) VALUES (?,50,'Lane''s Lexicon',NULL,0)`,
      args: [smwId],
    });
    const forms = await getRootForms(db, smwId);
    expect(forms.every((f) => f.form_arabic !== null)).toBe(true);
    expect(forms.some((f) => f.pos_label === "Lane's Lexicon")).toBe(false);
  });
```

> Note: the file is TypeScript — write the block as `.ts`, not Python. (Fenced as text above.)

Also import `getRootForms` in the test's import block (line 4-15):

```typescript
  getRootForms,
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/data && npx vitest run tests/roots.test.ts -t 'excludes null-arabic'`
Expected: FAIL — the junk row is returned; `expect(...).toBe(true)` fails (a form has `form_arabic === null`).

- [ ] **Step 3: Write minimal implementation**

In `packages/data/src/queries/roots.ts`, change `getRootForms` (lines 105-111):

```typescript
export async function getRootForms(db: Client, rootId: number): Promise<RootForm[]> {
  const res = await db.execute({
    // form_arabic IS NULL only ever marked See-Also junk (external dictionary
    // links the pre-fix scraper mistook for forms); real forms always carry
    // Arabic. Excluding them keeps the UI's empty-section guard correct.
    sql: 'SELECT * FROM root_forms WHERE root_id = ? AND form_arabic IS NOT NULL ORDER BY sort_order',
    args: [rootId],
  });
  return res.rows.map(rowToForm);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd packages/data && npx vitest run tests/roots.test.ts`
Expected: PASS — new test green; `getRootEntry bundles forms + definitions` still expects `forms.length === 1` (the seeded `smw` form has Arabic? No — the seeded `smw` form at line 46-49 has NO `form_arabic`). **Check:** that seed inserts `pos_label='Noun', form_translit='ism'` with no `form_arabic` → NULL. The filter would now drop it and break `getRootEntry` (expects 1) and `getRootSearchList concatenates` (expects gloss). Fix the seed: add `form_arabic` to the `smw` form at line 46-49 so it is a real form:

```typescript
  await db.execute({
    sql: `INSERT INTO root_forms (root_id,sort_order,pos_label,form_arabic,form_translit,occurrence_count) VALUES (?,0,'Noun','ٱسْم','ism',5)`,
    args: [smwId],
  });
```

Re-run: `cd packages/data && npx vitest run tests/roots.test.ts`
Expected: PASS — all root tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/queries/roots.ts packages/data/tests/roots.test.ts
git commit -m "fix(data/roots): getRootForms excludes null-arabic junk forms"
```

---

### Task 4: Apply the fix to the canonical DB + verify

Not TDD — this is the one-time data migration run, gated by verification against the acceptance criteria. Back up first; the script is idempotent so a re-run is safe.

**Files:**
- Data only: `/home/claude/quran-data/quran.db` (+ `.bak`). No code.
- Modify: `docs/AGENDA.md` (record decision + new concordance-gap backlog item)

**Interfaces:** Consumes the `fix-root-data` CLI from Task 2.

- [ ] **Step 1: Back up the canonical DB**

Run:
```bash
cp /home/claude/quran-data/quran.db /home/claude/quran-data/quran.db.bak-$(date +%Y%m%d-%H%M%S)
ls -la /home/claude/quran-data/quran.db.bak-*
```
Expected: a `.bak-*` file the same size as `quran.db`. Confirm no scraper process is writing (WAL idle).

- [ ] **Step 2: Capture pre-fix state (for the change record)**

Run:
```bash
cd packages/scraper && .venv/bin/python3 -c "
import sqlite3; c=sqlite3.connect('/home/claude/quran-data/quran.db'); q=c.execute
print('roots with occ=0:', q('SELECT COUNT(*) FROM roots WHERE occurrence_count=0').fetchone()[0])
print('null-arabic forms:', q('SELECT COUNT(*) FROM root_forms WHERE form_arabic IS NULL').fetchone()[0])
"
```
Expected (approx, current DB): `roots with occ=0: 1399`, `null-arabic forms: 714`.

- [ ] **Step 3: Run the fix**

Run:
```bash
cd packages/scraper && .venv/bin/python3 -m scraper.cli fix-root-data --db /home/claude/quran-data/quran.db
```
Expected: `fix-root-data: ~1399 counts updated, 714 junk forms deleted.`

- [ ] **Step 4: Verify acceptance criteria (alignment, not totals)**

Run:
```bash
cd packages/scraper && .venv/bin/python3 -c "
import sqlite3; c=sqlite3.connect('/home/claude/quran-data/quran.db'); q=c.execute
mism = q('''SELECT COUNT(*) FROM roots r WHERE occurrence_count !=
   (SELECT COUNT(*) FROM word_segments WHERE root=r.root_buckwalter)''').fetchone()[0]
print('AC1 count mismatches (want 0):', mism)
print('AC2 null-arabic forms (want 0):', q('SELECT COUNT(*) FROM root_forms WHERE form_arabic IS NULL').fetchone()[0])
for bw,exp in (('Abd',28),('Aty',549),('ktb',319),('Amm',119)):
    got = q('SELECT occurrence_count FROM roots WHERE root_buckwalter=?',(bw,)).fetchone()[0]
    print(f'AC5 {bw}: {got} (want {exp})', 'OK' if got==exp else 'FAIL')
print('real forms remaining (want ~3945):', q('SELECT COUNT(*) FROM root_forms').fetchone()[0])
"
```
Expected: `AC1 count mismatches: 0`, `AC2 null-arabic forms: 0`, `Abd 28`, `Aty 549`, `ktb 319`, `Amm 119` all OK, `real forms remaining: 3945`.

- [ ] **Step 5: Confirm idempotency**

Run the fix a second time:
```bash
cd packages/scraper && .venv/bin/python3 -m scraper.cli fix-root-data --db /home/claude/quran-data/quran.db
```
Expected: `fix-root-data: 0 counts updated, 0 junk forms deleted.`

- [ ] **Step 6: Record the decision + new backlog item in AGENDA**

Edit `docs/AGENDA.md`: move Phase 10 to Done (with actual before/after numbers), and add under "Concordance / dictionary UX":

```markdown
- ⬜ **Concordance undercounts compound secondary roots.** occurrence_count
  (from word_segments, corpus-correct) counts a compound word's secondary root;
  the concordance query uses `words.root_buckwalter` (primary root only), so it
  omits that occurrence. Visible on root `Amm` (أ م م): header 119, list 118
  (missing يَبْنَؤُمَّ 20:94:2). Pre-existing; only 1 root's total is affected.
  Fix later by basing concordance on word_segments.
```

- [ ] **Step 7: Commit the AGENDA update (docs only — DB is gitignored)**

```bash
git add docs/AGENDA.md
git commit -m "docs: Phase 10 done + concordance compound-root backlog note"
```

---

## Self-Review

- **Spec coverage:** U1 parser → Task 1; U2 data-fix script + alignment verify → Task 2 (+ Task 4 runs it); U3 query/UI guard → Task 3 (UI already guarded, so query-level); U4 regression tests → covered by Task 2 pytest (count derivation + null-form deletion) and Task 3 vitest (query excludes null form). Acceptance criteria 1,2,5 → Task 4 Step 4; criterion 3 → Task 1; criterion 4 → existing `forms.length > 0` guard, locked by Task 3; criterion 6 → each task's test-suite run.
- **Placeholder scan:** none — all steps carry real code + exact commands.
- **Type consistency:** `fix_root_data() -> tuple[int,int]`, `recompute_occurrence_counts()->int`, `delete_null_arabic_root_forms()->int`, `get_root_by_buckwalter`/`get_root_forms_raw` used identically in test and impl. `getRootForms` signature unchanged.
- **Deviation flagged:** occurrence source is `word_segments` (spec wording), corpus-verified against the one divergent root. The discovered concordance/compound gap is logged to AGENDA, not silently folded in.
