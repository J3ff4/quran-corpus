"""Re-parse the saved snapshot archive into the DB. No network.

CLAUDE.md §11 wants re-parsing to never require re-scraping. Snapshots were
already being written; this is the read half. A parser fix now costs a
minute of local CPU instead of an hour of rate-limited crawling.
"""

from __future__ import annotations

import zlib
from pathlib import Path

from .buckwalter import buckwalter_to_arabic
from .db import ScraperDatabase
from .models import RootFormModel, RootModel
from .snapshots import iter_root_snapshot_paths, read_snapshot
from .sources.corpus_dictionary import parse_root_page


def replay_root_snapshots(
    root_dir: str | Path, db: ScraperDatabase
) -> tuple[int, int, int]:
    """Re-parse every root snapshot. Returns (updated, unparseable, unreadable).

    Unparseable snapshots (404 bodies, a redesigned page) are counted and
    skipped, never written as an empty root -- a silently empty root is the
    exact failure phase 17 existed to fix.
    """
    updated = 0
    unparseable = 0
    unreadable = 0
    for bw, path in iter_root_snapshot_paths(root_dir):
        try:
            html = read_snapshot(path)
        except (OSError, EOFError, zlib.error, UnicodeDecodeError):
            # One damaged .html.gz must not abandon the other 1641 roots --
            # and it must be counted, not skipped in silence. All four types
            # are reachable and none subsumes the others: zlib.error derives
            # from Exception and UnicodeDecodeError from ValueError, so
            # catching OSError/EOFError alone still lets bitrot abort replay.
            unreadable += 1
            continue
        parsed = parse_root_page(html)
        if parsed is None:
            unparseable += 1
            continue
        rid = db.upsert_root(
            RootModel(
                root_buckwalter=bw,
                # Same fallback chain as the scrape. Replaying must reproduce
                # what a re-scrape would write; a bare Buckwalter string in
                # root_arabic on a header-less page would be a divergence.
                root_arabic=parsed.root_arabic or buckwalter_to_arabic(bw) or bw,
                occurrence_count=parsed.occurrence_count,
            )
        )
        db.delete_root_forms(rid)
        for form in parsed.forms:
            db.upsert_root_form(
                RootFormModel(
                    root_id=rid,
                    sort_order=form.sort_order,
                    pos_label=form.pos_label,
                    form_arabic=form.form_arabic,
                    form_translit=form.form_translit,
                    gloss=form.gloss,
                    occurrence_count=form.occurrence_count,
                )
            )
        updated += 1
    return updated, unparseable, unreadable
