"""Pick a short English gloss out of a Hans Wehr dictionary entry.

Hans Wehr entries open with the Arabic headword, its transliteration, and (for
verbs) the Form-I imperfect-vowel marker (``a``/``i``/``u``) or a verbal-noun
parenthetical, before the first English gloss. A ``<b>``-tagged block after
that is a derived form (II, III, ...) and a ``│`` introduces an idiom or
example -- neither belongs in a short, Form-I/noun-head gloss, so both are cut
before the leading-token strip runs.

Tag-strip / entity-unescape / whitespace-collapse below is the same ordering
`salmone_gloss.entry_senses` and `lane_gloss` use -- each of those three
modules keeps its own copy of the (two-line, stdlib-only) regex constants
rather than importing a sibling's private names, and this follows suit.
"""

from __future__ import annotations

import html
import re
import unicodedata

__all__ = ["select_gloss"]

_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")

# A parenthetical holding any Arabic-script char is an object/preposition
# marker ("(هـ s.th.)", "(ب of)") or a verbal-noun spelling ("(ربابة ribāba)"),
# never part of the concise English gloss -- drop the whole group.
_ARABIC_PAREN = re.compile(r"\([^)]*[؀-ۿ][^)]*\)")
# " ," / " ;" left behind after a mid-sentence paren is dropped.
_DANGLING_PUNCT = re.compile(r"\s+([,;])")

# Hans Wehr's Form-I imperfect-vowel markers ("kataba u", "daraba i"). Bare
# ASCII letters, so the non-ASCII/combining-mark check below does not catch
# them on its own.
_VOWEL_MARKER = frozenset("aiu")


def _is_transliteration(tok: str) -> bool:
    """True for Arabic script or a diacritic transliteration token."""
    if not tok.isascii():
        return True
    return any(unicodedata.combining(ch) for ch in unicodedata.normalize("NFD", tok))


def _is_abbrev(tok: str) -> bool:
    """True for a grammar note like ``pl.`` (plural) or ``f.,`` (feminine).

    HW punctuates these inline, so a trailing comma/semicolon is stripped
    before the test -- "f.," is still the feminine marker, not gloss text.
    """
    tok = tok.rstrip(",;")
    return tok.isascii() and tok.endswith(".") and tok[:-1].isalpha()


def _strip_head(text: str) -> str:
    """Drop the leading Arabic head, transliteration, and verbal-noun paren."""
    tokens = text.split()
    i, n = 0, len(tokens)
    while i < n:
        tok = tokens[i]
        if tok.startswith("("):
            j = i
            while j < n and not tokens[j].endswith(")"):
                j += 1
            if j == n:
                # Unbalanced "(" -- consuming to the end would swallow the whole
                # gloss and quarantine an otherwise usable entry. Stop here.
                break
            i = j + 1
            continue
        if tok in _VOWEL_MARKER:
            # "a"/"i"/"u" is a Form-I vowel marker ("lāḥa u (lauḥ)", "rabba u
            # to ...") only when followed by the verbal-noun paren, the "to"
            # infinitive, or more transliteration -- otherwise it is the
            # English article ("a thing"), not a marker.
            nxt = tokens[i + 1] if i + 1 < n else ""
            if nxt.startswith("(") or nxt == "to" or _is_transliteration(nxt):
                i += 1
                continue
            break
        if _is_abbrev(tok) or _is_transliteration(tok):
            i += 1
            continue
        # A plain-ASCII head token that _is_transliteration misses -- HW spells
        # the bare Arabic headword first ("رب rabba u ...", "رب rabb pl. ارباب
        # arbāb lord"), so this sits at i>0. It is head, not gloss, when what
        # follows keeps the head run going: a grammar abbreviation ("pl."),
        # more transliteration, or a bare vowel marker confirmed by a trailing
        # "(", "to", or transliteration (that trailing check is what keeps a
        # real "become a prisoner" out). The loop breaks at the first true
        # gloss token, so it never reaches real English -- no i==0 guard needed.
        if tok.islower() and tok.isalpha():
            nxt = tokens[i + 1] if i + 1 < n else ""
            nxt2 = tokens[i + 2] if i + 2 < n else ""
            marker = nxt in _VOWEL_MARKER and (
                nxt2.startswith("(") or nxt2 == "to" or _is_transliteration(nxt2)
            )
            if _is_abbrev(nxt) or _is_transliteration(nxt) or marker:
                i += 1
                continue
        break
    return " ".join(tokens[i:])


def select_gloss(
    entries: list[tuple[int, str]],
    *,
    prefer_nominal: bool = False,
    max_senses: int = 3,
) -> str | None:
    """Short English gloss: Form-I first sense, or a noun head if requested.

    ``entries`` is `hanswehr.lookup`'s return -- ``(is_root, definition)``
    pairs, ``is_root == 1`` first. ``prefer_nominal`` picks the first
    ``is_root == 0`` entry instead (falling back to ``entries[0]`` if there
    is none), for a root the corpus uses mostly as a noun/adjective.
    """
    if not entries:
        return None
    if prefer_nominal:
        entry = next((e for e in entries if e[0] == 0), entries[0])
    else:
        entry = entries[0]

    definition = entry[1]
    # Cut at the first <b> (derived-form block), │ (idiom/example), or " -- "
    # (a second Form-I headword with its own transliteration) -- none belongs
    # in a Form-I/noun-head gloss.
    cut_points = [
        p
        for p in (
            definition.find("<b>"),
            definition.find("│"),
            definition.find(" -- "),
        )
        if p != -1
    ]
    if cut_points:
        definition = definition[: min(cut_points)]

    # Drop Arabic-script object/preposition markers and verbal-noun spellings
    # that live inside the sense body, past the head -- _strip_head only reaches
    # the leading head, so these survive otherwise (75% of raw glosses).
    definition = _ARABIC_PAREN.sub(" ", definition)
    definition = _strip_head(definition)
    if definition.startswith("to "):
        definition = definition[3:]

    senses = (s.strip() for s in definition.split(";"))
    kept = "; ".join(s for s in list(senses)[:max_senses] if s)
    cleaned = _WS.sub(" ", html.unescape(_TAG.sub(" ", kept))).strip()
    # A dropped mid-sentence paren leaves " ," / " ;" (e.g. "possession ,
    # control"); pull the punctuation back onto the preceding word.
    cleaned = _DANGLING_PUNCT.sub(r"\1", cleaned).strip(" ,;")
    return cleaned or None
