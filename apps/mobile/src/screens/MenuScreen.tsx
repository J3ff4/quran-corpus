import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { GlassSurface } from '@/components/GlassSurface';
import { Icon, type IconName } from '@/components/icons/Icon';
import type { UiLocaleCode } from '@/i18n/languages';
import { t, type UiStringKey } from '@/i18n/uiStrings';
import { usePressScale } from '@/motion/usePressScale';
import { useAppSettings } from '@/settings/settingsStore';
import { fonts, radii, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useListBottomPadding } from '@/theme/useListBottomPadding';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const ROWS: { href: string; icon: IconName; label: UiStringKey; sub: UiStringKey }[] = [
  { href: '/bookmarks', icon: 'bookmark', label: 'menu.bookmarks', sub: 'menu.bookmarksSub' },
  { href: '/settings', icon: 'settings', label: 'menu.settings', sub: 'menu.settingsSub' },
  { href: '/about', icon: 'info', label: 'menu.about', sub: 'menu.aboutSub' },
];

/** The fifth tab. Bookmarks and Settings gave up their own slots so Dictionary
 *  could have one; this is where they went. No logic of its own -- deliberately
 *  so: the mockup's "24 ayahs saved" subtitle would make the one screen with
 *  nothing to load open the user database on every focus, and the count is
 *  already on the Bookmarks header one tap away. */
export function MenuScreen() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const paddingBottom = useListBottomPadding();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom, paddingHorizontal: 16, paddingTop: 12, gap: 10 }}
    >
      <Text
        accessibilityRole="header"
        style={{ color: theme.text, fontFamily: fonts.displaySemiBold, fontSize: typography.title }}
      >
        {t(uiLocale, 'tabs.menu')}
      </Text>
      <Text style={{ color: theme.mutedText, fontSize: typography.caption, marginBottom: 4 }}>
        {t(uiLocale, 'menu.lede')}
      </Text>

      {ROWS.map((row) => (
        <MenuRow key={row.href} row={row} uiLocale={uiLocale} />
      ))}

      <Text
        accessibilityRole="header"
        style={{ color: theme.mutedText, fontSize: typography.caption, marginTop: 12 }}
      >
        {t(uiLocale, 'menu.deviceHeading')}
      </Text>
      {/* Not a promise the app does not keep: decision 34 is that nothing new
          leaves the device, and this is the screen that says so out loud. */}
      <GlassSurface style={{ padding: 14 }}>
        <Text style={{ color: theme.mutedText, fontSize: typography.caption, lineHeight: 19 }}>
          {t(uiLocale, 'menu.deviceNote')}
        </Text>
      </GlassSurface>

      {/* From the app config, not a literal: a version typed here is a version
          that is wrong one release later, and this line exists to be quoted
          back in a bug report. */}
      <Text testID="app-version" style={{ color: theme.mutedText, fontSize: typography.caption, marginTop: 8 }}>
        {`Quran Corpus ${Constants.expoConfig?.version ?? '—'}`}
      </Text>
    </ScrollView>
  );
}

function MenuRow({
  row,
  uiLocale,
}: {
  row: (typeof ROWS)[number];
  uiLocale: UiLocaleCode;
}) {
  const theme = useThemeColors();
  const press = usePressScale();
  const label = t(uiLocale, row.label);

  return (
    // A Pressable, not a Link: the row is a three-column layout, and
    // expo-router's Link renders a Text on native, inside which a
    // flexDirection View does not lay out (same reason DictionaryRow gives).
    <AnimatedPressable
      testID={`menu-row-${row.icon}`}
      accessibilityRole="link"
      // The subtitle is in the label rather than a hint: TalkBack reads a hint
      // only after a pause, and "Settings" alone does not say what is inside.
      accessibilityLabel={`${label}. ${t(uiLocale, row.sub)}`}
      onPress={() => router.push(row.href)}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.style}
    >
      <GlassSurface
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 13,
          padding: 14,
          minHeight: touchTargets.minimum + 16,
        }}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: radii.chip,
            backgroundColor: theme.accentWash,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={row.icon} color={theme.accent} size={19} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: theme.text, fontSize: typography.body, fontWeight: '600' }}>{label}</Text>
          <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
            {t(uiLocale, row.sub)}
          </Text>
        </View>
        {/* Decorative: the row already announces as a link, and a lone chevron
            in the reading order says "chevron" and nothing else. */}
        <Icon name="chevronRight" color={theme.mutedText} size={18} />
      </GlassSurface>
    </AnimatedPressable>
  );
}
