"""Shared test fixtures."""

from __future__ import annotations

from pathlib import Path

from scraper.db import ScraperDatabase


def make_corpus(path: Path, words: dict[tuple[int, int], list[str]]) -> None:
    """A real corpus DB via ScraperDatabase, so the schema is schema.sql's."""
    db = ScraperDatabase(str(path))
    con = db.connection
    for (surah, ayah), texts in words.items():
        con.execute(
            "INSERT OR IGNORE INTO surahs (id, name_arabic, name_translit,"
            " name_translation, revelation_type, ayah_count, order_number)"
            " VALUES (?,?,?,?,'meccan',?,?)",
            (surah, "س", "s", "S", len(words), surah),
        )
        cur = con.execute(
            "INSERT INTO ayahs (surah_id, ayah_number, text_uthmani) VALUES (?,?,?)",
            (surah, ayah, " ".join(texts)),
        )
        for position, text in enumerate(texts, start=1):
            con.execute(
                "INSERT INTO words (ayah_id, position, text_arabic) VALUES (?,?,?)",
                (cur.lastrowid, position, text),
            )
    con.commit()
    db.close()
