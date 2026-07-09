"""Generate Uzbek word glosses from the English ones (idempotent, checkpointed).

Translate each DISTINCT English gloss once (28k, not 77k) in batches, writing
and committing each batch's uz rows immediately after translating it — a real
checkpoint. A crash mid-run only loses the in-flight batch; a re-run's todo
query naturally resumes (skips words that already got a uz row). source='mt'.
Back up the DB (.bak) before running against the canonical DB.

Two spike-driven guards (see plan): corpus editorial notation is stripped
before MT (NLLB mangles it), and empty MT output is skipped (NLLB returns ''
for words like 'from'/'except') so the word keeps its EN fallback instead of a
blank uz gloss.
"""
from __future__ import annotations

import re
from collections import defaultdict

from .db import ScraperDatabase
from .mt import MtProvider

_NOTATION = re.compile(r"[\[\]()]")


def _normalize_for_mt(text: str) -> str:
    """Strip corpus editorial brackets/parens so NLLB sees plain English.

    '(of) Allah'->'of Allah', '[the] right,'->'the right,'. The uz gloss is
    machine-assisted; dropping the notation lifts MT quality (spike-confirmed).
    ponytail: char-strip, not a parser — the corpus only uses () and [].
    """
    return re.sub(r"\s+", " ", _NOTATION.sub("", text)).strip()


def translate_glosses(
    db: ScraperDatabase, provider: MtProvider, batch_size: int = 256
) -> int:
    """Fan uz glosses out to every English-glossed word missing one.

    Returns rows written.
    """
    # words needing a uz gloss, with their EN source text
    todo = db._conn.execute(
        """SELECT en.word_id AS word_id, en.gloss_text AS en_gloss
           FROM word_glosses en
           WHERE en.language_code='en'
             AND NOT EXISTS (SELECT 1 FROM word_glosses uz
                             WHERE uz.word_id=en.word_id AND uz.language_code='uz')"""
    ).fetchall()
    if not todo:
        return 0

    word_ids_by_gloss: dict[str, list[int]] = defaultdict(list)
    for r in todo:
        word_ids_by_gloss[r["en_gloss"]].append(r["word_id"])
    distinct = sorted(word_ids_by_gloss)

    written = 0
    for i in range(0, len(distinct), batch_size):
        chunk = distinct[i : i + batch_size]
        translated = provider.translate([_normalize_for_mt(en) for en in chunk])
        for en, uz in zip(chunk, translated, strict=True):
            uz = uz.strip()
            if not uz:  # NLLB gave nothing — leave the word to its EN fallback
                continue
            for word_id in word_ids_by_gloss[en]:
                db.upsert_uz_gloss(word_id, uz, "mt")
                written += 1
        db._conn.commit()  # checkpoint: this batch's translation + writes together
    return written
