# Concordance Derived-Form Tagging + Filter Design

**Goal:** On the root/dictionary page (`/dictionary/[root]`), tag each concordance
row with its derived form and let the existing "Derived forms" list double as an
optional filter — without losing the concordance's chronological (verse-order)
default, and without copying corpus.quran.com's static grouped-wall pattern.

**Architecture:** Extend the existing concordance query to join each occurrence to
its derived form via an exact lemma-text match (`word_segments.lemma` =
`root_forms.form_arabic`) — no schema migration or backfill needed, this is a
query-time join over data that already exists. Surface the match as a small
colored tag per row. Promote the static "Derived forms" list into tappable,
multi-select filter chips that narrow the same list via a new query param on the
existing paging API.

**Tech Stack:** Next.js App Router (existing `apps/web`), `@quran-corpus/data`
query layer, libSQL — no new dependencies.

## Global Constraints

- No schema migration, no scraper backfill — the join is derivable from existing
  columns (verified below). If a future spike (Task 1) finds real gaps, the
  fallback is "no tag, included in All, excluded from every specific filter" —
  never drop an occurrence from the list.
- Existing 3 call sites of `getRootConcordancePage` / `countRootConcordance`
  (`apps/web/src/app/dictionary/[root]/page.tsx`,
  `apps/web/src/app/api/roots/[root]/concordance/route.ts`) must keep working
  unfiltered with no code change required at those call sites beyond passing the
  new optional param when present — new params are optional, default preserves
  today's behavior exactly.
- Mobile-first (CLAUDE.md §8): chip row must wrap (`flex-wrap`), never rely on
  horizontal scroll — confirmed max derived-forms-per-root is 22 (avg ~4.2), a
  tab strip or single-row layout would not scale to that.
- 60fps, honor `prefers-reduced-motion` for chip select/deselect transitions
  (Emil Kowalski skill per CLAUDE.md §8).
- WCAG AA: chips are real `<button>` elements with `aria-pressed`, not `<div
  onClick>`; color is never the only signal (each tag/chip also carries text).

## Background: Why This Design (Spike Findings)

Explored `packages/data/src/queries/roots.ts` and the schema
(`packages/data/schema.sql`) first. Findings:

1. **No FK exists today.** `root_forms` (id, root_id, pos_label, form_arabic,
   form_translit, gloss, occurrence_count) is populated by an independent
   scrape (corpus.quran.com's per-root dictionary page) with no reference to
   `word_segments` or `words`. `word_segments` (per-occurrence, GPL-morphology-
   sourced) has no `root_form_id` column either. Today's concordance rows
   (`ConcordanceEntry`) carry no derived-form information at all.

2. **But the join is derivable, and reliable.** Spot-checked two roots directly
   against the live DB (`/home/claude/quran-data/quran.db`):

   - **غفر (272)**: 9 `root_forms` rows, counts 65/40/5/1/91/28/2/1/1. Grouping
     `word_segments` by `(lemma, root='gfr')` and matching lemma text to
     `root_forms.form_arabic` reproduces every count exactly — including the
     91-count "Nominal" bucket, which is actually a 29 (ADJ) + 62 (N) split of
     the *same* lemma text (`غَفُور`) that `root_forms` already merged by text,
     not by POS tag. Same for a 5-count bucket (3 ADJ + 2 N of `غَفَّار`).
   - **رحم (447)**: 9 forms, total 339. Lemma-grouping matches 339/339, every
     one of the 9 forms exact, zero unmatched lemma groups.

   Conclusion: **`word_segments.lemma` = `root_forms.form_arabic`, exact text
   match, is the join key.** `root_forms` already aggregates by lemma text
   regardless of the finer POS-tag variation `word_segments` carries — so the
   join is not just possible, it's *consistent with how `root_forms` itself was
   already built*.

3. **Scale:** average 4.2 derived forms per root, max 22 (root_id 438). 47
   distinct `pos_label` strings exist DB-wide (e.g. "Form IV verb", "Form II
   passive participle", "Time adverb", "Conditional particle" — full list
   queried and enumerated in Task 2's test). Far too many for one distinct
   color each (would be as unreadable as the earlier wbw all-tags-colored
   problem this project already walked back from) — colors must key off a
   coarse category bucket (verb / verbal noun / active participle / passive
   participle / noun / adjective-nominal / other), not the raw label.

4. **Not yet validated at DB-wide scale.** Two roots is a spike, not a proof for
   all 1,642 roots. Per this project's standing rule (validate by alignment,
   not count — see memory `validate-data-by-alignment-not-count`), **Task 1
   below is a mandatory pre-implementation spike**: run the same
   lemma-grouping match against every root and quantify (a) how many roots have
   zero mismatch (expect: the vast majority) and (b) what the unmatched-lemma
   rate looks like where it isn't zero. This number decides nothing about
   whether to proceed (the fallback design already handles unmatched rows
   gracefully) but it must be known and logged before shipping, not discovered
   by a user screenshot later.

## Design

### 1. Data layer (`packages/data`)

**`ConcordanceEntry` gains one field** (`packages/data/src/types.ts`):

```ts
export interface ConcordanceEntry {
  surah_id: number;
  ayah_number: number;
  position: number;
  word_id: number;
  text_arabic: string;
  transliteration: string | null;
  gloss: string | null;
  verse_words: VerseWord[];
  /** The derived form (root_forms.id) this occurrence's lemma matches, via
   *  exact lemma-text join -- null when no root_forms row has a matching
   *  form_arabic (data gap; occurrence still shows, just untagged/unfiltered). */
  form_id: number | null;
}
```

**`getRootConcordancePage` joins `word_segments` + `root_forms`** by lemma text,
scoped to the resolved root id (not just the Buckwalter root string, to keep the
`root_forms` join scoped to this root's own forms only):

```sql
SELECT a.surah_id, a.ayah_number, w.position, w.id AS word_id,
       w.ayah_id AS ayah_id, w.text_arabic, w.transliteration,
       g.gloss_text AS gloss, rf.id AS form_id
FROM (
  -- one row per word: MIN(segment_index) picks a deterministic segment for
  -- the rare double-stem compound where two segments both carry this root
  SELECT word_id, MIN(segment_index) AS seg_idx
  FROM word_segments WHERE root = ?
  GROUP BY word_id
) m
JOIN word_segments ws ON ws.word_id = m.word_id AND ws.segment_index = m.seg_idx
JOIN words w ON w.id = m.word_id
JOIN ayahs a ON a.id = w.ayah_id
LEFT JOIN word_glosses g ON g.word_id = w.id AND g.language_code = ?
LEFT JOIN root_forms rf ON rf.root_id = ? AND rf.form_arabic = ws.lemma
ORDER BY a.surah_id, a.ayah_number, w.position
```

- New required param: the root's numeric id (already resolvable via
  `getRootByBuckwalter` -- callers that only have `bw` fetch it once and pass
  both, same pattern `getRootEntry` already uses).
- New optional param on `ConcordancePageOpts`: `formIds?: number[]`. When
  present, add `AND rf.id IN (...)` to the outer query (or filter the `m`
  CTE) and the paging total must reflect the same filter.
- `countRootConcordance` gets the same `formIds?: number[]` optional param and
  the same join, `SELECT COUNT(*)` instead of the full row set.
- Both keep working with zero behavior change when `formIds` is omitted --
  existing 3 call sites need no change beyond eventually threading the new
  param through when they want to support filtering (Task 4).

### 2. Form-category color (`apps/web/src/lib`)

New pure function, sibling to the existing `posColor` but a **separate**
function (different taxonomy -- dictionary derived-forms, not sentence-position
POS tags -- conflating them would be confusing even though the visual language
stays consistent):

```ts
// apps/web/src/lib/formCategoryColor.ts
export type FormCategory =
  | 'verb' | 'verbal-noun' | 'active-participle' | 'passive-participle'
  | 'noun' | 'adjective' | 'other';

export function categorizeFormLabel(posLabel: string): FormCategory {
  const s = posLabel.toLowerCase();
  if (s.includes('verbal noun')) return 'verbal-noun';
  if (s.includes('active participle')) return 'active-participle';
  if (s.includes('passive participle')) return 'passive-participle';
  if (s.includes('verb')) return 'verb';
  if (s.includes('adjective') || s === 'nominal') return 'adjective';
  if (s.includes('noun') || s.includes('adverb')) return 'noun';
  return 'other';
}

export function formCategoryColor(category: FormCategory): string {
  switch (category) {
    case 'verb': return 'var(--form-verb)';
    case 'verbal-noun': return 'var(--form-verbal-noun)';
    case 'active-participle': return 'var(--form-active-participle)';
    case 'passive-participle': return 'var(--form-passive-participle)';
    case 'noun': return 'var(--form-noun)';
    case 'adjective': return 'var(--form-adjective)';
    case 'other': return 'var(--form-other)';
  }
}
```

7 new `--form-*` CSS custom properties in `globals.css` (light + dark, same
pattern as the existing `--pos-*` set) -- 7 colors, not 47, kept visually
distinguishable.

Task 2's test enumerates the **full 47-value list** queried from the live DB
(pasted verbatim into the test) and asserts every one resolves to a category
other than a silent crash -- `'other'` is an acceptable bucket for the 4
one-off labels ("Time adverb", "Form of address", "Conditional particle",
etc.), not a bug, but the test must see all 47 by name so a *new* label added
by a future scrape doesn't silently vanish into 'other' unnoticed (test fails
closed: any label not in the pasted list is flagged for a human to
categorize).

### 3. UI components

**`ConcordanceList.tsx`** (`apps/web/src/components/dictionary/`): each row
gets a small tag next to the verse-ref, shown only when `entry.form_id` isn't
null:

```tsx
{form && (() => {
  const color = formCategoryColor(categorizeFormLabel(form.pos_label));
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}
    >
      {form.form_translit}
    </span>
  );
})()}
```

where `form` is looked up from a `Map<number, RootForm>` built once from the
`forms` prop (passed down alongside `initialEntries`/`total`/`rootBw`).

**New `FormFilterChips.tsx`** (`apps/web/src/components/dictionary/`) replaces
the current static `forms.map(f => <FormGroup form={f} />)` rendering in
`RootEntry.tsx`. Same visual content per chip as today's `FormGroup` row
(pos_label, form_arabic, form_translit, gloss, count) but as a `<button
aria-pressed={selected}>` in a `flex flex-wrap` container, colored via
`formCategoryColor(categorizeFormLabel(form.pos_label))` when selected
(subtle ring/background), neutral when not. No selection = "All" (shows
everything, matches today's default exactly).

**New `ConcordanceSection.tsx`** (`apps/web/src/components/dictionary/`,
client component) becomes the single stateful parent that:
- Owns `selectedFormIds: Set<number>` (empty = "All").
- Renders `FormFilterChips` (passing `forms`, `selectedFormIds`, and the
  toggle handler).
- Renders `ConcordanceList` (passing `forms` for the tag lookup, plus
  `selectedFormIds` so it can build the filtered fetch URL and reset
  paging to offset 0 whenever the filter set changes).

`RootEntry.tsx` changes from two sibling sections (static forms list +
concordance) to one `<ConcordanceSection forms={forms} initialConcordance={...}
total={...} rootBw={...} />`. `FormGroup.tsx` is deleted (fully superseded by
`FormFilterChips`, not kept as unused dead code per CLAUDE.md's DRY rule).

**`ConcordanceList.tsx` fetch URL** gains `&forms=<id1>,<id2>,...` when
`selectedFormIds` is non-empty; changing the filter resets `entries` to `[]`
and refetches from offset 0 (same reset-on-param-change pattern, not a new
one).

### 4. API route

`apps/web/src/app/api/roots/[root]/concordance/route.ts` gains a `forms` query
param: comma-separated positive integers, parsed and validated (reject
non-numeric junk the same way `clampInt` already guards `limit`/`offset` --
invalid ids are silently dropped from the filter set rather than erroring,
since a stale/bad id should degrade to "less filtered" not "500").

### 5. Error handling / edge cases

- **Unmatched lemma (`form_id: null`)**: row still renders, no tag, never
  matches any specific filter chip, always shows under "All" (no selection).
  Never dropped.
- **Double-stem compounds** (word has 2 segments both carrying this root, ~486
  words project-wide per the pos_tag fix's earlier data spike): deterministic
  `MIN(segment_index)` pick, same resolution strategy as the `words.pos_tag`
  fix (PR #46) for consistency.
- **Filtering to a selection with zero matches** (shouldn't happen given chips
  are only shown for forms that exist, but a stale/manipulated `forms` query
  param could hit it): `ConcordanceList` already has an empty-state branch
  ("No occurrences.") -- reused as-is.
- **A root with 0 derived forms** (`forms.length === 0`): `FormFilterChips`
  renders nothing, `ConcordanceList` behaves exactly as it does today
  (unfiltered, no tags rendered since there's nothing to look up).

### 6. Testing

- `packages/data`: new tests for the lemma-join behavior in
  `getRootConcordancePage`/`countRootConcordance` (seed a root with 2+ forms
  sharing a lemma-but-different-pos_tag case like `غفر`'s `غفور`, assert
  `form_id` matches; seed an unmatched lemma, assert `form_id: null` and the
  row still returns; seed `formIds` filtering, assert only matching rows
  return and the count matches).
- `apps/web`: `categorizeFormLabel` test enumerating all 47 live labels (Task
  2). `FormFilterChips` tests: toggle selection, `aria-pressed`, multi-select
  (two chips both selected), "All" (nothing selected) shows unfiltered.
  `ConcordanceList` tests: renders the tag when `form_id` matches a passed
  `forms` entry, omits it when null, refetches from offset 0 when the
  selected-forms set changes.
- Manual/live verification against the dev server for غفر and رحم (the two
  spike roots) plus one root with a high form count (root_id 438, 22 forms) to
  confirm the chip row wraps cleanly on a narrow mobile viewport.

## Task Sequencing (for the implementation plan)

1. **Spike**: run the lemma-grouping match across all 1,642 roots, log the
   mismatch rate. Informational -- does not block Task 2+ regardless of the
   number, but must be recorded (STATUS.md) before shipping.
2. `categorizeFormLabel` + `formCategoryColor` + CSS vars + enumeration test.
3. Data layer: `form_id` on `ConcordanceEntry`, joined query, `formIds` filter
   param, tests.
4. API route: `forms` query param.
5. UI: `FormFilterChips` (replaces `FormGroup`), `ConcordanceSection` (new
   stateful parent), `ConcordanceList` tag rendering + filtered refetch,
   `RootEntry` wiring.
6. Manual verification (غفر, رحم, root_id 438) + full suite + lint + tsc +
   Greptile.
