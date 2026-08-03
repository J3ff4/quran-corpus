from scraper.lane_gloss import entry_blocks, extract_gloss

# Synthetic TEI, shaped after _S0.xml. Real volumes stay out of the repo (§9).
SIMPLE = (
    '<div2 n="Sbg" type="root"><entryFree id="n1"><form><orth lang="ar">Sabag</orth>'
    '</form> (S, A, K,) <hi rend="ital">He dyed it;</hi> or <hi rend="ital">'
    "coloured it.</hi> (Msb.)</entryFree></div2>"
)
PREAMBLE = (
    '<div2 n="Sxr" type="root"><entryFree id="n2"><form><orth lang="ar">SaxorN</orth>'
    "</form> (S, K,) the latter on the authority of Yaakoob, (S,) thus sometimes "
    'pronounced, (Msb,) <hi rend="ital">Rocks;</hi> or <hi rend="ital">'
    "great masses of stone.</hi></entryFree></div2>"
)
FORM_TWO_FIRST = (
    '<div2 n="Sxr" type="root">'
    '<entryFree id="n3"><form><itype>2</itype><orth lang="ar">taSoxiyrN</orth></form>'
    ' <hi rend="ital">The making subservient.</hi></entryFree>'
    '<entryFree id="n4"><form><orth lang="ar">SaxorN</orth></form>'
    ' <hi rend="ital">Rocks.</hi></entryFree></div2>'
)
APPARATUS_ONLY = (
    '<div2 n="Sxx" type="root"><entryFree id="n5"><form><itype>2</itype>'
    '<orth lang="ar">taSoxiyxN</orth></form> <hi rend="ital">q. v.</hi> (K.)'
    "</entryFree></div2>"
)
DANGLING = (
    '<div2 n="Sdq" type="root"><entryFree id="n6"><form><orth lang="ar">Sadaq</orth>'
    '</form> <hi rend="ital">He spoke truth;</hi> <hi rend="ital">contr. of</hi>'
    ' <foreign lang="ar">ka*ab</foreign>.</entryFree></div2>'
)
# Shaped after the real _S0.xml markup for SlH/Sdq: the apparatus token is
# fused onto the tail of a larger italic run, not isolated in its own <hi>.
DANGLING_TAIL = (
    '<div2 n="SlH" type="root"><entryFree id="n7"><form><orth lang="ar">SalaH</orth>'
    '</form> <hi rend="ital" TEIform="hi">it, throve; contr. of</hi>'
    '<foreign lang="ar" TEIform="foreign">fsd</foreign></entryFree></div2>'
)


# `i. q.` (idem quod) is the corpus's single most frequent standalone italic
# run -- 3291 occurrences against one for the mis-typed `i, q.`. Verbatim shape
# from h0.xml's hdy, content trimmed.
IDEM_QUOD = (
    '<div2 n="hdy" type="root"><entryFree id="n8"><form><orth lang="ar">hadaY</orth>'
    '</form> <hi rend="ital">He sent the bride</hi> (MA,) <hi rend="ital">i. q.</hi>'
    ' <foreign lang="ar">zf</foreign></entryFree></div2>'
)
SYN_WITH = (
    '<div2 n="Sbr" type="root"><entryFree id="n9"><form><orth lang="ar">Sabar</orth>'
    '</form> <hi rend="ital">He was patient;</hi> <hi rend="ital">syn. with</hi>'
    ' <foreign lang="ar">Hbs</foreign></entryFree></div2>'
)
ETC_COLON = (
    '<div2 n="Sfw" type="root"><entryFree id="n10"><form><orth lang="ar">Safw</orth>'
    '</form> <hi rend="ital">It was clear;</hi> <hi rend="ital">&amp;c.:</hi>'
    " (TA.)</entryFree></div2>"
)
# `―` opens the next sub-sense; Lane's own boundary, 41916 of them corpus-wide.
SUB_SENSE = (
    '<div2 n="bSr" type="root"><entryFree id="n11"><form><orth lang="ar">baSur</orth>'
    '</form> <hi rend="ital">He saw;</hi> or <hi rend="ital">he became seeing.</hi>'
    ' (K.) ―  -b2-  And <hi rend="ital">He knew, understood.</hi>'
    "</entryFree></div2>"
)


# Shaped after h0/n0's نطق: the form-I definition sits entirely after the first
# `―`, and an unrelated later block glosses the noun "bar (of a door)". Cutting
# at `―` empties the preferred block, so the later one used to win.
DEFINITION_AFTER_SUB_SENSE = (
    '<div2 n="nTq" type="root">'
    '<entryFree id="n12"><form><itype>1</itype><orth lang="ar">naTaq</orth></form>'
    ' (S, K,) said of a speaker. ―  -b2-  <hi rend="ital">he pronounced it, or'
    ' articulated it.</hi> (M.)</entryFree>'
    '<entryFree id="n13"><form><orth lang="ar">niTaAqN</orth></form> The'
    ' <hi rend="ital">bar</hi> of a door.</entryFree></div2>'
)


def test_entry_blocks_reports_the_verb_form():
    assert [f for f, _ in entry_blocks(FORM_TWO_FIRST)] == [2, 0]


def test_extract_gloss_reads_the_italic_runs():
    assert extract_gloss(SIMPLE) == "He dyed it; or coloured it"


def test_extract_gloss_drops_a_roman_authority_preamble():
    # The preamble is roman, so italic-only selection excludes it structurally.
    assert extract_gloss(PREAMBLE) == "Rocks; or great masses of stone"


def test_extract_gloss_prefers_form_one_over_an_earlier_form_two():
    assert extract_gloss(FORM_TWO_FIRST) == "Rocks"


def test_extract_gloss_drops_apparatus_only_italics():
    assert extract_gloss(APPARATUS_ONLY) == ""


def test_extract_gloss_drops_a_dangling_cross_reference():
    assert extract_gloss(DANGLING) == "He spoke truth"


def test_extract_gloss_drops_a_dangling_apparatus_tail():
    assert extract_gloss(DANGLING_TAIL) == "it, throve"


def test_extract_gloss_drops_an_idem_quod_siglum():
    assert extract_gloss(IDEM_QUOD) == "He sent the bride"


def test_extract_gloss_drops_a_synonym_siglum():
    assert extract_gloss(SYN_WITH) == "He was patient"


def test_extract_gloss_drops_an_et_cetera_siglum():
    assert extract_gloss(ETC_COLON) == "It was clear"


def test_extract_gloss_stops_at_the_first_sub_sense():
    assert extract_gloss(SUB_SENSE) == "He saw; or he became seeing"


def test_extract_gloss_keeps_the_block_whose_definition_follows_a_sub_sense():
    # Cutting must shorten a gloss, never change which entry it comes from:
    # 3574 bodies open with the `―` before their first italic run.
    assert extract_gloss(DEFINITION_AFTER_SUB_SENSE) == (
        "he pronounced it, or articulated it"
    )


def test_extract_gloss_stops_at_the_sub_sense_after_the_one_it_fell_through():
    # Falling back to the whole body kept the right block but re-collected every
    # sense in it -- صفر came out "His eye had what is termed a He had upon his
    # eye what is termed a He attained…". Only the next sub-sense is the gloss.
    entry = (
        '<div2 n="Zfr" type="root">'
        '<entryFree id="n1"><form><itype>1</itype><orth lang="ar">Zafir</orth></form>'
        " (S, K,) said of a man. ―  -b2-  <hi rend=\"ital\">His eye had a"
        ' pterygium.</hi> ―  -b3-  <hi rend="ital">He attained his wish.</hi>'
        "</entryFree></div2>"
    )
    assert extract_gloss(entry) == "His eye had a pterygium"


def test_extract_gloss_marks_the_seam_where_roman_prose_was_dropped():
    # Shaped after سلل: Lane's own ":" separating the two clauses lives in the
    # roman run, so joining bare read "...out or forth he pulled out the thing".
    entry = (
        '<div2 n="sll" type="root"><entryFree><form><orth lang="ar">sal~</orth>'
        '</form> <hi rend="ital">He drew the thing out or forth</hi>'
        ', inf. n. <foreign lang="ar">sl</foreign>: <hi rend="ital">he pulled out'
        " the thing.</hi></entryFree></div2>"
    )
    assert extract_gloss(entry) == (
        "He drew the thing out or forth; he pulled out the thing"
    )


def test_extract_gloss_does_not_double_punctuation_at_a_seam():
    # أذن's clause already ends in ":", which a bare separator turned into ":;".
    entry = (
        '<div2 n="A*n" type="root"><entryFree><form><orth lang="ar">A*in</orth>'
        '</form> <hi rend="ital">He listened to it, or him:</hi> and so, says'
        ' Er-Rághib, <hi rend="ital">he obeyed.</hi></entryFree></div2>'
    )
    assert extract_gloss(entry) == "He listened to it, or him: he obeyed"


def test_extract_gloss_trims_a_gloss_left_ending_on_a_function_word():
    # The last italic run stops at a roman <foreign> object, so حصد shipped as
    # "He reaped, or cut with the". Trimming "the" exposes "with" behind it, and
    # the walk stops at the verb -- it strips the dangling tail, not the sense.
    entry = (
        '<div2 n="HSd" type="root"><entryFree><form><orth lang="ar">HaSad</orth>'
        '</form> <hi rend="ital">He reaped, or cut with the</hi>'
        ' <foreign lang="ar">mnjl</foreign>.</entryFree></div2>'
    )
    assert extract_gloss(entry) == "He reaped, or cut"


def test_extract_gloss_trims_a_function_word_at_a_seam_not_only_at_the_tail():
    # Shaped after نهر: the dropped roman prose took the object of the first
    # italic run with it, so the seam landed behind the article -- "made for
    # itself a; channel like that of a river". 20 imported rows read this way.
    entry = (
        '<div2 n="nhr" type="root"><entryFree><form><orth lang="ar">nahar</orth>'
        '</form> <hi rend="ital">It made for itself a</hi> <foreign lang="ar">'
        'nhr</foreign>, i.e. <hi rend="ital">channel like that of a river.</hi>'
        "</entryFree></div2>"
    )
    assert extract_gloss(entry) == "It made for itself; channel like that of a river"


def test_extract_gloss_drops_a_run_left_holding_only_function_words():
    # قصص's second italic run is "with the" entire, so trimming the article
    # strands "with;" mid-gloss. Dropping the run exposes the one before it,
    # which then needs the seam it never got.
    entry = (
        '<div2 n="qSS" type="root"><entryFree><form><orth lang="ar">qaS~</orth>'
        '</form> <hi rend="ital">He cut it</hi> (S,) <hi rend="ital">with the</hi>'
        ' <foreign lang="ar">mqS</foreign>. <hi rend="ital">I pared the nail.</hi>'
        "</entryFree></div2>"
    )
    assert extract_gloss(entry) == "He cut it; I pared the nail"


def test_extract_gloss_drops_apparatus_carrying_its_article():
    # طيب's run is "It was, or became, the contr. of": apparatus back to "the",
    # which neither _NOISE nor _NOISE_TAIL matched, so it kept the siglum and
    # then grew a `;` behind it -- "It was, or became, the contr. of; in two…".
    entry = (
        '<div2 n="Tyb" type="root"><entryFree><form><orth lang="ar">TAb</orth>'
        '</form> <hi rend="ital">It was, or became, the contr. of</hi>'
        ' <foreign lang="ar">xbv</foreign>: <hi rend="ital">it was good.</hi>'
        "</entryFree></div2>"
    )
    assert extract_gloss(entry) == "It was, or became; it was good"


def test_extract_gloss_drops_an_articled_apparatus_run_of_its_own():
    entry = (
        '<div2 n="x" type="root"><entryFree><form><orth lang="ar">x</orth></form>'
        ' <hi rend="ital">He folded it.</hi> <hi rend="ital">the contr. of</hi>'
        ' <foreign lang="ar">n$r</foreign>.</entryFree></div2>'
    )
    assert extract_gloss(entry) == "He folded it"


def test_extract_gloss_drops_a_bracket_whose_partner_was_roman():
    # Lane's editorial brackets straddle the italic/roman boundary: أذن opened
    # "He [gave ear" in italic and closed the bracket in the dropped roman text.
    entry = (
        '<div2 n="A*n" type="root"><entryFree><form><orth lang="ar">A*in</orth>'
        '</form> <hi rend="ital">He [gave ear</hi> to it] , <hi rend="ital">'
        "listened.</hi></entryFree></div2>"
    )
    assert extract_gloss(entry) == "He gave ear; listened"


def test_extract_gloss_keeps_brackets_that_balance():
    entry = (
        '<div2 n="x" type="root"><entryFree><form><orth lang="ar">x</orth></form>'
        ' <hi rend="ital">He listened [to a prophet].</hi></entryFree></div2>'
    )
    assert extract_gloss(entry) == "He listened [to a prophet]"


def test_extract_gloss_truncates_on_a_word_boundary():
    long_entry = (
        '<div2 n="x" type="root"><entryFree><form><orth lang="ar">x</orth></form> '
        '<hi rend="ital">' + "word " * 100 + "</hi></entryFree></div2>"
    )
    out = extract_gloss(long_entry, max_len=40)
    assert len(out) <= 41 and out.endswith("…") and "wor…" not in out


def test_extract_gloss_cuts_hard_when_the_window_holds_no_word_boundary():
    # The word-boundary test above always finds a space, so it never reaches
    # this branch whatever it does. Unreachable with real Lane text (the longest
    # token is 24 chars) -- asserted so the docstring stays honest.
    long_entry = (
        '<div2 n="x" type="root"><entryFree><form><orth lang="ar">x</orth></form> '
        '<hi rend="ital">' + "w" * 100 + "</hi></entryFree></div2>"
    )
    assert extract_gloss(long_entry, max_len=40) == "w" * 40 + "…"


def test_extract_gloss_reads_a_connective_through_a_straddling_bracket():
    # Shaped after أتى. Lane's editorial bracket opens in the roman half, so the
    # `between` is `[or` -- the anchored _CONNECTIVE misses it and the seam
    # branch fires mid-clause instead: "He; it; came;". 51 imported rows.
    entry = (
        '<div2 n="Aty" type="root"><entryFree><form><orth lang="ar">A^ataY</orth>'
        '</form> <hi rend="ital">He</hi> [or <hi rend="ital">it</hi>] '
        '<hi rend="ital">came;</hi></entryFree></div2>'
    )
    assert extract_gloss(entry) == "He or it came"


def test_extract_gloss_does_not_seam_on_a_bracket_only_gap():
    # Shaped after بين: `(` and `)` alone between three runs. A bare bracket is
    # not prose, so it must not buy a `;` -- "It; a thing; became separated".
    entry = (
        '<div2 n="byn" type="root"><entryFree><form><orth lang="ar">baAna</orth>'
        '</form> <hi rend="ital">It</hi> (<hi rend="ital">a thing</hi>) '
        '<hi rend="ital">became separated.</hi></entryFree></div2>'
    )
    assert extract_gloss(entry) == "It a thing became separated"


def test_entry_blocks_does_not_read_a_quadriliteral_as_form_one():
    # `Q. 1`, `R. Q. 1` &c. hold spaces, so a whitespace-free <itype> pattern
    # missed them and they fell to 0 -- form I's own priority bucket. ترق then
    # glossed its `Q. Q. 1` block ("I hit, or hurt") over the collar-bone entry.
    quad = '<entryFree><form><itype>Q. Q. 1</itype></form><hi rend="ital">a</hi>'
    assert entry_blocks(quad + "</entryFree>") == [(-1, quad[len("<entryFree>") :])]
    plain = '<entryFree><form><itype>1</itype></form><hi rend="ital">a</hi>'
    assert entry_blocks(plain + "</entryFree>")[0][0] == 1
    assert entry_blocks('<entryFree><hi rend="ital">a</hi></entryFree>')[0][0] == 0


def test_extract_gloss_prefers_a_nounal_block_over_a_quadriliteral_one():
    entry = (
        '<div2 n="trq" type="root">'
        "<entryFree><form><itype>Q. Q. 1</itype></form> "
        '<hi rend="ital">I hit, or hurt.</hi></entryFree>'
        '<entryFree><form><orth lang="ar">traAqiy</orth></form> '
        '<hi rend="ital">collar-bone.</hi></entryFree></div2>'
    )
    assert extract_gloss(entry) == "collar-bone"


def test_extract_gloss_keeps_the_seam_behind_a_dropped_apparatus_run():
    # `q. v.` is dropped as apparatus, but the roman ":" before it is still the
    # seam between the two definitions -- advancing past it fused them into
    # "He dyed it He coloured it".
    entry = (
        '<div2 n="Sbg" type="root"><entryFree>'
        '<hi rend="ital">He dyed it</hi>: <hi rend="ital">q. v.</hi>'
        '<hi rend="ital">He coloured it.</hi></entryFree></div2>'
    )
    assert extract_gloss(entry) == "He dyed it; He coloured it"


def test_entry_blocks_treats_a_non_decimal_digit_as_no_plain_form():
    # "²".isdigit() is True but int("²") raises, so an <itype> carrying one
    # would abort the whole index build rather than fall through to -1. The
    # volumes are fetched at runtime, so this is a parse boundary.
    odd = '<entryFree><form><itype>²</itype></form><hi rend="ital">a</hi>'
    assert entry_blocks(odd + "</entryFree>")[0][0] == -1
