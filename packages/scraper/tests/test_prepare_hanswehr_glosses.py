import sqlite3
import sys

import pytest

from scraper.sources import hanswehr
from tools import prepare_hanswehr_glosses
from tools.prepare_hanswehr_glosses import (
    _NOMINAL_THRESHOLD,
    build_rows,
    load_hanswehr_targets,
    load_nominal_shares,
    review_rows,
)


def _quran_db(tmp_path, roots, segments=()):
    """`roots` is `[(root_buckwalter, root_arabic, occurrence_count), ...]`.

    `segments` is `[(root, pos_tag), ...]` for word_segments (empty by default).
    """
    db = tmp_path / "q.db"
    conn = sqlite3.connect(db)
    conn.execute(
        """CREATE TABLE roots (id INTEGER PRIMARY KEY, root_buckwalter TEXT,
               root_arabic TEXT, occurrence_count INTEGER)"""
    )
    conn.execute(
        """CREATE TABLE word_segments (root TEXT, form_buckwalter TEXT,
               pos_tag TEXT)"""
    )
    conn.executemany(
        "INSERT INTO roots (root_buckwalter, root_arabic, occurrence_count) "
        "VALUES (?, ?, ?)",
        roots,
    )
    conn.executemany(
        "INSERT INTO word_segments (root, form_buckwalter, pos_tag) "
        "VALUES (?, NULL, ?)",
        segments,
    )
    conn.commit()
    conn.close()
    return db


def test_targets_all_roots_minus_rejects(tmp_path):
    db = _quran_db(tmp_path, [("Trf", "طرف", 11), ("lwH", "لوح", 6)])
    assert load_hanswehr_targets(db, rejects={"lwH"}) == ["Trf"]


def test_targets_excludes_roots_with_no_root_arabic(tmp_path):
    # root_arabic IS NULL means the root itself was never resolved to Arabic --
    # nothing for `lookup` to convert back and search HW with.
    db = _quran_db(tmp_path, [("Trf", "طرف", 11), ("zzz", None, 99)])
    assert load_hanswehr_targets(db, rejects=set()) == ["Trf"]


def test_load_nominal_shares_computes_share_and_threshold(tmp_path):
    # lwH: 4/4 nominal (N/N/ADJ/PN) -> 1.0 > threshold -> nominal.
    # Trf: 2/3 nominal (N/ADJ, one V) -> ~0.667 < threshold -> not nominal.
    # PN counts as nominal; a root with no segments is absent, not 0-keyed.
    db = _quran_db(
        tmp_path,
        [("lwH", "لوح", 6), ("Trf", "طرف", 11), ("qtl", "قتل", 3)],
        segments=[
            ("lwH", "N"), ("lwH", "N"), ("lwH", "ADJ"), ("lwH", "PN"),
            ("Trf", "N"), ("Trf", "ADJ"), ("Trf", "V"),
        ],
    )
    shares = load_nominal_shares(db)
    assert shares["lwH"] == 1.0
    assert shares["Trf"] == pytest.approx(2 / 3)
    assert "qtl" not in shares  # no segments -> absent, caller defaults to 0.0
    assert shares["lwH"] > _NOMINAL_THRESHOLD
    assert shares["Trf"] < _NOMINAL_THRESHOLD


def test_build_rows_glosses_and_quarantines():
    idx = {hanswehr.normalize_key("طرف"): [(1, "طرف ṭarafa to blink, wink")]}
    nominal = {"Trf": 0.0, "qtl": 0.0}
    rows, quar, stats = build_rows(idx, ["Trf", "qtl"], {"Trf": {}}, nominal)
    assert ("Trf", "blink, wink") in rows
    assert ("qtl", "not_in_hanswehr", "") in quar
    assert stats["total"] == 2 and stats["glossed"] == 1


def test_build_rows_raises_on_delimiter():
    with pytest.raises(ValueError, match="delimiter"):
        build_rows({}, ["Tr\tf"], {}, {})


def test_build_rows_raises_on_gloss_delimiter(monkeypatch):
    monkeypatch.setattr(
        prepare_hanswehr_glosses,
        "select_gloss",
        lambda _e, prefer_nominal=False, max_senses=3: "a\tb",
    )
    idx = {hanswehr.normalize_key("طرف"): [(1, "x")]}
    with pytest.raises(ValueError, match="delimiter"):
        build_rows(idx, ["Trf"], {}, {})


def test_build_rows_quarantines_when_select_gloss_yields_nothing(monkeypatch):
    monkeypatch.setattr(prepare_hanswehr_glosses, "select_gloss", lambda *a, **k: None)
    idx = {hanswehr.normalize_key("طرف"): [(1, "x")]}
    rows, quar, stats = build_rows(idx, ["Trf"], {}, {})
    assert rows == [] and quar == [("Trf", "no_gloss", "")]
    assert stats["no_gloss"] == 1


def test_build_rows_applies_the_nominal_filter_above_the_threshold():
    entries = [(1, "one thing"), (0, "part, portion")]
    idx = {hanswehr.normalize_key("بعض"): entries}
    nominal, _, _ = build_rows(idx, ["bED"], {}, {"bED": 0.95})
    verbal, _, _ = build_rows(idx, ["bED"], {}, {"bED": 0.10})
    assert nominal == [("bED", "part, portion")]
    assert verbal == [("bED", "one thing")]


def test_review_rows_kept_and_quarantined():
    out = review_rows([("Trf", "blink")], [("qtl", "not_in_hanswehr", "")])
    assert ("Trf", "kept", "blink") in out
    assert ("qtl", "not_in_hanswehr", "") in out


def test_main_writes_both_tsvs_and_reports_the_buckets(tmp_path, monkeypatch, capsys):
    hw_db = tmp_path / "hw.sqlite"
    conn = sqlite3.connect(hw_db)
    conn.execute(
        """CREATE TABLE DICTIONARY (id INTEGER PRIMARY KEY, word TEXT,
               definition TEXT, is_root INTEGER, parent_id INTEGER,
               quran_occurrence INTEGER, favorite_flag INTEGER)"""
    )
    conn.execute(
        "INSERT INTO DICTIONARY (word, definition, is_root) VALUES (?, ?, ?)",
        ("طرف", "طرف ṭarafa to blink, wink", 1),
    )
    conn.commit()
    conn.close()

    db = _quran_db(tmp_path, [("Trf", "طرف", 5), ("qtl", "قتل", 3)])
    out, review = tmp_path / "out.tsv", tmp_path / "review.tsv"

    monkeypatch.setattr(
        prepare_hanswehr_glosses,
        "build_index",
        lambda path: hanswehr.build_index(path, expected=None, anchors={}),
    )
    # `hanswehr_rejects.txt` is Task 6's to fill; nothing here may depend on
    # whether it is still empty.
    monkeypatch.setattr(prepare_hanswehr_glosses, "load_rejects", lambda _p: set())
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "prepare_hanswehr_glosses",
            "--db",
            str(db),
            "--hw",
            str(hw_db),
            "--out",
            str(out),
            "--review",
            str(review),
        ],
    )

    prepare_hanswehr_glosses.main()

    assert out.read_text("utf-8") == "Trf\tblink, wink\n"
    lines = review.read_text("utf-8").splitlines()
    assert lines[0] == "root\tstatus\tgloss"
    assert lines[1:] == ["Trf\tkept\tblink, wink", "qtl\tnot_in_hanswehr\t"]
    summary = capsys.readouterr().out
    assert "1 glossed of 2 targets" in summary and "1 not in HW" in summary
