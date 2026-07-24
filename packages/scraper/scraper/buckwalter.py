"""Buckwalter transliteration <-> Arabic script.

The Quranic Arabic Corpus morphology file encodes Arabic (forms, roots,
lemmas) in Buckwalter ASCII transliteration. This module converts those
ASCII strings back to Arabic Unicode so roots/lemmas can be displayed in
Arabic. The mapping is the standard Buckwalter scheme (Tim Buckwalter).

Reference: https://corpus.quran.com/java/orthographymodel.jsp
"""

from __future__ import annotations

import unicodedata

# Buckwalter ASCII char -> Arabic Unicode codepoint.
_BUCKWALTER_TO_ARABIC: dict[str, str] = {
    "'": "ء",  # hamza
    "|": "آ",  # alef with madda above
    ">": "أ",  # alef with hamza above
    "&": "ؤ",  # waw with hamza above
    "<": "إ",  # alef with hamza below
    "}": "ئ",  # yeh with hamza above
    "A": "ا",  # alef
    "b": "ب",  # beh
    "p": "ة",  # teh marbuta
    "t": "ت",  # teh
    "v": "ث",  # theh
    "j": "ج",  # jeem
    "H": "ح",  # hah
    "x": "خ",  # khah
    "d": "د",  # dal
    "*": "ذ",  # thal
    "r": "ر",  # reh
    "z": "ز",  # zain
    "s": "س",  # seen
    "$": "ش",  # sheen
    "S": "ص",  # sad
    "D": "ض",  # dad
    "T": "ط",  # tah
    "Z": "ظ",  # zah
    "E": "ع",  # ain
    "g": "غ",  # ghain
    "f": "ف",  # feh
    "q": "ق",  # qaf
    "k": "ك",  # kaf
    "l": "ل",  # lam
    "m": "م",  # meem
    "n": "ن",  # noon
    "h": "ه",  # heh
    "w": "و",  # waw
    "Y": "ى",  # alef maksura
    "y": "ي",  # yeh
    # Diacritics (harakat / tanween / shadda / sukun)
    "F": "ً",  # fathatan
    "N": "ٌ",  # dammatan
    "K": "ٍ",  # kasratan
    "a": "َ",  # fatha
    "u": "ُ",  # damma
    "i": "ِ",  # kasra
    "~": "ّ",  # shadda
    "o": "ْ",  # sukun
    "^": "ٓ",  # maddah above
    "#": "ٔ",  # hamza above
    "`": "ٰ",  # superscript alef
    "{": "ٱ",  # alef wasla
    "_": "ـ",  # tatweel -- seat for a hamza written with no letter of its own
    # Quranic / extended symbols present in the corpus
    ":": "ۜ",  # small high seen
    "@": "۟",  # small high rounded zero
    "\"": "۠",  # small high upright rectangular zero
    "[": "ۢ",  # small high meem isolated form
    ";": "ۣ",  # small low seen
    ",": "ۥ",  # small waw
    ".": "ۦ",  # small yeh
    "!": "ۨ",  # small high noon
    "-": "۪",  # empty centre low stop
    "+": "۫",  # empty centre high stop
    "%": "۬",  # rounded high stop with filled centre
    "]": "ۭ",  # small low meem
}


def buckwalter_to_arabic(text: str | None) -> str | None:
    """Convert a Buckwalter ASCII string to Arabic Unicode.

    Returns None for None input. Unknown characters are passed through
    unchanged (defensive: better to keep an unmapped char than drop it).

    NFC-normalizes the result: the corpus sometimes spells a composable
    letter (e.g. alef-madda) as a base letter + combining mark across two
    ASCII chars ('A^') rather than one ('|'). Char-by-char mapping alone
    would leave those as different Unicode sequences even though they
    render identically, breaking exact-string matches against Arabic text
    from other sources (root_forms.form_arabic) that use the precomposed
    form.
    """
    if text is None:
        return None
    converted = "".join(_BUCKWALTER_TO_ARABIC.get(ch, ch) for ch in text)
    return unicodedata.normalize("NFC", converted)
