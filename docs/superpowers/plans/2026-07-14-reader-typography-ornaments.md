# Reader Typography + Ornaments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or executing-plans). Steps use `- [ ]`.

**Goal:** Mushaf-grade Arabic font (KFGQPC Uthmanic Hafs) + ornamental SVG frames/medallions + bismillah on both readers; fix RTL comma bug on glosses.

**Architecture:** Self-host KFGQPC via `next/font/local`, swap `--font-arabic`. New in-house SVG ornament components (surah frame, ayah medallion, bismillah). Wire into mushaf (`AyahView`/`SurahHeader`/`ReaderView`) + WbW (`WbwView`/`WbwAyahBlock`) readers. Comma bug = force `dir="ltr"` on Latin gloss/translit spans (they inherit RTL from `dir="rtl"` ayah container).

**Tech Stack:** Next.js App Router, next/font/local, Tailwind (config preset `arabic` family → `var(--font-arabic)`), Vitest + Testing Library.

## Global Constraints

- Font = **KFGQPC HAFS Uthmanic Script v0.18** woff2 (88KB). Source file staged at
  `scratchpad/hafs.18.woff2`. License = KFGQPC EULA (NOT OFL) → Credits attribution mandatory (§11).
- Font applies to **ALL Arabic** (both readers, WbW cells, headers, word-detail).
- Ornament SVGs = **custom in-house only** (no extracted iQuran/Tasnim assets). Bismillah = text in KFGQPC font (no image).
- Both readers, **fully unified** styling.
- Bismillah banner shown on every surah **except id 1 (Fatiha — bismillah is its ayah 1) and id 9 (At-Tawba — none)**.
- Arabic data = `ayahs.text_uthmani` (has mushaf marks). Do not alter data.
- Client comps import `@quran-corpus/data/client`, never barrel. Commit NAMED paths only.
- TDD RED→GREEN→COMMIT. Conventional Commits. Greptile 5/5 hard block. `prefers-reduced-motion` respected on any animation. WCAG-AA. Subagents Sonnet-floor.

---

### Task 1: Comma bugfix — dir=ltr on Latin gloss/translit spans

**Files:**
- Modify: `apps/web/src/components/wbw/WbwWordCell.tsx`
- Modify: `apps/web/src/components/reader/WordPopover.tsx` (+ `MorphologySummary` gloss span if it renders gloss text)
- Test: `apps/web/src/test/WbwWordCell.test.tsx`

**Root cause:** `WbwAyahBlock`/`AyahView` wrap cells in `dir="rtl"`. Latin gloss `"in it,"` inherits RTL → trailing comma reorders to front (`",in it"`). DB glosses are trailing-comma (verified: 0 start with comma). Fix = mark Latin spans `dir="ltr"`.

- [ ] **Step 1: Failing test** — gloss span carries `dir="ltr"`

```tsx
// in WbwWordCell.test.tsx
it('renders latin gloss/translit LTR so trailing punctuation stays trailing', () => {
  const cell = { surahId: 2, ayahNumber: 2, position: 3, arabic: 'فِيهِ',
    translit: 'fihi', gloss: 'in it,', glossLang: 'en', posLabel: 'Preposition' };
  render(<WbwWordCell cell={cell} pageLang="en" />);
  expect(screen.getByText('in it,')).toHaveAttribute('dir', 'ltr');
  expect(screen.getByText('fihi')).toHaveAttribute('dir', 'ltr');
});
```

- [ ] **Step 2: Run — FAIL** `pnpm --filter web test WbwWordCell` → no dir attr.
- [ ] **Step 3: Implement** — add `dir="ltr"` to translit span + gloss span in `WbwWordCell.tsx`. Same for gloss text span in `WordPopover.tsx` / `MorphologySummary` (defensive; popover word is rtl, gloss is Latin).
- [ ] **Step 4: Run — PASS**. Full web suite green.
- [ ] **Step 5: Commit** `fix(web/reader): keep Latin gloss/translit LTR — trailing comma no longer flips (RTL bidi)`

---

### Task 2: KFGQPC Uthmanic Hafs font pipeline + readability + Credits

**Files:**
- Create: `apps/web/src/app/fonts/hafs.18.woff2` (copy from `scratchpad/hafs.18.woff2`)
- Modify: `apps/web/src/app/layout.tsx` (add `next/font/local`)
- Modify: `apps/web/src/app/globals.css` (`--font-arabic` chain + rtl leading)
- Modify: `apps/web/src/components/reader/AyahView.tsx`, `wbw/WbwAyahBlock.tsx`, `reader/SurahHeader.tsx`, `wbw/WbwView.tsx` (leading/tracking so marks not jammed)
- Modify: `apps/web/src/app/about/page.tsx` (Credits: KFGQPC attribution + license)
- Test: `apps/web/src/test/about.test.tsx`

**Interfaces:**
- Produces: `--font-arabic` now leads with KFGQPC; ornament tasks rely on `.font-arabic` rendering mushaf glyphs.

- [ ] **Step 1** — copy font: `cp scratchpad/hafs.18.woff2 apps/web/src/app/fonts/hafs.18.woff2`
- [ ] **Step 2** — `layout.tsx`: add

```tsx
import localFont from 'next/font/local';
const kfgqpc = localFont({
  src: './fonts/hafs.18.woff2',
  variable: '--font-kfgqpc',
  display: 'swap',
});
// html className: `${kfgqpc.variable} ${amiri.variable} ${inter.variable}`
```

- [ ] **Step 3** — `globals.css`: `--font-arabic: var(--font-kfgqpc), 'Amiri', 'Noto Naskh Arabic', serif;`
  Add mushaf leading so stacked marks breathe:
  `[dir='rtl']{ font-family: var(--font-arabic); }` unchanged; add utility on arabic blocks (Step 4).
- [ ] **Step 4** — bump Arabic line-height/letter-spacing where jammed: `AyahView` arabic div `leading-loose`→`leading-[2.4]`; `WbwWordCell` arabic `leading-tight`→`leading-[1.8]`; `SurahHeader`/`WbwView` name unchanged size. Verify visually on `?lang=uz` + mushaf.
- [ ] **Step 5** — RED test in `about.test.tsx`: asserts a "KFGQPC" credit entry renders. Run → FAIL.
- [ ] **Step 6** — add Credits entry in `about/page.tsx` sources[]: name "KFGQPC Uthmanic Hafs (King Fahd Glorious Quran Printing Complex)", note "Arabic mushaf typeface, © 2010 KFGQPC, used under its EULA for Quranic display". Run → PASS.
- [ ] **Step 7** — type-check + lint + build (`pnpm --filter web build` resolves font). Commit
  `feat(web/reader): self-host KFGQPC Uthmanic Hafs mushaf font + looser leading; credit source`

---

### Task 3: SurahNameFrame ornament SVG

**Files:**
- Create: `apps/web/src/components/reader/ornaments/SurahFrame.tsx`
- Modify: `apps/web/src/components/reader/SurahHeader.tsx`, `wbw/WbwView.tsx`
- Test: `apps/web/src/test/SurahFrame.test.tsx`

**Interfaces:**
- Produces: `SurahFrame({ children, className? })` — wraps surah Arabic name with symmetric arabesque end-caps (inline SVG, `currentColor`, `aria-hidden` on decorative paths).

- [ ] **Step 1** — RED test: renders children, SVG present, `role` none / decorative aria-hidden.

```tsx
it('frames the surah name and hides decoration from a11y', () => {
  render(<SurahFrame><span>البقرة</span></SurahFrame>);
  expect(screen.getByText('البقرة')).toBeInTheDocument();
  expect(document.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
});
```

- [ ] **Step 2** — Run FAIL (no component).
- [ ] **Step 3** — implement `SurahFrame`: flex row `[endcap-svg] [name slot] [mirrored endcap-svg]`; endcap = custom arabesque path, `stroke=currentColor fill=none`, theme via text color (paper-500/night). `prefers-reduced-motion`: no animation (static). Mirror right cap with `scale(-1,1)`.
- [ ] **Step 4** — wire: `SurahHeader` wrap `{surah.name_arabic}` in `<SurahFrame>`; `WbwView` header same.
- [ ] **Step 5** — Run PASS + suite green.
- [ ] **Step 6** — Commit `feat(web/reader): SurahFrame arabesque ornament around surah name (both readers)`

---

### Task 4: AyahMedallion ornament SVG (verse number)

**Files:**
- Create: `apps/web/src/components/reader/ornaments/AyahMedallion.tsx`
- Modify: `apps/web/src/components/reader/AyahView.tsx`, `wbw/WbwAyahBlock.tsx`
- Test: `apps/web/src/test/AyahMedallion.test.tsx`

**Interfaces:**
- Produces: `AyahMedallion({ n, className? })` — ornamental rosette/star circle with number `n` centered, SVG `aria-label={`Ayah ${n}`}`, number in tabular figures.

- [ ] **Step 1** — RED test: shows the number, has accessible label.

```tsx
it('renders ayah number inside an ornamental medallion with a11y label', () => {
  render(<AyahMedallion n={7} />);
  expect(screen.getByText('7')).toBeInTheDocument();
  expect(screen.getByLabelText('Ayah 7')).toBeInTheDocument();
});
```

- [ ] **Step 2** — Run FAIL.
- [ ] **Step 3** — implement: SVG 8-point star/rosette outline (`stroke=currentColor fill=none`) + centered `<text>`/overlaid span with `n`; sized ~1.75rem; color paper-500/night. Static (no motion).
- [ ] **Step 4** — replace plain number spans: `AyahView` `<span…>{ayah.ayah_number}</span>` → `<AyahMedallion n={ayah.ayah_number} />`; `WbwAyahBlock` number pill → `<AyahMedallion n={ayah.ayahNumber} />`.
- [ ] **Step 5** — Run PASS + suite green (update any snapshot/count in ReaderView/Wbw tests referencing old pill).
- [ ] **Step 6** — Commit `feat(web/reader): AyahMedallion ornament for verse numbers (both readers)`

---

### Task 5: Bismillah banner

**Files:**
- Create: `apps/web/src/components/reader/ornaments/Bismillah.tsx`
- Modify: `apps/web/src/components/reader/ReaderView.tsx` (or `SurahHeader`), `wbw/WbwView.tsx`
- Test: `apps/web/src/test/Bismillah.test.tsx`

**Interfaces:**
- Consumes: surah `id`.
- Produces: `Bismillah({ surahId })` — renders `بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ` in `.font-arabic` centered, `dir="rtl"`, returns `null` for surahId 1 or 9.

- [ ] **Step 1** — RED tests:

```tsx
it('shows bismillah for a normal surah', () => {
  render(<Bismillah surahId={2} />);
  expect(screen.getByText(/بِسْمِ/)).toBeInTheDocument();
});
it('hides bismillah for Fatiha (1) and At-Tawba (9)', () => {
  const { container: c1 } = render(<Bismillah surahId={1} />);
  const { container: c9 } = render(<Bismillah surahId={9} />);
  expect(c1).toBeEmptyDOMElement();
  expect(c9).toBeEmptyDOMElement();
});
```

- [ ] **Step 2** — Run FAIL.
- [ ] **Step 3** — implement `Bismillah` (return null for 1/9; else centered rtl font-arabic line, decorative aria-label "Bismillah").
- [ ] **Step 4** — wire top of both readers (after SurahFrame header, before ayah list): `ReaderView` + `WbwView`.
- [ ] **Step 5** — Run PASS + full suite green + type-check + lint.
- [ ] **Step 6** — Commit `feat(web/reader): Bismillah banner on surahs (skip Fatiha + At-Tawba)`

---

## Risks / rollback
- KFGQPC EULA non-OFL → mitigated by Credits attribution + non-monetized app; rollback = revert font commit (Amiri returns via fallback chain).
- Font mark stacking may still look tight → leading tuned in T2 Step 4; adjust utility if visual review flags.
- Ornament SVGs must not regress a11y → all decorative paths `aria-hidden`, numbers keep accessible label.
- Snapshot/count tests in ReaderView/Wbw may break on medallion swap → update in T4 Step 5.

## Acceptance
- Comma renders trailing on WbW + popover (no `,in it`).
- KFGQPC ships + renders mushaf glyphs everywhere Arabic appears; Credits lists it.
- Surah frame + ayah medallions + bismillah on BOTH readers; bismillah skips 1 & 9.
- lint + type + tests green; Greptile 5/5.
