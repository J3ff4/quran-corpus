from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from scraper.checkpoint import Checkpoint
from scraper.db import ScraperDatabase
from scraper.models import AyahModel, RootFormModel, RootModel, SurahModel, WordModel
from scraper.snapshots import save_snapshot
from scraper.sources.dictionary_scrape import scrape_dictionary, scrape_word_details

FIX = Path(__file__).parent / "fixtures"

# Single-form root page (Phase 17 shape): no <ul class="also">, the one form
# is named inline. Shared with tests/test_replay.py -- same page, same root.
_ONE_FORM_HTML = (
    '<html><body>The triliteral root hamza rā ḍād '
    '(<span class="at">أ ر ض</span>) occurs 461 times in the Quran as the '
    'noun <i class="ab">arḍ</i> (<span class="at">أَرْض</span>).</body></html>'
)


class _FakeResp:
    def __init__(self, text: str) -> None:
        self.text = text

    def raise_for_status(self) -> None: ...


class _FakeClient:
    def __init__(self, text: str, calls: list[str] | None = None) -> None:
        self._text = text
        self._calls = calls

    def __enter__(self) -> _FakeClient:
        return self

    def __exit__(self, *a: object) -> None: ...

    def get(self, url: str) -> _FakeResp:
        if self._calls is not None:
            self._calls.append(url)
        return _FakeResp(self._text)


def _seed(tmp_path):
    db = ScraperDatabase(str(tmp_path / "d.db"))
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
        WordModel(ayah_id=aid, position=1, text_arabic="بِسْمِ", root_buckwalter="ktb")
    )
    return db


def test_scrape_dictionary_writes_root(tmp_path):
    db = _seed(tmp_path)
    html = (FIX / "corpus_dict_ktb.html").read_text(encoding="utf-8")
    ck = Checkpoint(str(tmp_path / "c.json"))
    n = scrape_dictionary(
        db, ck, client_factory=lambda: _FakeClient(html), rate_limit=0
    )
    assert n == 1
    row = db._conn.execute(
        "SELECT occurrence_count FROM roots WHERE root_buckwalter='ktb'"
    ).fetchone()
    assert row[0] == 319
    forms = db._conn.execute("SELECT COUNT(*) FROM root_forms").fetchone()[0]
    assert forms >= 5
    assert ck.is_done("root_ktb")
    # resume: second run is a no-op
    assert (
        scrape_dictionary(
            db, ck, client_factory=lambda: _FakeClient(html), rate_limit=0
        )
        == 0
    )
    db.close()


def test_scrape_dictionary_honours_explicit_root_list(tmp_path):
    # Re-scraping only the broken roots must not re-fetch all 1,642.
    db = _seed(tmp_path)
    html = (FIX / "corpus_dict_ktb.html").read_text(encoding="utf-8")
    ck = Checkpoint(str(tmp_path / "c.json"))
    n = scrape_dictionary(
        db, ck, client_factory=lambda: _FakeClient(html), rate_limit=0, roots=[]
    )
    assert n == 0
    assert not ck.is_done("root_ktb")


def test_scrape_dictionary_writes_snapshots(tmp_path):
    db = _seed(tmp_path)
    html = (FIX / "corpus_dict_ktb.html").read_text(encoding="utf-8")
    ck = Checkpoint(str(tmp_path / "c.json"))
    snaps = tmp_path / "snaps"
    scrape_dictionary(
        db,
        ck,
        client_factory=lambda: _FakeClient(html),
        rate_limit=0,
        snapshot_dir=snaps,
    )
    written = list(snaps.glob("*.html.gz"))
    assert len(written) == 1


def test_scrape_dictionary_writes_no_snapshots_by_default(tmp_path):
    db = _seed(tmp_path)
    html = (FIX / "corpus_dict_ktb.html").read_text(encoding="utf-8")
    ck = Checkpoint(str(tmp_path / "c.json"))
    # Assert the behaviour, not a filesystem side effect: pytest's CWD is the
    # package root, not tmp_path, so globbing tmp_path would miss a snapshot
    # written to the CLI's relative default (".snapshots/roots") and pass
    # vacuously. Patching at the call site is CWD-independent.
    with patch("scraper.sources.dictionary_scrape.save_snapshot") as mock_save:
        scrape_dictionary(
            db, ck, client_factory=lambda: _FakeClient(html), rate_limit=0
        )
    mock_save.assert_not_called()


def test_scrape_word_details_writes_description(tmp_path):
    db = _seed(tmp_path)
    html = (FIX / "corpus_word_detail_1_1_1.html").read_text(encoding="utf-8")
    ck = Checkpoint(str(tmp_path / "c2.json"))
    n = scrape_word_details(
        db, ck, client_factory=lambda: _FakeClient(html), rate_limit=0
    )
    assert n == 1
    row = db._conn.execute(
        "SELECT morphology_description, grammar_arabic FROM words WHERE position=1"
    ).fetchone()
    assert "morphological segment" in row[0]
    assert "جار" in (row[1] or "")
    assert db._conn.execute("SELECT COUNT(*) FROM word_segments").fetchone()[0] == 0
    db.close()


def test_done_root_is_refetched_when_its_snapshot_is_missing(tmp_path):
    # The archive is a second completeness condition. Without this, enabling
    # --snapshot-dir on an already-scraped corpus archives nothing and says
    # nothing -- how 712 of 1642 ended up on disk.
    db = ScraperDatabase(str(tmp_path / "t.db"))
    ckpt = Checkpoint(str(tmp_path / "c.json"))
    ckpt.mark_done("root_ArD")
    calls: list[str] = []

    def factory():
        return _FakeClient(_ONE_FORM_HTML, calls)

    scrape_dictionary(
        db, ckpt, client_factory=factory, rate_limit=0,
        roots=["ArD"], snapshot_dir=str(tmp_path / "snaps"),
    )

    assert len(calls) == 1
    # _encode_key percent-encodes every uppercase letter, not only the first
    # (see test_snapshots.py: "root_lHn" -> "root_l%48n") -- "ArD" has two.
    assert (tmp_path / "snaps" / "root_%41r%44.html.gz").exists()
    db.close()


def test_done_root_is_skipped_when_its_snapshot_exists(tmp_path):
    db = ScraperDatabase(str(tmp_path / "t.db"))
    ckpt = Checkpoint(str(tmp_path / "c.json"))
    ckpt.mark_done("root_ArD")
    save_snapshot(tmp_path / "snaps", "root_ArD", _ONE_FORM_HTML)
    calls: list[str] = []

    scrape_dictionary(
        db, ckpt, client_factory=lambda: _FakeClient(_ONE_FORM_HTML, calls),
        rate_limit=0, roots=["ArD"], snapshot_dir=str(tmp_path / "snaps"),
    )

    # Already archived -- re-fetching would be a pointless request against a
    # rate-limited third-party site.
    assert calls == []
    db.close()


def test_done_root_is_skipped_when_snapshots_are_off(tmp_path):
    # No --snapshot-dir means no archive condition; the checkpoint alone
    # governs, exactly as before.
    db = ScraperDatabase(str(tmp_path / "t.db"))
    ckpt = Checkpoint(str(tmp_path / "c.json"))
    ckpt.mark_done("root_ArD")
    calls: list[str] = []

    scrape_dictionary(
        db, ckpt, client_factory=lambda: _FakeClient(_ONE_FORM_HTML, calls),
        rate_limit=0, roots=["ArD"], snapshot_dir=None,
    )

    assert calls == []
    db.close()


def test_rescrape_replaces_stale_forms(tmp_path):
    # A root that used to yield 3 forms and now yields 1 must end with 1.
    # ON CONFLICT(root_id, sort_order) alone leaves sort_order 1 and 2 behind.
    db = ScraperDatabase(str(tmp_path / "t.db"))
    rid = db.upsert_root(
        RootModel(root_buckwalter="ArD", root_arabic="أرض", occurrence_count=461)
    )
    for i in range(3):
        db.upsert_root_form(
            RootFormModel(
                root_id=rid, sort_order=i, pos_label="Stale",
                form_arabic="ستالة", occurrence_count=1,
            )
        )
    ckpt = Checkpoint(str(tmp_path / "c.json"))

    scrape_dictionary(
        db, ckpt, client_factory=lambda: _FakeClient(_ONE_FORM_HTML, []),
        rate_limit=0, roots=["ArD"],
    )

    rows = db._conn.execute(
        "SELECT sort_order, pos_label FROM root_forms ORDER BY sort_order"
    ).fetchall()
    assert [tuple(r) for r in rows] == [(0, "Noun")]
    db.close()


def test_interrupt_after_snapshot_does_not_strand_the_root(tmp_path):
    # The crash window this branch opened: the root is already checkpoint-done
    # (every one of the 1642 keys was), so once the snapshot lands BOTH resume
    # conditions read satisfied. An interrupt between the snapshot write and
    # the form re-insert would skip the root forever -- with delete_root_forms
    # having already emptied it. The next run must still fetch it.
    db = ScraperDatabase(str(tmp_path / "t.db"))
    snaps = tmp_path / "snaps"
    ckpt = Checkpoint(str(tmp_path / "c.json"))
    ckpt.mark_done("root_ArD")

    boom = _FakeClient(_ONE_FORM_HTML, [])
    with patch.object(
        ScraperDatabase, "delete_root_forms", side_effect=KeyboardInterrupt
    ):
        try:
            scrape_dictionary(
                db, ckpt, client_factory=lambda: boom, rate_limit=0,
                roots=["ArD"], snapshot_dir=snaps,
            )
        except KeyboardInterrupt:
            pass

    # State after the crash: snapshot on disk, no forms in the DB.
    assert (snaps / "root_%41r%44.html.gz").exists()
    assert db._conn.execute("SELECT COUNT(*) FROM root_forms").fetchone()[0] == 0

    calls: list[str] = []
    scrape_dictionary(
        db, Checkpoint(str(tmp_path / "c.json")),
        client_factory=lambda: _FakeClient(_ONE_FORM_HTML, calls),
        rate_limit=0, roots=["ArD"], snapshot_dir=snaps,
    )

    assert len(calls) == 1, "stranded root was skipped instead of re-fetched"
    rows = db._conn.execute(
        "SELECT sort_order, pos_label FROM root_forms ORDER BY sort_order"
    ).fetchall()
    assert [tuple(r) for r in rows] == [(0, "Noun")]
    db.close()
