import sqlite3
import unicodedata
from pathlib import Path

import pytest

from scraper.ru_surah_names import (
    SURAH_COUNT,
    TSV_PATH,
    import_ru_surah_names,
    load_rows,
    strip_article,
)

HEADER = "# id\tname\tmeaning\n"


def _tsv(tmp_path: Path, body: str) -> Path:
    path = tmp_path / "ru.tsv"
    path.write_text(HEADER + body, encoding="utf-8")
    return path


# The two rows _OVERRIDES speaks for. A synthetic row in their place would
# trip the "the source has changed" guard before the test reached what it was
# actually asserting, so the fixture carries the source text verbatim.
_VERBATIM = {31: ("Луман", "Лукмaн"), 106: ("Куpaйш", "Курейшиты")}


def _full(**overrides: tuple[str, str]) -> str:
    """All 114 rows, so a test can change one without losing the completeness check."""
    lines = []
    for surah_id in range(1, SURAH_COUNT + 1):
        default = _VERBATIM.get(surah_id, (f"Сура{surah_id}", f"Смысл{surah_id}"))
        name, meaning = overrides.get(f"s{surah_id}", default)
        lines.append(f"{surah_id}\t{name}\t{meaning}\n")
    return "".join(lines)


class TestTheShippedFile:
    def test_covers_every_surah_exactly_once(self) -> None:
        rows = load_rows()
        assert [row.surah_id for row in rows] == list(range(1, SURAH_COUNT + 1))

    def test_stores_names_without_the_article_like_the_uzbek_rows(self) -> None:
        # surah_names.name REPLACES surahs.name_translit, so the two languages
        # share one slot and must agree on whether the article is part of the
        # name. The Uzbek rows say it is not.
        by_id = {row.surah_id: row for row in load_rows()}
        assert by_id[1].name == "Фатиха"
        assert by_id[2].name == "Бакара"
        assert by_id[24].name == "Нур"
        assert by_id[112].name == "Ихлас"

    def test_corrects_the_sources_mixed_script_names(self) -> None:
        # `Куpaйш` came with a Latin p and a. It renders identically to the
        # Cyrillic spelling and compares as a different string.
        by_id = {row.surah_id: row for row in load_rows()}
        assert by_id[106].name == "Курайш"
        assert all(ord(ch) > 0x400 or not ch.isalpha() for ch in by_id[106].name)
        assert by_id[31].name == "Лукман"

    def test_drops_a_meaning_that_only_repeats_the_name(self) -> None:
        by_id = {row.surah_id: row for row in load_rows()}
        assert by_id[11].meaning is None  # Худ
        assert by_id[36].meaning is None  # Йа Син
        assert by_id[2].meaning == "Корова"

    def test_every_stored_string_is_cyrillic(self) -> None:
        for row in load_rows():
            for value in (row.name, row.meaning or ""):
                latin = [ch for ch in value if ch.isalpha() and ch.isascii()]
                assert latin == [], f"surah {row.surah_id}: {value!r}"


class TestStripArticle:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("Аль-Бакара", "Бакара"),
            ("Аль Имран", "Имран"),  # the source uses a space on this one
            ("Ан-Ниса", "Ниса"),
            ("Ад-Духан", "Духан"),
            ("Аш-Шамс", "Шамс"),
            ("Ат-Тин", "Тин"),
            ("Нух", "Нух"),  # no article to take
            ("Абаса", "Абаса"),  # starts with А, is not an article
        ],
    )
    def test_takes_the_article_and_nothing_else(self, raw: str, expected: str) -> None:
        assert strip_article(raw) == expected

    def test_keeps_a_name_the_strip_would_leave_too_short(self) -> None:
        # Not a rule any of the 114 needs -- the shortest stripped name is Нур.
        assert strip_article("Аль-Ан") == "Аль-Ан"


class TestValidation:
    def test_refuses_a_latin_letter_hiding_in_a_cyrillic_name(
        self, tmp_path: Path
    ) -> None:
        # The defect this validator exists for, in a row that has no override.
        path = _tsv(tmp_path, _full(s7=("Кypайш", "Что-то")))
        with pytest.raises(ValueError, match="mixes scripts"):
            load_rows(path)

    def test_refuses_a_missing_surah(self, tmp_path: Path) -> None:
        body = "".join(
            line
            for line in _full().splitlines(keepends=True)
            if not line.startswith("96\t")
        )
        with pytest.raises(ValueError, match=r"no rows for surahs \[96\]"):
            load_rows(_tsv(tmp_path, body))

    def test_refuses_a_duplicate_surah(self, tmp_path: Path) -> None:
        with pytest.raises(ValueError, match="appears twice"):
            load_rows(_tsv(tmp_path, _full() + "2\tБакара\tКорова\n"))

    def test_refuses_an_id_outside_the_mushaf(self, tmp_path: Path) -> None:
        with pytest.raises(ValueError, match="outside 1..114"):
            load_rows(_tsv(tmp_path, _full() + "115\tСура\tСмысл\n"))

    def test_refuses_a_row_that_is_not_three_fields(self, tmp_path: Path) -> None:
        with pytest.raises(ValueError, match="expected 3 tab-separated fields"):
            load_rows(_tsv(tmp_path, "1\tФатиха\n"))

    def test_refuses_an_override_whose_source_text_has_changed(
        self, tmp_path: Path
    ) -> None:
        # An override describes a specific defect. If the source no longer says
        # what it described, applying the correction anyway would be rewriting
        # a row nobody checked.
        path = _tsv(tmp_path, _full(s106=("Курайш", "Курейшиты")))
        with pytest.raises(ValueError, match="the source has changed"):
            load_rows(path)


class TestImport:
    def _db(self, tmp_path: Path) -> Path:
        path = tmp_path / "quran.db"
        con = sqlite3.connect(path)
        con.executescript(
            """CREATE TABLE surahs (id INTEGER PRIMARY KEY);
               CREATE TABLE languages (
                 code TEXT PRIMARY KEY, name_native TEXT,
                 name_english TEXT, direction TEXT);
               CREATE TABLE surah_names (
                 surah_id INTEGER NOT NULL REFERENCES surahs(id) ON DELETE CASCADE,
                 language_code TEXT NOT NULL
                   REFERENCES languages(code) ON DELETE CASCADE,
                 name TEXT NOT NULL, meaning TEXT,
                 PRIMARY KEY (surah_id, language_code));"""
        )
        con.executemany(
            "INSERT INTO surahs (id) VALUES (?)",
            [(i,) for i in range(1, SURAH_COUNT + 1)],
        )
        con.commit()
        con.close()
        return path

    def test_writes_every_row_under_ru(self, tmp_path: Path) -> None:
        db = self._db(tmp_path)
        summary = import_ru_surah_names(db)
        con = sqlite3.connect(db)
        rows = con.execute(
            "SELECT surah_id, name, meaning FROM surah_names WHERE language_code = 'ru'"
            " ORDER BY surah_id"
        ).fetchall()
        con.close()
        assert summary.written == SURAH_COUNT
        assert len(rows) == SURAH_COUNT
        assert rows[1] == (2, "Бакара", "Корова")

    def test_leaves_the_other_languages_alone(self, tmp_path: Path) -> None:
        db = self._db(tmp_path)
        con = sqlite3.connect(db)
        con.execute(
            "INSERT INTO languages (code, name_native, name_english, direction)"
            " VALUES ('uz', 'Oʻzbekcha', 'Uzbek', 'ltr')"
        )
        con.execute("INSERT INTO surah_names VALUES (2, 'uz', 'Baqara', 'Sigir')")
        con.commit()
        con.close()

        import_ru_surah_names(db)

        con = sqlite3.connect(db)
        assert con.execute(
            "SELECT name, meaning FROM surah_names"
            " WHERE surah_id = 2 AND language_code = 'uz'"
        ).fetchone() == ("Baqara", "Sigir")
        con.close()

    def test_is_idempotent(self, tmp_path: Path) -> None:
        db = self._db(tmp_path)
        import_ru_surah_names(db)
        import_ru_surah_names(db)
        con = sqlite3.connect(db)
        count = con.execute(
            "SELECT count(*) FROM surah_names WHERE language_code = 'ru'"
        ).fetchone()[0]
        con.close()
        assert count == SURAH_COUNT

    def test_creates_the_language_row_it_needs(self, tmp_path: Path) -> None:
        # The FK target. A fresh DB has no `ru` row, and the insert would fail
        # on the foreign key without this.
        db = self._db(tmp_path)
        import_ru_surah_names(db)
        con = sqlite3.connect(db)
        assert con.execute(
            "SELECT name_english FROM languages WHERE code = 'ru'"
        ).fetchone() == ("Russian",)
        con.close()

    def test_does_not_overwrite_an_existing_language_row(self, tmp_path: Path) -> None:
        db = self._db(tmp_path)
        con = sqlite3.connect(db)
        con.execute(
            "INSERT INTO languages (code, name_native, name_english, direction)"
            " VALUES ('ru', 'Русский язык', 'Russian', 'ltr')"
        )
        con.commit()
        con.close()

        import_ru_surah_names(db)

        con = sqlite3.connect(db)
        assert con.execute(
            "SELECT name_native FROM languages WHERE code = 'ru'"
        ).fetchone() == ("Русский язык",)
        con.close()


class TestTheWordThatIsNotAnArticle:
    def test_keeps_aal_in_aal_imran(self) -> None:
        # آل عمران -- `Āl` is "family of", which Russian also renders `Аль`.
        # Stripping it leaves Imran the man, not the surah. The Uzbek rows
        # keep it (`Oli Imron`), and the two languages share one slot.
        rows = {row.surah_id: row for row in load_rows()}
        assert rows[3].name == "Аль Имран"
        assert rows[3].meaning == "Семейство Имрана"

    def test_still_strips_the_real_article_either_side_of_it(self) -> None:
        rows = {row.surah_id: row for row in load_rows()}
        assert rows[2].name == "Бакара"
        assert rows[4].name == "Ниса"


class TestTheDatabaseItIsPointedAt:
    def test_refuses_a_path_that_is_not_there(self, tmp_path: Path) -> None:
        # sqlite3.connect CREATES the file, so without this guard a mistyped
        # --db leaves an empty database behind and reports a missing table.
        missing = tmp_path / "nope.db"
        with pytest.raises(FileNotFoundError, match="no such database"):
            import_ru_surah_names(missing)
        assert not missing.exists()

    def test_refuses_a_database_without_surah_names(self, tmp_path: Path) -> None:
        # packages/scraper/quran.db is exactly this: a stale stub, and the
        # command's default --db resolves to it.
        stub = tmp_path / "stub.db"
        con = sqlite3.connect(stub)
        con.execute("CREATE TABLE surahs (id INTEGER PRIMARY KEY)")
        con.commit()
        con.close()
        with pytest.raises(ValueError, match="not the corpus DB"):
            import_ru_surah_names(stub)


class TestNormalisation:
    def test_composes_a_decomposed_name_before_storing_it(self, tmp_path: Path) -> None:
        # е + U+0308 renders as ё and compares as neither ё nor е. The script
        # guard cannot see it -- a combining mark is not isalpha() -- so NFC is
        # the only thing standing between a re-fetch and a name that matches
        # nothing.
        decomposed = "Ае\u0308ха"
        assert decomposed != unicodedata.normalize("NFC", decomposed)
        path = _tsv(tmp_path, _full(s3=(decomposed, "Смысл3")))
        stored = next(row for row in load_rows(path) if row.surah_id == 3).name
        assert stored == unicodedata.normalize("NFC", decomposed)
        assert "\u0308" not in stored


def test_the_shipped_path_is_the_one_the_tests_read() -> None:
    assert TSV_PATH.exists()
