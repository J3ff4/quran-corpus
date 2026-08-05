# packages/scraper/tests/test_salmone_gloss.py
from scraper.salmone_gloss import (
    entry_senses,
    is_cross_reference,
    is_verb_sense,
    select_sense,
    skeleton,
)

ENTRY = (
    '<div2 n="SbE" type="root">'
    '<entryFree key="SabaE" type="main"><form><orth lang="ar">SabaE</orth></form>'
    '<sense n="a"><dictScrap>[<gramGrp><subc>Bi</subc></gramGrp>], '
    "Pointed at, out; designated.</dictScrap></sense></entryFree>"
    '<entryFree key="A^aSobaEu" type="main"><form><orth lang="ar">A^aSobaEu</orth>'
    '</form><sense n="a">Finger; digit.</sense></entryFree>'
    "</div2>"
)


def test_skeleton_drops_the_short_vowels_and_folds_the_hamza_seats():
    assert skeleton("A^aSobaEu") == "ASbE"
    assert skeleton(">aSa`biEa") == "ASbE"


def test_skeleton_keeps_the_shadda_so_form_ii_stays_distinct_from_form_i():
    # Dropping it merged the two and picked دون as `daw~ana` "Collected,
    # gathered into one" over `duwon` "Low, base, vile" -- the Quranic word.
    assert skeleton("daw~ana") != skeleton("duwon")
    assert skeleton("Sab~aHa") != skeleton("SabaHa")


def test_entry_senses_returns_one_short_gloss_per_vocalised_form():
    assert entry_senses(ENTRY) == [
        ("SabaE", "Pointed at, out; designated."),
        ("A^aSobaEu", "Finger; digit."),
    ]


def test_entry_senses_drops_the_leading_bracketed_grammar_note():
    # `[Bi or 'Ala], Pointed at` is a government note, not part of the gloss.
    assert entry_senses(ENTRY)[0][1].startswith("Pointed")


def test_entry_senses_drops_two_consecutive_leading_grammar_notes():
    # Salmoné routinely stacks a coll./government pair: zEbr's raw sense is
    # "[ coll. ] [ 'Ala ], Deceived, tricked." -- a single-shot sub left the
    # second bracket in the gloss.
    xml = (
        '<entryFree key="zEbr"><sense>[ coll. ] [ \'Ala ], Deceived, tricked.'
        "</sense></entryFree>"
    )
    assert entry_senses(xml) == [("zEbr", "Deceived, tricked.")]
    xml = '<entryFree key="Sft"><sense>[ coll. ], Forgave.</sense></entryFree>'
    assert entry_senses(xml) == [("Sft", "Forgave.")]


def test_entry_senses_unescapes_xml_entities():
    # React escapes on render, so a raw `&amp;` reaches the page as `&amp;amp;`.
    xml = (
        '<entryFree key="h$m"><sense>Broken &amp; c. &lt;more&gt;.</sense></entryFree>'
    )
    assert entry_senses(xml) == [("h$m", "Broken & c. <more>.")]


def test_entry_senses_unescapes_only_once():
    # Some sense text is double-escaped in the source (`&amp;amp;`). A single
    # `html.unescape` pass -- not a loop to a fixed point -- turns that into a
    # literal `&amp;`, not `&`; looping would corrupt sense text that holds a
    # genuine `&amp;`.
    xml = '<entryFree key="k"><sense>A &amp;amp; B.</sense></entryFree>'
    assert entry_senses(xml) == [("k", "A &amp; B.")]


def test_entry_senses_skips_an_entry_with_no_sense_at_all():
    assert entry_senses('<div2><entryFree key="x"><form/></entryFree></div2>') == []


def test_entry_senses_collapses_the_whitespace_the_tei_indents_with():
    xml = (
        '<entryFree key="k"><sense>\n\t\tGuided,   directed,\n\t\tled aright.\n'
        "</sense></entryFree>"
    )
    assert entry_senses(xml) == [("k", "Guided, directed, led aright.")]


MULTI = (
    '<entryFree key="SabaHa"><sense>Came to, visited in the morning.'
    "</sense></entryFree>"
    '<entryFree key="Sab~aHa"><sense>Gave a morning draught.</sense></entryFree>'
    '<entryFree key="A^aSobaHa"><sense>Was or became morning, dawned.'
    "</sense></entryFree>"
)

# بعض, the measured worst case: Salmoné leads with the verb, the Quran is nominal.
BED = (
    '<entryFree key="baEaDa"><sense>Stung ( mosquito ).</sense></entryFree>'
    '<entryFree key="baEoD"><sense>Part, portion, lot.</sense></entryFree>'
)


def test_is_verb_sense_spots_a_regular_past_lead():
    assert is_verb_sense("Stung ( mosquito ).")
    assert is_verb_sense("Was or became morning, dawned.")  # irregular past
    assert not is_verb_sense("Part, portion, lot.")
    # The `len(word) > 3` guard's only witness: without it "Red" reads as a past
    # tense. Nothing else in this suite fails when that guard is dropped, so the
    # assertion lives here permanently rather than being added at mutation time.
    assert not is_verb_sense("Red.")


def test_is_cross_reference_spots_a_bare_pointer():
    assert is_cross_reference("see I ( a ).")
    assert not is_cross_reference("Seed, grain.")  # `see` must not match `Seed`


def test_select_sense_prefers_the_form_the_corpus_uses_most():
    # صبح: Form IV أَصْبَحَ is 20 corpus hits, Form II 1, Form I none at all.
    assert select_sense(MULTI, {">aSobaHa": 20, "Sab~aHa": 1}) == (
        "A^aSobaHa",
        "Was or became morning, dawned.",
        20,
        False,
    )


def test_select_sense_drops_the_verb_lead_for_a_nominal_root():
    # No corpus form matches either key, so without the filter this returns the
    # document-order first entry -- the verb. This is the measured بعض failure.
    assert (
        select_sense(BED, {"zzz": 9}, prefer_nominal=True)[1] == "Part, portion, lot."
    )
    assert (
        select_sense(BED, {"zzz": 9}, prefer_nominal=False)[1] == "Stung ( mosquito )."
    )


def test_select_sense_keeps_the_verb_when_filtering_would_empty_the_entry():
    # عين holds one sense and it is a verb; an empty candidate set must not win.
    only_verb = (
        '<entryFree key="Eay~ana"><sense>Smote with the evil eye.</sense></entryFree>'
    )
    assert select_sense(only_verb, {}, prefer_nominal=True) == (
        "Eay~ana",
        "Smote with the evil eye.",
        0,
        False,
    )


def test_select_sense_falls_back_to_the_first_entry_when_no_form_matches():
    key, gloss, count, _tied = select_sense(MULTI, {"xyz": 99})
    assert (key, count) == ("SabaHa", 0)
    assert gloss == "Came to, visited in the morning."


CROSS_REF_THEN_VERB = (
    '<entryFree key="qad~ama"><sense>see supra.</sense></entryFree>'
    '<entryFree key="qadama"><sense>Advanced, went before.</sense></entryFree>'
)


def test_select_sense_drops_a_cross_reference_lead_even_when_verb_dominant():
    # prefer_nominal=False: before the fix the filter never ran on this branch,
    # so a verb-dominant root fell straight through to the cross-reference at
    # senses[0].
    key, gloss, _c, _t = select_sense(CROSS_REF_THEN_VERB, {}, prefer_nominal=False)
    assert (key, gloss) == ("qadama", "Advanced, went before.")


def test_select_sense_keeps_a_cross_reference_when_it_is_the_only_sense():
    # bqy's real Salmoné shape: the only sense is a pointer. Must still return
    # it -- returning None would reclassify the root as "no sense" in the
    # review TSV's stats, not "unmatched".
    only_cross_reference = (
        '<entryFree key="baqiya"><sense>see supra.</sense></entryFree>'
    )
    assert select_sense(only_cross_reference, {}, prefer_nominal=False) == (
        "baqiya",
        "see supra.",
        0,
        False,
    )


def test_select_sense_returns_none_when_the_entry_holds_no_sense():
    assert select_sense('<entryFree key="k"><form/></entryFree>', {"k": 5}) is None


def test_select_sense_is_stable_when_two_forms_tie_on_count():
    # Document order breaks the tie, so a re-run cannot silently pick differently.
    assert select_sense(MULTI, {"SabaHa": 3, "Sab~aHa": 3})[0] == "SabaHa"


def test_skeleton_drops_a_first_radical_shadda_from_the_assimilated_article():
    # الطور: the corpus writes the assimilated `al-` onto the sun letter, so
    # `T~uwra` carries a shadda the word itself does not have. Form II geminates
    # the middle radical, never the first, so dropping this one is unambiguous.
    assert skeleton("T~uwra") == skeleton("Tuwor") == "Twr"
    # And the middle-radical shadda still separates Form II from Form I.
    assert skeleton("Sab~aHa") != skeleton("SabaHa")


def test_is_verb_sense_spots_an_invariant_past_tense():
    # These are spelt like their infinitive, so neither `-ed` nor the older
    # irregular list caught them: بحر was glossed "Slit, ripped open." while
    # `baHor` "Sea." sat in the same entry.
    assert is_verb_sense("Slit, ripped open.")
    assert is_verb_sense("Hit, hurt, broke the arm of.")


def test_is_verb_sense_does_not_call_a_noun_ending_in_ed_a_verb():
    # بغض's own gloss. The `-ed` heuristic would filter the one right answer
    # out of a nominal root's candidate set.
    assert not is_verb_sense("Hatred.")


KAYF = (
    '<entryFree key="kayof"><sense>Enjoyment.</sense></entryFree>'
    '<entryFree key="kayofa"><sense>How? In what way?</sense></entryFree>'
)

MISR = (
    '<entryFree key="maSor"><sense>Remains of milk.</sense></entryFree>'
    '<entryFree key="miSor"><sense>Town, city.</sense></entryFree>'
)


def test_select_sense_breaks_a_skeleton_tie_on_the_exact_key():
    # كيف: both keys skeleton to `kyf`, so both are credited all 83 occurrences
    # and document order handed it "Enjoyment.". The corpus spells the word
    # exactly as Salmoné keys the right sense.
    key, gloss, count, tied = select_sense(KAYF, {"kayofa": 83})
    assert (key, gloss, count, tied) == ("kayofa", "How? In what way?", 83, False)


def test_select_sense_breaks_a_skeleton_tie_on_the_vowelled_key():
    # مصر: no exact match -- the corpus form carries case inflection the
    # headword does not -- but the short vowels still separate `miSor` "Town,
    # city." from `maSor` "Remains of milk.", which document order picked.
    key, gloss, count, tied = select_sense(MISR, {"miSora": 3})
    assert (key, gloss, count, tied) == ("miSor", "Town, city.", 3, False)


SAFR = (
    '<entryFree key="Safor"><sense>Empty, void, vacant.</sense></entryFree>'
    '<entryFree key="Safar"><sense>Jaundice.</sense></entryFree>'
)


def test_select_sense_reports_a_tie_no_finer_comparison_could_break():
    # Neither rung matches this corpus spelling, so document order decides and
    # the caller has to tell the human gate that it did.
    assert select_sense(SAFR, {"Sufura": 2}) == (
        "Safor",
        "Empty, void, vacant.",
        2,
        True,
    )


def test_select_sense_reports_no_tie_when_nothing_matched_at_all():
    # `count == 0` already says the pick is uncorroborated; flagging it as a tie
    # as well would bury the 4 real ties under 48 rows that are not ties.
    assert select_sense(SAFR, {"xyz": 9})[3] is False


# Two keys differing only in the case vowel `vowelled` strips, so that rung
# scores them equally and cannot separate them either.
TIE_UNDER_A_FINER_RUNG = (
    '<entryFree key="kayofa"><sense>How? In what way?</sense></entryFree>'
    '<entryFree key="kayofu"><sense>Manner, way.</sense></entryFree>'
)


def test_select_sense_reports_a_tie_two_candidates_share_a_finer_score():
    # A rung that scores two candidates equally has not broken the tie. Keeping
    # only the first left `tied` False, and the row reached the review TSV as
    # `kept` -- invisible to the human gate. Live on لوح, whose `lawoH` and
    # `law~aAHap` both score 1 under `vowelled`.
    assert select_sense(TIE_UNDER_A_FINER_RUNG, {"kayofi": 7}) == (
        "kayofa",
        "How? In what way?",
        7,
        True,
    )
