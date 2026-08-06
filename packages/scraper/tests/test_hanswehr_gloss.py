from scraper.hanswehr_gloss import select_gloss

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
    assert "IV" not in g and "أَطْرَفَ" not in g   # Form IV block cut

def test_idiom_after_bar_dropped():
    g = select_gloss([(1, KHADD)])
    assert "cut off" in g and "tame" not in g       # │ idiom cut

def test_prefer_nominal_takes_noun_head():
    g = select_gloss([(1, LAWH_V),(0, LAWH_N)], prefer_nominal=True)
    assert g.startswith("board")     # "pl. الواح alwāḥ" fully stripped
    g2 = select_gloss([(1, LAWH_V),(0, LAWH_N)], prefer_nominal=False)
    assert g2.startswith("appear")   # verb head, "lāḥa u (lauḥ) to" stripped

def test_leading_english_article_survives():
    g = select_gloss([(0, SHAI)])
    assert g.startswith("a thing")   # bare "a" is the article, not the verb marker

def test_verb_vowel_marker_still_stripped():
    g = select_gloss([(1, LAWH_V_SHORT)])
    assert g.startswith("appear")    # bare "u" before "(lauḥ)" is the marker

def test_max_senses_caps_length():
    g = select_gloss([(0, LAWH_N)], max_senses=2)
    assert g.count(";") <= 1

def test_empty_returns_none():
    assert select_gloss([(1, "طرف ṭarafa")]) is None   # no English after strip

def test_arabic_object_markers_dropped_from_body():
    g = select_gloss([(1, QAWL)])
    assert g.startswith("speak, say")   # first cluster kept
    assert not _has_arabic(g)           # "(هـ s.th.)" etc. gone, not just the head

def test_second_headword_after_dashes_cut():
    g = select_gloss([(1, AMANA)])
    assert "faithful" in g and "safe" not in g   # " -- amina a" second head cut

def test_plain_ascii_stem_after_arabic_head_stripped():
    g = select_gloss([(1, RABB)])
    assert g.startswith("be master")    # "رب rabba u (rabb) to" all stripped

def test_unbalanced_paren_does_not_swallow_gloss():
    g = select_gloss([(1, UNBAL)])
    assert g is not None and "cut off" in g   # guard, not a silent quarantine

def test_nominal_head_and_broken_plural_stripped():
    g = select_gloss([(0, RABB_N)], prefer_nominal=True)
    assert g.startswith("lord")   # "رب rabb pl. ارباب arbāb" all stripped
    assert not _has_arabic(g)

def test_comma_attached_grammar_marker_stripped():
    g = select_gloss([(0, UMM_N)], prefer_nominal=True)
    assert g.startswith("mother")   # "ام f., pl. امهات ummahāt" all stripped
    assert not _has_arabic(g)
