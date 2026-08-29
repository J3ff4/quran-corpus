import { Text } from 'react-native';
import type { Gloss } from '@/data/corpusRepository';
import { contentLanguages } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import type { UiLocaleCode } from '@/i18n/languages';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

interface GlossLangTagProps {
  gloss: Gloss | null;
  uiLocale: UiLocaleCode;
  /** Matches the gloss it sits beside; the tag is always a step smaller. */
  fontSize?: number;
}

/**
 * `(en)` beside a gloss that is not in the language the reader asked for.
 *
 * One component rather than three copies: the word sheet, the word-detail
 * screen and every word-by-word cell all show the same mark, and web already
 * settled the shape (`WordPopover.tsx`, `WbwWordCell.tsx` both render
 * `({glossLang})`). Renders nothing when the gloss is in the requested
 * language, so call sites do not have to ask.
 *
 * The visible text is the bare language code -- it sits under a word in a grid
 * that fits four across, and a spelled-out language name does not. The
 * accessibility label carries the full name instead, so TalkBack says
 * "Gloss in English" rather than reading two letters.
 */
export function GlossLangTag({ gloss, uiLocale, fontSize }: GlossLangTagProps) {
  const theme = useThemeColors();
  if (!gloss?.isFallback) return null;

  const language = contentLanguages.find((entry) => entry.code === gloss.lang);
  return (
    <Text
      testID={`gloss-lang-${gloss.lang}`}
      accessibilityLabel={`${t(uiLocale, 'word.glossLanguage')}: ${language?.label ?? gloss.lang}`}
      style={{ color: theme.mutedText, fontSize: fontSize ?? typography.caption - 2 }}
    >
      {`(${gloss.lang})`}
    </Text>
  );
}
