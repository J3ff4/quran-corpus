import sqlite3
from pathlib import Path

from .models import (
    AyahModel,
    LanguageModel,
    SurahModel,
    TranslationModel,
    WordGlossModel,
    WordModel,
)

# schema.sql lives at packages/data/schema.sql — single source of truth for DDL
_SCHEMA_PATH = Path(__file__).parents[2] / "data" / "schema.sql"


class ScraperDatabase:
    def __init__(self, db_path: str) -> None:
        self._conn = sqlite3.connect(db_path)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.execute("PRAGMA journal_mode = WAL")
        self._apply_schema()

    def _apply_schema(self) -> None:
        sql = _SCHEMA_PATH.read_text()
        for stmt in sql.split(";"):
            stmt = stmt.strip()
            if stmt and not stmt.upper().startswith("PRAGMA"):
                self._conn.execute(stmt)
        self._conn.commit()

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
                   pos_tag,
                   morphology_json
               )
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(ayah_id, position) DO UPDATE SET
                 text_arabic     = excluded.text_arabic,
                 transliteration = excluded.transliteration,
                 root            = excluded.root,
                 lemma           = excluded.lemma,
                 pos_tag         = excluded.pos_tag,
                 morphology_json = excluded.morphology_json
               RETURNING id""",
            (
                word.ayah_id,
                word.position,
                word.text_arabic,
                word.transliteration,
                word.root,
                word.lemma,
                word.pos_tag,
                word.morphology_json,
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

    def close(self) -> None:
        self._conn.close()
