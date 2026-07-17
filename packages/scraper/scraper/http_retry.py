"""Retry wrapper for transient HTTP failures during scraping.

Scrapes run for hours against a third-party site; a single DNS blip or read
timeout used to kill the whole process, requiring a manual resume from
checkpoint. Wrap every GET in bounded exponential-backoff retry instead.
"""

from __future__ import annotations

import time

import httpx

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}


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
    attempt. Other HTTP errors (4xx) aren't transient and raise immediately.
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
        except httpx.HTTPStatusError as exc:
            if (
                exc.response.status_code not in _RETRYABLE_STATUS
                or attempt >= max_retries
            ):
                raise
        time.sleep(backoff_base * (2**attempt))
        attempt += 1
