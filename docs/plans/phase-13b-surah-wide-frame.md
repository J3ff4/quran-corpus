# Surah-name-v4 Font + Wide Arabesque Frame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap the reader header's surah-name rendering to the `surah-name-v4` per-surah glyph font, and replace `SurahFrame`'s ornament art with the wider/shorter `Sura_border.svg` banner, on branch `phase-13b-surah-wide-frame`.

**Architecture:** Font is self-hosted via `next/font/local` (same pattern as the existing `hafs.18.woff2`), exposed as a `font-surah-name` Tailwind utility. A pure function maps `surah.id` to the font's PUA codepoint. `SurahFrame.tsx` swaps its inline SVG path for the new art, keyed off `currentColor` so paper/night theming works via a wrapping text-color class instead of two hardcoded fill classes.

**Tech Stack:** Next.js (App Router), TypeScript, Tailwind CSS, Vitest + Testing Library (existing stack, no new deps).

**Spec:** `docs/superpowers/specs/2026-07-17-surah-frame-and-font-design.md`

## Global Constraints

- One logical change per commit, Conventional Commits format, scope `web/reader` or `web` (CLAUDE.md §9).
- No `// @ts-ignore`, no disabled lint rules without inline justification (CLAUDE.md §4).
- WCAG AA: the glyph is a PUA codepoint, not real text — every glyph render needs an `aria-hidden` glyph element plus a `sr-only` sibling carrying `surah.name_arabic` (CLAUDE.md §8, spec "Rendering the glyph").
- `packages/data` types/schema are not touched by this work — `Surah.id` already exists and is sufficient.
- Run `pnpm --filter web test`, `pnpm --filter web lint`, `pnpm --filter web type-check` before each commit (all must pass, CLAUDE.md §4 step 3).
- Attribution for both new assets must land in `apps/web/src/app/about/page.tsx` (CLAUDE.md §11).

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/src/app/fonts/surah-name-v4.woff2` | New binary asset — the glyph font. |
| `apps/web/src/app/layout.tsx` | Modify — register `surahNameV4` via `next/font/local`, add its CSS var to `<html>` className. |
| `packages/config/tailwind/preset.ts` | Modify — add `'surah-name'` to `fontFamily`. |
| `apps/web/src/components/reader/ornaments/surahNameGlyph.ts` | New — pure `surahNameGlyph(surahId)` codepoint function. |
| `apps/web/src/test/surahNameGlyph.test.ts` | New — unit test for the mapping. |
| `apps/web/src/components/reader/ornaments/SurahFrame.tsx` | Modify — swap SVG art, aspect ratio, `currentColor` theming. |
| `apps/web/src/test/SurahFrame.test.tsx` | Modify — new aspect assertion, `currentColor` class assertion. |
| `apps/web/src/components/reader/SurahHeader.tsx` | Modify — render glyph + `sr-only` fallback instead of `name_arabic` directly. |
| `apps/web/src/components/wbw/WbwView.tsx` | Modify — same swap as `SurahHeader.tsx`. |
| `apps/web/src/app/about/page.tsx` | Modify — add 2 attribution entries. |

---

## Task 1: Self-host the surah-name-v4 font

**Files:**
- Create: `apps/web/src/app/fonts/surah-name-v4.woff2`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `packages/config/tailwind/preset.ts`

**Interfaces:**
- Produces: CSS var `--font-surah-name` (available globally via `<html>` className), Tailwind utility class `font-surah-name`.

- [ ] **Step 1: Copy the font file into the repo**

The font was already downloaded this session to
`.superpowers/brainstorm/401398-1784246910/content/surah-name-v4.woff2`
(verified: valid WOFF2, TrueType, version 1.0, 98048 bytes). Copy it — do not
re-download or regenerate it:

```bash
cp .superpowers/brainstorm/401398-1784246910/content/surah-name-v4.woff2 \
   apps/web/src/app/fonts/surah-name-v4.woff2
```

- [ ] **Step 2: Register the font in `layout.tsx`**

In `apps/web/src/app/layout.tsx`, add the import and the font instance next to
the existing `kfgqpc` one (currently lines 9-13):

```ts
const kfgqpc = localFont({
  src: './fonts/hafs.18.woff2',
  variable: '--font-kfgqpc',
  display: 'swap',
});

const surahNameV4 = localFont({
  src: './fonts/surah-name-v4.woff2',
  variable: '--font-surah-name',
  display: 'swap',
});
```

Then add `surahNameV4.variable` to the `<html>` className (currently line 53):

```tsx
<html
  lang="en"
  suppressHydrationWarning
  className={`${kfgqpc.variable} ${amiri.variable} ${inter.variable} ${surahNameV4.variable}`}
>
```

- [ ] **Step 3: Add the Tailwind utility**

In `packages/config/tailwind/preset.ts`, add to the existing `fontFamily`
block (currently lines 13-16):

```ts
fontFamily: {
  arabic: ['var(--font-arabic)', 'serif'],
  sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
  'surah-name': ['var(--font-surah-name)', 'serif'],
},
```

- [ ] **Step 4: Verify the build picks it up**

Run: `pnpm --filter web type-check`
Expected: no errors (this step has no runtime test — `next/font/local` fails
the build at compile time if the file path is wrong, which is the safety net
here).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/fonts/surah-name-v4.woff2 apps/web/src/app/layout.tsx packages/config/tailwind/preset.ts
git commit -m "feat(web): self-host surah-name-v4 glyph font"
```

---

## Task 2: `surahNameGlyph()` codepoint mapping

**Files:**
- Create: `apps/web/src/components/reader/ornaments/surahNameGlyph.ts`
- Test: `apps/web/src/test/surahNameGlyph.test.ts`

**Interfaces:**
- Consumes: nothing (pure function, no dependencies on other tasks).
- Produces: `surahNameGlyph(surahId: number): string` — used by Task 4.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/test/surahNameGlyph.test.ts
import { describe, it, expect } from 'vitest';
import { surahNameGlyph } from '../components/reader/ornaments/surahNameGlyph';

describe('surahNameGlyph', () => {
  it('maps surah 1 (Al-Fatiha) to codepoint 0xE001', () => {
    expect(surahNameGlyph(1)).toBe(String.fromCodePoint(0xe001));
  });

  it('maps surah 114 (An-Nas) to codepoint 0xE072', () => {
    expect(surahNameGlyph(114)).toBe(String.fromCodePoint(0xe072));
  });

  it('maps every surah 1-114 to a distinct codepoint in range', () => {
    const glyphs = new Set(Array.from({ length: 114 }, (_, i) => surahNameGlyph(i + 1)));
    expect(glyphs.size).toBe(114);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- surahNameGlyph`
Expected: FAIL — `Cannot find module '../components/reader/ornaments/surahNameGlyph'`

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/components/reader/ornaments/surahNameGlyph.ts
/**
 * surah-name-v4 (quranfonts.com) maps each surah to a PUA glyph at
 * 0xE000 + surah.id (verified against the font's own cmap: codepoints
 * 0xE001-0xE072 present, one per surah, matching the known example
 * An-Nas = surah 114 = 0xE072).
 */
export function surahNameGlyph(surahId: number): string {
  return String.fromCodePoint(0xe000 + surahId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- surahNameGlyph`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/reader/ornaments/surahNameGlyph.ts apps/web/src/test/surahNameGlyph.test.ts
git commit -m "feat(web/reader): add surah_id -> surah-name-v4 codepoint mapping"
```

---

## Task 3: Swap `SurahFrame`'s ornament art

**Files:**
- Modify: `apps/web/src/components/reader/ornaments/SurahFrame.tsx`
- Modify: `apps/web/src/test/SurahFrame.test.tsx`

**Interfaces:**
- Consumes: nothing new (still a `children`-based component).
- Produces: same `SurahFrame({ children, className })` signature — Task 4 depends on this not changing.

- [ ] **Step 1: Update the failing/changed test first**

Replace `apps/web/src/test/SurahFrame.test.tsx` with:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SurahFrame } from '../components/reader/ornaments/SurahFrame';

describe('SurahFrame', () => {
  it('frames the surah name and hides decoration from a11y', () => {
    render(
      <SurahFrame>
        <span>البقرة</span>
      </SurahFrame>,
    );
    expect(screen.getByText('البقرة')).toBeInTheDocument();
    expect(document.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('uses the wide banner aspect ratio and currentColor theming', () => {
    const { container } = render(
      <SurahFrame>
        <span>test</span>
      </SurahFrame>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('aspect-[204/25]');
    const path = container.querySelector('svg path');
    expect(path).not.toBeNull();
    expect(path?.getAttribute('fill')).toBe('currentColor');
  });
});
```

- [ ] **Step 2: Run test to verify the second assertion fails**

Run: `pnpm --filter web test -- SurahFrame`
Expected: FAIL on the second test — current wrapper still has `aspect-[763/450]`
and current paths use `fill-paper-50 dark:fill-night-200` classes, not
`fill="currentColor"`.

- [ ] **Step 3: Extract the new path's `d` attribute**

`temp/frames-1/Sura_border.svg` is a single `<path fill="#005aff" d="...">`
inside `<svg viewBox='0 -500 16320 2000'>`. Copy the `d` attribute value
**verbatim** (it's ~17KB of numeric path data — a data asset, not logic to
retype by hand) with:

```bash
python3 -c "
import re
svg = open('temp/frames-1/Sura_border.svg').read()
d = re.search(r\"d='([^']+)'\", svg).group(1)
open('/tmp/sura_border_d.txt', 'w').write(d)
print(len(d), 'chars extracted')
"
```

This writes the path data to `/tmp/sura_border_d.txt` for you to paste into
the JSX in Step 4 — do not hand-transcribe it.

- [ ] **Step 4: Replace `SurahFrame.tsx`'s SVG**

```tsx
import type { ReactNode } from 'react';

interface SurahFrameProps {
  children: ReactNode;
  className?: string;
}

/**
 * Wide arabesque banner enclosing the surah name. Art from
 * temp/frames-1/Sura_border.svg (CC0 clipart, native viewBox 0 -500 16320
 * 2000, 8.16:1). It's a single evenodd path — the cartouche and two
 * medallions are cutouts, so the page background shows through them
 * natively. Recolored via `currentColor` (was a hardcoded #005aff) so a
 * wrapping text-color class drives paper/night theming (CLAUDE.md §8).
 */
export function SurahFrame({ children, className }: SurahFrameProps) {
  return (
    <div
      className={`relative mx-auto aspect-[204/25] w-full max-w-md text-paper-700/80 dark:text-paper-300/70 ${className ?? ''}`.trim()}
    >
      <svg
        viewBox="0 -500 16320 2000"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <path fill="currentColor" d="PASTE_D_ATTRIBUTE_HERE" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center px-[36%] py-[20%] text-center">
        {children}
      </div>
    </div>
  );
}
```

Paste the contents of `/tmp/sura_border_d.txt` in place of
`PASTE_D_ATTRIBUTE_HERE` (keep the surrounding quotes).

The `px-[36%] py-[20%]` inset is a starting estimate for the cartouche's
interior within the 16320×2000 box, not verified pixel-exact yet — Step 6
below is the manual check that confirms or corrects it.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter web test -- SurahFrame`
Expected: PASS (2 tests)

- [ ] **Step 6: Manual visual check (both themes)**

```bash
pnpm --filter web dev
```

Open `http://localhost:3000/surah/2` (Al-Baqarah — long name, good clipping
test) in a browser:
- Confirm the banner renders full-width, short and wide, arabesque
  scrollwork + two circular medallions flanking the center cartouche.
- Toggle dark mode (theme toggle in the header) — confirm the ornament
  recolors (paper → dark tone) and stays legible against the page background.
- If the child text/glyph overflows the cartouche's cusped edges, adjust the
  `px-[36%] py-[20%]` values in `SurahFrame.tsx` and re-check. This is the one
  place in this plan where the exact numbers are tuned by eye, not computed —
  everything else is exact.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/reader/ornaments/SurahFrame.tsx apps/web/src/test/SurahFrame.test.tsx
git commit -m "feat(web/reader): swap SurahFrame art to wide arabesque banner"
```

---

## Task 4: Wire the glyph + a11y fallback into both callsites

**Files:**
- Modify: `apps/web/src/components/reader/SurahHeader.tsx`
- Modify: `apps/web/src/components/wbw/WbwView.tsx`

**Interfaces:**
- Consumes: `surahNameGlyph(surahId: number): string` from Task 2; `SurahFrame` from Task 3 (unchanged signature).

- [ ] **Step 1: Update `SurahHeader.tsx`**

Current (lines 1-25):

```tsx
import Link from 'next/link';
import type { Surah } from '@quran-corpus/data';
import { SurahFrame } from './ornaments/SurahFrame';

interface SurahHeaderProps {
  surah: Surah;
}

export function SurahHeader({ surah }: SurahHeaderProps) {
  return (
    <header className="mb-8">
      <div className="mb-4">
        <Link
          href="/surah"
          className="text-sm text-paper-500 transition-colors hover:text-paper-700 dark:hover:text-paper-300"
        >
          ← Surahs
        </Link>
      </div>
      <div className="text-center">
        <SurahFrame className="mb-1">
          <p className="font-arabic text-2xl text-paper-900 dark:text-paper-100">
            {surah.name_arabic}
          </p>
        </SurahFrame>
```

Change the import and the `SurahFrame` children:

```tsx
import Link from 'next/link';
import type { Surah } from '@quran-corpus/data';
import { SurahFrame } from './ornaments/SurahFrame';
import { surahNameGlyph } from './ornaments/surahNameGlyph';

interface SurahHeaderProps {
  surah: Surah;
}

export function SurahHeader({ surah }: SurahHeaderProps) {
  return (
    <header className="mb-8">
      <div className="mb-4">
        <Link
          href="/surah"
          className="text-sm text-paper-500 transition-colors hover:text-paper-700 dark:hover:text-paper-300"
        >
          ← Surahs
        </Link>
      </div>
      <div className="text-center">
        <SurahFrame className="mb-1">
          <p
            className="font-surah-name text-3xl text-paper-900 dark:text-paper-100"
            aria-hidden="true"
          >
            {surahNameGlyph(surah.id)}
          </p>
          <span className="sr-only">{surah.name_arabic}</span>
        </SurahFrame>
```

(The rest of the file — `name_translit`, `name_translation`, ayah count,
"Word by word" link — is unchanged.)

- [ ] **Step 2: Update `WbwView.tsx`**

Current (lines 1-25):

```tsx
import Link from 'next/link';
import type { Surah } from '@quran-corpus/data';
import { Bismillah } from '../reader/ornaments/Bismillah';
import { SurahFrame } from '../reader/ornaments/SurahFrame';
import { WbwAyahBlock } from './WbwAyahBlock';
import { Pager } from './Pager';
import { ScrollToAyah } from './ScrollToAyah';
import type { WbwAyah } from './types';

interface WbwViewProps {
  surah: Surah;
  ayahs: WbwAyah[];
  page: number;
  totalPages: number;
  scrollAyah: number | null;
  pageLang?: string;
}

export function WbwView({ surah, ayahs, page, totalPages, scrollAyah, pageLang }: WbwViewProps) {
  return (
    <div>
      <header className="mb-4 text-center">
        <SurahFrame>
          <p className="font-arabic text-2xl text-paper-900 dark:text-paper-100">{surah.name_arabic}</p>
        </SurahFrame>
```

Change the import and the `SurahFrame` children:

```tsx
import Link from 'next/link';
import type { Surah } from '@quran-corpus/data';
import { Bismillah } from '../reader/ornaments/Bismillah';
import { SurahFrame } from '../reader/ornaments/SurahFrame';
import { surahNameGlyph } from '../reader/ornaments/surahNameGlyph';
import { WbwAyahBlock } from './WbwAyahBlock';
import { Pager } from './Pager';
import { ScrollToAyah } from './ScrollToAyah';
import type { WbwAyah } from './types';

interface WbwViewProps {
  surah: Surah;
  ayahs: WbwAyah[];
  page: number;
  totalPages: number;
  scrollAyah: number | null;
  pageLang?: string;
}

export function WbwView({ surah, ayahs, page, totalPages, scrollAyah, pageLang }: WbwViewProps) {
  return (
    <div>
      <header className="mb-4 text-center">
        <SurahFrame>
          <p className="font-surah-name text-3xl text-paper-900 dark:text-paper-100" aria-hidden="true">
            {surahNameGlyph(surah.id)}
          </p>
          <span className="sr-only">{surah.name_arabic}</span>
        </SurahFrame>
```

(The rest of the file — `name_translit`, the "Read (mushaf)" link, ayah
pagination — is unchanged.)

- [ ] **Step 3: Add an a11y assertion to `SurahFrame.test.tsx`**

Append a third test to the file from Task 3 Step 1:

```tsx
  it('a real-world caller hides the glyph and exposes an sr-only name', () => {
    render(
      <SurahFrame>
        <p aria-hidden="true">{String.fromCodePoint(0xe002)}</p>
        <span className="sr-only">البقرة</span>
      </SurahFrame>,
    );
    const glyph = document.querySelector('p[aria-hidden="true"]');
    expect(glyph).not.toBeNull();
    expect(screen.getByText('البقرة')).toHaveClass('sr-only');
  });
```

- [ ] **Step 4: Run the full web test suite**

Run: `pnpm --filter web test`
Expected: all tests PASS, including the 3 `SurahFrame` tests and the existing
tests that render `SurahHeader`/`WbwView` (check for any snapshot or
`getByText(surah.name_arabic)` assertions that assumed the name was directly
visible rather than `sr-only` — `screen.getByText` matches `sr-only` content
too, since it's still in the DOM, so these should continue to pass
unmodified).

- [ ] **Step 5: Manual visual check**

With `pnpm --filter web dev` still running: open `/surah/2` and
`/surah/2/words`, confirm the glyph renders inside the cartouche on both
pages, and confirm via browser dev tools that the accessibility tree exposes
the Arabic name (not the PUA glyph) as the accessible name for that region.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/reader/SurahHeader.tsx apps/web/src/components/wbw/WbwView.tsx apps/web/src/test/SurahFrame.test.tsx
git commit -m "feat(web/reader): render surah-name-v4 glyph with sr-only Arabic fallback"
```

---

## Task 5: Attribution

**Files:**
- Modify: `apps/web/src/app/about/page.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed elsewhere — leaf task.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/test/about.test.tsx`:

```tsx
  it('credits the surah-name-v4 font and the arabesque frame art', () => {
    render(<About />);
    expect(screen.getByText(/surah-name-v4/i)).toBeInTheDocument();
    expect(screen.getByText(/quranfonts\.com/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- about`
Expected: FAIL — text not found.

- [ ] **Step 3: Add the two source entries**

In `apps/web/src/app/about/page.tsx`, append to the `sources` array (after
the existing KFGQPC entry):

```ts
  {
    name: 'surah-name-v4 (quranfonts.com)',
    href: 'https://quranfonts.com/font/surah-name-v4/',
    provides: 'Per-surah calligraphic glyph used for the surah-name banner in the reader header.',
    license: 'Free/open (no attribution required)',
    note: 'Each of the 114 surah names is a dedicated glyph at Unicode PUA codepoint 0xE000 + surah number; credited here for transparency even though the license does not require it.',
  },
  {
    name: 'Sura_border.svg (arabesque frame ornament)',
    href: 'https://openclipart.org',
    provides: 'The wide ornamental banner framing the surah name.',
    license: 'CC0 / public domain',
    note: 'Free clipart, used unmodified apart from recoloring to match the app’s paper/night theme tokens.',
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- about`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/about/page.tsx apps/web/src/test/about.test.tsx
git commit -m "docs(web/about): credit surah-name-v4 font and arabesque frame art"
```

---

## Final Checklist (before merge)

- [ ] `pnpm --filter web test` — all pass
- [ ] `pnpm --filter web lint` — clean
- [ ] `pnpm --filter web type-check` — clean
- [ ] Greptile run on the full diff, score ≥ 5/5 (CLAUDE.md §5 hard gate) — address every finding or document false-positive justification in the final commit body
- [ ] Manual check: `/surah/2` and `/surah/2/words`, light + dark, glyph not clipped, a11y tree exposes Arabic name
- [ ] Delete/ignore the superseded brainstorm artifacts (`wide_frame_a.svg`, `wide_frame_b.svg`, the `wide-frame-v2.html` mockup) — they live under `.superpowers/brainstorm/`, already untracked, no action needed beyond not committing them
