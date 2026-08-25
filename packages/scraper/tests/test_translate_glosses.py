from __future__ import annotations

from scraper.db import ScraperDatabase
from scraper.models import AyahModel, WordGlossModel, WordModel
from scraper.seed import seed_database
from scraper.translate_glosses import translate_glosses
from tests.test_mt import FakeMt


def _db(tmp_path) -> ScraperDatabase:
    db = ScraperDatabase(str(tmp_path / "s.db"))
    seed_database(db)  # languages (en/uz) for the gloss FK, and all 114 surahs
    return db


def _word_en(db, pos, gloss) -> None:
    aid = db.upsert_ayah(AyahModel(surah_id=1, ayah_number=1, text_uthmani="x"))
    wid = db.upsert_word(WordModel(ayah_id=aid, position=pos, text_arabic="x"))
    db.upsert_word_gloss(
        WordGlossModel(word_id=wid, language_code="en", gloss_text=gloss)
    )


class _CountingMt:
    """Wraps FakeMt but records every text it was actually asked to translate,
    so the test can assert the provider saw each distinct gloss exactly once —
    a per-word regression (calling it 3 times for 2 distinct glosses) would
    still pass the old dedup-by-output-count assertion, so that's not enough.
    """

    def __init__(self) -> None:
        self.seen: list[str] = []

    def translate(self, texts: list[str]) -> list[str]:
        self.seen.extend(texts)
        return [f"uz:{t}" for t in texts]


def test_dedup_fanout_and_idempotent(tmp_path) -> None:
    db = _db(tmp_path)
    _word_en(db, 1, "from")
    _word_en(db, 2, "from")
    _word_en(db, 3, "Allah")

    provider = _CountingMt()
    n = translate_glosses(db, provider)
    assert n == 3  # 3 words got a uz row
    rows = db._conn.execute(
        "SELECT gloss_text, source FROM word_glosses "
        "WHERE language_code='uz' ORDER BY gloss_text"
    ).fetchall()
    assert [r["gloss_text"] for r in rows] == ["uz:Allah", "uz:from", "uz:from"]
    assert {r["source"] for r in rows} == {"mt"}

    # provider called once per DISTINCT gloss (2 texts total), not per word (3)
    assert sorted(provider.seen) == ["Allah", "from"]

    assert translate_glosses(db, FakeMt()) == 0  # idempotent: nothing new
    db.close()


def test_normalize_strips_corpus_notation() -> None:
    from scraper.translate_glosses import _normalize_for_mt

    assert _normalize_for_mt("(of) Allah") == "of Allah"
    assert _normalize_for_mt("[the] right,") == "the right,"
    assert _normalize_for_mt("(is) in") == "is in"


class _BlankMt:
    """NLLB really returns '' for words like 'from'/'except' (spike-observed)."""

    def translate(self, texts: list[str]) -> list[str]:
        return ["" if t == "from" else f"uz:{t}" for t in texts]


def test_empty_mt_output_is_skipped(tmp_path) -> None:
    db = _db(tmp_path)
    _word_en(db, 1, "from")
    _word_en(db, 2, "Allah")
    n = translate_glosses(db, _BlankMt())
    assert n == 1  # only 'Allah' written; empty 'from' skipped -> EN fallback covers it
    rows = db._conn.execute(
        "SELECT gloss_text FROM word_glosses WHERE language_code='uz'"
    ).fetchall()
    assert [r["gloss_text"] for r in rows] == ["uz:Allah"]
    db.close()
