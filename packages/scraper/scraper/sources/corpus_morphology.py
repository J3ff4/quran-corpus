"""Parser for the Quranic Arabic Corpus morphology data file.

Source: https://corpus.quran.com/download/ (quranic-corpus-morphology-0.4.txt,
GPL, (C) Kais Dukes). Downloaded manually once; do not re-scrape.

The file is tab-separated with one row per *segment* (a word splits into
prefix/stem/suffix segments). Format:

    LOCATION        FORM    TAG     FEATURES
    (1:1:1:1)       bi      P       PREFIX|bi+
    (1:1:1:2)       somi    N       STEM|POS:N|LEM:{som|ROOT:smw|M|GEN
    (1:1:2:1)       {ll~ahi PN      STEM|POS:PN|LEM:{ll~ah|ROOT:Alh|GEN

LOCATION is (surah:ayah:word:segment). We aggregate all segments of a word
into a single record matching the one-row-per-word `words` table.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path

from ..buckwalter import buckwalter_to_arabic


@dataclass
class ParsedCorpusWord:
    surah: int
    ayah: int
    position: int  # word position within the ayah
    root_buckwalter: str | None = None
    lemma_buckwalter: str | None = None
    pos_tags: list[str] = field(default_factory=list)

    @property
    def root(self) -> str | None:
        return buckwalter_to_arabic(self.root_buckwalter)

    @property
    def lemma(self) -> str | None:
        return buckwalter_to_arabic(self.lemma_buckwalter)

    @property
    def pos_tag(self) -> str | None:
        return self.pos_tags[0] if self.pos_tags else None

    @property
    def morphology_json(self) -> str | None:
        return json.dumps(self.pos_tags, ensure_ascii=False) if self.pos_tags else None


def _parse_location(loc: str) -> tuple[int, int, int, int] | None:
    """Parse '(s:a:w:seg)' -> (surah, ayah, word, segment). None if malformed."""
    inner = loc.strip().strip("()")
    parts = inner.split(":")
    if len(parts) != 4:
        return None
    try:
        s, a, w, seg = (int(p) for p in parts)
    except ValueError:
        return None
    return s, a, w, seg


def _parse_features(features: str) -> tuple[str | None, str | None]:
    """Extract (lemma_buckwalter, root_buckwalter) from the FEATURES field."""
    lemma: str | None = None
    root: str | None = None
    for token in features.split("|"):
        if token.startswith("LEM:"):
            lemma = token[len("LEM:") :] or None
        elif token.startswith("ROOT:"):
            root = token[len("ROOT:") :] or None
    return lemma, root


def parse_corpus_morphology(path: Path) -> Iterator[ParsedCorpusWord]:
    """Yield one ParsedCorpusWord per word, aggregating its segments.

    Words are emitted in file order. Segments of the same word are merged:
    POS tags are collected in segment order; root/lemma are taken from the
    first segment that supplies them (the stem).
    """
    current: ParsedCorpusWord | None = None
    current_key: tuple[int, int, int] | None = None

    with path.open(encoding="utf-8") as fh:
        for raw in fh:
            line = raw.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            cols = line.split("\t")
            # Skip the column header row.
            if cols[0].strip().upper() == "LOCATION":
                continue
            if len(cols) < 3:
                continue

            parsed_loc = _parse_location(cols[0])
            if parsed_loc is None:
                continue
            surah, ayah, word, _segment = parsed_loc
            tag = cols[2].strip()
            features = cols[3] if len(cols) > 3 else ""
            lemma_bw, root_bw = _parse_features(features)

            key = (surah, ayah, word)
            if key != current_key:
                if current is not None:
                    yield current
                current = ParsedCorpusWord(surah=surah, ayah=ayah, position=word)
                current_key = key

            assert current is not None  # noqa: S101 - narrow type for mypy
            if tag:
                current.pos_tags.append(tag)
            if current.root_buckwalter is None and root_bw is not None:
                current.root_buckwalter = root_bw
            if current.lemma_buckwalter is None and lemma_bw is not None:
                current.lemma_buckwalter = lemma_bw

    if current is not None:
        yield current


@dataclass
class ParsedCorpusSegment:
    surah: int
    ayah: int
    word: int
    segment_index: int  # 0-based position of the segment within the word
    form_buckwalter: str
    tag: str | None
    segment_type: str | None  # 'prefix' | 'stem' | 'suffix'
    features_json: str | None
    lemma_buckwalter: str | None
    root_buckwalter: str | None


# Buckwalter FEATURE tokens -> (structured key, value). Only the unambiguous
# single-token features are mapped; anything else is kept under "raw".
_FEATURE_MAP: dict[str, tuple[str, str]] = {
    "M": ("gender", "masculine"),
    "F": ("gender", "feminine"),
    "GEN": ("case", "genitive"),
    "NOM": ("case", "nominative"),
    "ACC": ("case", "accusative"),
}
_STRUCTURAL = {"PREFIX", "STEM", "SUFFIX"}


def _segment_type(tokens: list[str]) -> str | None:
    for tok in tokens:
        if tok in _STRUCTURAL:
            return tok.lower()
    return None


def _segment_features_json(tokens: list[str]) -> str | None:
    mapped: dict[str, str] = {}
    raw: list[str] = []
    for tok in tokens:
        if tok in _STRUCTURAL or ":" in tok or tok.endswith("+") or not tok:
            continue
        if tok in _FEATURE_MAP:
            key, value = _FEATURE_MAP[tok]
            mapped[key] = value
        else:
            raw.append(tok)
    if raw:
        mapped["raw"] = raw  # type: ignore[assignment]
    return json.dumps(mapped, ensure_ascii=False) if mapped else None


def parse_corpus_segments(path: Path) -> Iterator[ParsedCorpusSegment]:
    """Yield one ParsedCorpusSegment per segment line (in file order)."""
    with path.open(encoding="utf-8") as fh:
        for raw in fh:
            line = raw.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            cols = line.split("\t")
            if cols[0].strip().upper() == "LOCATION" or len(cols) < 3:
                continue
            parsed_loc = _parse_location(cols[0])
            if parsed_loc is None:
                continue
            surah, ayah, word, seg = parsed_loc
            form = cols[1].strip()
            tag = cols[2].strip() or None
            features = cols[3] if len(cols) > 3 else ""
            tokens = [t for t in features.split("|") if t]
            lemma_bw, root_bw = _parse_features(features)
            yield ParsedCorpusSegment(
                surah=surah,
                ayah=ayah,
                word=word,
                segment_index=seg - 1,
                form_buckwalter=form,
                tag=tag,
                segment_type=_segment_type(tokens),
                features_json=_segment_features_json(tokens),
                lemma_buckwalter=lemma_bw,
                root_buckwalter=root_bw,
            )
