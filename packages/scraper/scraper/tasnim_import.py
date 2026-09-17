"""Import Tasnim's Uzbek word-by-word, verse translation and surah names.

Reads the third-party reference database read-only and writes the corpus DB in
ONE transaction. Not checkpointed, against the plan's Task 5 Step 3: §11's
resumability rule is about scraping corpus.quran.com, where a re-run costs
hours of rate-limited network. This is a local DB-to-DB pass measured in
seconds, and there an atomic write is strictly safer -- a half-finished
resumable import is indistinguishable from a completed one, because every row
it writes is an upsert keyed UNIQUE(word_id, language_code).
"""

from __future__ import annotations

import json
import re
import sqlite3
import unicodedata
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import NamedTuple

from .db import ScraperDatabase
from .tasnim_align import Group, Override, align_all
from .translit_uz_cyrl import to_cyrillic

# A gloss is a word's meaning, not a sentence. The longest legitimate one in
# the Tasnim data is well inside this; a row over it is a verse translation
# that wandered into the word column.
MAX_GLOSS_LEN = 120

_MARKUP = re.compile(r"<[^>]*>")
_WHITESPACE = re.compile(r"\s+")

# Arabic blocks: base, supplement, extended-A, and both presentation forms.
# An Uzbek gloss containing any of these is not a gloss -- Tasnim has rows with
# the Arabic sitting in the translation column (4:36).
_ARABIC_RANGES = (
    (0x0600, 0x06FF),
    (0x0750, 0x077F),
    (0x08A0, 0x08FF),
    (0xFB50, 0xFDFF),
    (0xFE70, 0xFEFF),
)


class ImportSummary(NamedTuple):
    glosses: int
    groups: int
    rejected: int
    unaligned: int
    translations: int
    surah_names: int
    mt_exported: int


def strip_markup(text: str) -> str:
    """Drop Tasnim's word-linking <b> tags and collapse the gap they leave.

    `quran.uzlat` is HTML, not text. Left alone the tags reach `translations`
    verbatim, and trg_translations_ai indexes them straight into search_fts --
    where `<b>` becomes a searchable token in every one of 6236 verses.
    """
    return _WHITESPACE.sub(" ", _MARKUP.sub("", text)).strip()


# The only Cyrillic character that appears in Tasnim's LATIN gloss column, 181
# times: a homoglyph of Latin e, indistinguishable on screen and different to
# every machine that reads it. Left alone it breaks search and sorting on 212
# words, and survives transliteration unchanged because it is already Cyrillic.
# Measured, not guessed -- no other Cyrillic codepoint occurs there at all.
_HOMOGLYPHS = str.maketrans({"\u0435": "e"})


def clean_gloss(text: str) -> str:
    """Repair what the source got wrong, before deciding whether to keep it.

    Two defects, both bounded and both measured. The homoglyph above, and
    Arabic diacritics glued onto the end of an otherwise perfect Uzbek word
    ("bu yerda" carrying a maddah). A lone combining mark is not Arabic text in
    the gloss column -- that is what validate_gloss refuses, and it still does,
    on the Arabic LETTERS that remain after this.
    """
    stripped = "".join(
        c
        for c in text.translate(_HOMOGLYPHS)
        if not (
            unicodedata.combining(c)
            and any(lo <= ord(c) <= hi for lo, hi in _ARABIC_RANGES)
        )
    )
    return _WHITESPACE.sub(" ", stripped).strip()


def validate_gloss(text: str) -> str | None:
    """Return why this gloss may not be written, or None if it may be.

    §3 validation at the boundary: this is third-party data, and all three
    failures below exist in the real file.
    """
    stripped = text.strip()
    if not stripped:
        return "empty"
    if len(stripped) > MAX_GLOSS_LEN:
        return f"too long ({len(stripped)} > {MAX_GLOSS_LEN})"
    for char in stripped:
        if any(lo <= ord(char) <= hi for lo, hi in _ARABIC_RANGES):
            return f"arabic character {char!r}"
    return None


def export_mt_glosses(con: sqlite3.Connection, path: Path) -> int:
    """Write every machine-translated Uzbek gloss to JSONL. Returns the count.

    The rows carry their surah:ayah:position, not only their word_id: word ids
    are assigned by a corpus rebuild and would not survive one, which is the
    situation this export exists for.
    """
    rows = con.execute(
        """SELECT a.surah_id, a.ayah_number, w.position, g.gloss_text
             FROM word_glosses g
             JOIN words w ON w.id = g.word_id
             JOIN ayahs a ON a.id = w.ayah_id
            WHERE g.language_code = 'uz' AND g.source = 'mt'
            ORDER BY a.surah_id, a.ayah_number, w.position"""
    ).fetchall()
    if not rows and path.exists() and path.stat().st_size:
        # Nothing left to export and a previous export is on disk. The first
        # import already moved these rows out of the DB, so that file is their
        # ONLY copy -- opening it "w" here would destroy it, and the caller's
        # count guard would pass because both sides are 0.
        return 0
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for surah, ayah, position, gloss in rows:
            handle.write(
                json.dumps(
                    {
                        "surah_id": surah,
                        "ayah_number": ayah,
                        "position": position,
                        "gloss_text": gloss,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
    return len(rows)


_LANGUAGES = (
    ("uz", "Oʻzbekcha", "Uzbek", "ltr"),
    ("uz-Cyrl", "Ўзбекча", "Uzbek (Cyrillic)", "ltr"),
)


def _write_languages(con: sqlite3.Connection) -> None:
    # Both FK targets for every row below. 'uz' already exists on the live DB;
    # the upsert keeps this runnable against a fresh one.
    con.executemany(
        """INSERT INTO languages (code, name_native, name_english, direction)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(code) DO UPDATE SET
             name_native = excluded.name_native,
             name_english = excluded.name_english,
             direction = excluded.direction""",
        _LANGUAGES,
    )


def _write_glosses(
    con: sqlite3.Connection, groups: Sequence[Group], rejects_path: Path
) -> tuple[int, int, int]:
    """Write both scripts. Returns (rows, groups written, rejected)."""
    written = 0
    kept = 0
    rejects: list[str] = []
    # A single counter across the whole import, shared by both scripts: one
    # gloss in two scripts is ONE gloss, and a reader joining uz to uz-Cyrl on
    # the group id must land on the same phrase.
    group_id = 0
    for group in groups:
        gloss = clean_gloss(group.gloss)
        reason = validate_gloss(gloss)
        if reason is not None:
            rejects.append(f"{group.word_ids[0]}\t{reason}\t{group.gloss}")
            continue
        group_id += 1
        kept += 1
        # NULL for a one-word group: "ungrouped" is the honest reading, and it
        # keeps the column meaning what its comment says for every other source.
        marker = group_id if len(group.word_ids) > 1 else None
        cyrillic = to_cyrillic(gloss)
        for word_id in group.word_ids:
            con.execute(
                """INSERT INTO word_glosses
                     (word_id, language_code, gloss_text, source, gloss_group)
                   VALUES (?, 'uz', ?, 'tasnim', ?)
                   ON CONFLICT(word_id, language_code) DO UPDATE SET
                     gloss_text = excluded.gloss_text,
                     source = excluded.source,
                     gloss_group = excluded.gloss_group""",
                (word_id, gloss, marker),
            )
            con.execute(
                """INSERT INTO word_glosses
                     (word_id, language_code, gloss_text, source, gloss_group)
                   VALUES (?, 'uz-Cyrl', ?, 'tasnim-cyrl', ?)
                   ON CONFLICT(word_id, language_code) DO UPDATE SET
                     gloss_text = excluded.gloss_text,
                     source = excluded.source,
                     gloss_group = excluded.gloss_group""",
                (word_id, cyrillic, marker),
            )
            written += 2
    rejects_path.parent.mkdir(parents=True, exist_ok=True)
    rejects_path.write_text(
        "\n".join(rejects) + ("\n" if rejects else ""), encoding="utf-8"
    )
    return written, kept, len(rejects)


def _write_surah_names(con: sqlite3.Connection, tasnim: sqlite3.Connection) -> int:
    written = 0
    rows = tasnim.execute(
        """SELECT surahNo, nameUzlat, nameUzbek, suraMeanUzlat, suraMeanUzbek
             FROM surah_name ORDER BY surahNo"""
    ).fetchall()
    for surah, name_lat, name_cyr, mean_lat, mean_cyr in rows:
        for code, name, meaning in (
            ("uz", name_lat, mean_lat),
            ("uz-Cyrl", name_cyr, mean_cyr),
        ):
            name = (name or "").strip()
            meaning = (meaning or "").strip()
            if not name:
                continue
            # Tavba means Tavba, Ixlos means Ixlos. Storing the repeat renders
            # as "Tavba (Tavba)" at every call site that shows both.
            if not meaning or _same_word(meaning, name):
                meaning = None
            con.execute(
                """INSERT INTO surah_names (surah_id, language_code, name, meaning)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(surah_id, language_code) DO UPDATE SET
                     name = excluded.name, meaning = excluded.meaning""",
                (surah, code, name, meaning),
            )
            written += 1
    return written


def _same_word(a: str, b: str) -> str | bool:
    """Casefolded, accent-insensitive equality -- Tasnim is not consistent."""
    return _fold(a) == _fold(b)


def _fold(s: str) -> str:
    decomposed = unicodedata.normalize("NFKD", s.casefold())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


# Tasnim ships the verse translation in BOTH scripts, one column each, so
# neither is transliterated here -- unlike the word-by-word, where only Latin
# exists. A reader on the Cyrillic toggle queries `uz-Cyrl` for everything.
# Positional against the SELECT below: uzlat, then uzbek.
_TRANSLATION_LANGUAGES = ("uz", "uz-Cyrl")


def _write_translations(con: sqlite3.Connection, tasnim: sqlite3.Connection) -> int:
    written = 0
    ayah_ids = {
        (surah, ayah): ayah_id
        for ayah_id, surah, ayah in con.execute(
            "SELECT id, surah_id, ayah_number FROM ayahs"
        )
    }
    for surah, ayah, *texts in tasnim.execute(
        "SELECT surahId, verseId, uzlat, uzbek FROM quran ORDER BY surahId, verseId"
    ):
        for text, language_code in zip(texts, _TRANSLATION_LANGUAGES, strict=True):
            ayah_id = ayah_ids.get((surah, ayah))
            cleaned = strip_markup(text or "")
            if ayah_id is None or not cleaned:
                continue
            con.execute(
                """INSERT INTO translations (ayah_id, language_code, translator, text)
                   VALUES (?, ?, 'Tasnim', ?)
                   ON CONFLICT(ayah_id, language_code, translator) DO UPDATE SET
                     text = excluded.text""",
                (ayah_id, language_code, cleaned),
            )
            written += 1
    return written


def import_tasnim(
    corpus_db: Path,
    tasnim_db: Path,
    *,
    export_path: Path,
    rejects_path: Path,
    overrides: Mapping[str, list[Override]] | None = None,
) -> ImportSummary:
    """Import everything, in one transaction, after exporting the mt glosses.

    Order is load-bearing: `languages` before anything FKs to it, and the mt
    export before the delete that makes room for the Tasnim rows.
    """
    groups, unaligned = align_all(corpus_db, tasnim_db, overrides)

    # Through ScraperDatabase, not a bare connect: it applies schema.sql and
    # every migration first. The live corpus predates surah_names entirely and
    # predates word_glosses.gloss_group, so a raw connection fails on the first
    # insert of each -- which is exactly how this was found.
    database = ScraperDatabase(str(corpus_db))
    con = database.connection
    con.execute("PRAGMA foreign_keys = ON")
    tasnim = sqlite3.connect(f"file:{tasnim_db}?mode=ro", uri=True)
    try:
        # Outside the transaction and before it: the export is the only copy of
        # these rows once the delete below runs, so it must be on disk and
        # counted before anything is destroyed.
        expected = con.execute(
            "SELECT COUNT(*) FROM word_glosses"
            " WHERE language_code = 'uz' AND source = 'mt'"
        ).fetchone()[0]
        try:
            exported = export_mt_glosses(con, export_path)
        except OSError as err:
            raise RuntimeError(f"mt export failed, nothing deleted: {err}") from err
        if exported != expected:
            raise RuntimeError(
                f"mt export wrote {exported} of {expected} rows -- refusing to "
                "delete glosses that have no copy"
            )

        with con:
            _write_languages(con)
            # UNIQUE(word_id, language_code) means mt and Tasnim cannot coexist
            # under 'uz'; the upsert would overwrite most of them anyway, and
            # leave a silent residue of mt rows on words Tasnim does not reach.
            # mt, because Tasnim replaces it. tasnim/tasnim-cyrl, because
            # `gloss_group` is renumbered from 1 on every run: a row left
            # behind on a word this run no longer reaches keeps a group id
            # that now belongs to an unrelated phrase.
            con.execute(
                "DELETE FROM word_glosses WHERE source IN"
                " ('mt', 'tasnim', 'tasnim-cyrl')"
            )
            written, kept, rejected = _write_glosses(con, groups, rejects_path)
            translations = _write_translations(con, tasnim)
            names = _write_surah_names(con, tasnim)
    finally:
        tasnim.close()
        database.close()

    return ImportSummary(
        glosses=written,
        groups=kept,
        rejected=rejected,
        unaligned=len(unaligned),
        translations=translations,
        surah_names=names,
        mt_exported=exported,
    )
