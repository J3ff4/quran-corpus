# WbW Grammar-Note Fix — Design

## Problem

List-view 3rd column's Arabic grammar line (`grammarArabic`) shows garbled,
wrong text compared to corpus.quran.com's compact "Syntax and morphology"
column. Example, بِسْمِ (P+N):

- Ours: `مجرور س م و جار ومجرور`
- Corpus compact column: `جار ومجرور`

## Root Cause

`words.grammar_arabic` is scraped from `wordmorphology.jsp` (the per-word
detail page) by joining **every** `<span class="at">` inside the description
prose sentence
(`packages/scraper/scraper/sources/dictionary_scrape.py:111`,
`" ".join(detail.grammar_arabic)`). That sentence embeds 3+ unrelated
annotations under the same CSS class:

- the case marker (`مجرور`)
- the root spelled out letter-by-letter (`س م و`)
- the actual relation term (`جار ومجرور`)
- sometimes a stray `إعراب` — a link label / page chrome, not sentence
  content

All of these get concatenated into one string. This field is legitimately
used elsewhere (word-detail's "Full analysis" collapsible, verbatim
scraped prose) and should **not** be changed for that purpose.

The correct source for the compact per-word grammar note is a completely
different element: a dedicated `<div class="arabicGrammar">` on
`wordbyword.jsp` (the per-**verse** page already scraped today for POS
codes, transliteration, and English gloss via
`packages/scraper/scraper/sources/corpus_parser.py`'s `parse_verse_words`).
This div is not currently captured at all.

Verified via a live spike (7 sample words, surah 9, covering
CONJ+V+PRON, single V, ACC+PRON, single PRO, REM+PN, single PN patterns):
the real `arabicGrammar` div content is:

- Often **multi-line** — one clause per `<br/>`, roughly one per
  segment-group. Example (وَقَالُوا۟, 9:59:8):
  ```html
  <div class="arabicGrammar">الواو عاطفة<br/>فعل ماض والواو ضمير متصل في محل رفع فاعل</div>
  ```
- Sometimes a full explanatory sentence, not a short tag. Example
  (جَهَنَّمَ, 9:35:6):
  `اسم علم مجرور بالفتحة بدلاً من الكسرة لأنه ممنوع من الصرف`
- Structurally clean across all 7 samples + all 3 existing word-detail
  fixtures checked: only bare text nodes and `<br>` tags, no nested `<a>`/
  `<i>`/etc. inside the div.

## Approach

Add a new field sourced from the correct element; leave the old field and
its consumer untouched.

### 1. Scraper — capture the real field

`packages/scraper/scraper/sources/corpus_parser.py`:

- `ParsedWord` gains `grammar_note: str | None`.
- `parse_verse_words`: within the existing `col3` cell lookup (where
  `pos_codes` are already extracted from `<b>` tags), find
  `col3.find("div", class_="arabicGrammar")`. If present, split its
  contents on `<br>`/`<br/>` boundaries (iterate `.contents`, treating each
  `Tag` named `br` as a separator and each `NavigableString` as clause
  text), `strip()` each clause, drop empties, join surviving clauses with
  `"\n"`. If the div is absent (e.g. possibly on INL/muqaṭṭaʿāt-only
  verses — confirm during implementation), `grammar_note` is `None`.

### 2. Schema — new column, old one untouched

- `packages/data/schema.sql`: add `grammar_note TEXT,` to the `words`
  `CREATE TABLE` clause (alongside `grammar_arabic`).
- `packages/scraper/scraper/db.py`: add `"grammar_note"` to the
  `_migrate_add_word_columns()` tuple (self-healing `ALTER TABLE ADD
  COLUMN` for legacy DBs — the same mechanism already used for
  `grammar_arabic`/`audio_url`/etc.).
- `packages/scraper/scraper/models.py`: `WordModel` gains
  `grammar_note: str | None = None`.
- `packages/scraper/scraper/db.py` `upsert_word`: add `grammar_note` to
  the INSERT column list and `ON CONFLICT ... DO UPDATE SET` clause,
  `COALESCE(excluded.grammar_note, words.grammar_note)` — same pattern as
  sibling optional fields.
- `packages/data/src/types.ts`: `Word` interface gains
  `grammar_note: string | null;`.
- `packages/data/src/queries/words.ts`: `rowToWord` adds
  `grammar_note: strip(row['grammar_note'] as string | null),` (same
  `stripQuranicAnnotations` pass as `grammar_arabic`/`lemma`/`form_arabic`
  for consistency — the field is plain Arabic text, expected to be a
  no-op, but keeps the normalization uniform across text columns).
- `grammar_arabic` (column, model field, SQL, query mapping) is **not**
  touched anywhere.

### 3. Backfill — reuse the existing scrape pipeline

No new CLI command or script. `packages/scraper/scraper/cli.py`'s existing
`scrape` command already walks every chapter's `wordbyword.jsp` pages via
`scrape_chapter` → `parse_verse_words` → `upsert_word`. Since `upsert_word`
now also persists `grammar_note`, re-running that same command with a
**fresh, dedicated checkpoint file** backfills every word:

```bash
poetry run scraper scrape --db quran.db \
  --checkpoint grammar_backfill_checkpoint.json --rate-limit 1.5
```

- No `--force` needed: a new checkpoint file starts with no chapters
  marked done, so all 114 are re-scraped under normal resumable behavior.
- Resumable for free: if interrupted, re-running the identical command
  skips chapters this checkpoint has already marked done — no risk of
  restarting from scratch (unlike reusing `--force`, which unconditionally
  clears+redoes every chapter on every invocation).
- Respects existing rate limit (1.5s/req, ~114 chapters × several pages
  each — order of an hour, not the ~32 hours a per-word re-scrape would
  cost).
- All other fields `upsert_word` writes (`transliteration`, `pos_tag`,
  `morphology_json`, English gloss) are re-written with identical values
  (COALESCE'd against existing data) — harmless no-ops.

### 4. Web app

- `apps/web/src/components/wbw/types.ts`: `WbwCell.grammarArabic` renamed
  to `grammarNote: string | null`.
- `apps/web/src/app/surah/[id]/words/page.tsx`: cell construction changes
  `grammarArabic: w.grammar_arabic,` → `grammarNote: w.grammar_note,`.
- `apps/web/src/components/wbw/WbwWordRow.tsx`: destructures
  `grammarNote` instead of `grammarArabic`; splits on `\n` and renders
  **one line per clause** (each own `<div dir="rtl" className="font-arabic ...">`)
  stacked below the per-segment POS/label rows, instead of the current
  single `<div>`. Empty/null → single `—` fallback line (unchanged
  fallback behavior, just on the renamed field).
- `apps/web/src/components/wbw/WbwWordCell.tsx` (card view): does not
  reference this field today and is not touched.
- `apps/web/src/components/morphology/WordDetailView.tsx` /
  `FullAnalysis.tsx`: continue reading `word.grammar_arabic` directly
  (unrelated to `WbwCell`) — **not** touched.

### 5. Tests

- `packages/scraper/tests/test_corpus_parser.py` (or wherever
  `parse_verse_words` is tested): new fixtures/cases for
  `arabicGrammar` extraction — single-clause, multi-clause (`<br/>`
  split), and no-div-present.
- `packages/data/tests/words.test.ts`: `rowToWord` mapping covers
  `grammar_note`.
- `apps/web/src/test/WbwWordRow.test.tsx`: rename fixture field; add a
  multi-clause case asserting each clause renders as a separate line.
- `apps/web/src/test/WbwWordCell.test.tsx`,
  `WbwAyahBlock.test.tsx`, `WbwAyahListBlock.test.tsx`,
  `WbwAyahs.test.tsx`, `WbwView.test.tsx`: rename the field in their
  inline `WbwCell` fixtures (no assertions depend on its content in these
  files, per the same pattern as the prior `posTag` field addition).

## Out of Scope

- Re-scraping/fixing `grammar_arabic` or the word-detail "Full analysis"
  panel — that field is correct for its own purpose and untouched.
- Any change to `morphology_description`, segments, roots, or glosses.
- A dedicated backfill CLI command — the existing `scrape` command with a
  fresh checkpoint file covers it.

## Risks / Open Items for Implementation

- Confirm whether `arabicGrammar` div is present on INL (Quranic
  initials, e.g. الٓمٓ) word pages — if absent, `grammar_note` is simply
  `None` for those words (same graceful-absence handling as any other
  optional field).
- The full backfill re-scrape takes real wall-clock time (~114 chapters
  at 1.5s/req plus pagination) — should be kicked off as a background/
  long-running task, not run synchronously inline.
