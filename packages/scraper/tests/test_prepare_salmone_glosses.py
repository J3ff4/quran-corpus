import sqlite3
import sys

import pytest

from scraper.sources.salmone import build_index
from tools import prepare_salmone_glosses
from tools.prepare_salmone_glosses import build_rows, review_rows

ENTRY = (
    '<entryFree key="SabaE"><sense>Pointed at, out.</sense></entryFree>'
    '<entryFree key="A^aSobaEu"><sense>Finger; digit.</sense></entryFree>'
)

BED = (
    '<entryFree key="baEaDa"><sense>Stung ( mosquito ).</sense></entryFree>'
    '<entryFree key="baEoD"><sense>Part, portion, lot.</sense></entryFree>'
)


def _db(tmp_path, roots_sql):
    db = tmp_path / "q.db"
    conn = sqlite3.connect(db)
    conn.executescript(
        """CREATE TABLE roots (id INTEGER PRIMARY KEY, root_buckwalter TEXT,
               occurrence_count INTEGER);
           CREATE TABLE root_definitions (root_id INTEGER, source TEXT);
           CREATE TABLE word_segments (root TEXT, form_buckwalter TEXT,
               pos_tag TEXT);"""
        + roots_sql
    )
    conn.commit()
    conn.close()
    return db


def test_build_rows_takes_the_sense_for_the_commonest_corpus_form():
    rows, quarantined, stats = build_rows(
        {"SbE": ENTRY}, ["SbE"], {"SbE": {">aSa`biEa": 2}}, {"SbE": 1.0}
    )
    assert rows == [("SbE", "Finger; digit.")]
    assert quarantined == [] and stats["glossed"] == 1


def test_build_rows_applies_the_nominal_filter_above_the_threshold():
    # No corpus form matches, so document order would pick the verb. A root the
    # corpus uses nominally must not lead with it. This is the بعض failure.
    nominal, _, _ = build_rows({"bED": BED}, ["bED"], {"bED": {}}, {"bED": 0.95})
    verbal, _, _ = build_rows({"bED": BED}, ["bED"], {"bED": {}}, {"bED": 0.10})
    assert nominal == [("bED", "Part, portion, lot.")]
    assert verbal == [("bED", "Stung ( mosquito ).")]


def test_build_rows_quarantines_a_root_salmone_does_not_hold():
    rows, quarantined, stats = build_rows({"SbE": ENTRY}, ["hmn"], {"hmn": {}}, {})
    assert rows == [] and quarantined == [("hmn", "not_in_salmone", "")]
    assert stats["not_in_salmone"] == 1


def test_build_rows_raises_on_an_empty_index():
    with pytest.raises(ValueError, match="empty Salmon"):
        build_rows({}, ["SbE"], {}, {})


def test_build_rows_raises_on_a_gloss_holding_a_tsv_delimiter(monkeypatch):
    # Both output files are delimiter-separated with no quoting, and import-lane
    # splits on the first tab -- one tab lands one root's text on another.
    monkeypatch.setattr(
        prepare_salmone_glosses,
        "select_sense",
        lambda _e, _f, prefer_nominal=False: ("k", "a\tb", 1, False),
    )
    with pytest.raises(ValueError, match="delimiter"):
        build_rows({"SbE": ENTRY}, ["SbE"], {"SbE": {}}, {})


def test_build_rows_raises_on_a_key_holding_a_tsv_delimiter(monkeypatch):
    # `key` is a regex capture off the raw XML, not attribute-normalised, so a
    # literal tab in a vendored `key="..."` must be caught same as a gloss --
    # it flows into review.tsv as its own column via review_rows/main().
    monkeypatch.setattr(
        prepare_salmone_glosses,
        "select_sense",
        lambda _e, _f, prefer_nominal=False: ("bad\tkey", "a", 1, False),
    )
    with pytest.raises(ValueError, match="delimiter"):
        build_rows({"SbE": ENTRY}, ["SbE"], {"SbE": {}}, {})


def test_build_rows_raises_on_a_root_holding_a_tsv_delimiter(monkeypatch):
    # The root is column one of both files, so a delimiter in it shifts every
    # column after it -- import-lane would store the gloss under a short root.
    monkeypatch.setattr(prepare_salmone_glosses, "lookup", lambda _i, _b: ENTRY)
    monkeypatch.setattr(
        prepare_salmone_glosses,
        "select_sense",
        lambda _e, _f, prefer_nominal=False: ("k", "a", 1, False),
    )
    with pytest.raises(ValueError, match="delimiter"):
        build_rows({"SbE": ENTRY}, ["S\tbE"], {}, {})


def test_build_rows_checks_the_root_before_the_not_in_salmone_exit():
    # A quarantined root still reaches review.tsv, so the guard cannot sit
    # beside the gloss check -- it has to run before the lookup can bail.
    with pytest.raises(ValueError, match="delimiter"):
        build_rows({"SbE": ENTRY}, ["no\tsuch"], {}, {})


def test_build_rows_checks_the_root_before_the_no_sense_exit(monkeypatch):
    # Same for the other early exit: select_sense returning None quarantines
    # the root by itself, with no gloss for the later guard to see.
    monkeypatch.setattr(prepare_salmone_glosses, "lookup", lambda _i, _b: ENTRY)
    monkeypatch.setattr(
        prepare_salmone_glosses,
        "select_sense",
        lambda _e, _f, prefer_nominal=False: None,
    )
    with pytest.raises(ValueError, match="delimiter"):
        build_rows({"SbE": ENTRY}, ["S\tbE"], {}, {})


def test_review_rows_flags_the_rows_no_corpus_form_corroborated():
    # matched=0 means Salmoné's leading sense was taken with nothing behind it.
    rows, quarantined, _ = build_rows(
        {"SbE": ENTRY}, ["SbE"], {"SbE": {"zzz": 9}}, {"SbE": 0.0}
    )
    assert review_rows(rows, quarantined) == [
        ("SbE", "unmatched", "SabaE", "Pointed at, out.")
    ]


def test_load_salmone_targets_covers_the_perseus_rows_and_the_empty_roots(tmp_path):
    # The target set is exactly "rows Salmoné is meant to outrank" plus "roots
    # with nothing at all" -- not every root Salmoné covers, which would add a
    # second card to ~90% of root pages.
    db = _db(
        tmp_path,
        """INSERT INTO roots VALUES (1,'SbE',2),(2,'hmn',1),(3,'Aty',549),(4,'nsA',7);
           INSERT INTO root_definitions VALUES (1,'perseus-lane'),
               (3,'qurandev-lane'),(4,'corpus-forms');""",
    )
    # SbE has a perseus-lane row, hmn has nothing -> both targets, most-used
    # first. Aty is curated Lane and nsA has a corpus-forms gloss -> neither.
    assert prepare_salmone_glosses.load_salmone_targets(db, rejects=set()) == [
        "SbE",
        "hmn",
    ]


def test_load_salmone_targets_drops_a_hand_rejected_root(tmp_path):
    db = _db(
        tmp_path,
        """INSERT INTO roots VALUES (1,'SbE',2),(2,'hmn',1);
           INSERT INTO root_definitions VALUES (1,'perseus-lane');""",
    )
    assert prepare_salmone_glosses.load_salmone_targets(db, rejects={"SbE"}) == ["hmn"]


def test_load_form_counts_sums_the_corpus_spellings_of_a_root(tmp_path):
    db = _db(
        tmp_path,
        """INSERT INTO roots VALUES (1,'SbE',2);
           INSERT INTO word_segments VALUES ('SbE','>aSa`biEa','N'),
               ('SbE','>aSa`biEa','N'),('SbE','SabaEa','V');""",
    )
    assert prepare_salmone_glosses.load_form_counts(db, "SbE") == {
        ">aSa`biEa": 2,
        "SabaEa": 1,
    }


def test_load_nominal_share_counts_n_adj_and_pn_against_every_segment(tmp_path):
    db = _db(
        tmp_path,
        """INSERT INTO roots VALUES (1,'SbE',4);
           INSERT INTO word_segments VALUES ('SbE','a','N'),('SbE','b','ADJ'),
               ('SbE','c','PN'),('SbE','d','V');""",
    )
    assert prepare_salmone_glosses.load_nominal_share(db, "SbE") == 0.75


def test_load_nominal_share_is_zero_for_a_root_with_no_segments(tmp_path):
    # Division by the segment count; a root absent from word_segments must not
    # raise, and must not be treated as nominal.
    db = _db(tmp_path, "INSERT INTO roots VALUES (1,'SbE',0);")
    assert prepare_salmone_glosses.load_nominal_share(db, "SbE") == 0.0


def test_main_writes_both_tsvs_and_reports_the_buckets(tmp_path, monkeypatch, capsys):
    # The helpers below are covered one by one; this pins the wiring between
    # them -- argument parsing, the three DB reads, both file writes and the
    # printed summary -- which no other test touches.
    xml = tmp_path / "s.xml"
    xml.write_text(
        "<?xml version='1.0'?><TEI.2><text><body>"
        f'<div2 n="SbE" type="root">{ENTRY}</div2>'
        '<div2 n="bED" type="root">'
        '<entryFree key="baEaDa"><sense>Stung ( mosquito ).</sense></entryFree>'
        "</div2>"
        '<div2 n="Sfr" type="root">'
        '<entryFree key="Safor"><sense>Empty, void, vacant.</sense></entryFree>'
        '<entryFree key="Safar"><sense>Jaundice.</sense></entryFree>'
        "</div2></body></text></TEI.2>",
        encoding="utf-8",
    )
    # Distinct occurrence_counts: `load_salmone_targets` orders on that column,
    # and two roots sharing a count would make the review file's row order --
    # asserted below -- depend on SQLite's tie-breaking.
    db = _db(
        tmp_path,
        """INSERT INTO roots VALUES (1,'SbE',4),(2,'bED',3),(3,'Sfr',2),(4,'zzz',1);
           INSERT INTO word_segments VALUES ('SbE','>aSa`biEa','N'),
               ('SbE','>aSa`biEa','N'),('SbE','>aSa`biEa','N'),
               ('Sfr','Sufura','N'),('Sfr','Sufura','N');""",
    )
    out, review = tmp_path / "out.tsv", tmp_path / "review.tsv"
    # The real gate is measured against the pinned artefact and rejects any
    # fixture by construction; it has its own tests in test_salmone.py.
    monkeypatch.setattr(
        prepare_salmone_glosses,
        "build_index",
        lambda path: build_index(path, expected=None, anchors={}),
    )
    # `salmone_rejects.txt` is Task 7's to fill; nothing here may depend on
    # whether it is still empty.
    monkeypatch.setattr(prepare_salmone_glosses, "load_rejects", lambda _p: set())
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "prepare_salmone_glosses",
            str(xml),
            "--db",
            str(db),
            "--out",
            str(out),
            "--review",
            str(review),
        ],
    )

    prepare_salmone_glosses.main()

    assert out.read_text("utf-8") == (
        "SbE\tFinger; digit.\nbED\tStung ( mosquito ).\nSfr\tEmpty, void, vacant.\n"
    )
    lines = review.read_text("utf-8").splitlines()
    assert lines[0] == "root\tstatus\tkey\tgloss"
    assert [line.split("\t")[:2] for line in lines[1:]] == [
        ["SbE", "kept"],
        ["bED", "unmatched"],  # no corpus form, so no form-keyed match to trust
        ["Sfr", "tie"],  # both keys skeleton to Sfr, nothing finer separates them
        ["zzz", "not_in_salmone"],
    ]
    summary = capsys.readouterr().out
    # Both counts are recomputed from `review`, not carried in `stats`, so they
    # are the two numbers in this line that can drift from the file above.
    # "glossed", not "kept": 3 roots got a gloss, but only 1 of them carries the
    # `kept` review status -- the other 2 are the unmatched and the tied row.
    assert "3 glossed of 4 targets" in summary and "1 not in Salmoné" in summary
    assert "0 no sense, 1 unmatched and 1 tied to eyeball" in summary


def test_build_rows_flags_a_pick_document_order_had_to_break():
    # Both keys skeleton to `Sfr` and no finer comparison matches this corpus
    # spelling, so the sense is whichever Salmoné printed first. That row is
    # kept, and flagged for the human gate as its own status.
    safr = (
        '<entryFree key="Safor"><sense>Empty, void, vacant.</sense></entryFree>'
        '<entryFree key="Safar"><sense>Jaundice.</sense></entryFree>'
    )
    rows, quarantined, stats = build_rows(
        {"Sfr": safr}, ["Sfr"], {"Sfr": {"Sufura": 2}}, {}
    )
    assert rows == [("Sfr", "Empty, void, vacant.")] and stats["glossed"] == 1
    assert quarantined == [("Sfr", "tie", "Safor")]
    assert review_rows(rows, quarantined) == [
        ("Sfr", "tie", "Safor", "Empty, void, vacant.")
    ]
