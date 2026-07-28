from __future__ import annotations

import gzip
import subprocess
import sys
from pathlib import Path

from scraper.db import ScraperDatabase
from scraper.replay import replay_root_snapshots
from scraper.snapshots import save_snapshot

_ONE_FORM_HTML = (
    '<html><body>The triliteral root hamza rā ḍād '
    '(<span class="at">أ ر ض</span>) occurs 461 times in the Quran as the '
    'noun <i class="ab">arḍ</i> (<span class="at">أَرْض</span>).</body></html>'
)


def test_replay_writes_roots_and_forms(tmp_path):
    save_snapshot(tmp_path / "snaps", "root_ArD", _ONE_FORM_HTML)
    db = ScraperDatabase(str(tmp_path / "t.db"))

    updated, bad, unreadable = replay_root_snapshots(tmp_path / "snaps", db)

    assert (updated, bad, unreadable) == (1, 0, 0)
    row = db._conn.execute(
        "SELECT root_arabic, occurrence_count FROM roots"
        " WHERE root_buckwalter='ArD'"
    ).fetchone()
    assert (row[0], row[1]) == ("أرض", 461)
    form = db._conn.execute(
        "SELECT pos_label, form_arabic, occurrence_count FROM root_forms"
    ).fetchone()
    assert tuple(form) == ("Noun", "أَرْض", 461)
    db.close()


def test_replay_import_chain_is_network_free():
    # The entire value of this path is that it costs zero requests (§11).
    # Poisoning httpx would pass vacuously -- replay never imports it, so the
    # patch guards nothing. Assert the real invariant instead: no network
    # module anywhere in the transitive import chain. A fresh interpreter,
    # because pytest's own imports have already polluted this one's
    # sys.modules. This fails the moment someone adds a fetch to the path.
    #
    # HTTP clients only, not socket/ssl: pydantic imports asyncio, which pulls
    # both in transitively, so they would flag on any chain touching a model.
    probe = (
        "import sys, scraper.replay;"
        " print(sorted({m for m in sys.modules}"
        " & {'httpx', 'httpcore', 'requests', 'urllib3', 'urllib.request'}))"
    )
    # noqa S603: no untrusted input -- this interpreter, a literal probe.
    out = subprocess.run(  # noqa: S603
        [sys.executable, "-c", probe],
        capture_output=True, text=True, check=True,
        cwd=Path(__file__).resolve().parent.parent,
    )
    assert out.stdout.strip() == "[]", out.stdout


def test_replay_counts_unparseable_without_touching_the_db(tmp_path):
    # A 404 or a redesigned page parses to None. It must be reported, not
    # written as an empty root -- a silent empty row is the phase-17 bug class.
    save_snapshot(tmp_path / "snaps", "root_zzz", "<html><body>404</body></html>")
    db = ScraperDatabase(str(tmp_path / "t.db"))

    assert replay_root_snapshots(tmp_path / "snaps", db) == (0, 1, 0)

    assert db._conn.execute("SELECT COUNT(*) FROM roots").fetchone()[0] == 0
    db.close()


def test_replay_is_idempotent(tmp_path):
    save_snapshot(tmp_path / "snaps", "root_ArD", _ONE_FORM_HTML)
    db = ScraperDatabase(str(tmp_path / "t.db"))
    replay_root_snapshots(tmp_path / "snaps", db)
    replay_root_snapshots(tmp_path / "snaps", db)
    # Second pass must update in place, not duplicate.
    assert db._conn.execute("SELECT COUNT(*) FROM roots").fetchone()[0] == 1
    assert db._conn.execute("SELECT COUNT(*) FROM root_forms").fetchone()[0] == 1
    db.close()


def test_replay_recovers_the_key_through_percent_encoding(tmp_path):
    # Buckwalter roots use $ ' > < & } * -- the round-trip through the
    # filename is what makes replay possible at all.
    save_snapshot(tmp_path / "snaps", "root_$El", _ONE_FORM_HTML)
    db = ScraperDatabase(str(tmp_path / "t.db"))
    replay_root_snapshots(tmp_path / "snaps", db)
    assert db._conn.execute(
        "SELECT root_buckwalter FROM roots"
    ).fetchone()[0] == "$El"
    db.close()


def test_replay_prefers_the_canonical_name_over_a_stale_legacy_twin(tmp_path):
    # A key can own two files: the migration refuses to clobber, so a legacy
    # name survives beside a current-encoder one. Filename order puts '%'
    # (0x25) before 'A' (0x41), so a naive walk applies the STALE legacy copy
    # last and silently reverts the fresh scrape -- including levelling a
    # hamza seat back down, which the 2026-07-28 ruling forbids.
    snaps = tmp_path / "snaps"
    save_snapshot(snaps, "root_ArD", _ONE_FORM_HTML)  # canonical: %41r%44
    stale = _ONE_FORM_HTML.replace("أ ر ض", "ا ر ض").replace("461", "99")
    with gzip.open(snaps / "root_ArD.html.gz", "wt", encoding="utf-8") as fh:
        fh.write(stale)
    db = ScraperDatabase(str(tmp_path / "t.db"))

    assert replay_root_snapshots(snaps, db) == (1, 0, 0)  # one root, not two

    row = db._conn.execute(
        "SELECT root_arabic, occurrence_count FROM roots"
    ).fetchone()
    assert (row[0], row[1]) == ("أرض", 461), "stale legacy twin won"
    db.close()


def test_replay_counts_an_unreadable_snapshot_without_aborting(tmp_path):
    # One truncated .html.gz must not abandon the other 1641 roots.
    snaps = tmp_path / "snaps"
    save_snapshot(snaps, "root_ArD", _ONE_FORM_HTML)
    (snaps / "root_zzz.html.gz").write_bytes(b"not gzip at all")
    db = ScraperDatabase(str(tmp_path / "t.db"))

    assert replay_root_snapshots(snaps, db) == (1, 0, 1)

    assert db._conn.execute("SELECT COUNT(*) FROM roots").fetchone()[0] == 1
    db.close()


def test_replay_survives_a_corrupt_deflate_stream(tmp_path):
    # Bitrot under an intact gzip header raises zlib.error, which derives from
    # Exception -- not OSError. Catching OSError/EOFError alone lets a single
    # flipped bit abort the archive partway through.
    snaps = tmp_path / "snaps"
    save_snapshot(snaps, "root_ArD", _ONE_FORM_HTML)
    rotted = snaps / "root_zzz.html.gz"
    save_snapshot(snaps, "root_zzz", "<html>" + "x" * 5000 + "</html>")
    raw = bytearray(rotted.read_bytes())
    for i in range(20, 60):  # smash deflate blocks, leave header and trailer
        raw[i] ^= 0xFF
    rotted.write_bytes(bytes(raw))
    db = ScraperDatabase(str(tmp_path / "t.db"))

    assert replay_root_snapshots(snaps, db) == (1, 0, 1)
    db.close()


def test_replay_survives_a_non_utf8_snapshot(tmp_path):
    # Valid gzip, undecodable payload: UnicodeDecodeError derives from
    # ValueError, so it escapes an OSError-only guard too.
    snaps = tmp_path / "snaps"
    save_snapshot(snaps, "root_ArD", _ONE_FORM_HTML)
    with gzip.open(snaps / "root_zzz.html.gz", "wb") as fh:
        fh.write(b"<html>\xff\xfe</html>")
    db = ScraperDatabase(str(tmp_path / "t.db"))

    assert replay_root_snapshots(snaps, db) == (1, 0, 1)
    db.close()
