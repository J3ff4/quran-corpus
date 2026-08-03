"""Reduce one Lane TEI entry to its leading English gloss. Pure, no I/O.

Lane marks his definitions with ``<hi rend="ital">`` and leaves apparatus,
authorities and cross-references roman. Selecting the italic runs therefore
drops the "on the authority of Yaakoob, thus sometimes pronounced," preamble
structurally, where regex over the rendered HTML could not. Deterministic by
decision (2026-08-02): no LLM, so every stored word is Lane's own and the
"Lane's Lexicon" credit stays literally true.

Known limit, accepted: the leading gloss is not always the *Quranic* sense. Lane
opens صلو on form I ("strike the small of the back"); the prayer sense is under
form II. The review gate in phase 21 Task 5 exists to catch these by hand.
"""

from __future__ import annotations

import html
import re

_ENTRY = re.compile(r"<entryFree\b[^>]*>(.*?)</entryFree>", re.S | re.I)
_ITYPE = re.compile(r"<itype\b[^>]*>(.*?)</itype>", re.S | re.I)
_ITAL = re.compile(r'<hi\b[^>]*\brend="ital"[^>]*>(.*?)</hi>', re.S | re.I)
_TAG = re.compile(r"<[^>]+>")
_PAREN = re.compile(r"\([^()]*\)")
# Lane's editorial brackets straddle the italic/roman boundary, so a `between`
# can come out as a bare `[or`, `]`, `(` or `)` -- `_PAREN` only removes a
# *balanced* pair. The `[` then defeats the anchored `_CONNECTIVE` below and the
# seam branch fires mid-clause: أتى stored "He; it; came;" for "He [or it] came"
# and بين "It; a thing; became separated". 51 of the 217 phase-21 rows.
#
# Dropping rather than keeping the bracket follows the same decision as the
# unbalanced-bracket pass in extract_gloss: a straddling bracket is noise. The
# cost is that a bracket-only `between` fuses its two runs bare -- بين reads
# "It a thing became separated" for "It (a thing) became separated". Accepted:
# 40 of the 52 changed rows fuse this way and the rest read cleanly ("He sold
# it: and he bought it:"), so بين alone does not buy threading bracket state
# through the join.
_BRACKET = re.compile(r"[\[\]()]")
# Roman words worth keeping between two italic runs -- without them "he was, or
# became" reads as "he was, became", which changes the sense.
_CONNECTIVE = re.compile(r"^(?:or|and|also)[,]?$", re.I)
# Italic runs that are apparatus rather than definition. Deliberately an explicit
# list: an earlier "any token of <=3 letters" rule ate the real word "It," off
# the front of the صلح gloss.
# `i. q.` (idem quod) is the corpus's most frequent standalone italic run, 3291
# occurrences; the comma spelling `i, q.` occurs once, so the original pattern
# never fired. `syn. with` and a `&c.:` tail need their own room too.
_APPARATUS = (
    r"q\.\s*v\.|i\.\s*q\.|inf\.\s*n\.|syn\.(?:\s*with)?|contr\.(?:\s*of)?|sic|&c\.?"
)
# The leading article is Lane's, not the definition's: "It was, or became, the
# contr. of" is apparatus all the way back to "the", and without it here the run
# survives and then collects a `;` seam behind it (طيب, طوى -- 14 Lane keys).
_NOISE = re.compile(rf"^(?:the\s+)?(?:{_APPARATUS})[.,:]?$", re.I)
# Same apparatus tokens, but fused onto the tail of a larger italic run rather
# than isolated in their own <hi> -- the real TEI does this (e.g. صلح's
# "it, throve; contr. of<foreign>fsd</foreign>"), where the whole-run _NOISE
# check above never fires because the run isn't apparatus-only.
_NOISE_TAIL = re.compile(rf"[;,:]\s*(?:the\s+)?(?:{_APPARATUS})[.,:]?$", re.I)
# Lane's own sub-sense boundary (41916 corpus-wide, paired with the `-bN-`
# markers). Everything after the first one is a further sense, a verse
# translation or a proverb: collecting them ran 74% of glosses into the length
# cap as truncated run-ons.
_SUB_SENSE = "―"
# Two italic runs separated by roman prose are two clauses, not one. Joining them
# bare produced "He drew the thing out or forth he pulled out the thing" (سلل)
# and "God hath not listened to anything like his listening" (أذن), where Lane's
# own ":" and "," lived in the dropped roman text. A `;` marks the seam without
# importing apparatus -- and only where the clause does not already end in
# punctuation, or أذن's ":" would become ":;".
_CLAUSE_END = (",", ";", ":", ".")
# A gloss cannot end on a function word. The last italic run of an entry often
# stops at a roman `<foreign>` object, leaving حصد as "He reaped, or cut with
# the". Repeated (`+`) because dropping "the" exposes "with" behind it.
_FUNCTION_WORD = (
    r"the|an?|of|with|in|by|to|for|and|or|from|as|upon|on"
    r"|his|its|their|that|which"
)
_DANGLING_WORD = re.compile(rf"(?:[ ,;:]+(?:{_FUNCTION_WORD}))+$", re.I)
# What is left when the trim above eats everything but the run's first word:
# قصص's own italic run is "with the", so trimming "the" strands "with;" in the
# middle of the gloss. A run that is only function words carries no sense.
_FUNCTION_ONLY = re.compile(
    rf"(?:{_FUNCTION_WORD})(?:[ ,;:]+(?:{_FUNCTION_WORD}))*$", re.I
)


def _plain(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(_TAG.sub("", fragment))).strip()


def entry_blocks(entry_xml: str) -> list[tuple[int, str]]:
    """``(verb_form, body)`` per ``<entryFree>``.

    0 means no ``<itype>`` at all -- a nounal entry, which ``extract_gloss``
    tries first alongside form I. -1 means an ``<itype>`` naming no plain form
    number: ``Q. 1``, ``R. Q. 1`` and friends, the quadriliterals, 846 of the
    corpus's 14238. They must not share form I's priority, and did while the
    pattern demanded a whitespace-free value and fell through to 0 -- ترق
    (تَرَاقِيَ, 75:26) glossed its ``Q. Q. 1`` block as "I hit, or hurt;
    collar-bone" instead of the collar-bone entry that follows it.
    """
    blocks: list[tuple[int, str]] = []
    for match in _ENTRY.finditer(entry_xml):
        body = match.group(1)
        itype = _ITYPE.search(body)
        value = _plain(itype.group(1)) if itype else ""
        # isdecimal, not isdigit: "²".isdigit() is True but int("²") raises, and
        # the TEI is fetched at runtime, so one such <itype> would abort the whole
        # index build instead of falling through to -1. None today in the pinned
        # volumes -- this keeps a bad character a parse decision, not a crash.
        if value.isdecimal():
            form = int(value)
        else:
            form = 0 if itype is None else -1
        blocks.append((form, body))
    return blocks


def _gloss_from_body(body: str) -> str:
    """Definition of one ``<entryFree>``: its first sub-sense that has one.

    3574 of 48103 bodies open with the ``―`` before their first italic run, so
    taking only the leading segment would empty the block and let
    ``extract_gloss`` fall through to an unrelated later one -- نطق's form-I
    definition sits entirely after ``― -b2-``, and the block that then won
    glossed it "bar" (the bar of a door).

    Walking to the next sub-sense keeps the block that was selected while still
    stopping at one sense: a block is glossable here exactly when it has any
    italic run, so which block wins is unchanged, and صفر no longer trails
    "His eye had what is termed a" with two further senses run together.
    """
    return next((g for s in body.split(_SUB_SENSE) if (g := _italic_runs(s))), "")


def _italic_runs(body: str) -> str:
    parts: list[str] = []
    previous_end = 0
    for match in _ITAL.finditer(body):
        raw = _PAREN.sub(" ", body[previous_end : match.start()])
        between = _plain(_BRACKET.sub(" ", raw))
        text = _plain(match.group(1))
        trimmed = _NOISE_TAIL.sub("", text)
        if trimmed != text:
            text = trimmed.rstrip(" ;,")
        if not text or _NOISE.match(text):
            # Leave `previous_end` where it was: the roman prose *before* an
            # apparatus run is still the seam between the runs on either side of
            # it, and advancing here threw it away, fusing "He dyed it: q. v. He
            # coloured it." into one clause. The dropped run's own text lands in
            # the next `between`, which only ever decides connective-or-seam.
            continue
        previous_end = match.end()
        if parts:
            if _CONNECTIVE.match(between):
                parts.append(between.rstrip(",").lower())
            elif between:
                # The dropped roman prose usually took the last run's object
                # with it, so the seam lands behind a function word: نهر read
                # "made for itself a; channel like that of a river". Trim here
                # too -- the tail pass below only ever sees the finished gloss.
                # Dropping a run whole exposes the one before it, which then
                # needs the same seam it never got.
                while parts:
                    parts[-1] = _DANGLING_WORD.sub("", parts[-1])
                    if _FUNCTION_ONLY.fullmatch(parts[-1]):
                        parts.pop()
                        continue
                    if not parts[-1].endswith(_CLAUSE_END):
                        parts[-1] += ";"
                    break
        parts.append(text)
    return re.sub(r"\s+", " ", " ".join(parts)).strip()


def extract_gloss(entry_xml: str, max_len: int = 1500) -> str:
    """Leading English gloss of a Lane entry, or "" when it has none.

    Entries are tried form I / nounal first: ``<entryFree>`` order is print
    order, not sense order, and Lane's صخر opens on the form-II verbal noun.

    ``max_len`` is a rail against a pathological entry, not a display budget:
    the root page clamps long text with a show-more control. At 220 it was doing
    that job badly -- 87 of the 213 phase-21 rows stored a mid-sentence "…" that
    no show-more could reveal, because the loss was in the database. 1500 is the
    longest sibling ``qurandev-lane`` row (1479), so no source reads clipped
    next to another.

    It does **not** bound the gloss to one sense, and the ``―`` cut does not
    either: Lane also separates senses inside one sub-sense with roman prose, so
    a single ``―`` segment can hold a dozen italic runs. 64 of the 217 rows
    exceed 300 chars and 25 exceed 600 (بتر, 1336), some carrying proverb and
    verse translations. That over-collection is logged as open debt in STATUS.md
    -- the fix is collecting fewer senses, which no cap value can do.
    """
    blocks = entry_blocks(entry_xml)
    ordered = [b for f, b in blocks if f in (0, 1)] + [
        b for f, b in blocks if f not in (0, 1)
    ]
    gloss = next((g for g in map(_gloss_from_body, ordered) if g), "")
    if not gloss:
        return ""
    gloss = _DANGLING_WORD.sub("", re.sub(r"\s+([,;:.])", r"\1", gloss))
    # Lane's editorial brackets straddle the italic/roman boundary, so dropping
    # the roman half can strand one side -- أذن opened "He [gave ear" and never
    # closed it. An unmatched bracket is noise either way; drop them all.
    if gloss.count("[") != gloss.count("]"):
        gloss = gloss.replace("[", "").replace("]", "")
    if len(gloss) > max_len:
        # rfind gives -1 when the window holds no space, and 0 would leave the
        # ellipsis alone; both mean "no usable boundary", so cut hard instead.
        # Unreachable with real Lane text -- the longest token is 24 chars.
        cut = gloss.rfind(" ", 0, max_len)
        gloss = gloss[: cut if cut > 0 else max_len].rstrip(" ,;:.-—") + "…"
    return gloss.strip(" ,;:.")
