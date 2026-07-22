# WbW Segment Color-Coding — Design

**Trigger:** User compared corpus.quran.com word-by-word screenshots to our WbW page (`/surah/[id]/words`). Corpus colors each morphological segment of a word (prefix/stem/suffix) individually and prints a short code (P/N/PN/ADJ/V...) beneath each segment, in that segment's color. Ours currently shows the whole Arabic word in one flat color with a single full-word POS chip below (e.g. "Noun"). Individual word-detail page (`/word/[surah]/[ayah]/[position]`) already does per-segment coloring correctly via `SegmentedWord` (SVG) — out of scope, confirmed correct as-is.

## Goal

Bring per-segment color-coding + short morphology codes to the WbW page, in both its view modes (card grid and list/table), reusing the existing `posColor()` mapping so colors stay consistent with the word-detail page.

## Current State (confirmed by reading code)

- `apps/web/src/components/wbw/WbwWordCell.tsx` (card view) and `WbwWordRow.tsx` (list view/table) both render the whole word as one `<span>` in a flat color, with a single gray `chip` showing `posLabel` (full English word, e.g. "Noun").
- `apps/web/src/lib/posColor.ts` — `posColor(posTag: string | null): string`, maps POS tag → `var(--pos-*)` CSS custom property. Grouping: N/PN/ADJ → noun color, V → verb, P → prep, PRON → pronoun, else other.
- `apps/web/src/components/morphology/SegmentedWord.tsx` — SVG component, already renders per-segment colored Arabic + colored short code beneath, used only on the word-detail page. Not reused here (SVG unwieldy to repeat per-cell in a long table/grid — user confirmed a lighter non-SVG "pill" treatment instead, still using `posColor`).
- Segment data (`word_segments` table) is currently only fetched per single word via `getWordDetail(db, wordId)` in `packages/data/src/queries/words.ts`. The WbW page fetches words in bulk (`getWordsBySurahAyahRange`) with no batched segment fetch — would be N+1 if reused as-is.
- `WbwCell` type (`components/wbw/types.ts`) has no `segments` field today.

## Changes

### 1. Data layer (`packages/data`)

Add `getSegmentsByWordIds(db: Client, wordIds: number[]): Promise<WordSegment[]>` to `packages/data/src/queries/words.ts`, reusing the existing `rowToSegment` mapper:

```ts
export async function getSegmentsByWordIds(
  db: Client,
  wordIds: number[],
): Promise<WordSegment[]> {
  if (wordIds.length === 0) return [];
  const placeholders = wordIds.map(() => '?').join(',');
  const result = await db.execute({
    sql: `SELECT * FROM word_segments WHERE word_id IN (${placeholders}) ORDER BY word_id, segment_index`,
    args: wordIds,
  });
  return result.rows.map(rowToSegment);
}
```

Export from `packages/data/src/index.ts` alongside the other word queries.

Empty-array guard: `db.execute` with a `IN ()` (zero placeholders) is invalid SQL — short-circuit before building the query.

### 2. WbW page wiring (`apps/web/src/app/surah/[id]/words/page.tsx`)

After `words` is fetched, add `getSegmentsByWordIds(db, words.map(w => w.id))` into the existing `Promise.all`. Group results into `Map<number, WordSegment[]>` keyed by `word_id` (mirrors the existing `glossByWordId` pattern in the same file). Attach `segments: segmentsByWordId.get(w.id) ?? []` when building each `WbwCell`.

### 3. `WbwCell` type (`components/wbw/types.ts`)

Add `segments: WordSegment[]` (import `WordSegment` from `@quran-corpus/data`).

### 4. Shared `SegmentPills` component (new)

`apps/web/src/components/morphology/SegmentPills.tsx` — sits next to `SegmentedWord.tsx` (shared home for segment-rendering components, not duplicated per-view).

- Props: `{ segments: WordSegment[]; fallbackWord: string }`.
- If `segments.length === 0`: render `fallbackWord` as a single flat-colored span (today's behavior) — no crash, no empty layout.
- Else: RTL flex row, one wrapper per segment in segment order (segments are already stored prefix→stem→suffix / left-to-right logical order matching `SegmentedWord`'s existing consumption — reuse the same order, no re-sorting logic duplicated). Each wrapper:
  - Arabic form (`seg.form_arabic`) in `posColor(seg.pos_tag)`.
  - Short code (`seg.pos_tag`) beneath, same color, smaller text.
  - Faint tinted background (`posColor` at low opacity, e.g. `color-mix` or an rgba via the existing CSS custom property) giving the "pill" look — this is the one new visual token; reuse the `--pos-*` custom properties already defined for `posColor`, don't invent new ones.
- Plain HTML/CSS, not SVG (per user's explicit choice — repeats many times per page, SVG-per-cell was rejected as heavier than needed).

### 5. Wire into both views

- `WbwWordCell.tsx` (card): replace the flat Arabic `<span>` + `chip`/`posLabel` block with `<SegmentPills segments={cell.segments} fallbackWord={cell.arabic} />`.
- `WbwWordRow.tsx` (list): same swap in the Arabic-word `<td>`, keeping the existing `Link` wrapper (whole word still links to `/word/[surah]/[ayah]/[position]`) and `trailingMark` (sajdah mark) behavior unchanged.
- `posLabel` prop/field on `WbwCell` becomes unused by these two components once segments render their own codes — **do not delete `posLabel` from the type** in this change (other consumers may exist; a repo-wide unused-code sweep is out of scope here). Confirm at implementation time whether any other file reads `WbwCell.posLabel`; if none, flag as a MINOR for final review rather than deleting mid-task.

### 6. Untouched

- Word-detail page + `SegmentedWord.tsx` (SVG) — confirmed correct, no changes.
- `posColor.ts` — reused as-is, no new mapping logic.
- Data schema — no migration, `word_segments` table already exists and is populated (used today by `getWordDetail`).

## Testing

- `packages/data`: unit test for `getSegmentsByWordIds` — batches correctly across multiple word ids, preserves `segment_index` order within each word, empty-array input returns `[]` without querying.
- `apps/web`: component test for `SegmentPills` — segment colors match `posColor(seg.pos_tag)` for each segment, empty-segments input falls back to the flat single-color word with no thrown error.
- Existing WbW tests (`WbwWordCell`/`WbwWordRow` / page-level) updated for the new `segments` field on fixtures — a required test-only ripple, not new coverage.

## Risks / Rollback

- Visual density: a table row with 2-4 tiny colored pills per word (times ~10-15 words per ayah, times up to 15 ayahs per page) could look busy on mobile. Mitigate at implementation time with existing spacing/sizing tokens; no new design system needed. If it reads as cluttered, rollback is a single-component revert (`SegmentPills` swap back to flat span) since the data layer addition is additive and harmless to leave in place.
- No schema change, no data migration — rollback is pure code revert if needed.

## Out of Scope

- Word-detail page redesign (user confirmed current page already matches corpus screenshot 2 - "we do have color coding and full analysis in individual words").
- Column 3 ("Syntax and morphology" — `morphology_description` + `grammar_arabic`) already matches corpus layout; no change requested or needed there.
