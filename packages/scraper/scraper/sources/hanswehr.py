"""Read Hans Wehr's Dictionary of Modern Written Arabic from a vendored sqlite.

The vendored artefact is a single-table FTS5 sqlite (`DICTIONARY(id, word,
definition, is_root, parent_id, quran_occurrence, favorite_flag)`) at
`/home/claude/quran-data/hanswehr.sqlite` (§11 vendored artefact). It is
read-only here: opened with `mode=ro` and never written. No network is used;
this module only reads a local file.

Licence: Hans Wehr's dictionary is still in copyright; this is the
"ship-public copyright risk" decision recorded 2026-08-02 (see
docs memory: hanswehr-source-decision). Attribution lives in
apps/web/src/app/about/page.tsx alongside the other sources.
"""

from __future__ import annotations

import sqlite3
import unicodedata
from pathlib import Path

from ..buckwalter import buckwalter_to_arabic

__all__ = [
    "ANCHORS",
    "EXPECTED_HEADS",
    "build_index",
    "key_candidates",
    "lookup",
    "normalize_key",
]

# Harakat (fatha..sukun) run U+064B-U+0652 inclusive, so the upper bound for
# maketrans's char range is exclusive at 0x0653.
_DIACRITICS = str.maketrans("", "", "".join(chr(c) for c in range(0x064B, 0x0653)))

# Hamza-seat folds, verified in the 2026-08-05 spike: precomposed hamza-alif
# forms and the bare hamza collapse to alef/nothing, and the two hamza-on-y/w
# seats fold to their bare letter, matching how the DB spells the same root
# inconsistently across headwords.
_HAMZA_FOLD = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ء": "", "ئ": "ي", "ؤ": "و"})
# Alef maksura -> yeh: the DB is not consistent about which one a weak-final
# root uses.
_ALEF_MAKSURA = str.maketrans({"ى": "ي"})

# Measured 2026-08-05 against the real vendored sqlite
# (/home/claude/quran-data/hanswehr.sqlite, 24799 rows, folding to this many
# distinct normalized keys): see task-1-report.md for the measurement
# snippet and raw output.
EXPECTED_HEADS = 19921

# Alignment gate that count parity cannot give: each of these Buckwalter
# roots must resolve, via lookup(), to a head definition containing the
# named English word. Verified against the pinned vendored sqlite.
ANCHORS = {
    "Trf": "blink",
    "hrb": "flee",
    "nDd": "pile",
    "gTw": "cover",
}


def normalize_key(ar: str) -> str:
    """Fold diacritics and hamza seats so DB spelling variants compare equal.

    Used for both index keys (built from DB rows) and lookup candidates (built
    from a Buckwalter root converted to Arabic), so the two sides of a lookup
    are folded identically.
    """
    folded = ar.translate(_DIACRITICS).translate(_HAMZA_FOLD).translate(_ALEF_MAKSURA)
    return unicodedata.normalize("NFC", folded)


def key_candidates(ar: str) -> list[str]:
    """Ordered raw-Arabic variants of ``ar`` to try, most-specific first.

    The DB files a geminate root under its two-letter spelling and a
    weak-final root sometimes under a trailing waw instead of yeh/alif
    maksura, so both get a candidate before falling back to the literal root.

    Hamza seats are NOT folded here: `lookup` runs every candidate through
    `normalize_key`, which already applies `_HAMZA_FOLD` idempotently to both
    sides, so a hamza-stripped candidate would collapse to a key its source
    variant already produces -- dead work. These candidates are distinct by
    construction, so no de-dup pass is needed.
    """
    out = [ar]
    if len(ar) == 3 and ar[1] == ar[2]:
        out.append(ar[:2])
    if ar.endswith(("ي", "ى")):
        out.append(ar[:-1] + "و")
    return out


def build_index(
    db_path: Path,
    *,
    expected: int | None = EXPECTED_HEADS,
    anchors: dict[str, str] = ANCHORS,
) -> dict[str, list[tuple[int, str]]]:
    """Map normalized Arabic key -> that key's `(is_root, definition)` list.

    Every DICTIONARY row is kept (not first-writer-wins): a verb root and a
    derived noun head can share a key, and the extractor needs both, root
    first. ``expected`` is the completeness gate; pass the fixture's own
    count in tests and ``None`` only when a caller genuinely does not know
    the size. ``anchors`` is the alignment gate that count parity cannot
    give -- pass ``{}`` for a synthetic fixture, whose roots are not real.
    """
    index: dict[str, list[tuple[int, str]]] = {}
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        rows = conn.execute("SELECT word, definition, is_root FROM DICTIONARY")
        for word, definition, is_root in rows:
            index.setdefault(normalize_key(word), []).append((is_root, definition))
    finally:
        conn.close()
    for entries in index.values():
        # `or 0`: a NULL is_root (not constrained NOT NULL in the FTS5 schema)
        # would raise TypeError mid-sort and abort the whole build before the
        # expected/anchor gates below could report a source change. Treat it
        # as a non-root (0), sorting after real roots.
        entries.sort(key=lambda pair: pair[0] or 0, reverse=True)

    if expected is not None and len(index) != expected:
        raise ValueError(
            f"{db_path} yielded {len(index)} head keys, expected {expected} "
            "-- source changed or truncated; re-measure EXPECTED_HEADS before "
            "trusting any gloss from this run"
        )
    for bw, excerpt in anchors.items():
        hits = lookup(index, bw)
        if hits is None or not any(excerpt.lower() in d.lower() for _, d in hits):
            raise ValueError(
                f"{db_path} indexed {len(index)} head keys but anchor {bw!r} "
                f"does not hold {excerpt!r} -- the source changed, or "
                "normalization stopped matching it"
            )
    return index


def lookup(
    index: dict[str, list[tuple[int, str]]], bw: str
) -> list[tuple[int, str]] | None:
    """Entries for Buckwalter root ``bw``, trying normalization variants in order."""
    ar = buckwalter_to_arabic(bw)
    if ar is None:
        return None
    return next(
        (index[k] for c in key_candidates(ar) if (k := normalize_key(c)) in index),
        None,
    )
