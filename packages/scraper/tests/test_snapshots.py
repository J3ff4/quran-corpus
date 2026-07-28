from __future__ import annotations

import gzip
from urllib.parse import unquote

from scraper.snapshots import (
    duplicate_key_names,
    iter_snapshot_paths,
    legacy_names_to_migrate,
    migrate_legacy_names,
    save_snapshot,
)


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


def test_migrate_renames_only_legacy_names(tmp_path):
    # Old encoder left uppercase literal; new one percent-encodes it.
    (tmp_path / "root_lHn.html.gz").write_bytes(b"legacy")
    already = save_snapshot(tmp_path, "root_qwl", "<html>ok</html>")

    moved = migrate_legacy_names(tmp_path)

    assert moved == [("root_lHn.html.gz", "root_l%48n.html.gz")]
    assert (tmp_path / "root_l%48n.html.gz").read_bytes() == b"legacy"
    assert not (tmp_path / "root_lHn.html.gz").exists()
    # A correctly-named file is left untouched, not rewritten.
    assert already.exists()


def test_migrate_is_idempotent(tmp_path):
    (tmp_path / "root_lHn.html.gz").write_bytes(b"legacy")
    assert len(migrate_legacy_names(tmp_path)) == 1
    # Second run has nothing to do -- the command is safe to re-run after a
    # partial failure, which is the only way it gets used.
    assert migrate_legacy_names(tmp_path) == []


def test_migrate_key_survives_the_rename(tmp_path):
    # The whole point: the decoded key must be identical before and after.
    (tmp_path / "root_%24TT.html.gz").write_bytes(b"legacy")
    migrate_legacy_names(tmp_path)
    names = [p.name for p in tmp_path.glob("*.html.gz")]
    assert [unquote(n.removesuffix(".html.gz")) for n in names] == ["root_$TT"]


def test_migrate_refuses_to_clobber(tmp_path):
    # Both names for one key already exist (a scrape ran after the encoder
    # change but before this migration). Overwriting would destroy whichever
    # is newer, so leave both and report nothing moved.
    (tmp_path / "root_lHn.html.gz").write_bytes(b"legacy")
    (tmp_path / "root_l%48n.html.gz").write_bytes(b"current")

    assert migrate_legacy_names(tmp_path) == []
    assert (tmp_path / "root_lHn.html.gz").read_bytes() == b"legacy"
    assert (tmp_path / "root_l%48n.html.gz").read_bytes() == b"current"


def test_migrate_refuses_to_clobber_two_legacy_names_for_one_key(tmp_path):
    # Both decode to "root_ArD", and neither is what the current encoder would
    # write ("root_%41r%44"), so the scan queues two renames onto the same
    # target -- neither saw the other's target, because the first rename is
    # what creates it. Path.rename replaces silently on POSIX, so without a
    # per-rename re-check the second snapshot is destroyed with no report.
    (tmp_path / "root_ArD.html.gz").write_bytes(b"legacyA")
    (tmp_path / "root_%41rD.html.gz").write_bytes(b"legacyB")

    moved = migrate_legacy_names(tmp_path)

    assert len(moved) == 1, "both renames ran; one snapshot was clobbered"
    survivors = sorted(p.read_bytes() for p in tmp_path.glob("*.html.gz"))
    assert survivors == [b"legacyA", b"legacyB"]


def test_duplicate_key_names_reports_what_the_migration_leaves_behind(tmp_path):
    (tmp_path / "root_lHn.html.gz").write_bytes(b"legacy")
    (tmp_path / "root_l%48n.html.gz").write_bytes(b"current")
    (tmp_path / "root_ktb.html.gz").write_bytes(b"fine")

    assert duplicate_key_names(tmp_path) == [
        ("root_lHn", ["root_l%48n.html.gz", "root_lHn.html.gz"])
    ]


def test_dry_run_promises_exactly_what_the_migration_performs(tmp_path):
    # --dry-run reports legacy_names_to_migrate while the real run reports
    # migrate_legacy_names. migrate re-checks the filesystem per rename, so if
    # only migrate declines to clobber, the dry run promises a rename that
    # never happens -- the two must agree on a clobber-protected archive.
    (tmp_path / "root_lHn.html.gz").write_bytes(b"legacy")
    (tmp_path / "root_l%48n.html.gz").write_bytes(b"current")

    assert legacy_names_to_migrate(tmp_path) == []
    assert migrate_legacy_names(tmp_path) == []


def test_iter_snapshot_paths_prefers_canonical_when_it_sorts_last(tmp_path):
    # The real legacy encoder only left uppercase literal, and every uppercase
    # byte sorts after '%', so the canonical name happens to come first in the
    # glob. Nothing guarantees that: '!' (0x21) sorts before '%' (0x25). Pin
    # the preference to the encoding rather than to alphabetical luck.
    (tmp_path / "root_!ktb.html.gz").write_bytes(b"legacy")
    (tmp_path / "root_%21ktb.html.gz").write_bytes(b"current")
    assert sorted(p.name for p in tmp_path.glob("*.html.gz"))[0] == (
        "root_!ktb.html.gz"
    ), "fixture no longer puts the legacy name first"

    got = list(iter_snapshot_paths(tmp_path))

    assert [k for k, _ in got] == ["root_!ktb"]
    assert got[0][1].read_bytes() == b"current", "stale legacy twin preferred"


def test_iter_snapshot_paths_yields_one_path_per_key(tmp_path):
    # "root_l%48n" is what the current encoder writes, so it is the fresher of
    # the two; plain filename order would have yielded it first and let the
    # legacy twin overwrite it downstream.
    (tmp_path / "root_lHn.html.gz").write_bytes(b"legacy")
    (tmp_path / "root_l%48n.html.gz").write_bytes(b"current")

    got = list(iter_snapshot_paths(tmp_path))

    assert [k for k, _ in got] == ["root_lHn"]
    assert got[0][1].name == "root_l%48n.html.gz", "stale legacy twin preferred"
