"""Derive a root's gloss list from the word-by-word glosses of its words.

The dictionary needs "what does ك-ت-ب mean in Uzbek", and no source ships that:
Lane and Hans Wehr are English, and Tasnim glosses words, not roots. So the
root list is *derived* -- the glosses Tasnim gave the words carrying that root,
ranked by how often each one is the answer.

Frequency is the whole signal, which makes the tiebreak load-bearing: over
1642 roots most glosses occur once, so without a second key the stored order
would follow whatever order SQLite handed the rows back and change between
rebuilds. Ties break alphabetically on the folded form.
"""

from __future__ import annotations

import sqlite3
from collections import Counter
from collections.abc import Iterable

__all__ = ["TOP_N", "derive_root_glosses", "rank_glosses"]

# Enough for the head of the distribution without turning the dictionary entry
# into a word list; the long tail is reachable through the concordance.
TOP_N = 8


def _fold(text: str) -> str:
    """The counting key: case and spacing are not distinctions here."""
    return " ".join(text.split()).casefold()


def rank_glosses(glosses: Iterable[str], cap: int = TOP_N) -> list[tuple[str, int]]:
    """Rank glosses by frequency, most frequent first. Deterministic."""
    counts: Counter[str] = Counter()
    # Per folded gloss, how often each surface spelling was written -- "Kitob"
    # and "kitob" are one gloss with a joint count, stored under whichever
    # spelling Tasnim used more.
    spellings: dict[str, Counter[str]] = {}
    for raw in glosses:
        text = " ".join(raw.split())
        key = _fold(text)
        # A gloss with no letter or digit is punctuation the source left
        # behind, never a meaning.
        if not any(c.isalnum() for c in key):
            continue
        counts[key] += 1
        spellings.setdefault(key, Counter())[text] += 1

    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:cap]
    return [
        (min(spellings[key].most_common(), key=lambda kv: (-kv[1], kv[0]))[0], count)
        for key, count in ranked
    ]


def derive_root_glosses(con: sqlite3.Connection, language_code: str) -> int:
    """Rewrite one language's `root_glosses`. Returns the roots covered."""
    # DISTINCT word_id: a word whose segments repeat its root (a doubled form)
    # still has exactly one gloss, and counting it per segment would inflate it.
    rows = con.execute(
        """
        SELECT r.id AS root_id, g.gloss_text AS gloss_text,
               w.ayah_id AS ayah_id, g.gloss_group AS gloss_group
          FROM roots r
          JOIN (SELECT DISTINCT root, word_id FROM word_segments
                 WHERE root IS NOT NULL) ws ON ws.root = r.root_buckwalter
          JOIN word_glosses g ON g.word_id = ws.word_id
          JOIN words w ON w.id = g.word_id
         WHERE g.language_code = ?
        """,
        (language_code,),
    ).fetchall()

    # A grouped gloss is ONE gloss spread over a phrase's words, so a root
    # carried by two words of the same phrase must still count it once --
    # otherwise one occurrence of a phrase outranks a gloss that genuinely
    # occurred twice. Group ids are scoped per (ayah, language_code), hence
    # the ayah in the key. NULL groups are one-per-word already and each keep
    # their own count, which is why this cannot be a SELECT DISTINCT: SQLite
    # treats NULLs as equal and would collapse two real occurrences into one.
    #
    # The phrase still lands on every root in the span. That is deliberate:
    # 108 of 1642 roots have no ungrouped Uzbek gloss at all, and for those a
    # phrase beats an empty dictionary entry.
    by_root: dict[int, list[str]] = {}
    seen_spans: set[tuple[int, int, int]] = set()
    for row in rows:
        group = row["gloss_group"]
        if group is not None:
            span = (row["root_id"], row["ayah_id"], group)
            if span in seen_spans:
                continue
            seen_spans.add(span)
        by_root.setdefault(row["root_id"], []).append(row["gloss_text"])

    with con:
        con.execute(
            "DELETE FROM root_glosses WHERE language_code = ?", (language_code,)
        )
        covered = 0
        for root_id, glosses in by_root.items():
            ranked = rank_glosses(glosses)
            if not ranked:
                continue
            covered += 1
            con.executemany(
                "INSERT INTO root_glosses"
                " (root_id, language_code, rank, gloss, occurrence_count)"
                " VALUES (?, ?, ?, ?, ?)",
                [
                    (root_id, language_code, rank, gloss, count)
                    for rank, (gloss, count) in enumerate(ranked, start=1)
                ],
            )
    return covered
