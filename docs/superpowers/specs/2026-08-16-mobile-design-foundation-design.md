# M2 — Mobile Design Foundation

Date: 2026-08-16
Status: approved design, ready for `writing-plans`

## Purpose

`apps/mobile` ships a working reader (M1) that looks nothing like the web app. Its
tab bar renders tofu boxes instead of icons, its colours are nine flat literals
unrelated to the web palette, and ayah numbers are bare digits where web draws the
mushaf rosette. M2 closes that visual gap and puts the shared-palette plumbing in
place, so M3–M5 (word-by-word morphology, dictionary, search) build on tokens
rather than on more literals.

M2 adds no query, no schema change, and no user-DB write. It is deliberately the
phase with the least data risk and the most visible result.

## Scope

In:

- A shared colour-scale module in `packages/config`, consumed by both the web
  Tailwind preset and mobile's theme tokens.
- `react-native-svg` added to `apps/mobile`.
- Five tab icons ported from web, replacing the tofu boxes.
- The ayah medallion ported from web.
- A fresh APK and an on-device run of the README smoke checklist.

Out:

- **Tab restructure.** M2 keeps Home / Surahs / Bookmarks / Settings. The move to
  Home / Read / Dictionary / Menu happens in M4, when Dictionary exists to put
  behind the tab. Decided with the user 2026-08-15.
- **`--pos-*` / `--form-*` / `--ease-out`.** These live in `globals.css` and have
  no mobile consumer until M3's morphology pills. They move in M3, together with
  the `posColor.ts` tag-to-bucket refactor that M3 needs anyway, and with the
  parity test that duplication requires. See "Deferred to M3" below.
- Motion and easing work generally — M3, with the word-detail sheet.
- Any change to `packages/data`.

## Architecture

### Shared palette module

New file `packages/config/theme/palette.ts`, exported as
`@quran-corpus/config/theme/palette` via the package's existing `exports` map.

It holds the `paper`, `night`, and `accent` scales — the exact hexes currently
literal in `packages/config/tailwind/preset.ts`. `preset.ts` then imports them
instead of declaring them, so web's Tailwind classes are unchanged and there is
one copy of each hex in the repo.

Constraints on the module:

- **Dependency-free plain TypeScript.** No `tailwindcss` types, no Node imports,
  no runtime dependencies. Three consumers with three different loaders read it:
  jiti (Tailwind config), Next's bundler, and Metro. Anything exotic breaks one
  of them.
- **Not compiled.** Same as `preset.ts` — `packages/config` has no build step and
  ships raw `.ts`. The comment at the top of `preset.ts` ("Do not compile to .js")
  applies equally here.

### Why web cannot break

The change to web is additive. One new entry in the `exports` map; existing
entries untouched. `apps/web` consumes `packages/config` only through
`tsconfig/nextjs` and `tailwind/preset`, and neither changes shape — `preset.ts`
exports the same object, just built from imported constants. No web component,
class name, or rendered pixel moves.

### The real risk is Metro

This is mobile's first *runtime* import from `@quran-corpus/config`; today
`apps/mobile` only extends its tsconfig. Metro must resolve the package `exports`
field, which is enabled by default at SDK 57's Metro version but is not verified
in this repo.

Mitigation: the first task of the phase is a single import plus a build, before
any palette work depends on it. If Metro balks, the fallback is an
`extraNodeModules` alias in `apps/mobile/metro.config.js` — local to mobile, no
package or schema change. `metro.config.js` already sets
`watchFolders = [workspaceRoot]`, so the workspace TS is in scope either way.

### Accent divergence — deliberate, not drift

Mobile's accent is green (`#1f6f5b` light, `#5aa58d` dark). Web's `accent` scale
is terracotta (`accent-500 #bd5f30`). The user ruled on 2026-08-16: **keep both,
scoped.** The shared module carries the terracotta scale for web; mobile keeps its
green as a mobile-local literal in `tokens.ts`, with a comment stating it is
intentionally not the web accent so a later reader does not "fix" it into
alignment.

Parity therefore covers the paper and night scales. It does not claim to cover
brand accent, and no test should assert that it does.

## Components

### 1. `packages/config/theme/palette.ts` (new)

Exports `paper`, `night`, `accent` — each a 50–900 scale, hexes moved verbatim
from `preset.ts`.

### 2. `packages/config/tailwind/preset.ts` (modified)

Imports the three scales from `./palette` and spreads them into
`theme.extend.colors`. Everything else — `darkMode: 'class'`, the `fontFamily`
block — is untouched.

### 3. `apps/mobile/src/theme/tokens.ts` (modified)

Keeps its current shape: a `colors` object and a `themeColors.light` /
`themeColors.dark` semantic role map (`background`, `surface`, `text`,
`mutedText`, `border`, `accent`, `danger`, `onAccent`). Hexes come from the
palette scales instead of local literals, except:

- **The accent**, per the ruling above.
- **The AA-audited overrides.** `themeColors.dark.danger` is `#e88b8b`, not
  `colors.danger` — `#9f2d2d` on night is 2.5:1, well under AA, and error text is
  exactly the text a user must be able to read. `themeColors.dark.onAccent` is
  night ink, not white — white on the night accent is 2.9:1. These are measured
  decisions with their reasoning already in comments. The refactor preserves both
  the values and the comments. Flattening them back to the light values is the
  specific failure mode this section exists to prevent.

Not every mobile literal has a web counterpart. `paper` (`#faf8f3`) is
`paper-50` and `ink` (`#1f1a14`) is `paper-900` — those swap to the scale. But
mobile's `surface` (`#fffdf8`), `muted` (`#7b7165`), `border` (`#ded6c9`),
`nightText` (`#f1ede4`), and the dark-mode neutrals have no entry in either web
scale, and mobile's `night` (`#151412`) is a warm near-miss of web's `night-400`
(`#141414`), not the same colour. Leave all of these as mobile literals. Do not
round the warm ones to the nearest web value to make the diff tidier — web's
`night` scale is pure grey and mobile's is warm, and silently swapping them
changes the night mode's character. Widening the shared scales to cover these is
an M3-or-later question, and only if a second consumer appears.

`typography` and `touchTargets` stay as they are.

### 4. `apps/mobile/src/components/icons/` (new)

One `Icon` component over `react-native-svg`, taking `name`, `color`, and `size`.
Five names for M2's tab set:

| Name | Source |
|---|---|
| `home` | `BottomNav.tsx` `HomeIcon` |
| `book` | `BottomNav.tsx` `BookIcon` |
| `bookmark` | `DrawerMenu.tsx` `bookmarkIcon` |
| `settings` | new — web has no settings icon (two paths, a gear) |
| `menu` | `BottomNav.tsx` `MenuIcon` — drawn in M2, first used in M4 |

Path data is copied verbatim; the web icons are `viewBox="0 0 24 24"`, `fill=none`,
`stroke=currentColor`, `strokeWidth=1.8`, round caps and joins. On RN, `currentColor`
does not exist, so `color` is an explicit prop supplied by the caller from the
theme.

Wired into `app/(tabs)/_layout.tsx` via `tabBarIcon`, which today passes only
`title` — that omission is the tofu.

### 5. `apps/mobile/src/components/AyahMedallion.tsx` (new)

The two paths from `apps/web/src/components/reader/ornaments/AyahMedallion.tsx`
(the traditional 8-point notched star), on `react-native-svg`, with a `Text`
overlay for the number. The backing path takes the surface token and the outline
takes the theme text colour, mirroring web's `fill-paper-50 dark:fill-night-100`
plus `stroke-current`. `accessibilityLabel` is `Ayah {n}`, matching web's
`aria-label`.

Replaces the bare ayah number in `AyahCard`.

## Data flow

None. M2 reads no new data and writes none.

This is also why M2 needs no independent review under CLAUDE.md §5: it touches
neither `packages/data` schema or queries, nor an input-validation or trust
boundary, nor an on-device user-DB write. It ships on §4's self-review plus
lint, type-check, and tests. M3 will trigger §5 — it widens
`packages/data/src/mobile.ts`.

## Error handling

There is no new runtime failure mode. Icons and colours either render or the
build does not start.

Two build-time modes, both loud and both caught before any dependent work:

1. **Metro cannot resolve the palette export** — caught by task 1; fallback is the
   `extraNodeModules` alias.
2. **`react-native-svg` is a native module** — a JS reload will not pick it up.
   The M2 build is a fresh sideload, not an OTA. This belongs in the phase plan's
   task ordering, not in code.

## Testing

- `apps/mobile/src/theme/tokens.test.ts` (new) — asserts the AA-critical pairings
  survive the refactor: dark `danger` differs from light `danger`, dark `onAccent`
  is night ink, and the light/dark backgrounds come from the shared scales.
  Mutation-check per §4 step 4: point dark `danger` at `colors.danger` and the
  test must fail.
- Icon and medallion component tests, in the existing `react-native`-mocked style
  of `AyahCard.test.tsx` — render in both themes; assert the accessibility label
  and that colour follows the theme prop rather than a hardcoded hex.
- Web: `pnpm --filter @quran-corpus/web test` must stay green with no new test.
  That is the assertion — the preset refactor is a no-op for web, and the existing
  suite proving so is the evidence.
- Device gate per §10: a fresh APK, the README smoke checklist run on real
  hardware, and the result recorded in the phase plan's verification log. Two
  checks still unrun from M1 close on this build: airplane-mode reader, and UI
  locale switching against content language.

## Deferred to M3

Recorded here so the M3 plan does not rediscover it:

- `--pos-*`, `--form-*`, and `--ease-out` move from `globals.css` into the palette
  module, and a parity test in `apps/web/src/test/` asserts `globals.css` still
  matches. The test is required there and not in M2 because those values stay
  duplicated: web reads them as CSS custom properties, mobile needs raw hexes.
  The long contrast-ratio commentary in `globals.css` is the valuable part and
  stays with the CSS; the module points at it rather than copying it.
- `apps/web/src/lib/posColor.ts` and `formCategoryColor.ts` currently map a tag to
  a `var(--pos-*)` string. M3 needs the same mapping to a hex. Split them: the
  shared module exports the tag-to-bucket rules (including the DET exception —
  corpus.quran.com does not surface DET as a distinct category, so it gets no
  colour), and each platform resolves bucket to colour its own way.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Metro will not resolve the package export | Low | Task 1 verifies before anything depends on it; `extraNodeModules` fallback |
| Palette refactor flattens the AA overrides | Medium | `tokens.test.ts` asserts them; mutation-checked |
| jiti chokes on the new relative import in `preset.ts` | Low | Relative TS import inside one package; `pnpm --filter @quran-corpus/web build` catches it immediately |
| `react-native-svg` version drift against SDK 57 | Low | Install via `npx expo install`, which pins to the SDK-compatible range |

## Rollback

Every change is additive or a literal-for-import swap. Rollback is `git revert` of
the phase's commits; nothing is persisted to a device, no schema moves, and no
data is written. The only manual step is reinstalling the previous APK, which the
device already has from M1.

## Acceptance criteria

1. `@quran-corpus/config/theme/palette` exists and is imported by both
   `preset.ts` and `apps/mobile/src/theme/tokens.ts`.
2. No hex from the `paper` or `night` scale appears as a literal in more than one
   place in the repo.
3. `pnpm lint`, `pnpm type-check`, and `pnpm test` pass at the repo root.
4. The web suite passes unchanged, with no new web test.
5. `tokens.test.ts` fails when dark `danger` is pointed at `colors.danger`.
6. All four tabs show an icon on device — no tofu — in both light and dark.
7. Ayah numbers render the medallion in the reader, in both themes.
8. The README smoke checklist is run on hardware and recorded in the phase plan's
   verification log, including the two checks carried over from M1.
