import { Text } from 'react-native';
import type { ContentLanguageCode, UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { BottomSheet } from './BottomSheet';
import { LanguageSelector } from './LanguageSelector';

export interface LanguageSheetProps {
  value: ContentLanguageCode;
  uiLocale: UiLocaleCode;
  onChange: (code: ContentLanguageCode) => void;
  onClose: () => void;
}

/**
 * Translation-language picker, reached from the reader's header. It exists as a
 * sheet rather than a fixed bar because the bar cost a band of every screenful
 * for a setting most readers change once (owner ruling 2026-08-17).
 */
export function LanguageSheet({ value, uiLocale, onChange, onClose }: LanguageSheetProps) {
  const theme = useThemeColors();

  return (
    <BottomSheet onClose={onClose} closeLabel={t(uiLocale, 'word.close')}>
      <Text
        accessibilityRole="header"
        style={{ color: theme.text, fontSize: typography.body, fontWeight: '600' }}
      >
        {t(uiLocale, 'reader.chooseLanguage')}
      </Text>
      <LanguageSelector
        value={value}
        onChange={(code) => {
          // Guarded: a no-op write still re-renders the reader and re-runs its
          // surah query against SQLite. Closing regardless -- tapping the
          // active language is a "yes, that one" gesture, not a mistake.
          if (code !== value) onChange(code);
          onClose();
        }}
      />
    </BottomSheet>
  );
}
