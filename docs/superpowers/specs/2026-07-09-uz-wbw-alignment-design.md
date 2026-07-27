# Spec: Uzbek WbW glosses via LLM verse→word alignment

Date: 2026-07-09
Status: design (spike-gated, not yet approved for full build)
Supersedes: NLLB-200 MT uz glosses (`source='mt'`, 75539 rows — quality rejected)

## Problem
Current uz per-word glosses are NLLB-200 machine translation. Quality bad. Need
human-grade per-word Uzbek, all 114 surahs, ship-clean (licensed source only).

## Goal
Derive per-word Latin-script Uzbek glosses by LLM-aligning Sodik's licensed
Uzbek **verse** translation onto our corpus Arabic **words**. Replace all `mt`
uz glosses. Ship legally.

## Non-goals
- No ingest of islom.uz or Tasnim proprietary WbW text into shipped DB.
- No verse-translation changes (Sodik verse text stays as-is).
- No UI/schema redesign; reuse existing `word_glosses` + `getGlossesWithFallback`.

## Decisions (locked)
- Aligner = **LLM** (per-verse), not statistical. Reason: Arabic↔Uzbek word
  order/morphology diverge; statistical aligners weak + unauditable; we have
  human WbW references for few-shot + scoring.
- Source verse translation = **Sodik** (`translations`, lang=uz, Cyrillic,
  6236 rows, already in DB).
- Output script = **Latin** (align in Cyrillic, transliterate to Latin).
  Matches current UI glosses + Tasnim cross-ref; Uzbek youth read Latin.
- QA gold set = **islom.uz WbW** (49 surahs, SAME Sodik translator → direct
  accuracy oracle). Secondary = **Tasnim** (114, different translator).
- **Legal boundary (hard):** islom/Tasnim used ONLY to score + flag low
  agreement into review queue. Their text NEVER written to our DB. Human /
  clean source resolves flags. Enforced by acceptance grep check.

## Reference-data provenance (local, gitignored, inspection-only)
- islom `database.db`: SQLCipher v4, **encrypted with a key belonging to a third
  party**. The key and cipher parameters are NOT recorded here and must not be
  committed anywhere in this repo — they are someone else's credential, we cannot
  rotate them, and writing them down turns a doc into a decryption recipe for
  12314 proprietary rows we are separately forbidden (see the legal boundary
  above) from using. Held privately; ask the repo owner if the spike needs re-running.
  Shape, for planning only: `WORDS(surah_id, ayah_id, word_id, arabic,
  trans_uzb)`, 12314 rows / 12253 non-empty, 49 surahs: 1,2,3,18,20,67–114 minus
  74–77. Cyrillic. Curated (short) glosses. Some rows group multi-word Arabic
  (e.g. `يوم الدين` one row) → segmentation differs from our corpus.
- Tasnim `TasnimDatabase.db`: plain SQLite. Full **114 surahs, 66139 words,
  100% `translateUzlat` (Latin)** filled; different translator; human quality.
  `bywords(surahId, verseId, wordsAr, translateUzlat,...)`. Own segmentation
  (groups some words, e.g. `لا ريب`→"shubha yo'q") → align to OUR word ids.
- Both live outside git (decrypted DBs gitignored). Used by eval only.

---

## Phase 0 — SPIKE (HARD GO/NO-GO GATE)
Nothing downstream builds until spike passes. Throwaway code; scratchpad or
gitignored scraper spike dir.

### Steps
1. Pick spike set from gold surahs: `1` (Fatiha, short), `112` (short, in
   gold), `67` (mid). All in islom 49-surah gold + partially in Tasnim? (67
   yes-gold, not-Tasnim). Keep ≤ ~90 verses total.
2. Build minimal aligner: per verse → strip Sodik tafsir parentheticals →
   feed ordered Arabic words + cleaned verse + 2–3 islom few-shot → LLM →
   JSON `{word_id: gloss}` + confidence.
3. Transliterate output Cyrillic→Latin (prototype table).
4. Score vs islom gold: coverage %, exact-match %, fuzzy agreement (token
   overlap / edit distance), + manual read.
5. Compare granularity mismatch: how often corpus word count ≠ islom row
   grouping; does LLM handle it.
6. Spike report: metrics + 20 hand-eyeballed rows + verdict + tuned prompt +
   proposed acceptance thresholds.

### Spike exit criteria (author's provisional; confirm from data)
- Coverage ≥95% words get a gloss.
- Fuzzy agreement vs gold high enough that manual read = "clearly better than
  mt, publishable." Exact number set FROM spike, not before.
- Parenthetical stripping + translit visibly correct on sample.
- If FAIL: reconsider (statistical+LLM refine, or pursue islom license, or
  narrow scope). Do NOT proceed to Phase 1 on a weak spike.

---

## Phase 1+ — Full pipeline (ONLY if spike passes)
Offline, `packages/scraper`, resumable + checkpointed (§11).

```
for each ayah (1..6236):
  strip tafsir parentheticals from Sodik verse (Cyrillic)
  fetch corpus Arabic WORDS (our segmentation)
  LLM: map word_id -> uz gloss span (few-shot from islom, tuned prompt)
  transliterate Cyrillic->Latin
  write word_glosses(word_id, lang='uz', source='aligned', confidence)
  checkpoint ayah_id
```

### Aligner
- One verse per LLM call (~6236 calls), batched, checkpoint→resume on crash.
- Strict JSON out; validate shape per response; retry on malformed.
- Parentheticals dropped (not glossed).
- Model: latest capable Claude.

### Transliteration (Cyrillic→Latin)
- Deterministic table module: ў→o', ғ→g', қ→q, ҳ→h, х→x, ч→ch, ш→sh, ъ→',
  е/ё/ю/я context-handled. Unit-tested edge cases.

### QA
- Score `aligned` vs islom gold (49 surahs) → accuracy metric.
- Tasnim (when supplied) → agreement flag on 65 non-islom surahs.
- Low-confidence / low-agreement → gloss-review.json round-trip (reuse
  mt-reviewed pattern) for human resolution.

### DB write + fallback
- `.bak` before write; no concurrent scraper writer.
- source='aligned'. After 'aligned' verified: delete uz `source='mt'` (keep
  pre-delete export for rollback).
- Low-confidence/failed word → no gloss written; `getGlossesWithFallback`
  serves EN + `(en)` hint (no code change).

### Files
- `packages/scraper/src/quran_scraper/align_glosses.py` — pipeline+checkpoint
- `packages/scraper/src/quran_scraper/translit_uz.py` (+ test) — Cyr→Lat
- `packages/scraper/src/quran_scraper/eval_alignment.py` — score vs
  islom/Tasnim (reads gitignored decrypted DBs)
- `apps/web/src/app/about/page.tsx` — credit: Sodik-derived machine-aligned;
  drop NLLB credit.

## Risks / rollback
- LLM misalign on long verbose verses → gold set quantifies; confidence gate +
  EN fallback.
- Derived glosses clunkier than islom's curated ones → accepted clean-ship
  tradeoff; islom license later can upgrade covered surahs.
- Granularity mismatch (islom phrase-grouping vs corpus words) → spike measures;
  aligner maps to OUR word ids regardless.
- Rollback: mt export retained; single source-tag swap reverts.

## Acceptance (full build)
- ≥95% gold-set words get an aligned gloss; agreement ≥ spike-set threshold.
- Zero islom/Tasnim strings in shipped DB (grep check both refs' text).
- translit unit tests pass; lint + type + test green; Greptile 5/5.
- About page credit accurate.

## Open questions
- Exact agreement threshold — set by spike, not before.
