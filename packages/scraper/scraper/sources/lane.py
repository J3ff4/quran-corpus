"""Import Lane's Lexicon root definitions (public domain), additive layer.

Input: TSV ``root_buckwalter<TAB>definition`` (one row per root). Keyed by
root; stored with source='lane'. Creates the root if absent so definitions can
load before the dictionary scrape.
"""

from __future__ import annotations

from pathlib import Path

from ..buckwalter import buckwalter_to_arabic
from ..db import ScraperDatabase
from ..models import RootDefinitionModel, RootModel


def import_lane_definitions(
    path: Path, db: ScraperDatabase, *, source: str = "lane"
) -> int:
    """Upsert one root_definitions row per TSV line. Returns #definitions imported."""
    count = 0
    with path.open(encoding="utf-8") as fh:
        for raw in fh:
            line = raw.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t", 1)
            if len(parts) != 2:
                continue
            bw, definition = parts[0].strip(), parts[1].strip()
            if not bw or not definition:
                continue
            rid = db.upsert_root(
                RootModel(
                    root_buckwalter=bw, root_arabic=buckwalter_to_arabic(bw) or bw
                )
            )
            db.upsert_root_definition(
                RootDefinitionModel(root_id=rid, source=source, definition=definition)
            )
            count += 1
    return count
