import { Pressable, Text, View } from 'react-native';

import type { UiLocaleCode } from '@/i18n/languages';
import { t, type UiStringKey } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { arabicScales, touchTargets, typography, type ArabicScale } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

import { Icon } from './icons/Icon';

/** The four steps, in the declaration order of `arabicScales` -- which is the
 *  ascending order of its multipliers. Derived rather than restated so a fifth
 *  step added there reaches this control without a second edit. */
const STEPS = Object.keys(arabicScales) as ArabicScale[];

/** One label per step, shared with the Settings screen's own control so the
 *  two never disagree about what a step is called. */
export const ARABIC_SIZE_LABEL_KEYS: Record<ArabicScale, UiStringKey> = {
  small: 'settings.arabicSizeSmall',
  medium: 'settings.arabicSizeMedium',
  large: 'settings.arabicSizeLarge',
  xlarge: 'settings.arabicSizeXlarge',
};

/**
 * One step up or down, clamped at both ends.
 *
 * Clamped, not wrapped: one more tap at the largest step must not jump to the
 * smallest, which reads as the control breaking rather than as a limit.
 */
export function stepArabicScale(current: ArabicScale, direction: 1 | -1): ArabicScale {
  const at = STEPS.indexOf(current);
  const next = Math.min(STEPS.length - 1, Math.max(0, at + direction));
  return STEPS[next]!;
}

export interface ArabicSizeStepperProps {
  uiLocale: UiLocaleCode;
}

/**
 * Arabic size, two taps away instead of a trip to Settings.
 *
 * Reader and morphology only (R-C6). Writes the SAME stored `arabicScale` that
 * Settings writes -- one value, two ways in. A second key would drift, and the
 * two screens would disagree about the size of the same text.
 *
 * Lives in a `HeaderCard` `actions` curtain on both screens, which is what the
 * curtain is for: the card draws no kebab at all when `actions` is omitted, so
 * neither screen grows a control it did not already have room for.
 */
export function ArabicSizeStepper({ uiLocale }: ArabicSizeStepperProps) {
  const theme = useThemeColors();
  const { arabicScale, setArabicScale } = useAppSettings();

  const atLargest = arabicScale === STEPS[STEPS.length - 1];
  const atSmallest = arabicScale === STEPS[0];

  const button = (
    direction: 1 | -1,
    testID: string,
    labelKey: UiStringKey,
    icon: 'chevronLeft' | 'chevronRight',
    disabled: boolean,
  ) => (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={t(uiLocale, labelKey)}
      // The state, not just a dimmed glyph: a control that is enabled and does
      // nothing is worse than one that says it cannot.
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => setArabicScale(stepArabicScale(arabicScale, direction))}
      style={{
        minHeight: touchTargets.minimum,
        minWidth: touchTargets.minimum,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon name={icon} color={disabled ? theme.mutedText : theme.accent} />
    </Pressable>
  );

  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
    >
      {button(-1, 'arabic-size-down', 'settings.arabicSizeDecrease', 'chevronLeft', atSmallest)}
      {/* The step itself, read out as well as drawn. Without it TalkBack says
          "increase, decrease" and never says where the reader already is. */}
      <Text
        testID="arabic-size-value"
        style={{
          color: theme.text,
          fontSize: typography.caption,
          // The four labels differ in width, and a row that resizes under the
          // thumb moves the button the reader is tapping.
          minWidth: 72,
          textAlign: 'center',
        }}
      >
        {t(uiLocale, ARABIC_SIZE_LABEL_KEYS[arabicScale])}
      </Text>
      {button(1, 'arabic-size-up', 'settings.arabicSizeIncrease', 'chevronRight', atLargest)}
    </View>
  );
}
