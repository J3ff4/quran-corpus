import { Text } from 'react-native';

import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { useThemeColors } from '@/theme/themeContext';

export interface BismillahLineProps {
  /** Taken off the surah's ayah 1 by the caller, never a constant here: 95:1
   *  and 97:1 spell it with a shadda on the ba and the other 110 do not, which
   *  is the same reason `Bismillah.tsx` takes it as a prop. */
  text: string;
  fontSize: number;
  lineHeight: number;
  uiLocale: UiLocaleCode;
}

/**
 * The bismillah line of a mushaf page.
 *
 * Drawn in Hafs, not in the page's own QCF font: the layout carries no row for
 * this line, so there is no page glyph to ask for, and the page font has no
 * ordinary Arabic in it -- only whole-word outlines at private-use codepoints.
 */
export function BismillahLine({ text, fontSize, lineHeight, uiLocale }: BismillahLineProps) {
  const theme = useThemeColors();

  return (
    <Text
      accessibilityLabel={t(uiLocale, 'reader.bismillah')}
      numberOfLines={1}
      style={{
        color: theme.text,
        fontFamily: 'Hafs',
        fontSize,
        lineHeight,
        textAlign: 'center',
        writingDirection: 'rtl',
      }}
    >
      {text}
    </Text>
  );
}
