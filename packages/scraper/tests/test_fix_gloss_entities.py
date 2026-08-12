"""Tests for the root_definitions HTML-entity repair."""

import sqlite3

from tools.fix_gloss_entities import find_rows


def _db(rows: list[tuple[str, str, str]]) -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.executescript(
        "CREATE TABLE roots (id INTEGER PRIMARY KEY, root_buckwalter TEXT);"
        "CREATE TABLE root_definitions ("
        " id INTEGER PRIMARY KEY, root_id INTEGER, source TEXT, definition TEXT);"
    )
    for i, (bw, source, definition) in enumerate(rows, start=1):
        conn.execute("INSERT INTO roots VALUES (?,?)", (i, bw))
        conn.execute(
            "INSERT INTO root_definitions VALUES (?,?,?,?)", (i, i, source, definition)
        )
    return conn


def test_decodes_entities_and_collapses_nbsp():
    conn = _db(
        [
            ("$yA", "qurandev-lane", "the meaning &quot;a little&quot;"),
            ("rbS", "qurandev-lane", "&nbsp; to wait, lay in wait"),
            ("xdd", "qurandev-lane", "to clave,&nbsp;to mark"),
            ("bdl", "qurandev-lane", "changing -&gt; replacing"),
            # html.unescape decodes these even without the closing semicolon.
            # The terminal "." goes with it: no qurandev gloss ends in
            # punctuation (0 of 1386 live), and a re-import through
            # clean_meaning trims it too, so keeping it would make this row the
            # odd one out. Deliberate — see the module docstring.
            ("srr", "qurandev-lane", "couch/ throne.&nbsp"),
        ]
    )
    assert [(bw, new) for _id, bw, _old, new in find_rows(conn)[0]] == [
        ("$yA", 'the meaning "a little"'),
        ("rbS", "to wait, lay in wait"),
        ("xdd", "to clave, to mark"),
        ("bdl", "changing -> replacing"),
        ("srr", "couch/ throne"),
    ]


def test_only_touches_qurandev_lane():
    """Other sources are out of scope — the punctuation trim is wrong for them.

    hanswehr glosses legitimately end in "s.th."/"e.g." and its extractor never
    strips "."; without the source filter an entity leaking into such a row
    would get its abbreviating period eaten.
    """
    conn = _db(
        [
            ("qll", "hanswehr", "to wish for s.th.&nbsp"),
            ("Elm", "perseus-lane", "to know&nbsp"),
            ("ktb", "qurandev-lane", "to write&nbsp"),
        ]
    )
    assert [(bw, new) for _id, bw, _old, new in find_rows(conn)[0]] == [
        ("ktb", "to write")
    ]


def test_leaves_clean_rows_alone():
    """No entity to decode → row untouched, incl. its trailing punctuation.

    The trim only runs on rows that actually decode; a clean gloss ending in a
    period must not be silently rewritten.
    """
    conn = _db(
        [
            # in-scope source, so exclusion here proves the gate, not the filter
            ("qll", "qurandev-lane", "to be or become little, small, few."),
            ("Elm", "qurandev-lane", "to know, A & B, 100% sure"),
        ]
    )
    assert find_rows(conn) == ([], [])


def test_markup_row_is_reported_not_repaired():
    """The one corrupt row must not be decoded back into a plausible gloss.

    Verbatim from the pre-fix backup. Repairing it would turn visible entity
    noise into real Arabic — the letters of the *wrong* root (*kr) — so the
    junk starts reading as data, and ``import-lane`` only upserts, so nothing
    would take it out again. It belongs to ``prune-definitions``, not here.
    """
    conn = _db(
        [
            (
                "*kw",
                "qurandev-lane",
                '"MsoNormal" style="text-align: center;" align="center"&gt; '
                "&amp;#1584; &amp;#1603; &amp;#1585",
            ),
            ("ktb", "qurandev-lane", "to write&nbsp"),
        ]
    )
    rows, markup = find_rows(conn)
    assert [(bw, new) for _id, bw, _old, new in rows] == [("ktb", "to write")]
    assert [bw for bw, _old in markup] == ["*kw"]
