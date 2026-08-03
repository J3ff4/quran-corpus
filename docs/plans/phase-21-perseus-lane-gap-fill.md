# Phase 21 — Perseus Lane Gap Fill

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the 256 roots that hold no Lane definition a real Lane gloss, taken from Perseus's own TEI XML of the lexicon and reduced deterministically — no LLM, no scraping, no replacement of existing rows.

**Architecture:** Perseus publishes Lane as 36 TEI XML volumes; they are downloaded once into the out-of-repo reference-data directory. `lane_tei.py` builds a `root_buckwalter → entry XML` index across the volumes, applying Lane's own indexing conventions. `lane_gloss.py` reduces one entry to an English gloss by reading the `<hi rend="ital">` runs Lane uses to mark definitions. A prep tool writes a TSV; the **existing** `import-lane --source perseus-lane` loads it. Web change is a rank, a label, and an `/about` credit.

**Tech Stack:** Python 3.12, httpx, click, pytest (scraper); TypeScript/vitest (`packages/data`, `apps/web`).

## Global Constraints

- **No scraping in this phase.** An earlier draft harvested the Perseus Hopper HTML; the TEI source is downloadable, so that whole approach is abandoned. Do not reintroduce it. The rationale is in "Why the source, not the site" below.
- **Never commit the XML** (§9): 36 files, 67 MB of third-party data. They live at `~/quran-data/refdata/lane-tei/`, beside the other reference data. Test fixtures are **synthetic inline TEI**, never trimmed real volumes.
- **Perseus's licence is a hard requirement, not courtesy.** Every volume carries an availability statement permitting free redistribution on three conditions: credit Perseus with the verbatim string below, leave the availability statement intact, and offer Perseus any modifications made. Task 4 discharges the credit.
  > Text provided by Perseus Digital Library, with funding from The U.S. Department of Education and The Max Planck Society.
- **Additive only.** No existing `root_definitions` row is updated or deleted. `import_lane_definitions` already uses `get_or_create_root` + upsert keyed on `(root_id, source)`, so re-runs are idempotent.
- **No schema change.** `root_definitions.source` is a free-text column.
- `packages/data` stays free of web/Next imports (§2).
- Live-DB writes need **explicit user permission** at the moment of writing (Task 5).
- Source tag is exactly `perseus-lane`. Credit label is exactly `Lane's Lexicon`.

---

## Why the source, not the site

The Hopper (`perseus.tufts.edu/hopper/text?doc=…:root=…`) is the wrong door and it fails **silently**:

- `root=` **discards Buckwalter case**, so ص/س, ط/ت, ح/خ collide. The doc ID picks the volume; the code only matches loosely inside it. In a spike of 11 fetches, **7 returned the wrong root or the wrong dictionary** — and each wrong answer is a *plausible neighbouring entry*, so nothing looks broken.
- Doc IDs span other works: `2002.02.0005` is Salmoné's dictionary, not Lane.
- It rate-limits to HTTP 429 quickly.

The TEI files have none of these properties. Case lives in the **filename** (`_S0.xml` ص vs `s0.xml` س) and again in the **entry key** (`<div2 type="root" n="SbE">`), the header names the work, and there is no rate limit. Everything the scrape plan spent two tasks defending against disappears.

## Perseus TEI source model (established by spike, 2026-08-02)

Facts the implementer cannot guess and must not re-derive:

1. **Mirror.** `github.com/laneslexicon/lexicon_xml`, branch **`master`** — the Perseus originals plus the maintainer's corrections, which is what the Lane's Lexicon desktop app ships. (`originals` holds the pristine Perseus files; `master` was chosen for text quality.) Raw file URL: `https://raw.githubusercontent.com/laneslexicon/lexicon_xml/<sha>/<name>.xml` — **pinned to a commit, not `master`**, so a mirror update cannot silently change what a re-derive reads (`RAW_BASE` in `lane_tei.py` holds the pin; moving it is a reviewed edit).
2. **Filenames encode the letter, with Buckwalter case as an underscore prefix.** `_A0` ا, `_D0` ض, `_E0` ع, `_H0` ح, `_S0` ص, `_T0` ط, `_Y0`/`_Y1` ي, `_Z0` ظ, `$0` ش, `_0` hamza — versus lowercase `b0 d0 f0 g0 h0 h1 j0 k0 k1 l0 l1 m0 m1 n0 n1 q0 q1 r0 s0 t0 v0 w0 w1 x0 z0`. Some letters split across two files (`k0`/`k1`), so **an index must read every file**, never guess one from a root.
3. **Roots are `<div2 type="root" n="SbE">` with case-exact Buckwalter keys** matching our `root_buckwalter` column directly. 5,219 root entries in total.
4. **Lane's indexing conventions must be applied or a fifth of the fill is lost.** Raw key match covers only **195 of 256** gaps; with the conventions below, **233 of 256** resolve to an entry and yield a gloss — **242 of 256** once `index_keys` also splits a joined `X and Y` heading (added in review; see Task 5).
   - **Geminates are filed under the two-letter form**: `Sdd`→`Sd`, `Srr`→`Sr`, `Sxx`→`Sx`, `Sbb`→`Sb`. Except `All`→`Al`: that key is ال, the article, so it is suppressed.
   - **Doubled quadriliterals are NOT collapsed** (corrected in final review, 2026-08-02): no `SlSl`→`Sl` convention exists — no such key is in any volume, and Lane files `lblb`/`kbkb`/`qsqs` directly. The rule produced six confidently wrong glosses (`hdhd` the hoopoe as "He demolished, threw it down").
   - **Alif maqṣūra is `Y`, not `y`**: `Sdy`→`SdY`. Weak finals also alternate `w`/`Y`.
   - **Keys carry `^` and `` ` ``** (`SA^b`, `SbA^`); strip them before comparing.
5. **Definitions are marked up.** Inside `<entryFree>`, Lane's English definition is wrapped in `<hi rend="ital">`; apparatus, sigla, authorities and cross-references are roman. This is what makes deterministic extraction viable — the `Sxr` authority preamble ("the latter on the authority of Yaakoob, thus sometimes pronounced,") that defeated regex on the HTML is simply not italic.
6. **`<entryFree>` order is not sense order.** `Sxr`'s first entry is the form-II verbal noun. `<form><itype>N</itype>` gives the verb form; entries with no `<itype>` (nouns, form I) must be tried first.
7. **Arabic inside the XML is Buckwalter transliteration** (`<foreign lang="ar">SaxorN</foreign>`), not Arabic script — so a gloss extractor never has to strip Arabic script.

**14 roots stay uncovered** and, per the user's ruling (2026-08-02), **keep the empty-state card**. This read 23 as first written; nine of those (`g$w DHw Hfw Sgw gTw gvw THw fDw fAy`) were recovered during review once `index_keys` learned to split a joined `X and Y` heading, which is the only kind of heading they live under. Seven of the remainder have no Lane entry at all — `Ayy dmw hAt hTE hlE hmn hrE`. Five of those are ه: Lane died at ق and the tail was compiled posthumously from his notes, which is the same reason ه ran 31% absent in qurandev/roots. Seven more joined them in the final-review fix wave (2026-08-02) — the six doubled quadriliterals `EsEs HSHS SlSl hdhd rfrf wsws` and `All` — because the collapse rules that had "covered" them were fabricating a different root's definition; an empty card beats a wrong one. `hzm` is no longer among them: its real entry is in the Supplement volume `h1.xml`, which first-writer-wins used to discard in favour of the base volume's `See Supplement` stub. Do not force these.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/scraper/scraper/sources/lane_tei.py` | **Create.** Download volumes; build the root index; Lane's key conventions. |
| `packages/scraper/scraper/lane_gloss.py` | **Create.** Pure TEI-entry → gloss. No I/O, no network — so it is testable and re-runnable over the vendored files without re-downloading. |
| `packages/scraper/tools/prepare_lane_glosses.py` | **Create.** Index + extract → TSV + review report. |
| `packages/scraper/scraper/cli.py` | **Modify.** Add `fetch-lane-tei`. |
| `packages/data/src/queries/roots.ts:243-248` | **Modify.** One line in `DEFINITION_SOURCE_RANK`. |
| `apps/web/src/lib/definitionSources.ts:14-18` | **Modify.** One `SOURCE_LABELS` entry. |
| `apps/web/src/app/about/page.tsx` | **Modify.** Perseus credit — licence-required. |
| `packages/scraper/tests/test_lane_tei.py` | **Create.** Key-convention + index tests. |
| `packages/scraper/tests/test_lane_gloss.py` | **Create.** Extractor tests. |
| `packages/scraper/tests/test_prepare_lane_glosses.py` | **Create.** TSV/quarantine tests. |
| `packages/data/tests/roots.test.ts` | **Modify.** Rank ordering test. |
| `apps/web/src/test/definitionSources.test.ts` | **Modify.** Label test. |

**Not created:** no snapshot-store changes. The vendored XML *is* the archive, so `snapshots.py` is untouched this phase.

---

### Task 1: Vendor the volumes and index the roots

**Files:**
- Create: `packages/scraper/scraper/sources/lane_tei.py`
- Create: `packages/scraper/tests/test_lane_tei.py`
- Modify: `packages/scraper/scraper/cli.py`

**Interfaces:**
- Produces: `VOLUMES: tuple[str, ...]`; `download_volumes(dest: Path, *, force: bool = False) -> list[Path]`; `key_candidates(bw: str) -> list[str]`; `normalise_key(k: str) -> str`; `build_index(xml_dir: Path) -> dict[str, str]` mapping normalised key → entry XML; `lookup(index: dict[str, str], bw: str) -> str | None`.

- [ ] **Step 1: Write the failing test**

```python
# packages/scraper/tests/test_lane_tei.py
from scraper.sources.lane_tei import (
    VOLUMES,
    build_index,
    key_candidates,
    lookup,
    normalise_key,
)

# Synthetic TEI -- real volumes are 67 MB of third-party data and never enter
# the repo (CLAUDE.md §9). Shape copied from _S0.xml, content invented.
VOLUME_XML = """<?xml version="1.0" encoding="UTF-8"?>
<TEI.2><text><body>
<div1 type="alphabetical letter" n="S">
  <div2 n="Sbg" type="root"><entryFree id="n1" key="Sabag"><form><orth
    lang="ar">Sabag</orth></form> (S,) <hi rend="ital">He dyed it;</hi>
    or <hi rend="ital">coloured it.</hi></entryFree></div2>
  <div2 n="Sx" type="root"><entryFree id="n2" key="Sax~"><form><orth
    lang="ar">Sax~</orth></form> <hi rend="ital">A hard rock.</hi></entryFree></div2>
  <div2 n="SdY" type="root"><entryFree id="n3" key="SadaY"><form><orth
    lang="ar">SadaY</orth></form> <hi rend="ital">It echoed.</hi></entryFree></div2>
  <div2 n="SA^b" type="root"><entryFree id="n4" key="SA^b"><form><orth
    lang="ar">SA^b</orth></form> <hi rend="ital">It hit the mark.</hi></entryFree></div2>
</div1>
</body></text></TEI.2>
"""


def test_volumes_cover_every_letter_file():
    # 36 files; the underscore prefix is what keeps emphatics apart from plain
    # letters, so losing it silently merges ص into س.
    assert len(VOLUMES) == 36
    assert "_S0.xml" in VOLUMES and "s0.xml" in VOLUMES
    assert "$0.xml" in VOLUMES


def test_normalise_key_strips_lanes_hamza_marks():
    assert normalise_key("SA^b") == "SAb"
    assert normalise_key("Sbg") == "Sbg"


def test_key_candidates_collapses_a_geminate_to_two_letters():
    assert "Sx" in key_candidates("Sxx")
    assert "Sd" in key_candidates("Sdd")


# corrected 2026-08-02 (final review): the collapse was fabricating glosses
def test_key_candidates_does_not_collapse_a_doubled_quadriliteral():
    assert key_candidates("hdhd") == ["hdhd"]


def test_key_candidates_never_offers_the_definite_article():
    assert "Al" not in key_candidates("All")


def test_key_candidates_offers_alif_maqsura():
    assert "SdY" in key_candidates("Sdy")


def test_key_candidates_always_offers_the_root_itself_first():
    assert key_candidates("Sbg")[0] == "Sbg"


def _index(tmp_path):
    (tmp_path / "_S0.xml").write_text(VOLUME_XML, encoding="utf-8")
    return build_index(tmp_path)


def test_build_index_keys_every_root_entry(tmp_path):
    assert set(_index(tmp_path)) == {"Sbg", "Sx", "SdY", "SAb"}


def test_lookup_finds_a_direct_key(tmp_path):
    assert "He dyed it" in lookup(_index(tmp_path), "Sbg")


def test_lookup_finds_a_geminate_under_its_two_letter_form(tmp_path):
    assert "A hard rock" in lookup(_index(tmp_path), "Sxx")


def test_lookup_finds_a_weak_final_under_alif_maqsura(tmp_path):
    assert "It echoed" in lookup(_index(tmp_path), "Sdy")


def test_lookup_returns_none_for_a_root_lane_lacks(tmp_path):
    assert lookup(_index(tmp_path), "hmn") is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/scraper && python -m pytest tests/test_lane_tei.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'scraper.sources.lane_tei'`

- [ ] **Step 3: Write the implementation**

```python
# packages/scraper/scraper/sources/lane_tei.py
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

RAW_BASE = "https://raw.githubusercontent.com/laneslexicon/lexicon_xml/master"

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


def download_volumes(dest: Path, *, force: bool = False) -> list[Path]:
    """Fetch the 36 TEI volumes into ``dest``. Idempotent unless ``force``."""
    import httpx  # local: the index/lookup half of this module needs no network

    dest.mkdir(parents=True, exist_ok=True)
    out: list[Path] = []
    with httpx.Client(timeout=120, follow_redirects=True) as client:
        for name in VOLUMES:
            path = dest / name
            # corrected 2026-08-02: a size threshold cannot spot a truncated
            # volume, so write .part and rename -- the final name means complete
            if path.exists() and not force:
                out.append(path)
                continue
            resp = get_with_retry(client, f"{RAW_BASE}/{name}")
            part = path.with_name(path.name + ".part")
            part.write_bytes(resp.content)
            part.rename(path)
            out.append(path)
    return out


def normalise_key(key: str) -> str:
    """Drop Lane's hamza-seat marks so ``SA^b`` compares equal to ``SAb``."""
    return _HAMZA_MARKS.sub("", key)


# `Al` is ال, the article, not a root: the geminate rule would hand it to All.
_NOT_A_ROOT = frozenset({"Al"})


def key_candidates(bw: str) -> list[str]:
    """Lane keys that may hold ``bw``, most-specific first.

    Lane does not file every root under its triliteral spelling. Geminates go
    under the two-letter form (Sxx -> Sx) and a weak final is alif maqsura `Y`
    rather than `y`. Without these, coverage of the phase-21 gap list drops from
    233/256 to 195/256. There is deliberately no doubled-quadriliteral rule and
    `Al` (the article) is never offered -- both fabricated wrong glosses.
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

    First *substantive* writer wins: the `*1.xml` volumes are Lane's Supplement
    and the base volume often holds only a `See Supplement` stub, so a stub
    never beats a real entry (corrected 2026-08-02). The directory must hold all
    36 volumes or the index is silently partial.
    """
    files = sorted(Path(xml_dir).glob("*.xml"))
    missing = sorted(set(VOLUMES) - {p.name for p in files})
    if missing:
        raise ValueError(f"{xml_dir} is missing {len(missing)} Lane volume(s)...")
    index: dict[str, str] = {}
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
            key = normalise_key(name.group(1))
            existing = index.get(key)
            if existing is None or _STUB.search(existing):  # a stub never wins
                index[key] = text[match.start() : end]
    return index


def lookup_key(index: dict[str, str], bw: str) -> str | None:
    """The Lane key holding ``bw``, or None -- what the human gate reviews."""
    return next(
        (k for c in key_candidates(bw) if (k := normalise_key(c)) in index), None
    )


def lookup(index: dict[str, str], bw: str) -> str | None:
    """Entry XML for ``bw``, trying Lane's indexing conventions in order."""
    key = lookup_key(index, bw)
    if key is not None:
        return index[key]
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/scraper && python -m pytest tests/test_lane_tei.py -v`
Expected: PASS (whole file; a pinned count goes stale the next time a review adds a case)

- [ ] **Step 5: Add the download command**

`cli.py` has no module-level `Path` import today (its commands import it locally), but
the `--dest` default is evaluated at import time, so a function-local import will not
do. Add it at the top, beside `import click`:

```python
# packages/scraper/scraper/cli.py -- line 2
from pathlib import Path
```

```python
# packages/scraper/scraper/cli.py -- append near the other fetch commands
@main.command("fetch-lane-tei")
@click.option(
    "--dest",
    default=str(Path.home() / "quran-data" / "refdata" / "lane-tei"),
    show_default=True,
    help="Where the TEI volumes land. Outside the repo: 67 MB, third-party (§9).",
)
@click.option("--force", is_flag=True, help="Re-download volumes already present.")
def fetch_lane_tei(dest: str, force: bool) -> None:
    """Download Perseus's 36 Lane TEI volumes."""
    from .sources.lane_tei import download_volumes

    paths = download_volumes(Path(dest), force=force)
    total = sum(p.stat().st_size for p in paths)
    click.echo(f"Lane TEI: {len(paths)} volumes, {total // 1024 // 1024} MB -> {dest}")
```

- [ ] **Step 6: Run it**

Run: `cd packages/scraper && python -m scraper.cli fetch-lane-tei`
Expected: `Lane TEI: 36 volumes, 67 MB -> …/quran-data/refdata/lane-tei`

- [ ] **Step 7: Commit**

```bash
git add packages/scraper/scraper/sources/lane_tei.py \
        packages/scraper/tests/test_lane_tei.py \
        packages/scraper/scraper/cli.py
git commit -m "feat(scraper): index Lane's Lexicon from Perseus TEI volumes"
```

---

### Task 2: Deterministic gloss extractor

**Files:**
- Create: `packages/scraper/scraper/lane_gloss.py`
- Create: `packages/scraper/tests/test_lane_gloss.py`

**Interfaces:**
- Produces: `entry_blocks(entry_xml: str) -> list[tuple[int, str]]` — `(verb_form, body)` per `<entryFree>`, form `0` meaning no `<itype>`; `extract_gloss(entry_xml: str, max_len: int = 220) -> str`, `""` when the entry yields none.

**Measured output (real volumes, 2026-08-02)** — the rule below is proven, not invented:

- `SlH` صلح (180 occurrences, our largest casualty) → `It, and he, was, or became, good, incorrupt, right, just, righteous, virtuous, or honest; it was or became, in a good, incorrupt, sound, right, or proper, state…`
- `Zlm` ظلم → `He did wrong; or acted wrongfully, unjustly, injuriously, or tyrannically…`
- `Sxr` صخر → `Rocks; or great masses of stone: or great masses of hard stone…` — the authority preamble that defeated HTML regex is simply not italic
- `SrH` صرح → `It was, or became, pure, sheer, free from admixture, unmingled, unmixed, genuine, or clear`
- `Slw` صلو → `I struck, or beat, that part…of the back, which is called` — **correct extraction of the wrong sense.** Lane opens صلو on form I; the Quranic prayer sense is under form II. Accepted limit of a deterministic rule, caught by Task 5's review gate, not fixed in code.

One defect to close in this task: a dangling `contr. of` survives into `SlH` and `Sdq` when the Arabic it governs is dropped.

- [ ] **Step 1: Write the failing tests**

```python
# packages/scraper/tests/test_lane_gloss.py
from scraper.lane_gloss import entry_blocks, extract_gloss

# Synthetic TEI, shaped after _S0.xml. Real volumes stay out of the repo (§9).
SIMPLE = (
    '<div2 n="Sbg" type="root"><entryFree id="n1"><form><orth lang="ar">Sabag</orth>'
    '</form> (S, A, K,) <hi rend="ital">He dyed it;</hi> or <hi rend="ital">'
    "coloured it.</hi> (Msb.)</entryFree></div2>"
)
PREAMBLE = (
    '<div2 n="Sxr" type="root"><entryFree id="n2"><form><orth lang="ar">SaxorN</orth>'
    "</form> (S, K,) the latter on the authority of Yaakoob, (S,) thus sometimes "
    'pronounced, (Msb,) <hi rend="ital">Rocks;</hi> or <hi rend="ital">'
    "great masses of stone.</hi></entryFree></div2>"
)
FORM_TWO_FIRST = (
    '<div2 n="Sxr" type="root">'
    '<entryFree id="n3"><form><itype>2</itype><orth lang="ar">taSoxiyrN</orth></form>'
    ' <hi rend="ital">The making subservient.</hi></entryFree>'
    '<entryFree id="n4"><form><orth lang="ar">SaxorN</orth></form>'
    ' <hi rend="ital">Rocks.</hi></entryFree></div2>'
)
APPARATUS_ONLY = (
    '<div2 n="Sxx" type="root"><entryFree id="n5"><form><itype>2</itype>'
    '<orth lang="ar">taSoxiyxN</orth></form> <hi rend="ital">q. v.</hi> (K.)'
    "</entryFree></div2>"
)
DANGLING = (
    '<div2 n="Sdq" type="root"><entryFree id="n6"><form><orth lang="ar">Sadaq</orth>'
    '</form> <hi rend="ital">He spoke truth;</hi> <hi rend="ital">contr. of</hi>'
    ' <foreign lang="ar">ka*ab</foreign>.</entryFree></div2>'
)


def test_entry_blocks_reports_the_verb_form():
    assert [f for f, _ in entry_blocks(FORM_TWO_FIRST)] == [2, 0]


def test_extract_gloss_reads_the_italic_runs():
    assert extract_gloss(SIMPLE) == "He dyed it; or coloured it"


def test_extract_gloss_drops_a_roman_authority_preamble():
    # The preamble is roman, so italic-only selection excludes it structurally.
    assert extract_gloss(PREAMBLE) == "Rocks; or great masses of stone"


def test_extract_gloss_prefers_form_one_over_an_earlier_form_two():
    assert extract_gloss(FORM_TWO_FIRST) == "Rocks"


def test_extract_gloss_drops_apparatus_only_italics():
    assert extract_gloss(APPARATUS_ONLY) == ""


def test_extract_gloss_drops_a_dangling_cross_reference():
    assert extract_gloss(DANGLING) == "He spoke truth"


def test_extract_gloss_truncates_on_a_word_boundary():
    long_entry = (
        '<div2 n="x" type="root"><entryFree><form><orth lang="ar">x</orth></form> '
        '<hi rend="ital">' + "word " * 100 + "</hi></entryFree></div2>"
    )
    out = extract_gloss(long_entry, max_len=40)
    assert len(out) <= 41 and out.endswith("…") and "wor…" not in out
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/scraper && python -m pytest tests/test_lane_gloss.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'scraper.lane_gloss'`

- [ ] **Step 3: Write the implementation**

```python
# packages/scraper/scraper/lane_gloss.py
"""Reduce one Lane TEI entry to its leading English gloss. Pure, no I/O.

Lane marks his definitions with ``<hi rend="ital">`` and leaves apparatus,
authorities and cross-references roman. Selecting the italic runs therefore
drops the "on the authority of Yaakoob, thus sometimes pronounced," preamble
structurally, where regex over the rendered HTML could not. Deterministic by
decision (2026-08-02): no LLM, so every stored word is Lane's own and the
"Lane's Lexicon" credit stays literally true.

Known limit, accepted: the leading gloss is not always the *Quranic* sense. Lane
opens صلو on form I ("strike the small of the back"); the prayer sense is under
form II. The review gate in phase 21 Task 5 exists to catch these by hand.
"""

from __future__ import annotations

import html
import re

_ENTRY = re.compile(r"<entryFree\b[^>]*>(.*?)</entryFree>", re.S | re.I)
_ITYPE = re.compile(r"<itype\b[^>]*>\s*([^<\s]+)\s*</itype>", re.I)
_ITAL = re.compile(r'<hi\b[^>]*\brend="ital"[^>]*>(.*?)</hi>', re.S | re.I)
_TAG = re.compile(r"<[^>]+>")
_PAREN = re.compile(r"\([^()]*\)")
# Roman words worth keeping between two italic runs -- without them "he was, or
# became" reads as "he was, became", which changes the sense.
_CONNECTIVE = re.compile(r"^(?:or|and|also)[,]?$", re.I)
# Italic runs that are apparatus rather than definition. Deliberately an explicit
# list: an earlier "any token of <=3 letters" rule ate the real word "It," off
# the front of the صلح gloss.
# corrected 2026-08-02: `i, q.` was a typo for the siglum `i. q.` (3291 runs),
# `syn. with` and a `&c.:` tail need their own room
_APPARATUS = (
    r"q\.\s*v\.|i\.\s*q\.|inf\.\s*n\.|syn\.(?:\s*with)?|contr\.(?:\s*of)?|sic|&c\.?"
)
_NOISE = re.compile(rf"^(?:{_APPARATUS})[.,:]?$", re.I)


def _plain(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(_TAG.sub("", fragment))).strip()


def entry_blocks(entry_xml: str) -> list[tuple[int, str]]:
    """``(verb_form, body)`` per ``<entryFree>``; form 0 means no ``<itype>``."""
    blocks: list[tuple[int, str]] = []
    for match in _ENTRY.finditer(entry_xml):
        body = match.group(1)
        itype = _ITYPE.search(body)
        form = int(itype.group(1)) if itype and itype.group(1).isdigit() else 0
        blocks.append((form, body))
    return blocks


def _gloss_from_body(body: str) -> str:
    body = body.split("―", 1)[0]  # 2026-08-02: stop at the first sub-sense
    parts: list[str] = []
    previous_end = 0
    for match in _ITAL.finditer(body):
        between = _plain(_PAREN.sub(" ", body[previous_end : match.start()]))
        previous_end = match.end()
        text = _plain(match.group(1))
        if not text or _NOISE.match(text):
            continue
        if parts and _CONNECTIVE.match(between):
            parts.append(between.rstrip(",").lower())
        parts.append(text)
    return re.sub(r"\s+", " ", " ".join(parts)).strip()


def extract_gloss(entry_xml: str, max_len: int = 220) -> str:
    """Leading English gloss of a Lane entry, or "" when it has none.

    Entries are tried form I / nounal first: ``<entryFree>`` order is print
    order, not sense order, and Lane's صخر opens on the form-II verbal noun.
    """
    blocks = entry_blocks(entry_xml)
    ordered = [b for f, b in blocks if f in (0, 1)] + [b for f, b in blocks if f not in (0, 1)]
    gloss = next((g for g in map(_gloss_from_body, ordered) if g), "")
    if not gloss:
        return ""
    gloss = re.sub(r"\s+([,;:.])", r"\1", gloss)
    if len(gloss) > max_len:
        cut = gloss.rfind(" ", 0, max_len)
        gloss = gloss[: cut if cut > 0 else max_len].rstrip(" ,;:.-—") + "…"
    return gloss.strip(" ,;:.")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/scraper && python -m pytest tests/test_lane_gloss.py -v`
Expected: PASS (whole file). If `test_extract_gloss_drops_a_dangling_cross_reference` fails, widen `_NOISE` — do **not** widen it to a length rule, which is the bug it replaced.

- [ ] **Step 5: Eyeball the rule against the real volumes**

```bash
cd packages/scraper && python -c "
from pathlib import Path
from scraper.sources.lane_tei import build_index, lookup
from scraper.lane_gloss import extract_gloss
idx = build_index(Path.home() / 'quran-data' / 'refdata' / 'lane-tei')
for r in ['SlH','Zlm','Sxr','SrH','Sdq','SHb','Sbr','Swt','Slw']:
    print(f'{r:5} -> {extract_gloss(lookup(idx, r) or \"\")}')
"
```

Expected: English prose, no `(S, K,)` sigla, no Buckwalter. `Slw` opening on the striking sense is expected, not a failure.

- [ ] **Step 6: Commit**

```bash
git add packages/scraper/scraper/lane_gloss.py packages/scraper/tests/test_lane_gloss.py
git commit -m "feat(scraper): reduce a Lane TEI entry to its leading gloss"
```

---

### Task 3: TSV + quarantine report

Mirrors `prepare_corpus_form_glosses.py`, including its hard-won guards: raise on a missing index, and report rather than silently strand a root.

**Files:**
- Create: `packages/scraper/tools/prepare_lane_glosses.py`
- Create: `packages/scraper/tests/test_prepare_lane_glosses.py`

**Interfaces:**
- Consumes: `build_index`, `lookup` (Task 1); `extract_gloss` (Task 2).
- Produces: `build_rows(index, targets) -> tuple[list[tuple[str, str]], list[tuple[str, str]], dict[str, int]]` — `(rows, quarantined, stats)`; `load_targets(db_path) -> list[str]`.

- [ ] **Step 1: Write the failing test**

```python
# packages/scraper/tests/test_prepare_lane_glosses.py
import pytest

from tools.prepare_lane_glosses import build_rows

ENTRY = (
    '<div2 n="Sbg" type="root"><entryFree><form><orth lang="ar">Sabag</orth></form>'
    ' (S,) <hi rend="ital">He dyed it.</hi></entryFree></div2>'
)
NO_GLOSS = (
    '<div2 n="Sxx" type="root"><entryFree><form><itype>2</itype>'
    '<orth lang="ar">x</orth></form> <hi rend="ital">q. v.</hi></entryFree></div2>'
)


def test_build_rows_keeps_a_root_with_a_gloss():
    rows, quarantined, stats = build_rows({"Sbg": ENTRY}, ["Sbg"])
    assert rows == [("Sbg", "He dyed it")]
    assert quarantined == [] and stats["kept"] == 1


def test_build_rows_quarantines_a_root_lane_does_not_hold():
    rows, quarantined, stats = build_rows({"Sbg": ENTRY}, ["hmn"])
    assert rows == []
    assert quarantined == [("hmn", "not_in_lane")]
    assert stats["not_in_lane"] == 1


def test_build_rows_quarantines_an_entry_that_yields_no_gloss():
    rows, quarantined, stats = build_rows({"Sxx": NO_GLOSS}, ["Sxx"])
    assert rows == []
    assert quarantined == [("Sxx", "no_gloss")]


def test_build_rows_resolves_a_geminate_through_lanes_two_letter_key():
    rows, _, _ = build_rows({"Sb": ENTRY}, ["Sbb"])
    assert rows == [("Sbb", "He dyed it")]


def test_build_rows_raises_on_an_empty_index():
    with pytest.raises(ValueError, match="empty Lane index"):
        build_rows({}, ["Sbg"])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/scraper && python -m pytest tests/test_prepare_lane_glosses.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.prepare_lane_glosses'`

- [ ] **Step 3: Write the implementation**

```python
# packages/scraper/tools/prepare_lane_glosses.py
"""Build the Lane-importer TSV from the vendored Perseus TEI volumes.

Reads only the local XML, never the network, so the extraction rule can be tuned
and re-run without re-downloading (CLAUDE.md §11). Output feeds
``import-lane --source perseus-lane``.

Two guards, both learned the expensive way in phase 20: an empty index raises
instead of writing an empty TSV and printing success, and every root that yields
no gloss is *reported*, never silently dropped -- a stranded root leaves the card
empty while the run claims success.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from scraper.lane_gloss import extract_gloss
from scraper.sources.lane_tei import build_index, lookup


def build_rows(
    index: dict[str, str], targets: list[str]
) -> tuple[list[tuple[str, str]], list[tuple[str, str]], dict[str, int]]:
    """(rows, quarantined, stats). Raises on an empty index."""
    if not index:
        raise ValueError("empty Lane index -- run `fetch-lane-tei` first")

    rows: list[tuple[str, str]] = []
    quarantined: list[tuple[str, str]] = []
    stats = {"total": len(targets), "not_in_lane": 0, "no_gloss": 0, "kept": 0}
    for bw in targets:
        entry = lookup(index, bw)
        if entry is None:
            stats["not_in_lane"] += 1
            quarantined.append((bw, "not_in_lane"))
            continue
        gloss = extract_gloss(entry)
        if not gloss:
            stats["no_gloss"] += 1
            quarantined.append((bw, "no_gloss"))
            continue
        # Raise, never escape: both files are unquoted TSV and `import-lane`
        # splits on the first tab, so a delimiter lands one root's text on
        # another. Covers both writers by sitting where rows are created.
        if any(ch in gloss for ch in "\t\n\r"):
            raise ValueError(f"gloss for {bw!r} contains a TSV delimiter")
        rows.append((bw, gloss))
    stats["kept"] = len(rows)
    return rows, quarantined, stats


def review_rows(index, rows, quarantined) -> list[tuple[str, str, str, str]]:
    """``(root, status, via_key, gloss)`` for the human gate.

    ``via_key`` is empty on a direct match and names the key otherwise, so a
    non-direct match is visible at a glance. ``kept_short`` flags a gloss under
    _SHORT_GLOSS chars: a wrongly-selected entry block yields something short
    and plausible (نطق once came out as "bar"), not empty.
    """
    out: list[tuple[str, str, str, str]] = []
    for bw, gloss in rows:
        key = lookup_key(index, bw)
        status = "kept_short" if len(gloss) < _SHORT_GLOSS else "kept"
        out.append((bw, status, "" if key == bw else key or "", gloss))
    out.extend((bw, why, "", "") for bw, why in quarantined)
    return out


def load_targets(db_path: Path) -> list[str]:
    """Roots holding no Lane definition, most-used first."""
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        return [
            row[0]
            for row in conn.execute(
                """SELECT r.root_buckwalter FROM roots r
                   WHERE NOT EXISTS (
                       SELECT 1 FROM root_definitions d
                       WHERE d.root_id = r.id AND d.source = 'qurandev-lane')
                   ORDER BY r.occurrence_count DESC"""
            )
        ]
    finally:
        conn.close()


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("xml_dir", type=Path, help="Vendored TEI volumes")
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--review", type=Path, required=True, help="human review TSV")
    args = parser.parse_args()

    rows, quarantined, stats = build_rows(
        build_index(args.xml_dir), load_targets(args.db)
    )
    with args.out.open("w", encoding="utf-8") as handle:
        for bw, gloss in rows:  # build_rows raises on a TSV delimiter
            handle.write(f"{bw}\t{gloss}\n")
    with args.review.open("w", encoding="utf-8") as handle:
        # via_key added 2026-08-02: the gate has to see non-direct matches
        handle.write("root\tstatus\tvia_key\tgloss\n")
        for bw, status, via_key, gloss in review_rows(index, rows, quarantined):
            handle.write(f"{bw}\t{status}\t{via_key}\t{gloss}\n")
    print(
        f"Lane TEI -> TSV: {stats['kept']} kept of {stats['total']} targets "
        f"({stats['not_in_lane']} not in Lane, {stats['no_gloss']} no gloss) "
        f"-> {args.out}; review {args.review}"
    )


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/scraper && python -m pytest tests/test_prepare_lane_glosses.py -v`
Expected: PASS (whole file)

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/tools/prepare_lane_glosses.py \
        packages/scraper/tests/test_prepare_lane_glosses.py
git commit -m "feat(scraper): build the Lane gloss TSV with a quarantine report"
```

---

### Task 4: Web wiring — rank, credit label, Perseus attribution

Three edits. Skipping any is a silent bug: an unranked source can lose the `LIMIT 1` on the lemma page, an unlabelled source ships text credited with its raw tag, and a missing `/about` entry breaches Perseus's licence.

**Files:**
- Modify: `packages/data/src/queries/roots.ts:243-248`
- Modify: `apps/web/src/lib/definitionSources.ts:14-18`
- Modify: `apps/web/src/app/about/page.tsx`
- Modify: `packages/data/tests/roots.test.ts`
- Modify: `apps/web/src/test/definitionSources.test.ts`

- [ ] **Step 1: Write the failing tests**

`getRootDefinitions` is exported from `roots.ts:250` but is **not** in this file's
import list yet — add it, or the test fails on a reference error rather than on the
ranking it is meant to check:

```typescript
// packages/data/tests/roots.test.ts -- add to the existing import from '../src/queries/roots.js'
  getRootDefinitions,
```

The suite's shared `db` is seeded once in `beforeAll` and several tests count roots,
so this uses the file's own `newFileDb()` helper rather than inserting into it:

```typescript
// packages/data/tests/roots.test.ts -- append inside the existing describe
it('ranks a perseus-lane definition above a corpus-forms fallback', async () => {
  const local = newFileDb();
  await runMigrations(local);
  await local.execute(
    `INSERT INTO roots (id,root_buckwalter,root_arabic,occurrence_count)
     VALUES (1,'SlH','ص ل ح',180)`,
  );
  await local.execute(
    `INSERT INTO root_definitions (root_id,source,definition) VALUES
     (1,'corpus-forms','to be good'),(1,'perseus-lane','It was, or became, good')`,
  );
  const defs = await getRootDefinitions(local, 1);
  expect(defs[0]!.source).toBe('perseus-lane');
});
```

```typescript
// apps/web/src/test/definitionSources.test.ts -- append
it('credits perseus-lane as Lane, not as the raw tag', () => {
  expect(definitionSourceLabel('perseus-lane')).toBe("Lane's Lexicon");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/data && npx vitest run tests/roots.test.ts -t perseus-lane`
Expected: FAIL — receives `corpus-forms` (unranked sources fall to `ELSE 2`)

Run: `cd apps/web && npx vitest run src/test/definitionSources.test.ts -t perseus-lane`
Expected: FAIL — receives `perseus-lane`

- [ ] **Step 3: Add the rank and the label**

```typescript
// packages/data/src/queries/roots.ts -- inside DEFINITION_SOURCE_RANK, after 'qurandev-lane'
       WHEN 'perseus-lane' THEN 0
```

Rank 0 alongside `qurandev-lane` is deliberate: both are Lane. The existing `rd.source` tiebreak would put `perseus-lane` first if a root ever held both, which no root does — this phase only fills roots that have no `qurandev-lane` row.

```typescript
// apps/web/src/lib/definitionSources.ts -- inside SOURCE_LABELS
  ['perseus-lane', "Lane's Lexicon"],
```

- [ ] **Step 4: Add the Perseus credit**

Licence-required, not courtesy — the quoted sentence is fixed wording from the volumes' availability statement.

```tsx
// apps/web/src/app/about/page.tsx -- new entry in SOURCES, after the Lane's Lexicon entry
  {
    name: 'Perseus Digital Library',
    href: 'https://www.perseus.tufts.edu/hopper/',
    provides:
      "The TEI text of Lane's Lexicon behind root definitions that the qurandev/roots compilation does not cover.",
    license: 'Free redistribution with attribution',
    note: 'Text provided by Perseus Digital Library, with funding from The U.S. Department of Education and The Max Planck Society. Lane’s 1863 lexicon is itself public domain; Perseus’s terms require this credit, that their availability statement stay intact, and that modifications be offered back.',
  },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/data && npx vitest run tests/roots.test.ts`
Run: `cd apps/web && npx vitest run src/test/definitionSources.test.ts`
Expected: PASS

- [ ] **Step 6: Rebuild packages/data**

`apps/web` imports the compiled `dist/`, not `src/` — skip this and the change appears to do nothing live.

Run: `cd packages/data && npm run build`
**Do not run this while `next dev` is running** — shared `.next`, CSS 404s + `MODULE_NOT_FOUND`.

- [ ] **Step 7: Commit**

```bash
git add packages/data/src/queries/roots.ts packages/data/tests/roots.test.ts \
        apps/web/src/lib/definitionSources.ts apps/web/src/test/definitionSources.test.ts \
        apps/web/src/app/about/page.tsx
git commit -m "feat(data,web): rank, credit and attribute the perseus-lane source"
```

---

### Task 5: Live run, review gate, import

**Not a code task.** No step here runs without the user present.

- [ ] **Step 1: Ensure the volumes are vendored**

Run: `cd packages/scraper && python -m scraper.cli fetch-lane-tei`
Expected: 36 volumes, ~67 MB. Idempotent — a no-op if Task 1 Step 6 already ran.
Note: the resume guard now trusts any file present under its final name, because the downloader writes `.part` and renames. A volume left truncated by the **pre-fix** non-atomic writer is therefore skipped for ever — if the volumes predate 2026-08-02, recover with `fetch-lane-tei --force`.

- [ ] **Step 2: Build the TSV and the review artifact**

```bash
cd packages/scraper && python -m tools.prepare_lane_glosses \
  ~/quran-data/refdata/lane-tei \
  --db ~/quran-data/quran.db \
  --out lane_perseus.tsv \
  --review lane_perseus_review.tsv
```

Expected output, re-measured against the live DB on 2026-08-03 (add `--refresh` once the rows are imported, or `load_targets` sees only the 14 it never filled):

```
Lane TEI -> TSV: 217 kept of 231 targets (14 not in Lane, 0 no gloss, 1 kept_short to eyeball)
```

231, not 256: `load_targets` subtracts the **25** roots in `lane_rejects.txt`, which `import-lane`'s upsert would otherwise reinstate.

A `not_in_lane` count far above 14 means `key_candidates` regressed — check it before proceeding, do not import a shrunken set. It was 23 on 2026-08-02; `index_keys` then learned to split a `X and Y` heading, which recovered nine roots that live only under one (`g$w DHw Hfw Sgw gTw gvw THw fDw fAy`).

- [ ] **Step 3: HUMAN REVIEW GATE — read `lane_perseus_review.tsv` before importing**

Mandatory, and the reason this phase is deterministic rather than LLM-generated. Per `validate-data-by-alignment-not-count`: **never accept on row count.** Spot-check widely, and specifically confirm:
  - the gloss is English prose, not apparatus debris (`contr. of`, bare sigla)
  - the gloss matches the root's known meaning — the `Slw` failure mode is a *correct* extraction of Lane's form-I sense where the Quranic sense sits under form II
  - nothing reads like a neighbouring root, which would mean `key_candidates` matched too loosely — the `via_key` column names the 37 rows that resolved through a non-direct key, so start there
  - the `kept_short` row (1 today: `sTr` → "He wrote") is a genuinely terse definition, not a wrongly-selected entry block — the نطق-as-"bar" failure mode is short and plausible, not empty, and on a direct key it has no `via_key` to betray it
  - the 14 `not_in_lane` rows are the expected list (`All Ayy dmw EsEs hAt hdhd hlE hmn hrE HSHS hTE rfrf SlSl wsws`) — the nine joined-heading roots that used to appear here are now recovered, so spot-check `g$w Sgw gTw THw` read as their own entries and not a neighbour's

Roots that fail review are deleted from `lane_perseus.tsv` by hand and left to the empty-state card. **An unreviewed row must not be imported.**

- [ ] **Step 4: Back up the live DB, then import**

Requires explicit user permission at this moment — do not assume it from this plan.

```bash
set -euo pipefail   # a failed backup or import must not be followed by the copy
python3 -c "import sqlite3,os;sqlite3.connect(os.path.expanduser('~/quran-data/quran.db')).execute(\"VACUUM INTO ?\",[os.path.expanduser('~/quran-data/quran.db.bak-phase21')])"
test -s ~/quran-data/quran.db.bak-phase21   # the rollback must exist before the write
cd packages/scraper && python -m scraper.cli import-lane lane_perseus.tsv \
  --db ~/quran-data/quran.db --source perseus-lane
# ../../ because the cd above is still in effect -- `apps/web/quran.db` would
# resolve under packages/scraper and leave the web DB stale while this succeeds.
# Copy beside the target, then rename: `cp` straight onto the live file exposes a
# half-written SQLite DB to whatever is reading it (the dev server holds it open).
cp ~/quran-data/quran.db ../../apps/web/quran.db.new
test -s ../../apps/web/quran.db.new   # never rename an empty copy over the live DB
mv ../../apps/web/quran.db.new ../../apps/web/quran.db   # two DBs stay in sync
```

(`sqlite3` the CLI is not installed on this machine; the Python one-liner is the working equivalent.)

- [ ] **Step 5: Verify post-conditions**

```sql
SELECT source, COUNT(*) FROM root_definitions GROUP BY source;      -- corpus-forms 155, qurandev-lane 1386, perseus-lane N
SELECT COUNT(*) FROM roots r WHERE NOT EXISTS
  (SELECT 1 FROM root_definitions d WHERE d.root_id = r.id);        -- 101 - (newly covered)
SELECT COUNT(*) FROM roots;                                          -- still 1642
```

Then render `/dictionary/SlH` and `/dictionary/Sxr` and confirm the card shows the gloss credited **Lane's Lexicon**, not `perseus-lane`, and that `/about` lists Perseus.

- [ ] **Step 6: Commit nothing from this task**

`lane_perseus.tsv`, `lane_perseus_review.tsv` and the vendored volumes are **not committed** (§9). The code that reproduces them landed in Tasks 1–4.

---

## Risks and rollbacks

| Risk | Mitigation | Rollback |
| --- | --- | --- |
| `key_candidates` matches too loosely and files a neighbouring root's entry | Candidates are an explicit ordered list, exact-match only — never a prefix or fuzzy match; Task 5 Step 3 review | `DELETE FROM root_definitions WHERE source='perseus-lane'` |
| Leading gloss ≠ Quranic sense (`Slw`) | Accepted limit of the deterministic rule; Task 5 Step 3 review gate | Drop the row from the TSV before import |
| Lane genuinely lacks the root (16 known) | Reported as `not_in_lane`, counted, left to the empty-state card per the user's 2026-08-02 ruling | None needed — nothing was written |
| Extraction rule tuned after vendoring | Extractor is pure and reads only local XML | Re-run Task 3, no re-download |
| Mirror disappears | 67 MB vendored under `~/quran-data/refdata/lane-tei` | Re-parse from the local copy; `originals` branch is a second source |
| `master` branch amendments differ from pristine Perseus | Chosen deliberately for text quality (user, 2026-08-02); `/about` credits Perseus for the text, which the amendments do not change | Re-run Task 1 against the `originals` branch |
| Live DB corrupted by import | `VACUUM INTO` backup before the write | Restore `quran.db.bak-phase21` |
| Perseus licence breached | Task 4 Step 4 ships the verbatim credit | Blocking — do not import before Task 4 lands |

## Acceptance criteria

- [ ] `pnpm -r type-check`, `pnpm -r lint`, `pnpm -r test` all pass; `cd packages/scraper && python -m pytest` passes; `mypy` is clean on the new modules (the Python half needs its own type check — the TS one does not cover it); ruff adds no new findings over `main`.
- [ ] `VOLUMES` has 36 entries and includes both `_S0.xml` and `s0.xml` — asserted by `test_volumes_cover_every_letter_file`.
- [ ] `lookup` resolves `Sxx` via `Sx` and `Sdy` via `SdY` — asserted by the geminate and alif-maqṣūra tests.
- [ ] `extract_gloss` returns `Rocks; or great masses of stone` for the authority-preamble fixture, and `""` for an apparatus-only entry.
- [ ] `build_rows` raises on an empty index and lists every unresolved root in the review TSV.
- [ ] `getRootDefinitions` returns `perseus-lane` ahead of `corpus-forms` for a root holding both.
- [ ] `definitionSourceLabel('perseus-lane') === "Lane's Lexicon"`.
- [ ] `/about` carries the Perseus entry with the verbatim funding credit.
- [ ] The dry run reproduces `217 kept of 231 targets (14 not in Lane, 0 no gloss, 1 kept_short to eyeball)` (with `--refresh` once imported).
- [ ] Every imported row was read by a human in `lane_perseus_review.tsv`.
- [ ] Post-import: `roots` still 1642; `qurandev-lane` still 1386; `corpus-forms` still 155; definition-less count strictly below 101.
