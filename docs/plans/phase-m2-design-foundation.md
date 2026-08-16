# M2 Design Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mobile stops looking generic — real tab icons, the mushaf ayah medallion, and one shared home for the colour scales.

**Architecture:** New dependency-free `packages/config/theme/palette.ts` holds the paper/night/accent scales; the Tailwind preset and mobile's `tokens.ts` both import it. `react-native-svg` arrives and web's hand-written SVG paths port over verbatim.

**Tech Stack:** TypeScript, Expo SDK 57 / RN 0.86, expo-router Tabs, react-native-svg, vitest + @testing-library/react (jsdom, `react-native` mocked).

**Spec:** `docs/superpowers/specs/2026-08-16-mobile-design-foundation-design.md`

## Global Constraints

- No `packages/data` change. No schema, no query, no user-DB write. M2 therefore needs no §5 independent review.
- `packages/config` ships raw `.ts`, no build step. New files there stay dependency-free — jiti, Next's bundler and Metro all read them.
- Mobile accent stays green (`#1f6f5b` / `#5aa58d`). Web accent stays terracotta (`accent-500 #bd5f30`). Owner ruling 2026-08-16. Parity covers the paper and night neutrals only.
- Mobile's warm neutrals (`surface #fffdf8`, `muted #7b7165`, `border #ded6c9`, `night #151412`, `nightText #f1ede4`) have no web counterpart. Leave them local. Web `night` is pure grey, mobile's is warm — do not round one to the other.
- `react-native-svg` is a native module. M2 ships as a fresh sideload, never an OTA on the M1 APK.
- Install with `npx expo install react-native-svg` (SDK-57 pin). No `react-native-svg-transformer` — there are no `.svg` files, only hand-written paths.
- Conventional Commits, one logical change per commit (CLAUDE.md §9).

**Honest scope note:** today the shared module shares exactly two hexes with mobile (`paper-50`, `paper-900`) — everything else in `tokens.ts` legitimately diverges. It is built now because M3 moves `--pos-*`/`--form-*`/`--ease-out` into it plus the `posColor` bucket split, and that is where it starts paying. If M3 slips indefinitely, Task 1 is the task to cut.

---

### Task 1: Shared palette module

**Files:**
- Create: `packages/config/theme/palette.ts`
- Modify: `packages/config/package.json` (exports map)
- Modify: `packages/config/tailwind/preset.ts:19-54`

**Interfaces:**
- Consumes: nothing.
- Produces: `paper`, `night`, `accent` — each `Record<50|100|200|300|400|500|600|700|800|900, string>`, importable as `@quran-corpus/config/theme/palette`.

No new test here. The three scales become single-source the moment the preset imports them, so there is nothing left to drift; a test asserting the hexes would just be a second copy. The guard is web's existing suite plus a build, and Task 2's `tokens.test.ts` pins `paper-50`/`paper-900` by value.

- [ ] **Step 1: Write the module**

Create `packages/config/theme/palette.ts`. Hexes are moved verbatim from `preset.ts` — no value changes in this task.

```ts
// Shared colour scales for web and mobile.
//
// Plain TypeScript, zero dependencies, deliberately: three different loaders
// read this file -- jiti (Tailwind config), Next's bundler, and Metro. Do not
// import tailwindcss types here, do not add a build step, do not compile to
// .js. Same rule as tailwind/preset.ts next door.
//
// Scope: the neutral scales plus web's brand accent. The --pos-*/--form-*
// tokens still live in apps/web/src/app/globals.css with their contrast-ratio
// commentary; they move here in M3, when mobile's morphology pills become the
// second consumer.

export const paper = {
  50: '#faf8f3',
  100: '#f3efe6',
  200: '#e8e0d0',
  300: '#d4c9b0',
  400: '#b8a88a',
  500: '#9e8c6e',
  600: '#7d6d52',
  700: '#5e5040',
  800: '#3e3429',
  900: '#1f1a14',
};

export const night = {
  50: '#2a2a2a',
  100: '#242424',
  200: '#1e1e1e',
  300: '#181818',
  400: '#141414',
  500: '#111111',
  600: '#0e0e0e',
  700: '#0a0a0a',
  800: '#080808',
  900: '#050505',
};

// Web's brand accent. Mobile keeps its own green -- see the note in
// apps/mobile/src/theme/tokens.ts.
export const accent = {
  50: '#fdf3ee',
  100: '#f8e0d1',
  200: '#eec0a3',
  300: '#e19d74',
  400: '#d17a48',
  500: '#bd5f30',
  600: '#9c4d27',
  700: '#7a3d20',
  800: '#572c18',
  900: '#351a0e',
};
```

- [ ] **Step 2: Add the export**

In `packages/config/package.json`, add one entry to `exports`, leaving the others untouched:

```json
    "./tailwind/preset": "./tailwind/preset.ts",
    "./theme/palette": "./theme/palette.ts",
```

- [ ] **Step 3: Point the preset at it**

In `packages/config/tailwind/preset.ts`, add the import below the existing `Config` type import and replace the three literal scale objects inside `theme.extend.colors`. `darkMode`, `fontFamily` and the file's top comment stay exactly as they are.

```ts
import type { Config } from 'tailwindcss';
import { accent, night, paper } from '../theme/palette';
```

```ts
      colors: {
        paper,
        night,
        accent,
      },
```

- [ ] **Step 4: Prove web is unmoved**

Run, from the repo root:

```bash
pnpm --filter @quran-corpus/web type-check
pnpm --filter @quran-corpus/web test
pnpm --filter @quran-corpus/web build
```

Expected: all three pass. The build is the one that matters — it is jiti loading the preset through the new relative TS import. A `Cannot find module '../theme/palette'` here means the import path is wrong, not that the approach is.

Do not start `next build` while a `next dev` server is running on this repo — they share `.next` and it breaks the dev server.

- [ ] **Step 5: Commit**

```bash
git add packages/config/theme/palette.ts packages/config/package.json packages/config/tailwind/preset.ts
git commit -m "refactor(config): give the colour scales one home

Mobile needs the same paper and night neutrals the web preset holds, and
copying them is how packages/data got forked once already. The scales move
to a dependency-free module both loaders can read; the preset imports what
it used to declare, so web's classes are byte-identical."
```

---

### Task 2: Mobile reads the palette

**Files:**
- Modify: `apps/mobile/package.json` (dependency move)
- Modify: `apps/mobile/src/theme/tokens.ts:1-9`
- Create: `apps/mobile/src/theme/tokens.test.ts`

**Interfaces:**
- Consumes: `paper` from `@quran-corpus/config/theme/palette` (Task 1).
- Produces: `colors`, `themeColors.light`, `themeColors.dark` — unchanged shapes and unchanged values. `ThemeColors` in `themeContext.ts` is derived from `themeColors.light`, so no consumer changes.

This is the task that proves Metro can resolve the package export. Nothing later depends on the palette until this passes.

- [ ] **Step 1: Move the dependency**

`@quran-corpus/config` currently sits in `devDependencies` in `apps/mobile/package.json` — correct while it was only a tsconfig, wrong the moment mobile imports it at runtime. Move the line into `dependencies`, keep `"workspace:*"`.

Then: `pnpm install`

- [ ] **Step 2: Write the failing test**

Create `apps/mobile/src/theme/tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { paper } from '@quran-corpus/config/theme/palette';
import { colors, themeColors } from './tokens';

describe('themeColors', () => {
  it('takes its light neutrals from the shared paper scale', () => {
    expect(themeColors.light.background).toBe(paper[50]);
    expect(themeColors.light.text).toBe(paper[900]);
  });

  it('keeps a night-specific error colour rather than the brand red', () => {
    // #9f2d2d on night is 2.5:1, well under AA -- and error text is exactly
    // the text a user must be able to read. A palette refactor that flattens
    // this back to colors.danger is the failure this test exists to catch.
    expect(themeColors.dark.danger).not.toBe(colors.danger);
    expect(themeColors.dark.danger).toBe('#e88b8b');
  });

  it('keeps dark onAccent as night ink, not white', () => {
    // White on the night accent is 2.9:1; dark ink on that mint is the
    // readable pairing.
    expect(themeColors.dark.onAccent).toBe(colors.night);
    expect(themeColors.light.onAccent).toBe('#ffffff');
  });

  it('keeps the mobile accent off the web brand accent', () => {
    // Owner ruling 2026-08-16: the two products keep separate accents.
    expect(colors.accent).toBe('#1f6f5b');
    expect(themeColors.dark.accent).toBe('#5aa58d');
  });
});
```

- [ ] **Step 3: Run it, expect a resolution failure**

```bash
pnpm --filter @quran-corpus/mobile test -- tokens
```

Expected: FAIL. Either `Failed to resolve import "@quran-corpus/config/theme/palette"` (if vitest does not pick up the workspace export) or the assertions run and pass trivially. If it is the resolution error, add to `apps/mobile/vitest.config.ts` under the existing `resolve.alias`:

```ts
      '@quran-corpus/config/theme/palette': path.resolve(
        __dirname,
        '../../packages/config/theme/palette.ts',
      ),
```

- [ ] **Step 4: Source the neutrals from the palette**

In `apps/mobile/src/theme/tokens.ts`, replace the first two entries of `colors` and add the import. Everything below `themeColors` is untouched — including every contrast comment.

```ts
import { paper as paperScale } from '@quran-corpus/config/theme/palette';

export const colors = {
  paper: paperScale[50],
  ink: paperScale[900],
  muted: '#7b7165',
  // Deliberately NOT the web brand accent (terracotta, accent-500 #bd5f30).
  // Owner ruling 2026-08-16: the two products keep separate accents, and
  // parity covers the paper/night neutrals only. Do not "fix" this to match.
  accent: '#1f6f5b',
  // Warm near-miss of the shared night-400 (#141414), which is pure grey.
  // Not the same colour and not rounded to it -- the warmth is the night
  // mode's character.
  night: '#151412',
  nightText: '#f1ede4',
  border: '#ded6c9',
  danger: '#9f2d2d',
  success: '#2f7a4f',
};
```

- [ ] **Step 5: Run the tests**

```bash
pnpm --filter @quran-corpus/mobile test
```

Expected: PASS, whole suite.

- [ ] **Step 6: Mutation-check (CLAUDE.md §4 step 4)**

Temporarily set `themeColors.dark.danger` to `colors.danger`. Re-run. The second test MUST fail. Restore it. A test that passes both ways asserts nothing — this has slipped through twice on this repo.

- [ ] **Step 7: Prove Metro resolves the export**

The real risk in this phase. vitest passing does not prove it — vitest uses Vite's resolver, the device uses Metro's.

```bash
pnpm --filter @quran-corpus/mobile exec expo export --platform android --output-dir /tmp/m2-metro-check
```

Expected: bundling completes. `apps/mobile/assets/db/quran.db` must exist first (it is generated, not committed — `pnpm generate:m1-db` if missing), or the export fails on the asset, not on the palette.

If it fails with an unresolved `@quran-corpus/config/theme/palette`, Metro's package-exports resolution is the cause. Fallback, in `apps/mobile/metro.config.js`:

```js
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@quran-corpus/config': path.resolve(workspaceRoot, 'packages/config'),
};
```

and import the deep path. `watchFolders` already covers the workspace root.

Then delete `/tmp/m2-metro-check`.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/package.json apps/mobile/src/theme/tokens.ts apps/mobile/src/theme/tokens.test.ts pnpm-lock.yaml
git commit -m "refactor(mobile): read the neutral scale from the shared palette

Mobile's paper and ink were literal copies of paper-50 and paper-900. The
accent, the warm night neutrals and both AA-audited overrides stay local and
now say in the file why -- they are decisions, not drift, and the test pins
the two that a careless refactor flattens."
```

---

### Task 3: react-native-svg and the Icon component

**Files:**
- Modify: `apps/mobile/package.json` (new dependency)
- Create: `apps/mobile/src/components/icons/Icon.tsx`
- Create: `apps/mobile/src/components/icons/Icon.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `Icon` — `({ name: IconName; color: string; size?: number }) => JSX.Element`, and `type IconName = 'home' | 'book' | 'bookmark' | 'settings' | 'menu'`. Default `size` is 24.

`color` is an explicit prop because RN has no `currentColor`; callers pass a theme value.

- [ ] **Step 1: Install**

```bash
pnpm --filter @quran-corpus/mobile exec npx expo install react-native-svg
```

Expo picks the SDK-57-compatible version. Do not hand-pin it, and do not add `react-native-svg-transformer`.

- [ ] **Step 2: Write the failing test**

Create `apps/mobile/src/components/icons/Icon.test.tsx`. The `react-native-svg` mock mirrors the `react-native` mock style already used in `AyahCard.test.tsx` — jsdom has no native module.

```tsx
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Icon } from './Icon';

vi.mock('react-native-svg', async () => {
  const React = await import('react');
  const Svg = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('svg', props, children);
  const Path = (props: { d: string }) => React.createElement('path', props);
  return { default: Svg, Svg, Path };
});

describe('Icon', () => {
  afterEach(cleanup);

  it('draws every path of the named glyph', () => {
    const { container } = render(<Icon name="home" color="#000000" />);

    // Home is two paths on web -- roofline and walls. One means the port
    // dropped a subpath and the glyph renders as an open shape.
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });

  it('strokes with the colour it is given, not a baked-in hex', () => {
    const { container } = render(<Icon name="bookmark" color="#5aa58d" />);

    // The dark theme passes a different accent; a hardcoded stroke would make
    // every icon invisible in one of the two themes.
    expect(container.querySelector('svg')?.getAttribute('stroke')).toBe('#5aa58d');
  });

  it('has a glyph for every tab', () => {
    for (const name of ['home', 'book', 'bookmark', 'settings', 'menu'] as const) {
      const { container } = render(<Icon name={name} color="#000000" />);
      expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
      cleanup();
    }
  });
});
```

- [ ] **Step 3: Run it, expect failure**

```bash
pnpm --filter @quran-corpus/mobile test -- Icon
```

Expected: FAIL — `Failed to resolve import "./Icon"`.

- [ ] **Step 4: Write the component**

Create `apps/mobile/src/components/icons/Icon.tsx`:

```tsx
import Svg, { Path } from 'react-native-svg';

export type IconName = 'home' | 'book' | 'bookmark' | 'settings' | 'menu';

/**
 * Path data ported verbatim from web so the two products draw one glyph set:
 * home / book / menu from apps/web/src/components/shell/BottomNav.tsx,
 * bookmark from DrawerMenu.tsx. `settings` has no web counterpart -- the web
 * drawer has no settings entry -- so it is drawn here.
 *
 * RN has no currentColor, so the stroke arrives as a prop from the theme.
 */
const PATHS: Record<IconName, string[]> = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h14V9.5'],
  book: [
    'M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2z',
    'M20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 0 2-2z',
  ],
  bookmark: ['M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.2L5 21V4.5a1 1 0 0 1 1-1z'],
  settings: [
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    'M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-1.7-1l-.4-2.6h-4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.3 1 2-3.4z',
  ],
  menu: ['M4 6h16M4 12h16M4 18h16'],
};

export function Icon({
  name,
  color,
  size = 24,
}: {
  name: IconName;
  color: string;
  size?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name].map((d) => (
        <Path key={d} d={d} />
      ))}
    </Svg>
  );
}
```

- [ ] **Step 5: Run the tests**

```bash
pnpm --filter @quran-corpus/mobile test
```

Expected: PASS.

- [ ] **Step 6: Mutation-check**

Replace `stroke={color}` with `stroke="#000000"`. The second test MUST fail. Restore.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/package.json apps/mobile/src/components/icons pnpm-lock.yaml
git commit -m "feat(mobile): add react-native-svg and the shared icon set

Mobile had no vector capability at all, which is why the tab bar renders
tofu. The paths are web's, copied verbatim so the two products draw the same
glyphs; settings is new because web's drawer has no settings entry."
```

---

### Task 4: Real tab icons

**Files:**
- Modify: `apps/mobile/app/(tabs)/_layout.tsx:19-22`

**Interfaces:**
- Consumes: `Icon`, `IconName` (Task 3).
- Produces: nothing importable.

Tab *structure* does not change here — Home / Surahs / Bookmarks / Settings stays. The move to Home / Read / Dictionary / Menu is M4, when Dictionary exists to sit behind the tab.

- [ ] **Step 1: Add the icons**

Add the import, then a `tabBarIcon` to each of the four `Tabs.Screen` options. `color` and `size` come from react-navigation, already themed by the surrounding `screenOptions` (`tabBarActiveTintColor: theme.accent`, `tabBarInactiveTintColor: theme.mutedText`) — so the icons follow the theme without reading it themselves.

```tsx
import { Icon } from '@/components/icons/Icon';
```

```tsx
      <Tabs.Screen
        name="index"
        options={{
          title: t(uiLocale, 'tabs.home'),
          tabBarIcon: ({ color, size }) => <Icon name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="surahs"
        options={{
          title: t(uiLocale, 'tabs.surahs'),
          tabBarIcon: ({ color, size }) => <Icon name="book" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="bookmarks"
        options={{
          title: t(uiLocale, 'tabs.bookmarks'),
          tabBarIcon: ({ color, size }) => <Icon name="bookmark" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t(uiLocale, 'tabs.settings'),
          tabBarIcon: ({ color, size }) => <Icon name="settings" color={color} size={size} />,
        }}
      />
```

- [ ] **Step 2: Type-check and lint**

```bash
pnpm --filter @quran-corpus/mobile type-check
pnpm --filter @quran-corpus/mobile lint
```

Expected: both clean. No test here — this file is wiring with no branch or logic in it, and Task 3's tests already cover that every name renders a glyph. The real check is Task 6, on the device.

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/app/(tabs)/_layout.tsx"
git commit -m "feat(mobile): give every tab an icon

The layout declared zero tabBarIcon, so all four tabs rendered
react-navigation's fallback glyph -- the tofu boxes in the first APK."
```

---

### Task 5: The ayah medallion

**Files:**
- Create: `apps/mobile/src/components/AyahMedallion.tsx`
- Create: `apps/mobile/src/components/AyahMedallion.test.tsx`
- Modify: `apps/mobile/src/components/AyahCard.tsx:49`

**Interfaces:**
- Consumes: `useThemeColors` from `@/theme/themeContext`, `react-native-svg` (Task 3).
- Produces: `AyahMedallion` — `({ n: number; size?: number }) => JSX.Element`. Default `size` 28, matching web's `h-7 w-7`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/AyahMedallion.test.tsx`. Mock both `react-native` and `react-native-svg`, same style as `AyahCard.test.tsx`.

```tsx
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AyahMedallion } from './AyahMedallion';

vi.mock('react-native', async () => {
  const React = await import('react');
  const host =
    (tag: string) =>
    ({ accessibilityLabel, accessibilityRole, children, ...props }: {
      accessibilityLabel?: string;
      accessibilityRole?: string;
      children?: React.ReactNode;
    }) =>
      React.createElement(
        tag,
        { ...props, 'aria-label': accessibilityLabel, role: accessibilityRole },
        children,
      );

  return { Text: host('span'), View: host('div') };
});

vi.mock('react-native-svg', async () => {
  const React = await import('react');
  const Svg = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('svg', props, children);
  const Path = (props: { d: string }) => React.createElement('path', props);
  return { default: Svg, Svg, Path };
});

describe('AyahMedallion', () => {
  afterEach(cleanup);

  it('announces the ayah it marks', () => {
    render(<AyahMedallion n={255} />);

    // Queried by label, not by role: RN's accessibilityRole is "image", which
    // the mock passes straight through to a DOM role of "image" -- not the
    // ARIA "img" role, so getByRole('img') would not find it.
    //
    // Without this the rosette is decorative art with a loose digit beside it
    // and TalkBack reads "255" with no idea what it counts.
    expect(screen.getByLabelText('Ayah 255')).toBeTruthy();
  });

  it('draws the number inside the rosette', () => {
    render(<AyahMedallion n={7} />);

    expect(screen.getByText('7')).toBeTruthy();
  });

  it('draws both layers of the rosette', () => {
    const { container } = render(<AyahMedallion n={1} />);

    // A filled backing plus the stroked outline. One path means the port
    // dropped a layer and the number sits on whatever is behind the card.
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

```bash
pnpm --filter @quran-corpus/mobile test -- AyahMedallion
```

Expected: FAIL — `Failed to resolve import "./AyahMedallion"`.

- [ ] **Step 3: Write the component**

Create `apps/mobile/src/components/AyahMedallion.tsx`. **Copy the two `d` strings verbatim** from `apps/web/src/components/reader/ornaments/AyahMedallion.tsx` — the backing path (the one on the `fill-paper-50` element) and the outline path (the `stroke-current` one, `strokeWidth={4}`, `strokeLinejoin="round"`). Do not retype or reformat them; they are ~2 KB each and a single altered digit deforms the star.

```tsx
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useThemeColors } from '@/theme/themeContext';

// Backing layer -- web's `fill-paper-50 dark:fill-night-100` path.
const BACKING_PATH = 'PASTE FROM apps/web/src/components/reader/ornaments/AyahMedallion.tsx';
// Outline layer -- web's `fill-none stroke-current` path.
const OUTLINE_PATH = 'PASTE FROM apps/web/src/components/reader/ornaments/AyahMedallion.tsx';

/**
 * Ayah-marker rosette: the traditional mushaf 8-point notched star with the
 * verse number inside. Ported from web's ornament so both products draw the
 * same marker; the source art's cream fill and dark stroke are replaced by
 * theme tokens, per CLAUDE.md §8.
 */
export function AyahMedallion({ n, size = 28 }: { n: number; size?: number }) {
  const theme = useThemeColors();

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Ayah ${n}`}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg
        width={size}
        height={size}
        viewBox="0 0 118.91 118.91"
        style={{ position: 'absolute' }}
      >
        <Path d={BACKING_PATH} fill={theme.surface} />
        <Path
          d={OUTLINE_PATH}
          fill="none"
          stroke={theme.mutedText}
          strokeWidth={4}
          strokeLinejoin="round"
        />
      </Svg>
      <Text style={{ color: theme.mutedText, fontSize: Math.round(size * 0.38) }}>{n}</Text>
    </View>
  );
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter @quran-corpus/mobile test
```

Expected: PASS.

- [ ] **Step 5: Mutation-check**

Delete the backing `<Path>`. The third test MUST fail. Restore.

- [ ] **Step 6: Put it in the reader**

In `apps/mobile/src/components/AyahCard.tsx`, replace the bare ayah number at line 49:

```tsx
        <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>{ayahNumber}</Text>
```

with:

```tsx
        <AyahMedallion n={ayahNumber} />
```

and add `import { AyahMedallion } from './AyahMedallion';`. `typography` is still used by the Arabic and translation text, so its import stays.

- [ ] **Step 7: Run the full suite**

```bash
pnpm --filter @quran-corpus/mobile test
pnpm --filter @quran-corpus/mobile type-check
pnpm --filter @quran-corpus/mobile lint
```

Expected: all pass. `AyahCard.test.tsx` mocks `react-native` only, so if it now fails on an unmocked `react-native-svg` import, add the same `vi.mock('react-native-svg', ...)` factory used above to that file.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/components/AyahMedallion.tsx apps/mobile/src/components/AyahMedallion.test.tsx apps/mobile/src/components/AyahCard.tsx
git commit -m "feat(mobile): mark ayahs with the mushaf rosette

Web draws the 8-point notched star; mobile printed a bare digit. Same two
paths, theme tokens instead of the source art's cream and ink, and the
number keeps its own accessible label."
```

---

### Task 6: Build, verify on hardware, record

**Files:**
- Modify: `docs/plans/phase-m2-design-foundation.md` (this file — the verification log below)

CLAUDE.md §10: `apps/mobile` has no emulator in CI, so the on-device checklist **is** the gate. "Implementation complete, verification pending" is an unmet exit criterion, not a pass.

- [ ] **Step 1: Full green at the root**

```bash
pnpm lint
pnpm type-check
pnpm test
```

Expected: all pass across every package.

- [ ] **Step 2: Build the APK**

EAS build, Expo account `ihorsherbyna`, project `quran-corpus-mobile`. `apps/mobile/assets/db/quran.db` must be present before the build — it is generated, not committed. A ~43 MB upload confirms the DB went with it; ~5 MB means `.easignore` dropped it.

- [ ] **Step 3: Install as a fresh sideload**

**Uninstall the M1 build first.** `react-native-svg` is a native module — this is not an OTA, and leftover app storage from the previous APK can make a clean build look broken.

- [ ] **Step 4: Run the checklist**

The README M1 smoke checklist, plus the M2-specific items:

- All four tabs show an icon, not a tofu box — light mode and dark mode.
- Icons follow the theme: active tab in the accent, inactive in muted.
- Ayah numbers render the rosette in the reader, in both themes, with the number legible inside it.
- The two checks still unrun from M1, which this build finally closes: reader in airplane mode, and switching UI locale independently of content language.

- [ ] **Step 5: Record the result**

Fill in the verification log below — build ID, commit SHA, and per-item PASS/FAIL. A FAIL means a fix and a new build, not a footnote.

- [ ] **Step 6: Commit the log**

```bash
git add docs/plans/phase-m2-design-foundation.md
git commit -m "docs(mobile): record the M2 on-device verification run"
```

---

## Verification Log (on-device)

_To be filled in by Task 6. Format follows `docs/plans/phase-m1-real-offline-reader.md`: one block per run, with build ID, commit, and a PASS/FAIL line per checklist item. Unexercised checks are stated as unexercised, never implied to have passed._

---

## Acceptance criteria

1. `@quran-corpus/config/theme/palette` exists, imported by `preset.ts` and by `apps/mobile/src/theme/tokens.ts`.
2. No `paper` or `night` scale hex is a literal in more than one place in the repo.
3. `pnpm lint`, `pnpm type-check`, `pnpm test` pass at the repo root.
4. The web suite passes unchanged, with no new web test.
5. `tokens.test.ts` fails when dark `danger` is pointed at `colors.danger`.
6. All four tabs show an icon on device, both themes, no tofu.
7. Ayah numbers render the medallion in the reader, both themes.
8. The checklist is run on hardware and recorded above, including the two M1 carry-overs.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Metro will not resolve the package export | Low | Task 2 step 7 proves it via `expo export` before anything depends on it; `extraNodeModules` fallback given |
| Palette refactor flattens the AA overrides | Medium | `tokens.test.ts`, mutation-checked in Task 2 step 6 |
| jiti chokes on the preset's new relative import | Low | Task 1 step 4 runs the web build, which is exactly that code path |
| `react-native-svg` drifts against SDK 57 | Low | Installed via `npx expo install`, which pins to the SDK range |
| Existing component tests break on the unmocked native module | Medium | Task 5 step 7 names the symptom and the fix |

## Rollback

Every change is additive or a literal-for-import swap. `git revert` the phase's commits; nothing is persisted to a device, no schema moves, no data is written. The only manual step is reinstalling the M1 APK, which the device already has.

## Not in this phase

- Tab restructure to Home / Read / Dictionary / Menu — M4.
- `--pos-*` / `--form-*` / `--ease-out` into the shared palette, the `posColor` tag-to-bucket split, and the `globals.css` parity test they require — M3.
- Motion and easing work — M3, with the word-detail sheet.
- Any `packages/data` widening — M3.
