"""Cross-check scraped/imported DB annotations against the GPL morphology file.

The GPL file (quranic-corpus-morphology-0.4.txt) is ground truth for
root/POS. This reports where the DB disagrees, catching parsing errors.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .db import ScraperDatabase
from .sources.corpus_morphology import parse_corpus_morphology


@dataclass
class Mismatch:
    surah: int
    ayah: int
    position: int
    field: str
    scraped: str | None
    expected: str | None


def validate_against_gpl(gpl_path: Path, db: ScraperDatabase) -> list[Mismatch]:
    """Return per-field mismatches between DB words and the GPL ground truth."""
    truth = {
        (pw.surah, pw.ayah, pw.position): pw
        for pw in parse_corpus_morphology(gpl_path)
    }
    mismatches: list[Mismatch] = []
    for row in db.get_all_word_annotations():
        key = (row["surah_id"], row["ayah_number"], row["position"])
        pw = truth.get(key)
        if pw is None:
            continue
        for field, scraped, expected in (
            ("root_buckwalter", row["root_buckwalter"], pw.root_buckwalter),
            ("pos_tag", row["pos_tag"], pw.pos_tag),
        ):
            if scraped != expected:
                mismatches.append(
                    Mismatch(
                        surah=key[0],
                        ayah=key[1],
                        position=key[2],
                        field=field,
                        scraped=scraped,
                        expected=expected,
                    )
                )
    return mismatches
