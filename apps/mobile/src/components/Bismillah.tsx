import { Text } from 'react-native';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** The same string web's ornament carries. Hard-coded rather than sliced out
 *  of ayah 1: the banner also has to render on the word-by-word screen, which
 *  never loads the ayah's Uthmani text. */
const BASMALA = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

/**
 * Basmala banner above a surah's first ayah, matching web's
 * `components/reader/ornaments/Bismillah.tsx`. Al-Fatiha's basmala IS its ayah
 * 1, and at-Tawba has none, so both render nothing.
 */
export function Bismillah({ surahId }: { surahId: number }) {
  const theme = useThemeColors();
  if (surahId === 1 || surahId === 9) return null;

  return (
    <Text
      testID="bismillah"
      accessibilityLabel="Bismillah"
      style={{
        color: theme.text,
        fontFamily: 'Hafs',
        // typography.arabicReader until useArabicSizes lands in Task 6, which
        // swaps this call site to sizes.banner.
        fontSize: typography.arabicReader,
        textAlign: 'center',
        writingDirection: 'rtl',
        marginBottom: 16,
      }}
    >
      {BASMALA}
    </Text>
  );
}
