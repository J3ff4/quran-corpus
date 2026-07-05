from scraper.checkpoint import Checkpoint


def test_clear_removes_one_key_keeps_others(tmp_path):
    p = tmp_path / "ck.json"
    ck = Checkpoint(str(p))
    ck.mark_done("chapter_1")
    ck.mark_done("chapter_2")
    ck.clear("chapter_1")
    assert ck.is_done("chapter_1") is False
    assert ck.is_done("chapter_2") is True
    # persisted
    assert Checkpoint(str(p)).is_done("chapter_1") is False


def test_clear_missing_key_is_noop(tmp_path):
    ck = Checkpoint(str(tmp_path / "ck.json"))
    ck.clear("chapter_9")  # no raise
    assert ck.is_done("chapter_9") is False
