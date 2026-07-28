from __future__ import annotations

from pathlib import Path

from scraper.db import ScraperDatabase
from scraper.models import RootModel
from scraper.sources.lane import import_lane_definitions, normalize_slash_spacing

FIX = Path(__file__).parent / "fixtures"


def test_normalize_slash_spacing_inserts_space_after_unspaced_slash():
    assert (
        normalize_slash_spacing("abandon/desert/relinquish")
        == "abandon/ desert/ relinquish"
    )


def test_normalize_slash_spacing_leaves_already_spaced_slash_alone():
    assert normalize_slash_spacing("rise/ stand up") == "rise/ stand up"


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


def test_import_lane_does_not_revert_a_scraped_hamza_seat(tmp_path):
    from scraper.db import ScraperDatabase
    from scraper.models import RootModel
    from scraper.sources.lane import import_lane_definitions

    db = ScraperDatabase(str(tmp_path / "t.db"))
    db.upsert_root(
        RootModel(root_buckwalter="ArD", root_arabic="أرض", occurrence_count=461)
    )
    tsv = tmp_path / "lane.tsv"
    tsv.write_text("ArD\tearth/land\n", encoding="utf-8")

    assert import_lane_definitions(tsv, db) == 1

    row = db._conn.execute(
        "SELECT root_arabic, occurrence_count FROM roots"
        " WHERE root_buckwalter='ArD'"
    ).fetchone()
    # Lane is an additive definitions layer. It is not an authority on
    # spelling or counts, and re-running it must not undo the scrape.
    assert (row[0], row[1]) == ("أرض", 461)
    db.close()


def test_import_lane_still_creates_a_missing_root(tmp_path):
    from scraper.db import ScraperDatabase
    from scraper.sources.lane import import_lane_definitions

    db = ScraperDatabase(str(tmp_path / "t.db"))
    tsv = tmp_path / "lane.tsv"
    tsv.write_text("ktb\twrite/inscribe\n", encoding="utf-8")

    assert import_lane_definitions(tsv, db) == 1

    # Definitions must still be loadable before the dictionary scrape runs.
    row = db._conn.execute(
        "SELECT root_arabic FROM roots WHERE root_buckwalter='ktb'"
    ).fetchone()
    assert row is not None
    db.close()
