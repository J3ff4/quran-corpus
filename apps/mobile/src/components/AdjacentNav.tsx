import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useGlassSkin } from './GlassSurface';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { usePressScale } from '@/motion/usePressScale';
import { useThemeColors } from '@/theme/themeContext';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface AdjacentNavProps {
  prev: string | null;
  next: string | null;
  /** Called with the non-null target of whichever side was pressed, and which
   *  side that was. Both screens hand this straight to `useEntryPager.goTo`:
   *  the side is what decides which way the page turn travels, and paging
   *  changes the screen's own state rather than navigating, so there is no
   *  route change to recover a direction from either. */
  onNavigate: (target: string, side: 'prev' | 'next') => void;
  /** Names the toolbar for TalkBack: 'root.adjacent' or 'lemma.adjacent'. */
  label: string;
  uiLocale: UiLocaleCode;
  /** Which of the two screens this is: names the controls in tests, and picks
   *  the locale keys for the labels. */
  testIDPrefix?: 'root' | 'lemma';
}

/** Previous/Next between two entries of the same kind. Shared by the root
 *  screen (hijāʾī order) and the lemma screen (frequency-rank order): what the
 *  order is stays the caller's business, but the disabled-at-the-ends rule and
 *  the tap target are the same on both, which is why this is one component and
 *  not two.
 *
 *  Two chevrons flanking the headword since owner ruling D3 (2026-08-26) --
 *  the docked bar at the foot of the screen was "not practical". Rendered
 *  through EntryHeader's `pager` slot, which lays it over the headword's own
 *  row; this component still owns the row, so the toolbar keeps exactly its
 *  two buttons and nothing else.
 *
 *  The labels are keyed per screen rather than shared, because Russian
 *  inflects them: "Предыдущий" agrees with корень (m.) and "Предыдущая" with
 *  лемма (f.), so one pair of strings cannot serve both. English and Uzbek
 *  carry the same words in both. They are the accessible name now rather than
 *  visible text: a chevron on its own announces as nothing. */
/** Written out per screen rather than built from `testIDPrefix`: a key
 *  assembled at runtime is invisible to the dead-key check in
 *  uiStrings.test.ts, which greps the sources for the literal. */
const LABEL_KEYS = {
  root: { prev: 'root.previous', next: 'root.next' },
  lemma: { prev: 'lemma.previous', next: 'lemma.next' },
} as const;

/** Chevron diameter. Under touchTargets.compact on purpose: it sits inside the
 *  entry plate's own padding, which carries the target out to 48 on every side
 *  a thumb can reach it from, and a 48 circle either side of a 3-letter root
 *  leaves the headword no room to be the largest thing on the screen. */
const SIZE = 34;

function PagerButton({
  side,
  target,
  onNavigate,
  uiLocale,
  testIDPrefix,
}: {
  side: 'prev' | 'next';
  target: string | null;
  onNavigate: (target: string, side: 'prev' | 'next') => void;
  uiLocale: UiLocaleCode;
  testIDPrefix: 'root' | 'lemma';
}) {
  const theme = useThemeColors();
  const skin = useGlassSkin();
  const press = usePressScale();

  return (
    <AnimatedPressable
      testID={side === 'prev' ? `${testIDPrefix}-previous` : `${testIDPrefix}-next`}
      accessibilityRole="button"
      accessibilityLabel={t(uiLocale, LABEL_KEYS[testIDPrefix][side])}
      // Disabled, not hidden: an arrow that vanishes at the ends of the
      // list slides the other one under the thumb, and TalkBack is left
      // with nothing to announce where a control used to be.
      accessibilityState={{ disabled: target === null }}
      disabled={target === null}
      onPress={target ? () => onNavigate(target, side) : undefined}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        press.style,
        {
          width: SIZE,
          height: SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: SIZE / 2,
          borderWidth: 1,
          backgroundColor: skin.fill,
          borderColor: skin.border,
          opacity: target === null ? 0.32 : 1,
        },
      ]}
    >
      {/* A single-glyph chevron, not the old "← Previous": the button now sits
          beside the headword, where a word of English would crowd it. The
          accessible name above is what it announces. */}
      <Text style={{ color: theme.text, fontSize: 20, lineHeight: SIZE, includeFontPadding: false }}>
        {side === 'prev' ? '‹' : '›'}
      </Text>
    </AnimatedPressable>
  );
}

export function AdjacentNav({
  prev,
  next,
  onNavigate,
  label,
  uiLocale,
  testIDPrefix = 'root',
}: AdjacentNavProps) {
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
    >
      {(['prev', 'next'] as const).map((side) => (
        <PagerButton
          key={side}
          side={side}
          target={side === 'prev' ? prev : next}
          onNavigate={onNavigate}
          uiLocale={uiLocale}
          testIDPrefix={testIDPrefix}
        />
      ))}
    </View>
  );
}
