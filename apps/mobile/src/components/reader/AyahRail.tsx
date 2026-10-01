import { useEffect, useMemo, useRef } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import type { JuzEntry } from '@quran-corpus/data/mobile';
import { useThemeColors } from '@/theme/themeContext';
import { touchTargets, typography } from '@/theme/tokens';

export interface JuzMark {
  juz: number;
  /** The ayah *of this surah* the juz begins at. */
  firstAyahNumber: number;
}

/**
 * The juz boundaries that fall inside one surah.
 *
 * Read off `ranges`, never off a JuzEntry's own `startAyahNumber`: that is the
 * juz's first ayah anywhere, so for a juz that opens in the previous surah it
 * names an ayah this surah does not contain -- and it looks entirely plausible
 * (see getJuzIndex's docstring in packages/data).
 */
export function juzMarksForSurah(index: readonly JuzEntry[], surahId: number): JuzMark[] {
  return index
    .flatMap((entry) =>
      entry.ranges
        .filter((range) => range.surahId === surahId)
        .map((range) => ({ juz: entry.juz, firstAyahNumber: range.firstAyahNumber })),
    )
    .sort((a, b) => a.juz - b.juz);
}

// Fixed, not measured: an ayah number is at most three digits, so there is no
// natural content width worth laying out for, and skipping the measurement
// sidesteps collapsible-measures-out-of-flow entirely. Collapsed matches the
// toggle's own touch target, so the rail never draws narrower than a target.
const RAIL_WIDTH = 56;
// One frame's grace for the cells jumped to above to report their heights.
const RETRY_MS = 100;
// A retry that fails re-enters the same handler, so without a cap a target the
// list cannot reach yanks the offset every RETRY_MS forever and fights the
// finger. Two is what the two-step landing below needs; a third has never
// bought anything the second did not.
const MAX_SCROLL_RETRIES = 2;

export interface AyahRailProps {
  surahId: number;
  ayahCount: number;
  juzMarks: JuzMark[];
  activeAyahNumber: number | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectAyah: (ayahNumber: number) => void;
  /** Forwarded to the root View. The reader hides the rail behind an open
   *  sheet and on its outgoing layer the same way it hides the ayah list --
   *  `accessibilityViewIsModal` is iOS-only, so on Android this is the only
   *  thing keeping a TalkBack swipe from walking off a modal sheet onto 286
   *  ayah buttons. */
  importantForAccessibility?: 'auto' | 'no-hide-descendants';
}

/**
 * The reader's margin rail at the expanded window class (R4/R5): every ayah
 * number of the open surah, the juz boundaries among them, and the one
 * currently on screen -- collapsible down to just the toggle.
 *
 * No animation of its own. `useReducedMotion` reads the app's settings through
 * `useAppSettings`, which throws when nothing above it has mounted an
 * `AppSettingsProvider` -- true of this component's own tests, which render it
 * bare. Collapsing is therefore an immediate width change; with nothing
 * animating, there is nothing reduced motion needs to skip.
 */
export function AyahRail({
  surahId,
  ayahCount,
  juzMarks,
  activeAyahNumber,
  collapsed,
  onToggleCollapsed,
  onSelectAyah,
  importantForAccessibility = 'auto',
}: AyahRailProps) {
  const theme = useThemeColors();
  const listRef = useRef<FlatList<number>>(null);

  const juzByAyah = useMemo(
    () => new Map(juzMarks.map((mark) => [mark.firstAyahNumber, mark.juz])),
    [juzMarks],
  );
  const ayahNumbers = useMemo(
    () => Array.from({ length: ayahCount }, (_, index) => index + 1),
    [ayahCount],
  );

  // Follows the position the reader already tracks -- see SurahReader's
  // onViewableItemsChanged, the one handler this rail's position comes from.
  useEffect(() => {
    if (collapsed || activeAyahNumber === null) return;
    // A fresh target gets a fresh budget: the cap below exists to stop one
    // unreachable index looping, not to stop the rail following the reader.
    attempts.current = 0;
    // And the old target's pending retry has to go with the budget. Left armed
    // it fires after this scroll lands and yanks the rail back to the ayah the
    // reader has already left -- the exact "fights the finger" behaviour the cap
    // exists to prevent (review, 2026-10-01).
    if (retry.current !== null) {
      clearTimeout(retry.current);
      retry.current = null;
    }
    listRef.current?.scrollToIndex({ index: activeAyahNumber - 1, animated: true });
  }, [activeAyahNumber, collapsed]);

  // Cleared on unmount so a retry cannot fire into a dead ref.
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);
  useEffect(
    () => () => {
      if (retry.current !== null) clearTimeout(retry.current);
    },
    [],
  );

  return (
    <View
      testID="ayah-rail"
      importantForAccessibility={importantForAccessibility}
      style={{ width: collapsed ? touchTargets.minimum : RAIL_WIDTH, overflow: 'hidden' }}
    >
      <Pressable
        testID="rail-toggle"
        accessibilityRole="button"
        // Without this the chevron Text below becomes the content-desc and
        // TalkBack announces the glyph itself -- "\u203a button" (device check
        // 514, vc77). accessibilityState carries expanded/collapsed; the label
        // has to name what is being expanded.
        accessibilityLabel="Ayah list"
        accessibilityState={{ expanded: !collapsed }}
        onPress={onToggleCollapsed}
        style={{ minHeight: touchTargets.minimum, alignItems: 'center', justifyContent: 'center' }}
        // RN carries no `aria-controls` -- there is no native equivalent of a
        // disclosure "controlling" another element -- so this exists only for
        // the DOM shim (rnHosts) tests assert against. Spread, not a literal
        // JSX attribute, so TypeScript's excess-property check (which only
        // inspects literal attributes) leaves it alone; real PressableProps
        // has no such field and never sees this on a device.
        {...({ 'aria-controls': 'reader-ayah-rail' } as Record<string, string>)}
      >
        <Text style={{ color: theme.mutedText }}>{collapsed ? '‹' : '›'}</Text>
      </Pressable>
      {collapsed ? null : (
        <FlatList
          // Keyed per surah: this rail's own scroll offset must not survive a
          // page turn to a different surah, and pinning that to an ancestor's
          // remount would make this component's correctness depend on a detail
          // several components away.
          key={surahId}
          ref={listRef}
          // Bounded, or it does not scroll. The rail's container is stretched
          // to the reader row's height, but a FlatList with no flex of its own
          // sizes to its CONTENT -- 286 rows -- so it overflowed, got clipped
          // by the container's overflow:hidden, and every swipe landed on a
          // row as a press instead of scrolling (device, 2026-09-29, vc75).
          style={{ flex: 1 }}
          nativeID="reader-ayah-rail"
          // Not optional. Without one of these two props a scrollToIndex at an
          // offscreen index throws an Invariant Violation that takes the whole
          // app down -- which is exactly what deep-linking into the middle of
          // a surah does (device, 2026-09-29, vc73: opening Al-Baqara at 2:147
          // crashed on mount). `getItemLayout` is the wrong half of the pair
          // here: a juz heading makes rows non-uniform, so a computed offset
          // would be a lie. This lands on the row's estimated offset and lets
          // the list correct itself once the cells have measured.
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            // Two steps, and the second is the one that lands. The estimate
            // undershoots badly on a long surah -- on the device it put the
            // rail at ayah 67 while the reader was at 154 -- because the
            // average is taken from the handful of cells measured so far. So:
            // jump to the estimate, which mounts the cells around it, then ask
            // again now that their real heights are known.
            listRef.current?.scrollToOffset({
              offset: index * (averageItemLength || touchTargets.minimum),
              animated: false,
            });
            if (attempts.current >= MAX_SCROLL_RETRIES) return;
            attempts.current += 1;
            if (retry.current !== null) clearTimeout(retry.current);
            retry.current = setTimeout(() => {
              retry.current = null;
              listRef.current?.scrollToIndex({ index, animated: false });
            }, RETRY_MS);
          }}
          data={ayahNumbers}
          keyExtractor={(ayahNumber) => String(ayahNumber)}
          renderItem={({ item: ayahNumber }) => {
            const juz = juzByAyah.get(ayahNumber);
            const active = ayahNumber === activeAyahNumber;
            return (
              <>
                {juz === undefined ? null : (
                  <View
                    accessibilityRole="header"
                    testID="rail-juz"
                    // Centred like every ayah row. Left to itself this View
                    // stretches its Text across the full 56dp and the label
                    // starts hard against x=0, where the J lost its stem
                    // (device, vc77).
                    style={{ alignItems: 'center' }}
                    {...({ 'data-before-ayah': String(ayahNumber) } as Record<string, string>)}
                  >
                    <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
                      {`JUZ ${juz}`}
                    </Text>
                  </View>
                )}
                <Pressable
                  testID="rail-ayah"
                  accessibilityRole="button"
                  // A bare numeral announces as "147" with no role and no
                  // context. §8 asks for WCAG AA, and the toggle above got the
                  // full disclosure treatment while the 286 targets below it
                  // got none.
                  accessibilityLabel={`Ayah ${ayahNumber}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => onSelectAyah(ayahNumber)}
                  style={{
                    minHeight: touchTargets.minimum,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: active ? theme.accentWash : undefined,
                  }}
                  {...({
                    'data-ayah': String(ayahNumber),
                    'data-active': String(active),
                  } as Record<string, string>)}
                >
                  <Text style={{ color: active ? theme.accent : theme.mutedText, fontSize: typography.caption }}>
                    {ayahNumber}
                  </Text>
                </Pressable>
              </>
            );
          }}
        />
      )}
    </View>
  );
}
