import { Text } from 'react-native';
import { useThemeColors } from '@/theme/themeContext';
import { useArabicSizes } from '@/theme/useArabicSizes';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';

/**
 * Basmala banner opening a surah, matching web's
 * `components/reader/ornaments/Bismillah.tsx`.
 *
 * The text is passed in rather than held here: 95:1 and 97:1 spell it with a
 * shadda on the ba and the other 110 do not, so a constant is wrong on two
 * surahs. `splitBasmala` takes it off the ayah the reader is about to show,
 * which also means the banner and the ayah run can never disagree. Al-Fatiha's
 * basmala IS its ayah 1 and at-Tawba has none; on both, splitBasmala returns
 * null and the caller renders nothing.
 */
export function Bismillah({ text, uiLocale }: { text: string; uiLocale: UiLocaleCode }) {
  const theme = useThemeColors();
  const sizes = useArabicSizes();

  return (
    <Text
      testID="bismillah"
      accessibilityLabel={t(uiLocale, 'reader.bismillah')}
      style={{
        color: theme.text,
        fontFamily: 'Hafs',
        fontSize: sizes.banner,
        textAlign: 'center',
        writingDirection: 'rtl',
        marginTop: 12,
        marginBottom: 16,
      }}
    >
      {text}
    </Text>
  );
}
