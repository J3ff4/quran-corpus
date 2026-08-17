# Phase M3c: Reader Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the reader back the ~150dp of vertical space its chrome eats, put the surah name where it stays visible, and clear the two small M3 leftovers so the next build closes F4 and M2's carry-over with no debt behind it.

**Architecture:** WordSheet's shell (backdrop, timing, drag-to-dismiss, Android back) is extracted to a reusable `BottomSheet` and reused by a new `LanguageSheet`, so the reader's fixed language band collapses into one header icon. The nav header's empty title fills in on scroll, once the list header's big heading leaves the screen. No new dependencies; one is removed.

**Tech Stack:** React Native, Expo Router, reanimated (`withTiming`), react-native-gesture-handler, vitest + @testing-library/react.

**Spec:** `docs/PRD-android-first-mobile-app.md` §10 (Phase M3), plus the M3 Verification Log Run 1 in `docs/plans/phase-m3-morphology-mvp.md` — the device run this phase answers.

## Global Constraints

- **No new dependencies.** CLAUDE.md §12: adding one is the owner's call. This phase only removes one.
- **`packages/data` untouched.** No schema, no query changes. Nothing here trips CLAUDE.md §5 — this ships on §4's self-review plus lint/type-check/tests.
- `apps/mobile` imports shared code from `@quran-corpus/data/mobile` only. Never the barrel — it pulls the native libsql driver into the Metro graph.
- Touch targets ≥ `touchTargets.minimum` (48dp). WCAG AA (CLAUDE.md §8).
- Every motion path honours `useReducedMotion()`. It ORs the OS setting with the in-app switch; it never overrides.
- **No spring.** Owner ruling 2026-08-17, recorded in `WordSheet.tsx`. Sheet motion is `withTiming` on a cubic curve.
- No `@ts-ignore`, no disabled lint rules without an inline justification (CLAUDE.md §4).
- Conventional Commits, scope `mobile` (CLAUDE.md §9).
- Every user-visible string goes through `t(uiLocale, key)` in all three locales — en, uz, ru.

---

## Context

Reader top today, `app/surah/[surahId].tsx`:

```
┌─────────────────────────────┐
│ ←                       [⊞] │  nav header: title '', WbW icon right
├─────────────────────────────┤
│  [English][Oʻzbek][Русский] │  LanguageSelector — fixed, never scrolls
├─────────────────────────────┤
│  Al-Baqarah                 │  list header — scrolls away
│  The Cow                    │
│  ﷽                          │
├─────────────────────────────┤
│  ayah 1 …                   │  ← ~150dp down
```

Three problems, in order of cost:

1. `LanguageSelector` is a sibling above `SurahReader` (`[surahId].tsx:174`), outside the list, so its band is paid on every ayah for a setting most users touch once. It is also already in Settings → Translation.
2. The nav header's `title` is `''` (`app/_layout.tsx:99`). Scroll to ayah 150 and nothing on screen says which surah you are in.
3. `Bismillah.tsx:23` hardcodes `accessibilityLabel="Bismillah"` — English to a Russian TalkBack user.

Plus `@expo/ui@~57.0.7` is in `apps/mobile/package.json:18` and imported nowhere.

### Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Extract `BottomSheet` from `WordSheet` rather than write a second sheet. | CLAUDE.md §3 DRY. The language sheet wants the same backdrop, timing, drag and back handling. WordSheet's 17 existing tests are the regression net for the extraction. |
| D2 | Mounting `BottomSheet` means open; unmounting means closed. No `open`/`visible` prop. | Exactly WordSheet's current behaviour, and its comment says why: an always-mounted sheet leaves a full-screen backdrop swallowing every tap in the reader. Keeping the semantics identical is what makes the existing tests a valid net. |
| D3 | RN's `Modal` is **not** used. | `Modal` with `transparent` + `animationType="slide"` slides the dim backdrop up with the panel, which reads as a wipe. `BottomSheet` already fades the backdrop and translates only the panel. |
| D4 | Language button sits in `headerRight` beside the word-by-word icon, not replacing it. | Both are reader-level actions. `headerRight` returns a row of two 48dp targets. |
| D5 | Nav title appears on scroll, rather than always. | Always-on duplicates the list header's 24pt heading on the first screenful — CLAUDE.md §8, "must not look like AI slop". Threshold is the measured header height, not a constant: the header grows with the Arabic size setting and the OS font scale. |
| D6 | `@expo/ui` is removed, not adopted. | Ponytail rung 1 and CLAUDE.md §3: it has no importer. Removing is the smaller diff than finding it a job. |
| D7 | New `translate` icon is drawn here, like `settings` and `words` were. | Web has no language icon to port — `LanguageBar.tsx` is a text pill row. `Icon.tsx`'s docstring already records that two glyphs are mobile-only. |

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/mobile/src/components/BottomSheet.tsx` | **New.** The sheet shell: backdrop, entrance/exit timing, drag-to-dismiss, Android back. Knows nothing about words or languages. |
| `apps/mobile/src/components/BottomSheet.test.tsx` | **New.** The shell's own suite, moved over from the parts of `WordSheet.test.tsx` that test the shell. |
| `apps/mobile/src/components/WordSheet.tsx` | Loses the shell, keeps the word content. |
| `apps/mobile/src/components/LanguageSheet.tsx` | **New.** `BottomSheet` + a heading + the existing `LanguageSelector`. Picking a language closes it. |
| `apps/mobile/src/components/LanguageSheet.test.tsx` | **New.** |
| `apps/mobile/src/components/LanguageSelector.tsx` | Unchanged. Reused inside the sheet. |
| `apps/mobile/src/components/icons/Icon.tsx` | Gains `translate`. |
| `apps/mobile/src/components/SurahReader.tsx` | `headerRight` gains the language button; list header reports its height; scroll past it sets the nav title. |
| `apps/mobile/app/surah/[surahId].tsx` | Drops the fixed `LanguageSelector`; passes language state down to `SurahReader`. |
| `apps/mobile/src/i18n/uiStrings.ts` | Gains `reader.chooseLanguage` and `reader.bismillah`. |
| `apps/mobile/src/components/Bismillah.tsx` | Takes `uiLocale`, localises its label. |
| `apps/mobile/package.json` | `@expo/ui` removed. |
| `README.md` | Checks 23-27 appended to the M3 smoke list. |
| `docs/plans/phase-m3-morphology-mvp.md` | Verification Log gains Run 2. |

---

## Task 1: Extract the sheet shell

**Files:**
- Create: `apps/mobile/src/components/BottomSheet.tsx`
- Modify: `apps/mobile/src/components/WordSheet.tsx`
- Test: `apps/mobile/src/components/WordSheet.test.tsx` (must pass **unchanged**)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `BottomSheet({ onClose, closeLabel, children }: { onClose: () => void; closeLabel: string; children: ReactNode })`. Mounted = open.

- [ ] **Step 1: Run WordSheet's suite green before touching anything**

```bash
cd apps/mobile && npx vitest run src/components/WordSheet.test.tsx
```

Expected: 17 passed. This is the baseline the extraction must not move. If it is not 17, stop and report — something landed since `1cd8a0f`.

- [ ] **Step 2: Create the shell**

Everything below is lifted verbatim from `WordSheet.tsx` as of commit `3ad1086` — the timing constants, the `screenHeightRef` note, the reset-on-close comment, the drag thresholds, the interrupted-dismiss restore. Do not re-derive any of it; the comments record device findings that are expensive to rediscover.

Create `apps/mobile/src/components/BottomSheet.tsx`:

```tsx
import { useEffect, useRef, type ReactNode } from 'react';
import { BackHandler, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useReducedMotion } from '@/motion/useReducedMotion';
import { useThemeColors } from '@/theme/themeContext';

// No spring. Owner ruling 2026-08-17, after the third device run: "i dont like
// that spring. just regular movement is fine." Two prior passes tried to tune
// it -- web's ported 28/320, then a critically damped 46/520 -- and neither
// landed, so the physics is gone rather than retuned a third time. Web's
// WordPopover keeps its own spring; the divergence is deliberate, the same way
// the accent colour diverges in theme/tokens.ts. Do not port a spring back in.
//
// Decelerating in, accelerating out: the sheet arrives under control and
// leaves without lingering. Durations are Android's own sheet range.
const ENTER = { duration: 220, easing: Easing.out(Easing.cubic) } as const;
const EXIT = { duration: 180, easing: Easing.in(Easing.cubic) } as const;
const FADE_MS = 150;
// Fractions of the sheet's own height and dp/s, matching Android's own sheets:
// a short flick dismisses without having to drag the whole way down.
const DISMISS_FRACTION = 0.25;
const DISMISS_VELOCITY = 500;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface BottomSheetProps {
  /** Dismissal. The sheet does not animate out on unmount -- see the reset
   *  effect -- so the caller unmounting it IS the close. */
  onClose: () => void;
  /** Accessible name for the backdrop, which is otherwise an unlabelled
   *  full-screen button to TalkBack. */
  closeLabel: string;
  children: ReactNode;
}

/**
 * The sheet shell: dim backdrop, slide-up entrance, drag-to-dismiss, Android
 * back. Mounting it opens it; unmounting closes it. Extracted from WordSheet so
 * the language sheet does not duplicate any of it (CLAUDE.md §3).
 */
export function BottomSheet({ onClose, closeLabel, children }: BottomSheetProps) {
  const theme = useThemeColors();
  const reduced = useReducedMotion();
  const { height: screenHeight } = useWindowDimensions();

  // Starts a full screen down so the first frame is off-screen, rather than the
  // sheet appearing in place and then sliding.
  const translateY = useSharedValue(screenHeight);
  const fade = useSharedValue(0);
  const sheetHeight = useSharedValue(0);

  // Read through a ref so the entrance effect below does not depend on it.
  // With screenHeight in those deps, an Android split-screen resize while the
  // sheet is open re-runs the entrance: the sheet snaps a full screen down and
  // slides back in, mid-read. Synced in an effect declared first, so it has
  // committed before the entrance effect runs on the same pass.
  const screenHeightRef = useRef(screenHeight);
  useEffect(() => {
    screenHeightRef.current = screenHeight;
  }, [screenHeight]);

  useEffect(() => {
    if (reduced) {
      translateY.value = 0;
      fade.value = withTiming(1, { duration: FADE_MS });
    } else {
      translateY.value = screenHeightRef.current;
      translateY.value = withTiming(0, ENTER);
      fade.value = withTiming(1, { duration: FADE_MS });
    }
  }, [reduced, translateY, fade]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      // Swallow it. Falling through dismisses the sheet AND pops the screen
      // underneath, so one back tap would lose the user's place.
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  const pan = Gesture.Pan()
    .enabled(!reduced)
    .onUpdate((event) => {
      // Downward only: dragging up would lift the sheet off the bottom edge
      // and open a gap onto the backdrop.
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      const height = sheetHeight.value || screenHeight;
      if (event.translationY > height * DISMISS_FRACTION || event.velocityY > DISMISS_VELOCITY) {
        fade.value = withTiming(0, { duration: FADE_MS });
        translateY.value = withTiming(height, EXIT, (finished?: boolean) => {
          // Only on a settled animation: unmounting mid-flight leaves the
          // sheet half-way down for the frame before it disappears.
          if (finished) runOnJS(onClose)();
        });
      } else {
        translateY.value = withTiming(0, ENTER);
        // Restored, not left alone: a dismiss interrupted by a second pan never
        // reaches its `finished` callback, so onClose never runs and `fade` is
        // still on its way to 0. Sliding the sheet back without it leaves it
        // fully visible over an undimmed screen, with an invisible backdrop
        // still swallowing taps.
        fade.value = withTiming(1, { duration: FADE_MS });
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    // Under reduced motion the sheet fades with the backdrop and never moves;
    // otherwise it is opaque throughout and only translates.
    opacity: reduced ? fade.value : 1,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <AnimatedPressable
        testID="sheet-backdrop"
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.4)' }, backdropStyle]}
      />
      <GestureDetector gesture={pan}>
        <Animated.View
          role="dialog"
          aria-modal
          onLayout={(event: LayoutChangeEvent) => {
            sheetHeight.value = event.nativeEvent.layout.height;
          }}
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: theme.surface,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 28,
              gap: 14,
            },
            sheetStyle,
          ]}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.border,
              marginBottom: 20,
            }}
          />
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
```

Note what is **gone** versus WordSheet's version: the `open` boolean, the `if (!open)` reset branch, and the `!open` guards on the back handler. D2 — mounting is opening, so there is no closed state to reset to. The caller unmounts.

- [ ] **Step 3: Rewrite WordSheet on top of it**

Replace the whole of `apps/mobile/src/components/WordSheet.tsx` with:

```tsx
import { Pressable, Text, View } from 'react-native';
import type { Word } from '@quran-corpus/data/mobile';
import type { WordSummary } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useArabicSizes } from '@/theme/useArabicSizes';
import { BottomSheet } from './BottomSheet';
import { SegmentedWord } from './SegmentedWord';
import { SegmentPill } from './SegmentPill';

const actionStyle = {
  minHeight: touchTargets.minimum,
  justifyContent: 'center',
} as const;

export interface WordSheetProps {
  /** null closes the sheet: BottomSheet unmounts, which IS the close. */
  summary: WordSummary | null;
  uiLocale: UiLocaleCode;
  onClose: () => void;
  onOpenDetail: (word: Word) => void;
  onOpenRoot: (rootBuckwalter: string) => void;
}

/**
 * The word morphology sheet: the tapped word's Arabic, its gloss, one pill per
 * morphological segment, and the two ways deeper into the corpus. The shell
 * around it -- backdrop, motion, drag, back -- is BottomSheet's.
 */
export function WordSheet({ summary, uiLocale, onClose, onOpenDetail, onOpenRoot }: WordSheetProps) {
  const theme = useThemeColors();
  const sizes = useArabicSizes();

  if (!summary) return null;

  const { word, segments, gloss } = summary;
  const rootBuckwalter = word.root_buckwalter;

  return (
    <BottomSheet onClose={onClose} closeLabel={t(uiLocale, 'word.close')}>
      <SegmentedWord word={word} segments={segments} fontSize={sizes.title} />
      <Text style={{ color: gloss ? theme.text : theme.mutedText, fontSize: typography.body }}>
        {gloss ?? t(uiLocale, 'word.noGloss')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {segments.map((segment) => (
          <SegmentPill key={segment.id} segment={segment} />
        ))}
      </View>
      <Pressable
        testID="full-analysis"
        accessibilityRole="button"
        onPress={() => onOpenDetail(word)}
        style={actionStyle}
      >
        <Text style={{ color: theme.accent, fontSize: typography.body }}>
          {t(uiLocale, 'word.fullAnalysis')}
        </Text>
      </Pressable>
      {rootBuckwalter ? (
        <Pressable
          testID="root-link"
          accessibilityRole="button"
          onPress={() => onOpenRoot(rootBuckwalter)}
          style={actionStyle}
        >
          <Text style={{ color: theme.accent, fontSize: typography.body }}>
            {/* Buckwalter is the routing key; the Arabic is only the label,
                and some rows carry no Arabic root at all. */}
            {`${t(uiLocale, 'word.root')} ${word.root ?? rootBuckwalter}`}
          </Text>
        </Pressable>
      ) : null}
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Run WordSheet's suite — unchanged**

```bash
cd apps/mobile && npx vitest run src/components/WordSheet.test.tsx
```

Expected: **17 passed**, with **zero edits to the test file**. That is the whole point of the extraction: identical shell semantics, same three shared values in the same order (`translateY`, `fade`, `sheetHeight`), same `sheet-backdrop` testID, same `dialog` role, same pan handler.

If a test fails, the extraction changed behaviour. Fix the extraction, not the test.

- [ ] **Step 5: Move the shell tests to the shell**

`WordSheet.test.tsx` now covers the shell only incidentally. Move the four shell tests into a suite that owns them, and leave WordSheet's suite testing word content.

Create `apps/mobile/src/components/BottomSheet.test.tsx`:

```tsx
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomSheet } from './BottomSheet';

const mocks = vi.hoisted(() => ({
  backPress: null as (() => boolean) | null,
  backRemove: vi.fn(),
  // In declaration order: translateY, fade, sheetHeight. The pan gesture is
  // otherwise unreachable from a test -- GestureDetector is stubbed out -- and
  // the drag-to-dismiss branch is the one place the two values move apart.
  sharedValues: [] as Array<{ value: unknown }>,
  panEnd: null as ((event: { translationY: number; velocityY: number }) => void) | null,
  // Which animation primitive each move went through. The frames are not
  // observable from jsdom, but the choice of primitive is, and that is the
  // whole of the owner's "no spring" ruling.
  animations: [] as string[],
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ reduceMotion: false }),
}));

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return {
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: () => ({ remove: () => {} }),
    },
    BackHandler: {
      addEventListener: (_event: string, handler: () => boolean) => {
        mocks.backPress = handler;
        return { remove: mocks.backRemove };
      },
    },
    Pressable: host('button'),
    StyleSheet: { absoluteFill: {} },
    Text: host('span'),
    View: host('div'),
    useWindowDimensions: () => ({ width: 400, height: 800, scale: 2, fontScale: 1 }),
  };
});

vi.mock('react-native-reanimated', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return {
    default: {
      View: host('div'),
      createAnimatedComponent: (Component: unknown) => Component,
    },
    runOnJS: (fn: unknown) => fn,
    useAnimatedStyle: () => ({}),
    useSharedValue: (initial: unknown) => {
      const shared = { value: initial };
      mocks.sharedValues.push(shared);
      return shared;
    },
    withSpring: (to: unknown) => {
      mocks.animations.push('spring');
      return to;
    },
    withTiming: (to: unknown) => {
      mocks.animations.push('timing');
      return to;
    },
    Easing: {
      cubic: (t: number) => t,
      in: (fn: unknown) => fn,
      out: (fn: unknown) => fn,
    },
  };
});

vi.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children?: React.ReactNode }) => children,
  Gesture: {
    Pan: () => {
      const chain = {
        enabled: () => chain,
        onUpdate: () => chain,
        onEnd: (handler: (event: { translationY: number; velocityY: number }) => void) => {
          mocks.panEnd = handler;
          return chain;
        },
      };
      return chain;
    },
  },
}));

describe('BottomSheet', () => {
  beforeEach(() => {
    mocks.backPress = null;
    mocks.backRemove.mockClear();
    mocks.sharedValues = [];
    mocks.panEnd = null;
    mocks.animations = [];
  });

  afterEach(cleanup);

  it('restores the backdrop dim when a drag stops short of dismissing', () => {
    render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);
    const [translateY, fade] = mocks.sharedValues;
    expect(mocks.sharedValues).toHaveLength(3);

    // The real sequence: a dismissing drag starts the fade out, its animation
    // is interrupted by a second drag, and that one stops short. Starting from
    // a freshly opened sheet instead would assert nothing -- the entrance
    // effect already left `fade` at 1.
    mocks.panEnd?.({ translationY: 300, velocityY: 0 });
    expect(fade!.value).toBe(0);

    // Under a quarter of the 800px height and slow: the sheet slides back.
    mocks.panEnd?.({ translationY: 40, velocityY: 0 });

    expect(translateY!.value).toBe(0);
    expect(fade!.value).toBe(1);
  });

  it('drops the backdrop dim when the drag does dismiss', () => {
    render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);
    const [, fade] = mocks.sharedValues;

    mocks.panEnd?.({ translationY: 300, velocityY: 0 });

    expect(fade!.value).toBe(0);
  });

  it('moves on a timing curve, never a spring', () => {
    // Owner ruling 2026-08-17: "i dont like that spring. just regular movement
    // is fine." Entrance and both drag outcomes go through withTiming.
    render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);
    expect(mocks.animations).not.toHaveLength(0);

    mocks.panEnd?.({ translationY: 300, velocityY: 0 });
    mocks.panEnd?.({ translationY: 40, velocityY: 0 });

    expect(mocks.animations).not.toContain('spring');
  });

  it('closes on backdrop press', () => {
    const onClose = vi.fn();
    render(<BottomSheet onClose={onClose} closeLabel="Close"><span>body</span></BottomSheet>);

    fireEvent.click(screen.getByTestId('sheet-backdrop'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('names the backdrop so TalkBack does not read an unlabelled button', () => {
    render(<BottomSheet onClose={() => {}} closeLabel="Dismiss languages"><span>body</span></BottomSheet>);

    expect(screen.getByTestId('sheet-backdrop').getAttribute('aria-label')).toBe('Dismiss languages');
  });

  it('closes on the Android back button instead of leaving the screen underneath', () => {
    const onClose = vi.fn();
    render(<BottomSheet onClose={onClose} closeLabel="Close"><span>body</span></BottomSheet>);

    const handled = mocks.backPress?.();

    expect(onClose).toHaveBeenCalledTimes(1);
    // Returning false lets the press fall through to the navigator as well, so
    // one back tap would dismiss the sheet AND leave the screen under it.
    expect(handled).toBe(true);
  });

  it('stops intercepting back once it unmounts', () => {
    const { unmount } = render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);

    unmount();

    // Left subscribed, a gone sheet swallows every back press in the app.
    expect(mocks.backRemove).toHaveBeenCalled();
  });

  it('renders its children inside the dialog', () => {
    render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>the body</span></BottomSheet>);

    expect(screen.getByRole('dialog').textContent).toContain('the body');
  });
});
```

- [ ] **Step 6: Run it, then verify the assertions are not vacuous**

```bash
cd apps/mobile && npx vitest run src/components/BottomSheet.test.tsx
```

Expected: 8 passed.

Mutation-check three of them (CLAUDE.md §4 step 4) — a test that passes both ways asserts nothing:

1. In `BottomSheet.tsx`, change `withTiming(0, ENTER)` to `withSpring(0, { damping: 46, stiffness: 520 })` (add the import). Expected: `moves on a timing curve` FAILS. Revert.
2. Change the back handler's `return true` to `return false`. Expected: `closes on the Android back button` FAILS. Revert.
3. Delete the `fade.value = withTiming(1, ...)` line in the pan's `else` branch. Expected: `restores the backdrop dim` FAILS. Revert.

If any of the three passes with the mutation in place, the test is vacuous — rewrite it before continuing. Note `__pycache__`-style staleness does not apply here, but vitest's cache can: if a mutation seems to have no effect, re-run with `--no-cache` before concluding the test is fine.

- [ ] **Step 7: Trim WordSheet's suite to word content**

In `apps/mobile/src/components/WordSheet.test.tsx`, delete these five tests, now owned by `BottomSheet.test.tsx`:

- `restores the backdrop dim when a drag stops short of dismissing`
- `drops the backdrop dim when the drag does dismiss`
- `moves on a timing curve, never a spring`
- `closes on the Android back button instead of leaving the reader`
- `stops intercepting back once it is closed`

Keep everything else, including `closes on backdrop press` and `does not close when the sheet body itself is pressed` — those assert WordSheet's own wiring through the shell, and the second one is the regression net for nesting the sheet inside the backdrop.

Also delete the now-unused `mocks.animations`, `mocks.panEnd`, `mocks.backPress` and `mocks.backRemove` entries and their `beforeEach` resets **only if** no surviving test references them. `renders nothing when there is no summary` and the two press tests do not.

- [ ] **Step 8: Full suite, lint, type-check**

```bash
cd apps/mobile && npx vitest run
cd /home/claude/projects/quran-corpus-pwa && pnpm -r type-check && pnpm -r lint
```

Expected: all green. Test count moves from 263 to 266 (five tests leave WordSheet, eight arrive in BottomSheet).

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/components/BottomSheet.tsx apps/mobile/src/components/BottomSheet.test.tsx apps/mobile/src/components/WordSheet.tsx apps/mobile/src/components/WordSheet.test.tsx
git commit -m "refactor(mobile): extract the sheet shell from WordSheet"
```

---

## Task 2: The language sheet

**Files:**
- Create: `apps/mobile/src/components/LanguageSheet.tsx`
- Create: `apps/mobile/src/components/LanguageSheet.test.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`
- Modify: `apps/mobile/src/components/icons/Icon.tsx`

**Interfaces:**
- Consumes: `BottomSheet({ onClose, closeLabel, children })` from Task 1.
- Produces: `LanguageSheet({ value, uiLocale, onChange, onClose }: { value: ContentLanguageCode; uiLocale: UiLocaleCode; onChange: (code: ContentLanguageCode) => void; onClose: () => void })`, and `IconName` gains `'translate'`.

- [ ] **Step 1: Add the two strings**

In `apps/mobile/src/i18n/uiStrings.ts`, add to the `UiStringKey` union, next to the other `reader.*` keys:

```ts
  | 'reader.chooseLanguage'
  | 'reader.bismillah'
```

Then in each of the three locale maps, beside the existing `'reader.translation'` entry:

en:
```ts
    'reader.chooseLanguage': 'Choose translation language',
    'reader.bismillah': 'In the name of Allah, the Entirely Merciful, the Especially Merciful',
```

uz:
```ts
    'reader.chooseLanguage': 'Tarjima tilini tanlang',
    'reader.bismillah': 'Mehribon va rahmli Alloh nomi bilan',
```

ru:
```ts
    'reader.chooseLanguage': 'Выберите язык перевода',
    'reader.bismillah': 'Именем Аллаха, Милостивого, Милосердного',
```

`reader.bismillah` is added here rather than in Task 5 because all three locales are edited in one pass; Task 5 consumes it.

- [ ] **Step 2: Add the translate icon**

In `apps/mobile/src/components/icons/Icon.tsx`, extend the union:

```ts
export type IconName = 'home' | 'book' | 'bookmark' | 'settings' | 'words' | 'translate';
```

and add to `PATHS`, after `words`:

```ts
  // A globe, not a pair of letterforms: the reader's language control picks
  // the *translation* language, and a Latin "A" beside an Arabic glyph would
  // read as the word-by-word toggle. Drawn here -- web's LanguageBar is a text
  // pill row with no icon to port.
  translate: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    'M3.5 9h17M3.5 15h17',
    'M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9s1.2-6.5 3.6-9z',
  ],
```

- [ ] **Step 3: Write the failing test**

Create `apps/mobile/src/components/LanguageSheet.test.tsx`:

```tsx
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageSheet } from './LanguageSheet';

// The shell has its own suite. Stubbed here so this one covers the wiring --
// which language is announced selected, what a pick does -- without pulling
// reanimated and gesture-handler into it. closeLabel is surfaced as an
// attribute so the test can assert the sheet names its own backdrop.
vi.mock('./BottomSheet', async () => {
  const React = await import('react');
  return {
    BottomSheet: ({ onClose, closeLabel, children }: {
      onClose: () => void;
      closeLabel: string;
      children: React.ReactNode;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'sheet', 'data-close-label': closeLabel },
        React.createElement('button', { 'data-testid': 'close-sheet', onClick: onClose }),
        children,
      ),
  };
});

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return {
    Pressable: host('button'),
    Text: host('span'),
    View: host('div'),
  };
});

const handlers = {
  value: 'en' as const,
  uiLocale: 'en' as const,
  onChange: () => {},
  onClose: () => {},
};

describe('LanguageSheet', () => {
  afterEach(cleanup);

  it('offers every shipped content language', () => {
    render(<LanguageSheet {...handlers} />);

    const options = screen.getAllByRole('radio');
    expect(options).toHaveLength(3);
    // Exactly the nativeLabel strings in i18n/languages.ts -- note the straight
    // apostrophe in "O'zbek".
    expect(options.map((option) => option.textContent)).toEqual(['English', "O'zbek", 'Русский']);
  });

  it('marks the current language selected', () => {
    render(<LanguageSheet {...handlers} value="ru" />);

    // aria-selected, not aria-checked: rnHosts maps accessibilityState.selected
    // and .disabled only. LanguageSelector sets both `selected` and `checked`;
    // only the first reaches the DOM.
    const selected = screen
      .getAllByRole('radio')
      .filter((option) => option.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]!.textContent).toBe('Русский');
  });

  it('reports the pick and closes itself in one tap', () => {
    // Both, not just onChange: leaving the sheet open over the reader means the
    // user has to dismiss a sheet to see the translation they just chose.
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(<LanguageSheet {...handlers} onChange={onChange} onClose={onClose} />);

    fireEvent.click(screen.getByText('Русский'));

    expect(onChange).toHaveBeenCalledWith('ru');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not re-report a language that is already active', () => {
    // A no-op write still re-renders the reader and re-runs its surah query.
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(<LanguageSheet {...handlers} value="en" onChange={onChange} onClose={onClose} />);

    fireEvent.click(screen.getByText('English'));

    expect(onChange).not.toHaveBeenCalled();
    // Still closes -- tapping the active language is a "yes, that one" gesture.
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('names its own backdrop rather than leaving the shell to guess', () => {
    render(<LanguageSheet {...handlers} />);

    expect(screen.getByTestId('sheet').getAttribute('data-close-label')).toBe('Close');
  });

  it('heads the sheet so the list is not three unexplained pills', () => {
    render(<LanguageSheet {...handlers} />);

    // By text, not by role: rnHosts passes accessibilityRole through verbatim,
    // so RN's "header" lands as role="header", which is not the ARIA role
    // getByRole('heading') looks for.
    expect(screen.getByText('Choose translation language')).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

```bash
cd apps/mobile && npx vitest run src/components/LanguageSheet.test.tsx
```

Expected: FAIL — `Failed to resolve import "./LanguageSheet"`.

- [ ] **Step 5: Implement**

Create `apps/mobile/src/components/LanguageSheet.tsx`:

```tsx
import { Text } from 'react-native';
import type { ContentLanguageCode, UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { BottomSheet } from './BottomSheet';
import { LanguageSelector } from './LanguageSelector';

export interface LanguageSheetProps {
  value: ContentLanguageCode;
  uiLocale: UiLocaleCode;
  onChange: (code: ContentLanguageCode) => void;
  onClose: () => void;
}

/**
 * Translation-language picker, reached from the reader's header. It exists as a
 * sheet rather than a fixed bar because the bar cost a band of every screenful
 * for a setting most readers change once (owner ruling 2026-08-17).
 */
export function LanguageSheet({ value, uiLocale, onChange, onClose }: LanguageSheetProps) {
  const theme = useThemeColors();

  return (
    <BottomSheet onClose={onClose} closeLabel={t(uiLocale, 'word.close')}>
      <Text
        accessibilityRole="header"
        style={{ color: theme.text, fontSize: typography.body, fontWeight: '600' }}
      >
        {t(uiLocale, 'reader.chooseLanguage')}
      </Text>
      <LanguageSelector
        value={value}
        onChange={(code) => {
          // Guarded: a no-op write still re-renders the reader and re-runs its
          // surah query against SQLite. Closing regardless -- tapping the
          // active language is a "yes, that one" gesture, not a mistake.
          if (code !== value) onChange(code);
          onClose();
        }}
      />
    </BottomSheet>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd apps/mobile && npx vitest run src/components/LanguageSheet.test.tsx
```

Expected: 6 passed.

- [ ] **Step 7: Mutation-check the guard**

Delete the `if (code !== value)` condition so `onChange(code)` runs unconditionally. Expected: `does not re-report a language that is already active` FAILS. Restore it.

Then delete the `onClose()` call. Expected: `reports the pick and closes itself in one tap` FAILS. Restore it.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/components/LanguageSheet.tsx apps/mobile/src/components/LanguageSheet.test.tsx apps/mobile/src/i18n/uiStrings.ts apps/mobile/src/components/icons/Icon.tsx
git commit -m "feat(mobile): add the reader's translation-language sheet"
```

---

## Task 3: Wire the sheet into the reader header

**Files:**
- Modify: `apps/mobile/src/components/SurahReader.tsx:70-90` (the `headerRight` effect)
- Modify: `apps/mobile/app/surah/[surahId].tsx:172-189`
- Test: `apps/mobile/src/components/SurahReader.test.tsx`

**Interfaces:**
- Consumes: `LanguageSheet` from Task 2, `IconName` `'translate'`.
- Produces: `SurahReaderProps` gains `contentLanguage: ContentLanguageCode` and `onChangeContentLanguage: (code: ContentLanguageCode) => void`. Both required — every caller of `SurahReader` is a reader screen that already holds this state.

- [ ] **Step 1: Write the failing test**

Append to the `describe('SurahReader')` block in `apps/mobile/src/components/SurahReader.test.tsx`:

```tsx
  it('puts both reader actions in the nav header, not above the ayahs', () => {
    render(<SurahReader {...baseProps(readerData(3))} />);

    // Two calls or one with both children -- what matters is that the header
    // ends up carrying a word-by-word control AND a language control. The
    // language pills used to sit in a fixed band above the list, costing a
    // strip of every screenful (owner ruling 2026-08-17).
    const headerRight = mocks.setOptions.mock.calls
      .map(([options]) => options.headerRight)
      .filter(Boolean)
      .at(-1);
    expect(headerRight).toBeTypeOf('function');

    render(<div>{headerRight()}</div>);
    expect(screen.getByTestId('open-wbw')).toBeTruthy();
    expect(screen.getByTestId('open-language')).toBeTruthy();
  });

  it('opens the language sheet from the header and routes the pick out', () => {
    const onChangeContentLanguage = vi.fn();
    render(
      <SurahReader
        {...baseProps(readerData(3))}
        onChangeContentLanguage={onChangeContentLanguage}
      />,
    );

    const headerRight = mocks.setOptions.mock.calls
      .map(([options]) => options.headerRight)
      .filter(Boolean)
      .at(-1);
    render(<div>{headerRight()}</div>);

    // Closed until asked for: an always-mounted sheet leaves a full-screen
    // backdrop swallowing every tap in the reader.
    expect(screen.queryByTestId('language-sheet')).toBeNull();

    fireEvent.click(screen.getByTestId('open-language'));
    fireEvent.click(screen.getByTestId('pick-ru'));

    expect(onChangeContentLanguage).toHaveBeenCalledWith('ru');
  });
```

Add the `LanguageSheet` stub beside the existing `WordSheet` stub near the top of the file:

```tsx
vi.mock('./LanguageSheet', async () => {
  const React = await import('react');
  return {
    LanguageSheet: ({ onChange, onClose }: {
      onChange: (code: string) => void;
      onClose: () => void;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'language-sheet' },
        React.createElement('button', { 'data-testid': 'pick-ru', onClick: () => onChange('ru') }),
        React.createElement('button', { 'data-testid': 'close-language', onClick: onClose }),
      ),
  };
});
```

And extend `baseProps` (near the bottom of the file's helpers) so the two new required props have defaults:

```tsx
    contentLanguage: 'en' as const,
    onChangeContentLanguage: vi.fn(),
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd apps/mobile && npx vitest run src/components/SurahReader.test.tsx
```

Expected: both new tests FAIL — `Unable to find an element by: [data-testid="open-language"]`.

- [ ] **Step 3: Implement in SurahReader**

Add to the props interface, after `uiLocale`:

```tsx
  /** The reader owns no settings state; the screen above it does. Passed down
   *  rather than read from the store so this component stays renderable in a
   *  test without the store's expo-sqlite import. */
  contentLanguage: ContentLanguageCode;
  onChangeContentLanguage: (code: ContentLanguageCode) => void;
```

with the import:

```tsx
import type { ContentLanguageCode } from '@/i18n/languages';
```

Destructure both in the signature. Add the open state beside the other `useState`s:

```tsx
  const [languageOpen, setLanguageOpen] = useState(false);
```

Replace the `headerRight` effect (currently lines 70-90) with:

```tsx
  // Fixed, not scrolled away with the title: the nav header exists as of the
  // M3b header pass, so the reader's actions no longer ride the list. The
  // language control joined them on 2026-08-17 -- it used to be a fixed pill
  // band above the ayahs, costing a strip of every screenful.
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            testID="open-language"
            accessibilityRole="button"
            accessibilityLabel={t(uiLocale, 'reader.chooseLanguage')}
            onPress={() => setLanguageOpen(true)}
            style={{
              minHeight: touchTargets.minimum,
              minWidth: touchTargets.minimum,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="translate" color={theme.accent} />
          </Pressable>
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
        </View>
      ),
    });
  }, [navigation, data.surah.id, uiLocale, theme.accent]);
```

`setLanguageOpen` is a `useState` setter, so it is stable and stays out of the dep array — the same reason `navigation` is the only object in there.

Then render the sheet beside the existing `WordSheet` in the returned tree:

```tsx
      {languageOpen ? (
        <LanguageSheet
          value={contentLanguage}
          uiLocale={uiLocale}
          onChange={onChangeContentLanguage}
          onClose={() => setLanguageOpen(false)}
        />
      ) : null}
```

with the import:

```tsx
import { LanguageSheet } from './LanguageSheet';
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/mobile && npx vitest run src/components/SurahReader.test.tsx
```

Expected: all pass, including the two new ones.

- [ ] **Step 5: Drop the fixed band from the route**

In `apps/mobile/app/surah/[surahId].tsx`, delete line 174:

```tsx
      <LanguageSelector value={contentLanguage} onChange={setContentLanguage} />
```

and its import:

```tsx
import { LanguageSelector } from '@/components/LanguageSelector';
```

Then pass the state down instead — add to the `<SurahReader …>` props:

```tsx
        contentLanguage={contentLanguage}
        onChangeContentLanguage={setContentLanguage}
```

`contentLanguage` and `setContentLanguage` already come out of `useAppSettings()` on line 30; nothing new is read.

- [ ] **Step 6: Confirm LanguageSelector still has a home**

```bash
grep -rn "LanguageSelector" apps/mobile/src apps/mobile/app
```

Expected: `LanguageSelector.tsx` itself, and `LanguageSheet.tsx`. If nothing else imports it, that is correct — the component lives on inside the sheet, and Settings uses its own `ChoiceOption` rows, not this.

- [ ] **Step 7: Full suite, lint, type-check**

```bash
cd apps/mobile && npx vitest run
cd /home/claude/projects/quran-corpus-pwa && pnpm -r type-check && pnpm -r lint
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/components/SurahReader.tsx apps/mobile/src/components/SurahReader.test.tsx "apps/mobile/app/surah/[surahId].tsx"
git commit -m "feat(mobile): move the reader's language control into the header"
```

---

## Task 4: Surah name in the header, on scroll

**Files:**
- Modify: `apps/mobile/src/components/SurahReader.tsx` (list header + a scroll handler)
- Test: `apps/mobile/src/components/SurahReader.test.tsx`

**Interfaces:**
- Consumes: the `headerRight` effect from Task 3 — this task adds a **second** `setOptions` effect for `title`, it does not fold into the first.
- Produces: nothing later tasks read.

- [ ] **Step 1: Teach the FlatList mock about scroll and layout**

In `apps/mobile/src/components/SurahReader.test.tsx`, the `react-native` mock's `FlatList` currently swallows `onScroll`. Add to its destructured props and to `mocks`:

```tsx
// in vi.hoisted(...)
  onScroll: null as ((event: { nativeEvent: { contentOffset: { y: number } } }) => void) | null,
```

```tsx
// in the FlatList mock's props and body
      onScroll,
      ...
      mocks.onScroll = onScroll ?? null;
```

with the matching type in its props annotation:

```tsx
      onScroll?: (event: { nativeEvent: { contentOffset: { y: number } } }) => void;
```

Clear it in `beforeEach`: `mocks.onScroll = null;`

The list header measures itself via `onLayout`, which the mock's plain `div` will not fire. The test drives it directly instead — see Step 2.

- [ ] **Step 2: Write the failing test**

Append to `describe('SurahReader')`:

```tsx
  function latestTitle() {
    return mocks.setOptions.mock.calls
      .map(([options]) => options.title)
      .filter((title) => title !== undefined)
      .at(-1);
  }

  it('leaves the nav title empty while the big heading is on screen', () => {
    render(<SurahReader {...baseProps(readerData(30))} />);

    // Duplicating the 24pt heading in the app bar on the first screenful is
    // exactly the doubled-up look CLAUDE.md §8 rules out.
    expect(latestTitle() ?? '').toBe('');
  });

  it('fills the nav title in once the heading scrolls away', () => {
    render(<SurahReader {...baseProps(readerData(30))} />);

    act(() => {
      mocks.headerLayout?.(180);
      mocks.onScroll?.({ nativeEvent: { contentOffset: { y: 200 } } });
    });

    expect(latestTitle()).toBe('Al-Baqarah');
  });

  it('empties it again on the way back up', () => {
    render(<SurahReader {...baseProps(readerData(30))} />);

    act(() => {
      mocks.headerLayout?.(180);
      mocks.onScroll?.({ nativeEvent: { contentOffset: { y: 200 } } });
      mocks.onScroll?.({ nativeEvent: { contentOffset: { y: 10 } } });
    });

    expect(latestTitle()).toBe('');
  });

  it('measures the threshold rather than assuming one', () => {
    // The header grows with the Arabic size setting and the OS font scale, so
    // a constant threshold flips the title at the wrong scroll position on any
    // device that is not the one it was tuned on.
    render(<SurahReader {...baseProps(readerData(30))} />);

    act(() => {
      mocks.headerLayout?.(600);
      mocks.onScroll?.({ nativeEvent: { contentOffset: { y: 200 } } });
    });

    expect(latestTitle() ?? '').toBe('');
  });
```

Capture the header's `onLayout` by adding to `mocks`:

```tsx
  headerLayout: null as ((height: number) => void) | null,
```

`rnHosts`' `host()` **destructures `onLayout` away on purpose** — React warns about it as an unknown DOM event handler — so the mock has to intercept it before delegating. Wrap, do not replace: dropping `host('div')` here would also drop the `testID`, `aria-label` and `style` mappings every other test in this file relies on.

In the `react-native` mock, hoist the host once and wrap `View`:

```tsx
    // Hoisted: host('div') built inside the render would be a new component
    // type every pass, remounting the whole subtree on each render.
    const Div = host('div');
    return {
      // ...FlatList, Pressable, Text as before...
      View: (props: { onLayout?: (event: { nativeEvent: { layout: { height: number } } }) => void }) => {
        // The list header is the only View in the reader that measures itself.
        if (props.onLayout) {
          const { onLayout } = props;
          mocks.headerLayout = (height: number) => onLayout({ nativeEvent: { layout: { height } } });
        }
        return React.createElement(Div, props);
      },
      useWindowDimensions: () => ({ width: 400, height: 800, scale: 2, fontScale: 1 }),
    };
```

Reset it in `beforeEach`: `mocks.headerLayout = null;`

- [ ] **Step 3: Run it to confirm it fails**

```bash
cd apps/mobile && npx vitest run src/components/SurahReader.test.tsx
```

Expected: `fills the nav title in once the heading scrolls away` FAILS (`expected undefined to be 'Al-Baqarah'`). The first and fourth tests may already pass — a title that is never set is vacuously empty. That is fine, and it is why the second and third tests exist.

- [ ] **Step 4: Implement**

In `apps/mobile/src/components/SurahReader.tsx`, add state and a ref:

```tsx
  // The nav header's title is empty while the list header's 24pt heading is on
  // screen and fills in once it scrolls past -- Android's own app-bar
  // behaviour, and it keeps the surah name on screen at ayah 150 where the list
  // header is long gone. Measured, not a constant: the header grows with the
  // Arabic size setting and the OS font scale.
  const [titleVisible, setTitleVisible] = useState(false);
  const headerHeightRef = useRef(0);
```

Add the second `setOptions` effect, after the `headerRight` one:

```tsx
  useEffect(() => {
    navigation.setOptions({ title: titleVisible ? data.surah.name_translit : '' });
  }, [navigation, titleVisible, data.surah.name_translit]);
```

Add the scroll handler:

```tsx
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const height = headerHeightRef.current;
      // Until the header has measured, there is no threshold to cross and the
      // title stays empty rather than flipping on at offset 0.
      if (height <= 0) return;
      // 8dp of slack so a heading resting exactly on the boundary does not
      // toggle the title on every scroll frame.
      const next = event.nativeEvent.contentOffset.y > height - 8;
      // Guarded: setOptions on every frame re-renders the whole navigator.
      setTitleVisible((current) => (current === next ? current : next));
    },
    [],
  );
```

with the imports:

```tsx
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
```

Wire both onto the `FlatList`:

```tsx
        onScroll={onScroll}
        scrollEventThrottle={16}
```

and have the list header report its height — add `onLayout` to the existing `ListHeaderComponent`'s wrapping `View`:

```tsx
            onLayout={(event: LayoutChangeEvent) => {
              headerHeightRef.current = event.nativeEvent.layout.height;
            }}
```

with `import type { LayoutChangeEvent } from 'react-native';`.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd apps/mobile && npx vitest run src/components/SurahReader.test.tsx
```

Expected: all four new tests pass.

- [ ] **Step 6: Mutation-check the threshold**

Replace `const next = event.nativeEvent.contentOffset.y > height - 8;` with `const next = event.nativeEvent.contentOffset.y > 0;`. Expected: `measures the threshold rather than assuming one` FAILS. Restore it.

Then delete the `if (height <= 0) return;` guard and re-run. Expected: `leaves the nav title empty while the big heading is on screen` still passes (no scroll has fired), so **add nothing** — instead confirm the guard's value by the fourth test with `headerLayout?.(0)`; if that scenario is not covered, the guard is untested. Add this test rather than leaving it bare:

```tsx
  it('holds the title back until the header has measured', () => {
    render(<SurahReader {...baseProps(readerData(30))} />);

    act(() => {
      mocks.onScroll?.({ nativeEvent: { contentOffset: { y: 200 } } });
    });

    // No onLayout yet: with no measured threshold, a naive `y > height` would
    // read 200 > 0 and flip the title on at the very top of the surah.
    expect(latestTitle() ?? '').toBe('');
  });
```

Re-run with the guard deleted. Expected: this new test FAILS. Restore the guard.

- [ ] **Step 7: Full suite, lint, type-check**

```bash
cd apps/mobile && npx vitest run
cd /home/claude/projects/quran-corpus-pwa && pnpm -r type-check && pnpm -r lint
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/components/SurahReader.tsx apps/mobile/src/components/SurahReader.test.tsx
git commit -m "feat(mobile): show the surah name in the header once the heading scrolls off"
```

---

## Task 5: Localise the basmala label

**Files:**
- Modify: `apps/mobile/src/components/Bismillah.tsx`
- Modify: `apps/mobile/src/components/SurahReader.tsx` (the one call site)
- Test: `apps/mobile/src/components/Bismillah.test.tsx`

**Interfaces:**
- Consumes: `reader.bismillah` from Task 2 Step 1.
- Produces: `Bismillah({ text, uiLocale }: { text: string; uiLocale: UiLocaleCode })` — `uiLocale` is new and required.

- [ ] **Step 1: Write the failing test**

Append to `describe(...)` in `apps/mobile/src/components/Bismillah.test.tsx`:

```tsx
  it('announces itself in the reader UI language, not always English', () => {
    // A Russian TalkBack user hearing "Bismillah" is being read a transliterated
    // English word. The Arabic on screen is the same in every locale; the label
    // that describes it is not.
    const { rerender } = render(<Bismillah text="بِسْمِ ٱللَّهِ" uiLocale="en" />);
    const english = screen.getByTestId('bismillah').getAttribute('aria-label');

    rerender(<Bismillah text="بِسْمِ ٱللَّهِ" uiLocale="ru" />);
    const russian = screen.getByTestId('bismillah').getAttribute('aria-label');

    expect(english).toBe('In the name of Allah, the Entirely Merciful, the Especially Merciful');
    expect(russian).toBe('Именем Аллаха, Милостивого, Милосердного');
  });
```

If `Bismillah.test.tsx` renders without a `uiLocale` in its existing tests, add `uiLocale="en"` to each — the prop is required.

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd apps/mobile && npx vitest run src/components/Bismillah.test.tsx
```

Expected: FAIL — the label is the literal `'Bismillah'` in both renders.

- [ ] **Step 3: Implement**

In `apps/mobile/src/components/Bismillah.tsx`, add the prop and use it:

```tsx
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
```

```tsx
export function Bismillah({ text, uiLocale }: { text: string; uiLocale: UiLocaleCode }) {
```

```tsx
      accessibilityLabel={t(uiLocale, 'reader.bismillah')}
```

- [ ] **Step 4: Update the call site**

In `apps/mobile/src/components/SurahReader.tsx`'s `ListHeaderComponent`:

```tsx
            {basmala ? <Bismillah text={basmala} uiLocale={uiLocale} /> : null}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd apps/mobile && npx vitest run src/components/Bismillah.test.tsx src/components/SurahReader.test.tsx
```

Expected: all pass.

- [ ] **Step 6: Mutation-check**

Change the label back to the literal `"Bismillah"`. Expected: the new test FAILS on both assertions. Restore.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/Bismillah.tsx apps/mobile/src/components/Bismillah.test.tsx apps/mobile/src/components/SurahReader.tsx
git commit -m "fix(mobile): localise the basmala accessibility label"
```

---

## Task 6: Drop @expo/ui

**Files:**
- Modify: `apps/mobile/package.json:18`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Prove it has no importer**

```bash
grep -rn "@expo/ui" apps/mobile/src apps/mobile/app apps/mobile/*.js apps/mobile/*.json packages/
```

Expected: exactly one hit — `apps/mobile/package.json`. If **any** source file imports it, stop: this task's premise is wrong. Report it and skip to Task 7.

- [ ] **Step 2: Remove it**

```bash
cd apps/mobile && pnpm remove @expo/ui
```

- [ ] **Step 3: Confirm nothing moved**

```bash
cd /home/claude/projects/quran-corpus-pwa && pnpm -r type-check && pnpm -r lint
cd apps/mobile && npx vitest run && npx expo-doctor
```

Expected: type-check, lint and the full mobile suite green (263 at the start of this phase, plus what Tasks 1-5 added). `expo-doctor` may warn about unrelated version drift; it must not report a **missing** package.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/package.json pnpm-lock.yaml
git commit -m "chore(mobile): drop the unused @expo/ui dependency"
```

---

## Task 7: Checklist, build, device run

**Files:**
- Modify: `README.md` (M3 smoke list)
- Modify: `docs/plans/phase-m3-morphology-mvp.md` (Verification Log)

**Interfaces:**
- Consumes: everything above.
- Produces: the §10 evidence M3 needs to be complete.

- [ ] **Step 1: Append the new checks**

Add to the M3 Morphology Smoke Test list in `README.md`, after check 22:

```markdown
23. Reader header. Tap the globe. The language sheet slides up; pick a different
    language and it closes on its own, with the translations underneath already
    changed. Reopen it: backdrop tap dismisses, Android back dismisses, drag
    down past a quarter dismisses.
24. There is no fixed language pill row above ayah 1 any more. The first ayah
    sits directly under the surah heading.
25. Scroll down until the big surah heading leaves the screen. The surah name
    appears in the header bar. Scroll back to the top: it goes away again. Repeat
    at maximum system font size — the name must appear later, not at the top.
26. Settings → **Reduce animations: on**. Open the language sheet: it fades, does
    not slide, and does not drag.
27. Settings → Language → Русский, then open any surah other than 1 and 9. With
    TalkBack on, focus the basmala banner: it is announced in Russian, not as
    "Bismillah".
```

- [ ] **Step 2: Update the Current Status block**

In `README.md`, replace the paragraph beginning "CI has no Android emulator" with:

```markdown
CI has no Android emulator, so the M3 smoke checklist above is the only gate this app has. Run 1 passed all 22 checks on 2026-08-17 with one finding (the word sheet's spring). M3c then removed that spring, collapsed the reader's fixed language band into a header sheet, put the surah name in the header on scroll, and localised the basmala label. Run 2 must clear all 27 checks plus the M2 rosette carry-over; results go in the Verification Log of `docs/plans/phase-m3-morphology-mvp.md`.
```

- [ ] **Step 3: Stage Run 2 in the Verification Log**

In `docs/plans/phase-m3-morphology-mvp.md`, after the Run 1 section and before `## Risks`, add a `### Run 2 — pending` section. Build its table mechanically:

- **Rows 1-22:** copy the `| # | Check | Result |` rows from Run 1's table verbatim, changing every `Result` cell to `unexercised`.
- **Rows 23-27:** one row per check added in Step 1, with the same one-line phrasing used there.
- **Then the M2 carry-over row**, copied from Run 1's carry-over table, still `unexercised`.

Do not paraphrase a check while transcribing it — a checklist and a log that disagree is how a check silently stops being run.

Above the table, state that Run 2 carries two re-checks: **check 4** closes F4 (the spring, removed in `3ad1086`), and the **M2 carry-over** closes M2's Run 2 (fix `b795975`, an ancestor of this build).

- [ ] **Step 4: Build**

```bash
cd apps/mobile && npx eas-cli@latest build --platform android --profile preview
```

Confirm the upload is **~43 MB**. A ~5 MB upload means `.easignore` dropped the bundled DB and every check will fail for the wrong reason.

Expect the same `expo-updates` channel warning as build `bac194d4`. It is logged in Run 1 as not-a-finding; installing the package is a §12 dependency decision that has not been taken.

- [ ] **Step 5: Run all 27 checks plus the carry-over on the physical device**

Record each as PASS / FAIL / **unexercised** in Run 2's table. Per the M2 log convention: unexercised checks are recorded as unexercised, never implied to have passed. A FAIL is a finding, recorded with whether its fix was re-verified on device or carried to the next build.

The two re-checks that carry debt into this run:

- **Check 4** closes F4 from Run 1 — the sheet must move without a spring.
- **M2 carry-over** closes M2's Run 2 — three-digit ayah number inside the rosette at max font size, al-Baqarah past ayah 100.

- [ ] **Step 6: Commit the log**

```bash
git add README.md docs/plans/phase-m3-morphology-mvp.md docs/plans/phase-m3c-reader-chrome.md
git commit -m "docs(mobile): record the M3c on-device verification run"
```

---

## Acceptance Criteria

| # | Criterion | How it is checked |
|---|---|---|
| A1 | The reader shows no fixed language band; ayah 1 sits under the surah heading. | Device check 24. |
| A2 | The language sheet opens from the header, closes on pick, backdrop, back and drag. | `LanguageSheet.test.tsx`, `BottomSheet.test.tsx`, device check 23. |
| A3 | No sheet anywhere moves on a spring. | `BottomSheet.test.tsx` mutation-checked in Task 1 Step 6; device checks 4 and 23. |
| A4 | The surah name is on screen at ayah 150 and not doubled at ayah 1. | `SurahReader.test.tsx` (4 tests), device check 25. |
| A5 | The basmala announces in the reader's UI language. | `Bismillah.test.tsx`, device check 27. |
| A6 | No sheet logic exists in two places. | `BottomSheet.tsx` is the only file with `DISMISS_FRACTION`; `grep -rn "DISMISS_FRACTION" apps/mobile` returns one file. |
| A7 | `@expo/ui` is gone and nothing broke. | Task 6 Step 3. |
| A8 | Reduce motion still suppresses every sheet's slide and drag. | `useReducedMotion` is read inside `BottomSheet`; device checks 8 and 26. |

---

## Risks

| # | Risk | Mitigation | Rollback |
|---|---|---|---|
| R1 | The `BottomSheet` extraction silently changes word-sheet behaviour that only shows on device. | Task 1 Step 4 requires WordSheet's 17 tests to pass **with no edits to the test file**. Any edit to make them pass is the signal that behaviour moved. | `git revert` Task 1's commit; WordSheet is self-contained again and the language sheet gets its own copy of the shell (accepting the DRY violation, flagged in the log). |
| R2 | Two `setOptions` effects fight — the title effect clobbers `headerRight` or vice versa. | They set disjoint keys, and expo-router merges rather than replaces. Task 3's test reads `headerRight` from the **last** call that carried one, which fails loudly if it is being dropped. | Merge both into one effect keyed on `titleVisible`. |
| R3 | `onScroll` at 16ms fires `setOptions` every frame and stutters the reader. | The handler guards on the boolean and only calls `setTitleVisible` on a transition; `setOptions` runs from an effect on `titleVisible`, not per frame. | Raise `scrollEventThrottle` to 100; the title flip is not time-critical. |
| R4 | The globe glyph reads as "website" rather than "translation". | It carries `accessibilityLabel={t(uiLocale, 'reader.chooseLanguage')}`, and device check 23 has the owner tap it cold. | Swap `PATHS.translate` for a letterform pair; the icon is three path strings and nothing else changes. |
| R5 | Removing `@expo/ui` breaks an Expo prebuild step that the JS graph does not show. | Task 6 Step 1 greps config files as well as sources; Step 3 runs `expo-doctor`. The real proof is the Task 7 build. | `pnpm add @expo/ui@~57.0.7`; it was never imported, so nothing else moves. |
| R6 | The language sheet's `onChange` re-runs the surah query and the reader flashes its spinner mid-read. | `[surahId].tsx`'s load effect already keys on `contentLanguage` and this is pre-existing behaviour — the fixed band did the same. Device check 23 watches for it. | Out of scope to fix here; log it as a finding for M4 if the flash is bad. |

---

## Not in this phase

- **F3** — `corpusRepository.ts:194` loads a whole surah's glosses to read one word. The fix adds a `packages/data` query, which trips CLAUDE.md §5. It belongs to M4, where dictionary queries get touched anyway.
- **A collapsing/animated title transition.** The title appears and disappears outright. A cross-fade needs the header rendered by us rather than by expo-router; not worth it for one string.
- **`expo-updates` / OTA channel.** The `preview` profile names channel `preview` and the package is not installed. §12 dependency decision, the owner's.
- **The reader's language state re-querying the surah** — see R6.
