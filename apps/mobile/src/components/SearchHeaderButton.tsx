import { Pressable } from 'react-native';
import { Icon } from '@/components/icons/Icon';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface SearchHeaderButtonProps {
  /** Passed in rather than read from the settings store, because SurahReader
   *  -- one of the two callers -- takes uiLocale as a prop by design and its
   *  test mocks the store as `{ arabicScale, reduceMotion }` with no uiLocale.
   *  A store read here would hand t() an undefined locale in that suite. */
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
