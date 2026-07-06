from __future__ import annotations

import json

from tools.prepare_qurandev_roots import build_rows, clean_meaning


def _cp1252(entries) -> bytes:
    # emulate the real file: JSON serialized then encoded as Windows-1252
    return json.dumps(entries, ensure_ascii=False).encode("cp1252")


def test_filters_and_decodes():
    raw = _cp1252(
        [
            {"RootCode": "ktb", "Meanings": " to write,\n prescribe "},
            {"RootCode": "rHm", "Meanings": ""},  # empty -> dropped
            {"RootCode": "<iboraAhiym", "Meanings": "Abraham"},  # not a DB root
            {"RootCode": "slm", "Meanings": "peace’s submit"},  # 0x92 curly quote
        ]
    )
    rows, stats = build_rows(raw, valid_roots={"ktb", "rHm", "slm"})
    assert rows == [
        ("ktb", "to write, prescribe"),  # whitespace/newlines collapsed
        ("slm", "peace’s submit"),  # cp1252 curly quote decoded
    ]
    assert stats == {
        "total": 4,
        "empty": 1,
        "unknown_root": 1,
        "apparatus_only": 0,
        "duplicate": 0,
        "kept": 2,
    }


def test_duplicate_rootcode_counted_and_stats_balance():
    # meanings.json has no dups today, but a dup must be counted (not silently
    # dropped) so total always equals the sum of the outcome buckets.
    raw = _cp1252(
        [
            {"RootCode": "ktb", "Meanings": "to write"},
            {"RootCode": "ktb", "Meanings": "to prescribe"},  # duplicate root
        ]
    )
    rows, stats = build_rows(raw, valid_roots={"ktb"})
    assert rows == [("ktb", "to write")]  # first wins
    assert stats["duplicate"] == 1
    assert stats["kept"] == 1
    # every entry lands in exactly one bucket
    assert stats["total"] == (
        stats["empty"]
        + stats["unknown_root"]
        + stats["apparatus_only"]
        + stats["duplicate"]
        + stats["kept"]
    )


def test_clean_meaning_keeps_gloss_strips_apparatus():
    # real gloss survives, trailing Lane apparatus stripped
    assert (
        clean_meaning(
            "To leave off, abandon. taraka vb. (I) perf. act. 2:17, 2:180 "
            "Lane's Lexicon, Volume 1, pages: 341 = Ta-Siin-Ayn (tasa'a)"
        )
        == "To leave off, abandon"
    )
    # short one-word English glosses are NOT apparatus — kept intact
    for gloss in ("orphan", "milk", "city", "awake", "camel"):
        assert clean_meaning(gloss) == gloss


def test_clean_meaning_drops_apparatus_only():
    # entry that is pure apparatus (no leading English gloss) → "" → dropped
    assert clean_meaning("Etala vb. (I) perf. act. 44:47") == ""
    assert clean_meaning("juz n.m. 2:196") == ""


def test_apparatus_only_meaning_is_dropped():
    raw = _cp1252(
        [
            {"RootCode": "ytm", "Meanings": "orphan, fatherless. yatiym n.m. 2:83"},
            {"RootCode": "Etl", "Meanings": "Etala vb. (I) impv. 44:47"},  # apparatus
        ]
    )
    rows, stats = build_rows(raw, valid_roots={"ytm", "Etl"})
    assert rows == [("ytm", "orphan, fatherless")]
    assert stats["apparatus_only"] == 1
    assert stats["kept"] == 1
