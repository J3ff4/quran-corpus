# Uz WbW Alignment — Phase 0 SPIKE Implementation Plan

> **Status (2026-07-27): the spike ran; the code it describes is deliberately
> not in this repo.** The spike was throwaway tooling that scores our candidate
> glosses against scraped third-party reference databases, so it was archived
> outside version control before this repo went public. Kept here is the
> decision record only — this plan, the design spec, and the go/no-go report,
> which is what future work actually needs. The code listings below are the
> as-designed versions, not a maintained copy.
>
> The islom SQLCipher key that this document's companion spec once recorded has
> been removed and must not be re-added anywhere in this repo — it is a third
> party's credential, so it cannot be rotated on our side.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spike-test whether LLM verse→word alignment of Sodik's Uzbek verse translation yields per-word glosses good enough to replace NLLB `mt` slop — measured against the islom.uz human word-split (same translator). Produce a go/no-go report.

**Architecture:** Read-only spike. Load Sodik verses + corpus words (canonical `quran.db`) for 3 surahs; strip tafsir parentheticals; LLM-align each verse to word ids (Cyrillic gloss); transliterate Cyrillic→Latin; score vs islom (gold, same translator) + Tasnim (secondary, other translator). No writes to `quran.db`. No shipped data. Output = metrics + report + go/no-go.

**Tech Stack:** Python (scraper pkg, `uv`), stdlib `sqlite3`/`re`/`unicodedata`, `pytest`. No new runtime deps. LLM alignment produced by the executing agent (no SDK wired in the spike).

## Global Constraints

- Spike is **read-only** on `quran.db` (canonical `/home/claude/quran-data/quran.db`). No `.bak` needed; do NOT write glosses in Phase 0.
- Reference DBs (`islom_decrypted.db`, `TasnimDatabase.db`) live in gitignored `packages/scraper/.refdata/`. **Inspection-only.** Their text is scored/flagged, NEVER written to `quran.db` or committed (spec §Legal boundary).
- Module dir: `packages/scraper/scraper/`. Tests: `packages/scraper/tests/`. Glue tooling: `packages/scraper/tools/`.
- Output gloss script = **Latin** (align in Cyrillic source, transliterate). Compare everything in Latin.
- Spike surahs = **1, 112, 67** (377 words). Few-shot examples drawn from islom **surah 2** (outside scored set).
- Conventional Commits; commit **named paths only** (never `git add -A`); never commit `.refdata/` or reference DBs. Greptile 5/5 before any merge.
- **This spike is a hard go/no-go gate.** Phase 1 (full 6236-verse pipeline) gets its own plan authored only after this spike passes.
- Commit messages end: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

- Create `packages/scraper/scraper/uz_text.py` — `strip_tafsir_parens(cyr)->str`, `cyr_to_lat(cyr)->str`. **Reused in Phase 1.**
- Create `packages/scraper/tests/test_uz_text.py`
- Create `packages/scraper/scraper/uz_align_eval.py` — `normalize_ar(s)->str`, `build_ref_index(rows)->dict`, `jaccard(a,b)->float`, `score(aligned, ref_index)->dict`. **Reused in Phase 1 eval.**
- Create `packages/scraper/tests/test_uz_align_eval.py`
- Create `packages/scraper/tools/uz_align_spike.py` — glue: load refs+corpus, build alignment bundle, run eval, print metrics. Untested orchestration.
- Create `packages/scraper/.gitignore` — ignore `.refdata/` + spike outputs.
- Create `docs/superpowers/spikes/2026-07-09-uz-align-spike-report.md` — go/no-go report (deliverable).

---

### Task 1: uz_text.strip_tafsir_parens

**Files:**
- Create: `packages/scraper/scraper/uz_text.py`
- Test: `packages/scraper/tests/test_uz_text.py`

**Interfaces:**
- Produces: `strip_tafsir_parens(s: str) -> str` — removes `(...)` spans (nested), collapses whitespace.

- [ ] **Step 1: Write the failing test**

```python
# packages/scraper/tests/test_uz_text.py
from scraper.uz_text import strip_tafsir_parens


def test_strip_removes_paren_span():
    assert strip_tafsir_parens("Барча мақтов (шукрлар) Аллоҳга") == "Барча мақтов Аллоҳга"


def test_strip_nested_parens():
    assert strip_tafsir_parens("a (b (c) d) e") == "a e"


def test_strip_collapses_whitespace():
    assert strip_tafsir_parens("x   y") == "x y"


def test_strip_no_parens_unchanged():
    assert strip_tafsir_parens("Меҳрибон Аллоҳ") == "Меҳрибон Аллоҳ"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/scraper && uv run pytest tests/test_uz_text.py -q`
Expected: FAIL — `ModuleNotFoundError: scraper.uz_text`.

- [ ] **Step 3: Write minimal implementation**

```python
# packages/scraper/scraper/uz_text.py
"""Uzbek text utilities: tafsir-parenthetical stripping + Cyrillic→Latin.

Reused by the WbW gloss alignment pipeline. No proprietary data here.
"""
import re


def strip_tafsir_parens(s: str) -> str:
    """Remove parenthetical tafsir spans (nested), collapse whitespace.

    Sodik's verse translation interleaves commentary in `(...)`. The core
    translation is what aligns to words; parentheticals are dropped.
    Note: only handles `()`-delimited tafsir, not un-parenthesised trailing
    commentary — the spike report quantifies residual noise.
    """
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r"\([^()]*\)", "", s)  # innermost first; loop for nesting
    return re.sub(r"\s+", " ", s).strip()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/scraper && uv run pytest tests/test_uz_text.py -q`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/scraper/uz_text.py packages/scraper/tests/test_uz_text.py
git commit -m "feat(scraper): strip_tafsir_parens for Sodik verse text

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: uz_text.cyr_to_lat

**Files:**
- Modify: `packages/scraper/scraper/uz_text.py`
- Test: `packages/scraper/tests/test_uz_text.py`

**Interfaces:**
- Produces: `cyr_to_lat(s: str) -> str` — deterministic Uzbek Cyrillic→Latin.

- [ ] **Step 1: Write the failing test**

```python
# append to packages/scraper/tests/test_uz_text.py
from scraper.uz_text import cyr_to_lat


def test_cyr_basic_words():
    assert cyr_to_lat("Меҳрибон") == "Mehribon"
    assert cyr_to_lat("Аллоҳнинг") == "Allohning"
    assert cyr_to_lat("мақтов") == "maqtov"
    assert cyr_to_lat("ризқ") == "rizq"
    assert cyr_to_lat("оламларнинг") == "olamlarning"


def test_cyr_special_letters():
    assert cyr_to_lat("мўминларга") == "mo'minlarga"  # ў→o', қ n/a
    assert cyr_to_lat("подшоҳи") == "podshohi"          # ш→sh, ҳ→h
    assert cyr_to_lat("берувчи") == "beruvchi"          # е mid-word→e


def test_cyr_ye_word_start():
    assert cyr_to_lat("Ер") == "Yer"
    assert cyr_to_lat("ҳар ерда") == "har yerda"        # е after space→ye
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/scraper && uv run pytest tests/test_uz_text.py -q`
Expected: FAIL — `ImportError: cannot import name 'cyr_to_lat'`.

- [ ] **Step 3: Write minimal implementation**

```python
# append to packages/scraper/scraper/uz_text.py

# ponytail: ASCII apostrophe for o'/g'/tutuq; switch to ʻ (U+02BB) if the UI
# standardises on modifier-letter apostrophe.
_MULTI = {"ё": "yo", "ю": "yu", "я": "ya", "ц": "ts", "ч": "ch", "ш": "sh",
          "щ": "sh", "ў": "o'", "ғ": "g'", "ъ": "'"}
_SINGLE = {"а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ж": "j",
           "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
           "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t",
           "у": "u", "ф": "f", "х": "x", "қ": "q", "ҳ": "h", "э": "e",
           "ь": ""}
_VOWELS = set("аеёиоуэюяўо")


def _lat_char(ch: str, prev: str | None) -> str:
    if ch == "е":
        boundary = prev is None or not prev.isalpha()
        return "ye" if boundary or prev in _VOWELS or prev in "ъь" else "e"
    if ch in _MULTI:
        return _MULTI[ch]
    return _SINGLE.get(ch, ch)


def cyr_to_lat(s: str) -> str:
    """Deterministic Uzbek Cyrillic→Latin transliteration."""
    out, prev = [], None
    for ch in s:
        low = ch.lower()
        lat = _lat_char(low, prev)
        if ch != low and lat:  # was uppercase
            lat = lat[0].upper() + lat[1:]
        out.append(lat)
        prev = low
    return "".join(out)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/scraper && uv run pytest tests/test_uz_text.py -q`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/scraper/uz_text.py packages/scraper/tests/test_uz_text.py
git commit -m "feat(scraper): Uzbek Cyrillic→Latin transliterator

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: uz_align_eval scoring module

**Files:**
- Create: `packages/scraper/scraper/uz_align_eval.py`
- Test: `packages/scraper/tests/test_uz_align_eval.py`

**Interfaces:**
- Consumes: `cyr_to_lat` from Task 2.
- Produces:
  - `normalize_ar(s: str) -> str` — strip harakat/tatweel, fold alef/hamza/ta-marbuta.
  - `build_ref_index(rows: list[tuple[str, str]]) -> dict[str, str]` — `[(arabic, gloss)]` → `{normalized_ar_token: gloss}` (each token of a grouped phrase maps to its gloss; first write wins).
  - `jaccard(a: str, b: str) -> float` — token-set Jaccard on lowercased strings.
  - `score(aligned: list[dict], ref_index: dict[str, str]) -> dict` — aligned rows `{arabic, gloss_lat}` vs ref; returns `{coverage, matched, exact_pct, mean_jaccard}`.

- [ ] **Step 1: Write the failing test**

```python
# packages/scraper/tests/test_uz_align_eval.py
from scraper.uz_align_eval import normalize_ar, build_ref_index, jaccard, score


def test_normalize_ar_folds_diacritics_and_alef():
    assert normalize_ar("ٱلرَّحْمَٰنِ") == normalize_ar("الرَّحْمَٰنِ")
    assert normalize_ar("ٱلرَّحْمَٰنِ") == "الرحمن"


def test_build_ref_index_splits_grouped_phrase():
    idx = build_ref_index([("يَوْمِ الدِّينِ", "qiyomat kuni"), ("اللهِ", "alloh")])
    assert idx[normalize_ar("يوم")] == "qiyomat kuni"
    assert idx[normalize_ar("الدين")] == "qiyomat kuni"
    assert idx[normalize_ar("الله")] == "alloh"


def test_jaccard():
    assert jaccard("a b c", "a b") == 2 / 3
    assert jaccard("x", "x") == 1.0
    assert jaccard("x", "y") == 0.0


def test_score_coverage_and_agreement():
    ref = build_ref_index([("اللهِ", "alloh"), ("رَبِّ", "robbi")])
    aligned = [
        {"arabic": "اللهِ", "gloss_lat": "alloh"},      # exact
        {"arabic": "رَبِّ", "gloss_lat": "robbisi"},    # partial (0 token overlap)
        {"arabic": "نَاسِ", "gloss_lat": ""},           # no gloss, no ref
    ]
    r = score(aligned, ref)
    assert r["coverage"] == 2 / 3          # 2 of 3 have gloss text
    assert r["matched"] == 2               # 2 found in ref
    assert r["exact_pct"] == 0.5           # 1 of 2 matched exact
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/scraper && uv run pytest tests/test_uz_align_eval.py -q`
Expected: FAIL — `ModuleNotFoundError: scraper.uz_align_eval`.

- [ ] **Step 3: Write minimal implementation**

```python
# packages/scraper/scraper/uz_align_eval.py
"""Score aligned uz glosses against a reference WbW index (islom/Tasnim).

Reference glosses are used ONLY to measure agreement — never emitted/stored.
"""
import re
import unicodedata

_HARAKAT = re.compile(r"[ً-ٰٟـۖ-ۭ]")


def normalize_ar(s: str) -> str:
    """Strip harakat/tatweel; fold alef/hamza/ya/ta-marbuta variants."""
    s = unicodedata.normalize("NFC", s)
    s = _HARAKAT.sub("", s)
    for a, b in (("أ", "ا"), ("إ", "ا"), ("آ", "ا"), ("ٱ", "ا"),
                 ("ى", "ي"), ("ئ", "ي"), ("ة", "ه"), ("ؤ", "و")):
        s = s.replace(a, b)
    return s.strip()


def build_ref_index(rows):
    """`[(arabic, gloss)]` → `{normalized_ar_token: gloss}` (first write wins).

    A grouped phrase (`يوم الدين`) maps each of its tokens to the phrase gloss.
    """
    idx = {}
    for arabic, gloss in rows:
        for tok in normalize_ar(arabic).split():
            idx.setdefault(tok, gloss)
    return idx


def _norm_lat(s):
    return " ".join(s.lower().split())


def jaccard(a, b):
    ta, tb = set(a.lower().split()), set(b.lower().split())
    if not ta and not tb:
        return 1.0
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def score(aligned, ref_index):
    """Coverage + agreement of aligned rows vs ref_index.

    aligned: list of {"arabic": str, "gloss_lat": str}.
    Match key = normalized single-word Arabic against ref_index tokens.
    """
    glossed = [r for r in aligned if r["gloss_lat"].strip()]
    matches = []
    for r in aligned:
        ref = ref_index.get(normalize_ar(r["arabic"]))
        if ref is not None:
            matches.append((r["gloss_lat"], ref))
    exact = sum(1 for a, b in matches if _norm_lat(a) == _norm_lat(b))
    jac = [jaccard(a, b) for a, b in matches]
    return {
        "coverage": len(glossed) / len(aligned) if aligned else 0.0,
        "matched": len(matches),
        "exact_pct": exact / len(matches) if matches else 0.0,
        "mean_jaccard": sum(jac) / len(jac) if jac else 0.0,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/scraper && uv run pytest tests/test_uz_align_eval.py -q`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/scraper/scraper/uz_align_eval.py packages/scraper/tests/test_uz_align_eval.py
git commit -m "feat(scraper): alignment scoring vs reference WbW index

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Spike glue — load refs + build alignment bundle

**Files:**
- Create: `packages/scraper/tools/uz_align_spike.py`
- Create: `packages/scraper/.gitignore`

**Interfaces:**
- Consumes: `strip_tafsir_parens` (Task 1); `quran.db`, `.refdata/islom_decrypted.db`, `.refdata/TasnimDatabase.db`.
- Produces: `bundle.json` (per-ayah alignment input) + `fewshot.json` (islom surah-2 examples) in gitignored `.refdata/out/`.

- [ ] **Step 1: Write the gitignore**

```
# packages/scraper/.gitignore
.refdata/
```

- [ ] **Step 2: Place reference DBs (manual, one-time)**

```bash
mkdir -p packages/scraper/.refdata/out
# islom: decrypt from your local database.db copy (key in chat), or copy an
# already-decrypted islom_decrypted.db here:
cp /path/to/islom_decrypted.db packages/scraper/.refdata/islom_decrypted.db
cp temp/TasnimDatabase.db       packages/scraper/.refdata/TasnimDatabase.db
```
Expected: both files present under `.refdata/` (gitignored).

- [ ] **Step 3: Write the bundle builder**

```python
# packages/scraper/tools/uz_align_spike.py
"""Spike glue: build alignment-input bundle for surahs 1,112,67 and few-shot
from islom surah 2. Read-only. Outputs to gitignored .refdata/out/.

Usage:
  cd packages/scraper && uv run python tools/uz_align_spike.py build
"""
import json
import sqlite3
import sys
from pathlib import Path

from scraper.uz_text import strip_tafsir_parens

QURAN_DB = "/home/claude/quran-data/quran.db"
REF = Path(__file__).resolve().parents[1] / ".refdata"
OUT = REF / "out"
SPIKE_SURAHS = (1, 112, 67)


def _ro(path):
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True)


def build():
    q = _ro(QURAN_DB)
    bundle = []
    for surah in SPIKE_SURAHS:
        ayat = q.execute(
            "select id, ayah_number from ayahs where surah_id=? order by ayah_number",
            (surah,),
        ).fetchall()
        for ayah_id, ayah_no in ayat:
            words = q.execute(
                "select id, position, text_arabic from words where ayah_id=? "
                "order by position",
                (ayah_id,),
            ).fetchall()
            verse = q.execute(
                "select text from translations where ayah_id=? and language_code='uz' "
                "and translator='Muhammad Sodik Muhammad Yusuf'",
                (ayah_id,),
            ).fetchone()
            bundle.append({
                "surah": surah,
                "ayah": ayah_no,
                "verse_uz_clean": strip_tafsir_parens(verse[0]) if verse else "",
                "words": [{"word_id": wid, "position": pos, "arabic": ar}
                          for wid, pos, ar in words],
            })

    # few-shot from islom surah 2 (outside scored set)
    islom = _ro(REF / "islom_decrypted.db")
    fs_rows = islom.execute(
        "select ayah_id, arabic, trans_uzb from WORDS where surah_id=2 "
        "and ayah_id in (1,2) order by ayah_id, word_id"
    ).fetchall()
    fewshot = {}
    for ayah_id, arabic, gloss in fs_rows:
        fewshot.setdefault(str(ayah_id), []).append({"arabic": arabic, "gloss": gloss})

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "bundle.json").write_text(json.dumps(bundle, ensure_ascii=False, indent=2))
    (OUT / "fewshot.json").write_text(json.dumps(fewshot, ensure_ascii=False, indent=2))
    n_words = sum(len(b["words"]) for b in bundle)
    print(f"bundle: {len(bundle)} ayat, {n_words} words -> {OUT/'bundle.json'}")
    assert n_words == 377, f"expected 377 spike words, got {n_words}"


if __name__ == "__main__":
    {"build": build}[sys.argv[1] if len(sys.argv) > 1 else "build"]()
```

- [ ] **Step 4: Run the builder**

Run: `cd packages/scraper && uv run python tools/uz_align_spike.py build`
Expected: prints `bundle: 41 ayat, 377 words ...`; no assertion error; `bundle.json` + `fewshot.json` in `.refdata/out/`.

- [ ] **Step 5: Commit (tooling only — NOT .refdata)**

```bash
git add packages/scraper/tools/uz_align_spike.py packages/scraper/.gitignore
git commit -m "chore(scraper): spike bundle builder for uz alignment

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Produce alignment (agent) + validate

**Files:**
- Produces: `.refdata/out/alignment.json` (gitignored) — `{"<word_id>": "<gloss_cyr>"}`.

**Interfaces:**
- Consumes: `bundle.json`, `fewshot.json` (Task 4).

- [ ] **Step 1: Alignment prompt template (documented, applied per ayah)**

For each ayah in `bundle.json`, the executing agent produces a mapping using this template. Align in **Cyrillic** (source script). Few-shot exemplars from `fewshot.json`.

```
You align a human Uzbek verse translation to individual Arabic words.
Given the ordered Arabic words of one Quran verse and the (tafsir-stripped)
Uzbek translation of that verse, assign each word its Uzbek gloss — the span
of the translation that renders that word. Keep glosses short (1–4 words),
Cyrillic, drawn from the given translation's wording where possible. Every
word_id must appear exactly once. Output strict JSON: {"<word_id>": "<gloss>"}.

Examples (Arabic word → Uzbek gloss):
<2–3 lines from fewshot.json>

Verse (surah:ayah): <s>:<a>
Uzbek translation: <verse_uz_clean>
Words:
  <word_id> <position> <arabic>
  ...
Return only the JSON object.
```

- [ ] **Step 2: Produce alignment for all 41 ayat**

The agent applies the template to every ayah and writes the merged result:

```bash
# agent writes .refdata/out/alignment.json — one flat object keyed by word_id
```

- [ ] **Step 3: Validate alignment shape**

Run:
```bash
cd packages/scraper && uv run python - <<'PY'
import json, sqlite3
from pathlib import Path
OUT = Path(".refdata/out")
bundle = json.loads((OUT / "bundle.json").read_text())
align = json.loads((OUT / "alignment.json").read_text())
ids = {str(w["word_id"]) for b in bundle for w in b["words"]}
miss = ids - set(align)
extra = set(align) - ids
empty = [k for k in ids if not str(align.get(k, "")).strip()]
print("words:", len(ids), "aligned:", len(align), "missing:", len(miss),
      "extra:", len(extra), "empty:", len(empty))
assert not miss and not extra, (list(miss)[:5], list(extra)[:5])
PY
```
Expected: `missing: 0 extra: 0`; empty count reported (should be 0 or near-0).

- [ ] **Step 4: No commit** (alignment output is gitignored reference-derived data).

---

### Task 6: Run eval + write go/no-go report

**Files:**
- Modify: `packages/scraper/tools/uz_align_spike.py` (add `eval` command)
- Create: `docs/superpowers/spikes/2026-07-09-uz-align-spike-report.md`

**Interfaces:**
- Consumes: `score`, `build_ref_index`, `normalize_ar` (Task 3); `cyr_to_lat` (Task 2); `alignment.json` (Task 5).

- [ ] **Step 1: Add the eval command**

```python
# append to packages/scraper/tools/uz_align_spike.py
from scraper.uz_text import cyr_to_lat  # noqa: E402
from scraper.uz_align_eval import build_ref_index, normalize_ar, score  # noqa: E402


def _islom_index():
    islom = _ro(REF / "islom_decrypted.db")
    rows = islom.execute(
        "select arabic, trans_uzb from WORDS where surah_id in (1,112,67)"
    ).fetchall()
    # transliterate islom Cyrillic glosses to Latin for like-for-like compare
    return build_ref_index([(ar, cyr_to_lat(g or "")) for ar, g in rows])


def _tasnim_index():
    t = _ro(REF / "TasnimDatabase.db")
    rows = t.execute(
        "select wordsAr, translateUzlat from bywords where surahId in (1,112,67)"
    ).fetchall()
    return build_ref_index([(ar, g or "") for ar, g in rows])


def evaluate():
    bundle = json.loads((OUT / "bundle.json").read_text())
    align = json.loads((OUT / "alignment.json").read_text())
    aligned = []
    for b in bundle:
        for w in b["words"]:
            gloss_cyr = align.get(str(w["word_id"]), "")
            aligned.append({"arabic": w["arabic"],
                            "gloss_lat": cyr_to_lat(gloss_cyr)})
    islom = score(aligned, _islom_index())
    tasnim = score(aligned, _tasnim_index())
    print("vs islom (gold, same translator):", islom)
    print("vs tasnim (secondary, other):   ", tasnim)
    # dump 20 sample rows for manual read
    isx, tsx = _islom_index(), _tasnim_index()
    print("\nsample (arabic | ours | islom | tasnim):")
    for r in aligned[:20]:
        tok = normalize_ar(r["arabic"])
        print(f"  {r['arabic']}\t{r['gloss_lat']}\t{isx.get(tok,'-')}\t{tsx.get(tok,'-')}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    {"build": build, "eval": evaluate}[cmd]()
```

- [ ] **Step 2: Run eval**

Run: `cd packages/scraper && uv run python tools/uz_align_spike.py eval`
Expected: prints islom + tasnim metric dicts + 20 sample rows. Record numbers.

- [ ] **Step 3: Write the go/no-go report**

Create `docs/superpowers/spikes/2026-07-09-uz-align-spike-report.md` with:
- Metrics table: coverage, matched, exact_pct, mean_jaccard — vs islom + vs tasnim.
- 20 hand-eyeballed sample rows (paste from Step 2) + a 1-line quality read per obviously-good / obviously-bad.
- **Verdict:** GO / NO-GO / TUNE, against spike exit criteria (coverage ≥95%; islom agreement high enough that manual read = "clearly better than mt, publishable").
- If GO: proposed Phase 1 acceptance thresholds (concrete numbers from spike) + any prompt tweaks.
- If NO-GO/TUNE: what failed + next option (statistical+LLM refine / pursue islom license / narrow scope).
- Note biases: few-shot from islom (surah 2) may inflate islom agreement; Tasnim is a different translator so low agreement there is expected, not failure.

- [ ] **Step 4: Commit report + eval command**

```bash
git add packages/scraper/tools/uz_align_spike.py docs/superpowers/spikes/2026-07-09-uz-align-spike-report.md
git commit -m "docs(scraper): uz alignment spike report + go/no-go

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: GATE — stop for user review**

Present metrics + verdict. **Do not author or start Phase 1** until the user approves the spike result.

---

## Self-Review

**Spec coverage:** LLM alignment → Tasks 4–5. Parenthetical strip → Task 1. Cyr→Lat → Task 2. QA vs islom(gold)+Tasnim → Tasks 3,6. Legal boundary (score-only, gitignored, never stored) → Global Constraints + `.gitignore` (Task 4) + report note. Spike gate → Task 6 Step 5. Full pipeline / DB write / about-credit → deferred to Phase 1 plan (out of spike scope, by design).

**Placeholder scan:** none — all code concrete; thresholds deliberately set FROM spike data in the report (that IS the spike's output, not a placeholder).

**Type consistency:** `strip_tafsir_parens`, `cyr_to_lat`, `normalize_ar`, `build_ref_index`, `jaccard`, `score` names + signatures consistent across Tasks 1–6. `aligned` rows shape `{arabic, gloss_lat}` consistent between Task 3 test and Task 6 producer. `bundle.json`/`alignment.json`/`fewshot.json` keys consistent Tasks 4–6.
