# Phase 22 — Salmoné Form-Keyed Glosses

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import Salmoné's *Advanced Learner's Arabic-English Dictionary* as a short, part-of-speech- and form-selected gloss source for the 101 roots still showing a wrong-sense `perseus-lane` entry or nothing at all — 83 whose only source is `perseus-lane`, plus the 18 with no definition. Salmoné reaches 96 of them.

**Architecture:** Salmoné ships as one Perseus TEI file with the same root-`<div2>` shape as the Lane volumes we already parse, so the existing key machinery is reused, not rewritten. (Measured attribute order in `salmone.xml`: `<div2 part="N" n="..." org="uniform" sample="complete" type="root">` — `n` before `type`, 6654 tags, zero in the other order. The matcher below does not depend on that order anyway; `lane_tei` scans the whole tag and pulls `n` out separately for the same reason.) Inside each root it nests one `<entryFree key="...">` per *vocalised form*, each with a short `<sense>`. We pick the `entryFree` whose form the Quran actually uses most, instead of always taking the first block — which is the whole defect being fixed.

**Tech Stack:** Python 3 (`packages/scraper`), stdlib `re`/`sqlite3`/`tarfile`, `httpx` (already a dep), existing `import-lane` CLI, `packages/data` TypeScript for ranking/labelling.

## Global Constraints

- CLAUDE.md §3 DRY: key helpers shared by both Perseus sources move to one module. No copy-paste.
- CLAUDE.md §9: the 15.5 MB tarball and the 28.9 MB XML **never enter git**. They live at `~/quran-data/refdata/perseus-arabic/`, like the Lane TEI.
- CLAUDE.md §11: rate limit is moot (one fetch), attribution is not — `/about` gains a Salmoné entry before import ships.
- CLAUDE.md §4 governs the per-task loop. Its step 3 is user-triggered: stop and ask, never skip.
- CLAUDE.md §5: CodeRabbit gate blocks. A green `Review rate limited` status is **not** a pass.
- Test fixtures stay **synthetic and inline**. Never check in a slice of `salmone.xml`.
- Live-DB writes need explicit permission at the moment of writing.
- `packages/data` stays free of React/Next imports.

---

## Facts (measured 2026-08-03, not estimated)

Source: `~/quran-data/refdata/perseus-arabic/Arabic/Salmone/opensource/salmone.xml`, 28,944,030 bytes, TEI P4, from `hopper-texts-Arabic.tar.gz` (15,506,171 bytes, gzip verified).

- **6654** `<div2 type="root">` entries → **6351** distinct keys after `normalise_key`.
- Coverage, **re-measured 2026-08-04 — the original bullet mixed two matching
  methods without saying so.** Task 3's `lookup` matches on the *skeleton*, so
  the skeleton row is the one that binds; the exact-key row is what a stricter
  match would give and is kept only to explain the gap:

  | match | all roots | perseus-lane roots | empty roots | target set |
  |---|---|---|---|---|
  | exact `normalise_key` | 1468 / 1642 | 199 / 217 | — | — |
  | **skeleton (what ships)** | **1593 / 1642** | **211 / 217** | **15 / 18** | **96 / 101** |

  The `perseus-lane roots` column is the **whole 217-row cohort**, not the import
  target — most of those roots already carry a `corpus-forms` gloss and are fixed
  by the rank swap alone. The target set is the 83 `perseus-lane`-*only* roots
  plus the 18 empty ones, and it breaks down as **96 / 101 = 81 / 83 + 15 / 18**.
  The two cohorts also miss differently: all-perseus misses six
  (`$mz Hyv Sbw Sgw rDw trq`), of which only `Hyv trq` are targets.

- Target roots Salmoné does *not* reach, all five: `Ayy Hyv dmw klw trq` — of
  which the empty-root three are `Ayy dmw klw`. (The first draft listed `fAy`
  and `nsA` here; both are in fact covered.)
- First-sense length over the 199 exact-key matches: min 4, **median 30**, max 148, **zero over 200 chars**. Lane's same 217: 91 over 200, worst 1336.
- Sense selection, measured three ways over the 217:

  | rule | form-matched | fell back to first entry |
  |---|---|---|
  | skeleton drops shadda | 137 | 62 |
  | skeleton keeps shadda | 125 | 74 |
  | **keeps shadda + ranks by corpus frequency** | **125** | **74** |

  Fewer matches is *better here*. Dropping shadda merges Form I with Form II, so دون matched `daw~ana` "Collected, gathered into one" instead of `duwon` "Low, base, vile" — the Quranic word. The 28 roots the two rules disagree on all favour the shadda-keeping pick.

- Frequency ranking beats document order on the same 125: صبح picks `A^aSobaHa` (Form IV, 20 corpus hits) over `Sab~aHa` (Form II, 1 hit); صبع picks `A^aSobaEu` "Finger; digit."

**Known-imperfect after all three rules** — this is why Task 7 exists, not a reason to widen the algorithm: بين → "Separation." (Quranic sense is "between"), كيف → "Enjoyment." (Quranic كيف is the interrogative particle).

### Acquisition note — read before writing Task 3

The advertised URL `https://www.perseus.tufts.edu/hopper/opensource/downloads/texts/hopper-texts-Arabic.tar.gz` **truncates every time**: the server closes the connection at 0.6–1.6 MB, sends no `Content-Length`, and **ignores `Range` requests** (returns `200`, not `206`), so resume is impossible. Six attempts across `curl` and `wget`, rate-limited and not, all failed.

The Wayback snapshot downloads whole and is what Task 3 pins:

```
https://web.archive.org/web/20241101223146if_/http://www.perseus.tufts.edu/hopper/opensource/downloads/texts/hopper-texts-Arabic.tar.gz
```

Perseus `robots.txt` (checked 2026-08-03) is `Disallow: /` with a five-path allow-list; `/hopper/text` is explicitly commented out of the allow-list for Anthropic, OpenAI, Google and others. **Page-by-page scraping of Perseus is forbidden and this phase does none.** One fetch of a published tarball is the distribution channel, not crawling.

### Licence position (decided 2026-08-03)

Salmoné 1889 is public domain by age. Perseus's CC BY-SA 3.0 US covers their digitisation and TEI markup. We extract **sense text only**, never their markup structure, and credit Perseus + Salmoné on `/about`. The derived gloss table is not published under BY-SA.

### Target set (corrected 2026-08-04 — measured, was wrongly stated as 235)

**101 roots**, not 235. Two disjoint groups:

| group | count |
|---|---|
| roots whose **only** source is `perseus-lane` | 83 |
| roots with no definition at all | 18 |

The earlier 235 double-counted. Of the 217 `perseus-lane` rows, **134 also carry a `corpus-forms` gloss**, and the `DEFINITION_SOURCE_RANK` demote already lands `corpus-forms` above `perseus-lane` on those pages — they are fixed without Salmoné. Only the 83 with nothing else are still showing Lane's wrong sense.

`load_salmone_targets`'s SQL (Task 5) already encodes the correct rule — `NOT EXISTS (... d.source <> 'perseus-lane')`. Only this prose was wrong; no query changes.

Not "every root Salmoné covers" (1468). That would add a second definition card to ~90% of root pages — a product change nobody asked for. Switching later is a one-line change to the target query in `load_salmone_targets`.

### The frequency rule alone does not fix the defect (measured 2026-08-03 over all 101)

Spiked before committing to the plan. Salmoné reaches **96 of 101** (no entry: `Ayy Hyv dmw klw trq`). Gloss length is fixed — median **26**, max **122**, **zero over 200**. Correctness is not:

| metric | Lane, as shipped | Salmoné, frequency rank only | **Salmoné + POS filter** |
|---|---|---|---|
| gloss opens on a past-tense verb | 58 / 101 | 56 / 96 | **7 / 96** |
| gloss is a bare cross-reference (`see …`) | — | 6 / 96 | **0 / 96** |

Frequency ranking on its own is **no improvement on the axis this phase exists to fix**. The cause: a noun and a Form I verb of the same consonants collapse to the same skeleton, so بعض picked "Stung ( mosquito )." and بحر picked "Slit, ripped open.". صبح/صبع only worked because shadda and hamza happen to separate their forms.

The fix is Task 4's POS filter, using `word_segments.pos_tag`, which we already store. Above an 0.8 nominal share, drop past-verb and cross-ref candidates *before* ranking. That corrects بعض → "Part, portion, lot." and بحر → "Sea." plus 40 others.

**Residual failures after the filter — Task 7's queue, not a reason to widen the algorithm:**

| root | occ | outcome | why the filter cannot help |
|---|---|---|---|
| `Ayy` أيي | 382 | no gloss | no Salmoné entry at all |
| `kyf` كيف | 83 | "Enjoyment." | pos is `INTG`, nominal 0.04 → filter skipped by design |
| `Eyn` عين | 65 | "Hurt the eye of…" | Salmoné's entry holds a single sense; nothing to pick between |
| `Trf` طرف | 11 | **regressed** to "Noble." | filter dropped the better verb sense "Winked, blinked, twinkled ( eye )." |

`Trf` is the one measured regression. It is a *reject*, not a rewrite: 96 rows all pass the Task 7 human gate anyway, and `salmone_rejects.txt` is the mechanism.

### Sources ruled out before settling on Salmoné (2026-08-04)

Recorded so this is not re-litigated. Hans Wehr (via `api.arabicstudentsdictionary.com`) has exactly the right shape, including a `short` field — **© 1979 Harrassowitz, still in print**; §11 forbids it. Wiktionary/kaikki.org is CC BY-SA and structurally ideal (real `pos`, root join via the `ar-root` template) but is **modern MSA**: `Ayy` has zero entries and `kyf` yields تكيف/مكيف, *air conditioning*. Penrice 1873 is public domain and purpose-built for Quranic vocabulary, and Hava 1899 / Steingass 1884 are root-organised — all three exist only as page scans, so each is an OCR project, not an import. ejtaal.net's Arabic Almanac is page **images**. QUL/Tarteel's morphology set is the corpus data we already hold. corpus.quran.com's dictionary page states its content *is* the brief per-word glosses — i.e. our `word_glosses`.

---

## File Structure

| path | responsibility |
|---|---|
| `packages/scraper/scraper/sources/perseus_keys.py` | **new.** `normalise_key`, `index_keys`, `key_candidates` — Perseus-Arabic key conventions, shared by both Perseus sources. Moved out of `lane_tei.py`. |
| `packages/scraper/scraper/sources/lane_tei.py` | **modify.** Imports the three helpers instead of defining them. Public names unchanged. |
| `packages/scraper/scraper/salmone_gloss.py` | **new.** `skeleton`, `entry_senses`, `select_sense`. Pure parsing + selection, no I/O, no DB. |
| `packages/scraper/scraper/sources/salmone.py` | **new.** `SALMONE_MEMBER`, `WAYBACK_TARBALL`, `EXPECTED_ROOTS`, `download_salmone`, `build_index`, `lookup`. |
| `packages/scraper/tools/prepare_salmone_glosses.py` | **new.** Targets → TSV + review TSV. Mirrors `prepare_lane_glosses.py`. |
| `packages/scraper/tools/salmone_rejects.txt` | **new.** Human gate output. Empty (header only) until Task 7. |
| `packages/scraper/scraper/cli.py` | **modify.** Adds `fetch-salmone`. `import-lane --source salmone` already works. |
| `packages/data/src/queries/roots.ts` | **modify.** `DEFINITION_SOURCE_RANK` gains `salmone`. |
| `apps/web/src/lib/definitionSources.ts` | **modify.** `SOURCE_LABELS` gains `salmone`. |
| `apps/web/src/app/about/page.tsx` | **modify.** Salmoné attribution entry. |
| tests | `tests/test_perseus_keys.py`, `tests/test_salmone_gloss.py`, `tests/test_salmone.py`, `tests/test_prepare_salmone_glosses.py`, plus additions to `tests/test_cli.py`, `packages/data/tests/roots.test.ts`, `apps/web/src/test/definitionSources.test.ts`, `apps/web/src/test/about.test.tsx`. |

---

## Task 1: Share the Perseus key helpers

Salmoné needs `normalise_key` and `key_candidates`. Importing them from `lane_tei` would make the Salmoné source depend on the Lane source — wrong direction, and §3 forbids the copy-paste alternative.

**Files:**
- Create: `packages/scraper/scraper/sources/perseus_keys.py`
- Modify: `packages/scraper/scraper/sources/lane_tei.py` (delete lines defining `_HAMZA_MARKS`, `_JOINED`, `_NOT_A_ROOT`, `normalise_key`, `index_keys`, `key_candidates`; import them instead)
- Test: `packages/scraper/tests/test_perseus_keys.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalise_key(key: str) -> str`, `index_keys(name: str) -> list[str]`, `key_candidates(bw: str) -> list[str]`.

- [ ] **Step 1: Write the failing test**

```python
# packages/scraper/tests/test_perseus_keys.py
from scraper.sources.perseus_keys import index_keys, key_candidates, normalise_key


def test_normalise_key_drops_the_hamza_seat_marks():
    assert normalise_key("SA^b") == "SAb"
    assert normalise_key("b`w") == "bw"


def test_index_keys_splits_a_joined_heading_into_both_spellings():
    assert index_keys("Sgw and SgY") == ["Sgw", "SgY"]
    assert index_keys("Dbw or DbY") == ["Dbw", "DbY"]


def test_index_keys_leaves_a_range_or_quasi_heading_whole():
    assert index_keys("hd &c.") == ["hd &c."]
    assert index_keys("Quasi Sgw") == ["Quasi Sgw"]


def test_index_keys_strips_heading_padding():
    assert index_keys(" tr ") == ["tr"]


def test_key_candidates_offers_the_geminate_and_weak_final_forms():
    assert key_candidates("Sxx") == ["Sxx", "Sx"]
    assert key_candidates("hdy") == ["hdy", "hdY", "hdw"]


def test_key_candidates_never_offers_the_definite_article_as_a_fallback():
    # `Al` is ال, grammar prose, not a root -- the geminate rule would hand it
    # to All (إلّ, 9:8). A direct lookup of Al must still work.
    assert key_candidates("All") == ["All"]
    assert key_candidates("Al") == ["Al"]
```

- [ ] **Step 2: Run it and watch it fail**

Run: `packages/scraper/.venv/bin/pytest packages/scraper/tests/test_perseus_keys.py -v`
Expected: FAIL — `ModuleNotFoundError: scraper.sources.perseus_keys`

- [ ] **Step 3: Create the module by moving the code verbatim**

Move `_HAMZA_MARKS`, `_JOINED`, `_NOT_A_ROOT`, `normalise_key`, `index_keys` and `key_candidates` out of `lane_tei.py` into `perseus_keys.py` **with their docstrings and comments intact** — those record 233/256-vs-195/256 coverage measurements and the `hdhd` regression, and they are the reason each rule exists. Add a module docstring:

```python
"""Perseus's Arabic key conventions, shared by every Perseus source we read.

Both Lane's Lexicon and Salmoné are Perseus TEI with `<div2 type="root" n=...>`
headings, and both file roots under the same conventions: hamza-seat marks in
the key, geminates under a two-letter spelling, a weak final written `Y`. These
live here rather than in either source module so the second source does not have
to import the first.
"""
```

- [ ] **Step 4: Re-point `lane_tei.py`**

Replace the deleted block with:

```python
from .perseus_keys import index_keys, key_candidates, normalise_key

__all__ = [
    "VOLUMES",
    "build_index",
    "download_volumes",
    "index_keys",
    "key_candidates",
    "lookup",
    "lookup_key",
    "normalise_key",
]
```

The re-export is deliberate: `tools/prepare_lane_glosses.py` and the existing tests import these from `lane_tei`, and this task is a move, not a rename.

- [ ] **Step 5: Run the full scraper suite**

Run: `packages/scraper/.venv/bin/pytest packages/scraper/tests -q`
Expected: PASS. Every pre-existing Lane test must still pass untouched — that is the proof the move changed no behaviour.

- [ ] **Step 6: Type-check and lint**

Run: `packages/scraper/.venv/bin/mypy scraper tools && packages/scraper/.venv/bin/ruff check scraper tools`
Expected: clean (ruff at the HEAD baseline; it must not gain a finding in a touched file).

- [ ] **Step 7: Commit**

```bash
git add packages/scraper/scraper/sources/perseus_keys.py \
        packages/scraper/scraper/sources/lane_tei.py \
        packages/scraper/tests/test_perseus_keys.py
git commit -m "refactor(scraper): share Perseus key conventions between sources"
```

---

## Task 2: Skeleton and sense extraction

**Files:**
- Create: `packages/scraper/scraper/salmone_gloss.py`
- Test: `packages/scraper/tests/test_salmone_gloss.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `skeleton(key: str) -> str`, `entry_senses(entry_xml: str) -> list[tuple[str, str]]`.

- [ ] **Step 1: Write the failing test**

```python
# packages/scraper/tests/test_salmone_gloss.py
from scraper.salmone_gloss import entry_senses, skeleton

ENTRY = (
    '<div2 n="SbE" type="root">'
    '<entryFree key="SabaE" type="main"><form><orth lang="ar">SabaE</orth></form>'
    '<sense n="a"><dictScrap>[<gramGrp><subc>Bi</subc></gramGrp>], '
    'Pointed at, out; designated.</dictScrap></sense></entryFree>'
    '<entryFree key="A^aSobaEu" type="main"><form><orth lang="ar">A^aSobaEu</orth>'
    '</form><sense n="a">Finger; digit.</sense></entryFree>'
    "</div2>"
)


def test_skeleton_drops_the_short_vowels_and_folds_the_hamza_seats():
    assert skeleton("A^aSobaEu") == "ASbE"
    assert skeleton(">aSa`biEa") == "ASbE"


def test_skeleton_keeps_the_shadda_so_form_ii_stays_distinct_from_form_i():
    # Dropping it merged the two and picked دون as `daw~ana` "Collected,
    # gathered into one" over `duwon` "Low, base, vile" -- the Quranic word.
    assert skeleton("daw~ana") != skeleton("duwon")
    assert skeleton("Sab~aHa") != skeleton("SabaHa")


def test_entry_senses_returns_one_short_gloss_per_vocalised_form():
    assert entry_senses(ENTRY) == [
        ("SabaE", "Pointed at, out; designated."),
        ("A^aSobaEu", "Finger; digit."),
    ]


def test_entry_senses_drops_the_leading_bracketed_grammar_note():
    # `[Bi or 'Ala], Pointed at` is a government note, not part of the gloss.
    assert entry_senses(ENTRY)[0][1].startswith("Pointed")


def test_entry_senses_skips_an_entry_with_no_sense_at_all():
    assert entry_senses('<div2><entryFree key="x"><form/></entryFree></div2>') == []


def test_entry_senses_collapses_the_whitespace_the_tei_indents_with():
    xml = (
        '<entryFree key="k"><sense>\n\t\tGuided,   directed,\n\t\tled aright.\n'
        "</sense></entryFree>"
    )
    assert entry_senses(xml) == [("k", "Guided, directed, led aright.")]
```

- [ ] **Step 2: Run it and watch it fail**

Run: `packages/scraper/.venv/bin/pytest packages/scraper/tests/test_salmone_gloss.py -v`
Expected: FAIL — `ModuleNotFoundError: scraper.salmone_gloss`

- [ ] **Step 3: Implement**

```python
"""Read one short gloss per vocalised form out of a Salmoné root entry.

Salmoné nests an `<entryFree key="...">` per form inside each root -- `SabaHa`,
`Sab~aHa`, `A^aSobaHa` -- and each carries a one-line `<sense>`. That is the
whole reason this source exists: Lane's leading block is a form-I verb sense
written as a full sentence, and 175 of the 217 rows we imported from it open on
one -- a sense the Quran frequently does not use.
"""

from __future__ import annotations

import re

_ENTRY_FREE = re.compile(r'<entryFree\b[^>]*\bkey="([^"]*)"[^>]*>')
_SENSE = re.compile(r"<sense\b[^>]*>(.*?)</sense>", re.S)
_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")
# A leading `[Bi or 'Ala],` is a <gramGrp> government note -- which preposition
# the verb takes -- not part of the meaning. It survives tag-stripping as square
# brackets, so it is cut here rather than by matching the markup: the same note
# appears both wrapped in <dictScrap> and bare.
_LEADING_GRAM = re.compile(r"^\[[^\]]*\]\s*,?\s*")

# Short vowels, sukun, nunation and the two hamza-seat marks carry no consonant.
# `~` (shadda) is deliberately NOT here -- see skeleton().
_VOWELS = str.maketrans("", "", "aiuo^`FNK_")
# Every alif and hamza seat folds together: Salmoné writes `A^a`, the corpus
# morphology writes `>a`, and they are the same letter.
_SEATS = str.maketrans("><}{|&'", "AAAAAAA")


def skeleton(key: str) -> str:
    """Consonant skeleton, for comparing a Salmoné key to a corpus form.

    Salmoné's `A^aSobaEu` and the corpus's `>aSa`biEa` are the same word in two
    transliteration conventions; stripping the vowels and folding the seats is
    what makes them compare equal.

    Shadda is kept. Dropping it raises the match count from 125 to 137 and makes
    12 of those matches worse: Form I and Form II collapse into one skeleton, so
    دون resolves to `daw~ana` "Collected, gathered into one, arranged" instead of
    `duwon` "Low, base, vile" -- the sense the Quran uses. The 28 roots the two
    rules disagree on all favour keeping it.
    """
    return _WS.sub("", (key or "").translate(_VOWELS)).translate(_SEATS)


def entry_senses(entry_xml: str) -> list[tuple[str, str]]:
    """``(vocalised key, first sense)`` per `<entryFree>`, in document order.

    Only the *first* `<sense>` of each entry. Later senses are the same form's
    further meanings, and collecting them is what produced Lane's 1336-character
    run-ons; one form's leading sense is a dictionary headword gloss.
    """
    out: list[tuple[str, str]] = []
    for match in _ENTRY_FREE.finditer(entry_xml):
        end = entry_xml.find("</entryFree>", match.end())
        body = entry_xml[match.end() : end if end != -1 else len(entry_xml)]
        sense = _SENSE.search(body)
        if sense is None:
            continue
        text = _WS.sub(" ", _TAG.sub(" ", sense.group(1))).strip()
        text = _LEADING_GRAM.sub("", text).strip()
        if text:
            out.append((match.group(1), text))
    return out
```

- [ ] **Step 4: Run the test**

Run: `packages/scraper/.venv/bin/pytest packages/scraper/tests/test_salmone_gloss.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Mutation-check every new assertion**

For each test, flip the thing it guards and confirm it fails — a `!=` assertion that holds either way is the failure mode this catches (phase 21 shipped two).
Specifically: delete `_LEADING_GRAM.sub(...)` → the bracket test must fail; add `~` to `_VOWELS` → the shadda test must fail.
Restore from a copy, **never `git checkout`** — at this point the file is new and untracked, so `git checkout` cannot restore it at all, and on a tracked file it would throw away the whole uncommitted implementation. Take the copy first, mutate, run, restore:

```bash
cd "$(git rev-parse --show-toplevel)/packages/scraper"
orig="$(mktemp)"                     # unique: a fixed path lets two runs clobber
cp scraper/salmone_gloss.py "$orig"  # each other's only copy of the real source
trap 'cp -- "$orig" scraper/salmone_gloss.py; rm -f -- "$orig"' EXIT
# ...edit, run pytest, confirm the expected test FAILS...
cp "$orig" scraper/salmone_gloss.py
.venv/bin/pytest tests/test_salmone_gloss.py -q   # green again before moving on
```

The `EXIT` trap is not belt-and-braces: on 2026-08-04 a Task 3 implementer was
killed by an API session limit between flip and restore and left the mutated
regex sitting in the working tree, where the next reader had no way to tell it
from the real implementation. A restore that only runs on the happy path is the
one that is not there when it matters.

Anchor every scripted check to `git rev-parse --show-toplevel` rather than a relative path — a subprocess that dies on a wrong cwd leaves the source mutated — and never to a hard-coded `/home/...`, which breaks the moment the repo is cloned elsewhere or worked on in a worktree.

- [ ] **Step 6: Commit**

```bash
git add packages/scraper/scraper/salmone_gloss.py packages/scraper/tests/test_salmone_gloss.py
git commit -m "feat(scraper): extract one short gloss per Salmone vocalised form"
```

---

## Task 3: Fetch and index the Salmoné XML

**Files:**
- Create: `packages/scraper/scraper/sources/salmone.py`
- Test: `packages/scraper/tests/test_salmone.py`

**Interfaces:**
- Consumes: `perseus_keys.normalise_key`, `perseus_keys.key_candidates` (Task 1); `salmone_gloss.entry_senses` (Task 2).
- Produces: `WAYBACK_TARBALL: str`, `SALMONE_MEMBER: str`, `EXPECTED_ROOTS: int` (= 6351), `download_salmone(dest: Path, *, force: bool = False) -> Path`, `build_index(xml_path: Path, *, expected: int | None = EXPECTED_ROOTS) -> dict[str, str]`, `lookup(index: dict[str, str], bw: str) -> str | None`.

- [ ] **Step 1: Write the failing test**

```python
# packages/scraper/tests/test_salmone.py
import io
import tarfile

import pytest

from scraper.sources.salmone import (
    EXPECTED_ROOTS,
    SALMONE_MEMBER,
    build_index,
    download_salmone,
    lookup,
)

ROOT_XML = (
    '<div2 part="N" n="SbE" org="uniform" type="root">'
    '<entryFree key="A^aSobaEu"><sense>Finger; digit.</sense></entryFree>'
    "</div2>"
)
# The real file writes `n` before `type` in all 6654 tags, but nothing in TEI
# guarantees that, and a positional pattern fails by matching *nothing* rather
# than raising. Both orders are fixtures so the matcher stays order-blind.
ROOT_XML_TYPE_FIRST = (
    '<div2 type="root" part="N" n="Sdr">'
    '<entryFree key="Sador"><sense>Breast, chest.</sense></entryFree>'
    "</div2>"
)
DOC = f"<?xml version='1.0'?><TEI.2><text><body>{ROOT_XML}</body></text></TEI.2>"


def _write_xml(tmp_path, body=DOC):
    path = tmp_path / "salmone.xml"
    path.write_text(body, encoding="utf-8")
    return path


def test_build_index_keys_each_root_entry(tmp_path):
    index = build_index(_write_xml(tmp_path), expected=1)
    assert "SbE" in index and "A^aSobaEu" in index["SbE"]


def test_build_index_reads_either_attribute_order(tmp_path):
    body = (
        "<?xml version='1.0'?><TEI.2><text><body>"
        f"{ROOT_XML}{ROOT_XML_TYPE_FIRST}</body></text></TEI.2>"
    )
    index = build_index(_write_xml(tmp_path, body), expected=2)
    assert sorted(index) == ["SbE", "Sdr"]


def test_build_index_rejects_a_file_holding_no_root_entries(tmp_path):
    # A truncated download parses as valid XML and yields an empty index, which
    # reads downstream as "Salmone covers none of our roots" -- a successful run.
    bad = _write_xml(tmp_path, "<?xml version='1.0'?><TEI.2><text><body/></text></TEI.2>")
    with pytest.raises(ValueError, match="expected"):
        build_index(bad)


def test_build_index_expected_none_disables_the_gate(tmp_path):
    # Documented escape hatch; without an assertion nothing catches the gate
    # being written against EXPECTED_ROOTS instead of `expected`.
    assert build_index(_write_xml(tmp_path), expected=None).keys() == {"SbE"}


def test_build_index_rejects_a_source_truncated_partway(tmp_path):
    # The failure this gate exists for: a transfer cut mid-file leaves whole,
    # well-formed root entries behind. Emptiness never catches that -- only the
    # key count does. `expected` defaults to the measured 6351.
    with pytest.raises(ValueError, match=str(EXPECTED_ROOTS)):
        build_index(_write_xml(tmp_path))


def test_lookup_finds_a_geminate_under_lanes_two_letter_key(tmp_path):
    path = tmp_path / "s.xml"
    path.write_text(
        '<div2 n="Sx" type="root"><entryFree key="Sax~a"><sense>Deafened.</sense>'
        "</entryFree></div2>",
        encoding="utf-8",
    )
    assert lookup(build_index(path, expected=1), "Sxx") is not None


def test_download_salmone_extracts_only_the_dictionary_member(tmp_path, monkeypatch):
    # The tarball also ships Lane and four Quran translations, ~15 MB we already
    # have or do not want on disk twice.
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name, body in (
            (SALMONE_MEMBER, DOC.encode()),
            ("Arabic/Lane/opensource/b0.xml", b"<TEI.2/>"),
        ):
            info = tarfile.TarInfo(name)
            info.size = len(body)
            tar.addfile(info, io.BytesIO(body))
    payload = buf.getvalue()

    class _Resp:
        content = payload

        def raise_for_status(self):
            return None

    monkeypatch.setattr(
        "scraper.http_retry.get_with_retry", lambda _client, _url: _Resp()
    )
    out = download_salmone(tmp_path)
    assert out.name == "salmone.xml" and out.read_text("utf-8") == DOC
    assert not (tmp_path / "Arabic").exists()  # nothing else unpacked


def test_download_salmone_is_idempotent(tmp_path, monkeypatch):
    existing = tmp_path / "salmone.xml"
    existing.write_text(DOC, encoding="utf-8")

    def _boom(*_args, **_kwargs):
        raise AssertionError("re-fetched a file already on disk")

    monkeypatch.setattr("scraper.http_retry.get_with_retry", _boom)
    assert download_salmone(tmp_path) == existing
```

- [ ] **Step 2: Run it and watch it fail**

Run: `packages/scraper/.venv/bin/pytest packages/scraper/tests/test_salmone.py -v`
Expected: FAIL — `ModuleNotFoundError: scraper.sources.salmone`

- [ ] **Step 3: Implement**

```python
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

Licence: Salmoné (1889) is public domain by age; Perseus's CC BY-SA 3.0 US
covers their digitisation and markup. We take sense text, never their markup.
The credit lives in apps/web/src/app/about/page.tsx.
"""

from __future__ import annotations

import re
from pathlib import Path

from ..salmone_gloss import entry_senses
from .perseus_keys import key_candidates, normalise_key

WAYBACK_TARBALL = (
    "https://web.archive.org/web/20241101223146if_/"
    "http://www.perseus.tufts.edu/hopper/opensource/downloads/texts/"
    "hopper-texts-Arabic.tar.gz"
)
SALMONE_MEMBER = "Arabic/Salmone/opensource/salmone.xml"

# Lookaheads, not a fixed sequence: `n` and `type` may appear in either order,
# and a positional pattern silently matches nothing rather than failing loudly.
_DIV2 = re.compile(r'<div2\b(?=[^>]*\btype="root")(?=[^>]*\bn="([^"]*)")[^>]*>')

# Measured on the 2011 tarball: 6654 root `<div2>` tags collapsing to 6351
# distinct normalised keys. The source is a frozen Wayback artefact, so this is
# an exact floor, not an estimate -- see `build_index`.
EXPECTED_ROOTS = 6351


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
        member = tar.extractfile(SALMONE_MEMBER)
        if member is None:
            raise ValueError(f"{SALMONE_MEMBER} missing from the Perseus tarball")
        payload = member.read()
    part = out.with_name(out.name + ".part")
    part.write_bytes(payload)
    # replace, not rename: under `force` the final name already exists, and
    # Path.rename raises FileExistsError for that on Windows.
    part.replace(out)
    return out


def build_index(xml_path: Path, *, expected: int | None = EXPECTED_ROOTS) -> dict[str, str]:
    """Map normalised root key -> that root's `<div2>` XML.

    First writer wins, matching `lane_tei.build_index`. Salmoné is one file with
    no Supplement volume, so there is no stub-outranks-entry rule to mirror.

    ``expected`` is the completeness gate; pass the fixture's own count in tests
    and ``None`` only when a caller genuinely does not know the size.
    """
    text = Path(xml_path).read_text(encoding="utf-8")
    index: dict[str, str] = {}
    for match in _DIV2.finditer(text):
        end = text.find("</div2>", match.end())
        if end == -1:
            continue
        index.setdefault(normalise_key(match.group(1)), text[match.start() : end + 7])
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
    return index


def lookup(index: dict[str, str], bw: str) -> str | None:
    """Entry XML for ``bw``, trying Perseus's indexing conventions in order."""
    return next(
        (index[k] for c in key_candidates(bw) if (k := normalise_key(c)) in index),
        None,
    )
```

`entry_senses` is imported for re-export convenience by the tool in Task 5; if ruff flags it unused, add it to an `__all__` rather than deleting the import.

- [ ] **Step 4: Run the test**

Run: `packages/scraper/.venv/bin/pytest packages/scraper/tests/test_salmone.py -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Verify against the real file**

```bash
cd "$(git rev-parse --show-toplevel)/packages/scraper" && .venv/bin/python -c "
from pathlib import Path
from scraper.sources.salmone import build_index, lookup
i = build_index(Path.home()/'quran-data/refdata/perseus-arabic/Arabic/Salmone/opensource/salmone.xml')
print(len(i), 'keys'); assert 6300 < len(i) < 6400, len(i)
assert lookup(i, 'SbE') is not None"
```
Expected: `6351 keys`, no assertion error.

- [ ] **Step 6: Commit**

```bash
git add packages/scraper/scraper/sources/salmone.py packages/scraper/tests/test_salmone.py
git commit -m "feat(scraper): read Salmone's dictionary from the Perseus tarball"
```

---

## Task 4: POS-filtered, frequency-ranked sense selection

Frequency ranking alone leaves 56 of 96 glosses opening on a past-tense verb — no better than Lane's 58 of 101. See the Facts section. The filter is what makes this phase worth doing; it is not an optional refinement.

**Files:**
- Modify: `packages/scraper/scraper/salmone_gloss.py` (append `is_verb_sense`, `is_cross_reference`, `select_sense`)
- Test: `packages/scraper/tests/test_salmone_gloss.py` (append)

**Interfaces:**
- Consumes: `entry_senses`, `skeleton` (Task 2).
- Produces:
  - `is_verb_sense(gloss: str) -> bool`
  - `is_cross_reference(gloss: str) -> bool`
  - `select_sense(entry_xml: str, form_counts: dict[str, int], prefer_nominal: bool = False) -> tuple[str, str, int] | None` — `(key, gloss, matched_count)`; `matched_count` is `0` when nothing matched and the first surviving candidate was used; `None` when the entry holds no sense at all. Task 5 passes `prefer_nominal`; the default keeps the two-argument call valid.

- [ ] **Step 1: Write the failing test**

```python
from scraper.salmone_gloss import is_cross_reference, is_verb_sense, select_sense

MULTI = (
    '<entryFree key="SabaHa"><sense>Came to, visited in the morning.</sense></entryFree>'
    '<entryFree key="Sab~aHa"><sense>Gave a morning draught.</sense></entryFree>'
    '<entryFree key="A^aSobaHa"><sense>Was or became morning, dawned.</sense></entryFree>'
)

# بعض, the measured worst case: Salmoné leads with the verb, the Quran is nominal.
BED = (
    '<entryFree key="baEaDa"><sense>Stung ( mosquito ).</sense></entryFree>'
    '<entryFree key="baEoD"><sense>Part, portion, lot.</sense></entryFree>'
)


def test_is_verb_sense_spots_a_regular_past_lead():
    assert is_verb_sense("Stung ( mosquito ).")
    assert is_verb_sense("Was or became morning, dawned.")  # irregular past
    assert not is_verb_sense("Part, portion, lot.")
    # The `len(word) > 3` guard's only witness: without it "Red" reads as a past
    # tense. Nothing else in this suite fails when that guard is dropped, so the
    # assertion lives here permanently rather than being added at mutation time.
    assert not is_verb_sense("Red.")


def test_is_cross_reference_spots_a_bare_pointer():
    assert is_cross_reference("see I ( a ).")
    assert not is_cross_reference("Seed, grain.")  # `see` must not match `Seed`


def test_select_sense_prefers_the_form_the_corpus_uses_most():
    # صبح: Form IV أَصْبَحَ is 20 corpus hits, Form II 1, Form I none at all.
    assert select_sense(MULTI, {">aSobaHa": 20, "Sab~aHa": 1}) == (
        "A^aSobaHa",
        "Was or became morning, dawned.",
        20,
    )


def test_select_sense_drops_the_verb_lead_for_a_nominal_root():
    # No corpus form matches either key, so without the filter this returns the
    # document-order first entry -- the verb. This is the measured بعض failure.
    assert select_sense(BED, {"zzz": 9}, prefer_nominal=True)[1] == "Part, portion, lot."
    assert select_sense(BED, {"zzz": 9}, prefer_nominal=False)[1] == "Stung ( mosquito )."


def test_select_sense_keeps_the_verb_when_filtering_would_empty_the_entry():
    # عين holds one sense and it is a verb; an empty candidate set must not win.
    only_verb = '<entryFree key="Eay~ana"><sense>Smote with the evil eye.</sense></entryFree>'
    assert select_sense(only_verb, {}, prefer_nominal=True) == (
        "Eay~ana",
        "Smote with the evil eye.",
        0,
    )


def test_select_sense_falls_back_to_the_first_entry_when_no_form_matches():
    key, gloss, count = select_sense(MULTI, {"xyz": 99})
    assert (key, count) == ("SabaHa", 0)
    assert gloss == "Came to, visited in the morning."


def test_select_sense_returns_none_when_the_entry_holds_no_sense():
    assert select_sense('<entryFree key="k"><form/></entryFree>', {"k": 5}) is None


def test_select_sense_is_stable_when_two_forms_tie_on_count():
    # Document order breaks the tie, so a re-run cannot silently pick differently.
    assert select_sense(MULTI, {"SabaHa": 3, "Sab~aHa": 3})[0] == "SabaHa"
```

- [ ] **Step 2: Run it and watch it fail**

Run: `packages/scraper/.venv/bin/pytest packages/scraper/tests/test_salmone_gloss.py -k "select_sense or is_verb or is_cross" -v`
Expected: FAIL — `ImportError: cannot import name 'is_verb_sense'`

- [ ] **Step 3: Implement**

```python
# Salmoné writes a verb sense as an English past tense: "Stung ( mosquito ).",
# "Slit, ripped open.". Regular `-ed` covers most; these are the irregulars that
# actually occur as a lead word across the 96 targets.
_IRREGULAR_PAST = frozenset(
    """was were became came went gave took made grew fell held bound bore broke
    cut drew fed felt found had heard kept knew laid led left lent let lost met
    put ran said sat set shook shone shot slew smote spoke spread stood struck
    stung swam threw told wore wove wrote""".split()
)
_VERB_LEAD = re.compile(r"^\s*([A-Za-z]+)")
_CROSS_REFERENCE = re.compile(r"^\s*(see\b|_ast)", re.IGNORECASE)


def is_verb_sense(gloss: str) -> bool:
    """True when the gloss opens on an English past tense, i.e. a verb sense."""
    match = _VERB_LEAD.match(gloss)
    if not match:
        return False
    word = match.group(1).lower()
    return word in _IRREGULAR_PAST or (word.endswith("ed") and len(word) > 3)


def is_cross_reference(gloss: str) -> bool:
    """True for a bare pointer at another entry ("see I ( a ).") -- not a gloss."""
    return bool(_CROSS_REFERENCE.match(gloss))


def select_sense(
    entry_xml: str,
    form_counts: dict[str, int],
    prefer_nominal: bool = False,
) -> tuple[str, str, int] | None:
    """Pick the sense for the form the Quran actually uses. See module docstring.

    ``form_counts`` maps a corpus form's Buckwalter spelling to how often it
    occurs; the caller builds it from `word_segments`. Matching is on the
    consonant skeleton because the two sources vocalise differently.

    ``prefer_nominal`` is set by the caller when the corpus uses this root
    mostly as a noun/adjective. Frequency ranking cannot separate a noun from a
    Form I verb of the same consonants -- both fold to one skeleton -- so
    without this filter بعض picks "Stung ( mosquito )." over "Part, portion,
    lot.". Measured: it takes verb-lead glosses from 56/96 to 7/96.

    The filter never empties the candidate set: a root whose only sense is a
    verb (عين) keeps that verb rather than returning nothing.

    Ranking by corpus frequency, not document order, is what makes صبع resolve
    to `A^aSobaEu` "Finger; digit." -- Salmoné's first block is the verb `SabaE`
    "Pointed at", the same wrong-sense trap Lane fell into. Document order still
    breaks ties, so the choice is reproducible.

    Returns ``matched_count == 0`` for the fallback, which the review TSV shows
    the human gate: those rows are Salmoné's leading sense with nothing
    corroborating it, so they are the rows most worth reading.
    """
    senses = entry_senses(entry_xml)
    if not senses:
        return None
    if prefer_nominal:
        nominal = [
            pair
            for pair in senses
            if not is_verb_sense(pair[1]) and not is_cross_reference(pair[1])
        ]
        senses = nominal or senses  # never let the filter empty the set
    by_skeleton: dict[str, int] = {}
    for form, count in form_counts.items():
        form_skeleton = skeleton(form)
        by_skeleton[form_skeleton] = by_skeleton.get(form_skeleton, 0) + count
    best_index, best_count = 0, 0
    for index, (key, _gloss) in enumerate(senses):
        count = by_skeleton.get(skeleton(key), 0)
        if count > best_count:  # `>`, not `>=`: document order breaks ties
            best_index, best_count = index, count
    key, gloss = senses[best_index]
    return key, gloss, best_count
```

- [ ] **Step 4: Run the test**

Run: `packages/scraper/.venv/bin/pytest packages/scraper/tests/test_salmone_gloss.py -v`
Expected: PASS (14 tests)

- [ ] **Step 5: Mutation-check — four flips, each must fail**

1. `count > best_count` → `count >= best_count`: the tie-stability test fails.
2. `senses = nominal or senses` → `senses = nominal`: the عين empty-set test fails.
3. Delete the `if prefer_nominal:` block: the بعض filter test fails.
4. `word.endswith("ed") and len(word) > 3` → `word.endswith("ed")`: the `not is_verb_sense("Red.")` assertion in `test_is_verb_sense_spots_a_regular_past_lead` fails. It is the only assertion in the suite that does — which is exactly why it was written into Step 1's test block and not improvised here.

Restore all four **from a copy, not `git checkout`** (see Task 2 Step 5 — the file is untracked at this point). Flip 4 exists because phase 21 shipped two assertions that could not fail.

- [ ] **Step 6: Commit**

```bash
git add packages/scraper/scraper/salmone_gloss.py packages/scraper/tests/test_salmone_gloss.py
git commit -m "feat(scraper): pick the Salmone sense by corpus part of speech and form frequency"
```

---

## Task 5: The TSV preparation tool

**Files:**
- Create: `packages/scraper/tools/prepare_salmone_glosses.py`
- Create: `packages/scraper/tools/salmone_rejects.txt`
- Test: `packages/scraper/tests/test_prepare_salmone_glosses.py`

**Interfaces:**
- Consumes: `salmone.build_index`, `salmone.lookup`, `salmone_gloss.select_sense`.
- Produces: `load_salmone_targets(db_path: Path, rejects: set[str] | None = None) -> list[str]`, `load_form_counts(db_path: Path, bw: str) -> dict[str, int]`, `load_nominal_share(db_path: Path, bw: str) -> float`, `build_rows(...)`, `review_rows(...)`, `main()`.

- [ ] **Step 1: Create the rejects file**

```
# Roots where Salmoné's selected sense is not the sense the Quran uses.
# One root per line, TAB, the reason. Read by load_salmone_targets, which
# subtracts them from the target list -- `import-lane` upserts, so without this
# a re-run silently reinstates every gloss the Task 7 gate rejected.
# Populated by Task 7. Empty until then.
```

- [ ] **Step 2: Write the failing test**

```python
# packages/scraper/tests/test_prepare_salmone_glosses.py
import sqlite3
import sys

import pytest

from tools import prepare_salmone_glosses
from tools.prepare_salmone_glosses import build_rows, review_rows

ENTRY = (
    '<entryFree key="SabaE"><sense>Pointed at, out.</sense></entryFree>'
    '<entryFree key="A^aSobaEu"><sense>Finger; digit.</sense></entryFree>'
)

BED = (
    '<entryFree key="baEaDa"><sense>Stung ( mosquito ).</sense></entryFree>'
    '<entryFree key="baEoD"><sense>Part, portion, lot.</sense></entryFree>'
)


def _db(tmp_path, roots_sql):
    db = tmp_path / "q.db"
    conn = sqlite3.connect(db)
    conn.executescript(
        """CREATE TABLE roots (id INTEGER PRIMARY KEY, root_buckwalter TEXT,
               occurrence_count INTEGER);
           CREATE TABLE root_definitions (root_id INTEGER, source TEXT);
           CREATE TABLE word_segments (root TEXT, form_buckwalter TEXT,
               pos_tag TEXT);"""
        + roots_sql
    )
    conn.commit()
    conn.close()
    return db


def test_build_rows_takes_the_sense_for_the_commonest_corpus_form():
    rows, quarantined, stats = build_rows(
        {"SbE": ENTRY}, ["SbE"], {"SbE": {">aSa`biEa": 2}}, {"SbE": 1.0}
    )
    assert rows == [("SbE", "Finger; digit.")]
    assert quarantined == [] and stats["glossed"] == 1


def test_build_rows_applies_the_nominal_filter_above_the_threshold():
    # No corpus form matches, so document order would pick the verb. A root the
    # corpus uses nominally must not lead with it. This is the بعض failure.
    nominal, _, _ = build_rows({"bED": BED}, ["bED"], {"bED": {}}, {"bED": 0.95})
    verbal, _, _ = build_rows({"bED": BED}, ["bED"], {"bED": {}}, {"bED": 0.10})
    assert nominal == [("bED", "Part, portion, lot.")]
    assert verbal == [("bED", "Stung ( mosquito ).")]


def test_build_rows_quarantines_a_root_salmone_does_not_hold():
    rows, quarantined, stats = build_rows({"SbE": ENTRY}, ["hmn"], {"hmn": {}}, {})
    assert rows == [] and quarantined == [("hmn", "not_in_salmone")]
    assert stats["not_in_salmone"] == 1


def test_build_rows_raises_on_an_empty_index():
    with pytest.raises(ValueError, match="empty Salmon"):
        build_rows({}, ["SbE"], {}, {})


def test_build_rows_raises_on_a_gloss_holding_a_tsv_delimiter(monkeypatch):
    # Both output files are delimiter-separated with no quoting, and import-lane
    # splits on the first tab -- one tab lands one root's text on another.
    monkeypatch.setattr(
        prepare_salmone_glosses,
        "select_sense",
        lambda _e, _f, prefer_nominal=False: ("k", "a\tb", 1),
    )
    with pytest.raises(ValueError, match="delimiter"):
        build_rows({"SbE": ENTRY}, ["SbE"], {"SbE": {}}, {})


def test_review_rows_flags_the_rows_no_corpus_form_corroborated():
    # matched=0 means Salmoné's leading sense was taken with nothing behind it.
    rows, quarantined, _ = build_rows(
        {"SbE": ENTRY}, ["SbE"], {"SbE": {"zzz": 9}}, {"SbE": 0.0}
    )
    assert review_rows(rows, quarantined) == [
        ("SbE", "unmatched", "SabaE", "Pointed at, out.")
    ]


def test_load_salmone_targets_covers_the_perseus_rows_and_the_empty_roots():
    pass  # replaced in Step 4


def test_load_form_counts_sums_the_corpus_spellings_of_a_root(tmp_path):
    db = _db(
        tmp_path,
        """INSERT INTO roots VALUES (1,'SbE',2);
           INSERT INTO word_segments VALUES ('SbE','>aSa`biEa','N'),
               ('SbE','>aSa`biEa','N'),('SbE','SabaEa','V');""",
    )
    assert prepare_salmone_glosses.load_form_counts(db, "SbE") == {
        ">aSa`biEa": 2,
        "SabaEa": 1,
    }


def test_load_nominal_share_counts_n_adj_and_pn_against_every_segment(tmp_path):
    db = _db(
        tmp_path,
        """INSERT INTO roots VALUES (1,'SbE',4);
           INSERT INTO word_segments VALUES ('SbE','a','N'),('SbE','b','ADJ'),
               ('SbE','c','PN'),('SbE','d','V');""",
    )
    assert prepare_salmone_glosses.load_nominal_share(db, "SbE") == 0.75


def test_load_nominal_share_is_zero_for_a_root_with_no_segments(tmp_path):
    # Division by the segment count; a root absent from word_segments must not
    # raise, and must not be treated as nominal.
    db = _db(tmp_path, "INSERT INTO roots VALUES (1,'SbE',0);")
    assert prepare_salmone_glosses.load_nominal_share(db, "SbE") == 0.0
```

Replace the `pass` placeholder with:

```python
def test_load_salmone_targets_covers_the_perseus_rows_and_the_empty_roots(tmp_path):
    # The target set is exactly "rows Salmoné is meant to outrank" plus "roots
    # with nothing at all" -- not every root Salmoné covers, which would add a
    # second card to ~90% of root pages.
    db = _db(
        tmp_path,
        """INSERT INTO roots VALUES (1,'SbE',2),(2,'hmn',1),(3,'Aty',549),(4,'nsA',7);
           INSERT INTO root_definitions VALUES (1,'perseus-lane'),
               (3,'qurandev-lane'),(4,'corpus-forms');""",
    )
    # SbE has a perseus-lane row, hmn has nothing -> both targets, most-used
    # first. Aty is curated Lane and nsA has a corpus-forms gloss -> neither.
    assert prepare_salmone_glosses.load_salmone_targets(db, rejects=set()) == [
        "SbE",
        "hmn",
    ]


def test_load_salmone_targets_drops_a_hand_rejected_root(tmp_path):
    db = _db(
        tmp_path,
        """INSERT INTO roots VALUES (1,'SbE',2),(2,'hmn',1);
           INSERT INTO root_definitions VALUES (1,'perseus-lane');""",
    )
    assert prepare_salmone_glosses.load_salmone_targets(db, rejects={"SbE"}) == ["hmn"]
```

- [ ] **Step 3: Run it and watch it fail**

Run: `packages/scraper/.venv/bin/pytest packages/scraper/tests/test_prepare_salmone_glosses.py -v`
Expected: FAIL — `ModuleNotFoundError: tools.prepare_salmone_glosses`

- [ ] **Step 4: Implement**

Mirror `tools/prepare_lane_glosses.py` — same two guards (empty index raises; every non-gloss root is *reported*, never silently dropped), same delimiter check, same `main()` shape with `--db`, `--out`, `--review`. Differences to write:

```python
_SALMONE_SOURCE = "salmone"


def load_salmone_targets(
    db_path: Path, rejects: set[str] | None = None
) -> list[str]:
    """Roots Salmoné is meant to cover, most-used first.

    Two disjoint groups: roots whose only definition is a `perseus-lane` row --
    the wrong-sense import this phase exists to outrank -- and roots with no
    definition at all. A root already carrying curated Lane or a corpus-forms
    gloss is not a target; see the plan's "Target set" note for why this is not
    every root Salmoné covers.
    """
    query = """SELECT r.root_buckwalter FROM roots r
               WHERE NOT EXISTS (
                   SELECT 1 FROM root_definitions d
                   WHERE d.root_id = r.id AND d.source <> 'perseus-lane')
               ORDER BY r.occurrence_count DESC"""
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        rows = conn.execute(query).fetchall()
    finally:
        conn.close()
    skip = load_rejects() if rejects is None else rejects
    return [row[0] for row in rows if row[0] not in skip]


def load_form_counts(db_path: Path, bw: str) -> dict[str, int]:
    """Corpus spelling -> occurrences, for `select_sense`'s ranking."""
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        return {
            form: count
            for form, count in conn.execute(
                """SELECT form_buckwalter, COUNT(*) FROM word_segments
                   WHERE root = ? AND form_buckwalter IS NOT NULL
                   GROUP BY form_buckwalter""",
                (bw,),
            )
        }
    finally:
        conn.close()


_NOMINAL_TAGS = ("N", "ADJ", "PN")
NOMINAL_THRESHOLD = 0.8


def load_nominal_share(db_path: Path, bw: str) -> float:
    """Fraction of this root's corpus segments tagged noun, adjective or proper noun.

    Drives `select_sense(prefer_nominal=...)`. A root the Quran uses nominally
    must not be glossed with Salmoné's leading Form I verb; see the plan's
    measurement, 56/96 verb-lead down to 7/96.

    Returns 0.0 for a root with no segments -- absent evidence is not evidence
    of a nominal root, and the filter stays off.
    """
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        placeholders = ",".join("?" * len(_NOMINAL_TAGS))
        total, nominal = conn.execute(
            f"""SELECT COUNT(*),
                       COUNT(*) FILTER (WHERE pos_tag IN ({placeholders}))
                  FROM word_segments WHERE root = ?""",
            (*_NOMINAL_TAGS, bw),
        ).fetchone()
    finally:
        conn.close()
    return nominal / total if total else 0.0
```

`build_rows(index, targets, form_counts, nominal_shares)` takes both lookups as dicts so it stays pure and testable — the DB reads happen in `main()`, which builds them together in one pass over the targets:

```python
form_counts = {root: load_form_counts(db, root) for root in targets}
nominal_shares = {root: load_nominal_share(db, root) for root in targets}
```

It calls:

```python
select_sense(
    entry,
    form_counts.get(root, {}),
    prefer_nominal=nominal_shares.get(root, 0.0) > NOMINAL_THRESHOLD,
)
```

`review_rows(rows, quarantined)` emits `(root, status, key, gloss)` where status is `kept` when a corpus form corroborated the pick and **`unmatched`** when `matched_count == 0`. `unmatched` is the Task 7 review's priority queue: measured at **54 of 96**.

`main()` prints:

```
Salmoné -> TSV: {kept} kept of {total} targets ({not_in_salmone} not in Salmoné,
{no_sense} no sense, {unmatched} unmatched to eyeball) -> {out}; review {review}
```

- [ ] **Step 5: Run the tests**

Run: `packages/scraper/.venv/bin/pytest packages/scraper/tests/test_prepare_salmone_glosses.py -v`
Expected: PASS (11 tests)

- [ ] **Step 6: Mutation-check the three assertions most at risk**

`test_load_salmone_targets_drops_a_hand_rejected_root`: empty the `rejects` filter → must fail. `test_review_rows_flags_the_rows_no_corpus_form_corroborated`: hard-code status `kept` → must fail. `test_build_rows_applies_the_nominal_filter_above_the_threshold`: hard-code `prefer_nominal=False` at the `select_sense` call → must fail. The first two are the exact shape phase 21 shipped vacuously.

- [ ] **Step 7: Commit**

```bash
git add packages/scraper/tools/prepare_salmone_glosses.py \
        packages/scraper/tools/salmone_rejects.txt \
        packages/scraper/tests/test_prepare_salmone_glosses.py
git commit -m "feat(scraper): build the Salmone importer TSV with a review gate"
```

---

## Task 6: CLI wiring

**Files:**
- Modify: `packages/scraper/scraper/cli.py`
- Test: `packages/scraper/tests/test_cli.py`

**Interfaces:**
- Consumes: `salmone.download_salmone`.
- Produces: `fetch-salmone --dest PATH [--force]`. **No new import command** — `import-lane --source salmone` already does it.

- [ ] **Step 1: Write the failing test**

```python
def test_fetch_salmone_reports_the_file_and_honours_force(tmp_path, monkeypatch):
    calls = []

    def _fake(dest, *, force=False):
        calls.append(force)
        out = dest / "salmone.xml"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b"x" * 2048)
        return out

    monkeypatch.setattr("scraper.sources.salmone.download_salmone", _fake)
    result = CliRunner().invoke(main, ["fetch-salmone", "--dest", str(tmp_path)])
    assert result.exit_code == 0 and "salmone.xml" in result.output
    assert "2.0 KB" in result.output or "2048" in result.output
    result = CliRunner().invoke(
        main, ["fetch-salmone", "--dest", str(tmp_path), "--force"]
    )
    assert result.exit_code == 0 and calls == [False, True]
```

- [ ] **Step 2: Run it and watch it fail**

Run: `packages/scraper/.venv/bin/pytest packages/scraper/tests/test_cli.py -k salmone -v`
Expected: FAIL — no such command `fetch-salmone`

- [ ] **Step 3: Implement**

Follow the existing `fetch-lane-tei` command's shape exactly — same `--dest` default under `~/quran-data/refdata/`, same size roll-up in the output line.

- [ ] **Step 4: Run the tests**

Run: `packages/scraper/.venv/bin/pytest packages/scraper/tests/test_cli.py -v`
Expected: PASS

- [ ] **Step 5: Do NOT run `ruff format` on `test_cli.py`**

It reformats pre-existing hand-packed code and pollutes the diff — cost an unpick in phase 21. Format only the lines you added, by hand.

- [ ] **Step 6: Commit**

```bash
git add packages/scraper/scraper/cli.py packages/scraper/tests/test_cli.py
git commit -m "feat(scraper): add fetch-salmone"
```

---

## Task 7: The human gate

**No code.** This is the review the whole phase is built around, and it is a **blocking checkpoint**: nothing is imported until it is done and the user has signed off.

- [ ] **Step 1: Generate the TSVs**

```bash
cd "$(git rev-parse --show-toplevel)/packages/scraper"
.venv/bin/python -m tools.prepare_salmone_glosses \
  ~/quran-data/refdata/perseus-arabic/Arabic/Salmone/opensource/salmone.xml \
  --db ~/quran-data/quran.db \
  --out /tmp/salmone.tsv --review /tmp/salmone-review.tsv
```
Expected: ≈`96 kept of 101 targets (5 not in Salmoné, 0 no sense, ~54 unmatched to eyeball)`. Numbers are approximate on purpose — pinning them makes the plan stale the first time the extractor improves.

- [ ] **Step 2: Review the `unmatched` rows first**

Those took Salmoné's leading sense with no corpus form behind it — the same failure mode as the Lane import. Known-wrong examples to confirm are caught, all measured in the spike: كيف → "Enjoyment." (Quranic كيف is the interrogative particle; nominal share 0.04, so the POS filter is skipped by design), عين → "Hurt the eye of…" (Salmoné's entry holds one sense), طرف → "Noble." (**the POS filter's one measured regression** — it dropped the better verb sense "Winked, blinked, twinkled ( eye )."), بين → "Separation." (Quranic sense is "between"). Reject them here rather than widening the algorithm.

> **Amended after `/code-review` (2026-08-04).** Three selection defects were found and fixed before this gate ran, so the list above is partly stale: **كيف now reads "How? In what way?" and needs no rejection.** طرف and عين still stand as written. The counts moved to `91 glossed of 101 (10 not in Salmoné, 0 no sense, 48 unmatched and 4 tied)` — `glossed`, not `kept`, because `kept` is also a review status and only 39 of the 91 carry it.
>
> `tie` is a **new third status** and a second priority queue alongside `unmatched`: the pick came down to Salmoné's document order between senses the corpus evidence scored equally — deterministic, but backed by nothing. Read all 4 (طرف, لوح, صفر, صبغ). Previously these rows were silently marked `kept`, which is what hid مصر → "Remains of milk." and طور → "A time; once." from this gate.
>
> **Amended again after CodeRabbit round 3 (2026-08-05).** لوح is the fourth tie; the list above read "all 3" until this amendment added it. A rung that scored two candidates *equally* kept only the first, which reported `tied` False and sent the row through as `kept`. Its gloss did not change ("Plank, board; slate; tablet; table."), only its visibility to this gate.

- [ ] **Step 3: Review the `kept` rows**

Verify against the root's actual Quranic forms — the review TSV names the selected key, so this is a scan, not a re-read of the source.

- [ ] **Step 4: Write every rejection into `tools/salmone_rejects.txt`**

`root<TAB>reason`. A rejected root must never be silently dropped from the TSV instead — `import-lane` upserts, so only the rejects file keeps a re-run from reinstating it.

- [ ] **Step 5: Re-run Step 1 and confirm the rejected roots are gone**

- [ ] **Step 6: Commit the rejects file, then STOP and get user sign-off before Task 8**

```bash
git add packages/scraper/tools/salmone_rejects.txt
git commit -m "chore(scraper): record the Salmone human-gate rejections"
```

---

## Task 8: Import, rank, credit

**Files:**
- Modify: `packages/data/src/queries/roots.ts`, `packages/data/tests/roots.test.ts`
- Modify: `apps/web/src/lib/definitionSources.ts`, `apps/web/src/test/definitionSources.test.ts`
- Modify: `apps/web/src/app/about/page.tsx`, `apps/web/src/test/about.test.tsx`

- [ ] **Step 1: Write the failing rank test**

```typescript
it('ranks a Salmoné gloss above both the corpus strip and perseus-lane', async () => {
  // Salmoné is a dictionary entry selected for the form the Quran uses; the
  // other two are a scraped form-strip and Lane's leading form-I verb sense.
  const local = newFileDb();
  await runMigrations(local);
  await local.execute(
    `INSERT INTO roots (id,root_buckwalter,root_arabic,occurrence_count)
     VALUES (1,'SbE','ص ب ع',2)`,
  );
  await local.execute(
    `INSERT INTO root_definitions (root_id,source,definition) VALUES
     (1,'perseus-lane','He pointed at him with his finger'),
     (1,'corpus-forms','finger'),(1,'salmone','Finger; digit.')`,
  );
  const defs = await getRootDefinitions(local, 1);
  expect(defs.map((d) => d.source)).toEqual([
    'salmone',
    'corpus-forms',
    'perseus-lane',
  ]);
});

it('keeps curated Lane above Salmoné', async () => {
  const local = newFileDb();
  await runMigrations(local);
  await local.execute(
    `INSERT INTO roots (id,root_buckwalter,root_arabic,occurrence_count)
     VALUES (1,'SbE','ص ب ع',2)`,
  );
  await local.execute(
    `INSERT INTO root_definitions (root_id,source,definition) VALUES
     (1,'salmone','Finger; digit.'),(1,'qurandev-lane','the finger')`,
  );
  const defs = await getRootDefinitions(local, 1);
  expect(defs.map((d) => d.source)).toEqual(['qurandev-lane', 'salmone']);
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd packages/data && npx vitest run tests/roots.test.ts`
Expected: FAIL — `salmone` falls to the `ELSE 3` bucket.

- [ ] **Step 3: Update the rank**

```typescript
export const DEFINITION_SOURCE_RANK = `CASE rd.source
       WHEN 'lane' THEN 0
       WHEN 'qurandev-lane' THEN 0
       WHEN 'salmone' THEN 1
       WHEN 'corpus-forms' THEN 2
       WHEN 'perseus-lane' THEN 3
       ELSE 4
     END, rd.source`;
```

Extend the block comment: Salmoné sits below curated Lane (1889 learner's dictionary vs the standard classical lexicon) and above both the corpus strip and `perseus-lane`, because its sense is selected for the form the corpus actually uses. The lemma page takes `LIMIT 1` off this order, so this decides which single gloss it shows.

- [ ] **Step 4: Label and credit**

`definitionSources.ts` — add `['salmone', "Salmoné's Arabic-English Dictionary"]`, plus a test asserting the label. An unmapped tag renders the raw `salmone` string on both the root and lemma page, which is a §11 attribution failure.

`about/page.tsx` — add a source entry:

- name: `An Advanced Learner's Arabic-English Dictionary (Salmoné)`
- license: `Public domain (text); CC BY-SA 3.0 US (Perseus digitisation)`
- note: H. Anthony Salmoné, Beirut: Librairie du Liban, 1889. Text provided by the Perseus Digital Library, digitised with National Science Foundation funding. The 1889 work is public domain by age; Perseus's markup is CC BY-SA 3.0 US and this credit is its condition.

Also extend the existing Perseus entry's description — it currently says "the TEI text of Lane's Lexicon"; Perseus now supplies two works.

- [ ] **Step 5: Run every suite**

```bash
cd packages/data && npx vitest run && npx tsc --noEmit
cd ../../apps/web && npx vitest run
cd ../../packages/scraper && .venv/bin/pytest tests -q && .venv/bin/mypy scraper tools
```
Expected: all pass; ruff no worse than the HEAD baseline.

- [ ] **Step 6: Back up the live DB, then import — ASK FIRST**

A live-DB write needs explicit permission at the moment of writing. Do not run this because the plan contains it.

```bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)/packages/scraper"
# Hold the generated path: a `.bak-*` glob expands to every previous backup,
# which makes `test -s` either fail on "too many arguments" or check the wrong
# file -- never the one just written.
backup=~/quran-data/quran.db.bak-$(date +%Y%m%d-%H%M%S)
cp ~/quran-data/quran.db "$backup"
test -s "$backup"   # a zero-byte backup is not a backup
cp ~/quran-data/quran.db ~/quran-data/quran.db.new
.venv/bin/python -m scraper.cli import-lane /tmp/salmone.tsv \
  --db ~/quran-data/quran.db.new --source salmone
test -s ~/quran-data/quran.db.new
mv ~/quran-data/quran.db.new ~/quran-data/quran.db
```

- [ ] **Step 7: Verify by alignment, not by count**

Row count proves nothing (§14, and the `validate-data-by-alignment-not-count` rule). Spot-check the four roots from the screenshots that started this phase and confirm the card now leads with the short gloss:

The point of the check is *which definition leads*, so it must order by the same
rank the app does. `ORDER BY d.source` is alphabetical — under it `corpus-forms`
sorts before `salmone` before `perseus-lane` regardless of rank, so it would
print a passing-looking result even if Task 8's `DEFINITION_SOURCE_RANK` edit
were never made. Mirror the rank expression instead:

```bash
.venv/bin/python -c "
import sqlite3
RANK = '''CASE d.source WHEN 'lane' THEN 0 WHEN 'qurandev-lane' THEN 0
          WHEN 'salmone' THEN 1 WHEN 'corpus-forms' THEN 2
          WHEN 'perseus-lane' THEN 3 ELSE 4 END'''
c = sqlite3.connect('$HOME/quran-data/quran.db')
for bw in ('SbE','SbH','Sdr','Sxx','EZm','dwn'):
    rows = c.execute(f'''SELECT d.source, d.definition FROM roots r
        JOIN root_definitions d ON d.root_id=r.id
        WHERE r.root_buckwalter=? ORDER BY {RANK}, d.source''', (bw,)).fetchall()
    print(bw, 'LEADS:', rows[0] if rows else None)
    print('   all:', rows)"
```
Expected: every one of the six **leads** with `salmone` — `SbE` = `Finger; digit.`,
`SbH` = `Was or became morning, dawned`. The `RANK` literal above must match the
`DEFINITION_SOURCE_RANK` Task 8 ships; if the two drift, this check is worthless.
Cross-check the same six through `getRootDefinitions` after the `packages/data`
rebuild below, which is the query the page actually runs.

Then rebuild `packages/data` and restart the dev server — `apps/web` imports the compiled `dist/`, so a `packages/data` edit does nothing live until both happen. **Never run `npm run build` in `apps/web` while `next dev` is running** (shared `.next` → CSS 404s and MODULE_NOT_FOUND).

- [ ] **Step 8: Browser smoke on a mobile viewport**

`/dictionary/SbE`, `/dictionary/SbH`, `/dictionary/Sdr` — Salmoné card first, Lane still present below. `/about` — both Perseus works credited.

- [ ] **Step 9: Commit**

```bash
git add packages/data/src/queries/roots.ts packages/data/tests/roots.test.ts \
        apps/web/src/lib/definitionSources.ts apps/web/src/test/definitionSources.test.ts \
        apps/web/src/app/about/page.tsx apps/web/src/test/about.test.tsx
git commit -m "feat(data): rank and credit the Salmone gloss source"
```

---

## Risks and Rollbacks

| risk | mitigation | rollback |
|---|---|---|
| Selected sense is still the wrong one (كيف "Enjoyment.", بين "Separation.") | Task 7 reviews all 101; `unmatched` rows first. Measured, not hoped: 54 of 96 need eyeballing. | `salmone_rejects.txt` + `DELETE FROM root_definitions WHERE source='salmone' AND root_id IN (...)` |
| POS filter picks a *worse* sense than frequency alone | Measured across all 96: it is net strongly positive (verb-lead 56 → 7) with **one** regression, طرف → "Noble.". Task 7 sees every row, so a regression is a reject, not a silent ship. | Reject the root; or set `NOMINAL_THRESHOLD` above 1.0 to disable the filter wholesale and re-run — no DB write happens before Task 8 |
| Whole import is wrong | Backup before write; every row carries `source='salmone'` | `DELETE FROM root_definitions WHERE source='salmone'` — one statement, no other source touched |
| Wayback snapshot disappears | The tarball is already on disk at `~/quran-data/refdata/perseus-arabic/`; `download_salmone` is idempotent and never re-fetches a present file | Re-pin to a different snapshot; the timestamp is one constant |
| Task 1's move changes Lane behaviour | The pre-existing Lane tests must pass **untouched** — that is the check | `git revert` the single refactor commit |
| Skeleton folding is too aggressive and matches an unrelated form | Shadda kept (measured: 28 roots disagree, all favour keeping it); `matched_count` surfaces every uncorroborated pick to the gate | Tune `_VOWELS`/`_SEATS` and re-run; no DB write is involved until Task 8 |
| `perseus-lane` rows now render second and look redundant | Deliberate for this phase — the Lane text is still the fuller entry | Separate decision; a `DELETE ... WHERE source='perseus-lane'` is available but is not this phase's call |

## Acceptance Criteria

- [ ] `packages/scraper/.venv/bin/pytest tests -q` passes; every pre-existing Lane test unmodified.
- [ ] `packages/scraper/.venv/bin/mypy scraper tools` clean.
- [ ] `ruff check` no worse than the HEAD baseline in any touched file.
- [ ] `packages/data`: `npx vitest run` and `npx tsc --noEmit` both clean.
- [ ] `apps/web`: `npx vitest run` clean.
- [ ] No file over 1 MB added to git; `git status` clean of `salmone.xml` and any `.tar.gz`.
- [ ] Every new assertion mutation-checked — flip the guard, watch it fail, restore.
- [ ] Task 7 complete, rejections recorded with reasons, user signed off.
- [ ] Live DB: `SELECT COUNT(*) FROM root_definitions WHERE source='salmone'` > 0, and the four screenshot roots (صبع صبح صدر صخخ) each lead with the short gloss.
- [ ] Empty roots, checked **per source, not by count**: exactly 15 of the 18
      carry a `root_definitions` row with `source='salmone'`, and only
      `Ayy dmw klw` are left with no definition at all. A bare `18 → 3` proves
      neither — a partial Salmoné import or a row arriving from any other source
      satisfies it (§14, `validate-data-by-alignment-not-count`). The other two
      of the five unreachable roots (`Hyv trq`) already carry a `perseus-lane`
      row, so they never counted toward this number.

      ```sql
      -- expect 15
      SELECT COUNT(*) FROM roots r JOIN root_definitions d ON d.root_id = r.id
      WHERE d.source = 'salmone' AND r.root_buckwalter IN (<the 18 keys>);
      -- expect exactly Ayy, dmw, klw
      SELECT r.root_buckwalter FROM roots r
      LEFT JOIN root_definitions d ON d.root_id = r.id WHERE d.id IS NULL;
      ```
- [ ] Glosses opening on a past-tense verb across the imported set: **≤ 12 of 96** (frequency-only baseline is 56; measured POS-filtered figure is 7, with headroom for the extractor changing). Check with the same regex Task 4 ships, over the generated TSV — not over the DB, so it runs before Task 8.
- [ ] `/about` credits Salmoné and Perseus.
- [ ] CodeRabbit gate passed on the head commit — check-run description read, not just its colour, and the pre-merge check table opened.

## Out of Scope

- Widening to all 1468 roots Salmoné covers. One-line change to `load_salmone_targets`; a separate decision.
- Deleting the `perseus-lane` rows.
- The logged phase-21 debt: the `―` cut not bounding a gloss to one sense, retrying the 25 Lane-rejected roots with an `<itype>`-aware rule. Salmoné sidesteps both; it does not fix them.
- The five roots Salmoné does not reach.
