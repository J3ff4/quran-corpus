"""Uzbek Latin -> Cyrillic.

Both scripts are in daily use, so a reader picks one. Tasnim ships Latin only
(its Cyrillic column is filled for 30 rows, all in surah 1), so the Cyrillic
word-by-word is derived here rather than imported.

Deterministic and total: every Latin letter has exactly one Cyrillic answer and
anything else -- digits, punctuation, the parentheses Tasnim uses for its
clarifications -- passes through untouched.
"""

from __future__ import annotations

__all__ = ["to_cyrillic"]

# The four apostrophes that all render alike and all mean the same thing. Which
# one a source used is invisible on screen, so all four count.
_APOSTROPHES = "'ʻʼ’"

# o' and g' are LETTERS, not a letter plus punctuation, and they are resolved
# before anything else -- see _PRE. Left to the ordered table below they would
# lose to the `yo` digraph in "yo'l", which comes out ёл: a different word.
_APOSTROPHE_LETTERS = {"o": "ў", "g": "ғ"}

# Longest match wins, so digraphs lead. `ng` is left out deliberately: it
# transliterates to н + г, which is exactly what the singles already produce.
#
# `ts` is left out for a stronger reason. It is the standard spelling of ц in
# Russian loanwords, but t followed by s is also ordinary Uzbek morphology --
# the conditional -sa and the privative -siz both produce it. Across every
# gloss in the Tasnim database there are 46 tokens containing `ts` and all 46
# are the native sequence (yetsa, baxtsiz, hidoyatsiz, qaytsangiz); not one is
# a ц word. The digraph would turn айтса into айца on every one of them, so
# the singles are left to produce т + с.
_DIGRAPHS = [
    ("sh", "ш"),
    ("ch", "ч"),
    ("yo", "ё"),
    ("yu", "ю"),
    ("ya", "я"),
    ("ye", "е"),
]

_SINGLES = {
    "a": "а", "b": "б", "c": "к", "d": "д", "e": "е", "f": "ф",
    "g": "г", "h": "ҳ", "i": "и", "j": "ж", "k": "к", "l": "л",
    "m": "м", "n": "н", "o": "о", "p": "п", "q": "қ", "r": "р",
    "s": "с", "t": "т", "u": "у", "v": "в", "x": "х", "y": "й",
    "z": "з",
}  # fmt: skip

# x and h are separate letters and separate sounds: хайр and ҳамд are unrelated
# words, and folding the two is the most visible error available here.

_CYRILLIC_LETTERS = set("абвгдеёжзийклмнопрстуфхцчшъэюяўғқҳ")


def _is_letter(ch: str) -> bool:
    return ch.isalpha() or ch.lower() in _CYRILLIC_LETTERS


def _cased(source: str, target: str) -> str:
    """Carry the source's capitalization onto the replacement."""
    return target[0].upper() + target[1:] if source[0].isupper() else target


def _pre(text: str) -> str:
    """Resolve o' and g' to their Cyrillic letters before the main pass."""
    out: list[str] = []
    i = 0
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        replacement = _APOSTROPHE_LETTERS.get(ch.lower())
        # `nxt` is "" at the end of the string, and "" is a substring of
        # everything -- so the membership test alone makes a trailing o or g
        # into ў/ғ.
        if replacement is not None and nxt != "" and nxt in _APOSTROPHES:
            out.append(_cased(ch, replacement))
            i += 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def to_cyrillic(latin: str) -> str:
    """Transliterate one Uzbek Latin string. Total; never raises."""
    text = _pre(latin)
    out: list[str] = []
    i = 0
    while i < len(text):
        ch = text[i]
        lower = ch.lower()

        # Word-initial, decided against what has already been WRITTEN: a gloss
        # is a phrase, so "va endi" has two word starts, not one.
        initial = not out or not _is_letter(out[-1][-1])

        if lower in _APOSTROPHES:
            # Not part of o'/g' -- _pre consumed those. Standing alone between
            # letters it is tutuq belgisi: Ya’qub, ma’no.
            out.append("ъ")
            i += 1
            continue

        pair = text[i : i + 2]
        match = next(
            (c for latin_pair, c in _DIGRAPHS if latin_pair == pair.lower()), None
        )
        if match is not None:
            out.append(_cased(pair, match))
            i += 2
            continue

        if lower == "e":
            out.append(_cased(ch, "э" if initial else "е"))
            i += 1
            continue

        single = _SINGLES.get(lower)
        out.append(_cased(ch, single) if single is not None else ch)
        i += 1
    return "".join(out)
