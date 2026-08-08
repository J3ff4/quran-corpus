"""Pick a short English gloss out of a Hans Wehr dictionary entry.

Hans Wehr entries open with the Arabic headword, its transliteration, and (for
verbs) the Form-I imperfect-vowel marker (``a``/``i``/``u``) or a verbal-noun
parenthetical, before the first English gloss. A ``<b>``-tagged block after
that is a derived form (II, III, ...) and a ``│`` introduces an idiom or
example -- neither belongs in a short, Form-I/noun-head gloss, so both are cut
before the leading-token strip runs.

Tag-strip / entity-unescape / whitespace-collapse below is the same ordering
`salmone_gloss.entry_senses` and `lane_gloss` use -- each of those three
modules keeps its own copy of the (two-line, stdlib-only) regex constants
rather than importing a sibling's private names, and this follows suit.
"""

from __future__ import annotations

import html
import re
import unicodedata

__all__ = ["MAX_GLOSS_CHARS", "select_gloss"]

# Length cap for a generated gloss. Exported because `audit_hanswehr_glosses`
# classifies against it: a second copy there would let the two drift apart
# silently, and its `long` bucket would stop describing this cap. That module
# is no longer the gate -- `hanswehr_baseline` is -- but the bucket it feeds
# into the baseline still has to mean what this constant says.
MAX_GLOSS_CHARS = 150

_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")

# The Arabic block, as a character-class body so the regexes below share one
# definition of "Arabic script" instead of four copies of the range.
_AR = "؀-ۿ"

# Punctuation HW hangs off a head token ("‘anida u i,", "زرق zarq:"). Stripped
# before every head test -- a colon left attached made the token non-alphabetic,
# so the head survived into the gloss and the real text was cut away with the
# Arabic that followed it.
_TRAILING = ",;:"

# Hamza / ‘ain in a transliteration ("ra’s", "na‘ima") -- and, written with the
# same U+2019, the English apostrophe. Removed before any letters-only test so
# the two are not told apart by a character they share.
_HAMZA_STRIP = str.maketrans("", "", "’‘'")

# Typographic punctuation an English word can carry -- curly double quotes, en/em
# dashes, ellipsis. Unlike U+2019/U+2018 above, none of these ever spells Arabic,
# so they must not make a token read as transliteration.
_TYPOGRAPHIC_STRIP = str.maketrans("", "", "“”—–…")

_HAS_ARABIC = re.compile(rf"[{_AR}]")
# A parenthetical holding any Arabic-script char is an object/preposition
# marker ("(هـ s.th.)", "(ب of)") or a verbal-noun spelling ("(ربابة ribāba)"),
# never part of the concise English gloss -- drop the whole group.
_ARABIC_PAREN = re.compile(rf"\([^)]*[{_AR}][^)]*\)")
# Past the head, a surviving Arabic char opens an idiom or sub-entry ("...;
# ب اتى to bring...") -- everything from it on is out of scope for a concise
# gloss. Runs AFTER _strip_head, which removes the leading Arabic headword and
# its "and"-joined variant spellings; running it first would cut a gloss down
# to its own transliterated head.
_ARABIC_TAIL = re.compile(rf"[{_AR}].*$", re.DOTALL)
# " ," / " ;" left behind after a mid-sentence paren is dropped. ":" and "." are
# in the class for the same reason and were missed: every surrounding strip uses
# " ,;:", so an orphaned colon survived to the end of a gloss while an orphaned
# comma did not ("scorn, disdain (هـ s.th.): to deny" shipped "disdain : to
# deny"), and a period orphaned the same way is stripped nowhere at all ("$gl"
# shipped "alienate ."). 13 roots carried one, 9 colon and 4 period. A lone ":"
# token also split the head run, so `bxE` opened its gloss on the punctuation.
#
# The period alone carries a lookahead, because unlike the other three it has
# two live shapes that are not orphans: HW's spaced ellipsis ("possibly ...",
# 4 roots) and an OCR period standing in for a word's first letter ("to .xpeat"
# in `rjw`, "a .hare" in `qsm`). Pulling either onto the word before it makes
# the text worse -- measured, 6 roots -- so the period is dropped only when
# nothing follows it.
_DANGLING_PUNCT = re.compile(r"\s+([,;:]|\.(?![.\w]))")

# Hans Wehr's Form-I imperfect-vowel markers ("kataba u", "daraba i"). Bare
# ASCII letters, so the non-ASCII/combining-mark check below does not catch
# them on its own.
_VOWEL_MARKER = frozenset("aiu")

# A derived-form numeral ("II,", "VIII") surviving a cut <b> block. Uppercase
# only, so no English gloss word matches.
_ROMAN = re.compile(r"^[IVX]{1,5}[.,;]?$")

# HW's homograph index, written onto the transliteration ("awwal2", "darāhim2").
# Never gloss text. Diacritic-free spellings only: ``\w`` excludes U+2019, so a
# hamza-bearing index ("ra’s1") never matches here -- it does not need to, since
# the hamza already makes `_is_transliteration` true. Widening the class to
# admit it was tried and no test or root could tell the difference.
_HOMOGRAPH = re.compile(r"^[^\W\d_]+\d[,;:]?$")

# The same homograph index, set as its own token ("رفارف rafārif 2 cushion").
# `_PAGE_NUMBER` cannot take it -- that one is bounded to 2-4 digits so a real
# quantity survives -- and a bare single digit is never the first word of an
# English definition, so it is only ever head leftovers here.
_BARE_INDEX = re.compile(r"^\d[,;:]?$")

# HW inlines its own page numbers mid-definition ("mountain 571", "to 632
# renege one's faith"). A bare 2-4 digit token is one of those.
# The trailing lookahead accepts punctuation: HW writes them mid-sentence ("to
# get a taste 315, experience"), and a whitespace-only boundary skipped every
# one that carried a comma.
# The comma is qualified with `(?!\d)` because HW does *not* spell every
# quantity out -- "(formerly = 10,000 dirhams)" is a real gloss, and an
# unqualified comma matched its "10" (space on the left, comma on the right)
# while the leading `\s` skipped its "000", shipping "= ,000 dirhams". A
# comma-grouped number is one token, so neither half is a page number.
_PAGE_NUMBER = re.compile(r"(?:^|\s)\d{2,4}(?=[\s;:.]|,(?!\d)|$)")

# HW's cross-reference to another headword ("see 2 شف", "see شعل"). The digit
# or Arabic lookahead is what keeps the English verb ("to see, behold") out --
# dropping it truncates `$hd` at "to experience personally" and `Tlb` at "get on
# one's way, go to", both of which reach a real "see".
#
# "see also" is the third spelling and needs no lookahead: it is only ever a
# cross-reference, never a sense. HW's object for it is an Arabic headword, so
# `_ARABIC_TAIL` had already cut the referent away and left the phrase dangling
# -- `bAr` shipped "reverent, faithful and devoted; see also under" and `klA`
# "both (of); see also alphabetically".
#
# " = " is deliberately NOT a cut point. It reads like the same thing ("فوم fūm
# = ثوم tūm"), but in this text it is overwhelmingly mid-sense English -- "to
# fall (also = to be killed in action)", "dirhem (Ir. = coin of 50 فلس)" -- and
# cutting on it truncated those entries at the "=". Anchoring it to a following
# Arabic headword was tried and changes nothing on any of the 1548 roots: the
# genuine redirects are already handled downstream, by the Arabic-tail cut and
# then `_quarantine`. So the cut point would be dead code.
_XREF = re.compile(rf"\bsee\s+(?:also\b|(?=\d|[{_AR}]))")

# A second Form-I headword opened mid-entry. HW writes the separator four ways
# -- " -- ", "--(", " – " and " ― " -- so matching the first spelling alone
# leaked a whole second headword, its transliteration and vowel markers into the
# first gloss ("...; -- to travel", "...; ― i u to roam", "...; – fasaḥa a").
# The optional number is HW's page break, which it sets between the two.
#
# Anchored on the preceding ";" because an entry may also *open* with a dash,
# joining two spellings of one headword ("آلو - الا alā u to neglect"). There
# the gloss lives past the dash, `_gloss_start` already walks it, and cutting
# would leave nothing at all.
#
# Carries no paren-depth guard, unlike `_dash_cut`, and that asymmetry is
# measured rather than overlooked. Synthetically the hole is real -- a ";" then
# a placeholder dash *inside* a grammar parenthesis ("to fasten (ب s.th.; --
# الى s.th.) to tie, attach") truncates the entry to its first sense. Live it
# is empty: across all 1642 targets exactly 2 entries put this match at a
# non-zero depth, `Ewd` ("; -- u (عيادة ‘iyāda) to visit") and `wjf` ("; --
# (wajīf) to throb, beat"), and both are genuine second headwords that read as
# nested only because an earlier bracket was never closed -- `wjf` opens
# "(wajf, وجوف wujūf, وجيف" and stops. Adding the guard therefore fixes nothing
# and regresses those two, which is the exact shape `_dash_cut`'s docstring
# leaves to this pattern: "a comma-anchored second headword behind an unclosed
# bracket". Revisit only if a balanced-paren placeholder ever appears live.
_SECOND_HEAD = re.compile(r";\s*(?:\d{2,4}\s+)?(--+|[–—―])")


def _dash_cut(text: str) -> int:
    """Index of the first `" -- "` that opens a second headword, or -1.

    HW writes `--` two ways. Between senses it opens a second Form-I headword
    ("to decree, ordain, decide (هـ s.th.; of God) -- qadara i ..."), which is
    a cut point. *Inside* a grammar parenthesis it is an em-dash standing in
    for the headword itself ("to transform (من – الى ه s.o. from -- into)"),
    which is not -- cutting there deletes every following sense, and
    `_balance_parens` then eats the orphaned "(" so nothing marks the wound:
    `msx` shipped "transform" for a four-sense entry, `nsf` lost "to blow up,
    blast".

    Paren depth separates the two on all eight live entries: the placeholder is
    always inside the parenthesis it belongs to, the second headword never is.

    `_SECOND_HEAD` above does not make this redundant. It anchors on a
    preceding ";", and a second head may open on a comma instead ("wild,
    untamed (animal), -- (pl. وحوش wuḥūš) wild animal") -- dropping this cut
    and leaning on that pattern alone was measured and loses `qdr`, `$ry`,
    `h$$` and `wH$`.

    The clamp is deliberately one-sided, and the asymmetry has been measured
    rather than assumed. An unclosed "(" -- OCR drops those too -- leaves the
    depth above zero for the rest of the entry and refuses every later cut; 17
    entries carry a " -- " this function declines, and in all of them the dash
    is the placeholder *inside* its parenthesis ("بين -- وبين between -- and"),
    which is the case that must not be cut. Making the depth recover at a sense
    boundary looks like the fix and is a regression: HW does put a ";" inside a
    parenthesis ("(a relation بين – و between -- and); to bring into relation"),
    and `wSl` loses its third sense to it. Skipping a "(" that is never closed
    is correct and changes nothing -- all 1642 baseline rows byte-identical --
    so the pre-pass it needs is not carried. Revisit only if a comma-anchored
    second headword ever appears behind an unclosed bracket, which is the one
    shape `_SECOND_HEAD` would not catch.
    """
    depth = 0
    for i, ch in enumerate(text):
        if ch == "(":
            depth += 1
        elif ch == ")":
            # OCR drops brackets, so clamp: one stray ")" must not push the
            # depth negative and disable every cut in the rest of the entry.
            depth = max(0, depth - 1)
        elif ch == " " and depth == 0 and text.startswith(" -- ", i):
            return i
    return -1


_AFTER_MARKER = frozenset(
    {"to", "and", "with", "of", "from", "in", "on", "by", "for", "against"}
)


def _is_transliteration(tok: str) -> bool:
    """True for Arabic script or a diacritic transliteration token.

    Hamza and ‘ain (U+2019/U+2018) count as evidence even though English shares
    U+2019 as its apostrophe. Excluding them was measured and is far worse: HW
    heads them constantly ("‘ajz weakness", "ba‘l the god Baal", "su‘ida to be
    happy"), and about 50 roots regained a transliterated head that way against
    3 that gained a possessive. `_is_possessive` handles those 3 instead.
    """
    # Non-ASCII is evidence only when it is *script* -- Arabic, or a diacritic.
    # English carrying typographic punctuation is not: `_strip_tail` pops from
    # the end while this is true, and "kwn" ends its entry in real English
    # quoted with U+201C ("to Engl. “used to ...”"), which this called head.
    # Live it is masked by the sense cap; a shorter entry would lose the word.
    # U+2019/U+2018 stay in, deliberately -- see the docstring above.
    if not tok.translate(_TYPOGRAPHIC_STRIP).isascii():
        return True
    # HW transliterates the definite article with a hyphen ("z. al-ibar
    # injections"). No English gloss word opens "al-", and a diacritic-free
    # one ("al-ibar") is invisible to the combining-mark test below.
    if tok.lower().startswith("al-"):
        return True
    return any(unicodedata.combining(ch) for ch in unicodedata.normalize("NFD", tok))


def _is_possessive(tok: str) -> bool:
    """True for an English possessive ("potter’s"), which `_is_transliteration`
    cannot tell from a hamza on U+2019.

    Only used as *lookahead* evidence, never to classify a token directly: a
    real transliteration ending in hamza-s ("ra’s") still has to read as head
    when it is one, and it is `_gloss_start`'s own branch that decides that.
    """
    word = tok.rstrip(_TRAILING).rstrip(".")
    stem, sep, suffix = word.rpartition("’")
    return bool(sep) and suffix == "s" and stem.isascii() and stem.isalpha()


def _is_vowel_marker(tok: str) -> bool:
    """True for a Form-I imperfect-vowel marker, comma/semicolon tolerant.

    HW punctuates a marker run inline ("‘anida u i, ‘anida a"), so the bare
    membership test missed every marker carrying a trailing comma and left the
    whole head in the gloss.
    """
    return tok.rstrip(_TRAILING) in _VOWEL_MARKER


def _head_word(tok: str) -> str | None:
    """`tok` minus inline punctuation, or None when a ";" ended it.

    HW separates senses with ";", so a token carrying one is the last word of a
    sense and can never be head material. Stripping it as ordinary punctuation
    is what let "day;" read as a stem and "trunk.;" as a grammar note, deleting
    the primary sense of `ywm`, `xmr`, `Hlm` and `j*E` -- the head run walked
    straight through the sense boundary and took the gloss's first meaning with
    it. Comma and colon stay strippable: those do punctuate head runs inline
    ("‘anida u i, ‘anida a", "f.,").
    """
    word = tok.rstrip(_TRAILING)
    return None if ";" in tok[len(word) :] else word


def _is_abbrev(tok: str) -> bool:
    """True for a grammar note like ``pl.`` (plural) or ``f.,`` (feminine).

    HW punctuates these inline, so a trailing comma/colon is stripped before
    the test -- "f.," is still the feminine marker, not gloss text.

    The body is alphanumeric rather than alphabetic because this text is OCR:
    "حوش ḥauš p1. احواش aḥwāš enclosure" reads ``pl.`` as ``p1.``, and a
    plural marker mistaken for gloss text costs the whole entry. The first
    character must still be a letter, so a page number ("571.") is not one.
    """
    word = _head_word(tok)
    if word is None:
        return False
    return (
        word.isascii()
        and word.endswith(".")
        and word[:1].isalpha()
        and word[:-1].isalnum()
    )


def _skeleton(word: str) -> str:
    """`word` reduced to its consonants, diacritics folded away.

    "ufuq" and "ufq" both give "fq" -- HW's spelling variants of one headword
    differ only in vowels, which is precisely the Arabic root the entry is
    filed under.
    """
    plain = unicodedata.normalize("NFD", word.translate(_HAMZA_STRIP).lower())
    return "".join(
        ch
        for ch in plain
        if ch.isalpha() and not unicodedata.combining(ch) and ch not in "aeiou"
    )


def _same_skeleton(a: str, b: str) -> bool:
    """True when two tokens are vowel-variants of one headword, not two words.

    Empty skeletons are never equal to each other: an all-vowel token carries no
    evidence, and calling two of them variants would make "a, i" head material.
    """
    skel = _skeleton(a)
    return bool(skel) and skel == _skeleton(b)


# Buckwalter radical -> the letter `_skeleton` leaves behind for HW's spelling
# of it. Only the 28 letters occur in a root, so hamza seats and the diacritic
# half of the scheme are out of scope; `scraper.buckwalter` maps those and is
# not reused here because it targets Arabic script, not this transliteration.
#
# Every value was measured against the corpus rather than taken from the
# standard: this edition's OCR writes خ as "ḳ" ("خضد kaḍada"), which folds to
# "k", not the "h" or "kh" other Wehr printings use, and ج as plain "j". Both
# were checked by scoring all four combinations over the 1548 entries that
# carry a transliteration -- x->k with j->j matched 1124, the next best 1044.
# ع and the alef seats are dropped: `_HAMZA_STRIP` removes the ‘ain mark and a
# long alef surfaces as a vowel, so neither leaves a consonant to match.
_ROOT_RADICALS = {
    "A": "", "E": "", "Y": "",
    "b": "b", "d": "d", "f": "f", "g": "g", "h": "h", "j": "j", "k": "k",
    "l": "l", "m": "m", "n": "n", "p": "t", "q": "q", "r": "r", "s": "s",
    "t": "t", "w": "w", "y": "y", "z": "z",
    "$": "s", "*": "d", "v": "t", "x": "k",
    "D": "d", "H": "h", "S": "s", "T": "t", "Z": "z",
}  # fmt: skip

# و and ي are radicals in the root but long vowels in the transliteration, which
# `_skeleton` drops -- "hwn" is spelled "haun", "qwl" is "qāla". Comparing with
# them in place misses 349 of the 424 entries whose head this otherwise fails to
# recognise, so both sides are reduced to their strong consonants instead.
_WEAK_RADICALS = "wy"


def _root_skeleton(root: str) -> str:
    """A Buckwalter root reduced to the consonants HW's transliteration shows."""
    return "".join(_ROOT_RADICALS.get(ch, ch) for ch in root)


def _strong(skeleton: str) -> str:
    return "".join(ch for ch in skeleton if ch not in _WEAK_RADICALS)


def _collapse(skeleton: str) -> str:
    """A doubled consonant folded to one -- "mjss" -> "mjs", "hmm" -> "hm"."""
    return "".join(
        ch for i, ch in enumerate(skeleton) if i == 0 or skeleton[i - 1] != ch
    )


def _respells_root(tok: str, root_skeleton: str) -> bool:
    """True when `tok` is the root spelled out in Latin -- a headword, not gloss.

    This is the property `head != first` was standing in for and got wrong: the
    commonest leftover is the transliteration surviving verbatim, so a test
    keyed to string inequality excluded the whole population it was measuring.

    Gemination and nunation are folded away before the comparison, because the
    two sides spell neither the same way. A Buckwalter root writes a geminate
    radical twice (`hmm`, `sll`) where HW's transliteration may write it once
    ("hum", "sal"), and writes it once (`mjs`) where HW doubles it ("majass");
    HW also carries tanwīn into the transliteration ("qiran" for `qry`, "taran"
    for `vry`). Comparing the raw skeletons missed all of those -- 8 roots
    shipped their own headword as the first word of their definition, and the
    `head` bucket, which called this same function, read them as clean.

    Two strong consonants minimum, measured on the root *before* the fold. Below
    that the test stops being evidence and starts matching English on one letter
    -- `Awh` reduces to "h" and its own correct gloss is "oh!", which a
    one-consonant rule would delete outright. Measuring the floor after the fold
    instead is what a first attempt at this did, and it broke the geminate roots
    the fold exists for: `Aff` collapses to a single "f" and fell under the
    floor, so `afaf` came back as its own gloss.
    """
    strong = _strong(root_skeleton)
    if len(strong) < 2:
        return False
    root = _collapse(strong)
    spelled = _collapse(_strong(_skeleton(tok)))
    denunated = spelled[:-1] if len(spelled) > 1 and spelled.endswith("n") else spelled
    return root in (spelled, denunated)


def _is_verbal_noun(stem: str, tok: str) -> bool:
    """True for ``(jatt)`` right after the stem ``jatta`` -- its verbal noun.

    A parenthesis alone does not make the word before it head: "oil (edible,
    fuel...)", "tamarisk (bot.)" and "lank (hair)" are glosses whose first word
    happens to be parenthesised, and treating those as head loses the entry.
    HW's verbal noun always respells the stem, so a shared three-letter prefix
    separates the two cheaply -- or, when the stem is a passive and the vowels
    move ("pass. buhita (baht) to be astonished"), a shared consonant skeleton.
    The prefix test alone left `bht` shipping its own stem as gloss text.
    """
    if not tok.startswith("("):
        return False
    inner = tok[1:].rstrip(",;").rstrip(")")
    return len(inner) >= 3 and (inner[:3] == stem[:3] or _same_skeleton(inner, stem))


def _is_grammar_note(tok: str, nxt: str) -> bool:
    """True for an abbreviation used as *head evidence* -- ``pl.`` before a plural.

    `_is_abbrev` alone is not enough here. It has to accept an alphanumeric body
    because this is OCR ("p1." for "pl."), and that also accepts an English word
    carrying an OCR period: HW's `frE` reads "افرع afru‘ twig, branch. bough,
    limb", where "branch." passed as a grammar note and marked "twig," head, so
    the run ate the entry's primary sense.

    A real grammar note is followed by what it governs -- the plural spelling,
    another note, a vowel marker -- or by nothing, when the Arabic tail cut took
    its object away ("night; pl."). English prose follows it with English.

    "and" counts as another note: HW chains gender and number that way ("جند
    jund m. and f., pl. جنود junūd soldiers"), and without it here the head run
    stopped on the headword and the Arabic-tail cut took the definition with it
    (`jnd`, `bld`, `xmr`, `qws` all shipped their bare transliteration).
    """
    return _is_abbrev(tok) and (
        not nxt
        or nxt == "and"
        or _is_abbrev(nxt)
        or _is_transliteration(nxt)
        or _is_vowel_marker(nxt)
    )


def _is_stem(tok: str, nxt: str, nxt2: str, prev: str = "", prev2: str = "") -> bool:
    """True for a plain-ASCII head stem, judged from its immediate neighbours.

    HW spells the bare Arabic headword first ("رب rabba u ...", "رب rabb pl.
    ارباب arbāb lord"), and `_is_transliteration` misses a stem that happens to
    carry no diacritic. It is head when a grammar abbreviation, more
    transliteration or its own verbal-noun paren follows, or when a bare vowel
    marker follows that is itself confirmed by what comes after it.

    The evidence has to stay local: two tokens ahead, and -- only for the
    variant-pair rule below -- the one token behind. An earlier version asked
    instead whether *any* head material followed, which propagates head-ness
    leftward through real English -- it ate "lose" out of "lose one's way" and
    cost 169 glosses outright (`qwl`, `ktb`, `mwt`).

    Case is not part of the test: OCR capitalises inside the transliteration
    ("كلب Icalb pl. كلاب kilāb dog", "ضغث lIiM pl. اضغاث aḍgāt bunch"), and a
    head read as gloss text loses the entry to the Arabic-tail cut. What is
    followed by, never the token's own shape, is what decides.
    """
    word = _head_word(tok)
    if word is None or not word.translate(_HAMZA_STRIP).isalpha():
        return False
    if (
        _is_grammar_note(nxt, nxt2)
        or (_is_transliteration(nxt) and not _is_possessive(nxt))
        or _is_verbal_noun(word, nxt)
        # "yajifu (wajf, وجوف wujūf, وجيف to be agitated": a verbal-noun paren
        # HW never closed, so `_ARABIC_PAREN` could not remove it and
        # `_is_verbal_noun` cannot match it either -- it respells the perfect
        # while the stem before it is the imperfect. The Arabic inside is the
        # tell: a parenthesis holding Arabic script is always head material.
        or (nxt.startswith("(") and bool(_HAS_ARABIC.match(nxt2)))
    ):
        return True
    # "وجد wajada يجد yajidu to find", "زلزل zalzala to shake": a stem sitting
    # directly on the Arabic it spells, with the infinitive it governs after it.
    # Assimilated (w-initial) verbs and quadriliterals are the whole population
    # -- HW marks neither, so without this the imperfect ships as the first word
    # of its own definition ("yajidu to find"). The grammar paren counts as the
    # infinitive: `_gloss_start` resolves past a paren group, so "yaziru (wizr)
    # to take" lands on "to" either way.
    #
    # Both halves are required. Arabic alone is not enough -- HW runs straight
    # from the headword into English ("عز might, power") -- and "to" alone is
    # not either, since real prose reaches it ("lose one's way, to ...").
    if _HAS_ARABIC.search(prev) and (nxt == "to" or nxt.startswith("(")):
        return True
    # "نفس nafs f., pl. نفوس nufūs, انفس anfus soul": the plural transliteration,
    # diacritic-free so `_is_transliteration` cannot see it, sitting on the
    # Arabic it spells with plain English after it (`nfs`, `wld`, `qss`, `sqf`,
    # and six more shipped it as their first gloss word).
    #
    # `prev2` is what keeps this off "عز might, power": HW does run straight from
    # a headword into English, but only from the headword, which is the entry's
    # first token and so has nothing before it. An Arabic token with head
    # material already behind it is a variant or plural spelling mid-run, and
    # what sits on that is its transliteration.
    #
    # A grammar note behind the Arabic used to be excluded here, on the reading
    # that "pl." before Arabic is HW omitting the plural's transliteration so
    # the definition resumes on the Arabic itself ("سفح safḥ ... foot (of a
    # mountain); pl. سفوح flat, rocky surface"). Measured, that is not what
    # protects `sfH`: its gloss is byte-identical without the exclusion, because
    # the Arabic-tail cut removes that second sense long before this rule can
    # reach it. What the exclusion did cost is the very shape it was written to
    # keep -- "وكاء wikā’ pl. اوكية aukiya thong or string for tying up a
    # waterskin" is a plural transliteration HW *does* spell out, and `wkA`
    # shipped it as the first word of its own definition.
    if prev2 and _HAS_ARABIC.search(prev):
        return True
    # "ufq, ufuq pl. آفاق āfāq horizon": HW joins two spellings of one nominal
    # head with a comma, and neither carries a diacritic, so `_is_transliteration`
    # sees no head at all. Without this the run stops on the first spelling and
    # the Arabic-tail cut takes the English with it, shipping the headword back
    # as its own definition (`Afq`, `Enq`, `*qn`, and ten more).
    #
    # Sharing a consonant skeleton is what separates two spellings of one head
    # ("unuq, unq", "daqan, diqan") from two English senses ("lineage, descent",
    # "weeping, crying"): HW's variants differ only in their vowels, which is the
    # Arabic root the entry is filed under. Requiring head material after the
    # second spelling as well keeps a chance skeleton collision from eating real
    # prose, and keeps the lookahead local.
    #
    # The chain is read backwards as well as forwards: keyed only on `tok`
    # carrying the comma, the rule can mark a chain's non-final members and
    # never its last one, which has no comma and plain English after it. That
    # last spelling shipped as the first word of its own definition (`qll`,
    # `ybs`, `nsk`, `rjz`, and seven more), and in a three-member chain it
    # stranded the middle one too ("yabs, yubs, yabas dryness" -> "yubs, yabas
    # dryness"). Reading `prev` costs no extra lookahead: `_gloss_start` only
    # consults this along the chain that starts at token 0, so a `prev` that
    # reaches here is already head.
    prev_word = _head_word(prev)
    in_chain = bool(
        prev_word and "," in prev[len(prev_word) :] and _same_skeleton(word, prev_word)
    )
    if in_chain:
        return True
    if "," in tok[len(word) :] and nxt.rstrip(_TRAILING).isalpha():
        # Sitting directly on the Arabic it spells is evidence by itself, but
        # only for a matching skeleton: HW also runs straight from the headword
        # into English ("عز might, power, standing"), and treating that as a
        # variant pair deleted the first sense of `Ezz`, `fwz` and `sfH`.
        on_arabic = bool(_HAS_ARABIC.search(prev))
        if _same_skeleton(word, nxt.rstrip(_TRAILING)):
            return (
                on_arabic
                or _is_abbrev(nxt2)
                or _is_transliteration(nxt2)
                or _is_vowel_marker(nxt2)
                # A third spelling in the same chain ("kabid, kabd, kibd m.").
                or _same_skeleton(word, nxt2.rstrip(_TRAILING))
            )
        # Skeletons differ when HW pairs a perfect with an imperfect ("يهن
        # yahinu, wahuna يوهن"). Arabic on *both* sides is what still marks that
        # as head -- Arabic after the pair alone does not, because HW sets its
        # examples in Arabic mid-gloss too ("ancestor, forefather: يا ابت").
        if on_arabic and _HAS_ARABIC.match(nxt2):
            return True
    # "bass and بسة bassa pl. بساس bassās cat" -- a nominal head joined to its
    # Arabic variant spelling, or to a grammar note ("وذر only imperf. يذر
    # yadaru and imp. ذر dar to let, leave"). Prose puts an English word there.
    if nxt == "and" and (
        _is_transliteration(nxt2) or _is_vowel_marker(nxt2) or _is_abbrev(nxt2)
    ):
        return True
    return _is_vowel_marker(nxt) and (
        nxt != nxt.rstrip(_TRAILING)
        or not nxt2
        or nxt2.startswith("(")
        or nxt2 in _AFTER_MARKER
        or _is_vowel_marker(nxt2)
        or _is_transliteration(nxt2)
    )


def _gloss_start(tokens: list[str], root_skeleton: str = "") -> int:
    """Index of the first gloss token: the end of the leading head run.

    Scanned right to left so each token's answer is a lookup, not a re-walk;
    every rule below reads at most two tokens ahead of itself.

    `root_skeleton` is the entry's own root, from the corpus rather than from
    the text -- see the last branch. Optional so the rules that never needed it
    stay callable without one.
    """
    n = len(tokens)
    start = [0] * (n + 1)
    start[n] = n
    for i in range(n - 1, -1, -1):
        tok = tokens[i]
        nxt = tokens[i + 1] if i + 1 < n else ""
        nxt2 = tokens[i + 2] if i + 2 < n else ""
        nxt3 = tokens[i + 3] if i + 3 < n else ""
        prev = tokens[i - 1] if i else ""
        prev2 = tokens[i - 2] if i >= 2 else ""

        if tok in ("-", "--", "–", "—", "―"):
            # A bare dash separating two headwords in one entry ("آلو - الا alā
            # u to neglect"). Head, and the gloss lives past it.
            #
            # All four dash characters `_SECOND_HEAD` treats as one class are
            # listed, or the same separator is handled three ways: "―" would
            # reach here only because `_is_transliteration` happens to call it
            # transliteration, and "—" not at all -- it is in
            # `_TYPOGRAPHIC_STRIP`, so it fails that test, ends the head run,
            # and the entry is then lost whole to the Arabic-tail cut.
            start[i] = start[i + 1]
        elif tok.startswith("("):
            j = i
            # HW punctuates the closing paren inline ("(عنود ‘unūd), ‘anida"),
            # so a trailing comma/semicolon is ignored when looking for it --
            # otherwise the run reads as unbalanced and the whole head survives.
            while j < n and not tokens[j].rstrip(_TRAILING).endswith(")"):
                j += 1
            # Unbalanced "(" -- HW leaves these ("(jarḥ to wound"). Drop only
            # the opening token and keep walking: consuming to the end would
            # swallow an otherwise usable gloss, and stopping here would ship
            # the bare "(" fragment.
            start[i] = start[i + 1] if j == n else start[j + 1]
        elif _is_vowel_marker(tok):
            # "a"/"i"/"u" is a Form-I imperfect marker ("lāḥa u (lauḥ)") only
            # when followed by the verbal-noun paren, a word that cannot follow
            # an article ("‘aba’a a with negation"), another marker, or more
            # transliteration -- otherwise it is the English article ("a
            # thing"). Nothing after it ("ḥanaka i u," before a cut <b> block)
            # or punctuation on it ("u i,") also settles it as a marker: the
            # article is always the bare word.
            is_marker = (
                not nxt
                or tok != tok.rstrip(_TRAILING)
                or nxt in _AFTER_MARKER
                or nxt.startswith("(")
                or _is_vowel_marker(nxt)
                or _is_transliteration(nxt)
            )
            start[i] = start[i + 1] if is_marker else i
        elif _ROMAN.match(tok) or _HOMOGRAPH.match(tok) or _BARE_INDEX.match(tok):
            # A derived-form numeral left over from a cut <b> block ("زال (زيل)
            # and II, III") -- head, never gloss.
            start[i] = start[i + 1]
        elif tok == "and":
            # HW joins two spellings of one head with "and" ("na‘ima u a and
            # na‘ima a to live ..."). It is head only when head follows it --
            # otherwise it is real English ("comfort and luxury"), and eating it
            # would strip the gloss down to a conjunction. A trailing "and" with
            # nothing after it is a truncated head ("tajara u and"), never
            # prose. "and <stem> to ..." is the third shape: the Arabic paren
            # that would have marked the stem as head was already removed from
            # "marada u (مرود murūd) and maruda (مرادة marāda) to be
            # refractory", leaving the infinitive as its only tell.
            is_head = (
                not nxt
                or _is_transliteration(nxt)
                or _is_vowel_marker(nxt)
                or _is_abbrev(nxt)  # "rūḥ and f., pl. ارواح arwāḥ breath of life"
                or _ROMAN.match(nxt)  # "زال (زيل) and II, III" -- no Form I at all
                # "and (1st pers. perf. lajajtu) i to be stubborn": an "and"
                # followed by a parenthesis is always joining head variants --
                # prose puts a word there, not a bracket.
                or nxt.startswith("(")
                or _is_stem(nxt, nxt2, nxt3, tok, prev)
            )
            # "and zalla (1st pers. perf. zaliltu) a to slip" / "and maruda to
            # be refractory": a bare stem after the "and", told apart from prose
            # by its own parenthesis or the infinitive it opens. The stem is
            # head too, and `_is_stem` cannot see that from "to be" alone -- so
            # resolve past it here. Handing back `start[i + 1]` would land on
            # the stem and ship it ("maruda to be refractory").
            bare_stem = nxt.rstrip(_TRAILING).isalpha() and (
                nxt2 == "to" or nxt2.startswith("(")
            )
            if is_head:
                start[i] = start[i + 1]
            elif bare_stem:
                start[i] = start[i + 2] if i + 2 <= n else n
            else:
                start[i] = i
        # `_is_abbrev`, not `_is_grammar_note`, and the difference is a measured
        # trade rather than an oversight. The widened alnum body that lets OCR's
        # "p1." read as "pl." also accepts an English word carrying an OCR
        # period: `wH$` reads "وحش waḥš waste. deserted, lonely, ..." and loses
        # "waste." to this branch. Tightening to `_is_grammar_note` recovers
        # that one word and costs four entries -- it refuses "imperf.: to begin"
        # (`Tfq`), "perf. indicates" (`qdd`), "pass. buhita (baht)" (`bht`) and
        # drops `qws` to no_gloss, because a note is also followed by an
        # infinitive or a bare stem, which `_is_grammar_note` does not accept.
        # A closed vocabulary would separate them but re-opens the OCR variant
        # this exists for. `wH$` keeps a correct gloss missing one sense; the
        # four would lose theirs. Leaving it.
        elif _is_abbrev(tok) or (
            _is_transliteration(tok)
            # "ya’s" and "father’s" are the same shape, so position decides:
            # HW's transliteration always sits directly on the Arabic it
            # spells ("ياس ya’s renunciation"), and a possessive never does
            # ("a‘mām father’s brother", "clay, potter’s clay").
            and (not _is_possessive(tok) or _HAS_ARABIC.search(prev))
        ):
            start[i] = start[i + 1]
        else:
            # A stem is also head when the stem right after it is ("kamala,
            # kamula u and kamila a to be whole"), or when a grammar
            # parenthesis separates it from more head ("lajja (1st pers. perf.
            # lajijtu) a and ..."). Both lookaheads are bounded -- the paren one
            # asks only whether the run resumes after the closing token and
            # stops at the end of the entry, so a gloss whose own last word is
            # parenthesised ("oil (edible, fuel...)") keeps its first word.
            # The stem-after-stem lookahead is restricted to a following vowel
            # marker ("kamala, kamula u and kamila a to be whole"). Without that
            # restriction a gloss whose second word carries an abbreviation
            # ("numeral; number, No.") reads as head and the entry is lost.
            #
            # A token that respells the root, sitting on the Arabic it spells,
            # is head with no further evidence needed. This is the generalised
            # form of the rule below in `_is_stem` that asks for Arabic behind
            # plus "to"/"(" ahead: HW runs straight from the headword into
            # English often enough that the infinitive is not always there
            # ("قلب qalb reversal, inversion"), and 120 roots shipped their own
            # transliteration as the first word of their definition because of
            # it. The Arabic behind is what keeps this off `drhm`, whose real
            # gloss "dirhem, drachma" does respell the root -- there the
            # preceding token is the plural transliteration, not script.
            head = bool(
                (_HAS_ARABIC.search(prev) and _respells_root(tok, root_skeleton))
                or _is_stem(tok, nxt, nxt2, prev, prev2)
                or (_is_vowel_marker(nxt2) and _is_stem(nxt, nxt2, nxt3, tok, prev))
            )
            if not head and nxt.startswith("(") and tok.rstrip(_TRAILING).isalpha():
                j = i + 1
                while j < n and not tokens[j].rstrip(_TRAILING).endswith(")"):
                    j += 1
                # The run may not cross a sense boundary to find its resumption
                # -- the same rule `_head_word` applies. "safḥ pl. سفوح sufūḥ
                # foot (of a mountain); pl. سفوح flat, rocky surface" closes its
                # parenthesis on "mountain);" and resumes head on the *next*
                # sense's "pl.", which marked "foot" as head and deleted the
                # entry's primary sense.
                head = (
                    j < n
                    and j + 1 < n
                    and ";" not in " ".join(tokens[i : j + 1])
                    and start[j + 1] not in (j + 1, n)
                )
            start[i] = start[i + 1] if head else i
    return start[0]


def _strip_head(text: str, root_skeleton: str = "") -> str:
    """Drop the leading Arabic head, transliteration, and verbal-noun paren."""
    tokens = text.split()
    return " ".join(tokens[_gloss_start(tokens, root_skeleton) :])


def _strip_tail(text: str) -> str:
    """Drop head material left dangling at the end by the Arabic-tail cut.

    "ru’d soft, tender; ru’d and فتاة رؤد delicate young girl" cuts to "soft,
    tender; ru’d and": the second head variant opened just before the Arabic
    that got cut. So do a grammar abbreviation whose plural was Arabic ("night;
    pl."), a preposition whose object was ("do penance, with"), and a
    parenthesis whose whole content was ("palpate (").

    The abbreviation rule is the one that can shorten English, and the earlier
    claim here that it cannot was wrong. `_is_abbrev` accepts any ASCII word
    with an alphanumeric body ending in "." -- deliberately, so OCR's "p1." is
    still read as "pl." -- so a gloss whose last sense ends in a period loses
    its final word: `_strip_tail("to blow up, blast.")` gives "to blow up,".
    Latent, not live: all 19 tokens this rule deletes across the 1548 target
    roots are genuine markers (`pl.` x9, `pass.` x5, `pass.:`, `n.`, `un.`,
    `Engl.`), so narrowing it to a closed vocabulary would break 19 correct
    deletions to fix none, and would re-open the OCR variant it exists for.
    Revisit if a real word ever shows up in that list.

    A homograph index ("darāhim2") was in this list too and never once fired.
    It cannot: HW writes the index onto the transliteration, which is head
    material at the *front* of an entry, where `_gloss_start` already handles
    it, and no entry ends on one. Deleting the check leaves every one of the
    1642 baseline rows byte-identical.
    """
    tokens = text.split()
    while tokens:
        last = tokens[-1]
        if (
            last == "and"
            or _is_transliteration(last)
            or _is_vowel_marker(last)
            or _is_abbrev(last)
            or last.rstrip(_TRAILING) in _AFTER_MARKER
            or ("(" in last and ")" not in last)
        ):
            tokens.pop()
            continue
        break
    return " ".join(tokens)


def _balance_parens(text: str) -> str:
    """Drop parenthesis fragments the cuts above can strand at either end.

    A ")" with nothing open before it is damaged source -- HW's RTL text
    inverts the pair ("branch, twig (of a tree), of a shrub)"). Only the
    character is dropped, because real gloss text sits on either side of it
    depending on the entry: before it in `fnn`, after it in `gll` and `wvq`.

    An unclosed "(" is the opposite artefact -- an idiom cut or the length cap
    landing inside the parenthetical ("arc (geom.); arch, vault (arch.") -- and
    there everything from the bracket on goes. That can shorten a real gloss
    where HW itself dropped the ")": `Twr` keeps "one time" and loses "state,
    condition; limit, bound" to an unterminated "(= Fr. fois". Shipping the
    broken bracket is worse, and it is the rarer case.
    """
    depth = 0
    opened = -1  # where the outermost group starts, so nesting cuts once
    kept: list[str] = []
    for ch in text:
        if ch == "(":
            if depth == 0:
                opened = len(kept)
            depth += 1
        elif ch == ")":
            if depth == 0:
                continue
            depth -= 1
        kept.append(ch)
    if depth:
        del kept[opened:]
    # Typographic dashes strip alongside the punctuation because the Arabic-tail
    # cut can orphan one and `_strip_tail` will not pop it: `_is_transliteration`
    # calls a bare "–"/"—" ASCII (they are in `_TYPOGRAPHIC_STRIP`) while "―" is
    # not, so the same dash class had three outcomes and a gloss could ship
    # ending on punctuation ("blow up, blast –"). No live gloss starts or ends on
    # one today; this closes the class rather than a case.
    return _WS.sub(" ", "".join(kept)).strip(" ,;:–—―")


def select_gloss(
    entries: list[tuple[int, str]],
    *,
    prefer_nominal: bool = False,
    max_senses: int = 3,
    max_chars: int | None = None,
    root: str = "",
) -> str | None:
    """Short English gloss: Form-I first sense, or a noun head if requested.

    ``entries`` is `hanswehr.lookup`'s return -- ``(is_root, definition)``
    pairs, ``is_root == 1`` first. ``prefer_nominal`` picks the first
    ``is_root == 0`` entry instead (falling back to ``entries[0]`` if there
    is none), for a root the corpus uses mostly as a noun/adjective.
    ``max_chars`` caps the result at a sense boundary -- ``max_senses`` caps
    the sense *count*, which one 260-character sense walks straight past. It
    defaults to `MAX_GLOSS_CHARS` read at *call* time, not bound at import:
    `audit_hanswehr_glosses.classify` reads the same module attribute, and a
    default evaluated once would let the two drift apart under any override.

    ``root`` is the entry's Buckwalter root, and is the one piece of evidence
    the definition text does not carry: it lets the head run recognise a
    transliteration that respells the root but has nothing after it to give it
    away. Optional, because the caller may not have one -- without it the run
    behaves exactly as it did before, so 120 roots keep their leftover head.
    """
    if max_chars is None:
        max_chars = MAX_GLOSS_CHARS
    # A negative cap is the one value the truncation branch cannot honour: no
    # boundary can sit inside a window of `max_chars + 1 <= 0`, so it falls
    # through to `cleaned[:max_chars]` -- which for -1 drops a single character
    # and returns a gloss far longer than the cap it was handed. Refuse it here
    # rather than at the branch, so the caller learns before any entry is read
    # -- and *above* the empty-entries return, or a caller that happens to pass
    # no entries gets None for a cap the next call with entries would reject,
    # which reads as "that cap is fine" until the data changes.
    if max_chars < 0:
        raise ValueError(f"max_chars {max_chars} is negative; a cap cannot be honoured")
    if not entries:
        return None
    if prefer_nominal:
        definition = next((e for e in entries if e[0] == 0), entries[0])[1]
    else:
        definition = entries[0][1]
    xref = _XREF.search(definition)
    second_head = _SECOND_HEAD.search(definition)
    # Cut at the first <b> (derived-form block), │ (idiom/example), or " -- "
    # (a second Form-I headword with its own transliteration) -- none belongs
    # in a Form-I/noun-head gloss.
    cut_points = [
        p
        for p in (
            definition.find("<b>"),
            definition.find("│"),
            _dash_cut(definition),
            second_head.start(1) if second_head else -1,
            # "see 2 شف" / "fūm = ثوم tūm" -- a redirect to another headword.
            xref.start() if xref else -1,
        )
        if p != -1
    ]
    if cut_points:
        definition = definition[: min(cut_points)]

    # Drop Arabic-script object/preposition markers and verbal-noun spellings
    # that live inside the sense body, past the head -- _strip_head only reaches
    # the leading head, so these survive otherwise (75% of raw glosses).
    definition = _ARABIC_PAREN.sub(" ", definition)
    # Re-attach the punctuation that removal orphaned ("‘anada u i , ‘anida")
    # *before* the head strip, not only after it: a lone "," token splits a
    # marker off its head run, and the whole head then survives into the gloss.
    definition = _DANGLING_PUNCT.sub(r"\1", definition)
    definition = _strip_head(definition, _root_skeleton(root))
    # The tail strip runs only when the Arabic cut actually removed something:
    # its shapes are all artefacts of that cut, and a gloss can legitimately end
    # in an abbreviation on its own ("numeral; number, No.").
    cut = _ARABIC_TAIL.sub("", definition)
    definition = _strip_tail(cut) if cut != definition else definition
    if definition.startswith("to "):
        definition = definition[3:]

    senses = (s.strip() for s in definition.split(";"))
    kept = "; ".join(s for s in list(senses)[:max_senses] if s)
    cleaned = _WS.sub(" ", html.unescape(_TAG.sub(" ", kept))).strip()
    # A dropped mid-sentence paren leaves " ," / " ;" (e.g. "possession ,
    # control"); pull the punctuation back onto the preceding word.
    cleaned = _DANGLING_PUNCT.sub(r"\1", cleaned).strip(" ,;:")
    cleaned = _WS.sub(" ", _PAGE_NUMBER.sub(" ", cleaned))
    # Re-run after the page strip too, or the hole it leaves orphans the comma
    # that followed the number ("to get a taste , experience").
    cleaned = _DANGLING_PUNCT.sub(r"\1", cleaned).strip(" ,;:")
    # Balance *before* measuring, not only after: `_balance_parens` deletes the
    # tail from an unterminated "(", so a gloss over the cap only because of a
    # paren about to be removed was being cut at an earlier sense boundary for
    # nothing. The call below stays -- truncating can open a paren of its own.
    cleaned = _balance_parens(cleaned)
    if len(cleaned) > max_chars:
        # Cut on a sense boundary: a gloss chopped mid-word reads as a bug.
        # rfind over the truncation window finds the last complete sense.
        # `max_chars + 1`, not `max_chars`: `rfind`'s window is half-open, and a
        # boundary sitting *on* the cap is legal -- `cleaned[:max_chars]` is
        # exactly `max_chars` long. Searching to `max_chars` hid a sense that
        # ended on the 150th character and fell back to a far earlier cut,
        # costing `qll` 120 characters of its gloss.
        window = max_chars + 1
        boundary = cleaned.rfind(";", 0, window)
        if boundary <= 0:
            # No sense boundary in the window: HW writes some entries as one
            # long synonym list ("difficulty, predicament, plight, ..."), so
            # fall back to the last comma or colon, then to the last space.
            # The cap has to bind unconditionally -- returning the over-length
            # string instead left a `long` bucket no fix could ever empty, i.e.
            # a gate that could only fail (that was `audit_hanswehr_glosses`
            # when it still gated; the bucket now rides in the baseline).
            boundary = max(cleaned.rfind(",", 0, window), cleaned.rfind(":", 0, window))
        if boundary <= 0:
            boundary = cleaned.rfind(" ", 0, window)
        # Not even a space inside the window -- one unbroken token longer than
        # the cap. Cut it mid-word anyway: the cap binds unconditionally or the
        # `long` bucket is one no fix can empty, which is the gate-clearability
        # rule this module's docstring turns on.
        cleaned = cleaned[: boundary if boundary > 0 else max_chars].strip(" ,;:")
    return _quarantine(_balance_parens(cleaned))


def _quarantine(gloss: str) -> str | None:
    """None unless the text still carries a word that could be a gloss.

    The cuts above are subtractive, so an entry this module cannot parse ends
    as a short residue of its own head rather than as an error: "or" out of a
    bracket-inverted `fry`, "p1." out of an OCR'd plural marker. Those used to
    reach the database looking like definitions. A root with no gloss is the
    honest outcome -- it lands in the coverage gap for a human, where a wrong
    one-word definition would not.
    """
    if not any(len(w.strip(_TRAILING + ".()")) >= 3 for w in gloss.split()):
        return None
    return gloss or None
