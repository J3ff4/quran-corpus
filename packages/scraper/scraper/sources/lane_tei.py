"""Read Lane's Lexicon from Perseus's own TEI XML.

Perseus publishes the lexicon as 36 TEI volumes; this reads them instead of
scraping the Hopper. The Hopper's ``root=`` parameter discards Buckwalter case,
so a spike of 11 fetches returned 7 wrong roots or wrong dictionaries -- each a
plausible neighbouring entry, so the failure is silent. The XML has case in both
the filename (``_S0`` ص vs ``s0`` س) and the entry key, so that whole class of
error cannot occur here.

Licence (stated in every volume): free redistribution provided Perseus is
credited, the availability statement is left intact, and modifications are
offered back. The credit lives in apps/web/src/app/about/page.tsx.
"""

from __future__ import annotations

import re
from pathlib import Path

from ..lane_gloss import extract_gloss

# Pinned to a commit, not `master`: a mirror update would otherwise change what
# `fetch-lane-tei` downloads and silently re-derive different glosses with no code
# change. A commit URL is content-addressed, so the 36 volumes behind it cannot
# move -- which is what per-file checksums would have been buying. Moving the pin
# is a reviewed edit, and `--force` re-fetches when it moves.
RAW_BASE = (
    "https://raw.githubusercontent.com/laneslexicon/lexicon_xml/"
    "f3c19fb29f2cf2e12de3f97b7ce2b7a0d6682ea6"
)

# The 36 volumes. An underscore prefix marks the emphatic/long letter: _S0 is ص
# where s0 is س, _Z0 ظ vs z0 ز, _D0 ض vs d0 د, _T0 ط vs t0 ت. `$0` is ش. Several
# letters split across two files (k0/k1), which is why callers index every file
# rather than deriving one filename from a root.
VOLUMES: tuple[str, ...] = (
    "$0.xml", "_0.xml", "_A0.xml", "_D0.xml", "_E0.xml", "_H0.xml", "_S0.xml",
    "_T0.xml", "_Y0.xml", "_Y1.xml", "_Z0.xml", "b0.xml", "d0.xml", "f0.xml",
    "g0.xml", "h0.xml", "h1.xml", "j0.xml", "k0.xml", "k1.xml", "l0.xml",
    "l1.xml", "m0.xml", "m1.xml", "n0.xml", "n1.xml", "q0.xml", "q1.xml",
    "r0.xml", "s0.xml", "t0.xml", "v0.xml", "w0.xml", "w1.xml", "x0.xml",
    "z0.xml",
)

_DIV2 = re.compile(r"<div2\b[^>]*>")
_N_ATTR = re.compile(r'\bn="([^"]*)"')
_HAMZA_MARKS = re.compile(r"[\^`]")
# Lane files root entries under a shared heading -- `Sgw and SgY`, `Dbw or DbY`
# -- because the two spellings are one article. The `n` is the heading verbatim.
# 280 of the 5317 headings hold a space; `and`/`or` are the two that name a
# second spelling of the same root.
_JOINED = re.compile(r"\s+(?:and|or)\s+")


def download_volumes(
    dest: Path, *, force: bool = False, rate_limit: float = 1.5
) -> list[Path]:
    """Fetch the 36 TEI volumes into ``dest``. Idempotent unless ``force``.

    Each volume is written to ``.part`` and renamed into place, so a file under
    its final name is a complete one -- a size threshold cannot tell a truncated
    6.5 MB volume from a whole 46 KB one, and the resume path would then skip it
    and let ``build_index`` drop every root after the tear (CLAUDE.md §11).

    ``rate_limit`` is the §11 pause between fetches, matching
    ``corpus_quran.scrape_chapter``. ``get_with_retry`` only spaces out *failed*
    attempts, so without this 67 MB leaves in one tight burst. The pause is
    charged per fetch, never per volume: a resumed run skipping 35 present files
    must not sleep 35 times for nothing. ``raw.githubusercontent.com`` serves no
    ``robots.txt`` (404, checked 2026-08-03), so nothing there is disallowed --
    the rate limit is the part of §11 that still binds.
    """
    import math
    import time

    import httpx  # local: the index/lookup half of this module needs no network

    from ..http_retry import get_with_retry

    if not math.isfinite(rate_limit) or rate_limit < 0:
        # Up front, before any side effect: `time.sleep` rejects these too, but
        # only after volume 1 is on disk, and `inf` it does not reject at all --
        # the run just hangs looking like a slow mirror.
        raise ValueError(f"rate_limit must be finite and >= 0, got {rate_limit!r}")

    dest.mkdir(parents=True, exist_ok=True)
    out: list[Path] = []
    fetched = 0
    with httpx.Client(timeout=120, follow_redirects=True) as client:
        for name in VOLUMES:
            path = dest / name
            if path.exists() and not force:
                out.append(path)
                continue
            if fetched:
                time.sleep(rate_limit)
            resp = get_with_retry(client, f"{RAW_BASE}/{name}")
            part = path.with_name(path.name + ".part")
            part.write_bytes(resp.content)
            # replace, not rename: under `force` the final name already exists,
            # and Path.rename raises FileExistsError for that on Windows.
            part.replace(path)
            fetched += 1
            out.append(path)
    return out


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


def build_index(xml_dir: Path) -> dict[str, str]:
    """Map normalised Lane key -> that root's ``<div2>`` XML, across all volumes.

    First *glossable* writer wins. The ``*1.xml`` volumes (h1, k1, l1, m1, n1,
    q1, w1, _Y1) are Lane's *Supplement*, and the base volume often holds only a
    ``See Supplement`` stub. Re-derived from the volumes: 106 keys are
    duplicated, 190 have a stub as first writer, and **20** are both -- those 20
    index entries are what this rule changes (h0's `hzm` is 285 bytes of stub
    against h1's 2816-byte entry). The other 170 stubs have no substantive
    entry anywhere and stay as they are.

    The test is "yields no gloss" rather than "is a `See Supplement` stub"
    because ``normalise_key`` merges hamza-seat spellings, and for 5 of the 8
    pairs it merges the seat-less member is a bare cross-reference: bwA (بوأ,
    3:121) is empty while ``bwA^`` holds "He returned, went back, or came back,
    to it". A stub-only test leaves the empty one in the index.

    One exception to first-writer-wins: a root's own ``<div2>`` outranks a
    ``X and Y`` heading it shares with another root, whichever came first. Two
    keys hit this in the real volumes -- Hyw loses to the ``HY: or HY and Hyw``
    article and jr*q to ``jrdq and jr*q``. Neither is a corpus root today, so no
    shipped row moves; the rule is that a dedicated entry is about that root and
    a shared one is only partly about it.
    """
    files = sorted(Path(xml_dir).glob("*.xml"))
    missing = sorted(set(VOLUMES) - {p.name for p in files})
    if missing:
        # A directory holding one XML yields a small non-empty index, which
        # slips past build_rows' empty-index guard and reports a near-total
        # not_in_lane run as a success.
        raise ValueError(
            f"{xml_dir} is missing {len(missing)} Lane volume(s) "
            f"({', '.join(missing[:5])}...) -- run `fetch-lane-tei`"
        )
    index: dict[str, str] = {}
    shared: set[str] = set()  # keys currently held by a joined-heading entry
    for path in files:
        text = path.read_text(encoding="utf-8")
        for match in _DIV2.finditer(text):
            tag = match.group(0)
            if 'type="root"' not in tag:
                continue
            name = _N_ATTR.search(tag)
            if not name:
                continue
            end = text.find("</div2>", match.end())
            if end == -1:
                continue
            body = text[match.start() : end]
            keys = index_keys(name.group(1))
            dedicated = len(keys) == 1
            for key in keys:
                existing = index.get(key)
                if existing is not None and extract_gloss(existing):
                    # Held, and only a dedicated entry that glosses may take it
                    # from a shared one.
                    if not (dedicated and key in shared and extract_gloss(body)):
                        continue
                index[key] = body
                if dedicated:
                    shared.discard(key)
                else:
                    shared.add(key)
    return index


def lookup_key(index: dict[str, str], bw: str) -> str | None:
    """The Lane key holding ``bw``, or None -- what the human gate reviews."""
    return next(
        (k for c in key_candidates(bw) if (k := normalise_key(c)) in index), None
    )


def lookup(index: dict[str, str], bw: str) -> str | None:
    """Entry XML for ``bw``, trying Lane's indexing conventions in order."""
    key = lookup_key(index, bw)
    return None if key is None else index[key]
