"""Tests for the root_definitions HTML-entity repair."""

import sqlite3
import sys
from unittest.mock import patch

from tools.fix_gloss_entities import find_rows, main


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

    The ``*kw`` string is byte-verbatim from the pre-fix backup (row id 4446):
    the write path stores source text as-is, so ``>`` is a literal and the
    numeric entities are singly escaped. Repairing it would turn visible entity
    noise into real Arabic — the letters of the *wrong* root (*kr) — so the
    junk starts reading as data, and ``import-lane`` only upserts, so nothing
    would take it out again. It belongs to ``prune-definitions``, not here.
    """
    conn = _db(
        [
            (
                "*kw",
                "qurandev-lane",
                '"MsoNormal" style="text-align: center;" align="center"> '
                "&#1584; &#1603; &#1585",
            ),
            ("ktb", "qurandev-lane", "to write&nbsp"),
        ]
    )
    rows, unrepairable = find_rows(conn)
    assert [(bw, new) for _id, bw, _old, new in rows] == [("ktb", "to write")]
    assert [(bw, reason) for bw, _old, reason in unrepairable] == [("*kw", "markup")]


def test_escaped_markup_is_caught_after_decoding():
    """Real markup must never be *written* — the raw check alone misses it.

    The live ``*kw`` row happens to carry unescaped quotes, so the raw check
    fires on it. A row whose markup arrived entity-escaped passes that check
    while ``clean()`` decodes it into real markup, which is exactly what this
    tool must not put in the DB.
    """
    conn = _db([("zzz", "qurandev-lane", "&lt;b&gt;bold&lt;/b&gt; gloss")])
    rows, unrepairable = find_rows(conn)
    assert rows == []
    assert [reason for _bw, _old, reason in unrepairable] == ["markup after decoding"]


def test_comments_declarations_and_pis_are_caught():
    """Shares ``_MARKUP`` with the importer, so "<!" and "<?" must stop here too.

    Raw on the odd rows, entity-escaped on the even ones — the escaped forms
    only become markup after ``clean()`` decodes them, so they exercise the
    second check the same way ``&lt;b&gt;`` does above.
    """
    conn = _db(
        [
            ("zzz", "qurandev-lane", "<!-- note --> gloss"),
            ("yyy", "qurandev-lane", "&lt;!DOCTYPE html&gt; gloss"),
            ("xxx", "qurandev-lane", '<?xml version="1.0"?> gloss'),
            ("www", "qurandev-lane", "&lt;?php echo $x; ?&gt; gloss"),
        ]
    )
    rows, unrepairable = find_rows(conn)
    assert rows == []
    assert [reason for _bw, _old, reason in unrepairable] == [
        "markup",
        "markup after decoding",
        "markup",
        "markup after decoding",
    ]


def test_row_decoding_to_empty_is_not_blanked():
    """A definition that cleans to "" is reported, never written.

    ``--apply`` would otherwise run ``SET definition = ''`` — a state no import
    can produce (``build_rows`` drops it, ``import_lane_definitions`` skips it),
    and a blank gloss in the UI hides what entity noise advertised.
    """
    conn = _db(
        [("zzz", "qurandev-lane", "&nbsp;&nbsp;"), ("ktb", "qurandev-lane", "x")]
    )
    rows, unrepairable = find_rows(conn)
    assert rows == []
    assert [(bw, reason) for bw, _old, reason in unrepairable] == [
        ("zzz", "decodes to empty")
    ]


def test_slash_spacing_matches_a_reimport():
    """``clean`` must apply every step a re-import applies, slashes included.

    A re-import runs ``clean_meaning`` *then* ``import_lane_definitions`` →
    ``normalize_slash_spacing``; omitting the second leaves the repaired row
    diverging from what the importer would write.
    """
    conn = _db([("srr", "qurandev-lane", "couch&#47;throne&nbsp")])
    rows, _ = find_rows(conn)
    assert [new for _id, _bw, _old, new in rows] == ["couch/ throne"]


def test_apply_writes_decoded_rows(tmp_path):
    """Cover the write path: --apply gating and the UPDATE parameter order.

    ``find_rows`` is pure, so a transposed ``(new, rid)`` in ``main`` would ship
    silently on a tool whose only job is mutating the live DB.
    """
    db = tmp_path / "t.db"
    conn = sqlite3.connect(db)
    conn.executescript(
        "CREATE TABLE roots (id INTEGER PRIMARY KEY, root_buckwalter TEXT);"
        "CREATE TABLE root_definitions ("
        " id INTEGER PRIMARY KEY, root_id INTEGER, source TEXT, definition TEXT);"
        "INSERT INTO roots VALUES (7,'ktb'), (9,'rHm');"
        "INSERT INTO root_definitions VALUES"
        " (41,7,'qurandev-lane','to write&nbsp'),"
        " (42,9,'hanswehr','to be merciful&nbsp');"
    )
    conn.commit()
    conn.close()

    def _defs():
        c = sqlite3.connect(db)
        try:
            return dict(c.execute("SELECT id, definition FROM root_definitions"))
        finally:
            c.close()

    with patch.object(sys, "argv", ["fix", "--db", str(db)]):
        main()
    assert _defs()[41] == "to write&nbsp"  # dry-run by default

    with patch.object(sys, "argv", ["fix", "--db", str(db), "--apply"]):
        main()
    # keyed by id, not by row order, and the out-of-scope source is untouched
    assert _defs() == {41: "to write", 42: "to be merciful&nbsp"}
