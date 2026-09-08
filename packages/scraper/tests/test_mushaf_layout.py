import json
from pathlib import Path

from scraper.mushaf_layout import (
    LayoutRow,
    dedupe_pairs,
    load_rows,
    read_overrides,
    validate_rows,
)


def _word(wid, pos, line_v1, line_v2, page_v2, code, ctype="word"):
    # line_number twice, exactly as the API emits it: V1 first, V2 second.
    return (
        f'{{"id":{wid},"position":{pos},"char_type_name":"{ctype}",'
        f'"line_number":{line_v1},"code_v2":"{code}",'
        f'"line_number":{line_v2},"page_number":{page_v2}}}'
    )


def test_dedupe_keeps_the_second_line_number():
    """The V2 line is the SECOND line_number. json.load keeps the last value of
    a repeated key, which silently positions V2 glyphs with... the right one by
    luck -- but any other repeated key would be lost, so keep them all."""
    raw = '{"line_number": 1, "page_number": 120, "line_number": 13}'
    out = json.loads(raw, object_pairs_hook=dedupe_pairs)
    assert out["line_number"] == 1
    assert out["line_number__2"] == 13


def test_word_is_assigned_to_its_own_v2_page_not_the_file(tmp_path: Path):
    """Trap 2: the file index is the V1 page, `page_number` is the V2 page.
    5:77 lives in 121.json and belongs to V2 page 120. Filtering by the file
    index drops 361 words corpus-wide, silently."""
    (tmp_path / "121.json").write_text(
        '{"verses":[{"verse_key":"5:77","words":['
        + _word(1, 1, 1, 13, 120, "x")
        + "]}]}",
        encoding="utf-8",
    )
    rows = load_rows(tmp_path, {})
    assert [(r.page, r.line) for r in rows] == [(120, 13)]


def test_seq_follows_payload_order_not_word_id(tmp_path: Path):
    """Trap 3: ids are not reading order -- 4:176 carries 83385 next to 5:2's
    1544 on the same page. Sorting by id reorders the page."""
    (tmp_path / "106.json").write_text(
        '{"verses":[{"verse_key":"5:2","words":['
        + _word(83385, 1, 1, 1, 106, "A")
        + ","
        + _word(1544, 2, 1, 1, 106, "B")
        + "]}]}",
        encoding="utf-8",
    )
    rows = load_rows(tmp_path, {})
    assert [(r.seq, r.glyph) for r in rows] == [(1, "A"), (2, "B")]


def test_override_moves_one_marker(tmp_path: Path):
    (tmp_path / "589.json").write_text(
        '{"verses":[{"verse_key":"84:21","words":['
        + _word(23995, 6, 1, 14, 589, "W")
        + ","
        + _word(23997, 7, 1, 13, 589, "E", "end")
        + "]}]}",
        encoding="utf-8",
    )
    rows = load_rows(tmp_path, {(84, 21, 7): 14})
    assert [(r.position, r.line) for r in rows] == [(6, 14), (7, 14)]


def test_validate_flags_a_backwards_marker():
    rows = [
        LayoutRow(589, 14, 1, 84, 21, 6, "word", "W"),
        LayoutRow(589, 13, 1, 84, 21, 7, "end", "E"),
    ]
    problems = validate_rows(rows, {(84, 21): 1})
    assert any("84:21" in p and "backwards" in p for p in problems)


def test_validate_flags_a_word_count_disagreement():
    """Layout words must match the corpus words row for row: same count,
    positions 1..n, end marker at n+1."""
    rows = [
        LayoutRow(1, 1, 1, 1, 1, 1, "word", "W"),
        LayoutRow(1, 1, 2, 1, 1, 2, "end", "E"),
    ]
    assert validate_rows(rows, {(1, 1): 1}) == []
    assert any("1:1" in p for p in validate_rows(rows, {(1, 1): 4}))


def test_read_overrides_ignores_comments(tmp_path: Path):
    p = tmp_path / "o.tsv"
    p.write_text("# comment\n84\t21\t7\t14\twhy\n", encoding="utf-8")
    assert read_overrides(p) == {(84, 21, 7): 14}
