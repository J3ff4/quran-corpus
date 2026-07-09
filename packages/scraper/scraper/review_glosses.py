"""Human review round-trip for Uzbek glosses (file export/edit/import).

export_top writes the highest-occurrence distinct glosses (EN + current MT UZ)
for a human to correct in any editor. Words whose MT output was empty (NLLB
returns '' for head words like 'from'/'except') have no uz row yet — export_top
surfaces those too (uz=None) so the human review pass is the only way to reach
them. import_reviewed writes the corrected UZ back to every word sharing that
EN gloss, CREATING the uz row if it didn't exist and flipping source to
'mt-reviewed' either way. Both idempotent. source values: mt -> mt-reviewed.
"""
from __future__ import annotations

from .db import ScraperDatabase


def export_top(db: ScraperDatabase, n: int) -> list[dict]:
    """Top-n distinct EN glosses by word occurrence, with their current UZ gloss.

    LEFT JOIN (not INNER): a word whose MT output was empty has no uz row at
    all, but it's exactly the word review needs to reach, so it must still
    surface here (uz=None) rather than being silently excluded.

    GROUP BY EN gloss ONLY (import_reviewed applies per EN gloss too). MAX(uz)
    picks a representative UZ — normally uniform (translate fans one MT out to
    all words sharing an EN gloss), None when every sharing word lacks a uz row.
    Grouping by (en, uz) would split one EN gloss across --top slots in mixed
    (partially reviewed) states, starving other high-frequency glosses.
    """
    rows = db._conn.execute(
        """SELECT en.gloss_text AS en, MAX(uz.gloss_text) AS uz, COUNT(*) AS occ
           FROM word_glosses en
           LEFT JOIN word_glosses uz ON uz.word_id=en.word_id AND uz.language_code='uz'
           WHERE en.language_code='en'
           GROUP BY en.gloss_text
           ORDER BY occ DESC, en.gloss_text
           LIMIT ?""",
        (n,),
    ).fetchall()
    return [{"en": r["en"], "uz": r["uz"], "occ": r["occ"]} for r in rows]


def import_reviewed(db: ScraperDatabase, entries: list[dict]) -> int:
    """Apply corrected UZ glosses; upsert to 'mt-reviewed' for every word
    sharing that EN gloss — CREATING the uz row when the word had none (the
    empty-MT case export_top now surfaces) as well as updating an existing one.

    Matches by EN gloss. Only rows whose (gloss_text, source) actually change
    count — so a re-run with the same file writes nothing. Malformed entries
    (missing 'en'/'uz') and unfilled ones (uz null or blank — a partially edited
    export still carries the None head words export_top surfaces) are skipped
    rather than pushing NULL/'' into the NOT NULL gloss_text column.
    """
    changed = 0
    for e in entries:
        uz = e.get("uz")
        if "en" not in e or uz is None or not str(uz).strip():
            continue
        word_ids = [
            r["word_id"]
            for r in db._conn.execute(
                "SELECT word_id FROM word_glosses "
                "WHERE language_code='en' AND gloss_text=?",
                (e["en"],),
            ).fetchall()
        ]
        for word_id in word_ids:
            cur = db._conn.execute(
                """INSERT INTO word_glosses (word_id, language_code, gloss_text, source)
                   VALUES (?, 'uz', ?, 'mt-reviewed')
                   ON CONFLICT(word_id, language_code) DO UPDATE SET
                     gloss_text = excluded.gloss_text, source = excluded.source
                   WHERE word_glosses.gloss_text <> excluded.gloss_text
                      OR word_glosses.source <> 'mt-reviewed'""",
                (word_id, uz),
            )
            changed += cur.rowcount
    db._conn.commit()
    return changed
