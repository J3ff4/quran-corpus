#!/usr/bin/env python3
"""Validate a downloaded mushaf page layout against our own corpus.

Read-only against both inputs. The point of this checker is the cross-check in
`check_corpus_alignment`: row counts agreeing proves nothing (see the
`validate-data-by-alignment-not-count` note), so every page's (surah, ayah)
coverage is compared against what `ayahs.page` claims sits on that page.

Usage:
    python tools/check_mushaf_layout.py \
        --layout ~/quran-data/refdata/mushaf/pages \
        --corpus ../../apps/web/quran.db \
        --edition v2
"""

from __future__ import annotations

import argparse
import collections
import json
import os
import sqlite3
import sys

PAGES = range(1, 605)
LINES_PER_PAGE = 15


def _dedupe(pairs):
    """Keep every value of a repeated JSON key as `key__2`, `key__3`, ...

    The quran.com v4 API emits `line_number` twice per word: the first is the
    V1 layout's line, the second the V2 layout's. A normal `json.load` silently
    keeps only the last, which is how a V2 line number ends up rendering a V1
    page. Nothing else in the payload repeats a key.
    """
    out: dict = {}
    for key, value in pairs:
        if key not in out:
            out[key] = value
            continue
        n = 2
        while f"{key}__{n}" in out:
            n += 1
        out[f"{key}__{n}"] = value
    return out


def load_layout(layout_dir: str, edition: str) -> dict[int, list[dict]]:
    """Return {page: [word, ...]} in reading order, for one edition.

    `by_page/{n}` paginates by **V1** pages, so for V1 the requested page is the
    page. V2 disagrees with V1 on where some pages break -- 5:77 is on V1 121
    and V2 120 -- so for V2 the page comes from each word's own `page_number`
    and words are regrouped across request boundaries.

    Words whose char_type is not `word` (end-of-ayah marks) are kept: they
    occupy line space and the font renders them, so dropping them would make
    the line ranges wrong.
    """
    code_field = f"code_{edition}"
    line_field = "line_number" if edition == "v1" else "line_number__2"
    pages: dict[int, list[dict]] = collections.defaultdict(list)

    for requested in PAGES:
        path = os.path.join(layout_dir, f"{requested:03d}.json")
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            payload = json.load(f, object_pairs_hook=_dedupe)
        for verse in payload.get("verses", []):
            surah, ayah = (int(x) for x in verse["verse_key"].split(":"))
            for w in verse.get("words", []):
                page = requested if edition == "v1" else w.get("page_number")
                if page is None:
                    continue
                if edition == "v1" and w.get("page_number__2") is not None:
                    pass  # V1 page is the request page; nothing else to reconcile
                pages[page].append(
                    {
                        "id": w["id"],
                        "line": w.get(line_field),
                        "surah": surah,
                        "ayah": ayah,
                        "code": w.get(code_field),
                        "text": w.get("text_qpc_hafs"),
                        "char_type": w.get("char_type_name"),
                    }
                )

    # A verse straddling a V1 page appears in two request files, so de-duplicate
    # by word id. Payload order IS reading order and word ids are not ordered at
    # all -- 4:176 carries id 83385 while 5:2 on the same page carries 1544 --
    # so never sort by id; keep the order the API sent.
    result: dict[int, list[dict]] = {}
    for page in sorted(pages):
        seen: set[int] = set()
        ordered = []
        for w in pages[page]:
            if w["id"] in seen:
                continue
            seen.add(w["id"])
            ordered.append(w)
        result[page] = ordered
    return result


def check_pages_present(pages: dict[int, list[dict]]) -> list[str]:
    missing = [p for p in PAGES if p not in pages]
    empty = sorted(p for p, w in pages.items() if not w)
    out = []
    if missing:
        out.append(f"missing pages: {missing}")
    if empty:
        out.append(f"pages with no words: {empty}")
    return out


def check_lines(
    pages: dict[int, list[dict]],
) -> tuple[collections.Counter, dict[int, list[int]], list[str]]:
    """Line numbers must stay inside 1..15. Report the distribution and strays.

    A page with fewer than 15 *occupied* lines is normal, not an error: surah
    header and basmallah lines carry no words, so they show up as gaps in the
    occupied set. A line number outside 1..15 is a real defect.
    """
    dist: collections.Counter = collections.Counter()
    short: dict[int, list[int]] = collections.defaultdict(list)
    problems = []
    for page, words in sorted(pages.items()):
        lines = {w["line"] for w in words if w["line"] is not None}
        if any(w["line"] is None for w in words):
            problems.append(f"page {page}: word with no line_number")
        dist[len(lines)] += 1
        if len(lines) != LINES_PER_PAGE:
            short[len(lines)].append(page)
        stray = sorted(l for l in lines if not 1 <= l <= LINES_PER_PAGE)
        if stray:
            problems.append(f"page {page}: line numbers outside 1..15: {stray}")
    return dist, short, problems


def line_ranges(words: list[dict]) -> dict[int, tuple[int, int]]:
    """{line_number: (first_word_id, last_word_id)} for the lines that hold words."""
    ranges: dict[int, tuple[int, int]] = {}
    for w in words:
        line = w["line"]
        if line is None:
            continue
        lo, hi = ranges.get(line, (w["id"], w["id"]))
        ranges[line] = (min(lo, w["id"]), max(hi, w["id"]))
    return ranges


def check_word_ranges(pages: dict[int, list[dict]]) -> list[str]:
    """Lines must partition the page's words, in order, with nothing left over.

    Word ids from the API are database ids and are not ordered by reading order
    at all, so no arithmetic on them proves anything. Document order does: the words arrive in reading order, so a
    page's line numbers must be non-decreasing through that order, and each
    line must own one unbroken run of it. A word that appears after its line
    has been left behind means the layout and the text disagree about order.
    """
    problems = []
    for page, words in sorted(pages.items()):
        seen: dict[int, tuple[int, int]] = {}
        previous_line = None
        for seq, w in enumerate(words):
            line = w["line"]
            if line is None:
                continue
            if previous_line is not None and line < previous_line:
                problems.append(
                    f"page {page}: line {line} appears after line {previous_line} in reading order"
                )
            if line in seen and previous_line != line:
                problems.append(f"page {page}: line {line} is broken into two runs")
            first, _ = seen.get(line, (seq, seq))
            seen[line] = (first, seq)
            previous_line = line

        ids = [w["id"] for w in words]
        if len(set(ids)) != len(ids):
            problems.append(f"page {page}: a word id appears twice")
    return problems


def check_glyphs(pages: dict[int, list[dict]], edition: str) -> list[str]:
    problems = []
    for page, words in sorted(pages.items()):
        blank = [w["id"] for w in words if not w["code"]]
        if blank:
            problems.append(f"page {page}: {len(blank)} words with no code_{edition} (first id {blank[0]})")
    return problems


def check_corpus_alignment(pages: dict[int, list[dict]], corpus_db: str) -> list[str]:
    """Compare each page's (surah, ayah) coverage with our own ayahs.page.

    This is the check that matters. Both sides claim to know which ayahs sit on
    a printed page; they came from different sources, so any disagreement is
    either a real edition difference or an import bug, and both need naming.
    """
    con = sqlite3.connect(f"file:{corpus_db}?mode=ro", uri=True)
    ours: dict[int, set[tuple[int, int]]] = collections.defaultdict(set)
    for surah, ayah, page in con.execute(
        "SELECT surah_id, ayah_number, page FROM ayahs WHERE page IS NOT NULL"
    ):
        ours[page].add((surah, ayah))
    con.close()

    problems = []
    for page in sorted(pages):
        theirs = {(w["surah"], w["ayah"]) for w in pages[page]}
        mine = ours.get(page, set())
        only_layout = sorted(theirs - mine)
        only_corpus = sorted(mine - theirs)
        if only_layout or only_corpus:
            problems.append(
                f"page {page}: layout-only {only_layout or '-'}, corpus-only {only_corpus or '-'}"
            )
    return problems


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--layout", required=True, help="directory of per-page layout JSON")
    ap.add_argument("--corpus", required=True, help="path to quran.db")
    ap.add_argument("--edition", default="v2", choices=("v1", "v2"))
    args = ap.parse_args()

    pages = load_layout(os.path.expanduser(args.layout), args.edition)
    print(f"edition {args.edition}: {len(pages)} pages loaded, "
          f"{sum(len(w) for w in pages.values())} words")

    failures = 0

    def report(title: str, problems: list[str], limit: int = 25) -> None:
        nonlocal failures
        print(f"\n== {title}: {len(problems)} problem(s)")
        for line in problems[:limit]:
            print(f"   {line}")
        if len(problems) > limit:
            print(f"   ... and {len(problems) - limit} more")
        failures += len(problems)

    report("pages present", check_pages_present(pages))

    dist, short, line_problems = check_lines(pages)
    print("\n== occupied lines per page")
    for count, pages_with in sorted(dist.items()):
        names = "" if count == LINES_PER_PAGE else f"  -> {sorted(short[count])}"
        print(f"   {count:>2} lines: {pages_with} page(s){names}")
    report("line numbering", line_problems)

    report("word id ranges", check_word_ranges(pages))
    report(f"code_{args.edition} glyphs", check_glyphs(pages, args.edition))
    report("alignment with ayahs.page", check_corpus_alignment(pages, args.corpus))

    print(f"\nTOTAL problems: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
