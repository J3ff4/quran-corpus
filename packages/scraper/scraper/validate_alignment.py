"""Alignment gate: text_arabic must correspond to translit/segments for every
word. Row counts prove existence, not correspondence — so this checks both a
whole-DB invariant and hard-coded ground-truth anchors."""

from __future__ import annotations

from .db import ScraperDatabase

# (surah, ayah, position, expected_arabic, expected_translit) — verified 2026-07-05
GROUND_TRUTH = [
    (112, 1, 1, "قُلْ", "qul"),
    (36, 1, 1, "يسٓ", "ya-seen"),
    (2, 2, 5, "فِيهِ", "fīhi"),
]


def validate_alignment(db: ScraperDatabase) -> list[str]:
    """Return a list of human-readable failures. Empty list = aligned."""
    errs: list[str] = []

    # A word with NO segments can't have text_arabic derived at all (the
    # misalignment check below inner-joins segments, so it can't see such a
    # word). Flag it directly rather than leaning on derive-word-arabic having
    # raised first.
    #
    # Note: we deliberately do NOT flag segments with an empty form_arabic.
    # Empty-form suffixes are legitimate corpus morphology — assimilated
    # 1st-person pronouns like the ي in رَبِّ ("my Lord") or إِلَىَّ ("to me")
    # carry grammatical meaning but no separate glyph. 208 such segments exist
    # in the real data; group_concat correctly drops them, and the resulting
    # text_arabic is verified correct (misalignment count is 0). The guard
    # against a genuinely missing form is the text_arabic == concat invariant
    # plus the ground-truth anchors (2:2:5 فِيهِ is itself multi-segment).
    no_segments = db.count_words_without_segments()
    if no_segments:
        errs.append(f"{no_segments} words have no segments")

    misaligned = db.count_text_arabic_misaligned()
    if misaligned:
        errs.append(f"{misaligned} words: text_arabic != segment concat")

    no_translit = db.count_words_missing_translit()
    if no_translit:
        errs.append(f"{no_translit} words missing transliteration")

    for surah, ayah, pos, exp_ar, exp_tr in GROUND_TRUTH:
        loc = f"{surah}:{ayah}:{pos}"
        row = db.get_word_align(surah, ayah, pos)
        if row is None:
            errs.append(f"{loc} not found")
            continue
        if row["text_arabic"] != exp_ar:
            errs.append(f"{loc} arabic {row['text_arabic']!r} != {exp_ar!r}")
        if row["transliteration"] != exp_tr:
            errs.append(f"{loc} translit {row['transliteration']!r} != {exp_tr!r}")

    return errs
