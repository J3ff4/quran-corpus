import sqlite3
from pathlib import Path

from scraper.db import ScraperDatabase
from scraper.mushaf_import import import_layout
from scraper.mushaf_layout import LayoutRow


def _corpus(tmp_path: Path) -> str:
    db_path = str(tmp_path / "quran.db")
    ScraperDatabase(db_path)
    con = sqlite3.connect(db_path)
    con.executescript(
        """
        INSERT INTO surahs (id, name_arabic, name_translit, name_translation,
                            revelation_type, ayah_count, order_number)
        VALUES (1,'a','A','A','meccan',2,1);
        INSERT INTO ayahs (id, surah_id, ayah_number, text_uthmani, page)
        VALUES (1,1,1,'x',99),(2,1,2,'y',99);
        INSERT INTO words (id, ayah_id, position, text_arabic) VALUES
          (1,1,1,'w'),(2,1,2,'w'),(3,2,1,'w');
        """
    )
    con.commit()
    con.close()
    return db_path


ROWS = [
    LayoutRow(1, 1, 1, 1, 1, 1, "word", "A"),
    LayoutRow(1, 1, 2, 1, 1, 2, "word", "B"),
    LayoutRow(1, 1, 3, 1, 1, 3, "end", "M"),
    LayoutRow(2, 4, 1, 1, 2, 1, "word", "C"),
    LayoutRow(2, 4, 2, 1, 2, 2, "end", "N"),
]


def test_import_writes_rows_and_derives_paging(tmp_path):
    db_path = _corpus(tmp_path)
    summary = import_layout(db_path, ROWS, repage=True)

    con = sqlite3.connect(db_path)
    assert summary.rows == 5
    assert summary.pages == 2
    assert con.execute("SELECT COUNT(*) FROM mushaf_layout").fetchone()[0] == 5
    # ayahs.page comes from the layout, never a second import of the same fact.
    assert con.execute(
        "SELECT surah_id, ayah_number, page FROM ayahs ORDER BY id"
    ).fetchall() == [(1, 1, 1), (1, 2, 2)]


def test_import_is_idempotent(tmp_path):
    """Re-running must replace, not accumulate: an importer that doubles its
    rows on a second run is one that cannot be re-run after a fix."""
    db_path = _corpus(tmp_path)
    import_layout(db_path, ROWS, repage=True)
    import_layout(db_path, ROWS, repage=True)
    con = sqlite3.connect(db_path)
    assert con.execute("SELECT COUNT(*) FROM mushaf_layout").fetchone()[0] == 5


def test_repage_false_leaves_ayahs_alone(tmp_path):
    db_path = _corpus(tmp_path)
    import_layout(db_path, ROWS, repage=False)
    con = sqlite3.connect(db_path)
    assert con.execute("SELECT DISTINCT page FROM ayahs").fetchall() == [(99,)]


def test_ayah_spanning_two_pages_takes_the_first(tmp_path):
    db_path = _corpus(tmp_path)
    rows = ROWS + [LayoutRow(3, 1, 1, 1, 1, 4, "word", "D")]
    import_layout(db_path, rows, repage=True)
    con = sqlite3.connect(db_path)
    assert con.execute(
        "SELECT page FROM ayahs WHERE surah_id=1 AND ayah_number=1"
    ).fetchone() == (1,)
