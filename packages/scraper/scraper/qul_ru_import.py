"""Import Quran Academy's Russian word-by-word (QUL resource 97) from the raw snapshot.

Shipped under the owner's 2026-10-07 override of #116, before a written grant: see
docs/plans/phase-m13-russian-wbw.md for the credit wording and the removal runbook.
The snapshot was scraped once (rate-limited, resumable) and is only ever re-parsed.
"""

from __future__ import annotations

import html
import re
import unicodedata  # validate_ru_gloss: control-character category
from collections.abc import Sequence
from pathlib import Path
from typing import NamedTuple

from .tasnim_align import base_form
from .tasnim_import import strip_arabic_marks, validate_gloss

SOURCE = "quranacademy"
LANGUAGE = "ru"
SNAPSHOT_PATH = Path.home() / "quran-data/refdata/qul-ru-wbw/qul_ru_wbw.sqlite"

# Proven over all 6,236 pages. Drift in QUL's markup surfaces as an AlignError,
# never as a silent partial import: a lost card leaves cards unused or a word unmatched.
_CARD = re.compile(
    r"qpc-hafs[^>]*>(.*?)</div>\s*"
    r'<div class="text-sm text-gray-600 russian">(.*?)</div>',
    re.S,
)
_TAG = re.compile(r"<[^>]+>")


class AlignError(ValueError):
    """An ayah whose cards cannot be mapped onto our words."""


class Row(NamedTuple):
    word_id: int
    gloss: str  # raw card text, uncleaned
    head: int  # word_id that owns the card; == word_id unless covered


def _text(fragment: str) -> str:
    # HTML text normalization (tags, entities, source indentation), not gloss cleaning.
    return " ".join(html.unescape(_TAG.sub("", fragment)).split())


def parse_cards(page: str) -> list[tuple[str, str]]:
    return [(_text(ar), _text(ru)) for ar, ru in _CARD.findall(page)]


def same_word(card: str, ours: str) -> bool:
    # QUL writes كَأَن as «كَأَنأَن» in 7 ayahs: the word plus a repeat of its own tail.
    tail = card[len(ours) :]
    doubled = card.startswith(ours) and tail != "" and ours.endswith(tail)
    return card == ours or doubled


def align_ayah(
    cards: Sequence[tuple[str, str]], words: Sequence[tuple[int, str]]
) -> list[Row]:
    """Walk both lists by base form. A word with no card of its own is covered by the
    previous card's gloss (QUL glosses some phrases once). Raises on anything else."""
    rows: list[Row] = []
    j = 0
    head: int | None = None
    gloss = ""
    for word_id, arabic in words:
        if j < len(cards) and same_word(base_form(cards[j][0]), base_form(arabic)):
            head, gloss = word_id, cards[j][1]
            j += 1
        elif head is None:
            raise AlignError(f"word {word_id} matches no card")
        rows.append(Row(word_id, gloss, head))
    if j != len(cards):
        raise AlignError(f"{len(cards) - j} cards unused")
    return rows


# The 9 measured Latin look-alikes, each typed inside a Russian word.
_HOMOGLYPHS = "AaBCcEeHKMOoPpTXxy"
_TO_CYRILLIC = str.maketrans(_HOMOGLYPHS, "АаВСсЕеНКМОоРрТХху")
_LATIN = re.compile(r"[A-Za-z]")
_EDGE_SLASH = re.compile(r"^/+|/+$")
# Sentence punctuation the verse needed, not the word. Repeated, so ", -" goes too
# (en dash, em dash). ! and ? stay (owner R9): they carry tone.
_TRAILING = re.compile(r"(?:\s*[,.;:–—])+$")


def clean_ru_gloss(text: str) -> str:
    # R21: a stray tanween inside a Russian word (44:2); U+00AD is invisible and
    # breaks search (20 cards).
    text = strip_arabic_marks(text).replace("\u00ad", "")
    latin = set(_LATIN.findall(text))
    # Only when every Latin letter is a look-alike: a real Latin word is not ours to
    # rewrite, and validate_ru_gloss refuses it instead.
    if latin and latin <= set(_HOMOGLYPHS):
        text = text.translate(_TO_CYRILLIC)
    text = _EDGE_SLASH.sub("", text).strip()
    # `or text`: R20, the particle أَن is glossed as a bare ":" on 38 cards. The
    # strip never empties a gloss, so those keep ":" (and "/" is already "").
    return _TRAILING.sub("", text) or text


def validate_ru_gloss(text: str) -> str | None:
    """Why this gloss may not be written, or None. §3: third-party data."""
    reason = validate_gloss(text)
    if reason is not None:
        return reason
    if (m := _LATIN.search(text)) is not None:
        return f"latin character {m.group()!r}"
    if any(unicodedata.category(c) == "Cc" for c in text):
        return "control character"
    return None
