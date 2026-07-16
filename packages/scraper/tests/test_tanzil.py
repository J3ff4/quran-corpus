import os
import sqlite3
import tempfile
from pathlib import Path

from scraper.db import ScraperDatabase
from scraper.seed import seed_database
from scraper.sources.tanzil import import_tanzil_text

FIXTURE = Path(__file__).parent / "fixtures" / "tanzil_sample.xml"

# Built from numeric codepoints, not hand-typed literals -- see
# scraper/hamza_seat.py and test_hamza_seat.py for why.
_LAM, _SUKUN, _HAMZA = chr(0x0644), chr(0x0652), chr(0x0621)
_ALEF_WASLA, _FATHA = chr(0x0671), chr(0x064E)
_TATWEEL, _HAMZA_ABOVE = chr(0x0640), chr(0x0654)
_SEAT = _LAM + _SUKUN + _TATWEEL + _HAMZA_ABOVE
_ALEF, _KHA, _KASRA, _RA = chr(0x0627), chr(0x062E), chr(0x0650), chr(0x0631)
_AKHIRI = _FATHA + _ALEF + _KHA + _KASRA + _RA + _KASRA
_GIVEN_WORD = _ALEF_WASLA + _LAM + _SUKUN + _HAMZA + _AKHIRI  # "ٱلْءَاخِرِ"
_FIXED_WORD = _ALEF_WASLA + _SEAT + _AKHIRI


def _make_db() -> tuple[ScraperDatabase, str]:
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    path = f.name
    f.close()
    db = ScraperDatabase(path)
    seed_database(db)  # surahs must exist before ayahs (FK)
    return db, path


def test_import_tanzil_inserts_all_ayahs():
    db, path = _make_db()
    try:
        import_tanzil_text(FIXTURE, db)
        db.close()
        conn = sqlite3.connect(path)
        count = conn.execute("SELECT COUNT(*) FROM ayahs WHERE surah_id=1").fetchone()[
            0
        ]
        assert count == 7
        conn.close()
    finally:
        os.unlink(path)


def test_import_tanzil_stores_uthmani_text():
    db, path = _make_db()
    try:
        import_tanzil_text(FIXTURE, db)
        db.close()
        conn = sqlite3.connect(path)
        text = conn.execute(
            "SELECT text_uthmani FROM ayahs WHERE surah_id=1 AND ayah_number=1"
        ).fetchone()[0]
        assert "بِسۡمِ" in text
        conn.close()
    finally:
        os.unlink(path)


def test_import_tanzil_is_idempotent():
    db, path = _make_db()
    try:
        import_tanzil_text(FIXTURE, db)
        import_tanzil_text(FIXTURE, db)
        db.close()
        conn = sqlite3.connect(path)
        count = conn.execute("SELECT COUNT(*) FROM ayahs WHERE surah_id=1").fetchone()[
            0
        ]
        assert count == 7
        conn.close()
    finally:
        os.unlink(path)


def test_import_tanzil_sets_ayah_number():
    db, path = _make_db()
    try:
        import_tanzil_text(FIXTURE, db)
        db.close()
        conn = sqlite3.connect(path)
        numbers = [
            r[0]
            for r in conn.execute(
                "SELECT ayah_number FROM ayahs WHERE surah_id=1 ORDER BY ayah_number"
            ).fetchall()
        ]
        assert numbers == list(range(1, 8))
        conn.close()
    finally:
        os.unlink(path)


def test_import_tanzil_fixes_seatless_hamza():
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<quran><sura index="2" name="a">'
        f'<aya index="8" text="{_GIVEN_WORD}" />'
        "</sura></quran>"
    )
    f = tempfile.NamedTemporaryFile(
        suffix=".xml", delete=False, mode="w", encoding="utf-8"
    )
    f.write(xml)
    f.close()
    db, path = _make_db()
    try:
        import_tanzil_text(Path(f.name), db)
        db.close()
        conn = sqlite3.connect(path)
        text = conn.execute(
            "SELECT text_uthmani FROM ayahs WHERE surah_id=2 AND ayah_number=8"
        ).fetchone()[0]
        assert text == _FIXED_WORD
        conn.close()
    finally:
        os.unlink(path)
        os.unlink(f.name)
