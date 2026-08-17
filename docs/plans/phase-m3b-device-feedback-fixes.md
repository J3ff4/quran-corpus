# M3b Device-Feedback Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to
> implement this plan task-by-task. `AgentTool` is off unless the user asks, so no
> subagent-driven development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five defects the owner found running the M3 smoke checklist on
real hardware, so the M3 verification log can be filled with passes.

**Architecture:** Five independent surface fixes plus one extraction. Nav is the
only structural change: the morphology tab stops being a `<Redirect>` out of the
tab group and becomes a real screen, which means the word-by-word screen body
moves out of the route file into `src/screens/WbwScreen.tsx` and both the route
and the tab render it. Everything else is component-local, one token file, one
shared token-alignment field, and two new persisted settings.

**Tech Stack:** Expo Router, React Native, reanimated 3, expo-sqlite, vitest +
@testing-library/react with the `src/testing/rnHosts.ts` host shims.

**Spec:** owner device report, 2026-08-16, recorded verbatim in "Source report"
below. No separate spec doc — the report is short and the root causes are
already located.

---

## Source report (verbatim)

1. Sheet spring too much springy and jumpy. Just slight, subtle spring is
   enough. Not only Alaq but also all other surah 1st ayah starts with basmala.
   Basmala has to be separate from ayah like in the web app.
2. Morphology is very different from the web app. Needs to be compared. When
   clicked onto it, it loads and brings the page as if it is a whole different
   app. No back button, android back button makes the app exit. And it looks
   rough too. I have to force close the app to back.
3. Settings → Accessibility → Remove animations ON — there is no such settings.
4. Sheet Arabic words are not colored coded. Segment pills have colors though.
5. Arabic text size can be smaller. Even a lot smaller.

## Root causes (located before planning)

| # | Cause | Site |
|---|---|---|
| 1a | `SPRING = { damping: 28, stiffness: 320 }`, mass 1 → ζ ≈ 0.78, visible overshoot | `src/components/WordSheet.tsx:23` |
| 1b | Mobile renders basmala inline inside ayah 1's text run; web renders a separate `<Bismillah>` banner | `src/components/AyahText.tsx` vs `apps/web/src/components/reader/ornaments/Bismillah.tsx` |
| 2a | `<Stack screenOptions={{ headerShown: false }} />` — no pushed route has a header or back control, app-wide | `app/_layout.tsx:78` |
| 2b | Morphology tab `<Redirect>`s out of the `(tabs)` group → tab bar gone, no back entry, Android back exits | `app/(tabs)/morphology.tsx:29` |
| 4 | Sheet hero prints bare `word.text_arabic` in `theme.text`; `SegmentPill` tints only its label, never its Arabic | `WordSheet.tsx:193`, `SegmentPill.tsx:46` |
| 5 | `arabicReader: 34`, `arabicTitle: 48` | `src/theme/tokens.ts:68` |

Item 3 is not a defect. `useReducedMotion` reads the OS setting correctly; the
README names the Pixel path only. Samsung puts it under Accessibility →
Visibility enhancements → Remove animations; some builds only expose Developer
options → Animator duration scale = Off. Owner ruled: fix the README **and** add
an in-app toggle so the check is runnable on any device.

## Owner rulings taken during planning

- Morphology parity with web's `WordDetailView` (SegmentCard, MorphologySummary,
  FullAnalysis, concept tags) is **out of scope here** — own phase later. This
  plan fixes navigation only.
- Spring: **mobile diverges, web unchanged.** Update the "do not retune one
  alone" comment to record the split, same shape as the accent-colour ruling.
- Arabic size: smaller tokens **and** a Settings slider.
- Reduced motion: README **and** in-app toggle.

## Global Constraints

- CLAUDE.md §4 loop per task: implement → self-review → `pnpm lint`,
  `pnpm type-check`, `pnpm test` → mutation-check new logic → commit.
- **Mutation-check is mandatory** on every branch/loop/validator this plan adds.
  Delete the fix or flip the condition, confirm a named test goes red, restore.
  A test that passes both ways asserts nothing (PRs #71, #73).
- CLAUDE.md §5: Tasks 6 and 7 write the on-device user DB → **independent review
  required**, one `/code-review` pass covering both. `/code-review` is
  user-triggered; stop and ask. Task 2 touches `packages/data` (a text util, not
  schema or queries) — ask the owner whether it rides the same pass.
- Every new UI string ships in **all three** locales (en, uz, ru) in
  `src/i18n/uiStrings.ts`. `t()` has no fallback; a missing key is `undefined`.
- Touch targets ≥ `touchTargets.minimum` (48dp). WCAG AA contrast holds in both
  themes.
- `apps/mobile` route tests live in `src/test/routes/`, never under `app/` —
  `require.context` matches every `.ts/.tsx` there and would register the test
  as a route (`appDirIsRoutesOnly.test.ts` guards this).
- Conventional Commits, scope `mobile` or `data`. One logical change per commit.
- Do not spend an EAS build cycle per task. All seven land, then one build.

## File Structure

**Create**
- `apps/mobile/src/components/Bismillah.tsx` — basmala banner. Mirrors web's
  ornament: hidden for surah 1 and 9.
- `apps/mobile/src/components/SegmentedWord.tsx` — the joined, per-segment
  coloured word. Port of web `SegmentPills` at `size="lg"`, without the pill row
  (mobile already renders pills separately).
- `apps/mobile/src/screens/WbwScreen.tsx` — the word-by-word screen body, lifted
  out of the route so the tab can render it too.
- Test files beside each: `Bismillah.test.tsx`, `SegmentedWord.test.tsx`,
  `src/test/routes/morphologyTab.test.tsx`.

**Modify**
- `packages/data/src/text/ayahTokens.ts` — mark basmala tokens.
- `apps/mobile/src/components/WordSheet.tsx` — spring, coloured hero.
- `apps/mobile/src/components/SegmentPill.tsx` — tint the Arabic.
- `apps/mobile/src/components/AyahText.tsx` — drop basmala tokens from the run.
- `apps/mobile/src/components/AyahCard.tsx` — render the banner above ayah 1.
- `apps/mobile/src/components/SurahReader.tsx` — WbW button to `headerRight`,
  drop the duplicate in-list title.
- `apps/mobile/app/_layout.tsx` — real Stack headers.
- `apps/mobile/app/(tabs)/morphology.tsx` — render, don't redirect.
- `apps/mobile/app/surah/[surahId]/words.tsx` — thin route over `WbwScreen`.
- `apps/mobile/src/theme/tokens.ts` — Arabic size tokens + scale steps.
- `apps/mobile/src/settings/settingsStore.tsx` — two new settings.
- `apps/mobile/app/(tabs)/settings.tsx` — two new controls.
- `apps/mobile/src/motion/useReducedMotion.ts` — OR the in-app toggle.
- `apps/mobile/src/i18n/uiStrings.ts` — new keys ×3 locales.
- `README.md` — smoke checklist wording.
- `docs/plans/phase-m3-morphology-mvp.md` — verification log.

---

### Task 1: Soften the sheet spring

**Files:**
- Modify: `apps/mobile/src/components/WordSheet.tsx:21-23`
- Test: `apps/mobile/src/components/WordSheet.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: exported `const SPRING` stays module-private; no API change.

Physics: reanimated `withSpring` defaults mass 1. Damping ratio
ζ = damping / (2·√(stiffness·mass)). Current 28 / (2·√320) = 0.78 → overshoot
≈ 5%, two visible bounces. Target ζ ≈ 1.05: no overshoot, still eases like a
spring rather than a curve. damping 38, stiffness 320 → 38 / 35.78 = 1.06.

- [ ] **Step 1: Write the failing test**

Add to `WordSheet.test.tsx`:

```tsx
import { SPRING_DAMPING_RATIO } from './WordSheet';

it('opens without overshooting', () => {
  // ζ >= 1 is critically damped: the sheet settles at its resting position
  // instead of passing it and coming back. Owner report 2026-08-16 called the
  // ported web value "too springy and jumpy" on device.
  expect(SPRING_DAMPING_RATIO).toBeGreaterThanOrEqual(1);
  // And not so stiff it stops reading as a spring at all.
  expect(SPRING_DAMPING_RATIO).toBeLessThan(1.2);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @quran-corpus/mobile test -- WordSheet`
Expected: FAIL — `SPRING_DAMPING_RATIO` is not exported.

- [ ] **Step 3: Retune and export the ratio**

Replace lines 21-23 of `WordSheet.tsx`:

```tsx
// NOT web's WordPopover spring any more. Owner ruling 2026-08-16, after the M3
// device run: web keeps its bounce, mobile softens. The port comment that used
// to sit here said "do not retune one of them alone" -- that is now explicitly
// overridden for this value, the same way the accent colour diverges in
// theme/tokens.ts. Do not "fix" this back to web's numbers.
//
// reanimated's withSpring defaults mass 1, so the damping ratio is
// damping / (2 * sqrt(stiffness)). 28/320 gave 0.78 -- underdamped, and the
// overshoot is what read as jumpy on a 120 Hz panel.
const SPRING = { damping: 38, stiffness: 320 } as const;

/** Exported for the test: RN's animation internals are not observable from
 *  jsdom, so the physics is asserted at the parameter instead of the frames. */
export const SPRING_DAMPING_RATIO = SPRING.damping / (2 * Math.sqrt(SPRING.stiffness));
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm --filter @quran-corpus/mobile test -- WordSheet`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Set `damping: 28` back. Run the test. Expected: FAIL on the `>= 1` assertion.
Restore `38`.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/WordSheet.tsx apps/mobile/src/components/WordSheet.test.tsx
git commit -m "fix(mobile): settle the word sheet without overshoot"
```

---

### Task 2: Basmala as its own banner

**Files:**
- Modify: `packages/data/src/text/ayahTokens.ts`
- Test: `packages/data/tests/ayahTokens.test.ts`
- Create: `apps/mobile/src/components/Bismillah.tsx`, `Bismillah.test.tsx`
- Modify: `apps/mobile/src/components/AyahText.tsx`
- Modify: `apps/mobile/src/components/AyahCard.tsx`
- Test: `apps/mobile/src/components/AyahText.test.tsx`, `AyahCard.test.tsx`

**Interfaces:**
- Produces: `AyahToken` gains `isBasmala?: true`. Additive and optional, so no
  existing caller breaks. `Bismillah({ surahId }: { surahId: number })`.

Why a field and not a recomputation in the component: `hasBasmala` is decided by
token arithmetic inside `alignAyahTokens` (merge-then-count, and the merge has
to run first — the file records why). Re-deriving it in `AyahText` duplicates
that logic across packages, which §3 forbids outright.

Grep first: `alignAyahTokens` has exactly one consumer, `AyahText.tsx`. Web
renders word rows and never calls it, so this signature change reaches nothing
on web.

- [ ] **Step 1: Write the failing data test**

Add to `packages/data/tests/ayahTokens.test.ts`:

```ts
it('marks the basmala prefix so a caller can lift it out of the run', () => {
  // 96:1. The four basmala tokens have no word rows; the ayah's own three do.
  const tokens = alignAyahTokens(
    'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ٱقْرَأْ بِٱسْمِ رَبِّكَ',
    ['ٱقْرَأْ', 'بِٱسْمِ', 'رَبِّكَ'],
    { surahId: 96, ayahNumber: 1 },
  );

  expect(tokens?.slice(0, 4).every((token) => token.isBasmala)).toBe(true);
  expect(tokens?.slice(4).some((token) => token.isBasmala)).toBe(false);
});

it('marks nothing in al-Fatiha, whose ayah 1 IS the basmala', () => {
  // Four real word rows. Marking them would delete the whole ayah from 1:1.
  const tokens = alignAyahTokens(
    'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
    ['بِسْمِ', 'ٱللَّهِ', 'ٱلرَّحْمَٰنِ', 'ٱلرَّحِيمِ'],
    { surahId: 1, ayahNumber: 1 },
  );

  expect(tokens?.some((token) => token.isBasmala)).toBe(false);
});
```

- [ ] **Step 2: Run and confirm both fail**

Run: `pnpm --filter @quran-corpus/data test -- ayahTokens`
Expected: FAIL — `isBasmala` does not exist.

- [ ] **Step 3: Mark the tokens**

In `packages/data/src/text/ayahTokens.ts`, add to the `AyahToken` interface:

```ts
  /** True on the tokens of the basmala that prefixes ayah 1 of most surahs.
   *  They carry no word row, and a reader that shows the basmala as its own
   *  banner needs to drop them from the ayah's run -- which it cannot decide
   *  for itself, because `hasBasmala` below is settled by token arithmetic
   *  that has to run after the mark merge. */
  isBasmala?: true;
```

and in the alignment walk, replace the offset branch:

```ts
    if (index < offset) {
      aligned.push({ text, wordIndex: null, isBasmala: true });
      continue;
    }
```

`offset` is 0 whenever `hasBasmala` is false, so surah 1 and 9 and every
non-first ayah take no marks. No second condition needed.

- [ ] **Step 4: Run and confirm both pass**

Run: `pnpm --filter @quran-corpus/data test -- ayahTokens`
Expected: PASS.

- [ ] **Step 5: Mutation-check the data change**

Change `index < offset` to `index < 0`. Run: the first test fails. Change it to
`index < BASMALA_TOKENS`: the al-Fatiha test fails. Restore `index < offset`.

- [ ] **Step 6: Rebuild the shared package**

Run: `pnpm --filter @quran-corpus/data build`
Consumers import compiled `dist/`, not `src/`. Skipping this makes the mobile
work below look like it does nothing.

- [ ] **Step 7: Write the failing Bismillah test**

Create `apps/mobile/src/components/Bismillah.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Bismillah } from './Bismillah';

describe('Bismillah', () => {
  it('renders the banner for a normal surah', () => {
    render(<Bismillah surahId={96} />);
    expect(screen.getByTestId('bismillah')).toBeTruthy();
  });

  it.each([
    [1, 'al-Fatiha, where the basmala is ayah 1 itself'],
    [9, 'at-Tawba, which has none'],
  ])('renders nothing for surah %i (%s)', (surahId) => {
    render(<Bismillah surahId={surahId} />);
    expect(screen.queryByTestId('bismillah')).toBeNull();
  });
});
```

- [ ] **Step 8: Run and confirm it fails**

Run: `pnpm --filter @quran-corpus/mobile test -- Bismillah`
Expected: FAIL — module not found.

- [ ] **Step 9: Write the banner**

Create `apps/mobile/src/components/Bismillah.tsx`:

```tsx
import { Text } from 'react-native';
import { useArabicSizes } from '@/theme/useArabicSizes';
import { useThemeColors } from '@/theme/themeContext';

/** The same string web's ornament carries. Hard-coded rather than sliced out
 *  of ayah 1: the banner also has to render on the word-by-word screen, which
 *  never loads the ayah's Uthmani text. */
const BASMALA = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

/**
 * Basmala banner above a surah's first ayah, matching web's
 * `components/reader/ornaments/Bismillah.tsx`. Al-Fatiha's basmala IS its ayah
 * 1, and at-Tawba has none, so both render nothing.
 */
export function Bismillah({ surahId }: { surahId: number }) {
  const theme = useThemeColors();
  const sizes = useArabicSizes();
  if (surahId === 1 || surahId === 9) return null;

  return (
    <Text
      testID="bismillah"
      accessibilityLabel="Bismillah"
      style={{
        color: theme.text,
        fontFamily: 'Hafs',
        fontSize: sizes.banner,
        textAlign: 'center',
        writingDirection: 'rtl',
        marginBottom: 16,
      }}
    >
      {BASMALA}
    </Text>
  );
}
```

> `useArabicSizes` arrives in Task 6. Until then use `typography.arabicReader`
> and swap it there — Task 6's step list includes this call site.

- [ ] **Step 10: Run and confirm it passes**

Run: `pnpm --filter @quran-corpus/mobile test -- Bismillah`
Expected: PASS.

- [ ] **Step 11: Write the failing AyahText test**

Add to `AyahText.test.tsx`:

```tsx
it('leaves the basmala prefix out of the ayah run', () => {
  // 96:1 renders the basmala as a banner above the card now, so keeping it in
  // the run too would print it twice.
  render(
    <AyahText
      textUthmani="بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ٱقْرَأْ بِٱسْمِ رَبِّكَ"
      words={[wordOf('ٱقْرَأْ'), wordOf('بِٱسْمِ'), wordOf('رَبِّكَ')]}
      surahId={96}
      ayahNumber={1}
      onWordPress={() => {}}
    />,
  );

  expect(screen.getByTestId('ayah-run').textContent).not.toContain('ٱلرَّحْمَٰنِ');
  expect(screen.getByTestId('ayah-run').textContent).toContain('ٱقْرَأْ');
});
```

(`wordOf` is the existing helper in that file; reuse it, do not add a second.)

- [ ] **Step 12: Run and confirm it fails**

Run: `pnpm --filter @quran-corpus/mobile test -- AyahText`
Expected: FAIL — the run still contains the basmala.

- [ ] **Step 13: Drop the marked tokens**

In `AyahText.tsx`, inside the `tokens.map`, before anything else:

```tsx
        // Rendered as its own banner above the card (see Bismillah), so the
        // run drops it rather than printing it a second time. Filtered here
        // and not in the memo so `index` still lines up with the token list
        // the alignment produced.
        if (token.isBasmala) return null;
```

The `separator` line already keys off `index === 0`; with the first four
tokens returning null the first *rendered* token is index 4 and gains a leading
space. Change the separator to trim it:

```tsx
        const separator = index === 0 || tokens[index - 1]?.isBasmala ? '' : ' ';
```

- [ ] **Step 14: Run and confirm it passes**

Run: `pnpm --filter @quran-corpus/mobile test -- AyahText`
Expected: PASS. The existing "renders the basmala prefix as text with no tap
target" test now contradicts the new behaviour — rewrite it to assert the run
starts at the ayah's own first word, and note the banner in its comment.

- [ ] **Step 15: Mutation-check**

Delete the `if (token.isBasmala) return null;` line. Run: the new test fails.
Restore. Then delete only the `tokens[index - 1]?.isBasmala` clause and confirm
a leading-space assertion catches it — if no test does, add one:

```tsx
expect(screen.getByTestId('ayah-run').textContent?.startsWith(' ')).toBe(false);
```

- [ ] **Step 16: Render the banner in the card**

In `AyahCard.tsx`, above the `<AyahText>`:

```tsx
      {ayahNumber === 1 ? <Bismillah surahId={surahId} /> : null}
```

Add a test in `AyahCard.test.tsx`:

```tsx
it('shows the basmala banner above ayah 1 only', () => {
  const { rerender } = render(<AyahCard {...props} surahId={2} ayahNumber={1} />);
  expect(screen.getByTestId('bismillah')).toBeTruthy();

  rerender(<AyahCard {...props} surahId={2} ayahNumber={2} />);
  expect(screen.queryByTestId('bismillah')).toBeNull();
});
```

- [ ] **Step 17: Full gate**

Run: `pnpm lint && pnpm type-check && pnpm test`
Expected: all pass.

- [ ] **Step 18: Commit**

```bash
git add packages/data/src/text/ayahTokens.ts packages/data/tests/ayahTokens.test.ts
git commit -m "feat(data): mark the basmala tokens in an aligned ayah"
git add apps/mobile/src/components/Bismillah.tsx apps/mobile/src/components/Bismillah.test.tsx \
        apps/mobile/src/components/AyahText.tsx apps/mobile/src/components/AyahText.test.tsx \
        apps/mobile/src/components/AyahCard.tsx apps/mobile/src/components/AyahCard.test.tsx
git commit -m "fix(mobile): show the basmala as its own banner, as web does"
```

---

### Task 3: Extract the word-by-word screen

**Files:**
- Create: `apps/mobile/src/screens/WbwScreen.tsx`
- Modify: `apps/mobile/app/surah/[surahId]/words.tsx`
- Test: `apps/mobile/src/test/routes/words.test.tsx` (unchanged assertions)

**Interfaces:**
- Produces: `WbwScreen({ surahId, from }: { surahId: number | null; from: number })`.
  `surahId: null` renders the invalid-surah alert. Task 4 consumes it.

Pure move, no behaviour change. Everything from `words.tsx` lines 33-187 goes
across verbatim; the route keeps only param parsing.

- [ ] **Step 1: Create the screen**

`src/screens/WbwScreen.tsx` holds the whole current body, with the two params
arriving as props instead of `useLocalSearchParams`. Keep every comment — the
stale-`useState` note, the tap-sequence note, the `importantForAccessibility`
note. The `paramKey` reset stays, keyed now on `` `${surahId}:${from}` `` built
from the props.

```tsx
export interface WbwScreenProps {
  /** null renders the invalid-surah alert; the caller validates. */
  surahId: number | null;
  from: number;
}

export function WbwScreen({ surahId, from: initialFrom }: WbwScreenProps) {
  // ... body moved from app/surah/[surahId]/words.tsx, unchanged ...
}
```

- [ ] **Step 2: Reduce the route to parsing**

`app/surah/[surahId]/words.tsx` becomes:

```tsx
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { parseAyahNumber, parseSurahId } from '@/data/routeParams';
import { WbwScreen } from '@/screens/WbwScreen';

export default function WbwRoute() {
  const params = useLocalSearchParams<{ surahId: string; from?: string }>();
  const surahId = useMemo(() => parseSurahId(params.surahId), [params.surahId]);
  // Arrives from a deep link, so it is untrusted input even though the reader
  // and the morphology tab are the only writers of these links. Past the end
  // of a short surah it is clamped by getWbwScreen, not rejected here --
  // parseAyahNumber cannot know which surah it is bounding.
  const from = useMemo(() => parseAyahNumber(params.from) ?? 1, [params.from]);

  return <WbwScreen surahId={surahId} from={from} />;
}
```

- [ ] **Step 3: Run the existing suite unchanged**

Run: `pnpm --filter @quran-corpus/mobile test -- words`
Expected: all 12 PASS with no edits to the test file. If any needs editing, the
move was not faithful — fix the move, not the test. The traversal/`0`/`115`
cases in particular prove validation still runs before the DB opens.

- [ ] **Step 4: Full gate and commit**

```bash
pnpm lint && pnpm type-check && pnpm test
git add apps/mobile/src/screens/WbwScreen.tsx apps/mobile/app/surah/\[surahId\]/words.tsx
git commit -m "refactor(mobile): lift the word-by-word screen out of its route"
```

---

### Task 4: Morphology tab renders instead of redirecting

**Files:**
- Modify: `apps/mobile/app/(tabs)/morphology.tsx`
- Create: `apps/mobile/src/test/routes/morphologyTab.test.tsx`

**Interfaces:**
- Consumes: `WbwScreen` from Task 3.

This is the "whole different app" fix. `<Redirect>` replaces the tab route with
a root-Stack route, so the tab bar disappears, no back entry is pushed, and
Android back pops an empty stack — which exits the app. Rendering the screen
inside the tab keeps the tab bar, and back-from-a-tab-root exiting is correct
Android behaviour.

- [ ] **Step 1: Write the failing tests**

Create `src/test/routes/morphologyTab.test.tsx`:

```tsx
it('renders the word-by-word screen inside the tab, not a redirect away from it', async () => {
  // A <Redirect> here left the tab bar behind and pushed nothing, so Android
  // back exited the app -- owner device report, 2026-08-16.
  mocks.position = { surahId: 2, ayahNumber: 21 };

  render(<MorphologyTab />);

  expect(await screen.findByTestId('wbw-screen')).toBeTruthy();
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it('opens at the last-read ayah', async () => {
  mocks.position = { surahId: 2, ayahNumber: 21 };

  render(<MorphologyTab />);

  await waitFor(() => expect(mocks.getWbwScreen).toHaveBeenCalledWith(expect.anything(), 2, 21));
});

it('still shows the empty state with no reading history', async () => {
  mocks.position = null;

  render(<MorphologyTab />);

  expect(await screen.findByText('No reading history yet')).toBeTruthy();
  expect(mocks.getWbwScreen).not.toHaveBeenCalled();
});
```

Mock `expo-router`'s `Redirect` as `mocks.redirect` so the first assertion can
observe it. Mock `@/screens/WbwScreen` to a stub carrying `testID="wbw-screen"`
for the first test; for the second, use the partial-mock shape
`words.test.tsx` already uses so `getWbwScreen` is observable.

- [ ] **Step 2: Run and confirm they fail**

Run: `pnpm --filter @quran-corpus/mobile test -- morphologyTab`
Expected: FAIL — `Redirect` is called, no `wbw-screen`.

- [ ] **Step 3: Replace the redirect**

In `app/(tabs)/morphology.tsx`, drop the `Redirect` import and swap the branch:

```tsx
  // Rendered here, not redirected to. A <Redirect> out of the (tabs) group
  // took the tab bar with it and pushed no history entry, so Android back
  // popped an empty stack and killed the app (owner device report,
  // 2026-08-16). The tab is a screen; back out of a tab root exiting is the
  // platform's own behaviour.
  if (!error && position) {
    return <WbwScreen surahId={position.surahId} from={position.ayahNumber} />;
  }
```

`position.surahId` comes from the user DB, written only by the reader, so it
needs no re-parse — but `WbwScreen` still takes `number | null` and its own
load guard rejects a bad id before opening the corpus DB.

- [ ] **Step 4: Run and confirm they pass**

Run: `pnpm --filter @quran-corpus/mobile test -- morphologyTab`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Change `from={position.ayahNumber}` to `from={1}`. Run: the last-read-ayah test
fails. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/\(tabs\)/morphology.tsx apps/mobile/src/test/routes/morphologyTab.test.tsx
git commit -m "fix(mobile): keep the morphology tab inside the tab group"
```

---

### Task 5: Headers and back buttons on every pushed route

**Files:**
- Modify: `apps/mobile/app/_layout.tsx:74-82`
- Modify: `apps/mobile/src/components/SurahReader.tsx:181-220`
- Test: `apps/mobile/src/components/SurahReader.test.tsx`

`headerShown: false` app-wide is why nothing pushed has a back control. The
reader gets one too — leaving it headerless while its children have headers is
the inconsistency that made the deeper screens read as a different app.

- [ ] **Step 1: Give the Stack real headers**

Replace the `<Stack ...>` line in `app/_layout.tsx`:

```tsx
          <Stack>
            {/* The tab group draws its own headers via app/(tabs)/_layout. */}
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="surah/[surahId]" options={{ title: '' }} />
            <Stack.Screen name="surah/[surahId]/words" options={{ title: '' }} />
            <Stack.Screen name="word/[surah]/[ayah]/[position]" options={{ title: '' }} />
            <Stack.Screen name="root/[buckwalter]" options={{ title: '' }} />
            <Stack.Screen name="about" options={{ title: '' }} />
          </Stack>
```

Titles are empty because each screen already renders its own heading, and a
navigation title repeating it puts the same words on screen twice. The header
exists for the back affordance.

Theme it, or it renders in the platform default and fights both palettes. Hoist
a themed `screenOptions` — but `useThemeColors` only works below
`ThemeProvider`, so this has to move into a small child component:

```tsx
function AppStack() {
  const theme = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
        title: '',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
```

and render `<AppStack />` inside `<ThemeProvider>`. Unlisted routes inherit
`screenOptions`, so only the tab group needs its own entry.

- [ ] **Step 2: Move the reader's word-by-word button into the header**

The in-list header currently carries the surah title, the translated name, and
the WbW button, with a `ponytail:` comment saying the button lives there only
because no nav header exists. That premise is now false. In `SurahReader.tsx`,
delete the `Pressable` from `ListHeaderComponent` (keep the two `Text` lines —
the surah name is content, not chrome) and register it as `headerRight`:

```tsx
  // Fixed, not scrolled away with the title: the nav header exists as of the
  // M3b header pass, so the reader's one action no longer has to ride the list.
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          testID="open-wbw"
          accessibilityRole="button"
          accessibilityLabel={t(uiLocale, 'wbw.title')}
          onPress={() => router.push(`/surah/${data.surah.id}/words`)}
          style={{
            minHeight: touchTargets.minimum,
            minWidth: touchTargets.minimum,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="words" color={theme.accent} />
        </Pressable>
      ),
    });
  }, [navigation, data.surah.id, uiLocale, theme.accent]);
```

`navigation` from `useNavigation()` (expo-router re-exports it).

- [ ] **Step 3: Keep the existing button test green**

`SurahReader.test.tsx` asserts on `testID="open-wbw"`. It renders the component
outside a navigator, so `setOptions` has nothing to render into and the button
disappears from the tree. Mock `useNavigation` to capture the options and assert
on the captured element instead:

```tsx
const setOptions = vi.fn();
vi.mock('expo-router', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useNavigation: () => ({ setOptions }),
  router: { push: mocks.push },
}));

it('offers word-by-word from the navigation header', async () => {
  render(<SurahReader {...props} />);

  await waitFor(() => expect(setOptions).toHaveBeenCalled());
  const { headerRight } = setOptions.mock.calls.at(-1)![0];
  render(headerRight());
  fireEvent.click(screen.getByTestId('open-wbw'));

  expect(mocks.push).toHaveBeenCalledWith('/surah/2/words');
});
```

- [ ] **Step 4: Run the gate**

Run: `pnpm lint && pnpm type-check && pnpm test`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Remove `headerRight` from the `setOptions` object. Run: the test above fails on
the destructure. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/_layout.tsx apps/mobile/src/components/SurahReader.tsx \
        apps/mobile/src/components/SurahReader.test.tsx
git commit -m "fix(mobile): give every pushed screen a back button"
```

---

### Task 6: Colour the Arabic by segment

**Files:**
- Create: `apps/mobile/src/components/SegmentedWord.tsx`, `SegmentedWord.test.tsx`
- Modify: `apps/mobile/src/components/WordSheet.tsx:182-194`
- Modify: `apps/mobile/src/components/SegmentPill.tsx:43-56`
- Modify: `apps/mobile/app/word/[surah]/[ayah]/[position].tsx:89-101`

**Interfaces:**
- Produces: `SegmentedWord({ word, segments, fontSize }: { word: Word; segments: WordSegment[]; fontSize: number })`.

Port of web `SegmentPills` at `size="lg"`, minus the pill row — mobile already
renders `SegmentPill`s beside it. Two rules carried over verbatim from web:
segments must be **adjacent inline runs with no gap or box**, or Arabic letter
joining breaks; and if any segment lacks `form_arabic`, fall back to the whole
word in body colour rather than render a partial word.

- [ ] **Step 1: Write the failing tests**

`src/components/SegmentedWord.test.tsx`:

```tsx
it('paints each segment in its part-of-speech colour', () => {
  render(<SegmentedWord word={word} segments={[prefix('P'), stem('N')]} fontSize={36} />);

  const runs = screen.getAllByTestId('segment-run');
  expect(runs).toHaveLength(2);
  expect(runs[0]!.style.color).toBe(themeColors.light.pos.prep);
  expect(runs[1]!.style.color).toBe(themeColors.light.pos.noun);
});

it('falls back to the whole word when a segment has no Arabic', () => {
  // A partial word is worse than an uncoloured one: the reader would see the
  // word with a piece missing and no sign that anything was dropped.
  render(<SegmentedWord word={word} segments={[prefix('P'), noArabic('N')]} fontSize={36} />);

  expect(screen.queryAllByTestId('segment-run')).toHaveLength(0);
  expect(screen.getByTestId('word-fallback').textContent).toBe(word.text_arabic);
});

it('renders the fallback when the word has no segments at all', () => {
  render(<SegmentedWord word={word} segments={[]} fontSize={36} />);

  expect(screen.getByTestId('word-fallback').textContent).toBe(word.text_arabic);
});
```

- [ ] **Step 2: Run and confirm they fail**

Run: `pnpm --filter @quran-corpus/mobile test -- SegmentedWord`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
import { Text } from 'react-native';
import { posBucket, type Word, type WordSegment } from '@quran-corpus/data/mobile';
import { useThemeColors } from '@/theme/themeContext';

export interface SegmentedWordProps {
  word: Word;
  segments: WordSegment[];
  fontSize: number;
}

/**
 * The tapped word with each morphological segment in its own POS colour.
 * Ported from web's SegmentPills at size="lg" -- the sheet used to print the
 * word in body colour while the pills beneath it were tinted, which read as
 * two unrelated things (owner device report, 2026-08-16).
 */
export function SegmentedWord({ word, segments, fontSize }: SegmentedWordProps) {
  const theme = useThemeColors();
  const style = {
    color: theme.text,
    fontFamily: 'Hafs',
    fontSize,
    textAlign: 'right' as const,
    // See AyahText: textAlign places the block, writingDirection drives the
    // bidi resolution inside the Arabic run.
    writingDirection: 'rtl' as const,
  };

  // Any missing form_arabic and the joined word would be incomplete, with
  // nothing on screen saying so. Same guard web's SegmentPills carries.
  if (segments.length === 0 || segments.some((segment) => !segment.form_arabic)) {
    return (
      <Text testID="word-fallback" style={style}>
        {word.text_arabic}
      </Text>
    );
  }

  return (
    // Nested <Text>, no gap, no wrapper View per segment: Arabic letters join
    // across adjacent runs of one text node and stop joining across boxes.
    // The whole word carries one accessible name, since TalkBack reading five
    // segments as five strings is not the word.
    <Text testID="segmented-word" accessibilityLabel={word.text_arabic} style={style}>
      {segments.map((segment) => {
        const bucket = posBucket(segment.pos_tag);
        return (
          <Text
            key={segment.id}
            testID="segment-run"
            // Body text, not the `other` grey: posBucket returns null for a
            // category the corpus does not surface, and the muted colour
            // would assert one. Same rule as SegmentPill.
            style={{ color: bucket ? theme.pos[bucket] : theme.text }}
          >
            {segment.form_arabic}
          </Text>
        );
      })}
    </Text>
  );
}
```

- [ ] **Step 4: Run and confirm they pass**

Run: `pnpm --filter @quran-corpus/mobile test -- SegmentedWord`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Delete the `segments.some((segment) => !segment.form_arabic)` clause. Run: the
fallback test fails. Restore. Then change `theme.pos[bucket]` to `theme.text`:
the colour test fails. Restore.

- [ ] **Step 6: Use it in the sheet and the detail screen**

In `WordSheet.tsx`, replace the hero `<Text>` (lines 182-194) with:

```tsx
          <SegmentedWord word={word} segments={segments} fontSize={typography.arabicTitle} />
```

`typography.arabicTitle` for now; Task 7 step 11 swaps both call sites onto
`useArabicSizes().title`.

Same swap in `app/word/[surah]/[ayah]/[position].tsx` for its hero at lines
89-101. Both already have `segments` in scope.

- [ ] **Step 7: Tint the pill's Arabic too**

In `SegmentPill.tsx`, the Arabic currently takes `theme.text` while the label
takes `labelColor`. Give both `labelColor` — the pill is one segment, so one
colour. Add to the existing test file:

```tsx
it('tints the segment Arabic, not only its label', () => {
  render(<SegmentPill segment={stem('V')} />);

  const [arabic, label] = screen.getAllByTestId('segment-pill-text');
  expect(arabic!.style.color).toBe(themeColors.light.pos.verb);
  expect(label!.style.color).toBe(themeColors.light.pos.verb);
});
```

Add `testID="segment-pill-text"` to both `<Text>` nodes in the component.

- [ ] **Step 8: Full gate and commit**

```bash
pnpm lint && pnpm type-check && pnpm test
git add apps/mobile/src/components/SegmentedWord.tsx apps/mobile/src/components/SegmentedWord.test.tsx \
        apps/mobile/src/components/WordSheet.tsx apps/mobile/src/components/SegmentPill.tsx \
        apps/mobile/src/components/SegmentPill.test.tsx \
        apps/mobile/app/word/\[surah\]/\[ayah\]/\[position\].tsx
git commit -m "feat(mobile): colour the word Arabic by segment, as web does"
```

---

### Task 7: Arabic size tokens and the reader size setting

**Files:**
- Modify: `apps/mobile/src/theme/tokens.ts:67-73`
- Create: `apps/mobile/src/theme/useArabicSizes.ts`, `useArabicSizes.test.ts`
- Modify: `apps/mobile/src/settings/settingsStore.tsx`
- Modify: `apps/mobile/app/(tabs)/settings.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`
- Modify: `AyahText.tsx`, `Bismillah.tsx`, `WordSheet.tsx`, `SegmentedWord` call
  sites, `app/word/.../[position].tsx`, `app/root/[buckwalter].tsx`

**§5 REVIEW TRIGGER — this task and Task 8 write the on-device user DB. Stop
after Task 8 and ask the owner to run `/code-review` over both.** That file
lives on a phone and survives app updates, so a bad row is not fixed by
shipping a new build.

**Interfaces:**
- Produces: `arabicScale: ArabicScale` on `AppSettings`, `setArabicScale` on the
  context, and `useArabicSizes(): { reader: number; title: number; banner: number }`.

**Read this before writing code:** `settingsStore.tsx:35-39` records that a
`fontScale` setting was deliberately **removed** as a duplicate of Android's own
font-size control. That ruling is not being reversed. This setting is different
and the comment must say so: it scales the **Arabic only**, relative to the UI,
which is the ratio the OS control cannot change. Android's system font scaling
still applies on top, unchanged.

- [ ] **Step 1: Shrink the tokens and add the scale**

In `tokens.ts`:

```ts
export const typography = {
  // Was 34/48. Owner ruling 2026-08-16 after the M3 device run: the Arabic ran
  // much larger than web's reader (30px) and dominated the card. These are the
  // 'medium' step; useArabicSizes multiplies them.
  arabicReader: 28,
  arabicTitle: 36,
  title: 24,
  body: 16,
  caption: 13,
};

/** Reader-Arabic size steps. Multipliers, not absolute sizes, so Android's own
 *  font scaling composes with this rather than being overridden by it. */
export const arabicScales = {
  small: 0.8,
  medium: 1,
  large: 1.25,
  xlarge: 1.5,
} as const;

export type ArabicScale = keyof typeof arabicScales;
```

- [ ] **Step 2: Write the failing hook test**

`src/theme/useArabicSizes.test.ts`:

```ts
it('scales every Arabic size by the stored step', () => {
  mocks.settings.arabicScale = 'small';
  const { result } = renderHook(() => useArabicSizes());

  expect(result.current.reader).toBe(Math.round(28 * 0.8));
  expect(result.current.title).toBe(Math.round(36 * 0.8));
});

it('falls back to medium for a value the store does not recognise', () => {
  // The setting is a string in SQLite. A row edited by hand, or written by an
  // older build, must not produce NaN as a font size -- RN throws on that.
  mocks.settings.arabicScale = 'enormous' as ArabicScale;
  const { result } = renderHook(() => useArabicSizes());

  expect(result.current.reader).toBe(28);
});
```

- [ ] **Step 3: Run and confirm they fail**

Run: `pnpm --filter @quran-corpus/mobile test -- useArabicSizes`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the hook**

```ts
import { useAppSettings } from '@/settings/settingsStore';
import { arabicScales, typography } from './tokens';

export interface ArabicSizes {
  reader: number;
  title: number;
  banner: number;
}

/**
 * The Arabic sizes for the reader's chosen step.
 *
 * Rounded: RN accepts fractional font sizes but Hafs's metrics land on whole
 * pixels, and a 22.4px run against a 22px one in the next card is visible.
 */
export function useArabicSizes(): ArabicSizes {
  const { arabicScale } = useAppSettings();
  // Defensive: the value round-trips through SQLite as text. loadPersisted-
  // AppSettings validates it, but a size of NaN crashes the renderer, so this
  // does not depend on that being the only writer.
  const factor = arabicScales[arabicScale] ?? arabicScales.medium;

  return {
    reader: Math.round(typography.arabicReader * factor),
    title: Math.round(typography.arabicTitle * factor),
    banner: Math.round(typography.arabicReader * factor),
  };
}
```

- [ ] **Step 5: Run and confirm they pass**

Run: `pnpm --filter @quran-corpus/mobile test -- useArabicSizes`
Expected: PASS.

- [ ] **Step 6: Persist the setting**

In `settingsStore.tsx`:

- Add `arabicScale: ArabicScale` to `AppSettings`, `setArabicScale` to the
  context value, `arabicScale: 'medium'` to `defaultSettings`.
- Add `'arabicScale'` to `settingKeys`.
- Add the validator beside the others:

```ts
function isArabicScale(value: string | null): value is ArabicScale {
  return value !== null && Object.hasOwn(arabicScales, value);
}
```

- In `loadPersistedAppSettings`, read `persisted.arabicScale` through it.
- Replace the `// No fontScale here` comment block:

```ts
// arabicScale is NOT the fontScale that was removed here. That one duplicated
// Android's own font-size control, which already scales every <Text>. This one
// scales the Arabic *relative to* the UI text, which is the one ratio the OS
// control cannot change -- the owner's report was that the Arabic dominated the
// card at any system size. System scaling still composes on top; nothing here
// sets allowFontScaling.
const settingKeys = ['uiLocale', 'contentLanguage', 'theme', 'analyticsEnabled', 'arabicScale'] as const;
```

- [ ] **Step 7: Write the persistence test**

Add to `settingsStore.test.tsx`, matching the shape of the existing theme test:

```tsx
it('rejects a stored arabicScale that is not a step', async () => {
  // Straight into a font size if it got through, and RN throws on NaN.
  mocks.stored.arabicScale = 'enormous';

  const settings = await loadPersistedAppSettings(client);

  expect(settings.arabicScale).toBe('medium');
});

it('round-trips a chosen step', async () => {
  mocks.stored.arabicScale = 'large';

  const settings = await loadPersistedAppSettings(client);

  expect(settings.arabicScale).toBe('large');
});
```

- [ ] **Step 8: Mutation-check the validator**

Replace `isArabicScale(persistedArabicScale) ? persistedArabicScale : 'medium'`
with a bare `persistedArabicScale ?? 'medium'`. Run: the reject test fails.
Restore. (This is the exact class §5 flags — a validator that passes both ways
has slipped through twice in this repo.)

- [ ] **Step 9: Add the Settings control**

In `app/(tabs)/settings.tsx`, a fourth `radiogroup` above the analytics switch,
reusing `ChoiceOption` — a discrete four-step radio, not a continuous slider:
the steps are the only values the hook accepts, and a slider would imply a range
that does not exist.

```tsx
      <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
        <Text style={{ color: theme.text, fontWeight: '600' }}>{t(uiLocale, 'settings.arabicSize')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(['small', 'medium', 'large', 'xlarge'] as const).map((option) => (
            <ChoiceOption
              key={option}
              label={t(uiLocale, arabicSizeLabelKeys[option])}
              selected={option === settings.arabicScale}
              onPress={() => settings.setArabicScale(option)}
            />
          ))}
        </View>
      </View>
```

with, beside `themeLabelKeys`:

```tsx
const arabicSizeLabelKeys = {
  small: 'settings.arabicSizeSmall',
  medium: 'settings.arabicSizeMedium',
  large: 'settings.arabicSizeLarge',
  xlarge: 'settings.arabicSizeXlarge',
} as const;
```

- [ ] **Step 10: Add the strings, all three locales**

In `uiStrings.ts`, add to `UiStringKey` and to each of `en`, `uz`, `ru`:

```ts
    'settings.arabicSize': 'Arabic size',
    'settings.arabicSizeSmall': 'Small',
    'settings.arabicSizeMedium': 'Medium',
    'settings.arabicSizeLarge': 'Large',
    'settings.arabicSizeXlarge': 'Extra large',
```
```ts
    'settings.arabicSize': 'Arab yozuvi o‘lchami',
    'settings.arabicSizeSmall': 'Kichik',
    'settings.arabicSizeMedium': 'O‘rtacha',
    'settings.arabicSizeLarge': 'Katta',
    'settings.arabicSizeXlarge': 'Juda katta',
```
```ts
    'settings.arabicSize': 'Размер арабского текста',
    'settings.arabicSizeSmall': 'Мелкий',
    'settings.arabicSizeMedium': 'Средний',
    'settings.arabicSizeLarge': 'Крупный',
    'settings.arabicSizeXlarge': 'Очень крупный',
```

`uiStrings.test.ts` already asserts every locale covers every key — it will
catch a missed one.

- [ ] **Step 11: Route every Arabic size through the hook**

Swap `typography.arabicReader` / `typography.arabicTitle` for
`useArabicSizes()` in: `AyahText.tsx`, `Bismillah.tsx` (the Task 2 note),
`WordSheet.tsx`, both `SegmentedWord` call sites, and
`app/root/[buckwalter].tsx`. `SegmentPill`'s Arabic stays on
`typography.body` — it is a chip label, not reading text.

- [ ] **Step 12: Full gate**

Run: `pnpm lint && pnpm type-check && pnpm test`

- [ ] **Step 13: Commit**

```bash
git add apps/mobile/src/theme apps/mobile/src/settings apps/mobile/src/i18n \
        apps/mobile/app/\(tabs\)/settings.tsx apps/mobile/src/components apps/mobile/app
git commit -m "feat(mobile): let the reader choose the Arabic size"
```

---

### Task 8: In-app reduce-animations toggle

**Files:**
- Modify: `apps/mobile/src/settings/settingsStore.tsx`
- Modify: `apps/mobile/src/motion/useReducedMotion.ts`
- Modify: `apps/mobile/app/(tabs)/settings.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`
- Test: `apps/mobile/src/motion/useReducedMotion.test.ts`

**§5 REVIEW TRIGGER — writes the on-device user DB. Covered by the same
`/code-review` pass as Task 7.**

**Interfaces:**
- Produces: `reduceMotion: boolean` on `AppSettings`, `setReduceMotion` on the
  context. `useReducedMotion()` keeps its signature.

OR, never override: a user who set the OS flag must not be able to lose
animations-off by toggling the app switch. The in-app switch can only *add*
reduced motion.

- [ ] **Step 1: Write the failing tests**

```ts
it('reduces motion when the app setting is on and the system flag is off', async () => {
  // The owner's device exposes no OS toggle at the documented path, so the
  // app needs its own way to reach this state (device report, 2026-08-16).
  mocks.system = false;
  mocks.settings.reduceMotion = true;

  const { result } = renderHook(() => useReducedMotion());

  await waitFor(() => expect(result.current).toBe(true));
});

it('keeps the system flag even when the app setting is off', async () => {
  // OR, not override. A user who asked the OS for no animations must not lose
  // that because an in-app switch defaults off.
  mocks.system = true;
  mocks.settings.reduceMotion = false;

  const { result } = renderHook(() => useReducedMotion());

  await waitFor(() => expect(result.current).toBe(true));
});
```

- [ ] **Step 2: Run and confirm both fail**

Run: `pnpm --filter @quran-corpus/mobile test -- useReducedMotion`
Expected: FAIL — the hook reads only `AccessibilityInfo`.

- [ ] **Step 3: OR the two sources**

In `useReducedMotion.ts`, keep the existing effect and rename its state, then:

```ts
  const { reduceMotion } = useAppSettings();

  // OR, never override. The system flag is a user's standing instruction to
  // every app; an in-app switch that could turn it back off would be an app
  // overruling an accessibility setting.
  return systemReduced || reduceMotion;
```

Update the doc comment: the hook is now "the system setting OR the in-app one".

- [ ] **Step 4: Run and confirm both pass**

Run: `pnpm --filter @quran-corpus/mobile test -- useReducedMotion`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Change `systemReduced || reduceMotion` to `reduceMotion`. Run: the second test
fails. Change it to `systemReduced`: the first fails. Restore the `||`.

- [ ] **Step 6: Persist and surface it**

Same five edits as Task 7 step 6, for a boolean: `AppSettings.reduceMotion`,
`setReduceMotion`, `defaultSettings.reduceMotion: false`, `'reduceMotion'` in
`settingKeys`, and `reduceMotion: persisted.reduceMotion === 'true'` in
`loadPersistedAppSettings` — the same shape `analyticsEnabled` already uses.

Add a switch to Settings beside the analytics one:

```tsx
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: settings.reduceMotion }}
        onPress={() => settings.setReduceMotion(!settings.reduceMotion)}
        style={{ minHeight: touchTargets.minimum, justifyContent: 'center' }}
      >
        <Text style={{ color: settings.reduceMotion ? theme.accent : theme.mutedText }}>
          {t(uiLocale, settings.reduceMotion ? 'settings.reduceMotionOn' : 'settings.reduceMotionOff')}
        </Text>
      </Pressable>
```

Strings, all three locales:

```ts
    'settings.reduceMotionOn': 'Reduce animations: on',
    'settings.reduceMotionOff': 'Reduce animations: off',
```
```ts
    'settings.reduceMotionOn': 'Animatsiyalarni kamaytirish: yoqilgan',
    'settings.reduceMotionOff': 'Animatsiyalarni kamaytirish: o‘chirilgan',
```
```ts
    'settings.reduceMotionOn': 'Меньше анимации: включено',
    'settings.reduceMotionOff': 'Меньше анимации: выключено',
```

- [ ] **Step 7: Full gate**

Run: `pnpm lint && pnpm type-check && pnpm test`

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/motion apps/mobile/src/settings apps/mobile/src/i18n \
        apps/mobile/app/\(tabs\)/settings.tsx
git commit -m "feat(mobile): add an in-app reduce-animations switch"
```

- [ ] **Step 9: STOP. Ask the owner to run `/code-review`.**

Tasks 7 and 8 both write the on-device user DB (§5). Plain `/code-review` is
Pro-plan and local; `ultra` bills separately and must not be launched without
asking. One pass over both tasks. Fix what is real, say plainly which findings
are declined and why. Re-run only if a fix was substantial.

---

### Task 9: README, build, device run

**Files:**
- Modify: `README.md:43-77`
- Modify: `docs/plans/phase-m3-morphology-mvp.md` (Verification Log)

- [ ] **Step 1: Fix check 8's wording**

Replace README line 59-61:

```markdown
8. Settings (in the app) → **Reduce animations: on**. Reopen the sheet: it
   fades, does not slide, and does not drag. Turn it back off without
   restarting the app; the slide returns. Then repeat via the OS setting, which
   must also reduce motion with the in-app switch off: Pixel is Settings →
   Accessibility → Remove animations; Samsung is Settings → Accessibility →
   Visibility enhancements → Remove animations; on a device with neither, use
   Developer options → Animator duration scale → Animation off.
```

- [ ] **Step 2: Add the checks this plan's fixes need**

Append to the M3 list:

```markdown
17. Open any surah other than 1 and 9. The basmala is its own centred line above
    ayah 1, and does not also appear inside ayah 1's text.
18. Open al-Fatiha. The basmala appears once, as ayah 1 — no banner above it.
    Open at-Tawba (9). No basmala anywhere.
19. From the reader, open a word sheet → Full analysis. Press the header back
    arrow: it returns to the reader. Press Android back from the reader: it
    returns to the surah list, and does not exit the app.
20. Morphology tab. The bottom tab bar stays visible. Android back exits the
    app from here, and from here only.
21. Tap a multi-segment word (e.g. 2:2 بِٱلْغَيْبِ). The big Arabic in the sheet is
    coloured per segment, joined as one word with no gaps between segments.
22. Settings → Arabic size → Small, then Extra large. The reader Arabic,
    the sheet hero and the root screen all change; the UI text does not.
```

- [ ] **Step 3: Update Current Status**

README line 77 still describes M1/M0 only. Replace with M3's actual state.

- [ ] **Step 4: Build**

```bash
npx eas-cli@latest build --platform android --profile preview
```

Confirm the upload is **~43 MB**. A ~5 MB upload means `.easignore` dropped the
bundled DB and every check will fail for the wrong reason.

- [ ] **Step 5: Run all 22 checks on the physical device**

Record each as PASS / FAIL / unexercised in the M3 plan's Verification Log.
Per the M2 log convention: **unexercised checks are recorded as unexercised,
never implied to have passed.** A FAIL is a finding, recorded with whether its
fix was re-verified on device or carried to the next build.

- [ ] **Step 6: Commit the log**

```bash
git add README.md docs/plans/phase-m3-morphology-mvp.md docs/plans/phase-m3b-device-feedback-fixes.md
git commit -m "docs(mobile): record the M3b on-device verification run"
```

---

## Risks and rollbacks

| Risk | Mitigation | Rollback |
|---|---|---|
| `alignAyahTokens` field breaks a consumer | Grepped: one consumer, mobile's `AyahText`. Field is optional and additive. | Revert the data commit; mobile falls back to the inline basmala. |
| Nav headers eat vertical space in the reader | `headerShadowVisible: false` and an empty title keep it to one 56dp bar; the duplicated in-list title is removed in the same task. | Revert Task 5; back buttons go, nothing else breaks. |
| Morphology tab now loads a surah on every focus | It already did, via the redirect. Same query, one less navigation. | Revert Task 4. |
| Arabic at `small` (22px) fails legibility on a small screen | Default stays `medium`; `small` is opt-in. Check 22 exercises both ends. | Raise `arabicScales.small` to 0.9. |
| `arabicScale` row written by this build, read by an older one | Older builds ignore unknown setting keys — `loadPersistedAppSettings` reads a fixed key list. | None needed. |
| Reduce-motion switch confuses users who already set the OS flag | The switch ORs; it can only add. Label says "Reduce animations", matching the OS wording. | Revert Task 8; the OS path still works. |

## Acceptance criteria

- [ ] Sheet opens with no visible overshoot; `SPRING_DAMPING_RATIO ≥ 1` asserted.
- [ ] Basmala renders once, as its own banner, for every surah except 1 and 9;
      absent entirely for 9; is ayah 1 itself for 1.
- [ ] Every pushed screen shows a back control; Android back never exits the app
      except from a tab root.
- [ ] Morphology tab keeps the tab bar and opens at the last-read ayah.
- [ ] Sheet hero and detail hero are coloured per segment, joined, with a
      whole-word fallback when any `form_arabic` is missing.
- [ ] Reader Arabic defaults to 28px and follows a four-step setting.
- [ ] Reduce-animations is reachable in-app and ORs with the OS flag.
- [ ] `pnpm lint && pnpm type-check && pnpm test` green.
- [ ] Every new branch/validator mutation-checked, with the failing test named.
- [ ] `/code-review` run over Tasks 7-8; findings resolved or declined in writing.
- [ ] All 22 smoke checks recorded in the M3 Verification Log from real hardware.

## Verification Log

### Run 1 — pending

Not yet run.
