from __future__ import annotations

import gzip
import re
import sqlite3
from pathlib import Path

import pytest
from click.testing import CliRunner

from scraper import qul_ru_import
from scraper.cli import main
from scraper.qul_ru_import import (
    AlignError,
    ImportAborted,
    Row,
    align_ayah,
    clean_ru_gloss,
    import_qul_ru,
    parse_cards,
    same_word,
    validate_ru_gloss,
)
from scraper.tasnim_align import base_form
from tests.helpers import make_corpus


def _page(*cards: tuple[str, str]) -> str:
    return "".join(
        f'<div class="qpc-hafs text-3xl" dir="rtl">{ar}</div>\n'
        f'  <div class="text-sm text-gray-600 russian">{ru}</div>'
        for ar, ru in cards
    )


def test_parse_cards_strips_markup_entities_and_html_whitespace():
    page = _page(("<span>بِسْمِ</span>", "<b>во</b>\n  имя &amp; слово"), ("ٱللَّهِ", "тест"))
    assert parse_cards(page) == [("بِسْمِ", "во имя & слово"), ("ٱللَّهِ", "тест")]


def test_same_word_accepts_qul_doubled_kaanna_only():
    assert same_word(base_form("كَأَنأَن"), base_form("كَأَن"))
    assert same_word("كتب", "كتب")
    assert not same_word("كتاب", "كتب")
    assert not same_word("كانا", "كان")  # tail is not ours' suffix
    assert not same_word("منن", "من")  # a repeated tail on any other word


def test_align_one_to_one():
    assert align_ayah([("بِسْمِ", "а"), ("ٱللَّهِ", "б")], [(1, "بِسْمِ"), (2, "ٱللَّهِ")]) == [
        Row(1, "а", 1),
        Row(2, "б", 2),
    ]


def test_word_without_a_card_joins_the_previous_card():
    assert align_ayah([("مِن", "из того, что до")], [(7, "مِن"), (8, "قَبْلِكَ")]) == [
        Row(7, "из того, что до", 7),
        Row(8, "из того, что до", 7),
    ]


def test_first_word_without_a_card_aborts():
    with pytest.raises(AlignError, match="word 1"):
        align_ayah([("ٱللَّهِ", "б")], [(1, "بِسْمِ"), (2, "ٱللَّهِ")])


def test_leftover_card_aborts():
    with pytest.raises(AlignError, match="1 cards unused"):
        align_ayah([("بِسْمِ", "а"), ("ٱللَّهِ", "б")], [(1, "بِسْمِ")])


@pytest.mark.parametrize(
    "raw, want",
    [
        ("слово,", "слово"),
        ("слово.", "слово"),
        ("слово:", "слово"),
        ("слово;", "слово"),
        ("слово –", "слово"),
        ("слово —", "слово"),
        ("слово, –", "слово"),
        ("[слово] –", "[слово]"),
        ("слово!", "слово!"),
        ("слово?", "слово?"),
        ("«слово!».", "«слово!»"),
        ("(досл. слово)", "(досл. слово)"),
        ("Слово – другое", "Слово – другое"),
        ("Cлово", "Слово"),
        ("c другим", "с другим"),
        ("A", "А"),
        ("Kлятва", "Клятва"),
        ("(некое) слово/", "(некое) слово"),
        ("/Нет", "Нет"),
    ],
)
def test_clean_ru_gloss(raw, want):
    assert clean_ru_gloss(raw) == want


def test_unmeasured_look_alike_is_refused_not_rewritten():
    assert clean_ru_gloss("Mир") == "Mир"
    assert validate_ru_gloss("Mир") == "latin character 'M'"


def test_homoglyph_fix_skipped_when_a_real_latin_letter_is_present():
    assert clean_ru_gloss("Cлово Q") == "Cлово Q"  # left for validate to refuse
    assert validate_ru_gloss("Cлово Q") == "latin character 'C'"


@pytest.mark.parametrize(
    "text, reason",
    [
        ("", "empty"),
        ("я" * 121, "too long (121 > 120)"),
        ("слово ب", "arabic character 'ب'"),
        ("слово\x07", "control or format character"),
        ("сло\u200bво", "control or format character"),
        ("\u202eслово", "control or format character"),
    ],
)
def test_validate_ru_gloss_refuses(text, reason):
    assert validate_ru_gloss(text) == reason


def test_validate_rejects_a_gloss_cleaned_to_empty():
    assert validate_ru_gloss(clean_ru_gloss("/")) == "empty"


@pytest.mark.parametrize("raw", [":", "–", ", –"])
def test_a_punctuation_only_gloss_survives_as_itself(raw):
    # R20: QUL glosses the particle أَن as a bare ":" on 38 cards.
    assert clean_ru_gloss(raw) == raw
    assert validate_ru_gloss(clean_ru_gloss(raw)) is None


def test_clean_strips_a_stray_arabic_mark_inside_a_russian_word():
    # R21: 44:2 carries a tanween (U+064C) glued onto a Russian word.
    assert clean_ru_gloss("Клянусь \u064cКнигой") == "Клянусь Книгой"


def test_clean_strips_soft_hyphens():
    # R21: U+00AD is invisible and breaks search.
    assert clean_ru_gloss("сло\u00adво,") == "слово"


def test_validate_accepts_kept_punctuation():
    assert validate_ru_gloss("«(досл. слово) [другое]!»") is None


# --- import_qul_ru: the all-or-nothing writer ------------------------------


def _snapshot(path: Path, pages: dict[tuple[int, int], str]) -> None:
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE raw (surah int, ayah int, html_gz blob, fetched_at text)")
    con.executemany(
        "INSERT INTO raw VALUES (?,?,?,'x')",
        [(s, a, gzip.compress(p.encode())) for (s, a), p in pages.items()],
    )
    con.commit()
    con.close()


WORDS = {(1, 1): ["بِسْمِ", "ٱللَّهِ"], (1, 2): ["مِن", "قَبْلِكَ", "رَبِّ"]}
PAGES = {
    (1, 1): _page(("بِسْمِ", "во имя,"), ("ٱللَّهِ", "Бога –")),
    # قَبْلِكَ has no card of its own: it is covered by مِن's gloss (a span).
    (1, 2): _page(("مِن", "из прежнего"), ("رَبِّ", "Господа!")),
}


def _ru(db: Path) -> list[tuple]:
    con = sqlite3.connect(db)
    try:
        return con.execute(
            "SELECT w.position, g.gloss_text, g.source, g.gloss_group"
            " FROM word_glosses g JOIN words w ON w.id=g.word_id"
            " WHERE g.language_code='ru' ORDER BY g.word_id"
        ).fetchall()
    finally:
        con.close()


def _sql(db: Path, statement: str, params: tuple = ()) -> list[tuple]:
    con = sqlite3.connect(db)
    try:
        rows = con.execute(statement, params).fetchall()
        con.commit()
        return rows
    finally:
        con.close()


def _seed_ru(db: Path, *rows: tuple[int, str, str]) -> None:
    """Pre-existing ru rows as (word_id, gloss, source), with their FK target."""
    _sql(db, "INSERT OR IGNORE INTO languages VALUES ('ru','Русский','Russian','ltr')")
    for word_id, gloss, source in rows:
        _sql(
            db,
            "INSERT INTO word_glosses (word_id, language_code, gloss_text, source)"
            " VALUES (?, 'ru', ?, ?)",
            (word_id, gloss, source),
        )


def _baks(tmp_path: Path) -> list[Path]:
    return sorted(tmp_path.glob("*.bak-m13-*"))


def _setup(tmp_path: Path, words=WORDS, pages=PAGES) -> tuple[Path, Path]:
    db, snap = tmp_path / "c.db", tmp_path / "s.sqlite"
    make_corpus(db, words)
    _snapshot(snap, pages)
    return db, snap


def test_import_writes_cleaned_rows_and_one_span(tmp_path):
    db, snap = _setup(tmp_path)
    s = import_qul_ru(db, snap)
    assert (s.rows, s.cards, s.groups) == (5, 4, 1)
    rows = _ru(db)
    assert rows[:2] == [
        (1, "во имя", "quranacademy", None),
        (2, "Бога", "quranacademy", None),
    ]
    assert rows[2][1] == rows[3][1] == "из прежнего"
    assert rows[2][3] == rows[3][3] is not None
    assert rows[4] == (3, "Господа!", "quranacademy", None)


def test_no_latin_letter_survives(tmp_path):
    pages = {**PAGES, (1, 1): _page(("بِسْمِ", "Cлово"), ("ٱللَّهِ", "Бога"))}
    db, snap = _setup(tmp_path, pages=pages)
    import_qul_ru(db, snap)
    glosses = [r[1] for r in _ru(db)]
    assert "Слово" in glosses  # the homoglyph C became Cyrillic С, not dropped
    assert not any(re.search("[A-Za-z]", g) for g in glosses)


def test_a_real_latin_word_aborts_instead_of_being_rewritten(tmp_path):
    pages = {**PAGES, (1, 1): _page(("بِسْمِ", "Cлово Q"), ("ٱللَّهِ", "Бога"))}
    db, snap = _setup(tmp_path, pages=pages)
    with pytest.raises(ImportAborted, match=r"1:1 word 1: latin character"):
        import_qul_ru(db, snap)
    assert _ru(db) == []


def test_unaligned_ayah_writes_nothing(tmp_path):
    # (1,2) loses its first card -> AlignError; a pre-existing ru row must survive.
    pages = {**PAGES, (1, 2): _page(("رَبِّ", "Господа!"))}
    db, snap = _setup(tmp_path, pages=pages)
    _seed_ru(db, (1, "старое", "quranacademy"))
    before = _ru(db)
    assert before == [(1, "старое", "quranacademy", None)]
    with pytest.raises(ImportAborted, match="1:2"):
        import_qul_ru(db, snap)
    assert _ru(db) == before
    assert not _baks(tmp_path)


def test_every_problem_is_reported_not_just_the_first(tmp_path):
    pages = {(1, 1): _page(("بِسْمِ", "/")), (1, 2): _page(("رَبِّ", "Господа!"))}
    db, snap = _setup(tmp_path, pages=pages)
    with pytest.raises(ImportAborted) as err:
        import_qul_ru(db, snap)
    assert "2 problems" in str(err.value)
    assert "1:1" in str(err.value) and "1:2" in str(err.value)


def test_invalid_gloss_writes_nothing(tmp_path):
    # A card "/" cleans to empty. ("–" no longer does: R20 keeps such glosses.)
    pages = {**PAGES, (1, 1): _page(("بِسْمِ", "/"), ("ٱللَّهِ", "Бога"))}
    db, snap = _setup(tmp_path, pages=pages)
    _seed_ru(db, (1, "старое", "quranacademy"))
    before = _ru(db)
    with pytest.raises(ImportAborted, match="1:1 word 1: empty"):
        import_qul_ru(db, snap)
    assert _ru(db) == before
    assert not _baks(tmp_path)


def test_snapshot_missing_an_ayah_writes_nothing(tmp_path):
    db, snap = _setup(tmp_path, pages={(1, 1): PAGES[(1, 1)]})
    with pytest.raises(ImportAborted, match="1:2 missing from snapshot"):
        import_qul_ru(db, snap)
    assert _ru(db) == []
    assert not _baks(tmp_path)


@pytest.mark.parametrize(
    "blob", [b"not gzip", gzip.compress(b"x")[:-4], gzip.compress(b"\xff")]
)
def test_corrupt_page_is_listed_with_the_rest(tmp_path, blob):
    # Bad header, truncated stream, non-UTF-8 body: each joins the report.
    db, snap = _setup(tmp_path, pages={(1, 1): _page(("بِسْمِ", "/"))})
    _sql(snap, "INSERT INTO raw VALUES (1, 2, ?, 'x')", (blob,))
    with pytest.raises(ImportAborted) as err:
        import_qul_ru(db, snap)
    assert "2 problems" in str(err.value) and "1:2" in str(err.value)
    assert _ru(db) == []


def test_snapshot_ayah_unknown_to_the_corpus_writes_nothing(tmp_path):
    db, snap = _setup(tmp_path, pages={**PAGES, (1, 3): _page(("رَبِّ", "лишнее"))})
    with pytest.raises(ImportAborted, match="1:3 not in corpus"):
        import_qul_ru(db, snap)
    assert _ru(db) == []
    assert not _baks(tmp_path)


def test_rerun_is_idempotent(tmp_path):
    db, snap = _setup(tmp_path)
    first = import_qul_ru(db, snap)
    after_first = _ru(db)
    second = import_qul_ru(db, snap)
    assert after_first and _ru(db) == after_first
    assert (first.rows, first.cards, first.groups) == (
        second.rows,
        second.cards,
        second.groups,
    )
    assert _sql(db, "SELECT COUNT(*) FROM word_glosses") == [(5,)]


def test_writes_its_own_languages_row(tmp_path):
    db, snap = _setup(tmp_path)
    assert _sql(db, "SELECT COUNT(*) FROM languages WHERE code='ru'") == [(0,)]
    import_qul_ru(db, snap)
    assert _sql(db, "SELECT * FROM languages WHERE code='ru'") == [
        ("ru", "Русский", "Russian", "ltr")
    ]


def test_keeps_an_existing_ru_languages_row(tmp_path):
    db, snap = _setup(tmp_path)
    _sql(db, "INSERT INTO languages VALUES ('ru','X','Y','ltr')")
    import_qul_ru(db, snap)
    assert _sql(db, "SELECT * FROM languages WHERE code='ru'") == [
        ("ru", "X", "Y", "ltr")
    ]
    assert len(_ru(db)) == 5


def test_foreign_ru_row_aborts_before_backup(tmp_path):
    db, snap = _setup(tmp_path)
    _seed_ru(db, (1, "чужое", "other"), (2, "старое", "quranacademy"))
    with pytest.raises(ImportAborted, match="1 ru rows from other sources"):
        import_qul_ru(db, snap)
    assert _ru(db) == [(1, "чужое", "other", None), (2, "старое", "quranacademy", None)]
    assert not _baks(tmp_path)


def test_backup_holds_the_pre_import_state(tmp_path):
    real = tmp_path / "real"
    real.mkdir()
    db, snap = real / "c.db", tmp_path / "s.sqlite"
    make_corpus(db, WORDS)
    _snapshot(snap, PAGES)
    link = tmp_path / "link.db"  # apps/web/quran.db is a symlink
    link.symlink_to(db)
    s = import_qul_ru(link, snap)
    assert s.backup.parent == db.resolve().parent
    assert s.backup.name.startswith("c.db.bak-m13-")
    assert _sql(
        s.backup, "SELECT COUNT(*) FROM word_glosses WHERE language_code='ru'"
    ) == [(0,)]
    assert _sql(s.backup, "SELECT COUNT(*) FROM words") == [
        (5,)
    ]  # a real copy of the corpus
    assert len(_ru(db)) == 5


def test_a_rerun_never_overwrites_an_earlier_backup(tmp_path):
    db, snap = _setup(tmp_path)
    first = import_qul_ru(db, snap)
    second = import_qul_ru(db, snap)
    assert first.backup != second.backup
    assert len(_baks(tmp_path)) == 2
    assert _sql(
        first.backup, "SELECT COUNT(*) FROM word_glosses WHERE language_code='ru'"
    ) == [(0,)]
    assert _sql(
        second.backup, "SELECT COUNT(*) FROM word_glosses WHERE language_code='ru'"
    ) == [(5,)]


def test_an_existing_backup_name_is_refused_not_replaced(tmp_path, monkeypatch):
    class _Frozen:
        @staticmethod
        def now(tz):
            from datetime import datetime

            return datetime(2026, 10, 7, 12, 0, 0, 123456, tzinfo=tz)

    monkeypatch.setattr(qul_ru_import, "datetime", _Frozen)
    db, snap = _setup(tmp_path)
    first = import_qul_ru(db, snap)
    before = first.backup.read_bytes()
    with pytest.raises(ImportAborted, match="already exists"):
        import_qul_ru(db, snap)
    assert first.backup.read_bytes() == before


def test_cli_reports_a_summary(tmp_path):
    db, snap = _setup(tmp_path)
    res = CliRunner().invoke(
        main, ["import-qul-ru", "--db", str(db), "--snapshot", str(snap)]
    )
    assert res.exit_code == 0, res.output
    assert "ru glosses 5 rows over 4 cards; 1 spans; backup " in res.output


def test_cli_surfaces_an_abort_as_a_clean_error(tmp_path):
    db, snap = _setup(tmp_path, pages={(1, 1): PAGES[(1, 1)]})
    res = CliRunner().invoke(
        main, ["import-qul-ru", "--db", str(db), "--snapshot", str(snap)]
    )
    assert res.exit_code == 1
    assert "1:2 missing from snapshot" in res.output
    assert "Traceback" not in res.output
