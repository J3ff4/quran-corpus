"""One-time exploration script: fetch corpus.quran.com 1:1 and save raw HTML.

Run: uv run python tools/inspect_corpus_html.py
Output: tests/fixtures/corpus_1_1.html
"""
import asyncio
from pathlib import Path

from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

URL = "https://corpus.quran.com/wordbyword.jsp?chapter=1&verse=1"
FIXTURE_PATH = Path(__file__).parents[1] / "tests" / "fixtures" / "corpus_1_1.html"


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        print(f"Fetching {URL} ...")
        await page.goto(URL, wait_until="networkidle", timeout=30_000)
        html = await page.content()
        FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE_PATH.write_text(html, encoding="utf-8")
        print(f"Saved {len(html):,} bytes to {FIXTURE_PATH}")

        soup = BeautifulSoup(html, "lxml")
        print("\n--- Top-level element counts ---")
        for tag in ["table", "div", "tr", "td", "span"]:
            elements = soup.find_all(tag)
            print(f"  <{tag}>: {len(elements)} total")
            if elements:
                first = elements[0]
                attrs = dict(list(first.attrs.items())[:3])
                print(f"    first attrs: {attrs}")

        print("\n--- Elements with lang='ar' ---")
        arabic_els = soup.find_all(attrs={"lang": "ar"})
        print(f"  Count: {len(arabic_els)}")
        if arabic_els:
            texts = [el.get_text(strip=True) for el in arabic_els[:6]]
            print(f"  First texts: {texts}")

        print("\n--- Tables with class ---")
        for tbl in soup.find_all("table")[:5]:
            print(f"  class={tbl.get('class')} id={tbl.get('id')}")

        print("\n--- Done. Open tests/fixtures/corpus_1_1.html to inspect. ---")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
