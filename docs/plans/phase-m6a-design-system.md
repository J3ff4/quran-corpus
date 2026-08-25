# M6a Design System + App Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the glass layer every other M6 sub-phase consumes — the bloom
backdrop, the glass surface primitive, the display face, the press motion — and
re-skin the two pieces of chrome that wrap every screen: the tab bar and the
stack header.

**Architecture:** One static full-screen SVG bloom sits behind the whole
navigator and never re-renders. Above it, screens are transparent and content
sits on `GlassSurface` cards: a translucent fill, a hairline border, and an
inset top highlight drawn as a 1px child view. No blur anywhere — RN has no
`backdrop-filter` and `expo-blur`'s Android path renders the tree twice
(decision 7/8). Existing colour tokens are untouched; glass tokens are added
beside them.

**Tech Stack:** `react-native-svg` 15.15.4 (already a dependency, currently used
only by `Icon`), `react-native-reanimated` 4.5.0, `expo-font` 57,
`react-native-safe-area-context` 5.7. No new dependency.

**Spec:** `docs/plans/phase-m6-glass-redesign.md`. Mockups `1a`, `1d`, `1e` in
`~/quran-data/corpus-design-files/Quran Corpus Glass.dc.html` carry the chrome.

## Global Constraints

Inherited from the umbrella plan's Global Constraints — read them. The ones this
sub-phase leans on hardest:

- No new dependency (§12).
- `packages/config` and `packages/data` are **not** modified here. No §5 trigger.
- Existing hexes in `apps/mobile/src/theme/tokens.ts` stay exactly as they are.
  Glass is additive.
- AA is measured against the glass fill **composited over the bloom**, not
  against `theme.background`.
- Branch: `feat/m6a-design-system`. Device checks 48–54.
- Gates: `pnpm -r lint`, `pnpm -r type-check`, `pnpm --filter @quran-corpus/mobile test`.

---

### Task 1: The display face

Newsreader (SIL OFL 1.1) is the serif in every mockup's headings. The app has
one font asset today (`assets/fonts/hafs.18.woff2`, 88 KB) and loads it in
`useCorpusFonts`.

**Files:**
- Create: `apps/mobile/assets/fonts/Newsreader-Regular.ttf`
- Create: `apps/mobile/assets/fonts/Newsreader-SemiBold.ttf`
- Modify: `apps/mobile/src/data/openCorpusDb.ts:186-192` (`useCorpusFonts`)
- Modify: `apps/mobile/src/theme/tokens.ts`
- Test: `apps/mobile/src/theme/tokens.test.ts`

**Interfaces:**
- Produces: `fonts` from `@/theme/tokens` —
  `{ arabic: 'Hafs'; display: 'Newsreader'; displaySemiBold: 'Newsreader-SemiBold' }`.
  Every later sub-phase uses `fonts.display` for headings and `fonts.arabic`
  where it currently writes the string `'Hafs'`.

`'Hafs'` is a bare string literal in 17 call sites today. Do **not** sweep them
here — each later sub-phase swaps the files it is already rewriting. A
17-file rename in the design-system PR is churn that hides the real change.

- [x] **Step 1: Fetch the fonts**

Static TTFs, Regular + SemiBold only (two weights is what the mockups use):

```bash
cd apps/mobile/assets/fonts
curl -fsSL -o Newsreader-Regular.ttf \
  'https://github.com/google/fonts/raw/main/ofl/newsreader/Newsreader%5Bopsz,wght%5D.ttf'
```

The Google Fonts repo ships Newsreader as a variable font. RN's Android font
loader does not select a variable axis, so **instance it to two statics** with
`fonttools` if the variable file is what lands:

```bash
python3 -m pip install --quiet fonttools
python3 -m fontTools.varLib.instancer 'Newsreader[opsz,wght].ttf' \
  wght=400 opsz=16 -o Newsreader-Regular.ttf
python3 -m fontTools.varLib.instancer 'Newsreader[opsz,wght].ttf' \
  wght=600 opsz=16 -o Newsreader-SemiBold.ttf
rm 'Newsreader[opsz,wght].ttf'
ls -la  # each static should land well under 200 KB
```

If either file lands over ~400 KB, subset it to Latin + Latin-1 with
`pyftsubset` rather than committing it as-is (§9 forbids large binaries).

Record the OFL licence text location for M6i's credits screen; do **not** write
the About copy here.

- [x] **Step 2: Write the failing test**

`apps/mobile/src/theme/tokens.test.ts`:

```ts
import { fonts } from './tokens';

describe('fonts', () => {
  it('names every family the app loads', () => {
    // The strings here must match useCorpusFonts' keys exactly. RN resolves a
    // fontFamily by name at render time and silently falls back to the system
    // face when it misses, so a typo shows up as "the serif never applied" on
    // a device and as nothing at all in a test that only checks the token
    // exists.
    expect(fonts).toEqual({
      arabic: 'Hafs',
      display: 'Newsreader',
      displaySemiBold: 'Newsreader-SemiBold',
    });
  });
});
```

- [x] **Step 3: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/mobile test -t 'names every family'`
Expected: FAIL — `fonts` is not exported.

- [x] **Step 4: Add the token**

`apps/mobile/src/theme/tokens.ts`, after `typography`:

```ts
/** Font family names, as registered by useCorpusFonts.
 *
 *  Newsreader is the display serif from the M6 mockups; the UI face stays the
 *  platform sans (no fontFamily at all, which is what RN already does). Only
 *  two weights are loaded -- Android resolves `fontWeight` against the loaded
 *  family and a weight with no file falls back to the system face mid-screen,
 *  so headings name the SemiBold family directly rather than asking for 600. */
export const fonts = {
  arabic: 'Hafs',
  display: 'Newsreader',
  displaySemiBold: 'Newsreader-SemiBold',
} as const;
```

- [x] **Step 5: Register them**

`apps/mobile/src/data/openCorpusDb.ts`:

```ts
export function useCorpusFonts(): [boolean, Error | null] {
  const { useFonts } = require('expo-font') as typeof ExpoFont;

  return useFonts({
    Hafs: require('../../assets/fonts/hafs.18.woff2'),
    Newsreader: require('../../assets/fonts/Newsreader-Regular.ttf'),
    'Newsreader-SemiBold': require('../../assets/fonts/Newsreader-SemiBold.ttf'),
  });
}
```

The splash is already held until this resolves (`app/_layout.tsx`), so the
serif can never flash in unstyled.

- [x] **Step 6: Run the gates**

Run: `pnpm --filter @quran-corpus/mobile test && pnpm -r type-check && pnpm -r lint`
Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add apps/mobile/assets/fonts apps/mobile/src/theme/tokens.ts \
        apps/mobile/src/theme/tokens.test.ts apps/mobile/src/data/openCorpusDb.ts
git commit -m "feat(mobile): load Newsreader as the display face"
```

---

### Task 2: Glass and bloom tokens, with the contrast gate

**Files:**
- Modify: `apps/mobile/src/theme/tokens.ts`
- Modify: `apps/mobile/src/testing/rgb.ts`
- Test: `apps/mobile/src/theme/tokens.test.ts`

**Interfaces:**
- Produces: `glass` and `bloom` from `@/theme/tokens`; `composite` from
  `@/testing/rgb`.
- Consumes: `contrast` from `@/testing/contrast` (unchanged).

The values below are read off the mockups, not invented: dark fill
`rgba(255,255,255,.075)`, border `rgba(255,255,255,.14)`, inset highlight
`rgba(255,255,255,.18)`, shadow `0 16px 38px rgba(0,0,0,.36)`, bloom
`radial-gradient(120% 66% at 18% -6%, rgba(31,111,91,.62), transparent)` over
`#151412`.

- [x] **Step 1: Write the failing test**

Append to `apps/mobile/src/theme/tokens.test.ts`:

```ts
import { bloom, glass, themeColors } from './tokens';
import { composite } from '../testing/rgb';
import { contrast } from '../testing/contrast';

describe('glass surfaces', () => {
  // The worst call site, not the page. A translucent card over the bloom's hot
  // stop is a different backdrop from theme.background, and it is the one the
  // eye actually reads text on. Measuring against the flat page is how a token
  // passes here and fails on the device.
  const worstBackdrop = {
    light: composite(bloom.light.stops[0], themeColors.light.background),
    dark: composite(bloom.dark.stops[0], themeColors.dark.background),
  } as const;

  for (const mode of ['light', 'dark'] as const) {
    const surface = composite(glass[mode].fill, worstBackdrop[mode]);

    it(`keeps ${mode} body text above AA on glass`, () => {
      expect(contrast(themeColors[mode].text, surface)).toBeGreaterThanOrEqual(4.5);
    });

    it(`keeps ${mode} muted text above AA on glass`, () => {
      expect(contrast(themeColors[mode].mutedText, surface)).toBeGreaterThanOrEqual(4.5);
    });

    it(`keeps ${mode} accent above AA on glass`, () => {
      // The tab bar's active label and every card link.
      expect(contrast(themeColors[mode].accent, surface)).toBeGreaterThanOrEqual(4.5);
    });

    it(`draws the ${mode} hairline visibly against its own fill`, () => {
      // Not an AA rule -- a 1px border needs 3:1 as a non-text element, and a
      // hairline that vanishes is the single thing that makes fake glass read
      // as a flat rectangle.
      const border = composite(glass[mode].border, surface);
      expect(contrast(border, surface)).toBeGreaterThanOrEqual(1.2);
    });
  }
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/mobile test -t 'glass surfaces'`
Expected: FAIL — no `glass`, `bloom`, or `composite` export.

- [x] **Step 3: Add the compositor**

`apps/mobile/src/testing/rgb.ts`:

```ts
/**
 * Flatten an `rgba(r, g, b, a)` layer onto an opaque `#rrggbb` backdrop.
 *
 * Fake glass is a translucent fill, so the colour a user actually reads text
 * against exists nowhere in the token file -- it is the fill over whatever the
 * bloom put behind it. Without this, every contrast assertion measures a
 * backdrop that never appears on screen.
 */
export function composite(layer: string, backdrop: string): string {
  const match = /^rgba?\(([^)]+)\)$/.exec(layer.trim());
  if (!match?.[1]) throw new Error(`composite expects rgba(), got ${layer}`);
  const parts = match[1].split(',').map((p) => Number(p.trim()));
  const [r, g, b, a = 1] = parts;
  if (parts.length < 3 || parts.some((p) => Number.isNaN(p))) {
    throw new Error(`composite could not parse ${layer}`);
  }
  const back = [1, 3, 5].map((i) => parseInt(backdrop.slice(i, i + 2), 16));
  const mix = [r!, g!, b!].map((c, i) => Math.round(c * a + back[i]! * (1 - a)));
  return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
```

- [x] **Step 4: Add the tokens**

`apps/mobile/src/theme/tokens.ts`, after `themeColors`:

```ts
/** The radial wash behind every screen. Two stops, drawn once by <Bloom>.
 *
 *  Geometry matches the mockups: a 120%-wide, 66%-tall ellipse centred at
 *  18% / -6%, so the hot corner sits off the top-left edge and the bottom two
 *  thirds of the screen fall back to the flat page colour. */
export const bloom = {
  light: { cx: '18%', cy: '-6%', rx: '120%', ry: '66%', stops: ['rgba(31,111,91,0.16)', 'rgba(31,111,91,0)'] },
  dark: { cx: '18%', cy: '-6%', rx: '120%', ry: '66%', stops: ['rgba(31,111,91,0.62)', 'rgba(31,111,91,0)'] },
} as const;

/** Fake glass: a translucent fill, a hairline, an inset top highlight and a
 *  drop shadow. Not blur -- React Native has no backdrop-filter, and
 *  expo-blur's Android path (dimezisBlurView) renders the view tree a second
 *  time per blurred surface (owner ruling 2026-08-24, umbrella decision 7).
 *
 *  Light mode is a much heavier fill than dark: over warm paper a 7.5% white
 *  wash is invisible, and the card has to separate from the page for the
 *  hairline to mean anything. */
export const glass = {
  light: {
    fill: 'rgba(255,253,248,0.72)',
    border: 'rgba(31,111,91,0.16)',
    highlight: 'rgba(255,255,255,0.90)',
    shadow: {
      shadowColor: '#3a3227',
      shadowOpacity: 0.10,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
  },
  dark: {
    fill: 'rgba(255,255,255,0.075)',
    border: 'rgba(255,255,255,0.14)',
    highlight: 'rgba(255,255,255,0.18)',
    shadow: {
      shadowColor: '#000000',
      shadowOpacity: 0.36,
      shadowRadius: 19,
      shadowOffset: { width: 0, height: 16 },
      elevation: 10,
    },
  },
} as const;

/** Corner radii. 20 is the card in every mockup; 28 is the docked bar and the
 *  tab pill; 12 is a chip. */
export const radii = { chip: 12, card: 20, pill: 28 } as const;
```

- [x] **Step 5: Run the test**

Run: `pnpm --filter @quran-corpus/mobile test -t 'glass surfaces'`
Expected: PASS. If the light fill fails AA, raise its alpha — do **not** lower
the threshold and do not change `themeColors`.

- [x] **Step 6: Mutation-check the gate (§4)**

Drop the light fill to `rgba(255,253,248,0.10)` and re-run. Expected: the light
body-text assertion FAILS. Restore by re-editing the value back to `0.72` — do
**not** `git checkout` the file (`[[never-git-checkout-to-undo-a-mutation]]`).
Then re-run and confirm green.

- [x] **Step 7: Commit**

```bash
git add apps/mobile/src/theme/tokens.ts apps/mobile/src/theme/tokens.test.ts \
        apps/mobile/src/testing/rgb.ts
git commit -m "feat(mobile): add glass and bloom tokens with an AA gate"
```

---

### Task 3: The bloom backdrop

**Files:**
- Create: `apps/mobile/src/components/Bloom.tsx`
- Create: `apps/mobile/src/components/Bloom.test.tsx`
- Modify: `apps/mobile/src/test/setup.ts`

**Interfaces:**
- Produces: `<Bloom />` from `@/components/Bloom`. No props. Absolutely
  positioned, `pointerEvents="none"`, fills its parent. Mounted once in
  `app/_layout.tsx` (Task 6).

- [x] **Step 1: Extend the react-native-svg mock**

`src/test/setup.ts` stubs only `Svg` and `Path` today, so `<Defs>` would render
as `undefined`. Add the four elements the bloom needs:

```ts
vi.mock('react-native-svg', async () => {
  const React = await import('react');
  const el = (tag: string) =>
    ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(tag, props, children);
  const Svg = el('svg');
  return {
    default: Svg,
    Svg,
    Path: (props: { d: string }) => React.createElement('path', props),
    Defs: el('defs'),
    RadialGradient: el('radialGradient'),
    Stop: el('stop'),
    Rect: el('rect'),
  };
});
```

- [x] **Step 2: Write the failing test**

`apps/mobile/src/components/Bloom.test.tsx`:

```tsx
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Bloom } from './Bloom';
import { ThemeContext } from '@/theme/themeContext';
import { bloom } from '@/theme/tokens';
import { themeColors } from '@/theme/tokens';

describe('Bloom', () => {
  afterEach(cleanup);

  it('draws the dark bloom stops when the dark theme is active', () => {
    const { container } = render(
      <ThemeContext.Provider value={themeColors.dark}>
        <Bloom />
      </ThemeContext.Provider>,
    );

    const stops = [...container.querySelectorAll('stop')].map((s) => s.getAttribute('stopColor'));
    expect(stops).toEqual([...bloom.dark.stops]);
  });

  it('draws the light bloom stops when the light theme is active', () => {
    // Not a duplicate of the test above: the component picks its stops off the
    // theme, and a hardcoded `bloom.dark` renders the night wash over warm
    // paper -- which looks deliberate enough that a screenshot would not catch it.
    const { container } = render(
      <ThemeContext.Provider value={themeColors.light}>
        <Bloom />
      </ThemeContext.Provider>,
    );

    const stops = [...container.querySelectorAll('stop')].map((s) => s.getAttribute('stopColor'));
    expect(stops).toEqual([...bloom.light.stops]);
  });
});
```

- [x] **Step 3: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/mobile test Bloom`
Expected: FAIL — module not found.

- [x] **Step 4: Write the component**

```tsx
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { bloom, themeColors } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/**
 * The radial wash the whole app sits on.
 *
 * One instance, mounted behind the navigator in app/_layout.tsx and never
 * re-rendered -- a per-screen copy would repaint a full-screen gradient on
 * every navigation, which is the frame budget the mid-range target does not
 * have. It is `pointerEvents="none"` so it cannot eat a touch.
 *
 * SVG rather than a stack of translucent Views: RN has no CSS gradient, and
 * faking a radial one with concentric views banded visibly on the device.
 * react-native-svg was already a dependency (Icon draws through it).
 */
export function Bloom() {
  const theme = useThemeColors();
  const isDark = theme.background === themeColors.dark.background;
  const wash = isDark ? bloom.dark : bloom.light;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="bloom" cx={wash.cx} cy={wash.cy} rx={wash.rx} ry={wash.ry}>
            {wash.stops.map((stop, index) => (
              <Stop
                key={stop}
                offset={index === 0 ? '0' : '1'}
                stopColor={stop}
              />
            ))}
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#bloom)" />
      </Svg>
    </View>
  );
}
```

- [x] **Step 5: Run the test**

Run: `pnpm --filter @quran-corpus/mobile test Bloom`
Expected: PASS (both cases).

- [x] **Step 6: Mutation-check (§4)**

Replace `isDark ? bloom.dark : bloom.light` with `bloom.dark`. Expected: the
light test FAILS. Restore by re-editing.

- [x] **Step 7: Commit**

```bash
git add apps/mobile/src/components/Bloom.tsx apps/mobile/src/components/Bloom.test.tsx \
        apps/mobile/src/test/setup.ts
git commit -m "feat(mobile): draw the radial bloom backdrop"
```

---

### Task 4: The glass surface primitive

**Files:**
- Create: `apps/mobile/src/components/GlassSurface.tsx`
- Create: `apps/mobile/src/components/GlassSurface.test.tsx`

**Interfaces:**
- Produces:

```ts
export interface GlassSurfaceProps {
  children: ReactNode;
  /** card (20) by default; pill (28) for docked bars and the tab pill. */
  radius?: keyof typeof radii;
  /** Extra layout style. Colour and border are the component's own. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}
export function GlassSurface(props: GlassSurfaceProps): JSX.Element;
```

Every M6 sub-phase builds its cards, sheets and bars out of this. Nothing else
may hand-roll the fill/border/highlight triple.

- [x] **Step 1: Write the failing test**

```tsx
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());

import { GlassSurface } from './GlassSurface';
import { ThemeContext } from '@/theme/themeContext';
import { glass, radii, themeColors } from '@/theme/tokens';

describe('GlassSurface', () => {
  afterEach(cleanup);

  it('fills and outlines itself from the active theme', () => {
    render(
      <ThemeContext.Provider value={themeColors.dark}>
        <GlassSurface testID="card">{null}</GlassSurface>
      </ThemeContext.Provider>,
    );

    const card = screen.getByTestId('card');
    expect(card.style.backgroundColor).toBe(glass.dark.fill);
    expect(card.style.borderColor).toBe(glass.dark.border);
  });

  it('draws the inset highlight as a child, not as a border', () => {
    // The highlight is the top 1px of the card and the whole reason the fill
    // reads as glass rather than as a grey rectangle. A borderTopColor cannot
    // express it -- RN paints borders on all four edges at one width unless
    // each side is set, and per-side borders disable the shadow on Android.
    render(
      <ThemeContext.Provider value={themeColors.dark}>
        <GlassSurface testID="card">{null}</GlassSurface>
      </ThemeContext.Provider>,
    );

    expect(screen.getByTestId('card-highlight').style.backgroundColor).toBe(glass.dark.highlight);
  });

  it('takes its radius from the named token', () => {
    render(
      <ThemeContext.Provider value={themeColors.light}>
        <GlassSurface testID="bar" radius="pill">{null}</GlassSurface>
      </ThemeContext.Provider>,
    );

    expect(screen.getByTestId('bar').style.borderRadius).toBe(`${radii.pill}px`);
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/mobile test GlassSurface`
Expected: FAIL — module not found.

- [x] **Step 3: Write the component**

```tsx
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { glass, radii, themeColors } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface GlassSurfaceProps {
  children: ReactNode;
  radius?: keyof typeof radii;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A card, bar or sheet made of fake glass: translucent fill, hairline border,
 * inset top highlight, drop shadow.
 *
 * The highlight is a 1px absolutely-positioned child rather than a
 * borderTopColor, because RN's Android renderer drops the shadow entirely once
 * the four border sides differ -- and the shadow is what separates the card
 * from the bloom.
 *
 * ponytail: no blur variant, no elevation prop, no "intensity". One surface,
 * two themes. Add a variant when a screen actually needs a second one.
 */
export function GlassSurface({ children, radius = 'card', style, testID }: GlassSurfaceProps) {
  const theme = useThemeColors();
  const isDark = theme.background === themeColors.dark.background;
  const skin = isDark ? glass.dark : glass.light;

  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: skin.fill,
          borderColor: skin.border,
          borderWidth: 1,
          borderRadius: radii[radius],
          overflow: 'hidden',
          ...skin.shadow,
        },
        style,
      ]}
    >
      <View
        testID={testID ? `${testID}-highlight` : undefined}
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          backgroundColor: skin.highlight,
        }}
      />
      {children}
    </View>
  );
}
```

- [x] **Step 4: Run the test**

Run: `pnpm --filter @quran-corpus/mobile test GlassSurface`
Expected: PASS (three cases).

- [x] **Step 5: Mutation-check (§4)**

Change `radii[radius]` to the literal `radii.card`. Expected: the pill test
FAILS. Restore by re-editing.

- [x] **Step 6: Commit**

```bash
git add apps/mobile/src/components/GlassSurface.tsx apps/mobile/src/components/GlassSurface.test.tsx
git commit -m "feat(mobile): add the GlassSurface primitive"
```

---

### Task 5: Press motion

Decision 12: restrained motion — sheets, tabs, presses. Presses are the one that
touches every screen, so it lives in the design system.

**Files:**
- Create: `apps/mobile/src/motion/usePressScale.ts`
- Create: `apps/mobile/src/motion/usePressScale.test.ts`

**Interfaces:**
- Produces:

```ts
export function usePressScale(): {
  scale: SharedValue<number>;
  onPressIn: () => void;
  onPressOut: () => void;
  style: { transform: [{ scale: number }] };
};
```

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { PRESSED_SCALE, RESTING_SCALE, nextPressScale } from './usePressScale';

describe('nextPressScale', () => {
  it('shrinks on press and returns on release', () => {
    expect(nextPressScale('in', false)).toBe(PRESSED_SCALE);
    expect(nextPressScale('out', false)).toBe(RESTING_SCALE);
  });

  it('does not move at all when reduced motion is on', () => {
    // Not cosmetic: a scale transform on press is exactly the vestibular
    // trigger the setting exists for, and it is the one animation that fires
    // on literally every tap in the app.
    expect(nextPressScale('in', true)).toBe(RESTING_SCALE);
    expect(nextPressScale('out', true)).toBe(RESTING_SCALE);
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/mobile test usePressScale`
Expected: FAIL — module not found.

- [x] **Step 3: Write the hook**

```ts
import { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from './useReducedMotion';

export const RESTING_SCALE = 1;
export const PRESSED_SCALE = 0.97;

/** Pure so the branch is testable without a reanimated runtime. */
export function nextPressScale(phase: 'in' | 'out', reduceMotion: boolean): number {
  if (reduceMotion) return RESTING_SCALE;
  return phase === 'in' ? PRESSED_SCALE : RESTING_SCALE;
}

/** A 3% squeeze on press, 120ms each way. The only motion on a plain tap.
 *
 *  Spread onto a Pressable: `<Pressable {...press} style={press.style}>` where
 *  `press.style` is the animated style -- the Pressable must be
 *  Animated.createAnimatedComponent(Pressable) for the transform to apply. */
export function usePressScale() {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(RESTING_SCALE);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return {
    scale,
    style,
    onPressIn: () => {
      scale.value = withTiming(nextPressScale('in', reduceMotion), { duration: 120 });
    },
    onPressOut: () => {
      scale.value = withTiming(nextPressScale('out', reduceMotion), { duration: 120 });
    },
  };
}
```

- [x] **Step 4: Run the test**

Run: `pnpm --filter @quran-corpus/mobile test usePressScale`
Expected: PASS.

- [x] **Step 5: Mutation-check (§4)**

Delete the `if (reduceMotion)` line. Expected: the reduced-motion test FAILS on
both assertions. Restore by re-editing.

- [x] **Step 6: Commit**

```bash
git add apps/mobile/src/motion/usePressScale.ts apps/mobile/src/motion/usePressScale.test.ts
git commit -m "feat(mobile): add the shared press-scale motion hook"
```

---

### Task 6: Mount the bloom, glass the chrome

**Files:**
- Modify: `apps/mobile/app/_layout.tsx:99-124` (`AppStack`)
- Modify: `apps/mobile/app/(tabs)/_layout.tsx` (whole file)
- Create: `apps/mobile/src/components/GlassTabBar.tsx`
- Create: `apps/mobile/src/components/GlassTabBar.test.tsx`

**Interfaces:**
- Consumes: `<Bloom />` (Task 3), `<GlassSurface>` (Task 4), `usePressScale`
  (Task 5), `Icon` / `IconName` (unchanged), `useSafeAreaInsets`.
- Produces: `<GlassTabBar {...props} />` accepting expo-router's
  `BottomTabBarProps`. Referenced as `<Tabs tabBar={(props) => <GlassTabBar {...props} />}>`.

The tab bar becomes a floating pill over the bloom (mockups `1a`, `1d`). Screen
backgrounds go transparent so the single bloom shows through everywhere.

- [x] **Step 1: Write the failing test**

```tsx
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());

import { GlassTabBar } from './GlassTabBar';
import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';

function props(index: number) {
  return {
    state: {
      index,
      routes: [
        { key: 'index', name: 'index' },
        { key: 'surahs', name: 'surahs' },
        { key: 'morphology', name: 'morphology' },
        { key: 'dictionary', name: 'dictionary' },
        { key: 'menu', name: 'menu' },
      ],
    },
    descriptors: {},
    navigation: { navigate: vi.fn(), emit: () => ({ defaultPrevented: false }) },
  } as never;
}

describe('GlassTabBar', () => {
  afterEach(cleanup);

  it('renders one button per route', () => {
    render(
      <ThemeContext.Provider value={themeColors.dark}>
        <GlassTabBar {...props(0)} />
      </ThemeContext.Provider>,
    );

    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  it('marks the active route selected and tints it with the accent', () => {
    render(
      <ThemeContext.Provider value={themeColors.dark}>
        <GlassTabBar {...props(2)} />
      </ThemeContext.Provider>,
    );

    const tabs = screen.getAllByRole('tab');
    expect(tabs[2]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('tab-morphology-label').style.color).toBe(themeColors.dark.accent);
    expect(screen.getByTestId('tab-index-label').style.color).toBe(themeColors.dark.mutedText);
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/mobile test GlassTabBar`
Expected: FAIL — module not found.

- [x] **Step 3: Write the tab bar**

```tsx
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from './GlassSurface';
import { Icon, type IconName } from './icons/Icon';
import { t, type UiStringKey } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** Route name -> glyph and label. Keyed by route so a reordered <Tabs> cannot
 *  silently pair the wrong icon with the wrong screen. */
const TABS: Record<string, { icon: IconName; label: UiStringKey }> = {
  index: { icon: 'home', label: 'tabs.home' },
  surahs: { icon: 'book', label: 'tabs.surahs' },
  morphology: { icon: 'words', label: 'tabs.morphology' },
  dictionary: { icon: 'dictionary', label: 'tabs.dictionary' },
  menu: { icon: 'menu', label: 'tabs.menu' },
};

/**
 * The floating glass pill that replaces the default tab bar.
 *
 * Rendered as `tabBar` rather than styled through `tabBarStyle`: the design
 * floats it clear of the screen edge with the bloom visible underneath, and
 * `tabBarStyle` can only recolour a bar that is still a full-width opaque
 * strip pinned to the bottom.
 */
export function GlassTabBar({ state, navigation }: BottomTabBarProps) {
  const theme = useThemeColors();
  const { uiLocale } = useAppSettings();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 12 }}
    >
      <GlassSurface radius="pill" style={{ flexDirection: 'row', paddingVertical: 6 }}>
        {state.routes.map((route, index) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const focused = state.index === index;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={t(uiLocale, tab.label)}
              onPress={() => {
                // emit() first so a tab press on the already-focused tab can be
                // cancelled by a screen listening for it (the reader uses this
                // to scroll to top rather than re-navigate).
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={{ flex: 1, alignItems: 'center', gap: 2, minHeight: touchTargets.minimum, justifyContent: 'center' }}
            >
              <Icon name={tab.icon} color={focused ? theme.accent : theme.mutedText} size={22} />
              <Text
                testID={`tab-${route.name}-label`}
                numberOfLines={1}
                style={{ color: focused ? theme.accent : theme.mutedText, fontSize: typography.caption - 2 }}
              >
                {t(uiLocale, tab.label)}
              </Text>
            </Pressable>
          );
        })}
      </GlassSurface>
    </View>
  );
}
```

- [x] **Step 4: Wire it into the navigators**

`apps/mobile/app/(tabs)/_layout.tsx` — the whole `screenOptions` block collapses,
because the bar draws itself and the bloom draws the background:

```tsx
import { Tabs } from 'expo-router';
import { GlassTabBar } from '@/components/GlassTabBar';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // The bloom in app/_layout.tsx is the background for every screen; an
        // opaque scene would cover it and leave the tab pill floating over a
        // flat rectangle.
        sceneStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="surahs" />
      <Tabs.Screen name="morphology" />
      <Tabs.Screen name="dictionary" />
      <Tabs.Screen name="menu" />
    </Tabs>
  );
}
```

Headers are off because each tab screen draws its own glass header from M6b
onward. Titles and icons moved into `GlassTabBar`'s `TABS` map, which is why
they leave here — one place, not two.

`apps/mobile/app/_layout.tsx`, `AppStack`:

```tsx
function AppStack() {
  const theme = useThemeColors();
  return (
    <View style={{ flex: 1 }}>
      <Bloom />
      <Stack
        screenOptions={{
          headerTransparent: true,
          headerStyle: { backgroundColor: 'transparent' },
          headerTintColor: theme.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: 'transparent' },
          title: '',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </View>
  );
}
```

Import `Bloom` and RN's `View` at the top of the file.

- [x] **Step 5: Fix the list padding**

`useListBottomPadding` currently adds `insets.bottom`. The tab pill now floats
`insets.bottom + 12` up and stands ~64pt tall, so every tab-hosted list needs
clearance or its last row sits under the pill. Bump the constant inside
`apps/mobile/src/theme/useListBottomPadding.ts`:

```ts
/** Clearance for the floating tab pill (M6a): it is ~64pt tall and sits 12pt
 *  above the safe-area inset, so a list that only cleared the inset now ends
 *  underneath it. Applied on every scrolling screen, including the stack ones
 *  where no pill is shown -- over-padding the end of a scroll is invisible and
 *  one rule beats a per-screen guess about which navigator is hosting a shared
 *  component (WbwScreen renders under both). */
const TAB_PILL_CLEARANCE = 88;
```

…and add it to the returned sum. Keep the existing comment; this one goes above
the new constant.

- [x] **Step 6: Run everything**

Run: `pnpm --filter @quran-corpus/mobile test && pnpm -r type-check && pnpm -r lint`
Expected: PASS. Route tests under `src/test/routes/` render these layouts —
expect to update their assertions where they asserted the old header options.

- [x] **Step 7: Mutation-check (§4)**

In `GlassTabBar`, change `state.index === index` to `false`. Expected: the
selected/accent test FAILS. Restore by re-editing.

- [x] **Step 8: Commit**

```bash
git add apps/mobile/app/_layout.tsx 'apps/mobile/app/(tabs)/_layout.tsx' \
        apps/mobile/src/components/GlassTabBar.tsx apps/mobile/src/components/GlassTabBar.test.tsx \
        apps/mobile/src/theme/useListBottomPadding.ts apps/mobile/src/test/routes
git commit -m "feat(mobile): float a glass tab pill over the bloom"
```

---

### Task 7: Preview build — DEFERRED

**Files:** none.

EAS builds are unavailable until 2026-09-01 (the account's free build window),
so no `preview` APK exists for this milestone. Task 9 ran through Expo Go over
adb-wifi instead. Deferred, not skipped: the first M6 APK will be built when
the window reopens, and checks 48-54 are re-run against it then.

- [ ] **Step 1: Build** — blocked until 2026-09-01

```bash
cd apps/mobile
pnpm prebuild:assert-db
eas build --platform android --profile preview
```

- [ ] **Step 2: Record the build id** — blocked with Step 1

Write the EAS build id and the head commit into this plan's verification log
below.

---

### Task 8: Docs — PRD renumber and superseded checks

**Files:**
- Modify: `docs/PRD-android-first-mobile-app.md:383-460` (§10)
- Modify: `README.md` ("Current Status" and the device checklist)
- Modify: `STATUS.md`

- [x] **Step 1: Renumber the PRD**

Apply umbrella §"PRD renumbering" exactly: insert **M6: Glass Redesign**, shift
hardening → M7, treebank → M8, iOS → M9, and correct M1's audio line to Husary
streamed per-ayah from the public source.

- [x] **Step 2: Mark the superseded device checks**

In `README.md`, against the M2 rosette carry-over, M3 Run 3 (F5, F6, 27) and M4
Run 1 (28–33), write:

> Superseded by M6 — the screen under test is redrawn in
> `docs/plans/phase-m6-glass-redesign.md`. Not run; see checks 48+.

Do not delete the rows. The record of what was never verified is the point.

- [x] **Step 3: Add device checks 48–54**

Append to `README.md`'s checklist:

| # | Check | Pass condition |
| --- | --- | --- |
| 48 | Fake glass on a real panel, both themes | Cards read as translucent over the bloom; the hairline and top highlight are both visible. **This is decision 8's gate** — if it reads flat, stop and ask about `expo-blur` |
| 49 | Scroll a long surah (2, al-Baqarah) top to bottom | No dropped frames attributable to the bloom; it does not repaint on scroll |
| 50 | Switch theme in Settings with a tab screen open | Bloom and every glass surface flip together; no flash of the other theme |
| 51 | Tab pill: tap all five tabs | Correct screen each time; active tab tinted accent; pill clears the gesture bar |
| 52 | Any long list, scrolled to the very end | Last row clears the floating pill; nothing is hidden under it |
| 53 | Newsreader renders | Headings are the serif, not the system face; no tofu, no mid-screen fallback |
| 54 | Reduced motion on (system setting) | Press-scale does not fire; nothing else animates on tap |

- [x] **Step 4: Update STATUS.md**

One line: M6a implementation complete, device run pending. Keep it short —
`[[ledger-prose-feeds-review-rounds]]`.

- [x] **Step 5: Commit**

```bash
git add docs/PRD-android-first-mobile-app.md README.md STATUS.md
git commit -m "docs: renumber PRD milestones for M6 and open the M6a checklist"
```

---

### Task 9: Device run

- [x] **Step 1:** Run the app on the owner's device. Task 7's APK does not
  exist (see above), so this was Expo Go over adb-wifi -- same JS bundle, same
  device, but not a release binary. Anything build-profile-specific (release
  ProGuard/Hermes behaviour, the bundled DB asset path) is therefore *not*
  covered and is re-checked when the APK is built.
- [x] **Step 2:** Ran checks 48-54, both themes.
- [x] **Step 3:** Recorded in the log below. Three findings: two chrome-inset
  defects fixed in `746ddaf` and re-run, and check 48's fail, which the owner
  parked to M6b rather than opening a fix task here. That overrides this step's
  "it does not move to M6b" -- see the ruling in the log.
- [ ] **Step 4:** ~~Only once every check is `pass`~~ -- 48 is a parked fail, so
  this gate is waived by the same ruling. Ask the owner to open the PR (never
  `gh pr create` unprompted) and to run `/code-review` **only if** they want it
  -- §5 does not require one here.

## Verification Log

Implementation complete at `c978b79` (Tasks 1-6) and `c1e242e` (Task 8), plus
the device-run fix at `746ddaf`; 506 tests, type-check and lint green. Task 9's
device run is done (below). Task 7 is deferred -- EAS is unavailable until
2026-09-01, so nothing has been seen in a release binary.

Two decisions taken during execution, both beyond what the plan specified:

- **Task 2 rejected the mockup's dark glass fill.** `rgba(255,255,255,.075)`
  over the .62 bloom composites to #1b4c3f, where mutedText is 3.83:1 and the
  accent 3.35:1 -- both under AA, and a whiter fill makes it worse rather than
  better. The dark card is filled with the night page colour at 45% instead:
  it smokes over the bloom (accent 4.65:1) and is invisible on unbloomed
  ground, so it never reads as a recess. The alternative was cutting the dark
  bloom from .62 to .12, which also passes but removes the wash the design is
  built around. Both are two-value flips; the tests hold either way.
- **Task 6's `useListBottomPadding` replaces its `+ 24` rather than adding to
  it.** inset + 24 + 88 would leave an eighth of the screen empty under the
  last row of every stack screen.

Three shared test shims grew, each once rather than per suite: `StyleSheet` in
`rnHosts`, the SVG gradient elements in `setup.ts`, and a reanimated mock. The
last one matters beyond M6a -- suites had been steering around reanimated by
never rendering `BottomSheet`, and from here every pressable component reaches
it.

### Device run 1 -- 2026-08-24, Expo Go at `746ddaf`

No APK: see Task 7. Owner's physical Android device over adb-wifi, both themes.

| Check | Build | Date | Result | Notes |
| --- | --- | --- | --- | --- |
| 48 | Expo Go `746ddaf` | 2026-08-24 | **fail** -- parked to M6b (owner, 2026-08-24) | The pill reads as an outlined hole, not as glass. Measured on the Surahs list: page above the pill `(21,20,18)`, inside it `(18,17,16)` -- the fill darkens what is behind it by three levels out of 255, so a row's text runs straight through and tangles with the tab labels. Two causes: the bloom is a top-left glow (`cy -6%`, `ry 66%`) that has faded to nothing by 58% of the screen height while the pill floats at 92%, so there is nothing behind it to see through; and `night` at 45% over a `night` page is the page. See the ruling below |
| 49 | Expo Go `746ddaf` | 2026-08-24 | pass | Surah 2 top to end; the wash is a sibling of the scroller, not a child, so it does not repaint or shift |
| 50 | Expo Go `746ddaf` | 2026-08-24 | pass | Wash and every glass surface flip together; no intermediate frame of the other theme |
| 51 | Expo Go `746ddaf` | 2026-08-24 | pass | All five tabs route correctly, active tab accent-tinted, pill clears the gesture bar; re-tapping the active tab does not navigate |
| 52 | Expo Go `746ddaf` | 2026-08-24 | pass | Last row clears the pill on the dictionary browse list |
| 53 | -- | 2026-08-24 | not exercisable at M6a | Newsreader loads in `openCorpusDb.ts` and `typography.display` names it, but no component sets it as `fontFamily` yet. There is no heading on screen that *could* render as the serif, so the check cannot fail here. Moves to the sub-phase that consumes it |
| 54 | -- | 2026-08-24 | not exercisable at M6a | `usePressScale` has no consumer outside its own module. Nothing on screen animates on press, so "it does not shrink" passes vacuously. Moves with 53 |

**Check 48: fail, parked to M6b (owner ruling, 2026-08-24).**

The gate's stop-condition fired, so `expo-blur` was put back on the table as
umbrella decision 8 requires. The owner declined it and parked the whole
question instead. The reasoning, recorded here because the next person to read
this will otherwise reopen it:

- **Blur does not fix the case that failed.** The Home tab has nothing behind
  the pill at all -- no bloom that far down, no content. A backdrop blur of a
  flat colour returns that flat colour, so the screen that read worst would look
  identical with `expo-blur` installed. It only helps where content scrolls
  under the surface, and there a heavier fill fixes the legibility half more
  cheaply than a second render of the view tree.
- **The tab pill is the worst possible test surface for this design.** It is the
  one element furthest from the wash, and it is the only `GlassSurface` consumer
  in the app. M6b puts real cards on the home screen, in the top half, over the
  bloom -- which is the composition the tokens were actually calibrated against.
  Judging fake glass on the one surface it was not designed for, and then paying
  for a dependency on that reading, is the wrong order.
- **The bloom stays as drawn.** `.62` and `ry 66%` are unchanged; the owner
  ruled the corner glow correct and its falloff intentional.

So M6a ships with 48 outstanding. Re-run it in M6b against the home cards
(Task 8 there carries the row). If it reads flat over *those*, the tokens are
wrong rather than the test surface, and `expo-blur` becomes a live §12 question
again.

**Findings, both fixed in `746ddaf` and re-verified on device:**

- **Stack screens rendered their own heading under the back arrow.** Task 5 set
  `headerTransparent: true` to keep the bloom continuous through the header
  band, but that flag also stops the navigator insetting the content --
  "Settings" sat on top of "Language", "Al-Baqara" on top of "The Cow". Dropping
  the flag while keeping `headerStyle.backgroundColor: 'transparent'` gives both:
  the native toolbar honours the transparent colour, and the bloom is an
  `absoluteFill` sibling behind the whole navigator, so it still shows through.
  Verified by sampling a pixel column down through the header band -- the
  gradient is monotonic, with no seam where the toolbar ends.
- **Tab screens rendered under the status bar.** `headerShown: false` on the tab
  group removed the header that had been the only thing insetting them, so the
  first row of every tab sat under the clock. The top inset now comes from
  `sceneStyle` in `app/(tabs)/_layout.tsx` -- one place rather than five
  screens. `GlassTabBar` keeps reading its *bottom* inset from the navigator's
  props, so the two do not disagree.

No test accompanies `746ddaf`: the change is two navigator options, and an
assertion against react-navigation's own layout resolution passes whichever way
the flags sit. The device screenshots are the check. Add one if it breaks twice.
