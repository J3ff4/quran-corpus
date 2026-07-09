# Phase 12 — Uzbek Word-by-Word Glosses (design)

Date: 2026-07-07. Status: approved design, pre-plan.

## Goal

Uzbek per-word glosses for all corpus words. Machine-translated (NLLB-200,
local/offline/free) from existing English glosses, provenance-tagged,
partially human-reviewed. Surface in the word popover / word-detail / WbW
page under the existing `?lang=uz` path.

## Key finding — UI already wired

Display path for uz glosses EXISTS today; phase is ~80% data:

- `LANGUAGES` (apps/web/.../reader/languages.ts) already lists `uz`, `ru`.
- `LanguageBar` renders the Uzbek pill → `?lang=uz`.
- `getGlossesBySurahAndLang(db, surahId, lang)` filters `word_glosses` by
  `language_code`. Reader resolves `?lang=uz` and threads it through.
- Today tapping Uzbek → `WHERE language_code='uz'` → 0 rows → blank glosses.

The display lights up the moment `uz` rows exist. Remaining UI is thin.

## Data facts (canonical DB /home/claude/quran-data/quran.db)

- `word_glosses`: 77,429 EN rows (one per word). Cols: id, word_id,
  language_code, gloss_text, UNIQUE(word_id, language_code). NO provenance col.
- Distinct EN glosses: 28,264 → translate uniques once, fan back out.
- Top-500 distinct glosses cover 30,412 words = 39.3% of all words → review
  queue is high-leverage.
- Glosses are word-level fragments ("and not", "Indeed,", "those who") —
  context-light; MT quality risk, mitigated by the review pass.

## Decisions (locked via brainstorm)

- Source method: **MT + light review** (source='mt' default; 'mt-reviewed'
  after human pass).
- MT engine: **NllbMt** — NLLB-200 distilled-600M (`facebook/nllb-200-distilled-600M`)
  run locally via transformers+torch, as the one concrete impl behind a
  swappable `MtProvider` interface (SOLID, source-agnostic). Free, offline,
  no API key/creds. Target lang code `uzn_Latn`.
- Review surface: **file export/edit/import** round-trip CLI (no web UI).
- Provenance UI: **Credits page only** — no per-gloss marker. `source` col
  used only by scraper tools + as data provenance record.
- Missing-uz fallback: **fall back to EN** with an `en` hint at point of use.

## Architecture

### 1. Schema — provenance column (§12 approved)

Add `source TEXT` to `word_glosses`. Values: `corpus` (existing EN rows,
backfilled), `mt`, `mt-reviewed`. Additive migration, same pattern as
`roots.sort_order`:

- edit `packages/data/schema.sql` (shared DDL; Python scraper reads it too).
- ALTER canonical DB + backfill EN → `corpus`. `.bak` first, no concurrent
  scraper writer.
- `UNIQUE(word_id, language_code)` unchanged. No new index (source not queried
  hot). `runMigrations` (CREATE IF NOT EXISTS) does NOT ALTER existing tables —
  canonical DB patched directly; from-scratch builds get col via schema.sql.

### 2. MT generation (packages/scraper)

- `MtProvider` interface: `translate(batch: list[str]) -> list[str]` (target
  fixed to Uzbek Latin `uzn_Latn`). One concrete `NllbMt` — loads
  `facebook/nllb-200-distilled-600M` once, src=`eng_Latn`, tgt=`uzn_Latn`,
  batched generate. Deps: `transformers`, `torch` (CPU). Model auto-downloaded
  (~2.4GB) to HF cache on first run; no key.
- `translate-glosses` tool:
  1. read 28,264 DISTINCT EN glosses.
  2. batch → NllbMt → uz strings; build en→uz map.
  3. fan out: for all 77,429 words, insert `word_glosses` (language_code='uz',
     source='mt') via the map. Skip words already having a uz row (idempotent).
  4. checkpointed: resume by distinct-gloss cursor; `.bak` before write.
- Seed `languages` row for `uz` already present (verified).

### 3. Review round-trip (packages/scraper CLI, no UI)

- `glosses export --top N` → JSON array [{en, uz, occ}] sorted by occurrence
  desc (default N=500).
- human edits `uz` fields in the file.
- `glosses import <file>` → for each edited entry, UPDATE all uz rows whose
  source EN gloss matches, set gloss_text + source='mt-reviewed'. Idempotent,
  re-runnable. Only rows with a changed/confirmed uz flip to mt-reviewed.

### 4. Thin UI (apps/web)

- `words/page.tsx`: honor `?lang` (currently hardcodes 'en') — parity w/ reader.
- EN fallback: reader/words fetch uz glosses; for word_ids missing a uz row,
  fill gloss_text from the EN gloss and tag lang='en'. Gloss map becomes
  `Record<number,{text, lang}>` (was `Record<number,string>`). Popover / token
  render a subtle `en` hint when lang !== selected lang.
- About/Credits: add line — Uzbek word glosses are machine-assisted
  (NLLB-200), partially human-reviewed. (PRD §10 provenance surfacing.)

## Data flow

EN word_glosses → distinct → NllbMt (local) → uz strings → fan out to all words
(source='mt') → export top-N → human edit → import (source='mt-reviewed').
Web: `?lang=uz` → getGlossesBySurahAndLang → uz rows (+ EN fallback for gaps)
→ popover/detail/WbW.

## Testing

- data (vitest): getGlossesBySurahAndLang filters by lang; unchanged UI query
  still returns rows for uz.
- scraper (pytest): distinct→uz dedup + fan-out mapping correct; idempotent
  re-run inserts 0; export ordering by occurrence; import flips only edited to
  mt-reviewed; MtProvider interface honored (fake provider in test).
- web (vitest): words page respects lang; EN-fallback tag shows when uz missing;
  no fallback tag when uz present. About/Credits line present.

## Spike (2026-07-07) — 67 real glosses through NLLB

Validated MT quality before building. Findings:

- **Tail** (content words/phrases, low occurrence): ~70%+ usable —
  `and believes→va ishonadi`, `they invent→ular ixtiro qiladilar`,
  `earth→yer`, `written→yozma`. MT is worth running here.
- **Head** (top function words, highest occurrence): fails hard —
  `from`/`except`→**empty**, `of`→`(b)`, `in`→garbled, `on`→wrong,
  `Indeed,`→hallucinated. Worst output on the most frequent glosses. →
  hand-curate the head via the review round-trip (export is occurrence-ordered
  = the head). MT-all + review-head ≡ MT-tail + curate-head (same outcome).
- **Corpus notation** `[...]`/`(...)` mangles NLLB in both buckets. → strip
  before MT (`_normalize_for_mt`).
- **Empty MT output** is real/common. → never insert an empty uz gloss; skip
  so the word keeps its EN fallback.

Consequence: uz coverage is slightly below EN coverage by design (empty-MT
words fall back to EN); the review pass hand-fills the frequent ones.

## Risks / rollback

- Fragment MT quality → mitigated: review queue covers 39% of occurrences via
  top-500; swappable provider allows later re-run.
- New deps `transformers` + `torch` (CPU) + one-time ~2.4GB model download.
  No creds/key. CPU-only (2 cores, no GPU) → slow batch run → MUST be
  checkpointed/resumable; run unattended, not on the critical path.
- Canonical-DB migration → `.bak`, no concurrent scraper.
- Rollback: `DELETE FROM word_glosses WHERE language_code='uz'`; leave the
  nullable `source` column (harmless).

## Acceptance criteria

- schema.sql has `source` col; canonical DB EN rows backfilled 'corpus'
  (77,429), 0 nulls in EN.
- Words with an EN gloss get a uz row except where MT returned empty (those
  fall back to EN by design; hand-filled in review). No blank uz gloss anywhere.
  Spot-check: 'Allah'→uz sane; 'from' present as mt-reviewed after review.
- `?lang=uz` on a surah shows uz glosses; words missing uz fall back to EN with
  hint; no blank-where-en-exists.
- export→edit→import flips exactly the edited glosses to mt-reviewed; re-run
  idempotent.
- Credits page states machine-assisted UZ provenance.
- lint + type-check + all tests pass; Greptile 5/5.
