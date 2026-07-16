"""Fix seatless-hamza encoding to match KFGQPC Hafs Uthmanic Script's rules.

Our Tanzil-derived Quran text (imported via tools/import_alqurancloud.py,
edition "quran-uthmani") encodes the hamza in words like "the last/hereafter"
(2:8 al-akhir) as a bare HAMZA LETTER (U+0621) directly followed by ALEF
(U+0627): "al-\\u0621a\\u0627khir" (hamza then alef, no seat).

The KFGQPC Hafs Uthmanic Script font (bundled as hafs.18.woff2, and every
KFGQPC build tested including v2.2) only attaches this hamza correctly when
it is encoded as TATWEEL (U+0640, a seat) + ARABIC HAMZA ABOVE (U+0654, a
combining mark) -- this is quran.com's own "QPC Uthmani" text convention,
confirmed via their public API (api.quran.com) against the same font file.
With the bare-hamza encoding, the font renders the hamza and the following
alef with a visible gap (no attachment) -- verified via HarfBuzz shaping,
not just a static font-table read.

This only applies to hamza that has NO natural seat letter to sit on: the
definite article ('al-') immediately followed by a hamza-initial root, e.g.
2:8 "al-akhir" (the last/hereafter) or "al-ayat" (the signs), whether the
article is spelled with its own alef (plain or elided-hamza-wasl) or
assimilated into a preceding lam (e.g. after a prefix particle). It must
NOT touch a hamza that is genuinely a root letter and happens to follow
lam+sukun for unrelated reasons, e.g. 3:91 "mil'u" (root m-l-hamza -- hamza
is the 3rd radical, preceded by meem, not the definite article). Verified
against quran.com's QPC Uthmani API text across every ayah in the Quran
containing this LAM+SUKUN+HAMZA sequence (208 occurrences): 207 are the
definite-article case and get rewritten; the one exception (3:91) is
excluded by the preceding-letter check below, and QPC's own text confirms
it should stay as bare hamza too.

All Arabic codepoints below are built from numeric values (chr()), not
typed as literal glyphs -- a character-class range typed as literal Arabic
glyphs is byte-for-byte hard to verify in an editor/diff, and two adjacent
ranges merged this way once already silently swallowed the entire Arabic
base-letter block during development of this module (see
packages/data/src/text/normalize.ts's own comment about this exact failure
mode -- normalize.ts learned the lesson first; this module hit it too).
"""

from __future__ import annotations

import re

HAMZA = chr(0x0621)
ALEF_WASLA = chr(0x0671)
ALEF = chr(0x0627)
LAM = chr(0x0644)
SUKUN = chr(0x0652)
TATWEEL = chr(0x0640)
HAMZA_ABOVE = chr(0x0654)

# Harakat, small Quranic signs, dagger alef, waqf marks, tatweel, BOM --
# stripped only to find the *base letter* immediately preceding a match,
# never applied to the returned text itself.
_MARK_CODEPOINTS = (
    list(range(0x0610, 0x061B))  # Quranic annotation signs
    + list(range(0x064B, 0x0660))  # harakat, tanween, shadda, sukun, small marks
    + [0x0670]  # superscript/dagger alef
    + list(range(0x06D6, 0x06EE))  # Quranic waqf/annotation signs
    + [0x0640]  # tatweel
    + [0xFEFF]  # BOM
)
_MARKS_RE = re.compile("[" + "".join(chr(c) for c in _MARK_CODEPOINTS) + "]")

# LAM + SUKUN + HAMZA -- the candidate pattern. Whether this is a
# definite-article seatless-hamza or a root-internal hamza is decided by
# what precedes it (see _DEFINITE_ARTICLE_PRECEDERS).
_LAM_SUKUN_HAMZA_RE = re.compile(LAM + SUKUN + HAMZA)

# The tatweel-seat replacement: LAM + SUKUN + TATWEEL + HAMZA_ABOVE.
_TATWEEL_SEAT = LAM + SUKUN + TATWEEL + HAMZA_ABOVE

# Base letters that mean "this lam is (part of) the definite article":
# alef / alef-wasla (the article's own alef, plain or elided-hamza-wasl) or
# lam itself (assimilated article after a prefix particle).
_DEFINITE_ARTICLE_PRECEDERS = (ALEF, ALEF_WASLA, LAM)


def fix_seatless_hamza(text: str) -> str:
    """Rewrite definite-article seatless-hamza to the KFGQPC tatweel-seat form.

    Idempotent -- re-running on already-fixed text is a no-op (the pattern
    this matches no longer exists once fixed).
    """

    def repl(m: re.Match[str]) -> str:
        prefix_skeleton = _MARKS_RE.sub("", text[: m.start()])
        prev_letter = prefix_skeleton[-1] if prefix_skeleton else ""
        if prev_letter in _DEFINITE_ARTICLE_PRECEDERS:
            return _TATWEEL_SEAT
        return m.group(0)  # root-internal lam+sukun+hamza -- leave as-is

    return _LAM_SUKUN_HAMZA_RE.sub(repl, text)
