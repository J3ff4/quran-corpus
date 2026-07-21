# Sajdah (Prostration) Mark — Design

## Problem

15 ayahs in the Quran are verses of prostration (sajdah tilawah) — reciting
or hearing them obligates a physical prostration. Mushafs mark these ayahs
with a symbol (traditionally `۩`, U+06E9 ARABIC PLACE OF SAJDAH). The app
has no such marker anywhere — a reader has no way to know an ayah is a
sajdah ayah.

## Scheme

Standard 15-ayah list (Shafi'i/Hanbali convention — includes both Hajj
sajdahs and Sad's):

7:206, 13:15, 16:50, 17:109, 19:58, 22:18, 22:77, 25:60, 27:26, 32:15,
38:24, 41:38, 53:62, 84:21, 96:19

## Key finding: data already exists

`ayahs.text_uthmani` (Tanzil-sourced) already embeds the `۩` character
inline for exactly these 15 ayahs and no others — verified directly against
the live DB, including the two numbering traps (An-Naml is 27:26, not
27:25; Fussilat is 41:38, not 41:37).

The gap is downstream: `AyahView.tsx` (reader) and the WbW views render
**per-word tokens** from the `words` table, not the raw `ayahs.text_uthmani`
string. `words.text_arabic` has no row for `۩` — word-splitting during
import dropped it as a standalone token. So today the mark is silently lost
on every path except the rare `cells.length === 0` / `words.length === 0`
raw-text fallback.

**Decision:** no schema change, no hand-authored list. Derive sajdah-ness
at render time from the ayah-level text that's already fetched:
`isSajdahAyah(ayah.text_uthmani)`. Single source of truth (the DB), zero new
data surface, can't drift out of sync with a re-import — as long as the
Uthmani source text continues to encode the mark (true for Tanzil; noted as
a ceiling, not solved defensively).

## Data layer

New file `packages/data/src/text/sajdah.ts` (same shape as the existing
`text/arabic.ts` / `text/concordanceTrim.ts` pure-function modules):

```ts
export function isSajdahAyah(textUthmani: string): boolean {
  return textUthmani.includes('۩');
}
```

Exported from `packages/data/src/index.ts` alongside the other `text/*`
exports.

## Component

One shared ornament, `apps/web/src/components/reader/ornaments/SajdahMark.tsx`,
styled like the existing `AyahMedallion` (theme-token colors, `role="img"`
+ `aria-label`, no raw unlabeled glyph):

```tsx
export function SajdahMark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Verse of Prostration (Sajdah)"
      className={`font-arabic text-2xl text-paper-600 dark:text-paper-200 ${className ?? ''}`.trim()}
    >
      ۩
    </span>
  );
}
```

Reused by all three call sites below — one component, no duplication.

## Render sites (3)

All three already have the ayah-level Uthmani string in scope
(`ayah.text_uthmani` in the reader type, `ayah.textUthmani` in `WbwAyah`) —
no new prop plumbing needed.

1. **`apps/web/src/components/reader/AyahView.tsx`** — inside the
   `dir="rtl" flex flex-wrap` word row, after the `words.map(...)` block:
   append `{isSajdahAyah(ayah.text_uthmani) && <SajdahMark />}` as a
   trailing flex sibling. RTL flow places it visually after the last word,
   matching mushaf convention.

2. **`apps/web/src/components/wbw/WbwAyahBlock.tsx`** (WbW card view) —
   same pattern, trailing sibling inside the `flex flex-wrap gap-2` cells
   row.

3. **`apps/web/src/components/wbw/WbwAyahListBlock.tsx`** (WbW table
   view) — flex trailing-sibling doesn't fit a table. Render the mark
   inside the **last row's "Arabic word" `<td>`**, as an additional
   trailing `<span>` next to (not merged into) that cell's existing
   content — preserves the "never mixed into a word's own text/click
   target" rule from the other two sites, adapted to table structure.

None of the three touch `words.text_arabic` / `WbwCell.arabic` — the mark
is never appended to a word's own string, so word click targets, morphology
popovers, and audio-highlight logic are unaffected.

## Out of scope

- No indication in surah lists / tables of contents of which surahs contain
  a sajdah ayah (not requested).
- No fiqh-rule text (e.g. "say this dua", wajib vs mustahabb) — just the
  visual marker matching printed mushafs.
- Search results (`SearchResults.tsx`) and the WbW words page fallback
  path were not in the approved scope (Reader + WbW view only).

## Testing

- `packages/data`: unit test for `isSajdahAyah` — true for text containing
  `۩`, false otherwise (empty string, text without the mark).
- `AyahView`, `WbwAyahBlock`, `WbwAyahListBlock`: one render test each
  confirming `SajdahMark` (via its `aria-label`) is present when the ayah's
  Uthmani text contains `۩` and absent when it doesn't.
