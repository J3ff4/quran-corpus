from __future__ import annotations

import gzip
from urllib.parse import unquote

from scraper.snapshots import save_snapshot


def test_snapshot_round_trips(tmp_path) -> None:
    p = save_snapshot(tmp_path, "root_ktb", "<html>ك ت ب</html>")
    assert p.exists()
    with gzip.open(p, "rt", encoding="utf-8") as fh:
        assert fh.read() == "<html>ك ت ب</html>"


def test_buckwalter_keys_do_not_collide(tmp_path) -> None:
    # Buckwalter uses $ ' > < & } * -- none are filesystem-safe, and naive
    # sanitising would map "$El" and "'El" onto the same file.
    a = save_snapshot(tmp_path, "root_$El", "dollar")
    b = save_snapshot(tmp_path, "root_'El", "apostrophe")
    assert a != b
    with gzip.open(a, "rt", encoding="utf-8") as fh:
        assert fh.read() == "dollar"
    with gzip.open(b, "rt", encoding="utf-8") as fh:
        assert fh.read() == "apostrophe"


def test_case_differing_keys_do_not_collide(tmp_path) -> None:
    # Buckwalter distinguishes roots by letter case alone: $TT and $tt are
    # different roots. Filenames must differ even ignoring case, or a
    # case-insensitive filesystem keeps only whichever was scraped last.
    a = save_snapshot(tmp_path, "root_$TT", "upper")
    b = save_snapshot(tmp_path, "root_$tt", "lower")
    assert a.name.lower() != b.name.lower()
    with gzip.open(a, "rt", encoding="utf-8") as fh:
        assert fh.read() == "upper"
    with gzip.open(b, "rt", encoding="utf-8") as fh:
        assert fh.read() == "lower"


def test_key_is_recoverable_from_filename(tmp_path) -> None:
    p = save_snapshot(tmp_path, "root_$TT", "x")
    assert unquote(p.name.removesuffix(".html.gz")) == "root_$TT"


def test_creates_directory_and_overwrites(tmp_path) -> None:
    d = tmp_path / "nested" / "snaps"
    save_snapshot(d, "root_ktb", "first")
    p = save_snapshot(d, "root_ktb", "second")
    with gzip.open(p, "rt", encoding="utf-8") as fh:
        assert fh.read() == "second"
