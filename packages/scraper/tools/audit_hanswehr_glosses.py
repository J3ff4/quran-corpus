"""Classify a generated Hans Wehr gloss into defect buckets.

Phase 23 shipped 1476 glosses with its human review gate un-run; 336 carried a
defect. These are the classifiers for the mechanical ones.

**This module no longer gates.** It used to: `main()` exited 1 while a bucket
sat above its ceiling. Six review rounds later, the ceilings had produced two
bugs of their own (a `MAX_HEAD_LEFTOVER = 1` certifying a population nobody had
measured, and a tolerance that hid a 98-root quarantine behind a printed `0`)
while catching almost nothing the corpus differential missed. `hanswehr_baseline`
is the gate now; it calls `classify`, `_is_stub` and `_head_leftover` and writes
each root's buckets into a committed per-root baseline, where a reclassification
shows up as a reviewed diff line instead of a count someone has to notice moved.

frag/arabic/pageno/paren/long are shape tests on the gloss text. Deleting the
text passes all five, so `stub` and `head` measure what is *missing* instead --
without them this read all-zero while 13 roots shipped their transliterated
headword back as their definition.

`stub` and `head` overlap without either being redundant. `stub` asks whether
the *whole* gloss respells one headword -- any headword, the root's or not --
so it cannot see the commoner shape, one head word followed by real English
("anfus soul; psyche"). `head` asks only about the first word, and asks it of
the entry's Buckwalter root, so it catches that shape and every whole-gloss
stub whose skeleton is the root's. Round 8 changed `head` from a comparison
against the raw definition to this; see `_head_leftover` for why the old form
excluded 124 of the roots it was measuring.

Every bucket must stay *clearable* -- a defect `select_gloss` has no code path
to avoid would leave a gate that can only ever fail, which is why the length
cap there truncates unconditionally rather than passing an over-long gloss
through. And every bucket must stay *independent* of the code it audits: the
page-number pattern below is deliberately looser than the one that strips them,
and `_head_leftover` folds spellings the way the head cut does but compares
them itself, with no floor. Independence is a rule about the *decision*, not
about the spelling primitives underneath it -- `_skeleton`, `_strong` and
`_collapse` are imported by both. Round 10 is why it is stated twice: this
module called `_respells_root` directly, and inherited a strictness that left
seven roots shipping their own headword while every bucket read clean.

The semantic bucket (wrong entry / wrong sense) is NOT classified here -- no
signal in the source picks a sense (see docs/plans/phase-24-gloss-quality.md),
so it goes to a human via prepare_hanswehr_glosses' review TSV instead.
"""

from __future__ import annotations

import re

from scraper import hanswehr_gloss
from scraper.hanswehr_gloss import _collapse, _root_skeleton, _skeleton, _strong

# Arabic block; a surviving Arabic char past the head means an untrimmed
# idiom/variant-spelling tail leaked into an English gloss slot.
_ARABIC = re.compile(r"[؀-ۿ]")
# A bare 2-4 digit integer is a Hans Wehr page number ("mountain 571"). Bounded
# to 2-4 digits so a legitimate "1 of 5" style gloss is untouched. Deliberately
# looser than `hanswehr_gloss._PAGE_NUMBER`, which only strips whitespace-
# delimited tokens: a gate sharing its subject's exact pattern can never catch
# that pattern being wrong, and this one already did miss "a taste 315,".
#
# Looser, but not unboundedly so: a number this flags that `_PAGE_NUMBER`
# cannot strip is an unclearable bucket, which this module's docstring forbids.
# So the looseness is spent where it caught a real miss -- the trailing side --
# and the leading `\s` is kept, because that is the one property every page
# number has and no false hit does. Without it this flagged the fraction in
# "= .68 m", the denominator in "1/12 اوقية", "7.293 m2" and "4x100", none of
# them strippable and none of them a page number. The trailing exclusions are
# the same story: a year in parentheses ("in the navy (1939)", 57 entries carry
# one), a range ("2-9000"), and either half of a comma-grouped quantity
# ("10,000"), whose "10" this flagged while `_PAGE_NUMBER` shipped ",000".
# Measured over all 3337 reachable definitions: 0 flagged that cannot be
# stripped, down from 16.
_PAGENO = re.compile(r"(?:^|\s)\d{2,4}\b(?!,\d)(?![)-])")
# Leftovers of the transliteration head: a Form-I vowel marker or a bare "and"
# standing where English should be -- at the start, or joined to a marker.
# A leading bare "a" is only a leftover when punctuation or the end follows
# ("a; to he refractory"); "a variety of willow" is the English article and
# must not be flagged. "i"/"u" are never English words, so they always are.
_FRAG = re.compile(
    r"""^(?:and\b|[iu]\b|a[,;]|a$|see\s+\d|=|\()   # opens with a head leftover
        |\b[aiu]\s+and\b                            # "...u and..." marker pair
        |\band\s*$                                  # trails off after "and"
    """,
    re.VERBOSE,
)


def _is_unbalanced(text: str) -> bool:
    """True if a parenthesis is left open, or closed without being opened.

    A depth scan rather than a pattern: ")" is orphaned in "twig (of a tree),
    of a shrub)" even though a "(" appears earlier, and a count comparison
    would call ") a (" balanced.
    """
    depth = 0
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth < 0:
                return True
    return depth != 0


def _is_stub(gloss: str) -> bool:
    """True when every word of the gloss respells one headword.

    "ufq, ufuq" and "kabid, kabd, kibd" are not definitions -- they are the
    entry's own transliterated headword handed back after the Arabic-tail cut
    took the English with it. HW's spelling variants differ only in vowels, so a
    gloss whose words all share one consonant skeleton has no content in it,
    while any real synonym list ("loading, freighting", "fasten, attach, tie")
    breaks the skeleton on its second word.

    Two words minimum: a one-word gloss is a legitimate shape ("chin", "liver"),
    and its skeleton matches itself trivially.

    `_skeleton` is imported rather than copied, and that does not weaken the
    independence rule above: it is a spelling primitive, not one of the head-run
    rules this gate exists to catch being wrong. Those decide *where* the gloss
    starts; this only asks what the text that came out is made of.
    """
    words = [w for w in (_skeleton(t) for t in gloss.split()) if w]
    return len(words) > 1 and len(set(words)) == 1


# Neither `head` nor `stub` can reach zero, and neither needs a ceiling any
# more. `drhm` glosses درهم dirham as "dirhem, drachma" -- correct English that
# collides with the head by construction -- and `_is_stub("foot, feet")` is True
# because English irregular plurals share a consonant skeleton, as do "man, men"
# and "tooth, teeth". Under the old gate each needed a hand-tuned tolerance,
# which is where two of this phase's bugs lived. In the baseline they are simply
# a `head` or `stub` in that root's row, agreed once at review time -- live that
# is 6 rows: `drhm`, `jnn` ("jinn" is both the transliteration and the English),
# `lyt`, whose leftover the extractor declines to cut, `nwy`, a real leftover
# under the two-consonant floor the cut keeps and this does not, and `Awh`
# ("oh!") and `hrE` ("hurry"), English that folds onto its own root.


def _head_leftover(gloss: str, root: str) -> bool:
    """True when the gloss opens with a respelling of the entry's Buckwalter root.

    HW writes the Arabic headword, then its transliteration, then the English,
    and the transliteration spells the root. A first gloss word that respells
    the root is therefore that head handed back with the definition running on
    after it.

    Rounds 5 to 7 asked this of the *definition* instead -- is the gloss's first
    word the entry's first non-Arabic token, and not identical to it? The second
    half was there to exclude entries carrying no transliteration at all ("عز
    might, power"), where the first non-Arabic token is the gloss's own first
    word and matches itself. It excluded them, and with them 120 real leftovers,
    because the commonest leftover is the transliteration surviving *verbatim*
    -- which is identical to itself too. The exclusion was keyed to a property
    of the comparison; the root is a property of the data, and separates the two
    directly. `select_gloss` now cuts the same shape, so this fell from 127 live
    roots to the few the comment above accounts for -- not to 0, and it cannot
    reach 0: `drhm` and `jnn` are English words that spell their own root.

    The comparison below is deliberately a second implementation and not a call
    to `hanswehr_gloss._respells_root`, which is what the head cut decides on.
    Round 10 found this bucket calling that function directly, which made it
    blind in exactly the place the cut was: the rule demanded strong-consonant
    *equality*, so every transliteration carrying gemination or tanwīn failed it
    -- and so did the bucket. Seven roots shipped their own headword as the
    first word of their gloss ("hum they ...", "qiran hospitable reception ...")
    while this read them clean. A gate that asks its subject's own question can
    only ever agree with it.

    Independent in the comparison, then, but not in the spelling primitives:
    `_skeleton`, `_strong` and `_collapse` are imported, on the same reasoning
    `_is_stub` gives above -- they describe what a token is made of, not where a
    gloss starts. A fold that is wrong would still fool both.

    Looser than the cut on purpose, in the one direction that matters: no
    two-consonant floor. The cut needs that floor because a single shared
    consonant would have it deleting real glosses; a bucket only marks a row for
    a human, so it can afford to over-report. That is what keeps `nwy` visible
    ("nawan remoteness, distance" -- a real leftover the cut declines to touch),
    at the price of `Awh` ("oh!") and `hrE` ("hurry, hasten, rush"), which join
    `drhm`, `jnn` and `lyt` as rows agreed at review time rather than defects.

    The first word is not required to be ASCII. An earlier `first.isascii()`
    guard read as harmless -- it moves no row of the live 1642, and no live
    gloss opens on Arabic script -- but it was the one place this bucket
    *under*-reported, and it under-reported HW's normal shape: a transliterated
    headword carries macrons, so `("kalāl weariness", "kll")` folds exactly and
    the guard threw it away. Those are precisely the leftovers a future
    extractor regression would produce.
    """
    words = gloss.split()
    first = words[0].strip(",;:.()") if words else ""
    root_fold = _collapse(_strong(_root_skeleton(root)))
    spelled = _collapse(_strong(_skeleton(first)))
    # HW carries tanwīn into the transliteration ("qiran" for قري, "taran" for
    # ثري), so a trailing -n is dropped from the token -- never from the root,
    # whose final ن is a radical (`mnn`).
    denunated = spelled[:-1] if len(spelled) > 1 and spelled.endswith("n") else spelled
    return bool(root_fold) and root_fold in (spelled, denunated)


def classify(gloss: str) -> set[str]:
    """Defect buckets for one generated gloss; empty set means clean."""
    text = gloss.strip()
    buckets: set[str] = set()
    if _FRAG.search(text):
        buckets.add("frag")
    if _ARABIC.search(text):
        buckets.add("arabic")
    if _PAGENO.search(text):
        buckets.add("pageno")
    if _is_unbalanced(text):
        buckets.add("paren")
    # Read through the module rather than imported by name, so the cap stays
    # the generator's single definition instead of a copy that can drift.
    if len(text) > hanswehr_gloss.MAX_GLOSS_CHARS:
        buckets.add("long")
    return buckets
