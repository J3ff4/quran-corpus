import sqlite3
from pathlib import Path

import pytest

from scraper.sources import hanswehr


def _db(tmp_path, rows):
    p = tmp_path / "hw.sqlite"
    c = sqlite3.connect(p)
    c.execute(
        "CREATE VIRTUAL TABLE DICTIONARY USING FTS5("
        "id, word, definition, is_root, parent_id, quran_occurrence, favorite_flag)"
    )
    for i, (w, d, ir) in enumerate(rows, 1):
        c.execute(
            "INSERT INTO DICTIONARY(id,word,definition,is_root,parent_id,"
            "quran_occurrence,favorite_flag) VALUES(?,?,?,?,?,?,?)",
            (i, w, d, ir, i, None, 0),
        )
    c.commit()
    c.close()
    return p


def test_normalize_folds_hamza_and_diacritics():
    assert hanswehr.normalize_key("أَخَذَ") == hanswehr.normalize_key("اخذ")
    assert hanswehr.normalize_key("ناصِية") == hanswehr.normalize_key("ناصية")


def test_key_candidates_geminate_and_hamza():
    cands = hanswehr.key_candidates("طفف")
    assert "طف" in cands  # geminate collapse
    cands2 = hanswehr.key_candidates("أله")
    assert any("اله" == hanswehr.normalize_key(c) for c in cands2)  # hamza fold


def test_lookup_exact(tmp_path):
    idx = hanswehr.build_index(
        _db(tmp_path, [("طرف", "to blink", 1)]), expected=None, anchors={}
    )
    assert hanswehr.lookup(idx, "Trf")[0] == (1, "to blink")  # Trf -> طرف


def test_lookup_via_geminate(tmp_path):
    idx = hanswehr.build_index(
        _db(tmp_path, [("طف", "to make deficient", 1)]), expected=None, anchors={}
    )
    assert hanswehr.lookup(idx, "Tff") is not None  # Tff=طفف -> طف


def test_lookup_via_hamza(tmp_path):
    # >x* -> buckwalter_to_arabic gives أخذ (hamza-on-alif); the index key is
    # اخذ (bare alif), so this only resolves through the hamza fold in
    # normalize_key/key_candidates. (Ax* would give اخذ directly -- no fold
    # exercised -- which is why >x* is used here, not Ax*.)
    idx = hanswehr.build_index(
        _db(tmp_path, [("اخذ", "to take", 1)]), expected=None, anchors={}
    )
    entries = hanswehr.lookup(idx, ">x*")
    assert entries == [(1, "to take")]


def test_lookup_miss_returns_none(tmp_path):
    idx = hanswehr.build_index(
        _db(tmp_path, [("طرف", "x", 1)]), expected=None, anchors={}
    )
    assert hanswehr.lookup(idx, "qtl") is None


def test_build_index_expected_gate(tmp_path):
    with pytest.raises(ValueError, match="expected"):
        hanswehr.build_index(_db(tmp_path, [("طرف", "x", 1)]), expected=99, anchors={})


def test_build_index_anchor_gate(tmp_path):
    with pytest.raises(ValueError, match="anchor|does not hold"):
        hanswehr.build_index(
            _db(tmp_path, [("طرف", "x", 1)]), expected=None, anchors={"Trf": "NOPE"}
        )


def test_null_is_root_does_not_abort_build(tmp_path):
    # FTS5 does not constrain is_root NOT NULL; a NULL must sort as a non-root
    # (0), not TypeError the whole build before the completeness gate runs.
    idx = hanswehr.build_index(
        _db(tmp_path, [("لوح", "board", None), ("لوح", "to shine", 1)]),
        expected=None,
        anchors={},
    )
    entries = hanswehr.lookup(idx, "lwH")
    assert entries[0] == (1, "to shine")  # real root first, NULL after


def test_index_keeps_root_and_derived_root_first(tmp_path):
    # لوح: verb head (is_root=1) + noun head (is_root=0) share the key
    idx = hanswehr.build_index(
        _db(tmp_path, [("لوح", "to shine", 1), ("لوح", "board, tablet", 0)]),
        expected=None,
        anchors={},
    )
    entries = hanswehr.lookup(idx, "lwH")
    assert entries[0][0] == 1 and entries[1][0] == 0


REAL_DB = Path("/home/claude/quran-data/hanswehr.sqlite")


@pytest.mark.skipif(not REAL_DB.exists(), reason="vendored hanswehr.sqlite not present")
def test_real_db_coverage():
    index = hanswehr.build_index(REAL_DB)
    entries = hanswehr.lookup(index, "Trf")
    assert entries is not None
    assert any("blink" in d.lower() for _, d in entries)
