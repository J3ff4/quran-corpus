# Phase 08e — Word-page structured grammar (design)

Sub-phase E of Phase 08 UI overhaul. Redesign `/word/[surah]/[ayah]/[position]`
to present morphology as decoded, structured grammar cards instead of raw
codes + verbatim prose.

## Problem

Word page (built 06b) already surfaces the scraped data, but raw/ugly:
- `SegmentCard` shows raw POS codes (`N`, `PRON`, `P`…) + `key: value` feature
  chips.
- `MorphologySummary` dumps `morphology_description` (English prose) +
  `grammar_arabic` (Arabic iʿrab) as plain `<p>`.

Data is present in DB (word-details scrape done): `word_segments`
(pos_tag, segment_type, features_json, root, lemma), `words.morphology_description`,
`words.grammar_arabic`. Nothing to re-scrape. E = presentation only.

## Tagset (from DB, `word_segments`)

- `segment_type`: `stem` · `prefix` · `suffix`.
- `pos_tag`: **44 distinct** Quranic Arabic Corpus codes. By freq: N, PRON, V,
  P, CONJ, DET, PN, REL, REM, NEG, ACC, ADJ, EMPH, T, DEM, COND, INTG, SUB, LOC,
  RES, CERT, VOC, RSLT, PRO, PRP, CIRC, SUP, PREV, FUT, RET, EXP, INC, CAUS,
  IMPV, EXL, AMD, INT, EXH, ANS, SUR, AVR, INL, EQ, COM, IMPN.
- `features_json`: object with keys
  - `case`: genitive · accusative · nominative
  - `gender`: masculine · feminine
  - `raw`: list of remaining Buckwalter feature tags — person·gender·number
    (`3MS`,`3MP`,`MS`,`MP`,`FS`…), aspect (`PERF`,`IMPF`,`IMPV`), voice
    (`ACT`,`PASS`), mood (`IND`,`SUBJ`,`JUS`), verb form (`I`…`X`), state
    (`INDEF`), etc.

## Decisions

- **Depth:** full decode → rich cards (user-chosen). Codes → human labels;
  scraped English prose becomes supporting context, not primary.
- **Decode home:** `packages/data` (portable, Next-free per governance §2;
  reused by reader popover + future mobile per DRY §3). Default — confirm at
  review gate.
- **Scraped prose:** secondary/collapsible. Decoded cards primary; verbatim
  `morphology_description` + `grammar_arabic` live in a "Full analysis"
  collapsible. Also the graceful display for function words with no segments.
  Default — confirm at review gate.

## Architecture

New portable decode module in `packages/data`; web renders. No web/Next imports
in data.

### packages/data/src/morphology/ (new)

`tags.ts` — static reference tables:
- `POS_LABELS: Record<string, { en: string; ar?: string }>` — every one of the
  44 codes → readable English label + optional Arabic term.
- `FEATURE_LABELS: Record<string, string>` — `raw`-list tags → labels
  (person/gender/number combos, aspect, voice, mood, verb form, INDEF…).
- `CASE_LABELS`, `GENDER_LABELS` — normalize/Arabic-annotate the already-worded
  `case`/`gender` values.
- Labels sourced from corpus.quran.com/documentation. Low-freq/obscure codes
  MUST be verified against that doc during impl; any unmapped code degrades to
  showing the raw code (never crash, never hide).

`decode.ts`:
```
interface DecodedFeature { key: string; label: string; value: string }
interface DecodedSegment {
  role: 'prefix' | 'stem' | 'suffix';
  pos: { code: string; en: string; ar?: string };
  features: DecodedFeature[];
  rootArabic?: string;
  lemma?: string;
  unknownTags: string[];   // raw tags with no label — shown verbatim
}
function decodeSegment(segment: WordSegment): DecodedSegment
```
- Pure, deterministic. Parses `features_json` (tolerant: bad JSON → no features).
- `case`/`gender` → `features`; each `raw` tag → `FEATURE_LABELS` else pushed to
  `unknownTags`.
- `root` (Buckwalter) → `rootArabic` via existing `buckwalterToArabic`.

Types (`DecodedSegment`, `DecodedFeature`) in `types.ts`; export from `index.ts`.

### apps/web

- `SegmentCard` rewritten to consume `decodeSegment(segment)`:
  - header: `role` + POS label (English + Arabic chip)
  - feature rows: labeled pairs (Case, Gender, Number, Person, Aspect, Voice,
    Mood, State…)
  - root (Arabic) + lemma
  - `unknownTags` → small raw chips (graceful fallback)
- `WordDetailView`: decoded segment cards = primary section. New `FullAnalysis`
  collapsible component (Framer Motion height spring; `prefers-reduced-motion`
  → instant) holding `morphology_description` + RTL `grammar_arabic`.
- `MorphologySummary` trimmed to header role (translit, gloss, POS/root/lemma
  chips); prose + Arabic label move into `FullAnalysis`. Reader popover keeps
  using the trimmed summary (still DRY).
- Decode runs server-side in the RSC (pure) → client stays lean.

## Data flow

`getWordDetail` (word + segments + concept_tags) — **unchanged** →
page (RSC) `decodeSegment` per segment → `SegmentCard`. No schema/query change.

## Edge / error handling

- No segments (function words): render summary + `FullAnalysis` prose only; omit
  empty Segments section.
- Unknown POS/feature code: raw code shown (via `unknownTags` / label fallback);
  no crash.
- `features_json` null / malformed: no feature rows.
- `morphology_description` / `grammar_arabic` null: `FullAnalysis` hidden (or its
  missing row omitted).

## Testing

- `packages/data` `decode.test.ts`: prefix/stem/suffix roles; case+gender+raw
  combos → correct labels; unknown tag → `unknownTags`; empty/malformed
  features → no rows; root → Arabic. Coverage check: every one of the 44 seen
  POS codes resolves to a non-empty label.
- `apps/web`: `SegmentCard` (decoded labels render; unknown fallback chip),
  `FullAnalysis` (collapsible toggles; reduced-motion path), `WordDetailView`
  (segments present vs absent).

## Out of scope

- Concept tags (`concept_tags` = 0; parser stub — separate task if wanted).
- Any scraper / schema / query change.
- Reader popover redesign (only inherits the trimmed `MorphologySummary`).

## Boundaries / governance

- `packages/data` stays Next-free (§2). No duplicated decode logic in web (§3).
- Motion 60fps, `prefers-reduced-motion` respected; WCAG AA (§8).
- Greptile 5/5 gate per task (§5).
