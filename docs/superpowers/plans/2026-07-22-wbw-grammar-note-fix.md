# WbW Grammar-Note Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the garbled `grammarArabic` line in the wbw list-view 3rd column with the correct compact Arabic grammar term(s), sourced from `wordbyword.jsp`'s dedicated `arabicGrammar` div instead of the unrelated word-detail-page prose spans.

**Architecture:** Add a new `words.grammar_note` column populated by extending the scraper's existing `parse_verse_words` (which already fetches `wordbyword.jsp` per verse) to capture `<div class="arabicGrammar">`, split on `<br>` into newline-joined clauses. Backfill by re-running the existing `scrape` CLI command against a fresh checkpoint file. Wire the new field through `packages/data` and render it — one line per clause — in `WbwWordRow`. The old `grammar_arabic` column and its word-detail "Full analysis" consumer are untouched.

**Tech Stack:** Python (BeautifulSoup) scraper, SQLite schema, TypeScript `packages/data` query layer, Next.js/React `apps/web`.

## Global Constraints

- Do NOT modify `words.grammar_arabic`, `dictionary_scrape.py`, or `FullAnalysis.tsx`/`WordDetailView.tsx` — that field/pipeline is correct for its own purpose (word-detail "Full analysis") and out of scope.
- `ParsedWord.grammar_note` must default to `None` — `test_corpus_quran_process.py::test_process_page_leaves_text_arabic_empty` constructs `ParsedWord(...)` without it and must keep passing unmodified.
- New column added via: (a) `packages/data/schema.sql` CREATE TABLE clause, (b) `packages/scraper/scraper/db.py`'s `_migrate_add_word_columns()` tuple (self-healing ALTER for legacy DBs) — both required, matching the existing `grammar_arabic`/`audio_url` precedent.
- Rate limit for the backfill re-scrape: 1.5s/request (existing `scrape` CLI default) — do not lower it.
- No new CLI command/script for the backfill — reuse the existing `scraper scrape` command with a fresh `--checkpoint` file.
- 3 UI columns in the list view stay exactly as-is; only the data source for the 3rd column's Arabic-grammar line changes.

---

### Task 1: Scraper — capture `arabicGrammar` div into `ParsedWord.grammar_note`

**Files:**
- Modify: `packages/scraper/scraper/sources/corpus_parser.py`
- Test: `packages/scraper/tests/test_corpus_parser.py`

**Interfaces:**
- Produces: `ParsedWord.grammar_note: str | None` (newline-joined clauses, `None` if the `arabicGrammar` div is absent or empty after stripping).
- Consumes: nothing new — reuses the existing `col3` cell already located inside `parse_verse_words`'s per-row loop.

The existing fixture `packages/scraper/tests/fixtures/corpus_1_1.html` already contains real `arabicGrammar` divs for all 20 words, including one multi-line case at verse 1:5 word 3 (`الواو عاطفة<br/>ضمير منفصل`) — no new fixture file needed.

- [ ] **Step 1: Write the failing tests**

Add to `packages/scraper/tests/test_corpus_parser.py` (append near the other "Specific POS tag spot-checks" section):

```python
# ---------------------------------------------------------------------------
# Arabic grammar note (arabicGrammar div)
# ---------------------------------------------------------------------------


def test_first_word_grammar_note(parsed_words: list[ParsedWord]) -> None:
    """Word 1:1:1 (bismi) grammar note is the single compact relation term."""
    assert parsed_words[0].grammar_note == "جار ومجرور"


def test_word_1_1_2_grammar_note(parsed_words: list[ParsedWord]) -> None:
    """Word 1:1:2 (Allah, genitive) grammar note names the proper-noun rule."""
    word = next(w for w in parsed_words if w.verse_number == 1 and w.position == 2)
    assert word.grammar_note == "لفظ الجلالة مجرور"


def test_multiline_grammar_note_splits_on_br(parsed_words: list[ParsedWord]) -> None:
    """Word 1:5:3 (wa-iyyaka) has two <br/>-separated clauses in the source div;
    they must be joined with '\\n', not collapsed into one line."""
    word = next(w for w in parsed_words if w.verse_number == 5 and w.position == 3)
    assert word.grammar_note == "الواو عاطفة\nضمير منفصل"


def test_grammar_note_absent_when_no_div() -> None:
    """A col3 cell with no arabicGrammar div yields grammar_note=None."""
    html = """
    <table class="morphologyTable">
      <tr><th>h</th></tr>
      <tr>
        <td><span class="location">(1:1:1)</span><a>bismi</a><br/>gloss</td>
        <td>arabic</td>
        <td><b>P</b> – prefixed preposition</td>
      </tr>
    </table>
    """
    words = parse_verse_words(html)
    assert len(words) == 1
    assert words[0].grammar_note is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/scraper && .venv/bin/pytest tests/test_corpus_parser.py -k grammar_note -v`
Expected: FAIL — `AttributeError: 'ParsedWord' object has no attribute 'grammar_note'`

- [ ] **Step 3: Implement**

In `packages/scraper/scraper/sources/corpus_parser.py`, change the `ParsedWord` dataclass:

```python
@dataclass
class ParsedWord:
    verse_number: int  # ayah number within the chapter (from location span)
    position: int  # word position within verse (from location span)
    transliteration: str | None  # from <a> or <span class="phonetic">
    pos_tag: str | None  # first <b> text in col3 cell
    english_gloss: str | None  # bare text node in cell 0 (not inside spans/links)
    morphology_json: str | None  # JSON array of all POS codes from <b> tags in col3
    grammar_note: str | None = None  # arabicGrammar div text, \n-joined per <br/> clause
```

Add a helper function above `parse_verse_words` (near the other module-level helpers):

```python
def _extract_grammar_note(col3: Tag) -> str | None:
    """Extract the arabicGrammar div's clauses, one per <br/>, \n-joined.

    Returns None if the div is absent or every clause is empty after
    stripping (matches morphology_json's None-when-absent convention).
    """
    div = col3.find("div", class_="arabicGrammar")
    if div is None:
        return None
    clauses: list[str] = []
    current = ""
    for child in div.children:
        if isinstance(child, Tag) and child.name == "br":
            if current.strip():
                clauses.append(current.strip())
            current = ""
        else:
            current += child.get_text() if isinstance(child, Tag) else str(child)
    if current.strip():
        clauses.append(current.strip())
    return "\n".join(clauses) if clauses else None
```

`corpus_parser.py` imports `BeautifulSoup, NavigableString` from `bs4` already — add `Tag` to that import line:

```python
from bs4 import BeautifulSoup, NavigableString, Tag
```

In `parse_verse_words`, inside the existing `# --- Cell 2 (col3): POS codes from <b> tags ---` block, after `pos_codes` is built (right before `pos_tag = pos_codes[0] if pos_codes else None`), add:

```python
        grammar_note = _extract_grammar_note(col3) if len(cells) > 2 else None
```

Note `col3` is already bound inside the `if len(cells) > 2:` block as `col3 = cells[2]` — reuse that name; declare `grammar_note = None` before the `if` so it's defined either way, matching how `pos_codes` is handled:

```python
        # --- Cell 2 (col3): POS codes from <b> tags ---
        pos_codes: list[str] = []
        grammar_note: str | None = None
        if len(cells) > 2:
            col3 = cells[2]
            for b_tag in col3.find_all("b"):
                code = b_tag.get_text(strip=True)
                if code:
                    pos_codes.append(code)
            grammar_note = _extract_grammar_note(col3)
```

Finally, add `grammar_note=grammar_note,` to the `ParsedWord(...)` construction at the end of the loop body.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/scraper && .venv/bin/pytest tests/test_corpus_parser.py -v`
Expected: all tests PASS (existing 20+ tests plus the 4 new ones)

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/scraper/sources/corpus_parser.py packages/scraper/tests/test_corpus_parser.py
git commit -m "feat(scraper): capture arabicGrammar div as ParsedWord.grammar_note"
```

---

### Task 2: Scraper — plumb `grammar_note` through DB layer

**Files:**
- Modify: `packages/scraper/scraper/models.py`
- Modify: `packages/scraper/scraper/db.py`
- Modify: `packages/scraper/scraper/sources/corpus_quran.py`
- Test: `packages/scraper/tests/test_corpus_quran_process.py`
- No edits needed to `packages/scraper/tests/test_db.py` — its existing `upsert_word` tests (e.g. `test_upsert_word_does_not_clobber_existing_fields_with_null`) exercise the same INSERT/COALESCE SQL generically and will catch any column-count/SQL mistake in Step 3 when the full suite runs in Step 4.

**Interfaces:**
- Consumes: `ParsedWord.grammar_note` (Task 1).
- Produces: `WordModel.grammar_note: str | None`, persisted by `ScraperDatabase.upsert_word` into `words.grammar_note`.

- [ ] **Step 1: Write the failing test**

Add to `packages/scraper/tests/test_corpus_quran_process.py`:

```python
def test_process_page_forwards_grammar_note(monkeypatch):
    pw = ParsedWord(
        verse_number=1, position=1, transliteration="qul",
        pos_tag="V", english_gloss="Say", morphology_json=None,
        grammar_note="فعل أمر",
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
    assert captured["word"].grammar_note == "فعل أمر"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/scraper && .venv/bin/pytest tests/test_corpus_quran_process.py -k grammar_note -v`
Expected: FAIL — `AttributeError: 'WordModel' object has no attribute 'grammar_note'` or similar (WordModel has no such field, or `_process_page` doesn't forward it)

- [ ] **Step 3: Implement**

`packages/scraper/scraper/models.py` — add to `WordModel` (after `grammar_arabic`):

```python
    grammar_arabic: str | None = None
    grammar_note: str | None = None
```

`packages/scraper/scraper/db.py` — add `"grammar_note"` to the `_migrate_add_word_columns()` tuple:

```python
        for column in (
            "root_buckwalter",
            "lemma_buckwalter",
            "morphology_description",
            "grammar_arabic",
            "grammar_note",
            "audio_url",
        ):
```

Do not edit `packages/data/schema.sql` in this task — that happens in Task 3. `_migrate_add_word_columns()` ALTERs the column onto `ScraperDatabase`'s live table directly from its own Python tuple (checked against `PRAGMA table_info`), independent of what `schema.sql`'s `CREATE TABLE IF NOT EXISTS` text says — so this task's tests pass regardless of Task 3's schema.sql state, and there is no ordering dependency between the two tasks.

In `db.py`'s `upsert_word`, add `grammar_note` to the INSERT column list, VALUES placeholders, ON CONFLICT clause, and the parameter tuple:

```python
    def upsert_word(self, word: WordModel) -> int:
        cursor = self._conn.execute(
            """INSERT INTO words
               (
                   ayah_id,
                   position,
                   text_arabic,
                   transliteration,
                   root,
                   lemma,
                   root_buckwalter,
                   lemma_buckwalter,
                   pos_tag,
                   morphology_json,
                   morphology_description,
                   grammar_arabic,
                   grammar_note
               )
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(ayah_id, position) DO UPDATE SET
                 text_arabic = excluded.text_arabic,
                 transliteration = COALESCE(
                   excluded.transliteration, words.transliteration),
                 root = COALESCE(excluded.root, words.root),
                 lemma = COALESCE(excluded.lemma, words.lemma),
                 root_buckwalter = COALESCE(
                   excluded.root_buckwalter, words.root_buckwalter),
                 lemma_buckwalter = COALESCE(
                   excluded.lemma_buckwalter, words.lemma_buckwalter),
                 pos_tag = COALESCE(excluded.pos_tag, words.pos_tag),
                 morphology_json = COALESCE(
                   excluded.morphology_json, words.morphology_json),
                 morphology_description = COALESCE(
                   excluded.morphology_description, words.morphology_description),
                 grammar_arabic = COALESCE(
                   excluded.grammar_arabic, words.grammar_arabic),
                 grammar_note = COALESCE(
                   excluded.grammar_note, words.grammar_note)
               RETURNING id""",
            (
                word.ayah_id,
                word.position,
                word.text_arabic,
                word.transliteration,
                word.root,
                word.lemma,
                word.root_buckwalter,
                word.lemma_buckwalter,
                word.pos_tag,
                word.morphology_json,
                word.morphology_description,
                word.grammar_arabic,
                word.grammar_note,
            ),
        )
        row = cursor.fetchone()
        self._conn.commit()
        return int(row[0])
```

`packages/scraper/scraper/sources/corpus_quran.py` — in `_process_page`, add `grammar_note=pw.grammar_note` to the `WordModel(...)` construction:

```python
        word_id = db.upsert_word(
            WordModel(
                ayah_id=ayah_id,
                position=pw.position,
                text_arabic="",
                transliteration=pw.transliteration,
                pos_tag=pw.pos_tag,
                morphology_json=pw.morphology_json,
                grammar_note=pw.grammar_note,
            )
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/scraper && .venv/bin/pytest tests/ -v`
Expected: all PASS (full scraper suite — this touches shared DB code, run the whole suite not just the new test)

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/scraper/models.py packages/scraper/scraper/db.py packages/scraper/scraper/sources/corpus_quran.py packages/scraper/tests/test_corpus_quran_process.py
git commit -m "feat(scraper): persist grammar_note through upsert_word"
```

---

### Task 3: `packages/data` — schema, types, query mapping

**Files:**
- Modify: `packages/data/schema.sql`
- Modify: `packages/data/src/types.ts`
- Modify: `packages/data/src/queries/words.ts`
- Test: `packages/data/tests/words.test.ts`

**Interfaces:**
- Consumes: `words.grammar_note` column (Task 2 makes the scraper write it; this task makes the schema declare it and `packages/data` read it).
- Produces: `Word.grammar_note: string | null`, returned by every `rowToWord`-based query (`getWordsByAyah`, `getWordsBySurah`, `getWordsBySurahAyahRange`, `getWordByLocation`, `getWordDetail`).

- [ ] **Step 1: Write the failing test**

In `packages/data/tests/words.test.ts`, change the existing mapping test (the one at the "maps morphology_description, grammar_arabic, audio_url" `it` block) to also cover `grammar_note`:

```typescript
  it('maps morphology_description, grammar_arabic, grammar_note, audio_url', async () => {
    await db.execute(
      `UPDATE words SET morphology_description='desc', grammar_arabic='جار ومجرور', grammar_note='فعل ماض' WHERE position=1 AND ayah_id=${ayahId}`,
    );
    const words = await getWordsByAyah(db, ayahId);
    const w = words.find((x) => x.position === 1)!;
    expect(w.morphology_description).toBe('desc');
    expect(w.grammar_arabic).toBe('جار ومجرور');
    expect(w.grammar_note).toBe('فعل ماض');
    expect(w.audio_url).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/data && pnpm test -- words.test.ts`
Expected: FAIL — `SQLITE_ERROR: table words has no column named grammar_note` (schema.sql doesn't have it yet)

- [ ] **Step 3: Implement**

`packages/data/schema.sql` — in the `words` CREATE TABLE, add `grammar_note` after `grammar_arabic`:

```sql
CREATE TABLE IF NOT EXISTS words (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ayah_id         INTEGER NOT NULL REFERENCES ayahs(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  text_arabic     TEXT    NOT NULL,
  transliteration TEXT,
  root            TEXT,
  lemma           TEXT,
  root_buckwalter TEXT,
  lemma_buckwalter TEXT,
  pos_tag         TEXT,
  morphology_json TEXT,
  morphology_description TEXT,
  grammar_arabic  TEXT,
  grammar_note    TEXT,
  audio_url       TEXT,
  UNIQUE(ayah_id, position)
);
```

`packages/data/src/types.ts` — add to the `Word` interface (after `grammar_arabic`):

```typescript
  grammar_arabic: string | null;
  grammar_note: string | null;
```

`packages/data/src/queries/words.ts` — add to `rowToWord` (after the `grammar_arabic` line):

```typescript
    grammar_arabic: strip(row['grammar_arabic'] as string | null),
    grammar_note: strip(row['grammar_note'] as string | null),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/data && pnpm test`
Expected: all PASS (full `packages/data` suite — `pretest` regenerates `schema.generated.ts` from `schema.sql` automatically)

- [ ] **Step 5: Commit**

```bash
git add packages/data/schema.sql packages/data/src/types.ts packages/data/src/queries/words.ts packages/data/tests/words.test.ts
git commit -m "feat(data): add words.grammar_note column and query mapping"
```

---

### Task 4: `apps/web` — render `grammar_note` in the list view

**Files:**
- Modify: `apps/web/src/components/wbw/types.ts`
- Modify: `apps/web/src/app/surah/[id]/words/page.tsx`
- Modify: `apps/web/src/components/wbw/WbwWordRow.tsx`
- Test: `apps/web/src/test/WbwWordRow.test.tsx`
- Test: `apps/web/src/test/WbwWordCell.test.tsx`
- Test: `apps/web/src/test/WbwAyahBlock.test.tsx`
- Test: `apps/web/src/test/WbwAyahListBlock.test.tsx`
- Test: `apps/web/src/test/WbwAyahs.test.tsx`
- Test: `apps/web/src/test/WbwView.test.tsx`

**Interfaces:**
- Consumes: `Word.grammar_note` (Task 3).
- Produces: `WbwCell.grammarNote: string | null` (replaces `WbwCell.grammarArabic`).

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/test/WbwWordRow.test.tsx`, replace the `cell()` fixture's `grammarArabic` field with `grammarNote`:

```typescript
function cell(over: Partial<WbwCell> = {}): WbwCell {
  return {
    surahId: 1, ayahNumber: 1, position: 1,
    arabic: 'بِسْمِ', translit: "bis'mi", gloss: 'In (the) name', glossLang: null,
    posTag: 'P', posLabel: 'Preposition',
    segments: [],
    grammarNote: 'جار ومجرور',
    ...over,
  };
}
```

Update every `grammarArabic:` reference in that file's test bodies to `grammarNote:` (the "shows em dash for null..." test and its assertion text). Then add a new test for multi-line rendering, right after the "renders translation, arabic..." test:

```typescript
  it('renders each grammar-note clause on its own line', () => {
    renderRow(cell({ grammarNote: 'الواو عاطفة\nفعل ماض' }));
    expect(screen.getByText('الواو عاطفة')).toBeInTheDocument();
    expect(screen.getByText('فعل ماض')).toBeInTheDocument();
  });
```

In `apps/web/src/test/WbwWordCell.test.tsx`, `WbwAyahBlock.test.tsx`, `WbwAyahListBlock.test.tsx`, `WbwAyahs.test.tsx`, `WbwView.test.tsx`: rename every `grammarArabic:` key to `grammarNote:` in their inline `WbwCell`/cell-builder literals (values unchanged — these files don't assert on the field's content, only need the type to compile).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm test -- WbwWordRow`
Expected: FAIL — TypeScript error (`grammarNote` does not exist on type `WbwCell`) or the new multi-line test failing since the component still renders a single joined line

- [ ] **Step 3: Implement**

`apps/web/src/components/wbw/types.ts` — rename the field:

```typescript
export interface WbwCell {
  surahId: number;
  ayahNumber: number;
  position: number;
  arabic: string;
  translit: string | null;
  gloss: string | null;
  glossLang: string | null;
  posTag: string | null;
  posLabel: string | null;
  segments: WordSegment[];
  grammarNote: string | null;
}
```

`apps/web/src/app/surah/[id]/words/page.tsx` — change the cell-construction line:

```typescript
      grammarNote: w.grammar_note,
```

(replacing the existing `grammarArabic: w.grammar_arabic,` line).

`apps/web/src/components/wbw/WbwWordRow.tsx` — rename the destructured field and split-render it:

```tsx
  const {
    surahId,
    ayahNumber,
    position,
    arabic,
    translit,
    gloss,
    glossLang,
    segments,
    posTag,
    posLabel,
    grammarNote,
  } = cell;
```

and replace the final `<div className="font-arabic ...">{grammarArabic ?? '—'}</div>` with:

```tsx
        {grammarNote ? (
          grammarNote.split('\n').map((clause, i) => (
            <div
              key={i}
              className="font-arabic text-base text-paper-600 dark:text-paper-400"
              dir="rtl"
            >
              {clause}
            </div>
          ))
        ) : (
          <div className="font-arabic text-base text-paper-600 dark:text-paper-400" dir="rtl">
            —
          </div>
        )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm type-check && pnpm test`
Expected: all PASS (full `apps/web` suite)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/wbw/types.ts apps/web/src/app/surah/\[id\]/words/page.tsx apps/web/src/components/wbw/WbwWordRow.tsx apps/web/src/test/WbwWordRow.test.tsx apps/web/src/test/WbwWordCell.test.tsx apps/web/src/test/WbwAyahBlock.test.tsx apps/web/src/test/WbwAyahListBlock.test.tsx apps/web/src/test/WbwAyahs.test.tsx apps/web/src/test/WbwView.test.tsx
git commit -m "fix(web/wbw): render grammar_note (one line per clause) instead of grammar_arabic"
```

---

### Task 5: Backfill — re-scrape `wordbyword.jsp` to populate `grammar_note`

**Files:**
- None modified — operational task using the code from Tasks 1–3.

**Interfaces:**
- Consumes: the full scrape pipeline (`scraper scrape` CLI) as modified by Tasks 1–2.
- Produces: every existing row in the production `words` table (`apps/web/quran.db`, or wherever the deployed Turso DB lives) gets `grammar_note` populated.

This task has no code changes — it is the actual backfill run. Do it after Tasks 1–4 are merged (or at least committed on the same branch and fully tested), since it depends on all of them.

- [ ] **Step 1: Confirm the scraper CLI is runnable against the target DB**

Run: `cd packages/scraper && .venv/bin/python -m scraper.cli --help`
Expected: shows the `scrape` command among others (confirms the environment/venv is set up before a long-running job)

- [ ] **Step 2: Kick off the backfill with a fresh checkpoint file, in the background**

```bash
cd packages/scraper && .venv/bin/python -m scraper.cli scrape \
  --db ../../apps/web/quran.db \
  --checkpoint grammar_backfill_checkpoint.json \
  --rate-limit 1.5
```

Run this in the background (it takes on the order of an hour — 114 chapters, each with 1+ paginated `wordbyword.jsp` requests at 1.5s apart). If interrupted, re-running the identical command resumes from `grammar_backfill_checkpoint.json`'s last-marked-done chapter — do not delete that file until the run completes.

- [ ] **Step 3: Spot-check the result**

Once complete, verify against the known-good samples from the design spike:

```bash
cd /home/claude/projects/quran-corpus-pwa && python3 -c "
import sqlite3
con = sqlite3.connect('apps/web/quran.db')
cur = con.cursor()
cur.execute('''
SELECT s.id, a.ayah_number, w.position, w.text_arabic, w.grammar_note
FROM words w JOIN ayahs a ON w.ayah_id=a.id JOIN surahs s ON a.surah_id=s.id
WHERE s.id=1 AND a.ayah_number=1 AND w.position IN (1,2,3,4)
ORDER BY w.position
''')
for row in cur.fetchall():
    print(row)
"
```

Expected output (matches the design spike's live corpus values):
```
(1, 1, 1, 'بِسْمِ', 'جار ومجرور')
(1, 1, 2, 'ٱللَّهِ', 'لفظ الجلالة مجرور')
(1, 1, 3, 'ٱلرَّحْمَٰنِ', 'صفة مجرورة')
(1, 1, 4, 'ٱلرَّحِيمِ', 'صفة مجرورة')
```

- [ ] **Step 4: Restart the dev server / verify in the browser**

Load `/surah/1/words` (list view) and confirm the 3rd column now shows `جار ومجرور` for بِسْمِ instead of the old `مجرور س م و جار ومجرور`, and that a multi-clause word (e.g. search for one from the spike, وَقَالُوا۟ at 9:59:8) renders two stacked Arabic lines.

No commit for this task (data-only change to the SQLite file, which is not tracked in git per CLAUDE.md §9 — "never commit scraped raw data").

---

## Self-Review Notes

- **Spec coverage:** all 5 spec sections (scraper capture, schema, backfill, web app, tests) map to Tasks 1–5. The spec's "Risks / Open Items" INL-div-absence question is covered by Task 1's `test_grammar_note_absent_when_no_div` (synthetic case) — real INL behavior will surface naturally during Task 5's backfill; if `grammar_note` comes back `None` for INL words that's already correct handling, not a bug.
- **Placeholder scan:** none found — every step has literal code/commands.
- **Type consistency:** `ParsedWord.grammar_note` (Task 1) → `WordModel.grammar_note` (Task 2) → `words.grammar_note` column (Task 2/3) → `Word.grammar_note` (Task 3) → `WbwCell.grammarNote` (Task 4) — names match at each handoff (snake_case in Python/SQL/`Word`, camelCase only at the `WbwCell` UI boundary, consistent with the existing `posTag`/`posLabel` precedent already in that same interface).
