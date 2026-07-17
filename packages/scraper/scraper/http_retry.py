"""Retry wrapper for transient HTTP failures during scraping.

Scrapes run for hours against a third-party site; a single DNS blip or read
timeout used to kill the whole process, requiring a manual resume from
checkpoint. Wrap every GET in bounded exponential-backoff retry instead.
"""

from __future__ import annotations

import time

import httpx

_RETRYABLE_STATUS = {429, *range(500, 600)}


def _delay_seconds(
    attempt: int, backoff_base: float, retry_after: str | None = None
) -> float:
    delay = backoff_base * (2**attempt)
    if retry_after is not None:
        try:
            delay = max(delay, float(retry_after))
        except ValueError:
            pass  # non-numeric (e.g. an HTTP-date) -- fall back to local backoff
    return delay


def get_with_retry(
    client: httpx.Client,
    url: str,
    *,
    max_retries: int = 5,
    backoff_base: float = 1.0,
) -> httpx.Response:
    """GET with exponential-backoff retry on transient network/server errors.

    Retries httpx.TransportError (DNS failure, connect/read timeout, etc.)
    and 429/5xx responses, up to max_retries times, doubling the delay each
    attempt (or honoring the response's Retry-After header if it asks for
    longer). Other HTTP errors (4xx) aren't transient and raise immediately.
    """
    attempt = 0
    while True:
        try:
            resp = client.get(url)
            resp.raise_for_status()
            return resp
        except httpx.TransportError:
            if attempt >= max_retries:
                raise
            time.sleep(_delay_seconds(attempt, backoff_base))
        except httpx.HTTPStatusError as exc:
            if (
                exc.response.status_code not in _RETRYABLE_STATUS
                or attempt >= max_retries
            ):
                raise
            retry_after = exc.response.headers.get("Retry-After")
            time.sleep(_delay_seconds(attempt, backoff_base, retry_after))
        attempt += 1
