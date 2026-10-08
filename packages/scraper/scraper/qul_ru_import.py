"""Import Quran Academy's Russian word-by-word (QUL resource 97) from the raw snapshot.

Shipped under the owner's 2026-10-07 override of #116, before a written grant: see
docs/plans/phase-m13-russian-wbw.md for the credit wording and the removal runbook.
The snapshot was scraped once (rate-limited, resumable) and is only ever re-parsed.
"""

from __future__ import annotations

import gzip
import html
import re
import sqlite3
import unicodedata  # validate_ru_gloss: control/format-character category
import zlib
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import NamedTuple

from .db import ScraperDatabase
from .tasnim_align import base_form, corpus_ayahs
from .tasnim_import import strip_arabic_marks, validate_gloss

SOURCE = "quranacademy"
LANGUAGE = "ru"
SNAPSHOT_PATH = Path.home() / "quran-data/refdata/qul-ru-wbw/qul_ru_wbw.sqlite"

# Proven over all 6,236 pages. Most drift in QUL's markup surfaces as an AlignError
# (cards unused, or a word unmatched). A card lost mid-ayah does not: its word is
# absorbed as covered, the same shape as a real span.
_CARD = re.compile(
    r"qpc-hafs[^>]*>(.*?)</div>\s*"
    r'<div class="text-sm text-gray-600 russian">(.*?)</div>',
    re.S,
)
_TAG = re.compile(r"<[^>]+>")


class AlignError(ValueError):
    """An ayah whose cards cannot be mapped onto our words."""


class Row(NamedTuple):
    word_id: int
    gloss: str  # raw card text, uncleaned
    head: int  # word_id that owns the card; == word_id unless covered


def _text(fragment: str) -> str:
    # HTML text normalization (tags, entities, source indentation), not gloss cleaning.
    return " ".join(html.unescape(_TAG.sub("", fragment)).split())


def parse_cards(page: str) -> list[tuple[str, str]]:
    return [(_text(ar), _text(ru)) for ar, ru in _CARD.findall(page)]


_KAANNA = base_form("كَأَن")


def same_word(card: str, ours: str) -> bool:
    # QUL writes كَأَن as «كَأَنأَن» in 7 ayahs. Only that word: a general "repeated
    # tail" rule would also accept a misaligned card (من against منن).
    return card == ours or (ours == _KAANNA and card == base_form("كَأَنأَن"))


def align_ayah(
    cards: Sequence[tuple[str, str]], words: Sequence[tuple[int, str]]
) -> list[Row]:
    """Walk both lists by base form. A word with no card of its own is covered by the
    previous card's gloss (QUL glosses some phrases once). Raises on anything else."""
    rows: list[Row] = []
    j = 0
    head: int | None = None
    gloss = ""
    for word_id, arabic in words:
        if j < len(cards) and same_word(base_form(cards[j][0]), base_form(arabic)):
            head, gloss = word_id, cards[j][1]
            j += 1
        elif head is None:
            raise AlignError(f"word {word_id} matches no card")
        rows.append(Row(word_id, gloss, head))
    if j != len(cards):
        raise AlignError(f"{len(cards) - j} cards unused")
    return rows


# The Latin look-alikes measured in the snapshot (9 cards). Any other Latin letter
# is refused by validate_ru_gloss, so new drift aborts instead of being rewritten.
_HOMOGLYPHS = "ACKc"
_TO_CYRILLIC = str.maketrans(_HOMOGLYPHS, "АСКс")
_LATIN = re.compile(r"[A-Za-z]")
_EDGE_SLASH = re.compile(r"^/+|/+$")
# Sentence punctuation the verse needed, not the word. Repeated, so ", -" goes too
# (en dash, em dash). ! and ? stay (owner R9): they carry tone.
_TRAILING = re.compile(r"(?:\s*[,.;:–—])+$")


def clean_ru_gloss(text: str) -> str:
    # R21: a stray tanween inside a Russian word (44:2); U+00AD is invisible and
    # breaks search (20 cards).
    text = strip_arabic_marks(text).replace("\u00ad", "")
    latin = set(_LATIN.findall(text))
    # Only when every Latin letter is a look-alike: a real Latin word is not ours to
    # rewrite, and validate_ru_gloss refuses it instead.
    if latin and latin <= set(_HOMOGLYPHS):
        text = text.translate(_TO_CYRILLIC)
    text = _EDGE_SLASH.sub("", text).strip()
    # `or text`: R20, the particle أَن is glossed as a bare ":" on 38 cards. The
    # strip never empties a gloss, so those keep ":" (and "/" is already "").
    return _TRAILING.sub("", text) or text


def validate_ru_gloss(text: str) -> str | None:
    """Why this gloss may not be written, or None. §3: third-party data."""
    reason = validate_gloss(text)
    if reason is not None:
        return reason
    if (m := _LATIN.search(text)) is not None:
        return f"latin character {m.group()!r}"
    # Cf too: zero-width and bidi marks are invisible, break search like U+00AD did,
    # and a bidi override can reverse the gloss on screen.
    if any(unicodedata.category(c)[0] == "C" for c in text):
        return "control or format character"
    return None


# The name is the plan's public contract (cli.py, tests), a verdict rather than a fault.
class ImportAborted(RuntimeError):  # noqa: N818
    """Validation failed; nothing was written."""


class ImportSummary(NamedTuple):
    rows: int  # word_glosses rows written (== corpus words)
    cards: int  # distinct glosses (== heads)
    groups: int  # multi-word spans
    backup: Path


_MAX_REPORTED = 20


def _plan(
    words: dict[tuple[int, int], list[tuple[int, str]]],
    con: sqlite3.Connection,
    snapshot: sqlite3.Connection,
) -> list[tuple[int, str, int | None]]:
    """Every (word_id, gloss, group) to write, or ImportAborted listing what failed."""
    pages = {
        (s, a): gz
        for s, a, gz in snapshot.execute("SELECT surah, ayah, html_gz FROM raw")
    }
    # R7, checked here rather than left to the INSERT's UNIQUE failure: refused with a
    # reason, and before the backup, so a refused run leaves no .bak behind.
    foreign = con.execute(
        "SELECT COUNT(*) FROM word_glosses WHERE language_code = ? AND source IS NOT ?",
        (LANGUAGE, SOURCE),
    ).fetchone()[0]
    errors = (
        [f"{foreign} ru rows from other sources; refusing to share 'ru' with them"]
        if foreign
        else []
    )
    errors += [
        f"{s}:{a} missing from snapshot" for s, a in sorted(words.keys() - pages.keys())
    ]
    errors += [f"{s}:{a} not in corpus" for s, a in sorted(pages.keys() - words.keys())]
    out: list[tuple[int, str, int | None]] = []
    group = 0
    for key in sorted(words.keys() & pages.keys()):
        try:
            rows = align_ayah(
                parse_cards(gzip.decompress(pages[key]).decode()), words[key]
            )
        # A corrupt page is one more listed problem, not a traceback hiding the rest.
        except (AlignError, OSError, EOFError, zlib.error, UnicodeDecodeError) as err:
            errors.append(f"{key[0]}:{key[1]} {err}")
            continue
        by_head: dict[int, list[Row]] = {}
        for row in rows:
            by_head.setdefault(row.head, []).append(row)
        for head, members in by_head.items():
            gloss = clean_ru_gloss(members[0].gloss)
            if (reason := validate_ru_gloss(gloss)) is not None:
                errors.append(
                    f"{key[0]}:{key[1]} word {head}: {reason}: {members[0].gloss!r}"
                )
                continue
            marker = None
            if len(members) > 1:
                group += 1
                marker = group
            out += [(m.word_id, gloss, marker) for m in members]
    if errors:
        raise ImportAborted(
            f"{len(errors)} problems, nothing written:\n"
            + "\n".join(errors[:_MAX_REPORTED])
        )
    return out


def import_qul_ru(corpus_db: Path, snapshot: Path = SNAPSHOT_PATH) -> ImportSummary:
    target = corpus_db.resolve()  # apps/web/quran.db is a symlink
    if not snapshot.is_file():
        raise ImportAborted(f"snapshot not found: {snapshot}")
    words = corpus_ayahs(target)  # tasnim_align's reader, read-only
    database = ScraperDatabase(str(target))
    con = database.connection
    con.execute("PRAGMA foreign_keys = ON")
    # as_uri() percent-encodes, so a ? or # in the path cannot open another file.
    snap = sqlite3.connect(f"{snapshot.resolve().as_uri()}?mode=ro", uri=True)
    try:
        # Aborts before any data write and before the backup. ScraperDatabase above has
        # already run its additive migrations; on the live DB those are no-ops.
        planned = _plan(words, con, snap)
        # Timestamped to the microsecond, never overwritten: a re-run (R7) must not
        # replace the pre-M13 copy with the state of the first import.
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%f")
        backup = target.with_name(f"{target.name}.bak-m13-{stamp}")
        if backup.exists():
            raise ImportAborted(f"{backup} already exists")
        # backup(), not copyfile: the live DB is WAL-mode, and a byte copy
        # drops the WAL.
        dst = sqlite3.connect(backup)
        try:
            con.backup(dst)
        finally:
            dst.close()
        with con:
            # The FK target. Present on the live DB; INSERT OR IGNORE so a fresh DB
            # imports and an existing row's names are never rewritten.
            con.execute(
                "INSERT OR IGNORE INTO languages"
                " (code, name_native, name_english, direction)"
                " VALUES ('ru', 'Русский', 'Russian', 'ltr')"
            )
            con.execute(
                "DELETE FROM word_glosses WHERE language_code = ? AND source = ?",
                (LANGUAGE, SOURCE),
            )
            # Plain INSERT stays as a second line behind _plan's check: anything that
            # still collides on UNIQUE(word_id, language_code) rolls the run back.
            con.executemany(
                "INSERT INTO word_glosses"
                " (word_id, language_code, gloss_text, source, gloss_group)"
                " VALUES (?, ?, ?, ?, ?)",
                [(wid, LANGUAGE, gloss, SOURCE, grp) for wid, gloss, grp in planned],
            )
    finally:
        snap.close()
        database.close()
    groups = len({g for _, _, g in planned if g is not None})
    # One card per single-word row plus one per span.
    cards = sum(1 for _, _, g in planned if g is None) + groups
    return ImportSummary(rows=len(planned), cards=cards, groups=groups, backup=backup)
