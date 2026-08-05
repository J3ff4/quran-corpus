"""Read one short gloss per vocalised form out of a Salmoné root entry.

Salmoné nests an `<entryFree key="...">` per form inside each root -- `SabaHa`,
`Sab~aHa`, `A^aSobaHa` -- and each carries a one-line `<sense>`. That is the
whole reason this source exists: Lane's leading block is a form-I verb sense
written as a full sentence, and 175 of the 217 rows we imported from it open on
one -- a sense the Quran frequently does not use.
"""

from __future__ import annotations

import html
import re
from collections.abc import Callable

_ENTRY_FREE = re.compile(r'<entryFree\b[^>]*\bkey="([^"]*)"[^>]*>')
_SENSE = re.compile(r"<sense\b[^>]*>(.*?)</sense>", re.S)
_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")
# A leading `[Bi or 'Ala],` is a <gramGrp> government note -- which preposition
# the verb takes -- not part of the meaning. It survives tag-stripping as square
# brackets, so it is cut here rather than by matching the markup: the same note
# appears both wrapped in <dictScrap> and bare. Salmoné routinely stacks two of
# these in a row (`[ coll. ] [ 'Ala ], Deceived, tricked.`), so the group
# repeats -- a single-shot `re.sub` left the second bracket in the gloss.
_LEADING_GRAM = re.compile(r"^(?:\[[^\]]*\]\s*,?\s*)+")

# Short vowels, sukun, nunation and the two hamza-seat marks carry no consonant.
# `~` (shadda) is deliberately NOT here -- see skeleton().
_VOWELS = str.maketrans("", "", "aiuo^`FNK_")
# Every alif and hamza seat folds together: Salmoné writes `A^a`, the corpus
# morphology writes `>a`, and they are the same letter.
_SEATS = str.maketrans("><}{|&'", "AAAAAAA")


def skeleton(key: str) -> str:
    """Consonant skeleton, for comparing a Salmoné key to a corpus form.

    Salmoné's `A^aSobaEu` and the corpus's `>aSa`biEa` are the same word in two
    transliteration conventions; stripping the vowels and folding the seats is
    what makes them compare equal.

    Shadda is kept -- except on the first radical, which is never gemination:
    Form II geminates the *middle* radical, so a shadda in first position is the
    assimilated definite article (al- + a sun letter), part of the surrounding
    sentence rather than the word's own form. The corpus spells الطور as
    `T~uwra`, which skeletons to `T~wr` and matches no Salmoné key; dropping
    that one shadda recovers 8 of طور's 10 occurrences and 61 across 28 of the
    101 targets.

    Elsewhere shadda is kept. Dropping it raises the match count from 125 to 137
    and makes 12 of those matches worse: Form I and Form II collapse into one
    skeleton, so دون resolves to `daw~ana` "Collected, gathered into one,
    arranged" instead of `duwon` "Low, base, vile" -- the sense the Quran uses.
    The 28 roots the two rules disagree on all favour keeping it.
    """
    bare = _WS.sub("", (key or "").translate(_VOWELS)).translate(_SEATS)
    return bare[0] + bare[2:] if len(bare) > 1 and bare[1] == "~" else bare


# Two finer comparisons than `skeleton`, used only to break a tie between senses
# whose consonants are identical. `fold` folds the hamza seats and nothing else,
# so it matches only a corpus form spelt exactly as Salmoné keys it (كيف's
# `kayofa`). `vowelled` additionally drops what the two sources spell
# differently -- sukun, nunation, shadda, the seat diacritics -- and the final
# short vowel, which is case inflection the dictionary headword does not carry
# (`miSora` -> `miSr`, matching the key `miSor` and not `maSor`).
_UNVOCALISED = str.maketrans("", "", "oFNK_^~")
_TRAILING_VOWEL = re.compile(r"[aiu]+$")


def fold(key: str) -> str:
    """``key`` with only the hamza seats folded together."""
    return (key or "").translate(_SEATS)


def vowelled(key: str) -> str:
    """``key`` keeping short vowels, minus the marks the two sources disagree on."""
    unmarked = (key or "").translate(_UNVOCALISED).translate(_SEATS)
    return _TRAILING_VOWEL.sub("", unmarked)


def entry_senses(entry_xml: str) -> list[tuple[str, str]]:
    """``(vocalised key, first sense)`` per `<entryFree>`, in document order.

    Only the *first* `<sense>` of each entry. Later senses are the same form's
    further meanings, and collecting them is what produced Lane's 1336-character
    run-ons; one form's leading sense is a dictionary headword gloss.
    """
    out: list[tuple[str, str]] = []
    for match in _ENTRY_FREE.finditer(entry_xml):
        end = entry_xml.find("</entryFree>", match.end())
        body = entry_xml[match.end() : end if end != -1 else len(entry_xml)]
        sense = _SENSE.search(body)
        if sense is None:
            continue
        # html.unescape after tag-stripping, before whitespace collapse -- the
        # same ordering as lane_gloss._plain. A single pass, matching that
        # sibling: some sense text is double-escaped (`&amp;amp;`), and looping
        # to a fixed point would also eat a literal `&amp;` that belongs in the
        # gloss.
        text = _WS.sub(" ", html.unescape(_TAG.sub(" ", sense.group(1)))).strip()
        text = _LEADING_GRAM.sub("", text).strip()
        if text:
            out.append((match.group(1), text))
    return out


# Salmoné writes a verb sense as an English past tense: "Stung ( mosquito ).",
# "Slit, ripped open.". Regular `-ed` covers most; these are the irregulars that
# actually occur as a lead word across the 101 targets -- measured, not guessed,
# so the set carries no word the source never opens a sense with.
#
# The second line is the one this list was missing: English past tenses spelt
# the same as their infinitive. They end in neither `-ed` nor anything the first
# line held, so `prefer_nominal` waved them through and بحر was glossed "Slit,
# ripped open." while `baHor` "Sea." sat in the same entry -- the exact
# wrong-sense failure this module exists to fix, on a root the corpus uses
# nominally in all 42 of its occurrences.
_IRREGULAR_PAST = frozenset(
    """was were became came went gave took made grew fell held bound bore broke
    cut drew fed felt found had heard kept knew laid led left lent let lost met
    put ran said sat set shook shone shot slew smote spoke spread stood struck
    stung swam threw told wore wove wrote
    beat brought built fought hit hurt rent rose shed shut slit""".split()
)

# `-ed` is a heuristic, and these are the words in the 101 targets it gets
# wrong: nouns and adjectives that merely end that way. بغض's own gloss is
# "Hatred." -- a nominal root whose one right answer the filter would drop.
_NOT_PAST = frozenset("hatred sacred naked wicked aged slenderarmed".split())
_VERB_LEAD = re.compile(r"^\s*([A-Za-z]+)")
_CROSS_REFERENCE = re.compile(r"^\s*(see\b|_ast)", re.IGNORECASE)


def is_verb_sense(gloss: str) -> bool:
    """True when the gloss opens on an English past tense, i.e. a verb sense."""
    match = _VERB_LEAD.match(gloss)
    if not match:
        return False
    word = match.group(1).lower()
    if word in _NOT_PAST:
        return False
    return word in _IRREGULAR_PAST or (word.endswith("ed") and len(word) > 3)


def is_cross_reference(gloss: str) -> bool:
    """True for a bare pointer at another entry ("see I ( a ).") -- not a gloss."""
    return bool(_CROSS_REFERENCE.match(gloss))


def _tally(form_counts: dict[str, int], norm: Callable[[str], str]) -> dict[str, int]:
    """Corpus occurrences summed under ``norm``'s notion of "the same spelling"."""
    out: dict[str, int] = {}
    for form, count in form_counts.items():
        out[norm(form)] = out.get(norm(form), 0) + count
    return out


def select_sense(
    entry_xml: str,
    form_counts: dict[str, int],
    prefer_nominal: bool = False,
) -> tuple[str, str, int, bool] | None:
    """Pick the sense for the form the Quran actually uses. See module docstring.

    ``form_counts`` maps a corpus form's Buckwalter spelling to how often it
    occurs; the caller builds it from `word_segments`. Matching is on the
    consonant skeleton because the two sources vocalise differently.

    ``prefer_nominal`` is set by the caller when the corpus uses this root
    mostly as a noun/adjective. Frequency ranking cannot separate a noun from a
    Form I verb of the same consonants -- both fold to one skeleton -- so
    without this filter بعض picks "Stung ( mosquito )." over "Part, portion,
    lot.". Measured: it takes verb-lead glosses from 56/96 to 7/96.

    The filter never empties the candidate set: a root whose only sense is a
    verb (عين) keeps that verb rather than returning nothing.

    Ranking by corpus frequency, not document order, is what makes صبع resolve
    to `A^aSobaEu` "Finger; digit." -- Salmoné's first block is the verb `SabaE`
    "Pointed at", the same wrong-sense trap Lane fell into.

    Ties are the frequency signal's blind spot, and they are common: two senses
    of one root routinely share a consonant skeleton, so both are credited the
    *same* corpus count and document order decides -- which is Salmoné's order,
    not the Quran's. Measured, that put "Remains of milk." on مصر over `miSor`
    "Town, city.", "A time; once." on طور over `Tuwor` "Mountain.", and
    "Enjoyment." on كيف over `kayofa` "How? In what way?". So a tie falls
    through two finer comparisons before document order gets it: `fold`, then
    `vowelled`. Both are stricter than `skeleton` -- they can only ever split a
    tie it left, never create one -- and each is skipped when no candidate
    matches under it at all. 16 of the 91 matched rows were decided on a tie;
    4 still are, and the caller flags those for the human gate.

    Returns ``(key, gloss, matched_count, tied)``. ``matched_count == 0`` is the
    fallback -- Salmoné's leading sense with nothing corroborating it -- and
    ``tied`` marks a pick document order still had to break. The review TSV
    shows the human gate both.
    """
    senses = entry_senses(entry_xml)
    if not senses:
        return None
    # Unconditional: a cross-reference ("see supra.") is a bare pointer, not a
    # gloss, whether or not the root is nominal -- a verb-dominant root falling
    # through to `senses[0]` must not land on one either. Same never-empty
    # guard as the nominal filter below.
    referenced = [pair for pair in senses if not is_cross_reference(pair[1])]
    senses = referenced or senses
    if prefer_nominal:
        nominal = [pair for pair in senses if not is_verb_sense(pair[1])]
        senses = nominal or senses  # never let the filter empty the set
    by_skeleton = _tally(form_counts, skeleton)
    counts = [by_skeleton.get(skeleton(key), 0) for key, _gloss in senses]
    best = max(counts)
    candidates = [index for index, count in enumerate(counts) if count == best]
    for finer in (fold, vowelled):
        if len(candidates) == 1:
            break
        by_finer = _tally(form_counts, finer)
        scores = [by_finer.get(finer(senses[index][0]), 0) for index in candidates]
        best_score = max(scores)
        # All-zero means this comparison matched no corpus form for any
        # candidate: it has nothing to say, so leave the tie for the next rung.
        if best_score > 0:
            # Every candidate on the best score, not the first of them: taking
            # one would end the loop before the next rung ran, and would report
            # `tied` False for a pick document order still had to make. لوح ties
            # `lawoH` and `law~aAHap` at 1 apiece here, and was reaching the TSV
            # as `kept`.
            candidates = [
                index
                for index, score in zip(candidates, scores, strict=True)
                if score == best_score
            ]
    key, gloss = senses[candidates[0]]  # document order, the last resort
    # A tie among senses no corpus form matched is not a tie worth reporting --
    # `best == 0` already tells the caller the pick is uncorroborated.
    return key, gloss, best, best > 0 and len(candidates) > 1
