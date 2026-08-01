"""Persist raw scraped HTML so re-parsing never requires a re-fetch.

CLAUDE.md §11 asks for this. It was not happening for root pages, which is
why diagnosing the single-form parser gap in Phase 17 needed live requests.
"""

from __future__ import annotations

import gzip
import string
from collections.abc import Iterator
from pathlib import Path
from urllib.parse import unquote

# Everything outside this set is percent-encoded. Uppercase is deliberately
# excluded: Buckwalter separates roots by letter case alone (t/T, d/D, s/S,
# z/Z, h/H, y/Y), which is 137 collision groups across the 1642 real roots --
# on a case-insensitive filesystem (APFS, NTFS) each group would collapse to
# one file and silently lose the rest of the archive.
_SAFE = frozenset(string.ascii_lowercase + string.digits + "-_.")

# Key namespace for root pages. One archive holds several page types, so both
# the writers (dictionary_scrape, the checkpoint it shares keys with) and the
# readers (replay, prepare_corpus_form_glosses) have to agree on this string;
# it lives here because this module owns the key<->filename mapping.
ROOT_PREFIX = "root_"


def _encode_key(key: str) -> str:
    """Percent-encode ``key`` into a case-insensitively unique filename.

    Reversible via ``urllib.parse.unquote``. Encoding beats character
    stripping because Buckwalter roots use ``$ ' > < & } *`` -- stripping
    would collide ``$El`` with ``'El``.
    """
    return "".join(
        c if c in _SAFE else "".join(f"%{b:02X}" for b in c.encode("utf-8"))
        for c in key
    )


def has_snapshot(root_dir: str | Path, key: str) -> bool:
    """True when ``key`` is already archived under the current encoding."""
    return (Path(root_dir) / f"{_encode_key(key)}.html.gz").exists()


def save_snapshot(root_dir: str | Path, key: str, html: str) -> Path:
    """Write ``html`` to ``<root_dir>/<encoded key>.html.gz``. Overwrites."""
    d = Path(root_dir)
    d.mkdir(parents=True, exist_ok=True)
    path = d / f"{_encode_key(key)}.html.gz"
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        fh.write(html)
    return path


def _decode_name(path: Path) -> str:
    return unquote(path.name.removesuffix(".html.gz"))


def _scan(root_dir: str | Path) -> dict[str, list[Path]]:
    """Map each decoded key to every filename archived under it, name-sorted.

    One scan shared by all three readers below, so the glob pattern and the
    decoding rule cannot drift apart between them.
    """
    grouped: dict[str, list[Path]] = {}
    for path in sorted(Path(root_dir).glob("*.html.gz")):
        grouped.setdefault(_decode_name(path), []).append(path)
    return grouped


def read_snapshot(path: str | Path) -> str:
    """Decompress one snapshot.

    A damaged file raises one of four unrelated types: OSError (missing,
    bad magic -- BadGzipFile subclasses it), EOFError (truncated stream),
    zlib.error (corrupt deflate blocks under an intact header), or
    UnicodeDecodeError (valid gzip, non-UTF-8 payload). Only the first two
    are OSError-ish; callers that skip damaged snapshots must catch all four
    or a single bit-flip aborts the whole archive.
    """
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return fh.read()


def iter_snapshot_paths(root_dir: str | Path) -> Iterator[tuple[str, Path]]:
    """Yield ``(key, path)`` once per key, preferring the canonical filename.

    One key can own two files: ``legacy_names_to_migrate`` refuses to clobber,
    so a legacy name survives beside a current-encoder one. Yielding both would
    let filename order decide which wins -- and '%' (0x25) sorts before 'A'
    (0x41), so the stale legacy copy would be applied last and silently revert
    the fresh one. The canonical name is always the fresher of the two: only
    the current encoder writes it.
    """
    for key, paths in sorted(_scan(root_dir).items()):
        canonical = f"{_encode_key(key)}.html.gz"
        yield key, next((p for p in paths if p.name == canonical), paths[0])


def iter_root_snapshot_paths(root_dir: str | Path) -> Iterator[tuple[str, Path]]:
    """Yield ``(root_buckwalter, path)`` for the root pages in the archive.

    One archive holds several page types (``root_*``, ``word_*``, ``ayah_*``),
    so every root-page consumer needs the same prefix filter and the same
    strip. That belongs here with the rest of the key convention rather than
    copied into each caller (§3): a reader that forks it can drift from the
    writer that produced the keys.
    """
    for key, path in iter_snapshot_paths(root_dir):
        if key.startswith(ROOT_PREFIX):
            yield key[len(ROOT_PREFIX) :], path


def iter_snapshots(root_dir: str | Path) -> Iterator[tuple[str, str]]:
    """Yield ``(key, html)`` for every snapshot.

    The key is decoded straight back out of the filename, which is why
    ``_encode_key`` must stay reversible -- this is the read half of the
    §11 promise that re-parsing never needs a re-fetch.
    """
    for key, path in iter_snapshot_paths(root_dir):
        yield key, read_snapshot(path)


def duplicate_key_names(root_dir: str | Path) -> list[tuple[str, list[str]]]:
    """Keys archived under more than one filename, as ``(key, [names])``.

    These are what the migration declines to touch. Silence about them is how
    an operator concludes the archive is clean and then replays a stale copy.
    """
    return [
        (key, [p.name for p in paths])
        for key, paths in sorted(_scan(root_dir).items())
        if len(paths) > 1
    ]


def legacy_names_to_migrate(root_dir: str | Path) -> list[tuple[str, str]]:
    """Renames ``migrate_legacy_names`` would perform. Pure; no side effects.

    A name needs migrating when it is not what ``_encode_key`` would produce
    for its own decoded key -- i.e. it was written by the pre-``bdd7e7b``
    encoder that left uppercase literal.
    """
    pending: list[tuple[str, str]] = []
    for key, paths in sorted(_scan(root_dir).items()):
        canonical = f"{_encode_key(key)}.html.gz"
        # The canonical name already sitting in this group means both names are
        # present: one is fresher and the filename cannot say which, so leave
        # every file in the group rather than destroy one.
        if any(p.name == canonical for p in paths):
            continue
        pending.extend((p.name, canonical) for p in paths)
    return pending


def migrate_legacy_names(root_dir: str | Path) -> list[tuple[str, str]]:
    """Rename snapshots written before the encoder gained uppercase escaping.

    The old encoder left uppercase literal, the current one percent-encodes
    it, so one root can end up with two files. Idempotent.
    """
    d = Path(root_dir)
    moved: list[tuple[str, str]] = []
    for old, new in legacy_names_to_migrate(d):
        # Re-check per rename, not once at scan time: two distinct legacy names
        # can decode to the same key, so neither sees the other's target until
        # the first rename creates it. Path.rename replaces silently on POSIX,
        # which would destroy the second snapshot without a word.
        if (d / new).exists():
            continue
        (d / old).rename(d / new)
        moved.append((old, new))
    return moved
