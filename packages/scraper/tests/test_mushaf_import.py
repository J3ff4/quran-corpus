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


def test_cli_creates_the_table_on_a_corpus_that_predates_it(tmp_path):
    """Every existing corpus DB was built before mushaf_layout existed, so the
    command has to apply the schema itself rather than assume the table."""
    from click.testing import CliRunner

    from scraper.cli import main

    db_path = _corpus(tmp_path)
    con = sqlite3.connect(db_path)
    con.execute("DROP TABLE mushaf_layout")
    con.commit()
    con.close()

    layout = tmp_path / "layout"
    layout.mkdir()
    # 1:1 has two corpus words, 1:2 has one -- the payload must agree exactly.
    (layout / "001.json").write_text(
        '{"verses":[{"verse_key":"1:1","words":['
        '{"position":1,"char_type_name":"word","line_number":1,"code_v2":"A",'
        '"line_number":1,"page_number":1},'
        '{"position":2,"char_type_name":"word","line_number":1,"code_v2":"B",'
        '"line_number":1,"page_number":1},'
        '{"position":3,"char_type_name":"end","line_number":1,"code_v2":"M",'
        '"line_number":1,"page_number":1}]},'
        '{"verse_key":"1:2","words":['
        '{"position":1,"char_type_name":"word","line_number":1,"code_v2":"C",'
        '"line_number":2,"page_number":1},'
        '{"position":2,"char_type_name":"end","line_number":1,"code_v2":"N",'
        '"line_number":2,"page_number":1}]}]}',
        encoding="utf-8",
    )
    overrides = tmp_path / "none.tsv"
    overrides.write_text("# none\n", encoding="utf-8")

    result = CliRunner().invoke(
        main,
        [
            "import-mushaf",
            str(layout),
            "--db",
            db_path,
            "--overrides",
            str(overrides),
            # A two-ayah fixture is 2 of 604 pages; the completeness gate is
            # what test_cli_refuses_a_partial_layout below covers.
            "--allow-partial",
        ],
    )
    assert result.exit_code == 0, result.output
    con = sqlite3.connect(db_path)
    assert con.execute("SELECT COUNT(*) FROM mushaf_layout").fetchone()[0] == 5
    assert con.execute("SELECT DISTINCT page FROM ayahs").fetchall() == [(1,)]


def test_cli_refuses_a_partial_layout_and_writes_nothing(tmp_path):
    """import_layout DELETEs the whole table before inserting, so a wrong or
    half-fetched --layout_dir would otherwise wipe the layout and exit 0."""
    from click.testing import CliRunner

    from scraper.cli import main

    db_path = _corpus(tmp_path)
    con = sqlite3.connect(db_path)
    con.execute(
        """INSERT INTO mushaf_layout
               (page, line, seq, surah_id, ayah_number, position, char_type, glyph)
           VALUES (1, 1, 1, 1, 1, 1, 'word', 'A')"""
    )
    con.commit()
    con.close()

    empty = tmp_path / "empty-layout"
    empty.mkdir()
    overrides = tmp_path / "none.tsv"
    overrides.write_text("# none\n", encoding="utf-8")

    result = CliRunner().invoke(
        main,
        ["import-mushaf", str(empty), "--db", db_path, "--overrides", str(overrides)],
    )
    assert result.exit_code != 0
    assert "604 of 604 pages have no rows" in result.output

    con = sqlite3.connect(db_path)
    surviving = con.execute("SELECT COUNT(*) FROM mushaf_layout").fetchone()[0]
    con.close()
    assert surviving == 1, "the pre-existing layout row was wiped"


def test_cli_refuses_a_missing_overrides_file(tmp_path):
    """--overrides defaults to a path relative to packages/scraper, so running
    from anywhere else must say so rather than raise FileNotFoundError."""
    from click.testing import CliRunner

    from scraper.cli import main

    result = CliRunner().invoke(
        main,
        [
            "import-mushaf",
            str(tmp_path),
            "--db",
            _corpus(tmp_path),
            "--overrides",
            str(tmp_path / "nope.tsv"),
        ],
    )
    assert result.exit_code != 0
    assert "overrides file not found" in result.output
