import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { reciterById } from '@quran-corpus/data/mobile';

import { GlassSurface } from '@/components/GlassSurface';
import { Icon } from '@/components/icons/Icon';
import { ReciterSheet } from '@/components/ReciterSheet';
import { contentLanguages, uiLocales } from '@/i18n/languages';
import { t, type UiStringKey } from '@/i18n/uiStrings';
import { usePressScale } from '@/motion/usePressScale';
import { useAppSettings } from '@/settings/settingsStore';
import { radii, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useListBottomPadding } from '@/theme/useListBottomPadding';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const themeLabelKeys = {
  system: 'settings.themeSystem',
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
} as const;

const arabicSizeLabelKeys = {
  small: 'settings.arabicSizeSmall',
  medium: 'settings.arabicSizeMedium',
  large: 'settings.arabicSizeLarge',
  xlarge: 'settings.arabicSizeXlarge',
} as const;

const densityLabelKeys = {
  hybrid: 'wbw.densityHybrid',
  dense: 'wbw.densityDense',
} as const;

/** A titled glass card. The heading is outside the card, as in mockup m6i-2:
 *  inside it, five headings read as five more rows. */
function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const theme = useThemeColors();
  return (
    <View style={{ gap: 7, marginTop: 6 }}>
      <Text
        accessibilityRole="header"
        style={{ color: theme.mutedText, fontSize: typography.caption, marginLeft: 4 }}
      >
        {title}
      </Text>
      <GlassSurface style={{ paddingHorizontal: 15 }}>{children}</GlassSurface>
    </View>
  );
}

/** One row inside a group: label, optional explanation, and whatever control
 *  the setting takes -- beside the label for a switch or a value, under it for
 *  a set of choices too wide to sit on one line. */
function SettingRow({
  label,
  hint,
  control,
  below,
  last,
}: {
  label: string;
  hint?: string | undefined;
  control?: ReactNode | undefined;
  below?: ReactNode | undefined;
  /** Suppresses the divider. The card's own edge is the last row's rule. */
  last?: boolean | undefined;
}) {
  const theme = useThemeColors();
  return (
    <View
      style={{
        paddingVertical: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: last ? 'transparent' : theme.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: theme.text, fontSize: typography.body, fontWeight: '600' }}>{label}</Text>
          {hint ? (
            <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>{hint}</Text>
          ) : null}
        </View>
        {control}
      </View>
      {below}
    </View>
  );
}

/**
 * One option in a single-choice row.
 *
 * Selection is carried by the wash, the border and the weight together, never
 * by colour alone (§8, WCAG 1.4.1): the three groups on this screen were
 * accent-vs-muted text and nothing else, which left them unreadable to anyone
 * who cannot separate those two greens. `accessibilityState` carries the same
 * fact to TalkBack, which sees none of the three.
 */
function ChoiceChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useThemeColors();
  const press = usePressScale();

  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        press.style,
        {
          // compact (40), not minimum (48): four chips cannot each be 48 tall
          // and leave five groups on one screen. The row's own padding carries
          // the target to 48.
          minHeight: touchTargets.compact,
          justifyContent: 'center',
          paddingHorizontal: 12,
          borderRadius: radii.chip,
          borderWidth: 1,
          borderColor: selected ? theme.accent : theme.border,
          // The wash's measured contrast assumes it sits directly on the page,
          // so nothing paints behind a selected chip.
          backgroundColor: selected ? theme.accentWash : 'transparent',
        },
      ]}
    >
      <Text
        style={{
          color: selected ? theme.accent : theme.mutedText,
          fontSize: typography.caption,
          fontWeight: selected ? '700' : '500',
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function ChoiceRow<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
  last,
}: {
  label: string;
  hint?: string | undefined;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  last?: boolean | undefined;
}) {
  return (
    <SettingRow
      label={label}
      hint={hint}
      last={last}
      below={
        // Wrapped, not equal-width segments: "Extra large" and "Ўзбекча" do not
        // fit four to a 390pt row, and a segment that truncates its own label
        // is a control the user cannot read before pressing it.
        //
        // No `accessible` on this View: it would collapse the chips into one
        // element, and TalkBack would then read the group name once with no way
        // to reach an individual option.
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={label}
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 }}
        >
          {options.map((option) => (
            <ChoiceChip
              key={option.value}
              label={option.label}
              selected={option.value === value}
              onPress={() => {
                if (option.value !== value) onChange(option.value);
              }}
            />
          ))}
        </View>
      }
    />
  );
}

/** A track and a knob. The knob's position is what carries the state; the
 *  accent only reinforces it. */
function SwitchRow({
  label,
  hint,
  testID,
  value,
  onChange,
  last,
}: {
  label: string;
  hint?: string | undefined;
  testID: string;
  value: boolean;
  onChange: (next: boolean) => void;
  last?: boolean | undefined;
}) {
  const theme = useThemeColors();
  return (
    <SettingRow
      label={label}
      hint={hint}
      last={last}
      control={
        <Pressable
          testID={testID}
          accessibilityRole="switch"
          accessibilityState={{ checked: value }}
          accessibilityLabel={label}
          onPress={() => onChange(!value)}
          hitSlop={12}
          style={{
            width: 46,
            height: 28,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: value ? theme.accent : theme.border,
            backgroundColor: value ? theme.accentWash : 'transparent',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              marginLeft: value ? 22 : 2,
              backgroundColor: value ? theme.accent : theme.mutedText,
            }}
          />
        </Pressable>
      }
    />
  );
}

/** A row that opens something else: the reciter sheet, or the About screen. */
function NavRow({
  label,
  value,
  testID,
  onPress,
  last,
}: {
  label: string;
  value: string;
  testID: string;
  onPress: () => void;
  last?: boolean | undefined;
}) {
  const theme = useThemeColors();
  const press = usePressScale();
  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.style}
    >
      <SettingRow
        label={label}
        hint={value}
        last={last}
        control={<Icon name="chevronRight" color={theme.mutedText} size={18} />}
      />
    </AnimatedPressable>
  );
}

export function SettingsScreen() {
  const settings = useAppSettings();
  const { uiLocale } = settings;
  const theme = useThemeColors();
  const paddingBottom = useListBottomPadding();
  const [reciterOpen, setReciterOpen] = useState(false);

  const label = (key: UiStringKey) => t(uiLocale, key);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom, paddingHorizontal: 16, paddingTop: 12, gap: 4 }}
    >
      <Text
        accessibilityRole="header"
        style={{ color: theme.text, fontSize: typography.title, fontWeight: '700' }}
      >
        {label('tabs.settings')}
      </Text>
      {/* Without this the screen happily accepts changes it is not persisting. */}
      {settings.storageError ? (
        <Text
          testID="settings-storage-error"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{ color: theme.danger, marginTop: 8 }}
        >
          {label('settings.storageUnavailable')}
        </Text>
      ) : null}

      <SettingsGroup title={label('settings.groupReading')}>
        {/* Four discrete steps, not a slider: these are the only values
            useArabicSizes accepts, and a slider would imply a range that does
            not exist. */}
        <ChoiceRow
          label={label('settings.arabicSize')}
          hint={label('settings.arabicSizeHint')}
          options={(['small', 'medium', 'large', 'xlarge'] as const).map((value) => ({
            value,
            label: label(arabicSizeLabelKeys[value]),
          }))}
          value={settings.arabicScale}
          onChange={settings.setArabicScale}
        />
        <ChoiceRow
          label={label('settings.wbwDensity')}
          hint={label('settings.wbwDensityHint')}
          options={(['hybrid', 'dense'] as const).map((value) => ({
            value,
            label: label(densityLabelKeys[value]),
          }))}
          value={settings.wbwDensity}
          onChange={settings.setWbwDensity}
          last
        />
      </SettingsGroup>

      <SettingsGroup title={label('settings.groupRecitation')}>
        {/* A sheet, not a tenth radiogroup: ten reciter names would be more of
            this screen than everything above it put together, and the same
            picker is already the reader's. */}
        <NavRow
          testID="open-reciters"
          label={label('reader.reciter')}
          value={reciterById(settings.reciterId)?.label ?? ''}
          onPress={() => setReciterOpen(true)}
        />
        <SwitchRow
          testID="toggle-continuous"
          label={label('reader.continuous')}
          hint={label('settings.continuousHint')}
          value={settings.continuousPlay}
          onChange={settings.setContinuousPlay}
          last
        />
      </SettingsGroup>

      <SettingsGroup title={label('settings.groupAppearance')}>
        <ChoiceRow
          label={label('settings.theme')}
          options={(['system', 'light', 'dark'] as const).map((value) => ({
            value,
            label: label(themeLabelKeys[value]),
          }))}
          value={settings.theme}
          onChange={settings.setTheme}
        />
        {/* In-app because the OS switch has no single path: Pixel puts it under
            Accessibility, Samsung under Visibility enhancements, and the
            owner's device exposed neither. This one only ever ADDS reduced
            motion -- see useReducedMotion. */}
        <SwitchRow
          testID="toggle-reduce-motion"
          label={label('settings.reduceMotion')}
          hint={label('settings.reduceMotionHint')}
          value={settings.reduceMotion}
          onChange={settings.setReduceMotion}
          last
        />
      </SettingsGroup>

      <SettingsGroup title={label('settings.language')}>
        <ChoiceRow
          label={label('settings.interface')}
          options={uiLocales.map((locale) => ({ value: locale.code, label: locale.nativeLabel }))}
          value={settings.uiLocale}
          onChange={settings.setUiLocale}
        />
        <ChoiceRow
          label={label('reader.translation')}
          options={contentLanguages.map((language) => ({
            value: language.code,
            label: language.nativeLabel,
          }))}
          value={settings.contentLanguage}
          onChange={settings.setContentLanguage}
          last
        />
      </SettingsGroup>

      <SettingsGroup title={label('settings.groupPrivacy')}>
        <SwitchRow
          testID="toggle-analytics"
          label={label('settings.analytics')}
          hint={label('settings.analyticsHint')}
          value={settings.analyticsEnabled}
          onChange={settings.setAnalyticsEnabled}
          last
        />
      </SettingsGroup>

      <SettingsGroup title={label('settings.about')}>
        <NavRow
          testID="open-about"
          label={label('menu.about')}
          value={label('menu.aboutSub')}
          onPress={() => router.push('/about')}
          last
        />
      </SettingsGroup>

      {reciterOpen ? (
        <ReciterSheet
          current={settings.reciterId}
          uiLocale={uiLocale}
          onSelect={settings.setReciterId}
          onClose={() => setReciterOpen(false)}
        />
      ) : null}
    </ScrollView>
  );
}
