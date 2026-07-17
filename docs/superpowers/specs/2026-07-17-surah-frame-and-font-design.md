# Surah header: per-surah glyph font + wide arabesque frame

Status: approved by user 2026-07-17. Next: writing-plans (phase-13-reader-typography, continuing existing branch).

## Goal

Two coupled changes to the surah-name display in the reader header:

1. Render surah name with quranfonts.com **surah-name-v4** (per-surah calligraphic glyph font) instead of the current `font-arabic` (Amiri/KFGQPC) rendering of `surah.name_arabic`.
2. Replace `SurahFrame`'s ornament art (currently `temp/frames/frame-2.svg`, 763×450, ~1.7:1) with `temp/frames-1/Sura_border.svg` (CC0 arabesque banner, 16320×2000, 8.16:1) — much wider/shorter, directly satisfies "shorten the frame."

## Current state (verified in code, not assumed)

- `SurahFrame` (`apps/web/src/components/reader/ornaments/SurahFrame.tsx`) already exists and is live on `main` (merged from `phase-13-reader-typography`, commit `a5aa7b1`). Renders `frame-2.svg` as two theme-token-colored `<path>`s (`fill-paper-50 dark:fill-night-200`, `fill-paper-800 dark:fill-paper-200`), aspect locked via `aspect-[763/450]`, children centered in a padded inset div.
- Callsites: `SurahHeader.tsx:21-25` and `WbwView.tsx:23-25`, both pass `<p className="font-arabic ...">{surah.name_arabic}</p>` as children.
- `SurahFrame.test.tsx` asserts the Arabic text renders and an `aria-hidden` svg exists.
- No `surah-name-v4` font-face is registered anywhere in the app yet; the woff2 only exists in scratch/brainstorm dirs, not committed.
- Font license: free/open, no attribution required (verified earlier this session against quranfonts.com terms).
- `Sura_border.svg` / `frame-3.svg` / `frame-5.svg` (new, in `temp/frames-1/`, just pulled): CC0/free clipart per user. `Sura_border.svg` chosen over the other two (frame-3 reads generic-Western, frame-5 is a valid geometric alternative but user picked Sura_border.svg).

## Font: codepoint mapping (derived, not from the flaky quranfonts.com site)

Inspected `surah-name-v4.woff2`'s cmap directly with `fonttools` (`TTFont(...).getBestCmap()`):

- PUA codepoints `0xE001`–`0xE072` present, exactly 114 — one per surah.
- Confirmed against the one known example (An-Nās, surah 114 → `0xE072`; `0x72` = 114 decimal): **codepoint = `0xE000 + surah.id`**.
- `0xE000` and `0xE073` also exist in the font (2 extra glyphs beyond the 114) — not surah names, not used. Leave unreferenced; no need to identify them for this feature.
- No external cheatsheet/scrape needed. Mapping is a one-line function: `String.fromCodePoint(0xE000 + surah.id)`.

## Design

### Font registration

Follow existing `next/font/local` convention (`layout.tsx`, same pattern as `kfgqpc`):

```ts
const surahNameV4 = localFont({
  src: './fonts/surah-name-v4.woff2',
  variable: '--font-surah-name',
  display: 'swap',
});
```

- Copy `surah-name-v4.woff2` into `apps/web/src/app/fonts/`.
- Add `surahNameV4.variable` to the root `<html>` className alongside the others.
- Add `'surah-name': ['var(--font-surah-name)', 'serif']` to `fontFamily` in `packages/config/tailwind/preset.ts` (mirrors the existing `arabic` entry) → gives a `font-surah-name` utility class.

### Rendering the glyph

New small helper (co-located with `SurahFrame`, e.g. `SurahFrame.tsx` or a `surahNameGlyph.ts` util):

```ts
export function surahNameGlyph(surahId: number): string {
  return String.fromCodePoint(0xE000 + surahId);
}
```

At both callsites (`SurahHeader.tsx`, `WbwView.tsx`), replace:

```tsx
<p className="font-arabic text-2xl ...">{surah.name_arabic}</p>
```

with:

```tsx
<p className="font-surah-name text-3xl ..." aria-hidden="true">{surahNameGlyph(surah.id)}</p>
<span className="sr-only">{surah.name_arabic}</span>
```

- `aria-hidden` on the glyph paragraph because a PUA codepoint is not real text to a screen reader.
- `sr-only` sibling carries the real Arabic name — satisfies WCAG AA / CLAUDE.md §8.
- Font-size bumped (2xl → 3xl or similar) since these are display glyphs, not running text — exact size tuned visually against the new wider/shorter frame, not fixed here.

### Frame: `Sura_border.svg` → `SurahFrame.tsx`

- Replace the two `frame-2.svg` `<path>`s with the single `Sura_border.svg` path (currently one evenodd path, hardcoded `fill="#005aff"`; strip the hardcoded fill, use `fill="currentColor"` and drive color via a wrapping `text-*` className so paper/night map through existing Tailwind color tokens — e.g. `text-paper-700/80 dark:text-paper-300/70`, tuned visually).
- Swap `viewBox="0 0 762.89 449.5"` → `viewBox="0 -500 16320 2000"` (native, unedited) and `aspect-[763/450]` → `aspect-[16320/2000]` (i.e. `aspect-[8.16/1]`, use the exact fraction to avoid float rounding).
- The center cartouche + two medallions are cutouts (evenodd holes) in the one path — page/paper background shows through automatically, no separate panel fill needed (unlike frame-2's two-path bg+border design).
- Children-centering div (currently `px-[16%] py-[13%]`) needs new inset percentages re-tuned for the wide cartouche's actual proportions within the 16320×2000 box — compute from the cartouche's path bounds, verify visually once implemented (glyph must not clip/overflow the cartouche cusps).
- Drop the two hand-built A/B wide-banner mockups (`wide_frame_a.svg`/`wide_frame_b.svg` and the brainstorm HTML previews) — superseded, not used.
- `frame-2.svg` (`temp/frames/`) becomes unused after this lands; leave the file in `temp/` (matches existing `temp/` provenance handling per memory — not deleted, not re-flagged by Greptile) but remove the `SurahFrame.tsx` doc-comment reference to it, replace with `Sura_border.svg` provenance (CC0 clipart).

### Testing

- Update `SurahFrame.test.tsx`: aspect-ratio assertion (if any) to new ratio; keep the `aria-hidden` svg assertion; add assertion that the glyph paragraph is `aria-hidden` and the `sr-only` sibling contains the real Arabic name.
- New unit test for `surahNameGlyph()`: surah 1 → ``, surah 114 → ``.
- Visual check (manual, both light/dark, both callsites: `/surah/[id]` reader and `/surah/[id]/words` WbW view) — glyph centered, not clipped by cartouche cusps, frame recolors correctly per theme.

### Attribution

Add both sources to the in-app Credits/About section per CLAUDE.md §11: `Sura_border.svg` (CC0 clipart) and `surah-name-v4` (quranfonts.com, free/open license, no attribution required — noted anyway for transparency).

## Out of scope

- No change to `AyahMedallion.tsx` or `Bismillah.tsx` (separate ornaments, not part of this change).
- No change to the underlying `surah.name_arabic` DB field or schema — still used as the accessible-text fallback.
- `frame-3.svg` / `frame-5.svg` not used now; left in `temp/frames-1/` for potential future reuse.

## Risks / rollback

- Glyph clipping inside the cartouche is the main visual risk — mitigated by manual visual check before merge, not by guessing padding numbers upfront.
- If `surah-name-v4` renders badly for some surah (font bug, missing glyph), fallback is trivial: the `sr-only` real name is already there for accessibility, but there's no visual fallback if a PUA glyph is blank. Acceptable risk since all 114 codepoints were confirmed present in the font's cmap.
- Rollback is a single revert commit; no data/schema changes involved.
