import { ScrollView, Text } from 'react-native';
import { t } from '@/i18n/uiStrings';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { centredContent } from '@/theme/contentWidth';
import { useListBottomPadding } from '@/theme/useListBottomPadding';
import { useAppSettings } from '@/settings/settingsStore';
import { GPL_2_0_TEXT } from '@/licenses/gpl-2.0';

/**
 * The GPLv2, verbatim.
 *
 * Not translated and not summarised: the licence's own terms are the thing
 * being conveyed, and a translation of them conveys something else. The UI
 * around it follows the app's locale; the body does not.
 *
 * Monospace because the GPL is laid out with hard line breaks -- set in a
 * proportional face its section numbering stops lining up.
 *
 * Shaped like AboutScreen, down to the heading: a plain ScrollView under the
 * navigator's own header.
 */
export function LicenseScreen() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const paddingBottom = useListBottomPadding();

  return (
    <ScrollView
      testID="license-scroll"
      style={{ flex: 1 }}
      // Prose, and prose does not grow past its measure. Task 2 took the
      // navigator's cap off every screen; these four wanted it. On the
      // contentContainer, not on `style`: capping `style` would centre the
      // scroll view itself, and its scrollbar with it.
      contentContainerStyle={{ paddingBottom, paddingHorizontal: 16, paddingTop: 12, gap: 12, ...centredContent }}
    >
      <Text
        accessibilityRole="header"
        style={{ color: theme.text, fontSize: typography.title, fontWeight: '700' }}
      >
        {t(uiLocale, 'license.title')}
      </Text>
      <Text
        testID="license-body"
        // Selectable so a user can copy the terms off the device, which is
        // the practical half of "we gave you the licence".
        selectable
        style={{
          color: theme.text,
          fontFamily: 'monospace',
          fontSize: typography.caption,
          lineHeight: 18,
        }}
      >
        {GPL_2_0_TEXT}
      </Text>
    </ScrollView>
  );
}
