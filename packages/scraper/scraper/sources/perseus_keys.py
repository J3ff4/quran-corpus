"""Perseus's Arabic key conventions, shared by every Perseus source we read.

Both Lane's Lexicon and Salmoné are Perseus TEI with `<div2 type="root" n=...>`
headings, and both file roots under the same conventions: hamza-seat marks in
the key, geminates under a two-letter spelling, a weak final written `Y`. These
live here rather than in either source module so the second source does not have
to import the first.
"""

from __future__ import annotations

import re

_HAMZA_MARKS = re.compile(r"[\^`]")
# Lane files root entries under a shared heading -- `Sgw and SgY`, `Dbw or DbY`
# -- because the two spellings are one article. The `n` is the heading verbatim.
# 280 of the 5317 headings hold a space; `and`/`or` are the two that name a
# second spelling of the same root.
_JOINED = re.compile(r"\s+(?:and|or)\s+")


def normalise_key(key: str) -> str:
    """Drop Lane's hamza-seat marks so ``SA^b`` compares equal to ``SAb``."""
    return _HAMZA_MARKS.sub("", key)


def index_keys(name: str) -> list[str]:
    """Every root a ``<div2 n=...>`` heading files, normalised.

    A heading naming two spellings is one article covering both, so both are
    real keys: nine of the phase-21 gap roots (g$w DHw Hfw Sgw gTw gvw THw fDw
    fAy) live only under a ``X and XY`` heading and were unreachable while the
    whole heading was the key -- reported as "Lane has no entry" when Lane does.
    ``or`` is the same rule and adds 20 keys, changing no existing entry; it
    closes no gap today (all 7 roots it reaches already hold a Lane definition)
    and is here so the next gap-fill pass does not re-learn this.

    The other two spaced-heading shapes are deliberately left whole. ``X &c.``
    is a range heading, not a second spelling. ``Quasi X`` is Lane's section for
    words *treated under* a root they do not derive from, so keying it as that
    root would file a different article's text there -- and it too reaches no
    root that lacks a definition, so there is nothing to weigh against the risk.

    A heading's padding is not part of its key: ``t0.xml`` files one as
    ``n=" tr "``, and keying it verbatim makes it unreachable -- key_candidates
    never emits a key holding spaces, so the root reports "Lane has no entry"
    when Lane has one.
    """
    return [
        normalise_key(stripped)
        for part in _JOINED.split(name)
        if (stripped := part.strip())
    ]


# `Al` is ال, the definite article -- Lane's entry for it is grammar prose, not
# a root. The geminate rule below would otherwise hand it to All (إلّ, ties of
# kinship, 9:8). Never offered as a fallback; a direct lookup still works.
_NOT_A_ROOT = frozenset({"Al"})


def key_candidates(bw: str) -> list[str]:
    """Lane keys that may hold ``bw``, most-specific first.

    Lane does not file every root under its triliteral spelling: geminates go
    under the two-letter form (Sxx -> Sx) and a weak final is alif maqsura `Y`
    rather than `y`. Without these, coverage of the phase-21 gap list drops from
    233/256 to 195/256.

    There is deliberately no doubled-quadriliteral rule: no `hdhd -> hd` key
    exists in any of the 36 volumes, and Lane files other reduplicated
    quadriliterals directly (lblb, kbkb, qsqs). Collapsing them credited six
    roots with a neighbour's definition -- hdhd (hoopoe, 27:20) came out as
    "He demolished, threw it down".
    """
    out = [bw]
    if len(bw) == 3 and bw[1] == bw[2]:
        out.append(bw[:2])
    for suffix, replacement in (("y", "Y"), ("w", "Y"), ("y", "w"), ("Y", "y")):
        if bw.endswith(suffix):
            out.append(bw[: -len(suffix)] + replacement)
    return [k for k in dict.fromkeys(out) if k == bw or k not in _NOT_A_ROOT]
