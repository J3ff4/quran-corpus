from __future__ import annotations

from scraper.db import ScraperDatabase
from scraper.models import AyahModel, SurahModel, WordModel
from scraper.validate import validate_against_gpl

_GPL = (
    "LOCATION\tFORM\tTAG\tFEATURES\n"
    "(1:1:1:1)\tbi\tP\tPREFIX|bi+\n"
    "(1:1:1:2)\tsomi\tN\tSTEM|POS:N|LEM:{som|ROOT:smw|M|GEN\n"
)


def _seed(tmp_path, root_bw):
    db = ScraperDatabase(str(tmp_path / "v.db"))
    db.upsert_surah(
        SurahModel(
            id=1,
            name_arabic="ا",
            name_translit="a",
            name_translation="a",
            revelation_type="meccan",
            ayah_count=7,
            order_number=1,
        )
    )
    aid = db.upsert_ayah(AyahModel(surah_id=1, ayah_number=1, text_uthmani="بِسْمِ"))
    db.upsert_word(
        WordModel(
            ayah_id=aid,
            position=1,
            text_arabic="بِسْمِ",
            root_buckwalter=root_bw,
            pos_tag="N",  # stem's tag ('N'), matching the corrected GPL-derived pos_tag
        )
    )
    return db


def test_validate_clean(tmp_path):
    gpl = tmp_path / "g.txt"
    gpl.write_text(_GPL, encoding="utf-8")
    db = _seed(tmp_path, "smw")
    assert validate_against_gpl(gpl, db) == []
    db.close()


def test_validate_reports_root_mismatch(tmp_path):
    gpl = tmp_path / "g.txt"
    gpl.write_text(_GPL, encoding="utf-8")
    db = _seed(tmp_path, "WRONG")
    ms = validate_against_gpl(gpl, db)
    assert any(m.field == "root_buckwalter" and m.expected == "smw" for m in ms)
    db.close()
