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
