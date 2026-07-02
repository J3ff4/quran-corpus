"""One-time fixture capture for the dictionary + word-morphology detail pages.

Both pages are static server-rendered HTML (no JS execution needed), so a plain
httpx GET suffices. Saves raw HTML used by the parser unit tests.

Run: uv run python tools/inspect_corpus_dict.py
Outputs:
  tests/fixtures/corpus_dict_ktb.html          (qurandictionary.jsp?q=ktb)
  tests/fixtures/corpus_word_detail_1_1_1.html (wordmorphology.jsp?location=(1:1:1))
"""

from __future__ import annotations

from pathlib import Path

import httpx

_FIXTURES = Path(__file__).parents[1] / "tests" / "fixtures"
_UA = "Mozilla/5.0 (compatible; quran-corpus-pwa/0.1; +fixture-capture)"

_TARGETS = {
    "corpus_dict_ktb.html": "https://corpus.quran.com/qurandictionary.jsp?q=ktb",
    "corpus_word_detail_1_1_1.html": (
        "https://corpus.quran.com/wordmorphology.jsp?location=(1:1:1)"
    ),
}


def main() -> None:
    _FIXTURES.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=30.0, headers={"User-Agent": _UA}) as client:
        for name, url in _TARGETS.items():
            print(f"Fetching {url} ...")
            resp = client.get(url)
            resp.raise_for_status()
            out = _FIXTURES / name
            out.write_text(resp.text, encoding="utf-8")
            print(f"  saved {len(resp.text):,} bytes -> {out}")


if __name__ == "__main__":
    main()
