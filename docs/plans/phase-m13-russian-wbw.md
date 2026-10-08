# Phase M13 — Russian word-by-word (Quran Academy) + word-gloss search

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans`. Steps use `- [ ]` checkboxes.

**Goal:** Every corpus word carries a Russian gloss from Quran Academy (QUL resource 97);
bracketed asides read dimmed in every language; the dictionary lists stay clean; then
search finds words by their gloss in any language.

**Architecture:** PR A turns the 2026-10-06 spike into a production importer in
`packages/scraper`. It reads the raw snapshot already on disk (no re-scrape), aligns cards
to our word ids by bare-letter skeleton, and writes `word_glosses` rows in one
transaction, or writes nothing at all. Words that QUL folds into the previous card become
a `gloss_group` span, the same mechanism Uzbek uses, so web and mobile need no new
rendering path for Russian. A pure bracket splitter in `packages/data/client` drives the
dimming in both apps. PR B adds an fts5 table over `word_glosses` (kept in sync by
triggers) and a "Words" section in search.

**Tech Stack:** Python 3 + click + sqlite3 (`packages/scraper`); TypeScript
(`packages/data`, libsql / expo-sqlite); Next.js (`apps/web`); Expo RN (`apps/mobile`).

**Spec:** none. The owner rulings below (grill of 2026-10-07, memory
`phase-m13-russian-wbw-rulings`) are the binding authority. The spike report is
https://claude.ai/artifact/1XVstTdauPzdXo3gyCpV3R (private).

---

## Global Constraints

- **Licence: owner override of #116.** Russian ships before a grant. Credit text:
  `© Quran Academy — permission requested`, linked to https://holyquran.academy, with
  "via QUL (resource 97)". Mobile entry `pending: true`. The owner sends #116 draft A
  **after PR A merges**. Every other WBW language stays blocked.
- **No Quran Academy text in git.** No snapshot, no `scrape.py`, no `aligned.json`.
  Test fixtures are hand-built HTML with **invented** Russian strings. This plan quotes
  at most single words from the source.
- **Snapshot is read-only** (`mode=ro`):
  `~/quran-data/refdata/qul-ru-wbw/qul_ru_wbw.sqlite`, table
  `raw(surah, ayah, html_gz, fetched_at)`. Never re-scrape.
- **Live corpus** = `apps/web/quran.db`, a symlink to `/home/claude/quran-data/quran.db`.
  It is in WAL mode, so the `.bak` **must** go through `sqlite3.Connection.backup()`;
  a `copyfile` loses whatever is still in the WAL.
  `packages/scraper/quran.db` is a stale stub — never write it.
- **Tags**: `language_code = 'ru'`, `source = 'quranacademy'`.
- **Schema**: PR A has **no** schema change. PR B adds `word_gloss_fts` and three
  triggers. That change is additive and owner-approved (§12).
- **§5 `/code-review` is user-triggered.** STOP and ask at the marked steps. One pass;
  fix what is real and decline the rest in writing.
- **§4 mutation-check** every new branch: delete or flip the fix and watch a named test
  fail. Python: `find . -name __pycache__ -exec rm -rf {} +` between runs (stale bytecode
  bites on equal-length edits). Restore a mutated file by re-editing or with
  `git show HEAD:path > path` — **never** `git checkout`, `git restore` or `git stash`.
- **No new dependency.**
- **Gates**: `pnpm exec turbo type-check lint test` (workspace) and
  `cd packages/scraper && uv run pytest && uv run ruff check . && uv run ruff format --check .`.
  `apps/mobile` tsconfig excludes tests, so bare `tsc` is blind to them; use the turbo gate.
- **`packages/data` edits**: rebuild its `dist/` before judging web behaviour
  (`pnpm --filter @quran-corpus/data build`). apps/web imports `dist/`, not `src/`.
- **Mobile DB**: generated (`pnpm generate:m1-db`), never committed. Bump
  `corpusDbVersion` (`apps/mobile/src/data/openCorpusDb.ts:47`) whenever its content
  changes, or the phone keeps the old extract.
- **Device**: the phone on adb is this terminal's display. **Every device run is
  coordinated with the owner**, never unattended. Before any screencap, check that
  `mCurrentFocus` contains `qurancorpus`. Install with `adb install -r --user 0`. Never
  blind-press BACK. Never bypass the lockscreen.
- **Build**: Gradle runs under `taskset -c 7,8 --no-daemon`, arm64 only, never while
  Metro runs. Metro starts with `expo start --clear`. Serve the APK as a copy named after
  its versionCode, verified with `aapt2 dump badging`. `versionCode` lives in
  `apps/mobile/app.json` (94 today).
- **Web**: never `pnpm build` while `next dev` runs. Verify `next build` + `next start`
  locally against the migrated DB, then hand off; the owner deploys to the homelab. No
  deploy config lives in this repo.
- **Git**: branch per PR. Commit + push to `origin` only (never `old`). **Never
  `gh pr create` unprompted.** Never use closing keywords in bodies. Write STATUS.md
  ledger prose only at merge.

---

## Owner rulings (2026-10-07)

| # | Ruling |
|---|---|
| R1 | #116 overridden for Russian only. Ship now; email draft A (disclose + offer removal) after PR A merges. |
| R2 | Credit `© Quran Academy — permission requested`, "via QUL (resource 97)", link holyquran.academy. Mobile `pending: true`; new web About entry; row in `docs/data-sources-m1.md`. |
| R3 | Takedown = runbook in this plan, not code. |
| R4 | Importer is productionized in `packages/scraper` under §5. It reads the snapshot; `scrape.py` stays out of git. |
| R5 | A word QUL folds into the previous card becomes a span like Uzbek: same `gloss_text` (the phrase) on every word plus a shared `gloss_group`. A single word keeps `gloss_group` NULL. |
| R6 | Any unaligned ayah, any invalid gloss, or any snapshot/corpus ayah mismatch **aborts and writes nothing**. |
| R7 | Re-run = take a `.bak`, then delete the ru rows and insert, in one transaction. *Implementation reading:* the delete is scoped to `source='quranacademy'`; a ru row from any other source makes the plain INSERT fail on `UNIQUE(word_id, language_code)`, so the whole run rolls back and no foreign row is ever overwritten silently. |
| R8 | Defect fixes: the 9 Latin homoglyphs become Cyrillic, but **only** in a gloss whose Latin letters are all homoglyphs (a test asserts zero Latin remains after import). The 3 edge slashes are stripped. Whitespace collapse beyond HTML text normalization: not chosen (0 cases measured). |
| R9 | WBW text: strip trailing `, . ; :` and trailing `–` / `—` (repeatedly, so `, –` goes too). **Keep** `! ?`, interior dashes, «досл.», brackets, capitals and « ». |
| R10 | Dictionary lists only (lemma "Translated as" chips + `root_glosses`): strip « ». *Reading:* every « and », not just at the edges. 2,963 glosses carry an unbalanced pair, and edge-only stripping leaves half-pairs inside a chip. |
| R11 | Lemma chips: strip a leading `и / а / но / или` with the existing `ownWord` guard. `то`, `так` stay. *Reading:* chips only. `root_glosses` has no conjunction strip for any language today, and R11 adds none. |
| R12 | No lemmatizer; inflected forms stay as written. «досл.» and `[]` stay in the lists. Derive ru `root_glosses`. |
| R13 | Bracket dimming: on every WBW gloss surface (cell, span, reader popover, word sheet, mushaf word sheet, word screen), in both apps and **all** languages. Colour only, AA ≥ 4.5:1 on the real background, no size change. The bracket glyphs dim with their content. Nesting dims as one outer span; a gloss wholly in brackets dims entirely. One splitter in `packages/data/client`. |
| R14 | PR B search: new `word_gloss_fts` with ai/ad/au triggers on `word_glosses` + backfill self-heal. Indexes every language (+~17 MB accepted). *Implementation:* an external-content fts5 over `word_glosses` (rowid = id), which comes in at ~5.5 MB, inside the accepted budget (review finding, 2026-10-07). |
| R15 | A "Words" section after verses, before roots. Verse hits unchanged. |
| R16 | One row per lemma; a word with no lemma groups by its folded Arabic surface. A lemma row opens the lemma page. The plan opens a lemma-less row on the existing word screen `/word/s/a/p` (see D1). |
| R17 | Top 50 by matched-word count (each word in a span counts), ties by key ascending. Non-Arabic queries of 3+ chars, prefix per token via `buildFtsMatch`. Matches any language. A row shows its best matched gloss, preferring the content language. It is tagged when that gloss's language ≠ the content language, with `uz-Cyrl` counted as `uz`. Matched terms are highlighted. |
| R18 | One plan, two PRs. PR A = Tasks 1-9. PR B = Tasks 10-15, branched from main after PR A merges. |
| R19 | Web: I run a local prod build and hand off; the owner deploys. The phase closes on the owner's confirmation. |
| R20 | (2026-10-07, found by the Task 1 review on the real snapshot) The R9 trailing strip **never empties a gloss**. QUL glosses the particle أَن as a bare `:` on 38 cards (quoted speech follows); those keep `:`. Russian stays at 77,429 rows. |
| R21 | (same) Strip Arabic combining marks (1 card, 44:2, a stray tanween inside a Russian word) and U+00AD soft hyphens (20 cards; invisible, and they break search) from Russian glosses. #116 draft A's list of fixes says so. |

**D1 — needs owner confirmation at plan review.** The grill said a lemma-less row "opens
the reader at the first occurrence with its word sheet". Neither app's reader takes a
param that opens a sheet, and adding one touches the M6l landing loop. Both apps already
have `/word/{s}/{a}/{p}`, a screen with the same gloss and morphology the sheet shows,
and mobile's sheets already link to it. The plan uses that screen. To get reader + sheet
instead, Task 13/14 each gain a route param and a landing hook.

---

## Measured facts (2026-10-06/07 — do not re-derive)

| Fact | Value |
|---|---|
| Snapshot ayahs | 6,236 / 6,236 |
| Corpus words aligned | **77,429 / 77,429** |
| QUL cards | 76,295 |
| Words covered by the previous card | 1,134, in 1,111 groups (1,088 × 1 covered word, 23 × 2) |
| Unmatched words / leftover cards / empty glosses | 0 / 0 / 0 |
| كَأَن written «كَأَنأَن» by QUL | 7 ayahs, handled by `same_word` |
| Trailing `, . ; :` | 15,314 |
| Trailing `! ?` (kept) | 2,483 |
| Trailing dash | 1,711 (` –` 1,305; ` —` 25; rest in combos like `, –` 111, `] –` 166) |
| Latin homoglyph glosses | 9: `C` ×5, `c` ×2, `A` ×2, `K` ×1 (one gloss is a bare `A`) |
| Edge slashes | 3 (one trailing, two leading) |
| Paren / square glosses | 5,235 / 770; unbalanced 0; nested 1 |
| Wholly bracketed | ru 70, en 570 |
| «досл.» | ~250 |
| Unbalanced « » | 2,963 |
| Gloss length p50/p90/p99/max | 9 / 18 / 30 / 84 (cap 120) |
| Leading conjunctions | и 9,091 · а 1,005 · то 654 · но 331 · так 161 · или 69 |
| Existing `word_glosses` | en/corpus 77,429 · uz/tasnim 77,424 · uz-Cyrl 77,424 · ru **0** |
| `root_glosses` | uz 7,220 · uz-Cyrl 7,220 · ru 0 |
| Words with NULL `lemma_buckwalter` | 3,307 (3,277 PRON, 30 INL); distinct lemmas 4,832 |
| `languages` | ar, en, ru, uz, uz-Cyrl (ru already present) |
| Word-gloss FTS size | contentful: all languages +17.1 MB (ru alone +4.45). **External content (chosen): 3 languages +4.08 MB** vs 12.67 contentful, same rows |
| unicode61 `remove_diacritics 2` | folds Latin only: `cafe`→café yes; `елк*`→ёлка **no**; `мои`→мой **no** (1,192 ru glosses contain ё) |
| Abbreviation endings (т.д., т.е., досл., пр., др.) | **0** of 76,295 cards, so the trailing-`.` strip truncates none |
| Word-search grouping query, server, current 3 languages (scratch copy) | `the*` 2,307 groups 39 ms · `and*` 1,414 / 20 ms · `allah*` 156 / 7 ms · `mercy*` 9 / 1 ms; index build 0.6 s |
| Web dim AA (light, `text-paper-600`) | 4.73 on paper-50 · **4.38 on paper-100 (fails)** · 5.02 on white |
| Web dim AA (dark, `dark:text-paper-400`) | 7.62 on night-300 · 6.66 night-100 · 6.16 night-50 |
| Mobile `mutedText` | light 4.50 on background, 4.70 on surface · dark 7.23 / 6.75 |

---

## Review Focus

1. **A gloss that cleans to nothing** (`–`, `,`, `/`): import must abort naming the word, never write `""`. → Task 1 test `test_validate_rejects_a_gloss_cleaned_to_empty`.
2. **Unbalanced brackets in en/uz** (measured 0 only for ru): a stray `)` or an unclosed `(` must not dim the rest of the gloss, and the runs must re-join to the input exactly. → Task 4 tests.
3. **FTS syntax in a query** (`"`, `*`, `NEAR`, `OR`, `-`): Words must not throw, and verses must still return. → Task 12 tests `ignores fts syntax` and `search() still returns verses when word_gloss_fts is missing`.
4. **Mixed or short queries**: `al الله` (contains Arabic) and `ab` (2 chars) → no Words; ` mercy ` with spaces → trimmed. → Task 12 tests.
5. **Lemma-less fold**: two PRON surfaces differing only in harakat merge into one row with a summed count, and the row links to the lowest word id. → Task 12 test.

---

## File structure

**PR A — create**
- `packages/scraper/scraper/qul_ru_import.py` — parse, skeleton, align, clean, validate, write, CLI body.
- `packages/scraper/tests/test_qul_ru_import.py`.
- `packages/data/src/text/glossBrackets.ts` + `packages/data/tests/glossBrackets.test.ts`.
- `apps/web/src/components/shared/GlossRuns.tsx` + `apps/web/src/test/GlossRuns.test.tsx`.
- `apps/mobile/src/components/GlossRuns.tsx` + `GlossRuns.test.tsx`.

**PR A — modify**
- `packages/scraper/scraper/cli.py` — `import-qul-ru`.
- `packages/scraper/scraper/root_glosses.py` + its test — strip « ».
- `packages/data/src/text/gloss.ts` + `tests/gloss.test.ts` — « », Russian conjunctions.
- `packages/data/src/{client,mobile,index}.ts` — export the splitter.
- Web: `components/shared/GlossText.tsx`, `components/morphology/MorphologySummary.tsx`, `app/about/page.tsx`.
- Mobile: `components/WbwCell.tsx`, `WbwSpanGloss.tsx`, `WordSheet.tsx`, `app/word/[surah]/[ayah]/[position].tsx`, `screens/AboutScreen.tsx`, `i18n/uiStrings.ts`, `screens/AboutTab.test.tsx`, `data/openCorpusDb.ts`, `app.json`.
- `packages/mobile-data/scripts/create-m1-reader-db.ts` — ru gloss contract.
- `docs/data-sources-m1.md`.

**PR B — create**
- `packages/data/src/text/glossMatch.ts` + test.
- `packages/data/src/queries/wordSearch.ts` + `tests/wordSearch.test.ts`.

**PR B — modify**
- `packages/data/schema.sql` → regenerate `src/schema.generated.ts`.
- `packages/data/src/{types,constants,queries/search,index,mobile}.ts`.
- `packages/scraper/tests/test_db.py` — the FTS self-heal through `ScraperDatabase`.
- `packages/mobile-data/scripts/{pruneForMobile,create-m1-reader-db}.ts`.
- Web: `app/api/search/route.ts`, `components/search/SearchResults.tsx`, tests.
- Mobile: `data/corpusRepository.ts`, `screens/SearchScreen.tsx`, `i18n/uiStrings.ts`, tests, `openCorpusDb.ts`, `app.json`.

---

# PR A — `feat/m13a-russian-wbw`

- [x] **Setup**: branch `feat/m13a-russian-wbw` exists; this plan is its first commit.

### Task 1: Parse, align, clean, validate (pure)

**§5** (third-party input; trust boundary). Review happens at the Task 4 STOP.

**Files:** Create `packages/scraper/scraper/qul_ru_import.py` and
`packages/scraper/tests/test_qul_ru_import.py`.

**Interfaces — Consumes:** `scraper.tasnim_align.base_form` (the M9 tier-1 normalizer:
marks, tatweel and hamza seats folded, with the letter-spanning-class trap already
guarded). Re-measured 2026-10-07 on the full snapshot with `base_form` in place of the
spike's own folder: **0 unaligned, 1,134 covered, 76,295 cards**, identical. Do **not**
write a second Arabic folder, and do not use `tasnim_align.skeleton`, which is the looser
tier-2 consonant form.

**Interfaces — Produces:**
```python
SOURCE = "quranacademy"
LANGUAGE = "ru"
SNAPSHOT_PATH = Path.home() / "quran-data/refdata/qul-ru-wbw/qul_ru_wbw.sqlite"

class AlignError(ValueError): ...

class Row(NamedTuple):
    word_id: int
    gloss: str      # raw card text, uncleaned
    head: int       # word_id that owns the card; == word_id unless covered

def parse_cards(page: str) -> list[tuple[str, str]]       # (arabic, russian)
def same_word(card: str, ours: str) -> bool               # both already base_form'd
def align_ayah(cards: Sequence[tuple[str, str]],
               words: Sequence[tuple[int, str]]) -> list[Row]   # raises AlignError
def clean_ru_gloss(text: str) -> str
def validate_ru_gloss(text: str) -> str | None             # reason, or None if OK
```

- [ ] **Step 1: failing tests.** Every Russian string here is invented.
```python
from scraper.qul_ru_import import (AlignError, Row, align_ayah, clean_ru_gloss,
    parse_cards, same_word, validate_ru_gloss)
from scraper.tasnim_align import base_form

def _page(*cards: tuple[str, str]) -> str:
    return "".join(
        f'<div class="qpc-hafs text-3xl" dir="rtl">{ar}</div>\n'
        f'  <div class="text-sm text-gray-600 russian">{ru}</div>'
        for ar, ru in cards)

def test_parse_cards_strips_markup_entities_and_html_whitespace():
    page = _page(("<span>بِسْمِ</span>", "<b>во</b>\n  имя &amp; слово"), ("ٱللَّهِ", "тест"))
    assert parse_cards(page) == [("بِسْمِ", "во имя & слово"), ("ٱللَّهِ", "тест")]

def test_same_word_accepts_qul_doubled_kaanna_only():
    assert same_word(base_form("كَأَنأَن"), base_form("كَأَن"))
    assert same_word("كتب", "كتب")
    assert not same_word("كتاب", "كتب")
    assert not same_word("كانا", "كان")   # tail is not ours' suffix

def test_align_one_to_one():
    assert align_ayah([("بِسْمِ", "а"), ("ٱللَّهِ", "б")], [(1, "بِسْمِ"), (2, "ٱللَّهِ")]) == [
        Row(1, "а", 1), Row(2, "б", 2)]

def test_word_without_a_card_joins_the_previous_card():
    assert align_ayah([("مِن", "из того, что до")], [(7, "مِن"), (8, "قَبْلِكَ")]) == [
        Row(7, "из того, что до", 7), Row(8, "из того, что до", 7)]

def test_first_word_without_a_card_aborts():
    with pytest.raises(AlignError, match="word 1"):
        align_ayah([("ٱللَّهِ", "б")], [(1, "بِسْمِ"), (2, "ٱللَّهِ")])

def test_leftover_card_aborts():
    with pytest.raises(AlignError, match="1 cards unused"):
        align_ayah([("بِسْمِ", "а"), ("ٱللَّهِ", "б")], [(1, "بِسْمِ")])

@pytest.mark.parametrize("raw, want", [
    ("слово,", "слово"), ("слово.", "слово"), ("слово:", "слово"), ("слово;", "слово"),
    ("слово –", "слово"), ("слово —", "слово"), ("слово, –", "слово"), ("[слово] –", "[слово]"),
    ("слово!", "слово!"), ("слово?", "слово?"), ("«слово!».", "«слово!»"),
    ("(досл. слово)", "(досл. слово)"), ("Слово – другое", "Слово – другое"),
    ("Cлово", "Слово"), ("c другим", "с другим"), ("A", "А"), ("Kлятва", "Клятва"),
    ("(некое) слово/", "(некое) слово"), ("/Нет", "Нет"),
])
def test_clean_ru_gloss(raw, want):
    assert clean_ru_gloss(raw) == want

def test_homoglyph_fix_skipped_when_a_real_latin_letter_is_present():
    assert clean_ru_gloss("Cлово Q") == "Cлово Q"          # left for validate to refuse
    assert validate_ru_gloss("Cлово Q") == "latin character 'C'"

@pytest.mark.parametrize("text, reason", [
    ("", "empty"), ("я" * 121, "too long (121 > 120)"), ("слово ب", "arabic character 'ب'"),
    ("слово\x07", "control character"),
])
def test_validate_ru_gloss_refuses(text, reason):
    assert validate_ru_gloss(text) == reason

def test_validate_rejects_a_gloss_cleaned_to_empty():
    for raw in ("–", ",", "/", ", –"):
        assert validate_ru_gloss(clean_ru_gloss(raw)) == "empty"

def test_validate_accepts_kept_punctuation():
    assert validate_ru_gloss("«(досл. слово) [другое]!»") is None
```
- [ ] **Step 2: run, watch them fail.** `cd packages/scraper && uv run pytest tests/test_qul_ru_import.py -v`. Expect `ModuleNotFoundError`.
- [ ] **Step 3: implement.**
```python
"""Import Quran Academy's Russian word-by-word (QUL resource 97) from the raw snapshot.

Shipped under the owner's 2026-10-07 override of #116, before a written grant: see
docs/plans/phase-m13-russian-wbw.md for the credit wording and the removal runbook.
The snapshot was scraped once (rate-limited, resumable) and is only ever re-parsed.
"""

from __future__ import annotations

import html
import re
import unicodedata  # validate_ru_gloss: control-character category
from collections.abc import Sequence
from pathlib import Path
from typing import NamedTuple

from .tasnim_align import base_form
from .tasnim_import import validate_gloss

SOURCE = "quranacademy"
LANGUAGE = "ru"
SNAPSHOT_PATH = Path.home() / "quran-data/refdata/qul-ru-wbw/qul_ru_wbw.sqlite"

# Proven over all 6,236 pages. Drift in QUL's markup surfaces as an AlignError,
# never as a silent partial import: a lost card leaves cards unused or a word unmatched.
_CARD = re.compile(
    r'qpc-hafs[^>]*>(.*?)</div>\s*<div class="text-sm text-gray-600 russian">(.*?)</div>',
    re.S,
)
_TAG = re.compile(r"<[^>]+>")


class AlignError(ValueError):
    """An ayah whose cards cannot be mapped onto our words."""


class Row(NamedTuple):
    word_id: int
    gloss: str
    head: int


def _text(fragment: str) -> str:
    # HTML text normalization (tags, entities, source indentation), not gloss cleaning.
    return " ".join(html.unescape(_TAG.sub("", fragment)).split())


def parse_cards(page: str) -> list[tuple[str, str]]:
    return [(_text(ar), _text(ru)) for ar, ru in _CARD.findall(page)]


def same_word(card: str, ours: str) -> bool:
    # QUL writes كَأَن as «كَأَنأَن» in 7 ayahs: the word plus a repeat of its own tail.
    tail = card[len(ours):]
    return card == ours or (card.startswith(ours) and tail != "" and ours.endswith(tail))


def align_ayah(cards: Sequence[tuple[str, str]], words: Sequence[tuple[int, str]]) -> list[Row]:
    """Walk both lists by skeleton. A word with no card of its own is covered by the
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


# The 9 measured Latin look-alikes, each typed inside a Russian word.
_HOMOGLYPHS = "AaBCcEeHKMOoPpTXxy"
_TO_CYRILLIC = str.maketrans(_HOMOGLYPHS, "АаВСсЕеНКМОоРрТХху")
_LATIN = re.compile(r"[A-Za-z]")
_EDGE_SLASH = re.compile(r"^/+|/+$")
# Sentence punctuation the verse needed, not the word. Repeated, so ", –" goes too.
# ! and ? stay (owner R9): they carry tone.
_TRAILING = re.compile(r"(?:\s*[,.;:–—])+$")


def clean_ru_gloss(text: str) -> str:
    latin = set(_LATIN.findall(text))
    # Only when every Latin letter is a look-alike: a real Latin word is not ours to
    # rewrite, and validate_ru_gloss refuses it instead.
    if latin and latin <= set(_HOMOGLYPHS):
        text = text.translate(_TO_CYRILLIC)
    text = _EDGE_SLASH.sub("", text).strip()
    return _TRAILING.sub("", text)


def validate_ru_gloss(text: str) -> str | None:
    """Why this gloss may not be written, or None. §3: third-party data."""
    reason = validate_gloss(text)
    if reason is not None:
        return reason
    if (m := _LATIN.search(text)) is not None:
        return f"latin character {m.group()!r}"
    if any(unicodedata.category(c) == "Cc" for c in text):
        return "control character"
    return None
```
- [ ] **Step 4: green.** Same command.
- [ ] **Step 5: mutation-checks.** Clear `__pycache__` before each run.
  - Drop the `if j != len(cards)` raise: `test_leftover_card_aborts` fails.
  - Replace `elif head is None` with `else`: `test_word_without_a_card_joins_the_previous_card` fails.
  - Make `_TRAILING` non-repeating (`(?:\s*[,.;:–—])$`): the `слово, –` case fails.
  - Remove the homoglyph `translate`: the `Cлово` case fails.
  - Drop `latin <= set(_HOMOGLYPHS)`: `test_homoglyph_fix_skipped…` fails.
  - Remove the Cc check: the `\x07` case fails.
- [ ] **Step 6: commit.** `feat(scraper): parse and align Quran Academy Russian word glosses`

### Task 2: Write + CLI `import-qul-ru`

**§5** (DB writer over third-party data). Review happens at the Task 4 STOP.

**Files:** Modify `qul_ru_import.py`, `cli.py` and `tests/test_qul_ru_import.py`.

**Interfaces — Consumes** Task 1. **Produces:**
```python
class ImportSummary(NamedTuple):
    rows: int       # word_glosses rows written (== corpus words)
    cards: int      # distinct glosses (== heads)
    groups: int     # multi-word spans
    backup: Path

def import_qul_ru(corpus_db: Path, snapshot: Path = SNAPSHOT_PATH) -> ImportSummary
```

- [ ] **Step 0: extract, don't copy (§3).**
  - Move `_corpus` from `tests/test_tasnim_import.py:22` into `tests/conftest.py` as a plain function `make_corpus(path, words)`. Its existing callers import it. Add **no** `languages` rows to it, so tests prove the importer writes its own FK target.
  - Rename `tasnim_align._corpus_ayahs` → `corpus_ayahs` (public; one caller, `align_all`).
  - Run `uv run pytest tests/test_tasnim_import.py tests/test_tasnim_align.py`: green, unchanged.
  - Commit: `refactor(scraper): share the corpus fixture and corpus_ayahs`.
- [ ] **Step 0b: R20 + R21 in `clean_ru_gloss` (Task 1's function).**
  - Extract the Arabic-combining-mark filter inside `tasnim_import.clean_gloss` (:104-111) into a public `strip_arabic_marks(text: str) -> str` in `tasnim_import.py`. Make `clean_gloss` call it, with its behaviour unchanged (its tests stay green).
  - `clean_ru_gloss` then starts with `text = strip_arabic_marks(text).replace("\u00ad", "")` and ends with `return _TRAILING.sub("", text) or text`. Comment the `or text`: R20, 38 أَن cards glossed `:`.
  - Tests in `tests/test_qul_ru_import.py`:
    - `clean_ru_gloss(":") == ":"`
    - `clean_ru_gloss("Клянусь \u064cКнигой") == "Клянусь Книгой"`
    - `clean_ru_gloss("сло\u00adво,") == "слово"`
  - Replace `test_validate_rejects_a_gloss_cleaned_to_empty` with two cases: `"/"` still cleans to empty and is refused, and `":"`, `"–"`, `", –"` survive as themselves.
  - Mutation-check:
    - drop `or text` → the `:` case fails;
    - drop the U+00AD replace → the soft-hyphen case fails;
    - drop `strip_arabic_marks` → the tanween case fails.
  - Commit: `fix(scraper): keep colon-only glosses, strip stray marks and soft hyphens`.
- [ ] **Step 1: failing tests.** Use `make_corpus` (a real DB via `ScraperDatabase`, no `languages` rows).
```python
def _snapshot(path: Path, pages: dict[tuple[int, int], str]) -> None:
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE raw (surah int, ayah int, html_gz blob, fetched_at text)")
    con.executemany("INSERT INTO raw VALUES (?,?,?,'x')",
                    [(s, a, gzip.compress(p.encode())) for (s, a), p in pages.items()])
    con.commit(); con.close()

WORDS = {(1, 1): ["بِسْمِ", "ٱللَّهِ"], (1, 2): ["مِن", "قَبْلِكَ", "رَبِّ"]}
PAGES = {(1, 1): _page(("بِسْمِ", "во имя,"), ("ٱللَّهِ", "Бога –")),
         (1, 2): _page(("مِن", "из прежнего"), ("رَبِّ", "Господа!"))}

def _ru(db: Path) -> list[tuple]:
    con = sqlite3.connect(db)
    return con.execute("SELECT w.position, g.gloss_text, g.source, g.gloss_group FROM word_glosses g"
                       " JOIN words w ON w.id=g.word_id WHERE g.language_code='ru' ORDER BY g.word_id").fetchall()

def test_import_writes_cleaned_rows_and_one_span(tmp_path):
    db, snap = tmp_path / "c.db", tmp_path / "s.sqlite"
    make_corpus(db, WORDS); _snapshot(snap, PAGES)
    s = import_qul_ru(db, snap)
    assert (s.rows, s.cards, s.groups) == (5, 4, 1)
    rows = _ru(db)
    assert rows[:2] == [(1, "во имя", "quranacademy", None), (2, "Бога", "quranacademy", None)]
    assert rows[2][1] == rows[3][1] == "из прежнего" and rows[2][3] == rows[3][3] is not None
    assert rows[4] == (3, "Господа!", "quranacademy", None)

def test_no_latin_letter_survives(tmp_path):
    ...  # PAGES with ("بِسْمِ", "Cлово"); assert not any(re.search("[A-Za-z]", r[1]) for r in _ru(db))

def test_unaligned_ayah_writes_nothing(tmp_path):
    # (1,2) loses its first card -> AlignError; a pre-existing ru row must survive.
    ...; with pytest.raises(ImportAborted, match="1:2"): import_qul_ru(db, snap)
    assert _ru(db) == before and not list(tmp_path.glob("*.bak-m13-*"))

def test_invalid_gloss_writes_nothing(tmp_path):      # a card "–" -> cleaned empty
def test_snapshot_missing_an_ayah_writes_nothing(tmp_path):
def test_rerun_is_idempotent(tmp_path):              # run twice -> identical _ru(db)
def test_writes_its_own_languages_row(tmp_path):     # fresh make_corpus DB, no 'ru' -> import succeeds
def test_keeps_an_existing_ru_languages_row(tmp_path):  # seeded ('ru','X','Y','ltr') survives unchanged
def test_foreign_ru_row_aborts_before_backup(tmp_path):
    # seed one ru row source='other' on word 1 plus an older quranacademy row on word 2;
    # ImportAborted naming "1 ru rows from other sources"; both seeded rows still there,
    # and no *.bak-m13-* file.
def test_backup_holds_the_pre_import_state(tmp_path):
    # s.backup opens as sqlite and has 0 ru rows; it sits beside the RESOLVED db path.
def test_a_rerun_never_overwrites_an_earlier_backup(tmp_path):
    # two runs -> two distinct *.bak-m13-* files; the first still has 0 ru rows.
```
  Write each `...` body in full while implementing. Each one names its assert as above.
- [ ] **Step 2: run, watch them fail.**
- [ ] **Step 3: implement.** New imports: `gzip`, `sqlite3`, `from datetime import UTC, datetime`, `from .db import ScraperDatabase`, and `corpus_ayahs` added to the `.tasnim_align` import.
```python
class ImportAborted(RuntimeError):
    """Validation failed; nothing was written."""

class ImportSummary(NamedTuple):
    rows: int
    cards: int
    groups: int
    backup: Path

_MAX_REPORTED = 20


def _plan(
    words: dict[tuple[int, int], list[tuple[int, str]]],
    con: sqlite3.Connection,
    snapshot: sqlite3.Connection,
) -> list[tuple[int, str, int | None]]:
    """Every (word_id, gloss, group) to write, or ImportAborted listing what failed."""
    pages = {(s, a): gz for s, a, gz in snapshot.execute("SELECT surah, ayah, html_gz FROM raw")}
    # R7, checked here rather than left to the INSERT's UNIQUE failure: refused with a
    # reason, and before the backup, so a refused run leaves no .bak behind.
    foreign = con.execute(
        "SELECT COUNT(*) FROM word_glosses WHERE language_code = ? AND source IS NOT ?",
        (LANGUAGE, SOURCE),
    ).fetchone()[0]
    errors = [f"{foreign} ru rows from other sources; refusing to share 'ru' with them"] if foreign else []
    errors += [f"{s}:{a} missing from snapshot" for s, a in sorted(words.keys() - pages.keys())]
    errors += [f"{s}:{a} not in corpus" for s, a in sorted(pages.keys() - words.keys())]
    out: list[tuple[int, str, int | None]] = []
    group = 0
    for key in sorted(words.keys() & pages.keys()):
        try:
            rows = align_ayah(parse_cards(gzip.decompress(pages[key]).decode()), words[key])
        except AlignError as err:
            errors.append(f"{key[0]}:{key[1]} {err}")
            continue
        by_head: dict[int, list[Row]] = {}
        for row in rows:
            by_head.setdefault(row.head, []).append(row)
        for head, members in by_head.items():
            gloss = clean_ru_gloss(members[0].gloss)
            if (reason := validate_ru_gloss(gloss)) is not None:
                errors.append(f"{key[0]}:{key[1]} word {head}: {reason}: {members[0].gloss!r}")
                continue
            marker = None
            if len(members) > 1:
                group += 1
                marker = group
            out += [(m.word_id, gloss, marker) for m in members]
    if errors:
        raise ImportAborted(f"{len(errors)} problems, nothing written:\n" + "\n".join(errors[:_MAX_REPORTED]))
    return out


def import_qul_ru(corpus_db: Path, snapshot: Path = SNAPSHOT_PATH) -> ImportSummary:
    target = corpus_db.resolve()          # apps/web/quran.db is a symlink
    words = corpus_ayahs(target)          # tasnim_align's reader, read-only
    database = ScraperDatabase(str(target))
    con = database.connection
    con.execute("PRAGMA foreign_keys = ON")
    snap = sqlite3.connect(f"file:{snapshot}?mode=ro", uri=True)
    try:
        planned = _plan(words, con, snap)  # aborts before any write, before any backup
        # Timestamped, never overwritten: a re-run (R7) must not replace the pre-M13
        # copy with the state of the first import.
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S")
        backup = target.with_name(f"{target.name}.bak-m13-{stamp}")
        if backup.exists():
            raise ImportAborted(f"{backup} already exists")
        # backup(), not copyfile: the live DB is WAL-mode, and a byte copy drops the WAL.
        dst = sqlite3.connect(backup)
        try:
            con.backup(dst)
        finally:
            dst.close()
        with con:
            # The FK target. Present on the live DB; INSERT OR IGNORE so a fresh DB
            # imports and an existing row's names are never rewritten.
            con.execute(
                "INSERT OR IGNORE INTO languages (code, name_native, name_english, direction)"
                " VALUES ('ru', 'Русский', 'Russian', 'ltr')"
            )
            con.execute("DELETE FROM word_glosses WHERE language_code = ? AND source = ?",
                        (LANGUAGE, SOURCE))
            # Plain INSERT stays as a second line behind _plan's check: anything that
            # still collides on UNIQUE(word_id, language_code) rolls the run back.
            con.executemany(
                "INSERT INTO word_glosses (word_id, language_code, gloss_text, source, gloss_group)"
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
```
  Then add to `cli.py`, after `derive-root-glosses`:
```python
@main.command("import-qul-ru")
@click.option("--db", default="quran.db", show_default=True, help="Corpus DB to write")
@click.option("--snapshot", default=None, help="Raw QUL resource-97 snapshot (read-only)")
def import_qul_ru_cmd(db: str, snapshot: str | None) -> None:
    """Import Quran Academy's Russian word-by-word glosses (QUL resource 97)."""
    from .qul_ru_import import SNAPSHOT_PATH, ImportAborted, import_qul_ru

    try:
        s = import_qul_ru(Path(db), Path(snapshot) if snapshot else SNAPSHOT_PATH)
    except ImportAborted as err:
        raise click.ClickException(str(err)) from err
    click.echo(f"ru glosses {s.rows} rows over {s.cards} cards; {s.groups} spans; backup {s.backup}")
```
- [ ] **Step 4: green**, plus `uv run ruff check . && uv run ruff format --check .`.
- [ ] **Step 5: mutation-checks.**
  - Move the backup above `_plan`: `test_unaligned_ayah_writes_nothing` fails on the `.bak` glob.
  - Delete `if errors: raise`: the unaligned and invalid tests fail.
  - Delete the `foreign` check: `test_foreign_ru_row_aborts_before_backup` fails, with an IntegrityError instead of ImportAborted.
  - Delete the `languages` INSERT: `test_writes_its_own_languages_row` fails on the FK.
  - Make it `INSERT OR REPLACE INTO languages`: `test_keeps_an_existing_ru_languages_row` fails.
  - Drop the timestamp from the name: `test_a_rerun_never_overwrites…` fails.
- [ ] **Step 6: commit.** `feat(scraper): import-qul-ru, all-or-nothing Russian word glosses`

### Task 3: Dictionary cleaning — « » and Russian conjunctions

**§5** (`packages/data`, feeds the lemma query). Review happens at the Task 4 STOP.

**Files:** Modify `packages/data/src/text/gloss.ts`, `packages/data/tests/gloss.test.ts`,
`packages/scraper/scraper/root_glosses.py` and `packages/scraper/tests/test_root_glosses.py`.

- [ ] **Step 1: failing tests.** In `gloss.test.ts`:
```ts
it('drops every guillemet, edge or not', () => {
  expect(cleanGloss('«Слово')).toBe('Слово');
  expect(cleanGloss('сказали «мир»')).toBe('сказали мир');
});
it('strips a leading Russian conjunction', () => {
  expect(cleanGloss('и Слово')).toBe('Слово');
  expect(cleanGloss('А что')).toBe('что');
  expect(cleanGloss('но не')).toBe('не');
  expect(cleanGloss('или же')).toBe('же');
});
it('keeps то and так', () => {
  expect(cleanGloss('то, что')).toBe('то, что');
  expect(cleanGloss('так как')).toBe('так как');
});
it('guards a Russian conjunction lemma', () => {
  expect(cleanGlossList(['или', 'или же'], 5)).toEqual(['или', 'или же']);
});
it('keeps brackets and the literal note', () => {
  expect(cleanGloss('(досл. слово) [другое]')).toBe('(досл. слово) [другое]');
});
```
  In `test_root_glosses.py`:
```python
def test_guillemets_do_not_split_a_gloss():
    assert rank_glosses(["«слово", "слово»", "слово"]) == [("слово", 3)]
```
- [ ] **Step 2: run, watch them fail.** `pnpm --filter @quran-corpus/data test -- gloss` and `uv run pytest tests/test_root_glosses.py -v`.
- [ ] **Step 3: implement.**
  - `gloss.ts`: `const GUILLEMETS = /[«»]/g;`, and make `tidy` start `gloss.replace(GUILLEMETS, '')` before `EDGE_NOISE`. Comment it: R10, 2,963 unbalanced pairs, an edge-only strip leaves half-pairs. Change `CONJUNCTIONS` to `['and','but','so','or','then','nor','yet','и','а','но','или'] as const`. The comment notes the scripts cannot collide (Latin `a` ≠ Cyrillic `а`). The `'i'` flag folds Cyrillic case in non-unicode mode; the `А что` test proves it.
  - `root_glosses.py`: in `rank_glosses`, `text = " ".join(raw.replace("«", "").replace("»", "").split())`.
- [ ] **Step 4: green**, then `pnpm --filter @quran-corpus/data build`.
- [ ] **Step 5: mutation-checks.** Remove the `GUILLEMETS` replace and the first test fails. Drop `'а'` from `CONJUNCTIONS` and the `А что` assertion fails. Remove the Python replace and `test_guillemets…` fails.
- [ ] **Step 6: commit.** `feat(data): clean guillemets and Russian conjunctions from gloss lists`

### Task 4: Bracket splitter (pure, shared)

**Files:** Create `packages/data/src/text/glossBrackets.ts` and
`packages/data/tests/glossBrackets.test.ts`. Modify `src/client.ts`, `src/mobile.ts` and
`src/index.ts`, each gaining one export line next to `groupByGlossSpan`.

**Interfaces — Produces:**
```ts
export interface GlossRun { text: string; dim: boolean }
export function splitGlossBrackets(gloss: string): GlossRun[]
```

- [ ] **Step 1: failing tests** (invented strings):
```ts
const join = (runs: GlossRun[]) => runs.map((r) => r.text).join('');
it.each([
  ['слово', [{ text: 'слово', dim: false }]],
  ['(Только) Тебе', [{ text: '(Только)', dim: true }, { text: ' Тебе', dim: false }]],
  ['они [знайте]!', [{ text: 'они ', dim: false }, { text: '[знайте]', dim: true }, { text: '!', dim: false }]],
  ['(всё в скобках)', [{ text: '(всё в скобках)', dim: true }]],
  ['«имя [досл. – много (благ)]»', [
    { text: '«имя ', dim: false }, { text: '[досл. – много (благ)]', dim: true }, { text: '»', dim: false }]],
  ['the (one) who (is)', [
    { text: 'the ', dim: false }, { text: '(one)', dim: true }, { text: ' who ', dim: false }, { text: '(is)', dim: true }]],
])('%s', (gloss, runs) => expect(splitGlossBrackets(gloss)).toEqual(runs));
it('leaves an unclosed opener plain, never dims the rest', () => {
  expect(splitGlossBrackets('a (b c')).toEqual([{ text: 'a (b c', dim: false }]);
});
it('leaves a stray closer plain', () => {
  expect(splitGlossBrackets('a) b')).toEqual([{ text: 'a) b', dim: false }]);
});
it('returns nothing for an empty gloss', () => expect(splitGlossBrackets('')).toEqual([]));
it('always re-joins to its input', () => {
  for (const g of ['a (b) c', '((x))', 'a (b', ')(', '[a(b]c)', 'x [y] (z)']) {
    expect(join(splitGlossBrackets(g))).toBe(g);
  }
});
```
- [ ] **Step 2: run, watch them fail.**
- [ ] **Step 3: implement.**
```ts
/** Split a gloss into plain and bracketed runs, so a renderer can dim the translator's
 *  asides -- "(the) Symbols", "[знайте]" -- without touching the words the Arabic says.
 *
 *  Brackets dim WITH their content, and nesting dims as one outer run (owner R13).
 *  Round and square brackets count as one depth, since no measured gloss mixes them
 *  unbalanced. An unclosed opener or a stray closer is left plain, never "dim to the
 *  end": a typo must not grey out half a gloss. The runs always re-join to the input. */
export interface GlossRun {
  text: string;
  dim: boolean;
}

export function splitGlossBrackets(gloss: string): GlossRun[] {
  const runs: GlossRun[] = [];
  const push = (text: string, dim: boolean) => {
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last && last.dim === dim) last.text += text;
    else runs.push({ text, dim });
  };
  let depth = 0;
  let from = 0;
  for (let i = 0; i < gloss.length; i += 1) {
    const ch = gloss[i]!;
    if (ch === '(' || ch === '[') {
      if (depth === 0) {
        push(gloss.slice(from, i), false);
        from = i;
      }
      depth += 1;
    } else if ((ch === ')' || ch === ']') && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        push(gloss.slice(from, i + 1), true);
        from = i + 1;
      }
    }
  }
  push(gloss.slice(from), false);
  return runs;
}
```
  Note: the merge in `push` is what keeps adjacent bracket groups like `((x))` → one run and an unclosed tail joined to its plain prefix.
- [ ] **Step 4: green**, then `pnpm --filter @quran-corpus/data build`, plus the entry guards: `pnpm --filter @quran-corpus/data test -- entry`.
- [ ] **Step 5: mutation-checks.**
  - Change `&& depth > 0` to nothing: the stray-closer test fails.
  - Push the tail as `dim: depth > 0`: the unclosed-opener test fails.
  - Remove the merge in `push`: the unclosed test fails, because it gets 2 runs.
- [ ] **Step 6: commit.** `feat(data): splitGlossBrackets for dimming bracketed asides`
- [ ] **Step 7: STOP — §5.** Ask the owner to run `/code-review` on `main..HEAD` (Tasks 1-4: importer, trust boundary, `packages/data`). Fix what is real, decline the rest in writing, and commit the fixes as `fix(scope): …`.

### Task 5: Web dimming

**Files:** Create `apps/web/src/components/shared/GlossRuns.tsx` and
`apps/web/src/test/GlossRuns.test.tsx`. Modify `GlossText.tsx` and
`morphology/MorphologySummary.tsx:30`.

- [ ] **Step 1: measure the backgrounds.** For each host (`WbwWordCell`, `WbwGlossSpan`,
  `WbwWordRow`, `WordPopover` → `MorphologySummary`, `/word/...` →
  `WordDetailView` → `MorphologySummary`), read the effective background class up the tree
  in both themes. Record each in the verification log. The candidate dim class is
  `text-paper-600 dark:text-paper-400`, measured 4.73 / 7.62 on the page.
  **If any host sits on `paper-100` (4.38, fails) → STOP and ask the owner**; do not pick
  a token that fails.
- [ ] **Step 2: failing test.**
```tsx
it('dims bracketed runs only', () => {
  render(<p><GlossRuns gloss="(the) Symbols" /></p>);
  const dim = screen.getByText('(the)');
  expect(dim.tagName).toBe('SPAN');
  expect(dim.className).toContain('text-paper-600');
  expect(screen.getByText('Symbols', { exact: false }).className ?? '').not.toContain('text-paper-600');
});
it('GlossText renders through GlossRuns', () => {
  render(<GlossText gloss="и [знайте]" glossLang="ru" pageLang="ru" />);
  expect(screen.getByText('[знайте]').className).toContain('text-paper-600');
});
```
- [ ] **Step 3: run, watch it fail** (`pnpm --filter web test -- GlossRuns`).
- [ ] **Step 4: implement.**
```tsx
import { Fragment } from 'react';
import { splitGlossBrackets } from '@quran-corpus/data/client';

/** A gloss with its bracketed asides dimmed. Colour only, no size change (R13). The
 *  class is AA ≥ 4.5:1 on every host's background, measured in the M13 plan. */
const DIM = 'text-paper-600 dark:text-paper-400';

export function GlossRuns({ gloss }: { gloss: string }) {
  return (
    <>
      {splitGlossBrackets(gloss).map((run, i) =>
        run.dim ? <span key={i} className={DIM}>{run.text}</span> : <Fragment key={i}>{run.text}</Fragment>,
      )}
    </>
  );
}
```
  `GlossText`: `{gloss ? <GlossRuns gloss={gloss} /> : '—'}`. `MorphologySummary:30`: `{gloss && <p …><GlossRuns gloss={gloss} /></p>}`. `SegmentedWord`'s `aria-label` keeps the plain string.
- [ ] **Step 5: green**, then `pnpm --filter web lint type-check`.
- [ ] **Step 6: mutation-check.** Swap `run.dim ?` for `false ?`: both tests fail.
- [ ] **Step 7: commit.** `feat(web): dim bracketed asides in word glosses`

### Task 6: Mobile dimming

**Files:** Create `apps/mobile/src/components/GlossRuns.tsx` and `GlossRuns.test.tsx`.
Modify `WbwCell.tsx:125`, `WbwSpanGloss.tsx:30`, `WordSheet.tsx:133` and
`app/word/[surah]/[ayah]/[position].tsx:112`.

- [ ] **Step 1: failing tests.**
```tsx
// DOM shim idiom, as AyahCard.test.tsx:158 -- style.color reads back as rgb().
it('renders bracketed runs in mutedText, the rest inherits', () => {
  render(<Text testID="host"><GlossRuns text="(the) Symbols" /></Text>);
  expect(screen.getByText('(the)').style.color).toBe(rgb(themeColors.light.mutedText));
  expect(screen.getByTestId('host').textContent).toBe('(the) Symbols');
});
it('mutedText is AA on every gloss host', () => {
  for (const mode of ['light', 'dark'] as const) {
    for (const bg of [themeColors[mode].background, themeColors[mode].surface]) {
      expect(contrast(themeColors[mode].mutedText, bg)).toBeGreaterThanOrEqual(4.5);
    }
  }
});
```
  The glass sheet is already covered by `theme/tokens.test.ts:101`. Import `contrast` from `@/testing/contrast`.
- [ ] **Step 2: run, watch it fail.**
- [ ] **Step 3: implement.** These are nested `Text` children, safe because a gloss is never Arabic (memory: RN shaping breaks only across Arabic runs). Nesting keeps `numberOfLines` and the row height (M6l).
```tsx
import { Text } from 'react-native';
import { splitGlossBrackets } from '@quran-corpus/data/mobile';
import { useThemeColors } from '@/theme/themeContext';

/** A gloss's text with bracketed asides in mutedText (R13). Rendered INSIDE the host's
 *  own <Text>, so line clamping and size are the host's -- colour is the only change. */
export function GlossRuns({ text }: { text: string }) {
  const theme = useThemeColors();
  return (
    <>
      {splitGlossBrackets(text).map((run, i) =>
        run.dim ? <Text key={i} style={{ color: theme.mutedText }}>{run.text}</Text> : run.text,
      )}
    </>
  );
}
```
  At each of the four sites, replace `{gloss?.text ?? …}` with `{gloss ? <GlossRuns text={gloss.text} /> : …}`, keeping each site's existing fallback (`''` or `t(uiLocale, 'word.noGloss')`).
- [ ] **Step 4: green.** `pnpm exec turbo type-check lint test --filter mobile`. Existing `getByText` gloss assertions must still pass. If one fails because the text is now split across children, fix the assertion to the full-text matcher; do not change the component.
- [ ] **Step 5: mutation-check.** Render `run.text` for dim runs too: the first test fails.
- [ ] **Step 6: commit.** `feat(mobile): dim bracketed asides in word glosses`

### Task 7: Credits

**Files:** Modify `apps/mobile/src/screens/AboutScreen.tsx` (GROUPS → `about.groupText`,
after `...TRANSLATION_CREDITS`), `apps/mobile/src/i18n/uiStrings.ts` (union + en/uz/ru),
`apps/mobile/src/screens/AboutTab.test.tsx`, `apps/web/src/app/about/page.tsx`
(`sources`, after Tasnim) and `docs/data-sources-m1.md` (one row).

- [ ] **Step 1: failing test** (`AboutTab.test.tsx`, beside the Tasnim case at :116):
```tsx
expect(screen.getByText('Quran Academy')).toBeTruthy();
expect(screen.getByTestId('pending-Quran Academy').textContent).toBe('Source approval incomplete');
expect(screen.getByText(/© Quran Academy — permission requested/)).toBeTruthy();
```
- [ ] **Step 2: run, watch it fail.**
- [ ] **Step 3: implement.**
  - Mobile entry: `{ name: 'Quran Academy', body: 'about.sourceWbwRu', pending: true }`. Its comment: the word-by-word glosses, a different party from the Russian verse translator, shipped under the owner override of #116.
  - Strings (`'about.sourceWbwRu'`):
    - en `'© Quran Academy — permission requested. Russian word-by-word glosses, via QUL (resource 97).'`
    - uz `'© Quran Academy — ruxsat so‘ralgan. Ruscha so‘zma-so‘z tarjima, QUL orqali (97-resurs).'`
    - ru `'© Quran Academy — разрешение запрошено. Пословный перевод на русский, через QUL (ресурс 97).'`
  - Web source:
```ts
{
  name: 'Quran Academy',
  href: 'https://holyquran.academy',
  provides: 'Russian word-by-word glosses, via the Quranic Universal Library (QUL, resource 97).',
  license: '© Quran Academy — permission requested',
  note: 'Published before a written grant, under an owner decision recorded in issue #116; it is removed on the rights holder’s request. Changes are presentation only: sentence punctuation at a gloss’s end, nine Latin look-alike letters typed inside Russian words, and three stray slashes.',
},
```
  - `docs/data-sources-m1.md`, after the Russian translation row:
    `| Russian word-by-word glosses | QUL resource 97 (© Quran Academy), imported by scraper import-qul-ru in M13 | © Quran Academy — permission requested (#116 override) | Quran Academy, via QUL (resource 97) | ru | Owner override 2026-10-07 | Not approved |`
- [ ] **Step 4: green** (mobile + web tests, lint, type-check).
- [ ] **Step 5: mutation-check.** Drop `pending: true` and the pill assertion fails.
- [ ] **Step 6: commit.** `feat(about): credit Quran Academy for Russian word-by-word`

### Task 8: Live import, root lists, mobile DB

**Files:** Modify `packages/mobile-data/scripts/create-m1-reader-db.ts` (contract),
`apps/mobile/src/data/openCorpusDb.ts:47` and `apps/mobile/app.json`. The DB stays out
of git.

- [ ] **Step 1: contract (failing first).** In `validateM1ReaderDbContract`, read
  `SELECT COUNT(*) FROM word_glosses WHERE language_code='ru' AND source='quranacademy'`
  into the summary as `ruGlosses`, and throw
  `Expected ${summary.words} Russian word glosses, found ${n}` unless it equals `summary.words`.
  Run it on the current asset (`pnpm --filter @quran-corpus/mobile-data exec tsx -e "…validateM1ReaderDbContract()…"`, or the existing test entry): **expect a throw (0 ≠ 77,429)**.
- [ ] **Step 2: pre-flight.** No `next dev` or `expo start` writing; `ls -la /home/claude/quran-data/` has room for a ~164 MB `.bak`.
- [ ] **Step 3: import.** `cd packages/scraper && uv run scraper import-qul-ru --db ../../apps/web/quran.db`. **Expected exactly**: `ru glosses 77429 rows over 76295 cards; 1111 spans; backup /home/claude/quran-data/quran.db.bak-m13-<UTC stamp>`. **A different number means the code changed, not the data. Investigate before going on.**
- [ ] **Step 4: verify** (python, `mode=ro`):
  - ru/quranacademy = 77,429 rows.
  - 0 rows match `[A-Za-z]`.
  - 0 rows end in `[,.;:–—]` except the 38 (+ their covered words) that are exactly `:` (R20);
  - 0 rows contain U+00AD or an Arabic combining mark (R21).
  - 2,483 rows (± the covered-word repeats) end in `[!?]`; record the number.
  - `COUNT(DISTINCT gloss_group)` where not null = 1,111.
  - Every group sits in one ayah.
  - Print 20 random rows (`surah:ayah:pos`, Arabic, gloss) to the log for the owner.
- [ ] **Step 5: root lists.** `uv run scraper derive-root-glosses --db ../../apps/web/quran.db --lang ru`. Record `ru: N of M roots covered`. Expect N in the same band as uz; uz-derived rows = 7,220 over its roots. Then confirm 0 rows in `root_glosses` contain « or ».
- [ ] **Step 6: mobile DB.** Bump `corpusDbVersion` `'s2'` → `'m13a'`. Run `pnpm generate:m1-db`, then the contract (now passes). Record the asset size before and after.
- [ ] **Step 7: versionCode** 94 → 95.
- [ ] **Step 8: gates.** The workspace turbo gate, plus the scraper gates.
- [ ] **Step 9: commit.** `chore(mobile): m13a corpus with Russian word glosses, versionCode 95`

### Task 9: Release checks — device + web

- [ ] **Step 1: APK.** Stop Metro. Run `taskset -c 7,8 ./gradlew assembleRelease --no-daemon` (arm64). Copy the APK to `quran-corpus-vc95.apk`. Run `aapt2 dump badging` and confirm `versionCode='95'`.
- [ ] **Step 2: device run — WITH the owner.** Agree the time first. Run `adb install -r --user 0`. Do the foreground guard before every screencap. Fill table **M13-A** below.
- [ ] **Step 3: web.** Stop `next dev`. In `apps/web`, run `pnpm build && pnpm start` against `apps/web/quran.db`. Fill table **M13-W(A)**. Stop `next start`.
- [ ] **Step 4: handoff to the owner** (paste in chat):
  1. Copy the migrated DB to the homelab. No schema change in PR A, so deploy order is free.
  2. Deploy the PR A build.
  3. Check `/surah/1/words` in Russian and `/about`.
  4. Send #116 draft A.
- [ ] **Step 5: push** `git push -u origin feat/m13a-russian-wbw`. Ask the owner about the PR. **Never `gh pr create` unprompted.**

---

# PR B — `feat/m13b-word-search` (from main after PR A merges)

- [ ] **Setup**: `git switch main && git pull && git switch -c feat/m13b-word-search`.

### Task 10: Schema — `word_gloss_fts` + triggers + self-heal

**§5** (`packages/data` schema). Review happens at the Task 12 STOP.

**Files:** Modify `packages/data/schema.sql` (after the `search_fts` block), regenerate
`src/schema.generated.ts`, and modify `packages/data/tests/migrate.test.ts` and
`packages/scraper/tests/test_db.py`.

**Interfaces — Produces:**
```sql
-- Word-gloss search (M13). External content: the index stores no copy of the text,
-- it reads word_glosses by rowid = word_glosses.id. Measured on the 3-language corpus:
-- 4.08 MB against 12.67 MB for a contentful table. The column is NAMED gloss_text
-- because external content maps fts columns to content columns by name.
CREATE VIRTUAL TABLE IF NOT EXISTS word_gloss_fts USING fts5(
  gloss_text,
  content = 'word_glosses',
  content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2'
);

-- External content means the triggers must hand fts5 the OLD text to delete it:
-- the 'delete' command, never a plain DELETE, which would corrupt the index.
CREATE TRIGGER IF NOT EXISTS trg_word_glosses_ai AFTER INSERT ON word_glosses BEGIN
  INSERT INTO word_gloss_fts (rowid, gloss_text) VALUES (NEW.id, NEW.gloss_text);
END;

CREATE TRIGGER IF NOT EXISTS trg_word_glosses_ad AFTER DELETE ON word_glosses BEGIN
  INSERT INTO word_gloss_fts (word_gloss_fts, rowid, gloss_text)
  VALUES ('delete', OLD.id, OLD.gloss_text);
END;

CREATE TRIGGER IF NOT EXISTS trg_word_glosses_au AFTER UPDATE ON word_glosses BEGIN
  INSERT INTO word_gloss_fts (word_gloss_fts, rowid, gloss_text)
  VALUES ('delete', OLD.id, OLD.gloss_text);
  INSERT INTO word_gloss_fts (rowid, gloss_text) VALUES (NEW.id, NEW.gloss_text);
END;

-- Self-heal: a DB whose glosses predate the index gets it built the first time the
-- schema is applied, by the scraper (ScraperDatabase) and by web runMigrations alike,
-- from this one statement. The emptiness probe reads the _docsize shadow table, NOT
-- word_gloss_fts itself: an external-content table reads through to word_glosses and
-- is never "empty" while glosses exist. Verified 2026-10-07: heals, idempotent,
-- triggers then pass fts5 'integrity-check'.
INSERT INTO word_gloss_fts (word_gloss_fts) SELECT 'rebuild'
WHERE NOT EXISTS (SELECT 1 FROM word_gloss_fts_docsize)
  AND EXISTS (SELECT 1 FROM word_glosses);
```
- [ ] **Step 1: failing tests.**
  - `migrate.test.ts`: seed a DB with the **pre-M13** schema (the current `SCHEMA_SQL` minus the block above) and 2 glosses. Run `runMigrations`; `SELECT count(*) FROM word_gloss_fts_docsize` = 2 and `MATCH` finds both.
  - Insert, update and delete one gloss; a `MATCH` finds the new text, then the updated text (and not the old), then nothing. After all three, `INSERT INTO word_gloss_fts(word_gloss_fts) VALUES('integrity-check')` does not throw.
  - `runMigrations` twice: `_docsize` still 2.
  - `test_db.py`: same seed, open via `ScraperDatabase`, `_docsize` = 2.
- [ ] **Step 2: run, watch them fail.**
- [ ] **Step 3: add the block** to `schema.sql`. Then `pnpm --filter @quran-corpus/data generate:schema` (never hand-edit), and build.
- [ ] **Step 4: green**, both suites. Confirm `splitStatements` and the Python splitter keep trigger bodies whole (the existing `trg_translations_*` prove the shape).
- [ ] **Step 5: mutation-checks.**
  - Delete the self-heal INSERT and regenerate: the seed test fails.
  - Point the heal's probe at `word_gloss_fts` instead of `_docsize`: the seed test fails (never heals).
  - Make `trg_word_glosses_ad` a plain `DELETE FROM word_gloss_fts WHERE rowid = OLD.id`: the integrity-check fails.
  - Delete `trg_word_glosses_au` and regenerate: the update test fails.
  - **Regenerate after each mutate and each restore**, or the check is vacuous.
- [ ] **Step 6: commit.** `feat(data): word_gloss_fts (external content) with triggers and a self-heal`

### Task 11: `markGlossMatches` (pure)

**Files:** Create `packages/data/src/text/glossMatch.ts` and `tests/glossMatch.test.ts`.
Export it from `client.ts`, `mobile.ts` and `index.ts`.

**Interfaces — Produces:** `export function markGlossMatches(gloss: string, query: string): string`.
It wraps matched tokens in `\u0002…\u0003`, the `VerseHit.snippet` protocol that web
`Highlighted` and mobile `SnippetText` already render.

- [ ] **Step 1: failing tests.**
```ts
const M = (s: string) => `\u0002${s}\u0003`;
it('prefix-matches a term of 3+ chars, case-folded', () =>
  expect(markGlossMatches('The Merciful', 'merc')).toBe(`The ${M('Merciful')}`));
it('exact-matches a term under 3 chars, like termToMatch', () =>
  expect(markGlossMatches('in it', 'in')).toBe(`${M('in')} it`));
// unicode61 remove_diacritics 2 folds LATIN diacritics only. Verified 2026-10-07:
// "cafe" matches café; "елк"* does NOT match ёлка; "мои" does NOT match мой.
it('folds Latin diacritics like the tokenizer', () =>
  expect(markGlossMatches('café', 'cafe')).toBe(M('café')));
it('does not fold Cyrillic ё/й, because FTS does not', () => {
  expect(markGlossMatches('ёлка', 'елк')).toBe('ёлка');
  expect(markGlossMatches('мой мои', 'мои')).toBe(`мой ${M('мои')}`);
});
it('marks every term of a multi-term query', () =>
  expect(markGlossMatches('милостивый Господь', 'мил господ')).toBe(`${M('милостивый')} ${M('Господь')}`));
it('leaves brackets and punctuation outside the mark', () =>
  expect(markGlossMatches('(the) Lord,', 'lord')).toBe(`(the) ${M('Lord')},`));
it('returns the gloss untouched for a query with no letters', () =>
  expect(markGlossMatches('слово', '"*')).toBe('слово'));
```
- [ ] **Step 2: run, watch them fail.**
- [ ] **Step 3: implement.**
```ts
// A token as unicode61 sees one: a run of letters and digits. Folding mirrors
// remove_diacritics 2, which strips marks from LATIN letters only (ё, й survive),
// plus case folding -- so the mark lands on exactly what MATCHed.
const TOKEN = /[\p{L}\p{N}]+/gu;
const fold = (s: string) =>
  s.normalize('NFD').replace(/(?<=[A-Za-z])\p{M}+/gu, '').normalize('NFC').toLowerCase();
// Same floor as normalize.ts MIN_PREFIX_LENGTH: below it FTS is given an exact phrase.
const MIN_PREFIX = 3;

/** Wrap each gloss token the query matched in \u0002…\u0003. ponytail: per-token,
 *  so an apostrophe term ("o'g'il") marks its pieces, not the whole word. Cosmetic
 *  only; tokenizing the query like FTS's phrase would fix it if it ever matters. */
export function markGlossMatches(gloss: string, query: string): string {
  const terms = (query.match(TOKEN) ?? []).map(fold);
  if (terms.length === 0) return gloss;
  return gloss.replace(TOKEN, (token) => {
    const t = fold(token);
    const hit = terms.some((q) => (q.length < MIN_PREFIX ? t === q : t.startsWith(q)));
    return hit ? `\u0002${token}\u0003` : token;
  });
}
```
- [ ] **Step 4: green.** **Step 5: mutation-check.** Remove the lookbehind (strip every mark) and the `ёлка` test fails. Remove the strip entirely and the `café` test fails. Make every term prefix and the `in it` test fails.
- [ ] **Step 6: commit.** `feat(data): markGlossMatches for word-gloss hits`

### Task 12: `searchWords` + `SearchResult.words`

**§5** (`packages/data` queries).

**Files:** Create `packages/data/src/queries/wordSearch.ts` and `tests/wordSearch.test.ts`.
Modify `src/types.ts`, `src/constants.ts`, `src/queries/search.ts` and the
`index.ts`/`mobile.ts` exports. Add `words: []` to every `SearchResult` literal in
web/mobile tests and fixtures (`grep -rn "roots: \[\]" apps packages --include=*.ts*`).

**Interfaces — Produces:**
```ts
// types.ts
export interface WordHit {
  /** Null for a lemma-less word (3,307 PRON/INL); that row is keyed by its folded surface. */
  lemma_buckwalter: string | null;
  /** The lemma's Arabic, or the first occurrence's own text when there is no lemma. */
  arabic: string;
  /** The gloss shown, matched tokens wrapped \u0002…\u0003 (VerseHit.snippet protocol). */
  gloss: string;
  /** The gloss's language, or null when it is the language asked for (uz-Cyrl ≡ uz). */
  gloss_lang: string | null;
  /** Distinct matched words in this row. */
  count: number;
  /** The first occurrence: lowest word id. */
  surah_id: number;
  ayah_number: number;
  position: number;
}
export interface SearchResult { jump: JumpVerse | null; verses: VerseHit[]; words: WordHit[]; roots: Root[] }

// search.ts VerseSearchOpts gains:
/** The reader's content language, for word hits only: which matched gloss a Words row
 *  shows, and whether it is tagged. Never reorders or filters verses (R15). */
glossLanguage?: string;

// wordSearch.ts
export const WORD_HIT_LIMIT = 50;
export async function searchWords(db: QueryClient, q: string, glossLanguage?: string): Promise<WordHit[]>
```
`EMPTY_SEARCH_RESULT` gains a frozen `words: []`. `search()` runs:
```ts
const [verses, words, roots] = await Promise.all([
  searchVerses(db, query, opts),
  // Words is the newest arm and the only one on a table a deploy can outrun
  // (DB_SKIP_MIGRATIONS=true): a missing or broken word_gloss_fts costs the Words
  // section, never the verse hits beside it.
  searchWords(db, query, opts.glossLanguage).catch((): WordHit[] => []),
  searchRoots(db, query),
]);
```

- [ ] **Step 1: failing tests** (`wordSearch.test.ts`, in-memory libsql through `runMigrations`, seeded with `words`/`ayahs`/`word_glosses`):
```ts
it('groups by lemma, counts distinct words, orders by count then key');
it('every word of a span counts');                         // 2 words, one gloss_group
it('folds two lemma-less surfaces that differ only in harakat into one row, summed, first = lowest id');
it('prefers a content-language gloss and tags nothing', async () => {
  // Lemma L: 3 words glossed en "mercy" and uz "merhamat"; query "mer" matches both.
  // glossLanguage 'uz' -> gloss `\u0002merhamat\u0003`, gloss_lang null (despite en's equal count).
  // glossLanguage 'ru' (no ru match) -> the most frequent, tie by gloss: 'mercy', gloss_lang 'en'.
});
it('tags a gloss from another language; uz-Cyrl counts as uz');
it('returns [] for Arabic, for < 3 chars, for > 100 chars', async () => {
  for (const q of ['الله', 'al الله', 'ab', 'x'.repeat(101)]) expect(await searchWords(db, q, 'en')).toEqual([]);
});
it('trims the query', async () => expect(await searchWords(db, '  merc  ', 'en')).toHaveLength(1));
it('ignores fts syntax', async () => {
  for (const q of ['merc"', 'merc*', 'NEAR(merc)', 'merc OR x', '-merc']) await expect(searchWords(db, q)).resolves.toBeDefined();
});
it('caps at 50');                                           // seed 51 lemmas
it('search() returns words between verses and roots, verses unchanged with or without glossLanguage');
it('search() still returns verses when word_gloss_fts is missing', async () => {
  await db.execute('DROP TABLE word_gloss_fts');
  const r = await search(db, 'merc', { glossLanguage: 'en' });
  expect(r.words).toEqual([]);
  expect(r.verses.length).toBeGreaterThan(0);
});
```
  Write every body in full while implementing. Each one asserts exact `WordHit` objects.
- [ ] **Step 2: run, watch them fail.**
- [ ] **Step 3: implement.**
```ts
import type { QueryClient } from '../queryClient.js';
import type { WordHit } from '../types.js';
import { buildFtsMatch, normalizeArabic } from '../text/normalize.js';
import { markGlossMatches } from '../text/glossMatch.js';

export const WORD_HIT_LIMIT = 50;
const MIN_QUERY_CHARS = 3;
const MAX_QUERY_LENGTH = 100; // same cap as searchVerses
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿ]/;
const sameLang = (a: string, b: string) => (a === 'uz-Cyrl' ? 'uz' : a) === (b === 'uz-Cyrl' ? 'uz' : b);
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',');

interface Group {
  key: string; lemmaBw: string | null; arabic: string;
  count: number; firstId: number; surfaces: string[];
}

/** Words whose gloss matches, one row per lemma (R16/R17). Two FTS passes, both on the
 *  bound MATCH: the first groups and ranks; the second reads glosses for the top 50
 *  only, so a stopword query ("the*": 2,307 groups) never ships every gloss row to JS.
 *  Measured on the server: 39 ms worst case. */
export async function searchWords(db: QueryClient, q: string, glossLanguage?: string): Promise<WordHit[]> {
  const term = q.trim();
  if (term.length < MIN_QUERY_CHARS || term.length > MAX_QUERY_LENGTH || ARABIC.test(term)) return [];
  const match = buildFtsMatch(term);

  const grouped = await db.execute({
    sql: `SELECT w.lemma_buckwalter AS lemma_bw,
                 CASE WHEN w.lemma_buckwalter IS NULL THEN w.text_arabic END AS surface,
                 MIN(w.lemma) AS lemma, MIN(w.text_arabic) AS text_arabic,
                 COUNT(DISTINCT w.id) AS n, MIN(w.id) AS first_id
          FROM word_gloss_fts f
          JOIN word_glosses g ON g.id = f.rowid
          JOIN words w ON w.id = g.word_id
          WHERE word_gloss_fts MATCH ?
          GROUP BY w.lemma_buckwalter, surface`,
    args: [match],
  });
  const groups = new Map<string, Group>();
  for (const r of grouped.rows) {
    const lemmaBw = r['lemma_bw'] as string | null;
    const surface = r['surface'] as string | null;
    // A lemma-less word has no shared key, so its harakat-free surface is the key.
    const key = lemmaBw ?? `~${normalizeArabic(surface ?? '')}`;
    const n = r['n'] as number;
    const firstId = r['first_id'] as number;
    const arabic = (lemmaBw ? (r['lemma'] as string | null) : null) ?? (r['text_arabic'] as string);
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { key, lemmaBw, arabic, count: n, firstId, surfaces: surface ? [surface] : [] });
      continue;
    }
    // Only lemma-less keys repeat. Their raw surfaces are disjoint word sets, so the
    // distinct counts add exactly.
    g.count += n;
    if (surface) g.surfaces.push(surface);
    if (firstId < g.firstId) { g.firstId = firstId; g.arabic = arabic; }
  }
  const top = [...groups.values()]
    .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, WORD_HIT_LIMIT);
  if (top.length === 0) return [];

  const lemmas = top.flatMap((g) => (g.lemmaBw ? [g.lemmaBw] : []));
  const surfaces = top.flatMap((g) => (g.lemmaBw ? [] : g.surfaces));
  const ids = top.map((g) => g.firstId);
  const [glossRows, firstRows] = await Promise.all([
    db.execute({
      sql: `SELECT w.lemma_buckwalter AS lemma_bw, w.text_arabic AS surface,
                   g.language_code AS lang, g.gloss_text AS gloss, COUNT(*) AS c
            FROM word_gloss_fts f
            JOIN word_glosses g ON g.id = f.rowid
            JOIN words w ON w.id = g.word_id
            WHERE word_gloss_fts MATCH ?
              AND (w.lemma_buckwalter IN (${marks(lemmas.length)})
                   OR (w.lemma_buckwalter IS NULL AND w.text_arabic IN (${marks(surfaces.length)})))
            GROUP BY w.lemma_buckwalter, w.text_arabic, g.language_code, g.gloss_text`,
      args: [match, ...lemmas, ...surfaces],
    }),
    db.execute({
      sql: `SELECT w.id, a.surah_id, a.ayah_number, w.position
            FROM words w JOIN ayahs a ON a.id = w.ayah_id WHERE w.id IN (${marks(ids.length)})`,
      args: ids,
    }),
  ]);

  // Best gloss per key: exact content language, then the same language in the other
  // script, then any; within a tier the most frequent, then alphabetical.
  const tier = (lang: string) =>
    !glossLanguage ? 2 : lang === glossLanguage ? 0 : sameLang(lang, glossLanguage) ? 1 : 2;
  const counts = new Map<string, Map<string, { lang: string; gloss: string; c: number }>>();
  for (const r of glossRows.rows) {
    const lemmaBw = r['lemma_bw'] as string | null;
    const key = lemmaBw ?? `~${normalizeArabic(r['surface'] as string)}`;
    const lang = r['lang'] as string;
    const gloss = r['gloss'] as string;
    const per = counts.get(key) ?? new Map();
    const cell = per.get(`${lang}\u0000${gloss}`) ?? { lang, gloss, c: 0 };
    cell.c += r['c'] as number;
    per.set(`${lang}\u0000${gloss}`, cell);
    counts.set(key, per);
  }
  const first = new Map(firstRows.rows.map((r) => [r['id'] as number, r]));

  return top.map((g) => {
    const best = [...(counts.get(g.key)?.values() ?? [])].sort(
      (a, b) => tier(a.lang) - tier(b.lang) || b.c - a.c || (a.gloss < b.gloss ? -1 : a.gloss > b.gloss ? 1 : 0),
    )[0]!;
    const at = first.get(g.firstId)!;
    return {
      lemma_buckwalter: g.lemmaBw,
      arabic: g.arabic,
      gloss: markGlossMatches(best.gloss, term),
      gloss_lang: glossLanguage && sameLang(best.lang, glossLanguage) ? null : best.lang,
      count: g.count,
      surah_id: at['surah_id'] as number,
      ayah_number: at['ayah_number'] as number,
      position: at['position'] as number,
    };
  });
}
```
- [ ] **Step 4: green.** Rebuild `dist/`, then run the workspace gate (fixture literals updated).
- [ ] **Step 5: mutation-checks.**
  - Key lemma-less rows by the raw `surface` instead of `normalizeArabic(surface)`: the fold test fails.
  - Drop `tier` from the sort: the content-language test fails.
  - Return `best.lang` unconditionally: the content-language test fails on `gloss_lang`.
  - Remove the `ARABIC.test` guard: the Arabic case fails.
  - Remove the `.catch` in `search()`: the missing-table test fails.
- [ ] **Step 6: commit.** `feat(data): searchWords, a Words section in SearchResult`
- [ ] **Step 7: STOP — §5.** Ask the owner to run `/code-review` on `main..HEAD` (Tasks 10-12). One pass.

### Task 13: Web — Words section

**Files:** Modify `app/api/search/route.ts`,
`components/search/SearchResults.tsx` and `src/test/SearchResults.test.tsx`.

- [ ] **Step 1: failing tests.** The plan's own review finding: no hover fill on the row (AA).
  - Words render between the Verses and Roots `<h2>`s (DOM order).
  - A lemma row links to `lemmaPath(bw)`; a lemma-less row links to `/word/2/7/3`.
  - The highlight renders a `<mark>`.
  - `(ru)` appears only when `gloss_lang` is set.
  - No section when `words` is empty.
- [ ] **Step 2: run, watch them fail.**
- [ ] **Step 3: implement.**
  - Links: lemma rows use `lemmaPath` (`lib/routes.ts`); lemma-less rows use the existing `wordHref({ surah, ayah, position })` (`lib/wordLocation.ts:13`). No new path builder.
  - `route.ts`: `const { content } = resolveLocale(await cookies()); const result = await search(db, q, { glossLanguage: content });`. Import `cookies` from `next/headers` and `resolveLocale` from `../../../lib/locale`. Verses are unchanged because `glossLanguage` never reaches `searchVerses`' SQL.
  - `SearchResults.tsx`: destructure `words`, add it to `empty`, and insert the section after verses:
```tsx
{words.length > 0 && (
  <section className="mb-6">
    <h2 className="mb-2 text-sm font-semibold text-paper-500">Words</h2>
    <ul className="space-y-1">
      {words.map((w) => (
        <li key={w.lemma_buckwalter ?? `${w.surah_id}:${w.ayah_number}:${w.position}`}>
          <Link
            href={w.lemma_buckwalter ? lemmaPath(w.lemma_buckwalter) : wordHref({ surah: w.surah_id, ayah: w.ayah_number, position: w.position })}
            onClick={onNavigate}
            // No hover fill: text-paper-600 measures 4.38:1 on paper-100, under AA.
            // Hover underlines the gloss instead; the row keeps the page background.
            className="group flex items-baseline gap-3 rounded-lg px-2 py-1.5"
          >
            <span className="font-arabic text-lg" dir="rtl">{w.arabic}</span>
            <span className="min-w-0 flex-1 text-sm group-hover:underline" dir="ltr">
              <Highlighted text={w.gloss} />
              {w.gloss_lang && <span className="ml-1 text-xs text-paper-600 dark:text-paper-400">({w.gloss_lang})</span>}
            </span>
            <span className="text-xs tabular-nums text-paper-600 dark:text-paper-400">{w.count}</span>
          </Link>
        </li>
      ))}
    </ul>
  </section>
)}
```
  The heading copies the existing Roots `<h2>` class on purpose: one style per section heading.
- [ ] **Step 4: green**, plus web lint and type-check. **Step 5: mutation-check.** Render the section after roots and the order test fails.
  The `(lang)` tag and count sit on the page background only (`paper-50` 4.73 / `night-300` 7.62). Record that in WB1.
- [ ] **Step 6: commit.** `feat(web/search): Words section from word-gloss matches`

### Task 14: Mobile — Words section

**Files:** Modify `apps/mobile/src/data/corpusRepository.ts:680`,
`screens/SearchScreen.tsx` (between verses and the `result.roots` block at :463, and in
the `nothing` check at :290), `i18n/uiStrings.ts` (`'search.words'`) and
`SearchScreen.test.tsx`.

- [ ] **Step 1: failing tests.**
  - `search-heading-words` sits between the verses heading and `search-heading-roots`.
  - A lemma row press pushes `/lemma/${encodeURIComponent(bw)}`; a lemma-less row pushes `/word/2/7/3`.
  - The tag shows when `gloss_lang` is set.
  - `nothing` is false when only words matched.
  - `searchCorpus` passes `glossLanguage: languageCode`.
- [ ] **Step 2: run, watch them fail.**
- [ ] **Step 3: implement.**
  - `searchCorpus`: add `glossLanguage: languageCode`.
  - Strings: en `'Words'`, uz `'So‘zlar'`, ru `'Слова'`.
  - Section: copy the roots block's shape (heading `testID="search-heading-words"`, group `testID="search-group-words"`, `ResultCard` with `testID="search-word"`). The card is a row with Arabic (`fonts.arabic`, 22, rtl), then `SnippetText snippet={w.gloss}` with the same highlight props the verse cards pass, then the tag `({w.gloss_lang})` in `mutedText` when set, then the count in `mutedText` with tabular nums. `accessibilityLabel` = `${w.arabic}, ${plain gloss}, ${w.count} ${t(uiLocale,'dictionary.occurrences')}`, where the plain gloss strips `\u0002`/`\u0003`.
- [ ] **Step 4: green** (turbo gate, mobile). **Step 5: mutation-check.** Drop `result.words.length === 0` from `nothing` and the words-only test fails.
- [ ] **Step 6: commit.** `feat(mobile/search): Words section from word-gloss matches`

### Task 15: Live migrate, mobile DB, release

**Files:** Modify `packages/mobile-data/scripts/pruneForMobile.ts`,
`create-m1-reader-db.ts`, `apps/mobile/src/data/openCorpusDb.ts` and `app.json`.

- [ ] **Step 1: contract (failing first).** `validateM1ReaderDbContract` throws unless:
  - `SELECT count(*) FROM word_gloss_fts_docsize` equals `SELECT count(*) FROM word_glosses`;
  - `INSERT INTO word_gloss_fts(word_gloss_fts) VALUES('integrity-check')` passes (run it on the copy, before the seal).

  Run it on the PR A asset and **expect a throw** (no table).
- [ ] **Step 2: compact.** In `pruneOpenDb`, after the `search_fts` optimize: `await db.execute("INSERT INTO word_gloss_fts(word_gloss_fts) VALUES('optimize')");`. The comment: the PR A delete+insert left tombstones; same reasoning as above it.
- [ ] **Step 3: migrate the live DB.** Take a `.bak` first: `python3 -c "import sqlite3; s=sqlite3.connect('/home/claude/quran-data/quran.db'); d=sqlite3.connect('/home/claude/quran-data/quran.db.bak-m13b'); s.backup(d)"`. Then apply the schema through the scraper: `cd packages/scraper && uv run python -c "from scraper.db import ScraperDatabase; ScraperDatabase('../../apps/web/quran.db').close()"`. Then verify:
  - `word_gloss_fts_docsize` count = `word_glosses` count (en 77,429 + uz 77,424 + uz-Cyrl 77,424 + ru 77,429 = 309,706);
  - `integrity-check` passes;
  - `MATCH '"милост"*'` returns rows.
- [ ] **Step 4: size.** VACUUM a scratch copy and record the canonical size before and after (expect ≈ +5.5 MB: 4.08 MB measured for 3 languages, plus ru). Run `corpusDbVersion` `'m13a'` → `'m13b'`, then `pnpm generate:m1-db`, then the contract. Record the asset size.
- [ ] **Step 5: versionCode** 95 → 96. Run the gates, then commit `chore(mobile): m13b corpus with the word-gloss index, versionCode 96`.
- [ ] **Step 6: APK + device run WITH the owner** (as Task 9 Steps 1-2) → table **M13-B**.
- [ ] **Step 7: web.** Prod build + start locally → table **M13-W(B)**.
- [ ] **Step 8: handoff.** **Deploy order is load-bearing.** The homelab web runs `DB_SKIP_MIGRATIONS=true`, so a PR B build against an un-migrated DB throws `no such table: word_gloss_fts` on **every search**. Steps:
  1. Copy the migrated DB (with `word_gloss_fts` populated) to the homelab first.
  2. Then deploy the PR B build.
  3. Search `милост` and `mercy`.
- [ ] **Step 9: push.** Ask about the PR.

---

## Removal runbook (takedown on Quran Academy's request — R3)

Reversible to the pre-M13 state; no code reverts needed beyond the credit and contract.

1. Back up first: `python3 -c "import sqlite3; s=sqlite3.connect('/home/claude/quran-data/quran.db'); s.backup(sqlite3.connect('/home/claude/quran-data/quran.db.bak-takedown'))"`.
2. Delete the data in one transaction:
   ```python
   con = sqlite3.connect('/home/claude/quran-data/quran.db')
   with con:
       con.execute("DELETE FROM word_glosses WHERE language_code='ru' AND source='quranacademy'")
       con.execute("DELETE FROM root_glosses WHERE language_code='ru'")
   ```
   After PR B, `trg_word_glosses_ad` removes the matching index entries. Then `INSERT INTO word_gloss_fts(word_gloss_fts) VALUES('optimize')` and `VALUES('integrity-check')`.
3. Code, one commit:
   - remove the mobile `Quran Academy` credit and the `about.sourceWbwRu` strings (×3);
   - remove the web source entry;
   - mark the `docs/data-sources-m1.md` row "Removed <date> at rights holder's request";
   - delete the `ruGlosses` contract check;
   - bump `corpusDbVersion`;
   - bump `versionCode`.
   Keep `qul_ru_import.py`: it reads a local snapshot and ships nothing.
4. `pnpm generate:m1-db`, APK, release. Web: deploy the DB, then the build.
5. Comment on #116 with the date, the request and the release that removed it.

Russian WBW then falls back to English with the `(en)` tag, which is the pre-M13 behaviour.

---

## Risks / rollback

| Risk | Mitigation |
|---|---|
| QUL markup drift on a re-run | The snapshot is frozen; any drift aborts as unaligned (R6), never a partial import. Task 8 Step 3 asserts exact counts. |
| A bad cleaning rule eats meaning | Rules cover the end of the string only; interior text is never touched. The 20-row sample goes to the owner; brackets and «досл.» are untouched. |
| `.bak` misses WAL pages | `Connection.backup()`, asserted by `test_backup_holds_the_pre_import_state`. |
| Dimmed text fails AA on some host | Measured per host in Task 5 Step 1 and Task 6's contrast test; `paper-100` = STOP. |
| Row-height drift in WBW (M6l estimator) | Colour-only nested `Text`; no font or size change. Device check A5. |
| Stopword queries slow on phone | Two-pass query; 39 ms server worst case. Device check B1 times `the`. Upgrade path: raise the floor to 4 chars for Latin only. |
| Web 500 on search after PR B deploy | Deploy order (Task 15 Step 8). |
| APK grows | PR A ≈ +4 MB (ru rows), PR B ≈ +5.5 MB (external-content index), recorded at Tasks 8/15. |
| External-content index drifts from `word_glosses` | Only triggers write it. Any write path that bypasses them (none exists; Python and TS both go through the schema's triggers) would leave stale rowids. The mobile contract runs `integrity-check` on every generated asset. |
| Russian user types е for ё | FTS does not fold ё (measured), so `все` will not find `всё`. Verse search has the same limit today. Out of M13 scope; raise as a follow-up issue at PR B merge. |
| Legal | Owner-accepted (R1). Runbook above; credit says "permission requested". |

**Rollback:** PR A: restore the **earliest** `quran.db.bak-m13-*` (the pre-M13 state), or follow the runbook. PR B: restore
`quran.db.bak-m13b`, or drop the 3 triggers then `DROP TABLE word_gloss_fts` (purely additive).

---

## Acceptance

- `word_glosses` ru/quranacademy = 77,429; 0 Latin letters; 0 trailing `, . ; : – —`; 1,111 spans.
- ru `root_glosses` non-empty; 0 rows contain « or ».
- Lemma chips under Russian show no «», and no leading и/а/но/или (except the conjunction lemma itself).
- Bracketed runs are dimmed on every WBW surface in en/uz/ru, both apps, both themes, AA ≥ 4.5.
- Credits are visible on web and mobile with the exact R2 wording.
- PR B: `word_gloss_fts_docsize` count = `word_glosses` count, and `integrity-check` passes. Words section after verses and before roots. Rows grouped and capped at 50. Tags and highlights as R17.
- Gates are green. `/code-review` ran and was answered at the Task 4 and Task 12 STOPs. Device tables M13-A and M13-B are filled. Owner confirmed both web deploys.

---

## Verification log

### M13-A — device, vc95 (with the owner)

| # | Check | Result |
|---|---|---|
| A1 | Russian content: WBW 1:1-1:7 shows Russian glosses, no `(en)` tag | |
| A2 | 2:4 (the measured "min + qablika" case) shows one gloss under two cells | |
| A3 | 2:1-2:20: no gloss ends in `, . ; : – —`; `!` / `?` present where the source has them | |
| A4 | Brackets dimmed in cell, span, word sheet, mushaf word sheet, word screen. Russian, English and Uzbek. Light + dark | |
| A5 | Dense density: dim run inside the 1-line clamp; scroll 2:1→2:50 shows no row jump | |
| A6 | Lemma قال, Russian: chips have no «», no leading и/а/но/или | |
| A7 | Root قول, Russian: derived list present, no «» | |
| A8 | About: Quran Academy credit + "Source approval incomplete" pill, in en/uz/ru UI | |
| A9 | Cold start after the DB changed (`m13a`): extract ran, no ANR | |
| A10 | Search `милост` still returns verses (unchanged path) | |

### M13-W(A) — local prod build

| # | Check | Result |
|---|---|---|
| WA1 | Background classes per host + measured ratios (Task 5 Step 1) | Dim `text-paper-600 dark:text-paper-400`. Cell, span, row (`WbwWordCell`/`WbwGlossSpan`/`WbwWordRow`) and `/word/...` (`WordDetailView`): no bg class, inherit body `bg-paper-50 dark:bg-night-300` (layout.tsx:84), hover moves border/ring only: 4.73 light / 7.62 dark. `WordPopover` sheet `bg-paper-50 dark:bg-night-200` (WordPopover.tsx:36): 4.73 / 7.15. No host on paper-100. |
| WA2 | `/surah/1/words`, Russian: glosses, spans, dimming; light + dark | |
| WA3 | Reader popover + `/word/2/2/1`: dimming | |
| WA4 | `/dictionary/lemma/…` (قال) chips clean | |
| WA5 | `/about`: Quran Academy entry | |

### M13-B — device, vc96 (with the owner)

| # | Check | Result |
|---|---|---|
| B1 | `милост`: Words section between verses and roots, grouped, counted; `the` returns without a visible stall (time it) | |
| B2 | Russian content, query `mercy`: rows carry `(en)` | |
| B3 | Latin Uzbek query (`rahm`): uz rows, no tag under Uzbek | |
| B4 | Arabic query: no Words section | |
| B5 | 2-char query: no Words section | |
| B6 | Lemma row → lemma page; lemma-less row (`они` / `them`) → word screen at its first occurrence | |
| B7 | Highlight visible in light + dark | |
| B8 | Cold start after `m13b`: extract ran, no ANR | |

### M13-W(B) — local prod build

| # | Check | Result |
|---|---|---|
| WB1 | Search sheet: Words section order, links, `(lang)` tag via the cookie content language | |
| WB2 | Verse hits identical to the PR A build for `mercy` and `милост` | |

---

## Plan review log

`/code-review` on the plan, 2026-10-07: 10 findings, 9 fixed in the plan, 1 declined.

| # | Finding | Verdict |
|---|---|---|
| 1 | Importer never writes its `languages('ru')` FK target, so a fresh DB fails on the FK and the R7 test passes for the wrong reason | Fixed: `INSERT OR IGNORE` in the txn, plus tests for a fresh DB and an existing row |
| 2 | `markGlossMatches` folds ё/й, which unicode61 does not | Fixed after verifying on SQLite: the fold is Latin-only. ё/е search noted as a follow-up risk |
| 3 | A `word_gloss_fts` failure rejects the whole `search()` and takes verses with it | Fixed: `.catch(() => [])` on Words only, with a missing-table test |
| 4 | A fixed `.bak-m13` is overwritten on a re-run, so the rollback restores the post-import state | Fixed: UTC-stamped name, refuses if it exists, `dst` closed explicitly |
| 5 | The trailing-`.` strip truncates abbreviations | **Declined**: 0 of 76,295 cards end in т.д./т.е./досл./пр./др. (measured) |
| 6 | `skeleton()` duplicates `tasnim_align.base_form`, the corpus loader is duplicated, and `_corpus` is copy-pasted (§3) | Fixed: reuse `base_form` (re-measured: identical 0 / 1,134 / 76,295), public `corpus_ayahs`, shared `make_corpus` |
| 7 | `wordPath` duplicates `wordHref` | Fixed: use `wordHref` |
| 8 | Words row hover is `paper-100`, under AA for `paper-600` text, and the section is missing `mb-6` | Fixed: no hover fill (underline instead), `mb-6` added |
| 9 | The R7 collision surfaces as a raw IntegrityError after the backup | Fixed: `_plan` refuses foreign ru rows with a reason, before any backup |
| 10 | A contentful fts5 duplicates every gloss | Fixed: external content, 4.08 MB vs 12.67 MB measured; `_docsize` heal probe; 'delete' triggers; `integrity-check` in the contract |

## Self-review

**Coverage:**

| Ruling | Tasks |
|---|---|
| R1/R2 | 7, 9 Step 4 |
| R3 | runbook |
| R4–R9 | 1, 2, 8 |
| R10–R12 | 3, 8 Step 5 |
| R13 | 4, 5, 6 |
| R14 | 10, 15 |
| R15–R17 | 11, 12, 13, 14 |
| R18 | the PR split |
| R19 | 9, 15 |

D1 is surfaced for confirmation, not silently decided.

**Placeholders:**
- Task 2 Step 1 sketches five tests by name and assertion. The implementer writes their bodies against the shown fixtures and helpers; the asserts are stated.
- Task 12 Step 1 is the same: names plus asserted shapes. Its implementation is complete.

**Type consistency:**
- `Row(word_id, gloss, head)` is the only currency between Tasks 1 and 2.
- `GlossRun{text, dim}` is shared by Tasks 4-6.
- `WordHit` fields are spelled identically in Tasks 12-14.
- `glossLanguage` is spelled the same in `VerseSearchOpts`, `searchWords`, `route.ts` and `searchCorpus`.
- `corpusDbVersion` goes `s2` → `m13a` → `m13b`; versionCode goes 94 → 95 → 96.
