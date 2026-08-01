"""Tests for the corpus form-gloss parser.

All markup here is synthetic and inline. A trimmed slice of a real snapshot is
still a scraped HTML dump, which §9 forbids committing -- and hand-written
markup documents the contract far better than 9KB of real page chrome would.

The shape below was confirmed against the archived snapshots by reading them in
place, never by saving one: a POS label, a space-dash with no space after it,
then the gloss, all inside a single ``h4.dxe``, with the occurrences following
in a separate table.
"""

from scraper.sources.corpus_form_glosses import FormGloss, parse_form_glosses

# ضرب -- one verb form, the common case.
DRB = """
<html><body>
<h4 class="dxe">Verb (form I) -to strike, to set forth</h4>
<table class="taf"><tr><td class="c1"><span class="l">(2:26:6)</span>
<i class="ab">yadriba</i></td></tr></table>
</body></html>
"""

# بعث -- two forms, each with its own sense.
BEV = """
<html><body>
<h4 class="dxe">Verb (form I) -to raise, to resurrect, to send</h4>
<table class="taf"><tr><td class="c1"><span class="l">(2:56:2)</span></td></tr></table>
<h4 class="dxe">Verb (form VII) -to send forth</h4>
<table class="taf"><tr><td class="c1"><span class="l">(7:14:2)</span></td></tr></table>
</body></html>
"""

# أهل -- a bare header. No dash, no gloss, straight to the occurrences.
AHL = """
<html><body>
<h4 class="dxe">Noun</h4>
<table class="taf"><tr><td class="c1"><span class="l">(2:105:6)</span>
<i class="ab">ahli</i></td></tr></table>
</body></html>
"""

# أمم -- mixed. Non-verb labels carry senses too, and a bare header sits in
# among them, so the parser cannot assume "verb" or "every header".
AMM = """
<html><body>
<h4 class="dxe">Noun -mother, foundation, final abode</h4>
<h4 class="dxe">Time adverb -in front of, before</h4>
<h4 class="dxe">Nominal -unlettered, unable to read</h4>
<h4 class="dxe">Active participle</h4>
</body></html>
"""

# أني / جنح -- glosses that disambiguate with a parenthetical.
PARENS = """
<html><body>
<h4 class="dxe">Verb (form I) -to come (time)</h4>
<h4 class="dxe">Verb (form VIII) -to be righteous, to fear (Allah)</h4>
</body></html>
"""


def test_single_form_verb_root():
    assert parse_form_glosses(DRB) == [
        FormGloss("Verb (form I)", "to strike, to set forth")
    ]


def test_multi_form_root_keeps_document_order():
    assert parse_form_glosses(BEV) == [
        FormGloss("Verb (form I)", "to raise, to resurrect, to send"),
        FormGloss("Verb (form VII)", "to send forth"),
    ]


def test_bare_header_has_no_gloss():
    # The corpus prints a bare POS header and goes straight to occurrences.
    # There is no gloss text to find -- [] is correct, and is what leaves such
    # a root on the "No lexicon entry" empty state.
    assert parse_form_glosses(AHL) == []


def test_non_verb_labels_are_not_skipped():
    # Regression: an allowlist of verb-ish POS labels silently drops these.
    # `Noun` alone carries 55 glosses across the archive, and `Nominal`,
    # `Time adverb` and `Form of address` appear in none of the obvious lists.
    assert parse_form_glosses(AMM) == [
        FormGloss("Noun", "mother, foundation, final abode"),
        FormGloss("Time adverb", "in front of, before"),
        FormGloss("Nominal", "unlettered, unable to read"),
    ]


def test_header_split_survives_nested_markup():
    # Every archived header is one flat text node, so this is insurance against
    # a re-scrape: if the corpus ever wraps a side in a tag, concatenating the
    # child strings with no separator eats the space in " -", the split stops
    # matching, and the page yields [] -- which reads as "no gloss published"
    # rather than as a parser break.
    html = '<h4 class="dxe">Verb (form I) <i>-to strike</i></h4>'
    assert parse_form_glosses(html) == [FormGloss("Verb (form I)", "to strike")]


def test_gloss_may_contain_parentheses():
    # Regression: terminating the gloss at the first "(" -- on the assumption
    # that the next parenthesis is always the occurrence reference -- drops
    # these entirely. Five real glosses in the archive are of this shape.
    assert parse_form_glosses(PARENS) == [
        FormGloss("Verb (form I)", "to come (time)"),
        FormGloss("Verb (form VIII)", "to be righteous, to fear (Allah)"),
    ]


def test_repeated_form_and_gloss_is_emitted_once():
    assert parse_form_glosses(DRB + DRB) == [
        FormGloss("Verb (form I)", "to strike, to set forth")
    ]


def test_empty_and_garbage_input_never_raise():
    assert parse_form_glosses("") == []
    assert parse_form_glosses("<html><body>nothing here</body></html>") == []
    assert parse_form_glosses('<h4 class="dxe">Verb (form I) -</h4>') == []
