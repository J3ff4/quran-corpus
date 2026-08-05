"""Read Salmoné's Arabic-English Dictionary from Perseus's TEI.

Perseus's `robots.txt` is `Disallow: /` with a five-path allow-list, and
`/hopper/text` is explicitly commented out of it for this and every other AI
user-agent (checked 2026-08-03). So this source never crawls Perseus: it takes
the one tarball Perseus publishes for download and reads it locally (§11).

The advertised download URL truncates -- the server sends no Content-Length,
closes the connection between 0.6 and 1.6 MB, and answers a Range request with
`200` rather than `206`, so resume cannot work. Six attempts across curl and
wget, rate-limited and not, all failed. WAYBACK_TARBALL is a snapshot of the
same file that transfers whole; it is pinned by timestamp, so what it serves
cannot change under us.

§11's rate limit binds crawls -- the corpus scraper, which walks thousands of
pages and paces itself. This module issues at most one request per call, for
one archived file: an ordinary run short-circuits on the file already being on
disk, and only `force=True` re-fetches, which is an operator re-running the
command by hand. Neither path builds a sequence to pace, so no pacing is
applied here.

Licence: Salmoné (1889) is public domain by age; Perseus's CC BY-SA 3.0 US
covers their digitisation and markup. We take sense text, never their markup.
The credit lives in apps/web/src/app/about/page.tsx.
"""

from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path

from ..salmone_gloss import entry_senses
from .perseus_keys import key_candidates, normalise_key

__all__ = [
    "ANCHORS",
    "EXPECTED_ROOTS",
    "MAX_MEMBER_BYTES",
    "SALMONE_MEMBER",
    "WAYBACK_TARBALL",
    "build_index",
    "download_salmone",
    "entry_senses",
    "lookup",
]

WAYBACK_TARBALL = (
    "https://web.archive.org/web/20241101223146if_/"
    "http://www.perseus.tufts.edu/hopper/opensource/downloads/texts/"
    "hopper-texts-Arabic.tar.gz"
)
SALMONE_MEMBER = "Arabic/Salmone/opensource/salmone.xml"

# The member is 28.9 MB in the pinned snapshot and the URL is frozen by
# timestamp, so this is headroom, not a guess. It exists because a tar header
# declares a member's size and `extractfile().read()` believes it: a small
# archive can name a huge member and expand into memory unbounded. Checking the
# declared size costs nothing and refuses the bomb before a byte is read.
MAX_MEMBER_BYTES = 64 * 1024 * 1024

# Lookaheads, not a fixed sequence: `n` and `type` may appear in either order,
# and a positional pattern silently matches nothing rather than failing loudly.
_DIV2 = re.compile(r'<div2\b(?=[^>]*\btype="root")(?=[^>]*\bn="([^"]*)")[^>]*>')

# 18 of 6654 headings hold an inner space. Two shapes are a lead root plus
# padding that is not a key of its own -- a dash-separated alternate spelling
# (`$mET - '$mETT`, `qysr -`) or a bracketed aorist stem (`w$m [y$m]`, the
# bracket is the verb's imperfect form, not a root). Those get the lead token
# as a second, real key. Everything else with a space is a two-word phrase
# heading (`*w Alfrwp`, `ElY AlmEs`) -- Salmoné's section for words *treated
# under* a root they do not derive from, the same risk `perseus_keys.index_keys`
# documents refusing for Lane's `Quasi X` headings: keying it under the lead
# token would file a different article's text under a real root. Those stay
# whole, reachable only under the full heading (already true before this rule,
# via the bare `normalise_key` call in `build_index`).
_LEAD_TOKEN = re.compile(r"^(\S+)\s+[-\[]")

# Measured on the 2011 tarball: 6654 root `<div2>` tags collapsing to 6351
# distinct normalised keys, plus a second key for each of the 14 (of 16)
# lead-plus-alternate headings above whose lead token was not already a key on
# its own -- re-measured with `build_index(expected=None)` after the finding-3
# fix (phase-22 code-review round). The source is a frozen Wayback artefact,
# so this is an exact floor, not an estimate.
EXPECTED_ROOTS = 6365

# Count parity is not alignment: a repacked or re-edited member can hold the
# same number of normalised keys while a given root's text has moved or
# changed, and `lookup` would then hand `select_sense` the wrong article with
# no error anywhere. So four roots also carry a literal substring of their
# entry, checked after indexing. They are raw-XML substrings on purpose --
# whole, tag-free runs of sense text -- so no flattening step sits between the
# artefact and the assertion. Verified against the pinned Wayback tarball.
ANCHORS = {
    "SbE": "Pointed at, out; designated",
    "Elm": "Surpassed in knowledge",
    "rHm": "Pitied, had pity, compassion",
    "slm": "Was safe, secure",
}


def download_salmone(dest: Path, *, force: bool = False) -> Path:
    """Fetch the tarball and unpack only `salmone.xml` into ``dest``.

    Written to `.part` and replaced into position, so a file under the final
    name is a complete one -- the whole reason this function exists is that a
    truncated transfer here is the normal case, not the rare one.
    """
    import io
    import tarfile

    import httpx  # local: the index/lookup half of this module needs no network

    from ..http_retry import get_with_retry

    dest.mkdir(parents=True, exist_ok=True)
    out = dest / "salmone.xml"
    if out.exists() and not force:
        return out
    with httpx.Client(timeout=300, follow_redirects=True) as client:
        resp = get_with_retry(client, WAYBACK_TARBALL)
    with tarfile.open(fileobj=io.BytesIO(resp.content), mode="r:gz") as tar:
        # Not `tar.extractfile(SALMONE_MEMBER)`: given a name, that resolves via
        # `getmember()`, which raises `KeyError` for an absent member and
        # returns `None` only for a non-regular one (dir/link) -- so a repacked
        # Wayback snapshot missing this path would surface a bare `KeyError`
        # instead of the message below. Resolving the member explicitly first
        # makes both failure shapes hit the same, intended error.
        member = next((m for m in tar if m.name == SALMONE_MEMBER), None)
        if member is None or not member.isfile():
            raise ValueError(f"{SALMONE_MEMBER} missing from the Perseus tarball")
        if member.size > MAX_MEMBER_BYTES:
            raise ValueError(
                f"{SALMONE_MEMBER} declares {member.size} bytes, over the "
                f"{MAX_MEMBER_BYTES} cap -- the pinned snapshot holds 28.9 MB, "
                "so this is a different archive; do not expand it"
            )
        extracted = tar.extractfile(member)
        assert extracted is not None  # isfile() above guarantees this
        payload = extracted.read()
    # A unique scratch name per call, not a fixed `salmone.xml.part`: two
    # `--force` runs against one `dest` would otherwise share it, and the
    # second writer's truncate-and-write would be visible to the first's
    # replace -- publishing a half-written file under the final name, which is
    # the single failure this function exists to prevent.
    fd, tmp_name = tempfile.mkstemp(dir=dest, prefix="salmone.xml.", suffix=".part")
    part = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
        # replace, not rename: under `force` the final name already exists, and
        # Path.rename raises FileExistsError for that on Windows.
        part.replace(out)
    except BaseException:
        part.unlink(missing_ok=True)
        raise
    return out


def build_index(
    xml_path: Path,
    *,
    expected: int | None = EXPECTED_ROOTS,
    anchors: dict[str, str] = ANCHORS,
) -> dict[str, str]:
    """Map normalised root key -> that root's `<div2>` XML.

    First writer wins, matching `lane_tei.build_index`. Salmoné is one file with
    no Supplement volume, so there is no stub-outranks-entry rule to mirror.

    ``expected`` is the completeness gate; pass the fixture's own count in tests
    and ``None`` only when a caller genuinely does not know the size.
    ``anchors`` is the alignment gate that count parity cannot give -- pass
    ``{}`` for a synthetic fixture, whose roots are not the real ones.
    """
    text = Path(xml_path).read_text(encoding="utf-8")
    index: dict[str, str] = {}
    for match in _DIV2.finditer(text):
        end = text.find("</div2>", match.end())
        if end == -1:
            continue
        name = match.group(1)
        body = text[match.start() : end + 7]
        index.setdefault(normalise_key(name), body)
        lead = _LEAD_TOKEN.match(name.strip())
        if lead is not None:
            index.setdefault(normalise_key(lead.group(1)), body)
    # A truncated download still parses. An empty index reads downstream as
    # "Salmoné covers none of our roots"; a *partial* one is worse, because it
    # reads as a successful run that just happens to fill fewer roots -- and
    # truncation is the normal failure here, not the rare one. So gate on the
    # measured key count, not on emptiness.
    if expected is not None and len(index) != expected:
        raise ValueError(
            f"{xml_path} yielded {len(index)} root keys, expected "
            f"{expected} -- source truncated or changed; re-run "
            "`fetch-salmone --force`"
        )
    for key, excerpt in anchors.items():
        entry = index.get(key)
        if entry is None or excerpt not in entry:
            raise ValueError(
                f"{xml_path} indexed {len(index)} root keys but root {key!r} "
                f"does not hold {excerpt!r} -- the member changed under the "
                "pinned snapshot, or the heading rules stopped matching it; "
                "re-check before trusting any gloss from this run"
            )
    return index


def lookup(index: dict[str, str], bw: str) -> str | None:
    """Entry XML for ``bw``, trying Perseus's indexing conventions in order."""
    return next(
        (index[k] for c in key_candidates(bw) if (k := normalise_key(c)) in index),
        None,
    )
