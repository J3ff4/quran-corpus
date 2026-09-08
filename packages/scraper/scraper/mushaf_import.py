"""Write the parsed layout to SQLite and derive `ayahs.page` from it."""

import sqlite3
from typing import NamedTuple

from .mushaf_layout import LayoutRow


class ImportSummary(NamedTuple):
    rows: int
    pages: int
    repaged: int


# `ayahs.page` is DERIVED, never imported twice: MIN(page) over the ayah's own
# layout rows. An ayah that spans a page break belongs to the page it starts on,
# which is what page browsing in packages/data already assumes.
_REPAGE_SQL = """
UPDATE ayahs
   SET page = (SELECT MIN(ml.page) FROM mushaf_layout ml
                WHERE ml.surah_id = ayahs.surah_id
                  AND ml.ayah_number = ayahs.ayah_number)
 WHERE EXISTS (SELECT 1 FROM mushaf_layout ml
                WHERE ml.surah_id = ayahs.surah_id
                  AND ml.ayah_number = ayahs.ayah_number)
"""


def word_counts(con: sqlite3.Connection) -> dict[tuple[int, int], int]:
    """`(surah, ayah) -> COUNT(*)` from `words`, for validate_rows."""
    return {
        (surah, ayah): count
        for surah, ayah, count in con.execute(
            """SELECT a.surah_id, a.ayah_number, COUNT(w.id)
                 FROM ayahs a JOIN words w ON w.ayah_id = a.id
                GROUP BY a.surah_id, a.ayah_number"""
        )
    }


def import_layout(
    db_path: str, rows: list[LayoutRow], *, repage: bool
) -> ImportSummary:
    """Replace the layout wholesale, in one transaction.

    DELETE-then-INSERT rather than upsert: the layout is one indivisible
    edition, and a partial overwrite would leave rows from two imports keyed
    (page, line, seq) with no way to tell them apart. Quarantine is not delete
    -- an upsert here would strand exactly the rows a re-import exists to drop.
    """
    con = sqlite3.connect(db_path)
    try:
        with con:  # one transaction; a failure rolls the whole import back
            con.execute("DELETE FROM mushaf_layout")
            con.executemany(
                """INSERT INTO mushaf_layout
                       (page, line, seq, surah_id, ayah_number, position,
                        char_type, glyph)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                [tuple(r) for r in rows],
            )
            repaged = 0
            if repage:
                repaged = con.execute(_REPAGE_SQL).rowcount
        pages = con.execute(
            "SELECT COUNT(DISTINCT page) FROM mushaf_layout"
        ).fetchone()[0]
        return ImportSummary(rows=len(rows), pages=pages, repaged=repaged)
    finally:
        con.close()
