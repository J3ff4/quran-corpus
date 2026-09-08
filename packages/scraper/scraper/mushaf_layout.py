"""Parse the KFGQPC V2 page layout into rows, and validate them.

Pure: no network, no database. Every trap this file exists to handle is one
that fails *silently* if ignored -- see the module tests, each of which names
the corpus-wide damage its trap causes.
"""

import json
from collections.abc import Iterable
from pathlib import Path
from typing import Any, NamedTuple

PAGE_MIN, PAGE_MAX = 1, 604
LINE_MIN, LINE_MAX = 1, 15
CHAR_TYPES = frozenset({"word", "end"})


class LayoutRow(NamedTuple):
    page: int
    line: int
    seq: int
    surah: int
    ayah: int
    position: int
    char_type: str
    glyph: str


def dedupe_pairs(pairs: Iterable[tuple[str, Any]]) -> dict[str, Any]:
    """Keep every value of a repeated JSON key as `key__2`, `key__3`, ...

    The API emits `line_number` twice per word: the first is the V1 layout's
    line, the second the V2 layout's. A normal `json.load` keeps only the last.
    """
    out: dict[str, Any] = {}
    for key, value in pairs:
        if key not in out:
            out[key] = value
            continue
        n = 2
        while f"{key}__{n}" in out:
            n += 1
        out[f"{key}__{n}"] = value
    return out


def read_overrides(path: Path) -> dict[tuple[int, int, int], int]:
    """`(surah, ayah, position) -> line`. Blank lines and `#` comments ignored."""
    overrides: dict[tuple[int, int, int], int] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        surah, ayah, position, to_line = (int(x) for x in line.split("\t")[:4])
        overrides[(surah, ayah, position)] = to_line
    return overrides


def load_rows(
    layout_dir: Path, overrides: dict[tuple[int, int, int], int]
) -> list[LayoutRow]:
    """Every word of every page, grouped by its own V2 page, in payload order."""
    # page -> [(surah, ayah, word)], appended in the order the API sent them.
    # The file a word arrives in is its V1 page and is NOT where it belongs.
    by_page: dict[int, list[tuple[int, int, dict]]] = {}

    for requested in range(PAGE_MIN, PAGE_MAX + 1):
        path = layout_dir / f"{requested:03d}.json"
        if not path.exists():
            continue
        payload = json.loads(
            path.read_text(encoding="utf-8"), object_pairs_hook=dedupe_pairs
        )
        for verse in payload.get("verses", []):
            surah, ayah = (int(x) for x in verse["verse_key"].split(":"))
            for word in verse.get("words", []):
                page = word.get("page_number")
                if page is None:
                    continue
                by_page.setdefault(page, []).append((surah, ayah, word))

    rows: list[LayoutRow] = []
    for page in sorted(by_page):
        seq_by_line: dict[int, int] = {}
        for surah, ayah, word in by_page[page]:
            position = int(word["position"])
            # The V2 line is the SECOND line_number, then any pinned override.
            line = overrides.get((surah, ayah, position), word.get("line_number__2"))
            if line is None:
                continue
            seq_by_line[line] = seq_by_line.get(line, 0) + 1
            rows.append(
                LayoutRow(
                    page=page,
                    line=int(line),
                    seq=seq_by_line[line],
                    surah=surah,
                    ayah=ayah,
                    position=position,
                    char_type=str(word.get("char_type_name")),
                    glyph=str(word.get("code_v2") or ""),
                )
            )
    return rows


def validate_rows(
    rows: list[LayoutRow], word_counts: dict[tuple[int, int], int]
) -> list[str]:
    """Every problem found, as human sentences. Empty list means importable.

    `word_counts` is `(surah, ayah) -> COUNT(*)` from the corpus `words` table.
    The layout and the corpus are separate imports of the same text, so their
    disagreement is the only cross-check that can catch either one drifting.
    """
    problems: list[str] = []

    for row in rows:
        if not PAGE_MIN <= row.page <= PAGE_MAX:
            problems.append(f"page {row.page} outside {PAGE_MIN}..{PAGE_MAX}")
        if not LINE_MIN <= row.line <= LINE_MAX:
            problems.append(
                f"page {row.page}: line {row.line} outside {LINE_MIN}..{LINE_MAX}"
            )
        if row.char_type not in CHAR_TYPES:
            problems.append(
                f"{row.surah}:{row.ayah} position {row.position}: "
                f"char_type {row.char_type!r}"
            )
        if not row.glyph:
            problems.append(
                f"{row.surah}:{row.ayah} position {row.position}: empty glyph"
            )

    by_ayah: dict[tuple[int, int], list[LayoutRow]] = {}
    for row in rows:
        by_ayah.setdefault((row.surah, row.ayah), []).append(row)

    for (surah, ayah), ayah_rows in sorted(by_ayah.items()):
        words = [r for r in ayah_rows if r.char_type == "word"]
        ends = [r for r in ayah_rows if r.char_type == "end"]
        expected = word_counts.get((surah, ayah))

        if expected is not None and len(words) != expected:
            problems.append(
                f"{surah}:{ayah}: layout has {len(words)} words, corpus has {expected}"
            )
        if sorted(r.position for r in words) != list(range(1, len(words) + 1)):
            problems.append(f"{surah}:{ayah}: word positions are not 1..{len(words)}")
        if len(ends) != 1:
            problems.append(f"{surah}:{ayah}: {len(ends)} end markers, expected 1")
        elif ends[0].position != len(words) + 1:
            problems.append(
                f"{surah}:{ayah}: end marker at position {ends[0].position}, "
                f"expected {len(words) + 1}"
            )
        # An end marker on a LATER line than its last word is normal line-fill
        # (573 ayahs). On an EARLIER line it is upstream corruption: the verse
        # number would render a line above the verse it closes.
        if (
            words
            and ends
            and ends[0].page == words[-1].page
            and ends[0].line < words[-1].line
        ):
            problems.append(
                f"{surah}:{ayah}: end marker runs backwards, "
                f"line {ends[0].line} before {words[-1].line}"
            )

    return problems
