import os
import sqlite3
import tempfile

from scraper.db import ScraperDatabase
from scraper.seed import seed_database
from scraper.surah_meta import get_all_surahs


def _make_db() -> tuple[ScraperDatabase, str]:
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    path = f.name
    f.close()
    return ScraperDatabase(path), path


def test_seed_inserts_four_languages():
    db, path = _make_db()
    try:
        seed_database(db)
        db.close()
        conn = sqlite3.connect(path)
        codes = {r[0] for r in conn.execute("SELECT code FROM languages").fetchall()}
        assert {"ar", "en", "uz", "ru"} == codes
        conn.close()
    finally:
        os.unlink(path)


def test_seed_inserts_114_surahs():
    db, path = _make_db()
    try:
        seed_database(db)
        db.close()
        conn = sqlite3.connect(path)
        count = conn.execute("SELECT COUNT(*) FROM surahs").fetchone()[0]
        assert count == 114
        conn.close()
    finally:
        os.unlink(path)


def test_seed_is_idempotent():
    db, path = _make_db()
    try:
        seed_database(db)
        seed_database(db)  # second call must not raise or duplicate
        db.close()
        conn = sqlite3.connect(path)
        lang_count = conn.execute("SELECT COUNT(*) FROM languages").fetchone()[0]
        surah_count = conn.execute("SELECT COUNT(*) FROM surahs").fetchone()[0]
        assert lang_count == 4
        assert surah_count == 114
        conn.close()
    finally:
        os.unlink(path)


def test_seed_repermutes_order_number_over_an_existing_database():
    """A DB seeded before 2026-08-25 holds order_number = id, i.e. mushaf order.

    Re-seeding has to move all 114 rows to revelation order, and every
    intermediate state collides with UNIQUE(order_number): surah 1 moves to 5
    while surah 5 still holds 5. Without a parking pass the upsert loop raises
    IntegrityError partway through and leaves the table half-converted.
    """
    db, path = _make_db()
    try:
        for s in get_all_surahs():
            db.upsert_surah(s.model_copy(update={"order_number": s.id}))
        seed_database(db)
        db.close()
        conn = sqlite3.connect(path)
        rows = dict(conn.execute("SELECT id, order_number FROM surahs").fetchall())
        conn.close()
        assert rows[96] == 1, "al-Alaq is first revealed"
        assert rows[1] == 5, "al-Fatiha is fifth"
        assert sorted(rows.values()) == list(range(1, 115))
    finally:
        os.unlink(path)


def test_seed_leaves_no_parked_order_number_behind():
    """The parking pass writes negative ranks. If the loop after it fails or is
    ever removed, the table is left holding those, and every revelation-ordered
    list silently inverts."""
    db, path = _make_db()
    try:
        seed_database(db)
        db.close()
        conn = sqlite3.connect(path)
        parked = conn.execute(
            "SELECT COUNT(*) FROM surahs WHERE order_number < 1"
        ).fetchone()[0]
        conn.close()
        assert parked == 0
    finally:
        os.unlink(path)


def test_an_interrupted_reseed_leaves_no_parked_order_number_behind():
    """The park pass writes negative ranks, so a reseed that dies partway must
    roll all of them back.

    Left committed, every revelation-ordered list reads as reverse mushaf order
    -- a plausible-looking chronology with nothing to signal the failure. The
    generator raises after two surahs, which is exactly a Ctrl-C or a disk
    error mid-loop.
    """

    def dies_partway():
        for i, surah in enumerate(get_all_surahs()):
            if i == 2:
                raise RuntimeError("disk full")
            yield surah

    db, path = _make_db()
    try:
        seed_database(db)
        try:
            db.reseed_surahs(dies_partway())
        except RuntimeError:
            pass
        db.close()
        conn = sqlite3.connect(path)
        rows = dict(conn.execute("SELECT id, order_number FROM surahs").fetchall())
        conn.close()
        assert sorted(rows.values()) == list(range(1, 115))
        assert rows[96] == 1, "the completed seed's ranks survive intact"
    finally:
        os.unlink(path)
