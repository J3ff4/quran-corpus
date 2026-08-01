"""Extract per-form lexical glosses from an archived corpus root page.

``corpus.quran.com/qurandictionary.jsp`` prints one header per derived form,
and where a lexical sense exists it follows the POS label after a dash::

    <h4 class="dxe">Verb (form I) -to strike, to set forth</h4>
    <h4 class="dxe">Noun</h4>

That gloss is a real dictionary sense. It is *not* the same thing as the
word-by-word glosses in ``word_glosses``, which are per-verse contextual
translations and carry the surrounding sentence with them ("Allah sets forth").
The phase 18 dictionary scrape archived these pages but never read this header,
so recovering the glosses costs no network requests.

Roots with no verb form print a bare header and go straight to the occurrence
table, so they yield ``[]``. That is an upstream absence, not a parser miss --
101 of the 256 definition-less roots are in that state, and they keep the
"No lexicon entry for this root yet" empty state on the root page.
"""

from __future__ import annotations

from typing import NamedTuple

from bs4 import BeautifulSoup


class FormGloss(NamedTuple):
    pos_label: str
    gloss: str


# The corpus separates label from gloss with a space-dash and no space after
# it ("Verb (form I) -to strike"). Verified across all 1642 archived snapshots:
# 4657 headers, of which 1573 carry a gloss, and *not one* contains a second
# " -" -- so splitting on the first occurrence is unambiguous.
_SEPARATOR = " -"


def parse_form_glosses(raw_html: str) -> list[FormGloss]:
    """Pure: snapshot HTML -> form glosses in document order. Never raises.

    Keys on the header element rather than on a list of known POS labels. The
    corpus uses 29 distinct labels across the archive, including several a
    verb-shaped allowlist would not predict -- ``Nominal``, ``Time adverb``,
    ``Form of address`` -- and ``Noun`` alone carries 55 glosses. Matching the
    element instead means a label we have never seen still parses, and there is
    no second list to keep in sync with the corpus.
    """
    if not raw_html:
        return []
    soup = BeautifulSoup(raw_html, "lxml")
    out: list[FormGloss] = []
    seen: set[tuple[str, str]] = set()
    for header in soup.select("h4.dxe"):
        # Join child strings with a space. Today every header is one flat text
        # node, so this is a no-op -- but the split below needs the space in
        # " -" to survive, and get_text(strip=True) drops it the moment the
        # corpus wraps either side in a tag. That failure is silent: the
        # separator stops matching, every gloss on the page is dropped, and the
        # result is indistinguishable from a root the corpus never glossed.
        text = header.get_text(" ", strip=True)
        if _SEPARATOR not in text:
            continue  # bare POS header: no lexical sense published
        pos_label, gloss = text.split(_SEPARATOR, 1)
        pos_label, gloss = pos_label.strip(), gloss.strip()
        if not gloss:
            continue
        key = (pos_label, gloss)
        if key in seen:
            continue
        seen.add(key)
        out.append(FormGloss(pos_label, gloss))
    return out
