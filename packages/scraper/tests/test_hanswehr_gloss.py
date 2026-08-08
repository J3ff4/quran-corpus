import pytest

from scraper import hanswehr_gloss
from scraper.hanswehr_gloss import (
    MAX_GLOSS_CHARS,
    _is_abbrev,
    _is_transliteration,
    _respells_root,
    _root_skeleton,
    _strip_tail,
    select_gloss,
)
from tools.audit_hanswehr_glosses import classify

TARAFA = "طرف ṭarafa, (ṭarf) to blink, twinkle, wink, squint (also بعينيه bi-‘ainaihi); -- ṭarufa u to be newly acquired <b>IV</b> (أَطْرَفَ) to feature"  # noqa: E501
LAWH_V = "لاح lāḥa u (lauḥ) to appear, show, loom, emerge; to shine, gleam"
LAWH_N = "لوح lauḥ pl. الواح alwāḥ board, blackboard; slate; tablet; plank"
KHADD = "خضد kaḍada i (kaḍd) to cut off, break off (هـ thorns) │ خضد شوكته to tame s.o."
SHAI = "شيء šai’ a thing, an object, something"
LAWH_V_SHORT = "لاح lāḥa u (lauḥ) to appear, gleam"
# Object/preposition markers "(هـ s.th.)" etc. sit in the sense body, past the
# head, and must not survive into a concise English gloss.
QAWL = "قول qāla u (qaul) to speak, say (هـ s.th., ل to s.o.), utter (هـ s.th.)"
# " -- " opens a second Form-I headword with its own transliteration.
AMANA = "أمن amuna u (amāna) to be faithful, reliable; -- amina a (amn) to be safe"
# Plain-ASCII stem "rabba" after the bare Arabic headword: _is_transliteration
# does not catch it, and it sits at i>0 because the headword comes first.
RABB = "رب rabba u (rabb) to be master, be lord"
# A malformed, never-closed "(" -- must not swallow the whole gloss.
UNBAL = "خضد kaḍada (kaḍd to cut off, break off"
# Nominal head: plain-ASCII noun + "pl." + an Arabic broken plural, all head.
RABB_N = "رب rabb pl. ارباب arbāb lord; master; owner"
# "f.," -- a grammar marker punctuated with an inline comma, still head.
UMM_N = "ام f., pl. امهات ummahāt mother"


def _has_arabic(s: str) -> bool:
    return any("؀" <= ch <= "ۿ" for ch in s)


def test_first_sense_cluster_drops_derived_forms():
    g = select_gloss([(1, TARAFA)])
    assert g.startswith("blink")
    assert "IV" not in g and "أَطْرَفَ" not in g  # Form IV block cut


def test_idiom_after_bar_dropped():
    g = select_gloss([(1, KHADD)])
    assert "cut off" in g and "tame" not in g  # │ idiom cut


def test_prefer_nominal_takes_noun_head():
    g = select_gloss([(1, LAWH_V), (0, LAWH_N)], prefer_nominal=True)
    assert g.startswith("board")  # "pl. الواح alwāḥ" fully stripped
    g2 = select_gloss([(1, LAWH_V), (0, LAWH_N)], prefer_nominal=False)
    assert g2.startswith("appear")  # verb head, "lāḥa u (lauḥ) to" stripped


def test_leading_english_article_survives():
    g = select_gloss([(0, SHAI)])
    assert g.startswith("a thing")  # bare "a" is the article, not the verb marker


def test_verb_vowel_marker_still_stripped():
    g = select_gloss([(1, LAWH_V_SHORT)])
    assert g.startswith("appear")  # bare "u" before "(lauḥ)" is the marker


def test_max_senses_caps_length():
    g = select_gloss([(0, LAWH_N)], max_senses=2)
    assert g.count(";") <= 1


def test_empty_returns_none():
    assert select_gloss([(1, "طرف ṭarafa")]) is None  # no English after strip


def test_arabic_object_markers_dropped_from_body():
    g = select_gloss([(1, QAWL)])
    assert g.startswith("speak, say")  # first cluster kept
    assert not _has_arabic(g)  # "(هـ s.th.)" etc. gone, not just the head


def test_second_headword_after_dashes_cut():
    g = select_gloss([(1, AMANA)])
    assert "faithful" in g and "safe" not in g  # " -- amina a" second head cut


def test_plain_ascii_stem_after_arabic_head_stripped():
    g = select_gloss([(1, RABB)])
    assert g.startswith("be master")  # "رب rabba u (rabb) to" all stripped


def test_unbalanced_paren_does_not_swallow_gloss():
    g = select_gloss([(1, UNBAL)])
    assert g is not None and "cut off" in g  # guard, not a silent quarantine


def test_nominal_head_and_broken_plural_stripped():
    g = select_gloss([(0, RABB_N)], prefer_nominal=True)
    assert g.startswith("lord")  # "رب rabb pl. ارباب arbāb" all stripped
    assert not _has_arabic(g)


def test_comma_attached_grammar_marker_stripped():
    g = select_gloss([(0, UMM_N)], prefer_nominal=True)
    assert g.startswith("mother")  # "ام f., pl. امهات ummahāt" all stripped
    assert not _has_arabic(g)


# ---------------------------------------------------------------- phase 24
# Real failing inputs taken from hanswehr.sqlite; assert the full expected
# string, never `is not None` (memory: sdd-brief-can-specify-vacuous-tests).


def _entry(definition: str) -> list[tuple[int, str]]:
    return [(1, definition)]


def test_strips_a_comma_punctuated_vowel_marker():
    gloss = select_gloss(
        _entry("عند ‘anida u i, ‘anida a (‘anad) to swerve, deviate, diverge")
    )
    assert gloss == "swerve, deviate, diverge"


def test_strips_and_joined_head_variants():
    gloss = select_gloss(
        _entry("نعم na‘ima u a and na‘ima a to live in comfort and luxury")
    )
    assert gloss == "live in comfort and luxury"


def test_head_only_entry_yields_no_gloss_rather_than_a_conjunction():
    assert select_gloss(_entry("تجر tajara u and")) is None


@pytest.mark.parametrize(
    "definition",
    [
        "عند ‘anida u i, ‘anida a (‘anad) to swerve, deviate, diverge",
        "نعم na‘ima u a and na‘ima a to live in comfort and luxury",
    ],
)
def test_fixed_glosses_are_clean_by_the_audit(definition):
    # `or ""` would make this pass on a quarantined entry too -- `classify("")`
    # is the empty set, so the assertion holds with no gloss to judge.
    gloss = select_gloss(_entry(definition))
    assert gloss
    assert classify(gloss) == set()


def test_a_real_english_gloss_is_untouched():
    # Regression guard: the head-strip must not eat English that merely looks
    # like a marker. "a" here is an article, "and" is real prose.
    assert select_gloss(_entry("جعل ja‘ala a to make a promise and to place")) == (
        "make a promise and to place"
    )


def test_paren_closing_with_an_inline_comma_is_still_balanced():
    # "(عنود ‘unūd)," -- the trailing comma made the run read as unbalanced and
    # the whole head survived into the gloss.
    gloss = select_gloss(
        _entry("عند ‘anada u i (عنود ‘unūd), ‘anida a (‘anad) to swerve, deviate")
    )
    assert gloss == "swerve, deviate"
    # Same shape with English inside the paren: read as unbalanced, the "(" is
    # dropped and its contents ship as the gloss.
    lhm = _entry("لهم lahima a (lahm, laham), <b>V</b> to devour")
    assert select_gloss(lhm) is None


def test_a_cross_reference_entry_yields_no_gloss():
    assert select_gloss(_entry("فوم fūm = ثوم tūm")) is None
    assert (
        select_gloss([(0, "شفه pl. شفاه, شفوات see 2 شف")], prefer_nominal=True) is None
    )


def test_the_english_verb_see_is_not_a_cross_reference():
    assert select_gloss(_entry("رأى ra’ā a to see, behold, perceive")) == (
        "see, behold, perceive"
    )


def test_derived_form_numerals_left_by_the_cut_are_head():
    assert select_gloss(_entry("زال (زيل) and II, III, <b>VI</b> see زول")) is None


def test_stem_before_a_grammar_paren_is_head():
    gloss = select_gloss(
        _entry(
            "لج lajja (1st pers. perf. lajijtu) a and (1st pers. perf. lajajtu) i "
            "to be stubborn, obstinate"
        )
    )
    assert gloss == "be stubborn, obstinate"


def test_a_gloss_whose_first_word_is_parenthesised_survives():
    # "oil (edible...)" is a gloss, not a head + verbal noun: only a paren that
    # respells the stem ("jatta (jatt)") marks head.
    assert (
        select_gloss(
            _entry("زيت zait pl. زيوت zuyūt oil (edible, fuel, motor oil, etc.)")
        )
        == "oil (edible, fuel, motor oil, etc.)"
    )


def test_an_english_possessive_is_not_transliteration():
    gloss = select_gloss(_entry("ضل ḍalla i (ḍalāl) to lose one’s way, go astray"))
    assert gloss == "lose one’s way, go astray"


def test_a_gloss_carrying_an_abbreviation_is_not_head():
    assert (
        select_gloss(
            [(0, "رقم raqm pl. ارقام arqām numeral; number, No.")], prefer_nominal=True
        )
        == "numeral; number, No."
    )


def test_stem_chain_without_a_paren_is_head():
    # "kamala, kamula u and kamila a" -- three spellings of one head, only the
    # last carrying a marker.
    gloss = select_gloss(
        _entry("كمل kamala, kamula u and kamila a (كمال kamāl) to be or become whole")
    )
    assert gloss == "be or become whole"


def test_cuts_at_an_arabic_idiom_marker_past_the_head():
    gloss = select_gloss(
        _entry("اتى atā i to come, arrive; ب اتى to bring, bring forward, produce")
    )
    assert gloss == "come, arrive"


def test_head_variant_spellings_are_removed_before_the_arabic_cut():
    gloss = select_gloss(
        _entry("كلل kalal, كلال kalāl and كلالة kalāla weariness, tiredness, fatigue")
    )
    assert gloss == "weariness, tiredness, fatigue"


def test_no_arabic_survives_any_generated_gloss():
    for definition in (
        "اتى atā i to come, arrive; ب اتى to bring, bring forward, produce",
        "كلل kalal, كلال kalāl and كلالة kalāla weariness, tiredness, fatigue",
    ):
        # Assert the gloss exists first: "arabic" is trivially absent from
        # `classify("")`, so `or ""` would keep this green on a quarantine.
        gloss = select_gloss(_entry(definition))
        assert gloss
        assert "arabic" not in classify(gloss)


def test_head_variant_dangling_after_the_arabic_cut_is_dropped():
    gloss = select_gloss(
        _entry("رؤد ru’d soft, tender; ru’d and فتاة رؤد (fatāh) delicate young girl")
    )
    assert gloss == "soft, tender"


def test_preposition_whose_object_was_cut_is_dropped():
    gloss = select_gloss(
        _entry("تاب tāba u (taub) to repent, be penitent, do penance, with عن: to turn")
    )
    assert gloss == "repent, be penitent, do penance"


def test_parenthesis_whose_content_was_cut_is_dropped():
    gloss = select_gloss(
        # The Form-III block cuts mid-parenthesis, so the "(" is left open with
        # only Arabic inside it -- the Arabic cut then strands the bracket.
        _entry(
            "مس massa a (mass) to feel, finger, handle, palpate "
            "(ه s.o., <b>III</b> s.th.); to touch"
        )
    )
    assert gloss == "feel, finger, handle, palpate"


def test_a_homograph_index_is_head_not_gloss():
    gloss = select_gloss(
        [(0, "اول awwal2, f. اولى ūlā, pl. اوائل awā’il2 first; foremost, principal")],
        prefer_nominal=True,
    )
    assert gloss == "first; foremost, principal"


def test_nominal_head_joined_to_its_arabic_variant_is_head():
    # "bass and بسة bassa" -- one head, two spellings. Prose puts an English
    # word after "and", so the transliteration that follows settles it.
    gloss = select_gloss(
        [(0, "بس bass and بسة bassa pl. بساس bassās cat")], prefer_nominal=True
    )
    assert gloss == "cat"


def test_drops_an_inlined_page_number():
    assert select_gloss(_entry("طود ṭaud mountain 571")) == "mountain"


def test_keeps_a_number_that_is_part_of_the_gloss():
    assert select_gloss(_entry("خمس ḫums one fifth")) == "one fifth"


def test_truncates_at_a_sense_boundary_not_mid_word():
    sense = "be cognizant of a great many different things"
    long_entry = "علم ‘alima a to know, have knowledge; " + "; ".join([sense] * 5)
    gloss = select_gloss(_entry(long_entry), max_senses=8)
    # The call passes no `max_chars`, so the cap under test is the module
    # default -- read it rather than restate it, or a changed default either
    # fails this test for a deliberate change or leaves it asserting nothing.
    assert len(gloss) <= MAX_GLOSS_CHARS
    assert not gloss.endswith(";")
    # The cut landed on a boundary: the senses kept are a *prefix* of the ones
    # written, each one whole. Asserting only that no part is blank passes just
    # as well on "...a great many" -- a mid-sense cut at a space is non-empty,
    # so the check the name promises would not have been made.
    whole = ["know, have knowledge"] + [sense] * 5
    parts = gloss.split("; ")
    assert parts == whole[: len(parts)]
    # And truncation happened at all: without this the prefix assertion is
    # satisfied by the untruncated gloss, and the cap could stop binding
    # entirely without failing anything here.
    assert len(parts) < len(whole)


def test_a_negative_cap_is_refused_rather_than_silently_ignored():
    """No sense boundary can sit inside a window of `max_chars + 1 <= 0`, so the
    truncation branch falls through to `cleaned[:max_chars]` -- which for -1
    trims one character and hands back a gloss far longer than the cap it was
    given. A cap that cannot bind must raise, not quietly not bind."""
    with pytest.raises(ValueError, match="negative"):
        select_gloss(_entry("علم ‘alima a to know, have knowledge"), max_chars=-1)

    # Also with nothing to gloss. The cap is wrong whether or not this call had
    # entries, and returning None for it would report the bad cap as "no gloss"
    # -- fine until the caller's next root does have an entry.
    with pytest.raises(ValueError, match="negative"):
        select_gloss([], max_chars=-1)

    # 0 is not negative and does bind: the fallbacks find no boundary, and
    # `cleaned[:0]` is empty, which `_quarantine` reports as no gloss at all.
    assert select_gloss(_entry("علم ‘alima a to know"), max_chars=0) is None
    # Empty entries with a valid cap still short-circuits to None, not a raise.
    assert select_gloss([], max_chars=10) is None


def test_short_gloss_is_not_truncated():
    assert select_gloss(_entry("ارض arḍ earth; land, country")) == (
        "earth; land, country"
    )


# ---- phase 24, round 2: defects found by /code-review on the first round.
# Every source string below is the real `hanswehr.sqlite` text for the named
# root, so a rule that stops firing fails a test instead of quietly changing
# 1476 live definitions.


def test_equals_mid_sense_is_not_a_cut_point():
    """`sqT`: " = " is usually a gloss, not a cross-reference.

    Cutting on it unanchored truncated this to "fall (also".
    """
    assert select_gloss(
        _entry(
            "سقط saqaṭa u (سقوط suqūṭ, مسقط masqaṭ) to fall (also = to be "
            "killed in action); to fall down, drop; to tumble, trip, slip"
        )
    ) == (
        "fall (also = to be killed in action); to fall down, drop; "
        "to tumble, trip, slip"
    )


def test_equals_inside_a_parenthetical_keeps_the_gloss():
    """`drhm`: "(Ir. = coin of 50 فلس)" truncated the entry at the "=" ."""
    assert select_gloss(
        _entry(
            "درهم dirham pl. دراهم darāhim2 dirhem, drachma (Ir. = coin of 50 "
            "فلس); a weight (Eg. = 1/12 اوقية = ca. 3.12 g); دراهم money, cash"
        ),
        prefer_nominal=True,
    ) == ("dirhem, drachma; a weight")


def test_ocr_digit_in_a_grammar_abbreviation_is_still_head():
    """`Hw$`: HW's "pl." is OCR'd "p1.", which shipped as the definition."""
    assert select_gloss(
        _entry(
            "حوش ḥauš p1. احواش aḥwāš, حيشان ḥīšān enclosure, enclosed area; courtyard"
        ),
        prefer_nominal=True,
    ) == ("enclosure, enclosed area; courtyard")


def test_page_number_is_not_read_as_an_abbreviation():
    """The OCR tolerance above must not swallow "571." as a grammar note.

    Asserted on the helper: a page number that reads as a plural marker
    silently extends the head run, which has no single visible signature in
    the output to pin.
    """
    assert _is_abbrev("p1.") and _is_abbrev("pl.")
    assert not _is_abbrev("571.")


def test_ocr_capital_in_a_transliteration_is_still_head():
    """`klb`: "kalb" is OCR'd "Icalb"; a case test dropped the gloss "dog"."""
    assert select_gloss(
        _entry("كلب Icalb pl. كلاب kilāb dog │ الكلب الأكبر the constellation"),
        prefer_nominal=True,
    ) == ("dog")


def test_ocr_mixed_case_transliteration_is_still_head():
    """`Dgv`: "lIiM" -- garbled past recognition, but "pl." still marks it."""
    assert select_gloss(
        _entry(
            "ضغث lIiM pl. اضغاث aḍgāt bunch, bouquet; mixture, muddle, jumble, maze"
        ),
        prefer_nominal=True,
    ) == ("bunch, bouquet; mixture, muddle, jumble, maze")


def test_colon_on_a_head_token_does_not_strand_it():
    """`zrq`: "zarq:" kept its colon, so the head test saw a non-word."""
    assert select_gloss(
        _entry("زرق zarq: زرق الإبر z. al-ibar injections, injectings"),
        prefer_nominal=True,
    ) == ("injections, injectings")


def test_transliterated_definite_article_is_head():
    """`mlq`: "al-a. al-baḥrīya" is transliteration, not English."""
    assert select_gloss(
        _entry(
            "ملق mulqin: ملقيات الألغام البحرية mulqiyāt al-a. al-baḥrīya mine layers"
        ),
        prefer_nominal=True,
    ) == ("mine layers")


def test_dash_between_two_headwords_is_head():
    """`Alw`: the entry opened "آلو - الا alā u to neglect" and shipped "-"."""
    assert select_gloss(
        _entry(
            "آلو - الا alā u to neglect or fail to do, not to do (في s.th.), desist"
        ),
        prefer_nominal=True,
    ) == ("neglect or fail to do, not to do, desist")


@pytest.mark.parametrize("dash", ["-", "–", "—", "―"])
def test_every_dash_the_second_head_pattern_knows_is_head(dash):
    """`_SECOND_HEAD` treats `-`, `–`, `—` and `―` as one class, so the head run
    must too.

    They reached it three different ways instead: `-`/`–` by name, `―` only
    because `_is_transliteration` calls it transliteration, and `—` by neither
    -- it is in `_TYPOGRAPHIC_STRIP`, so it ended the run and the whole entry
    was then lost to the Arabic-tail cut (`select_gloss` returned None). No live
    entry carries a bare `—` today; one OCR variant away from silent loss.
    """
    assert (
        select_gloss(_entry(f"آلو {dash} الا alā u to neglect, desist"))
        == "neglect, desist"
    )


def test_and_joining_a_head_to_a_grammar_note_is_head():
    """`w*r`: "yadaru and imp. ذر dar" -- the "and" joins two head variants."""
    assert select_gloss(
        _entry(
            "وذر only imperf. يذر yadaru and imp. ذر dar to let, leave; to let "
            "alone, leave alone; to let be, stop, cease"
        )
    ) == ("let, leave; to let alone, leave alone; to let be, stop, cease")


def test_and_bare_stem_resolves_past_the_stem():
    """`mrd`: the "and" was head but the stem after it shipped as gloss."""
    assert select_gloss(
        _entry(
            "مرد marada u (مرود murūd) and maruda (مرادة marāda, مرود murūda) "
            "to be refractory, recalcitrant, rebellious; to revolt, rebel "
            "(على against)"
        )
    ) == ("be refractory, recalcitrant, rebellious; to revolt, rebel")


def test_page_number_followed_by_a_comma_is_stripped():
    """`*wq`: the strip only matched a whitespace boundary, so "315," stayed."""
    assert select_gloss(
        _entry(
            "ذاق (ذوق) dāqa u (dauq) to taste, sample (هـ food, etc.); to try, "
            "try out, teat (هـ s.th.); to get a taste 315 (هـ of s.th.), "
            "experience, undergo, suffer (هـ s.th.)"
        )
    ) == (
        "taste, sample; to try, try out, teat; "
        "to get a taste, experience, undergo, suffer"
    )


def test_orphan_closing_paren_is_dropped_not_the_text_before_it():
    """`fnn`: HW's RTL text inverts the pair and strands the ")" at the end."""
    assert select_gloss(
        _entry("فنن fanan pl. افنان afnān branch, twig (of a tree), of a shrub)"),
        prefer_nominal=True,
    ) == ("branch, twig (of a tree), of a shrub")


def test_unclosed_paren_is_cut_back_to_the_bracket():
    """`qws`: the length cap landed inside "(arch.; of a bridge)"."""
    assert select_gloss(
        _entry(
            "قوس qaus m. and f., pl. of اقواس aqwās, قسي qusīy, qisīy bow, "
            "longbow; arc (geom.); arch, vault (arch.; of a bridge); violin bows"
        ),
        prefer_nominal=True,
    ) == ("bow, longbow; arc (geom.); arch, vault")


def test_unparseable_entry_is_quarantined_rather_than_shipped():
    """`fry`: bracket-inverted source leaves "or)", which is not a definition."""
    assert (
        select_gloss(_entry("فرى farīy: جاء) شيئا فريا or) اتى to do s.th. unheard-of"))
        is None
    )


def test_length_cap_binds_without_any_punctuation_boundary():
    """The gate has no `long` bucket it cannot clear, so the cap never yields."""
    gloss = select_gloss(_entry("ارض arḍ " + "word " * 60))
    assert gloss is not None and len(gloss) <= MAX_GLOSS_CHARS
    assert gloss.endswith("word")


def test_english_possessive_is_not_read_as_transliteration():
    """`Tyn`: "potter’s" shares U+2019 with hamza and was eaten as head."""
    assert select_gloss(
        _entry("طين ṭīn pl. اطيان aṭyān clay, potter’s clay, argil; soil; basis"),
        prefer_nominal=True,
    ) == ("clay, potter’s clay, argil; soil; basis")


def test_possessive_after_a_transliteration_is_gloss():
    """`Emm`: "a‘mām father’s brother" -- the possessive opens the English."""
    assert select_gloss(
        _entry("عم ‘amm pl. عموم ‘umūm, اعمام a‘mām father’s brother, paternal uncle"),
        prefer_nominal=True,
    ) == ("father’s brother, paternal uncle")


def test_possessive_shaped_transliteration_on_its_headword_is_head():
    """`yAs`: "ya’s" looks possessive but sits on the Arabic it spells."""
    assert select_gloss(
        _entry("يأس ya’s renunciation, resignation; hopelessness, desperation")
    ) == ("renunciation, resignation; hopelessness, desperation")


def test_homograph_index_on_a_hamza_transliteration_is_head():
    """`_HOMOGRAPH` could not match the "ra’s1" in its own docstring."""
    assert select_gloss(_entry("راس ra’s1 head, top")) == "head, top"


# ---- phase 24, round 3: the head run walking through the gloss.
#
# Every case below is a real Hans Wehr entry whose primary sense the head strip
# deleted. All five shape buckets in the audit passed on the wreckage, because
# each one only tests text that survived.


@pytest.mark.parametrize(
    "definition,expected",
    [
        # ";" ends a sense, so nothing before it can be head material. Stripping
        # it as ordinary punctuation let "day;" read as a stem and "trunk.;" as
        # a grammar note, and the run ate the word each one closed.
        (
            "يوم yaum pl. ايام ayyām day; pl. also: age, era, time",
            "day; pl. also: age, era, time",
        ),
        (
            "خمر kamr m. and f., pl. خمور kumūr wine; pl. alcoholic beverages",
            "wine; pl. alcoholic beverages",
        ),
        (
            "جذع jid‘ pl. اجذاع ajdā‘ stem, trunk.; stump, torso",
            "stem, trunk.; stump, torso",
        ),
    ],
)
def test_a_sense_boundary_stops_the_head_run(definition, expected):
    assert select_gloss(_entry(definition)) == expected


@pytest.mark.parametrize(
    "definition,root,expected",
    [
        # Live `stt`. Every case above survives `_head_word` returning the
        # stripped token unconditionally, because their first sense is not
        # itself head-shaped: the run stops on "day"/"wine"/"stem" for other
        # reasons. Here it does not -- "six" reads as a transliteration, so
        # without the ";" rule the run walks through the sense boundary, eats
        # the second Arabic headword, and ships the *next* sense.
        ("ستة sitta (f. ست sitt) six; ستة عشر sittata ‘ašara sixteen", "stt", "six"),
        # Live `bgl`: the token past the boundary is a plural marker, which is
        # head material by every other test.
        (
            "بغل bagl pl. بغال bigāl, ابغال abgal mule; بغلة bagla pl. "
            "bagalāt female mule",
            "bgl",
            "mule",
        ),
    ],
)
def test_the_sense_boundary_holds_where_the_next_word_is_head_shaped(
    definition, root, expected
):
    """The rule `_head_word` exists for, pinned on entries that need it.

    Round 10 wrote it (`90283ea`, `e822a18`) after it deleted the primary sense
    of `ywm`, `xmr`, `Hlm` and `j*E`; a mutation deleting it again left the
    whole suite green while the live gate moved three glosses.
    """
    assert select_gloss(_entry(definition), root=root) == expected


@pytest.mark.parametrize(
    "definition,expected",
    [
        # HW joins two diacritic-free spellings of one head with a comma, so
        # `_is_transliteration` sees no head at all, the run stops on the first
        # spelling, and the Arabic cut takes the English with it -- leaving the
        # headword as its own definition.
        (
            "أفق ufq, ufuq pl. آفاق āfāq horizon; range of vision",
            "horizon; range of vision",
        ),
        ("عنق unuq, unq pl. اعناق a‘nāq neck, nape", "neck, nape"),
        ("كبد kabid, kabd, kibd m. and f., pl. اكباد akbād liver", "liver"),
    ],
)
def test_a_comma_joined_spelling_chain_is_head(definition, expected):
    assert select_gloss(_entry(definition)) == expected


def test_a_variant_pair_sitting_on_arabic_is_head():
    """ "yahinu, wahuna" spells a perfect against an imperfect, so the two share
    no skeleton -- Arabic on both sides is the only thing left that marks it."""
    gloss = select_gloss(
        _entry("وهن wahana, wahina يهن yahinu, wahuna يوهن yauhunu to be weak, feeble")
    )
    assert gloss == "be weak, feeble"


def test_an_unclosed_paren_holding_arabic_is_head():
    """`_ARABIC_PAREN` cannot remove a paren HW never closed, and the stem
    before it is the imperfect while the paren respells the perfect."""
    gloss = select_gloss(
        _entry("وجف wajafa يجف yajifu (wajf, وجوف wujūf to be agitated, excited")
    )
    assert gloss == "be agitated, excited"


@pytest.mark.parametrize(
    "definition,expected",
    [
        # HW also runs straight from the Arabic headword into English, and sets
        # its examples in Arabic mid-gloss. Reading either as a variant pair
        # deletes the first sense.
        ("عز might, power, standing, weight", "might, power, standing, weight"),
        ("فوز success, triumph, victory", "success, triumph, victory"),
        (
            "اب ab pl. آباء abā‘ father: ancestor, forefather: يا ابت yā abati O",
            "father: ancestor, forefather",
        ),
    ],
)
def test_english_around_arabic_is_not_mistaken_for_a_variant_pair(definition, expected):
    assert select_gloss(_entry(definition)) == expected


# ---- phase 24, round 4: head material the round-3 rules still walked past.
#
# 25 shipped glosses opened with their own transliterated stem, four leaked a
# second headword, one leaked a homograph index. No audit bucket saw any of it:
# `stub` needs *every* word to respell the head, and one head word followed by
# real English breaks that.


@pytest.mark.parametrize(
    ("definition", "expected"),
    [
        # `wjd` -- an assimilated verb. HW marks the imperfect with nothing but
        # the Arabic it sits on, so the stem shipped as the first gloss word.
        (
            "وجد wajada يجد yajidu to find; to hit upon s.th.",
            "find; to hit upon s.th.",
        ),
        # `zlzl` -- a quadriliteral. One stem, no imperfect, same shape.
        ("زلزل zalzala to shake, convulse", "shake, convulse"),
        # `wzr` -- the grammar paren stands between the stem and its infinitive.
        (
            "وزر wazara يزر yaziru (wizr) to take upon o.s., carry",
            "take upon o.s., carry",
        ),
        # `lyl`, `bqr` -- the nominal shape of the same defect.
        ("ليل lail (usually m.) nighttime, night", "nighttime, night"),
        ("بقر baqar (coll.) bovines, cattle", "bovines, cattle"),
    ],
)
def test_a_stem_on_its_arabic_before_an_infinitive_is_head(definition, expected):
    assert select_gloss(_entry(definition)) == expected


@pytest.mark.parametrize(
    ("definition", "expected"),
    [
        # Arabic before, but English after -- HW runs straight from the headword
        # into the gloss, and "to" never follows.
        ("عز might, power, standing", "might, power, standing"),
        # "to" after, but no Arabic before: real prose reaches an infinitive.
        (
            "فوز to succeed, be successful; success",
            "succeed, be successful; success",
        ),
    ],
)
def test_one_half_of_the_stem_rule_alone_is_not_head(definition, expected):
    assert select_gloss(_entry(definition)) == expected


def test_a_qualifier_paren_directly_on_the_head_is_dropped_either_way():
    """Known cost of resolving past the paren, and not a new one: a paren the
    head opens is dropped whether the head is a bare stem (`Asr`, "asr (leather)
    strap") or a diacritic-bearing transliteration, which has always been head.
    Two live glosses lose a qualifier this way; 18 stop shipping their headword.
    A paren the *gloss* opens is untouched -- it sits past the head run."""
    assert select_gloss(_entry("اسر asr (leather) strap, thong")) == "strap, thong"
    assert (
        select_gloss(_entry("زيت zait pl. زيوت zuyūt (edible) oil, fat")) == "oil, fat"
    )


@pytest.mark.parametrize(
    ("definition", "expected"),
    [
        # `syH` -- no space after the dash, so a literal " -- " search misses it.
        (
            "ساح sāḥa u to flow, run (water); --(saiḥ, سياحة siyāḥa) to travel",
            "flow, run (water)",
        ),
        # `fsH` -- en dash, with HW's page break set between the two headwords.
        (
            "فسح fasuḥa u to be wide, roomy; 711 – fasaḥa a (fasḥ) to make room",
            "be wide, roomy",
        ),
        # `Abd` -- U+2015, and the second headword is bare vowel markers.
        (
            "ابد abada u i to stay, linger; ― i u to roam in a state of wildness",
            "stay, linger",
        ),
    ],
)
def test_a_second_headword_is_cut_however_its_dash_is_spelled(definition, expected):
    assert select_gloss(_entry(definition)) == expected


@pytest.mark.parametrize(
    ("definition", "expected"),
    [
        # HW abbreviates a plural suffix with the same en dash it separates
        # headwords with -- "pl. –āt", "pl. –ūn". 110 entries carry one, and an
        # unanchored cut would take the definition off at "pl.".
        ("بازار bāzār pl. –āt bazaar", "bazaar"),
        (
            "اهل ahl pl. –ūn, اهال ahālin relatives, folks, family",
            "relatives, folks, family",
        ),
    ],
)
def test_an_en_dash_plural_suffix_is_not_a_second_headword(definition, expected):
    assert select_gloss(_entry(definition), prefer_nominal=True) == expected


def test_an_entry_opening_with_a_dash_keeps_the_gloss_past_it():
    """The cut is anchored on a preceding ";" for this: HW also joins two
    spellings of one headword with a leading dash, and cutting there would take
    the whole definition with it."""
    assert select_gloss(
        _entry("آلو - الا alā u to neglect or fail to do, desist"), prefer_nominal=True
    ) == ("neglect or fail to do, desist")


def test_a_homograph_index_set_as_its_own_token_is_head():
    """`rfrf`: "رفارف rafārif 2 cushion". `_PAGE_NUMBER` is bounded to 2-4 digits
    so a real quantity survives, which leaves the bare index to this rule."""
    assert select_gloss(
        _entry("رفرف rafraf pl. رفارف rafārif 2 cushion, pad; eyeshade"),
        prefer_nominal=True,
    ) == ("cushion, pad; eyeshade")


def test_the_length_cap_default_is_read_at_call_time(monkeypatch):
    """`classify` reads `hanswehr_gloss.MAX_GLOSS_CHARS` per call, so a default
    bound at import would let the gate's cap and the generator's drift apart --
    leaving a `long` bucket the generator has no code path to empty."""
    definition = "قتل qatala u to kill, murder; to slay; to slaughter; to put to death"
    assert len(select_gloss(_entry(definition)) or "") > 20
    monkeypatch.setattr(hanswehr_gloss, "MAX_GLOSS_CHARS", 20)
    assert len(select_gloss(_entry(definition)) or "") <= 20


# ---- phase 24, round 5: one head word, then real English.
#
# Quoted whole rather than wrapped, and rather than trimmed to fit: the shape
# this entry proves needs both "pl." runs and the paren between them, and a
# shortened copy stops proving it (noqa: the line is one indivisible datum).
SAFH = "سفح safḥ pl. سفوح sufūḥ foot (of a mountain); pl. سفوح flat, rocky surface"  # noqa: E501
#
# 22 glosses opened with a transliterated headword and ran on into a correct
# definition. `stub` cannot see that shape -- it asks whether *every* word
# respells the head -- so `audit_hanswehr_glosses.head` was added to measure it.


@pytest.mark.parametrize(
    ("definition", "expected"),
    [
        # `qll`, `srr`, `rjz` -- a two-member chain. The old rule keyed on the
        # comma `tok` carries, so it could only ever mark a chain's non-final
        # members and the last one shipped as the gloss's first word.
        ("قل qill, qull littleness, smallness", "littleness, smallness"),
        ("سرر surur, sirar umbilical cord", "umbilical cord"),
        ("رجز rujz, rijz punishment; dirt, filth", "punishment; dirt, filth"),
        # `ybs`, `ytm`, `nsk` -- three members, where the old rule stranded the
        # middle one too: "yabs, yubs, yabas dryness" shipped "yubs, yabas".
        ("يبس yabs, yubs, yabas dryness", "dryness"),
        ("يتم yatm, yutm, yatam orphanhood", "orphanhood"),
        ("نسك nask, nusk, nusuk piety, devoutness", "piety, devoutness"),
    ],
)
def test_the_last_spelling_of_a_comma_chain_is_head(definition, expected):
    assert select_gloss(_entry(definition), prefer_nominal=True) == expected


@pytest.mark.parametrize(
    ("definition", "expected"),
    [
        # Skeletons differ, so an English pair is not a spelling chain. Both are
        # live glosses that the chain rule would delete the first sense of.
        ("عز might, power, standing", "might, power, standing"),
        ("لبن libn (coll.) brick(s), adobes", "brick(s), adobes"),
    ],
)
def test_an_english_pair_is_not_read_as_a_spelling_chain(definition, expected):
    assert select_gloss(_entry(definition), prefer_nominal=True) == expected


@pytest.mark.parametrize(
    ("definition", "expected"),
    [
        # `nfs`, `qss`, `bgl` -- a diacritic-free plural transliteration sitting
        # on the Arabic it spells, with plain English after it. Nothing else in
        # the head run can see it, so it shipped as the first gloss word.
        ("نفس nafs f., pl. نفوس nufūs, انفس anfus soul; psyche", "soul; psyche"),
        ("قس qass pl. قسوس qusūs, قسس qusus priest, presbyter", "priest, presbyter"),
        ("بغل bagl pl. بغال bigāl, ابغال abgal mule", "mule"),
    ],
)
def test_a_plural_transliteration_on_mid_entry_arabic_is_head(definition, expected):
    assert select_gloss(_entry(definition), prefer_nominal=True) == expected


@pytest.mark.parametrize(
    ("definition", "expected"),
    [
        # The Arabic is the entry's *first* token -- the headword itself -- and
        # HW runs straight from it into English. Nothing precedes it, and that
        # absence is the whole signal.
        ("فوز success, triumph, victory", "success, triumph, victory"),
        ("نصب setting up, placing; erection", "setting up, placing; erection"),
        # `sfH`, verbatim: "pl." before the Arabic means HW omitted the plural's
        # own transliteration and the definition resumes on the Arabic instead,
        # so what follows is English. Without the exclusion this ate the "flat,".
        # The entry's first sense is what it must come back with -- round 6 gave
        # the paren lookahead the sense-boundary guard that gets it there.
        (SAFH, "foot (of a mountain)"),
    ],
)
def test_arabic_that_opens_or_follows_a_grammar_note_is_not_head_evidence(
    definition, expected
):
    assert select_gloss(_entry(definition), prefer_nominal=True) == expected


def test_an_ocr_period_inside_english_is_not_a_grammar_note():
    """`frE`: "افرع afru‘ twig, branch. bough, limb". `_is_abbrev` has to accept
    an alphanumeric body because this text is OCR ("p1." for "pl."), which also
    accepts an English word carrying an OCR period -- and that marked "twig,"
    head, deleting the entry's primary sense. A real grammar note is followed by
    what it governs, never by more English."""
    assert select_gloss(
        _entry("فرع far‘ pl. فروع furū‘, افرع afru‘ twig, branch. bough, limb"),
        prefer_nominal=True,
    ) == ("twig, branch. bough, limb")


@pytest.mark.parametrize(
    ("definition", "expected"),
    [
        # `jnd`, `bld`, `qws` -- HW chains gender and number with "and", so the
        # note that follows a note is not always another abbreviation.
        ("جند jund m. and f., pl. جنود junūd soldiers; army", "soldiers; army"),
        (
            "بلد balad m. and f., pl. بلاد bilād country; town, city",
            "country; town, city",
        ),
        ("قوس qaus m. and f., pl. اقواس aqwās bow, longbow", "bow, longbow"),
    ],
)
def test_and_chained_grammar_notes_are_still_head(definition, expected):
    assert select_gloss(_entry(definition), prefer_nominal=True) == expected


def test_a_passive_stem_still_matches_its_verbal_noun():
    """`bht`: "pass. buhita (baht) to be astonished". The verbal-noun test
    compared a three-letter prefix, which the passive's vowels break -- so the
    stem read as gloss text. Consonants are what the two actually share."""
    assert select_gloss(
        _entry(
            "بهت bahita a, bahuta u and pass. buhita (baht) to be astonished, amazed"
        )
    ) == ("be astonished, amazed")


# ---- phase 24, round 6: `--` is two different marks, and depth tells them apart.


MSX = "مسخ masaka a (mask) to transform (من – الى ه s.o. from -- into), transmute, convert (هـ s.th.); to falsify, distort (هـ s.th.)"  # noqa: E501


@pytest.mark.parametrize(
    ("text", "kept"),
    [
        # Second headword: outside any parenthesis, so it is a real cut point.
        ("to decide (هـ s.th.) -- qadara i to possess", "to decide (هـ s.th.)"),
        # `wH$` opens its second head on a comma, which `_SECOND_HEAD` (anchored
        # on ";") cannot see -- this cut is the only thing that catches it.
        (
            "wild, untamed (animal), -- (pl. وحوش) wild animal",
            "wild, untamed (animal),",
        ),
        # Em-dash placeholder standing in for the headword, inside the grammar
        # parenthesis it belongs to. Cutting here deleted every later sense.
        ("to transform (من الى ه s.o. from -- into), transmute", None),
        ("to carry away and scatter (wind -- the dust); to blow up", None),
        # Nested, and closed before the real second head opens.
        (
            "to mistake (بين -- و s.th. for) -- kalaṭa i",
            "to mistake (بين -- و s.th. for)",
        ),
        # OCR loses brackets. A stray ")" must not drive the depth negative and
        # silently disable every cut in the rest of the entry.
        ("s.th.) to decide -- qadara i", "s.th.) to decide"),
        ("nothing to cut here", None),
    ],
)
def test_dash_cut_fires_only_outside_a_grammar_paren(text, kept):
    i = hanswehr_gloss._dash_cut(text)
    if kept is None:
        assert i == -1
    else:
        assert i != -1 and text[:i] == kept


def test_a_placeholder_dash_no_longer_truncates_the_entry():
    """`msx`: the literal cut sat unanchored beside `_SECOND_HEAD` and fired on
    the placeholder inside "(s.o. from -- into)". `_balance_parens` then removed
    the orphaned "(", so three of four senses vanished without a trace."""
    assert select_gloss(_entry(MSX)) == (
        "transform, transmute, convert; to falsify, distort"
    )


def test_a_gloss_never_ships_ending_on_a_typographic_dash():
    """The Arabic-tail cut orphans the dash that introduced what it removed, and
    `_strip_tail` will not pop it: `_is_transliteration` reads a bare "–"/"—" as
    ASCII (both sit in `_TYPOGRAPHIC_STRIP`) while "―" is not, so one dash class
    had three outcomes. `_balance_parens` strips all of them now."""
    assert (
        select_gloss(_entry("نسف nasafa to blow up, blast – الى s.th."), root="nsf")
        == "blow up, blast"
    )
    assert (
        select_gloss(_entry("نسف nasafa to blow up, blast ― الى s.th."), root="nsf")
        == "blow up, blast"
    )


def test_the_second_head_cut_keeps_working_behind_an_unclosed_bracket():
    """`_SECOND_HEAD` carries no paren-depth guard, deliberately. `wjf` opens a
    bracket HW never closes ("(wajf, وجوف wujūf, وجيف"), so a depth test would
    read its genuine second headword as nested and leak it into the gloss --
    that and `Ewd` are the only two entries in 1642 where the question arises,
    and both go the same way."""
    assert (
        select_gloss(
            _entry(
                "وجف wajafa يجف yajifu (wajf, وجوف wujūf, وجيف to be agitated, "
                "excited; -- (wajīf) to throb, beat (heart)"
            ),
            root="wjf",
        )
        == "be agitated, excited"
    )


def test_a_real_second_headword_is_still_cut():
    """The paren guard must not cost the cut its job: `qdr` runs its Form-I
    sense straight into a second headword with no ";" for `_SECOND_HEAD`."""
    assert select_gloss(
        _entry("قدر qadara u i (qadr) to decree, ordain (هـ s.th.) -- qadara i to rule")
    ) == ("decree, ordain")


def test_the_head_run_may_not_cross_a_sense_boundary_to_resume():
    """`sfH`: the paren lookahead asked only whether head resumed after the
    closing token, and "foot (of a mountain); pl. سفوح flat" resumes on the
    *next sense's* "pl." -- so the entry's primary sense was marked head."""
    assert select_gloss(_entry(SAFH), prefer_nominal=True) == "foot (of a mountain)"


# ---- phase 24, round 7: the page-number strip against real quantities.


def test_a_comma_grouped_quantity_survives_the_page_number_strip():
    """`_PAGE_NUMBER` matched the "10" of "10,000" -- space on the left, comma
    on the right -- while its leading `\\s` skipped the "000", so the entry
    shipped "= ,000 dirhams". HW does carry grouped quantities, contradicting
    the claim that every real one is spelled out.

    A Form-I verb entry, not the noun `bdr` this was found on: that one opens
    "بدرة badra huge amount ...", whose head leftover is a separate live defect
    and would make this assertion test two things at once."""
    assert select_gloss(
        _entry("بدر badara u to pay out (formerly = 10,000 dirhams)")
    ) == ("pay out (formerly = 10,000 dirhams)")


def test_the_comma_qualifier_does_not_cost_a_real_page_number():
    """The fix narrows the comma boundary to `,(?!\\d)`, so a page number that
    HW wrote mid-sentence with a comma after it must still go -- otherwise it
    buys the quantity back by reopening the miss round 2 closed."""
    assert select_gloss(_entry("ذوق dauq to get a taste 315, experience")) == (
        "get a taste, experience"
    )


# ---- phase 24, round 8: punctuation the paren cut orphans, and what looks
# non-ASCII without being Arabic.


@pytest.mark.parametrize(
    "definition,expected",
    [
        # A colon whose Arabic object was removed. Every surrounding strip uses
        # " ,;:", so this survived where the same shape in a comma did not.
        (
            "ابى abā i to scorn, disdain (هـ s.th.): to deny",
            "scorn, disdain: to deny",
        ),
        # The colon as its own token also split the head run: `_gloss_start`
        # stopped on it, so the gloss opened on the punctuation and only the
        # trailing strip saved it.
        ("بخع baka‘a a with نفسه : to kill o.s.", "kill o.s."),
        # A period orphaned the same way is stripped nowhere at all.
        (
            "شغل šagala a to distract, divert, alienate (ه عن s.o. from s.th.).",
            "distract, divert, alienate.",
        ),
    ],
)
def test_punctuation_orphaned_by_the_arabic_cut_is_pulled_back(definition, expected):
    assert select_gloss(_entry(definition)) == expected


@pytest.mark.parametrize(
    "definition,expected",
    [
        # HW's spaced ellipsis -- not an orphan, and closing it up reads worse.
        (
            "ليت layyata a to say: would God! if only ...!",
            "say: would God! if only ...!",
        ),
        # OCR dropping a word's first letter leaves a period wearing its space.
        # Pulling it back welds the damage onto the word before it.
        ("رجو rajā u to hope; to .xpect, anticipate", "hope; to .xpect, anticipate"),
    ],
)
def test_a_period_with_a_word_after_it_is_left_alone(definition, expected):
    """The lookahead that keeps the period rule off its two non-orphan shapes.

    Without it these ship "if only...!" and "to.xpect" -- 6 roots, and the
    reason `.` carries a guard the other three characters do not need.
    """
    assert select_gloss(_entry(definition)) == expected


@pytest.mark.parametrize(
    "tok,expected",
    [
        # Typographic punctuation is not script: `_strip_tail` pops while this
        # is true, so English quoted with U+201C read as a dangling head.
        ("“used", False),
        ("“would", False),
        ("dash—joined", False),
        # Hamza / ‘ain on U+2019/U+2018 stay evidence -- about 50 roots turn on
        # it, and the English possessive is handled by `_is_possessive` instead.
        ("‘ajz", True),
        ("ra’s", True),
        ("waḥš", True),
        ("al-ibar", True),
    ],
)
def test_only_script_makes_a_token_transliteration(tok, expected):
    assert _is_transliteration(tok) is expected


def test_quoted_english_at_the_end_is_not_stripped_as_head():
    """`kwn` live: "... corresponding to Engl. “used to ...”, “would ...”".

    Latent rather than live only because `max_senses` truncates before it; a
    shorter entry ending this way loses its last word.
    """
    assert _strip_tail("the manner of Engl. “would”") == "the manner of Engl. “would”"


# ---- phase 24, round 8: the root as head evidence the definition cannot carry.


@pytest.mark.parametrize(
    "root,skeleton",
    [
        # This edition's OCR writes خ as "ḳ" and ج as plain "j" -- both measured
        # over the corpus, not taken from the standard scheme.
        ("xDd", "kdd"),
        ("jnn", "jnn"),
        # ث/ذ/ش/ص/ض/ط/ظ carry their diacritic on a base letter, which the
        # skeleton keeps and the mark it drops.
        ("$rq", "srq"),
        ("*kr", "dkr"),
        ("SbH", "sbh"),
        ("Zlm", "zlm"),
        ("TwE", "tw"),
        # ع is written ‘ and stripped with the hamza; alef is a vowel.
        ("Ezz", "zz"),
        ("Amr", "mr"),
    ],
)
def test_root_skeleton_maps_to_what_the_transliteration_shows(root, skeleton):
    assert _root_skeleton(root) == skeleton


@pytest.mark.parametrize(
    "tok,root,expected",
    [
        ("qalb", "qlb", True),
        ("faqr", "fqr", True),
        # و and ي are radicals in the root but long vowels in the spelling, so
        # both sides drop them. Without this, 349 of 424 unrecognised heads.
        ("haun", "hwn", True),
        ("gair", "gyr", True),
        ("might", "Ezz", False),
        # Two strong consonants minimum. `Awh` reduces to "h" and its own
        # correct gloss is "oh!" -- a one-consonant rule deletes the entry.
        ("oh!", "Awh", False),
        ("", "qlb", False),
        # Gemination folds on both sides, because the two spell it differently:
        # the root doubles where HW writes one letter ("hum" for هم), and HW
        # doubles where the root writes one ("majass" for مجس).
        ("hum", "hmm", True),
        ("majass", "mjs", True),
        # Tanwīn is carried into the transliteration and belongs to neither.
        ("qiran", "qry", True),
        ("taran", "vry", True),
        # ...but a final ن that is a radical is not tanwīn, so only the token
        # side is denunated. Both of these still have to match.
        ("man", "mnn", True),
        # The floor is measured before the fold. Measured after, a geminate root
        # collapses to one consonant and falls under it -- which is how a first
        # attempt at this handed `Aff` back its own "afaf".
        ("afaf", "Aff", True),
        # `nwy` reduces to a single strong "n", so the cut declines it even
        # though "nawan" does respell it. `_head_leftover` has no floor and
        # flags the row instead.
        ("nawan", "nwy", False),
    ],
)
def test_respells_root(tok, root, expected):
    assert _respells_root(tok, _root_skeleton(root)) is expected


def test_a_transliteration_on_its_arabic_is_head_even_with_english_after_it():
    """The 124-root defect. "قلب qalb reversal" gives the head run nothing to
    go on -- no vowel marker, no grammar note, no infinitive -- so the head
    shipped as the gloss's first word. The root is the missing evidence."""
    entry = _entry("قلب qalb reversal, inversion; overturn")
    assert select_gloss(entry, root="qlb") == "reversal, inversion; overturn"


def test_without_a_root_the_head_run_is_unchanged():
    """`root` is optional, and the rule must be the only thing it switches on --
    otherwise every caller that has no root silently gets a different gloss."""
    entry = _entry("قلب qalb reversal, inversion; overturn")
    assert select_gloss(entry) == "qalb reversal, inversion; overturn"


def test_a_loanword_gloss_is_not_cut_as_its_own_headword():
    """`drhm` ships "dirhem, drachma", correct English that respells the root
    because the English is the loanword. What keeps the rule off it is the token
    before it: HW's transliteration sits on the Arabic it spells, and this one
    sits on the plural transliteration instead."""
    entry = _entry("درهم dirham pl. دراهم darāhim2 dirhem, drachma; a weight")
    assert select_gloss(entry, root="drhm") == "dirhem, drachma; a weight"


def test_english_after_arabic_is_not_cut_when_it_does_not_respell_the_root():
    """The other half of the guard: HW runs straight from headword into English
    often ("عز might, power"), so Arabic behind cannot be head evidence alone."""
    assert select_gloss(_entry("عز might, power"), root="Ezz") == "might, power"


# ---- phase 24, round 9: defects found by /code-review on the round-8 fixes.


def test_a_sense_boundary_sitting_exactly_on_the_cap_is_used():
    """`rfind`'s window is half-open, so searching to `max_chars` could not see a
    boundary *at* `max_chars` -- which is legal, since the slice before it is
    exactly `max_chars` long. Live it cost `qll` 120 characters of gloss, `nqm`
    95 and `Zhr` 6, each falling back to a far earlier cut."""
    # A first sense exactly `max_chars` long, so its ";" sits at index 150 --
    # the one index the old half-open window could not reach. All three live
    # glosses this fix recovered are exactly 150 characters, for this reason.
    # Distinct synonyms, not a repeated one: identical tokens read as a spelling
    # -variant chain and the head run eats them.
    first = (
        "precede, outstrip, outrun, forestall, anticipate, overtake, surpass, "
        "outdistance, outpace, outstep, outdo, excel, lead, head, front, "
        "vanguard, heralds"
    )
    assert len(first) == 150
    entry = _entry(f"سبق sabaqa {first}; second sense; third sense")
    assert select_gloss(entry, max_chars=150, root="sbq") == first

    # Same index, via the comma/colon fallback: HW writes plenty of entries as
    # one unbroken synonym list, so that branch takes the cut and carries the
    # identical off-by-one.
    no_semicolon = _entry(f"سبق sabaqa {first}, outgo, outmarch, outsprint")
    assert select_gloss(no_semicolon, max_chars=150, root="sbq") == first

    # And once more via the last fallback, a bare space -- all three windows
    # share the bug, so all three have to be shown moving.
    spaced = (
        "precede outstrip outrun forestall anticipate overtake surpass "
        "outdistance outpace outstep outdo excel lead head front vanguard "
        "heralds trailblazer run"
    )
    assert len(spaced) == 150
    entry_spaced = _entry(f"سبق sabaqa {spaced} onward forward")
    assert select_gloss(entry_spaced, max_chars=150, root="sbq") == spaced

    # One character further out is genuinely over the cap and must still be cut.
    over = first + "x"
    gloss = select_gloss(
        _entry(f"سبق sabaqa {over}; second"), max_chars=150, root="sbq"
    )
    assert gloss is not None and gloss != over and len(gloss) <= 150


def test_the_cap_is_measured_after_the_unclosed_paren_is_dropped():
    """`_balance_parens` deletes the tail from an unterminated "(", so a gloss
    over the cap only because of a paren about to be removed was being cut at an
    earlier sense boundary for nothing -- live on `$kl`, 81 chars where the
    balanced text is 118."""
    tail = " (" + "x" * 120
    entry = _entry(f"شكل šakl similarity, resemblance; outward appearance{tail}")
    assert select_gloss(entry) == "similarity, resemblance; outward appearance"


def test_truncating_can_still_open_a_paren_and_it_is_closed_after():
    """The pre-cap balance does not retire the post-cap one: the cut itself can
    leave a "(" hanging, and that tail must still go."""
    # The paren here is balanced, so the pre-cap call leaves it alone -- but it
    # opens before the cap and closes after, and its inner commas are the last
    # boundary in the window, so the cut lands *inside* it.
    body = (
        "precede, outstrip, outrun, forestall, anticipate, overtake, surpass, "
        "outdistance"
    )
    tail = (
        " (of a runner, of a horse, of a rider, of a camel, of a messenger, "
        "of a herald)"
    )
    gloss = select_gloss(_entry(f"سبق sabaqa {body}{tail}"), root="sbq")
    assert gloss == body
    assert gloss is not None and "(" not in gloss and len(gloss) <= MAX_GLOSS_CHARS


# ---- phase 24, round 10: defects found by /code-review on the round-9 fixes.


def test_a_plural_transliteration_after_a_grammar_note_is_head():
    """`_is_stem` excluded a grammar note two tokens back, on the reading that
    "pl." before Arabic means HW omitted the plural's transliteration. HW writes
    it as often as not, and `wkA` shipped it as the first word of its gloss."""
    entry = _entry(
        "وكاء wikā’ pl. اوكية aukiya thong or string for tying up a waterskin or bag"
    )
    assert select_gloss(entry, root="wkA") == (
        "thong or string for tying up a waterskin or bag"
    )


def test_the_arabic_tail_cut_is_what_protects_a_resumed_sense():
    """The other half of that removal, and the reason it was safe: the exclusion
    claimed to keep "flat," on `sfH`, but the second sense never reaches the
    head run at all -- the Arabic-tail cut has already taken it."""
    entry = _entry("سفح safḥ pl. سفوح sufūḥ foot (of a mountain); pl. سفوح flat, rocky")
    assert select_gloss(entry, root="sfH") == "foot (of a mountain)"


@pytest.mark.parametrize(
    "definition,root,expected",
    [
        # The root doubles a radical HW writes once.
        (
            "هم hum they (3rd pers. m. pl. of the pers. pron.)",
            "hmm",
            "they (3rd pers. m. pl. of the pers. pron.)",
        ),
        # HW doubles one the root writes once.
        (
            "مجس majass spot which one touches or feels; sense of touch",
            "mjs",
            "spot which one touches or feels; sense of touch",
        ),
        # Tanwīn carried into the transliteration.
        (
            "قرى qiran hospitable reception, entertainment (of a guest)",
            "qry",
            "hospitable reception, entertainment (of a guest)",
        ),
        # A geminate root, which the fold must not shrink below the floor.
        (
            "افف afaf displeasure; grumbling, grumble",
            "Aff",
            "displeasure; grumbling, grumble",
        ),
    ],
)
def test_a_head_is_cut_though_gemination_and_tanwin_respell_it(
    definition, root, expected
):
    """Eight roots shipped their own headword because the head cut demanded
    strong-consonant equality, and neither side spells gemination or tanwīn the
    way the other does."""
    assert select_gloss(_entry(definition), root=root, max_senses=2) == expected


def test_see_also_is_a_cross_reference_without_needing_a_lookahead():
    """Its object is an Arabic headword, which `_ARABIC_TAIL` had already cut
    away -- so `bAr` shipped the dangling "; see also under"."""
    entry = _entry("بار bārr reverent, faithful and devoted; see also under بر barr")
    assert select_gloss(entry, root="bAr") == "reverent, faithful and devoted"


def test_a_sense_reaching_the_english_verb_see_is_not_cut_at_it():
    """The lookahead the "see also" branch must not weaken: `$hd` and `Tlb` both
    reach a real "see" mid-gloss, and a bare `\\bsee\\s+` truncates them."""
    entry = _entry("شهد šahida a to witness; to experience personally, see with")
    assert select_gloss(entry, root="$hd") == (
        "witness; to experience personally, see with"
    )
