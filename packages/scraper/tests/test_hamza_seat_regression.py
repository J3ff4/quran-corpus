"""Guards against the seatless-hamza fix regressing on the real DB.

Not a unit test (Task 1's tests cover the pure function in isolation) --
this asserts the *live* DB has zero remaining un-fixed occurrences and
the known bug word (2:8) is specifically correct. Skips if the DB isn't
present (e.g. CI without the data artifact).
"""

from __future__ import annotations

import os
import sqlite3

import pytest

DB_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "apps", "web", "quran.db"
)

# Built from numeric codepoints, not hand-typed literals -- see
# scraper/hamza_seat.py and test_hamza_seat.py for why.
_LAM, _SUKUN, _TATWEEL, _HAMZA_ABOVE = (
    chr(0x0644),
    chr(0x0652),
    chr(0x0640),
    chr(0x0654),
)
_ALEF_WASLA, _FATHA = chr(0x0671), chr(0x064E)
_ALEF, _KHA, _KASRA, _RA = chr(0x0627), chr(0x062E), chr(0x0650), chr(0x0631)
_SEAT = _LAM + _SUKUN + _TATWEEL + _HAMZA_ABOVE
_AKHIRI = _FATHA + _ALEF + _KHA + _KASRA + _RA + _KASRA
_EXPECTED_WORD = _ALEF_WASLA + _SEAT + _AKHIRI  # "ٱلْـَٔاخِرِ"


@pytest.mark.skipif(not os.path.exists(DB_PATH), reason="live DB not present")
def test_no_remaining_definite_article_seatless_hamza() -> None:
    from scraper.hamza_seat import fix_seatless_hamza

    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("SELECT id, text_uthmani FROM ayahs WHERE text_uthmani LIKE '%لْء%'")
    rows = cur.fetchall()
    unfixed = [(rid, t) for rid, t in rows if fix_seatless_hamza(t) != t]
    assert unfixed == [], f"{len(unfixed)} ayahs still need the fix: {unfixed[:5]}"


@pytest.mark.skipif(not os.path.exists(DB_PATH), reason="live DB not present")
def test_28_word_8_is_correct() -> None:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute(
        """SELECT w.text_arabic FROM words w JOIN ayahs a ON w.ayah_id = a.id
           WHERE a.surah_id = 2 AND a.ayah_number = 8 AND w.position = 8"""
    )
    text = cur.fetchone()[0]
    assert text == _EXPECTED_WORD
    assert chr(0x0621) not in text  # no bare hamza left
    assert _TATWEEL + _HAMZA_ABOVE in text  # tatweel-seat present
