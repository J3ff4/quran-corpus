import { Pressable } from 'react-native';
import { Icon } from '@/components/icons/Icon';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface SearchHeaderButtonProps {
  /** Passed in rather than read from the settings store, for the same reason
   *  SurahReader takes it as a prop: this renders inside the reader's header,
   *  and reaching into the store here would pull expo-sqlite into every test
   *  that mounts it. */
  uiLocale: UiLocaleCode;
  /** The reader closes its word sheet before pushing; the dictionary tab just
   *  pushes. That difference is the only reason this takes a callback rather
   *  than routing itself. */
  onPress: () => void;
}

/** The header magnifier, two of the spec's three search entry points. (Home's
 *  is a full-width pill with placeholder text, a different control.) */
export function SearchHeaderButton({ uiLocale, onPress }: SearchHeaderButtonProps) {
  const theme = useThemeColors();

  return (
    <Pressable
      testID="open-search"
      accessibilityRole="button"
      accessibilityLabel={t(uiLocale, 'search.title')}
      onPress={onPress}
      style={{
        minHeight: touchTargets.minimum,
        minWidth: touchTargets.minimum,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="search" color={theme.accent} />
    </Pressable>
  );
}
