import json

import httpx

from scraper.mushaf_fetch import USER_AGENT, fetch_layout


def test_sends_a_user_agent_and_skips_existing_files(tmp_path):
    """api.quran.com answers urllib's default UA with a flat 403, so the header
    is load-bearing, not cosmetic. Resumability matters because a 604-page
    fetch is minutes long and gets interrupted."""
    seen: list[str] = []
    (tmp_path / "002.json").write_text('{"verses": []}', encoding="utf-8")

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers["user-agent"])
        return httpx.Response(200, json={"verses": [{"verse_key": "1:1", "words": []}]})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    written = fetch_layout(tmp_path, [1, 2, 3], client)

    # 2 was already on disk, so a resumed run reports only what it fetched.
    assert written == [1, 3]
    assert seen and all(ua == USER_AGENT for ua in seen)
    written_page = json.loads((tmp_path / "001.json").read_text())
    assert written_page["verses"][0]["verse_key"] == "1:1"


def test_refuses_a_page_outside_1_604(tmp_path):
    client = httpx.Client(
        transport=httpx.MockTransport(lambda r: httpx.Response(200, json={}))
    )
    try:
        fetch_layout(tmp_path, [605], client)
    except ValueError as e:
        assert "605" in str(e)
    else:
        raise AssertionError("expected ValueError")
