import re
import sqlite3
from pathlib import Path

from .models import (
    AyahModel,
    ConceptTagModel,
    LanguageModel,
    RootDefinitionModel,
    RootFormModel,
    RootModel,
    SurahModel,
    TranslationModel,
    WordGlossModel,
    WordModel,
    WordSegmentModel,
)

# schema.sql lives at packages/data/schema.sql — single source of truth for DDL
_SCHEMA_PATH = Path(__file__).parents[2] / "data" / "schema.sql"

_STMT_TOKEN = re.compile(r"\bBEGIN\b|\bEND\b|;", re.IGNORECASE)


def _strip_line_comments(sql: str) -> str:
    """Drop `-- …` to end-of-line so comment text can't confuse the splitter."""
    return re.sub(r"--[^\n]*", "", sql)


def _split_statements(sql: str) -> list[str]:
    """Split DDL on top-level `;` only, tracking BEGIN/END depth so a trigger
    body (which contains inner `;`) stays one statement. Mirrors
    packages/data splitStatements — schema.sql is the shared source of truth,
    so both consumers must parse its triggers identically.

    ponytail: not quote-aware for BEGIN/END/`;` inside string literals — same
    trusted-DDL ceiling as the TS side. Make both quote-aware if that changes.
    """
    statements: list[str] = []
    current = ""
    depth = 0
    last = 0
    for m in _STMT_TOKEN.finditer(sql):
        current += sql[last : m.start()] + m.group(0)
        last = m.end()
        kw = m.group(0).upper()
        if kw == "BEGIN":
            depth += 1
        elif kw == "END":
            if depth > 0:
                depth -= 1
        elif depth == 0:  # top-level ';'
            statements.append(current)
            current = ""
    current += sql[last:]
    if current.strip():
        statements.append(current)
    return statements


# Shared CTE: reconstruct each word's Arabic from its segments, concatenated in
# segment order. word_segments is the corpus-aligned source of truth. The ORDER
# BY lives *inside* group_concat (SQLite >= 3.44), which the SQL spec guarantees
# — unlike ordering via an inner subquery, whose aggregation order is undefined.
# Reused by the rebuild (UPDATE) and the misalignment count so the two can never
# drift apart. Fails loudly (OperationalError) on SQLite < 3.44 rather than
# silently mis-ordering.
_WORD_ARABIC_CONCAT_CTE = """WITH concat AS (
  SELECT word_id, group_concat(form_arabic, '' ORDER BY segment_index) AS ta
  FROM word_segments
  GROUP BY word_id
)"""

# These two SQL statements share the CTE above and differ only in their final
# clause. Both are built purely from module-level string literals — no user
# input is interpolated — so S608 (SQL injection via string construction) is a
# false positive here; suppressed with justification.
#
# Rebuild every word's text_arabic from its segment concat, but only where it
# actually differs (idempotent; IS NOT is NULL-safe).
_REBUILD_TEXT_ARABIC_SQL = _WORD_ARABIC_CONCAT_CTE + """
UPDATE words
   SET text_arabic = (SELECT ta FROM concat WHERE concat.word_id = words.id)
 WHERE EXISTS (SELECT 1 FROM concat WHERE concat.word_id = words.id)
   AND text_arabic IS NOT (SELECT ta FROM concat WHERE concat.word_id = words.id)"""  # noqa: S608

# Count words whose text_arabic disagrees with their segment concat.
_COUNT_MISALIGNED_SQL = _WORD_ARABIC_CONCAT_CTE + """
SELECT count(*) FROM words w JOIN concat c ON c.word_id = w.id
WHERE w.text_arabic IS NOT c.ta"""  # noqa: S608


class ScraperDatabase:
    def __init__(self, db_path: str) -> None:
        self._conn = sqlite3.connect(db_path)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.execute("PRAGMA journal_mode = WAL")
        self._apply_schema()

    def _apply_schema(self) -> None:
        sql = _strip_line_comments(_SCHEMA_PATH.read_text())
        statements = [
            stmt
            for raw in _split_statements(sql)
            if (stmt := raw.strip()) and not stmt.upper().startswith("PRAGMA")
        ]
        # Create tables first, then add any columns missing on legacy DBs, then
        # indexes — so an index never references a column the migration adds.
        indexes = [s for s in statements if s.upper().startswith("CREATE INDEX")]
        tables = [s for s in statements if not s.upper().startswith("CREATE INDEX")]
        for stmt in tables:
            self._conn.execute(stmt)
        self._migrate_add_word_columns()
        self._migrate_add_gloss_source()
        for stmt in indexes:
            self._conn.execute(stmt)
        self._conn.commit()

    def _migrate_add_word_columns(self) -> None:
        """Add columns introduced after a DB was first created.

        CREATE TABLE IF NOT EXISTS will not alter an existing table, and SQLite
        has no ADD COLUMN IF NOT EXISTS, so add any missing columns explicitly.
        """
        existing = {
            row["name"] for row in self._conn.execute("PRAGMA table_info(words)")
        }
        for column in (
            "root_buckwalter",
            "lemma_buckwalter",
            "morphology_description",
            "grammar_arabic",
            "audio_url",
        ):
            if column not in existing:
                self._conn.execute(f"ALTER TABLE words ADD COLUMN {column} TEXT")

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

    def upsert_surah(self, surah: SurahModel) -> None:
        self._conn.execute(
            """INSERT INTO surahs
               (
                   id,
                   name_arabic,
                   name_translit,
                   name_translation,
                   revelation_type,
                   ayah_count,
                   order_number
               )
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 name_arabic      = excluded.name_arabic,
                 name_translit    = excluded.name_translit,
                 name_translation = excluded.name_translation,
                 revelation_type  = excluded.revelation_type,
                 ayah_count       = excluded.ayah_count,
                 order_number     = excluded.order_number""",
            (
                surah.id,
                surah.name_arabic,
                surah.name_translit,
                surah.name_translation,
                surah.revelation_type,
                surah.ayah_count,
                surah.order_number,
            ),
        )
        self._conn.commit()

    def upsert_language(self, language: LanguageModel) -> None:
        self._conn.execute(
            """INSERT INTO languages (code, name_native, name_english, direction)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(code) DO UPDATE SET
                 name_native  = excluded.name_native,
                 name_english = excluded.name_english,
                 direction    = excluded.direction""",
            (
                language.code,
                language.name_native,
                language.name_english,
                language.direction,
            ),
        )
        self._conn.commit()

    def upsert_ayah(self, ayah: AyahModel) -> int:
        cursor = self._conn.execute(
            """INSERT INTO ayahs
               (surah_id, ayah_number, text_uthmani, text_simple, juz, page, audio_url)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(surah_id, ayah_number) DO UPDATE SET
                 text_uthmani = excluded.text_uthmani,
                 text_simple  = excluded.text_simple,
                 juz          = excluded.juz,
                 page         = excluded.page,
                 audio_url    = excluded.audio_url
               RETURNING id""",
            (
                ayah.surah_id,
                ayah.ayah_number,
                ayah.text_uthmani,
                ayah.text_simple,
                ayah.juz,
                ayah.page,
                ayah.audio_url,
            ),
        )
        row = cursor.fetchone()
        self._conn.commit()
        return int(row[0])

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
                   grammar_arabic
               )
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                   excluded.grammar_arabic, words.grammar_arabic)
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
            ),
        )
        row = cursor.fetchone()
        self._conn.commit()
        return int(row[0])

    def upsert_translation(self, translation: TranslationModel) -> None:
        self._conn.execute(
            """INSERT INTO translations (ayah_id, language_code, translator, text)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(ayah_id, language_code, translator) DO UPDATE SET
                 text = excluded.text""",
            (
                translation.ayah_id,
                translation.language_code,
                translation.translator,
                translation.text,
            ),
        )
        self._conn.commit()

    def upsert_word_gloss(self, gloss: WordGlossModel) -> None:
        self._conn.execute(
            """INSERT INTO word_glosses (word_id, language_code, gloss_text)
               VALUES (?, ?, ?)
               ON CONFLICT(word_id, language_code) DO UPDATE SET
                 gloss_text = excluded.gloss_text""",
            (gloss.word_id, gloss.language_code, gloss.gloss_text),
        )
        self._conn.commit()

    def upsert_uz_gloss(self, word_id: int, gloss_text: str, source: str) -> None:
        self._conn.execute(
            """INSERT INTO word_glosses (word_id, language_code, gloss_text, source)
               VALUES (?, 'uz', ?, ?)
               ON CONFLICT(word_id, language_code) DO UPDATE SET
                 gloss_text = excluded.gloss_text, source = excluded.source""",
            (word_id, gloss_text, source),
        )

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
            (
                form.root_id,
                form.sort_order,
                form.pos_label,
                form.form_arabic,
                form.form_translit,
                form.gloss,
                form.occurrence_count,
            ),
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
            (
                s.word_id,
                s.segment_index,
                s.segment_type,
                s.pos_tag,
                s.form_arabic,
                s.form_buckwalter,
                s.features_json,
                s.lemma,
                s.root,
            ),
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

    def get_word_id(self, surah_id: int, ayah_number: int, position: int) -> int | None:
        row = self._conn.execute(
            """SELECT w.id FROM words w JOIN ayahs a ON a.id = w.ayah_id
               WHERE a.surah_id = ? AND a.ayah_number = ? AND w.position = ?""",
            (surah_id, ayah_number, position),
        ).fetchone()
        return int(row[0]) if row is not None else None

    def update_word_detail(
        self, word_id: int, description: str | None, grammar_arabic: str | None
    ) -> None:
        self._conn.execute(
            "UPDATE words SET morphology_description = ?, grammar_arabic = ? "
            "WHERE id = ?",
            (description, grammar_arabic, word_id),
        )
        self._conn.commit()

    def get_words_with_description(self) -> list[sqlite3.Row]:
        return self._conn.execute(
            "SELECT id, morphology_description FROM words "
            "WHERE morphology_description IS NOT NULL AND morphology_description <> ''"
        ).fetchall()

    def update_word_descriptions_bulk(
        self, updates: list[tuple[str, int]]
    ) -> None:
        """Apply many (description, word_id) updates in one transaction."""
        self._conn.executemany(
            "UPDATE words SET morphology_description = ? WHERE id = ?",
            updates,
        )
        self._conn.commit()

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

    def _fix_seatless_hamza_in(self, table: str, text_col: str) -> int:
        """Apply fix_seatless_hamza to every LIKE-candidate row in table.text_col.

        Shared by apply_hamza_seat_fix (ayahs + words) and
        rebuild_text_arabic_from_segments (re-applied after the segment
        concat, since that SQL rebuild has no way to call Python and would
        otherwise reintroduce the seatless form -- see hamza_seat.py).
        table/text_col are module-controlled constants, never user input.
        """
        from .hamza_seat import HAMZA, LAM, SUKUN, fix_seatless_hamza

        candidate = LAM + SUKUN + HAMZA
        changed = 0
        for row in self._conn.execute(
            f"SELECT id, {text_col} FROM {table} WHERE {text_col} LIKE ?",  # noqa: S608
            (f"%{candidate}%",),
        ):
            fixed = fix_seatless_hamza(row[text_col])
            if fixed != row[text_col]:
                self._conn.execute(
                    f"UPDATE {table} SET {text_col} = ? WHERE id = ?",  # noqa: S608
                    (fixed, row["id"]),
                )
                changed += 1
        return changed

    def apply_hamza_seat_fix(self) -> tuple[int, int]:
        """Rewrite definite-article seatless-hamza in ayahs/words text.

        See scraper.hamza_seat for the full rationale. Idempotent -- returns
        (0, 0) on a second run. Returns (ayahs changed, words changed).
        """
        ayahs_changed = self._fix_seatless_hamza_in("ayahs", "text_uthmani")
        words_changed = self._fix_seatless_hamza_in("words", "text_arabic")
        self._conn.commit()
        return ayahs_changed, words_changed

    def get_root_by_buckwalter(self, bw: str) -> sqlite3.Row | None:
        return self._conn.execute(
            "SELECT * FROM roots WHERE root_buckwalter = ?", (bw,)
        ).fetchone()

    def get_root_forms_raw(self, root_id: int) -> list[sqlite3.Row]:
        return self._conn.execute(
            "SELECT * FROM root_forms WHERE root_id = ? ORDER BY sort_order",
            (root_id,),
        ).fetchall()

    def get_distinct_roots(self) -> list[str]:
        return [
            r[0]
            for r in self._conn.execute(
                "SELECT DISTINCT root_buckwalter FROM words "
                "WHERE root_buckwalter IS NOT NULL ORDER BY root_buckwalter"
            ).fetchall()
        ]

    def get_all_word_annotations(self) -> list[sqlite3.Row]:
        return self._conn.execute(
            """SELECT a.surah_id, a.ayah_number, w.position,
                      w.root_buckwalter, w.pos_tag
               FROM words w JOIN ayahs a ON a.id = w.ayah_id
               ORDER BY a.surah_id, a.ayah_number, w.position"""
        ).fetchall()

    def get_all_words_with_location(self) -> list[sqlite3.Row]:
        return self._conn.execute(
            """SELECT w.id AS word_id, a.surah_id, a.ayah_number, w.position
               FROM words w JOIN ayahs a ON a.id = w.ayah_id
               ORDER BY a.surah_id, a.ayah_number, w.position"""
        ).fetchall()

    def get_ayah(self, surah_id: int, ayah_number: int) -> sqlite3.Row | None:
        return self._conn.execute(
            "SELECT id, text_uthmani FROM ayahs WHERE surah_id = ? AND ayah_number = ?",
            (surah_id, ayah_number),
        ).fetchone()

    def get_all_ayahs(self) -> list[sqlite3.Row]:
        return self._conn.execute(
            "SELECT id, surah_id, ayah_number FROM ayahs"
        ).fetchall()

    def count_words_without_segments(self) -> int:
        return int(self._conn.execute(
            "SELECT count(*) FROM words WHERE id NOT IN "
            "(SELECT DISTINCT word_id FROM word_segments)"
        ).fetchone()[0])

    def rebuild_text_arabic_from_segments(self) -> int:
        """Set words.text_arabic = concat(form_arabic ORDER BY segment_index).
        Segments are the corpus-aligned source of truth. Returns rows changed.

        ponytail: reads back via SELECT changes() rather than cursor.rowcount —
        Python's sqlite3 module reports rowcount=-1 for `WITH ... UPDATE`
        (CTE) statements since it only pattern-matches a leading UPDATE
        keyword, even though the update itself applies correctly.

        The concat is raw SQL (group_concat), so it can't call
        fix_seatless_hamza mid-query -- re-apply it to the rebuilt column
        afterward, or a fresh rebuild silently restores the seatless form
        (Greptile-flagged gap on PR #34).
        """
        self._conn.execute(_REBUILD_TEXT_ARABIC_SQL)
        changed = int(self._conn.execute("SELECT changes()").fetchone()[0])
        self._fix_seatless_hamza_in("words", "text_arabic")
        self._conn.commit()
        return changed

    def count_text_arabic_misaligned(self) -> int:
        return int(
            self._conn.execute(_COUNT_MISALIGNED_SQL).fetchone()[0]
        )

    def count_words_missing_translit(self) -> int:
        return int(self._conn.execute(
            "SELECT count(*) FROM words "
            "WHERE transliteration IS NULL OR transliteration = ''"
        ).fetchone()[0])

    def get_word_align(
        self, surah_id: int, ayah_number: int, position: int
    ) -> sqlite3.Row | None:
        return self._conn.execute(
            """SELECT w.text_arabic, w.transliteration
               FROM words w JOIN ayahs a ON a.id = w.ayah_id
               WHERE a.surah_id = ? AND a.ayah_number = ? AND w.position = ?""",
            (surah_id, ayah_number, position),
        ).fetchone()

    def close(self) -> None:
        self._conn.close()
