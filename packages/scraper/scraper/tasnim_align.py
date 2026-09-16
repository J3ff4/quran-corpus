"""Align Tasnim's Uzbek word-by-word onto our corpus word ids.

Tasnim glosses the Quran word by word in Uzbek, by hand, for all 114 surahs --
but it segments the text its own way: 66139 rows against our 77429 words. Only
1846 of 6236 ayahs even have matching counts, so a positional join is dead on
arrival. The two also spell the text differently: Tasnim is imla'i (``مالك``,
``الصراط``), our corpus is Uthmani (``ملك``, ``الصرط``).

Alignment is nonetheless **deterministic**, which is the finding this module
exists to carry. Normalize both sides and walk them together, accumulating
corpus words until the normalized strings agree; where Tasnim glosses a phrase,
that accumulation is the group. Two tiers, whole-ayah, never mixed:

* tier 1 -- ``base_form``: marks and tatweel out, hamza/alef/ya/ta-marbuta
  folded. 2960 ayahs.
* tier 2 -- ``skeleton``: tier 1 minus the matres lectionis ``ا و ي``, a bare
  consonant skeleton, which is what bridges Uthmani against imla'i. 3267 more.

6227 / 6236 ayahs, 77253 / 77429 words. The 9 that fail are hand-mapped in
``data/tasnim_overrides.json``; there is no LLM and no confidence score
anywhere in this path.

**Never guess.** ``align_ayah`` returns ``None`` rather than a partial or
best-effort mapping: a wrong gloss under the right Arabic is invisible to every
check downstream, where a missing one falls back to the English and is obvious.
"""

from __future__ import annotations

import json
import sqlite3
import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

__all__ = [
    "OVERRIDES_PATH",
    "Group",
    "Override",
    "align_all",
    "align_ayah",
    "base_form",
    "load_overrides",
    "resolve_override",
    "skeleton",
]

# Checked in beside this package, not read from the reference database: these
# are editorial decisions about text a machine could not resolve, and they have
# to survive a re-import of either side.
OVERRIDES_PATH = Path(__file__).resolve().parent.parent / "data/tasnim_overrides.json"

# The Arabic letter block we keep. Everything outside it -- spaces, Quranic
# annotation signs, pause marks, Latin -- is dropped by the range filter, so
# neither normalizer needs to enumerate what it is throwing away.
#
# Note what this does NOT do: strip marks by character class. The obvious
# "Arabic marks" class spans letters as well, and stripping by it returns ''
# for every input -- two of which compare equal, reporting a flawless 100%
# alignment over nothing at all. Marks come off via unicodedata.combining.
_KEEP_FIRST = 0x0620
_KEEP_LAST = 0x064A

# Tatweel. A letter by category and inside the kept range, so combining-mark
# removal does not touch it; 428 ayahs failed until it was named explicitly.
_TATWEEL = "ـ"

# Folded after the marks come off, before the range filter -- ٱ (U+0671) sits
# outside the kept range and would otherwise be dropped rather than folded,
# which is a different answer.
_FOLD = str.maketrans(
    {
        "ٱ": "ا",  # alef wasla -> alef
        "آ": "ا",  # alef madda
        "أ": "ا",  # alef hamza above
        "إ": "ا",  # alef hamza below
        "ى": "ي",  # alef maksura -> ya
        "ة": "ه",  # ta marbuta -> ha
        "ؤ": "و",  # waw hamza -> waw
        "ئ": "ي",  # ya hamza -> ya
        "ء": "",  # bare hamza: a seat the two sources disagree about
    }
)

# Dropped by tier 2 only. Long vowels are exactly where Uthmani and imla'i
# orthography part company, so removing them is what makes الصرط and الصراط one
# word -- and also what makes tier 2 looser than tier 1, hence whole-ayah.
_MATRES = str.maketrans({"ا": "", "و": "", "ي": ""})


def base_form(s: str) -> str:
    """Tier 1: one spelling of a word, marks and seats folded away."""
    decomposed = unicodedata.normalize("NFKD", s)
    bare = "".join(c for c in decomposed if not unicodedata.combining(c))
    folded = bare.replace(_TATWEEL, "").translate(_FOLD)
    return "".join(c for c in folded if _KEEP_FIRST <= ord(c) <= _KEEP_LAST)


def skeleton(s: str) -> str:
    """Tier 2: base_form with the long vowels gone -- consonants only."""
    return base_form(s).translate(_MATRES)


@dataclass(frozen=True)
class Group:
    """One Tasnim gloss and the corpus words it covers. Never empty."""

    word_ids: tuple[int, ...]
    gloss: str


def _align_with(
    norm,
    corpus: Sequence[tuple[int, str]],
    tasnim: Sequence[tuple[str, str]],
) -> list[Group] | None:
    """Greedy monotone walk under one normalizer. None = no alignment.

    Symmetric, because the two sources disagree in both directions: Tasnim
    glosses ``لَا رَيْبَ`` as one phrase where we hold two words, and splits our
    single ``يٰقَوْمِ`` into ``يا`` + ``قوم``. Whichever side is behind absorbs
    its next token until the two normalized runs agree; several Tasnim rows
    landing on one word join their glosses with a space, in source order.
    """
    groups: list[Group] = []
    ci = ti = 0
    while ci < len(corpus) or ti < len(tasnim):
        # One side exhausted while the other still has text: the tail would
        # carry no gloss (or a gloss no word) while the call reported success.
        if ci >= len(corpus) or ti >= len(tasnim):
            return None
        word_id, text = corpus[ci]
        ids = [word_id]
        acc = norm(text)
        ci += 1
        arabic, gloss = tasnim[ti]
        glosses = [gloss]
        tacc = norm(arabic)
        ti += 1
        while acc != tacc:
            # Equal length and unequal text is a real disagreement, not a
            # boundary to walk past. Consuming further on both sides could
            # re-synchronize by luck and hand back a wrong mapping, which is
            # invisible downstream -- where a missing gloss is obvious.
            if len(acc) == len(tacc):
                return None
            if len(acc) < len(tacc):
                if ci >= len(corpus):
                    return None
                word_id, text = corpus[ci]
                acc += norm(text)
                ids.append(word_id)
                ci += 1
            else:
                if ti >= len(tasnim):
                    return None
                arabic, gloss = tasnim[ti]
                tacc += norm(arabic)
                glosses.append(gloss)
                ti += 1
        groups.append(Group(tuple(ids), " ".join(glosses)))
    return groups or None


def align_ayah(
    corpus: Sequence[tuple[int, str]],
    tasnim: Sequence[tuple[str, str]],
) -> list[Group] | None:
    """Align one ayah. Tier 1 for the whole ayah, then tier 2 for the whole.

    Never mixed within an ayah: tier 2 discards the long vowels, so it matches
    strings tier 1 deliberately keeps apart, and letting it rescue a single
    position would paper over a real disagreement elsewhere in the same verse.
    """
    if not corpus or not tasnim:
        return None
    tier_one = _align_with(base_form, corpus, tasnim)
    return tier_one if tier_one is not None else _align_with(skeleton, corpus, tasnim)


@dataclass(frozen=True)
class Override:
    """A hand mapping: 1-based positions within the ayah, and their gloss.

    Positions, never global word ids -- an id changes if the corpus is
    re-seeded, and a stale id would write the right Uzbek under the wrong
    Arabic somewhere else entirely.
    """

    positions: tuple[int, ...]
    gloss: str


def load_overrides(path: Path = OVERRIDES_PATH) -> dict[str, list[Override]]:
    """Read and validate the hand-mapped ayahs.

    Validated even though the file is ours: it is hand-edited, and both
    failures it can carry are silent downstream. A duplicated position loses
    one of its two glosses to UNIQUE(word_id, language_code); an empty gloss
    writes a blank row that reads as "this word has no meaning" rather than
    falling back to the English.
    """
    raw = json.loads(path.read_text(encoding="utf-8"))
    out: dict[str, list[Override]] = {}
    for key, entries in raw.items():
        # Keys starting with an underscore are prose for the human editing the
        # file, not data.
        if key.startswith("_"):
            continue
        seen: set[int] = set()
        groups: list[Override] = []
        for entry in entries:
            positions = tuple(int(p) for p in entry["words"])
            gloss = entry["gloss"].strip()
            if not positions or not gloss:
                raise ValueError(f"{key}: an override needs a position and a gloss")
            if any(p < 1 for p in positions):
                raise ValueError(f"{key}: positions are 1-based, got {positions}")
            twice = seen & set(positions)
            if twice:
                raise ValueError(f"{key}: position covered twice -- {sorted(twice)}")
            seen.update(positions)
            groups.append(Override(positions, gloss))
        out[key] = groups
    return out


def resolve_override(
    groups: Sequence[Override],
    corpus: Sequence[tuple[int, str]],
) -> list[Group]:
    """Turn positions into this corpus's word ids."""
    resolved: list[Group] = []
    for group in groups:
        if any(p > len(corpus) for p in group.positions):
            raise ValueError(
                f"override position past the end of a {len(corpus)}-word ayah: "
                f"{group.positions}"
            )
        ids = tuple(corpus[p - 1][0] for p in group.positions)
        resolved.append(Group(ids, group.gloss))
    return resolved


def _corpus_ayahs(db: Path) -> dict[tuple[int, int], list[tuple[int, str]]]:
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        rows = con.execute(
            """SELECT a.surah_id, a.ayah_number, w.id, w.text_arabic
                 FROM words w JOIN ayahs a ON a.id = w.ayah_id
                ORDER BY a.surah_id, a.ayah_number, w.position"""
        ).fetchall()
    finally:
        con.close()
    out: dict[tuple[int, int], list[tuple[int, str]]] = {}
    for surah, ayah, word_id, text in rows:
        out.setdefault((surah, ayah), []).append((word_id, text or ""))
    return out


def _tasnim_ayahs(db: Path) -> dict[tuple[int, int], list[tuple[str, str]]]:
    # Read-only, always: this file is a third-party reference under
    # ~/quran-data/refdata and nothing here may write it.
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        rows = con.execute(
            """SELECT surahId, verseId, wordsAr, translateUzlat
                 FROM bywords ORDER BY surahId, verseId, id"""
        ).fetchall()
    finally:
        con.close()
    out: dict[tuple[int, int], list[tuple[str, str]]] = {}
    for surah, ayah, arabic, gloss in rows:
        if not arabic or not gloss:
            continue
        out.setdefault((surah, ayah), []).append((arabic, gloss.strip()))
    return out


def align_all(
    corpus_db: Path,
    tasnim_db: Path,
    overrides: Mapping[str, list[Override]] | None = None,
) -> tuple[list[Group], list[tuple[int, int]]]:
    """Align every ayah. Returns (groups, unaligned ayah keys).

    Overrides are consulted BEFORE either tier, so a hand mapping is never
    silently overruled by a lucky automatic match.
    """
    overrides = overrides or {}
    corpus = _corpus_ayahs(corpus_db)
    tasnim = _tasnim_ayahs(tasnim_db)

    groups: list[Group] = []
    unaligned: list[tuple[int, int]] = []
    for key in sorted(corpus):
        words = corpus[key]
        override = overrides.get(f"{key[0]}:{key[1]}")
        if override is not None:
            groups.extend(resolve_override(override, words))
            continue
        rows = tasnim.get(key)
        if not rows:
            unaligned.append(key)
            continue
        aligned = align_ayah(words, rows)
        if aligned is None:
            unaligned.append(key)
            continue
        groups.extend(aligned)
    return groups, unaligned
