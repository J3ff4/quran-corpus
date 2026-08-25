import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { GlassSurface } from './GlassSurface';
import { usePressScale } from '@/motion/usePressScale';
import { t } from '@/i18n/uiStrings';
import type { UiLocaleCode } from '@/i18n/languages';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useListBottomPadding } from '@/theme/useListBottomPadding';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface RecitationBarProps {
  /** null = nothing has played yet, so there is no bar. */
  ayahNumber: number | null;
  playing: boolean;
  onTogglePlay: () => void;
  uiLocale: UiLocaleCode;
}

/**
 * The docked bar from mockup `1e`, over the reader's existing play/pause.
 *
 * Chrome only. Scrub, next/previous, continuous play, background playback and
 * the reciter name are M6f; this ships the surface now so M6f is a behaviour
 * change on a layout that has already been through a device run.
 *
 * It outlives the sound on purpose: once an ayah has played the bar stays
 * docked on it, and its control flips to Play, so resuming is one tap on the
 * thing already on screen rather than a scroll back to the card.
 */
export function RecitationBar({ ayahNumber, playing, onTogglePlay, uiLocale }: RecitationBarProps) {
  const theme = useThemeColors();
  const press = usePressScale();
  const bottom = useListBottomPadding();

  if (ayahNumber === null) return null;

  const ayahLabel = `${t(uiLocale, 'reader.ayahLabel')} ${ayahNumber}`;
  const action = t(uiLocale, playing ? 'reader.pause' : 'reader.play');

  return (
    // Absolute, and clearing the tab pill by the same rule the lists use: a
    // bar pinned to the raw bottom inset sits under the floating pill.
    <View
      testID="recitation-bar"
      // The label is here, not only on the button: "Pause" alone tells a
      // screen-reader user nothing about which ayah is sounding. No
      // `accessible` on it -- that would make the bar one element and swallow
      // the button inside it (see rn-accessible-view-collapses-children).
      accessibilityLabel={`${ayahLabel} · ${action}`}
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 16, right: 16, bottom: bottom - 68 }}
    >
      <GlassSurface
        radius="pill"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 10 }}
      >
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={onTogglePlay}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          style={[
            press.style,
            {
              minHeight: touchTargets.minimum,
              minWidth: touchTargets.minimum,
              alignItems: 'center',
              justifyContent: 'center',
            },
          ]}
        >
          <Text style={{ color: theme.accent, fontSize: typography.body, fontWeight: '600' }}>{action}</Text>
        </AnimatedPressable>
        <Text numberOfLines={1} style={{ flex: 1, color: theme.text, fontSize: typography.caption }}>
          {ayahLabel}
        </Text>
      </GlassSurface>
    </View>
  );
}
