# WbW Data Alignment Fix — Design Spec

**Date:** 2026-07-05
**Status:** design → review
**Blocks:** Phase 08F (WbW page). Prereq fix, not a sub-phase.

## Goal

Make `words.text_arabic` correctly correspond to `transliteration` / `word_glosses`
/ `word_segments` for every word. Today it drifts (42% wrong). Fill the 29
missing Fatiha translit/gloss. Add a validator so misalignment can't ship again.

## Context / evidence

Two independent defects in the current DB (`quran.db`, 77429 words).

### Defect 1 — text_arabic globally misaligned (42%, 32764 words)
`corpus_quran.py:64-67` sets
`text_arabic = text_uthmani.split()[position-1]`.
Corpus `position` (source of translit/gloss/pos/segments) and
`text_uthmani.split()` use DIFFERENT tokenizations: text_uthmani embeds a
per-surah Basmala + 4238 pause-mark glyphs (ۛ ۖ ۚ …) as tokens; corpus does
not. Same index into mismatched lists → drift. Drift compounds within each
affected ayah, so 42% of words carry the wrong Arabic.

Proof (translit/segment = oracle; text_arabic wrong):
| loc | text_arabic | seg form (correct) | translit |
|---|---|---|---|
| 112:1:1 | بِسْمِ | قُلْ | qul |
| 36:1:1 | بِسْمِ | يسٓ | ya-seen |
| 2:2:5 | ۛ (pause) | فِيهِ | fīhi |
| 7:64:11 | ۚ (pause) | إِنَّهُمْ | innahum |
| 16:113:3 | رَسُولٌۭ | رَسُولٌ | rasūlun |

32 spot-checks (surahs 2–114, start/mid/end, random+targeted): segment
`form_buckwalter` matches transliteration in 100%; text_arabic matches only the
non-drifted 58%.

### Defect 2 — Fatiha translit/gloss null (exactly 29 words)
`gap = 77429-77400 = 29 = surah 1`. `upsert_word` keeps translit via COALESCE;
null means the corpus scrape never delivered ch.1 translit. Cause: shared
`checkpoint.json` had `chapter_1` already marked done (earlier morphology/segment
run), so `scrape_chapter` early-returned (`corpus_quran.py:33-34`) and skipped
it. Surah 1 text_arabic is present+correct (from segment import), only
translit/gloss missing.

## Root design decision

**Per-word Arabic's single source of truth = `word_segments`**, not text_uthmani.
Segments are GPL-location-aligned (sura:aya:word:seg) to corpus positions, 100%
word coverage, lossless Uthmani orthography (concat by segment_index
reconstructs the word: `{lo`+`kita`bu`→ٱلْكِتَٰبُ). See [[gpl-segments-source-decision]].

So: stop guessing text_arabic from text_uthmani; DERIVE it from segments as a
defined pipeline step. Fixes existing data AND prevents recurrence (SOLID:
single responsibility for word Arabic).

## Components

### A. `derive_word_arabic(db)` — permanent pipeline step + repair
Set `words.text_arabic = concat(form_arabic order by segment_index)` per word.
- Idempotent (no-op on already-correct 58%).
- Offline (no network). Operates on existing DB.
- Words with no segments: leave text_arabic untouched (none exist today — assert 0).
File: `packages/scraper/scraper/sources/word_arabic.py`
CLI: `scraper derive-word-arabic --db quran.db`

### B. Fix `corpus_quran._process_page`
Remove the `text_uthmani.split()[position-1]` derivation (lines 64-67). Insert
word with `text_arabic=""` (placeholder); Component A fills it post-segment-import.
Prevents the bug re-entering on any future scrape.
Update `scrape_chapter` docstring (drops the "derives text_arabic from
text_uthmani" claim).

### C. Re-scrape chapter 1 (Defect 2)
Clear `chapter_1` checkpoint key, re-run `scrape_chapter(1, …)` to populate
Fatiha translit + gloss. Rate-limited (~1.5s), 7 verses. §11-compliant.
Then run Component A (ch.1 text_arabic already correct → no-op there).

### D. `validate_alignment(db)` — anti-recurrence gate
Codifies the lesson [[validate-data-by-alignment-not-count]]. Asserts:
1. `text_arabic == segconcat` for ALL words (0 diffs).
2. Every word has `transliteration` non-null/non-empty (0 gaps).
3. Every word has ≥1 gloss (`word_glosses` en) — report count, warn if <100%.
4. Hard-coded ground-truth spot-checks (translit): 112:1:1=`qul`,
   36:1:1=`ya-seen`, 2:2:5=`fīhi`, 1:1:1 translit present, 114:1:1=`qul`.
Exits nonzero on any failure. Run after A+C.
File: `packages/scraper/scraper/validate_alignment.py`
CLI: `scraper validate-alignment --db quran.db`

### E. Regenerate app-bundled DB
After A+C+D green, re-export/seed the DB the web app ships (packages/data).
No schema change → no migration file; data-only.

## Data flow
corpus scrape (translit/gloss/pos) + GPL morphology (segments) →
**derive-word-arabic** (A) → text_arabic aligned → validate-alignment (D) →
export to app.

## Execution order (strict)
B (code fix) must land before C, or the ch.1 re-scrape re-injects the bug.
1. Snapshot quran.db (rollback copy).
2. **B** — fix `corpus_quran` (code only, no data change yet).
3. **C** — clear `chapter_1` checkpoint, re-scrape ch.1 (fixed code path).
4. **A** — `derive-word-arabic` over whole DB (fills text_arabic from segments).
5. **D** — `validate-alignment` (must exit 0).
6. **E** — export/seed app DB.
Each of A–D ships with tests via the 5-step loop; each is an SDD task.

## Testing
- Unit `test_word_arabic.py`: derive on fixture DB — drifted row repaired,
  aligned row unchanged (idempotent), multi-segment concat order correct.
- Unit `test_validate_alignment.py`: passes on aligned fixture; fails on a
  seeded drift; fails on a null-translit row; ground-truth asserts fire.
- Integration: run A+D on real quran.db; assert 0 diffs, 0 translit gaps,
  ground-truth checks pass.
- Web: existing WbW/popover tests still green (text_arabic now correct;
  no interface change).

## Risks / rollback
- **Overwrites text_arabic on 32764 rows.** Snapshot quran.db before (copy).
  Fully reversible: re-derive is deterministic from segments.
- Idempotent → safe to re-run.
- Re-scrape ch.1 network: if corpus page shape changed, parser may return
  empty → D catches (translit gap persists, nonzero exit). Then investigate
  parser before proceeding.
- Segments assumed correct (they're the oracle). D's ground-truth spot-checks
  guard against a bad segment import too.

## Acceptance criteria (testable)
1. `scraper validate-alignment` exits 0 on quran.db.
2. 0 words where text_arabic ≠ segconcat.
3. 0 words with null/empty transliteration.
4. Fatiha (surah 1) has translit + gloss on all 29 words.
5. Ground-truth: 112:1:1 Arabic=قُلْ, 36:1:1=يسٓ, 2:2:5=فِيهِ.
6. Web test suite green; reader popover shows aligned gloss for a known word.
7. `corpus_quran` no longer derives text_arabic from text_uthmani.

## Out of scope
- 08F WbW page UI (unblocks after this).
- Root-definition import (Lane/Wiktionary) — separate parked decision.
- Multi-language gloss (en only today).
