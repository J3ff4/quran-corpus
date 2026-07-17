"""Tests for scraper/http_retry.py."""

from __future__ import annotations

from unittest.mock import MagicMock

import httpx
import pytest

from scraper.http_retry import get_with_retry


def _status_error(
    code: int, *, headers: dict[str, str] | None = None
) -> httpx.HTTPStatusError:
    request = httpx.Request("GET", "https://corpus.quran.com/x")
    response = httpx.Response(code, request=request, headers=headers)
    return httpx.HTTPStatusError(str(code), request=request, response=response)


def test_succeeds_first_try_without_sleeping(monkeypatch):
    sleeps: list[float] = []
    monkeypatch.setattr("scraper.http_retry.time.sleep", sleeps.append)
    ok = MagicMock()
    client = MagicMock()
    client.get.return_value = ok

    result = get_with_retry(client, "https://corpus.quran.com/x")

    assert result is ok
    assert sleeps == []
    assert client.get.call_count == 1


def test_retries_transport_error_then_succeeds(monkeypatch):
    sleeps: list[float] = []
    monkeypatch.setattr("scraper.http_retry.time.sleep", sleeps.append)
    ok = MagicMock()
    client = MagicMock()
    client.get.side_effect = [
        httpx.ReadTimeout("timed out"),
        httpx.ConnectError("dns fail"),
        ok,
    ]

    result = get_with_retry(client, "https://corpus.quran.com/x")

    assert result is ok
    assert client.get.call_count == 3
    assert sleeps == [1.0, 2.0]


def test_retries_5xx_then_succeeds(monkeypatch):
    monkeypatch.setattr("scraper.http_retry.time.sleep", lambda _s: None)
    bad = MagicMock()
    bad.raise_for_status.side_effect = _status_error(503)
    ok = MagicMock()
    ok.raise_for_status.return_value = None
    client = MagicMock()
    client.get.side_effect = [bad, ok]

    result = get_with_retry(client, "https://corpus.quran.com/x")

    assert result is ok
    assert client.get.call_count == 2


def test_gives_up_after_max_retries(monkeypatch):
    monkeypatch.setattr("scraper.http_retry.time.sleep", lambda _s: None)
    client = MagicMock()
    client.get.side_effect = httpx.ReadTimeout("timed out")

    with pytest.raises(httpx.ReadTimeout):
        get_with_retry(client, "https://corpus.quran.com/x", max_retries=2)

    assert client.get.call_count == 3  # initial attempt + 2 retries


def test_retries_5xx_beyond_original_hardcoded_list(monkeypatch):
    """501/505/507/508 etc. are still server errors and must retry too."""
    monkeypatch.setattr("scraper.http_retry.time.sleep", lambda _s: None)
    bad = MagicMock()
    bad.raise_for_status.side_effect = _status_error(501)
    ok = MagicMock()
    ok.raise_for_status.return_value = None
    client = MagicMock()
    client.get.side_effect = [bad, ok]

    result = get_with_retry(client, "https://corpus.quran.com/x")

    assert result is ok
    assert client.get.call_count == 2


def test_honors_retry_after_header_over_local_backoff(monkeypatch):
    sleeps: list[float] = []
    monkeypatch.setattr("scraper.http_retry.time.sleep", sleeps.append)
    bad = MagicMock()
    bad.raise_for_status.side_effect = _status_error(429, headers={"Retry-After": "5"})
    ok = MagicMock()
    ok.raise_for_status.return_value = None
    client = MagicMock()
    client.get.side_effect = [bad, ok]

    get_with_retry(client, "https://corpus.quran.com/x", backoff_base=1.0)

    assert sleeps == [5.0]  # server's 5s beats the 1.0s local backoff


def test_ignores_malformed_retry_after_header(monkeypatch):
    sleeps: list[float] = []
    monkeypatch.setattr("scraper.http_retry.time.sleep", sleeps.append)
    bad = MagicMock()
    bad.raise_for_status.side_effect = _status_error(
        429, headers={"Retry-After": "not-a-number"}
    )
    ok = MagicMock()
    ok.raise_for_status.return_value = None
    client = MagicMock()
    client.get.side_effect = [bad, ok]

    get_with_retry(client, "https://corpus.quran.com/x", backoff_base=1.0)

    assert sleeps == [1.0]  # falls back to local backoff, doesn't crash


def test_does_not_retry_client_error(monkeypatch):
    sleeps: list[float] = []
    monkeypatch.setattr("scraper.http_retry.time.sleep", sleeps.append)
    resp = MagicMock()
    resp.raise_for_status.side_effect = _status_error(404)
    client = MagicMock()
    client.get.return_value = resp

    with pytest.raises(httpx.HTTPStatusError):
        get_with_retry(client, "https://corpus.quran.com/x")

    assert client.get.call_count == 1
    assert sleeps == []
