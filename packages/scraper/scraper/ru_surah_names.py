"""Import the Russian surah names and meanings into `surah_names`.

Fills the gap issue #93 recorded: `surah_names` carried `uz` and `uz-Cyrl`
and nothing else, so a Russian UI fell back to the surahs table's own English
and read "Al-Fatiha / The Opening" while Uzbek read "Fotiha / Ochuvchi".

The rows come from `tools/ru_surah_names.tsv`, which is the source verbatim.
Everything questionable about that source is corrected HERE, in `_OVERRIDES`,
so the provenance stays visible: the file says what the site published, this
module says what we publish and why it differs.

DB-to-DB and atomic, for the reason tasnim_import.py gives: 114 rows written
in seconds, where a half-finished resumable import is indistinguishable from a
completed one.
"""

from __future__ import annotations

import sqlite3
import unicodedata
from dataclasses import dataclass
from pathlib import Path

TSV_PATH = Path(__file__).resolve().parent.parent / "tools/ru_surah_names.tsv"

LANGUAGE_CODE = "ru"

SURAH_COUNT = 114


@dataclass(frozen=True)
class RuSurahName:
    surah_id: int
    name: str
    meaning: str | None


@dataclass(frozen=True)
class ImportSummary:
    written: int
    overridden: int
    meanings_dropped: int


# What the source got wrong, keyed (surah_id, field) -> (verbatim, corrected).
#
# The verbatim half is checked before the correction is applied: an override
# that no longer matches the file is an override describing a defect that is
# no longer there, and silently rewriting a row it was never written for is
# how a correction becomes a corruption.
#
# Both defects here are homoglyphs or a missing letter, and both are invisible
# on screen while being fatal to comparison -- `Куpaйш` with a Latin `p` does
# not equal `Курайш` under any fold, so the picker's Russian arm would simply
# never find surah 106.
_OVERRIDES: dict[tuple[int, str], tuple[str, str]] = {
    # "Луман" is one letter short of Лукман (Luqman), the name the surah is
    # known by and the one surahs.name_translit carries.
    (31, "name"): ("Луман", "Лукман"),
    # Same name as the meaning, and a LATIN "a" in the middle of it.
    (31, "meaning"): ("Лукмaн", "Лукман"),
    # LATIN "p" and "a" inside Курайш.
    (106, "name"): ("Куpaйш", "Курайш"),
}


def load_rows(path: Path = TSV_PATH) -> list[RuSurahName]:
    """Parse the TSV, apply the overrides, and refuse anything still wrong.

    Untrusted input by §3: the file is a transcription of a third-party page,
    and every guard below exists because the page actually broke that way.
    """
    rows: list[RuSurahName] = []
    seen: set[int] = set()
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != 3:
            raise ValueError(
                f"{path}:{lineno}: expected 3 tab-separated fields, got {len(parts)}"
            )
        # NFC before anything compares these strings, including the override
        # check below -- the overrides are written in composed form. The
        # shipped file is already composed, but a re-fetch need not be, and a
        # decomposed `ё` (е + U+0308) is a letter the guard below cannot see:
        # a combining mark is not `isalpha()`. Storing it would produce a name
        # that renders correctly and compares unequal to the composed form the
        # UI hands over, which is exactly how 49 form chips died once.
        raw_id, name, meaning = (unicodedata.normalize("NFC", p.strip()) for p in parts)
        if not raw_id.isdigit():
            raise ValueError(f"{path}:{lineno}: surah id {raw_id!r} is not a number")
        surah_id = int(raw_id)
        if not 1 <= surah_id <= SURAH_COUNT:
            raise ValueError(
                f"{path}:{lineno}: surah id {surah_id} is outside 1..{SURAH_COUNT}"
            )
        if surah_id in seen:
            raise ValueError(f"{path}:{lineno}: surah id {surah_id} appears twice")
        seen.add(surah_id)

        fields = {"name": name, "meaning": meaning}
        for field, value in list(fields.items()):
            override = _OVERRIDES.get((surah_id, field))
            if override is None:
                continue
            verbatim, corrected = override
            if value != verbatim:
                raise ValueError(
                    f"{path}:{lineno}: override for surah {surah_id} {field} expected "
                    f"{verbatim!r}, found {value!r} -- the source has changed"
                )
            fields[field] = corrected

        name, meaning = fields["name"], fields["meaning"]
        if not name:
            raise ValueError(f"{path}:{lineno}: surah {surah_id} has no name")
        for field, value in (("name", name), ("meaning", meaning)):
            stray = _non_cyrillic_letters(value)
            if stray:
                raise ValueError(
                    f"{path}:{lineno}: surah {surah_id} {field} {value!r} "
                    f"mixes scripts: {stray} -- a Latin letter inside a "
                    f"Cyrillic word matches nothing"
                )
        rows.append(
            RuSurahName(
                surah_id=surah_id,
                name=strip_article(name),
                # The name repeated is not a meaning: Худ means Худ, and storing
                # the repeat renders as "Худ · Худ" wherever both are shown.
                # Same rule tasnim_import.py applies to Tavba and Ixlos.
                meaning=None
                if not meaning or _same_word(meaning, strip_article(name))
                else meaning,
            )
        )

    missing = sorted(set(range(1, SURAH_COUNT + 1)) - seen)
    if missing:
        raise ValueError(f"{path}: no rows for surahs {missing}")
    return rows


# The Arabic definite article as Russian transcribes it, every assimilated
# form the 114 names actually use. `Аль` first, so `Ал` can never match it
# while a longer form is available.
_ARTICLES = ("Аль", "Ад", "Аз", "Ан", "Ар", "Ас", "Ат", "Аш")

# Below this the remainder is not a name, it is what is left of one. Nothing in
# the 114 comes close -- the shortest stripped name is Нур at three -- so this
# is a guard against a future row, not a rule any current row needs.
_MIN_STRIPPED = 3


def strip_article(name: str) -> str:
    """`Аль-Бакара` -> `Бакара`, matching how the Uzbek rows are stored.

    `surah_names.name` REPLACES `surahs.name_translit` at the call site (see
    queries/surahNames.ts), so the two languages occupy one slot and a reader
    switching between them should not see the article appear and disappear.
    The Uzbek rows carry the bare name for 112 of 114 -- `Fotiha`, `Baqara`,
    `Quraysh` -- and this is the same convention, applied by rule rather than
    by whatever the source felt like that row.
    """
    for article in _ARTICLES:
        for separator in ("-", " "):
            prefix = article + separator
            if name.startswith(prefix):
                rest = name[len(prefix) :].strip()
                return rest if len(rest) >= _MIN_STRIPPED else name
    return name


def _non_cyrillic_letters(value: str) -> list[str]:
    """Letters in `value` that are not Cyrillic.

    The guard that actually earns its place: the source writes `Куpaйш` with a
    Latin `p`, which renders identically and compares as a different string.
    Digits, spaces, hyphens and the like are not letters and are left alone.
    """
    return [
        ch
        for ch in value
        if ch.isalpha() and not unicodedata.name(ch, "").startswith("CYRILLIC")
    ]


def _same_word(a: str, b: str) -> bool:
    """Casefolded, accent-insensitive equality -- ё and е are one word here."""
    return _fold(a) == _fold(b)


def _fold(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.casefold().replace("ё", "е"))
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def import_ru_surah_names(db_path: Path, tsv_path: Path = TSV_PATH) -> ImportSummary:
    """Write every row in one transaction. Upsert, so a re-run is a no-op."""
    rows = load_rows(tsv_path)
    # sqlite3.connect CREATES an empty file for a path that does not exist, so
    # a mistyped --db (or the default, run from packages/scraper, where
    # quran.db is a stale stub with no surah_names) would leave a new file
    # behind and fail on the insert instead of saying what was wrong. The live
    # corpus is apps/web/quran.db.
    if not db_path.is_file():
        raise FileNotFoundError(
            f"{db_path}: no such database -- the live corpus is apps/web/quran.db"
        )
    con = sqlite3.connect(db_path)
    try:
        con.execute("PRAGMA foreign_keys = ON")
        if not con.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'surah_names'"
        ).fetchone():
            raise ValueError(f"{db_path}: no surah_names table -- not the corpus DB")
        with con:
            # The FK target. `ru` is already on the live DB; this keeps a fresh
            # one importable without a separate seeding step, and ON CONFLICT
            # DO NOTHING leaves an existing row's own wording alone.
            con.execute(
                """INSERT INTO languages (code, name_native, name_english, direction)
                   VALUES (?, 'Русский', 'Russian', 'ltr')
                   ON CONFLICT(code) DO NOTHING""",
                (LANGUAGE_CODE,),
            )
            for row in rows:
                con.execute(
                    """INSERT INTO surah_names (surah_id, language_code, name, meaning)
                       VALUES (?, ?, ?, ?)
                       ON CONFLICT(surah_id, language_code) DO UPDATE SET
                         name = excluded.name, meaning = excluded.meaning""",
                    (row.surah_id, LANGUAGE_CODE, row.name, row.meaning),
                )
    finally:
        con.close()
    return ImportSummary(
        written=len(rows),
        overridden=len(_OVERRIDES),
        meanings_dropped=sum(1 for row in rows if row.meaning is None),
    )
