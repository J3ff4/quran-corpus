import pytest

from scraper import hanswehr_gloss
from scraper.hanswehr_gloss import _respells_root, _root_skeleton, select_gloss
from tools.audit_hanswehr_glosses import (
    _head_leftover,
    _is_stub,
    classify,
)


@pytest.mark.parametrize(
    "gloss,expected",
    [
        ("earth; land, country", set()),
        ("u a and na‘ima a to live in comfort", {"frag"}),
        ("and", {"frag"}),
        ("and II, III", {"frag"}),
        ("tajara u and", {"frag"}),
        ("kalal, كلال kalāl weariness", {"arabic"}),
        ("mountain 571", {"pageno"}),
        ("x" * 151, {"long"}),
        ("x" * 150, set()),
    ],
)
def test_classify_buckets(gloss, expected):
    assert classify(gloss) == expected


def test_classify_does_not_flag_a_spelled_out_number():
    assert classify("one fifth") == set()


def test_classify_combines_buckets():
    assert classify("u and كلال " + "x" * 160) == {"frag", "arabic", "long"}


# ---- phase 24, round 2: the gate's own blind spots.


@pytest.mark.parametrize(
    "gloss,expected",
    [
        # The strip pattern only matched a whitespace boundary, and the gate
        # shared it verbatim -- so it could never see its own miss.
        ("to get a taste 315, experience", {"pageno"}),
        ("mountain 571.", {"pageno"}),
        ("bow, longbow; arc (geom.); arch, vault (arch.", {"paren"}),
        ("branch, twig (of a tree), of a shrub)", {"paren"}),
        ("bow, longbow; arc (geom.); arch, vault", set()),
    ],
)
def test_classify_round_two_buckets(gloss, expected):
    assert classify(gloss) == expected


def test_gate_shares_one_length_cap_with_the_generator(monkeypatch):
    """A second copy here would let the gate drift off the thing it gates.

    Moving the generator's cap has to move the gate with it -- asserting the
    two values are equal would not show that, since a duplicated literal is
    equal too.
    """
    monkeypatch.setattr(hanswehr_gloss, "MAX_GLOSS_CHARS", 10)
    assert classify("x" * 11) == {"long"}
    assert classify("x" * 10) == set()


def test_every_bucket_is_clearable_by_select_gloss():
    """No bucket may describe a defect `select_gloss` has no path to avoid.

    A `long` bucket the generator could not empty left a gate that could only
    ever fail -- green on nothing, red forever after the first such entry.
    """
    long_one_sense = "ارض arḍ " + "word " * 60
    gloss = select_gloss([(1, long_one_sense)])
    assert gloss and classify(gloss) == set()


def test_the_length_cap_binds_with_no_boundary_to_cut_on():
    """One unbroken token past the cap still has to come back capped.

    The fallback chain ends at the last space, so a gloss containing none left
    `boundary` at -1 and the over-length string was returned untouched -- a
    `long` bucket with no way to clear it.
    """
    gloss = select_gloss([(1, "ارض arḍ " + "x" * 400)])
    assert gloss and len(gloss) <= hanswehr_gloss.MAX_GLOSS_CHARS
    assert classify(gloss) == set()


# ---- phase 24, round 3: what the shape buckets structurally cannot see.
#
# frag/arabic/pageno/paren/long all test text that exists, so deleting the text
# passes every one of them. These cover the two ways that happened for real.


@pytest.mark.parametrize(
    "gloss,expected",
    [
        # The Arabic-tail cut took the English and left the headword respelled.
        ("ufq, ufuq", True),
        ("unuq, unq", True),
        ("kabid, kabd, kibd", True),
        ("wahana, wahina", True),
        # Real definitions: the skeleton breaks on the second word.
        ("loading, freighting; shipment", False),
        ("neck, nape", False),
        ("fasten, attach, tie, bind", False),
        # One word is a legitimate gloss, and matches its own skeleton.
        ("chin", False),
        ("liver", False),
        ("", False),
    ],
)
def test_is_stub_separates_a_respelled_headword_from_a_definition(gloss, expected):
    assert _is_stub(gloss) is expected


def test_is_stub_false_positives_on_an_english_irregular_plural():
    """`_skeleton` drops vowels, so a legitimate "foot, feet" reads as a stub.

    Under the old ceiling gate this needed `MAX_STUB` as an escape hatch, or one
    such gloss would red the gate forever with nothing for `select_gloss` to fix.
    The baseline needs no hatch -- the root simply carries `stub` in its row --
    but the false positive is still real, and a reviewer meeting one should know
    it is expected rather than chase it.
    """
    assert _is_stub("foot, feet") and _is_stub("man, men") and _is_stub("tooth, teeth")


# ---- phase 24, round 5: the shape `stub` is structurally one size too big.


@pytest.mark.parametrize(
    "gloss,root,expected",
    [
        # One head word, then a correct definition -- `stub` reads every one of
        # these as clean because not *every* word respells.
        ("anfus soul; psyche", "nfs", True),
        ("qull littleness", "qll", True),
        ("dibaba bear", "dbb", True),
        # Round 8: the leftover surviving *verbatim*, which is the commonest
        # shape and which rounds 5-7 excluded outright by asking whether the
        # gloss's first word differed from the entry's. 124 live roots.
        ("qalb reversal, inversion", "qlb", True),
        ("faqr poverty; need, lack, want", "fqr", True),
        # The weak radical is a long vowel in the transliteration, and vowels
        # are what the skeleton drops -- "hwn" is spelled "haun".
        ("haun ease, leisure", "hwn", True),
        # The entry carries no transliteration at all, so its own first word
        # stands where the head would. The root tells them apart; string
        # inequality could not.
        ("might, power", "Ezz", False),
        ("success, triumph", "fwz", False),
        # A real definition whose first word simply is not the root respelled.
        ("soul; psyche", "nfs", False),
        ("", "nfs", False),
        # HW's normal transliteration carries macrons and ‘ain, so the leftover
        # this bucket exists to catch is usually NOT ASCII. A `first.isascii()`
        # guard once threw exactly these away -- invisible on the live 1642,
        # and blind to every leftover a future extractor regression produces.
        ("kalāl weariness, fatigue", "kll", True),
        # ‘ain is U+2018 here, the character HW's OCR actually uses and the one
        # `_HAMZA_STRIP` removes -- U+02BF would fold to a different skeleton.
        ("‘unuq pl. a‘nāq neck", "Enq", True),
    ],
)
def test_head_leftover_reads_the_root_not_the_definition(gloss, root, expected):
    assert _head_leftover(gloss, root) is expected
    if expected:
        assert not _is_stub(gloss)  # the bucket that was supposed to catch it


def test_head_leftover_false_positives_on_a_loanword():
    """`drhm` glosses درهم as "dirhem, drachma" -- correct English that respells
    the root by construction, because the English *is* the loanword.

    Live, and one of the three rows that still carry `head` in the baseline. The
    extractor declines to cut it (the token before it is a transliteration, not
    Arabic script), so the bucket is the record that a human agreed to it.
    """
    assert _head_leftover("dirhem, drachma; a weight", "drhm")


# ---- phase 24, round 7: the pageno gate must stay inside what can be stripped.


@pytest.mark.parametrize(
    "gloss",
    [
        # Every shape the gate flagged that `_PAGE_NUMBER` structurally cannot
        # strip: its lookahead is `[\s;:.]|,(?!\d)|$` and its lookbehind `^|\s`.
        "a subaltern rank in the navy (1939)",  # year in parens, 57 entries
        "a dry measure, 2-9000 of them",  # range
        # The two above are excluded by the leading `\s` alone -- their digits
        # follow "(" and "-". These reach the trailing guard instead, and are
        # the only three live shapes that do: `$rq`, `fwj` and `rbE`.
        "eastward (till 1950) Transjordan",  # year, space before, ")" after
        "regiment (Ir. since 1922) of the army",
        "a 25-piaster piece",  # compound, space before, "-" after
        "huge amount of money (formerly = 10,000 dirhams)",  # comma-grouped
        "cubit, in Syria = .68 m",  # decimal fraction
        "a weight (Eg. = 1/12 of an uqiya)",  # denominator
        "a square measure of 7.293 m2",  # decimal
    ],
)
def test_pageno_does_not_flag_what_the_strip_cannot_remove(gloss):
    """An unclearable bucket is the one thing this module's docstring forbids:
    the gate reds, `select_gloss` has no path to clear it, and the phase stalls.
    None of these is a page number -- HW prints those bare."""
    assert "pageno" not in classify(gloss)


def test_pageno_still_flags_a_bare_page_number_the_strip_missed():
    """Non-vacuity guard for the test above: narrowing the gate must not
    silence it. These are the round-2 misses that put `pageno` here."""
    assert classify("to get a taste 315, experience") == {"pageno"}
    assert classify("mountain 571.") == {"pageno"}
    assert classify("mountain 571") == {"pageno"}


def test_every_pageno_hit_is_removable_by_the_strip():
    """The property the two patterns have to satisfy jointly, stated directly:
    the gate may be looser than the strip, but never past what it can clear."""
    from scraper.hanswehr_gloss import _PAGE_NUMBER
    from tools.audit_hanswehr_glosses import _PAGENO

    for text in (
        "mountain 571 and to 632 renege",
        "a taste 315, experience",
        "(formerly = 10,000 dirhams) in the navy (1939), = .68 m, 1/12 uqiya",
    ):
        spans = [m.span() for m in _PAGE_NUMBER.finditer(text)]
        for hit in _PAGENO.finditer(text):
            assert any(s <= hit.start() and hit.end() <= e for s, e in spans), hit


# ---- phase 24, round 10: the bucket must not ask the extractor's own question.


@pytest.mark.parametrize(
    "gloss,root",
    [
        # Gemination: the root doubles a radical HW writes once, and vice versa.
        ("hum they (3rd pers. m. pl. of the pers. pron.)", "hmm"),
        ("sal imperative", "sll"),
        ("majass spot which one touches or feels", "mjs"),
        # Tanwīn carried into the transliteration.
        ("qiran hospitable reception, entertainment", "qry"),
        ("taran moist earth; ground, soil", "vry"),
    ],
)
def test_head_leftover_sees_a_head_strong_consonant_equality_misses(gloss, root):
    """Round 10's finding. This bucket called `_respells_root` -- the head cut's
    own predicate -- so it was blind wherever the cut was, and seven roots
    shipped their transliterated headword while every bucket read clean."""
    assert _head_leftover(gloss, root)


def test_head_leftover_has_no_floor_so_it_outruns_the_cut():
    """The one place the two are deliberately allowed to disagree. The cut needs
    a two-strong-consonant floor or it deletes real glosses; the bucket only
    marks a row for a human, so it reports `nwy` -- a real leftover the cut
    declines to touch -- at the price of flagging `Awh` and `hrE`.

    If this ever starts agreeing with `_respells_root`, the bucket has been
    wired back onto its subject and stops being able to catch it.
    """
    assert not _respells_root("nawan", _root_skeleton("nwy"))
    assert _head_leftover("nawan remoteness, distance", "nwy")
    # The price, live and agreed: correct English that folds onto its own root.
    assert _head_leftover("oh!", "Awh")
    assert _head_leftover("hurry, hasten, rush", "hrE")


def test_head_leftover_still_refuses_a_definition_that_is_not_the_root():
    """The fold is looser, not indiscriminate -- an English first word sharing a
    consonant prefix with the root is not a leftover. A prefix-compatible rule
    was tried instead and flagged 19 of these."""
    for gloss, root in [
        ("be distant, far away", "bEd"),
        ("gain booty; to capture", "gnm"),
        ("transmit, pass along, report", "Avr"),
        ("body, trunk, torso", "bdn"),
        ("Arabs; true Arabs, Bedouins", "Erb"),
    ]:
        assert not _head_leftover(gloss, root)
