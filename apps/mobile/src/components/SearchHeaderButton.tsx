import { Pressable } from 'react-native';
import { Icon } from '@/components/icons/Icon';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface SearchHeaderButtonProps {
  /** Passed in rather than read from the settings store, because SurahReader
   *  -- the caller -- takes uiLocale as a prop by design and its test mocks
   *  the store as `{ arabicScale, reduceMotion }` with no uiLocale. A store
   *  read here would hand t() an undefined locale in that suite. */
  uiLocale: UiLocaleCode;
  /** The reader closes its word sheet before pushing, which is why this takes
   *  a callback rather than routing itself. */
  onPress: () => void;
}

/** The reader's header magnifier. One of the spec's search entry points;
 *  Home's is a full-width pill with placeholder text, a different control.
 *
 *  The Dictionary tab was the third. Its copy went through
 *  navigation.setOptions({ headerRight }), which publishes into nothing on a
 *  tab screen (headerShown: false since M6a), so it had been invisible for a
 *  sub-phase before M6g deleted it. */
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
