import sqlite3
import sys

import pytest

from scraper.sources.lane_tei import VOLUMES
from tools import prepare_lane_glosses
from tools.prepare_lane_glosses import build_rows, review_rows

ENTRY = (
    '<div2 n="Sbg" type="root"><entryFree><form><orth lang="ar">Sabag</orth></form>'
    ' (S,) <hi rend="ital">He dyed it, or coloured it.</hi></entryFree></div2>'
)
NO_GLOSS = (
    '<div2 n="Sxx" type="root"><entryFree><form><itype>2</itype>'
    '<orth lang="ar">x</orth></form> <hi rend="ital">q. v.</hi></entryFree></div2>'
)


def test_build_rows_keeps_a_root_with_a_gloss():
    rows, quarantined, stats = build_rows({"Sbg": ENTRY}, ["Sbg"])
    assert rows == [("Sbg", "He dyed it, or coloured it")]
    assert quarantined == [] and stats["kept"] == 1


def test_build_rows_quarantines_a_root_lane_does_not_hold():
    rows, quarantined, stats = build_rows({"Sbg": ENTRY}, ["hmn"])
    assert rows == []
    assert quarantined == [("hmn", "not_in_lane")]
    assert stats["not_in_lane"] == 1


def test_build_rows_quarantines_an_entry_that_yields_no_gloss():
    rows, quarantined, stats = build_rows({"Sxx": NO_GLOSS}, ["Sxx"])
    assert rows == []
    assert quarantined == [("Sxx", "no_gloss")]


def test_build_rows_resolves_a_geminate_through_lanes_two_letter_key():
    rows, _, _ = build_rows({"Sb": ENTRY}, ["Sbb"])
    assert rows == [("Sbb", "He dyed it, or coloured it")]


def test_load_rejects_reads_the_roots_and_skips_comments(tmp_path):
    path = tmp_path / "r.txt"
    path.write_text("# why\nSlw\tprayer sense is form II\nbED\tgnats\n", "utf-8")
    assert prepare_lane_glosses.load_rejects(path) == {"Slw", "bED"}


def test_load_targets_drops_a_hand_rejected_root(tmp_path):
    # import-lane upserts, so a re-run would reinstate every gloss the phase-21
    # gate rejected -- they carry no row to exclude them by source.
    db = tmp_path / "q.db"
    conn = sqlite3.connect(db)
    conn.executescript(
        """CREATE TABLE roots (id INTEGER PRIMARY KEY, root_buckwalter TEXT,
               occurrence_count INTEGER);
           CREATE TABLE root_definitions (root_id INTEGER, source TEXT);
           INSERT INTO roots VALUES (1, 'Slw', 99), (2, 'Sbg', 5);"""
    )
    conn.commit()
    conn.close()
    assert prepare_lane_glosses.load_targets(db, rejects={"Slw"}) == ["Sbg"]


@pytest.mark.parametrize("source", ["lane", "qurandev-lane", "perseus-lane"])
def test_load_targets_skips_a_root_that_already_credits_lane(tmp_path, source):
    db = tmp_path / f"{source}.db"
    conn = sqlite3.connect(db)
    conn.executescript(
        """CREATE TABLE roots (id INTEGER PRIMARY KEY, root_buckwalter TEXT,
               occurrence_count INTEGER);
           CREATE TABLE root_definitions (root_id INTEGER, source TEXT);
           INSERT INTO roots VALUES (1, 'Sbg', 5);"""
    )
    conn.execute("INSERT INTO root_definitions VALUES (1, ?)", (source,))
    conn.commit()
    conn.close()
    assert prepare_lane_glosses.load_targets(db, rejects=set()) == []


@pytest.mark.parametrize(
    ("source", "expected"), [("perseus-lane", ["Sbg"]), ("qurandev-lane", [])]
)
def test_refresh_reopens_only_this_tools_own_rows(tmp_path, source, expected):
    # An extractor improvement has to reach the roots already imported, but a
    # row another importer wrote is not this tool's to overwrite.
    db = tmp_path / f"{source}-refresh.db"
    conn = sqlite3.connect(db)
    conn.executescript(
        """CREATE TABLE roots (id INTEGER PRIMARY KEY, root_buckwalter TEXT,
               occurrence_count INTEGER);
           CREATE TABLE root_definitions (root_id INTEGER, source TEXT);
           INSERT INTO roots VALUES (1, 'Sbg', 5);"""
    )
    conn.execute("INSERT INTO root_definitions VALUES (1, ?)", (source,))
    conn.commit()
    conn.close()
    targets = prepare_lane_glosses.load_targets(db, rejects=set(), refresh=True)
    assert targets == expected


def test_refresh_still_honours_the_reject_list(tmp_path):
    db = tmp_path / "reject-refresh.db"
    conn = sqlite3.connect(db)
    conn.executescript(
        """CREATE TABLE roots (id INTEGER PRIMARY KEY, root_buckwalter TEXT,
               occurrence_count INTEGER);
           CREATE TABLE root_definitions (root_id INTEGER, source TEXT);
           INSERT INTO roots VALUES (1, 'Slw', 99);
           INSERT INTO root_definitions VALUES (1, 'perseus-lane');"""
    )
    conn.commit()
    conn.close()
    assert prepare_lane_glosses.load_targets(db, rejects={"Slw"}, refresh=True) == []


def test_build_rows_raises_on_an_empty_index():
    with pytest.raises(ValueError, match="empty Lane index"):
        build_rows({}, ["Sbg"])


def test_build_rows_raises_on_a_gloss_holding_a_tsv_delimiter(monkeypatch):
    # extract_gloss collapses whitespace today, which is exactly why this is
    # checked rather than assumed: one tab shifts every later column and
    # `import-lane` lands one root's text on another.
    monkeypatch.setattr(prepare_lane_glosses, "extract_gloss", lambda _e: "a\tb")
    with pytest.raises(ValueError, match="delimiter"):
        build_rows({"Sbg": ENTRY}, ["Sbg"])


def test_review_rows_names_the_key_a_non_direct_match_came_from():
    # The human gate has to spot glosses that resolved through a collapsed key
    # without reading all 36 volumes.
    index = {"Sb": ENTRY}
    rows, quarantined, _ = build_rows(index, ["Sbb", "hmn"])
    assert review_rows(index, rows, quarantined) == [
        ("Sbb", "kept", "Sb", "He dyed it, or coloured it"),
        ("hmn", "not_in_lane", "", ""),
    ]


def test_review_rows_flags_a_degenerate_short_gloss():
    # The failure mode is short-and-plausible, not empty: نطق shipped as "bar"
    # off a wrongly-selected entry block, on a direct key, so via_key was blank.
    assert review_rows({"Sbg": ENTRY}, [("Sbg", "bar")], []) == [
        ("Sbg", "kept_short", "", "bar")
    ]


def test_review_rows_leaves_via_key_empty_for_a_direct_match():
    index = {"Sbg": ENTRY}
    rows, quarantined, _ = build_rows(index, ["Sbg"])
    assert review_rows(index, rows, quarantined) == [
        ("Sbg", "kept", "", "He dyed it, or coloured it")
    ]


def test_stale_rows_names_a_live_row_a_refresh_stopped_re_deriving(tmp_path):
    # import-lane only upserts. A root that stops yielding a gloss is counted
    # under no_gloss and left out of the TSV, which reads as "dropped" -- but the
    # old definition stays live and the run still reports success.
    db = tmp_path / "q.db"
    conn = sqlite3.connect(db)
    conn.executescript(
        """CREATE TABLE roots (id INTEGER PRIMARY KEY, root_buckwalter TEXT,
               occurrence_count INTEGER);
           CREATE TABLE root_definitions (root_id INTEGER, source TEXT);
           INSERT INTO roots VALUES (1, 'Slw', 99), (2, 'Sbg', 5);
           INSERT INTO root_definitions VALUES (1, 'perseus-lane'),
               (2, 'perseus-lane');"""
    )
    conn.commit()
    conn.close()
    assert prepare_lane_glosses.stale_rows(db, [("Sbg", "He dyed it")]) == ["Slw"]
    assert prepare_lane_glosses.stale_rows(db, [("Slw", "x"), ("Sbg", "y")]) == []


def _cli_fixture(tmp_path, *, roots_sql: str) -> tuple:
    """A 36-volume XML dir and a DB, the two inputs main() parses paths to."""
    xml_dir = tmp_path / "tei"
    xml_dir.mkdir()
    for name in VOLUMES:
        body = ENTRY if name == "_S0.xml" else ""
        (xml_dir / name).write_text(
            f"<?xml version='1.0'?><TEI.2><text><body>{body}</body></text></TEI.2>",
            encoding="utf-8",
        )
    db = tmp_path / "q.db"
    conn = sqlite3.connect(db)
    conn.executescript(
        """CREATE TABLE roots (id INTEGER PRIMARY KEY, root_buckwalter TEXT,
               occurrence_count INTEGER);
           CREATE TABLE root_definitions (root_id INTEGER, source TEXT);"""
        + roots_sql
    )
    conn.commit()
    conn.close()
    return xml_dir, db, tmp_path / "out.tsv", tmp_path / "review.tsv"


def _run_main(monkeypatch, xml_dir, db, out, review, *extra):
    argv = [
        "prepare_lane_glosses",
        str(xml_dir),
        "--db",
        str(db),
        "--out",
        str(out),
        "--review",
        str(review),
        *extra,
    ]
    monkeypatch.setattr(sys, "argv", argv)
    prepare_lane_glosses.main()


def test_main_writes_both_tsvs_and_summarises(tmp_path, monkeypatch, capsys):
    # Everything above is unit-tested through direct calls; argparse, the two
    # file writes and the summary line had no test at all, which is how phase 20
    # shipped an untested main() on this same tool.
    xml_dir, db, out, review = _cli_fixture(
        tmp_path, roots_sql="INSERT INTO roots VALUES (1, 'Sbg', 9), (2, 'hmn', 4);"
    )

    _run_main(monkeypatch, xml_dir, db, out, review)

    assert out.read_text("utf-8") == "Sbg\tHe dyed it, or coloured it\n"
    lines = review.read_text("utf-8").splitlines()
    assert lines[0] == "root\tstatus\tvia_key\tgloss"
    assert "hmn\tnot_in_lane" in review.read_text("utf-8")
    summary = capsys.readouterr().out
    assert "1 kept of 2 targets (1 not in Lane, 0 no gloss" in summary
    assert "WARNING" not in summary  # no --refresh, so no stale check


def test_main_refresh_warns_about_rows_it_no_longer_re_derives(
    tmp_path, monkeypatch, capsys
):
    # --refresh reopens this tool's own rows; one that stops yielding a gloss is
    # simply absent from the TSV, and import-lane's upsert leaves it live.
    xml_dir, db, out, review = _cli_fixture(
        tmp_path,
        roots_sql="""INSERT INTO roots VALUES (1, 'Sbg', 9), (2, 'Slw', 7),
                         (3, 'gone', 5);
                     INSERT INTO root_definitions VALUES (1, 'perseus-lane'),
                         (3, 'perseus-lane');""",
    )

    _run_main(monkeypatch, xml_dir, db, out, review, "--refresh")

    out_text = capsys.readouterr().out
    assert "WARNING: 1 live perseus-lane row(s) no longer re-derive" in out_text
    assert "gone" in out_text
    # Slw is in the checked-in reject list, so --refresh must not reinstate it.
    # Asserted against review.tsv, not out.tsv: this fixture holds no Lane entry
    # for Slw either way, so out.tsv stays clean even if the reject filter stops
    # working -- an unfiltered Slw would surface here as a not_in_lane row.
    assert "Slw" not in review.read_text("utf-8")
